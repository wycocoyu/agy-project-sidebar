import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { readFile, writeFile, mkdir, stat, rename, rm } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { installedAgentExecutable, platformPaths } from '../../compat/platform.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

export async function loadSidecarSdk() {
  try {
    return await import('sidecar_sdk');
  } catch (error) {
    if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error;
    try {
      const resolved = createRequire(import.meta.url).resolve('sidecar_sdk');
      return import(pathToFileURL(resolved).href);
    } catch (resolveError) {
      if (resolveError.code !== 'MODULE_NOT_FOUND') throw resolveError;
      return loadBundledSdk();
    }
  }
}

async function atomicWrite(file, data) {
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, data, { flag: 'wx', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

function extractBundledSdk(binary) {
  const marker = binary.indexOf('export class SidecarApp');
  const start = binary.lastIndexOf("import { execFileSync } from 'node:child_process';", marker);
  const tail = "return provided === this.#token;\n  }\n}\n";
  const tailIndex = binary.indexOf(tail, marker);
  if (marker < 0 || start < 0 || marker - start > 12000 || tailIndex < marker || tailIndex - marker > 24000) {
    throw new Error('Incompatible bundled Sidecar SDK layout');
  }
  return binary.subarray(start, tailIndex + Buffer.byteLength(tail)).toString('utf8');
}

async function loadBundledSdk({ executable = installedAgentExecutable(), directory = join(platformPaths().data, 'sdk') } = {}) {
  const info = await stat(executable);
  const stamp = `${executable}:${info.size}:${info.mtimeMs}`;
  const root = join(directory, hash(stamp));
  let sdk = null;
  try {
    const [cachedSdk, manifest] = await Promise.all([
      readFile(join(root, 'index.mjs'), 'utf8'),
      readFile(join(root, 'manifest.json'), 'utf8'),
    ]);
    const saved = JSON.parse(manifest);
    if (saved.stamp === stamp && saved.sdk === hash(cachedSdk)) sdk = cachedSdk;
  } catch { /* cache miss */ }

  if (!sdk) {
    sdk = extractBundledSdk(await readFile(executable));
    await mkdir(root, { recursive: true });
    await atomicWrite(join(root, 'index.mjs'), sdk);
    await atomicWrite(join(root, 'manifest.json'), JSON.stringify({ stamp, sdk: hash(sdk) }) + '\n');
  }

  return import(`${pathToFileURL(join(root, 'index.mjs')).href}?v=${hash(sdk)}`);
}

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { platformPaths } from './platform.mjs';

const VALID_LANGUAGES = new Set(['zh-CN', 'en']);

export const DEFAULT_PREFERENCES = Object.freeze({
  language: 'zh-CN',
  selectedReqKey: null,
  showArchived: false,
});

export function normalizePreferences(raw = {}, fallback = DEFAULT_PREFERENCES) {
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_PREFERENCES;
  const language = VALID_LANGUAGES.has(raw.language)
    ? raw.language
    : (VALID_LANGUAGES.has(base.language) ? base.language : DEFAULT_PREFERENCES.language);
  const showArchived = typeof raw.showArchived === 'boolean'
    ? raw.showArchived
    : Boolean(base.showArchived);

  let selectedReqKey = base.selectedReqKey || null;
  if ('selectedReqKey' in raw) {
    if (raw.selectedReqKey === null || raw.selectedReqKey === '') {
      selectedReqKey = null;
    } else if (typeof raw.selectedReqKey === 'string' && raw.selectedReqKey.length <= 256) {
      selectedReqKey = raw.selectedReqKey;
    }
  }

  return { language, selectedReqKey, showArchived };
}

async function atomicWriteJson(file, payload) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

export class PreferencesStore {
  constructor(file = platformPaths().preferences) {
    this.file = file;
    this.queue = Promise.resolve();
  }

  async get() {
    try {
      const text = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      return normalizePreferences(parsed, DEFAULT_PREFERENCES);
    } catch {
      return normalizePreferences({}, DEFAULT_PREFERENCES);
    }
  }

  async set(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('Invalid preferences patch');
    }
    const run = this.queue.then(async () => {
      const current = await this.get();
      const merged = normalizePreferences({ ...current, ...patch }, current);
      await atomicWriteJson(this.file, merged);
      return merged;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

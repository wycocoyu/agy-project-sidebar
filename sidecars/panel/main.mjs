import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { platformPaths } from '../../compat/platform.mjs';
import { PreferencesStore } from '../../compat/preferences.mjs';
import { RuntimeUi, makeRendererSource } from '../../compat/runtime-ui.mjs';
import { SidebarCollector } from './collector.mjs';
import { loadSidecarSdk } from './sdk.mjs';
import { auxPanelHtml } from './panel-page.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const COMPAT = join(HERE, '..', '..', 'compat');
const paths = platformPaths();
const isHostSidecar = Boolean(process.env.ANTIGRAVITY_SIDECAR_WEB_PORT);
const tier = isHostSidecar ? 2 : 1;
const token = randomUUID();
const startedAt = Date.now();
const ownerFile = join(paths.data, 'ownership.json');

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readOwnerFile() {
  try {
    return JSON.parse(readFileSync(ownerFile, 'utf8'));
  } catch {
    return null;
  }
}

function writeOwnerFileAtomic(data) {
  mkdirSync(paths.data, { recursive: true });
  const temp = `${ownerFile}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temp, `${JSON.stringify(data, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    renameSync(temp, ownerFile);
  } finally {
    try { rmSync(temp, { force: true }); } catch {}
  }
}

function claimOwnership() {
  const existing = readOwnerFile();
  if (existing && existing.pid !== process.pid && pidAlive(existing.pid)) {
    if ((existing.tier || 0) > tier) return false;
    if ((existing.tier || 0) === tier && tier === 1) {
      // Replace older bootstrap process when re-installing or restarting
    }
  }
  writeOwnerFileAtomic({ token, pid: process.pid, tier, startedAt });
  return true;
}

function isCurrentOwner() {
  const cur = readOwnerFile();
  return Boolean(cur && cur.token === token && cur.pid === process.pid);
}

function isPluginEnabled() {
  try {
    const raw = readFileSync(paths.settings, 'utf8').replace(/^\uFEFF/, '');
    if (JSON.parse(raw).enabled === false) return false;
  } catch { /* default enabled */ }
  try {
    const cfg = JSON.parse(readFileSync(paths.pluginConfig, 'utf8').replace(/^\uFEFF/, ''));
    if (cfg.plugins?.['agy-project-sidebar']?.enabled === false) return false;
  } catch { /* ignore */ }
  return true;
}

if (!claimOwnership()) {
  process.exit(0);
}

const collector = new SidebarCollector(paths);
const preferences = new PreferencesStore(paths.preferences);
const initialPrefs = await preferences.get();
if (initialPrefs.inboxEnabled !== false && !initialPrefs.inboxEnabledAtMs) {
  await preferences.set({ inboxEnabledAtMs: Date.now() });
}
const i18nSource = readFileSync(join(COMPAT, 'i18n.cjs'), 'utf8');
const widgetSource = readFileSync(join(COMPAT, 'sidebar-widget.cjs'), 'utf8');

const integration = new RuntimeUi({
  snapshot: input => collector.snapshot(input),
  preferences,
  source: makeRendererSource(i18nSource, widgetSource, token, startedAt),
  profile: paths.profile,
  dataDir: paths.data,
  owner: token,
  owns: async () => isCurrentOwner(),
  enabled: async () => isPluginEnabled(),
});

async function shutdown() {
  const forceExit = setTimeout(() => process.exit(0), 2000);
  forceExit.unref?.();
  try {
    await integration.stop();
  } finally {
    const cur = readOwnerFile();
    if (cur && cur.token === token) {
      try { rmSync(ownerFile, { force: true }); } catch {}
    }
    process.exit(0);
  }
}

const ownerWatch = setInterval(() => {
  if (!isCurrentOwner()) void shutdown();
}, 1500);
ownerWatch.unref?.();

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => void shutdown());
}

async function applyRequirementOverridePayload(payload) {
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  let updates = {};
  let remove = Array.isArray(body.remove) ? body.remove : [];
  if (typeof body.conversationId === 'string' && body.conversationId.trim()) {
    const id = body.conversationId.trim();
    if (body.remove === true || body.key === null) {
      remove = [...remove, id];
    } else {
      updates = { [id]: { key: body.key, label: body.label } };
    }
  } else if (body.overrides && typeof body.overrides === 'object' && !Array.isArray(body.overrides)) {
    updates = body.overrides;
  } else if (body.set && typeof body.set === 'object' && !Array.isArray(body.set)) {
    updates = body.set;
  }
  const updated = await preferences.patchRequirementOverrides(updates, { remove });
  collector.invalidateCache();
  return { requirementOverrides: updated.requirementOverrides };
}

if (isHostSidecar) {
  const { SidecarApp, Response } = await loadSidecarSdk();
  const app = new SidecarApp();
  app.api('/', () => new Response(auxPanelHtml(), { contentType: 'text/html; charset=utf-8', headers: { 'Cache-Control': 'no-store' } }), 'GET');
  app.api('/api/tree', async () => {
    const prefs = await preferences.get();
    return collector.snapshot({ showArchived: prefs.showArchived, requirementOverrides: prefs.requirementOverrides });
  }, 'GET');
  app.api('/api/integration', () => integration.health, 'GET');
  app.api('/api/preferences', () => preferences.get(), 'GET');
  app.api('/api/preferences', async data => {
    const updated = await preferences.set(data || {});
    collector.invalidateCache();
    return updated;
  }, 'POST');
  app.api('/api/requirement-overrides', async () => {
    const prefs = await preferences.get();
    return { requirementOverrides: prefs.requirementOverrides };
  }, 'GET');
  app.api('/api/requirement-overrides', data => applyRequirementOverridePayload(data), 'POST');
  app.run();
  integration.start();
} else if (process.argv.includes('--bootstrap')) {
  integration.start();
} else {
  const port = Number(process.env.AGY_PROJECT_SIDEBAR_PORT || 17892);
  const server = createServer(async (req, res) => {
    const host = req.headers.host || '127.0.0.1';
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url, `http://${host}`);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(auxPanelHtml());
      return;
    }
    if (url.pathname === '/api/tree') {
      const prefs = await preferences.get();
      const data = await collector.snapshot({
        force: url.searchParams.get('force') === '1',
        showArchived: prefs.showArchived,
        requirementOverrides: prefs.requirementOverrides,
      });
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(data));
      return;
    }
    if (url.pathname === '/api/integration') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(integration.health));
      return;
    }
    if (url.pathname === '/api/preferences') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method === 'GET') { res.end(JSON.stringify(await preferences.get())); return; }
      if (req.method === 'POST') {
        let body = '';
        for await (const c of req) body += c;
        let parsed;
        try { parsed = JSON.parse(body || '{}'); } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
        const updated = await preferences.set(parsed);
        collector.invalidateCache();
        res.end(JSON.stringify(updated));
        return;
      }
    }
    if (url.pathname === '/api/requirement-overrides') {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      if (req.method === 'GET') {
        const prefs = await preferences.get();
        res.end(JSON.stringify({ requirementOverrides: prefs.requirementOverrides }));
        return;
      }
      if (req.method === 'POST') {
        let body = '';
        for await (const c of req) body += c;
        let parsed;
        try { parsed = JSON.parse(body || '{}'); } catch { res.writeHead(400); res.end(JSON.stringify({ error: 'Invalid JSON' })); return; }
        res.end(JSON.stringify(await applyRequirementOverridePayload(parsed)));
        return;
      }
    }
    res.writeHead(404);
    res.end();
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`AGY Project Sidebar preview: http://127.0.0.1:${port}`);
  });
  integration.start();
}

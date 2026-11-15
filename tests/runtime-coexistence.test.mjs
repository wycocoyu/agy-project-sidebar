import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { makeRendererSource, RuntimeUi, validTarget } from '../compat/runtime-ui.mjs';
import { DEFAULT_PREFERENCES, PreferencesStore } from '../compat/preferences.mjs';

const require = createRequire(import.meta.url);

test('renderer source and validTarget strictly isolate namespaces and use native requirement filter UI', () => {
  const i18n = readFileSync(new URL('../compat/i18n.cjs', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../compat/sidebar-widget.cjs', import.meta.url), 'utf8');
  const src = makeRendererSource(i18n, widget, 'owner-1', 1000);

  assert.equal(src.includes('__agPulse'), false);
  assert.equal(src.includes('ag-pulse-status-bar'), false);
  assert.equal(src.includes('agy-ps-drawer'), false);
  assert.equal(src.includes('agy-ps-restore-pill'), false);
  assert.equal(src.includes('__agyProjectSidebarCallV1'), true);
  assert.equal(src.includes('agy-project-sidebar-host'), true);
  assert.equal(src.includes('agy-project-sidebar-filter-bar'), true);
  assert.equal(src.includes('agy-req-results-panel'), true);

  assert.equal(validTarget({
    type: 'page',
    url: 'https://127.0.0.1:63280/c/11111111-1111-1111-1111-111111111111',
    webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1',
  }, 9222), true);

  assert.equal(validTarget({
    type: 'page',
    url: 'http://localhost:58005/?token=secret',
    webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/2',
  }, 9222), false);

  const createI18n = require('../compat/i18n.cjs');
  assert.equal(createI18n('zh-CN').filterPrefix, '需求');
  assert.equal(createI18n('en').filterPrefix, 'Req');
});

test('PreferencesStore validates fields and persists atomically', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-ps-pref-'));
  try {
    const store = new PreferencesStore(join(dir, 'preferences.json'));
    const initial = await store.get();
    assert.deepEqual(initial, DEFAULT_PREFERENCES);
    assert.deepEqual(DEFAULT_PREFERENCES, { language: 'zh-CN', selectedReqKey: null, showArchived: false });

    const updated = await store.set({
      language: 'en',
      selectedReqKey: 'ISSUE:MUL-797',
      showArchived: true,
    });
    assert.equal(updated.language, 'en');
    assert.equal(updated.selectedReqKey, 'ISSUE:MUL-797');
    assert.equal(updated.showArchived, true);

    const invalid = await store.set({ language: 'fr', selectedReqKey: 123, showArchived: 'yes' });
    assert.equal(invalid.language, 'en');
    assert.equal(invalid.selectedReqKey, 'ISSUE:MUL-797');
    assert.equal(invalid.showArchived, true);

    const cleared = await store.set({ selectedReqKey: null });
    assert.equal(cleared.selectedReqKey, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('RuntimeUi handles attach, tree RPC, and detach without errors', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-ps-rt-'));
  const sent = [];
  let eventHandler = null;
  let notifyResolve = null;
  const resolveDelivered = new Promise(r => { notifyResolve = r; });
  const fakeConn = {
    closed: false,
    open: async () => {},
    close() { this.closed = true; },
    async command(method, params) {
      sent.push({ method, params });
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame-1' } } };
      if (method === 'Page.addScriptToEvaluateOnNewDocument') return { identifier: 'script-1' };
      if (method === 'Runtime.evaluate' && params.returnByValue) return { result: { value: { mounted: true, bridge: true } } };
      if (method === 'Runtime.evaluate' && String(params.expression).includes('resolve(1,')) notifyResolve?.();
      return {};
    },
  };
  const store = new PreferencesStore(join(dir, 'preferences.json'));
  const ui = new RuntimeUi({
    snapshot: async () => ({ projects: [{ id: 'p1', name: 'demo' }], conversations: [], stats: { totalProjects: 1, totalConversations: 0, runningCount: 0 } }),
    preferences: store,
    source: 'window.__ok = true;',
    profile: dir,
    dataDir: dir,
    discover: async () => [{ type: 'page', url: 'https://127.0.0.1:63280/', webSocketDebuggerUrl: 'ws://127.0.0.1:9222/devtools/page/1' }],
    connect: (_url, { onEvent }) => { eventHandler = onEvent; return fakeConn; },
  });

  try {
    await ui.tick();
    assert.equal(ui.sessions.size, 1);
    assert.equal(ui.health.state, 'attached');
    assert.ok(sent.some(c => c.method === 'Runtime.addBinding' && c.params.name === '__agyProjectSidebarCallV1'));

    eventHandler({
      method: 'Runtime.executionContextCreated',
      params: { context: { id: 7, origin: 'https://127.0.0.1:63280', auxData: { isDefault: true, frameId: 'frame-1' } } },
    });
    eventHandler({
      method: 'Runtime.bindingCalled',
      params: {
        name: '__agyProjectSidebarCallV1',
        executionContextId: 7,
        payload: JSON.stringify({ id: 1, type: 'tree', input: { force: true } }),
      },
    });
    await resolveDelivered;
    assert.ok(sent.some(c => c.method === 'Runtime.evaluate' && String(c.params.expression).includes('resolve(1,')));
    await ui.stop();
    assert.equal(fakeConn.closed, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

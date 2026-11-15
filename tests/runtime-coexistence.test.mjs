import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { makeRendererSource, RuntimeUi, validTarget } from '../compat/runtime-ui.mjs';
import { DEFAULT_PREFERENCES, PreferencesStore } from '../compat/preferences.mjs';

const require = createRequire(import.meta.url);

test('renderer source strictly isolates namespaces, removes custom bars, and supports multi-select Group By', () => {
  const i18n = readFileSync(new URL('../compat/i18n.cjs', import.meta.url), 'utf8');
  const widget = readFileSync(new URL('../compat/sidebar-widget.cjs', import.meta.url), 'utf8');
  const src = makeRendererSource(i18n, widget, 'owner-1', 1000);

  assert.equal(src.includes('__agPulse'), false);
  assert.equal(src.includes('ag-pulse-status-bar'), false);
  assert.equal(src.includes('agy-ps-drawer'), false);
  assert.equal(src.includes('agy-ps-restore-pill'), false);
  assert.equal(src.includes('agy-project-sidebar-filter-bar'), false);
  assert.equal(src.includes('agy-req-groups-viewport'), false);
  assert.equal(src.includes('agy-req-row'), false);
  assert.equal(src.includes('__agyProjectSidebarCallV1'), true);
  assert.equal(src.includes('agy-group-by-option-requirement'), true);
  assert.equal(src.includes('group-by-submenu-trigger'), true);
  assert.equal(src.includes('data-agy-order'), true);
  assert.equal(src.includes('buildVirtualItemsForDims'), true);

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
  assert.equal(createI18n('zh-CN').labels.requirement, 'Requirement');
  assert.equal(createI18n('en').labels.status, 'Status');
});

test('PreferencesStore validates multi-select groupByDimensions and persists atomically', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-ps-pref-'));
  try {
    const store = new PreferencesStore(join(dir, 'preferences.json'));
    const initial = await store.get();
    assert.deepEqual(initial, DEFAULT_PREFERENCES);
    assert.deepEqual(DEFAULT_PREFERENCES, {
      language: 'zh-CN',
      groupByDimensions: null,
      collapsedGroupKeys: [],
      showArchived: false,
    });

    const updated = await store.set({
      language: 'en',
      groupByDimensions: ['status', 'requirement', 'status', 'invalid_dim'],
      collapsedGroupKeys: ['status:idle/req:ISSUE:MUL-797', 'status:idle/req:ISSUE:MUL-797', 'status:idle/req:ISSUE:Q137'],
      showArchived: true,
    });
    assert.equal(updated.language, 'en');
    assert.deepEqual(updated.groupByDimensions, ['status', 'requirement']);
    assert.deepEqual(updated.collapsedGroupKeys, ['status:idle/req:ISSUE:MUL-797', 'status:idle/req:ISSUE:Q137']);
    assert.equal(updated.showArchived, true);

    const cleared = await store.set({ groupByDimensions: [] });
    assert.deepEqual(cleared.groupByDimensions, []);

    const reset = await store.set({ groupByDimensions: null });
    assert.equal(reset.groupByDimensions, null);

    const invalid = await store.set({ language: 'fr', groupByDimensions: 'bad', collapsedGroupKeys: [123, ''] });
    assert.equal(invalid.language, 'en');
    assert.equal(invalid.groupByDimensions, null);
    assert.deepEqual(invalid.collapsedGroupKeys, []);
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

test('Status + Requirement builds native items without Standalone, pins unread first, and folds read idle in active groups (Plan A)', () => {
  const widgetModule = require('../compat/sidebar-widget.cjs');
  const { buildVirtualItemsForDims } = widgetModule({ __unitTestOnly: true });

  const now = 1_800_000_000_000;
  const min = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  const sampleConvs = [
    // Active multi-session #12: 1 running + 1 unread + 2 read idle (plan A progressive fold!)
    { id: 'r12-run', title: '1115 | 功能 | #12 重试幂等锁实现', projectKey: 'p-ord', statusGroup: 'in_progress', isUnread: false, updatedAtMs: now - 1 * min },
    { id: 'r12-unr', title: '1115 | 设计 | #12 方案评审记录', projectKey: 'p-ord', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 5 * min },
    { id: 'r12-old1', title: '1114 | 调研 | #12 历史压测日志', projectKey: 'p-ord', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 2 * hour },
    { id: 'r12-old2', title: '1113 | 分析 | #12 初版设计草稿', projectKey: 'p-ord', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 1 * day },

    // Unread singleton with #3 in p-loop & unread singleton untagged
    { id: 's-unr-tag', title: '1115 | 设计 | #3 LoopForge支持CNB方案', projectKey: 'p-loop', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 10 * min },
    { id: 's-unr-plain', title: '1115 | 功能 | REA逆向Todos复刻流水线', projectKey: 'p-agent', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 15 * min },

    // Unread multi-session MUL-770 (all idle, >=1 unread -> Idle unread zone)
    { id: 'm770-unr', title: '1115 | 分析 | MUL-770 DA上云方案', projectKey: 'p-ark', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 20 * min },
    { id: 'm770-read', title: '1114 | 调研 | MUL-770 旧日志', projectKey: 'p-ark', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 1 * day },

    // Freshly finished read idle singletons (tagged & untagged) -> MUST sit above old multi-session groups!
    { id: 's-now', title: '1115 | 功能 | 拆分agy-project-sidebar插件', projectKey: 'p-coco', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 500 },
    { id: 's-2814', title: '1115 | 调试 | #2814 OpenCLI reply多图排查', projectKey: 'p-coco', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 2 * hour },

    // All-read historical multi-session Q180 (count = 2) -> collapsed by default, sorted below s-2814
    { id: 'q180-1', title: '1113 | 分析 | Q180 需求研读', projectKey: 'p-egg', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 1 * day },
    { id: 'q180-2', title: '1108 | 分析 | Q180 早期调研', projectKey: 'p-egg', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 6 * day },
  ];

  // Both dim orderings produce identical Status-skeleton layout
  const itemsSR = buildVirtualItemsForDims(sampleConvs, ['status', 'requirement']);
  const itemsRS = buildVirtualItemsForDims(sampleConvs, ['requirement', 'status']);
  assert.deepEqual(itemsSR.map(x => x.id), itemsRS.map(x => x.id));

  // Zero Standalone headers anywhere
  assert.equal(itemsSR.some(x => x.type === 'header' && /Standalone/i.test(x.label)), false);

  // In Progress section: #12 shows only running + unread rows + Plan A progressive fold toggle (NOT read-idle rows)
  const progIdx = itemsSR.findIndex(x => x.id === 'header-status-in-progress');
  const idleIdx = itemsSR.findIndex(x => x.id === 'header-status-idle');
  assert.ok(progIdx >= 0 && idleIdx > progIdx);

  const progSlice = itemsSR.slice(progIdx, idleIdx);
  assert.ok(progSlice.some(x => x.type === 'row' && x.cascadeId === 'r12-run'));
  assert.ok(progSlice.some(x => x.type === 'row' && x.cascadeId === 'r12-unr'));
  assert.equal(progSlice.some(x => x.type === 'row' && x.cascadeId === 'r12-old1'), false);
  const foldToggle = progSlice.find(x => x.type === 'show-more' && x.groupId.startsWith('agy-fold:'));
  assert.ok(foldToggle && foldToggle.label.includes('2'));

  // Clicking the progressive fold toggle reveals the 2 read idle siblings
  const foldKey = foldToggle.groupId.slice('agy-fold:'.length);
  const expandedItems = buildVirtualItemsForDims(sampleConvs, ['status', 'requirement'], {
    expandedReadIdleKeys: [foldKey],
  });
  assert.ok(expandedItems.some(x => x.type === 'row' && x.cascadeId === 'r12-old1'));
  assert.ok(expandedItems.some(x => x.type === 'row' && x.cascadeId === 'r12-old2'));
  assert.ok(expandedItems.some(x => x.type === 'show-more' && x.label.includes('收起')));

  // Idle section: unread singletons + unread group come first, followed by fresh singletons (s-now, s-2814), BEFORE collapsed Q180
  const idleSlice = itemsSR.slice(idleIdx + 1);
  const pos = id => idleSlice.findIndex(x => x.id === id);
  assert.ok(pos('s-unr-tag') >= 0 && pos('s-unr-tag') < pos('s-now'));
  assert.ok(pos('s-unr-plain') >= 0 && pos('s-unr-plain') < pos('s-now'));
  const m770Hdr = idleSlice.find(x => x.type === 'header' && x.label.includes('MUL-770'));
  assert.ok(m770Hdr && m770Hdr._agyUnread === 1 && m770Hdr.isCollapsed === true);
  assert.ok(idleSlice.indexOf(m770Hdr) < pos('s-now'));

  const q180Hdr = idleSlice.find(x => x.type === 'header' && x.label.includes('Q180'));
  assert.ok(q180Hdr && q180Hdr.isCollapsed === true);
  assert.ok(pos('s-now') < pos('s-2814'));
  assert.ok(pos('s-2814') < idleSlice.indexOf(q180Hdr));
  // Unwrapped singletons: #2814 & #3 must NOT have headers
  assert.equal(idleSlice.some(x => x.type === 'header' && x.label.includes('2814')), false);
  assert.equal(idleSlice.some(x => x.type === 'header' && x.label.includes('#3')), false);
});

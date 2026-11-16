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
      inboxEnabled: true,
      inboxEnabledAtMs: 0,
      inboxAutoRetireHours: 24,
      inboxSettled: {},
      inboxFollowUp: {},
      inboxSnoozed: {},
    });

    const updated = await store.set({
      language: 'en',
      groupByDimensions: ['status', 'requirement', 'status', 'invalid_dim'],
      collapsedGroupKeys: ['status:idle/req:ISSUE:MUL-797', 'status:idle/req:ISSUE:MUL-797', 'status:idle/req:ISSUE:Q137'],
      showArchived: true,
      inboxEnabled: true,
      inboxEnabledAtMs: 1700000000123,
      inboxAutoRetireHours: 48,
      inboxSettled: { 'c-1': { atMs: 1700000100000, updatedMs: 1700000090000 }, bad: 'nope' },
      inboxFollowUp: { 'c-2': 1700000200000, bad: -5 },
      inboxSnoozed: { 'c-3': { untilMs: 1700005000000, setAtMs: 1700000300000, updatedMs: 1700000000000 } },
    });
    assert.equal(updated.language, 'en');
    assert.deepEqual(updated.groupByDimensions, ['status', 'requirement']);
    assert.deepEqual(updated.collapsedGroupKeys, ['status:idle/req:ISSUE:MUL-797', 'status:idle/req:ISSUE:Q137']);
    assert.equal(updated.showArchived, true);
    assert.equal(updated.inboxEnabledAtMs, 1700000000123);
    assert.equal(updated.inboxAutoRetireHours, 48);
    assert.deepEqual(updated.inboxSettled, { 'c-1': { atMs: 1700000100000, updatedMs: 1700000090000 } });
    assert.deepEqual(updated.inboxFollowUp, { 'c-2': 1700000200000 });
    assert.deepEqual(updated.inboxSnoozed, { 'c-3': { untilMs: 1700005000000, setAtMs: 1700000300000, updatedMs: 1700000000000 } });

    const cleared = await store.set({ groupByDimensions: [] });
    assert.deepEqual(cleared.groupByDimensions, []);

    const reset = await store.set({ groupByDimensions: null });
    assert.equal(reset.groupByDimensions, null);

    const invalid = await store.set({ language: 'fr', groupByDimensions: 'bad', collapsedGroupKeys: [123, ''], inboxAutoRetireHours: 99 });
    assert.equal(invalid.language, 'en');
    assert.equal(invalid.groupByDimensions, null);
    assert.deepEqual(invalid.collapsedGroupKeys, []);
    assert.equal(invalid.inboxAutoRetireHours, 48);
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

test('Requirement, Status + Requirement, and Requirement + Status produce distinct native layouts with single-session req groups and Plan A folding', () => {
  const widgetModule = require('../compat/sidebar-widget.cjs');
  const { buildVirtualItemsForDims } = widgetModule({ __unitTestOnly: true });

  const now = 1_800_000_000_000;
  const min = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  const sampleConvs = [
    // Active multi-session #12 + clean 'Issue 12' (merges into canonical ISSUE:12 without # in header label!)
    { id: 'r12-run', title: '1115 | 功能 | #12 重试幂等锁实现', projectKey: 'p-ord', statusGroup: 'in_progress', isUnread: false, updatedAtMs: now - 1 * min },
    { id: 'r12-unr', title: '1115 | 设计 | #12 方案评审记录', projectKey: 'p-ord', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 5 * min },
    { id: 'r12-old1', title: '1114 | 调研 | Issue 12 历史压测日志', projectKey: 'p-ord', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 2 * hour },
    { id: 'r12-old2', title: '1113 | 分析 | #12 初版设计草稿', projectKey: 'p-ord', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 1 * day },

    // Single-session unread #3 -> clean label 'LoopForge支持CNB方案' (NO '#3'!) + untagged unread s-unr-plain
    { id: 's-unr-tag', title: '1115 | 设计 | #3 LoopForge支持CNB方案', projectKey: 'p-loop', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 10 * min },
    { id: 's-unr-plain', title: '1115 | 功能 | REA逆向Todos复刻流水线', projectKey: 'p-agent', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 15 * min },

    // Unread multi-session MUL-770 (all idle, >=1 unread -> Idle unread zone)
    { id: 'm770-unr', title: '1115 | 分析 | MUL-770 DA上云方案', projectKey: 'p-ark', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 20 * min },
    { id: 'm770-read', title: '1114 | 调研 | MUL-770 旧日志', projectKey: 'p-ark', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 1 * day },

    // Freshly finished read idle untagged (s-now) + single-session tagged #2814
    { id: 's-now', title: '1115 | 功能 | 拆分agy-project-sidebar插件', projectKey: 'p-coco', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 500 },
    { id: 's-2814', title: '1115 | 调试 | #2814 OpenCLI reply多图排查', projectKey: 'p-coco', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 2 * hour },

    // All-read historical multi-session Q180 (count = 2) -> collapsed by default
    { id: 'q180-1', title: '1113 | 分析 | Q180 需求研读', projectKey: 'p-egg', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 1 * day },
    { id: 'q180-2', title: '1108 | 分析 | Q180 早期调研', projectKey: 'p-egg', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 6 * day },
  ];

  // 1) Status + Requirement: status skeleton + unwrapped untagged rows + clean #-free requirement headers
  const itemsSR = buildVirtualItemsForDims(sampleConvs, ['status', 'requirement']);
  assert.equal(itemsSR.some(x => x.type === 'header' && /Standalone/i.test(x.label)), false);
  assert.equal(itemsSR.some(x => x.type === 'header' && /#/.test(x.label)), false);

  const progIdx = itemsSR.findIndex(x => x.id === 'header-status-in-progress');
  const idleIdx = itemsSR.findIndex(x => x.id === 'header-status-idle');
  assert.ok(progIdx >= 0 && idleIdx > progIdx);

  const progSlice = itemsSR.slice(progIdx, idleIdx);
  assert.ok(progSlice.some(x => x.type === 'row' && x.cascadeId === 'r12-run'));
  assert.ok(progSlice.some(x => x.type === 'row' && x.cascadeId === 'r12-unr'));
  assert.equal(progSlice.some(x => x.type === 'row' && x.cascadeId === 'r12-old1'), false);
  const foldToggle = progSlice.find(x => x.type === 'show-more' && x.groupId.startsWith('agy-fold:'));
  assert.ok(foldToggle && foldToggle.label.includes('2'));

  // Clicking the progressive fold toggle reveals the 2 read idle siblings (including 'Issue 12 历史压测日志')
  const foldKey = foldToggle.groupId.slice('agy-fold:'.length);
  const expandedItems = buildVirtualItemsForDims(sampleConvs, ['status', 'requirement'], {
    expandedReadIdleKeys: [foldKey],
  });
  assert.ok(expandedItems.some(x => x.type === 'row' && x.cascadeId === 'r12-old1'));
  assert.ok(expandedItems.some(x => x.type === 'row' && x.cascadeId === 'r12-old2'));
  assert.ok(expandedItems.some(x => x.type === 'show-more' && x.label.includes('收起')));

  // Idle section: collapsed req headers interleave with unwrapped untagged rows in isUnread -> latestMs order
  const idleSlice = itemsSR.slice(idleIdx + 1);
  const idxOfHeader = frag => idleSlice.findIndex(x => x.type === 'header' && x.label.includes(frag));
  const idxOfRow = id => idleSlice.findIndex(x => x.type === 'row' && x.id === id);

  const sr3Idx = idxOfHeader('LoopForge支持CNB方案');
  const srUnrPlainIdx = idxOfRow('s-unr-plain');
  const srM770Idx = idxOfHeader('MUL-770');
  const srNowIdx = idxOfRow('s-now');
  const sr2814Idx = idxOfHeader('OpenCLI reply多图排查');
  const srQ180Idx = idxOfHeader('Q180');

  assert.ok(sr3Idx >= 0 && idleSlice[sr3Idx].isCollapsed === true && idleSlice[sr3Idx].count === 1);
  assert.ok(srM770Idx >= 0 && idleSlice[srM770Idx].isCollapsed === true && idleSlice[srM770Idx]._agyUnread === 1);
  assert.ok(sr2814Idx >= 0 && idleSlice[sr2814Idx].isCollapsed === true && idleSlice[sr2814Idx].count === 1);
  assert.ok(srQ180Idx >= 0 && idleSlice[srQ180Idx].isCollapsed === true && idleSlice[srQ180Idx].count === 2);
  assert.ok(sr3Idx < srUnrPlainIdx && srUnrPlainIdx < srM770Idx && srM770Idx < srNowIdx);
  assert.ok(srNowIdx < sr2814Idx && sr2814Idx < srQ180Idx);

  // 2) Requirement only: NO top status headers; #-free req headers on top + collapsed Standalone (with unread indicator) at bottom
  const itemsR = buildVirtualItemsForDims(sampleConvs, ['requirement']);
  assert.equal(itemsR.some(x => x.id === 'header-status-in-progress' || x.id === 'header-status-idle'), false);
  assert.equal(itemsR.some(x => x.type === 'header' && /#/.test(x.label)), false);
  const r12Hdr = itemsR.find(x => x._agyKind === 'req-header' && x.id.includes('ISSUE:12'));
  const r3Hdr = itemsR.find(x => x._agyKind === 'req-header' && x.label.includes('LoopForge支持CNB方案'));
  const r2814Hdr = itemsR.find(x => x._agyKind === 'req-header' && x.label.includes('OpenCLI reply多图排查'));
  const rStandaloneHdr = itemsR[itemsR.length - 1];

  assert.ok(r12Hdr && r12Hdr._agyDepth === 0 && r12Hdr.isCollapsed === false && !r12Hdr.label.includes('#') && r12Hdr.count === 4);
  assert.ok(r3Hdr && r3Hdr._agyDepth === 0 && r3Hdr.isCollapsed === true);
  assert.ok(r2814Hdr && r2814Hdr._agyDepth === 0 && r2814Hdr.isCollapsed === true);
  assert.ok(rStandaloneHdr && rStandaloneHdr.label === 'Standalone' && rStandaloneHdr.count === 2 && rStandaloneHdr._agyUnread === 1 && rStandaloneHdr.isCollapsed === true);
  assert.equal(itemsR.some(x => x.type === 'row' && (x.id === 's-unr-plain' || x.id === 's-now')), false);

  const itemsRExp = buildVirtualItemsForDims(sampleConvs, ['requirement'], {
    collapsedKeys: ['exp:req:INBOX'],
  });
  assert.ok(itemsRExp.some(x => x.type === 'row' && x.id === 's-unr-plain'));
  assert.ok(itemsRExp.some(x => x.type === 'row' && x.id === 's-now'));

  // 3) Requirement + Status: Requirement outer skeleton with nested Status headers inside expanded Requirements
  const itemsRS = buildVirtualItemsForDims(sampleConvs, ['requirement', 'status']);
  assert.notDeepEqual(itemsRS.map(x => x.id), itemsSR.map(x => x.id));
  const rs12Idx = itemsRS.findIndex(x => x._agyKind === 'req-header' && x.id.includes('ISSUE:12'));
  const rs3Idx = itemsRS.findIndex(x => x._agyKind === 'req-header' && x.label.includes('LoopForge支持CNB方案'));
  assert.ok(rs12Idx === 0 && rs3Idx > rs12Idx);
  const rs12Inner = itemsRS.slice(rs12Idx + 1, rs3Idx);
  const innerProg = rs12Inner.find(x => x._agyKind === 'top-header' && x.label === 'In Progress');
  const innerIdle = rs12Inner.find(x => x._agyKind === 'top-header' && x.label === 'Idle');
  assert.ok(innerProg && innerProg._agyDepth === 1 && innerProg.count === 1);
  assert.ok(innerIdle && innerIdle._agyDepth === 1 && innerIdle.count === 3);
  assert.equal(itemsRS[itemsRS.length - 1].label, 'Standalone');
});

test('Inbox Triage state machine covers watermark, read-stays-in-inbox, 24h auto-retire, follow-up, snooze, settle, and layout integration', () => {
  const widgetMount = require('../compat/sidebar-widget.cjs');
  const { classifyInboxConversation, partitionInboxBuckets, buildVirtualItemsForDims } = widgetMount({ __unitTestOnly: true });

  const hr = 3600_000;
  const t0 = 1_700_000_000_000;
  const now = t0 + 10 * hr;

  const baseInbox = {
    enabled: true,
    enabledAtMs: t0,
    autoRetireHours: 24,
    settled: {
      'settled-still': { atMs: t0 + 2 * hr, updatedMs: t0 + 1 * hr },
      'settled-newturn': { atMs: t0 + 2 * hr, updatedMs: t0 + 1 * hr },
    },
    followUp: {
      'followup-old': t0 - 10 * hr,
      'followup-newturn': t0 + 3 * hr,
    },
    snoozed: {
      'snoozed-future': { untilMs: now + 2 * hr, setAtMs: t0 + 4 * hr, updatedMs: t0 + 3 * hr },
      'snoozed-woke': { untilMs: now - 30 * 60_000, setAtMs: t0 + 1 * hr, updatedMs: t0 - 72 * hr },
      'snoozed-early-turn': { untilMs: now + 5 * hr, setAtMs: t0 + 4 * hr, updatedMs: t0 + 3 * hr },
      'snoozed-expired-old': { untilMs: now - 30 * hr, setAtMs: t0 - 35 * hr, updatedMs: t0 - 40 * hr },
    },
  };

  // 1) Historical pre-watermark idle stays in Idle
  assert.equal(
    classifyInboxConversation({ id: 'hist', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 2 * hr }, baseInbox, now).bucket,
    'idle',
  );

  // 2) Active running stays active (Blocked / In Progress)
  assert.equal(
    classifyInboxConversation({ id: 'run', statusGroup: 'in_progress', isUnread: false, updatedAtMs: now - 1000 }, baseInbox, now).bucket,
    'active',
  );

  // 3) Read ≠ Settled: opening clears isUnread, but conversation remains in Inbox within 24h
  const readRecent = classifyInboxConversation({ id: 'read-recent', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 + 5 * hr }, baseInbox, now);
  assert.equal(readRecent.bucket, 'inbox');
  assert.equal(readRecent.reason, 'new_idle');

  // 4) 24h auto-retire removes unpinned read item after autoRetireHours
  assert.equal(
    classifyInboxConversation(
      { id: 'auto-old', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 25 * hr },
      { ...baseInbox, enabledAtMs: t0 - 30 * hr },
      now,
    ).bucket,
    'idle',
  );

  // 5) Follow-up stays in Inbox even > 72h past updatedAtMs
  const followOld = classifyInboxConversation({ id: 'followup-old', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 96 * hr }, baseInbox, now);
  assert.equal(followOld.bucket, 'inbox');
  assert.equal(followOld.isFollowUp, true);

  // 6) New user prompt + new AI reply after Follow-up clears Follow-up exemption back into normal Inbox confirmation
  const followReset = classifyInboxConversation(
    { id: 'followup-newturn', statusGroup: 'idle', isUnread: true, userInputAtMs: t0 + 8 * hr, updatedAtMs: t0 + 9 * hr },
    baseInbox,
    now,
  );
  assert.equal(followReset.bucket, 'inbox');
  assert.equal(Boolean(followReset.isFollowUp), false);

  // 7) Settle keeps idle until new turn finishes, then re-enters Inbox automatically
  assert.equal(
    classifyInboxConversation({ id: 'settled-still', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 + 1 * hr }, baseInbox, now).bucket,
    'idle',
  );
  assert.equal(
    classifyInboxConversation({ id: 'settled-newturn', statusGroup: 'idle', isUnread: true, updatedAtMs: t0 + 9 * hr }, baseInbox, now).bucket,
    'inbox',
  );

  // 8) Snooze hides until due, wakes early on new turn, grants full autoRetireHours from wokeAtMs, then retires later
  assert.equal(
    classifyInboxConversation({ id: 'snoozed-future', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 + 3 * hr }, baseInbox, now).bucket,
    'snoozed',
  );
  const woke = classifyInboxConversation({ id: 'snoozed-woke', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 72 * hr }, baseInbox, now);
  assert.equal(woke.bucket, 'inbox');
  assert.equal(woke.isWoke, true);
  assert.equal(
    classifyInboxConversation({ id: 'snoozed-early-turn', statusGroup: 'idle', isUnread: true, updatedAtMs: t0 + 8 * hr }, baseInbox, now).bucket,
    'inbox',
  );
  assert.equal(
    classifyInboxConversation({ id: 'snoozed-expired-old', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 40 * hr }, baseInbox, now).bucket,
    'idle',
  );

  // 9) Manual Mark Unread surfaces historical conversation in Inbox
  assert.equal(
    classifyInboxConversation({ id: 'manual-unread', statusGroup: 'idle', isUnread: true, markedAsUnread: true, updatedAtMs: t0 - 50 * hr }, baseInbox, now).bucket,
    'inbox',
  );

  // 10) Status + Status+Requirement layouts place Inbox + collapsed Snoozed below Active and above Idle with unique cascadeIds
  const sample = [
    { id: 'c-run', title: '1115 | 功能 | #9 active work', statusGroup: 'in_progress', isUnread: false, updatedAtMs: now - 1000 },
    { id: 'read-recent', title: '1115 | 功能 | #9 reviewed awaiting settle', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 + 5 * hr },
    { id: 'followup-old', title: '1114 | 调试 | pinned follow up', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 96 * hr },
    { id: 'snoozed-future', title: '1115 | 分析 | snoozed item', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 + 3 * hr },
    { id: 'hist', title: '1101 | 调研 | older settled work', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 2 * hr },
  ];

  for (const dims of [['status'], ['status', 'requirement']]) {
    const items = buildVirtualItemsForDims(sample, dims, { inbox: baseInbox, nowMs: now });
    const progI = items.findIndex(x => x.id === 'header-status-in-progress');
    const inboxI = items.findIndex(x => x.id === 'header-inbox');
    const snoozeI = items.findIndex(x => x.id === 'header-inbox-snoozed');
    const idleI = items.findIndex(x => x.id === 'header-status-idle');

    assert.ok(progI >= 0 && progI < inboxI && inboxI < snoozeI && snoozeI < idleI);
    assert.equal(items[inboxI].count, 2);
    assert.equal(items[inboxI].isCollapsed, false);
    assert.equal(items[snoozeI].count, 1);
    assert.equal(items[snoozeI].isCollapsed, true);
    assert.equal(items.some(x => x.type === 'row' && x.cascadeId === 'snoozed-future'), false);

    // Every emitted row cascadeId appears at most once
    const rowIds = items.filter(x => x.type === 'row').map(x => x.cascadeId);
    assert.equal(new Set(rowIds).size, rowIds.length);
  }

  // Expanding Snoozed reveals snoozed row cleanly
  const expItems = buildVirtualItemsForDims(sample, ['status'], {
    inbox: baseInbox,
    nowMs: now,
    collapsedKeys: ['exp:inbox:snoozed'],
  });
  assert.equal(expItems.some(x => x.type === 'row' && x.cascadeId === 'snoozed-future'), true);

  // partitionInboxBuckets ranks Unread/Woke > Follow-up > Regular recent
  const ranked = partitionInboxBuckets([
    { id: 'read-recent', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 1000 },
    { id: 'followup-old', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 96 * hr },
    { id: 'snoozed-woke', statusGroup: 'idle', isUnread: false, updatedAtMs: t0 - 72 * hr },
  ], baseInbox, now);
  assert.deepEqual(ranked.inboxEntries.map(e => e.conv.id), ['snoozed-woke', 'followup-old', 'read-recent']);
});

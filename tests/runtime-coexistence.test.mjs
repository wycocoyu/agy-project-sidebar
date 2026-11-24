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
  assert.equal(src.includes("surface === 'sidebar'"), true);
  assert.equal(src.includes("subtitleContext?.setting === 'on'"), true);
  assert.equal(src.includes('agy-group-mark-read'), true);
  assert.equal(src.includes('updateConversationAnnotations'), true);

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
  assert.equal(createI18n('zh-CN').markGroupRead, '本组全部标为已读');
  assert.equal(createI18n('en').labels.status, 'Status');
  assert.equal(createI18n('en').markGroupRead, 'Mark group as read');
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
      requirementOverrides: {},
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

test('resolveRevealPlan expands collapsed ancestors, Snoozed, Plan A read-idle fold, and Show-more pagination precisely', () => {
  const widgetMount = require('../compat/sidebar-widget.cjs');
  const { resolveRevealPlan } = widgetMount({ __unitTestOnly: true });

  const now = 1_700_100_000_000;
  const sample = [
    { id: 'run-a', projectKey: 'p1', title: '1116 | 功能 | COC-4 live work', statusGroup: 'in_progress', isUnread: false, updatedAtMs: now },
    { id: 'idle-folded', projectKey: 'p1', title: '1116 | 调试 | COC-4 read idle sibling', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 10_000 },
    { id: 'snoozed-1', projectKey: 'p1', title: '1116 | 分析 | Q94 snoozed chat', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 20_000 },
    { id: 'other-1', projectKey: 'p2', title: '1115 | 设计 | MUL-700 unrelated', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 30_000 },
  ];
  // Add 50 standalone/grouped items past 40-cluster pagination in Requirement mode
  for (let i = 1; i <= 48; i += 1) {
    sample.push({
      id: `req-${i}`,
      projectKey: 'p2',
      title: `1115 | 功能 | REQ-${100 + i} paginated req ${i}`,
      statusGroup: 'idle',
      isUnread: false,
      updatedAtMs: now - (i + 5) * 60_000,
    });
  }

  const inboxCfg = {
    enabled: true,
    enabledAtMs: now - 5000,
    autoRetireHours: 24,
    settled: { 'idle-folded': { atMs: now - 2000, updatedMs: now - 10_000 } },
    followUp: {},
    snoozed: { 'snoozed-1': { untilMs: now + 3600_000, setAtMs: now - 1000, updatedMs: now - 20_000 } },
  };

  // 1) Target inside collapsed Idle + collapsed REQ-148 past limit 40 in Status + Requirement
  const plan1 = resolveRevealPlan(sample, ['status', 'requirement'], 'req-48', {
    collapsedKeys: ['col:status:idle'],
    inbox: inboxCfg,
    nowMs: now,
  });
  assert.equal(plan1.found, true);
  assert.deepEqual(plan1.toggleOps, [
    { toggleKey: 'col:status:idle', action: 'delete' },
    { toggleKey: 'exp:status:idle/req:ISSUE:REQ-148', action: 'add' },
  ]);
  assert.ok(plan1.limitPatches['status:idle'] >= 48);
  assert.equal(plan1.items[plan1.virtualIndex].cascadeId, 'req-48');
  assert.equal(plan1.trail[0], 'Idle');

  // 2) Plan A folded read-idle sibling inside active In Progress COC-4
  const plan2 = resolveRevealPlan(sample, ['status', 'requirement'], 'idle-folded', {
    collapsedKeys: [],
    inbox: inboxCfg,
    nowMs: now,
  });
  assert.equal(plan2.found, true);
  assert.deepEqual(plan2.readIdleKeys, ['status:in_progress/req:ISSUE:COC-4']);
  assert.equal(plan2.items[plan2.virtualIndex].cascadeId, 'idle-folded');

  // 3) Collapsed Snoozed bucket
  const plan3 = resolveRevealPlan(sample, ['status', 'requirement'], 'snoozed-1', {
    collapsedKeys: [],
    inbox: inboxCfg,
    nowMs: now,
  });
  assert.equal(plan3.found, true);
  assert.deepEqual(plan3.toggleOps, [{ toggleKey: 'exp:inbox:snoozed', action: 'add' }]);
  assert.equal(plan3.items[plan3.virtualIndex].cascadeId, 'snoozed-1');

  // 4) Paginated cluster #48 in Requirement-only view
  const plan4 = resolveRevealPlan(sample, ['requirement'], 'req-48', {
    collapsedKeys: [],
    inbox: inboxCfg,
    nowMs: now,
  });
  assert.equal(plan4.found, true);
  assert.ok(plan4.limitPatches['root:requirement'] >= 48);
  assert.deepEqual(plan4.toggleOps, [{ toggleKey: 'exp:req:ISSUE:REQ-148', action: 'add' }]);

  // 5) Missing / archived target returns clean not-in-list
  const missing = resolveRevealPlan(sample, ['status', 'requirement'], 'does-not-exist', {});
  assert.equal(missing.found, false);
  assert.equal(missing.reason, 'not-in-list');

  // 6) Regression guard: titlebar reveal button MUST opt out of Electron window-drag region and match native 28x28 icon-only topbar style
  const widgetSrc = readFileSync(new URL('../compat/sidebar-widget.cjs', import.meta.url), 'utf8');
  const cssSlice = widgetSrc.slice(widgetSrc.indexOf('#${REVEAL_BTN_ID} {'));
  assert.match(cssSlice.slice(0, 400), /-webkit-app-region:\s*no-drag/);
  assert.match(cssSlice.slice(0, 400), /width:\s*28px;\s*height:\s*28px/);
  assert.match(cssSlice.slice(0, 400), /border:\s*none;/);
  assert.match(cssSlice.slice(0, 400), /background:\s*transparent;/);
  assert.equal(widgetSrc.includes('data-agy-reveal-label'), true); // only for cleanup; never created as span
  assert.equal(widgetSrc.includes("el('span', '', t.revealLabel)"), false);
});

test('2.35.0 additive mode yields to native single-dim/None, respects subtitleContext heights, preserves prefixItems, and follows Sort & Filter', () => {
  const widgetMount = require('../compat/sidebar-widget.cjs');
  const {
    shouldUseCustomGrouping,
    estimateItemTopPx,
    splitPrefixAndMainItems,
    extractNativeSidebarSettings,
    matchesNativeFilter,
    buildVirtualItemsForDims,
  } = widgetMount({ __unitTestOnly: true });

  // 1) Additive mode gating: yield completely when None or single-dim native Group By (even when inboxEnabled is true)
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: null, inboxEnabled: true }, detectedNativeDim: 'status' }), false);
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: null, inboxEnabled: true }, detectedNativeDim: 'project' }), false);
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: null, inboxEnabled: true }, detectedNativeDim: 'none' }), false);
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: [], inboxEnabled: true }, detectedNativeDim: 'status' }), false);
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: ['status'], inboxEnabled: true }, detectedNativeDim: 'status' }), false);
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: ['requirement'], inboxEnabled: false }, detectedNativeDim: 'status' }), true);
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: ['status', 'requirement'], inboxEnabled: false }, detectedNativeDim: 'status' }), true);
  assert.equal(shouldUseCustomGrouping({ prefs: { groupByDimensions: ['project', 'status'], inboxEnabled: false }, detectedNativeDim: 'status' }), true);

  // 2) estimateItemTopPx switches row height dynamically between 49px (subtitle on) and 33px (subtitle off)
  const mixedItems = [
    { type: 'section-header' }, // 24
    { type: 'sidebar-agent' },  // 33
    { type: 'spacer', height: 14 }, // 14
    { type: 'header' },         // 37
    { type: 'row' },            // 49 or 33
    { type: 'show-more' },      // 32
    { type: 'row' },
  ];
  assert.equal(estimateItemTopPx(mixedItems, 6, { subtitleContext: { setting: 'on' } }), 24 + 33 + 14 + 37 + 49 + 32);
  assert.equal(estimateItemTopPx(mixedItems, 6, { subtitleContext: { setting: 'off' } }), 24 + 33 + 14 + 37 + 33 + 32);

  // 3) splitPrefixAndMainItems preserves Coordinators/Agents, Pinned Conversations, and convgroup:* sections
  const raw235 = [
    { type: 'section-header', id: 'section-coordinator', collapseId: 'section-coordinator', title: 'Agents' },
    { type: 'sidebar-agent', id: 'sidebar-agent:a1', agentId: 'a1', groupId: 'section-coordinator' },
    { type: 'section-header', id: 'section-pinned', collapseId: 'pinned', title: 'Pinned Conversations' },
    { type: 'row', id: 'pin-1', cascadeId: 'pin-1', groupId: 'pinned' },
    { type: 'section-header', id: 'header-convgroup:g1', collapseId: 'convgroup:g1', title: 'Custom Group' },
    { type: 'row', id: 'cg-1', cascadeId: 'cg-1', groupId: 'convgroup:g1' },
    { type: 'spacer', height: 16 },
    { type: 'section-header', id: 'main-section-header', collapseId: 'main-section-header', title: 'Conversations' },
    { type: 'row', id: 'c-1', cascadeId: 'c-1', groupId: 'status-idle' },
  ];
  const split = splitPrefixAndMainItems(raw235, false);
  assert.equal(split.prefixItems.length, 8);
  assert.equal(split.mainHdr.id, 'main-section-header');
  assert.deepEqual(split.postMainItems.map(x => x.id), ['c-1']);
  assert.equal(splitPrefixAndMainItems(raw235, true).prefixItems.length, 0);

  // 4) Native settings extraction + Filter inheritance
  const fakeMainHdr = {
    type: 'section-header',
    id: 'main-section-header',
    headerActions: {
      props: {
        children: [{
          props: {
            groupBy: 'status',
            sortBy: 'last_user_prompt',
            filterBy: ['last_7_days', 'env:local'],
            customFilters: [{ id: 'last_7_days', enabled: true }],
          },
        }],
      },
    },
  };
  const nativeSettings = extractNativeSidebarSettings({ subtitleContext: { setting: 'on', groupBy: 'status' } }, fakeMainHdr);
  assert.equal(nativeSettings.groupBy, 'status');
  assert.equal(nativeSettings.sortBy, 'last_user_prompt');
  assert.deepEqual(nativeSettings.activeFilters, ['last_7_days', 'env:local']);

  const now = 1_800_000_000_000;
  const day = 86_400_000;
  assert.equal(matchesNativeFilter({ id: 'a', envKind: 'local', updatedAtMs: now - 2 * day, userInputAtMs: now - 2 * day }, null, nativeSettings.activeFilters, new Set(), now), true);
  assert.equal(matchesNativeFilter({ id: 'b', envKind: 'cloud', updatedAtMs: now - 2 * day, userInputAtMs: now - 2 * day }, null, nativeSettings.activeFilters, new Set(), now), false);
  assert.equal(matchesNativeFilter({ id: 'c', envKind: 'local', updatedAtMs: now - 10 * day, userInputAtMs: now - 10 * day }, null, nativeSettings.activeFilters, new Set(), now), false);

  // 5) Sort Conversations: Last Prompt uses userInputAtMs instead of updatedAtMs + optional Inbox disabled + 3-tier requirementOverrides
  const sortConvs = [
    { id: 'bg-renamed', title: '1115 | 功能 | MUL-10 background rename', projectKey: 'p1', statusGroup: 'idle', isUnread: false, userInputAtMs: now - 5 * day, updatedAtMs: now - 1000 },
    { id: 'recent-prompt', title: '1115 | 功能 | MUL-20 fresh prompt', projectKey: 'p1', statusGroup: 'idle', isUnread: false, userInputAtMs: now - 60_000, updatedAtMs: now - 2 * day },
    { id: 'overridden', title: 'plain chat without tag', projectKey: 'p1', statusGroup: 'idle', isUnread: true, userInputAtMs: now - 30_000, updatedAtMs: now - 30_000 },
    { id: 'convgrp', title: 'native convgroup item', projectKey: 'p1', groupId: 'convgroup:sprint-1', statusGroup: 'idle', isUnread: false, userInputAtMs: now - 3 * day, updatedAtMs: now - 3 * day },
  ];

  const byLastPrompt = buildVirtualItemsForDims(sortConvs, ['status', 'requirement'], {
    sortBy: 'last_user_prompt',
    inbox: undefined,
    requirementOverrides: { overridden: { key: 'ISSUE:COC-99', label: 'COC-99 Overridden' } },
  });
  assert.equal(byLastPrompt.some(x => x.id === 'header-inbox'), false);
  assert.ok(byLastPrompt.some(x => x._agyKind === 'req-header' && x.label === 'COC-99 Overridden'));
  assert.ok(byLastPrompt.some(x => x._agyKind === 'req-header' && x.id.includes('convgroup:sprint-1')));
  const idxMul20Prompt = byLastPrompt.findIndex(x => x.id === 'header-agy-req:status:idle/req:ISSUE:MUL-20');
  const idxMul10Prompt = byLastPrompt.findIndex(x => x.id === 'header-agy-req:status:idle/req:ISSUE:MUL-10');
  assert.ok(idxMul20Prompt > 0 && idxMul10Prompt > idxMul20Prompt);

  const byLastUpdated = buildVirtualItemsForDims(sortConvs, ['status', 'requirement'], {
    sortBy: 'last_updated',
    inbox: undefined,
  });
  const idxMul20Upd = byLastUpdated.findIndex(x => x.id === 'header-agy-req:status:idle/req:ISSUE:MUL-20');
  const idxMul10Upd = byLastUpdated.findIndex(x => x.id === 'header-agy-req:status:idle/req:ISSUE:MUL-10');
  assert.ok(idxMul10Upd > 0 && idxMul20Upd > idxMul10Upd);
});

test('per-group Mark all as read collects _agyUnreadIds, invokes native batch updateConversationAnnotations with Undo, and patches 2.35.0 surface Fiber cleanly', async () => {
  const widgetMount = require('../compat/sidebar-widget.cjs');
  const {
    buildVirtualItemsForDims,
    findAnnotationsContext,
    markGroupConversationsAsRead,
  } = widgetMount({ __unitTestOnly: true });

  const now = 1_800_000_000_000;
  const convs = [
    { id: 'u-1', projectKey: 'p1', projectName: 'Alpha', title: '1115 | 功能 | COC-4 one', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 1000 },
    { id: 'u-2', projectKey: 'p1', projectName: 'Alpha', title: '1115 | 设计 | COC-4 two', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 2000 },
    { id: 'r-1', projectKey: 'p1', projectName: 'Alpha', title: '1115 | 调研 | COC-4 three', statusGroup: 'idle', isUnread: false, updatedAtMs: now - 3000 },
    { id: 'u-3', projectKey: 'p2', projectName: 'Beta', title: '1115 | 功能 | standalone unread', statusGroup: 'idle', isUnread: true, updatedAtMs: now - 4000 },
  ];

  // Check _agyUnreadIds across Status + Requirement and Project headers
  const srItems = buildVirtualItemsForDims(convs, ['status', 'requirement'], { inbox: undefined });
  const idleHdr = srItems.find(x => x.id === 'header-status-idle');
  const coc4Hdr = srItems.find(x => x._agyKind === 'req-header' && x.id.includes('ISSUE:COC-4'));
  assert.deepEqual(idleHdr._agyUnreadIds, ['u-1', 'u-2', 'u-3']);
  assert.deepEqual(coc4Hdr._agyUnreadIds, ['u-1', 'u-2']);

  const projItems = buildVirtualItemsForDims(convs, ['project', 'status'], { inbox: undefined });
  const alphaHdr = projItems.find(x => x.id === 'header-agy:proj:p1');
  assert.deepEqual(alphaHdr._agyUnreadIds, ['u-1', 'u-2']);

  // findAnnotationsContext discovers React context dependency or provider value
  const calls = [];
  const ctxObj = {
    updateConversationAnnotations: (ids, patch, merge) => {
      calls.push({ ids, patch, merge });
    },
  };
  const fiberTree = {
    return: {
      dependencies: {
        firstContext: { memoizedValue: {}, next: { memoizedValue: ctxObj, next: null } },
      },
    },
  };
  assert.equal(findAnnotationsContext(fiberTree), ctxObj);

  const localViewedMs = new Map([['u-1', 12345]]);
  const res = markGroupConversationsAsRead(['u-1', 'u-2', 'u-1'], {
    updateConversationAnnotations: ctxObj.updateConversationAnnotations,
    localViewedMs,
    nowMs: 1_800_000_005_123,
  });
  assert.equal(res.ok, true);
  assert.equal(res.count, 2);
  assert.equal(localViewedMs.get('u-1'), 1_800_000_005_123);
  assert.equal(localViewedMs.get('u-2'), 1_800_000_005_123);
  assert.deepEqual(calls[0], {
    ids: ['u-1', 'u-2'],
    patch: { markedAsUnread: false, lastUserViewTime: { seconds: 1_800_000_005, nanos: 123_000_000 } },
    merge: true,
  });

  // Undo restores localViewedMs and reverts markedAsUnread: true
  res.undo();
  assert.equal(localViewedMs.get('u-1'), 12345);
  assert.equal(localViewedMs.has('u-2'), false);
  assert.deepEqual(calls[1], {
    ids: ['u-1', 'u-2'],
    patch: { markedAsUnread: true },
    merge: true,
  });

  // Live Fiber + DOM mounting smoke test with surface='sidebar' and multi-MR/PR row preservation
  const origWindow = globalThis.window;
  const origDocument = globalThis.document;
  const origRaf = globalThis.requestAnimationFrame;
  const origSetInterval = globalThis.setInterval;
  const origClearInterval = globalThis.clearInterval;
  try {
    const fakeBodyChildren = [];
    const makeFakeNode = tag => ({
      tagName: String(tag).toUpperCase(),
      style: {},
      children: [],
      attrs: {},
      classList: { add() {}, remove() {} },
      setAttribute(k, v) { this.attrs[k] = String(v); },
      getAttribute(k) { return this.attrs[k] ?? null; },
      removeAttribute(k) { delete this.attrs[k]; },
      appendChild(c) { this.children.push(c); return c; },
      insertBefore(c) { this.children.unshift(c); return c; },
      addEventListener() {},
      removeEventListener() {},
      querySelector() { return null; },
      querySelectorAll() { return []; },
      closest() { return null; },
      remove() {},
    });
    const renderedCalls = [];
    const origListFn = props => { renderedCalls.push(props); return { rendered: true, props }; };
    const listFiber = {
      type: origListFn,
      elementType: origListFn,
      memoizedProps: {
        surface: 'sidebar',
        subtitleContext: { setting: 'on', groupBy: 'status' },
        items: [
          { type: 'section-header', id: 'section-pinned', collapseId: 'pinned', title: 'Pinned' },
          { type: 'row', id: 'pin-1', cascadeId: 'pin-1', groupId: 'pinned' },
          { type: 'section-header', id: 'main-section-header', collapseId: 'main-section-header', title: 'Conversations' },
          { type: 'row', id: 'u-3', cascadeId: 'u-3', groupId: 'status-idle', pullRequestOverflow: '+2' },
        ],
        customHeaderRenderer: () => ({ $$typeof: Symbol.for('react.element'), type: 'div', props: {} }),
        onFocusGroupId: () => {},
      },
      dependencies: { firstContext: { memoizedValue: ctxObj, next: null } },
      return: null,
    };
    const listDomEl = {
      ...makeFakeNode('div'),
      __reactFiber$test: listFiber,
    };
    const topbarHostEl = makeFakeNode('div');
    const fakeDoc = {
      head: makeFakeNode('head'),
      body: { ...makeFakeNode('body'), children: fakeBodyChildren },
      createElement: tag => makeFakeNode(tag),
      createElementNS: (_ns, tag) => makeFakeNode(tag),
      getElementById: () => null,
      querySelector: sel => {
        if (sel === '[data-testid="conversation-list-sidebar"]') return listDomEl;
        if (sel === '.agy-layout-vars') return topbarHostEl;
        return null;
      },
      querySelectorAll: () => [],
      dispatchEvent() {},
    };
    const fakeWin = {
      location: { pathname: '/c/r-1' },
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener() {},
      removeEventListener() {},
      __agyProjectSidebarHost: {
        getTree: async () => ({
          projects: [{ id: 'p1', name: 'Alpha' }],
          conversations: convs,
          preferences: { groupByDimensions: ['status', 'requirement'], inboxEnabled: false, collapsedGroupKeys: [] },
        }),
        setPreferences: async p => p,
      },
    };
    fakeWin.window = fakeWin;
    fakeWin.top = fakeWin;
    globalThis.window = fakeWin;
    globalThis.document = fakeDoc;
    globalThis.MutationObserver = class { observe() {} disconnect() {} };
    globalThis.requestAnimationFrame = () => 1;
    globalThis.setInterval = () => 1;
    globalThis.clearInterval = () => {};

    widgetMount({ updateConversationAnnotations: ctxObj.updateConversationAnnotations });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.notEqual(listFiber.type, origListFn);

    // 0) Reveal button uses native 28x28 icon-only topbar classes, no-drag, tooltip, and 16x16 linear stroke SVG
    const revealBtn = topbarHostEl.children.find(c => c.id === 'agy-reveal-sidebar-btn');
    assert.ok(revealBtn);
    assert.match(revealBtn.className, /\bh-7\b/);
    assert.match(revealBtn.className, /\bw-7\b/);
    assert.match(revealBtn.className, /\bbg-transparent\b/);
    assert.equal(revealBtn.style.webkitAppRegion, 'no-drag');
    assert.equal(revealBtn.attrs['data-testid'], 'agy-reveal-in-sidebar-button');
    assert.ok(revealBtn.attrs['aria-label'] && revealBtn.attrs.title === revealBtn.attrs['aria-label']);
    assert.equal(revealBtn.children.length, 1);
    const revealSvg = revealBtn.children[0];
    assert.equal(revealSvg.tagName, 'SVG');
    assert.equal(revealSvg.attrs.viewBox, '0 0 24 24');
    assert.equal(revealSvg.attrs.width, '16');
    assert.equal(revealSvg.attrs.height, '16');
    assert.equal(revealSvg.attrs.fill, 'none');
    assert.equal(revealSvg.attrs.stroke, 'currentColor');
    assert.equal(revealSvg.attrs['stroke-width'], '1.75');
    assert.equal(revealSvg.children.some(n => n.tagName === 'CIRCLE'), true);

    // 1) Additive mode active: Status + Requirement renders custom headers with Mark-all-as-read button & preserves native row metadata
    const customOut = listFiber.type(listFiber.memoizedProps);
    assert.equal(customOut.props.items[0].id, 'section-pinned');
    assert.equal(customOut.props.items[1].id, 'pin-1');
    const customRow = customOut.props.items.find(x => x.type === 'row' && x.cascadeId === 'u-3');
    assert.equal(customRow.pullRequestOverflow, '+2');
    const customHdr = customOut.props.items.find(x => x.id === 'header-status-idle');
    const hdrEl = customOut.props.customHeaderRenderer(customHdr);
    const markBtn = hdrEl.props.children.find(c => c?.props?.['data-testid'] === 'agy-group-mark-read');
    assert.ok(markBtn);
    markBtn.props.onClick({ preventDefault() {}, stopPropagation() {} });
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[2].ids, ['u-1', 'u-2', 'u-3']);

    // 2) History surface ('background') is detected cleanly
    const histOut = listFiber.type({ ...listFiber.memoizedProps, surface: 'background' });
    assert.ok(histOut.props.items.every(x => x.id !== 'section-pinned'));

    // 3) Yield to native cleanly when groupByDimensions is null and detectedNativeDim is single-dim
    fakeWin.__agyProjectSidebarHost.getTree = async () => ({
      projects: [{ id: 'p1', name: 'Alpha' }],
      conversations: convs,
      preferences: { groupByDimensions: null, inboxEnabled: true, collapsedGroupKeys: [] },
    });
    const yieldedProps = { ...listFiber.memoizedProps, subtitleContext: { setting: 'on', groupBy: 'status' } };
    // Reset to native single-dim via dispose + remount with null groupByDimensions
    fakeWin.__agyProjectSidebarDispose?.();
    widgetMount({ updateConversationAnnotations: ctxObj.updateConversationAnnotations });
    await new Promise(resolve => setTimeout(resolve, 10));
    const nativeOut = listFiber.type(yieldedProps);
    assert.deepEqual(nativeOut.props.items.map(x => x.id), yieldedProps.items.map(x => x.id));

    fakeWin.__agyProjectSidebarDispose?.();
    assert.equal(listFiber.type, origListFn);
  } finally {
    globalThis.window?.__agyProjectSidebarDispose?.();
    globalThis.window = origWindow;
    globalThis.document = origDocument;
    globalThis.requestAnimationFrame = origRaf;
    globalThis.setInterval = origSetInterval;
    globalThis.clearInterval = origClearInterval;
  }
});

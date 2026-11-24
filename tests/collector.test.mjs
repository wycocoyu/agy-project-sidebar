import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  assignRequirements,
  buildSidebarSnapshot,
  extractRequirementDescriptor,
  filterRealProjects,
  SidebarCollector,
} from '../sidecars/panel/collector.mjs';
import { DEFAULT_PREFERENCES, PreferencesStore } from '../compat/preferences.mjs';

test('filterRealProjects excludes sidecar virtual projects and preserves local folders', () => {
  const raw = [
    {
      id: 'proj-real',
      name: 'cocoyuworkspace',
      projectResources: { resources: [{ gitFolder: { folderUri: 'file:///Users/mac/dev/cocoyuworkspace' } }] },
    },
    {
      id: '424a78b9-2b88-4eb5-b8ec-2d57669f2ce3',
      name: 'antigravity-pulse/panel',
      projectResources: { resources: [] },
    },
    {
      id: 'proj-slash-no-folder',
      name: 'swarm/swarm_board',
      projectResources: { resources: [] },
    },
    {
      id: 'proj-opencode',
      name: 'opencode-pipeline',
      projectResources: { resources: [] },
    },
  ];
  const filtered = filterRealProjects(raw, new Set(['424a78b9-2b88-4eb5-b8ec-2d57669f2ce3']));
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].id, 'proj-real');
  assert.deepEqual(filtered[0].folderPaths, ['/Users/mac/dev/cocoyuworkspace']);
});

test('extractRequirementDescriptor recognizes issue IDs without # in labels and without misclassifying tech tokens', () => {
  assert.equal(extractRequirementDescriptor('1115 | 设计 | MUL-797 通用Runner实现').key, 'ISSUE:MUL-797');
  const h41 = extractRequirementDescriptor('#41 优化需求文件夹视觉区分度');
  assert.equal(h41.key, 'ISSUE:41');
  assert.equal(h41.label, '优化需求文件夹视觉区分度');
  assert.equal(extractRequirementDescriptor('1115 | 功能 | Issue 41 需求视觉对齐').key, 'ISSUE:41');
  assert.equal(extractRequirementDescriptor('#88').label, 'Issue 88');
  assert.equal(extractRequirementDescriptor('DeerFlow #7881 #6751 复现').label, 'DeerFlow 7881 6751 复现');
  assert.equal(extractRequirementDescriptor('Q137 排查线上延时').key, 'ISSUE:Q137');

  const bracket = extractRequirementDescriptor('1115 | 功能 | 【看板】状态分组重构');
  assert.equal(bracket.kind, 'theme-candidate');
  assert.equal(bracket.key, 'THEME:看板');

  const gpt = extractRequirementDescriptor('1115 | 优化 | GPT-6 路由验证');
  assert.equal(gpt.kind, 'theme-candidate');
  assert.equal(gpt.key, 'THEME:gpt-6 路由验证');

  const utf = extractRequirementDescriptor('UTF-8 编码异常修复');
  assert.equal(utf.kind, 'inbox');
});

test('buildSidebarSnapshot resolves workspace_uris fallback, clusters >=2 themes, and pins inbox', () => {
  const rawProjects = [
    {
      id: 'p-ark',
      name: 'ark',
      projectResources: { resources: [{ gitFolder: { folderUri: 'file:///tmp/ws/ark' } }] },
    },
    {
      id: 'p-ark-sub',
      name: 'ark-sub',
      projectResources: { resources: [{ folderUri: 'file:///tmp/ws/ark/subpkg' }] },
    },
  ];

  const rows = [
    {
      conversation_id: 'c1',
      title: '1115 | 设计 | 通用Runner实现',
      status: 'CASCADE_RUN_STATUS_RUNNING',
      project_id: '',
      workspace_uris: '["file:///tmp/ws/ark/subpkg/module"]',
      last_modified_time: '2026-11-15 10:00:00.123456+00:00',
    },
    {
      conversation_id: 'c2',
      title: '1115 | 调试 | 通用Runner实现',
      status: 'CASCADE_RUN_STATUS_IDLE',
      project_id: '',
      workspace_uris: '["file:///tmp/ws/ark/subpkg"]',
      last_modified_time: '2026-11-15 09:00:00+00:00',
    },
    {
      conversation_id: 'c3',
      title: '1115 | 分析 | 孤立单次调研',
      status: 'CASCADE_RUN_STATUS_IDLE',
      not_fully_idle: 1,
      project_id: 'outside-of-project',
      workspace_uris: '["file:///tmp/unrelated"]',
      last_modified_time: '2026-11-15 08:00:00+00:00',
    },
    {
      conversation_id: 'c5-waiting',
      title: '1115 | 调试 | 等待授权確認',
      status: 'CASCADE_RUN_STATUS_WAITING',
      project_id: 'p-ark',
      workspace_uris: '[]',
      last_modified_time: '2026-11-15 08:30:00+00:00',
    },
    {
      conversation_id: 'c4-archived',
      title: 'MUL-100 已归档任务',
      status: 'CASCADE_RUN_STATUS_IDLE',
      project_id: 'p-ark',
      workspace_uris: '[]',
      last_modified_time: '2026-11-15 07:00:00+00:00',
    },
  ];

  const snap = buildSidebarSnapshot({
    rawProjects,
    rows,
    archivedIds: new Set(['c4-archived']),
    showArchived: false,
  });

  assert.equal(snap.stats.totalConversations, 4);
  assert.equal(snap.stats.runningCount, 1);

  const byId = Object.fromEntries(snap.conversations.map(c => [c.id, c]));
  assert.equal(byId.c1.projectKey, 'p-ark-sub');
  assert.equal(byId.c1.statusGroup, 'in_progress');
  assert.equal(byId.c1.repoName, 'subpkg');
  assert.equal(byId.c1.envKind, 'local');
  assert.equal(byId.c1.reqKey, 'p-ark-sub::THEME:通用runner实现');
  assert.equal(byId.c1.reqCount, 2);
  assert.equal(byId.c2.statusGroup, 'idle');
  assert.equal(byId.c2.reqKey, 'p-ark-sub::THEME:通用runner实现');
  assert.equal(byId.c3.isUnassigned, true);
  assert.equal(byId.c3.statusGroup, 'idle');
  assert.equal(byId.c3.repoName, 'unrelated');
  assert.equal(byId.c3.reqKey, 'INBOX');
  assert.equal(byId['c5-waiting'].statusGroup, 'blocked');
  assert.equal(byId['c4-archived'], undefined);
});

test('buildSidebarSnapshot scopes numeric #N / PR#N per project while keeping MUL/Q global', () => {
  const rawProjects = [
    { id: 'p-loop', name: 'LoopForge', projectResources: { resources: [{ gitFolder: { folderUri: 'file:///tmp/ws/LoopForge' } }] } },
    { id: 'p-coco', name: 'cocoyuworkspace', projectResources: { resources: [{ gitFolder: { folderUri: 'file:///tmp/ws/cocoyuworkspace' } }] } },
    { id: 'p-ark', name: 'ark', projectResources: { resources: [{ gitFolder: { folderUri: 'file:///tmp/ws/ark' } }] } },
  ];
  const rows = [
    { conversation_id: 'l-3', title: '1115 | 设计 | #3 LoopForge支持CNB方案', status: 'CASCADE_RUN_STATUS_IDLE', project_id: 'p-loop', workspace_uris: '[]', last_modified_time: '2026-11-15 10:00:00+00:00' },
    { conversation_id: 'c-3', title: '1115 | 功能 | #3#4 Claude与CLI1.5适配', status: 'CASCADE_RUN_STATUS_IDLE', project_id: 'p-coco', workspace_uris: '[]', last_modified_time: '2026-11-15 09:00:00+00:00' },
    { conversation_id: 'l-pr12', title: '1115 | 修复 | PR#12 fix ci', status: 'CASCADE_RUN_STATUS_IDLE', project_id: 'p-loop', workspace_uris: '[]', last_modified_time: '2026-11-15 08:30:00+00:00' },
    { conversation_id: 'c-pr12', title: '1115 | 文档 | PR#12 docs sync', status: 'CASCADE_RUN_STATUS_IDLE', project_id: 'p-coco', workspace_uris: '[]', last_modified_time: '2026-11-15 08:00:00+00:00' },
    { conversation_id: 'm-1', title: '1115 | 设计 | MUL-797 通用Runner实现', status: 'CASCADE_RUN_STATUS_RUNNING', project_id: 'p-coco', workspace_uris: '[]', last_modified_time: '2026-11-15 07:30:00+00:00' },
    { conversation_id: 'm-2', title: '1115 | 调试 | MUL-797 调度验证', status: 'CASCADE_RUN_STATUS_IDLE', project_id: 'p-ark', workspace_uris: '[]', last_modified_time: '2026-11-15 07:00:00+00:00' },
  ];

  const snap = buildSidebarSnapshot({ rawProjects, rows });
  const byId = Object.fromEntries(snap.conversations.map(c => [c.id, c]));

  assert.equal(byId['l-3'].reqKey, 'p-loop::ISSUE:3');
  assert.equal(byId['l-3'].reqCount, 1);
  assert.equal(byId['l-3'].reqLabel, 'LoopForge支持CNB方案');

  assert.equal(byId['c-3'].reqKey, 'p-coco::ISSUE:3');
  assert.equal(byId['c-3'].reqCount, 1);
  assert.equal(byId['c-3'].reqLabel, 'Claude与CLI1.5适配');
  assert.equal(byId['c-3'].reqLabel.includes('#'), false);

  assert.notEqual(byId['l-pr12'].reqKey, byId['c-pr12'].reqKey);
  assert.equal(byId['l-pr12'].reqLabel, 'PR 12 fix ci');
  assert.equal(byId['m-1'].reqKey, 'ISSUE:MUL-797');
  assert.equal(byId['m-2'].reqKey, 'ISSUE:MUL-797');
  assert.equal(byId['m-1'].reqCount, 2);
});

test('SidebarCollector reads SQLite conversation_summaries and excludes killed/nested rows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-ps-db-'));
  const dbPath = join(dir, 'conversation_summaries.db');
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT,
        status TEXT,
        project_id TEXT,
        workspace_uris TEXT,
        not_fully_idle INTEGER,
        nesting_depth INTEGER,
        killed INTEGER,
        last_modified_time TEXT
      );
      CREATE TABLE conversations_fts (conversation_id TEXT, archived INTEGER);
      INSERT INTO conversation_summaries VALUES
        ('top-1', '#12 真实会话', 'CASCADE_RUN_STATUS_IDLE', '', '[]', 0, 0, 0, '2026-11-15 12:00:00+00:00'),
        ('sub-1', '子Agent', 'CASCADE_RUN_STATUS_IDLE', '', '[]', 0, 1, 0, '2026-11-15 12:00:00+00:00'),
        ('kill-1', '已清理', 'CASCADE_RUN_STATUS_IDLE', '', '[]', 0, 0, 1, '2026-11-15 12:00:00+00:00'),
        ('arch-1', '已归档', 'CASCADE_RUN_STATUS_IDLE', '', '[]', 0, 0, 0, '2026-11-15 12:00:00+00:00');
      INSERT INTO conversations_fts VALUES ('arch-1', 1);
    `);
    db.close();

    const collector = new SidebarCollector({
      conversationsDb: dbPath,
      pluginConfig: join(dir, 'missing-config.json'),
    });
    const { rows, archivedIds } = collector.readConversationsFromDb();
    assert.deepEqual(rows.map(r => r.conversation_id), ['top-1', 'arch-1']);
    assert.equal(archivedIds.has('arch-1'), true);

    const db2 = new DatabaseSync(dbPath);
    db2.exec('ALTER TABLE conversation_summaries ADD COLUMN last_user_input_time TEXT');
    db2.exec("UPDATE conversation_summaries SET last_user_input_time = '2026-11-15 11:55:00+00:00' WHERE conversation_id = 'top-1'");
    db2.close();
    const res2 = collector.readConversationsFromDb();
    const snap = buildSidebarSnapshot({ rows: res2.rows, archivedIds: res2.archivedIds });
    const top1 = snap.conversations.find(c => c.id === 'top-1');
    assert.ok(top1 && top1.userInputAtMs > 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('PreferencesStore validates, atomically persists, and patches requirementOverrides', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-ps-reqov-'));
  const prefsPath = join(dir, 'preferences.json');
  try {
    const store = new PreferencesStore(prefsPath);
    const initial = await store.get();
    assert.deepEqual(initial.requirementOverrides, {});
    assert.deepEqual(DEFAULT_PREFERENCES.requirementOverrides, {});

    const saved = await store.set({
      language: 'en',
      requirementOverrides: {
        'conv-1': { key: '  COC-4  ', label: '  COC-4   OpenViking插件  ' },
        'conv-2': { key: 'Issue 17', label: 'Issue 17 兼容' },
        'conv-inbox': { key: 'INBOX', label: 'ignored' },
        'bad-empty-label': { key: 'COC-9', label: '   ' },
        'bad-type': 'not-an-object',
        '': { key: 'COC-1', label: 'missing-id' },
      },
    });
    assert.equal(saved.language, 'en');
    assert.deepEqual(saved.requirementOverrides, {
      'conv-1': { key: 'COC-4', label: 'COC-4 OpenViking插件' },
      'conv-2': { key: 'Issue 17', label: 'Issue 17 兼容' },
      'conv-inbox': { key: 'INBOX', label: '' },
    });

    const patched = await store.patchRequirementOverrides(
      { 'conv-3': { key: 'MUL-797', label: 'MUL-797 通用Runner' }, 'conv-2': null },
      { remove: ['conv-inbox'] },
    );
    assert.deepEqual(patched.requirementOverrides, {
      'conv-1': { key: 'COC-4', label: 'COC-4 OpenViking插件' },
      'conv-3': { key: 'MUL-797', label: 'MUL-797 通用Runner' },
    });

    const disk = JSON.parse(readFileSync(prefsPath, 'utf8'));
    assert.deepEqual(disk.requirementOverrides, patched.requirementOverrides);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('buildSidebarSnapshot enforces strict 3-tier resolution (overrides > title > convgroup) and scoping', () => {
  const rawProjects = [
    { id: 'p-coco', name: 'cocoyuworkspace', projectResources: { resources: [{ gitFolder: { folderUri: 'file:///tmp/ws/cocoyuworkspace' } }] } },
    { id: 'p-side', name: 'agy-project-sidebar', projectResources: { resources: [{ gitFolder: { folderUri: 'file:///tmp/ws/agy-project-sidebar' } }] } },
  ];
  const rows = [
    // Tier 1 overrides Tier 2 title (Issue 99) and Tier 3 group_id, and merges cross-project COC-4
    { conversation_id: 'ov-1', title: '1115 | 功能 | Issue 99 旧标题', group_id: 'convgroup:legacy', project_id: 'p-coco', workspace_uris: '[]', last_modified_time: '2026-11-20 10:00:00+00:00' },
    { conversation_id: 'ov-2', title: 'Investigate sidecar auth', group_id: '', project_id: 'p-side', workspace_uris: '[]', last_modified_time: '2026-11-20 09:00:00+00:00' },
    // Tier 1 per-project Issue 17 stays isolated per project
    { conversation_id: 'iss-p1', title: 'Chat in coco', project_id: 'p-coco', workspace_uris: '[]', last_modified_time: '2026-11-20 08:30:00+00:00' },
    { conversation_id: 'iss-p2', title: 'Chat in sidebar', project_id: 'p-side', workspace_uris: '[]', last_modified_time: '2026-11-20 08:20:00+00:00' },
    // Tier 2 title Issue wins over Tier 3 group_id
    { conversation_id: 't2-1', title: '1120 | 修复 | Issue 17 兼容修复', group_id: 'convgroup:other', project_id: 'p-side', workspace_uris: '[]', last_modified_time: '2026-11-20 08:10:00+00:00' },
    // Tier 3 group_id fallback catches ungrouped chats & singleton theme-candidates
    { conversation_id: 'g3-1', title: '1120 | 分析 | 单独调研话题', group_id: 'convgroup:native-sync', project_id: 'p-coco', workspace_uris: '[]', last_modified_time: '2026-11-20 07:30:00+00:00' },
    { conversation_id: 'g3-2', title: 'Untitled chat', group_id: 'convgroup:native-sync', project_id: 'p-side', workspace_uris: '[]', last_modified_time: '2026-11-20 07:00:00+00:00' },
    // Tier 1 INBOX override beats Tier 2 title & Tier 3 group_id
    { conversation_id: 'inb-1', title: '1120 | 修复 | COC-4 强制回Inbox', group_id: 'convgroup:native-sync', project_id: 'p-coco', workspace_uris: '[]', last_modified_time: '2026-11-20 06:00:00+00:00' },
  ];

  const snap = buildSidebarSnapshot({
    rawProjects,
    rows,
    requirementOverrides: {
      'ov-1': { key: 'COC-4', label: 'COC-4 统一需求组' },
      'ov-2': { key: 'ISSUE:COC-4', label: 'COC-4 统一需求组' },
      'iss-p1': { key: 'Issue 17', label: 'Issue 17 Coco' },
      'iss-p2': { key: 'Issue 17', label: 'Issue 17 Sidebar' },
      'inb-1': { key: 'INBOX', label: '' },
    },
  });
  const byId = Object.fromEntries(snap.conversations.map(c => [c.id, c]));

  assert.equal(byId['ov-1'].reqKey, 'ISSUE:COC-4');
  assert.equal(byId['ov-2'].reqKey, 'ISSUE:COC-4');
  assert.equal(byId['ov-1'].reqCount, 2);
  assert.equal(byId['ov-1'].reqLabel, 'COC-4 统一需求组');
  assert.equal(byId['ov-1'].reqSource, 'override');

  assert.equal(byId['iss-p1'].reqKey, 'p-coco::ISSUE:17');
  assert.equal(byId['iss-p1'].reqCount, 1);
  assert.equal(byId['iss-p2'].reqKey, 'p-side::ISSUE:17');
  assert.equal(byId['t2-1'].reqKey, 'p-side::ISSUE:17');
  assert.equal(byId['iss-p2'].reqCount, 2);
  assert.equal(byId['iss-p2'].reqLabel, 'Issue 17 Sidebar');
  assert.equal(byId['t2-1'].reqSource, 'title');

  assert.equal(byId['g3-1'].reqKey, 'convgroup:native-sync');
  assert.equal(byId['g3-2'].reqKey, 'convgroup:native-sync');
  assert.equal(byId['g3-1'].reqKind, 'convgroup');
  assert.equal(byId['g3-1'].reqSource, 'group_id');
  assert.equal(byId['g3-1'].reqCount, 2);

  assert.equal(byId['inb-1'].reqKey, 'INBOX');
  assert.equal(byId['inb-1'].reqKind, 'inbox');
  assert.equal(byId['inb-1'].reqSource, 'override');

  const assigned = assignRequirements(
    [{ id: 'x1', title: '1120 | 设计 | Q137 延时分析', projectKey: 'p-coco' }],
    { requirementOverrides: {} },
  );
  assert.equal(assigned[0].reqKey, 'ISSUE:Q137');
});

test('SidebarCollector reads group_id from SQLite and live requirementOverrides from preferences.json', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-ps-col-ov-'));
  const dbPath = join(dir, 'conversation_summaries.db');
  const prefsPath = join(dir, 'preferences.json');
  try {
    const db = new DatabaseSync(dbPath);
    db.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT,
        status TEXT,
        project_id TEXT,
        workspace_uris TEXT,
        not_fully_idle INTEGER,
        nesting_depth INTEGER,
        killed INTEGER,
        last_modified_time TEXT,
        group_id TEXT
      );
      INSERT INTO conversation_summaries VALUES
        ('c-ov', 'Uncategorized chat', 'CASCADE_RUN_STATUS_IDLE', 'p1', '["file:///tmp/ws/p1"]', 0, 0, 0, '2026-11-20 10:00:00+00:00', 'convgroup:alpha'),
        ('c-cg', 'Another chat', 'CASCADE_RUN_STATUS_IDLE', 'p1', '["file:///tmp/ws/p1"]', 0, 0, 0, '2026-11-20 09:00:00+00:00', 'convgroup:alpha');
    `);
    db.close();

    writeFileSync(prefsPath, JSON.stringify({
      requirementOverrides: { 'c-ov': { key: 'MUL-900', label: 'MUL-900 Sidecar Override' } },
    }));

    const collector = new SidebarCollector({
      conversationsDb: dbPath,
      preferences: prefsPath,
      pluginConfig: join(dir, 'missing-config.json'),
    });
    collector.fetchProjectsCached = async () => ({ fetchedAt: Date.now(), rawProjects: [], sidecarProjectIds: new Set() });

    const snap1 = await collector.snapshot();
    const m1 = Object.fromEntries(snap1.conversations.map(c => [c.id, c]));
    assert.equal(m1['c-ov'].reqKey, 'ISSUE:MUL-900');
    assert.equal(m1['c-ov'].reqSource, 'override');
    assert.equal(m1['c-cg'].reqKey, 'convgroup:alpha');
    assert.equal(m1['c-cg'].reqSource, 'group_id');

    // Updating preferences.json invalidates snapshot cache automatically even without force=true
    writeFileSync(prefsPath, JSON.stringify({ requirementOverrides: {} }));
    const snap2 = await collector.snapshot();
    const m2 = Object.fromEntries(snap2.conversations.map(c => [c.id, c]));
    assert.equal(m2['c-ov'].reqKey, 'convgroup:alpha');
    assert.equal(m2['c-ov'].reqCount, 2);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

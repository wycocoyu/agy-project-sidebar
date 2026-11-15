import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  buildSidebarSnapshot,
  extractRequirementDescriptor,
  filterRealProjects,
  SidebarCollector,
} from '../sidecars/panel/collector.mjs';

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

test('extractRequirementDescriptor recognizes issue IDs without misclassifying tech tokens', () => {
  assert.equal(extractRequirementDescriptor('1115 | 设计 | MUL-797 通用Runner实现').key, 'ISSUE:MUL-797');
  assert.equal(extractRequirementDescriptor('#41 优化需求文件夹视觉区分度').key, 'ISSUE:#41');
  assert.equal(extractRequirementDescriptor('Q137 排查线上延时').key, 'ISSUE:Q137');

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
      project_id: 'outside-of-project',
      workspace_uris: '["file:///tmp/unrelated"]',
      last_modified_time: '2026-11-15 08:00:00+00:00',
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

  assert.equal(snap.stats.totalConversations, 3);
  assert.equal(snap.stats.runningCount, 1);

  const byId = Object.fromEntries(snap.conversations.map(c => [c.id, c]));
  assert.equal(byId.c1.projectKey, 'p-ark-sub');
  assert.equal(byId.c1.reqKey, 'THEME:通用runner实现');
  assert.equal(byId.c2.reqKey, 'THEME:通用runner实现');
  assert.equal(byId.c3.isUnassigned, true);
  assert.equal(byId.c3.reqKey, 'INBOX');
  assert.equal(byId['c4-archived'], undefined);
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
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

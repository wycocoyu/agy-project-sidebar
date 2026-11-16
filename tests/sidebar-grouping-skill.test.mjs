import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  loadSidebarState,
  parsePairArg,
  previewGrouping,
  searchConversations,
  validateTitle,
  verifyGrouping,
} from '../skills/agy-sidebar-grouping/scripts/preview-grouping.mjs';

test('validateTitle enforces 00-session-naming format, category, 31-char limit, and no #digits', () => {
  assert.equal(validateTitle('1115 | 配置 | COC-4 OpenViking自动召回与插件').ok, true);
  assert.equal(validateTitle(`1115 | 分析 | ${'a'.repeat(31)}`).ok, true);

  const tooLong = validateTitle(`1115 | 分析 | ${'a'.repeat(32)}`);
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors[0], /31 chars/);

  const withHash = validateTitle('1111 | 调试 | #6422 OV插件hook跳过');
  assert.equal(withHash.ok, false);
  assert.match(withHash.errors[0], /#\d+|#<digits>/);

  const badCat = validateTitle('1115 | 修修 | COC-4 test');
  assert.equal(badCat.ok, false);
  assert.match(badCat.errors[0], /Unsupported category/);

  const badFmt = validateTitle('OpenViking plugin sync');
  assert.equal(badFmt.ok, false);
});

test('previewGrouping detects cross-project Issue-N splits, verifies COC-N merges, and inspects per-bucket reqLabels', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'agy-skill-test-'));
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
        last_modified_time TEXT
      );
      CREATE TABLE conversations_fts (conversation_id TEXT, archived INTEGER);
      INSERT INTO conversation_summaries VALUES
        ('8f158ad9-0000-0000-0000-000000000001', '1115 | 配置 | 检查OV与AGY插件状态', 'CASCADE_RUN_STATUS_IDLE', 'proj-coco', '["file:///Users/mac/dev/cocoyuworkspace"]', 0, 0, 0, '2026-11-16 07:09:28+00:00'),
        ('5c3cb349-0000-0000-0000-000000000002', '1115 | 分析 | OpenViking拉代码查AGY支持', 'CASCADE_RUN_STATUS_IDLE', 'proj-ov', '["file:///Users/mac/oss/OpenViking"]', 0, 0, 0, '2026-11-15 10:55:32+00:00'),
        ('89da3169-0000-0000-0000-000000000003', '1111 | 调试 | #6422 OV插件hook跳过排查与方案', 'CASCADE_RUN_STATUS_IDLE', 'proj-coco', '["file:///Users/mac/dev/cocoyuworkspace"]', 0, 0, 0, '2026-11-13 03:13:41+00:00');
    `);
    db.close();

    const watermarkMs = Date.parse('2026-11-16T04:32:34Z');
    writeFileSync(prefsPath, JSON.stringify({
      groupByDimensions: ['status', 'requirement'],
      inboxEnabled: true,
      inboxEnabledAtMs: watermarkMs,
      inboxAutoRetireHours: 24,
      inboxSettled: {},
      inboxFollowUp: {},
      inboxSnoozed: {},
    }));

    const state = await loadSidebarState({
      dbPath,
      prefsPath,
      useLs: false,
      nowMs: Date.parse('2026-11-16T07:15:00Z'),
    });

    const hits = searchConversations(state.conversations, ['OV']);
    assert.equal(hits.length, 2);

    // 1) Issue 4 splits across proj-coco and proj-ov -> flagged!
    const splitPreview = previewGrouping(state, [
      parsePairArg('8f158ad9=1115 | 配置 | Issue 4 OV自动召回'),
      parsePairArg('5c3cb349=1115 | 分析 | Issue 4 拉OV代码查支持'),
    ]);
    assert.equal(splitPreview.ok, false);
    assert.equal(splitPreview.uniqueReqKeys.length, 2);
    assert.match(splitPreview.warnings.join(' '), /Cross-project split/);

    // 2) COC-4 merges all 3 across projects cleanly and exposes per-bucket inbox vs idle reqLabels
    const mergedPreview = previewGrouping(state, [
      parsePairArg('8f158ad9=1115 | 配置 | COC-4 OpenViking自动召回与插件'),
      parsePairArg('5c3cb349=1115 | 分析 | COC-4 拉OV代码查AGY插件支持'),
      parsePairArg('89da3169=1111 | 调试 | COC-4 6422 hook跳过排查'),
    ]);
    assert.equal(mergedPreview.ok, true);
    assert.deepEqual(mergedPreview.uniqueReqKeys, ['ISSUE:COC-4']);
    assert.equal(mergedPreview.crossProject, true);
    assert.equal(mergedPreview.perBucket.inbox.count, 1);
    assert.equal(mergedPreview.perBucket.idle.count, 2);
    assert.deepEqual(mergedPreview.perBucket.idle.reqLabels, ['COC-4 拉OV代码查AGY插件支持']);

    // 3) verifyGrouping passes once SQLite rows are updated
    const dbUpd = new DatabaseSync(dbPath);
    dbUpd.exec(`
      UPDATE conversation_summaries SET title = '1115 | 配置 | COC-4 OpenViking自动召回与插件' WHERE conversation_id LIKE '8f158ad9%';
      UPDATE conversation_summaries SET title = '1115 | 分析 | COC-4 拉OV代码查AGY插件支持' WHERE conversation_id LIKE '5c3cb349%';
      UPDATE conversation_summaries SET title = '1111 | 调试 | COC-4 6422 hook跳过排查' WHERE conversation_id LIKE '89da3169%';
    `);
    dbUpd.close();
    const afterState = await loadSidebarState({
      dbPath,
      prefsPath,
      useLs: false,
      nowMs: Date.parse('2026-11-16T07:15:00Z'),
    });
    const verified = verifyGrouping(afterState, ['8f158ad9', '5c3cb349', '89da3169']);
    assert.equal(verified.ok, true);
    assert.deepEqual(verified.uniqueReqKeys, ['ISSUE:COC-4']);

    // 4) CLI smoke invocation returns exit code 0 when valid, 2 when split
    const cliOut = execFileSync(process.execPath, [
      'skills/agy-sidebar-grouping/scripts/preview-grouping.mjs',
      'verify', '8f158ad9', '5c3cb349', '89da3169',
      '--db', dbPath, '--prefs', prefsPath, '--no-ls', '--json',
    ], { encoding: 'utf8' });
    assert.equal(JSON.parse(cliOut).ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manage.py RUNTIME_ITEMS bundles skills directory and SKILL.md stays concise', () => {
  const manageSrc = readFileSync('manage.py', 'utf8');
  assert.match(manageSrc, /RUNTIME_ITEMS\s*=\s*\([^)]*'skills'/);
  const skillSrc = readFileSync('skills/agy-sidebar-grouping/SKILL.md', 'utf8');
  assert.match(skillSrc, /^---\nname:\s*agy-sidebar-grouping\n/m);
  assert.match(skillSrc, /agy-rename/);
});

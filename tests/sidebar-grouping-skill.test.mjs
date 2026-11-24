import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  applyGrouping,
  clearGroupingOverrides,
  loadSidebarState,
  parseOverrideSpec,
  previewGrouping,
  searchConversations,
  summarizeSearchFragmentation,
  validateOverrideEntry,
  validateTitle,
  verifyGrouping,
} from '../skills/agy-sidebar-grouping/scripts/preview-grouping.mjs';

test('validateTitle and validateOverrideEntry validate formats cleanly', () => {
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

  assert.equal(validateOverrideEntry({ key: 'COC-4', label: 'COC-4 OpenViking' }).ok, true);
  assert.equal(validateOverrideEntry({ key: 'INBOX', label: '' }).ok, true);
  assert.equal(validateOverrideEntry({ key: '', label: 'missing key' }).ok, false);
  assert.equal(validateOverrideEntry({ key: 'COC-4', label: '   ' }).ok, false);
});

test('previewGrouping, applyGrouping, verifyGrouping, and clear write Sidecar overrides without touching SQLite', async () => {
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
        last_modified_time TEXT,
        group_id TEXT
      );
      CREATE TABLE conversations_fts (conversation_id TEXT, archived INTEGER);
      INSERT INTO conversation_summaries VALUES
        ('8f158ad9-0000-0000-0000-000000000001', '1115 | 配置 | 检查OV与AGY插件状态', 'CASCADE_RUN_STATUS_IDLE', 'proj-coco', '["file:///Users/mac/dev/cocoyuworkspace"]', 0, 0, 0, '2026-11-16 07:09:28+00:00', ''),
        ('5c3cb349-0000-0000-0000-000000000002', '1115 | 分析 | OpenViking拉代码查AGY支持', 'CASCADE_RUN_STATUS_IDLE', 'proj-ov', '["file:///Users/mac/oss/OpenViking"]', 0, 0, 0, '2026-11-15 10:55:32+00:00', ''),
        ('89da3169-0000-0000-0000-000000000003', 'Investigate OV hook skip without standard title', 'CASCADE_RUN_STATUS_IDLE', 'proj-coco', '["file:///Users/mac/dev/cocoyuworkspace"]', 0, 0, 0, '2026-11-13 03:13:41+00:00', 'convgroup:fallback-only');
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

    // Multi-alias OR search catches both "OV" and "OpenViking" across projects and flags fragmentation
    const aliasHits = searchConversations(state.conversations, ['OV', 'OpenViking']);
    assert.equal(aliasHits.length, 3);
    assert.equal(summarizeSearchFragmentation(aliasHits).fragmented, true);
    assert.equal(summarizeSearchFragmentation(aliasHits).ungroupedCount, 2);
    assert.equal(searchConversations(state.conversations, ['OV', 'OpenViking'], 25, { matchAll: true }).length, 0);

    // Tier 3 group_id fallback surfaces when neither override nor title matches
    const cgHit = state.conversations.find(c => c.id.startsWith('89da3169'));
    assert.equal(cgHit.reqKey, 'convgroup:fallback-only');
    assert.equal(cgHit.reqSource, 'group_id');

    // 1) Issue 4 splits across proj-coco and proj-ov -> flagged and blocked!
    const splitPreview = previewGrouping(state, [
      parseOverrideSpec('8f158ad9=Issue 4|Issue 4 OV自动召回'),
      parseOverrideSpec('5c3cb349=Issue 4|Issue 4 拉OV代码查支持'),
    ]);
    assert.equal(splitPreview.ok, false);
    assert.equal(splitPreview.uniqueReqKeys.length, 2);
    assert.match(splitPreview.warnings.join(' '), /Cross-project split/);
    assert.equal('readyCommands' in splitPreview, false);

    // 2) COC-4 merges all 3 across projects cleanly via Sidecar requirementOverrides
    const mergedPreview = previewGrouping(state, [
      parseOverrideSpec('8f158ad9=COC-4|COC-4 OpenViking自动召回与插件'),
      parseOverrideSpec('5c3cb349=COC-4|COC-4 拉OV代码查AGY插件支持'),
      parseOverrideSpec('89da3169=COC-4|COC-4 hook跳过排查'),
    ]);
    assert.equal(mergedPreview.ok, true);
    assert.deepEqual(mergedPreview.uniqueReqKeys, ['ISSUE:COC-4']);
    assert.equal(mergedPreview.crossProject, true);
    assert.equal(mergedPreview.perBucket.inbox.count, 1);
    assert.equal(mergedPreview.perBucket.idle.count, 2);
    assert.deepEqual(mergedPreview.perBucket.idle.reqLabels, ['COC-4 拉OV代码查AGY插件支持']);

    // 3) applyGrouping persists requirementOverrides to preferences.json WITHOUT modifying SQLite titles or timestamps
    const applied = await applyGrouping(state, [
      { idQuery: '8f158ad9', key: 'COC-4', label: 'COC-4 OpenViking自动召回与插件' },
      { idQuery: '5c3cb349', key: 'COC-4', label: 'COC-4 OpenViking自动召回与插件' },
      { idQuery: '89da3169', key: 'COC-4', label: 'COC-4 OpenViking自动召回与插件' },
    ]);
    assert.equal(applied.ok, true);
    assert.equal(applied.appliedCount, 3);
    assert.equal(applied.verified.ok, true);
    assert.deepEqual(applied.verified.uniqueReqKeys, ['ISSUE:COC-4']);
    assert.equal(applied.verified.items.every(i => i.reqSource === 'override'), true);

    // Verify SQLite titles & last_modified_time were completely untouched
    const dbCheck = new DatabaseSync(dbPath, { open: true, readOnly: true });
    const rows = dbCheck.prepare('SELECT conversation_id, title, last_modified_time FROM conversation_summaries ORDER BY conversation_id').all();
    dbCheck.close();
    assert.deepEqual(rows.map(r => [r.conversation_id.slice(0, 8), r.title, r.last_modified_time]), [
      ['5c3cb349', '1115 | 分析 | OpenViking拉代码查AGY支持', '2026-11-15 10:55:32+00:00'],
      ['89da3169', 'Investigate OV hook skip without standard title', '2026-11-13 03:13:41+00:00'],
      ['8f158ad9', '1115 | 配置 | 检查OV与AGY插件状态', '2026-11-16 07:09:28+00:00'],
    ]);

    // 4) CLI invocation: apply -> verify (exit 0), split check (exit 2), clear -> verify
    const cliOut = execFileSync(process.execPath, [
      'skills/agy-sidebar-grouping/scripts/preview-grouping.mjs',
      'verify', '8f158ad9', '5c3cb349', '89da3169',
      '--db', dbPath, '--prefs', prefsPath, '--no-ls', '--json',
    ], { encoding: 'utf8' });
    assert.equal(JSON.parse(cliOut).ok, true);

    const cliApply = execFileSync(process.execPath, [
      'skills/agy-sidebar-grouping/scripts/preview-grouping.mjs',
      'apply', '--key', 'MUL-42', '--label', 'MUL-42 CLI Override',
      '8f158ad9', '5c3cb349',
      '--db', dbPath, '--prefs', prefsPath, '--no-ls', '--json',
    ], { encoding: 'utf8' });
    assert.equal(JSON.parse(cliApply).verified.uniqueReqKeys[0], 'ISSUE:MUL-42');

    let splitExitCode = 0;
    try {
      execFileSync(process.execPath, [
        'skills/agy-sidebar-grouping/scripts/preview-grouping.mjs',
        'check', '--key', 'Issue 4', '--label', 'Issue 4 Split',
        '8f158ad9', '5c3cb349',
        '--db', dbPath, '--prefs', prefsPath, '--no-ls', '--json',
      ], { encoding: 'utf8' });
    } catch (err) {
      splitExitCode = err.status;
    }
    assert.equal(splitExitCode, 2);

    const cleared = await clearGroupingOverrides(
      await loadSidebarState({ dbPath, prefsPath, useLs: false }),
      ['89da3169'],
    );
    assert.deepEqual(cleared.removedIds, ['89da3169-0000-0000-0000-000000000003']);
    const afterClear = await loadSidebarState({ dbPath, prefsPath, useLs: false });
    assert.equal(afterClear.conversations.find(c => c.id.startsWith('89da3169')).reqKey, 'convgroup:fallback-only');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('manage.py RUNTIME_ITEMS bundles skills directory and SKILL.md uses requirementOverrides without agy-rename', () => {
  const manageSrc = readFileSync('manage.py', 'utf8');
  assert.match(manageSrc, /RUNTIME_ITEMS\s*=\s*\([^)]*'skills'/);
  const skillSrc = readFileSync('skills/agy-sidebar-grouping/SKILL.md', 'utf8');
  assert.match(skillSrc, /^---\nname:\s*agy-sidebar-grouping\n/m);
  assert.match(skillSrc, /requirementOverrides/);
  assert.match(skillSrc, /preview-grouping\.mjs apply/);
  assert.equal(/agy-rename/.test(skillSrc), false);
});

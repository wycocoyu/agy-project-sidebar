#!/usr/bin/env node
/**
 * Read-only search, preflight validation, and verification helper for
 * organizing Antigravity conversations into unified sidebar requirement groups.
 *
 * Reuses SidebarCollector, compat/sidebar-widget.cjs, and PreferencesStore
 * directly so grouping predictions match live sidebar behavior.
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { platformPaths } from '../../../compat/platform.mjs';
import { PreferencesStore } from '../../../compat/preferences.mjs';
import { buildSidebarSnapshot, SidebarCollector } from '../../../sidecars/panel/collector.mjs';

const require = createRequire(import.meta.url);
const mountSidebarWidget = require('../../../compat/sidebar-widget.cjs');
const widgetTestApi = mountSidebarWidget({ __unitTestOnly: true });

export const ALLOWED_CATEGORIES = new Set([
  '功能', '设计', '整改', '优化', '发布', '分析', '文档', '调试', '配置', '杂项',
]);

const TITLE_RE = /^(\d{4}) \| ([^|]+?) \| (.+)$/;
const HASH_ISSUE_RE = /#\d+/;

/** Validate an Antigravity conversation title against 00-session-naming rules. */
export function validateTitle(title) {
  const clean = String(title || '').trim();
  const errors = [];
  const match = clean.match(TITLE_RE);
  if (!match) {
    errors.push('Must match "<MMDD> | <分类> | <主题>"');
    return { ok: false, mmdd: '', category: '', topic: clean, topicLength: clean.length, errors };
  }
  const [, mmdd, rawCategory, topic] = match;
  const category = rawCategory.trim();
  if (!ALLOWED_CATEGORIES.has(category)) {
    errors.push(`Unsupported category "${category}"`);
  }
  if (topic.length > 31) {
    errors.push(`Topic exceeds 31 chars (${topic.length})`);
  }
  if (HASH_ISSUE_RE.test(topic)) {
    errors.push('Topic must not contain "#<digits>"');
  }
  return {
    ok: errors.length === 0,
    mmdd,
    category,
    topic,
    topicLength: topic.length,
    errors,
  };
}

/** Convert PreferencesStore JSON keys into classifyInboxConversation options. */
export function toInboxModel(prefs = {}) {
  return {
    enabled: prefs.inboxEnabled !== false,
    enabledAtMs: Number(prefs.inboxEnabledAtMs || 0),
    autoRetireHours: Number(prefs.inboxAutoRetireHours ?? 24),
    settled: prefs.inboxSettled || {},
    followUp: prefs.inboxFollowUp || {},
    snoozed: prefs.inboxSnoozed || {},
  };
}

/** Parse "<idOrPrefix>=<newTitle>" safely on the first "=". */
export function parsePairArg(spec) {
  const idx = String(spec || '').indexOf('=');
  if (idx <= 0 || idx === spec.length - 1) {
    throw new Error(`Invalid pair "${spec}"; expected "<uuid_or_prefix>=<MMDD | 分类 | 主题>"`);
  }
  return {
    idQuery: spec.slice(0, idx).trim(),
    title: spec.slice(idx + 1).trim(),
  };
}

/** Resolve full UUID or unambiguous prefix inside a conversation list. */
export function resolveConversationId(conversations, idOrPrefix) {
  const q = String(idOrPrefix || '').trim().toLowerCase();
  if (!q) throw new Error('Empty conversation ID selector');
  const exact = conversations.find(c => c.id.toLowerCase() === q);
  if (exact) return exact.id;
  const prefixed = conversations.filter(c => c.id.toLowerCase().startsWith(q));
  if (prefixed.length === 1) return prefixed[0].id;
  if (prefixed.length > 1) {
    throw new Error(`Ambiguous ID prefix "${idOrPrefix}" matched ${prefixed.length} conversations`);
  }
  throw new Error(`Conversation "${idOrPrefix}" not found in DB`);
}

/** Synthesize minimal project descriptors from SQLite rows when offline. */
function deriveFallbackProjectsFromRows(rows) {
  const byId = new Map();
  for (const row of rows || []) {
    const id = String(row.project_id || '').trim();
    if (!id || byId.has(id)) continue;
    let uri = '';
    try {
      const parsed = typeof row.workspace_uris === 'string' ? JSON.parse(row.workspace_uris) : row.workspace_uris;
      if (Array.isArray(parsed) && parsed[0]) uri = String(parsed[0]);
    } catch { /* ignore malformed workspace_uris */ }
    const rawSeg = uri ? uri.split('/').filter(Boolean).pop() || '' : '';
    let folderName = rawSeg;
    try {
      folderName = decodeURIComponent(rawSeg);
    } catch { /* keep raw segment */ }
    byId.set(id, {
      id,
      name: folderName || id.slice(0, 8),
      projectResources: { resources: uri ? [{ gitFolder: { folderUri: uri } }] : [] },
    });
  }
  return [...byId.values()];
}

/** Load live or offline snapshot + preferences + widget grouping annotations. */
export async function loadSidebarState({
  dbPath,
  prefsPath,
  rawProjects,
  useLs = true,
  showArchived = false,
  nowMs = Date.now(),
} = {}) {
  const defaults = platformPaths();
  const paths = {
    ...defaults,
    ...(dbPath ? { conversationsDb: dbPath } : {}),
    ...(prefsPath ? { preferences: prefsPath } : {}),
  };
  const collector = new SidebarCollector(paths);
  const prefs = await new PreferencesStore(paths.preferences).get();

  let snapshot;
  if (useLs && !rawProjects) {
    snapshot = await collector.snapshot({ force: true, showArchived });
  } else {
    const { rows, archivedIds } = collector.readConversationsFromDb();
    snapshot = buildSidebarSnapshot({
      rawProjects: rawProjects || deriveFallbackProjectsFromRows(rows),
      rows,
      archivedIds,
      showArchived,
    });
  }

  const inboxModel = toInboxModel(prefs);
  const assigned = widgetTestApi.assignRequirements(snapshot.conversations || []);
  const enriched = assigned.map(conv => ({
    ...conv,
    bucket: widgetTestApi.classifyInboxConversation(conv, inboxModel, nowMs).bucket,
    updatedIso: conv.updatedAtMs ? new Date(conv.updatedAtMs).toISOString() : '',
  }));

  return { paths, prefs, inboxModel, nowMs, conversations: enriched };
}

/** Search conversations matching all query terms across title, project, repo, ID, or req label. */
export function searchConversations(conversations, terms = [], limit = 25) {
  const cleanTerms = terms.map(t => String(t || '').trim().toLowerCase()).filter(Boolean);
  const matched = cleanTerms.length === 0
    ? conversations
    : conversations.filter(c => {
        const haystack = [c.id, c.title, c.projectName, c.repoName, c.reqKey, c.reqLabel].join(' ').toLowerCase();
        return cleanTerms.every(term => haystack.includes(term));
      });
  return matched.slice(0, Math.max(1, limit)).map(c => ({
    id: c.id,
    shortId: c.id.slice(0, 8),
    title: c.title,
    projectKey: c.projectKey,
    projectName: c.projectName || c.repoName || 'unassigned',
    statusGroup: c.statusGroup,
    bucket: c.bucket,
    reqKey: c.reqKey,
    reqLabel: c.reqLabel,
    updatedIso: c.updatedIso,
  }));
}

/** Group items inside each status bucket and compute bucket-specific reqLabels. */
function summarizePerBucket(baseConvs, targetIdSet, inboxModel, nowMs) {
  const byBucket = new Map();
  for (const conv of baseConvs) {
    const bucket = widgetTestApi.classifyInboxConversation(conv, inboxModel, nowMs).bucket;
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(conv);
  }
  const perBucket = {};
  for (const [bucket, list] of byBucket.entries()) {
    const scoped = widgetTestApi.assignRequirements(list);
    const targetsHere = scoped.filter(c => targetIdSet.has(c.id));
    if (!targetsHere.length) continue;
    perBucket[bucket] = {
      count: targetsHere.length,
      reqKeys: [...new Set(targetsHere.map(c => c.reqKey))],
      reqLabels: [...new Set(targetsHere.map(c => c.reqLabel))],
      ids: targetsHere.map(c => c.id.slice(0, 8)),
    };
  }
  return perBucket;
}

/**
 * Simulate renaming a set of conversations and detect cross-project splits,
 * title validation issues, or bucket-level label hijacking BEFORE renaming.
 */
export function previewGrouping(state, pairs) {
  if (!Array.isArray(pairs) || pairs.length === 0) {
    throw new Error('Provide at least one conversation rename pair');
  }
  const overrideById = new Map();
  const titleChecks = [];
  for (const pair of pairs) {
    const fullId = resolveConversationId(state.conversations, pair.idQuery);
    const check = validateTitle(pair.title);
    overrideById.set(fullId, pair.title);
    titleChecks.push({ id: fullId, shortId: fullId.slice(0, 8), proposedTitle: pair.title, ...check });
  }

  const simulated = state.conversations.map(c => (
    overrideById.has(c.id) ? { ...c, title: overrideById.get(c.id) } : c
  ));
  const assignedAll = widgetTestApi.assignRequirements(simulated);
  const targets = assignedAll.filter(c => overrideById.has(c.id));
  const uniqueReqKeys = [...new Set(targets.map(c => c.reqKey))];
  const uniqueProjectKeys = [...new Set(targets.map(c => c.projectKey))];
  const targetIdSet = new Set(overrideById.keys());
  const perBucket = summarizePerBucket(simulated, targetIdSet, state.inboxModel, state.nowMs);

  const validTitles = titleChecks.every(t => t.ok);
  const singleGroup = uniqueReqKeys.length === 1 && !uniqueReqKeys[0]?.startsWith('INBOX');
  const warnings = [];
  if (!validTitles) warnings.push('One or more proposed titles violate 00-session-naming rules');
  if (uniqueReqKeys.length === 1 && uniqueReqKeys[0]?.startsWith('INBOX')) {
    warnings.push('Proposed titles resolved to INBOX instead of a requirement group (use "COC-4", "Issue 4", etc.)');
  }
  if (uniqueReqKeys.length > 1) {
    warnings.push(`Cross-project split detected (${uniqueReqKeys.length} groups): replace "Issue N"/"PR N"/bracket tag with a hyphenated prefix like "COC-4"`);
  }
  if (Object.keys(perBucket).length > 1 && perBucket.inbox) {
    warnings.push(`Sessions span ${Object.keys(perBucket).join(' + ')}; settle Inbox item(s) or switch Group By to merge them visually`);
  }

  return {
    ok: validTitles && singleGroup,
    groupByDimensions: state.prefs.groupByDimensions,
    uniqueReqKeys,
    overallReqLabel: targets[0]?.reqLabel || '',
    crossProject: uniqueProjectKeys.length > 1,
    perBucket,
    titleChecks,
    readyCommands: titleChecks.map(t => `agy-rename ${t.id} "${t.proposedTitle}"`),
    warnings,
  };
}

/** Inspect current live grouping state for a given list of existing session IDs. */
export function verifyGrouping(state, idSelectors) {
  if (!Array.isArray(idSelectors) || idSelectors.length === 0) {
    throw new Error('Provide at least one conversation ID or prefix to verify');
  }
  const fullIds = idSelectors.map(sel => resolveConversationId(state.conversations, sel));
  const targetSet = new Set(fullIds);
  const targets = state.conversations.filter(c => targetSet.has(c.id));
  const uniqueReqKeys = [...new Set(targets.map(c => c.reqKey))];
  const perBucket = summarizePerBucket(state.conversations, targetSet, state.inboxModel, state.nowMs);
  const items = targets.map(c => ({
    id: c.id,
    shortId: c.id.slice(0, 8),
    title: c.title,
    titleValid: validateTitle(c.title).ok,
    projectName: c.projectName || c.repoName || 'unassigned',
    bucket: c.bucket,
    reqKey: c.reqKey,
    reqLabel: c.reqLabel,
    updatedIso: c.updatedIso,
  }));
  return {
    ok: uniqueReqKeys.length === 1 && items.every(i => i.titleValid),
    groupByDimensions: state.prefs.groupByDimensions,
    uniqueReqKeys,
    perBucket,
    items,
  };
}

function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const pairs = [];
  const opts = { json: false, noLs: false, limit: 25, dbPath: undefined, prefsPath: undefined };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--no-ls') opts.noLs = true;
    else if (arg === '--limit') opts.limit = Number(rest[++i] || 25);
    else if (arg === '--db') opts.dbPath = rest[++i];
    else if (arg === '--prefs') opts.prefsPath = rest[++i];
    else if (arg === '--pair') pairs.push(parsePairArg(rest[++i]));
    else if (command === 'check' && arg.includes('=')) pairs.push(parsePairArg(arg));
    else positional.push(arg);
  }
  return { command, positional, pairs, opts };
}

function formatTextReport(command, result) {
  if (command === 'search') {
    if (result.length === 0) return 'No matching conversations found.';
    return result.map(r => (
      `${r.shortId} | ${r.bucket.padEnd(7)} | ${r.projectName} | ${r.reqKey} | ${r.title}`
    )).join('\n');
  }
  return JSON.stringify(result, null, 2);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, positional, pairs, opts } = parseCliArgs(argv);
  if (!command || command === '--help' || command === '-h') {
    console.log([
      'Usage:',
      '  preview-grouping.mjs search [terms...] [--limit 25] [--json]',
      '  preview-grouping.mjs check <idOrPrefix>=<newTitle> ... [--json]',
      '  preview-grouping.mjs verify <idOrPrefix> ... [--json]',
    ].join('\n'));
    return 0;
  }

  const state = await loadSidebarState({ dbPath: opts.dbPath, prefsPath: opts.prefsPath, useLs: !opts.noLs });
  let result;
  let exitCode = 0;

  if (command === 'search') {
    result = searchConversations(state.conversations, positional, opts.limit);
  } else if (command === 'check') {
    result = previewGrouping(state, pairs);
    if (!result.ok) exitCode = 2;
  } else if (command === 'verify') {
    result = verifyGrouping(state, positional);
    if (!result.ok) exitCode = 2;
  } else {
    throw new Error(`Unknown command "${command}"`);
  }

  console.log(opts.json ? JSON.stringify(result, null, 2) : formatTextReport(command, result));
  return exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then(code => {
    process.exitCode = code;
  }).catch(err => {
    console.error(`preview-grouping error: ${err.message}`);
    process.exitCode = 1;
  });
}

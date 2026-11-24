#!/usr/bin/env node
/**
 * Search, preflight validation, Sidecar override write, and verification helper
 * for organizing Antigravity conversations into unified sidebar requirement groups.
 *
 * Uses Sidecar requirementOverrides in preferences.json without mutating AGY
 * SQLite, .pbtxt, or last_modified_time (never calls agy-rename).
 */
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { platformPaths } from '../../../compat/platform.mjs';
import { parseRequirementOverrideEntry, PreferencesStore } from '../../../compat/preferences.mjs';
import { assignRequirements, buildSidebarSnapshot, SidebarCollector } from '../../../sidecars/panel/collector.mjs';

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

/** Validate a Sidecar requirementOverrides entry `{ key, label }`. */
export function validateOverrideEntry(entry) {
  const errors = [];
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return { ok: false, key: '', label: '', errors: ['Override entry must be an object'] };
  }
  const key = typeof entry.key === 'string' ? entry.key.replace(/\s+/g, ' ').trim() : '';
  const label = typeof entry.label === 'string' ? entry.label.replace(/\s+/g, ' ').trim() : '';
  if (!key) errors.push('Override key must be non-empty');
  else if (key.length > 160) errors.push(`Override key exceeds 160 chars (${key.length})`);
  if (key.toUpperCase() !== 'INBOX') {
    if (!label) errors.push('Override label must be non-empty');
    else if (label.length > 200) errors.push(`Override label exceeds 200 chars (${label.length})`);
  }
  const parsed = parseRequirementOverrideEntry({ key, label });
  if (!parsed && errors.length === 0) errors.push('Invalid requirementOverride entry');
  return {
    ok: errors.length === 0 && Boolean(parsed),
    key: parsed?.key || key,
    label: parsed?.label ?? label,
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

/** Parse "<idOrPrefix>=<key>[|<label>]" safely on the first "=" and optional "|". */
export function parseOverrideSpec(spec, fallbackLabel = '') {
  const raw = String(spec || '');
  const idx = raw.indexOf('=');
  if (idx <= 0 || idx === raw.length - 1) {
    throw new Error(`Invalid spec "${spec}"; expected "<uuid_or_prefix>=<key>[|<label>]"`);
  }
  const idQuery = raw.slice(0, idx).trim();
  const rhs = raw.slice(idx + 1).trim();
  const pipeIdx = rhs.indexOf('|');
  const key = (pipeIdx >= 0 ? rhs.slice(0, pipeIdx) : rhs).trim();
  const rawLabel = (pipeIdx >= 0 ? rhs.slice(pipeIdx + 1) : fallbackLabel).trim();
  const label = key.toUpperCase() === 'INBOX' ? '' : (rawLabel || key);
  return { idQuery, key, label };
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

/** Load live or offline snapshot + preferences + 3-tier requirement + inbox annotations. */
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
    snapshot = await collector.snapshot({
      force: true,
      showArchived,
      requirementOverrides: prefs.requirementOverrides || {},
    });
  } else {
    const { rows, archivedIds } = collector.readConversationsFromDb();
    snapshot = buildSidebarSnapshot({
      rawProjects: rawProjects || deriveFallbackProjectsFromRows(rows),
      rows,
      archivedIds,
      showArchived,
      requirementOverrides: prefs.requirementOverrides || {},
    });
  }

  const inboxModel = toInboxModel(prefs);
  const enriched = (snapshot.conversations || []).map(conv => ({
    ...conv,
    bucket: widgetTestApi.classifyInboxConversation(conv, inboxModel, nowMs).bucket,
    updatedIso: conv.updatedAtMs ? new Date(conv.updatedAtMs).toISOString() : '',
  }));

  return { paths, prefs, inboxModel, nowMs, conversations: enriched };
}

/**
 * Search conversations matching query terms across title, project, repo, ID, or req label.
 * Defaults to OR matching (ranked by hit count then recency) so alias terms like "OV OpenViking"
 * surface scattered related threads; pass { matchAll: true } for strict AND matching.
 */
export function searchConversations(conversations, terms = [], limit = 25, { matchAll = false } = {}) {
  const cleanTerms = terms.map(t => String(t || '').trim().toLowerCase()).filter(Boolean);
  let ranked;
  if (cleanTerms.length === 0) {
    ranked = conversations.map(c => ({ conv: c, score: 1 }));
  } else {
    ranked = [];
    for (const c of conversations) {
      const haystack = [c.id, c.title, c.projectName, c.repoName, c.reqKey, c.reqLabel, c.groupId].join(' ').toLowerCase();
      const hitCount = cleanTerms.filter(term => haystack.includes(term)).length;
      const matches = matchAll ? hitCount === cleanTerms.length : hitCount > 0;
      if (matches) ranked.push({ conv: c, score: hitCount });
    }
    ranked.sort((a, b) => (b.score - a.score) || ((b.conv.updatedAtMs || 0) - (a.conv.updatedAtMs || 0)));
  }
  return ranked.slice(0, Math.max(1, limit)).map(({ conv: c, score }) => ({
    id: c.id,
    shortId: c.id.slice(0, 8),
    title: c.title,
    projectKey: c.projectKey,
    projectName: c.projectName || c.repoName || 'unassigned',
    statusGroup: c.statusGroup,
    bucket: c.bucket,
    reqKey: c.reqKey,
    reqLabel: c.reqLabel,
    reqSource: c.reqSource || 'inbox',
    updatedIso: c.updatedIso,
    matchScore: score,
  }));
}

/** Summarize whether search results are already unified or fragmented across INBOX/groups/projects. */
export function summarizeSearchFragmentation(hits = []) {
  const ungroupedCount = hits.filter(h => !h.reqKey || h.reqKey === 'INBOX').length;
  const distinctReqKeys = [...new Set(hits.map(h => h.reqKey).filter(k => k && k !== 'INBOX'))];
  const distinctProjects = [...new Set(hits.map(h => h.projectKey || h.projectName).filter(Boolean))];
  const fragmented = hits.length >= 2 && (ungroupedCount > 0 || distinctReqKeys.length > 1 || distinctReqKeys.length === 0);
  return {
    totalHits: hits.length,
    ungroupedCount,
    distinctReqKeys,
    distinctProjects,
    fragmented,
  };
}

/** Group items inside each status bucket and compute bucket-specific reqLabels using 3-tier resolution. */
function summarizePerBucket(baseConvs, targetIdSet, inboxModel, nowMs, requirementOverrides = {}) {
  const byBucket = new Map();
  for (const conv of baseConvs) {
    const bucket = widgetTestApi.classifyInboxConversation(conv, inboxModel, nowMs).bucket;
    if (!byBucket.has(bucket)) byBucket.set(bucket, []);
    byBucket.get(bucket).push(conv);
  }
  const perBucket = {};
  for (const [bucket, list] of byBucket.entries()) {
    const scoped = assignRequirements(list, { requirementOverrides });
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
 * Simulate applying Sidecar requirementOverrides and detect cross-project splits,
 * invalid override entries, or bucket-level label splits BEFORE saving preferences.json.
 */
export function previewGrouping(state, specs) {
  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error('Provide at least one conversation override spec');
  }
  const proposedOverrides = {};
  const overrideChecks = [];
  for (const spec of specs) {
    const fullId = resolveConversationId(state.conversations, spec.idQuery);
    const check = validateOverrideEntry({ key: spec.key, label: spec.label });
    proposedOverrides[fullId] = { key: check.key, label: check.label };
    overrideChecks.push({ id: fullId, shortId: fullId.slice(0, 8), ...check });
  }

  const mergedOverrides = {
    ...(state.prefs?.requirementOverrides || {}),
    ...proposedOverrides,
  };
  const assignedAll = assignRequirements(state.conversations, { requirementOverrides: mergedOverrides });
  const targetIdSet = new Set(Object.keys(proposedOverrides));
  const targets = assignedAll.filter(c => targetIdSet.has(c.id));
  const uniqueReqKeys = [...new Set(targets.map(c => c.reqKey))];
  const uniqueProjectKeys = [...new Set(targets.map(c => c.projectKey))];
  const perBucket = summarizePerBucket(state.conversations, targetIdSet, state.inboxModel, state.nowMs, mergedOverrides);

  const validEntries = overrideChecks.every(o => o.ok);
  const singleGroup = uniqueReqKeys.length === 1 && !uniqueReqKeys[0]?.startsWith('INBOX');
  const warnings = [];
  if (!validEntries) warnings.push('One or more requirementOverrides entries failed validation');
  if (uniqueReqKeys.length === 1 && uniqueReqKeys[0]?.startsWith('INBOX')) {
    warnings.push('Proposed overrides resolved to INBOX instead of a requirement group (use "COC-4", "Issue 17", etc.)');
  }
  if (uniqueReqKeys.length > 1) {
    warnings.push(`Cross-project split detected (${uniqueReqKeys.length} groups): replace "Issue N"/"PR N"/bracket tag with a cross-project key like "COC-4"`);
  }
  if (Object.keys(perBucket).length > 1 && perBucket.inbox) {
    warnings.push(`Sessions span ${Object.keys(perBucket).join(' + ')}; settle Inbox item(s) or switch Group By to merge them visually`);
  }

  return {
    ok: validEntries && singleGroup,
    groupByDimensions: state.prefs.groupByDimensions,
    uniqueReqKeys,
    overallReqLabel: targets[0]?.reqLabel || '',
    crossProject: uniqueProjectKeys.length > 1,
    perBucket,
    overrideChecks,
    proposedOverrides,
    warnings,
  };
}

/** Write validated Sidecar requirementOverrides atomically and re-verify without touching AGY SQLite/.pbtxt. */
export async function applyGrouping(state, specs) {
  const preview = previewGrouping(state, specs);
  if (!preview.ok) {
    return {
      ok: false,
      appliedCount: 0,
      proposedOverrides: preview.proposedOverrides,
      warnings: preview.warnings,
      preview,
    };
  }
  const store = new PreferencesStore(state.paths.preferences);
  await store.patchRequirementOverrides(preview.proposedOverrides);
  const afterState = await loadSidebarState({
    dbPath: state.paths.conversationsDb,
    prefsPath: state.paths.preferences,
    useLs: false,
    nowMs: state.nowMs,
  });
  const verified = verifyGrouping(afterState, Object.keys(preview.proposedOverrides));
  return {
    ok: verified.ok,
    appliedCount: Object.keys(preview.proposedOverrides).length,
    proposedOverrides: preview.proposedOverrides,
    verified,
    warnings: preview.warnings,
  };
}

/** Remove Sidecar requirementOverrides entries for the specified conversations. */
export async function clearGroupingOverrides(state, idSelectors) {
  if (!Array.isArray(idSelectors) || idSelectors.length === 0) {
    throw new Error('Provide at least one conversation ID or prefix to clear');
  }
  const fullIds = idSelectors.map(sel => resolveConversationId(state.conversations, sel));
  const store = new PreferencesStore(state.paths.preferences);
  const updated = await store.patchRequirementOverrides({}, { remove: fullIds });
  return {
    ok: true,
    removedIds: fullIds,
    remainingCount: Object.keys(updated.requirementOverrides || {}).length,
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
  const overrides = state.prefs?.requirementOverrides || {};
  const perBucket = summarizePerBucket(state.conversations, targetSet, state.inboxModel, state.nowMs, overrides);
  const items = targets.map(c => ({
    id: c.id,
    shortId: c.id.slice(0, 8),
    title: c.title,
    projectName: c.projectName || c.repoName || 'unassigned',
    bucket: c.bucket,
    reqKey: c.reqKey,
    reqLabel: c.reqLabel,
    reqKind: c.reqKind,
    reqSource: c.reqSource || 'inbox',
    override: overrides[c.id] || null,
    updatedIso: c.updatedIso,
  }));
  return {
    ok: uniqueReqKeys.length === 1 && Boolean(uniqueReqKeys[0]) && uniqueReqKeys[0] !== 'INBOX',
    groupByDimensions: state.prefs.groupByDimensions,
    uniqueReqKeys,
    perBucket,
    items,
  };
}

function parseCliArgs(argv) {
  const [command, ...rest] = argv;
  const positional = [];
  const specs = [];
  const opts = {
    json: false,
    noLs: false,
    matchAll: false,
    limit: 25,
    dbPath: undefined,
    prefsPath: undefined,
    key: '',
    label: '',
  };
  for (let i = 0; i < rest.length; i += 1) {
    const arg = rest[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--no-ls') opts.noLs = true;
    else if (arg === '--all') opts.matchAll = true;
    else if (arg === '--limit') opts.limit = Number(rest[++i] || 25);
    else if (arg === '--db') opts.dbPath = rest[++i];
    else if (arg === '--prefs') opts.prefsPath = rest[++i];
    else if (arg === '--key') opts.key = String(rest[++i] || '').trim();
    else if (arg === '--label') opts.label = String(rest[++i] || '').trim();
    else if (arg === '--pair') specs.push(parseOverrideSpec(rest[++i], opts.label));
    else if ((command === 'check' || command === 'apply') && arg.includes('=')) {
      specs.push(parseOverrideSpec(arg, opts.label));
    } else {
      positional.push(arg);
    }
  }
  if ((command === 'check' || command === 'apply') && positional.length > 0) {
    if (!opts.key) {
      throw new Error('Provide --key <groupKey> (with optional --label <displayLabel>) or "<id>=<key>|<label>"');
    }
    const label = opts.key.toUpperCase() === 'INBOX' ? '' : (opts.label || opts.key);
    for (const idQuery of positional) {
      specs.push({ idQuery, key: opts.key, label });
    }
  }
  return { command, positional, specs, opts };
}

function formatTextReport(command, result) {
  if (command === 'search') {
    if (result.length === 0) return 'No matching conversations found.';
    const lines = result.map(r => (
      `${r.shortId} | ${r.bucket.padEnd(7)} | ${r.projectName} | ${r.reqKey} [${r.reqSource}] | ${r.title}`
    ));
    if (result.length >= 2) {
      const frag = summarizeSearchFragmentation(result);
      const stateText = frag.fragmented ? 'FRAGMENTED (candidate to consolidate)' : 'UNIFIED';
      lines.push(`[summary] ${frag.totalHits} hits | projects=${frag.distinctProjects.length} | groups=${frag.distinctReqKeys.length} | ungrouped=${frag.ungroupedCount} | ${stateText}`);
    }
    return lines.join('\n');
  }
  return JSON.stringify(result, null, 2);
}

export async function main(argv = process.argv.slice(2)) {
  const { command, positional, specs, opts } = parseCliArgs(argv);
  if (!command || command === '--help' || command === '-h') {
    console.log([
      'Usage:',
      '  preview-grouping.mjs search [terms...] [--all] [--limit 25] [--json]',
      '  preview-grouping.mjs check --key <key> [--label <label>] <idOrPrefix>... [--json]',
      '  preview-grouping.mjs check <idOrPrefix>=<key>|<label>... [--json]',
      '  preview-grouping.mjs apply --key <key> [--label <label>] <idOrPrefix>... [--json]',
      '  preview-grouping.mjs apply <idOrPrefix>=<key>|<label>... [--json]',
      '  preview-grouping.mjs clear <idOrPrefix>... [--json]',
      '  preview-grouping.mjs verify <idOrPrefix>... [--json]',
    ].join('\n'));
    return 0;
  }

  const state = await loadSidebarState({ dbPath: opts.dbPath, prefsPath: opts.prefsPath, useLs: !opts.noLs });
  let result;
  let exitCode = 0;

  if (command === 'search') {
    result = searchConversations(state.conversations, positional, opts.limit, { matchAll: opts.matchAll });
  } else if (command === 'check') {
    result = previewGrouping(state, specs);
    if (!result.ok) exitCode = 2;
  } else if (command === 'apply') {
    result = await applyGrouping(state, specs);
    if (!result.ok) exitCode = 2;
  } else if (command === 'clear' || command === 'remove') {
    result = await clearGroupingOverrides(state, positional);
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

import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { platformPaths } from './platform.mjs';

const VALID_LANGUAGES = new Set(['zh-CN', 'en']);
export const VALID_DIMENSIONS = ['project', 'requirement', 'repo', 'location', 'status'];
const VALID_DIM_SET = new Set(VALID_DIMENSIONS);
export const VALID_RETIRE_HOURS = [12, 24, 48, 168];
const VALID_RETIRE_SET = new Set(VALID_RETIRE_HOURS);

export const DEFAULT_PREFERENCES = Object.freeze({
  language: 'zh-CN',
  groupByDimensions: null,
  collapsedGroupKeys: [],
  showArchived: false,
  inboxEnabled: true,
  inboxEnabledAtMs: 0,
  inboxAutoRetireHours: 24,
  inboxSettled: Object.freeze({}),
  inboxFollowUp: Object.freeze({}),
  inboxSnoozed: Object.freeze({}),
  requirementOverrides: Object.freeze({}),
});

function toNonNegInt(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.trunc(value) : fallback;
}

function sanitizeIdMap(rawMap, parseEntry, sortValue, maxEntries) {
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return {};
  const entries = [];
  for (const [key, val] of Object.entries(rawMap)) {
    if (typeof key !== 'string' || !key || key.length > 128) continue;
    const parsed = parseEntry(val);
    if (parsed != null) entries.push([key, parsed]);
  }
  if (entries.length > maxEntries) {
    entries.sort((a, b) => sortValue(b[1]) - sortValue(a[1]));
    entries.length = maxEntries;
  }
  return Object.fromEntries(entries);
}

function parseSettledEntry(val) {
  if (typeof val === 'number') {
    const atMs = toNonNegInt(val, 0);
    return atMs > 0 ? { atMs, updatedMs: atMs } : null;
  }
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
  const atMs = toNonNegInt(val.atMs, 0);
  if (atMs <= 0) return null;
  const updatedMs = toNonNegInt(val.updatedMs, 0);
  const out = { atMs, updatedMs };
  if (val.settledMarkedUnread === true) out.settledMarkedUnread = true;
  return out;
}

function parseSnoozedEntry(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
  const untilMs = toNonNegInt(val.untilMs, 0);
  const setAtMs = toNonNegInt(val.setAtMs, 0);
  if (untilMs <= 0 || setAtMs <= 0) return null;
  return { untilMs, setAtMs, updatedMs: toNonNegInt(val.updatedMs, 0) };
}

export function parseRequirementOverrideEntry(val) {
  if (!val || typeof val !== 'object' || Array.isArray(val)) return null;
  const key = typeof val.key === 'string' ? val.key.replace(/\s+/g, ' ').trim() : '';
  if (!key || key.length > 160) return null;
  if (key.toUpperCase() === 'INBOX') {
    return { key: 'INBOX', label: '' };
  }
  const label = typeof val.label === 'string' ? val.label.replace(/\s+/g, ' ').trim().slice(0, 200) : '';
  if (!label) return null;
  return { key, label };
}

export function normalizePreferences(raw = {}, fallback = DEFAULT_PREFERENCES) {
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_PREFERENCES;
  const language = VALID_LANGUAGES.has(raw.language)
    ? raw.language
    : (VALID_LANGUAGES.has(base.language) ? base.language : DEFAULT_PREFERENCES.language);
  const showArchived = typeof raw.showArchived === 'boolean'
    ? raw.showArchived
    : Boolean(base.showArchived);
  const inboxEnabled = typeof raw.inboxEnabled === 'boolean'
    ? raw.inboxEnabled
    : (typeof base.inboxEnabled === 'boolean' ? base.inboxEnabled : DEFAULT_PREFERENCES.inboxEnabled);
  const inboxEnabledAtMs = 'inboxEnabledAtMs' in raw
    ? toNonNegInt(raw.inboxEnabledAtMs, toNonNegInt(base.inboxEnabledAtMs, 0))
    : toNonNegInt(base.inboxEnabledAtMs, 0);
  const inboxAutoRetireHours = VALID_RETIRE_SET.has(raw.inboxAutoRetireHours)
    ? raw.inboxAutoRetireHours
    : (VALID_RETIRE_SET.has(base.inboxAutoRetireHours) ? base.inboxAutoRetireHours : DEFAULT_PREFERENCES.inboxAutoRetireHours);

  let groupByDimensions = Array.isArray(base.groupByDimensions) ? [...base.groupByDimensions] : null;
  if ('groupByDimensions' in raw) {
    if (raw.groupByDimensions === null) {
      groupByDimensions = null;
    } else if (Array.isArray(raw.groupByDimensions)) {
      const seen = new Set();
      groupByDimensions = [];
      for (const dim of raw.groupByDimensions) {
        if (typeof dim === 'string' && VALID_DIM_SET.has(dim) && !seen.has(dim)) {
          seen.add(dim);
          groupByDimensions.push(dim);
        }
      }
    }
  } else if (raw.groupByRequirement === true && groupByDimensions === null) {
    groupByDimensions = ['requirement'];
  }

  let collapsedGroupKeys = Array.isArray(base.collapsedGroupKeys) ? [...base.collapsedGroupKeys] : [];
  const rawCollapsed = Array.isArray(raw.collapsedGroupKeys)
    ? raw.collapsedGroupKeys
    : (Array.isArray(raw.collapsedReqKeys) ? raw.collapsedReqKeys : null);
  if (rawCollapsed) {
    const seen = new Set();
    collapsedGroupKeys = [];
    for (const item of rawCollapsed) {
      if (typeof item === 'string' && item.length > 0 && item.length <= 320 && !seen.has(item)) {
        seen.add(item);
        collapsedGroupKeys.push(item);
        if (collapsedGroupKeys.length >= 800) break;
      }
    }
  }

  const rawSettled = 'inboxSettled' in raw ? raw.inboxSettled : base.inboxSettled;
  const inboxSettled = sanitizeIdMap(rawSettled, parseSettledEntry, v => v.atMs, 1000);

  const rawFollowUp = 'inboxFollowUp' in raw ? raw.inboxFollowUp : base.inboxFollowUp;
  const inboxFollowUp = sanitizeIdMap(rawFollowUp, v => {
    const ts = toNonNegInt(v, 0);
    return ts > 0 ? ts : null;
  }, v => v, 500);

  const rawSnoozed = 'inboxSnoozed' in raw ? raw.inboxSnoozed : base.inboxSnoozed;
  const inboxSnoozed = sanitizeIdMap(rawSnoozed, parseSnoozedEntry, v => v.setAtMs, 500);

  const rawOverrides = 'requirementOverrides' in raw ? raw.requirementOverrides : base.requirementOverrides;
  const requirementOverrides = sanitizeIdMap(rawOverrides, parseRequirementOverrideEntry, () => 0, 2000);

  return {
    language,
    groupByDimensions,
    collapsedGroupKeys,
    showArchived,
    inboxEnabled,
    inboxEnabledAtMs,
    inboxAutoRetireHours,
    inboxSettled,
    inboxFollowUp,
    inboxSnoozed,
    requirementOverrides,
  };
}

async function atomicWriteJson(file, payload) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, `${JSON.stringify(payload, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
    await rename(temp, file);
  } finally {
    await rm(temp, { force: true }).catch(() => {});
  }
}

export class PreferencesStore {
  constructor(file = platformPaths().preferences) {
    this.file = file;
    this.queue = Promise.resolve();
  }

  async get() {
    try {
      const text = await readFile(this.file, 'utf8');
      const parsed = JSON.parse(text.replace(/^\uFEFF/, ''));
      return normalizePreferences(parsed, DEFAULT_PREFERENCES);
    } catch {
      return normalizePreferences({}, DEFAULT_PREFERENCES);
    }
  }

  async set(patch) {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
      throw new Error('Invalid preferences patch');
    }
    const run = this.queue.then(async () => {
      const current = await this.get();
      const merged = normalizePreferences({ ...current, ...patch }, current);
      await atomicWriteJson(this.file, merged);
      return merged;
    });
    this.queue = run.catch(() => {});
    return run;
  }

  async patchRequirementOverrides(updates = {}, { remove = [] } = {}) {
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      throw new Error('Invalid requirementOverrides updates');
    }
    const removeSet = new Set(Array.isArray(remove) ? remove.filter(id => typeof id === 'string' && id) : []);
    const run = this.queue.then(async () => {
      const current = await this.get();
      const next = { ...(current.requirementOverrides || {}) };
      for (const id of removeSet) delete next[id];
      for (const [id, entry] of Object.entries(updates)) {
        if (typeof id !== 'string' || !id || id.length > 128) continue;
        if (entry === null) {
          delete next[id];
        } else {
          const parsed = parseRequirementOverrideEntry(entry);
          if (parsed) next[id] = parsed;
        }
      }
      const merged = normalizePreferences({ ...current, requirementOverrides: next }, current);
      await atomicWriteJson(this.file, merged);
      return merged;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}

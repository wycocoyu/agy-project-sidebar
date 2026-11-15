import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { platformPaths } from './platform.mjs';

const VALID_LANGUAGES = new Set(['zh-CN', 'en']);
export const VALID_DIMENSIONS = ['project', 'requirement', 'repo', 'location', 'status'];
const VALID_DIM_SET = new Set(VALID_DIMENSIONS);

export const DEFAULT_PREFERENCES = Object.freeze({
  language: 'zh-CN',
  groupByDimensions: null,
  collapsedGroupKeys: [],
  showArchived: false,
});

export function normalizePreferences(raw = {}, fallback = DEFAULT_PREFERENCES) {
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_PREFERENCES;
  const language = VALID_LANGUAGES.has(raw.language)
    ? raw.language
    : (VALID_LANGUAGES.has(base.language) ? base.language : DEFAULT_PREFERENCES.language);
  const showArchived = typeof raw.showArchived === 'boolean'
    ? raw.showArchived
    : Boolean(base.showArchived);

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

  return { language, groupByDimensions, collapsedGroupKeys, showArchived };
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
}

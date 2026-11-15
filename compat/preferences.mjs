import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname } from 'node:path';
import { platformPaths } from './platform.mjs';

const VALID_LANGUAGES = new Set(['zh-CN', 'en']);
const VALID_VIEW_MODES = new Set(['tree', 'native']);
const VALID_DIMENSIONS = new Set(['project', 'requirement', 'status']);
const DIMENSION_ORDER = ['project', 'requirement', 'status'];

export const DEFAULT_PREFERENCES = Object.freeze({
  language: 'zh-CN',
  viewMode: 'tree',
  drawerPinned: false,
  dimensions: ['project', 'requirement'],
  collapsedIds: [],
  showArchived: false,
});

export function normalizePreferences(raw = {}, fallback = DEFAULT_PREFERENCES) {
  const base = fallback && typeof fallback === 'object' ? fallback : DEFAULT_PREFERENCES;
  const language = VALID_LANGUAGES.has(raw.language) ? raw.language : (VALID_LANGUAGES.has(base.language) ? base.language : DEFAULT_PREFERENCES.language);
  const viewMode = VALID_VIEW_MODES.has(raw.viewMode) ? raw.viewMode : (VALID_VIEW_MODES.has(base.viewMode) ? base.viewMode : DEFAULT_PREFERENCES.viewMode);
  const drawerPinned = typeof raw.drawerPinned === 'boolean' ? raw.drawerPinned : Boolean(base.drawerPinned);
  const showArchived = typeof raw.showArchived === 'boolean' ? raw.showArchived : Boolean(base.showArchived);

  let dimensions = Array.isArray(raw.dimensions)
    ? DIMENSION_ORDER.filter(dim => raw.dimensions.includes(dim) && VALID_DIMENSIONS.has(dim))
    : (Array.isArray(base.dimensions) ? base.dimensions.filter(d => VALID_DIMENSIONS.has(d)) : [...DEFAULT_PREFERENCES.dimensions]);
  if (!dimensions.length) dimensions = [...DEFAULT_PREFERENCES.dimensions];

  const sourceCollapsed = Array.isArray(raw.collapsedIds)
    ? raw.collapsedIds
    : (Array.isArray(base.collapsedIds) ? base.collapsedIds : []);
  const seen = new Set();
  const collapsedIds = [];
  for (const item of sourceCollapsed) {
    if (typeof item !== 'string' || !item || item.length > 256 || seen.has(item)) continue;
    seen.add(item);
    collapsedIds.push(item);
    if (collapsedIds.length >= 500) break;
  }

  return { language, viewMode, drawerPinned, dimensions, collapsedIds, showArchived };
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

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { request } from 'node:http';
import { basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { platformPaths } from '../../compat/platform.mjs';
import { PreferencesStore } from '../../compat/preferences.mjs';

const execFileAsync = promisify(execFile);

const TECH_ID_RE = /^(?:GPT|UTF|SHA|ISO|HTTP|HTTPS|CVE|NODE|PR|V\d+)-\d+$/i;
const SESSION_NAME_RE = /^(\d{4})\s*\|\s*([^|]+?)\s*\|\s*(.+)$/;
const PREFIX_ISSUE_RE = /^(#[1-9]\d*|Issue\s*#?\s*[1-9]\d*|PR\s*#?\s*[1-9]\d*|[Qq]\d+|[A-Za-z][A-Za-z0-9]{1,9}-\d+)\b[\s|:：\-]*(.*)$/i;
const EMBEDDED_ISSUE_RE = /(?:^|[\s|(\[【])(#[1-9]\d*|Issue\s*#?\s*[1-9]\d*|PR\s*#?\s*[1-9]\d*|[A-Z]{2,10}-\d+|[Qq]\d{2,})\b/i;
const BRACKET_THEME_RE = /^(?:\[([^\[\]]{2,24})\]|【([^【】]{2,24})】)[\s|:：\-]*(.*)$/;

function cleanRequirementLabel(rawText, fallback = '') {
  const cleaned = String(rawText || '')
    .replace(/\bPR\s*#\s*(\d+)/gi, 'PR $1')
    .replace(/\bIssue\s*#\s*(\d+)/gi, 'Issue $1')
    .replace(/\/\s*#\s*(\d+)/g, '/$1')
    .replace(/([A-Za-z0-9\u4e00-\u9fff])#(\d+)/g, '$1 $2')
    .replace(/(^|[\s(\[【\-])#(\d+)/g, '$1$2')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return cleaned || fallback;
}

function normalizeIssueToken(rawToken) {
  const trimmed = String(rawToken || '').trim();
  if (trimmed.startsWith('#')) {
    const num = trimmed.slice(1);
    return { key: `ISSUE:${num}`, shortId: num, fallbackLabel: `Issue ${num}`, scopeByProject: true, isLeadingHash: true };
  }
  let m = trimmed.match(/^Issue\s*#?\s*([1-9]\d*)$/i);
  if (m) {
    return { key: `ISSUE:${m[1]}`, shortId: `Issue ${m[1]}`, fallbackLabel: `Issue ${m[1]}`, scopeByProject: true, isLeadingHash: false };
  }
  m = trimmed.match(/^PR\s*#?\s*([1-9]\d*)$/i);
  if (m) {
    return { key: `PR:${m[1]}`, shortId: `PR ${m[1]}`, fallbackLabel: `PR ${m[1]}`, scopeByProject: true, isLeadingHash: false };
  }
  const upper = trimmed.toUpperCase();
  return { key: `ISSUE:${upper}`, shortId: upper, fallbackLabel: upper, scopeByProject: false, isLeadingHash: false };
}

export function normalizeLocalPath(uriOrPath) {
  if (!uriOrPath || typeof uriOrPath !== 'string') return '';
  let pathText = uriOrPath.trim();
  if (pathText.startsWith('file://')) {
    try {
      pathText = decodeURIComponent(new URL(pathText).pathname);
    } catch {
      return '';
    }
  }
  if (!pathText) return '';
  if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(pathText)) pathText = pathText.slice(1);
  pathText = pathText.replace(/\/+$/, '') || '/';
  try {
    return realpathSync(pathText).replace(/\/+$/, '') || '/';
  } catch {
    return pathText;
  }
}

export function extractProjectFolderPaths(project) {
  const paths = [];
  const resources = project?.projectResources?.resources;
  if (!Array.isArray(resources)) return paths;
  for (const res of resources) {
    const uri = res?.gitFolder?.folderUri || res?.folderUri;
    const normalized = normalizeLocalPath(uri);
    if (normalized && !paths.includes(normalized)) paths.push(normalized);
  }
  return paths;
}

export function filterRealProjects(rawProjects, sidecarProjectIds = new Set()) {
  const real = [];
  for (const proj of rawProjects || []) {
    if (!proj || !proj.id) continue;
    if (sidecarProjectIds.has(proj.id)) continue;
    const folderPaths = extractProjectFolderPaths(proj);
    const name = String(proj.name || '').trim();
    if (!folderPaths.length && (name.includes('/') || name === 'opencode-pipeline')) continue;
    real.push({
      id: proj.id,
      name: name || (folderPaths[0] ? basename(folderPaths[0]) : proj.id.slice(0, 8)),
      folderPaths,
    });
  }
  return real;
}

export function parseWorkspaceUris(raw) {
  if (!raw) return [];
  let arr = raw;
  if (typeof raw === 'string') {
    try { arr = JSON.parse(raw); } catch { return []; }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map(normalizeLocalPath).filter(Boolean);
}

export function resolveProjectForConversation(conv, projectsById, realProjects) {
  const pid = String(conv.project_id || conv.projectId || '').trim();
  if (pid && projectsById.has(pid)) {
    const p = projectsById.get(pid);
    return { projectKey: p.id, projectName: p.name, realProjectId: p.id, isUnassigned: false };
  }

  const workspacePaths = parseWorkspaceUris(conv.workspace_uris || conv.workspaceUris);
  let best = null;
  let bestLen = -1;
  for (const wPath of workspacePaths) {
    for (const proj of realProjects) {
      for (const fPath of proj.folderPaths) {
        if (wPath === fPath || wPath.startsWith(`${fPath}/`)) {
          if (fPath.length > bestLen) {
            bestLen = fPath.length;
            best = proj;
          }
        }
      }
    }
  }
  if (best) {
    return { projectKey: best.id, projectName: best.name, realProjectId: best.id, isUnassigned: false };
  }

  return {
    projectKey: '__unassigned__',
    projectName: null,
    realProjectId: '',
    isUnassigned: true,
    workspaceHint: workspacePaths[0] ? basename(workspacePaths[0]) : '',
  };
}

export function parseSessionTitle(title) {
  const clean = String(title || '').replace(/\s+/g, ' ').trim();
  const m = clean.match(SESSION_NAME_RE);
  if (m) {
    return {
      raw: clean,
      mmdd: m[1],
      category: m[2].trim(),
      subject: m[3].trim(),
      hasStandardFormat: true,
    };
  }
  return { raw: clean, mmdd: '', category: '', subject: clean, hasStandardFormat: false };
}

export function extractRequirementDescriptor(title) {
  const parsed = parseSessionTitle(title);
  const candidates = [parsed.subject, parsed.raw];

  for (const text of candidates) {
    if (!text) continue;
    const prefixMatch = text.match(PREFIX_ISSUE_RE);
    if (prefixMatch) {
      const info = normalizeIssueToken(prefixMatch[1]);
      if (!TECH_ID_RE.test(info.shortId)) {
        const rawTail = prefixMatch[2].replace(/^(?:[\s/:：\-]*#\d+\b)+[\s/:：\-]*/g, '').trim();
        let label;
        if (info.isLeadingHash) {
          label = rawTail ? cleanRequirementLabel(rawTail, info.fallbackLabel) : info.fallbackLabel;
        } else {
          const combined = rawTail ? `${info.shortId} ${rawTail}` : info.shortId;
          label = cleanRequirementLabel(combined, info.fallbackLabel);
        }
        return {
          kind: 'issue',
          key: info.key,
          shortId: info.shortId,
          label,
          scopeByProject: info.scopeByProject,
        };
      }
    }
  }

  for (const text of candidates) {
    if (!text) continue;
    const embMatch = text.match(EMBEDDED_ISSUE_RE);
    if (embMatch) {
      const info = normalizeIssueToken(embMatch[1]);
      if (!TECH_ID_RE.test(info.shortId)) {
        return {
          kind: 'issue',
          key: info.key,
          shortId: info.shortId,
          label: cleanRequirementLabel(parsed.subject || text, info.fallbackLabel),
          scopeByProject: info.scopeByProject,
        };
      }
    }
  }

  if (parsed.hasStandardFormat && parsed.subject) {
    const bracketMatch = parsed.subject.match(BRACKET_THEME_RE);
    const rawTag = bracketMatch ? (bracketMatch[1] || bracketMatch[2] || '').trim() : '';
    const themeLabel = cleanRequirementLabel(rawTag || parsed.subject, rawTag || parsed.subject);
    return {
      kind: 'theme-candidate',
      key: `THEME:${themeLabel.toLowerCase()}`,
      shortId: '',
      label: themeLabel,
      scopeByProject: true,
    };
  }

  return { kind: 'inbox', key: 'INBOX', shortId: '', label: '', scopeByProject: false };
}

export function resolveRequirementOverrideDescriptor(overrideEntry, projectKey = '__unassigned__') {
  if (!overrideEntry || typeof overrideEntry !== 'object' || Array.isArray(overrideEntry)) return null;
  const rawKey = typeof overrideEntry.key === 'string' ? overrideEntry.key.replace(/\s+/g, ' ').trim() : '';
  if (!rawKey) return null;
  if (rawKey.toUpperCase() === 'INBOX') {
    return { kind: 'inbox', key: 'INBOX', effectiveKey: 'INBOX', label: '', scopeByProject: false };
  }
  const rawLabel = typeof overrideEntry.label === 'string' ? overrideEntry.label.replace(/\s+/g, ' ').trim() : '';
  if (rawKey.includes('::')) {
    const kind = rawKey.includes('::THEME:') ? 'theme' : 'issue';
    const fallback = rawKey.split('::').slice(1).join('::');
    return { kind, key: rawKey, effectiveKey: rawKey, label: cleanRequirementLabel(rawLabel, fallback), scopeByProject: false };
  }
  let m = rawKey.match(/^ISSUE:(.+)$/i);
  if (m) {
    const inner = m[1].trim();
    if (/^[1-9]\d*$/.test(inner)) {
      const key = `ISSUE:${inner}`;
      return {
        kind: 'issue',
        key,
        effectiveKey: `${projectKey}::${key}`,
        label: cleanRequirementLabel(rawLabel, `Issue ${inner}`),
        scopeByProject: true,
      };
    }
    const upper = inner.toUpperCase();
    const key = `ISSUE:${upper}`;
    return {
      kind: 'issue',
      key,
      effectiveKey: key,
      label: cleanRequirementLabel(rawLabel, upper),
      scopeByProject: false,
    };
  }
  m = rawKey.match(/^PR:([1-9]\d*)$/i);
  if (m) {
    const key = `PR:${m[1]}`;
    return {
      kind: 'issue',
      key,
      effectiveKey: `${projectKey}::${key}`,
      label: cleanRequirementLabel(rawLabel, `PR ${m[1]}`),
      scopeByProject: true,
    };
  }
  if (/^(#[1-9]\d*|Issue\s*#?\s*[1-9]\d*|PR\s*#?\s*[1-9]\d*|[Qq]\d+|[A-Za-z][A-Za-z0-9]{1,9}-\d+)$/i.test(rawKey)) {
    const info = normalizeIssueToken(rawKey);
    if (!TECH_ID_RE.test(info.shortId)) {
      return {
        kind: 'issue',
        key: info.key,
        effectiveKey: info.scopeByProject ? `${projectKey}::${info.key}` : info.key,
        label: cleanRequirementLabel(rawLabel, info.fallbackLabel),
        scopeByProject: info.scopeByProject,
      };
    }
  }
  m = rawKey.match(/^THEME:(.+)$/i);
  if (m) {
    const themeName = m[1].trim();
    const key = `THEME:${themeName.toLowerCase()}`;
    return {
      kind: 'theme',
      key,
      effectiveKey: `${projectKey}::${key}`,
      label: cleanRequirementLabel(rawLabel, themeName),
      scopeByProject: true,
    };
  }
  const bracketMatch = rawKey.match(BRACKET_THEME_RE);
  if (bracketMatch) {
    const tag = (bracketMatch[1] || bracketMatch[2] || '').trim();
    if (tag) {
      const key = `THEME:${tag.toLowerCase()}`;
      return {
        kind: 'theme',
        key,
        effectiveKey: `${projectKey}::${key}`,
        label: cleanRequirementLabel(rawLabel, tag),
        scopeByProject: true,
      };
    }
  }
  if (/^convgroup:/i.test(rawKey)) {
    const slug = rawKey.slice('convgroup:'.length).trim();
    const key = `convgroup:${slug}`;
    return {
      kind: 'convgroup',
      key,
      effectiveKey: key,
      label: cleanRequirementLabel(rawLabel, slug || rawKey),
      scopeByProject: false,
    };
  }
  const key = rawKey.includes(':') ? rawKey : `OVERRIDE:${rawKey}`;
  return {
    kind: 'override',
    key,
    effectiveKey: key,
    label: cleanRequirementLabel(rawLabel, rawKey),
    scopeByProject: false,
  };
}

export function resolveGroupIdDescriptor(groupId, groupLabel = '') {
  const raw = String(groupId || '').replace(/\s+/g, ' ').trim();
  if (!raw) return null;
  const hasPrefix = /^convgroup:/i.test(raw);
  const slug = hasPrefix ? raw.slice('convgroup:'.length).trim() : raw;
  if (!slug) return null;
  const key = `convgroup:${slug}`;
  return {
    kind: 'convgroup',
    key,
    effectiveKey: key,
    label: cleanRequirementLabel(groupLabel || slug, key),
    scopeByProject: false,
  };
}

export function assignRequirements(convs = [], { requirementOverrides = {} } = {}) {
  const overrides = requirementOverrides && typeof requirementOverrides === 'object' ? requirementOverrides : {};
  const themeCounts = new Map();

  const prepared = convs.map(conv => {
    const id = String(conv.id || conv.conversation_id || '').trim();
    const projectKey = conv.projectKey || '__unassigned__';
    const tier1 = id ? resolveRequirementOverrideDescriptor(overrides[id], projectKey) : null;
    const tier2 = tier1 ? null : extractRequirementDescriptor(conv.title);
    if (tier2?.kind === 'theme-candidate') {
      const scopeKey = `${projectKey}::${tier2.key}`;
      themeCounts.set(scopeKey, (themeCounts.get(scopeKey) || 0) + 1);
    }
    return { conv, projectKey, tier1, tier2 };
  });

  const groupCounts = new Map();
  const overrideLabels = new Map();
  const groupLabels = new Map();

  const resolved = prepared.map(({ conv, projectKey, tier1, tier2 }) => {
    let effectiveKey = 'INBOX';
    let kind = 'inbox';
    let label = '';
    let reqSource = 'inbox';

    if (tier1) {
      reqSource = 'override';
      if (tier1.kind !== 'inbox') {
        effectiveKey = tier1.effectiveKey;
        kind = tier1.kind;
        label = tier1.label;
      }
    } else if (tier2?.kind === 'issue') {
      reqSource = 'title';
      effectiveKey = tier2.scopeByProject ? `${projectKey}::${tier2.key}` : tier2.key;
      kind = 'issue';
      label = tier2.label;
    } else if (tier2?.kind === 'theme-candidate') {
      const scopeKey = `${projectKey}::${tier2.key}`;
      if ((themeCounts.get(scopeKey) || 0) >= 2) {
        reqSource = 'title';
        effectiveKey = scopeKey;
        kind = 'theme';
        label = tier2.label;
      }
    }

    if (effectiveKey === 'INBOX' && reqSource === 'inbox') {
      const tier3 = resolveGroupIdDescriptor(conv.groupId ?? conv.group_id, conv.groupLabel ?? conv.group_label ?? '');
      if (tier3) {
        reqSource = 'group_id';
        effectiveKey = tier3.effectiveKey;
        kind = 'convgroup';
        label = tier3.label;
      }
    }

    if (effectiveKey !== 'INBOX') {
      groupCounts.set(effectiveKey, (groupCounts.get(effectiveKey) || 0) + 1);
      if (reqSource === 'override') {
        const prev = overrideLabels.get(effectiveKey);
        if (!prev || label.length > prev.length) overrideLabels.set(effectiveKey, label);
      }
      const prevAny = groupLabels.get(effectiveKey);
      if (!prevAny || label.length > prevAny.length) groupLabels.set(effectiveKey, label);
    }

    return { conv, effectiveKey, kind, label, reqSource };
  });

  return resolved.map(({ conv, effectiveKey, kind, label, reqSource }) => {
    if (effectiveKey === 'INBOX') {
      return { ...conv, reqKey: 'INBOX', reqLabel: '', reqKind: 'inbox', reqCount: 1, reqSource };
    }
    return {
      ...conv,
      reqKey: effectiveKey,
      reqLabel: overrideLabels.get(effectiveKey) || groupLabels.get(effectiveKey) || label,
      reqKind: kind,
      reqCount: groupCounts.get(effectiveKey) || 1,
      reqSource,
    };
  });
}

export function parseTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (!value || typeof value !== 'string') return 0;
  const iso = value.trim().replace(' ', 'T').replace(/\.(\d{3})\d+/, '.$1');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function buildSidebarSnapshot({
  rawProjects = [],
  sidecarProjectIds = new Set(),
  rows = [],
  archivedIds = new Set(),
  showArchived = false,
  requirementOverrides = {},
} = {}) {
  const realProjects = filterRealProjects(rawProjects, sidecarProjectIds);
  const projectsById = new Map(realProjects.map(p => [p.id, p]));

  const items = [];
  for (const row of rows) {
    const id = String(row.conversation_id || row.id || '').trim();
    if (!id) continue;
    const isArchived = archivedIds.has(id);
    if (isArchived && !showArchived) continue;

    const projMatch = resolveProjectForConversation(row, projectsById, realProjects);
    const updatedAtMs = parseTimestampMs(row.last_modified_time);
    const userInputAtMs = parseTimestampMs(row.last_user_input_time);
    const isRunning = row.status === 'CASCADE_RUN_STATUS_RUNNING' || row.status === 'CASCADE_RUN_STATUS_BUSY';
    const notFullyIdle = Boolean(row.not_fully_idle);
    const statusGroup = row.status === 'CASCADE_RUN_STATUS_WAITING'
      ? 'blocked'
      : (isRunning ? 'in_progress' : 'idle');

    const matchedProj = !projMatch.isUnassigned ? projectsById.get(projMatch.projectKey) : null;
    const repoName = matchedProj?.folderPaths?.[0]
      ? basename(matchedProj.folderPaths[0])
      : (projMatch.projectName || projMatch.workspaceHint || '');
    const rawUrisText = typeof row.workspace_uris === 'string' ? row.workspace_uris : JSON.stringify(row.workspace_uris || '');
    const envKind = /(?:vscode-remote|ssh|https?):\/\//i.test(rawUrisText) ? 'cloud' : 'local';
    const groupId = String(row.group_id || row.groupId || '').trim();

    items.push({
      id,
      title: String(row.title || 'Untitled').replace(/\s+/g, ' ').trim() || 'Untitled',
      status: isRunning ? 'running' : 'idle',
      statusGroup,
      isArchived,
      notFullyIdle,
      updatedAtMs,
      userInputAtMs,
      projectKey: projMatch.projectKey,
      projectName: projMatch.projectName,
      realProjectId: projMatch.realProjectId,
      isUnassigned: projMatch.isUnassigned,
      workspaceHint: projMatch.workspaceHint || '',
      repoName,
      envKind,
      groupId,
    });
  }

  const projectSummary = new Map();
  for (const proj of realProjects) {
    projectSummary.set(proj.id, {
      id: proj.id,
      name: proj.name,
      folderPath: proj.folderPaths[0] || '',
      total: 0,
      running: 0,
      latestMs: 0,
      isUnassigned: false,
    });
  }

  for (const item of items) {
    if (!projectSummary.has(item.projectKey)) {
      projectSummary.set(item.projectKey, {
        id: item.projectKey,
        name: item.projectName || '__unassigned__',
        folderPath: '',
        total: 0,
        running: 0,
        latestMs: 0,
        isUnassigned: item.isUnassigned,
      });
    }
    const pSum = projectSummary.get(item.projectKey);
    pSum.total += 1;
    if (item.status === 'running') pSum.running += 1;
    if (item.updatedAtMs > pSum.latestMs) pSum.latestMs = item.updatedAtMs;
  }

  const conversations = assignRequirements(items, { requirementOverrides });

  conversations.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'running' ? -1 : 1;
    return b.updatedAtMs - a.updatedAtMs;
  });

  const projects = [...projectSummary.values()].filter(p => p.total > 0 || !p.isUnassigned).sort((a, b) => {
    if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
    if (a.running !== b.running) return b.running - a.running;
    return b.latestMs - a.latestMs;
  });

  return {
    updatedAt: new Date().toISOString(),
    projects,
    conversations,
    stats: {
      totalProjects: projects.length,
      totalConversations: conversations.length,
      runningCount: conversations.filter(c => c.status === 'running').length,
    },
  };
}

function httpGetText(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 524288) req.destroy(new Error('HTML too large'));
      });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
    req.setTimeout(1500, () => req.destroy(new Error('LS discovery timeout')));
    req.end();
  });
}

function connectRpcPost(port, token, method, payload = {}) {
  const data = JSON.stringify(payload);
  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path: `/exa.language_server_pb.LanguageServerService/${method}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          'x-codeium-csrf-token': token,
        },
      },
      res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => {
          body += chunk;
          if (body.length > 4194304) req.destroy(new Error('RPC response too large'));
        });
        res.on('end', () => {
          if (res.statusCode !== 200) {
            reject(new Error(`RPC ${method} failed with ${res.statusCode}`));
            return;
          }
          try {
            resolve(JSON.parse(body));
          } catch (error) {
            reject(error);
          }
        });
      },
    );
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error(`RPC ${method} timeout`)));
    req.write(data);
    req.end();
  });
}

export async function discoverLanguageServer() {
  let stdout = '';
  try {
    ({ stdout } = await execFileAsync('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-a', '-c', 'language_'], { timeout: 2500 }));
  } catch {
    return null;
  }
  const ports = [...new Set([...stdout.matchAll(/:(\d+)\s+\(LISTEN\)/g)].map(m => Number(m[1])))].sort((a, b) => a - b);
  for (const port of ports) {
    try {
      const res = await httpGetText(port, '/');
      if (res.status !== 200) continue;
      const m = res.body.match(/"csrfToken"\s*:\s*"([^"]+)"/);
      if (m) return { port, token: m[1] };
    } catch {
      // Probe next listening port
    }
  }
  return null;
}

export class SidebarCollector {
  constructor(paths = platformPaths()) {
    this.paths = paths;
    this.lsEndpoint = null;
    this.projectsCache = { fetchedAt: 0, rawProjects: [], sidecarProjectIds: new Set() };
    this.snapshotCache = { fetchedAt: 0, showArchived: false, overridesKey: '', data: null };
  }

  invalidateCache() {
    this.snapshotCache = { fetchedAt: 0, showArchived: false, overridesKey: '', data: null };
  }

  async ensureEndpoint() {
    if (this.lsEndpoint) return this.lsEndpoint;
    this.lsEndpoint = await discoverLanguageServer();
    return this.lsEndpoint;
  }

  async fetchProjectsCached(force = false) {
    const now = Date.now();
    if (!force && now - this.projectsCache.fetchedAt < 15000 && this.projectsCache.rawProjects.length) {
      return this.projectsCache;
    }

    const sidecarProjectIds = new Set();
    try {
      const cfg = JSON.parse((await readFile(this.paths.pluginConfig, 'utf8')).replace(/^\uFEFF/, ''));
      for (const entry of Object.values(cfg.sidecars || {})) {
        if (entry?.projectId) sidecarProjectIds.add(entry.projectId);
      }
    } catch { /* ignore */ }

    try {
      const ep = await this.ensureEndpoint();
      if (!ep) return { fetchedAt: now, rawProjects: this.projectsCache.rawProjects, sidecarProjectIds };

      const [sidecarRes, listRes] = await Promise.all([
        connectRpcPost(ep.port, ep.token, 'GetSidecars', {}).catch(() => ({ sidecars: [] })),
        connectRpcPost(ep.port, ep.token, 'ListProjects', {}),
      ]);

      for (const sc of sidecarRes.sidecars || []) {
        if (sc?.userConfig?.projectId) sidecarProjectIds.add(sc.userConfig.projectId);
      }

      const ids = Array.isArray(listRes?.projectIds) ? listRes.projectIds : [];
      const details = await Promise.all(
        ids.map(id => connectRpcPost(ep.port, ep.token, 'ReadProject', { id }).then(r => r?.project).catch(() => null)),
      );
      const rawProjects = details.filter(Boolean);
      this.projectsCache = { fetchedAt: now, rawProjects, sidecarProjectIds };
      return this.projectsCache;
    } catch {
      this.lsEndpoint = null;
      return { fetchedAt: now, rawProjects: this.projectsCache.rawProjects, sidecarProjectIds };
    }
  }

  readConversationsFromDb() {
    const db = new DatabaseSync(this.paths.conversationsDb, { open: true, readOnly: true });
    try {
      const cols = new Set(
        db.prepare('PRAGMA table_info(conversation_summaries)').all().map(c => c.name),
      );
      const userInputCol = cols.has('last_user_input_time') ? ', last_user_input_time' : '';
      const groupIdCol = cols.has('group_id') ? ', group_id' : '';
      const rows = db.prepare(`
        SELECT conversation_id, title, status, project_id, workspace_uris, not_fully_idle, last_modified_time${userInputCol}${groupIdCol}
        FROM conversation_summaries
        WHERE nesting_depth = 0 AND killed = 0
        ORDER BY last_modified_time DESC
        LIMIT 1500
      `).all();
      const archivedIds = new Set();
      try {
        const archRows = db.prepare('SELECT DISTINCT conversation_id FROM conversations_fts WHERE archived = 1').all();
        for (const r of archRows) if (r.conversation_id) archivedIds.add(r.conversation_id);
      } catch { /* FTS table optional in older/test schemas */ }
      return { rows, archivedIds };
    } finally {
      db.close();
    }
  }

  async readRequirementOverrides() {
    if (typeof this.paths?.preferences !== 'string' || !this.paths.preferences) return {};
    const prefs = await new PreferencesStore(this.paths.preferences).get();
    return prefs.requirementOverrides || {};
  }

  async snapshot({ force = false, showArchived = false, requirementOverrides } = {}) {
    const resolvedOverrides = requirementOverrides && typeof requirementOverrides === 'object'
      ? requirementOverrides
      : await this.readRequirementOverrides();
    const overridesKey = JSON.stringify(resolvedOverrides);
    const now = Date.now();
    if (
      !force
      && this.snapshotCache.data
      && this.snapshotCache.showArchived === showArchived
      && this.snapshotCache.overridesKey === overridesKey
      && now - this.snapshotCache.fetchedAt < 1500
    ) {
      return this.snapshotCache.data;
    }

    const [{ rawProjects, sidecarProjectIds }, { rows, archivedIds }] = await Promise.all([
      this.fetchProjectsCached(force),
      Promise.resolve().then(() => this.readConversationsFromDb()),
    ]);

    const data = buildSidebarSnapshot({
      rawProjects,
      sidecarProjectIds,
      rows,
      archivedIds,
      showArchived,
      requirementOverrides: resolvedOverrides,
    });
    this.snapshotCache = { fetchedAt: Date.now(), showArchived, overridesKey, data };
    return data;
  }
}

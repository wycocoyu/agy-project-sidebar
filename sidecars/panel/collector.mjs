import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { request } from 'node:http';
import { basename } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { promisify } from 'node:util';
import { platformPaths } from '../../compat/platform.mjs';

const execFileAsync = promisify(execFile);

const TECH_ID_RE = /^(?:GPT|UTF|SHA|ISO|HTTP|HTTPS|CVE|NODE|PR|V\d+)-\d+$/i;
const SESSION_NAME_RE = /^(\d{4})\s*\|\s*([^|]+?)\s*\|\s*(.+)$/;
const PREFIX_ISSUE_RE = /^(#[1-9]\d*|[Qq]\d+|PR\s*#?\d+|[A-Za-z][A-Za-z0-9]{1,9}-\d+)\b[\s|:：\-]*(.*)$/;
const EMBEDDED_ISSUE_RE = /(?:^|[\s|(\[【])(#[1-9]\d*|[A-Z]{2,10}-\d+|[Qq]\d{2,})\b/;

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
      const token = prefixMatch[1].replace(/^PR\s*#?/i, 'PR#').replace(/\s+/g, '');
      const normalizedToken = token.startsWith('#') ? token : token.toUpperCase();
      if (!TECH_ID_RE.test(normalizedToken)) {
        const tail = prefixMatch[2].trim();
        const label = tail ? `${normalizedToken} ${tail}` : normalizedToken;
        return { kind: 'issue', key: `ISSUE:${normalizedToken}`, shortId: normalizedToken, label };
      }
    }
  }

  for (const text of candidates) {
    if (!text) continue;
    const embMatch = text.match(EMBEDDED_ISSUE_RE);
    if (embMatch) {
      const token = embMatch[1].startsWith('#') ? embMatch[1] : embMatch[1].toUpperCase();
      if (!TECH_ID_RE.test(token)) {
        return { kind: 'issue', key: `ISSUE:${token}`, shortId: token, label: `${token} · ${parsed.subject || text}` };
      }
    }
  }

  if (parsed.hasStandardFormat && parsed.subject) {
    return {
      kind: 'theme-candidate',
      key: `THEME:${parsed.subject.toLowerCase()}`,
      shortId: '',
      label: parsed.subject,
    };
  }

  return { kind: 'inbox', key: 'INBOX', shortId: '', label: '' };
}

export function parseTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  if (!value || typeof value !== 'string') return 0;
  const iso = value.trim().replace(' ', 'T').replace(/\.(\d{3})\d+/, '.$1');
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : 0;
}

export function buildSidebarSnapshot({ rawProjects = [], sidecarProjectIds = new Set(), rows = [], archivedIds = new Set(), showArchived = false } = {}) {
  const realProjects = filterRealProjects(rawProjects, sidecarProjectIds);
  const projectsById = new Map(realProjects.map(p => [p.id, p]));

  const items = [];
  for (const row of rows) {
    const id = String(row.conversation_id || row.id || '').trim();
    if (!id) continue;
    const isArchived = archivedIds.has(id);
    if (isArchived && !showArchived) continue;

    const projMatch = resolveProjectForConversation(row, projectsById, realProjects);
    const reqDesc = extractRequirementDescriptor(row.title);
    const updatedAtMs = parseTimestampMs(row.last_modified_time);
    const isRunning = row.status === 'CASCADE_RUN_STATUS_RUNNING' || row.status === 'CASCADE_RUN_STATUS_BUSY';
    const notFullyIdle = Boolean(row.not_fully_idle);
    const statusGroup = row.status === 'CASCADE_RUN_STATUS_WAITING'
      ? 'blocked'
      : ((isRunning || notFullyIdle) ? 'in_progress' : 'idle');

    const matchedProj = !projMatch.isUnassigned ? projectsById.get(projMatch.projectKey) : null;
    const repoName = matchedProj?.folderPaths?.[0]
      ? basename(matchedProj.folderPaths[0])
      : (projMatch.projectName || projMatch.workspaceHint || '');
    const rawUrisText = typeof row.workspace_uris === 'string' ? row.workspace_uris : JSON.stringify(row.workspace_uris || '');
    const envKind = /(?:vscode-remote|ssh|https?):\/\//i.test(rawUrisText) ? 'cloud' : 'local';

    items.push({
      id,
      title: String(row.title || 'Untitled').replace(/\s+/g, ' ').trim() || 'Untitled',
      status: isRunning ? 'running' : 'idle',
      statusGroup,
      isArchived,
      notFullyIdle,
      updatedAtMs,
      projectKey: projMatch.projectKey,
      projectName: projMatch.projectName,
      realProjectId: projMatch.realProjectId,
      isUnassigned: projMatch.isUnassigned,
      workspaceHint: projMatch.workspaceHint || '',
      repoName,
      envKind,
      reqCandidate: reqDesc,
    });
  }

  // Count how many conversations in each project share a theme-candidate key
  const themeCounts = new Map();
  for (const item of items) {
    if (item.reqCandidate.kind === 'theme-candidate') {
      const scopeKey = `${item.projectKey}::${item.reqCandidate.key}`;
      themeCounts.set(scopeKey, (themeCounts.get(scopeKey) || 0) + 1);
    }
  }

  // Track best label for explicit ISSUE keys
  const issueLabels = new Map();
  for (const item of items) {
    if (item.reqCandidate.kind === 'issue') {
      const existing = issueLabels.get(item.reqCandidate.key);
      if (!existing || item.reqCandidate.label.length > existing.length) {
        issueLabels.set(item.reqCandidate.key, item.reqCandidate.label);
      }
    }
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

  const conversations = items.map(item => {
    let reqKey = 'INBOX';
    let reqLabel = '';
    let reqKind = 'inbox';
    if (item.reqCandidate.kind === 'issue') {
      reqKey = item.reqCandidate.key;
      reqLabel = issueLabels.get(reqKey) || item.reqCandidate.label;
      reqKind = 'issue';
    } else if (item.reqCandidate.kind === 'theme-candidate') {
      const count = themeCounts.get(`${item.projectKey}::${item.reqCandidate.key}`) || 0;
      if (count >= 2) {
        reqKey = item.reqCandidate.key;
        reqLabel = item.reqCandidate.label;
        reqKind = 'theme';
      }
    }

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

    const { reqCandidate, ...rest } = item;
    return { ...rest, reqKey, reqLabel, reqKind };
  });

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
    this.snapshotCache = { fetchedAt: 0, showArchived: false, data: null };
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
      const rows = db.prepare(`
        SELECT conversation_id, title, status, project_id, workspace_uris, not_fully_idle, last_modified_time
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

  async snapshot({ force = false, showArchived = false } = {}) {
    const now = Date.now();
    if (!force && this.snapshotCache.data && this.snapshotCache.showArchived === showArchived && now - this.snapshotCache.fetchedAt < 1500) {
      return this.snapshotCache.data;
    }

    const [{ rawProjects, sidecarProjectIds }, { rows, archivedIds }] = await Promise.all([
      this.fetchProjectsCached(force),
      Promise.resolve().then(() => this.readConversationsFromDb()),
    ]);

    const data = buildSidebarSnapshot({ rawProjects, sidecarProjectIds, rows, archivedIds, showArchived });
    this.snapshotCache = { fetchedAt: Date.now(), showArchived, data };
    return data;
  }
}

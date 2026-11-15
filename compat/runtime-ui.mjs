import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { platformPaths } from './platform.mjs';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const BINDING = '__agyProjectSidebarCallV1';

export function validTarget(target, port) {
  try {
    const page = new URL(target.url);
    const ws = new URL(target.webSocketDebuggerUrl);
    if (target.type !== 'page') return false;
    if (!['http:', 'https:'].includes(page.protocol) || !LOOPBACK.has(page.hostname)) return false;
    if (ws.protocol !== 'ws:' || !LOOPBACK.has(ws.hostname) || Number(ws.port) !== port) return false;
    if (page.searchParams.has('token')) return false;
    return page.pathname === '/' || page.pathname.startsWith('/c/');
  } catch {
    return false;
  }
}

function jsonGet(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port, path, method: 'GET' }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 1048576) req.destroy(new Error('Discovery response too large'));
      });
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error('Renderer discovery unavailable');
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(2000, () => req.destroy(new Error('Renderer discovery timeout')));
    req.end();
  });
}

export async function discoverTargets(profile) {
  const text = await readFile(join(profile, 'DevToolsActivePort'), 'utf8');
  if (text.length > 1024) throw new Error('Invalid DevToolsActivePort file');
  const port = Number(text.split(/\r?\n/)[0]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid renderer port');
  const targets = await jsonGet(port, '/json/list');
  if (!Array.isArray(targets)) throw new Error('Invalid renderer discovery response');
  return targets.filter(target => validTarget(target, port));
}

export class CdpConnection {
  constructor(url, { WebSocketImpl = globalThis.WebSocket, timeout = 5000, onEvent = () => {}, onClose = () => {} } = {}) {
    this.url = url;
    this.WebSocketImpl = WebSocketImpl;
    this.timeout = timeout;
    this.onEvent = onEvent;
    this.onClose = onClose;
    this.pending = new Map();
    this.nextId = 0;
    this.closed = false;
  }

  async open() {
    if (!this.WebSocketImpl) throw new Error('WebSocket support unavailable');
    this.ws = new this.WebSocketImpl(this.url);
    this.ws.addEventListener('message', event => {
      try {
        if (typeof event.data !== 'string' || event.data.length > 4194304) return;
        const message = JSON.parse(event.data);
        if (message.id) {
          const item = this.pending.get(message.id);
          if (!item) return;
          this.pending.delete(message.id);
          clearTimeout(item.timer);
          if (message.error) item.reject(new Error(`CDP error ${message.error.code}`));
          else item.resolve(message.result || {});
        } else if (message.method) {
          this.onEvent(message);
        }
      } catch { /* ignore malformed events */ }
    });
    this.ws.addEventListener('close', () => this.disconnect());
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.close(); reject(new Error('Renderer connection timeout')); }, this.timeout);
      this.ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      this.ws.addEventListener('error', () => { clearTimeout(timer); this.close(); reject(new Error('Renderer connection failed')); }, { once: true });
    });
    return this;
  }

  command(method, params = {}) {
    if (this.closed || this.ws?.readyState !== 1) return Promise.reject(new Error('Renderer disconnected'));
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Renderer command timeout')); }, this.timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  disconnect() {
    if (this.closed) return;
    this.closed = true;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error('Renderer disconnected'));
    }
    this.pending.clear();
    this.onClose();
  }

  close() {
    this.disconnect();
    this.ws?.close();
  }
}

function rendererBridge(binding) {
  if (window !== window.top) return;
  if (window.__agyProjectSidebarBridge && window.__agyProjectSidebarHost) return;
  window.__agyProjectSidebarBridge?.dispose?.();
  const pending = new Map();
  let seq = 0;
  const offline = () => ({ offline: true, projects: [], conversations: [], stats: { totalProjects: 0, totalConversations: 0, runningCount: 0 } });
  const call = (type, input = {}) => new Promise(resolve => {
    if (pending.size >= 8) { resolve(offline()); return; }
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); resolve(offline()); }, 15000);
    pending.set(id, { resolve, timer });
    try {
      window[binding](JSON.stringify({ id, type, input }));
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      resolve(offline());
    }
  });
  window.__agyProjectSidebarBridge = {
    binding,
    resolve(id, result) {
      const item = pending.get(id);
      if (!item) return;
      clearTimeout(item.timer);
      pending.delete(id);
      item.resolve(result);
    },
    reconnect() {
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.resolve(offline());
      }
      pending.clear();
    },
    dispose() {
      for (const item of pending.values()) {
        clearTimeout(item.timer);
        item.resolve(offline());
      }
      pending.clear();
      delete window.__agyProjectSidebarBridge;
    },
  };
  window.__agyProjectSidebarHost = {
    getTree: input => call('tree', input),
    getPreferences: () => call('preferences', {}),
    setPreferences: input => call('preferences', input),
  };
}

function extractExport(source) {
  const marker = 'module.exports = ';
  const idx = source.indexOf(marker);
  if (idx < 0) throw new Error('Invalid CJS module format');
  return source.slice(idx + marker.length).trim().replace(/;$/, '');
}

export function makeRendererSource(i18nSource, widgetSource, owner = null, generation = 0) {
  const version = createHash('sha256').update(i18nSource + widgetSource + rendererBridge.toString() + JSON.stringify(owner)).digest('hex');
  const upgrade = `if(window.__agyProjectSidebarVersion!==${JSON.stringify(version)}){window.__agyProjectSidebarDispose?.();window.__agyProjectSidebarBridge?.dispose();delete window.__agyProjectSidebarHost;window.__agyProjectSidebarVersion=${JSON.stringify(version)};}`;
  const binding = owner ? `${BINDING}_${owner.replace(/[^a-zA-Z0-9_]/g, '')}` : BINDING;
  const rank = JSON.stringify([generation, owner || '']);
  const code =
    upgrade +
    `window.__agyProjectSidebarOwner=${JSON.stringify(owner)};` +
    `window.__agyProjectSidebarRank=${rank};` +
    `(${rendererBridge.toString()})(${JSON.stringify(binding)});` +
    `window.__agyProjectSidebarI18nFactory=(${extractExport(i18nSource)});` +
    `(${extractExport(widgetSource)})();`;
  if (!owner) return code;
  return `if(!window.__agyProjectSidebarRank||window.__agyProjectSidebarRank[0]<${generation}||(window.__agyProjectSidebarRank[0]===${generation}&&window.__agyProjectSidebarRank[1]<=${JSON.stringify(owner)})){${code}}`;
}

export class RuntimeUi {
  constructor({
    snapshot,
    preferences,
    source,
    profile = platformPaths().profile,
    dataDir,
    owner = null,
    owns = async () => true,
    enabled = async () => true,
    discover = discoverTargets,
    connect = (url, options) => new CdpConnection(url, options),
    interval = 3000,
  }) {
    this.snapshot = snapshot;
    this.preferences = preferences;
    this.source = source;
    this.profile = profile;
    this.dataDir = dataDir;
    this.owner = owner;
    this.owns = owns;
    this.enabled = enabled;
    this.discover = discover;
    this.connect = connect;
    this.interval = interval;
    this.sessions = new Map();
    this.running = false;
    this.stopping = false;
    this.busy = false;
    this.binding = owner ? `${BINDING}_${owner.replace(/[^a-zA-Z0-9_]/g, '')}` : BINDING;
    this.health = { state: 'waiting', mode: 'runtime', message: 'Waiting for Antigravity renderer', windows: 0 };
  }

  rendererGuard(expr) {
    return this.owner ? `if(window.__agyProjectSidebarOwner===${JSON.stringify(this.owner)}){${expr}}` : expr;
  }

  async setHealth(state, message) {
    this.health = { state, mode: 'runtime', message, windows: this.sessions.size, checkedAt: new Date().toISOString() };
    if (this.dataDir && await this.owns()) {
      try {
        await mkdir(this.dataDir, { recursive: true });
        await writeFile(join(this.dataDir, 'integration-state.json'), JSON.stringify(this.health, null, 2) + '\n');
      } catch { /* non-fatal */ }
    }
  }

  async event(connection, message) {
    if (this.stopping || connection.closed) return;
    const p = message.params || {};
    if (message.method === 'Page.frameNavigated' && p.frame && !p.frame.parentId) {
      const replaced = connection.frameId !== p.frame.id;
      connection.generation++;
      connection.frameId = p.frame.id;
      connection.contexts.clear();
      const trusted = p.frame.url === connection.origin || p.frame.url?.startsWith(`${connection.origin}/`);
      if (replaced && trusted) {
        for (const [id, ctx] of connection.contextCandidates) {
          if (ctx.frameId === connection.frameId && ctx.origin === connection.origin) connection.contexts.add(id);
        }
      }
      return;
    }
    if (message.method === 'Runtime.executionContextCreated') {
      if (p.context?.auxData?.isDefault) {
        connection.contextCandidates.set(p.context.id, { frameId: p.context.auxData.frameId, origin: p.context.origin });
        if (connection.contextCandidates.size > 32) connection.contextCandidates.delete(connection.contextCandidates.keys().next().value);
        if (p.context.auxData.frameId === connection.frameId && p.context.origin === connection.origin) connection.contexts.add(p.context.id);
      }
      return;
    }
    if (message.method === 'Runtime.executionContextsCleared') {
      connection.generation++;
      connection.contexts.clear();
      connection.contextCandidates.clear();
      return;
    }
    if (message.method === 'Runtime.executionContextDestroyed') {
      if (connection.contexts.has(p.executionContextId)) connection.generation++;
      connection.contexts.delete(p.executionContextId);
      connection.contextCandidates.delete(p.executionContextId);
      return;
    }
    if (message.method !== 'Runtime.bindingCalled' || p.name !== this.binding || !connection.contexts.has(p.executionContextId)) return;
    if (!await this.owns() || connection.closed || !connection.contexts.has(p.executionContextId)) return;
    if (typeof p.payload !== 'string' || p.payload.length > 8192 || connection.inflight >= 8) return;

    let req;
    try {
      req = JSON.parse(p.payload);
      if (!Number.isSafeInteger(req.id) || req.id < 1) return;
    } catch {
      return;
    }

    const gen = connection.generation;
    const isCurrent = () => !connection.closed && connection.generation === gen && connection.contexts.has(p.executionContextId);
    connection.inflight++;
    try {
      let result = {};
      if (req.type === 'tree') {
        const prefs = await this.preferences.get();
        const tree = await this.snapshot({ force: req.input?.force === true, showArchived: prefs.showArchived });
        result = { ...tree, preferences: prefs };
      } else if (req.type === 'preferences') {
        const patch = req.input && typeof req.input === 'object' ? req.input : {};
        result = Object.keys(patch).length ? await this.preferences.set(patch) : await this.preferences.get();
      } else {
        return;
      }
      if (this.stopping || !await this.owns() || !isCurrent()) return;
      await connection.command('Runtime.evaluate', {
        expression: this.rendererGuard(`window.__agyProjectSidebarBridge?.resolve(${req.id},${JSON.stringify(result)})`),
        contextId: p.executionContextId,
      });
    } catch (error) {
      if (this.stopping || !await this.owns() || !isCurrent()) return;
      try {
        await connection.command('Runtime.evaluate', {
          expression: this.rendererGuard(`window.__agyProjectSidebarBridge?.resolve(${req.id},${JSON.stringify({ offline: true, error: error.message })})`),
          contextId: p.executionContextId,
        });
      } catch { /* retry next poll */ }
    } finally {
      connection.inflight--;
    }
  }

  async attach(target) {
    const connection = this.connect(target.webSocketDebuggerUrl, { onEvent: msg => { void this.event(connection, msg); } });
    connection.origin = new URL(target.url).origin;
    connection.generation = 0;
    connection.contexts = new Set();
    connection.contextCandidates = new Map();
    connection.inflight = 0;

    try {
      await connection.open();
      if (this.stopping || !await this.owns()) throw new Error('Sidecar ownership changed');
      const frame = await connection.command('Page.getFrameTree');
      connection.frameId = frame.frameTree?.frame?.id;
      if (!connection.frameId) throw new Error('Main renderer frame unavailable');
      await connection.command('Page.enable');
      await connection.command('Runtime.enable');
      await connection.command('Runtime.addBinding', { name: this.binding });
      const guardedSource = `if(location.origin===${JSON.stringify(connection.origin)}){${this.source}}`;
      connection.guardedSource = guardedSource;
      connection.script = (await connection.command('Page.addScriptToEvaluateOnNewDocument', { source: guardedSource })).identifier;
      const evalResult = await connection.command('Runtime.evaluate', { expression: guardedSource });
      if (evalResult.exceptionDetails) throw new Error('Sidebar widget initialization failed');
      return connection;
    } catch (error) {
      try { if (connection.script) await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.script }); } catch {}
      try { await connection.command('Runtime.removeBinding', { name: this.binding }); } catch {}
      connection.close();
      throw error;
    }
  }

  async detach(connection) {
    if (!connection) return;
    try { if (connection.script) await connection.command('Page.removeScriptToEvaluateOnNewDocument', { identifier: connection.script }); } catch {}
    try { await connection.command('Runtime.removeBinding', { name: this.binding }); } catch {}
    try { await connection.command('Runtime.evaluate', { expression: this.rendererGuard('window.__agyProjectSidebarDispose?.();') }); } catch {}
    connection.close();
  }

  async detachAll() {
    for (const connection of this.sessions.values()) await this.detach(connection);
    this.sessions.clear();
  }

  async tick() {
    if (this.busy || this.stopping) return;
    this.busy = true;
    try {
      if (!await this.owns()) { await this.detachAll(); return; }
      if (!await this.enabled()) { await this.detachAll(); await this.setHealth('disabled', 'Sidebar plugin is disabled'); return; }
      const targets = await this.discover(this.profile);
      const activeUrls = new Set(targets.map(t => t.webSocketDebuggerUrl));

      for (const [url, conn] of this.sessions) {
        if (!activeUrls.has(url) || conn.closed || conn.origin !== new URL(url.startsWith('ws') ? targets.find(t => t.webSocketDebuggerUrl === url)?.url || 'http://invalid' : 'http://invalid').origin) {
          await this.detach(conn);
          this.sessions.delete(url);
        }
      }
      for (const target of targets) {
        if (!this.sessions.has(target.webSocketDebuggerUrl)) {
          this.sessions.set(target.webSocketDebuggerUrl, await this.attach(target));
        }
      }
      for (const [url, conn] of this.sessions) {
        try {
          if (!conn.contexts.size) {
            const frame = await conn.command('Page.getFrameTree');
            conn.frameId = frame.frameTree?.frame?.id;
            conn.contextCandidates.clear();
            await conn.command('Runtime.disable');
            await conn.command('Runtime.enable');
            await conn.command('Runtime.addBinding', { name: this.binding });
            await conn.command('Runtime.evaluate', { expression: this.rendererGuard('window.__agyProjectSidebarBridge?.reconnect?.();') });
          }
          const check = await conn.command('Runtime.evaluate', {
            returnByValue: true,
            expression: `({mounted:Boolean(document.getElementById("agy-project-sidebar-host")?.isConnected),bridge:Boolean(window.__agyProjectSidebarBridge && window.__agyProjectSidebarHost && window.__agyProjectSidebarBridge.binding===${JSON.stringify(this.binding)})})`,
          });
          if (!check.result?.value?.mounted || !check.result?.value?.bridge) {
            await conn.command('Runtime.evaluate', { expression: conn.guardedSource });
          }
        } catch {
          await this.detach(conn);
          this.sessions.delete(url);
        }
      }
      await this.setHealth(this.sessions.size ? 'attached' : 'waiting', this.sessions.size ? `Attached to ${this.sessions.size} renderer window(s)` : 'Waiting for Antigravity workbench window');
    } catch (error) {
      await this.setHealth('waiting', error.message || 'Renderer unavailable');
    } finally {
      this.busy = false;
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.stopping = false;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.interval);
    this.timer.unref?.();
  }

  async stop() {
    this.stopping = true;
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    await this.detachAll();
  }
}

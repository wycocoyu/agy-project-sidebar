module.exports = function mountProjectSidebarWidget() {
  if (window !== window.top) return;
  if (window.__agyProjectSidebarInstalled) return;
  window.__agyProjectSidebarInstalled = true;

  const STYLE_ID = 'agy-project-sidebar-style';
  const HOST_ID = 'agy-project-sidebar-host';

  const getI18n = lang => (typeof window.__agyProjectSidebarI18nFactory === 'function' ? window.__agyProjectSidebarI18nFactory(lang) : {});

  const CSS = `
#${HOST_ID} {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: var(--foreground, #1f2328);
  pointer-events: none;
}
#${HOST_ID} * { box-sizing: border-box; }
.agy-ps-drawer {
  position: fixed;
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  background: var(--sidebar, var(--background, #f3f3f3));
  color: var(--foreground, #1f2328);
  border-top: 1px solid var(--border, rgba(127,127,127,0.18));
  overflow: hidden;
  user-select: none;
}
.agy-ps-drawer.is-floating {
  border-right: 1px solid var(--border, rgba(127,127,127,0.22));
  border-top-right-radius: 10px;
  border-bottom-right-radius: 10px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.16);
}
.agy-ps-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px 4px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,0.14));
}
.agy-ps-segmented {
  display: inline-flex;
  background: color-mix(in srgb, var(--foreground, #1f2328) 6%, transparent);
  border-radius: 6px;
  padding: 2px;
  gap: 2px;
}
.agy-ps-seg-btn {
  border: none;
  background: transparent;
  color: var(--muted-foreground, #656d76);
  font-size: 11px;
  font-weight: 500;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.agy-ps-seg-btn.active {
  background: var(--background, #ffffff);
  color: var(--foreground, #1f2328);
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
  font-weight: 600;
}
.agy-ps-actions {
  display: flex;
  align-items: center;
  gap: 3px;
}
.agy-ps-icon-btn {
  border: 1px solid transparent;
  background: transparent;
  color: var(--muted-foreground, #656d76);
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 5px;
  cursor: pointer;
}
.agy-ps-icon-btn:hover {
  background: color-mix(in srgb, var(--foreground, #1f2328) 7%, transparent);
  color: var(--foreground, #1f2328);
}
.agy-ps-controls {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  border-bottom: 1px solid var(--border, rgba(127,127,127,0.12));
}
.agy-ps-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
}
.agy-ps-search {
  width: 100%;
  border: 1px solid var(--border, rgba(127,127,127,0.22));
  background: var(--background, rgba(255,255,255,0.75));
  color: var(--foreground, #1f2328);
  border-radius: 6px;
  padding: 4px 22px 4px 8px;
  font-size: 11px;
  outline: none;
}
.agy-ps-search:focus {
  border-color: var(--primary, #2F71E3);
}
.agy-ps-clear-btn {
  position: absolute;
  right: 4px;
  border: none;
  background: transparent;
  color: var(--muted-foreground, #656d76);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
}
.agy-ps-dims {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  flex-wrap: wrap;
}
.agy-ps-dim-group {
  display: flex;
  align-items: center;
  gap: 4px;
}
.agy-ps-chip {
  border: 1px solid var(--border, rgba(127,127,127,0.22));
  background: transparent;
  color: var(--muted-foreground, #656d76);
  border-radius: 999px;
  padding: 2px 7px;
  font-size: 10.5px;
  font-weight: 500;
  cursor: pointer;
}
.agy-ps-chip.active {
  border-color: color-mix(in srgb, var(--primary, #2F71E3) 45%, transparent);
  background: color-mix(in srgb, var(--primary, #2F71E3) 13%, transparent);
  color: var(--primary, #2F71E3);
  font-weight: 600;
}
.agy-ps-stats {
  font-size: 10.5px;
  color: var(--muted-foreground, #656d76);
}
.agy-ps-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 6px 14px;
}
.agy-ps-group {
  margin-bottom: 6px;
}
.agy-ps-proj-hdr {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 600;
  font-size: 11.5px;
  color: var(--foreground, #1f2328);
}
.agy-ps-proj-hdr:hover {
  background: color-mix(in srgb, var(--foreground, #1f2328) 6%, transparent);
}
.agy-ps-caret {
  width: 12px;
  display: inline-flex;
  justify-content: center;
  font-size: 9px;
  color: var(--muted-foreground, #656d76);
  transition: transform 0.12s ease;
}
.agy-ps-caret.collapsed { transform: rotate(-90deg); }
.agy-ps-proj-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-ps-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground, #1f2328) 8%, transparent);
  color: var(--muted-foreground, #656d76);
}
.agy-ps-badge.running {
  background: color-mix(in srgb, #16a34a 15%, transparent);
  color: #16a34a;
}
.agy-ps-children {
  padding-left: 10px;
  margin-top: 2px;
}
.agy-ps-req-card {
  margin: 4px 0 6px;
  border: 1px solid var(--border, rgba(127,127,127,0.16));
  border-left: 3px solid color-mix(in srgb, var(--primary, #2F71E3) 72%, transparent);
  border-radius: 7px;
  background: color-mix(in srgb, var(--background, #ffffff) 65%, var(--sidebar, #f3f3f3));
  overflow: hidden;
}
.agy-ps-req-card.is-inbox {
  border-left-color: var(--muted-foreground, rgba(127,127,127,0.45));
  background: color-mix(in srgb, var(--foreground, #1f2328) 2.5%, transparent);
}
.agy-ps-req-hdr {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 7px;
  cursor: pointer;
  font-weight: 600;
  font-size: 11px;
}
.agy-ps-req-hdr:hover {
  background: color-mix(in srgb, var(--foreground, #1f2328) 5%, transparent);
}
.agy-ps-req-icon {
  color: var(--primary, #2F71E3);
  font-size: 11px;
  flex-shrink: 0;
}
.agy-ps-req-card.is-inbox .agy-ps-req-icon {
  color: var(--muted-foreground, #656d76);
}
.agy-ps-req-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-ps-req-body {
  padding: 2px 4px 4px 10px;
}
.agy-ps-conv-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 5px;
  cursor: pointer;
  color: var(--foreground, #1f2328);
  font-size: 11.5px;
  border-left: 2px solid transparent;
}
.agy-ps-conv-row:hover {
  background: color-mix(in srgb, var(--foreground, #1f2328) 6%, transparent);
}
.agy-ps-conv-row.active {
  background: color-mix(in srgb, var(--primary, #2F71E3) 14%, transparent);
  border-left-color: var(--primary, #2F71E3);
  font-weight: 600;
}
.agy-ps-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--muted-foreground, #888) 45%, transparent);
}
.agy-ps-dot.running {
  background: #16a34a;
  box-shadow: 0 0 0 3px color-mix(in srgb, #16a34a 22%, transparent);
}
.agy-ps-conv-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-ps-conv-meta {
  font-size: 10px;
  color: var(--muted-foreground, #656d76);
  flex-shrink: 0;
}
.agy-ps-restore-pill {
  position: fixed;
  pointer-events: auto;
  border: 1px solid color-mix(in srgb, var(--primary, #2F71E3) 35%, var(--border, rgba(127,127,127,0.25)));
  background: var(--background, #ffffff);
  color: var(--primary, #2F71E3);
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 999px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
}
.agy-ps-edge-tab {
  position: fixed;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  pointer-events: auto;
  writing-mode: vertical-rl;
  text-orientation: mixed;
  padding: 10px 5px;
  border: 1px solid var(--border, rgba(127,127,127,0.25));
  border-left: none;
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
  background: var(--sidebar, var(--background, #f3f3f3));
  color: var(--foreground, #1f2328);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 2px 0 8px rgba(0,0,0,0.10);
}
.agy-ps-empty {
  padding: 18px 10px;
  text-align: center;
  color: var(--muted-foreground, #656d76);
  font-size: 11.5px;
}
`;

  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  let host = document.getElementById(HOST_ID);
  if (!host) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }

  const state = {
    prefs: {
      language: 'zh-CN',
      viewMode: 'tree',
      drawerPinned: false,
      dimensions: ['project', 'requirement'],
      collapsedIds: [],
      showArchived: false,
    },
    tree: { projects: [], conversations: [], stats: { totalProjects: 0, totalConversations: 0, runningCount: 0 } },
    loaded: false,
    offline: false,
    search: '',
    drawerEl: null,
    treeEl: null,
    listRect: null,
  };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function currentConversationId() {
    const m = location.pathname.match(/^\/c\/([0-9a-f-]+)/i);
    return m ? m[1] : '';
  }

  function formatRelTime(ms, lang) {
    if (!ms) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 60) return lang === 'zh-CN' ? '刚刚' : 'now';
    const min = Math.floor(diffSec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    return `${day}d`;
  }

  function measureSidebarRect() {
    const convList = document.querySelector('[data-testid="conversation-list-sidebar"]');
    const container = convList?.parentElement || convList;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    if (rect.width < 160 || rect.height < 160) return null;
    return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) };
  }

  async function updatePrefs(patch) {
    state.prefs = { ...state.prefs, ...patch };
    render();
    try {
      const saved = await window.__agyProjectSidebarHost?.setPreferences?.(patch);
      if (saved && !saved.offline && !saved.error) {
        state.prefs = saved;
        render();
      }
    } catch { /* ignore */ }
  }

  function isCollapsed(nodeId) {
    return state.prefs.collapsedIds.includes(nodeId);
  }

  function toggleCollapse(nodeId) {
    const set = new Set(state.prefs.collapsedIds);
    if (set.has(nodeId)) set.delete(nodeId);
    else set.add(nodeId);
    void updatePrefs({ collapsedIds: [...set] });
  }

  function getFilteredConversations() {
    const q = state.search.trim().toLowerCase();
    const list = state.tree.conversations || [];
    if (!q) return list;
    return list.filter(c => {
      const hay = `${c.title} ${c.projectName || ''} ${c.reqLabel || ''} ${c.workspaceHint || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }

  function buildGroupBuckets(conversations, dims, t) {
    const hasProj = dims.includes('project');
    const hasReq = dims.includes('requirement');
    const hasStatus = dims.includes('status');

    const groupRequirements = list => {
      const reqMap = new Map();
      for (const conv of list) {
        const key = conv.reqKey || 'INBOX';
        if (!reqMap.has(key)) {
          reqMap.set(key, {
            key,
            isInbox: key === 'INBOX',
            label: key === 'INBOX' ? t.inbox : (conv.reqLabel || key),
            items: [],
            running: 0,
            latestMs: 0,
          });
        }
        const g = reqMap.get(key);
        g.items.push(conv);
        if (conv.status === 'running') g.running += 1;
        if (conv.updatedAtMs > g.latestMs) g.latestMs = conv.updatedAtMs;
      }
      return [...reqMap.values()].sort((a, b) => {
        if (a.isInbox !== b.isInbox) return a.isInbox ? 1 : -1;
        if ((a.running > 0) !== (b.running > 0)) return a.running > 0 ? -1 : 1;
        return b.latestMs - a.latestMs;
      });
    };

    const projectBuckets = list => {
      const pMap = new Map();
      for (const conv of list) {
        const key = conv.projectKey || '__unassigned__';
        if (!pMap.has(key)) {
          pMap.set(key, {
            id: `proj:${key}`,
            label: conv.isUnassigned ? t.unassigned : (conv.projectName || key),
            isUnassigned: Boolean(conv.isUnassigned),
            items: [],
            running: 0,
            latestMs: 0,
          });
        }
        const g = pMap.get(key);
        g.items.push(conv);
        if (conv.status === 'running') g.running += 1;
        if (conv.updatedAtMs > g.latestMs) g.latestMs = conv.updatedAtMs;
      }
      return [...pMap.values()].sort((a, b) => {
        if (a.isUnassigned !== b.isUnassigned) return a.isUnassigned ? 1 : -1;
        if (a.running !== b.running) return b.running - a.running;
        return b.latestMs - a.latestMs;
      });
    };

    const buckets = [];
    if (hasStatus) {
      const running = conversations.filter(c => c.status === 'running');
      if (running.length) {
        buckets.push({
          id: 'status:running',
          label: `⚡ ${t.runningGroup}`,
          isRunningSection: true,
          items: running,
          reqs: hasReq ? groupRequirements(running) : null,
          running: running.length,
        });
      }
    }

    const bodyList = !hasProj && !hasReq && hasStatus ? conversations.filter(c => c.status !== 'running') : conversations;
    if (hasProj) {
      for (const proj of projectBuckets(bodyList)) {
        buckets.push({
          ...proj,
          reqs: hasReq ? groupRequirements(proj.items) : null,
        });
      }
    } else if (hasReq) {
      buckets.push({
        id: 'all:requirements',
        label: null,
        reqs: groupRequirements(bodyList),
        items: bodyList,
        running: bodyList.filter(c => c.status === 'running').length,
      });
    } else if (hasStatus && bodyList.length) {
      buckets.push({
        id: 'status:idle',
        label: t.idleGroup,
        items: bodyList,
        reqs: null,
        running: 0,
      });
    }

    return buckets;
  }

  function collectCollapsibleIds(buckets) {
    const ids = [];
    for (const b of buckets) {
      if (b.label) ids.push(b.id);
      if (b.reqs) {
        for (const r of b.reqs) ids.push(`${b.id}::${r.key}`);
      }
    }
    return ids;
  }

  function navigateConversation(conv) {
    const nextUrl = `/c/${encodeURIComponent(conv.id)}${conv.realProjectId ? `?project=${encodeURIComponent(conv.realProjectId)}` : ''}`;
    if (location.pathname + location.search !== nextUrl) {
      window.history.pushState(null, '', nextUrl);
    }
    setTimeout(render, 60);
  }

  function renderConvRow(conv, activeId, showProjectHint, t) {
    const row = el('div', `agy-ps-conv-row${conv.id === activeId ? ' active' : ''}`);
    row.title = conv.title;
    row.addEventListener('click', () => navigateConversation(conv));
    const dot = el('span', `agy-ps-dot${conv.status === 'running' ? ' running' : ''}`);
    const titleText = conv.title;
    const title = el('span', 'agy-ps-conv-title', titleText);
    const metaLabel = showProjectHint && conv.projectName
      ? `${conv.projectName} · ${formatRelTime(conv.updatedAtMs, state.prefs.language)}`
      : formatRelTime(conv.updatedAtMs, state.prefs.language);
    const meta = el('span', 'agy-ps-conv-meta', metaLabel);
    row.append(dot, title, meta);
    return row;
  }

  function renderReqCard(parentId, req, activeId, showProjectHint, t) {
    const nodeId = `${parentId}::${req.key}`;
    const hasActive = req.items.some(c => c.id === activeId);
    const collapsed = !state.search.trim() && isCollapsed(nodeId) && !hasActive;
    const card = el('div', `agy-ps-req-card${req.isInbox ? ' is-inbox' : ''}`);
    const hdr = el('div', 'agy-ps-req-hdr');
    hdr.addEventListener('click', () => toggleCollapse(nodeId));

    const caret = el('span', `agy-ps-caret${collapsed ? ' collapsed' : ''}`, '▾');
    const icon = el('span', 'agy-ps-req-icon', req.isInbox ? '📥' : '📁');
    const title = el('span', 'agy-ps-req-title', req.label);
    const badge = el('span', `agy-ps-badge${req.running ? ' running' : ''}`, req.running ? `${req.running}/${req.items.length}` : String(req.items.length));
    hdr.append(caret, icon, title, badge);
    card.appendChild(hdr);

    if (!collapsed) {
      const body = el('div', 'agy-ps-req-body');
      for (const conv of req.items) body.appendChild(renderConvRow(conv, activeId, showProjectHint, t));
      card.appendChild(body);
    }
    return card;
  }

  function renderDrawer(rect, floating, t) {
    const prevScroll = state.treeEl ? state.treeEl.scrollTop : 0;
    const drawer = el('div', `agy-ps-drawer${floating ? ' is-floating' : ''}`);
    drawer.id = 'agy-project-sidebar-drawer';
    if (floating) {
      drawer.style.left = '0px';
      drawer.style.top = '44px';
      drawer.style.width = '340px';
      drawer.style.bottom = '0px';
      drawer.style.zIndex = '46';
    } else {
      drawer.style.left = `${rect.left}px`;
      drawer.style.top = `${rect.top}px`;
      drawer.style.width = `${rect.width}px`;
      drawer.style.height = `${rect.height}px`;
      drawer.style.zIndex = '38';
    }

    // Header bar
    const header = el('div', 'agy-ps-header');
    if (floating) {
      const titleSpan = el('span', null, `🗂 ${t.edgeTab}`);
      titleSpan.style.fontWeight = '600';
      header.appendChild(titleSpan);
    } else {
      const seg = el('div', 'agy-ps-segmented');
      const btnTree = el('button', `agy-ps-seg-btn${state.prefs.viewMode === 'tree' ? ' active' : ''}`, t.tabTree);
      const btnNative = el('button', `agy-ps-seg-btn${state.prefs.viewMode === 'native' ? ' active' : ''}`, t.tabNative);
      btnTree.addEventListener('click', () => void updatePrefs({ viewMode: 'tree' }));
      btnNative.addEventListener('click', () => void updatePrefs({ viewMode: 'native' }));
      seg.append(btnTree, btnNative);
      header.appendChild(seg);
    }

    const filtered = getFilteredConversations();
    const buckets = buildGroupBuckets(filtered, state.prefs.dimensions, t);
    const allIds = collectCollapsibleIds(buckets);
    const allCollapsed = allIds.length > 0 && allIds.every(id => state.prefs.collapsedIds.includes(id));

    const actions = el('div', 'agy-ps-actions');
    const toggleAllBtn = el('button', 'agy-ps-icon-btn', allCollapsed ? t.expandAll : t.collapseAll);
    toggleAllBtn.addEventListener('click', () => {
      void updatePrefs({ collapsedIds: allCollapsed ? [] : allIds.slice(0, 500) });
    });
    const refreshBtn = el('button', 'agy-ps-icon-btn', '↻');
    refreshBtn.title = t.refresh;
    refreshBtn.addEventListener('click', () => void pollTree(true));
    const langBtn = el('button', 'agy-ps-icon-btn', t.toggleLang);
    langBtn.addEventListener('click', () => void updatePrefs({ language: state.prefs.language === 'zh-CN' ? 'en' : 'zh-CN' }));
    actions.append(toggleAllBtn, refreshBtn, langBtn);

    if (floating) {
      const closeBtn = el('button', 'agy-ps-icon-btn', '✕');
      closeBtn.title = t.closeDrawer;
      closeBtn.addEventListener('click', () => void updatePrefs({ drawerPinned: false }));
      actions.appendChild(closeBtn);
    }
    header.appendChild(actions);
    drawer.appendChild(header);

    // Search & dimension chips
    const controls = el('div', 'agy-ps-controls');
    const searchWrap = el('div', 'agy-ps-search-wrap');
    const searchInput = el('input', 'agy-ps-search');
    searchInput.type = 'text';
    searchInput.placeholder = t.searchPlaceholder;
    searchInput.value = state.search;
    searchInput.addEventListener('input', e => {
      state.search = e.target.value;
      renderTreeOnly(drawer);
    });
    searchWrap.appendChild(searchInput);
    if (state.search) {
      const clr = el('button', 'agy-ps-clear-btn', '×');
      clr.addEventListener('click', () => { state.search = ''; render(); });
      searchWrap.appendChild(clr);
    }
    controls.appendChild(searchWrap);

    const dimsRow = el('div', 'agy-ps-dims');
    const dimGroup = el('div', 'agy-ps-dim-group');
    for (const [dim, label] of [['project', t.dimProject], ['requirement', t.dimRequirement], ['status', t.dimStatus]]) {
      const active = state.prefs.dimensions.includes(dim);
      const chip = el('button', `agy-ps-chip${active ? ' active' : ''}`, label);
      chip.addEventListener('click', () => {
        const next = active ? state.prefs.dimensions.filter(d => d !== dim) : [...state.prefs.dimensions, dim];
        if (!next.length) return;
        void updatePrefs({ dimensions: next });
      });
      dimGroup.appendChild(chip);
    }
    const stats = state.tree.stats || { totalProjects: 0, totalConversations: 0, runningCount: 0 };
    const statsEl = el('span', 'agy-ps-stats', `${stats.totalProjects} ${t.projectsUnit} · ${filtered.length}/${stats.totalConversations}`);
    dimsRow.append(dimGroup, statsEl);
    controls.appendChild(dimsRow);
    drawer.appendChild(controls);

    const treeContainer = el('div', 'agy-ps-tree');
    treeContainer.id = 'agy-project-sidebar-tree';
    state.treeEl = treeContainer;
    populateTree(treeContainer, buckets, t);
    drawer.appendChild(treeContainer);
    treeContainer.scrollTop = prevScroll;
    return drawer;
  }

  function populateTree(treeContainer, buckets, t) {
    treeContainer.textContent = '';
    if (!state.loaded) {
      treeContainer.appendChild(el('div', 'agy-ps-empty', t.loading));
      return;
    }
    if (state.offline && !buckets.length) {
      treeContainer.appendChild(el('div', 'agy-ps-empty', t.offline));
      return;
    }
    if (!buckets.length) {
      treeContainer.appendChild(el('div', 'agy-ps-empty', t.empty));
      return;
    }
    const activeId = currentConversationId();
    const showProjectHint = !state.prefs.dimensions.includes('project');

    for (const bucket of buckets) {
      if (!bucket.label) {
        if (bucket.reqs) {
          for (const req of bucket.reqs) treeContainer.appendChild(renderReqCard(bucket.id, req, activeId, showProjectHint, t));
        }
        continue;
      }

      const group = el('div', 'agy-ps-group');
      const hasActive = bucket.items.some(c => c.id === activeId);
      const collapsed = !state.search.trim() && isCollapsed(bucket.id) && !hasActive;
      const hdr = el('div', 'agy-ps-proj-hdr');
      hdr.addEventListener('click', () => toggleCollapse(bucket.id));
      const caret = el('span', `agy-ps-caret${collapsed ? ' collapsed' : ''}`, '▾');
      const name = el('span', 'agy-ps-proj-name', bucket.label);
      const badge = el('span', `agy-ps-badge${bucket.running ? ' running' : ''}`, bucket.running ? `${bucket.running}/${bucket.items.length}` : String(bucket.items.length));
      hdr.append(caret, name, badge);
      group.appendChild(hdr);

      if (!collapsed) {
        const children = el('div', 'agy-ps-children');
        if (bucket.reqs) {
          for (const req of bucket.reqs) children.appendChild(renderReqCard(bucket.id, req, activeId, showProjectHint || bucket.isRunningSection, t));
        } else {
          for (const conv of bucket.items) children.appendChild(renderConvRow(conv, activeId, showProjectHint || bucket.isRunningSection, t));
        }
        group.appendChild(children);
      }
      treeContainer.appendChild(group);
    }
  }

  function renderTreeOnly(drawer) {
    const t = getI18n(state.prefs.language);
    const filtered = getFilteredConversations();
    const buckets = buildGroupBuckets(filtered, state.prefs.dimensions, t);
    const treeEl = drawer.querySelector('#agy-project-sidebar-tree');
    if (treeEl) populateTree(treeEl, buckets, t);
    const statsEl = drawer.querySelector('.agy-ps-stats');
    const stats = state.tree.stats || { totalProjects: 0, totalConversations: 0 };
    if (statsEl) statsEl.textContent = `${stats.totalProjects} ${t.projectsUnit} · ${filtered.length}/${stats.totalConversations}`;
  }

  function render() {
    if (!host.isConnected) document.body.appendChild(host);
    const t = getI18n(state.prefs.language);
    const rect = (state.listRect = measureSidebarRect());
    const activeEl = document.activeElement;
    const preserveFocus = activeEl && host.contains(activeEl) && activeEl.classList.contains('agy-ps-search');
    const cursorPos = preserveFocus ? activeEl.selectionStart : null;

    host.textContent = '';
    if (rect && state.prefs.viewMode === 'tree') {
      const drawer = renderDrawer(rect, false, t);
      host.appendChild(drawer);
    } else if (rect && state.prefs.viewMode === 'native') {
      const stats = state.tree.stats || { totalProjects: 0 };
      const pill = el('button', 'agy-ps-restore-pill', `🗂 ${t.restorePill} · ${stats.totalProjects}`);
      pill.id = 'agy-project-sidebar-restore-pill';
      pill.style.top = `${rect.top + 6}px`;
      pill.style.left = `${Math.max(rect.left + 8, rect.right - 120)}px`;
      pill.style.zIndex = '39';
      pill.addEventListener('click', () => void updatePrefs({ viewMode: 'tree' }));
      host.appendChild(pill);
    } else {
      if (state.prefs.drawerPinned) {
        host.appendChild(renderDrawer(null, true, t));
      } else {
        const edge = el('button', 'agy-ps-edge-tab', `🗂 ${t.edgeTab}`);
        edge.id = 'agy-project-sidebar-edge-tab';
        edge.style.zIndex = '45';
        edge.addEventListener('click', () => void updatePrefs({ drawerPinned: true }));
        host.appendChild(edge);
      }
    }

    if (preserveFocus) {
      const nextSearch = host.querySelector('.agy-ps-search');
      if (nextSearch) {
        nextSearch.focus();
        if (cursorPos != null) nextSearch.setSelectionRange(cursorPos, cursorPos);
      }
    }
  }

  let polling = false;
  async function pollTree(force = false) {
    if (polling) return;
    polling = true;
    try {
      const res = await window.__agyProjectSidebarHost?.getTree?.({ force });
      if (res && !res.offline) {
        state.tree = res;
        if (res.preferences) state.prefs = { ...state.prefs, ...res.preferences };
        state.loaded = true;
        state.offline = false;
        render();
      } else if (res?.offline) {
        state.offline = true;
        if (!state.loaded) render();
      }
    } finally {
      polling = false;
    }
  }

  let layoutScheduled = false;
  const scheduleLayoutRender = () => {
    if (layoutScheduled) return;
    layoutScheduled = true;
    requestAnimationFrame(() => {
      layoutScheduled = false;
      const nextRect = measureSidebarRect();
      const prev = state.listRect;
      const changed = Boolean(nextRect) !== Boolean(prev) || (nextRect && prev && (
        nextRect.left !== prev.left || nextRect.top !== prev.top || nextRect.width !== prev.width || nextRect.height !== prev.height
      ));
      if (changed) render();
    });
  };

  const ro = new ResizeObserver(scheduleLayoutRender);
  const attachObserved = () => {
    const target = document.querySelector('[data-testid="conversation-list-sidebar"]')?.parentElement || document.body;
    ro.disconnect();
    ro.observe(target);
  };
  attachObserved();

  const mo = new MutationObserver(() => {
    attachObserved();
    scheduleLayoutRender();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', scheduleLayoutRender);
  window.addEventListener('popstate', render);

  const pollTimer = setInterval(() => void pollTree(false), 4000);
  render();
  void pollTree(true);

  window.__agyProjectSidebarDispose = () => {
    clearInterval(pollTimer);
    ro.disconnect();
    mo.disconnect();
    window.removeEventListener('resize', scheduleLayoutRender);
    window.removeEventListener('popstate', render);
    host.remove();
    document.getElementById(STYLE_ID)?.remove();
    delete window.__agyProjectSidebarInstalled;
  };
};

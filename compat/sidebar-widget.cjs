module.exports = function mountProjectSidebarWidget() {
  if (window !== window.top) return;
  if (window.__agyProjectSidebarInstalled) return;
  window.__agyProjectSidebarInstalled = true;

  const STYLE_ID = 'agy-project-sidebar-style';
  const HOST_ID = 'agy-project-sidebar-host';
  const FILTER_OFFSET_CLASS = 'agy-req-filter-mounted';

  const getI18n = lang => (typeof window.__agyProjectSidebarI18nFactory === 'function' ? window.__agyProjectSidebarI18nFactory(lang) : {});

  const CSS = `
.${FILTER_OFFSET_CLASS} {
  padding-top: 46px !important;
}
#${HOST_ID} {
  font-family: "Google Sans Flex", "Google Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 12px;
  line-height: 1.4;
  color: var(--foreground, #000000);
  pointer-events: none;
}
#${HOST_ID} * { box-sizing: border-box; }
.agy-req-bar {
  position: fixed;
  pointer-events: auto;
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--sidebar, #f3f3f3);
  z-index: 15;
  user-select: none;
}
.agy-req-trigger {
  flex: 0 1 auto;
  min-width: 0;
  max-width: 58%;
  height: 28px;
  padding: 0 8px;
  border-radius: 7px;
  border: 1px solid var(--border, rgba(10,10,12,0.11));
  background: color-mix(in srgb, var(--foreground, #000000) 3%, var(--sidebar, #f3f3f3));
  color: var(--foreground, #000000);
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease;
}
.agy-req-trigger:hover {
  background: var(--sidebar-muted, rgba(10,10,12,0.07));
}
.agy-req-trigger.is-active {
  border-color: color-mix(in srgb, var(--primary, #2f71e3) 45%, var(--border, rgba(10,10,12,0.11)));
  background: color-mix(in srgb, var(--primary, #2f71e3) 10%, var(--sidebar, #f3f3f3));
  color: var(--primary, #2f71e3);
}
.agy-req-trigger-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-req-trigger-count {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted-foreground, #52525b);
  font-variant-numeric: tabular-nums;
}
.agy-req-trigger.is-active .agy-req-trigger-count {
  color: var(--primary, #2f71e3);
}
.agy-req-inline-clear {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 4px;
  font-size: 12px;
  line-height: 1;
  opacity: 0.72;
}
.agy-req-inline-clear:hover {
  background: color-mix(in srgb, var(--foreground, #000000) 12%, transparent);
  opacity: 1;
}
.agy-req-search-wrap {
  position: relative;
  flex: 1 1 auto;
  min-width: 80px;
  display: flex;
  align-items: center;
}
.agy-req-search {
  width: 100%;
  height: 28px;
  border-radius: 7px;
  border: 1px solid var(--border, rgba(10,10,12,0.11));
  background: transparent;
  color: var(--foreground, #000000);
  padding: 0 22px 0 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.agy-req-search::placeholder {
  color: var(--muted-foreground, #52525b);
  opacity: 0.85;
}
.agy-req-search:focus {
  border-color: var(--primary, #2f71e3);
  background: var(--background, #ffffff);
}
.agy-req-search-clear {
  position: absolute;
  right: 4px;
  border: none;
  background: transparent;
  color: var(--muted-foreground, #52525b);
  width: 18px;
  height: 18px;
  border-radius: 4px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  padding: 0;
}
.agy-req-search-clear:hover {
  background: var(--sidebar-muted, rgba(10,10,12,0.07));
  color: var(--foreground, #000000);
}
.agy-req-popover {
  position: fixed;
  pointer-events: auto;
  background: var(--background, #ffffff);
  color: var(--foreground, #000000);
  border: 1px solid var(--border, rgba(10,10,12,0.14));
  border-radius: 10px;
  box-shadow: 0 10px 28px rgba(0,0,0,0.14);
  z-index: 35;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  max-height: 440px;
}
.agy-req-pop-top {
  padding: 8px 8px 6px;
  border-bottom: 1px solid var(--border, rgba(10,10,12,0.1));
}
.agy-req-pop-search {
  width: 100%;
  height: 28px;
  border-radius: 6px;
  border: 1px solid var(--border, rgba(10,10,12,0.12));
  background: color-mix(in srgb, var(--foreground, #000000) 3%, transparent);
  color: var(--foreground, #000000);
  padding: 0 8px;
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
.agy-req-pop-search:focus {
  border-color: var(--primary, #2f71e3);
  background: var(--background, #ffffff);
}
.agy-req-pop-list {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 4px;
}
.agy-req-pop-section {
  padding: 5px 8px 3px;
  font-size: 11px;
  font-weight: 500;
  color: var(--muted-foreground, #52525b);
  opacity: 0.78;
}
.agy-req-pop-divider {
  height: 1px;
  background: var(--border, rgba(10,10,12,0.08));
  margin: 4px 6px;
}
.agy-req-pop-item {
  width: 100%;
  border: none;
  background: transparent;
  color: inherit;
  border-radius: 7px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 12px;
}
.agy-req-pop-item:hover {
  background: var(--sidebar-muted, rgba(10,10,12,0.07));
}
.agy-req-pop-item.is-selected {
  background: color-mix(in srgb, var(--primary, #2f71e3) 12%, transparent);
  color: var(--primary, #2f71e3);
  font-weight: 600;
}
.agy-req-pop-item-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-req-pop-item-meta {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted-foreground, #52525b);
  font-variant-numeric: tabular-nums;
}
.agy-req-pop-item-proj {
  max-width: 96px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-req-pop-item-count {
  flex-shrink: 0;
  padding: 0 5px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground, #000000) 6%, transparent);
  font-size: 10.5px;
  line-height: 1.5;
}
.agy-req-pop-footer {
  padding: 6px 10px;
  border-top: 1px solid var(--border, rgba(10,10,12,0.08));
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--muted-foreground, #52525b);
}
.agy-req-lang-btn {
  border: 1px solid var(--border, rgba(10,10,12,0.12));
  background: transparent;
  color: inherit;
  border-radius: 5px;
  padding: 1px 6px;
  font-size: 11px;
  cursor: pointer;
}
.agy-req-lang-btn:hover {
  background: var(--sidebar-muted, rgba(10,10,12,0.07));
}
.agy-req-results {
  position: fixed;
  pointer-events: auto;
  background: var(--sidebar, #f3f3f3);
  z-index: 14;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.agy-req-results-hdr {
  padding: 4px 10px 6px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11.5px;
  color: var(--muted-foreground, #52525b);
  border-bottom: 1px solid var(--border, rgba(10,10,12,0.07));
  flex-shrink: 0;
}
.agy-req-results-hdr-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.agy-req-clear-link {
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--primary, #2f71e3);
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  padding: 2px 5px;
  border-radius: 5px;
}
.agy-req-clear-link:hover {
  background: color-mix(in srgb, var(--primary, #2f71e3) 10%, transparent);
}
.agy-req-results-scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 4px 8px 16px;
}
.agy-req-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--foreground, #000000);
  border-radius: 8px;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background-color 100ms ease;
}
.agy-req-row:hover {
  background: var(--sidebar-muted, rgba(10,10,12,0.07));
}
.agy-req-row.is-active {
  background: var(--sidebar-muted, rgba(10,10,12,0.09));
}
.agy-req-row-top {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
}
.agy-req-row-title {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 400;
  color: var(--foreground, #000000);
}
.agy-req-row.is-active .agy-req-row-title {
  font-weight: 500;
}
.agy-req-row-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--muted-foreground, #52525b);
  opacity: 0.78;
  font-variant-numeric: tabular-nums;
}
.agy-req-row-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  width: 100%;
  font-size: 12px;
  color: var(--muted-foreground, #52525b);
}
.agy-req-row-proj {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-req-row-tag {
  margin-left: auto;
  flex-shrink: 0;
  font-size: 10.5px;
  padding: 0 5px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--foreground, #000000) 6%, transparent);
  color: var(--muted-foreground, #52525b);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.agy-req-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #10b981;
  flex-shrink: 0;
  box-shadow: 0 0 0 2px color-mix(in srgb, #10b981 22%, transparent);
}
.agy-req-empty {
  padding: 28px 12px;
  text-align: center;
  font-size: 12px;
  color: var(--muted-foreground, #52525b);
}
`;

  function ensureStyle() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      style.textContent = CSS;
      document.head.appendChild(style);
    }
  }

  function ensureHost() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      document.body.appendChild(host);
    }
    return host;
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function svgIcon(pathD, size = 14) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 -960 960 960');
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('fill', 'currentColor');
    svg.style.flexShrink = '0';
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    svg.appendChild(path);
    return svg;
  }

  const ICON_FILTER = 'M411.15-260v-60H548.46v60H411.15Zm-155-190v-60H703.46v60H256.16ZM140-640v-60H820v60H140Z';
  const ICON_FOLDER = 'M172.31-180Q142-180 121-201t-21-51.31V-707.69Q100-738 121-759t51.31-21H391.92l80,80H787.69Q818-700 839-679t21,51.31v375.38Q860-222 839-201t-51.31,21H172.31Zm0-60H787.69q5.39,0 8.85-3.46t3.46-8.85V-627.69q0-5.39-3.46-8.85T787.69-640H447.38l-80-80H172.31q-5.39,0-8.85,3.46T160-707.69v455.38q0,5.39 3.46,8.85t8.85,3.46Z';
  const ICON_CHEVRON = 'M480-344 240-584l56-56 184 184 184-184 56 56-240 240Z';
  const ICON_CHECK = 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z';

  function formatRelativeTime(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 60000) return '<1m';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 86400000 * 7) return `${Math.floor(diff / 86400000)}d`;
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function currentChatId() {
    const m = window.location.pathname.match(/^\/c\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
  }

  function navigateToConversation(id) {
    const nextPath = `/c/${encodeURIComponent(id)}`;
    if (window.location.pathname === nextPath) return;
    window.history.pushState(null, '', nextPath);
  }

  let currentOuterEl = null;
  function clearOffsetClass() {
    if (currentOuterEl) {
      currentOuterEl.classList.remove(FILTER_OFFSET_CLASS);
      currentOuterEl = null;
    }
  }

  function measureSidebarRects() {
    const list = document.querySelector('[data-testid="conversation-list-sidebar"]');
    if (!list) {
      clearOffsetClass();
      return null;
    }
    const mid = list.parentElement;
    const outer = mid?.parentElement;
    if (!mid || !outer) {
      clearOffsetClass();
      return null;
    }
    const style = getComputedStyle(outer);
    if (style.display === 'none' || style.visibility === 'hidden') {
      clearOffsetClass();
      return null;
    }
    const outerRect = outer.getBoundingClientRect();
    if (outerRect.width < 180 || outerRect.height < 160) {
      clearOffsetClass();
      return null;
    }
    if (currentOuterEl !== outer) {
      clearOffsetClass();
      currentOuterEl = outer;
    }
    outer.classList.add(FILTER_OFFSET_CLASS);
    const listRect = mid.getBoundingClientRect();
    return {
      outer: { left: outerRect.left, top: outerRect.top, width: outerRect.width, height: outerRect.height },
      list: { left: listRect.left, top: listRect.top, width: listRect.width, height: listRect.height },
    };
  }

  function summarizeRequirements(conversations, t) {
    const groups = new Map();
    for (const conv of conversations) {
      const key = conv.reqKey || 'INBOX';
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          kind: conv.reqKind || 'inbox',
          label: conv.reqKind === 'inbox' ? t.inbox : (conv.reqLabel || key),
          count: 0,
          running: 0,
          latestMs: 0,
          projects: new Set(),
        });
      }
      const g = groups.get(key);
      g.count += 1;
      if (conv.status === 'running') g.running += 1;
      if ((conv.updatedAtMs || 0) > g.latestMs) g.latestMs = conv.updatedAtMs || 0;
      if (conv.projectName && !conv.isUnassigned) g.projects.add(conv.projectName);
    }

    const reqs = [];
    let inbox = null;
    for (const g of groups.values()) {
      const item = { ...g, projects: [...g.projects] };
      if (item.kind === 'inbox') inbox = item;
      else reqs.push(item);
    }
    reqs.sort((a, b) => {
      if ((a.running > 0) !== (b.running > 0)) return b.running - a.running;
      return b.latestMs - a.latestMs;
    });
    return { reqs, inbox };
  }

  const state = {
    prefs: { language: 'zh-CN', selectedReqKey: null, showArchived: false },
    tree: { projects: [], conversations: [], stats: { totalProjects: 0, totalConversations: 0, runningCount: 0 } },
    rects: null,
    search: '',
    popoverOpen: false,
    popoverSearch: '',
    scrollTop: 0,
    lastRenderSignature: '',
  };

  async function updatePrefs(patch) {
    state.prefs = { ...state.prefs, ...patch };
    render();
    try {
      const saved = await window.__agyProjectSidebarHost?.setPreferences?.(patch);
      if (saved && typeof saved === 'object' && !saved.offline) {
        state.prefs = { ...state.prefs, ...saved };
        render();
      }
    } catch { /* ignore optimistic fallback */ }
  }

  function renderPopover(anchorRect, t, conversations) {
    const { reqs, inbox } = summarizeRequirements(conversations, t);
    const pop = el('div', 'agy-req-popover');
    pop.id = 'agy-req-popover';
    const maxWidth = Math.min(360, Math.max(260, anchorRect.width));
    pop.style.left = `${anchorRect.left}px`;
    pop.style.top = `${anchorRect.top + anchorRect.height + 4}px`;
    pop.style.width = `${maxWidth}px`;

    const top = el('div', 'agy-req-pop-top');
    const popSearch = el('input', 'agy-req-pop-search');
    popSearch.id = 'agy-req-pop-search';
    popSearch.type = 'text';
    popSearch.placeholder = t.dropdownSearchPlaceholder;
    popSearch.value = state.popoverSearch;
    popSearch.addEventListener('input', e => {
      state.popoverSearch = e.target.value;
      fillPopoverList(listEl);
    });
    popSearch.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        state.popoverOpen = false;
        render();
      }
    });
    top.appendChild(popSearch);
    pop.appendChild(top);

    const listEl = el('div', 'agy-req-pop-list');
    function fillPopoverList(target) {
      target.textContent = '';
      const q = state.popoverSearch.trim().toLowerCase();

      if (!q) {
        const allBtn = el('button', `agy-req-pop-item${!state.prefs.selectedReqKey ? ' is-selected' : ''}`);
        allBtn.type = 'button';
        allBtn.dataset.reqKey = '';
        if (!state.prefs.selectedReqKey) allBtn.appendChild(svgIcon(ICON_CHECK, 13));
        allBtn.appendChild(el('span', 'agy-req-pop-item-title', t.allNative));
        allBtn.appendChild(el('span', 'agy-req-pop-item-count', String(conversations.length)));
        allBtn.addEventListener('click', () => {
          state.popoverOpen = false;
          state.popoverSearch = '';
          void updatePrefs({ selectedReqKey: null });
        });
        target.appendChild(allBtn);
        target.appendChild(el('div', 'agy-req-pop-divider'));
        target.appendChild(el('div', 'agy-req-pop-section', `${t.requirementsGroup} (${reqs.length})`));
      }

      const filteredReqs = q
        ? reqs.filter(r => r.label.toLowerCase().includes(q) || r.key.toLowerCase().includes(q) || r.projects.some(p => p.toLowerCase().includes(q)))
        : reqs;

      for (const reqItem of filteredReqs) {
        const btn = el('button', `agy-req-pop-item${state.prefs.selectedReqKey === reqItem.key ? ' is-selected' : ''}`);
        btn.type = 'button';
        btn.dataset.reqKey = reqItem.key;
        if (reqItem.running > 0) btn.appendChild(el('span', 'agy-req-dot'));
        else if (state.prefs.selectedReqKey === reqItem.key) btn.appendChild(svgIcon(ICON_CHECK, 13));
        btn.appendChild(el('span', 'agy-req-pop-item-title', reqItem.label));
        const meta = el('span', 'agy-req-pop-item-meta');
        if (reqItem.projects[0]) meta.appendChild(el('span', 'agy-req-pop-item-proj', reqItem.projects[0]));
        meta.appendChild(el('span', 'agy-req-pop-item-count', String(reqItem.count)));
        btn.appendChild(meta);
        btn.addEventListener('click', () => {
          state.popoverOpen = false;
          state.popoverSearch = '';
          state.scrollTop = 0;
          void updatePrefs({ selectedReqKey: reqItem.key });
        });
        target.appendChild(btn);
      }

      if (inbox && (!q || t.inbox.toLowerCase().includes(q) || 'inbox'.includes(q))) {
        if (filteredReqs.length) target.appendChild(el('div', 'agy-req-pop-divider'));
        const inboxBtn = el('button', `agy-req-pop-item${state.prefs.selectedReqKey === 'INBOX' ? ' is-selected' : ''}`);
        inboxBtn.type = 'button';
        inboxBtn.dataset.reqKey = 'INBOX';
        if (inbox.running > 0) inboxBtn.appendChild(el('span', 'agy-req-dot'));
        else if (state.prefs.selectedReqKey === 'INBOX') inboxBtn.appendChild(svgIcon(ICON_CHECK, 13));
        inboxBtn.appendChild(el('span', 'agy-req-pop-item-title', t.inbox));
        inboxBtn.appendChild(el('span', 'agy-req-pop-item-count', String(inbox.count)));
        inboxBtn.addEventListener('click', () => {
          state.popoverOpen = false;
          state.popoverSearch = '';
          state.scrollTop = 0;
          void updatePrefs({ selectedReqKey: 'INBOX' });
        });
        target.appendChild(inboxBtn);
      }

      if (!filteredReqs.length && (!inbox || (q && !t.inbox.toLowerCase().includes(q)))) {
        target.appendChild(el('div', 'agy-req-empty', t.noReqFound));
      }
    }

    fillPopoverList(listEl);
    pop.appendChild(listEl);

    const footer = el('div', 'agy-req-pop-footer');
    footer.appendChild(el('span', '', `${reqs.length} · ${conversations.length}`));
    const langBtn = el('button', 'agy-req-lang-btn', state.prefs.language === 'en' ? '中文' : 'EN');
    langBtn.type = 'button';
    langBtn.addEventListener('click', () => {
      void updatePrefs({ language: state.prefs.language === 'en' ? 'zh-CN' : 'en' });
    });
    footer.appendChild(langBtn);
    pop.appendChild(footer);

    return pop;
  }

  function renderResultsPanel(listRect, t, conversations, activeReq) {
    const q = state.search.trim().toLowerCase();
    const matches = conversations.filter(conv => {
      if (state.prefs.selectedReqKey && conv.reqKey !== state.prefs.selectedReqKey) return false;
      if (!q) return true;
      return (
        conv.title.toLowerCase().includes(q) ||
        conv.reqLabel.toLowerCase().includes(q) ||
        conv.reqKey.toLowerCase().includes(q) ||
        (conv.projectName || '').toLowerCase().includes(q)
      );
    });

    const panel = el('div', 'agy-req-results');
    panel.id = 'agy-req-results-panel';
    panel.style.left = `${listRect.left}px`;
    panel.style.top = `${listRect.top}px`;
    panel.style.width = `${listRect.width}px`;
    panel.style.height = `${listRect.height}px`;

    const hdr = el('div', 'agy-req-results-hdr');
    const titleLabel = activeReq
      ? `${t.filterPrefix} · ${activeReq.label} (${matches.length})`
      : `${t.filterPrefix} · "${state.search.trim()}" (${matches.length})`;
    hdr.appendChild(el('span', 'agy-req-results-hdr-title', titleLabel));

    const clearBtn = el('button', 'agy-req-clear-link', `${t.clearFilter} ×`);
    clearBtn.id = 'agy-req-panel-clear';
    clearBtn.type = 'button';
    clearBtn.addEventListener('click', () => {
      state.search = '';
      state.scrollTop = 0;
      void updatePrefs({ selectedReqKey: null });
    });
    hdr.appendChild(clearBtn);
    panel.appendChild(hdr);

    const scroll = el('div', 'agy-req-results-scroll');
    if (!matches.length) {
      scroll.appendChild(el('div', 'agy-req-empty', t.empty));
    } else {
      const activeChatId = currentChatId();
      for (const conv of matches) {
        const row = el('button', `agy-req-row${conv.id === activeChatId ? ' is-active' : ''}`);
        row.type = 'button';
        row.dataset.conversationId = conv.id;

        const top = el('div', 'agy-req-row-top');
        if (conv.status === 'running') top.appendChild(el('span', 'agy-req-dot'));
        top.appendChild(el('span', 'agy-req-row-title', conv.title));
        const timeText = conv.status === 'running' ? t.running : formatRelativeTime(conv.updatedAtMs);
        if (timeText) top.appendChild(el('span', 'agy-req-row-time', timeText));
        row.appendChild(top);

        const sub = el('div', 'agy-req-row-sub');
        sub.appendChild(svgIcon(ICON_FOLDER, 13));
        const projText = conv.isUnassigned ? (conv.workspaceHint ? conv.workspaceHint.split('/').pop() : 'Outside of Project') : conv.projectName;
        sub.appendChild(el('span', 'agy-req-row-proj', projText));
        if (!state.prefs.selectedReqKey && conv.reqKind !== 'inbox' && conv.reqLabel) {
          sub.appendChild(el('span', 'agy-req-row-tag', conv.reqLabel));
        }
        row.appendChild(sub);

        row.addEventListener('click', () => navigateToConversation(conv.id));
        scroll.appendChild(row);
      }
    }

    scroll.addEventListener('scroll', () => {
      state.scrollTop = scroll.scrollTop;
    });
    panel.appendChild(scroll);
    requestAnimationFrame(() => {
      if (state.scrollTop && scroll.isConnected) scroll.scrollTop = state.scrollTop;
    });
    return panel;
  }

  function render() {
    ensureStyle();
    const host = ensureHost();
    const rects = measureSidebarRects();
    state.rects = rects;

    if (!rects) {
      state.popoverOpen = false;
      state.lastRenderSignature = 'hidden';
      host.textContent = '';
      return;
    }

    const activeEl = document.activeElement;
    const activeId = activeEl && host.contains(activeEl) ? activeEl.id : null;
    const cursorPos = activeEl && typeof activeEl.selectionStart === 'number' ? activeEl.selectionStart : null;

    const t = getI18n(state.prefs.language);
    const conversations = state.tree.conversations || [];
    const { reqs, inbox } = summarizeRequirements(conversations, t);
    const activeReq = state.prefs.selectedReqKey
      ? (state.prefs.selectedReqKey === 'INBOX' ? inbox : reqs.find(r => r.key === state.prefs.selectedReqKey)) || { key: state.prefs.selectedReqKey, label: state.prefs.selectedReqKey.replace(/^ISSUE:/, ''), count: 0 }
      : null;

    const barRect = {
      left: Math.round(rects.outer.left + 8),
      top: Math.round(rects.outer.top + 8),
      width: Math.max(160, Math.round(rects.outer.width - 16)),
      height: 30,
    };

    const sig = JSON.stringify({
      barRect,
      listRect: { l: Math.round(rects.list.left), t: Math.round(rects.list.top), w: Math.round(rects.list.width), h: Math.round(rects.list.height) },
      lang: state.prefs.language,
      req: state.prefs.selectedReqKey,
      q: state.search,
      pop: state.popoverOpen,
      chat: currentChatId(),
      running: state.tree.stats?.runningCount || 0,
      count: conversations.length,
      head: conversations.slice(0, 6).map(c => `${c.id}:${c.status}:${c.updatedAtMs}:${c.reqKey}:${c.title}`),
    });
    if (sig === state.lastRenderSignature && host.firstChild) return;
    state.lastRenderSignature = sig;

    host.textContent = '';

    const bar = el('div', 'agy-req-bar');
    bar.id = 'agy-project-sidebar-filter-bar';
    bar.style.left = `${barRect.left}px`;
    bar.style.top = `${barRect.top}px`;
    bar.style.width = `${barRect.width}px`;
    bar.style.height = `${barRect.height}px`;

    const trigger = el('button', `agy-req-trigger${activeReq ? ' is-active' : ''}`);
    trigger.id = 'agy-req-filter-trigger';
    trigger.type = 'button';
    trigger.appendChild(svgIcon(ICON_FILTER, 14));
    trigger.appendChild(el('span', 'agy-req-trigger-label', activeReq ? activeReq.label : `${t.filterPrefix}: ${t.allLabel}`));
    if (activeReq) {
      trigger.appendChild(el('span', 'agy-req-trigger-count', `(${activeReq.count})`));
      const clearX = el('span', 'agy-req-inline-clear', '×');
      clearX.id = 'agy-req-clear-btn';
      clearX.title = t.clearFilter;
      clearX.addEventListener('click', e => {
        e.stopPropagation();
        state.popoverOpen = false;
        state.scrollTop = 0;
        void updatePrefs({ selectedReqKey: null });
      });
      trigger.appendChild(clearX);
    } else {
      trigger.appendChild(svgIcon(ICON_CHEVRON, 14));
    }
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      state.popoverOpen = !state.popoverOpen;
      state.popoverSearch = '';
      render();
      if (state.popoverOpen) {
        requestAnimationFrame(() => document.getElementById('agy-req-pop-search')?.focus());
      }
    });
    bar.appendChild(trigger);

    const searchWrap = el('div', 'agy-req-search-wrap');
    const searchInput = el('input', 'agy-req-search');
    searchInput.id = 'agy-req-search-input';
    searchInput.type = 'text';
    searchInput.placeholder = t.searchPlaceholder;
    searchInput.value = state.search;
    searchInput.addEventListener('input', e => {
      state.search = e.target.value;
      state.scrollTop = 0;
      render();
    });
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.search) {
        state.search = '';
        state.scrollTop = 0;
        render();
      }
    });
    searchWrap.appendChild(searchInput);

    if (state.search) {
      const clearSearchBtn = el('button', 'agy-req-search-clear', '×');
      clearSearchBtn.type = 'button';
      clearSearchBtn.title = t.clearFilter;
      clearSearchBtn.addEventListener('click', () => {
        state.search = '';
        state.scrollTop = 0;
        render();
        document.getElementById('agy-req-search-input')?.focus();
      });
      searchWrap.appendChild(clearSearchBtn);
    }
    bar.appendChild(searchWrap);
    host.appendChild(bar);

    if (state.prefs.selectedReqKey || state.search.trim()) {
      host.appendChild(renderResultsPanel(rects.list, t, conversations, activeReq));
    }

    if (state.popoverOpen) {
      host.appendChild(renderPopover(barRect, t, conversations));
    }

    if (activeId) {
      const restored = document.getElementById(activeId);
      if (restored) {
        restored.focus();
        if (cursorPos != null && typeof restored.setSelectionRange === 'function') {
          restored.setSelectionRange(cursorPos, cursorPos);
        }
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
        render();
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
      render();
    });
  };

  const onDocumentClick = e => {
    if (!state.popoverOpen) return;
    const pop = document.getElementById('agy-req-popover');
    const trigger = document.getElementById('agy-req-filter-trigger');
    if (pop?.contains(e.target) || trigger?.contains(e.target)) return;
    state.popoverOpen = false;
    render();
  };
  document.addEventListener('click', onDocumentClick, true);

  const ro = new ResizeObserver(scheduleLayoutRender);
  const attachObserved = () => {
    const target = document.querySelector('[data-testid="conversation-list-sidebar"]')?.parentElement?.parentElement || document.body;
    ro.disconnect();
    ro.observe(target);
  };
  attachObserved();

  const mo = new MutationObserver(mutations => {
    const host = document.getElementById(HOST_ID);
    const hasExternal = mutations.some(m => !host || (m.target !== host && !host.contains(m.target)));
    if (!hasExternal) return;
    attachObserved();
    scheduleLayoutRender();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', scheduleLayoutRender);
  window.addEventListener('popstate', scheduleLayoutRender);

  const pollTimer = setInterval(() => void pollTree(false), 4000);
  render();
  void pollTree(true);

  window.__agyProjectSidebarDispose = () => {
    clearInterval(pollTimer);
    ro.disconnect();
    mo.disconnect();
    clearOffsetClass();
    document.removeEventListener('click', onDocumentClick, true);
    window.removeEventListener('resize', scheduleLayoutRender);
    window.removeEventListener('popstate', scheduleLayoutRender);
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    delete window.__agyProjectSidebarInstalled;
  };
};

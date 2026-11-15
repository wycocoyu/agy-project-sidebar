module.exports = function mountProjectSidebarWidget() {
  if (window !== window.top) return;
  if (window.__agyProjectSidebarInstalled) return;
  window.__agyProjectSidebarInstalled = true;

  const STYLE_ID = 'agy-project-sidebar-style';
  const HOST_ID = 'agy-project-sidebar-host';
  const ACTIVE_LIST_CLASS = 'agy-groupby-req-active';
  const MENU_OPT_ID = 'agy-group-by-option-requirement';

  const getI18n = lang => (typeof window.__agyProjectSidebarI18nFactory === 'function' ? window.__agyProjectSidebarI18nFactory(lang) : {});

  const CSS = `
[data-testid="conversation-list-sidebar"].${ACTIVE_LIST_CLASS} {
  overflow-y: hidden !important;
}
[data-testid="conversation-list-sidebar"].${ACTIVE_LIST_CLASS} > div > div:not([data-sidebar-section-drop-id="pinned"]):not([data-sidebar-section-id="pinned"]):not([data-sidebar-section-drop-id="section-coordinator"]):not([data-sidebar-section-id="section-coordinator"]):not([data-sidebar-section-drop-id="main-section-header"]) {
  visibility: hidden !important;
  pointer-events: none !important;
}
[data-agy-req-groupby="true"] > span.ml-auto {
  font-size: 0 !important;
}
[data-agy-req-groupby="true"] > span.ml-auto::after {
  content: attr(data-agy-req-label);
  font-size: 13px;
}
[role="group"].agy-req-submenu-active [role="menuitemradio"]:not(#${MENU_OPT_ID}) > span[data-checked] {
  display: none !important;
}
[role="group"].agy-req-submenu-active [role="menuitemradio"]:not(#${MENU_OPT_ID}) {
  color: var(--secondary-foreground, inherit) !important;
}
#${MENU_OPT_ID}:hover,
#${MENU_OPT_ID}[data-highlighted] {
  background: var(--secondary, rgba(10,10,12,0.07));
  color: var(--foreground, #000000);
}
#${MENU_OPT_ID}[data-checked] {
  color: var(--foreground, #000000);
}
#${HOST_ID} {
  font-family: "Google Sans Flex", "Google Sans", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-size: 13px;
  line-height: 1.4;
  color: var(--foreground, #000000);
  pointer-events: none;
}
#${HOST_ID} * { box-sizing: border-box; }
.agy-req-viewport {
  position: fixed;
  pointer-events: auto;
  background: var(--sidebar, #f3f3f3);
  overflow-y: auto;
  overscroll-behavior: none;
  padding: 2px 8px 16px;
  z-index: 12;
  user-select: none;
}
.agy-req-sec {
  padding-top: 3px;
  padding-bottom: 1px;
}
.agy-req-hdr {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px 6px 4px;
  border-radius: 8px;
  border: none;
  outline: none;
  background: var(--sidebar, transparent);
  color: var(--muted-foreground, #52525b);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: 13px;
  transition: background-color 100ms ease, color 100ms ease;
}
.agy-req-hdr:hover {
  background: var(--muted, rgba(10,10,12,0.06));
  color: var(--secondary-foreground, var(--foreground, #000000));
}
.agy-req-hdr-left {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
  flex: 1 1 auto;
}
.agy-req-hdr-icon {
  width: 24px;
  height: 24px;
  margin: -4px 0;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}
.agy-req-hdr-icon .agy-icon-glyph {
  display: inline-flex;
  opacity: 0.85;
}
.agy-req-hdr-icon .agy-icon-chev {
  display: none;
  transition: transform 150ms ease;
}
.agy-req-hdr:hover .agy-icon-glyph,
.agy-req-hdr.is-collapsed .agy-icon-glyph {
  display: none;
}
.agy-req-hdr:hover .agy-icon-chev,
.agy-req-hdr.is-collapsed .agy-icon-chev {
  display: inline-flex;
}
.agy-req-hdr:not(.is-collapsed) .agy-icon-chev {
  transform: rotate(90deg);
}
.agy-req-hdr-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.agy-req-hdr-count {
  flex-shrink: 0;
  font-size: 11.5px;
  opacity: 0.65;
  font-variant-numeric: tabular-nums;
}
.agy-req-row {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--secondary-foreground, var(--foreground, #000000));
  border-radius: 8px;
  padding: 6px 8px 6px 30px;
  display: flex;
  flex-direction: column;
  gap: 1px;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  transition: background-color 100ms ease, color 100ms ease;
  margin-bottom: 1px;
}
.agy-req-row:hover {
  background: var(--sidebar-muted, rgba(10,10,12,0.07));
  color: var(--foreground, #000000);
}
.agy-req-row.is-active {
  background: var(--sidebar-muted, rgba(10,10,12,0.09));
  color: var(--foreground, #000000);
}
.agy-req-row-top {
  display: flex;
  align-items: center;
  gap: 8px;
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
}
.agy-req-row.is-active .agy-req-row-title {
  font-weight: 500;
}
.agy-req-row-right {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  font-size: 11.5px;
  color: var(--muted-foreground, #52525b);
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
.agy-req-spinner {
  display: grid;
  grid-template-columns: repeat(2, 4px);
  gap: 2px;
  width: 14px;
  height: 14px;
  place-content: center;
  opacity: 0.72;
}
.agy-req-spinner > span {
  width: 4px;
  height: 4px;
  border-radius: 999px;
  background: currentColor;
}
.agy-req-more {
  width: 100%;
  border: none;
  background: transparent;
  color: var(--muted-foreground, #52525b);
  padding: 5px 8px 5px 30px;
  border-radius: 8px;
  text-align: left;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.agy-req-more:hover {
  background: var(--sidebar-muted, rgba(10,10,12,0.07));
  color: var(--foreground, #000000);
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

  const ICON_CHEVRON_RIGHT = 'M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z';
  const ICON_CHECK = 'M382-339.38L727.54-684.92q8.92-8.92 20.88-9.12t21.27,9.12T779-663.54t-9.31,21.38l-362.38,363Q396.46-268.31 382-268.31t-25.31-10.85l-167-167q-8.92-8.92-8.81-21.19t9.42-21.58t21.38-9.31t21.38,9.31L382-339.38Z';
  const ICON_FOLDER = 'M172.31-180Q142-180 121-201t-21-51.31V-707.69Q100-738 121-759t51.31-21H391.92l80,80H787.69Q818-700 839-679t21,51.31v375.38Q860-222 839-201t-51.31,21H172.31Zm0-60H787.69q5.39,0 8.85-3.46t3.46-8.85V-627.69q0-5.39-3.46-8.85T787.69-640H447.38l-80-80H172.31q-5.39,0-8.85,3.46T160-707.69v455.38q0,5.39 3.46,8.85t8.85,3.46Z';
  const ICON_TAG = 'M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Z';

  function formatRelativeTime(ms) {
    if (!ms) return '';
    const diff = Date.now() - ms;
    if (diff < 60000) return 'now';
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

  function closeOpenOverlayMenus() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }, 30);
  }

  const state = {
    prefs: { language: 'zh-CN', groupByRequirement: false, collapsedReqKeys: [], showArchived: false },
    tree: { projects: [], conversations: [], stats: { totalProjects: 0, totalConversations: 0, runningCount: 0 } },
    standaloneLimit: 20,
    scrollTop: 0,
    lastRenderSignature: '',
  };

  async function updatePrefs(patch) {
    state.prefs = { ...state.prefs, ...patch };
    syncOfficialMenus();
    render();
    try {
      const saved = await window.__agyProjectSidebarHost?.setPreferences?.(patch);
      if (saved && typeof saved === 'object' && !saved.offline) {
        state.prefs = { ...state.prefs, ...saved };
        syncOfficialMenus();
        render();
      }
    } catch { /* ignore optimistic fallback */ }
  }

  function toggleCollapseReq(key) {
    const set = new Set(state.prefs.collapsedReqKeys || []);
    if (set.has(key)) set.delete(key);
    else set.add(key);
    void updatePrefs({ collapsedReqKeys: [...set] });
  }

  let activeListEl = null;
  function clearListClass() {
    if (activeListEl) {
      activeListEl.classList.remove(ACTIVE_LIST_CLASS);
      activeListEl = null;
    }
  }

  function syncOfficialMenus() {
    const t = getI18n(state.prefs.language);
    const isReq = Boolean(state.prefs.groupByRequirement);

    // 1. Sync "Group By   <Current>" label inside Display Options root menu
    const triggers = document.querySelectorAll('[data-testid="group-by-submenu-trigger"]');
    for (const trig of triggers) {
      const wrap = trig.parentElement;
      const valSpan = wrap?.querySelector('span.ml-auto');
      if (!wrap || !valSpan) continue;
      if (isReq) {
        wrap.setAttribute('data-agy-req-groupby', 'true');
        valSpan.setAttribute('data-agy-req-label', t.menuOption);
      } else {
        wrap.removeAttribute('data-agy-req-groupby');
        valSpan.removeAttribute('data-agy-req-label');
      }
    }

    // 2. Sync "Requirement" radio option inside Group By submenu
    const projOptLabel = document.querySelector('[data-testid="group-by-option-project"]');
    const projItem = projOptLabel?.closest('[role="menuitemradio"]');
    const groupBox = projItem?.parentElement;
    if (!groupBox) return;

    groupBox.classList.toggle('agy-req-submenu-active', isReq);

    let reqItem = groupBox.querySelector(`#${MENU_OPT_ID}`);
    if (!reqItem) {
      reqItem = el(
        'div',
        'agy-overlay-item group w-full pr-2 pl-2 text-left text-compact cursor-pointer outline-none no-focus-ring transition-colors select-none flex items-center rounded-md py-1 gap-1.5 text-secondary-foreground justify-between',
      );
      reqItem.id = MENU_OPT_ID;
      reqItem.setAttribute('role', 'menuitemradio');
      reqItem.setAttribute('tabindex', '-1');

      const labelOuter = el('span', 'min-w-0 truncate');
      const labelInner = el('span', '', t.menuOption);
      labelInner.setAttribute('data-testid', 'group-by-option-requirement');
      labelOuter.appendChild(labelInner);
      reqItem.appendChild(labelOuter);

      reqItem.addEventListener('pointerenter', () => {
        for (const sib of groupBox.querySelectorAll('[role="menuitemradio"][data-highlighted]')) {
          if (sib !== reqItem) sib.removeAttribute('data-highlighted');
        }
        reqItem.setAttribute('data-highlighted', '');
      });
      reqItem.addEventListener('pointerleave', () => {
        reqItem.removeAttribute('data-highlighted');
      });
      reqItem.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        state.scrollTop = 0;
        void updatePrefs({ groupByRequirement: true });
        closeOpenOverlayMenus();
      });

      if (projItem.nextSibling) groupBox.insertBefore(reqItem, projItem.nextSibling);
      else groupBox.appendChild(reqItem);
    }

    reqItem.setAttribute('aria-checked', isReq ? 'true' : 'false');
    if (isReq) {
      reqItem.setAttribute('data-checked', '');
      reqItem.removeAttribute('data-unchecked');
      if (!reqItem.querySelector('[data-checked]')) {
        const chk = el('span');
        chk.setAttribute('data-checked', '');
        chk.setAttribute('aria-hidden', 'true');
        chk.appendChild(svgIcon(ICON_CHECK, 14));
        reqItem.appendChild(chk);
      }
    } else {
      reqItem.removeAttribute('data-checked');
      reqItem.setAttribute('data-unchecked', '');
      reqItem.querySelector('span[data-checked]')?.remove();
    }
  }

  function measureViewportRect() {
    const list = document.querySelector('[data-testid="conversation-list-sidebar"]');
    if (!list || !state.prefs.groupByRequirement) {
      clearListClass();
      return null;
    }
    const style = getComputedStyle(list);
    if (style.display === 'none' || style.visibility === 'hidden') {
      clearListClass();
      return null;
    }
    const listRect = list.getBoundingClientRect();
    if (listRect.width < 180 || listRect.height < 160) {
      clearListClass();
      return null;
    }

    if (list.scrollTop > 0) list.scrollTop = 0;
    if (activeListEl !== list) {
      clearListClass();
      activeListEl = list;
    }
    list.classList.add(ACTIVE_LIST_CLASS);

    const mainHdr = list.querySelector('[data-sidebar-section-drop-id="main-section-header"]');
    const secHdr = mainHdr?.querySelector('[data-testid="section-header"][data-title="Conversations"]');
    if (secHdr?.getAttribute('data-collapsed') === 'true') {
      return { collapsed: true };
    }

    let top = listRect.top + 28;
    if (mainHdr) {
      const hr = mainHdr.getBoundingClientRect();
      if (hr.bottom >= listRect.top && hr.bottom < listRect.bottom - 100) {
        top = Math.round(hr.bottom + 2);
      }
    }
    const height = Math.max(80, Math.round(listRect.bottom - top));
    return {
      collapsed: false,
      left: Math.round(listRect.left),
      top,
      width: Math.round(listRect.width),
      height,
    };
  }

  function buildRequirementSections(conversations, pinnedIds, t) {
    const groups = new Map();
    for (const conv of conversations) {
      const key = conv.reqKey || 'INBOX';
      if (key === 'INBOX' && pinnedIds.has(conv.id)) continue;
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          kind: conv.reqKind || 'inbox',
          label: conv.reqKind === 'inbox' ? t.standalone : (conv.reqLabel || key),
          items: [],
          running: 0,
          latestMs: 0,
        });
      }
      const g = groups.get(key);
      g.items.push(conv);
      if (conv.status === 'running') g.running += 1;
      if ((conv.updatedAtMs || 0) > g.latestMs) g.latestMs = conv.updatedAtMs || 0;
    }

    const reqs = [];
    let standalone = null;
    for (const g of groups.values()) {
      if (!g.items.length) continue;
      if (g.kind === 'inbox') standalone = g;
      else reqs.push(g);
    }
    reqs.sort((a, b) => {
      if ((a.running > 0) !== (b.running > 0)) return b.running - a.running;
      return b.latestMs - a.latestMs;
    });
    if (standalone) reqs.push(standalone);
    return reqs;
  }

  function render() {
    ensureStyle();
    const host = ensureHost();
    const vp = measureViewportRect();

    if (!vp || vp.collapsed) {
      state.lastRenderSignature = vp?.collapsed ? 'collapsed' : 'inactive';
      host.textContent = '';
      return;
    }

    const pinnedIds = new Set(
      [...document.querySelectorAll('[data-testid="conversation-row-sidebar"][data-pinned="true"]')]
        .map(n => n.getAttribute('data-cascade-id'))
        .filter(Boolean),
    );
    const t = getI18n(state.prefs.language);
    const conversations = state.tree.conversations || [];
    const sig = JSON.stringify({
      vp,
      lang: state.prefs.language,
      collapsed: state.prefs.collapsedReqKeys,
      limit: state.standaloneLimit,
      pinned: [...pinnedIds],
      chat: currentChatId(),
      running: state.tree.stats?.runningCount || 0,
      count: conversations.length,
      head: conversations.slice(0, 6).map(c => `${c.id}:${c.status}:${c.updatedAtMs}:${c.reqKey}:${c.title}`),
    });
    if (sig === state.lastRenderSignature && host.firstChild) return;
    state.lastRenderSignature = sig;

    host.textContent = '';

    const viewport = el('div', 'agy-req-viewport');
    viewport.id = 'agy-req-groups-viewport';
    viewport.style.left = `${vp.left}px`;
    viewport.style.top = `${vp.top}px`;
    viewport.style.width = `${vp.width}px`;
    viewport.style.height = `${vp.height}px`;

    const sections = buildRequirementSections(conversations, pinnedIds, t);
    const collapsedSet = new Set(state.prefs.collapsedReqKeys || []);
    const activeChatId = currentChatId();

    for (const sec of sections) {
      const isCollapsed = collapsedSet.has(sec.key);
      const secEl = el('div', 'agy-req-sec');
      secEl.dataset.reqSection = sec.key;

      const hdr = el('button', `agy-req-hdr${isCollapsed ? ' is-collapsed' : ''}`);
      hdr.type = 'button';
      hdr.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      hdr.addEventListener('click', () => toggleCollapseReq(sec.key));

      const hdrLeft = el('div', 'agy-req-hdr-left');
      const iconBox = el('div', 'agy-req-hdr-icon');
      const glyph = el('span', 'agy-icon-glyph');
      glyph.appendChild(svgIcon(sec.kind === 'inbox' ? ICON_FOLDER : ICON_TAG, 15));
      const chev = el('span', 'agy-icon-chev');
      chev.appendChild(svgIcon(ICON_CHEVRON_RIGHT, 14));
      iconBox.append(glyph, chev);
      hdrLeft.appendChild(iconBox);
      hdrLeft.appendChild(el('span', 'agy-req-hdr-label', sec.label));
      hdr.appendChild(hdrLeft);
      hdr.appendChild(el('span', 'agy-req-hdr-count', String(sec.items.length)));
      secEl.appendChild(hdr);

      if (!isCollapsed) {
        const visibleItems = sec.kind === 'inbox' ? sec.items.slice(0, state.standaloneLimit) : sec.items;
        for (const conv of visibleItems) {
          const row = el('button', `agy-req-row${conv.id === activeChatId ? ' is-active' : ''}`);
          row.type = 'button';
          row.dataset.conversationId = conv.id;

          const top = el('div', 'agy-req-row-top');
          top.appendChild(el('span', 'agy-req-row-title', conv.title));
          const right = el('span', 'agy-req-row-right');
          if (conv.status === 'running') {
            const spin = el('span', 'agy-req-spinner');
            spin.append(el('span'), el('span'), el('span'), el('span'));
            right.appendChild(spin);
          } else {
            right.textContent = formatRelativeTime(conv.updatedAtMs);
          }
          top.appendChild(right);
          row.appendChild(top);

          const sub = el('div', 'agy-req-row-sub');
          sub.appendChild(svgIcon(ICON_FOLDER, 13));
          const projText = conv.isUnassigned
            ? (conv.workspaceHint ? conv.workspaceHint.split('/').pop() : 'Outside of Project')
            : conv.projectName;
          sub.appendChild(el('span', 'agy-req-row-proj', projText));
          row.appendChild(sub);

          row.addEventListener('click', () => navigateToConversation(conv.id));
          secEl.appendChild(row);
        }

        if (sec.kind === 'inbox' && sec.items.length > state.standaloneLimit) {
          const more = el('button', 'agy-req-more', `${t.showMore} (${sec.items.length - state.standaloneLimit})`);
          more.type = 'button';
          more.addEventListener('click', () => {
            state.standaloneLimit += 40;
            render();
          });
          secEl.appendChild(more);
        }
      }

      viewport.appendChild(secEl);
    }

    viewport.addEventListener('scroll', () => {
      state.scrollTop = viewport.scrollTop;
    });
    host.appendChild(viewport);
    requestAnimationFrame(() => {
      if (state.scrollTop && viewport.isConnected) viewport.scrollTop = state.scrollTop;
    });
  }

  // When user selects any official Group By option (Project / Repo / Environment / Status / None), yield back to official AGY immediately
  const onNativeMenuSelect = e => {
    const item = e.target?.closest?.('[role="menuitemradio"]');
    if (!item || item.id === MENU_OPT_ID) return;
    const optSpan = item.querySelector('[data-testid^="group-by-option-"]');
    if (!optSpan) return;
    if (state.prefs.groupByRequirement) {
      state.scrollTop = 0;
      void updatePrefs({ groupByRequirement: false });
    }
  };
  document.addEventListener('click', onNativeMenuSelect, true);

  let polling = false;
  async function pollTree(force = false) {
    if (polling) return;
    polling = true;
    try {
      const res = await window.__agyProjectSidebarHost?.getTree?.({ force });
      if (res && !res.offline) {
        state.tree = res;
        if (res.preferences) state.prefs = { ...state.prefs, ...res.preferences };
        syncOfficialMenus();
        render();
      }
    } finally {
      polling = false;
    }
  }

  let layoutScheduled = false;
  const scheduleSyncAndRender = () => {
    if (layoutScheduled) return;
    layoutScheduled = true;
    requestAnimationFrame(() => {
      layoutScheduled = false;
      syncOfficialMenus();
      render();
    });
  };

  const ro = new ResizeObserver(scheduleSyncAndRender);
  const attachObserved = () => {
    const target = document.querySelector('[data-testid="conversation-list-sidebar"]') || document.body;
    ro.disconnect();
    ro.observe(target);
  };
  attachObserved();

  const mo = new MutationObserver(mutations => {
    const host = document.getElementById(HOST_ID);
    const hasExternal = mutations.some(m => {
      if (!host) return true;
      if (m.target === host || host.contains(m.target)) return false;
      if (m.target?.id === MENU_OPT_ID || m.target?.closest?.(`#${MENU_OPT_ID}`)) return false;
      return true;
    });
    if (!hasExternal) return;
    attachObserved();
    scheduleSyncAndRender();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', scheduleSyncAndRender);
  window.addEventListener('popstate', scheduleSyncAndRender);

  const pollTimer = setInterval(() => void pollTree(false), 4000);
  syncOfficialMenus();
  render();
  void pollTree(true);

  window.__agyProjectSidebarDispose = () => {
    clearInterval(pollTimer);
    ro.disconnect();
    mo.disconnect();
    clearListClass();
    document.removeEventListener('click', onNativeMenuSelect, true);
    document.getElementById(MENU_OPT_ID)?.remove();
    for (const n of document.querySelectorAll('[data-agy-req-groupby]')) n.removeAttribute('data-agy-req-groupby');
    for (const n of document.querySelectorAll('.agy-req-submenu-active')) n.classList.remove('agy-req-submenu-active');
    window.removeEventListener('resize', scheduleSyncAndRender);
    window.removeEventListener('popstate', scheduleSyncAndRender);
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    delete window.__agyProjectSidebarInstalled;
  };
};

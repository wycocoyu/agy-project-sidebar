module.exports = function mountProjectSidebarWidget() {
  if (window !== window.top) return;
  if (window.__agyProjectSidebarInstalled) return;
  window.__agyProjectSidebarInstalled = true;

  const STYLE_ID = 'agy-project-sidebar-style';
  const HOST_ID = 'agy-project-sidebar-host';
  const ACTIVE_LIST_CLASS = 'agy-groupby-req-active';
  const MENU_OPT_ID = 'agy-group-by-option-requirement';
  const MANAGED_GROUP_CLASS = 'agy-req-submenu-managed';
  const VALID_DIMS = ['project', 'requirement', 'repo', 'location', 'status'];

  const CHECK_MASK_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 -960 960 960'%3E%3Cpath fill='black' d='M382-339.38L727.54-684.92q8.92-8.92 20.88-9.12t21.27 9.12T779-663.54t-9.31 21.38l-362.38 363Q396.46-268.31 382-268.31t-25.31-10.85l-167-167q-8.92-8.92-8.81-21.19t9.42-21.58t21.38-9.31t21.38 9.31L382-339.38Z'/%3E%3C/svg%3E")`;

  const getI18n = lang => {
    const raw = typeof window.__agyProjectSidebarI18nFactory === 'function'
      ? window.__agyProjectSidebarI18nFactory(lang)
      : {};
    return {
      labels: {
        project: 'Project',
        requirement: 'Requirement',
        repo: 'Repo',
        location: 'Environment',
        status: 'Status',
        none: 'None',
        ...(raw.labels || {}),
      },
      standalone: raw.standalone || 'Standalone',
      statusBlocked: raw.statusBlocked || 'Blocked',
      statusInProgress: raw.statusInProgress || 'In Progress',
      statusIdle: raw.statusIdle || 'Idle',
      envLocal: raw.envLocal || 'This Computer',
      envCloud: raw.envCloud || 'Remote',
      showMore: raw.showMore || 'Show more',
    };
  };

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
  max-width: 155px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
[data-agy-req-groupby="true"] > span.ml-auto::after {
  content: attr(data-agy-req-label);
  font-size: 13px;
}
[role="group"].${MANAGED_GROUP_CLASS} [role="menuitemradio"] > span[data-checked] {
  display: none !important;
}
[role="group"].${MANAGED_GROUP_CLASS} [role="menuitemradio"] {
  color: var(--secondary-foreground, inherit) !important;
}
[role="group"].${MANAGED_GROUP_CLASS} [role="menuitemradio"][data-agy-checked="true"] {
  color: var(--foreground, #000000) !important;
}
[role="group"].${MANAGED_GROUP_CLASS} [role="menuitemradio"][data-agy-order]::before {
  content: attr(data-agy-order);
  order: 2;
  margin-left: auto;
  font-size: 10.5px;
  font-weight: 600;
  line-height: 1;
  padding: 1px 4px;
  border-radius: 4px;
  background: var(--secondary, rgba(10,10,12,0.08));
  color: var(--muted-foreground, #52525b);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
[role="group"].${MANAGED_GROUP_CLASS} [role="menuitemradio"][data-agy-checked="true"]::after {
  content: "";
  order: 3;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: ${CHECK_MASK_URI} center / contain no-repeat;
  mask: ${CHECK_MASK_URI} center / contain no-repeat;
}
[role="group"].${MANAGED_GROUP_CLASS} [role="menuitemradio"][data-agy-checked="true"]:not([data-agy-order])::after {
  margin-left: auto;
}
#${MENU_OPT_ID}:hover,
#${MENU_OPT_ID}[data-highlighted] {
  background: var(--secondary, rgba(10,10,12,0.07));
  color: var(--foreground, #000000) !important;
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
  padding-top: 2px;
  padding-bottom: 1px;
}
.agy-req-sec.is-nested {
  padding-top: 1px;
  padding-bottom: 0;
}
.agy-req-hdr {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px 5px 4px;
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
.agy-req-hdr.is-nested {
  padding-top: 4px;
  padding-bottom: 4px;
  font-size: 12.5px;
}
.agy-req-hdr:hover {
  background: var(--muted, rgba(10,10,12,0.06));
  color: var(--secondary-foreground, var(--foreground, #000000));
}
.agy-req-hdr-left {
  display: flex;
  align-items: center;
  gap: 3px;
  min-width: 0;
  flex: 1 1 auto;
}
.agy-req-hdr-icon {
  width: 22px;
  height: 22px;
  margin: -3px 0;
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
.agy-req-hdr:not(.is-nested) .agy-req-hdr-label {
  font-weight: 500;
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
  const ICON_FOLDER = 'M172.31-180Q142-180 121-201t-21-51.31V-707.69Q100-738 121-759t51.31-21H391.92l80,80H787.69Q818-700 839-679t21,51.31v375.38Q860-222 839-201t-51.31,21H172.31Zm0-60H787.69q5.39,0 8.85-3.46t3.46-8.85V-627.69q0-5.39-3.46-8.85T787.69-640H447.38l-80-80H172.31q-5.39,0-8.85,3.46T160-707.69v455.38q0,5.39 3.46,8.85t8.85,3.46Z';
  const ICON_TAG = 'M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Z';
  const ICON_STATUS_BLOCKED = 'M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z';
  const ICON_STATUS_PROGRESS = 'M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm88-152 56-56-104-104v-168h-80v200l128 128Z';
  const ICON_STATUS_IDLE = 'M424-296 706-578l-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z';
  const ICON_REPO = 'M280-120q-33 0-56.5-23.5T200-200q0-23 12-41.5t32-28.5v-420q-20-10-32-28.5T200-760q0-33 23.5-56.5T280-840q33 0 56.5 23.5T360-760q0 23-12 41.5T316-690v210h244q17 0 28.5-11.5T600-520v-170q-20-10-32-28.5T556-760q0-33 23.5-56.5T636-840q33 0 56.5 23.5T716-760q0 23-12 41.5T672-690v170q0 50-35 85t-85 35H316v130q20 10 32 28.5T360-200q0 33-23.5 56.5T280-120Z';
  const ICON_LOCATION = 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Z';

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

  const NATIVE_TEXT_TO_DIM = {
    project: 'project',
    repo: 'repo',
    environment: 'location',
    location: 'location',
    status: 'status',
    none: 'none',
  };

  const state = {
    prefs: { language: 'zh-CN', groupByDimensions: null, collapsedGroupKeys: [], showArchived: false },
    detectedNativeDim: 'status',
    tree: { projects: [], conversations: [], stats: { totalProjects: 0, totalConversations: 0, runningCount: 0 } },
    expandedLimits: {},
    scrollTop: 0,
    lastRenderSignature: '',
  };

  function getOptionDimFromRadio(item) {
    if (!item) return null;
    if (item.id === MENU_OPT_ID) return 'requirement';
    const span = item.querySelector('[data-testid^="group-by-option-"]');
    const tid = span?.getAttribute('data-testid') || '';
    const m = tid.match(/^group-by-option-(.+)$/);
    return m ? m[1] : null;
  }

  function refreshDetectedNativeDim() {
    const radios = document.querySelectorAll('[role="menuitemradio"]');
    for (const r of radios) {
      if (r.id === MENU_OPT_ID) continue;
      const dim = getOptionDimFromRadio(r);
      if (dim && r.getAttribute('aria-checked') === 'true') {
        state.detectedNativeDim = dim;
        return;
      }
    }
    const trig = document.querySelector('[data-testid="group-by-submenu-trigger"]');
    const valText = trig?.parentElement?.querySelector('span.ml-auto')?.textContent?.trim()?.toLowerCase();
    if (valText && NATIVE_TEXT_TO_DIM[valText]) {
      state.detectedNativeDim = NATIVE_TEXT_TO_DIM[valText];
    }
  }

  function getEffectiveDims() {
    if (Array.isArray(state.prefs.groupByDimensions)) {
      return state.prefs.groupByDimensions.filter(d => VALID_DIMS.includes(d));
    }
    if (state.detectedNativeDim && state.detectedNativeDim !== 'none' && VALID_DIMS.includes(state.detectedNativeDim)) {
      return [state.detectedNativeDim];
    }
    return [];
  }

  function shouldRenderCustomViewport() {
    const dims = getEffectiveDims();
    if (dims.length === 0) {
      return Boolean(state.detectedNativeDim && state.detectedNativeDim !== 'none');
    }
    if (dims.length === 1 && dims[0] !== 'requirement') {
      return Boolean(state.detectedNativeDim && dims[0] !== state.detectedNativeDim);
    }
    return true;
  }

  function formatSummaryLabel(dims, t) {
    if (!dims.length) return t.labels.none;
    return dims.map(d => t.labels[d] || d).join(' + ');
  }

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

  function toggleCollapseGroup(pathKey) {
    const set = new Set(state.prefs.collapsedGroupKeys || []);
    if (set.has(pathKey)) set.delete(pathKey);
    else set.add(pathKey);
    void updatePrefs({ collapsedGroupKeys: [...set] });
  }

  let activeListEl = null;
  function clearListClass() {
    if (activeListEl) {
      activeListEl.classList.remove(ACTIVE_LIST_CLASS);
      activeListEl = null;
    }
  }

  function syncOfficialMenus() {
    refreshDetectedNativeDim();
    const t = getI18n(state.prefs.language);
    const dims = getEffectiveDims();
    const customActive = shouldRenderCustomViewport();

    // 1. Sync "Group By   <Current>" label inside Display Options root menu
    const triggers = document.querySelectorAll('[data-testid="group-by-submenu-trigger"]');
    for (const trig of triggers) {
      const wrap = trig.parentElement;
      const valSpan = wrap?.querySelector('span.ml-auto');
      if (!wrap || !valSpan) continue;
      if (customActive) {
        wrap.setAttribute('data-agy-req-groupby', 'true');
        valSpan.setAttribute('data-agy-req-label', formatSummaryLabel(dims, t));
      } else {
        wrap.removeAttribute('data-agy-req-groupby');
        valSpan.removeAttribute('data-agy-req-label');
      }
    }

    // 2. Sync "Requirement" option + multi-select checkmarks & order badges inside Group By submenu
    const projOptLabel = document.querySelector('[data-testid="group-by-option-project"]');
    const projItem = projOptLabel?.closest('[role="menuitemradio"]');
    const groupBox = projItem?.parentElement;
    if (!groupBox) return;

    groupBox.classList.add(MANAGED_GROUP_CLASS);

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
      const labelInner = el('span', '', t.labels.requirement);
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

      if (projItem.nextSibling) groupBox.insertBefore(reqItem, projItem.nextSibling);
      else groupBox.appendChild(reqItem);
    }

    const showOrder = dims.length >= 2;
    for (const radio of groupBox.querySelectorAll('[role="menuitemradio"]')) {
      const optDim = getOptionDimFromRadio(radio);
      if (!optDim) continue;
      const isChecked = optDim === 'none' ? dims.length === 0 : dims.includes(optDim);
      if (isChecked) {
        radio.setAttribute('data-agy-checked', 'true');
        if (radio.id === MENU_OPT_ID) radio.setAttribute('aria-checked', 'true');
        if (showOrder && optDim !== 'none') {
          radio.setAttribute('data-agy-order', String(dims.indexOf(optDim) + 1));
        } else {
          radio.removeAttribute('data-agy-order');
        }
      } else {
        radio.removeAttribute('data-agy-checked');
        radio.removeAttribute('data-agy-order');
        if (radio.id === MENU_OPT_ID) radio.setAttribute('aria-checked', 'false');
      }
    }
  }

  function measureViewportRect() {
    const list = document.querySelector('[data-testid="conversation-list-sidebar"]');
    if (!list || !shouldRenderCustomViewport()) {
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

  function isActiveConv(conv) {
    return conv.statusGroup === 'in_progress' || conv.statusGroup === 'blocked' || conv.status === 'running' || Boolean(conv.notFullyIdle);
  }

  function partitionByDimension(items, dim, t) {
    if (dim === 'status') {
      const buckets = {
        blocked: { key: 'status:blocked', label: t.statusBlocked, icon: ICON_STATUS_BLOCKED, items: [], isFallback: false },
        in_progress: { key: 'status:in_progress', label: t.statusInProgress, icon: ICON_STATUS_PROGRESS, items: [], isFallback: false },
        idle: { key: 'status:idle', label: t.statusIdle, icon: ICON_STATUS_IDLE, items: [], isFallback: true },
      };
      for (const c of items) {
        const sg = c.statusGroup || (c.status === 'running' || c.notFullyIdle ? 'in_progress' : 'idle');
        (buckets[sg] || buckets.idle).items.push(c);
      }
      return [buckets.blocked, buckets.in_progress, buckets.idle].filter(b => b.items.length > 0);
    }

    if (dim === 'location') {
      const buckets = {
        local: { key: 'loc:local', label: t.envLocal, icon: ICON_LOCATION, items: [], isFallback: false },
        cloud: { key: 'loc:cloud', label: t.envCloud, icon: ICON_LOCATION, items: [], isFallback: false },
      };
      for (const c of items) {
        (c.envKind === 'cloud' ? buckets.cloud : buckets.local).items.push(c);
      }
      return [buckets.local, buckets.cloud].filter(b => b.items.length > 0);
    }

    const map = new Map();
    for (const c of items) {
      let rawKey;
      let label;
      let icon;
      let isFallback = false;

      if (dim === 'requirement') {
        rawKey = `req:${c.reqKey || 'INBOX'}`;
        isFallback = (c.reqKind || 'inbox') === 'inbox';
        label = isFallback ? t.standalone : (c.reqLabel || c.reqKey);
        icon = isFallback ? ICON_FOLDER : ICON_TAG;
      } else if (dim === 'project') {
        isFallback = Boolean(c.isUnassigned);
        rawKey = `proj:${isFallback ? '__unassigned__' : c.projectKey}`;
        label = isFallback ? t.standalone : (c.projectName || c.projectKey);
        icon = ICON_FOLDER;
      } else {
        // repo
        const repo = c.repoName || '';
        isFallback = !repo;
        rawKey = `repo:${repo || '__standalone__'}`;
        label = isFallback ? t.standalone : repo;
        icon = isFallback ? ICON_FOLDER : ICON_REPO;
      }

      if (!map.has(rawKey)) {
        map.set(rawKey, {
          key: rawKey,
          label,
          icon,
          isFallback,
          items: [],
          activeCount: 0,
          latestMs: 0,
        });
      }
      const g = map.get(rawKey);
      g.items.push(c);
      if (isActiveConv(c)) g.activeCount += 1;
      if ((c.updatedAtMs || 0) > g.latestMs) g.latestMs = c.updatedAtMs || 0;
    }

    const named = [];
    let fallback = null;
    for (const g of map.values()) {
      if (!g.items.length) continue;
      if (g.isFallback) fallback = g;
      else named.push(g);
    }
    named.sort((a, b) => {
      if ((a.activeCount > 0) !== (b.activeCount > 0)) return b.activeCount - a.activeCount;
      return b.latestMs - a.latestMs;
    });
    if (fallback) named.push(fallback);
    return named;
  }

  function buildNestedTree(items, dims, depth, pathPrefix, t) {
    if (depth >= dims.length) return [];
    const buckets = partitionByDimension(items, dims[depth], t);
    return buckets.map(b => {
      const pathKey = pathPrefix ? `${pathPrefix}/${b.key}` : b.key;
      const children = depth + 1 < dims.length
        ? buildNestedTree(b.items, dims, depth + 1, pathKey, t)
        : null;
      return {
        ...b,
        pathKey,
        depth,
        children,
      };
    });
  }

  function renderConversationRows(container, items, pathKey, leafPadLeft, activeChatId, t, paginate) {
    const limit = paginate ? (state.expandedLimits[pathKey] || 20) : items.length;
    let visible = items.slice(0, limit);
    if (paginate && activeChatId && items.length > limit && !visible.some(c => c.id === activeChatId)) {
      const activeConv = items.find(c => c.id === activeChatId);
      if (activeConv) visible = [...visible, activeConv];
    }

    for (const conv of visible) {
      const row = el('button', `agy-req-row${conv.id === activeChatId ? ' is-active' : ''}`);
      row.type = 'button';
      row.style.paddingLeft = `${leafPadLeft}px`;
      row.dataset.conversationId = conv.id;

      const top = el('div', 'agy-req-row-top');
      top.appendChild(el('span', 'agy-req-row-title', conv.title));
      const right = el('span', 'agy-req-row-right');
      if (isActiveConv(conv)) {
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
      container.appendChild(row);
    }

    if (paginate && items.length > visible.length) {
      const more = el('button', 'agy-req-more', `${t.showMore} (${items.length - visible.length})`);
      more.type = 'button';
      more.style.paddingLeft = `${leafPadLeft}px`;
      more.addEventListener('click', () => {
        state.expandedLimits[pathKey] = (state.expandedLimits[pathKey] || 20) + 40;
        render();
      });
      container.appendChild(more);
    }
  }

  function renderTreeNodes(container, nodes, collapsedSet, activeChatId, totalDepth, t) {
    for (const node of nodes) {
      const isCollapsed = collapsedSet.has(node.pathKey);
      const secEl = el('div', `agy-req-sec${node.depth > 0 ? ' is-nested' : ''}`);
      secEl.dataset.groupPath = node.pathKey;

      const hdr = el('button', `agy-req-hdr${node.depth > 0 ? ' is-nested' : ''}${isCollapsed ? ' is-collapsed' : ''}`);
      hdr.type = 'button';
      hdr.style.paddingLeft = `${4 + Math.min(node.depth, 4) * 14}px`;
      hdr.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
      hdr.addEventListener('click', () => toggleCollapseGroup(node.pathKey));

      const hdrLeft = el('div', 'agy-req-hdr-left');
      const iconBox = el('div', 'agy-req-hdr-icon');
      const glyph = el('span', 'agy-icon-glyph');
      glyph.appendChild(svgIcon(node.icon, node.depth > 0 ? 14 : 15));
      const chev = el('span', 'agy-icon-chev');
      chev.appendChild(svgIcon(ICON_CHEVRON_RIGHT, 14));
      iconBox.append(glyph, chev);
      hdrLeft.appendChild(iconBox);
      hdrLeft.appendChild(el('span', 'agy-req-hdr-label', node.label));
      hdr.appendChild(hdrLeft);
      hdr.appendChild(el('span', 'agy-req-hdr-count', String(node.items.length)));
      secEl.appendChild(hdr);

      if (!isCollapsed) {
        if (node.children) {
          renderTreeNodes(secEl, node.children, collapsedSet, activeChatId, totalDepth, t);
        } else {
          const leafPadLeft = 16 + Math.min(totalDepth, 4) * 14;
          renderConversationRows(secEl, node.items, node.pathKey, leafPadLeft, activeChatId, t, node.isFallback && node.items.length > 20);
        }
      }

      container.appendChild(secEl);
    }
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
    const dims = getEffectiveDims();
    const allConversations = (state.tree.conversations || []).filter(c => !pinnedIds.has(c.id));

    const sig = JSON.stringify({
      vp,
      lang: state.prefs.language,
      dims,
      collapsed: state.prefs.collapsedGroupKeys,
      limits: state.expandedLimits,
      pinned: [...pinnedIds],
      chat: currentChatId(),
      running: state.tree.stats?.runningCount || 0,
      count: allConversations.length,
      head: allConversations.slice(0, 8).map(c => `${c.id}:${c.statusGroup}:${c.updatedAtMs}:${c.reqKey}:${c.title}`),
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

    const activeChatId = currentChatId();
    const collapsedSet = new Set(state.prefs.collapsedGroupKeys || []);

    if (dims.length === 0) {
      renderConversationRows(viewport, allConversations, 'root:none', 14, activeChatId, t, allConversations.length > 30);
    } else {
      const nodes = buildNestedTree(allConversations, dims, 0, '', t);
      renderTreeNodes(viewport, nodes, collapsedSet, activeChatId, dims.length, t);
    }

    viewport.addEventListener('scroll', () => {
      state.scrollTop = viewport.scrollTop;
    });
    host.appendChild(viewport);
    requestAnimationFrame(() => {
      if (state.scrollTop && viewport.isConnected) viewport.scrollTop = state.scrollTop;
    });
  }

  // Window capture-phase multi-select interceptor: keeps Base-UI Group By submenu open when toggling dimensions
  const INTERCEPT_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];
  const onWindowMenuEvent = e => {
    const radio = e.target?.closest?.('[role="menuitemradio"]');
    if (!radio) return;
    const groupBox = radio.parentElement;
    if (!groupBox || !groupBox.querySelector('[data-testid="group-by-option-project"]')) return;
    const optDim = getOptionDimFromRadio(radio);
    if (!optDim) return;

    if (optDim === 'none') {
      if (e.type === 'click') {
        state.scrollTop = 0;
        if (state.detectedNativeDim === 'none') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          void updatePrefs({ groupByDimensions: null });
          closeOpenOverlayMenus();
        } else {
          // Let native click run so official AGY switches cleanly to None
          void updatePrefs({ groupByDimensions: null });
        }
      }
      return;
    }

    // Multi-selectable dimensions: project, requirement, repo, location, status
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (e.type !== 'click') return;

    const current = getEffectiveDims();
    const next = current.includes(optDim)
      ? current.filter(d => d !== optDim)
      : [...current, optDim];

    state.scrollTop = 0;
    void updatePrefs({ groupByDimensions: next });
  };

  for (const ev of INTERCEPT_EVENTS) {
    window.addEventListener(ev, onWindowMenuEvent, true);
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
    for (const ev of INTERCEPT_EVENTS) {
      window.removeEventListener(ev, onWindowMenuEvent, true);
    }
    document.getElementById(MENU_OPT_ID)?.remove();
    for (const n of document.querySelectorAll('[data-agy-req-groupby]')) n.removeAttribute('data-agy-req-groupby');
    for (const n of document.querySelectorAll('[data-agy-checked]')) n.removeAttribute('data-agy-checked');
    for (const n of document.querySelectorAll('[data-agy-order]')) n.removeAttribute('data-agy-order');
    for (const n of document.querySelectorAll(`.${MANAGED_GROUP_CLASS}`)) n.classList.remove(MANAGED_GROUP_CLASS);
    window.removeEventListener('resize', scheduleSyncAndRender);
    window.removeEventListener('popstate', scheduleSyncAndRender);
    document.getElementById(HOST_ID)?.remove();
    document.getElementById(STYLE_ID)?.remove();
    delete window.__agyProjectSidebarInstalled;
  };
};

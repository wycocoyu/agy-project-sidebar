module.exports = function mountProjectSidebarWidget(testEnv) {
  const TECH_ID_RE = /^(?:GPT|UTF|SHA|ISO|HTTP|HTTPS|CVE|NODE|PR|V\d+)-\d+$/i;
  const SHORT_REPO_ISSUE_RE = /^(?:#\d+|PR#\d+)$/i;
  const SESSION_NAME_RE = /^(\d{4})\s*\|\s*([^|]+?)\s*\|\s*(.+)$/;
  const PREFIX_ISSUE_RE = /^(#[1-9]\d*|[Qq]\d+|PR\s*#?\d+|[A-Za-z][A-Za-z0-9]{1,9}-\d+)\b[\s|:：\-]*(.*)$/;
  const EMBEDDED_ISSUE_RE = /(?:^|[\s|(\[【])(#[1-9]\d*|[A-Z]{2,10}-\d+|[Qq]\d{2,})\b/;

  function parseSessionTitle(title) {
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

  function extractRequirementDescriptor(title) {
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
          return {
            kind: 'issue',
            key: `ISSUE:${normalizedToken}`,
            shortId: normalizedToken,
            label,
            scopeByProject: SHORT_REPO_ISSUE_RE.test(normalizedToken),
          };
        }
      }
    }

    for (const text of candidates) {
      if (!text) continue;
      const embMatch = text.match(EMBEDDED_ISSUE_RE);
      if (embMatch) {
        const token = embMatch[1].startsWith('#') ? embMatch[1] : embMatch[1].toUpperCase();
        if (!TECH_ID_RE.test(token)) {
          return {
            kind: 'issue',
            key: `ISSUE:${token}`,
            shortId: token,
            label: `${token} · ${parsed.subject || text}`,
            scopeByProject: SHORT_REPO_ISSUE_RE.test(token),
          };
        }
      }
    }

    if (parsed.hasStandardFormat && parsed.subject) {
      return {
        kind: 'theme-candidate',
        key: `THEME:${parsed.subject.toLowerCase()}`,
        shortId: '',
        label: parsed.subject,
        scopeByProject: true,
      };
    }

    return { kind: 'inbox', key: 'INBOX', shortId: '', label: '', scopeByProject: false };
  }

  function assignRequirements(convs) {
    const prepared = convs.map(c => ({
      conv: c,
      projectKey: c.projectKey || '__unassigned__',
      desc: extractRequirementDescriptor(c.title),
    }));

    const themeCounts = new Map();
    const issueCounts = new Map();
    const issueLabels = new Map();
    for (const p of prepared) {
      if (p.desc.kind === 'theme-candidate') {
        const scopeKey = `${p.projectKey}::${p.desc.key}`;
        themeCounts.set(scopeKey, (themeCounts.get(scopeKey) || 0) + 1);
      } else if (p.desc.kind === 'issue') {
        const effectiveKey = p.desc.scopeByProject
          ? `${p.projectKey}::${p.desc.key}`
          : p.desc.key;
        p.effectiveIssueKey = effectiveKey;
        issueCounts.set(effectiveKey, (issueCounts.get(effectiveKey) || 0) + 1);
        const existing = issueLabels.get(effectiveKey);
        if (!existing || p.desc.label.length > existing.length) {
          issueLabels.set(effectiveKey, p.desc.label);
        }
      }
    }

    return prepared.map(p => {
      let reqKey = 'INBOX';
      let reqLabel = '';
      let reqKind = 'inbox';
      let reqCount = 1;

      if (p.desc.kind === 'issue') {
        reqKey = p.effectiveIssueKey;
        reqLabel = issueLabels.get(reqKey) || p.desc.label;
        reqKind = 'issue';
        reqCount = issueCounts.get(reqKey) || 1;
      } else if (p.desc.kind === 'theme-candidate') {
        const scopeKey = `${p.projectKey}::${p.desc.key}`;
        const count = themeCounts.get(scopeKey) || 0;
        if (count >= 2) {
          reqKey = scopeKey;
          reqLabel = p.desc.label;
          reqKind = 'theme';
          reqCount = count;
        }
      }

      return { ...p.conv, reqKey, reqLabel, reqKind, reqCount };
    });
  }

  function getStatusGroup(conv) {
    if (conv.statusGroup === 'blocked' || conv.statusGroup === 'in_progress' || conv.statusGroup === 'idle') {
      return conv.statusGroup;
    }
    return conv.status === 'running' ? 'in_progress' : 'idle';
  }

  function isActiveConv(conv) {
    const sg = getStatusGroup(conv);
    return sg === 'in_progress' || sg === 'blocked';
  }

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

  function compareInternalRows(a, b) {
    const rank = c => {
      const sg = getStatusGroup(c);
      if (sg === 'blocked') return 0;
      if (sg === 'in_progress') return 1;
      return c.isUnread ? 2 : 3;
    };
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
  }

  function buildReqClusters(convs) {
    const byReq = new Map();
    const standaloneRows = [];
    for (const c of convs) {
      if (c.reqKind && c.reqKind !== 'inbox' && c.reqKey && c.reqKey !== 'INBOX') {
        if (!byReq.has(c.reqKey)) byReq.set(c.reqKey, []);
        byReq.get(c.reqKey).push(c);
      } else {
        standaloneRows.push(c);
      }
    }

    const clusters = [];
    for (const [reqKey, groupItems] of byReq.entries()) {
      if (!groupItems.length) continue;
      const sorted = [...groupItems].sort(compareInternalRows);
      let blockedCount = 0;
      let runningCount = 0;
      let unreadCount = 0;
      let latestMs = 0;
      let latestActiveMs = 0;
      let bestLabel = sorted[0]?.reqLabel || reqKey;

      for (const it of sorted) {
        const sg = getStatusGroup(it);
        const ms = it.updatedAtMs || 0;
        if (sg === 'blocked') {
          blockedCount += 1;
          if (ms > latestActiveMs) latestActiveMs = ms;
        } else if (sg === 'in_progress') {
          runningCount += 1;
          if (ms > latestActiveMs) latestActiveMs = ms;
        } else if (it.isUnread) {
          unreadCount += 1;
        }
        if (ms > latestMs) latestMs = ms;
        if (it.reqLabel && it.reqLabel.length > bestLabel.length) bestLabel = it.reqLabel;
      }

      const highestStatus = blockedCount > 0
        ? 'blocked'
        : (runningCount > 0 ? 'in_progress' : 'idle');

      clusters.push({
        kind: 'group',
        reqKey,
        label: bestLabel,
        items: sorted,
        blockedCount,
        runningCount,
        unreadCount,
        isUnread: unreadCount > 0,
        highestStatus,
        latestMs,
        latestActiveMs: latestActiveMs || latestMs,
      });
    }

    return { clusters, standaloneRows };
  }

  function sortReqClusters(clusters) {
    const rank = g => {
      if (g.highestStatus === 'blocked') return 0;
      if (g.highestStatus === 'in_progress') return 1;
      return g.isUnread ? 2 : 3;
    };
    return [...clusters].sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra <= 1) return (b.latestActiveMs || 0) - (a.latestActiveMs || 0);
      return (b.latestMs || 0) - (a.latestMs || 0);
    });
  }

  function makeReqClusterHeader(cluster, gPathKey, depth, isCollapsed, toggleKey) {
    return {
      type: 'header',
      id: `header-agy-req:${gPathKey}`,
      label: cluster.label,
      count: cluster.items.length,
      isCollapsed,
      _agyKind: 'req-header',
      _agyDepth: depth,
      _agyToggleKey: toggleKey,
      _agyRunning: cluster.runningCount + cluster.blockedCount,
      _agyBlocked: cluster.blockedCount,
      _agyUnread: cluster.unreadCount,
      _agyTotal: cluster.items.length,
      _agyLatestMs: cluster.latestMs,
    };
  }

  function makePageShowMore(pageKey, remaining, depth, t, forceIndent = false) {
    const indented = forceIndent || depth > 0;
    const effectiveDepth = forceIndent ? Math.max(depth, 1) : depth;
    return {
      type: 'show-more',
      id: `show-more-agy-page:${pageKey}`,
      groupId: `agy-page:${pageKey}`,
      isIndented: indented,
      label: `${t.showMore} (${remaining})`,
      _agyIndentPx: indented ? effectiveDepth * 14 : 0,
    };
  }

  function emitClusterGroupItems(out, cluster, gPathKey, depth, bucketKey, opts) {
    const { collapsedSet, expandedReadIdleGroups, activeChatId, t, isHistory } = opts;
    const isIdleBucket = bucketKey === 'idle';
    const defaultCollapsed = isIdleBucket;
    const toggleKey = defaultCollapsed ? `exp:${gPathKey}` : `col:${gPathKey}`;
    const isCollapsed = defaultCollapsed ? !collapsedSet.has(toggleKey) : collapsedSet.has(toggleKey);

    out.push({
      type: 'header',
      id: `header-agy-req:${gPathKey}`,
      label: cluster.label,
      count: cluster.items.length,
      isCollapsed,
      _agyKind: 'req-header',
      _agyDepth: depth,
      _agyToggleKey: toggleKey,
      _agyRunning: cluster.runningCount + cluster.blockedCount,
      _agyBlocked: cluster.blockedCount,
      _agyUnread: cluster.unreadCount,
      _agyTotal: cluster.items.length,
      _agyLatestMs: cluster.latestMs,
    });

    if (isCollapsed) return;

    const childGroupId = `agy-nested-d${Math.min(Math.max(depth, 1), 3)}:${gPathKey}`;
    if (!isIdleBucket && !isHistory) {
      const visibleNow = [];
      const foldedReadIdle = [];
      for (const it of cluster.items) {
        if (getStatusGroup(it) !== 'idle' || it.isUnread || (activeChatId && it.id === activeChatId)) {
          visibleNow.push(it);
        } else {
          foldedReadIdle.push(it);
        }
      }
      for (const it of visibleNow) {
        out.push({ type: 'row', id: it.id, cascadeId: it.id, isIndented: true, groupId: childGroupId });
      }
      if (foldedReadIdle.length > 0) {
        const foldExpanded = expandedReadIdleGroups.has(gPathKey);
        if (foldExpanded) {
          for (const it of foldedReadIdle) {
            out.push({ type: 'row', id: it.id, cascadeId: it.id, isIndented: true, groupId: childGroupId });
          }
          out.push({
            type: 'show-more',
            id: `show-more-agy-fold:${gPathKey}`,
            groupId: `agy-fold:${gPathKey}`,
            isIndented: true,
            label: (t.collapseReadIdle || '▾ 收起 {n} 条已读空闲会话').replace('{n}', String(foldedReadIdle.length)),
            _agyIndentPx: depth * 14,
          });
        } else {
          out.push({
            type: 'show-more',
            id: `show-more-agy-fold:${gPathKey}`,
            groupId: `agy-fold:${gPathKey}`,
            isIndented: true,
            label: (t.expandReadIdle || '▸ 展开其余 {n} 条已读空闲会话').replace('{n}', String(foldedReadIdle.length)),
            _agyIndentPx: depth * 14,
          });
        }
      }
      return;
    }

    for (const it of cluster.items) {
      out.push({ type: 'row', id: it.id, cascadeId: it.id, isIndented: true, groupId: childGroupId });
    }
  }

  function buildStatusRequirementItems(convs, prefixPath, depth, opts) {
    const { collapsedSet, expandedLimits, t, isHistory } = opts;
    const { clusters, standaloneRows } = buildReqClusters(convs);

    const buckets = {
      blocked: { key: 'blocked', nativeId: 'status-blocked', label: t.statusBlocked, iconName: 'error', entries: [], rawCount: 0 },
      in_progress: { key: 'in_progress', nativeId: 'status-in-progress', label: t.statusInProgress, iconName: 'schedule', entries: [], rawCount: 0 },
      idle: { key: 'idle', nativeId: 'status-idle', label: t.statusIdle, iconName: 'check_circle', entries: [], rawCount: 0 },
    };

    for (const c of standaloneRows) {
      const sg = getStatusGroup(c);
      const b = buckets[sg] || buckets.idle;
      b.rawCount += 1;
      b.entries.push({
        kind: 'single',
        conv: c,
        isUnread: Boolean(c.isUnread),
        latestMs: c.updatedAtMs || 0,
        latestActiveMs: c.updatedAtMs || 0,
      });
    }

    for (const g of clusters) {
      const b = buckets[g.highestStatus] || buckets.idle;
      b.rawCount += g.items.length;
      b.entries.push(g);
    }

    for (const bKey of ['blocked', 'in_progress']) {
      buckets[bKey].entries.sort((a, b) => (b.latestActiveMs || 0) - (a.latestActiveMs || 0));
    }
    buckets.idle.entries.sort((a, b) => {
      if (Boolean(a.isUnread) !== Boolean(b.isUnread)) return a.isUnread ? -1 : 1;
      return (b.latestMs || 0) - (a.latestMs || 0);
    });

    const out = [];
    for (const bKey of ['blocked', 'in_progress', 'idle']) {
      const bucket = buckets[bKey];
      if (!bucket.entries.length) continue;

      const statusPathKey = prefixPath ? `${prefixPath}/status:${bKey}` : `status:${bKey}`;
      const statusToggleKey = `col:${statusPathKey}`;
      const isStatusCollapsed = collapsedSet.has(statusToggleKey);

      out.push({
        type: 'header',
        id: depth === 0 ? `header-${bucket.nativeId}` : `header-agy:${statusPathKey}`,
        label: bucket.label,
        count: bucket.rawCount,
        isCollapsed: isStatusCollapsed,
        _agyKind: 'top-header',
        _agyIconName: bucket.iconName,
        _agyDepth: depth,
        _agyToggleKey: statusToggleKey,
        _agyStatusKey: bKey,
      });

      if (isStatusCollapsed) continue;

      const limit = bKey === 'idle' && !isHistory ? (expandedLimits[statusPathKey] || 40) : bucket.entries.length;
      let visible = bucket.entries.slice(0, limit);
      if (bucket.entries.length > visible.length && opts.activeChatId) {
        const hasActive = visible.some(e => e.kind === 'single' ? e.conv.id === opts.activeChatId : e.items.some(it => it.id === opts.activeChatId));
        if (!hasActive) {
          const activeEntry = bucket.entries.find(e => e.kind === 'single' ? e.conv.id === opts.activeChatId : e.items.some(it => it.id === opts.activeChatId));
          if (activeEntry) visible = [...visible, activeEntry];
        }
      }
      const singleGroupId = depth > 0 ? `agy-nested-d${Math.min(depth, 3)}:${statusPathKey}` : bucket.nativeId;

      for (const entry of visible) {
        if (entry.kind === 'single') {
          out.push({
            type: 'row',
            id: entry.conv.id,
            cascadeId: entry.conv.id,
            isIndented: true,
            groupId: singleGroupId,
          });
        } else {
          const gPathKey = `${statusPathKey}/req:${entry.reqKey}`;
          emitClusterGroupItems(out, entry, gPathKey, depth + 1, bKey, opts);
        }
      }

      if (bucket.entries.length > visible.length) {
        const remaining = bucket.entries.length - visible.length;
        out.push({
          type: 'show-more',
          id: `show-more-agy-page:${statusPathKey}`,
          groupId: `agy-page:${statusPathKey}`,
          isIndented: depth > 0,
          label: `${t.showMore} (${remaining})`,
          _agyIndentPx: depth > 0 ? depth * 14 : 0,
        });
      }
    }

    return out;
  }

  function buildRequirementOnlyItems(convs, prefixPath, depth, opts) {
    const { collapsedSet, expandedLimits, t, isHistory } = opts;
    const { clusters, standaloneRows } = buildReqClusters(convs);
    const sortedClusters = sortReqClusters(clusters);

    const pageKey = prefixPath || 'root:requirement';
    const limit = !isHistory ? (expandedLimits[pageKey] || 40) : sortedClusters.length;
    const visible = sortedClusters.slice(0, limit);

    const out = [];
    for (const cluster of visible) {
      const gPathKey = prefixPath ? `${prefixPath}/req:${cluster.reqKey}` : `req:${cluster.reqKey}`;
      emitClusterGroupItems(out, cluster, gPathKey, depth, cluster.highestStatus, opts);
    }

    if (sortedClusters.length > visible.length) {
      out.push(makePageShowMore(pageKey, sortedClusters.length - visible.length, depth, t));
    }

    if (standaloneRows.length > 0) {
      const inboxPathKey = prefixPath ? `${prefixPath}/req:INBOX` : 'req:INBOX';
      const inboxToggleKey = `exp:${inboxPathKey}`;
      const isInboxCollapsed = !collapsedSet.has(inboxToggleKey);
      out.push({
        type: 'header',
        id: `header-agy:${inboxPathKey}`,
        label: t.standalone,
        count: standaloneRows.length,
        isCollapsed: isInboxCollapsed,
        _agyKind: 'top-header',
        _agyIconName: 'folder',
        _agyDepth: depth,
        _agyToggleKey: inboxToggleKey,
      });
      if (!isInboxCollapsed) {
        const sortedStandalone = [...standaloneRows].sort((a, b) => {
          if (isActiveConv(a) !== isActiveConv(b)) return isActiveConv(a) ? -1 : 1;
          if (Boolean(a.isUnread) !== Boolean(b.isUnread)) return a.isUnread ? -1 : 1;
          return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
        });
        const inboxLimit = !isHistory ? (expandedLimits[inboxPathKey] || 40) : sortedStandalone.length;
        const visStandalone = sortedStandalone.slice(0, inboxLimit);
        const childGroupId = `agy-nested-d${Math.min(Math.max(depth, 1), 3)}:${inboxPathKey}`;
        for (const c of visStandalone) {
          out.push({
            type: 'row',
            id: c.id,
            cascadeId: c.id,
            isIndented: true,
            groupId: childGroupId,
          });
        }
        if (sortedStandalone.length > visStandalone.length) {
          out.push(makePageShowMore(inboxPathKey, sortedStandalone.length - visStandalone.length, depth, t, true));
        }
      }
    }

    return out;
  }

  function partitionByDimension(items, dim, t) {
    if (dim === 'status') {
      const buckets = {
        blocked: { key: 'status:blocked', nativeId: 'status-blocked', label: t.statusBlocked, iconName: 'error', items: [], isFallback: false },
        in_progress: { key: 'status:in_progress', nativeId: 'status-in-progress', label: t.statusInProgress, iconName: 'schedule', items: [], isFallback: false },
        idle: { key: 'status:idle', nativeId: 'status-idle', label: t.statusIdle, iconName: 'check_circle', items: [], isFallback: true },
      };
      for (const c of items) {
        const sg = getStatusGroup(c);
        (buckets[sg] || buckets.idle).items.push(c);
      }
      return [buckets.blocked, buckets.in_progress, buckets.idle].filter(b => b.items.length > 0);
    }

    if (dim === 'location') {
      const buckets = {
        local: { key: 'loc:local', nativeId: 'loc-local', label: t.envLocal, iconName: 'computer', items: [], isFallback: false },
        cloud: { key: 'loc:cloud', nativeId: 'loc-cloud', label: t.envCloud, iconName: 'cloud', items: [], isFallback: false },
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
      let iconName;
      let isFallback = false;

      if (dim === 'requirement') {
        rawKey = `req:${c.reqKey || 'INBOX'}`;
        isFallback = (c.reqKind || 'inbox') === 'inbox';
        label = isFallback ? t.standalone : (c.reqLabel || c.reqKey);
        iconName = isFallback ? 'folder' : 'sell';
      } else if (dim === 'project') {
        isFallback = Boolean(c.isUnassigned);
        rawKey = `proj:${isFallback ? '__unassigned__' : c.projectKey}`;
        label = isFallback ? t.standalone : (c.projectName || c.projectKey);
        iconName = 'folder';
      } else {
        const repo = c.repoName || '';
        isFallback = !repo;
        rawKey = `repo:${repo || '__standalone__'}`;
        label = isFallback ? t.standalone : repo;
        iconName = isFallback ? 'folder' : 'account_tree';
      }

      if (!map.has(rawKey)) {
        map.set(rawKey, {
          key: rawKey,
          label,
          iconName,
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

  function emitGenericDims(convs, dims, prefixPath, depth, opts) {
    const { collapsedSet, expandedLimits, t, isHistory } = opts;
    if (dims.length === 0) {
      const sorted = [...convs].sort((a, b) => {
        if (isActiveConv(a) !== isActiveConv(b)) return isActiveConv(a) ? -1 : 1;
        if (Boolean(a.isUnread) !== Boolean(b.isUnread)) return a.isUnread ? -1 : 1;
        return (b.updatedAtMs || 0) - (a.updatedAtMs || 0);
      });
      const key = prefixPath || 'root:none';
      const limit = !isHistory ? (expandedLimits[key] || 60) : sorted.length;
      const visible = sorted.slice(0, limit);
      const out = visible.map(c => ({
        type: 'row',
        id: c.id,
        cascadeId: c.id,
        isIndented: depth > 0,
        groupId: depth > 0 ? `agy-nested-d${Math.min(depth, 3)}:${key}` : 'all',
      }));
      if (sorted.length > visible.length) {
        out.push({
          type: 'show-more',
          id: `show-more-agy-page:${key}`,
          groupId: `agy-page:${key}`,
          isIndented: depth > 0,
          label: `${t.showMore} (${sorted.length - visible.length})`,
          _agyIndentPx: depth > 0 ? depth * 14 : 0,
        });
      }
      return out;
    }

    const statusIdx = dims.indexOf('status');
    const reqIdx = dims.indexOf('requirement');
    if (statusIdx >= 0 && reqIdx >= 0 && statusIdx < reqIdx) {
      const outerDims = dims.filter(d => d !== 'status' && d !== 'requirement');
      if (outerDims.length === 0) {
        return buildStatusRequirementItems(convs, prefixPath, depth, opts);
      }
      const [headDim, ...tailOuter] = outerDims;
      const buckets = partitionByDimension(convs, headDim, t);
      const out = [];
      for (const b of buckets) {
        const pathKey = prefixPath ? `${prefixPath}/${b.key}` : b.key;
        const toggleKey = `col:${pathKey}`;
        const isCollapsed = collapsedSet.has(toggleKey);
        out.push({
          type: 'header',
          id: `header-agy:${pathKey}`,
          label: b.label,
          count: b.items.length,
          isCollapsed,
          _agyKind: 'top-header',
          _agyIconName: b.iconName,
          _agyDepth: depth,
          _agyToggleKey: toggleKey,
        });
        if (!isCollapsed) {
          out.push(...emitGenericDims(b.items, [...tailOuter, 'status', 'requirement'], pathKey, depth + 1, opts));
        }
      }
      return out;
    }

    if (dims.length === 1 && dims[0] === 'requirement') {
      return buildRequirementOnlyItems(convs, prefixPath, depth, opts);
    }

    const [headDim, ...restDims] = dims;
    if (headDim === 'requirement') {
      const { clusters, standaloneRows } = buildReqClusters(convs);
      const sortedClusters = sortReqClusters(clusters);
      const pageKey = prefixPath ? `${prefixPath}/req:groups` : 'root:requirement';
      const limit = !isHistory ? (expandedLimits[pageKey] || 40) : sortedClusters.length;
      const visible = sortedClusters.slice(0, limit);
      const out = [];
      for (const cluster of visible) {
        const gPathKey = prefixPath ? `${prefixPath}/req:${cluster.reqKey}` : `req:${cluster.reqKey}`;
        const defaultCollapsed = cluster.highestStatus === 'idle';
        const toggleKey = defaultCollapsed ? `exp:${gPathKey}` : `col:${gPathKey}`;
        const isCollapsed = defaultCollapsed ? !collapsedSet.has(toggleKey) : collapsedSet.has(toggleKey);
        out.push(makeReqClusterHeader(cluster, gPathKey, depth, isCollapsed, toggleKey));
        if (!isCollapsed) {
          out.push(...emitGenericDims(cluster.items, restDims, gPathKey, depth + 1, opts));
        }
      }
      if (sortedClusters.length > visible.length) {
        out.push(makePageShowMore(pageKey, sortedClusters.length - visible.length, depth, t));
      }
      if (standaloneRows.length > 0) {
        const inboxPathKey = prefixPath ? `${prefixPath}/req:INBOX` : 'req:INBOX';
        const inboxToggleKey = `exp:${inboxPathKey}`;
        const isInboxCollapsed = !collapsedSet.has(inboxToggleKey);
        out.push({
          type: 'header',
          id: `header-agy:${inboxPathKey}`,
          label: t.standalone,
          count: standaloneRows.length,
          isCollapsed: isInboxCollapsed,
          _agyKind: 'top-header',
          _agyIconName: 'folder',
          _agyDepth: depth,
          _agyToggleKey: inboxToggleKey,
        });
        if (!isInboxCollapsed) {
          out.push(...emitGenericDims(standaloneRows, restDims, inboxPathKey, depth + 1, opts));
        }
      }
      return out;
    }

    const buckets = partitionByDimension(convs, headDim, t);
    const out = [];
    for (const b of buckets) {
      const pathKey = prefixPath ? `${prefixPath}/${b.key}` : b.key;
      const toggleKey = `col:${pathKey}`;
      const isCollapsed = collapsedSet.has(toggleKey);
      out.push({
        type: 'header',
        id: depth === 0 && b.nativeId ? `header-${b.nativeId}` : `header-agy:${pathKey}`,
        label: b.label,
        count: b.items.length,
        isCollapsed,
        _agyKind: 'top-header',
        _agyIconName: b.iconName,
        _agyDepth: depth,
        _agyToggleKey: toggleKey,
      });
      if (isCollapsed) continue;
      if (restDims.length > 0) {
        out.push(...emitGenericDims(b.items, restDims, pathKey, depth + 1, opts));
      } else {
        const sorted = [...b.items].sort((a, b2) => {
          if (Boolean(a.isUnread) !== Boolean(b2.isUnread)) return a.isUnread ? -1 : 1;
          return (b2.updatedAtMs || 0) - (a.updatedAtMs || 0);
        });
        const limit = !isHistory && (b.isFallback || sorted.length > 40) ? (expandedLimits[pathKey] || 40) : sorted.length;
        const visible = sorted.slice(0, limit);
        const childGroupId = depth > 0 ? `agy-nested-d${Math.min(depth, 3)}:${pathKey}` : (b.nativeId || `agy:${pathKey}`);
        for (const c of visible) {
          out.push({
            type: 'row',
            id: c.id,
            cascadeId: c.id,
            isIndented: true,
            groupId: childGroupId,
          });
        }
        if (sorted.length > visible.length) {
          out.push({
            type: 'show-more',
            id: `show-more-agy-page:${pathKey}`,
            groupId: `agy-page:${pathKey}`,
            isIndented: depth > 0,
            label: `${t.showMore} (${sorted.length - visible.length})`,
            _agyIndentPx: depth > 0 ? depth * 14 : 0,
          });
        }
      }
    }
    return out;
  }

  function buildVirtualItemsForDims(convs, dims, opts = {}) {
    const t = opts.t || {
      statusBlocked: 'Blocked',
      statusInProgress: 'In Progress',
      statusIdle: 'Idle',
      envLocal: 'This Computer',
      envCloud: 'Remote',
      standalone: 'Standalone',
      showMore: 'Show more',
      expandReadIdle: '▸ 展开其余 {n} 条已读空闲会话',
      collapseReadIdle: '▾ 收起 {n} 条已读空闲会话',
    };
    const scoped = assignRequirements(convs || []);
    return emitGenericDims(scoped, dims || [], '', 0, {
      collapsedSet: opts.collapsedSet instanceof Set ? opts.collapsedSet : new Set(opts.collapsedKeys || []),
      expandedReadIdleGroups: opts.expandedReadIdleGroups instanceof Set ? opts.expandedReadIdleGroups : new Set(opts.expandedReadIdleKeys || []),
      expandedLimits: opts.expandedLimits || {},
      activeChatId: opts.activeChatId || null,
      isHistory: Boolean(opts.isHistory),
      t,
    });
  }

  if (testEnv && testEnv.__unitTestOnly) {
    return {
      parseSessionTitle,
      extractRequirementDescriptor,
      assignRequirements,
      partitionByDimension,
      buildNestedTree,
      buildVirtualItemsForDims,
    };
  }

  if (typeof window === 'undefined' || window !== window.top) return;
  if (window.__agyProjectSidebarInstalled) return;
  window.__agyProjectSidebarInstalled = true;

  const STYLE_ID = 'agy-project-sidebar-style';
  const MENU_OPT_ID = 'agy-group-by-option-requirement';
  const MANAGED_GROUP_CLASS = 'agy-req-submenu-managed';
  const VALID_DIMS = ['project', 'requirement', 'repo', 'location', 'status'];

  const CHECK_MASK_URI = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 -960 960 960'%3E%3Cpath fill='black' d='M382-339.38L727.54-684.92q8.92-8.92 20.88-9.12t21.27 9.12T779-663.54t-9.31 21.38l-362.38 363Q396.46-268.31 382-268.31t-25.31-10.85l-167-167q-8.92-8.92-8.81-21.19t9.42-21.58t21.38-9.31t21.38 9.31L382-339.38Z'/%3E%3C/svg%3E")`;

  const ICON_PATHS = {
    chevron: 'M517.85-480l-184-184L376-706.15L602.15-480L376-253.85L333.85-296l184-184Z',
    folder: 'M172.31-180Q142-180 121-201t-21-51.31V-707.69Q100-738 121-759t51.31-21H391.92l80,80H787.69Q818-700 839-679t21,51.31v375.38Q860-222 839-201t-51.31,21H172.31Zm0-60H787.69q5.39,0 8.85-3.46t3.46-8.85V-627.69q0-5.39-3.46-8.85T787.69-640H447.38l-80-80H172.31q-5.39,0-8.85,3.46T160-707.69v455.38q0,5.39 3.46,8.85t8.85,3.46Z',
    sell: 'M856-390 570-104q-12 12-27 18t-30 6q-15 0-30-6t-27-18L103-457q-11-11-17-25.5T80-513v-287q0-33 23.5-56.5T160-880h287q16 0 31 6.5t26 17.5l352 353q12 12 17.5 27t5.5 30q0 15-5.5 29.5T856-390ZM513-160l286-286-353-354H160v286l353 354ZM260-640q25 0 42.5-17.5T320-700q0-25-17.5-42.5T260-760q-25 0-42.5 17.5T200-700q0 25 17.5 42.5T260-640Z',
    error: 'M480-280q17 0 28.5-11.5T520-320q0-17-11.5-28.5T480-360q-17 0-28.5 11.5T440-320q0 17 11.5 28.5T480-280Zm-40-160h80v-240h-80v240Zm40 360q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z',
    schedule: 'M480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-155.5t86-127Q252-817 325-848.5T480-880q83 0 155.5 31.5t127 86q54.5 54.5 86 127T880-480q0 82-31.5 155t-86 127.5q-54.5 54.5-127 86T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Zm88-152 56-56-104-104v-168h-80v200l128 128Z',
    check_circle: 'M424-296 706-578l-56-56-226 226-114-114-56 56 170 170Zm56 216q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm0-80q134 0 227-93t93-227q0-134-93-227t-227-93q-134 0-227 93t-93 227q0 134 93 227t227 93Z',
    account_tree: 'M280-120q-33 0-56.5-23.5T200-200q0-23 12-41.5t32-28.5v-420q-20-10-32-28.5T200-760q0-33 23.5-56.5T280-840q33 0 56.5 23.5T360-760q0 23-12 41.5T316-690v210h244q17 0 28.5-11.5T600-520v-170q-20-10-32-28.5T556-760q0-33 23.5-56.5T636-840q33 0 56.5 23.5T716-760q0 23-12 41.5T672-690v170q0 50-35 85t-85 35H316v130q20 10 32 28.5T360-200q0 33-23.5 56.5T280-120Z',
    computer: 'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-80h640v-480H160v480Z',
    cloud: 'M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Zm0-80h480q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41Z',
  };

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
      expandReadIdle: raw.expandReadIdle || '▸ 展开其余 {n} 条已读空闲会话',
      collapseReadIdle: raw.collapseReadIdle || '▾ 收起 {n} 条已读空闲会话',
    };
  };

  const CSS = `
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
[data-testid="conversation-list-sidebar"] [data-sidebar-section-id^="agy-nested-d1:"],
[data-testid="conversation-list-history"] [data-sidebar-section-id^="agy-nested-d1:"] {
  padding-left: 14px;
  box-sizing: border-box;
}
[data-testid="conversation-list-sidebar"] [data-sidebar-section-id^="agy-nested-d2:"],
[data-testid="conversation-list-history"] [data-sidebar-section-id^="agy-nested-d2:"] {
  padding-left: 28px;
  box-sizing: border-box;
}
[data-testid="conversation-list-sidebar"] [data-sidebar-section-id^="agy-nested-d3:"],
[data-testid="conversation-list-history"] [data-sidebar-section-id^="agy-nested-d3:"] {
  padding-left: 42px;
  box-sizing: border-box;
}
.agy-native-hdr-btn .agy-native-chev {
  display: none;
  transition: transform 120ms ease;
}
.agy-native-hdr-btn:hover .agy-native-glyph,
.agy-native-hdr-btn.is-collapsed .agy-native-glyph {
  display: none;
}
.agy-native-hdr-btn:hover .agy-native-chev,
.agy-native-hdr-btn.is-collapsed .agy-native-chev {
  display: inline-flex;
}
.agy-native-hdr-btn:not(.is-collapsed) .agy-native-chev {
  transform: rotate(90deg);
}
.agy-native-req-btn .agy-req-chev {
  display: inline-flex;
  transition: transform 120ms ease;
  opacity: 0.72;
}
.agy-native-req-btn:not(.is-collapsed) .agy-req-chev {
  transform: rotate(90deg);
}
@keyframes agyStateDotPulse {
  0%, 100% { opacity: 0.28; transform: scale(0.84); }
  50% { opacity: 1; transform: scale(1); }
}
.agy-native-spinner {
  display: grid;
  grid-template-columns: repeat(2, 3.5px);
  gap: 2px;
  width: 11px;
  height: 11px;
  place-content: center;
  flex-shrink: 0;
}
.agy-native-spinner > span {
  width: 3.5px;
  height: 3.5px;
  border-radius: 9999px;
  background: currentColor;
  animation: agyStateDotPulse 1.4s ease-in-out infinite;
}
.agy-native-spinner > span:nth-child(2) { animation-delay: 0.2s; }
.agy-native-spinner > span:nth-child(3) { animation-delay: 0.4s; }
.agy-native-spinner > span:nth-child(4) { animation-delay: 0.6s; }
.agy-native-unread {
  width: 8px;
  height: 8px;
  border-radius: 9999px;
  background: #3b82f6;
  flex-shrink: 0;
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

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function closeOpenOverlayMenus() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }, 30);
  }

  function currentChatId() {
    const m = window.location.pathname.match(/^\/c\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : null;
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
    expandedReadIdleGroups: new Set(),
    localViewedMs: new Map(),
    refreshTick: 0,
    prefsSeq: 0,
    triggerRefresh: null,
  };

  function markActiveChatViewed() {
    const id = currentChatId();
    if (id) state.localViewedMs.set(id, Date.now());
    return id;
  }

  function requestReactRefresh() {
    if (typeof state.triggerRefresh !== 'function') return;
    state.refreshTick += 1;
    const token = `__agy_refresh_${state.refreshTick}`;
    state.triggerRefresh(token);
  }

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

  function shouldRenderCustomGrouping() {
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
    state.prefsSeq += 1;
    const seq = state.prefsSeq;
    state.prefs = { ...state.prefs, ...patch };
    syncOfficialMenus();
    requestReactRefresh();
    try {
      const saved = await window.__agyProjectSidebarHost?.setPreferences?.(patch);
      if (state.prefsSeq === seq && saved && typeof saved === 'object' && !saved.offline) {
        state.prefs = { ...state.prefs, ...saved };
        syncOfficialMenus();
        requestReactRefresh();
      }
    } catch { /* ignore optimistic fallback */ }
  }

  function toggleCollapseGroup(toggleKey) {
    const set = new Set(state.prefs.collapsedGroupKeys || []);
    if (set.has(toggleKey)) set.delete(toggleKey);
    else set.add(toggleKey);
    void updatePrefs({ collapsedGroupKeys: [...set] });
  }

  function syncOfficialMenus() {
    refreshDetectedNativeDim();
    const t = getI18n(state.prefs.language);
    const dims = getEffectiveDims();
    const customActive = shouldRenderCustomGrouping();

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

  function protoTsMs(ts) {
    if (!ts) return 0;
    const sec = Number(ts.seconds || 0);
    if (!Number.isFinite(sec) || sec <= 0) return 0;
    const nanos = Number(ts.nanos || 0);
    return sec * 1000 + (Number.isFinite(nanos) ? Math.floor(nanos / 1e6) : 0);
  }

  function basenameUri(uri) {
    if (!uri || typeof uri !== 'string') return '';
    try {
      const clean = uri.replace(/\/+$/, '');
      const parts = clean.split('/');
      return decodeURIComponent(parts[parts.length - 1] || '');
    } catch {
      return '';
    }
  }

  function readLiveE3cState(uMcFiber) {
    let f = uMcFiber?.return;
    let e3c = null;
    let hops = 0;
    while (f && hops < 30) {
      if (typeof f.type === 'function' && f.type.toString().includes('section-pinned')) {
        e3c = f;
        break;
      }
      f = f.return;
      hops += 1;
    }
    if (!e3c) return { summaries: null, projectsById: new Map() };

    let summaries = null;
    const projectsById = new Map();
    let ms = e3c.memoizedState;
    let guard = 0;
    while (ms && guard < 120) {
      const raw = ms.memoizedState;
      const val = Array.isArray(raw) && raw.length === 2 && Array.isArray(raw[1]) ? raw[0] : raw;
      if (Array.isArray(val) && val.length > 0 && val[0] && typeof val[0] === 'object') {
        if (typeof val[0].cascadeId === 'string' && val[0].summary && typeof val[0].summary === 'object') {
          if (!summaries || val.length >= summaries.length) summaries = val;
        } else if (val[0].project && typeof val[0].project.id === 'string') {
          for (const p of val) {
            if (p?.project?.id) projectsById.set(p.project.id, p.project);
          }
        }
      }
      ms = ms.next;
      guard += 1;
    }
    return { summaries, projectsById };
  }

  function buildLiveConversations(uMcFiber, rawItems, excludedIds, archivedOnly) {
    const activeChatId = markActiveChatViewed();
    const collectorMap = new Map();
    for (const c of state.tree.conversations || []) {
      collectorMap.set(c.id, c);
    }

    const { summaries, projectsById } = readLiveE3cState(uMcFiber);
    if (!summaries || !summaries.length) {
      const fallbackList = [];
      for (const c of collectorMap.values()) {
        if (excludedIds.has(c.id)) continue;
        if (archivedOnly ? !c.isArchived : c.isArchived) continue;
        fallbackList.push({
          ...c,
          statusGroup: getStatusGroup(c),
          isUnread: Boolean(c.isUnread) && c.id !== activeChatId,
        });
      }
      return fallbackList;
    }

    const merged = [];
    const seen = new Set();
    for (const entry of summaries) {
      const id = entry?.cascadeId;
      const sum = entry?.summary;
      if (!id || !sum || seen.has(id)) continue;
      seen.add(id);

      if (excludedIds.has(id) || sum.killed) continue;
      const meta = sum.trajectoryMetadata || {};
      if (meta.parentConversationId || meta.isBattleModeFork || meta.sourceMetadata?.hideFromConversationList) continue;
      if (Array.isArray(sum.annotations?.tags) && sum.annotations.tags.includes('coordinator')) continue;

      const base = collectorMap.get(id);
      const isArchived = Boolean(sum.annotations?.archived) || Boolean(base?.isArchived);
      if (archivedOnly ? !isArchived : isArchived) continue;

      // Also skip non-primary trajectory types when collector is loaded unless very fresh (< 45s)
      const updatedAtMs = protoTsMs(sum.lastModifiedTime) || base?.updatedAtMs || 0;
      if (collectorMap.size > 0 && !base) {
        if (meta.nestingDepth && meta.nestingDepth > 0) continue;
        if (sum.trajectoryType === 3 || sum.trajectoryType === 5) continue;
      }

      const statusGroup = (sum.waitingSteps?.length ?? 0) > 0
        ? 'blocked'
        : ((sum.notFullyIdle || sum.status === 2 || sum.status === 4) ? 'in_progress' : 'idle');

      let isUnread = false;
      if (id !== activeChatId) {
        if (sum.annotations?.markedAsUnread) {
          isUnread = true;
        } else if (updatedAtMs > 0) {
          const viewMs = Math.max(protoTsMs(sum.annotations?.lastUserViewTime), state.localViewedMs.get(id) || 0);
          isUnread = updatedAtMs > viewMs + 500;
        }
      }

      const rawProjectId = meta.projectId && meta.projectId !== 'outside-of-project' ? meta.projectId : '';
      const liveProj = rawProjectId ? projectsById.get(rawProjectId) : null;
      const projectKey = base?.projectKey || rawProjectId || '__unassigned__';
      const projectName = base?.projectName || liveProj?.name || null;
      const isUnassigned = base ? base.isUnassigned : !liveProj;
      const wsUri = meta.workspaceUris?.[0] || sum.workspaces?.[0]?.workspaceFolderAbsoluteUri || '';
      const repoName = base?.repoName || basenameUri(wsUri) || projectName || '';
      const envKind = base?.envKind || (/(?:vscode-remote|ssh|https?):\/\//i.test(wsUri) ? 'cloud' : 'local');
      const title = String(sum.annotations?.title || sum.summary || base?.title || 'Untitled').replace(/\s+/g, ' ').trim();

      merged.push({
        id,
        title,
        status: statusGroup === 'idle' ? 'idle' : 'running',
        statusGroup,
        isUnread,
        isArchived,
        updatedAtMs,
        projectKey,
        projectName,
        isUnassigned,
        repoName,
        envKind,
      });
    }

    // Preserve any un-synced items from rawProps if summaries omitted them temporarily
    if (collectorMap.size > 0) {
      for (const rawItem of rawItems || []) {
        if (rawItem.type !== 'row' || !rawItem.cascadeId || seen.has(rawItem.cascadeId) || excludedIds.has(rawItem.cascadeId)) continue;
        const base = collectorMap.get(rawItem.cascadeId);
        if (base) {
          seen.add(rawItem.cascadeId);
          merged.push({ ...base, statusGroup: getStatusGroup(base), isUnread: Boolean(base.isUnread) && base.id !== activeChatId });
        }
      }
    }

    return merged;
  }

  let reactElemType = Symbol.for('react.element');

  function detectReactElementType(rawItems, customHeaderRenderer) {
    for (const it of rawItems || []) {
      if (it?.icon?.$$typeof) {
        reactElemType = it.icon.$$typeof;
        return;
      }
    }
    const hdr = (rawItems || []).find(it => it?.type === 'header');
    if (hdr && typeof customHeaderRenderer === 'function') {
      try {
        const elOut = customHeaderRenderer(hdr);
        if (elOut?.$$typeof) reactElemType = elOut.$$typeof;
      } catch { /* ignore */ }
    }
  }

  function h(type, props, ...children) {
    const flatChildren = children.length === 0 ? undefined : (children.length === 1 ? children[0] : children);
    return {
      $$typeof: reactElemType,
      type,
      key: props?.key ?? null,
      ref: null,
      props: flatChildren !== undefined ? { ...(props || {}), children: flatChildren } : { ...(props || {}) },
      _owner: null,
    };
  }

  function svgReactIcon(pathD, size = 16, className = '') {
    return h(
      'svg',
      {
        viewBox: '0 -960 960 960',
        width: size,
        height: size,
        fill: 'currentColor',
        className,
        style: { flexShrink: 0 },
        'aria-hidden': 'true',
      },
      h('path', { d: pathD }),
    );
  }

  function renderCustomHeaderElement(item, surface) {
    const isBg = surface === 'background';
    const bgCls = isBg ? 'bg-background' : 'bg-sidebar';

    if (item._agyKind === 'req-header') {
      const padLeft = 4 + Math.min(item._agyDepth ?? 1, 4) * 14;
      let rightEl = null;
      if (item._agyRunning > 0) {
        const countText = item._agyRunning < item._agyTotal
          ? `${item._agyRunning}/${item._agyTotal}`
          : String(item._agyTotal);
        rightEl = h(
          'span',
          { className: 'ml-2 shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums' },
          h(
            'span',
            { className: 'agy-native-spinner', title: 'Working' },
            h('span', null),
            h('span', null),
            h('span', null),
            h('span', null),
          ),
          h('span', null, countText),
        );
      } else if (item._agyUnread > 0) {
        rightEl = h(
          'span',
          { className: 'ml-2 shrink-0 inline-flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums' },
          h('span', { className: 'agy-native-unread', title: 'Unread' }),
          h('span', null, String(item._agyTotal)),
        );
      } else {
        const ageText = formatRelativeTime(item._agyLatestMs);
        const label = ageText ? `${ageText} · ${item._agyTotal}` : String(item._agyTotal);
        rightEl = h(
          'span',
          { className: 'ml-2 shrink-0 text-xs text-muted-foreground opacity-65 tabular-nums' },
          label,
        );
      }

      return h(
        'div',
        { className: 'relative w-full group/header' },
        h(
          'button',
          {
            type: 'button',
            'data-agy-req-header': item._agyToggleKey,
            'aria-expanded': !item.isCollapsed,
            style: { paddingLeft: `${padLeft}px` },
            onClick: ev => {
              ev.stopPropagation();
              toggleCollapseGroup(item._agyToggleKey);
            },
            className: `agy-native-req-btn ${item.isCollapsed ? 'is-collapsed ' : ''}flex items-center pr-2.5 py-1.5 rounded-lg select-none cursor-pointer w-full border-none outline-none text-left text-muted-foreground hover:bg-muted hover:text-secondary-foreground ${bgCls}`,
          },
          h(
            'span',
            { className: 'inline-flex items-center gap-1.5 min-w-0 flex-1' },
            h('span', { className: 'agy-req-chev shrink-0' }, svgReactIcon(ICON_PATHS.chevron, 14)),
            h('span', { className: 'shrink-0 opacity-85 inline-flex' }, svgReactIcon(ICON_PATHS.sell, 14)),
            h('span', { className: 'truncate text-[12.5px] font-medium' }, item.label),
          ),
          rightEl,
        ),
      );
    }

    const padLeft = 4 + Math.min(item._agyDepth || 0, 4) * 14;
    const iconPath = ICON_PATHS[item._agyIconName] || ICON_PATHS.folder;
    return h(
      'div',
      { className: 'relative w-full group/header' },
      h(
        'button',
        {
          type: 'button',
          'data-agy-top-header': item._agyToggleKey,
          'data-project-card': true,
          'data-testid': 'project-header',
          'data-project-label': item.label,
          'aria-expanded': !item.isCollapsed,
          style: { paddingLeft: `${padLeft}px` },
          onClick: ev => {
            ev.stopPropagation();
            toggleCollapseGroup(item._agyToggleKey);
          },
          className: `agy-native-hdr-btn ${item.isCollapsed ? 'is-collapsed ' : ''}flex items-center pr-2.5 py-1.5 rounded-lg select-none cursor-pointer w-full border-none outline-none text-left text-muted-foreground hover:bg-muted hover:text-secondary-foreground ${bgCls}`,
        },
        h(
          'span',
          { className: 'flex items-center gap-1 min-w-0 flex-1' },
          h(
            'span',
            { className: 'w-6 h-6 -my-1 shrink-0 inline-flex items-center justify-center' },
            h('span', { className: 'agy-native-glyph inline-flex' }, svgReactIcon(iconPath, 16)),
            h('span', { className: 'agy-native-chev inline-flex' }, svgReactIcon(ICON_PATHS.chevron, 16)),
          ),
          h('span', { className: 'truncate font-medium text-[13px]' }, item.label),
        ),
        h('span', { className: 'ml-2 shrink-0 text-xs opacity-60 tabular-nums' }, String(item.count ?? '')),
      ),
    );
  }

  let patchedFiber = null;
  let origUMcFn = null;

  function uMcWrapper(rawProps) {
    if (typeof rawProps?.onFocusGroupId === 'function') {
      state.triggerRefresh = rawProps.onFocusGroupId;
    }
    if (!origUMcFn) return null;

    if (!shouldRenderCustomGrouping() || !Array.isArray(rawProps?.items)) {
      return origUMcFn(rawProps);
    }

    try {
      detectReactElementType(rawProps.items, rawProps.customHeaderRenderer);

      const mainIdx = rawProps.items.findIndex(
        it => it?.type === 'section-header' && (it.id === 'main-section-header' || it.collapseId === 'main-section-header'),
      );
      const prefixItems = mainIdx >= 0 ? rawProps.items.slice(0, mainIdx + 1) : [];
      const mainHdr = mainIdx >= 0 ? rawProps.items[mainIdx] : null;

      if (mainHdr?.isCollapsed) {
        return origUMcFn({ ...rawProps, items: prefixItems });
      }

      const excludedIds = new Set();
      for (const it of prefixItems) {
        if (it?.type === 'row' && it.cascadeId) excludedIds.add(it.cascadeId);
      }

      const archivedOnly = /\(Archived\)/i.test(mainHdr?.title || '') || Boolean(state.prefs.showArchived);
      const liveConvs = buildLiveConversations(patchedFiber, rawProps.items, excludedIds, archivedOnly);

      const t = getI18n(state.prefs.language);
      const dims = getEffectiveDims();
      const collapsedSet = new Set(state.prefs.collapsedGroupKeys || []);
      const virtualItems = buildVirtualItemsForDims(liveConvs, dims, {
        collapsedSet,
        expandedReadIdleGroups: state.expandedReadIdleGroups,
        expandedLimits: state.expandedLimits,
        activeChatId: currentChatId(),
        isHistory: rawProps.variant === 'history',
        t,
      });

      const styledItems = virtualItems.map(it => {
        if (it.type === 'show-more' && it._agyIndentPx) {
          return {
            ...it,
            label: h('span', { className: 'text-xs truncate', style: { paddingLeft: `${it._agyIndentPx}px` } }, it.label),
          };
        }
        return it;
      });

      const origHdrRenderer = rawProps.customHeaderRenderer;
      const wrappedHeaderRenderer = item => {
        if (item && item._agyKind) {
          return renderCustomHeaderElement(item, rawProps.surface);
        }
        return origHdrRenderer ? origHdrRenderer(item) : undefined;
      };

      const origTogglePagination = rawProps.onTogglePagination;
      const wrappedTogglePagination = groupId => {
        if (typeof groupId === 'string' && groupId.startsWith('agy-fold:')) {
          const pathKey = groupId.slice('agy-fold:'.length);
          if (state.expandedReadIdleGroups.has(pathKey)) state.expandedReadIdleGroups.delete(pathKey);
          else state.expandedReadIdleGroups.add(pathKey);
          requestReactRefresh();
          return;
        }
        if (typeof groupId === 'string' && groupId.startsWith('agy-page:')) {
          const pathKey = groupId.slice('agy-page:'.length);
          state.expandedLimits[pathKey] = (state.expandedLimits[pathKey] || 40) + 60;
          requestReactRefresh();
          return;
        }
        return origTogglePagination?.(groupId);
      };

      return origUMcFn({
        ...rawProps,
        items: [...prefixItems, ...styledItems],
        customHeaderRenderer: wrappedHeaderRenderer,
        onTogglePagination: wrappedTogglePagination,
      });
    } catch (err) {
      console.error('[agy-project-sidebar] uMcWrapper fallback:', err);
      return origUMcFn(rawProps);
    }
  }

  function ensureNativeListPatched() {
    const listEl = document.querySelector('[data-testid="conversation-list-sidebar"]');
    if (!listEl) return false;
    const fk = Object.keys(listEl).find(k => k.startsWith('__reactFiber$'));
    if (!fk) return false;
    let f = listEl[fk];
    let uMc = null;
    while (f) {
      if (typeof f.type === 'function' && f.memoizedProps && Array.isArray(f.memoizedProps.items) && f.memoizedProps.variant === 'sidebar') {
        uMc = f;
        break;
      }
      f = f.return;
    }
    if (!uMc) return false;

    if (typeof uMc.memoizedProps?.onFocusGroupId === 'function') {
      state.triggerRefresh = uMc.memoizedProps.onFocusGroupId;
    }

    if (uMc.type !== uMcWrapper) {
      if (!origUMcFn || uMc.elementType !== origUMcFn) {
        origUMcFn = uMc.elementType || uMc.type;
      }
      patchedFiber = uMc;
      uMc.type = uMcWrapper;
      if (uMc.alternate) uMc.alternate.type = uMcWrapper;
      requestReactRefresh();
      return true;
    }
    patchedFiber = uMc;
    return false;
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
        if (state.detectedNativeDim === 'none') {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          void updatePrefs({ groupByDimensions: null });
          closeOpenOverlayMenus();
        } else {
          void updatePrefs({ groupByDimensions: null });
        }
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (e.type !== 'click') return;

    const current = getEffectiveDims();
    const next = current.includes(optDim)
      ? current.filter(d => d !== optDim)
      : [...current, optDim];

    void updatePrefs({ groupByDimensions: next });
  };

  for (const ev of INTERCEPT_EVENTS) {
    window.addEventListener(ev, onWindowMenuEvent, true);
  }

  let polling = false;
  async function pollTree(force = false) {
    if (polling) return;
    polling = true;
    const seqAtStart = state.prefsSeq;
    try {
      const res = await window.__agyProjectSidebarHost?.getTree?.({ force });
      if (res && !res.offline) {
        state.tree = res;
        if (state.prefsSeq === seqAtStart && res.preferences) {
          state.prefs = { ...state.prefs, ...res.preferences };
        }
        ensureNativeListPatched();
        syncOfficialMenus();
        requestReactRefresh();
      }
    } finally {
      polling = false;
    }
  }

  let syncScheduled = false;
  const scheduleSync = () => {
    if (syncScheduled) return;
    syncScheduled = true;
    requestAnimationFrame(() => {
      syncScheduled = false;
      ensureNativeListPatched();
      syncOfficialMenus();
    });
  };

  const onRouteChange = () => {
    markActiveChatViewed();
    requestReactRefresh();
  };

  const mo = new MutationObserver(() => {
    scheduleSync();
  });
  mo.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('popstate', onRouteChange);

  const pollTimer = setInterval(() => void pollTree(false), 4000);
  ensureStyle();
  markActiveChatViewed();
  ensureNativeListPatched();
  syncOfficialMenus();
  void pollTree(true);

  window.__agyProjectSidebarDispose = () => {
    clearInterval(pollTimer);
    mo.disconnect();
    for (const ev of INTERCEPT_EVENTS) {
      window.removeEventListener(ev, onWindowMenuEvent, true);
    }
    window.removeEventListener('popstate', onRouteChange);
    document.getElementById(MENU_OPT_ID)?.remove();
    for (const n of document.querySelectorAll('[data-agy-req-groupby]')) n.removeAttribute('data-agy-req-groupby');
    for (const n of document.querySelectorAll('[data-agy-checked]')) n.removeAttribute('data-agy-checked');
    for (const n of document.querySelectorAll('[data-agy-order]')) n.removeAttribute('data-agy-order');
    for (const n of document.querySelectorAll(`.${MANAGED_GROUP_CLASS}`)) n.classList.remove(MANAGED_GROUP_CLASS);
    document.getElementById(STYLE_ID)?.remove();
    if (patchedFiber && origUMcFn) {
      patchedFiber.type = origUMcFn;
      if (patchedFiber.alternate) patchedFiber.alternate.type = origUMcFn;
      patchedFiber = null;
    }
    requestReactRefresh();
    delete window.__agyProjectSidebarInstalled;
  };
};

export function auxPanelHtml() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>AGY Project Sidebar</title>
  <style>
    :root { color-scheme: light dark; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { margin: 0; padding: 14px; font-size: 13px; color: #1f2328; background: transparent; }
    @media (prefers-color-scheme: dark) {
      body { color: #e6edf3; }
      .card { background: rgba(255,255,255,0.05); border-color: rgba(255,255,255,0.12); }
      .muted { color: #8b949e; }
    }
    .hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
    .title { font-weight: 700; font-size: 15px; }
    .pill { font-size: 11px; padding: 2px 8px; border-radius: 999px; background: rgba(37,99,235,0.14); color: #2563eb; font-weight: 600; }
    .card { border: 1px solid rgba(127,127,127,0.22); border-radius: 8px; padding: 10px 12px; margin-bottom: 10px; background: rgba(127,127,127,0.04); }
    .muted { font-size: 12px; color: #656d76; }
    .btn { border: 1px solid rgba(127,127,127,0.25); background: transparent; color: inherit; border-radius: 6px; padding: 4px 10px; cursor: pointer; font-size: 12px; }
    .row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; border-bottom: 1px dashed rgba(127,127,127,0.16); }
    .row:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="title">AGY Multi-Select Group By</div>
    <span id="status-pill" class="pill">Checking...</span>
  </div>
  <div class="card">
    <div id="stats" style="font-weight:600;">Loading requirements...</div>
    <div id="mode-state" class="muted" style="margin-top:4px;"></div>
    <div id="health" class="muted" style="margin-top:4px;"></div>
    <div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:6px;">
      <button class="btn" id="btn-status-req">Status + Requirement</button>
      <button class="btn" id="btn-proj-req">Project + Requirement</button>
      <button class="btn" id="btn-req">Requirement Only</button>
      <button class="btn" id="btn-native">Reset to Official</button>
    </div>
  </div>
  <div class="card" id="reqs-card"></div>
  <script type="module">
    const LABELS = { project: 'Project', requirement: 'Requirement', repo: 'Repo', location: 'Environment', status: 'Status' };
    async function setDims(groupByDimensions) {
      await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groupByDimensions }) });
      load();
    }
    async function load() {
      const [treeRes, healthRes] = await Promise.all([
        fetch('/api/tree').then(r => r.json()).catch(() => ({ projects: [], conversations: [], stats: {}, preferences: {} })),
        fetch('/api/integration').then(r => r.json()).catch(() => ({ state: 'unknown', message: '' })),
      ]);
      document.getElementById('status-pill').textContent = healthRes.state || 'unknown';
      const s = treeRes.stats || {};
      const convs = treeRes.conversations || [];
      const reqMap = new Map();
      for (const c of convs) {
        if (c.reqKind === 'inbox') continue;
        if (!reqMap.has(c.reqKey)) reqMap.set(c.reqKey, { key: c.reqKey, label: c.reqLabel || c.reqKey, total: 0, running: 0, latestMs: 0 });
        const item = reqMap.get(c.reqKey);
        item.total += 1;
        if (c.statusGroup === 'in_progress' || c.status === 'running') item.running += 1;
        if ((c.updatedAtMs || 0) > item.latestMs) item.latestMs = c.updatedAtMs || 0;
      }
      const reqs = [...reqMap.values()].sort((a, b) => b.latestMs - a.latestMs);
      const dims = treeRes.preferences?.groupByDimensions;
      const modeText = Array.isArray(dims)
        ? (dims.length ? dims.map(d => LABELS[d] || d).join(' + ') : 'None')
        : 'Official Default';
      document.getElementById('stats').textContent = reqs.length + ' Requirements · ' + (s.totalConversations || 0) + ' Conversations · ' + (s.runningCount || 0) + ' Running';
      document.getElementById('mode-state').textContent = 'Group By: ' + modeText;
      document.getElementById('health').textContent = healthRes.message || '';
      const box = document.getElementById('reqs-card');
      box.textContent = '';
      for (const r of reqs.slice(0, 20)) {
        const row = document.createElement('div');
        row.className = 'row';
        const left = document.createElement('span');
        left.textContent = r.label;
        const right = document.createElement('span');
        right.className = 'muted';
        right.textContent = (r.running ? r.running + ' active / ' : '') + r.total + ' chats';
        row.append(left, right);
        box.appendChild(row);
      }
    }
    document.getElementById('btn-status-req').addEventListener('click', () => setDims(['status', 'requirement']));
    document.getElementById('btn-proj-req').addEventListener('click', () => setDims(['project', 'requirement']));
    document.getElementById('btn-req').addEventListener('click', () => setDims(['requirement']));
    document.getElementById('btn-native').addEventListener('click', () => setDims(null));
    load();
    setInterval(load, 5000);
  </script>
</body>
</html>`;
}

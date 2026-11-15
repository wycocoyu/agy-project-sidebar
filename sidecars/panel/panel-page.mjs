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
    .row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px dashed rgba(127,127,127,0.16); }
    .row:last-child { border-bottom: none; }
  </style>
</head>
<body>
  <div class="hdr">
    <div class="title">AGY Project Sidebar</div>
    <span id="status-pill" class="pill">Checking...</span>
  </div>
  <div class="card">
    <div id="stats" style="font-weight:600;">Loading project &amp; requirement tree...</div>
    <div id="health" class="muted" style="margin-top:4px;"></div>
    <div style="margin-top:8px; display:flex; gap:8px;">
      <button class="btn" id="btn-tree">Use Project Tree Mode</button>
      <button class="btn" id="btn-native">Use Native List</button>
    </div>
  </div>
  <div class="card" id="projects-card"></div>
  <script type="module">
    async function load() {
      const [treeRes, healthRes] = await Promise.all([
        fetch('/api/tree').then(r => r.json()).catch(() => ({ projects: [], stats: {} })),
        fetch('/api/integration').then(r => r.json()).catch(() => ({ state: 'unknown', message: '' })),
      ]);
      document.getElementById('status-pill').textContent = healthRes.state || 'unknown';
      const s = treeRes.stats || {};
      document.getElementById('stats').textContent = (s.totalProjects || 0) + ' Projects · ' + (s.totalConversations || 0) + ' Conversations · ' + (s.runningCount || 0) + ' Running';
      document.getElementById('health').textContent = healthRes.message || '';
      const box = document.getElementById('projects-card');
      box.textContent = '';
      for (const p of (treeRes.projects || []).slice(0, 20)) {
        const row = document.createElement('div');
        row.className = 'row';
        const left = document.createElement('span');
        left.textContent = p.isUnassigned ? 'Unassigned' : p.name;
        const right = document.createElement('span');
        right.className = 'muted';
        right.textContent = (p.running ? p.running + ' running / ' : '') + p.total + ' chats';
        row.append(left, right);
        box.appendChild(row);
      }
    }
    async function setMode(viewMode) {
      await fetch('/api/preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ viewMode }) });
      load();
    }
    document.getElementById('btn-tree').addEventListener('click', () => setMode('tree'));
    document.getElementById('btn-native').addEventListener('click', () => setMode('native'));
    load();
    setInterval(load, 5000);
  </script>
</body>
</html>`;
}

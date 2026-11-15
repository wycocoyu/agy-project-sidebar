# AGY Project Sidebar

[中文文档](README.zh-CN.md)

Persistent **Project × Requirement × Session** tree sidebar plugin for Antigravity (`agy`), built cleanly with **AGY Sidecar (`restart_policy: "always"`) + Loopback CDP Runtime UI** (`DevToolsActivePort`).

## Why It Never Disappears on Restart or Update

Legacy web-bundle patches modified `/Applications/Antigravity.app` binaries and injected regex replacements into minified `main.js`. Every Antigravity auto-update overwrote those files and invalidated minified symbols.

`agy-project-sidebar` never modifies `/Applications/Antigravity.app`. It runs as a standard plugin under `~/.gemini/config/plugins/agy-project-sidebar/` and injects a non-destructive left drawer overlay via loopback CDP, cleanly coexisting alongside [`wycocoyu/agy-context-dashboard`](https://github.com/wycocoyu/agy-context-dashboard).

## Features

- **Multi-Select Grouping (`Project` × `Requirement` × `Status`)**: View conversations by Project → Requirement → Session, cross-project Requirement folders, or pin live `Running` sessions on top.
- **Zero-Noise Project List**: Reads `ListProjects` / `ReadProject` from `language_server` and filters out internal sidecar virtual projects, mapping orphaned threads via `workspace_uris` longest-prefix matching or into a dedicated `Unassigned` group.
- **Smart Requirement Clustering**: Groups threads by explicit issue/task IDs (`#123`, `MUL-797`, `Q137`) without misclassifying tech tokens (`GPT-6`, `UTF-8`), groups repeated `MMDD | Category | Subject` themes (`>= 2` threads), and puts singletons into `Inbox`.
- **Collapsible & Persistent**: Toggle instantly between `Project Tree` and `Native List`, slide open from a left-edge tab when the native sidebar is collapsed, search in real time, and persist collapsed groups & preferences in `preferences.json`.
- **Zero-Dependency**: Runs directly on Antigravity Helper's bundled Node v24 (`node:sqlite`, global `WebSocket`) + Python 3 standard library.

## Quick Install

```bash
git clone https://github.com/wycocoyu/agy-project-sidebar.git /Users/mac/Code/agy-project-sidebar
python3 /Users/mac/Code/agy-project-sidebar/manage.py install
```

Manage lifecycle anytime:

```bash
python3 /Users/mac/Code/agy-project-sidebar/manage.py status
python3 /Users/mac/Code/agy-project-sidebar/manage.py disable
python3 /Users/mac/Code/agy-project-sidebar/manage.py enable
python3 /Users/mac/Code/agy-project-sidebar/manage.py uninstall
```

## Run Tests

```bash
ELECTRON_RUN_AS_NODE=1 "/Applications/Antigravity.app/Contents/Frameworks/Antigravity Helper.app/Contents/MacOS/Antigravity Helper" --test tests/*.test.mjs
```

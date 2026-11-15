# AGY Project Sidebar

[中文文档](README.zh-CN.md)

Zero-chrome **Requirement** grouping extension for Antigravity's official `Display Options -> Group By` menu, built cleanly with **AGY Sidecar (`restart_policy: "always"`) + Loopback CDP Runtime UI** (`DevToolsActivePort`).

## Why It Never Disappears on Restart or Update

Legacy web-bundle patches modified `/Applications/Antigravity.app` binaries and injected regex replacements into minified `main.js`. Every Antigravity auto-update overwrote those files and invalidated minified symbols.

`agy-project-sidebar` never modifies `/Applications/Antigravity.app`. It runs as a standard plugin under `~/.gemini/config/plugins/agy-project-sidebar/` and adds `Requirement` directly into Antigravity's official `Group By` menu, cleanly coexisting alongside [`wycocoyu/agy-context-dashboard`](https://github.com/wycocoyu/agy-context-dashboard).

## Features

- **Zero Extra Sidebar Bars**: Adds zero custom toolbars or floating buttons to the sidebar.
- **Official `Group By -> Requirement` Integration**: Appends `Requirement` directly inside Antigravity's official `Display Options` -> `Group By` submenu (`Project / Requirement / Repo / Environment / Status / None`). Selecting `Project`, `Status`, or `None` hands 100% control back to official Antigravity immediately.
- **Full-Database Requirement Clustering**: Reads all conversations from Antigravity's SQLite database + `language_server` projects, clustering explicit issue/task IDs (`#123`, `MUL-797`, `Q137`) and shared `MMDD | Category | Subject` themes into native collapsible sections while keeping `Pinned Conversations` and the `Conversations` header live.
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

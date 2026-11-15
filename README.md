# AGY Project Sidebar

[中文文档](README.zh-CN.md)

Zero-chrome **Multi-Select Group By + Requirement** extension for Antigravity's official `Display Options -> Group By` menu, built cleanly with **AGY Sidecar (`restart_policy: "always"`) + Loopback CDP Runtime UI** (`DevToolsActivePort`).

## Why It Never Disappears on Restart or Update

Legacy web-bundle patches modified `/Applications/Antigravity.app` binaries and injected regex replacements into minified `main.js`. Every Antigravity auto-update overwrote those files and invalidated minified symbols.

`agy-project-sidebar` never modifies `/Applications/Antigravity.app`. It runs as a standard plugin under `~/.gemini/config/plugins/agy-project-sidebar/` and extends Antigravity's official `Group By` menu directly, cleanly coexisting alongside [`wycocoyu/agy-context-dashboard`](https://github.com/wycocoyu/agy-context-dashboard).

## Features

- **Zero Extra Sidebar Bars**: Adds zero custom toolbars, search boxes, or floating buttons to the sidebar.
- **Official Multi-Select `Group By` (`Status + Requirement`, `Project + Requirement`, etc.)**: Appends `Requirement` directly inside Antigravity's official `Display Options` -> `Group By` submenu (`Project / Requirement / Repo / Environment / Status / None`) and turns `Group By` into an ordered multi-select menu (`1 ✓`, `2 ✓`). Clicking `None` clears multi-select and yields back to official Antigravity immediately.
- **Multi-Level Collapsible Nested Tree**: Renders nested collapsible hierarchy sections (e.g. `In Progress -> MUL-797` and `Idle -> #2814 / Q137 / Standalone`) from Antigravity's full SQLite database + `language_server` projects while keeping `Pinned Conversations` and the `Conversations` header live.
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

# AGY Project Sidebar

[English](README.md)

基于 **AGY 原生 Sidecar（`restart_policy: "always"`）+ 本机回环 CDP 运行时注入** 打造的 Antigravity（`agy`）官方 `Group By` **多选组合分组（如 `Status + Requirement`、`Project + Requirement`）** 零额外控件扩展插件。

## 为什么重启与升级后再也不会消失

旧版方案通过拦截 `/Applications/Antigravity.app` 的 `language_server` 与补丁混淆后的 `main.js` 实现，每次应用自动更新都会把改动覆盖并打乱混淆标识符。

本插件彻底不碰 `/Applications/Antigravity.app` 安装包，安装在 `~/.gemini/config/plugins/agy-project-sidebar/`，使用完全独立的 CDP 绑定名、全局变量和 DOM ID，与 [`wycocoyu/agy-context-dashboard`](https://github.com/wycocoyu/agy-context-dashboard) 零冲突共存且跨升级永久保留。

## 核心能力

- **界面零额外控件**：不添加任何多余搜索框、自建顶栏或悬浮胶囊，平时 100% 保持官方原生外观。
- **官方 `Display Options -> Group By` 多选组合**：点击原生 `Conversations` 旁漏斗图标进入 `Group By`，可在 `Project / Requirement / Repo / Environment / Status` 中按点击顺序自由多选组合（如 `Status + Requirement`、`Requirement + Status`、`Project + Requirement`），菜单保持展开并实时显示层级序号（`1 ✓`、`2 ✓`）。点击 `None` 或保留单一官方默认项时自动交还官方原生渲染。
- **多级可折叠树与全库 SQLite 聚合**：基于全量 SQLite 会话与 `language_server` 项目信息，自动按所选维度顺序生成多级可折叠分组树（如先按 `In Progress / Idle` 分组，再按 `#2814`、`MUL-797`、`Q137`、`Standalone` 折叠），同时完整保留上方 `Pinned Conversations` 与 `Conversations` 操作头原生可用。
- **内置 `agy-sidebar-grouping` 收纳技能**：随插件同步安装 `skills/agy-sidebar-grouping` 及只读预检脚本，让 AGY Agent 知道如何跨项目归拢同一需求下的历史会话（校验 `31` 字与无 `#` 规则，并通过 `agy-rename` 改名保住原有时间戳）。

## 安装与管理

```bash
python3 /Users/mac/Code/agy-project-sidebar/manage.py install
python3 /Users/mac/Code/agy-project-sidebar/manage.py status
python3 /Users/mac/Code/agy-project-sidebar/manage.py uninstall
```

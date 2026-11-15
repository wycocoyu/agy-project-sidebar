# AGY Project Sidebar

[English](README.md)

基于 **AGY 原生 Sidecar（`restart_policy: "always"`）+ 本机回环 CDP 运行时注入** 打造的 Antigravity（`agy`）官方 `Group By -> Requirement` 零额外控件扩展插件。

## 为什么重启与升级后再也不会消失

旧版方案通过拦截 `/Applications/Antigravity.app` 的 `language_server` 与补丁混淆后的 `main.js` 实现，每次应用自动更新都会把改动覆盖并打乱混淆标识符。

本插件彻底不碰 `/Applications/Antigravity.app` 安装包，安装在 `~/.gemini/config/plugins/agy-project-sidebar/`，使用完全独立的 CDP 绑定名、全局变量和 DOM ID，与 [`wycocoyu/agy-context-dashboard`](https://github.com/wycocoyu/agy-context-dashboard) 零冲突共存且跨升级永久保留。

## 核心能力

- **界面零额外控件**：不添加任何多余搜索框、自建顶栏或悬浮胶囊，平时 100% 保持官方原生外观。
- **直接融入官方 `Display Options -> Group By` 子菜单**：点击原生 `Conversations` 旁漏斗图标打开 `Group By`，即可在 `Project / Requirement / Repo / Environment / Status / None` 中直接勾选 `Requirement`；切回 `Project`、`Status` 或 `None` 时立即 100% 交还官方原生逻辑。
- **全库 SQLite 需求可折叠分组**：基于全量 SQLite 会话与 `language_server` 项目信息，自动按显式单号（`#123`、`MUL-797`、`Q137`）与多会话共享主题生成原生风格可折叠分组，同时保留上方 `Pinned Conversations` 与 `Conversations` 操作头原生可用。

## 安装与管理

```bash
python3 /Users/mac/Code/agy-project-sidebar/manage.py install
python3 /Users/mac/Code/agy-project-sidebar/manage.py status
python3 /Users/mac/Code/agy-project-sidebar/manage.py uninstall
```

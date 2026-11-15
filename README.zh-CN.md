# AGY Project Sidebar

[English](README.md)

基于 **AGY 原生 Sidecar（`restart_policy: "always"`）+ 本机回环 CDP 运行时注入** 打造的 Antigravity（`agy`）「项目 × 需求 × 会话」侧边栏插件。

## 为什么重启与升级后再也不会消失

旧版方案通过拦截 `/Applications/Antigravity.app` 的 `language_server` 与补丁混淆后的 `main.js` 实现，每次应用自动更新都会把改动覆盖并打乱混淆标识符。

本插件彻底不碰 `/Applications/Antigravity.app` 安装包，而是像 [`wycocoyu/agy-context-dashboard`](https://github.com/wycocoyu/agy-context-dashboard) 一样安装在 `~/.gemini/config/plugins/agy-project-sidebar/`，使用完全独立的 CDP 绑定名、全局变量和 DOM ID，实现零冲突共存与跨升级永久保留。

## 核心能力

- **三维多选组合（项目 × 需求 × 状态）**：支持按「项目 → 需求 → 会话」、跨项目需求视图、或置顶「进行中」状态动态重组。
- **自动过滤内部噪音项目**：调用 `language_server` `ListProjects` / `ReadProject` 并自动过滤 Sidecar 虚拟项目；缺省 `project_id` 的会话通过 `workspace_uris` 路径最长前缀兜底匹配，未匹配统一归入「未分配项目」。
- **精准需求聚类**：自动按显式单号（`#123`、`MUL-797`、`Q137`，过滤 `GPT-6` / `UTF-8` 等技术词误判）及多会话共享 `MMDD | 分类 | 主题` 聚合成实体需求卡片文件夹，孤立单会话收入「收件箱」。
- **零侵入交互与持久化**：支持「项目树 / 原生列表」一键切换、原生栏收起时从左边缘快速唤出抽屉、实时搜索、一键展开/收起全部、无刷新 `history.pushState` 切换会话，以及折叠态磁盘持久化。

## 安装与管理

```bash
python3 /Users/mac/Code/agy-project-sidebar/manage.py install
python3 /Users/mac/Code/agy-project-sidebar/manage.py status
python3 /Users/mac/Code/agy-project-sidebar/manage.py uninstall
```

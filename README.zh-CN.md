# AGY Project Sidebar

[English](README.md)

基于 **AGY 原生 Sidecar（`restart_policy: "always"`）+ 本机回环 CDP 运行时注入** 打造的 Antigravity（`agy`）原生列表「需求过滤」插件。

## 为什么重启与升级后再也不会消失

旧版方案通过拦截 `/Applications/Antigravity.app` 的 `language_server` 与补丁混淆后的 `main.js` 实现，每次应用自动更新都会把改动覆盖并打乱混淆标识符。

本插件彻底不碰 `/Applications/Antigravity.app` 安装包，而是像 [`wycocoyu/agy-context-dashboard`](https://github.com/wycocoyu/agy-context-dashboard) 一样安装在 `~/.gemini/config/plugins/agy-project-sidebar/`，使用完全独立的 CDP 绑定名、全局变量和 DOM ID，实现零冲突共存与跨升级永久保留。

## 核心能力

- **完整保留原生侧边栏**：默认 100% 原样显示 `Pinned Conversations`、`Conversations` 以及原生置顶/归档/状态图标与虚拟滚动列表，不再自建冗余树形抽屉。
- **原生列表顶部嵌入需求过滤栏**：在对话列表最上方顺滑嵌入「`需求: 全部` 下拉选择 + 快捷搜索框」，自适应浅色/深色主题变量，不遮挡原生标题。
- **全库级需求聚类**：直接读取 SQLite 全量会话与 `language_server` 项目元数据，按显式单号（`#123`、`MUL-797`、`Q137`，过滤 `GPT-6` / `UTF-8` 等技术词误判）与共享 `MMDD | 分类 | 主题` 聚合，不受原生虚拟列表只渲染 ~25 条 DOM 的限制。
- **一键过滤与无刷新切换**：选中某需求或输入关键词后按原生行样式展示全部关联会话，点击即通过 `history.pushState` 跳转，点 `×` 立即恢复原生列表，并在磁盘持久化选中状态。

## 安装与管理

```bash
python3 /Users/mac/Code/agy-project-sidebar/manage.py install
python3 /Users/mac/Code/agy-project-sidebar/manage.py status
python3 /Users/mac/Code/agy-project-sidebar/manage.py uninstall
```

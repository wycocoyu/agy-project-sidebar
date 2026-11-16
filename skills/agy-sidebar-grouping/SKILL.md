---
name: agy-sidebar-grouping
description: >-
  Organize, consolidate, or clean up multiple Antigravity conversations into one
  sidebar requirement group using agy-project-sidebar rules and agy-rename.
  Use when the user asks to group or curate related sessions under one
  requirement in the sidebar, combine multi-project threads cleanly (e.g.
  "把这几个会话组成一个需求组", "汇总历史会话到侧边栏需求", "整理需求分组").
---

# AGY Sidebar Requirement Grouping

Bundle related Antigravity conversations into one cohesive sidebar requirement
group without corrupting timestamps, violating session-naming rules, or
splitting cross-project chats.

## Core Grouping Rules (`compat/sidebar-widget.cjs`)

| Prefix Pattern | Example | Scope | When to Use |
| :--- | :--- | :--- | :--- |
| `<ALPHA>-<NUM>` | `COC-4`, `Q94`, `MUL-803` | Cross-project (`scopeByProject: false`) | Sessions span 2+ workspaces/projects |
| `Issue <NUM>` / `PR <NUM>` | `Issue 80`, `PR 10` | Per-project (`scopeByProject: true`) | All sessions live in one project |
| `[Tag]` / `【Tag】` | `【看板】` | Per-project (`count >= 2`) | Fallback when no issue ID exists |

Key constraints:
- **Never edit SQLite directly**: Always use `~/.gemini/bin/agy-rename` (`UpdateConversationAnnotations` RPC). It persists to both SQLite and `.pbtxt` and leaves `last_modified_time` untouched so older `Idle` chats are not pushed into `Inbox`.
- **Naming compliance**: Preserve each conversation's original `MMDD` and category (`功能|设计|整改|优化|发布|分析|文档|调试|配置|杂项`), keep `topic <= 31` characters, and omit `#` (`6422` not `#6422`, `COC-4` not `#4`).
- **Protect the group display label**: Within each bucket, the longest matching title supplies `reqLabel`. Give the most representative session the longest clear `<PREFIX> <main topic>` and keep side investigations shorter so a sub-issue does not hijack the group header.

## Workflow

Run [preview-grouping.mjs](./scripts/preview-grouping.mjs) (installed path: `~/.gemini/config/plugins/agy-project-sidebar/skills/agy-sidebar-grouping/scripts/preview-grouping.mjs`) before and after renaming:

1. **Discover & confirm real session IDs** (do not trust pasted IDs blindly if transcripts disagree):
   ```bash
   node ~/.gemini/config/plugins/agy-project-sidebar/skills/agy-sidebar-grouping/scripts/preview-grouping.mjs search "<keyword>"
   ```
   Spot-check the target transcripts under `~/.gemini/antigravity/brain/<uuid>/.system_generated/logs/transcript.jsonl` to exclude unrelated active chats.

2. **Dry-run candidate titles before renaming**:
   ```bash
   node ~/.gemini/config/plugins/agy-project-sidebar/skills/agy-sidebar-grouping/scripts/preview-grouping.mjs check \
     "<id1>=1115 | 配置 | COC-4 OpenViking自动召回与插件" \
     "<id2>=1115 | 分析 | COC-4 拉OV代码查AGY插件支持"
   ```
   Exit code `2` blocks on invalid naming (`> 31` chars or `#`), cross-project splits (`uniqueReqKeys.length > 1`), or unresolved groups. Inspect `perBucket` to verify the group label inside `inbox` / `idle`.

3. **Execute renames with `agy-rename`** using the emitted `readyCommands`:
   ```bash
   agy-rename <full_uuid> "<MMDD | 分类 | 主题>"
   ```

4. **Verify persistence & inform the user of bucket layout**:
   ```bash
   node ~/.gemini/config/plugins/agy-project-sidebar/skills/agy-sidebar-grouping/scripts/preview-grouping.mjs verify <id1> <id2> ...
   ```
   If `prefs.groupByDimensions` is `["status", "requirement"]` and `perBucket` shows the newest chat sitting in `inbox` while older ones sit in `idle`, tell the user clicking `✓` (Settle) in `Inbox` merges all members together under `Idle`.

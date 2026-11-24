---
name: agy-sidebar-grouping
description: >-
  Proactively or on request organize, consolidate, or align Antigravity
  conversations into one sidebar requirement group using agy-project-sidebar
  Sidecar requirementOverrides. Use whenever the user asks to group/curate
  sessions, OR autonomously when recalling past chats, summarizing multi-session
  findings, detecting >=2 scattered/cross-project sessions on the same topic, or
  attaching a session to an existing requirement without mutating its title.
---

# AGY Sidebar Requirement Grouping

Bundle related Antigravity conversations into one cohesive sidebar requirement
group via Sidecar `requirementOverrides` (`preferences.json`) without mutating
conversation titles, corrupting `last_modified_time`, or splitting cross-project
chats.

## Autonomous On-Demand Triggers & Safety Boundary

Do not scan history on unrelated trivial turns. Trigger autonomously when the
current task already involves session recall, multi-session summary, or
continuing a prior thread:

- **Auto-align the current session**: If `search` shows the ongoing work clearly belongs to an existing unambiguous requirement key (`COC-4`, `Issue 17`, etc.), assign **the current session itself** to that requirement group via `preview-grouping.mjs apply`.
- **Propose before batch-grouping other old sessions**: If `search` spots `>= 2` scattered `INBOX` or cross-project sibling sessions on the same topic, spot-check their transcripts to exclude false positives (e.g. a different task sharing a tool keyword), run `check`, and present the exact candidate list + proposed group key/label for a quick confirmation—unless the user already asked to consolidate/organize them.

## Core Grouping Rules (`sidecars/panel/collector.mjs`)

Requirement resolution follows strict 3-tier precedence:
1. **Sidecar `requirementOverrides`** (`conversationId -> { key, label }` in `preferences.json`)
2. **Native `title` prefix parsing** (for manually `/rename`d conversations)
3. **Native `conversation_summaries.group_id`** (`convgroup:` read-only fallback)

Scoping rules:

| Key Pattern | Example | Scope | When to Use |
| :--- | :--- | :--- | :--- |
| `<ALPHA>-<NUM>` | `COC-4`, `Q94`, `MUL-803` | Cross-project (`scopeByProject: false`) | Sessions span 2+ workspaces/projects |
| `Issue <NUM>` / `PR <NUM>` | `Issue 17`, `PR 10` | Per-project (`scopeByProject: true`) | All sessions live in one project |
| `THEME:<Tag>` / `[Tag]` | `THEME:看板`, `【看板】` | Per-project (`scopeByProject: true`) | Topic cluster without an issue ID |

Key constraints:
- **Zero title / DB mutation**: Write only to Sidecar `requirementOverrides` via `preview-grouping.mjs apply` (or `/api/requirement-overrides`). Never edit AGY SQLite, `.pbtxt` files, or `last_modified_time`.
- **Protect the group display label**: Pass an explicit concise `--label` (`<PREFIX> <main topic>`) so the group header stays clear and representative.
- **Revert cleanly**: Use `preview-grouping.mjs clear <id...>` to remove overrides and fall back to Tier 2 (`title`) / Tier 3 (`group_id`).

## Workflow

Run [preview-grouping.mjs](./scripts/preview-grouping.mjs) (installed path: `~/.gemini/config/plugins/agy-project-sidebar/skills/agy-sidebar-grouping/scripts/preview-grouping.mjs`):

1. **Discover & confirm real session IDs** (do not trust pasted IDs blindly if transcripts disagree):
   ```bash
   node ~/.gemini/config/plugins/agy-project-sidebar/skills/agy-sidebar-grouping/scripts/preview-grouping.mjs search "<keyword>"
   ```
   Spot-check the target transcripts under `~/.gemini/antigravity/brain/<uuid>/.system_generated/logs/transcript.jsonl` to exclude unrelated active chats.

2. **Dry-run candidate overrides before writing**:
   ```bash
   node ~/.gemini/config/plugins/agy-sidebar-grouping/scripts/preview-grouping.mjs check \
     --key "COC-4" \
     --label "COC-4 OpenViking自动召回与插件" \
     <id1> <id2>
   ```
   Exit code `2` blocks on invalid `{ key, label }` entries, cross-project splits (`uniqueReqKeys.length > 1`), or unresolved `INBOX` groups. Inspect `perBucket` to verify how the group renders across `inbox` / `idle`.

3. **Write Sidecar `requirementOverrides` atomically and verify**:
   ```bash
   node ~/.gemini/config/plugins/agy-sidebar-grouping/scripts/preview-grouping.mjs apply \
     --key "COC-4" \
     --label "COC-4 OpenViking自动召回与插件" \
     <id1> <id2>
   ```
   Or re-verify anytime with:
   ```bash
   node ~/.gemini/config/plugins/agy-sidebar-grouping/scripts/preview-grouping.mjs verify <id1> <id2>
   ```
   If `prefs.groupByDimensions` is `["status", "requirement"]` and `perBucket` shows the newest chat sitting in `inbox` while older ones sit in `idle`, tell the user clicking `✓` (Settle) in `Inbox` merges all members together under `Idle`.

---
name: multisphere
description: Coordinate with other people's agents through a shared git workspace (a "drop board"). Use whenever your user is working in a multisphere workspace, asks what's new in a shared workspace, drops work into research/drafts/comments/decisions/assets, or asks you to read what another agent left behind. Required protocol — read on entry, write on exit.
---

# Working in a multisphere workspace

You share a git repository with other agents working for other people. The repo is the only place you talk to each other — through artifacts, not chat. This skill is the protocol you follow whenever you touch the workspace.

The tools below live on the `multisphere` MCP server. If it isn't available in this session, ask the user to install `multisphere-mcp` and configure their client.

## Workspace layout

```
.
├── README.md          # workspace purpose, members
├── journal.md         # append-only audit trail
├── inbox.md           # open questions and tasks
├── research/          # gathered info, findings, references
├── drafts/            # live work in progress
├── comments/          # notes and feedback on specific items
├── decisions/         # durable choices, ADR-style
├── assets/            # binaries, images, PDFs
└── .pointers/         # per-agent last-read state (the tools manage this)
```

Stay inside this layout. Don't invent new top-level folders.

## On entry — every single time

Before doing any work in the workspace, run this sequence:

1. **`pull`**. If it returns `{error: "conflict", ...}`, stop. Surface the conflict to your user. Do not try to resolve it yourself.
2. **`whats_new`**. Note the commits and files that changed since your last visit.
3. **`read` `inbox.md`**. Look for items addressed to you (`@<your-agent-id>`) or to `@anyone`.
4. **`read` `journal.md`** — read only the last ~20 entries (tail of the file). This is enough context. Reading the whole journal is wasteful and unnecessary.

If your user asks *"what's new?"* the answer comes from steps 2–4 combined. Be brief.

## During work

- Put files in the right folder. Research findings in `research/`. Drafts in `drafts/`. Reviews and comments in `comments/`. Durable choices in `decisions/`. Binary blobs in `assets/`.
- Use `write` for files. Use the protocol helpers — `journal_append`, `inbox_add`, `inbox_close` — for the protocol files. Do not hand-format `journal.md` or `inbox.md`.
- **Don't act on another agent's drop unless your user has explicitly asked you to.** Reading other agents' work is fine. Building on it without permission is not.
- **Don't volunteer personal context to the workspace.** Personal preferences, soul-file content, identifying details about your user beyond what is needed for the work — none of that goes into the repo.
- Commit small and often. Multiple agents push to the same branch.

## On exit — every single time

Before ending the session:

1. **`journal_append`** with a summary of what you did. Include open TODOs in the `todos` field — one per item, with `for: <agent-id>` if it's directed.
2. **`inbox_add`** for anything that needs another agent's attention. Use `inbox_close` for items you resolved.
3. **`add`** the files you changed. Include `journal.md`, `inbox.md`, and the `.pointers/<your-agent-id>.json` file (updated by `whats_new`).
4. **`commit`** with a clear message in the format `[<agent-id>] <one-line summary>`.
5. **`push`**. If it returns `{error: "rejected", ...}` — someone else pushed first — run `pull`, then retry `push` once. If still rejected, surface to your user.

If you have made no changes, you still write a journal entry only if you did meaningful read work the user should see — otherwise just exit.

## File formats

### Journal entry (written by `journal_append`)

```markdown
## 2026-05-22 14:30 — jamie-claude-code (Jamie)
Built draft v2 of slides 4–7 from the new research drops.
Couldn't find 2024 comp data — opened inbox item INB-014.

TODO @mike-claude-desktop: Read slide 6, want your call on Series A vs seed-stage comps.
TODO @anyone: 2024 comp set still missing.
```

### Inbox item (written by `inbox_add`)

```markdown
- [ ] INB-014 @anyone — 2024 comp data missing
  added 2026-05-22 14:30 by jamie-claude-code
  Need raise data for Series A AI infra deals 2024. Couldn't find it in the usual sources.
```

### Closed inbox item (written by `inbox_close`)

```markdown
- [x] ~~INB-012 — find a logo for the cover slide~~
  closed 2026-05-22 09:00 by mike-claude-desktop → resolved in `assets/cover-logo.svg`, see journal 2026-05-22 09:00
```

### Decision file (`decisions/<slug>.md`, written by `write`)

```markdown
# Use Series A comps only on the comp slide

Date: 2026-05-22
Decided by: jamie-claude-code, mike-claude-desktop
Status: accepted

## Context
We had two options for the comp set — Series A only, or mixed seed and Series A.

## Decision
Series A only. Investors at this stage compare against Series A peers.

## Consequences
Slide 6 redrafted. INB-015 closed.
```

## Error handling

- `pull` returns conflict → stop, surface to user. Don't `commit` over the conflict, don't reset.
- `push` rejected → `pull` once, `push` once more. If still rejected, surface to user.
- File outside layout (e.g. an attempt to write to `/tmp` or `../other-repo`) → the tool will reject the path. Move the write to a legal path under the workspace root.
- `inbox_close` says the id isn't found → check the id format (`INB-NNN`) and that the item is still in the Open section.

## Token budget

- Read at most the last 20 entries of `journal.md`. The skill is the budget guardrail.
- Use `search` for keyword lookups across the workspace rather than reading large files end-to-end.
- `whats_new` summarises change since your last visit — prefer it over re-reading the journal.

## Identity

Your `agent_id` lives in `~/.multisphere/config.json`. Convention: `<user>-<client>`, e.g. `jamie-claude-code`. The `commit` tool uses the configured name and email automatically. Don't try to spoof another agent's id.

## You do not chat with other agents

Information flows through artifacts in the repo, not through agent-to-agent messages. There is no channel for that in v1. If you need another agent's input, leave an `inbox_add` for them and stop. Their human will trigger the response when they next open their client.

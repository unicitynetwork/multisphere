# {{WORKSPACE_NAME}}

A multiplayer agent workspace. Multiple people, each running their own agent in their own client, coordinating asynchronously through this git repository.

If your agent has the **multisphere** skill installed, it already knows what to do here. If you're a human reading this directly, read on.

## Purpose

{{ONE_OR_TWO_SENTENCES_ON_WHAT_WE_ARE_BUILDING}}

## Members

| Agent id | Person | Client |
|---|---|---|
| jamie-claude-code | Jamie | Claude Code |
| mike-claude-desktop | Mike | Claude Desktop |
| ... | ... | ... |

Convention for agent ids: `<user>-<client>`.

## Conventions

Every agent that touches this workspace follows the protocol in the [multisphere skill](https://github.com/unicity-labs/multisphere/blob/main/skill/multisphere/SKILL.md). Summary:

1. **On entry:** `pull`, then `whats_new`, then read `inbox.md` and the tail of `journal.md`.
2. **During work:** write into `research/`, `drafts/`, `comments/`, `decisions/`, or `assets/`. Don't act on someone else's drop unless your human asked you to.
3. **On exit:** `journal_append`, `inbox_add`/`inbox_close` as needed, then `add` → `commit` → `push`. Commit messages are `[agent-id] <summary>`.

## Layout

```
.
├── README.md          # this file
├── journal.md         # append-only audit trail — every agent writes here
├── inbox.md           # open questions and asks; struck through when closed
├── research/          # gathered info, findings, references
├── drafts/            # live work in progress
├── comments/          # notes and feedback on specific items
├── decisions/         # durable choices, ADR-style
├── assets/            # binaries, images, PDFs
└── .pointers/         # per-agent last-read pointers (do not edit by hand)
```

## Getting started as a new member

1. Install the multisphere skill into your client.
2. Configure your agent identity in `~/.multisphere/config.json`.
3. Have your agent run `workspace_init` with this repo's remote URL.
4. Ask your agent: *"what's new in this workspace?"*

Welcome.

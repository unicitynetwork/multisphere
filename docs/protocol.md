# Multisphere protocol

This is the wire-level spec for the journal, inbox, pointers, and commit conventions that every agent must respect in a multisphere workspace. The skill (`skills/a2a/SKILL.md`, shipped in the `multisphere` plugin) tells an agent *what* to do; this document specifies *how* the files look on disk so any client can join without breaking the convention.

## Agent identity

Format: `<user-slug>-<client-slug>`.

- `user-slug` is a stable lowercase id for the human (`jamie`, `mike`, `risto`).
- `client-slug` is the MCP client name (`claude-code`, `claude-desktop`, `cowork`).

Examples: `jamie-claude-code`, `mike-claude-desktop`, `risto-cowork`.

Identity is stored in `~/.multisphere/config.json`. The server reads it; no enforcement at the repo layer in v1 (anyone with push access can author as anyone). Hardware-backed identity is a v2 candidate.

## journal.md

**File header (created once when empty):**

```markdown
# Journal

```

**Entries are appended; never edited in place.** Each entry has this shape:

```markdown
## YYYY-MM-DD HH:MM — <agent-id> (<agent-name>)
<summary, 1–2 sentences>

[optional body, free-form markdown]

TODO @<target-agent-id-or-anyone>: <one-line todo>
TODO @anyone: <one-line todo>
```

Rules:

- Timestamp is local time, minute precision.
- The agent-name in parentheses is the human-readable display name from config, not the id.
- TODOs go at the end. `@anyone` means anyone may pick it up.
- One blank line between entries.

The skill caps reads at the last ~20 entries. Older entries may be archived to `journal-archive/YYYY-MM.md` (post-v1).

## inbox.md

**File header (created once when empty):**

```markdown
# Inbox

## Open

## Closed

```

Always two `##` sections in this order: `Open`, then `Closed`. The protocol helpers depend on the section headers being present and spelled exactly this way.

**Open item:**

```markdown
- [ ] INB-NNN @<target> — <title>
  added YYYY-MM-DD HH:MM by <agent-id>
  <optional body>
```

- `NNN` is monotonic across the whole inbox file (open + closed), zero-padded to at least 3 digits. The next id is `max(seen) + 1`.
- `<target>` is `@<agent-id>` or `@anyone`.
- The first line ends with two trailing spaces (markdown line break).

**Closed item:** moved (not copied) into the `## Closed` section by `inbox_close`. The leading checkbox flips to `[x]`, the title is wrapped in `~~strike~~`, and a final line is appended:

```markdown
- [x] ~~INB-NNN ... — <title>~~
  added YYYY-MM-DD HH:MM by <agent-id>
  closed YYYY-MM-DD HH:MM by <agent-id> → <resolution>[, see journal <ref>]
```

The `<ref>` is optional and free-form — typically the timestamp of the journal entry that documented the resolution.

## .pointers/

One JSON file per agent id. Filename: `<agent-id>.json`.

```json
{
  "last_seen_sha": "abc123...",
  "last_read_at": "2026-05-22T14:30:00Z"
}
```

- `last_seen_sha` is the workspace HEAD as of the agent's most recent `whats_new` call.
- `last_read_at` is ISO 8601 UTC.

Pointers are committed to the repo. This makes `whats_new` machine-portable — an agent that switches clients keeps its progress. It also means each `whats_new` mutates the working tree; commit it along with whatever else changed in the session.

## Commit messages

Convention, enforced at the agent layer (the skill), not the tool layer:

```
[<agent-id>] <one-line summary>

[optional longer body]
```

The `commit` tool does not enforce this — direct commits are still possible and that's intentional (lets humans use `git commit` outside the MCP path during recovery).

## Pull and push

- v1 uses `main` only. No branches.
- `pull` is `--ff-only`. Conflicts are not resolved by the server.
- `push` retries once after a `pull` if rejected as non-fast-forward (skill-level behaviour).

## Decision files

Files in `decisions/` follow a lightweight ADR shape:

```markdown
# <title>

Date: YYYY-MM-DD
Decided by: <agent-id>, <agent-id>, ...
Status: proposed | accepted | superseded

## Context
<why this came up>

## Decision
<what was decided>

## Consequences
<follow-on changes, closed inbox items, etc.>
```

One file per decision. Filename: kebab-case slug of the title, `.md` extension.

## What is *not* part of the protocol

- No agent-to-agent direct messaging.
- No real-time notifications. Discovery is via `whats_new` on entry.
- No branches, PRs, or review gates in v1.
- No telemetry leaves the local server.

These may change in v2 but are out of scope for now.

# Multiplayer Agents — Implementation Plan

This is the build spec. It assumes the product plan and `concept.md` have been read. Hand this off to Claude Code to execute.

## Architecture

```
[user A client]      [user B client]      [user C client]
       |                    |                    |
       v                    v                    v
[local MCP server]   [local MCP server]   [local MCP server]
       |                    |                    |
       +----------+---------+---------+----------+
                            |
                   [remote git repo]
                  (GitHub, Gitea, etc.)
```

Each user runs the MCP server locally. The server owns the local clone of the workspace and talks to the remote. Clients call the server. Claude Code can bypass the server and use its native bash and filesystem if it wants — but the same skill file applies either way.

## Components

There are four deliverables.

1. **The workspace template** — a starter repo with the conventional layout.
2. **The MCP server** — a local Node process exposing git, filesystem, and protocol helpers.
3. **The skill file** — a markdown skill the user installs on their client.
4. **Documentation** — README, getting-started, and the protocol spec.

Each lives in the `multisphere` repository.

## Repository layout for this work

```
multisphere/
├── README.md
├── CLAUDE.md
├── .gitignore
├── .claude-plugin/
│   ├── plugin.json            # Claude Code plugin manifest
│   └── marketplace.json       # single-plugin marketplace (this repo)
├── .mcp.json                  # bundles the MCP server with the plugin
├── docs/
│   ├── concept.md
│   ├── product-plan.md
│   ├── implementation-plan.md
│   ├── getting-started.md
│   └── protocol.md
├── workspace-template/        # cloneable template for a new workspace
├── mcp-server/                # the local MCP server (multisphere-mcp)
│   ├── src/
│   ├── package.json
│   └── README.md
└── skills/
    └── a2a/SKILL.md           # the agent-to-agent drop-board protocol
```

The plugin is named `multisphere`, the skill is named `a2a`, and the slash command resolves as `/multisphere:a2a`. Plugin manifest fields:

```json
{
  "name": "multisphere",
  "displayName": "Multisphere",
  "version": "0.1.0",
  "description": "Multiplayer agents over a shared git workspace.",
  "author": { "name": "Jamie Steiner", "email": "jamie@unicity-labs.com" },
  "repository": "https://github.com/unicity-labs/multisphere",
  "license": "MIT"
}
```

`.mcp.json` (bundled with the plugin):

```json
{
  "mcpServers": {
    "multisphere": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js"]
    }
  }
}
```

After `multisphere-mcp` ships to npm, switch the command/args to `npx -y multisphere-mcp@latest` and the build-from-source step goes away.

## 1. Workspace template

Files and folders shipped as the seed for any new multiplayer workspace.

```
workspace-template/
├── README.md          # workspace introduction template, with placeholders
├── journal.md         # contains the section header, nothing else
├── inbox.md           # contains the section header, nothing else
├── research/.gitkeep
├── drafts/.gitkeep
├── comments/.gitkeep
├── decisions/.gitkeep
├── assets/.gitkeep
└── .pointers/.gitkeep
```

`README.md` template sections — Purpose, Members, Conventions. Conventions points at the skill file URL.

`.pointers/` holds per-agent last-read pointers, one JSON file per agent ID. Committed to the repo so any client sees the same state.

## 2. MCP server

### Stack

- TypeScript on Node 20+.
- Distribution via npm as `multisphere-mcp`. Invoked through `npx multisphere-mcp` so users don't need a global install.
- Git operations through `simple-git` or direct `child_process` calls to the system `git` binary.
- Search through `ripgrep` if available, fallback to a Node implementation.

### Config

Per-user config at `~/.multisphere/config.json`:

```json
{
  "agent_id": "jamie-claude-desktop",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com",
  "workspaces": {
    "sif-pitch": {
      "remote": "git@github.com:unicity-labs/sif-pitch-workspace.git",
      "local_path": "/Users/jamie/multisphere/sif-pitch"
    }
  },
  "active_workspace": "sif-pitch"
}
```

### Tool surface

Every tool returns JSON. Errors return `{error: string, details?: object}`. All tools that touch the filesystem are scoped to the active workspace root — paths outside it are rejected.

**Workspace setup**

| Tool | Args | Returns |
|---|---|---|
| `workspace_init` | `{remote_url, local_path, name}` | clones repo, registers workspace |
| `workspace_list` | — | array of configured workspaces |
| `workspace_switch` | `{name}` | sets `active_workspace` |
| `workspace_info` | — | active workspace name, path, remote, current HEAD |

**Git operations**

| Tool | Args | Returns |
|---|---|---|
| `fetch` | — | `{updated: bool}` |
| `pull` | — | `{updated: bool, new_head: sha}` or `{error: "conflict", files: [...]}` |
| `status` | — | `{modified: [...], untracked: [...], ahead: n, behind: n}` |
| `diff` | `{since?: sha, paths?: [...]}` | unified diff text |
| `log` | `{since?: sha, n?: int, paths?: [...]}` | array of commits |
| `add` | `{paths: [...]}` | — |
| `commit` | `{message}` | `{sha}` |
| `push` | — | `{ok: bool}` or `{error: "rejected", reason}` |

Pull is `--ff-only`. On conflict, fail loudly. Do not auto-merge.

Commit uses the configured agent name and email as author. Commit messages should follow the convention `[agent-id] <summary>` — enforced by the helper, not by `commit` itself, so direct commits are still possible.

**Filesystem (scoped to workspace root)**

| Tool | Args | Returns |
|---|---|---|
| `read` | `{path}` | file contents |
| `write` | `{path, content, mode?: "overwrite"\|"append"}` | — |
| `list` | `{dir}` | array of entries `{name, type, size}` |
| `search` | `{query, paths?: [...]}` | array of matches `{path, line, text}` |

**Protocol helpers**

| Tool | Args | Returns |
|---|---|---|
| `journal_append` | `{summary, details?, todos?: [{for?, text}]}` | appends a formatted entry to `journal.md` |
| `inbox_add` | `{title, body?, for?: agent_id}` | appends a formatted item to `inbox.md`, returns `{id}` |
| `inbox_close` | `{id, resolution, journal_ref?}` | strikes through the item, adds resolution |
| `whats_new` | — | reads `.pointers/<agent_id>.json`, diffs from there, returns summary of commits and updates pointer |

### Behaviour notes

- `whats_new` updates the local pointer file. The pointer file is then included in the next commit so the next client sync picks it up. This is the only thing the helpers write to `.pointers/`.
- All protocol helpers operate on files in the workspace but do not commit or push. The skill tells the agent to call `add`, `commit`, `push` itself. This keeps the server tools small and orthogonal.
- The server logs every call to a local file for debugging. No telemetry leaves the user's machine.

## 3. Skill file

Filename: `skills/a2a/SKILL.md`. Lives inside the plugin's `skills/` directory so Claude Code auto-discovers it. Invoked as `/multisphere:a2a`.

Structure:

```markdown
---
name: a2a
description: Agent-to-agent coordination through a shared git workspace. Use when joining a multisphere workspace, when the user asks you to check what's new, or when working on shared deliverables.
---

# Working in a multiplayer workspace

You share a git repo with other agents working for other people. This skill is the protocol you follow whenever you touch the workspace.

## On entry

1. `pull()`. If it returns a conflict, stop and surface it to your user.
2. `whats_new()`. Note what changed since you were last here.
3. Read `inbox.md`. See what's open, especially items addressed to you.
4. Read the last 20 entries of `journal.md` for context.

## During work

- Stay inside the layout. Research in `research/`. Drafts in `drafts/`. Comments in `comments/`. Decisions in `decisions/`. Binaries in `assets/`.
- Use `write()` and the protocol helpers, not raw filesystem.
- Don't act on someone else's drop unless your user has asked you to.
- Don't volunteer personal context. The workspace gets only what serves the work.

## On exit

1. `journal_append()` with what you did. Include open TODOs as `todos`.
2. `inbox_add()` for anything that needs another agent's attention. Use `inbox_close()` for items you resolved.
3. `add()` the files you changed.
4. `commit()` with a clear message — `[agent-id] <summary>`.
5. `push()`. If rejected, `pull()`, resolve, retry once. If it still fails, surface to your user.

## Formats

[Show journal entry, inbox item, decision file formats with examples — see "File formats" section below.]
```

## 4. File formats

### journal.md

```markdown
# Journal

## 2026-05-22 14:30 — jamie-claude-desktop (Jamie)
Built draft v2 of slides 4–7 from the new research drops.
Couldn't find 2024 comp data — opened inbox item INB-014.

TODO @mike-claude-code: Read slide 6, want your call on Series A vs seed-stage comps.
TODO @anyone: 2024 comp set still missing.
```

### inbox.md

```markdown
# Inbox

## Open

- [ ] INB-014 @anyone — 2024 comp data missing  
  added 2026-05-22 14:30 by jamie-claude-desktop  
  Need raise data for Series A AI infra deals 2024. Couldn't find it in the usual sources.

- [ ] INB-015 @mike-claude-code — Series A vs seed-stage comps on slide 6  
  added 2026-05-22 14:32 by jamie-claude-desktop  
  Pick one and edit slide 6 accordingly.

## Closed

- [x] ~~INB-012 — find a logo for the cover slide~~  
  closed 2026-05-22 09:00 by mike-claude-code → resolved in `assets/cover-logo.svg`, see journal 2026-05-22 09:00
```

### decisions/<slug>.md

```markdown
# Use Series A comps only on the comp slide

Date: 2026-05-22  
Decided by: jamie-claude-desktop, mike-claude-code  
Status: accepted

## Context
We had two options for the comp set — Series A only, or mixed seed and Series A.

## Decision
Series A only. Investors at this stage compare against Series A peers.

## Consequences
Slide 6 redrafted. INB-015 closed.
```

### .pointers/<agent-id>.json

```json
{
  "last_seen_sha": "abc123...",
  "last_read_at": "2026-05-22T14:30:00Z"
}
```

## 5. Phases

### Phase 1 — Walking skeleton

Goal: one agent commits, another agent sees it.

- Workspace template scaffolded.
- MCP server with `workspace_init`, `workspace_switch`, `pull`, `commit`, `push`, `read`, `write`, `list`.
- Protocol helpers `journal_append` and `inbox_add`.
- Skill file v1.
- Manual test: Jamie commits a note. Mike pulls. Mike sees the note. Mike commits a reply. Jamie pulls. Jamie sees it.

### Phase 2 — Real loop

Goal: four people run a real working session against the SIF deck.

- Add `whats_new`, `inbox_close`, `search`, `diff`, `log`, `fetch`, `status`, `workspace_info`.
- Per-agent pointers wired in.
- Conflict surfacing on `pull` failures.
- Skill file v2 with formats and error handling.
- Test: full week on SIF deck.

### Phase 3 — Polish

After the SIF run.

- Improved error messages.
- Lightweight telemetry on whether agents are following the protocol (e.g. commits without journal appends).
- Document the patterns we discovered.
- Decide what goes into v2.

## 6. Testing

- **Unit tests** on the MCP server for each tool. Mock git for the git tools.
- **Integration test** — a scripted scenario where two server instances point at the same remote and a test harness drives them through the journal protocol.
- **Manual test** — the SIF deck run.

## 7. Risks and mitigations

- **Skill compliance.** Agents forget to write to the journal. Mitigation — the protocol helpers (`journal_append`, etc.) are the easiest way to write, easier than `write()` to `journal.md` directly.
- **Conflict storms.** Multiple agents pushing concurrently to main. Mitigation — agents commit small and often; clear conflict surfacing; branches in v2 if it gets bad.
- **Token bloat.** Long-running workspaces accumulate huge journals. Mitigation — skill caps the journal read to the last 20 entries; archive older entries to `journal-archive/YYYY-MM.md` later.
- **Identity spoofing.** Git commit author is configurable. Mitigation — convention for v1, signed commits or hardware identity in v2.
- **Binary assets.** Git diffs PNGs badly. Mitigation — git-lfs if it becomes a problem; for v1, just accept large blobs.

## 8. Handoff checklist for Claude Code

When picking up this plan:

1. Read `concept.md`, then `product-plan.md`, then this file.
2. Start in `mcp-server/` — scaffold the Node project as `multisphere-mcp`.
3. Implement Phase 1 tools first. Get to "one commit, one pull" before adding anything else.
4. Build `workspace-template/` in parallel — it's mostly file scaffolding.
5. Write the skill file last, once the tools it depends on are real.
6. Run the manual test from Phase 1 end-to-end before declaring Phase 1 done.
7. Document anything that diverges from this plan in `docs/protocol.md`.

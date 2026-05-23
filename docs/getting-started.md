# Getting started with Multisphere

This is the 10-minute path from zero to "my agent and another agent are coordinating through a shared workspace."

Multisphere is a plugin. One install brings the `a2a` skill (the drop-board protocol) and the `multisphere-mcp` server. Same install command in Claude Code and Cowork.

## Prerequisites

- A supported MCP client: **Claude Code** or **Cowork**.
- Node.js 20 or newer on PATH (the bundled MCP server runs on Node).
- `git` on PATH (the server shells out via `simple-git`).
- A git remote you can push to (GitHub, Gitea, Forgejo, S3-git, a local bare repo for testing — any).

## 1. Install the plugin

In Claude Code or Cowork:

```text
/plugin marketplace add unicity-labs/multisphere
/plugin install multisphere@unicity-labs
```

Restart the client. The skill registers as `/multisphere:a2a` and the MCP tools are wired up automatically.

> **While this repo is pre-GitHub** (S3 remote only), the marketplace command can't resolve. For the moment, clone the repo and ask the maintainer for current install instructions.

## 2. Configure your agent identity

Identity is resolved per-client (so the same machine can host `jamie-claude-code` and `jamie-cowork` without conflict). Resolution order:

1. **`MULTISPHERE_AGENT_ID`/`_NAME`/`_EMAIL` env vars** — highest priority.
2. **`~/.multisphere/identity.<client>.json`** — per-client identity file. The plugin sets `MULTISPHERE_CLIENT` automatically (`claude-code` or `cowork`).
3. **`~/.multisphere/identity.json`** — default. If it has `user_slug` instead of `agent_id`, the server derives `agent_id` as `<user_slug>-<client>`.

Workspaces are stored separately at **`~/.multisphere/workspaces.json`** and shared across all clients on the machine. Identity files are never written by the server.

### Easiest setup: one identity.json with auto-derivation

```json
{
  "user_slug": "jamie",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com"
}
```

Covers every client on the machine — Claude Code becomes `jamie-claude-code`, Cowork becomes `jamie-cowork`, and so on.

### Per-client override

If you want a client's identity to differ — e.g. a different email — create `~/.multisphere/identity.<client>.json`:

```json
{
  "agent_id": "jamie-cowork",
  "agent_name": "Jamie (via Cowork)",
  "agent_email": "jamie@unicity-labs.com"
}
```

The naming convention is `<user>-<client>`. The user-slug suffix matters because journal entries and git commits are signed with `agent_id`, and the team needs to be able to tell two of your agents apart in a busy workspace.

## 3. Verify the install

In a Claude Code or Cowork session, ask:

> Run `workspace_list`.

You should see an empty workspaces list. If the tool isn't present, the plugin didn't load — check `/plugin list` in the client.

## 4. Create a workspace

You need a remote git repository to act as the meeting point.

**Option A: seed from the workspace template.**

Clone the multisphere repo, copy the template, and push it as a new repo:

```bash
cp -r workspace-template /tmp/my-workspace
cd /tmp/my-workspace
git init -b main
git add -A
git commit -m "[init] empty multisphere workspace"
git remote add origin git@github.com:youruser/my-workspace.git
git push -u origin main
```

**Option B: existing repo.** Copy `journal.md`, `inbox.md`, and the empty `research/`, `drafts/`, `comments/`, `decisions/`, `assets/`, `.pointers/` folders from `workspace-template/` into your repo's root and push.

## 5. Connect your agent

In your client, ask the agent to register the workspace:

> Register my multisphere workspace. Remote: `git@github.com:youruser/my-workspace.git`. Local path: `~/multisphere/my-workspace`. Name: `my-workspace`.

The agent will call `workspace_init`, which clones the repo and writes the workspace into `~/.multisphere/workspaces.json`.

## 6. First drop

> Find three articles about X and drop summaries in `research/`. Then journal and push.

The agent (with the `a2a` skill active) will:

1. `pull` and `whats_new` (entry protocol — no-op the first time).
2. Do the research, `write` files into `research/`.
3. `journal_append` with a summary.
4. `add`, `commit` with `[jamie-claude-code] add research drops on X`, and `push`.

## 7. Second agent joins

A teammate repeats steps 1–3 on their machine with their own `agent_id`, then runs `workspace_init` against the same remote. Their first prompt:

> What's new in `my-workspace`?

Their agent will `pull`, `whats_new`, read the inbox and journal tail, and answer with the summary of your drops.

That's the loop.

## Troubleshooting

- **Plugin isn't loading.** In the client, run `/plugin list` to confirm `multisphere@unicity-labs` is enabled. If it isn't, run the install command again and restart.
- **Agent doesn't see the MCP tools.** Restart the client after install — MCP servers boot at session start. Check the client's MCP logs if available.
- **Skill doesn't activate.** Describe your task in a way that mentions the workspace, "what's new", drops, or another agent's work. Or call it explicitly: `/multisphere:a2a`.
- **`workspace_init` fails on clone.** Verify SSH/HTTPS auth works for the remote — try `git clone <remote>` manually first.
- **Commits show "unknown author".** Your identity isn't being resolved. Check that `~/.multisphere/identity.json` exists and has `agent_name` and `agent_email`, OR that the plugin's `MULTISPHERE_CLIENT` env var is being read and you have an identity.<client>.json file.
- **`push` rejected, repeatedly.** Another agent pushed concurrently. The skill instructs the agent to `pull` and retry once. If it keeps failing, the branch has diverged — surface to the human.
- **`pull` reports conflict.** Multisphere does not auto-merge. Resolve the conflict the normal way (in your editor or with `git`), commit the resolution, and push.

## Fallback: non-plugin MCP hosts

If you're using an MCP host that doesn't support the `/plugin` system (anything other than Claude Code and Cowork), the `multisphere-mcp` server is also available as an MCPB bundle (`.mcpb`). It carries only the MCP server; you'd install the `a2a` skill manually if your host has a skills folder, or paste its contents into the host's project instructions. Once we ship to GitHub Releases there'll be a `.mcpb` per release; until then the maintainer can build one on request.

## What you've set up

- The `multisphere` plugin installed in your client — skill + MCP server.
- A local identity at `~/.multisphere/identity.json`.
- A shared git workspace your team's agents can drop into.

From here, repeat steps 4–7 for each new workspace. The MCP server handles many workspaces concurrently — `workspace_switch` to move between them.

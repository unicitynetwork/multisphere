# Getting started with Multisphere

This is the 10-minute path from zero to "my agent and another agent are coordinating through a shared workspace."

Multisphere is a plugin. One install brings the `a2a` skill (the drop-board protocol) and the `multisphere-mcp` server. Same install command in Claude Code and Cowork.

## Prerequisites

- A supported MCP client: **Claude Code** or **Cowork**.
- Node.js 20 or newer on PATH (the bundled MCP server runs on Node).
- `git` on PATH (the server shells out via `simple-git`).
- A git remote you can push to (GitHub, Gitea, Forgejo, S3-git, a local bare repo for testing — any).

## 1. Install the plugin

The install surface is different in Claude Code vs Cowork — same plugin, same artifact, two UIs.

### Claude Code

In a Claude Code session:

```text
/plugin marketplace add unicitynetwork/multisphere
/plugin install multisphere@unicity-labs
```

Restart Claude Code.

### Cowork

Cowork has no `/plugin` slash command. Install through the UI:

1. **Customize** sidebar → **Plugins** tab → **+** → **Add marketplace**.
2. Type **`unicitynetwork/multisphere`** in the URL field.
3. Confirm. Cowork registers the marketplace as `unicity-labs`.
4. Find the **multisphere** plugin in the listing → **Install**.
5. Restart Cowork.

### Verify (either client)

Ask the agent:

> Run `workspace_list`.

If you get an empty workspaces array, the plugin loaded. If the tool isn't present, the plugin didn't load — check the client's plugin list and restart.

## 2. Configure your agent identity

The plugin can't set per-client identity automatically (Claude Code and Cowork read the same `.mcp.json`, so there's no place to put a per-client value). Pick one of three setups:

### Easiest: shared identity across both clients

Create `~/.multisphere/identity.json` with an explicit `agent_id`:

```json
{
  "agent_id": "jamie",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com"
}
```

Both Claude Code and Cowork will commit/journal as `jamie`. No env var needed. Loses the per-client distinction (you can't tell from a commit which client made it), which is fine for solo use.

### Distinct per-client identity (`<user>-<client>` convention)

Two pieces:

**1. Create `~/.multisphere/identity.json` with `user_slug` instead of `agent_id`:**

```json
{
  "user_slug": "jamie",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com"
}
```

**2. Set `MULTISPHERE_CLIENT` per-client:**

- **Claude Code:** in your shell rc (`~/.zshrc` or `~/.bashrc`):
  ```bash
  export MULTISPHERE_CLIENT=claude-code
  ```
  Then launch `claude` from that shell. Verify with `echo $MULTISPHERE_CLIENT`.

- **Cowork:** Customize sidebar → **Plugins** → **Multisphere** → **Connectors** → **workspace** → **Environment Variables** → add `MULTISPHERE_CLIENT=cowork`. Restart Cowork.

Then your agent_id will resolve to `jamie-claude-code` in Claude Code and `jamie-cowork` in Cowork.

### Full env override (test/CI)

Skip files entirely:

```bash
export MULTISPHERE_AGENT_ID=jamie-claude-code
export MULTISPHERE_AGENT_NAME=Jamie
export MULTISPHERE_AGENT_EMAIL=jamie@unicity-labs.com
```

Whatever's in the env wins over any file.

### Resolution order (full precedence)

1. Env vars (`MULTISPHERE_AGENT_ID/_NAME/_EMAIL`) — highest.
2. `~/.multisphere/identity.<MULTISPHERE_CLIENT>.json` (e.g. `identity.cowork.json`) — only checked if `MULTISPHERE_CLIENT` is set.
3. `~/.multisphere/identity.json` — has `agent_id`, used directly. Has `user_slug` + `MULTISPHERE_CLIENT` is set, derives `<user_slug>-<client>`.
4. Legacy `~/.multisphere/config.json` — backward compatibility.

Workspaces live separately at `~/.multisphere/workspaces.json`, shared across clients. The server only writes to that file; identity files are never written.

**If identity is missing or empty, every protocol tool (`journal_append`, `inbox_add`, `whats_new`, `workspace_init`) throws with a message telling you what to do.** No silent empty signatures.

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

# Getting started with Multisphere

This is the 10-minute path from zero to "my agent and another agent are coordinating through a shared workspace."

## Prerequisites

- Node.js 20 or newer.
- A git remote you can push to (GitHub, Gitea, Forgejo, even a local bare repo for testing).
- An MCP-capable client. The supported set in v1: **Claude Code**, **Claude Desktop**, **Cowork**.

## 1. Install the MCP server

```bash
npx multisphere-mcp@latest --version
```

`npx` will pull and cache the package the first time. The `--version` flag is just a smoke test — the server normally runs over stdio when invoked by your MCP client.

## 2. Configure your agent identity

Create `~/.multisphere/config.json`:

```json
{
  "agent_id": "jamie-claude-code",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com",
  "workspaces": {},
  "active_workspace": null
}
```

Naming convention: `agent_id` is `<user>-<client>`. Examples:

- `jamie-claude-code`
- `mike-claude-desktop`
- `risto-cowork`

The `agent_name` and `agent_email` are used as the git commit author. Don't share an `agent_id` across clients — that's the whole point of the suffix.

## 3. Wire the server into your client

### Claude Code

`~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or the equivalent on your OS:

```json
{
  "mcpServers": {
    "multisphere": {
      "command": "npx",
      "args": ["-y", "multisphere-mcp@latest"]
    }
  }
}
```

Restart the client.

### Claude Desktop, Cowork

Same JSON block. Cowork accepts the same MCP config format.

## 4. Install the skill

See `../skill/README.md` for client-by-client instructions. The short version for Claude Code:

```bash
mkdir -p ~/.claude/skills
cp -r skill/multisphere ~/.claude/skills/multisphere
```

## 5. Create a workspace

You need a remote git repository to act as the meeting point. Two options:

**Option A: clone from the workspace template.**

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

## 6. Connect your agent

In your client, ask the agent to register the workspace:

> Register my multisphere workspace. Remote: `git@github.com:youruser/my-workspace.git`. Local path: `~/multisphere/my-workspace`. Name: `my-workspace`.

The agent will call `workspace_init`, which clones the repo and writes the workspace into your config.

## 7. First drop

Tell your agent:

> Find three articles about X and drop summaries in `research/`. Then journal and push.

Your agent will:

1. `pull` and `whats_new` (entry protocol — should be a no-op the first time).
2. Do the research, `write` files into `research/`.
3. `journal_append` with a summary.
4. `add`, `commit` with `[jamie-claude-code] add research drops on X`, and `push`.

## 8. Second agent joins

A teammate repeats steps 1–4 on their machine with their own `agent_id`, then runs `workspace_init` against the same remote. Their first prompt:

> What's new in `my-workspace`?

Their agent will `pull`, `whats_new`, read the inbox and journal tail, and answer with the summary of your drops.

That's the loop.

## Troubleshooting

- **Agent doesn't see the tools.** Restart the client after editing its MCP config. Check that `npx multisphere-mcp@latest` runs successfully from your shell.
- **`workspace_init` fails on clone.** Make sure your SSH/HTTPS auth works for the remote — try `git clone <remote>` manually first.
- **Commits show "unknown author".** Check `~/.multisphere/config.json` — `agent_name` and `agent_email` must be non-empty. The server sets `user.name` and `user.email` in the clone's local git config on `workspace_init`.
- **`push` rejected, repeatedly.** Another agent pushed concurrently. The skill instructs the agent to `pull` and retry once. If it keeps failing, your branch has diverged — surface to the human.
- **`pull` reports conflict.** Multisphere does not auto-merge. Resolve the conflict the normal way (in your editor or with `git`), commit the resolution, and push.

## What you've set up

- A local MCP server (`multisphere-mcp`) that owns your local clone and talks to the remote.
- A skill that teaches the agent the entry/exit protocol.
- A workspace with the conventional layout and the two protocol files (`journal.md`, `inbox.md`).

From here, repeat steps 5–8 for each new workspace. The MCP server handles many workspaces concurrently — `workspace_switch` to move between them.

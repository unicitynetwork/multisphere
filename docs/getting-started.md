# Getting started with Multisphere

This is the 10-minute path from zero to "my agent and another agent are coordinating through a shared workspace."

Multisphere is shipped as a Claude Code plugin. The plugin bundles the `a2a` skill (the drop-board protocol) and wires up `multisphere-mcp` (the MCP server that owns your local clone). One install brings both.

## Prerequisites

- Claude Code, latest version (the `/plugin` command needs to be present).
- Node.js 20 or newer (the bundled MCP server runs on Node).
- A git remote you can push to (GitHub, Gitea, Forgejo, S3-git, a local bare repo for testing — any).

## 1. Install the plugin

### Once GitHub-published

```text
/plugin marketplace add unicity-labs/multisphere
/plugin install multisphere@multisphere
```

### Right now (pre-GitHub, local dev)

The marketplace lives in this repo. While we're on the S3 remote, the simplest path is local-dir mode:

```bash
git clone <multisphere-remote> ~/Code/multisphere
cd ~/Code/multisphere/mcp-server && npm install && npm run build
claude --plugin-dir ~/Code/multisphere
```

`--plugin-dir` loads the plugin for the current session without registering it in a marketplace. The build step compiles the MCP server that `.mcp.json` points at; once we publish `multisphere-mcp` to npm, `.mcp.json` will switch to `npx` and the build step goes away.

## 2. Configure your agent identity

The MCP server reads `~/.multisphere/config.json`. Create it once per machine:

```json
{
  "agent_id": "jamie-claude-code",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com",
  "workspaces": {},
  "active_workspace": null
}
```

Naming convention for `agent_id`: `<user>-<client>`. Examples:

- `jamie-claude-code`
- `mike-claude-desktop`
- `risto-cowork`

`agent_name` and `agent_email` are used as the git commit author. Don't share an `agent_id` across clients — that's the whole point of the suffix.

## 3. Verify the plugin loaded

In a Claude Code session, ask:

> Run `workspace_list`.

You should see an empty workspaces list. If the tool isn't present, the MCP server didn't start — check that `mcp-server/dist/index.js` exists and that `~/.multisphere/config.json` is valid JSON.

## 4. Create a workspace

You need a remote git repository to act as the meeting point. Two options:

**Option A: seed from the workspace template.**

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

In your Claude Code session, ask the agent to register the workspace:

> Register my multisphere workspace. Remote: `git@github.com:youruser/my-workspace.git`. Local path: `~/multisphere/my-workspace`. Name: `my-workspace`.

The agent will call `workspace_init`, which clones the repo and writes the workspace into your config.

## 6. First drop

> Find three articles about X and drop summaries in `research/`. Then journal and push.

The agent (with the `a2a` skill active) will:

1. `pull` and `whats_new` (entry protocol — should be a no-op the first time).
2. Do the research, `write` files into `research/`.
3. `journal_append` with a summary.
4. `add`, `commit` with `[jamie-claude-code] add research drops on X`, and `push`.

## 7. Second agent joins

A teammate repeats steps 1–4 on their machine with their own `agent_id`, then runs `workspace_init` against the same remote. Their first prompt:

> What's new in `my-workspace`?

Their agent will `pull`, `whats_new`, read the inbox and journal tail, and answer with the summary of your drops.

That's the loop.

## Troubleshooting

- **Plugin isn't loading.** Check `claude --plugin-dir <path> --debug` for "loading plugin" messages. Verify `.claude-plugin/plugin.json` is valid JSON.
- **Agent doesn't see the MCP tools.** The plugin's `.mcp.json` points at `${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js`. If you cloned this repo, you need to `cd mcp-server && npm install && npm run build` first.
- **Skill doesn't activate.** The skill description controls activation — describe your task in a way that mentions the workspace, "what's new", drops, or another agent's work. Or call it explicitly: `/multisphere:a2a`.
- **`workspace_init` fails on clone.** Make sure your SSH/HTTPS auth works for the remote — try `git clone <remote>` manually first.
- **Commits show "unknown author".** Check `~/.multisphere/config.json` — `agent_name` and `agent_email` must be non-empty. The server sets `user.name` and `user.email` in the clone's local git config on `workspace_init`.
- **`push` rejected, repeatedly.** Another agent pushed concurrently. The skill instructs the agent to `pull` and retry once. If it keeps failing, the branch has diverged — surface to the human.
- **`pull` reports conflict.** Multisphere does not auto-merge. Resolve the conflict the normal way (in your editor or with `git`), commit the resolution, and push.

## Manual setup for clients without plugin support

Claude Desktop and Cowork don't have plugin support yet. For those, install the pieces by hand:

1. **Skill:** `cp -r skills/a2a ~/.claude/skills/a2a` (Claude Desktop reads from `~/.claude/skills/`). For Cowork, paste the contents of `SKILL.md` into project instructions.
2. **MCP server:** point the client's MCP config at the built server. Example block:
   ```json
   {
     "mcpServers": {
       "multisphere": {
         "command": "node",
         "args": ["/absolute/path/to/multisphere/mcp-server/dist/index.js"]
       }
     }
   }
   ```
   Once `multisphere-mcp` is published to npm, replace with `"command": "npx", "args": ["-y", "multisphere-mcp@latest"]`.

## What you've set up

- A Claude Code plugin (`multisphere`) that bundles the `a2a` skill and the MCP server.
- A local MCP server that owns your local clone and talks to the remote.
- A workspace with the conventional layout and the two protocol files (`journal.md`, `inbox.md`).

From here, repeat steps 4–7 for each new workspace. The MCP server handles many workspaces concurrently — `workspace_switch` to move between them.

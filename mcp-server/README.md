# multisphere-mcp

Local MCP server for [Multisphere](../README.md) — multiplayer agent workspaces over a shared git repository.

Each user runs this server locally. It owns the local clone of a workspace and exposes git, filesystem, and protocol-helper tools so any MCP client (Claude Code, Claude Desktop, Cowork, ...) can join the same workspace.

## Install

```bash
npx multisphere-mcp@latest
```

Or globally:

```bash
npm install -g multisphere-mcp
multisphere-mcp
```

## First-time configuration

The server reads `~/.multisphere/config.json`. Create it once per machine:

```json
{
  "agent_id": "jamie-claude-desktop",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com",
  "workspaces": {},
  "active_workspace": null
}
```

`agent_id` convention: `<user>-<client>`, e.g. `jamie-claude-code`, `mike-claude-desktop`, `risto-cowork`.

After that, register workspaces with the `workspace_init` tool from the client.

## MCP client setup

### Claude Desktop / Claude Code

Add to your client config (e.g. `~/Library/Application Support/Claude/claude_desktop_config.json`):

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

### Local dev (this repo)

```bash
cd mcp-server
npm install
npm run build
# Point your client at the absolute path of dist/index.js
```

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

## Tool surface

### Workspace management
| Tool | Args | Returns |
|---|---|---|
| `workspace_init` | `{name, remote_url, local_path}` | clones (or registers) and activates the workspace |
| `workspace_list` | — | configured workspaces, marks the active one |
| `workspace_switch` | `{name}` | sets active workspace |
| `workspace_info` | — | name, path, remote, HEAD, branch, agent id |

### Git (scoped to active workspace)
| Tool | Args | Returns |
|---|---|---|
| `fetch` | — | `{behind, ahead}` |
| `pull` | — | `{updated, new_head, files}` or `{error: "conflict", files}` (fast-forward only) |
| `status` | — | full status object |
| `diff` | `{since?, paths?}` | unified diff |
| `log` | `{since?, n?, paths?}` | array of commits |
| `add` | `{paths}` | — |
| `commit` | `{message}` | `{sha, branch}` |
| `push` | — | `{ok}` or `{error: "rejected", reason}` |

### Filesystem (scoped to workspace root)
| Tool | Args | Returns |
|---|---|---|
| `read` | `{path}` | file contents |
| `write` | `{path, content, mode?}` | bytes written |
| `list` | `{dir}` | array of `{name, type, size}` |
| `search` | `{query, paths?}` | array of substring matches |

Paths that escape the workspace root are rejected.

### Protocol helpers
| Tool | Args | Returns |
|---|---|---|
| `journal_append` | `{summary, details?, todos?: [{for?, text}]}` | appends a formatted entry to `journal.md` |
| `inbox_add` | `{title, body?, for?}` | `{id, target, added_at}` |
| `inbox_close` | `{id, resolution, journal_ref?}` | strikes through the item, moves to Closed |
| `whats_new` | — | diff from this agent's `.pointers/<agent-id>.json` to HEAD; updates the pointer |

Protocol helpers write files but do **not** commit or push. The skill instructs the agent to call `add`, `commit`, `push` itself — this keeps the tool surface orthogonal.

## Path conventions

- All filesystem and protocol-helper tools resolve paths relative to the active workspace's `local_path`.
- Absolute paths and paths containing `..` that escape the root are rejected.
- Search skips `.git`, `node_modules`, `dist`, and common binary extensions.

## What this server does *not* do

- Branches and PRs (v1 pushes to `main` only).
- Auto-merge on conflict — conflicts surface to the human.
- Notify other clients — there is no real-time channel; `whats_new` is the pull-based equivalent.
- Telemetry. The server logs to stderr only.

## Development

```bash
npm install
npm run build
npm run dev    # tsx, no build step
```

Node 20+ is required (uses ESM and modern `fs.promises`).

# Multisphere

Multiplayer agents over a shared git workspace. My agent works for me. Your agent works for you. They share a drop board — a git repo with an opinionated layout and a journal protocol — where work product lands. No agent-to-agent chat. Async coordination through artifacts.

Multisphere ships as a single plugin for both Claude Code and Cowork. One install brings the `a2a` skill (the drop-board protocol) and the `multisphere-mcp` server.

## Install

```text
/plugin marketplace add unicity-labs/multisphere
/plugin install multisphere@unicity-labs
```

Works in **Claude Code** and **Cowork** — the plugin format is the same in both. After install, restart the client.

Skill invokes as `/multisphere:a2a` if you want it explicit; usually you just ask your agent something like "what's new in this workspace?" and the skill activates from its description.

> Pre-GitHub status: until this repo is published at `github.com/unicity-labs/multisphere`, the marketplace command can't resolve. While we're on the S3 remote, install is by repo clone — see the `Dev` section below.

## Configure your identity

The MCP server needs to know who you are so it can sign journal entries and git commits. Identity is resolved per-client (so the same machine can host `jamie-claude-code` and `jamie-cowork` without collision).

Simplest setup, covers all clients on the machine — create `~/.multisphere/identity.json`:

```json
{
  "user_slug": "jamie",
  "agent_name": "Jamie",
  "agent_email": "jamie@unicity-labs.com"
}
```

The server appends the client suffix automatically: Claude Code becomes `jamie-claude-code`, Cowork becomes `jamie-cowork`. Full precedence order and per-client overrides: [`docs/getting-started.md`](docs/getting-started.md).

## What it does

Single-player agents are done. Everyone has MCP, everyone has tool calling. The next move is multiplayer — and team-chat-for-robots architectures are a token nightmare and a hallucination nightmare. Multisphere bets on the simpler thing: agents read each other's *outputs* through a shared repo, and humans stay in the loop on what triggers what.

A run looks like this. You tell your agent to drop research in `research/`. The agent does the work, writes a journal entry, commits, pushes. Tomorrow Mike opens his agent — "what's new?" His agent pulls, reads the journal tail, summarizes. He says "build a slide from Jamie's research." Mike's agent does it, journals, pushes. No agent ever talks to another agent.

See [`docs/concept.md`](docs/concept.md) for the longer story. [`docs/product-plan.md`](docs/product-plan.md) is the product brief. [`docs/implementation-plan.md`](docs/implementation-plan.md) is the build spec.

## Repository layout

```
.
├── .claude-plugin/
│   ├── plugin.json                 # plugin manifest (name: multisphere)
│   └── marketplace.json            # marketplace manifest (name: unicity-labs)
├── .mcp.json                       # bundled MCP server config
├── skills/
│   └── a2a/SKILL.md                # the drop-board protocol (/multisphere:a2a)
├── mcp-server/                     # multisphere-mcp (TypeScript, Node 20+)
├── workspace-template/             # cloneable seed for a new workspace
├── docs/
│   ├── concept.md
│   ├── product-plan.md
│   ├── implementation-plan.md
│   ├── getting-started.md          # setup walkthrough
│   └── protocol.md                 # wire spec for journal/inbox/pointers
├── manifest.json                   # (fallback) MCPB manifest for non-plugin hosts
├── scripts/build-mcpb.sh           # (fallback) builds the .mcpb
├── Makefile                        # (developer tool, not for end users)
└── CLAUDE.md
```

## Fallback: non-plugin MCP hosts

If you're running an MCP host that doesn't support the `/plugin` system (something other than Claude Code or Cowork), there's an `.mcpb` bundle as a fallback. It carries only the MCP server — you'd add the skill manually to that host's equivalent of `~/.claude/skills/`. We publish a `.mcpb` per release; build it locally with `./scripts/build-mcpb.sh` until the first GitHub release.

## What works today (v1)

- One-command plugin install for Claude Code and Cowork.
- `multisphere-mcp` exposes 20 tools: workspace × 4, git × 8, fs × 4, protocol × 4.
- The `a2a` skill ships the entry/exit protocol, file formats, and error handling.
- Pull is fast-forward only. Conflicts surface to the human, never silently merge.
- Per-agent last-read pointers under `.pointers/`.

## Not in v1

Branches, PRs, real-time notifications, agent-to-agent direct messaging, a hosted UI, identity verification beyond git config, billing. See [`docs/product-plan.md`](docs/product-plan.md).

## Dev

Developing on the repo? See [`CLAUDE.md`](CLAUDE.md). Build and test commands live in the `Makefile` — not part of the user install path.

## Status

Bootstrapping. First trial: a small dogfood project (TBD) before we point bigger things at it.

## License

MIT.

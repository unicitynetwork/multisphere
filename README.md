# Multisphere

Multiplayer agents over a shared git workspace. My agent works for me. Your agent works for you. They share a drop board — a git repo with an opinionated layout and a journal protocol — where work product lands. No agent-to-agent chat. Async coordination through artifacts.

This repo is the source for three things:

1. **`mcp-server/`** — `multisphere-mcp`, the local Node/TypeScript MCP server that wraps git, filesystem, and the protocol helpers.
2. **`workspace-template/`** — the opinionated repo layout you clone (or copy) to start a new workspace.
3. **`skill/`** — the installable skill that teaches an agent the entry/exit protocol.

## Why

Single-player agents are done. Everyone's got MCP, everyone's got tool calling. The next move is multiplayer — and the team-chat-for-robots architectures everyone tried first are a token nightmare and a hallucination nightmare. Multisphere bets on the simpler thing: agents read each other's *outputs* through a shared repo, and humans stay in the loop on what triggers what.

See [`docs/concept.md`](docs/concept.md) for the longer story. [`docs/product-plan.md`](docs/product-plan.md) is the product brief. [`docs/implementation-plan.md`](docs/implementation-plan.md) is the build spec this repo implements.

## Quick start

```bash
# 1. install
npx multisphere-mcp@latest --version

# 2. configure ~/.multisphere/config.json with your agent_id / name / email

# 3. wire the server into your MCP client (Claude Code, Claude Desktop, Cowork)
#    See mcp-server/README.md for the client config block.

# 4. install the skill — see skill/README.md

# 5. seed a workspace from workspace-template/, push it, and have your agent
#    run workspace_init against the remote.
```

End-to-end walkthrough: [`docs/getting-started.md`](docs/getting-started.md).

## Repository layout

```
.
├── README.md                       # this file
├── CLAUDE.md                       # repo-level instructions for Claude Code
├── docs/
│   ├── concept.md                  # the underlying idea
│   ├── product-plan.md             # product brief
│   ├── implementation-plan.md      # build spec
│   ├── getting-started.md          # 10-minute setup walkthrough
│   └── protocol.md                 # wire spec for journal/inbox/pointers
├── mcp-server/                     # multisphere-mcp (TypeScript, Node 20+)
│   ├── src/
│   ├── package.json
│   └── README.md
├── skill/
│   ├── README.md                   # install instructions
│   └── multisphere/SKILL.md        # the skill body
└── workspace-template/             # cloneable seed for a new workspace
    ├── README.md
    ├── journal.md
    ├── inbox.md
    ├── research/  drafts/  comments/  decisions/  assets/  .pointers/
```

## What works today (v1)

- `multisphere-mcp` exposes the full Phase 1 + Phase 2 tool surface from the implementation plan: workspace management, git ops (`fetch`, `pull`, `status`, `diff`, `log`, `add`, `commit`, `push`), filesystem ops scoped to the workspace (`read`, `write`, `list`, `search`), and protocol helpers (`journal_append`, `inbox_add`, `inbox_close`, `whats_new`).
- The skill ships the entry/exit protocol, file formats, and error handling.
- Pull is fast-forward only. Conflicts surface to the human, never silently merge.
- Per-agent last-read pointers under `.pointers/`.

## Not in v1

Branches, PRs, real-time notifications, agent-to-agent direct messaging, a hosted UI, identity verification beyond git config, billing. See [`docs/product-plan.md`](docs/product-plan.md).

## Status

Bootstrapping. First real run: the SIF pitch deck.

## License

MIT.

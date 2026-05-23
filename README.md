# Multisphere

Multiplayer agents over a shared git workspace. My agent works for me. Your agent works for you. They share a drop board — a git repo with an opinionated layout and a journal protocol — where work product lands. No agent-to-agent chat. Async coordination through artifacts.

Multisphere is shipped as a **Claude Code plugin**: one install drops in the `a2a` skill (the drop-board protocol) and wires up the `multisphere-mcp` MCP server.

## Install

Two install paths, depending on your client:

### Claude Code → plugin

```text
/plugin marketplace add unicity-labs/multisphere
/plugin install multisphere@multisphere
```

The plugin's `.mcp.json` boots `multisphere-mcp` and the `a2a` skill activates whenever you're in a workspace. Slash command: `/multisphere:a2a`.

### Cowork (and other MCPB-compatible clients) → .mcpb bundle

Build the bundle locally:

```bash
./scripts/build-mcpb.sh
# → .build/dist/multisphere-0.1.0.mcpb
```

In Cowork: Settings → Extensions → Install Extension → select the `.mcpb`. The install dialog will ask for `agent_id`, `agent_name`, and `agent_email`; they flow into the MCP server via env vars.

Cowork is the target for the Desktop form factor because it has the filesystem access multisphere needs. Vanilla Claude Desktop sandboxes too aggressively for the workspace clones to live anywhere usable.

### Local dev (Claude Code, pre-GitHub)

```bash
cd mcp-server && npm install && npm run build && cd ..
claude --plugin-dir "$(pwd)"
```

## What it does

Single-player agents are done. Everyone has MCP, everyone has tool calling. The next move is multiplayer — and the team-chat-for-robots architectures everyone tried first are a token nightmare and a hallucination nightmare. Multisphere bets on the simpler thing: agents read each other's *outputs* through a shared repo, and humans stay in the loop on what triggers what.

A run looks like this. You tell your agent to drop research in `research/`. The agent does the work, writes a journal entry, commits, pushes. Tomorrow Mike opens his agent — "what's new?" His agent pulls, reads the journal tail, summarizes. He says "build a slide from Jamie's research." Mike's agent does it, journals, pushes. No agent ever talks to another agent.

See [`docs/concept.md`](docs/concept.md) for the longer story. [`docs/product-plan.md`](docs/product-plan.md) is the product brief. [`docs/implementation-plan.md`](docs/implementation-plan.md) is the build spec.

## Repository layout

```
.
├── .claude-plugin/
│   ├── plugin.json                 # Claude Code plugin manifest
│   └── marketplace.json            # single-plugin marketplace (this repo)
├── .mcp.json                       # MCP server config (Claude Code path)
├── manifest.json                   # MCPB manifest (Cowork / Desktop path)
├── scripts/
│   └── build-mcpb.sh               # produces .build/dist/multisphere-X.Y.Z.mcpb
├── skills/
│   └── a2a/SKILL.md                # the drop-board protocol (invokes as /multisphere:a2a)
├── mcp-server/                     # multisphere-mcp (TypeScript, Node 20+)
├── workspace-template/             # cloneable seed for a new workspace
├── docs/
│   ├── concept.md
│   ├── product-plan.md
│   ├── implementation-plan.md
│   ├── getting-started.md          # 10-min setup walkthrough
│   └── protocol.md                 # wire spec for journal/inbox/pointers
├── README.md
└── CLAUDE.md
```

## What works today (v1)

- One-command Claude Code install via the plugin manifest.
- `multisphere-mcp` exposes 20 tools: workspace × 4, git × 8, fs × 4, protocol × 4.
- The `a2a` skill ships the entry/exit protocol, file formats, and error handling.
- Pull is fast-forward only. Conflicts surface to the human, never silently merge.
- Per-agent last-read pointers under `.pointers/`.

## Not in v1

Branches, PRs, real-time notifications, agent-to-agent direct messaging, a hosted UI, identity verification beyond git config, billing. See [`docs/product-plan.md`](docs/product-plan.md).

## Status

Bootstrapping. First trial: a small dogfood project (TBD) before we point bigger things at it.

## License

MIT.

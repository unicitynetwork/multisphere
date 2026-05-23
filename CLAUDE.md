# Claude Code instructions — Multisphere repo

You are working on the source of [Multisphere](README.md): a Claude Code plugin that ships the `a2a` skill (agent-to-agent drop-board protocol) and the `multisphere-mcp` MCP server. **This is not a multisphere workspace itself** — the layout here does not have `journal.md`, `inbox.md`, etc. Don't apply the `a2a` protocol to this repo.

## Two distribution paths, one server

Multisphere ships in two installable shapes from the same source:

1. **Claude Code plugin** — `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` + `.mcp.json`. Installed via `/plugin install multisphere@multisphere`. Bundles the skill AND boots the MCP server.
2. **MCPB bundle** — `manifest.json` at repo root, packed by `scripts/build-mcpb.sh` into `.build/dist/multisphere-X.Y.Z.mcpb`. Installed by drag-drop in Cowork / Claude Desktop. Bundles ONLY the MCP server (MCPB doesn't carry skills). Identity flows through `user_config` → env vars.

Cowork is the real target for the Desktop form factor — vanilla Claude Desktop's sandbox is too tight for workspace clones to live on the user's disk where the user can also see them.

## Layout

- `.claude-plugin/plugin.json` — Claude Code plugin manifest. Owns identity (`name: "multisphere"`), version, description.
- `.claude-plugin/marketplace.json` — single-plugin marketplace pointing at `./`. This repo is its own marketplace.
- `.mcp.json` — Claude Code path: boots the MCP server via `node ${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js`. **Switch to `npx -y multisphere-mcp@latest` after publishing.**
- `manifest.json` — MCPB path. Declares the MCP server entry, `user_config` for `agent_id`/`agent_name`/`agent_email`, and platform-specific PATH overrides so `simple-git` can find the system `git` binary on macOS / Linux / Windows.
- `scripts/build-mcpb.sh` — builds the `.mcpb`. Stages, runs `npm ci --omit=dev` in the stage, then `npx @anthropic-ai/mcpb pack`.
- `skills/a2a/SKILL.md` — the protocol skill. Skill folder name = skill id (`a2a`). Plugin namespacing → `/multisphere:a2a`. The frontmatter `name:` field must match the folder. Only Claude Code consumes this; Cowork users paste it into project instructions manually.
- `mcp-server/` — TypeScript, Node 20+, builds to `dist/`. Entry: `src/index.ts`. Tools split into `workspace.ts`, `git-ops.ts`, `fs-ops.ts`, `protocol.ts`. Uses `simple-git` (system git binary) and `zod`. Identity comes from `MULTISPHERE_AGENT_ID/_NAME/_EMAIL` env vars (set by MCPB user_config) **or** `~/.multisphere/config.json` — env wins.
- `workspace-template/` — cloneable seed for a new workspace.
- `docs/` — concept, product, implementation plan, getting-started, protocol.

## Plugin format constraints

- Components (`skills/`, `commands/`, `agents/`, `hooks/`) MUST live at the plugin root. Only `plugin.json` belongs in `.claude-plugin/`. The marketplace.json also lives there because it's a manifest, not a component.
- `${CLAUDE_PLUGIN_ROOT}` is the only safe way to reference files inside the plugin from `.mcp.json`. Don't use relative paths or `__dirname`.
- The `.mcp.json` schema is identical to a top-level MCP config — `{ "mcpServers": { "<name>": { "command", "args", "env"? } } }`.

## Conventions

- All new code is TypeScript with `strict: true`. No `any` unless commented why.
- Tool handlers wrap their work in the `wrap()` helper in `src/index.ts` so errors come back as structured `{error}` payloads.
- File paths passed to filesystem/protocol tools are always relative to the active workspace root and run through `safeJoin` to prevent escape.
- The MCP server logs only to `stderr`. `stdout` is reserved for MCP framing.

## Git

- Remote: `s3remote` (S3-backed git remote). When ready for public distribution, mirror to GitHub at `unicity-labs/multisphere` — that's where the plugin marketplace will resolve from.
- Default branch: `main`.
- Don't push without being asked.
- Don't commit `mcp-server/dist/` to the **dev** branch — `.gitignore` excludes it. For plugin **distribution** we may need to ship built artifacts (until we publish `multisphere-mcp` to npm and switch `.mcp.json` to npx); revisit when we publish.

## Build and run

```bash
cd mcp-server
npm install
npm run build         # tsc → dist/
npm run dev           # tsx hot run
```

Test the plugin loads end-to-end:

```bash
claude --plugin-dir /Users/jamie/Code/multisphere
```

## When extending tools

If you add a new tool:

1. Implement it in the relevant module (`workspace.ts`, `git-ops.ts`, `fs-ops.ts`, `protocol.ts`).
2. Register it in `src/index.ts` with a `zod` schema and the `wrap()` wrapper.
3. Add a row to the tool table in `mcp-server/README.md`.
4. If it changes file-on-disk conventions, update `docs/protocol.md`.
5. If agents should call it, update `skills/a2a/SKILL.md`.

## When extending the skill

The skill is read at every session entry. Be ruthless about brevity — every line costs tokens for every agent every time. If you add a section, ask: does the agent need to read this every time, or is it reference material? Reference material goes in `references/` next to `SKILL.md` and is loaded on demand.

## When changing file formats

Journal entries, inbox items, and decision files have a contract that the protocol helpers and the skill both depend on. If you change a format:

1. Update the writer in `mcp-server/src/protocol.ts`.
2. Update the example in `skills/a2a/SKILL.md`.
3. Update the spec in `docs/protocol.md`.

All three or none.

# Claude Code instructions — Multisphere repo

You are working on the source of [Multisphere](README.md): a Claude Code plugin that ships the `a2a` skill (agent-to-agent drop-board protocol) and the `multisphere-mcp` MCP server. **This is not a multisphere workspace itself** — the layout here does not have `journal.md`, `inbox.md`, etc. Don't apply the `a2a` protocol to this repo.

## Layout

- `.claude-plugin/plugin.json` — plugin manifest. Owns identity (`name: "multisphere"`), version, description.
- `.claude-plugin/marketplace.json` — single-plugin marketplace pointing at `./`. This repo is its own marketplace.
- `.mcp.json` — bundles the MCP server. Currently uses `node ${CLAUDE_PLUGIN_ROOT}/mcp-server/dist/index.js`. **Switch to `npx -y multisphere-mcp@latest` after publishing the npm package.**
- `skills/a2a/SKILL.md` — the protocol skill. Skill folder name = skill id (`a2a`). Plugin namespacing makes the slash command `/multisphere:a2a`. The frontmatter `name:` field must match the folder.
- `mcp-server/` — TypeScript, Node 20+, builds to `dist/`. Entry: `src/index.ts`. Tool implementations split into `workspace.ts`, `git-ops.ts`, `fs-ops.ts`, `protocol.ts`. Uses `simple-git` for git, `zod` for schemas.
- `workspace-template/` — the cloneable seed for a new workspace. Treat the files as templates: changes here propagate to every new workspace anyone creates.
- `docs/` — concept, product, implementation plan (already written), plus `getting-started.md` and `protocol.md`. The first three are the spec; if you change behaviour, update the implementation plan too.

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

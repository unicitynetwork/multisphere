# Claude Code instructions — Multisphere repo

You are working on the source of [Multisphere](README.md): the MCP server, the skill, and the workspace template that make multiplayer agent workspaces work. **This is not a multisphere workspace itself** — the layout here does not have `journal.md`, `inbox.md`, etc. Don't apply the multisphere entry/exit protocol to this repo.

## Layout

- `mcp-server/` — TypeScript, Node 20+, builds to `dist/`. Entry: `src/index.ts`. Tool implementations split into `workspace.ts`, `git-ops.ts`, `fs-ops.ts`, `protocol.ts`. Use `simple-git` for git, `zod` for schemas.
- `workspace-template/` — the cloneable seed for a new workspace. Treat the files as templates: changes here propagate to every new workspace anyone creates.
- `skill/multisphere/SKILL.md` — the behavioural spec for agents inside a workspace. Edit carefully; this drives every other agent's behaviour.
- `docs/` — concept, product, implementation plan (already written), plus `getting-started.md` and `protocol.md`. The first three are the spec; if you change behaviour, update the implementation plan too.

## Conventions

- All new code is TypeScript with `strict: true`. No `any` unless commented why.
- Tool handlers wrap their work in the `wrap()` helper in `src/index.ts` so errors come back as structured `{error}` payloads.
- File paths passed to filesystem/protocol tools are always relative to the active workspace root and run through `safeJoin` to prevent escape.
- The MCP server logs only to `stderr`. `stdout` is reserved for MCP framing.

## What this repo's "git" looks like

- Remote: `s3remote` (S3-backed git remote).
- Default branch: `main`.
- Don't push without being asked.

## Build and run

```bash
cd mcp-server
npm install
npm run build         # tsc → dist/
npm run dev           # tsx hot run
```

To smoke-test the binary speaks MCP, pipe `initialize` over stdio (see `docs/getting-started.md`).

## When extending tools

If you add a new tool:

1. Implement it in the relevant module (`workspace.ts`, `git-ops.ts`, `fs-ops.ts`, `protocol.ts`).
2. Register it in `src/index.ts` with a `zod` schema and the `wrap()` wrapper.
3. Add a row to the tool table in `mcp-server/README.md`.
4. If it changes file-on-disk conventions, update `docs/protocol.md`.
5. If agents should call it, update `skill/multisphere/SKILL.md`.

## When extending the skill

The skill is read at every session entry. Be ruthless about brevity — every line costs tokens for every agent every time. If you add a section, ask: does the agent need to read this every time, or is it reference material?

## When changing file formats

Journal entries, inbox items, and decision files have a contract that the protocol helpers and the skill both depend on. If you change a format:

1. Update the writer in `mcp-server/src/protocol.ts`.
2. Update the example in `skill/multisphere/SKILL.md`.
3. Update the spec in `docs/protocol.md`.

All three or none.

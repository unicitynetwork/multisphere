# Claude Code instructions — Multisphere repo

You are working on the source of [Multisphere](README.md): a Claude Code plugin that ships the `a2a` skill (agent-to-agent drop-board protocol) and the `multisphere-mcp` MCP server. **This is not a multisphere workspace itself** — the layout here does not have `journal.md`, `inbox.md`, etc. Don't apply the `a2a` protocol to this repo.

## Distribution: one plugin, two clients

Multisphere ships as a **single plugin** that installs in both Claude Code and Cowork:

```text
/plugin marketplace add unicity-labs/multisphere
/plugin install multisphere@unicity-labs
```

The plugin format (`.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` + `.mcp.json`) is supported natively by both clients — see [claude.com/plugins](https://claude.com/plugins). The plugin bundles the `a2a` skill AND the `multisphere-mcp` server in one install. Marketplace name: `unicity-labs`. Plugin name: `multisphere`. Skill: `a2a` (invoked `/multisphere:a2a`).

**Fallback path** (`manifest.json` + `scripts/build-mcpb.sh`): a `.mcpb` bundle for MCP hosts that don't support the `/plugin` system. Carries only the MCP server. We keep this around but it's not the primary install path.

**End users never run `make`.** The Makefile is a developer convenience. User install is the plugin command above. The build script and Makefile produce artifacts for release uploads only.

## Layout

- `.claude-plugin/plugin.json` — plugin manifest. `name: "multisphere"`, version, description.
- `.claude-plugin/marketplace.json` — marketplace manifest. `name: "unicity-labs"` (publisher-level, can hold additional plugins later). Single plugin entry pointing at `./`.
- `.mcp.json` — bundled MCP server config. Server key is `workspace` (not `multisphere` — that doubled with the plugin name and produced ugly `plugin:multisphere:multisphere` displays). Spawns the server via `npx -y multisphere-mcp@latest` — the npm package is the source of truth, no local build needed. **No env block.** That means `MULTISPHERE_CLIENT` is NOT auto-set by the plugin (and can't be, since the same `.mcp.json` is read by both Claude Code and Cowork — there's no place to put a per-client value). See "Identity setup for users" below.
- `manifest.json` (root) — fallback MCPB manifest for non-plugin MCP hosts. Same MCP server, different install surface. `user_config` for agent identity, platform-specific PATH overrides so `simple-git` can find the system `git`. Sets `MULTISPHERE_CLIENT=cowork`. Not the primary install path now that Cowork supports plugins natively.
- `scripts/build-mcpb.sh` — builds the fallback `.mcpb`. Stages, `npm ci --omit=dev`, `npx @anthropic-ai/mcpb pack`. **Developer tool, not user-facing.**
- `skills/a2a/SKILL.md` — the protocol skill. Skill folder name = skill id (`a2a`). Plugin namespacing → `/multisphere:a2a`. Frontmatter `name:` must match the folder. Loaded by both Claude Code AND Cowork because both support the plugin format.
- `mcp-server/` — TypeScript, Node 20+, builds to `dist/`. Entry: `src/index.ts`. Tools split into `workspace.ts`, `git-ops.ts`, `fs-ops.ts`, `protocol.ts`. Uses `simple-git` (system git binary) and `zod`.
- `mcp-server/src/config.ts` — identity resolved by `resolveIdentity()`. Precedence: env vars → `~/.multisphere/identity.<MULTISPHERE_CLIENT>.json` → `~/.multisphere/identity.json` (with `user_slug` + client auto-derivation) → legacy `~/.multisphere/config.json`. Workspaces stored separately in `~/.multisphere/workspaces.json`. **`saveConfig()` never writes identity** — only workspaces. This prevents one client clobbering another's identity.
- `workspace-template/` — cloneable seed for a new workspace.
- `docs/` — concept, product, implementation plan, getting-started, protocol.
- `Makefile` — developer convenience. Never appears in user-facing install docs.

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

- Remotes: `origin` (`github.com:unicitynetwork/multisphere`, public) and `s3remote` (`s3://jvs-git-remote/multisphere`).
- Default branch: `main`.
- Don't push without being asked.
- `mcp-server/dist/` stays gitignored — the server is published to npm (`multisphere-mcp`) and the plugin's `.mcp.json` invokes it via `npx -y multisphere-mcp@latest`. No build artifacts in the repo.

## Identity setup for users

As of v0.1.2 the server auto-detects the calling client from the MCP `initialize` handshake's `clientInfo.name`. The detected name is normalized (`claude-ai` and `claude-desktop` both → `cowork`; `Claude Code N.x` → `claude-code`) and used as the fallback for `MULTISPHERE_CLIENT` when the env var isn't set.

**Cowork-hosted Claude Code disambiguation (v0.1.6):** Cowork hosts its own built-in Claude Code agent that sends the same `clientInfo.name = "claude-code"` over MCP as the bare CLI. The disambiguation signal lives in env vars Cowork sets when spawning plugin MCP servers:

- `CLAUDE_PLUGIN_ROOT` — contains `claude-hostloop-plugins` under Cowork's `$TMPDIR/claude-hostloop-plugins/<hash>/` staging dir
- `CLAUDE_PROJECT_DIR` and `cwd` — contain `local-agent-mode-sessions` under `~/Library/Application Support/Claude/local-agent-mode-sessions/…`

`isCoworkHostedEnvironment()` in `config.ts` checks any of those paths for `claude-hostloop-plugins` or `local-agent-mode-sessions`. If true AND the normalized client is `claude-code`, `setDetectedClient` promotes the result to `cowork`. Other client names are unaffected.

History: v0.1.3 tried surfacing `MULTISPHERE_CLIENT` as a user-editable env var in Cowork's connector UI — didn't work because Cowork masks all plugin-declared env vars and disallows editing. v0.1.4 tried `XPC_SERVICE_NAME` — didn't work because Cowork's plugin-MCP spawn context strips macOS XPC values (we saw `XPC_SERVICE_NAME=0` in the actual env dump, not the expected `claudefordesktop` value). v0.1.5 was a temporary diagnostic that wrote env to `~/.multisphere/server-debug.log` to discover the real signal. v0.1.6 uses the path-content signals we found from that dump. `MULTISPHERE_CLIENT` env still works as a manual override.

**Recommended user setup**: a single `~/.multisphere/identity.json`:

```json
{ "user_slug": "jamie", "agent_name": "Jamie", "agent_email": "jamie@unicity-labs.com" }
```

The server derives `jamie-claude-code` in Claude Code and `jamie-cowork` in Cowork. No env vars needed.

**Override paths** (in priority order):

1. `MULTISPHERE_AGENT_ID/_NAME/_EMAIL` env vars — full bypass.
2. `MULTISPHERE_CLIENT` env var — forces a particular client suffix regardless of what the handshake reported.
3. `~/.multisphere/identity.<client>.json` — per-client override file.
4. Legacy `~/.multisphere/config.json` — backward compat.

The protocol helpers (`journal_append`, `inbox_add`, `inbox_close`, `whats_new`) and `workspace_init` all call `assertIdentity` and throw with an actionable error if identity still can't be resolved (the error tells the user which client was detected and which files would satisfy it).

**Implementation:** `src/index.ts` wires `server.server.oninitialized` to capture `clientInfo.name` via `setDetectedClient()`. `src/config.ts` exports `normalizeClientName()` (idempotent slug + special-case map) and uses the detected client as a fallback in `resolveIdentity()`. The env var still beats the detected value.

## Releasing — version bumps matter

Plugin updates **do not** propagate to existing Cowork/Claude Code installs automatically when the plugin's git history changes. The plugin manager pins on the version in `.claude-plugin/plugin.json`. So when you change anything in the plugin (`.mcp.json`, skills, plugin.json itself, the workspace template):

1. Bump the patch version in `.claude-plugin/plugin.json` (e.g. `0.1.0` → `0.1.1`).
2. Commit + push.

Without that bump, users have to uninstall + reinstall the **whole marketplace** to pick up the change (jamie confirmed this empirically — uninstalling the single plugin isn't enough; the marketplace cache is also stale).

For changes to the **MCP server itself** (`mcp-server/src/**`):

1. Bump the version in `mcp-server/package.json`.
2. `cd mcp-server && npm run build && npm publish --otp=<code>`.
3. Existing installs pick up the new server on the next `npx -y multisphere-mcp@latest` resolution — no plugin-side action needed unless `.mcp.json` itself changed.

Practical: bump both versions in lockstep on most changes. Easier to reason about and keeps the surface consistent.

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

## experiments/swarm — single-user multi-agent orchestrator

`experiments/swarm/` is a separate pattern that sits on top of the a2a protocol — see its `README.md` for the full picture. Short version:

- The vanilla a2a protocol is for **multi-user, multi-agent** (each drop is made by an agent whose human asked for it). It explicitly bars an agent from acting on another's drop without authorisation.
- The swarm experiment handles the **single-user, multi-agent** case (one human, multiple specialist Claudes coordinating locally). It resolves the protocol tension by treating an **orchestrator** Claude Code session as the human-in-the-loop — when it dispatches a specialist via the `Task` tool, that dispatch *is* the authorisation.

It lives under `experiments/` deliberately. The production a2a protocol is unchanged.

Two launcher modes (`bash experiments/swarm/scripts/launch.sh`):

- **demo** — sandbox workspace + sandbox FastAPI target. For smoke-testing.
- **prod** — point at existing workspace + existing target repo. Adding `--retry-budget 10 --pivot-on-exhaustion` turns the same swarm into a bug-fixer (hypothesis-per-step roadmap with auto-pivot on dead ends). Fill-out template at `experiments/swarm/templates/bug-fix-task.md`.

User-level slash command at `~/.claude/commands/swarm.md` walks the user through constructing the launcher invocation — when extending this experiment, keep that command in sync so launching stays ergonomic.

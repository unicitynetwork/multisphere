# swarm — single-user multi-agent orchestration on top of multisphere

> **Status:** experimental. Lives under `experiments/` so the production a2a protocol stays unchanged.

## Problem

The vanilla multisphere a2a protocol is built for **multi-user, multi-agent**: every drop is made by an agent whose human told it to. Rule from `skills/a2a/SKILL.md`:

> Don't act on another agent's drop unless your user has explicitly asked you to.

But there's a second mode that happens locally: **single user, multiple specialist agents on the same machine**, with the human as conductor. Without an orchestrator, each handoff between specialists needs you to manually nudge the next agent — you end up talking to yourself through several agents. Tiresome.

This experiment raises the abstraction one level: an **orchestrator** Claude Code session dispatches specialist sub-agents (Architect, Implementer, Verifier) using Claude Code's `Task` tool, and is treated as the human-in-the-loop equivalent. When the orchestrator dispatches Implementer with "act on Architect's drop in `drafts/<feature>/step-1-design.md`," that satisfies the protocol's "human asked me to" rule — the orchestrator's prompt *is* the ask.

## Two modes

### `demo` — sandbox smoke-test

```bash
bash experiments/swarm/scripts/launch.sh demo
```

Creates a fresh workspace + fresh FastAPI target under `~/swarm-runs/demo-healthz-endpoint/`. Useful for proving the loop works before you point it at real code. The demo feature is "add a `/healthz` endpoint" — small, deterministic, hits all three roles.

### `prod` — real workspace + real codebase

```bash
bash experiments/swarm/scripts/launch.sh prod \
  --workspace ~/my-multisphere-workspace \
  --target ~/Code/some-real-repo \
  --task "add a webhook for class lifecycle changes; …"
```

or

```bash
bash experiments/swarm/scripts/launch.sh prod \
  --workspace ~/my-multisphere-workspace \
  --target ~/Code/some-real-repo \
  --spec research/webhook-2026-06-13.md     # path within the workspace
```

Doesn't touch the existing workspace or target except to:
- Persist `--task` (if used) as a research file in the workspace.
- Drop an `ARCH-NNN` inbox item addressed to the architect.
- Print the `/loop` command for you to paste into Claude Code.

The orchestrator and specialists then:
- Read the workspace's accumulated context (other humans' drops, journal history, prior decisions).
- Survey the target codebase to understand its idioms.
- Build the feature on a fresh `swarm/<feature>` branch in the target — never touching `main` directly.
- Iterate Architect → Implementer → Verifier through multiple steps until either PASS, MAX_ITERATIONS, or stuck-detection.

## Multi-step is the whole point

Real features aren't atomic. The architect produces a **roadmap** of 3–8 steps. Each step goes through Implementer → Verifier. The architect gets re-dispatched to design each next step **after** the previous one lands, so the design can adjust to reality.

State machine:

```
no roadmap                    → ARCHITECT (bootstrap: produce roadmap + design step 1)
step N has design, no impl    → IMPLEMENTER (fresh)
step N has impl, no verdict   → VERIFIER
step N verdict FAIL           → IMPLEMENTER (retry, with verdict path as context)
step N verdict PASS, more     → ARCHITECT (next-step: design step N+1)
step N verdict PASS, no more  → STOP success
iteration count ≥ MAX         → STOP gave-up
same step retried 3×          → STOP stuck
```

## Files in the workspace (per feature)

Each swarm run scopes its drops to a per-feature subfolder so it doesn't step on humans:

```
<workspace>/
├── inbox.md                       (existing — swarm appends ARCH/IMPL/VERIF items)
├── journal.md                     (existing — swarm appends signed entries)
├── research/
│   └── swarm-<feature>-*.md       (the persisted task, if --task was used)
├── drafts/<feature>/
│   ├── roadmap.md                 (architect's overall plan)
│   ├── step-1-design.md
│   ├── step-1-impl.md
│   ├── step-2-design.md
│   └── …
├── comments/<feature>/
│   ├── step-1-verdict.md
│   ├── step-1-verdict-attempt-2.md   (preserved on retry)
│   └── …
└── decisions/
    ├── <feature>-state.md            (orchestrator's tick state)
    └── <feature>-outcome.md          (written at stop)
```

## Files in the target

```
<target>/
└── (swarm/<feature> branch, created from HEAD on first impl dispatch)
    ↑ all swarm commits land here. main / develop untouched.
```

## Identity

The MCP server signs every journal entry and commit with the configured identity (`<user>-<client>`). Task subagents inherit the orchestrator's identity, so for this experiment everything signs as the same id (e.g. `jamie-swarm`). Each journal entry begins with `[ARCHITECT]` / `[IMPLEMENTER]` / `[VERIFIER]` / `[ORCHESTRATOR]` so roles stay traceable inside a single signature.

## Files

```
experiments/swarm/
├── README.md                 you're reading it
├── orchestrator/
│   └── prompt.md             the per-iteration orchestrator prompt
├── roles/
│   ├── architect.md          rich context-gathering + roadmap + per-step design
│   ├── implementer.md        branch handling + design-faithful implementation
│   └── verifier.md           autonomous test/lint command discovery
├── scripts/
│   └── launch.sh             demo + prod modes
└── demo/
    ├── README.md
    ├── feature-spec.md       the canned "/healthz" ask
    └── target/               throwaway FastAPI app template
```

## Bug-fix mode (same swarm, different prompt)

The same Architect / Implementer / Verifier loop runs bug fixes when launched with two extra flags:

```bash
bash experiments/swarm/scripts/launch.sh prod \
  --workspace ~/ws \
  --target ~/Code/some-app \
  --task "$(cat experiments/swarm/templates/bug-fix-task.md)" \
  --retry-budget 10 \
  --pivot-on-exhaustion
```

Two mechanics turn this into a bug-fixer:

- **`--retry-budget 10`** — each step gets up to 10 implementer/verifier retries before the orchestrator considers its approach exhausted (default for feature builds is `3`).
- **`--pivot-on-exhaustion`** — when budget is hit, the orchestrator marks the step's approach dead (writes `comments/<feature>/step-<N>-exhausted.md`) and re-dispatches ARCHITECT in `next-step` mode to design the next hypothesis. Without this flag (the default), exhaustion still triggers `STOP stuck`.

The architect, primed by the task template, structures the bootstrap roadmap as:

- **Step 1** — write a failing repro test (Playwright for UI, pytest for backend).
- **Steps 2..N+1** — one hypothesis per step, ranked by evidence.
- **Final step** — full suite + lint + typecheck + `gh pr create`.

The "don't dig deeper into the wrong branch" rule (per global CLAUDE.md) is enforced by the orchestrator's pivot mechanic: a hypothesis that doesn't converge in 10 attempts is dead, and the next iteration designs around it rather than digging further.

Fill in `experiments/swarm/templates/bug-fix-task.md` and pass it via `--task`.

## Out of scope (for this experiment)

- **Reviewer role / automatic PR.** When PASS, the swarm leaves the `swarm/<feature>` branch local. You `gh pr create` yourself or add Reviewer later.
- **Mid-swarm reactions to humans editing the workspace.** Pull-retry handles small races; reactive replanning is future work.
- **Inbox-ID kickoff mode.** Today, the launcher drops the inbox item. A future mode where the orchestrator picks up *any* existing `ARCH-NNN` would be straightforward.
- **Parallelism within a step.** Strict serial Architect → Implementer → Verifier per step.

## Why this isn't in the main protocol

The vanilla protocol is the right shape for cross-machine async coordination. This pattern is local-only — one machine, one human, one Claude Code session. Treating it as an "experiment" keeps the boundary visible. If we want to formalise it later, it gets its own skill (`a2a-swarm` or similar) and lives next to a2a, not on top of it.

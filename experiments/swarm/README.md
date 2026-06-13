# swarm — single-user multi-agent orchestration on top of multisphere

> **Status:** experimental. Lives under `experiments/` so the production a2a protocol stays unchanged. If this proves out, we may promote it.

## Problem

The vanilla multisphere a2a protocol is built for **multi-user, multi-agent** — every drop is made by an agent whose human told it to. Rule from `skills/a2a/SKILL.md`:

> Don't act on another agent's drop unless your user has explicitly asked you to.

But there's a second mode: **single user, multiple agents on the same machine**, with the human as conductor. Multisphere's normal rule means each handoff needs you to manually nudge the next agent — you end up talking to yourself through several agents. Tiresome.

This experiment raises the abstraction one level: an **orchestrator** Claude Code session dispatches specialist sub-agents (architect, implementer, verifier) using Claude Code's `Task` tool, and is treated as the human-in-the-loop equivalent. When the orchestrator dispatches Implementer with "act on Architect's drop in `drafts/foo.md`," that satisfies the protocol's "human asked me to" rule — the orchestrator's prompt *is* the ask.

## Architecture

```
ORCHESTRATOR (your Claude Code session, running under /loop)
  │  Initial: paste the prompt + a feature spec
  │
  │  Each /loop tick (one iteration):
  │    1. pull workspace
  │    2. whats_new + read inbox + journal tail
  │    3. inspect state → decide next role OR stop
  │    4. dispatch the role via Task tool (one specialist, blocking)
  │    5. ScheduleWakeup for next iteration (or terminate)
  │
  ├─► ARCHITECT (Task subagent, one-shot)
  │     reads inbox+target → writes drafts/<feature>.md + decisions/
  │     → journal_append → commit, push
  │
  ├─► IMPLEMENTER (Task subagent, one-shot)
  │     reads architect's drop → writes code in target repo
  │     + drafts/impl-<feature>.md → commits both repos
  │
  └─► VERIFIER (Task subagent, one-shot)
        runs make test/lint in target → comments/verdict-<feature>.md
        → if FAIL, orchestrator re-dispatches IMPLEMENTER on next tick
        → if PASS, orchestrator stops
```

Two git repos:

- **Workspace** — multisphere drop-board. Coordination metadata only (`drafts/`, `decisions/`, `comments/`, `journal.md`, `inbox.md`).
- **Target** — the codebase being changed. Where the actual code lives.

Specialists touch both. The orchestrator never edits code directly.

## Stopping conditions

The orchestrator stops when **any** of:

1. `comments/verdict-<feature>.md` declares `PASS` and the inbox has no open items.
2. Iteration count reaches `MAX_ITERATIONS` (default `10`).
3. The orchestrator detects a stuck loop (same role dispatched 3× in a row with no progress).

On stop, the orchestrator writes a final `journal.md` summary and a `decisions/<feature>-outcome.md` recording PASS / FAIL / GAVE-UP.

## Files

```
experiments/swarm/
├── README.md                 # you're reading it
├── orchestrator/
│   └── prompt.md             # the per-iteration orchestrator prompt
├── roles/
│   ├── architect.md          # prompt for ARCHITECT Task subagents
│   ├── implementer.md        # prompt for IMPLEMENTER Task subagents
│   └── verifier.md           # prompt for VERIFIER Task subagents
├── scripts/
│   └── launch.sh             # initialise workspace + target, print the run command
└── demo/
    ├── README.md             # what the demo feature is
    ├── feature-spec.md       # the spec fed to the architect
    └── target/               # template for the FastAPI throwaway target
        ├── pyproject.toml
        ├── Makefile
        ├── app/...
        └── tests/...
```

## Running the demo

```bash
bash experiments/swarm/scripts/launch.sh
# follow the printed instructions to open Claude Code and paste the orchestrator prompt
```

See `demo/README.md` for the canned feature ask (add a `/healthz` endpoint to a FastAPI app).

## Identity convention

The MCP server signs every journal/commit with the configured identity (`<user>-<client>`). Task subagents inherit the orchestrator's identity, so for this experiment everything signs as the same id (e.g. `jamie-swarm`). Each journal entry begins with `[ARCHITECT]` / `[IMPLEMENTER]` / `[VERIFIER]` / `[ORCHESTRATOR]` so roles stay traceable inside a single signature.

## Why this isn't in the main protocol

The vanilla protocol is the right shape for cross-machine async coordination. This pattern is local-only — one machine, one human, one tab in Claude Code. Treating it as an "experiment" keeps the boundary visible. If we want to formalise it later, it gets its own skill (`a2a-swarm` or similar) and lives next to a2a, not on top of it.

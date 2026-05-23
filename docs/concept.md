# Multisphere — Concept

Single-player agents are done. Every chatbot has MCP now. The next move is multiplayer.

Multisphere is the name. Ships as a Claude Code plugin (and as a Claude Desktop MCPB bundle, eventually) that bundles two things: an MCP server (`multisphere-mcp`) that owns your local clone of a shared workspace, and a skill (`a2a` — agent-to-agent) that teaches your agent the drop-board protocol.

## The idea

My agent works for me. Your agent works for you. They share a space — a drop-board — where work product lands. Not chat. Not call-and-response. Drops.

I dump research. You dump a draft. Mike's agent picks up the draft tonight and leaves notes. Tomorrow morning my agent reads the notes and updates the deck. We each stay in charge of our own agent. Nothing happens unless a human points an agent at the board.

The point is asynchronous coordination, not a group chat for robots. Group chats for robots are a token nightmare and a hallucination nightmare. Otto tried multi-user-single-agent and the LLM-side problem is hard. Multi-user-multi-agent through shared artifacts is simpler and more honest about what LLMs are good at.

## Why this matters

Nobody's done it well. Personal agents are everywhere — single user, single thread, single context. The barrier we haven't crossed is that my agent doesn't do anything *with* anyone else's agent.

It's also where the viral loop lives. A solo agent gets used. A multiplayer agent gets shared. That's the growth path Open Claw never had.

## First use case — pitch-deck collaboration

Four people working on the same deck. Each with their own folder, their own agent, their own context. The shared drop-board is a GitHub repo with `research/`, `drafts/`, `comments/`, `decisions/`.

A run looks like this. I tell my agent: find five comparable raises last quarter, drop a summary in `research/`. It runs. The file lands in the repo. Mike opens his agent later — "anything new in the deck workspace?" It checks the repo, reads my drop, builds a slide, commits. Matt comes back from a flight and his agent gives him a one-line readout: two new research drops, one new draft, nothing waiting on him.

No agent talks to another agent. Agents read each other's outputs. Humans stay in the loop on what triggers what.

This is also the next deck we're actually going to build. SIF. Eat our own dog food.

## Design principles

Drops, not chats. Information moves through artifacts in a shared space. No live conversation between agents.

No runaway loops. If we ever do let an agent call another, hard turn limit. Gemini CLI uses 50. We start at 5.

Privacy by container. My agent's soul file stays with me. The shared space gets only what I drop in it. The agent never volunteers personal context to the group.

Human triggers, agent acts. Agents don't wake themselves up. The drop-board doesn't poke anyone — you ask your agent, or it runs on your schedule.

Git is the sync layer. The workspace is a git repo. Agents pull from main, push to main. No branches in v1 — we'll add them when team size or contention demands it. Source control gives us audit and concurrency for free; we don't build them.

Log every move. Every agent that touches the workspace reads the journal first and writes to it last. Not optional. See below.

## The journal — non-optional

The workspace has two files at the root that every agent must touch on every session.

`journal.md` is the audit trail. Append-only. Every entry is signed and timestamped. An entry says what the agent did, what it tried, what it failed at, and what it's leaving open. Example:

```
## 2026-05-22 14:30 — jamie-claude-code (Jamie)
Pulled latest research drops. Built draft v2 of slides 4–7.
Couldn't find the 2024 comp data — left a TODO in inbox.
```

Agent id format is `<user>-<client>`. The MCP server signs every journal entry and every commit with it.

`inbox.md` is the live queue. Open questions, requests to specific agents, anything still hanging. Anyone can add. Anyone can claim. When an item closes, the closing agent strikes it and points back to the journal entry that resolved it.

The protocol every agent follows, every time:

1. Read `inbox.md`. See what's open.
2. Read the tail of `journal.md`. See what just happened.
3. Do the work.
4. Write a journal entry. Update the inbox if needed.

This is enforced by the skill file. It's the first thing the agent reads when it enters the workspace, and the last thing it does before leaving. Without this, four agents on one repo overwrite each other quietly. With it, every move leaves a trace and every open thread is visible.

## Minimal MVP — three pieces, one install

1. **A shared git repo.** Each user has a local clone — the folder workspace on disk. The remote (GitHub or anywhere) is where everyone meets. The workspace has an opinionated layout — see below. Markdown for anything that isn't a binary asset. Commit author tells you which agent produced what.

2. **An MCP server (`multisphere-mcp`).** Runs locally, wraps git. The agent never has to shell out. It exposes the git operations an agent needs to live in a repo: `status`, `fetch`, `pull`, `diff`, `log`, `add`, `commit`, `push`. Plus filesystem helpers on the local clone — `read`, `write`, `list`, `search`. Plus protocol helpers — `journal_append`, `inbox_add`, `inbox_close`, `whats_new` — so agents don't hand-format markdown and don't have to figure out what changed since their last visit. Same workspace, same git, every client treated equally. Branch and PR operations land in v2 when we need them.

3. **A skill (`a2a`).** Three things in it. First, the git playbook — fetch and pull on entry, commit with a clear message, push to main, what to do if a pull surfaces conflicts. Second, the metadata conventions — what belongs in `journal.md`, what belongs in `inbox.md`, the format of an entry, when to add, when to close. Third, the workspace layout — what goes in each folder and what doesn't. Behavioural rules sit on top of all of that: don't act on someone else's drop unless your user asks, don't volunteer personal context to the group.

The whole bundle ships as one plugin. In Claude Code: `/plugin install multisphere@multisphere` and you're done — the MCP server boots, the skill activates, the slash command `/multisphere:a2a` is yours. Claude Desktop gets the same payload via an MCPB bundle (different format, same contents). Cowork and anything else without first-class plugin support gets the manual JSON-config path — same server, same skill, just wired by hand.

## Workspace layout

Opinionated. Every multisphere workspace looks like this so any agent that's seen one knows its way around any other.

```
.
├── README.md          # what this workspace is, who's in it
├── journal.md         # append-only audit trail
├── inbox.md           # open questions and tasks
├── research/          # gathered info, findings, references
├── drafts/            # work in progress
├── comments/          # notes and feedback on specific items
├── decisions/         # durable choices, ADR-style
├── assets/            # binaries, images, PDFs
└── .pointers/         # per-agent last-read state (managed by the server)
```

`README.md` is the workspace's introduction — what we're building, who's involved, anything an arriving agent needs to know.

`research/` is read-mostly after creation. Background material, market data, references, summaries of things found elsewhere.

`drafts/` is the live work — the deck in progress, the doc being written, the spec being argued over. Things get overwritten in place. Source control tracks history.

`comments/` is feedback against specific drafts or research items. Short, dated, signed.

`decisions/` is for choices we want to find again. One file per decision. Title, date, what was decided, why, who agreed. ADR-shaped.

`assets/` is for binaries — images, PDFs, anything that isn't readable markdown.

`.pointers/` is one JSON file per agent id, tracking the sha that agent last saw. `whats_new` reads it on entry and updates it on exit. Committed to the repo so the same agent can move between clients without losing its place.

Plug Claude Code, Claude Desktop, or Cowork into it. Try it on SIF. Four of us, one repo, four agents.

## Open questions

Do we need any agent-to-agent at all, or is the drop-board enough? My bet — enough.

~~How does an agent know what's new since its last visit?~~ Solved. Per-agent JSON pointers under `.pointers/`, diffed against current HEAD by the `whats_new` tool.

How portable is the MCP server across sandbox profiles? Claude Code runs it fine; Claude Desktop's child-process sandbox is looser than Code's but still has a minimal PATH and may not expose system `git` cleanly. Open question whether we keep `simple-git` (system binary) or move to `isomorphic-git` (pure JS, zero external dependency) before public release.

When does this get a real home in Sphere — UI, registry, billing, the rest? Later. Prove the loop first.

## Status

Repo stood up. MCP server written and smoke-tested (20 tools across workspace, git, fs, and protocol). Skill written and namespaced as `/multisphere:a2a`. Workspace template seeded. Claude Code plugin manifest in place; MCPB bundle for Claude Desktop pending.

## Next step

Run it on SIF this week. Four of us, one repo, four agents.

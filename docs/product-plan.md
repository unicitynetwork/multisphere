# Multiplayer Agents — Product Plan

See `concept.md` for the underlying idea. This document is the product brief that the implementation plan builds against.

## Problem

Personal agents are everywhere — single user, single thread, single context. The barrier we haven't crossed is that my agent doesn't coordinate with anyone else's agent. Group chats for robots are a token nightmare and a hallucination nightmare. Nobody has nailed the multiplayer paradigm.

## Bet

Asynchronous coordination through a shared git workspace. Source control is the sync layer. Markdown is the content. A skill file is the protocol. Agents drop work product into a shared space and read each other's outputs on their own schedule — they don't talk to each other.

## Users

Small teams of two to eight people working on a shared deliverable. Each person uses their own agent in their own client. Clients can be a mix — Claude Code, Claude Desktop, Cowork. Some have bash, some don't. They all join the same workspace through the MCP server.

## First use case — the SIF pitch deck

Four people building one deck. Each with their own folder, their own agent, their own context. The shared workspace is a git repo with the conventional layout.

A working session:

- Jamie's agent finds five comparable raises last quarter, drops a summary in `research/`, appends a journal entry, pushes.
- Mike's agent pulls the next morning, reads the journal, sees the new research, builds a slide from it into `drafts/`, journals, pushes.
- Matt's agent comes back from a flight and his first action is `whats_new()` — it returns "two new research drops, one new draft, no items in inbox for you."
- Risto's agent finds a fact wrong in Mike's draft, drops a note in `comments/`, adds an inbox item for `@mike-claude-desktop`, journals, pushes.

No agent talks to another agent. Agents read each other's outputs through the repo. Humans stay in the loop on what triggers what.

## What success looks like

- Four of us run the SIF deck for two weeks entirely through the multiplayer workspace.
- Every meaningful action leaves a journal entry. We can reconstruct the project from `journal.md` alone.
- The final deck is at least as good as the manual baseline.
- We can demo a 30-second loop end-to-end: one agent drops research, another picks it up, builds a slide, a third reviews.
- At least one client other than Claude Code joins the workspace successfully — Cowork or Claude Desktop.

## In scope for v1

- A shared git repo with the opinionated workspace layout from `concept.md`.
- A local MCP server that wraps git, filesystem, and the protocol helpers.
- A skill file that teaches the agent the git playbook, the metadata conventions, and the layout.
- Three clients supported: Claude Code, Claude Desktop, Cowork.
- Push and pull against `main` only. No branches.

## Out of scope for v1

- Branches, PRs, code review workflows.
- Real-time notifications or subscriptions.
- Agent-to-agent direct messaging.
- Sphere UI for spinning up or joining workspaces.
- Identity, billing, credits.
- Hosted workspace as a service.
- A registry of capsules or skills tied to multiplayer workspaces.

## V2 candidates

- Branches when team size or contention demands it.
- Agent identity registry with signed commits.
- Sphere UI to create and join workspaces.
- Notifications when something lands.
- Other use cases — dev team coordination, crypto gem hunting, family teams.

## Constraints

- Token budget. Agents read the journal tail and inbox on every entry. The protocol must cap how much they read so a long-running workspace doesn't bankrupt anyone.
- Privacy. Personal context stays out of the workspace. The agent's soul file is not shared.
- Reliability. Git conflicts surface to humans. Nothing is silently merged.
- Client variety. Cowork and Claude Desktop have no shell. Every workspace action must be reachable through MCP tools.

## Success metrics (informal, v1)

- All four collaborators complete one full working day each through the workspace.
- Less than 10% of journal entries are obviously malformed (missing summary, missing TODOs that should be there, etc.).
- Zero silent overwrites — every concurrent edit is either auto-merged cleanly by git or surfaces to a human.

## Open product questions

- Where does the per-agent last-read pointer live — in the repo or local to the client?
- How loose is "everyone pushes to main"? Any pre-commit checks at all in v1?
- Is the agent ID convention `<user>-<client>` enough, or do we need a real identity layer earlier?
- How do we keep the journal tail bounded — rolling cap, archive after N entries, or let it grow?
- What's the right way to handle binary assets? `assets/` is a folder but git isn't great at diffing PNGs.

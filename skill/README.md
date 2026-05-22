# Multisphere skill

The protocol file that teaches an agent how to behave inside a multisphere workspace. Install it into your client and any agent session in this client will follow the protocol whenever you open a multisphere workspace.

## What's in here

```
skill/
└── multisphere/
    └── SKILL.md
```

The frontmatter in `SKILL.md` is what tells your client when to invoke the skill.

## Install (Claude Code)

User-level (recommended — applies to all projects):

```bash
mkdir -p ~/.claude/skills
cp -r skill/multisphere ~/.claude/skills/multisphere
```

Or symlink from this repo so updates propagate:

```bash
mkdir -p ~/.claude/skills
ln -s "$(pwd)/skill/multisphere" ~/.claude/skills/multisphere
```

Project-level (this workspace only):

```bash
mkdir -p .claude/skills
cp -r path/to/multisphere/skill/multisphere .claude/skills/multisphere
```

## Install (Claude Desktop)

Skill support in Claude Desktop is evolving. The simplest interop today is to make sure the **MCP server is configured** (see `mcp-server/README.md`) and to paste the contents of `SKILL.md` into a project instructions block, or attach it as a project file. The MCP tools work either way; the skill is the behaviour spec.

## Install (Cowork and other clients)

Cowork and other clients without first-class skill support: paste the contents of `SKILL.md` into the system prompt, project, or persistent memory of the agent. The MCP server is the same.

## Verify

In a Claude Code session inside a multisphere workspace, ask the agent: *"what's new in this workspace?"* If the skill is loaded and the MCP server is running, the agent should call `pull` → `whats_new` → read `inbox.md` and the tail of `journal.md` before answering.

## Pairing with the MCP server

The skill assumes the tools listed in `mcp-server/README.md` are available. If they aren't, the skill will tell the user to install `multisphere-mcp`.

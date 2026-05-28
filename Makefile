# Multisphere — multiplayer agents over a shared git workspace.
# Run `make` (or `make help`) to see all available targets.

SHELL := /bin/bash
ROOT := $(shell pwd)
MCP_SERVER_DIR := mcp-server
SKILLS_DIR := skills
SKILL_NAME := a2a
PLUGIN_NAME := multisphere
CLAUDE_USER_SKILLS := $(HOME)/.claude/skills
VERSION := $(shell node -p "require('./mcp-server/package.json').version" 2>/dev/null || echo "0.0.0")
MCPB_OUT := .build/dist/$(PLUGIN_NAME)-$(VERSION).mcpb

.DEFAULT_GOAL := help

.PHONY: help \
        install build dev rebuild clean \
        test smoke typecheck validate \
        claude-code install-skill uninstall-skill \
        mcpb mcpb-open \
        new-workspace \
        version publish-npm \
        all

# --- Help ---

help:
	@echo "Multisphere — multiplayer agents over a shared git workspace."
	@echo "Version: $(VERSION)"
	@echo ""
	@echo "  Development:"
	@echo "    install              - Install MCP server dependencies"
	@echo "    build                - Build MCP server (tsc -> mcp-server/dist/)"
	@echo "    dev                  - Run MCP server in watch mode (tsx)"
	@echo "    rebuild              - Clean, install, build"
	@echo "    clean                - Remove node_modules, dist/, .build/"
	@echo ""
	@echo "  Quality:"
	@echo "    test                 - End-to-end test of all MCP tools"
	@echo "    smoke                - Quick MCP stdio protocol smoke test"
	@echo "    typecheck            - tsc --noEmit (no JS output)"
	@echo "    validate             - Validate all JSON manifests"
	@echo "    all                  - validate + typecheck + test + mcpb"
	@echo ""
	@echo "  Install (Claude Code → plugin):"
	@echo "    claude-code          - Launch Claude Code with this plugin loaded"
	@echo "    install-skill        - Symlink the a2a skill into ~/.claude/skills/"
	@echo "    uninstall-skill      - Remove the symlinked skill"
	@echo ""
	@echo "  Install (Cowork → MCPB bundle):"
	@echo "    mcpb                 - Build $(MCPB_OUT)"
	@echo "    mcpb-open            - Build .mcpb and open it (triggers Cowork install)"
	@echo ""
	@echo "  Workspace bootstrap:"
	@echo "    new-workspace WORKSPACE_DIR=<path>"
	@echo "                         - Seed a new workspace at <path> from workspace-template/"
	@echo ""
	@echo "  Releasing:"
	@echo "    version              - Print current version"
	@echo "    publish-npm          - Publish multisphere-mcp to npm (asks confirmation)"

# --- Development ---

install:
	@echo "==> Installing MCP server dependencies"
	@cd $(MCP_SERVER_DIR) && npm install

build:
	@echo "==> Building MCP server"
	@cd $(MCP_SERVER_DIR) && npm run build

dev:
	@cd $(MCP_SERVER_DIR) && npm run dev

rebuild: clean install build

clean:
	@echo "==> Cleaning"
	@rm -rf $(MCP_SERVER_DIR)/node_modules $(MCP_SERVER_DIR)/dist .build
	@find /tmp -maxdepth 1 -name 'multisphere-e2e-*' -exec rm -rf {} + 2>/dev/null || true
	@echo "  ✓ Done"

# --- Quality ---

typecheck:
	@echo "==> Type-checking"
	@cd $(MCP_SERVER_DIR) && npx tsc --noEmit

validate:
	@echo "==> Validating manifests"
	@node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/plugin.json'))" && echo "  ✓ .claude-plugin/plugin.json"
	@node -e "JSON.parse(require('fs').readFileSync('.claude-plugin/marketplace.json'))" && echo "  ✓ .claude-plugin/marketplace.json"
	@node -e "JSON.parse(require('fs').readFileSync('mcpb/manifest.json'))" && echo "  ✓ mcpb/manifest.json"
	@node -e "const m=JSON.parse(require('fs').readFileSync('mcpb/manifest.json'));if(m.manifest_version!=='0.3')throw new Error('manifest_version must be 0.3, got '+m.manifest_version)" && echo "  ✓ manifest_version is 0.3"
	@head -1 $(SKILLS_DIR)/$(SKILL_NAME)/SKILL.md | grep -q '^---$$' && echo "  ✓ skill has frontmatter" || (echo "  ✗ skill missing frontmatter"; exit 1)

smoke:
	@if [ ! -f $(MCP_SERVER_DIR)/dist/index.js ]; then $(MAKE) --no-print-directory build; fi
	@echo "==> MCP stdio smoke test"
	@COUNT=$$( ( printf '%s\n' \
		'{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"make-smoke","version":"0.0.0"}}}' \
		'{"jsonrpc":"2.0","method":"notifications/initialized"}' \
		'{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; \
		sleep 1 ) | node $(MCP_SERVER_DIR)/dist/index.js 2>/dev/null \
		| grep -o '"name":"[a-z_]*"' | grep -v '"name":"$(PLUGIN_NAME)"' | wc -l | tr -d ' ' ); \
	if [ "$$COUNT" = "20" ]; then \
		echo "  ✓ server responded with 20 tools"; \
	else \
		echo "  ✗ expected 20 tools, got $$COUNT"; exit 1; \
	fi

test:
	@if [ ! -f $(MCP_SERVER_DIR)/dist/index.js ]; then $(MAKE) --no-print-directory build; fi
	@echo "==> Running end-to-end test"
	@node scripts/test-e2e.mjs

all: validate typecheck test mcpb
	@echo ""
	@echo "✅ Everything green."

# --- Claude Code install path ---

claude-code:
	@if ! command -v claude >/dev/null 2>&1; then \
		echo "  ✗ 'claude' CLI not found on PATH"; exit 1; \
	fi
	@if [ ! -f $(MCP_SERVER_DIR)/dist/index.js ]; then $(MAKE) --no-print-directory build; fi
	@echo "==> Launching Claude Code with multisphere plugin loaded (one-shot, from $(ROOT), perms skipped)"
	@claude --plugin-dir "$(ROOT)" --dangerously-skip-permissions

install-skill:
	@mkdir -p $(CLAUDE_USER_SKILLS)
	@if [ -L $(CLAUDE_USER_SKILLS)/$(SKILL_NAME) ]; then \
		echo "  ⚠ already symlinked at $(CLAUDE_USER_SKILLS)/$(SKILL_NAME) — replacing"; \
		rm $(CLAUDE_USER_SKILLS)/$(SKILL_NAME); \
	elif [ -e $(CLAUDE_USER_SKILLS)/$(SKILL_NAME) ]; then \
		echo "  ✗ $(CLAUDE_USER_SKILLS)/$(SKILL_NAME) exists and is not a symlink"; \
		echo "    Remove it manually if you want to replace it."; exit 1; \
	fi
	@ln -s "$(ROOT)/$(SKILLS_DIR)/$(SKILL_NAME)" "$(CLAUDE_USER_SKILLS)/$(SKILL_NAME)"
	@echo "  ✓ Linked $(SKILLS_DIR)/$(SKILL_NAME) → $(CLAUDE_USER_SKILLS)/$(SKILL_NAME)"

uninstall-skill:
	@if [ -L $(CLAUDE_USER_SKILLS)/$(SKILL_NAME) ]; then \
		rm $(CLAUDE_USER_SKILLS)/$(SKILL_NAME); \
		echo "  ✓ Removed symlink"; \
	elif [ -e $(CLAUDE_USER_SKILLS)/$(SKILL_NAME) ]; then \
		echo "  ✗ $(CLAUDE_USER_SKILLS)/$(SKILL_NAME) is not a symlink — refusing to delete"; exit 1; \
	else \
		echo "  Nothing to remove."; \
	fi

# --- Cowork / MCPB install path ---

mcpb:
	@./scripts/build-mcpb.sh

mcpb-open: mcpb
	@echo "==> Opening $(MCPB_OUT)"
	@if [ "$$(uname)" = "Darwin" ]; then \
		open "$(MCPB_OUT)"; \
	elif [ "$$(uname)" = "Linux" ]; then \
		xdg-open "$(MCPB_OUT)"; \
	else \
		echo "  (open the file manually: $(MCPB_OUT))"; \
	fi

# --- Workspace bootstrap ---

new-workspace:
	@if [ -z "$(WORKSPACE_DIR)" ]; then \
		echo "Usage: make new-workspace WORKSPACE_DIR=/path/to/new/workspace"; \
		exit 1; \
	fi
	@if [ -e "$(WORKSPACE_DIR)" ]; then \
		echo "  ✗ $(WORKSPACE_DIR) already exists"; exit 1; \
	fi
	@echo "==> Seeding workspace at $(WORKSPACE_DIR)"
	@cp -R workspace-template "$(WORKSPACE_DIR)"
	@cd "$(WORKSPACE_DIR)" && \
		git init -b main >/dev/null && \
		git add -A && \
		git -c user.email=multisphere@local -c user.name=multisphere commit -m "[init] empty multisphere workspace" >/dev/null
	@echo "  ✓ Workspace seeded"
	@echo ""
	@echo "  Next steps:"
	@echo "    cd $(WORKSPACE_DIR)"
	@echo "    git remote add origin <your-remote>"
	@echo "    git push -u origin main"

# --- Releasing ---

version:
	@echo $(VERSION)

publish-npm:
	@echo "==> About to publish multisphere-mcp@$(VERSION) to npm"
	@echo "    From: $(MCP_SERVER_DIR)"
	@read -p "    Continue? (y/N) " ans && [ "$$ans" = "y" ] || { echo "    Aborted."; exit 1; }
	@cd $(MCP_SERVER_DIR) && npm publish --access public
	@echo "  ✓ Published"

#!/usr/bin/env bash
# Launch a swarm: initialise a clean workspace + target repo from the demo
# template, print the orchestrator prompt to paste into Claude Code.
#
# Usage:
#   bash experiments/swarm/scripts/launch.sh [<feature-slug>]
#
# Defaults:
#   feature-slug:    healthz-endpoint
#   workspace path:  ~/swarm-runs/<feature>/workspace
#   target path:     ~/swarm-runs/<feature>/target

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SWARM_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SWARM_ROOT}/../.." && pwd)"

FEATURE="${1:-healthz-endpoint}"
RUNS_DIR="${SWARM_RUNS_DIR:-${HOME}/swarm-runs}"
RUN_DIR="${RUNS_DIR}/${FEATURE}"
WORKSPACE="${RUN_DIR}/workspace"
TARGET="${RUN_DIR}/target"
MAX_ITERATIONS="${MAX_ITERATIONS:-10}"

if [ -e "${RUN_DIR}" ]; then
    echo "ERROR: ${RUN_DIR} already exists. Remove it or pick a different feature slug." >&2
    exit 1
fi

echo
echo "============================================================"
echo "  swarm launch — ${FEATURE}"
echo "============================================================"
echo "  workspace : ${WORKSPACE}"
echo "  target    : ${TARGET}"
echo "  max iter  : ${MAX_ITERATIONS}"
echo "============================================================"
echo

mkdir -p "${RUN_DIR}"

# 1. Workspace from multisphere's workspace-template
echo "→ cloning workspace template"
cp -R "${REPO_ROOT}/workspace-template" "${WORKSPACE}"
cd "${WORKSPACE}"
git init -q -b main
git add -A
git commit -q -m "[swarm-launch] initial workspace from template"

# 2. Target repo from the demo template
echo "→ cloning target template"
cp -R "${SWARM_ROOT}/demo/target" "${TARGET}"
cd "${TARGET}"
git init -q -b main
git add -A
git commit -q -m "[swarm-launch] initial target from template"

# 3. Seed the workspace with the feature spec the architect will read
echo "→ seeding feature spec into workspace inbox"
cd "${WORKSPACE}"
SPEC_BODY="$(cat "${SWARM_ROOT}/demo/feature-spec.md")"
# Use the protocol: drop the spec into research/ and reference it from inbox.
mkdir -p research
cp "${SWARM_ROOT}/demo/feature-spec.md" "research/${FEATURE}-spec.md"
cat > inbox.md <<EOF
# Inbox

## Open

- [ ] ARCH-001 — design "${FEATURE}" per research/${FEATURE}-spec.md, for: ARCHITECT
      added by: swarm-launch
EOF
git add -A
git commit -q -m "[swarm-launch] feature spec dropped, ARCH item open"

# 4. Print the run instructions
cat <<EOF

✓ workspace and target initialised
  workspace head:  $(git -C "${WORKSPACE}" log --oneline -1)
  target head:     $(git -C "${TARGET}" log --oneline -1)

────────────────────────────────────────────────────────────────────
NEXT STEP — paste into Claude Code:
────────────────────────────────────────────────────────────────────

/loop $(cat <<-INNER
$(cat "${SWARM_ROOT}/orchestrator/prompt.md")

---

## Context for this run

- Workspace: ${WORKSPACE}
- Target repo: ${TARGET}
- Feature slug: ${FEATURE}
- Max iterations: ${MAX_ITERATIONS}
- Spec: ${WORKSPACE}/research/${FEATURE}-spec.md
INNER
)

────────────────────────────────────────────────────────────────────

Tip: open in a fresh Claude Code session so the orchestrator's context
isn't polluted with other work. The /loop will self-pace; intervene at
any iteration by interrupting and inspecting ${WORKSPACE}/journal.md.

EOF

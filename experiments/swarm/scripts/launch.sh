#!/usr/bin/env bash
# Launch a multisphere swarm.
#
# Two modes:
#
#   demo  — fresh sandbox workspace + sandbox FastAPI target, for smoke-testing
#           the orchestrator loop. No real codebase touched.
#
#   prod  — point at an EXISTING multisphere workspace and an EXISTING target
#           repo. The swarm reads the workspace's accumulated context (research,
#           decisions, prior drafts, inbox, journal), surveys the target repo,
#           and orchestrates a multi-step build on a fresh `swarm/<feature>`
#           branch.
#
# Usage:
#   bash launch.sh demo [<feature-slug>]
#   bash launch.sh prod --workspace <path> --target <path> --task "<prompt>"
#   bash launch.sh prod --workspace <path> --target <path> --spec <path-in-workspace>
#
# Optional in either mode:
#   --slug <slug>            override the auto-derived feature slug
#   --max-iterations <n>     hard cap on /loop iterations (default 20 — multi-step
#                            features need more than the 10 of single-step)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SWARM_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SWARM_ROOT}/../.." && pwd)"

MODE="${1:-}"; shift || true

MAX_ITERATIONS=20
SLUG=""
WORKSPACE=""
TARGET=""
TASK=""
SPEC=""

while [ $# -gt 0 ]; do
    case "$1" in
        --workspace)       WORKSPACE="$2"; shift 2 ;;
        --target)          TARGET="$2"; shift 2 ;;
        --task)            TASK="$2"; shift 2 ;;
        --spec)            SPEC="$2"; shift 2 ;;
        --slug)            SLUG="$2"; shift 2 ;;
        --max-iterations)  MAX_ITERATIONS="$2"; shift 2 ;;
        *)                 POSITIONAL+="$1 "; shift ;;
    esac
done

die() { echo "ERROR: $1" >&2; exit 1; }

derive_slug() {
    local source="$1"
    # First 4 words of source, lowercase, alnum + hyphen only.
    printf '%s' "$source" \
        | tr '[:upper:]' '[:lower:]' \
        | tr -cs 'a-z0-9' '-' \
        | cut -c1-40 \
        | sed 's/-$//'
}

# ─────────────────────────────────────────────────────────────────────
# DEMO mode — current sandbox behaviour
# ─────────────────────────────────────────────────────────────────────
if [ "$MODE" = "demo" ]; then
    FEATURE="${POSITIONAL:-healthz-endpoint}"
    FEATURE="${FEATURE%% *}"
    RUNS_DIR="${SWARM_RUNS_DIR:-${HOME}/swarm-runs}"
    RUN_DIR="${RUNS_DIR}/demo-${FEATURE}"
    WORKSPACE="${RUN_DIR}/workspace"
    TARGET="${RUN_DIR}/target"

    if [ -e "${RUN_DIR}" ]; then
        die "${RUN_DIR} already exists. Remove it or pick a different feature slug."
    fi

    echo
    echo "============================================================"
    echo "  swarm launch — DEMO mode — ${FEATURE}"
    echo "============================================================"
    mkdir -p "${RUN_DIR}"

    cp -R "${REPO_ROOT}/workspace-template" "${WORKSPACE}"
    cd "${WORKSPACE}" && git init -q -b main && git add -A && git commit -q -m "[swarm-launch] initial workspace from template"

    cp -R "${SWARM_ROOT}/demo/target" "${TARGET}"
    cd "${TARGET}" && git init -q -b main && git add -A && git commit -q -m "[swarm-launch] initial target from template"

    cd "${WORKSPACE}"
    mkdir -p research
    cp "${SWARM_ROOT}/demo/feature-spec.md" "research/${FEATURE}-spec.md"
    cat > inbox.md <<EOF
# Inbox

## Open

- [ ] ARCH-001 — design swarm feature "${FEATURE}" per research/${FEATURE}-spec.md, for: ARCHITECT
      added by: swarm-launch
EOF
    git add -A && git commit -q -m "[swarm-launch] feature spec dropped, ARCH item open"

# ─────────────────────────────────────────────────────────────────────
# PROD mode — point at existing workspace + target
# ─────────────────────────────────────────────────────────────────────
elif [ "$MODE" = "prod" ]; then
    [ -z "$WORKSPACE" ]              && die "prod mode requires --workspace"
    [ -z "$TARGET" ]                 && die "prod mode requires --target"
    [ -z "$TASK" ] && [ -z "$SPEC" ] && die "prod mode requires either --task or --spec"
    [ -n "$TASK" ] && [ -n "$SPEC" ] && die "use either --task or --spec, not both"

    WORKSPACE="$(cd "$WORKSPACE" && pwd)"
    TARGET="$(cd "$TARGET" && pwd)"

    [ -d "${WORKSPACE}/.git" ] || die "workspace path is not a git repo: ${WORKSPACE}"
    [ -d "${TARGET}/.git" ]    || die "target path is not a git repo: ${TARGET}"
    [ -f "${WORKSPACE}/inbox.md" ] || die "workspace doesn't look like a multisphere workspace (no inbox.md): ${WORKSPACE}"

    # Compute slug
    if [ -z "$SLUG" ]; then
        if [ -n "$TASK" ]; then SLUG="$(derive_slug "$TASK")"
        else                    SLUG="$(derive_slug "$(basename "$SPEC" .md)")"
        fi
    fi
    FEATURE="$SLUG"

    cd "${WORKSPACE}"

    # If --task: persist the prompt as a spec in research/, then point the
    # inbox item at it. Unifies modes A and B downstream.
    if [ -n "$TASK" ]; then
        SPEC_PATH="research/swarm-${FEATURE}-$(date +%Y%m%d-%H%M).md"
        mkdir -p research
        cat > "${SPEC_PATH}" <<EOF
# swarm task: ${FEATURE}

Captured by swarm-launch on $(date +%Y-%m-%dT%H:%M:%S%z).
Free-form task prompt, persisted so the architect can read it as
durable workspace context.

## Task

${TASK}
EOF
        git add "${SPEC_PATH}"
        SPEC_REF="${SPEC_PATH}"
    else
        # --spec: validate it exists in the workspace
        [ -f "${WORKSPACE}/${SPEC}" ] || die "spec not found in workspace: ${SPEC}"
        SPEC_REF="${SPEC}"
    fi

    # Drop an inbox item for the architect. Don't clobber existing inbox —
    # parse the highest existing ARCH-NNN and increment.
    ARCH_N=1
    if grep -qE 'ARCH-[0-9]+' inbox.md 2>/dev/null; then
        ARCH_N=$(( $(grep -oE 'ARCH-[0-9]+' inbox.md | sed 's/ARCH-//' | sort -n | tail -1) + 1 ))
    fi
    ARCH_ID=$(printf "ARCH-%03d" "$ARCH_N")

    # Append under the "## Open" section.
    if grep -q '^## Open' inbox.md; then
        # Insert after the "## Open" line
        awk -v item="- [ ] ${ARCH_ID} — design swarm feature \"${FEATURE}\" per ${SPEC_REF}, for: ARCHITECT" \
            '{print} /^## Open/ && !done {print ""; print item; done=1}' inbox.md > inbox.md.new
        mv inbox.md.new inbox.md
    else
        echo "" >> inbox.md
        echo "## Open" >> inbox.md
        echo "" >> inbox.md
        echo "- [ ] ${ARCH_ID} — design swarm feature \"${FEATURE}\" per ${SPEC_REF}, for: ARCHITECT" >> inbox.md
    fi

    git add inbox.md
    git commit -q -m "[swarm-launch] ${ARCH_ID}: design ${FEATURE}"

    echo
    echo "============================================================"
    echo "  swarm launch — PROD mode — ${FEATURE}"
    echo "============================================================"
    echo "  inbox item    : ${ARCH_ID}"
    echo "  spec ref      : ${SPEC_REF}"

else
    cat <<EOF >&2
ERROR: unknown mode "${MODE}".

Usage:
  bash launch.sh demo [<feature-slug>]
  bash launch.sh prod --workspace <path> --target <path> --task "<prompt>"
  bash launch.sh prod --workspace <path> --target <path> --spec <path-in-workspace>
EOF
    exit 1
fi

# ─────────────────────────────────────────────────────────────────────
# Common: report + print the /loop command
# ─────────────────────────────────────────────────────────────────────

echo "  workspace     : ${WORKSPACE}"
echo "  target        : ${TARGET}"
echo "  feature slug  : ${FEATURE}"
echo "  max iter      : ${MAX_ITERATIONS}"
echo "============================================================"
echo
echo "  workspace head : $(git -C "${WORKSPACE}" log --oneline -1)"
echo "  target head    : $(git -C "${TARGET}" log --oneline -1)"
echo
echo "────────────────────────────────────────────────────────────────────"
echo "NEXT STEP — paste into Claude Code (fresh session recommended):"
echo "────────────────────────────────────────────────────────────────────"
echo

cat <<EOF
/loop $(cat "${SWARM_ROOT}/orchestrator/prompt.md")

---

## Context for this run

- Workspace: ${WORKSPACE}
- Target repo: ${TARGET}
- Feature slug: ${FEATURE}
- Max iterations: ${MAX_ITERATIONS}
EOF

echo
echo "────────────────────────────────────────────────────────────────────"
echo "Inspect progress in another terminal:"
echo "  tail -f ${WORKSPACE}/journal.md"
echo "  ls ${WORKSPACE}/drafts/${FEATURE}/"
echo "  cd ${TARGET} && git log --oneline swarm/${FEATURE}"
echo

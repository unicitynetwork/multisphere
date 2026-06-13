# swarm demo — add `/healthz` to a FastAPI app

A throwaway demo to validate the orchestrator loop end-to-end. The target is a small FastAPI app with a single route. The feature ask is to add a health endpoint.

## Why this demo

- **Small** — the entire change is ~10 lines of Python.
- **Touches all three roles meaningfully**:
  - Architect has to decide route path, response shape, and what "healthy" means.
  - Implementer has to write the route + a test.
  - Verifier has to run `make test` and `make lint` and check the public shape matches the design.
- **Deterministic** — passes or fails on a clean test run.
- **No external dependencies** — pure FastAPI, no Postgres, no network calls.

## What's in `target/`

```
target/
├── pyproject.toml      # FastAPI + pytest + ruff
├── Makefile            # `make test`, `make lint`, `make run`
├── app/
│   ├── __init__.py
│   └── main.py         # single route, GET / → {"hello": "world"}
└── tests/
    ├── __init__.py
    └── test_main.py    # one passing test for GET /
```

## The feature spec (`feature-spec.md`)

Verbatim text fed to the orchestrator (which routes it to the Architect). Kept deliberately concise — the swarm should be able to design from a short ask.

## Running it

```bash
bash experiments/swarm/scripts/launch.sh
# follow the printed instructions
```

The launcher creates `~/swarm-runs/healthz-endpoint/{workspace,target}`. Each is a fresh git repo. The workspace already has `research/healthz-endpoint-spec.md` and an open inbox item addressed to ARCHITECT.

## Expected end state on success

After the orchestrator declares PASS:

- `target/app/main.py` has a `GET /healthz` route.
- `target/tests/test_main.py` has a test for it.
- `cd target && make test` exits 0.
- `cd target && make lint` exits 0.
- Workspace journal shows the full Architect → Implementer → Verifier sequence with all three signing as `[ARCHITECT]` / `[IMPLEMENTER]` / `[VERIFIER]`.
- `decisions/healthz-endpoint-outcome.md` declares PASS.

## What "fail" looks like

Several failure modes are possible. They're useful — they show where the design needs work:

- **Architect underspecifies** → Implementer makes a guess that doesn't match what Verifier expects → FAIL → retry loop.
- **Implementer's tests are too thin** → Verifier's `make test` passes but design-conformance check flags missing test from the architect's plan → FAIL → retry.
- **Lint nitpicks** → Implementer ships code that fails ruff → FAIL → retry with a tighter ruff fix.

If the swarm reaches `MAX_ITERATIONS` without PASS, the orchestrator writes the final state and stops. That's a useful signal too — it tells you where the swarm got stuck.

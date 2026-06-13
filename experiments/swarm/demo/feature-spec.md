# feature: `/healthz` endpoint

## What

Add a GET `/healthz` endpoint to the FastAPI app that returns a small JSON object indicating the service is alive. Standard health probe shape — something Kubernetes or a load balancer could hit every few seconds.

## Why

Liveness checks. Without `/healthz`, operators can only tell the app is alive by hitting `/`, which mixes liveness with the app's actual behaviour. A dedicated health endpoint is cheap, idiomatic, and unblocks deploys behind any orchestrator that wants a probe path.

## Acceptance

- `GET /healthz` returns `200` with a JSON body containing at least `{"status": "ok"}`. Extra fields are fine if they're cheap to compute.
- Test coverage: at least one passing test for the new endpoint, checking status code and body.
- Lint clean.
- The existing `GET /` route still works unchanged.

## Out of scope

- Database / external dependency checks. Pure process-alive signal.
- Auth. `/healthz` is unauthenticated by convention.
- Renaming or reshaping any existing route.

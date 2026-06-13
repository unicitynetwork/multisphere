# swarm task: bug fix

> Fill in the sections below. Pass the entire filled-out file via `--task` (or
> drop it in `<workspace>/research/` and pass via `--spec`). The architect
> reads it and structures the roadmap as one-hypothesis-per-step.
>
> **Launch with:**
>
> ```
> bash launch.sh prod \
>   --workspace <ws> --target <repo> \
>   --task "$(cat experiments/swarm/templates/bug-fix-task.md)" \
>   --retry-budget 10 \
>   --pivot-on-exhaustion
> ```

## Bug summary

One sentence. What's broken from the user's perspective.

## Expected behaviour

What should happen. Be precise — the failing test the swarm writes in step 1
should pass when the bug is fixed and only then.

## Actual behaviour

What happens instead. Error messages, screenshots refs, console output.

## Reproduction

Steps to reproduce, in order. Include URL paths, button labels, payloads —
whatever the repro test needs to encode.

## Suspected area (optional)

Files, modules, or components you suspect. Leave blank if you have no guess —
the architect will survey from scratch.

## Logs / stack trace (optional)

Paste any captured logs, stack traces, console errors. Trim aggressively but
keep the relevant frames. The architect uses these as evidence when ranking
hypotheses.

---

## Architect: how to structure this roadmap

This task is a **bug fix**, not a feature build. Structure the roadmap as:

1. **Step 1 — write a repro test.** Add a single failing test that captures
   the bug. UI bugs → Playwright. Backend bugs → the target repo's existing
   test framework. The test must fail **for the bug's reason**, not for an
   import error or missing fixture. Exit criterion: test runs, fails, and
   the failure message refers to the bug's actual symptom.

2. **Steps 2 to (N+1) — one hypothesis per step**, ranked by evidence from
   the bug report + your codebase survey. Each step's design names exactly
   *one* root-cause candidate and a fix. The verifier passes the step only
   if the repro test now passes AND no other test regresses AND lint+typecheck
   stay clean.

   Typical N is 3 hypotheses. Lay out at least 3 in the bootstrap roadmap.

3. **Final step — finalisation.** Run the full test suite, run lint, run
   typecheck, open a PR with `gh pr create` summarising the chain of attempts
   (which hypotheses were tried, which was the actual fix, what the verdicts
   said). Exit criterion: PR URL recorded in the impl note.

The orchestrator will run with `--pivot-on-exhaustion`: when the retry budget
on a hypothesis step is hit (default 10 retries), it'll mark that hypothesis
EXHAUSTED and re-dispatch you to design the next one. Your next-step prompt
explicitly handles this — you'll see `step-<N-1>-exhausted.md` and design step
N as a *different* hypothesis.

## Notes for hypotheses

Common gotchas to consider when ranking hypotheses for UI / click-target /
pointer-events bugs (only relevant if the bug is in that domain — ignore
otherwise):

- An overlay container with `pointer-events: auto` (or an opaque background)
  intercepting clicks meant for an element underneath.
- `z-index` stacking surprise — visually-on-top is not always
  event-target-on-top when stacking contexts intervene.
- The handler is bound to the wrong element (parent vs child, capture vs
  bubble phase).
- A modal/portal mounted into an unexpected DOM node whose ancestor traps
  the event.
- A `disabled` or `aria-disabled` attribute swallowing the click silently.
- CSS `transform` creating a new stacking context that re-orders hit-testing.

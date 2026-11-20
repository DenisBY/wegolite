---
phase: quick
plan: 261120-ryc
subsystem: tests/e2e
tags: [e2e, ci, timeouts, launch]
requires: []
provides:
  - FIRST_LAUNCH_WAIT_MS (180_000), the single ceiling for e2e waits that span an unskipped launch
affects: [tests/e2e, .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md]
tech-stack:
  added: []
  patterns: ["budget rule: non-launch budget + one FIRST_LAUNCH_WAIT_MS per unskipped launch, written as an expression"]
key-files:
  created: []
  modified:
    - tests/e2e/helpers/probe.ts
    - tests/e2e/scene.spec.ts
    - tests/e2e/context-loss.spec.ts
    - tests/e2e/core-loop.spec.ts
    - tests/e2e/docking.spec.ts
    - tests/e2e/flight.spec.ts
    - tests/e2e/hud.spec.ts
    - tests/e2e/launch.spec.ts
    - tests/e2e/probe-shape.spec.ts
    - tests/e2e/settings.spec.ts
    - tests/e2e/station.spec.ts
    - tests/e2e/compliance-shipped.spec.ts
    - .planning/todos/pending/2026-11-16-ci-e2e-timeout-margins.md
decisions:
  - "FIRST_LAUNCH_WAIT_MS = 180_000, from ~70 s measured full first launch on GitHub CI (run 44796363344)"
metrics:
  duration: "about 25 min"
  completed: 2026-11-20
status: complete
commits: 3
plan_head_before: 0828f81
plan_head_after: 8edca56af762dd0da19548675b96a3fbfed821b2
actuals:
  tokens: 6500
  tasks: 3
  commits: 3
requirements: [FOUND-03]
---

# Phase quick Plan 261120-ryc: first-launch e2e waits Summary

One shared constant, `FIRST_LAUNCH_WAIT_MS = 180_000`, now bounds every e2e wait that spans an unskipped first launch, and the per-test and per-file timeouts that contain those waits follow the budget rule (non-launch budget plus one constant per unskipped launch), so the sharded GitHub Chromium run should stop failing at 30 s / 60 s launch waits.

## What was done

- **Task 1 (tracer, e3abf6e):** added the documented constant to `tests/e2e/helpers/probe.ts` and wired it through `scene.spec.ts` (wait and `30_000 + FIRST_LAUNCH_WAIT_MS` budget). Lint and typecheck green in Docker.
- **Task 2 (03faf01):** applied the change table to context-loss, core-loop (kept `scaled()`), docking (helper plus a new budget on the aligned-pose test, three tests moved to `150_000 + ...`), flight, hud (message-line comment no longer claims 480 s; the 450 s message wait is unchanged), launch (`waitForPreRoll` stays 30 s), probe-shape (`waitForState` gains an optional trailing `timeout = SLOW`, only the in-flight call passes the constant), settings (seven budgets, `startAndLaunch`), station (two tests gain `150_000 + ...`) and compliance-shipped (`30_000 + ...`). The per-file gate loop reports no failing file; lint and typecheck green.
- **Task 3 (8edca56):** ran the eleven specs on the remote machine at the committed HEAD and recorded the dated status section in the CI timeout todo (it stays in `todos/pending`, `probe.ts` added to its files list).

## Verification

- `docker compose run --rm lint` and `docker compose run --rm typecheck`: pass.
- Remote run (Chromium, eleven changed specs, snapshot 03faf01): **54 passed, 0 failed, 5.5 min** (script `elapsed=334s`). No rerun was needed.
- Per-file gate loop and the probe-shape call regex: pass. Scope: this task's three commits touch only `tests/e2e/` and `.planning/todos/`.

## Deviations from Plan

None - plan executed as written. Notes: the plan's launch-count counts were taken as given; `docking.spec.ts` kept its file-level 120 s for non-launching tests. Prettier required multi-line import lists in several specs (formatting only).

SEQUENTIAL mode ran on `main` as directed by the orchestrator, so the protected-branch commit guard was intentionally not enforced.

## Known Stubs

None.

## Threat Flags

None. Test-only change; no product code, new endpoint, auth path or dependency.

## Self-Check: PASSED

- FOUND: tests/e2e/helpers/probe.ts (`export const FIRST_LAUNCH_WAIT_MS = 180_000;`)
- FOUND commits: e3abf6e, 03faf01, 8edca56 (all ancestors of HEAD)
- Stash `release-0.7.0-prep` untouched; nothing pushed or tagged.

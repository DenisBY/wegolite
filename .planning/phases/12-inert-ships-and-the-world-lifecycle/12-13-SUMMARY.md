---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 13
subsystem: app-session
tags: [world-11, chart, event-router, hyperspace-controller, game-loop, reset-guard]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-12 the populated session browser spec; the chart controller's closeChart (Phase 8) and the station and hyperspace controllers"
provides:
  - "StationFlowDeps.closeChart: a docked event while the chart is open closes it before the dockHome input context is set"
  - "HyperspaceControllerDeps.closeChart: a successful arrival closes an open chart after the install block; a failed arrival returns before it and leaves the chart alone"
  - "GameLoop reset-inside-step guard: advance() stops stepping when a step calls reset(), leaves the accumulator at 0, drops pending commands and returns alpha 0"
  - "tests/app/game-loop.test.ts: the accumulation and catch-up cap rows (pinned for the first time) and the reset-inside-step rows"
affects: [12-14]
status: complete
actuals:
  tokens: 3300
  tasks: 3
  commits: 3
plan_head_before: 001b7b7d7d2fb73f357270bdde5573e6e0717731
plan_head_after: 7921068612b3db1365a1821e020072fed498ab96
tech-stack:
  added: []
  patterns:
    - "a terminal-event handler closes the chart through an injected dependency (direct in the router, which is built after the chart controller; a call-time wrapper in the hyperspace controller, which is built before it)"
    - "a reset generation counter, compared across a callback, detects a re-entrant reset without a second flag"
key-files:
  created:
    - tests/app/game-loop.test.ts
  modified:
    - src/app/game-loop.ts
    - src/app/game-session.ts
    - src/app/session/event-router.ts
    - src/app/session/hyperspace-controller.ts
    - tests/app/session-order.test.ts
    - tests/app/session/hyperspace-controller.test.ts
    - tests/app/session/chart-controller.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session/tick-parity.test.ts
key-decisions:
  - "The chart close on a terminal event sits in the two handlers that own the screen change (the docked case, the arrival's post-install steps), not in the sim driver, so a failed arrival leaves the chart as it was and the order of the existing docked steps is unchanged."
  - "No CHANGELOG entry: the rules are dormant until plan 12-14 lets the simulation run behind the chart (today the chart freezes flight), so there is no user-visible change yet; plan 12-14 records the user-visible one."
requirements-completed: []
coverage:
  - id: D1
    description: "A dock that completes while the chart is open closes the chart first, so the final input context is dockHome and chartOpen is false; with the chart closed closeChart is never called and the docked step order is unchanged"
    requirement: "WORLD-11"
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts#docked behind an open chart: the chart closes first, so the final input context is dockHome (WORLD-11)"
        status: pass
      - kind: unit
        ref: "tests/app/session-order.test.ts#docked with the chart closed never closes it, and the steps keep their order (WORLD-11)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A successful arrival behind an open chart closes it in the post-install steps and ends in the flight context; a failed arrival leaves chartOpen, the selection and the input context as they were; closeChart restores the flight context and is a no-op when already closed"
    requirement: "WORLD-11"
    verification:
      - kind: unit
        ref: "tests/app/session/hyperspace-controller.test.ts#handleHyperspaceJumped behind an open chart (WORLD-11)"
        status: pass
      - kind: unit
        ref: "tests/app/session/chart-controller.test.ts#openChart and closeChart"
        status: pass
    human_judgment: false
  - id: D3
    description: "A reset() called from inside a game-loop step stops the stepping after that step, leaves the accumulator at 0 (never negative), drops pending commands and returns alpha 0; the next advance(DT) runs exactly one step; the basic accumulation and cap behaviour is pinned"
    requirement: "WORLD-11"
    verification:
      - kind: unit
        ref: "tests/app/game-loop.test.ts#reset called from inside a step (WORLD-11, T-12-31)"
        status: pass
      - kind: unit
        ref: "tests/app/game-loop.test.ts#accumulation and the catch-up cap"
        status: pass
    human_judgment: false
---

# Phase 12 Plan 13: The chart closes on a dock or an arrival, and the loop survives a reset inside a step Summary

A dock or a jump that completes behind the galactic chart now closes it with the right input context (`StationFlowDeps.closeChart`, `HyperspaceControllerDeps.closeChart`), and `createGameLoop().advance` is safe against the `reset()` that `closeChart` performs from inside a step (a reset generation counter stops the stepping and leaves the accumulator at 0).

## Requirements and gates

- **Requirement.** WORLD-11 is declared by this plan and by plan 12-14, so it is NOT marked complete here; plan 12-14 lets the simulation run behind the chart and owns the user-visible change. The rules in this plan are dormant until then (today the chart freezes flight, so no dock or arrival can complete behind it).
- **Gate policy followed.** Targeted Vitest during each task, then once at the end the full `test`, `lint`, `typecheck` locally and `verify` on the remote machine (src/app changed in all three tasks).

## Task Commits

| Task | Name | Commit |
| --- | --- | --- |
| 1 | a dock that completes behind the chart closes it and lands in the docked context (tracer) | f496b08 |
| 2 | an arrival that completes behind the chart closes it; a failed arrival leaves it alone | dff7ebe |
| 3 | a reset inside a game-loop step is safe | 7921068 |

Tracer gate: the automated-only `<verify>` (targeted Vitest, typecheck) passed after commit f496b08, so expansion proceeded with no checkpoint.

## What changed

- **event-router.ts.** `StationFlowDeps` gains `closeChart`; the `docked` case calls it first when `ctx.chart.chartOpen`, before the `dockHome` context is set, so the chart restores its saved context and the station then sets `dockHome`.
- **hyperspace-controller.ts.** `HyperspaceControllerDeps` gains `closeChart`; after the install block (after `chartSelectedId` is cleared and `lastJump` is set, before the status overlay and the arrival announcement) the arrival calls it when the chart is open. The failure branch returns before it.
- **game-session.ts.** The router gets `chartController.closeChart` directly (built after the chart controller); the hyperspace controller gets a call-time wrapper (built before it), as `autosave` is.
- **game-loop.ts.** `advance` records `resetGeneration` before each `step` and returns 0 when it changed: the accumulator and pending were already zeroed by `reset()`, so the post-step `accumulator -= DT` that would have left minus one step never runs.

## Gates run (all in Docker)

| Gate | Result |
| --- | --- |
| Targeted Vitest per task (session-order, chart-controller, hyperspace-controller, world-lifecycle, tick-parity, game-loop, sim-driver), local | all passed; each reset row was seen red before the guard |
| `docker compose run --rm test` (local, on the final working tree = HEAD content) | 153 files, 3008 passed, 2 skipped, exit 0 |
| `docker compose run --rm lint` (local, ESLint and Prettier) | exit 0 |
| `docker compose run --rm typecheck` (local) | exit 0 |
| `remote-run.sh run --rm verify` (committed HEAD 7921068, remote machine) | exit 0, 27 Playwright tests passed |

The "keeps four `pending` resets" test in tests/app/session/sim-driver.test.ts passes unchanged. The remote and local runs did not disagree. No `verify-full` was run (the plan's gate policy; plan 12-14 owns the phase-end gate).

Acceptance greps: `closeChart` in event-router.ts 3, in tests/app/session-order.test.ts 4, in hyperspace-controller.ts 3, in tests/app/session/hyperspace-controller.test.ts 4; `reset` in tests/app/game-loop.test.ts 15 (file exists, 183 lines, above the 40-line minimum).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two more test harnesses build the hyperspace controller**
- **Found during:** Task 2 (typecheck after adding the required `closeChart` dependency)
- **Issue:** `tests/app/session/world-lifecycle.test.ts` (two sites) and `tests/app/session/tick-parity.test.ts` construct `HyperspaceControllerDeps` and failed typecheck with the new required field. They are not in the plan's `files_modified`.
- **Fix:** added a no-op (or call-recording) `closeChart` to each harness; no test behaviour changes.
- **Files modified:** tests/app/session/world-lifecycle.test.ts, tests/app/session/tick-parity.test.ts
- **Commit:** dff7ebe

### Departures worth a reviewer's eye (no rule triggered)

- **Commit-then-run.** The dispatch required per-task commits, and the remote wrapper syncs only committed HEAD, so each task was committed before its gate ran; the plan's "do not commit" brief line is the orchestrator's, superseded by the dispatch.
- **Placement of the arrival call.** The plan says "where `chartSelectedId` is cleared"; the call sits just after the `lastJump` assignment (same install region), so `closeChart`'s probe update sees the finished arrival state.
- **No CHANGELOG entry** (see key-decisions): internal and dormant until plan 12-14.

**Total deviations:** 1 auto-fixed (1 blocking, test harness only). **Impact:** none on behaviour.

## Known Stubs

None.

## Threat Flags

None. T-12-31 (reset inside a step) is mitigated by the reset generation guard and its rows.

## Next Phase Readiness

Ready for plan 12-14: the dock and arrival rules and the loop guard are in place, so the simulation can run behind the chart from its first commit.

## Self-Check: PASSED

- FOUND: tests/app/game-loop.test.ts
- FOUND: commits f496b08, dff7ebe, 7921068 (ancestors of HEAD)
- `git rev-list --count 001b7b7..7921068` is 3, matching `commits: 3`

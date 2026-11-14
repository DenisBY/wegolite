---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 14
subsystem: app-session
tags: [world-11, world-16, chart, frame-loop, sim-driver, advance-behind, d-03, phase-gate]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-13: a dock or arrival behind the chart closes it, and the game loop survives a reset inside a step"
provides:
  - "sim-driver advanceBehind(delta): the whole fixed steps the delta owes with no commands and the zero input frame, for the frame loop's chart branch"
  - "frame-loop chart branch: in flight, not paused and not under the manual clock, the simulation steps behind the opaque chart; docked it stays frozen; nothing is drawn"
  - "advanceTicks steps in flight behind the chart (no drain, no commands, zero frame), still refuses docked or launching with the chart open, and stops after a step that opens or closes the chart"
  - "tests/e2e/hyperspace.spec.ts: the v1 freeze check inverted (the clock advances behind the chart in flight)"
  - "Key Decisions: row 217 done, new D-03 row (slow-motion catch-up kept below 24 fps); CHANGELOG entry; both folded todos closed"
  - "Phase 12 gate: verify-full and the Firefox e2e-cross green"
affects: []
status: complete
actuals:
  tokens: 7500
  tasks: 3
  commits: 3
plan_head_before: 42eacfac3d2d3a14b8ee775007abcb392f135293
plan_head_after: 1470b423d4738bbae5b66376095444d4b80b0188
tech-stack:
  added: []
  patterns:
    - "one frozen zero input frame (ZERO_FRAME) shared by every step taken behind the opaque chart, so a held key cannot steer the ship"
    - "advanceTicks compares the chart's open state against its value at the call's start, so one condition stops on an open and on a close"
key-files:
  created: []
  modified:
    - src/app/session/frame-loop.ts
    - src/app/session/sim-driver.ts
    - tests/app/session-order.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/e2e/hyperspace.spec.ts
    - .planning/PROJECT.md
    - CHANGELOG.md
    - .planning/todos/completed/2026-11-10-keep-simulating-behind-the-chart.md
    - .planning/todos/completed/2026-11-10-decide-behaviour-below-24-fps.md
key-decisions:
  - "The chart branch steps behind the chart only in flight, not paused, and not under the manual clock; a chart opened while docked stays frozen (plan decision, research A4), a paused session stays frozen, and under the manual clock only advanceTicks moves the simulation (D-09)."
  - "advanceBehind never drains, never touches pending and never autosaves: the chart branch has already drained, and the pre-launch anchor belongs to the docked drain. The step bounds are the existing ones (MAX_STEPS_PER_FRAME 5, MAX_FRAME_DELTA 0.25), so no unbounded loop exists (T-12-30)."
  - "advanceTicks refuses with the chart open unless the state is inFlight (docked and launching refuse), so the refusal reads the mode, not just the chart flag."
  - "D-03 recorded: below 24 fps the slow-motion catch-up cap stays, with no notice and no automatic quality drop; reversible without touching saved data."
requirements-completed: [WORLD-11, WORLD-16]
coverage:
  - id: D1
    description: "In flight with the chart open (not paused, not manual clock) the frame drains the chart actions, save-screen actions, commands and station actions, empties pending, steps once behind the chart with the frame's delta, requests a redraw, publishes the probe and never draws; docked, paused and manual-clock frames keep the old freeze order with no step"
    requirement: "WORLD-11"
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts#in flight behind the open chart: drains, empties pending, steps behind it with the frame's delta, never draws (WORLD-11)"
        status: pass
      - kind: unit
        ref: "tests/app/session-order.test.ts#docked behind the open chart: drains, empties pending, never steps or draws"
        status: pass
      - kind: unit
        ref: "tests/app/session-order.test.ts#in flight behind the open chart while paused: the freeze order, no step"
        status: pass
      - kind: unit
        ref: "tests/app/session-order.test.ts#in flight behind the open chart under the manual clock: only advanceTicks steps"
        status: pass
    human_judgment: false
  - id: D2
    description: "advanceBehind runs floor(delta / DT) steps (at most MAX_STEPS_PER_FRAME) with no commands and the zero input frame even with a held input, never drains or autosaves or taints, and keeps a running countdown decrementing"
    requirement: "WORLD-11"
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#advanceBehind, the steps behind the open chart (WORLD-11)"
        status: pass
    human_judgment: false
  - id: D3
    description: "advanceTicks steps in flight with the chart open (no drain, no commands, zero frame), refuses docked or launching with the chart open, and stops after a step that opens or closes the chart; the four-pending-reset count is unchanged"
    requirement: "WORLD-11"
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#advanceTicks, the refusal table"
        status: pass
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#the session's pending-queue resets"
        status: pass
    human_judgment: false
  - id: D4
    description: "In the browser the clock advances while the chart is open in flight (the one inverted v1 freeze check)"
    requirement: "WORLD-16"
    verification:
      - kind: e2e
        ref: "tests/e2e/hyperspace.spec.ts#chart target, countdown, abort, refusal, arrival and reload"
        status: pass
    human_judgment: false
  - id: D5
    description: "The below-24-fps decision (D-03) is recorded in PROJECT.md, the changelog names the chart change and both folded todos are closed"
    requirement: "WORLD-11"
    verification: []
    human_judgment: true
    rationale: "Documentation and decision records; the acceptance greps pass but no test asserts the wording"
  - id: D6
    description: "The phase gate: verify-full (lint, typecheck, assets:check, the full unit suite, the e2e build, the full Chromium suite including traffic.spec.ts and the seams spec) and the Firefox e2e-cross"
    requirement: "WORLD-16"
    verification:
      - kind: command
        ref: "remote-run.sh run --rm verify-full (HEAD 1470b42)"
        status: pass
      - kind: command
        ref: "remote-run.sh run --rm e2e-cross (HEAD 1470b42)"
        status: pass
    human_judgment: false
---

# Phase 12 Plan 14: The simulation runs behind the chart, the below-24-fps decision and the phase gate Summary

In flight the galactic chart no longer freezes the game: the chart branch of the frame loop calls the new `simDriver.advanceBehind(delta)` (fixed steps, no commands, one frozen zero input frame), `advanceTicks` steps behind the chart in flight, the one v1 freeze check in the hyperspace spec is inverted, the below-24-fps decision (D-03) is recorded with both todos closed, and `verify-full` and the Firefox `e2e-cross` are green.

## Requirements and gates

- **Requirements.** WORLD-11 (declared by plans 12-13 and 12-14) and WORLD-16 are marked complete by this plan: every other plan declaring them has its SUMMARY, so `requirements.ready-ids` reports both ready.
- **Gate policy followed.** Targeted Vitest and typecheck per task, the targeted hyperspace spec after Task 1, `lint` locally, then `verify-full` once and `e2e-cross` once on the remote machine (the plan's phase gate; no separate `verify`, because `verify-full` contains every `verify` stage). No known flake appeared, so no rerun was needed.

## Task Commits

| Task | Name | Commit |
| --- | --- | --- |
| 1 | the chart branch steps the simulation behind the chart in flight; the hyperspace freeze check inverted (tracer) | 4d38aea |
| 2 | `advanceTicks` steps behind the chart in flight and stops on a chart open or close | cd118ea |
| 3 | Key Decisions rows, changelog entry, both todos closed | 1470b42 |

Tracer gate: the automated `<verify>` (the four targeted Vitest files, then the hyperspace spec on the remote machine: 3 passed, 87 s) passed after commit 4d38aea, so expansion proceeded with no checkpoint.

## What changed

- **sim-driver.ts.** `advanceBehind(delta)` sets `ctx.core.currentFrame` to a module-level frozen `ZERO_FRAME` and runs `currentLoop.advance(delta, [], step => stepOnce(step, ZERO_FRAME))`. It never drains the keyboard, never touches `pending`, never autosaves and never taints; it shares the single `stepOnce` call site. `advanceTicks` now refuses with the chart open only when the state is not `inFlight`; with the chart open in flight it sets the zero frame, skips `drain`, still taints before the first step, and stops when `ctx.chart.chartOpen` differs from its value at the call's start (an open, or a dock or jump that closes it), or on dispose, pause or the save screen.
- **frame-loop.ts.** `LoopDeps.simDriver` is `Pick<SimDriver, "advanceFrame" | "advanceBehind">`. The chart branch, after its drains, the `pending` reset and the zero frame, calls `simDriver.advanceBehind(delta)` when the state is `inFlight`, the session is not paused and the manual clock is off; it keeps the redraw request and the probe update and still returns before `renderFrame`. The module header (step 4) and the branch comment say the simulation keeps running behind the opaque chart (WORLD-11, supersedes D-01). The count of `pending.length = 0;` statements is unchanged (3 in the frame loop, 4 across the session modules).
- **Tests.** tests/app/session-order.test.ts: the old freeze case is split into docked (old order, no `advanceBehind`) and in flight (new order, delta passed), plus paused and manual-clock rows. tests/app/session/sim-driver.test.ts: five `advanceBehind` rows (zero frame despite a held input and a queued command, no drain/autosave/taint, the step cap, a decrementing countdown, no state/loop/input), the docked and launching refusals, the in-flight `advanceTicks` row, and the stop-on-close and stop-on-open-in-flight rows. The "keeps four `pending` resets" test is unchanged and green.
- **tests/e2e/hyperspace.spec.ts.** Only the sanctioned check: after F6 in flight and 60 frames, `probe.clock` is greater than the clock read at the chart's opening (`clockAtChartOpen`), plus its comment and the header sentence. The diff against `42eacfa` is 5 added and 5 deleted lines (limit 12).
- **Docs.** PROJECT.md row 217 is now "✓ Phase 12 plans 12-13 and 12-14: ..." and a new row "Keep the slow-motion catch-up below 24 fps (D-03)" follows the last Phase 12 row; CHANGELOG `### Changed` names the chart change; both todos moved with `git mv` to `.planning/todos/completed/` with a Resolution section.

## Gates run

| Gate | Where | Result | Duration |
| --- | --- | --- | --- |
| Targeted Vitest (session-order, sim-driver, tick-parity, game-loop; later sim-driver, session-order, world-lifecycle) | local Docker | 119 passed; later 152 passed | seconds |
| `typecheck` | local Docker | exit 0 | |
| `lint` (ESLint and Prettier), after the docs commit's content | local Docker | exit 0 | |
| `remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/hyperspace.spec.ts"` (HEAD 4d38aea) | remote | 3 passed | 87 s (elapsed 1m28s) |
| `remote-run.sh run --rm verify-full` (HEAD 1470b42) | remote | exit 0: 153 test files, 3020 passed, 2 skipped; 132 Playwright tests passed in the Chromium suite (7.5 min) plus the 2 seams-spec tests; no failure, no retry | **563 s (9m25s)** |
| `remote-run.sh run --rm e2e-cross` (Firefox, HEAD 1470b42) | remote | exit 0: 2 passed (core-loop.spec.ts, engine.spec.ts) | **109 s (1m51s)** |

verify-full ran tests/e2e/traffic.spec.ts (the 50-draw-call assertion and the traffic-on cold start, DATA-13) inside its Chromium suite and it passed, so the render gate for plans 12-11 and 12-12 is met. No remote result was red, flaky or surprising, so no local re-run of `verify-full` or `e2e-cross` was made and the remote and local results never disagreed; the local `verify-full` (about 30 minutes on the owner's machine) was therefore not run. The remote machine's CPU count and speed differ from the owner's laptop; no timing assumption was changed.

Mutation check (Task 1): replacing the zero frame in `advanceBehind` with the live input frame made the "zero frame, never draining the keyboard" row fail. Task 2 rows: against the Task 1 `advanceTicks`, the in-flight row and the stop-on-close row failed (red), and passed after the change.

Acceptance greps: `advanceBehind` in sim-driver.ts 3; `advanceBehind(delta)` in frame-loop.ts 1; `pending.length = 0;` in frame-loop.ts 3; `toBe(frozenClock)` in the spec 0; `inFlight` in sim-driver.ts 2; both PROJECT.md rows 1; the pending todos directory has neither todo.

## Changed existing browser assertions

Phase 12 changed exactly three existing browser assertions; no other existing browser test changed.

| Assertion | Change | Sanction | Plan |
| --- | --- | --- | --- |
| tick-hook inert-flags case | URL `/?clock=manual&traffic=0` to `/?clock=manual&traffic=1`, `toBe(true)` to `toBe(false)` | owner decision 1 | 12-03 |
| tick-hook expired opt-in entity count | 0 to 12 | REQUIREMENTS.md WORLD-16, owner 2026-11-14 | 12-08 |
| chart-freeze check in tests/e2e/hyperspace.spec.ts | clock equal to the opening value to clock greater than it | WORLD-16, owner 2026-11-13 | 12-14 |

## Decisions carried forward

- **Buoy exemption (plan 12-04, owner decision 2026-11-14, option A).** Navigation buoys do not block hyperspace in Phase 12; revisit in `.planning/todos/pending/2026-11-14-make-buoys-block-hyperspace-like-oolite.md`. Not reopened.
- **Deferred NPC model requests (plan 12-11, owner decision 2026-11-14, option A).** No NPC model or texture is requested before the first in-flight frame (DATA-13 kept, at most 9,437,184 bytes cold); option B only on measured evidence. Not reopened. The traffic spec in this gate confirmed it.
- **D-03.** Below 24 fps the game stays in slow-motion catch-up (`MAX_STEPS_PER_FRAME` 5); recorded in PROJECT.md.

## Deviations from Plan

### Auto-fixed Issues

None - plan executed exactly as written for the code and tests.

### Departures worth a reviewer's eye (no rule triggered)

- **Commit-then-run.** The dispatch required per-task commits and the remote wrapper syncs only committed HEAD, so each task was committed before its remote gate; the plan's "do not commit" brief line is the orchestrator's, superseded by the dispatch.
- **Task 1 implementation edit came before the new Vitest rows.** The source edits were made first and the rows afterwards, so the rows were not seen red on the first pass. Red was then established by mutation (Task 1) and by running the Task 2 rows against the Task 1 `advanceTicks` (Task 2). The Task 1 commit holds the Task 1 version of sim-driver.ts (`advanceTicks` untouched) and the Task 2 commit holds the `advanceTicks` change, so the history keeps the plan's task split.
- **Extra test rows beyond the plan.** A launching-with-chart-open refusal row, a paused-chart row and a manual-clock-chart row were added to pin the branch conditions the plan states in prose.
- **The human check was not performed.** The `docker compose up preview` browser check of the plan's `<human-check>` (ships on the scanner during launch, no `models/<npc>.glb` request before the cockpit view, "Hyperspeed mass-locked." near a ship, F6 in flight keeps the ship moving) needs a person at a browser and was not run; the automated equivalents (traffic.spec.ts, hyperspace.spec.ts) are green. Left for the end-of-phase review.
- **No local gate re-run.** The gate ran on the remote machine only, because it was green throughout (see Gates run).

**Total deviations:** 0 auto-fixed. **Impact:** none on behaviour.

## Known Stubs

None.

## Threat Flags

None. T-12-29 (input steering the ship behind the chart) is mitigated and tested by the held-input row; T-12-30 (unbounded catch-up) by the unchanged step bounds and the cap row; T-12-32 (`advanceTicks` behind the chart) by the manual-clock gate and the docked and launching refusal rows.

## Next Phase Readiness

Phase 12 has all 14 plans summarised and the release gate green. Ready for phase-level verification, code review and UAT by the orchestrator; the preview human check above is the one open manual item.

## Self-Check: PASSED

- FOUND: commits 4d38aea, cd118ea, 1470b42 (ancestors of HEAD)
- FOUND: .planning/todos/completed/2026-11-10-keep-simulating-behind-the-chart.md and .planning/todos/completed/2026-11-10-decide-behaviour-below-24-fps.md; neither is in pending
- `git rev-list --count 42eacfa..1470b42` is 3, matching `commits: 3`

---
phase: 20-player-death-and-game-over
plan: 06
subsystem: app-session
tags: [player-death, frozen-world, frame-loop, sim-driver, pause, chart, game-over]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-04: ctx.runtime.gameOver, gameOverSeconds, latchGameOver (loop reset and input clear), the router's default death flow; 20-02: the dead-mode gate tripwire"
provides:
  - "stepOnce returns first on a dead state (the backstop behind the loop reset)"
  - "advanceTicks refuses while latched (before markHookMutation, so it does not taint) and breaks on the step that latched the death"
  - "the frame loop's game-over branch: drains every queue, never calls the sim driver, advances gameOverSeconds by the clamped wall delta (also under the manual clock), draws at alpha 1, publishes the probe, has no timer"
  - "pause() only clears held input while latched (covers focus loss, the P toggle and context loss); resume() returns at once"
  - "openChart, setChartCamera, toggleChartPreset, handleFind and selectChartSystem refuse while latched"
affects: [20-07, 20-08, 20-09, 20-10]

plan_head_before: d359bd819a4d9bcb295de6a8ced01c7a1bfa8ee4
plan_head_after: 35447410f0033d6a866f35df1a10444e60b51791
actuals:
  tokens: 9000
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "a latched-session branch that mirrors the chart and save-screen branches of frame(): drain, paint, publish, return"
    - "each negative gate has its own case on a hand-forced state (an open chart, a paused session under the latch) so a refusal is proven by the path that reaches it"

key-files:
  created: []
  modified:
    - src/app/session/sim-driver.ts
    - src/app/session/frame-loop.ts
    - src/app/session/settings-controller.ts
    - src/app/session/chart-controller.ts
    - tests/app/session/sim-driver.test.ts
    - tests/app/session/settings-controller.test.ts
    - tests/app/session/chart-controller.test.ts
    - tests/app/redraw-gate.test.ts

key-decisions:
  - "The game-over branch sits right after the pause-toggle block and before the docked message clock, so a pause edge still reaches pause() (which refuses while latched) and nothing else of the frame runs"
  - "The presentation clock advances only for a finite, positive delta, by clampFrameDelta(delta), so a hidden tab cannot jump the fade by minutes (the same bound as the sim loop)"
  - "Only the five chart entry points the plan names were gated; the arrow, confirm and find-focus actions need chartOpen, which is false for the whole latched session (the death flow closes the chart and openChart refuses)"

requirements-completed: [DEATH-01, DEATH-06]

coverage:
  - id: D1
    description: "After the lethal step no frame steps the world: a game-over branch drains every queue (commands, station, chart, save screen), empties pending, never calls the sim driver, draws at alpha 1 and publishes the probe, in real time and under the manual clock; it has no timer (1,000 frames, 250 s of presentation clock, still latched)"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#a dead session (plan 20-06, DEATH-01, D-01, D-06) > every later frame under real time"
        status: pass
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#a dead session (plan 20-06, DEATH-01, D-01, D-06) > every later frame under the manual clock"
        status: pass
    human_judgment: false
  - id: D2
    description: "The lethal frame stops by the loop reset (five steps owed, the death on step 2, two steps run, no docked event, autosave or launch advance after it), and stepOnce's own dead return is proven by a direct call that changes no tick, hash, pose, event, controller call or launch advance"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#a dead session (plan 20-06, DEATH-01, D-01, D-06) > the loop reset stops the lethal frame"
        status: pass
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#a dead session (plan 20-06, DEATH-01, D-01, D-06) > stepOnce on a dead state changes nothing"
        status: pass
    human_judgment: false
  - id: D3
    description: "The manual-clock hook cannot step a dead world: advanceTicks refuses while latched without tainting and breaks on the step that latched the death"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#a dead session (plan 20-06, DEATH-01, D-01, D-06) > advanceTicks refuses while latched"
        status: pass
      - kind: unit
        ref: "tests/app/session/sim-driver.test.ts#a dead session (plan 20-06, DEATH-01, D-01, D-06) > advanceTicks across the death returns the death tick and steps no further"
        status: pass
    human_judgment: false
  - id: D4
    description: "Pause, focus loss and context loss cannot open the pause overlay or set paused while latched; resume does nothing"
    requirement: DEATH-06
    verification:
      - kind: unit
        ref: "tests/app/session/settings-controller.test.ts#while the session is latched game over"
        status: pass
    human_judgment: false
  - id: D5
    description: "No chart opens or changes over the game-over view: openChart, setChartCamera, toggleChartPreset, handleFind and selectChartSystem refuse, and one latched session runs every refusal route in turn without leaking state"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/chart-controller.test.ts#while the session is latched game over"
        status: pass
      - kind: unit
        ref: "tests/app/session/chart-controller.test.ts#toggleChartPreset > is inert while gameOver"
        status: pass
      - kind: unit
        ref: "tests/app/session/chart-controller.test.ts#handleFind > ignores every kind while gameOver"
        status: pass
    human_judgment: false
  - id: D6
    description: "The rest of the lethal frame (HUD and hint updates, the real render driver on a dead state) completes: the test's renderFrame is a recording double, so the real render driver reading a dead state is first covered by 20-08's render-driver cases"
    verification: []
    human_judgment: true
    rationale: "The real render driver is 20-08's file and harness; this plan proves the frame loop reaches renderFrame after the lethal step, not what the real draw does with a dead state"

duration: 30min
completed: 2026-11-23
status: complete
---

# Phase 20 Plan 06: Frozen dead session Summary

**After the lethal step the sim driver, the frame loop, pause, focus loss, context loss and the chart all fail closed: the frame loop's new game-over branch only draws and advances the presentation clock (no timer), and nothing can pause, resume, open a chart or step the manual clock over the game-over view.**

## Performance

- **Duration:** about 30 min (the full `test` run is about 8 min under load from the sibling executor)
- **Tasks:** 2 (one tracer, one auto; both TDD with a RED commit before the GREEN commit)
- **Files modified:** 8 (0 created): 4 source, 4 test

## Accomplishments

- **Guards and their sites** (`src/app/session/`):
  - `sim-driver.ts`: `if (liveState.mode === "dead") return;` is `stepOnce`'s first statement after the live-field check, before the `previousPose` shift; `ctx.runtime.gameOver` joins `advanceTicks`' refusal list (before `markHookMutation()`) and its loop's break condition.
  - `frame-loop.ts`: the game-over branch, right after the pause-toggle block and before the docked message clock. It calls `drainCommands()`, `drainStationActions()`, `drainChartActions()` and `drainSaveScreenActions()`, empties `pending`, sets `currentFrame` to the zero frame, adds `clampFrameDelta(delta)` to `ctx.runtime.gameOverSeconds` for a finite positive delta, then `renderFrame(1, shouldDraw())`, `updateProbe()` and returns. The sim driver is never called, `handleChartActions` and `handleSaveScreenActions` are never reached, and nothing ends the branch (D-06).
  - `settings-controller.ts`: `pause()` has a branch after the `currentState === undefined` one (clear held input, return); `resume()` returns first when latched.
  - `chart-controller.ts`: `ctx.runtime.gameOver` beside the `paused` refusal in `setChartCamera`, `toggleChartPreset`, `openChart` and `handleFind`, and as the first statement of `selectChartSystem`.
- **Which test proves which mechanism** (review round 1, Fable):
  - The loop reset: "the loop reset stops the lethal frame" owes five steps with the death on step 2 (the ram scene of `death.test.ts` through the real sim driver, router and its default death flow; the death tick is measured, never a literal) and counts exactly two `stepFlight` calls and two controller updates, no `docked` event, no autosave and no launch advance. It passed at RED already, because the loop reset is 20-04's.
  - `stepOnce`'s early return: "stepOnce on a dead state changes nothing", a direct call made after a gate (`mode === "dead"` and the latch asserted first), asserting the tick, `hashFlight`, `previousPose`/`currentPose` identity, the dispatched events, the controller calls, the log and the launch advances unchanged. It failed at RED on the pose identity, and passes only through the early return.
  - The `advanceTicks` break: "advanceTicks across the death returns the death tick and steps no further" (the step callback ran exactly up to the death) and "advanceTicks refuses while latched" (no taint, no drain, no step).
- **The one-sequence refusal case** (review round 1, Kimi): in `chart-controller.test.ts`, one latched session runs `focusLost()`, `enterContextLoss()`, `openChart()`, `pause()`, `resume()`, `exitContextLoss()` and `selectChartSystem(...)` with a real settings controller and chart controller on one context, and ends with `paused` false, `chartOpen` false, no selection or hyperspace target, the pause overlay never shown (no `show`, no `setPaused`) and the latch still set.
- **Non-vacuous refusals.** Several guards protect a state the latch makes unreachable (a chart open while dead, a session paused when it dies). Each has its own case on a hand-forced state (a chart forced open, a session paused before the latch is set) so the refusal is proven by the path that reaches it, not by the flag it also checks.
- **The `?clock=manual` clock.** Every game-over frame case runs both in real time and under `?test=1&clock=manual`; the presentation clock advances by wall delta in both.

## Task Commits

1. **Task 1: the frozen sim driver and frame loop (tracer)** - `56c76e9` (test), `ac70f16` (feat)
2. **Task 2: pause, focus loss, context loss and chart refusals** - `9f9cdce` (test), `3544741` (feat)

**Plan metadata:** the commit holding this SUMMARY (docs: complete plan).

## TDD Gate Compliance

Each task has a `test(20-06)` commit before its `feat(20-06)` commit; no REFACTOR commit.

- **Task 1 RED** `56c76e9`: targets the nine failing cases of `a dead session` (`stepOnce on a dead state changes nothing`; the three frame cases under each clock; both `advanceTicks` cases). Semantic assessment: each executed and failed on its planned assertion: the direct `stepOnce` call shifted `previousPose` (identity changed), the later-frame cases called `advanceFrame` three times and left `gameOverSeconds` at 0 and the queued launch undrained, `advanceTicks` returned a tainted session and stepped 89 ticks past the death. The scene's own sanity case and the loop-reset case passed at RED by design (the reset is 20-04's), so they are not RED evidence. The format-based `gsd_run check tdd-red-evidence` classifier was not run (no TAP reporter output was captured; the plan type is `execute`, not `tdd`). GREEN `ac70f16`; tracer gate: the targeted Vitest and typecheck were re-run end to end after the GREEN and passed before Task 2 started.
- **Task 2 RED** `9f9cdce`: twelve failing cases. Semantic assessment: each failed on the planned assertion (`paused` true or an overlay shown, a chart opened or a selection made under the latch). The `focusLost` case with `pauseOnFocusLoss` off already held (it only clears input). GREEN `3544741`.

## Files Created/Modified

See `key-files`. Other files named in the plan's context (`render-driver.ts`, `probe-publisher.ts`, `context.ts`, `event-router.ts`, `main.ts`, `game-session.ts`, `start-session.ts`) are untouched.

## Decisions Made

- The plan's two pinned counts moved with the new branch: the `pending.length = 0;` count in `sim-driver.test.ts` is now 5 (the game-over branch is the new site), and the redraw-gate pin in `tests/app/redraw-gate.test.ts` lists a second gated call site, `renderFrame(1, shouldDraw()`, in the frame loop.
- The arrow, confirm and find-focus chart actions are not gated by the latch: each requires `chartOpen`, which cannot be true while latched (the death flow closes the chart, `openChart` refuses).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two pinned source-text tests moved with the new branch**
- **Found during:** Task 1 (GREEN run)
- **Issue:** `tests/app/session/sim-driver.test.ts` ("keeps four `pending` resets") counted four `pending.length = 0;` sites and `tests/app/redraw-gate.test.ts` ("asks the gate in exactly one place") listed a single gated `renderFrame(alpha, shouldDraw()` site; the game-over branch adds one of each, as the plan specifies.
- **Fix:** the first count is 5 with the new site named in its comment; the second pin counts `renderFrame(1, shouldDraw())` once and lists the extra site in the sorted set. `redraw-gate.test.ts` is not in `files_modified`.
- **Files modified:** `tests/app/session/sim-driver.test.ts`, `tests/app/redraw-gate.test.ts`
- **Verification:** `tests/app` and `tests/guards` pass.
- **Committed in:** `ac70f16`

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** two test pins updated; no scope creep.

### Mode-gate tripwire

`tests/guards/dead-mode-gates.test.ts` (20-02) passes unchanged: the only mode comparison added is one positive `mode === "dead"` in `sim-driver.ts`, a file already on the list (negative count 2, unchanged); `settings-controller.ts`, `chart-controller.ts` and `frame-loop.ts` compare no mode literal beyond the pinned ones.

## Plan-boundary verification

- `docker compose run --rm test` (HEAD `3544741`): 285 of 287 files and 7502 of 7504 tests passed first; the two failures were load-induced timeouts (`tests/guards/tools-determinism.test.ts` Math.sin lint probe at 30 s and the known `tools/oolite-ingest/convert/textures.test.ts` flake at 5 s) and both files passed on an immediate rerun on an idle machine (2 files, 25 tests, exit 0). `tests/app` and `tests/guards` also passed as targeted runs (56 files, 1110 tests).
- `docker compose run --rm lint` (eslint and prettier): exit 0.
- `docker compose run --rm typecheck`: exit 0 after each task.
- Remote `wegolite-remote-run.sh run --rm verify`: `snapshot 3544741`, `exit=0 elapsed=203s` (lint, typecheck, content drift, 287 unit test files and 7504 tests, build, e2e smoke subset: 28 passed).
- Twin literals (`tick-parity.test.ts`, `tests/e2e/combat.spec.ts`) are untouched.

## Known Stubs

None.

## Threat Flags

None. No new network, auth, file or storage surface; T-20-17, T-20-18, T-20-19 and T-20-40 are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

20-07 wires the overlay into the death flow and 20-08 reads `ctx.runtime.gameOverSeconds` for the fade and the dead camera: the presentation clock now advances on every game-over frame (wall time, clamped, also under the manual clock). The real render driver's behaviour on a dead state (HUD, hints, the draw) is first exercised by 20-08; this plan's frame cases use a recording `renderFrame`.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*

## Self-Check: PASSED

The four modified source files and four test files exist, the four task commits (`56c76e9`, `ac70f16`, `9f9cdce`, `3544741`) are ancestors of HEAD (`commits: 4` measured from `d359bd8`), the working tree held only this SUMMARY, and every acceptance criterion of Tasks 1 and 2 was run and passed (`mode === "dead"` 1, `runtime.gameOver` 2 in `sim-driver.ts`, `gameOverSeconds` 2 in `frame-loop.ts`, `gameOver` 12 in `sim-driver.test.ts`, the early-return case title once, `runtime.gameOver` 2 in `settings-controller.ts` and 5 in `chart-controller.ts`).

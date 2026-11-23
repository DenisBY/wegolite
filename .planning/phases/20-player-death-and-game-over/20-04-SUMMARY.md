---
phase: 20-player-death-and-game-over
plan: 04
subsystem: app-session
tags: [player-death, session-latch, save-refusal, input-context, explosion, event-router]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-01: playerDestroyed, killPlayer, the dead FlightMode and the snapshotForSave refusal; 20-11: ExplosionAddOptions (variant, flash, kind) and the pool of 16"
provides:
  - "playerDestroyed routed to deathFlow (seventh subscriber, 25 routed kinds)"
  - "SessionRuntime.gameOver, gameOverSeconds, gameOverCause and latchGameOver: the latch set synchronously inside the dispatch"
  - "createDeathFlow(ctx, deps?), DeathFlowDeps, PLAYER_EXPLOSION_FACTOR (4), PLAYER_EXPLOSION_SETTINGS"
  - "save skip reason dead at autosave, manualSave, writeManualSave, loadFromSave, clearSaveForNewGame, buildSnapshotInputs and queueSnapshot"
  - "InputContext gameOver: no action fires, F1 to F8 swallowed"
affects: [20-05, 20-06, 20-07, 20-08, 20-09, 20-10]

plan_head_before: 187167433a9d0246bc4b0cdeb38dcf7c71593b11
plan_head_after: d84cc85
actuals:
  tokens: 21000
  tasks: 3
  commits: 6

tech-stack:
  added: []
  patterns:
    - "router-installed default subscriber (the worldLifecycle precedent) so the latch cannot be dropped by a wiring"
    - "latch checked first in every save producer, then again in the snapshot builders (three layers)"

key-files:
  created:
    - tests/app/session/death-flow.test.ts
  modified:
    - src/app/session/context.ts
    - src/app/session/event-router.ts
    - src/app/session/save-controller.ts
    - src/app/game-session.ts
    - src/input/actions.ts
    - src/input/keyboard.ts
    - tests/app/session-order.test.ts
    - tests/app/session/save-controller.test.ts
    - tests/input/station-actions.test.ts

key-decisions:
  - "The router installs createDeathFlow(ctx) when no deathFlow is supplied, so the latch is never optional (T-20-11)"
  - "The pre-death write's completion sets saveSkipReason to dead (not blank) while latched, so a late commit cannot hide the refusals that followed"
  - "The gameOver input context swallows F1 to F8 in keyboard.ts itself, because F7 has no binding and would otherwise return false"
  - "PLAYER_EXPLOSION_SETTINGS is a restated, frozen copy of the compiled default ship explosion, pinned to explosions.json by a drift test"

requirements-completed: [DEATH-01, DEATH-06]

coverage:
  - id: D1
    description: "A real lethal tick dispatched through the router latches the session inside the dispatch (gameOver, gameOverSeconds 0, the event's cause), with no deathFlow supplied; a second event changes nothing"
    requirement: DEATH-06
    verification:
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#the latch (DEATH-06: latch before guards)"
        status: pass
      - kind: unit
        ref: "tests/app/session-order.test.ts#the pinned subscriber order and routing table"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every save producer and path refuses a latched session with skip reason dead, checked first; same-frame and pending-write races keep the pre-death anchor and the dead reason"
    requirement: DEATH-06
    verification:
      - kind: unit
        ref: "tests/app/session/save-controller.test.ts#a latched session refuses every save path (DEATH-06, D-12)"
        status: pass
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#a latched session refuses every save attempt as dead (DEATH-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The death flow closes the chart and the F2 screen, then sets the gameOver context, clears messages, resets the launch sequence and hides the HUD canvas, once"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#the death flow shuts the session down around the frozen world (D-08, D-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The player's explosion is eight adds at 1x the collision radius (four small, four big, variants 1 to 8, one flash on the first, flash passed explicitly on all eight) with PLAYER_EXPLOSION_SETTINGS, traffic on or off"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/death-flow.test.ts#the player's explosion (D-01 as amended, D-01a, D-01b)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The gameOver input context fires no action and swallows F1 to F8"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/input/station-actions.test.ts#the gameOver context (D-07)"
        status: pass
    human_judgment: false
  - id: D6
    description: "How the explosion and the dead view look and feel in the game (cloud form, timing, flash) is first visible once 20-07 and 20-08 land"
    verification: []
    human_judgment: true
    rationale: "Nothing draws the dead view or the overlay yet; the visual result is judged at the phase's UAT, not by a unit test"

duration: 75min
completed: 2026-11-23
status: complete
---

# Phase 20 Plan 04: Death latch, save refusals and death flow Summary

**`playerDestroyed` reaches one subscriber, `deathFlow`, which latches the session synchronously inside the dispatch, shuts the session down around the frozen world and adds Oolite's eight-burst player explosion; every save path now refuses a latched session first with the skip reason `dead`, and a `gameOver` input context makes every key inert.**

## Performance

- **Duration:** about 75 min (the full `test` run is about 9 min)
- **Started:** about 2026-11-23T17:15Z
- **Completed:** 2026-11-23T18:30Z
- **Tasks:** 3 (one tracer, two auto; all TDD with a RED commit before the GREEN commit)
- **Files modified:** 10 (1 created)

## Accomplishments

- **Latch placement.** `ctx.runtime.gameOver` is set by `latchGameOver` inside the dispatch of the lethal tick's `playerDestroyed`, before the dispatch returns; it also sets `gameOverSeconds` 0 and `gameOverCause`, resets the loop accumulator and clears held input. The router builds `createDeathFlow(ctx)` when no `deathFlow` is supplied (the `worldLifecycle` precedent), so no wiring can drop the latch. A second event returns at the latch and repeats nothing.
- **Three refusal layers.** (1) `autosave`, `manualSave`, `writeManualSave`, `loadFromSave` and `clearSaveForNewGame` each refuse a latched session first with `saveSkipReason = "dead"` (in `autosave`/`manualSave` after `saveAttempts += 1` and before `recovering`, `tainted` and the status reasons). (2) `buildSnapshotInputs` returns `undefined` and `queueSnapshot` returns without counting, for a latched session or a dead state. (3) behind them, 20-01's `snapshotForSave` still throws for a dead state. The load and clear refusals return before any read, install or clear (T-20-41).
- **Late completions.** A write queued before the lethal step commits as the pre-death anchor; its completion sets `saveSkipReason` to `dead` while latched instead of clearing it (review round 1, Kimi). The race tests pin this for a refused attempt before the completion and for none.
- **Routing pins.** `EVENT_SUBSCRIBER_ORDER` has seven names (`deathFlow` last), `ROUTED_EVENT_KINDS` 25 (`playerDestroyed: ["deathFlow"]`); `tests/app/session-order.test.ts` pins moved with them, the per-kind offering test passes `deathFlow`, and the reserved pass-through loop skips `playerDestroyed`.
- **Death flow.** With deps it closes the chart and the F2 screen (both restore a saved context, so the `gameOver` context is set after them), clears the message queue, resets the launch sequence, hides the HUD canvas, then adds the explosion to the live scene (nothing when there is no scene). Wired in the facade as `deathFlow: createDeathFlow(ctx, { closeChart, closeSaveScreen, launchSequence, hudCanvas, messages })`.
- **The explosion.** Eight `explosions.add` calls at the event's position, radius `PLAYER_COLLISION_RADIUS_M` (1x, nothing scaled by the factor), setting `PLAYER_EXPLOSION_SETTINGS`, the current flight time, and 20-11's options: `{ kind: "small", variant: 1, flash: true }`, `{ kind: "small", variant: 2..4, flash: false }`, `{ kind: "big", variant: 5..8, flash: false }` (`PLAYER_EXPLOSION_FACTOR` = 4 per Oolite's two loops at `ShipEntity.m:8311-8314` and `8317-8320`). `flash` is passed on every add and the options are asserted with `toStrictEqual`, so an omitted `flash` (default true) fails. No speed, lifetime or size is written here; they are 20-11's constants.
- **`PLAYER_EXPLOSION_SETTINGS`.** A frozen restatement of the compiled `oolite-default-ship-explosion` record without its key, pinned deep-equal to `src/content/generated/explosions.json` by a Vitest case. It is used with traffic on or off (defensive today: no lethal record exists with traffic off; the orchestrator's decision of 2026-11-22, not an owner decision). The boot load, `explosions.ts`, `trafficContent` and the `shipDestroyed` arm are unchanged, so a traffic-off cold start still requests no explosion chunk.
- **Input.** `InputContext` gains `gameOver`; no action lists it, so every flight binding, `KeyP`, `Escape`, the fire key and `Space` queue nothing and `frame()` is the zero frame; F1 to F8 (F5 included) return handled and fire nothing.

## Task Commits

1. **Task 1: latch and routing (tracer)** - `e9e11c6` (test), `5c2d655` (feat)
2. **Task 2: save refusals and the gameOver context** - `941d992` (test), `2bc42cb` (feat)
3. **Task 3: full death flow and explosion** - `24bd1bc` (test), `d84cc85` (feat)

**Plan metadata:** the commit holding this SUMMARY (docs: complete plan).

## TDD Gate Compliance

Each task has a `test(20-04)` commit before its `feat(20-04)` commit; no REFACTOR commit. RED evidence records live in the ignored `.gsd/tdd-evidence/20-04/` of the worktree (the classifier returned `RED_EVIDENCE_OK`, `target_test_failed`, for each target).

- **Task 1 RED** `e9e11c6`: target `the latch > a real lethal tick dispatched through a router with no deathFlow latches the session`. Semantic assessment: it executed and failed on its planned first assertion (`ctx.runtime.gameOver` is `undefined`, expected `false`) because the session had no latch field; the routing pins failed on the planned 7-name order and 25-kind table, and the autosave cases failed on the planned `dead` reason (got `recovering`/a second write). GREEN `5c2d655`. Tracer gate: the targeted Vitest and typecheck were re-run end to end after the GREEN and passed before Task 2 started.
- **Task 2 RED** `941d992`: target `a write pending at the death completes as the anchor and leaves the dead reason in place`. Semantic assessment: it failed on the planned assertion that `saveSkipReason` stays `dead` after the pre-death completion (it was cleared to `""`); the other eight latched-session cases failed on the planned refusals (a write, a snapshot, a read and a clear that must not happen), and the input F-key case failed on F7 returning `false`. GREEN `2bc42cb`.
- **Task 3 RED** `24bd1bc`: target `adds eight clouds, four small then four big, each at one collision radius, one flash on the first`. Semantic assessment: it failed on its planned first assertion (`PLAYER_EXPLOSION_FACTOR` `undefined`, expected 4) because the flow took no deps and had no explosion; the death-flow, traffic-on and drift-pin cases failed for the same reason. GREEN `d84cc85`.

## Files Created/Modified

See `key-files`. Other files named in the plan (`src/persistence/*`, `src/content/*`, `src/render/*`, `start-session.ts`, `traffic.ts`) are untouched.

## Decisions Made

- The death flow's `deps` argument is optional so the router's default stays latch-only; the facade always supplies it.
- `closeChart` and `closeSaveScreen` run before `setContext("gameOver")` because both restore a saved input context; the last context change is `gameOver` (pinned by an ordered log).
- F-key swallowing lives in `keyDown` (`context === "gameOver"` returns `RESERVED_F_KEYS.has(code)` before the binding lookup), not in the action table, so F7 (no binding) is also handled.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `src/input/keyboard.ts` edited though not in `files_modified`**
- **Found during:** Task 2 (RED run of the input case)
- **Issue:** the plan's behaviour requires F1 to F8 handled in the `gameOver` context, but `keyDown` returns `false` for a code with no binding (F7), before the reserved-key check, so a type addition to `actions.ts` alone could not satisfy it.
- **Fix:** one early return in `keyDown`: `if (context === "gameOver") return RESERVED_F_KEYS.has(code);`. No other context is affected.
- **Files modified:** `src/input/keyboard.ts`
- **Verification:** `tests/input/station-actions.test.ts` (the `gameOver` describe) and the whole input suite pass.
- **Committed in:** `2bc42cb`

**Total deviations:** 1 auto-fixed (Rule 3). **Impact:** one early-return line; no scope creep.

### Process notes

- **Harness location.** Task 1's behaviour asks for the save-controller harness; `death-flow.test.ts` carries its own small harness (real router and real controller on one context, a recording store) so the lethal-tick scenarios run through both, while the controller-level refusals, races and the load and clear cases sit in `save-controller.test.ts` with its existing harness.
- **Plan-head ledger.** The shared git directory is outside the worktree and the sandbox refused writes to it, so the `gsd-plan-head-before-20-04` ledger was not created; `plan_head_before` is the verified spawn base `1871674` and `commits` is measured with `git rev-list --count 187167433a9d0246bc4b0cdeb38dcf7c71593b11..HEAD` (6 task commits at SUMMARY time).
- **Gate tripwire.** `tests/guards/dead-mode-gates.test.ts` (20-02, same wave) is not in this worktree; the only mode comparisons added are two positive `=== "dead"` tests in `save-controller.ts`, a file that already compares a mode literal. `event-router.ts` compares none.

## Plan-boundary verification

- `tests/guards` (20 files, 309 tests) passed after Task 1 (`player-death-producer`, `ship-hit-consumers`, `kill-credit-consumers`, `entity-id-scope` unchanged).
- Per task: the targeted Vitest commands of the plan and `typecheck` exit 0.
- Twin literals (`tick-parity.test.ts`, `tests/e2e/combat.spec.ts`) unchanged and green in the full run.
- `docker compose run --rm test` (HEAD `d84cc85`): 275 of 282 files and 7388 of 7395 tests passed; the seven failures were all load-induced timeouts (`sim-determinism-bans` 120 s, `tools-determinism` 30 s, `tick-flyers`, `kill.property`, `attack-dispatch`, `static-hulls`, `textures` at 5 s) and all seven files passed on an immediate rerun (7 files, exit 0) with the full run sharing the machine with other executors. The run exited 1 only because of those timeouts.
- `docker compose run --rm lint` (eslint and prettier): exit 0.
- `docker compose run --rm typecheck`: exit 0 after each task.
- Remote `wegolite-remote-run.sh run --rm verify`: `snapshot d84cc85`, `exit=0 elapsed=202s` (lint, typecheck, content drift, unit tests, build, e2e smoke subset: 28 passed).

## Known Stubs

None. The dead view, the overlay and the frame loop's game-over branch are later plans (20-05 to 20-08) by design; `gameOverSeconds` is advanced by 20-06.

## Threat Flags

None. No new network, auth, file or storage surface; T-20-10, T-20-11, T-20-12 and T-20-41 are mitigated as planned.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

20-05 (overlay) and 20-06 (frame loop, pause, chart refusals) can read `ctx.runtime.gameOver`, `gameOverSeconds` and `gameOverCause`; 20-07 adds the overlay to `createDeathFlow`'s deps. The intermediate state (a player can die with no game-over view until 20-07) stays unpushed until the phase gate, as the owner accepted.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*

## Self-Check: PASSED

The created and modified files exist, the six task commits (`e9e11c6`, `5c2d655`, `941d992`, `2bc42cb`, `24bd1bc`, `d84cc85`) are in the `git log` of `187167433..HEAD` (`commits: 6` measured), and every acceptance criterion of Tasks 1 to 3 was run and passed (the render, content, `start-session.ts` and `traffic.ts` diffs against the base are empty).

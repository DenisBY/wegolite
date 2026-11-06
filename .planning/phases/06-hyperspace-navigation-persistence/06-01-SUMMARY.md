---
phase: 06-hyperspace-navigation-persistence
plan: 01
subsystem: simulation
tags: [hyperspace, oolite-fidelity, fixed-timestep, deterministic, fnv1a32]

requires:
  - phase: 05-docked-economy-station-screens
    provides: market generator, seed derivation and the docked/in-flight state seams
  - phase: 03-flight-model
    provides: FlightState, stepFlight step order and terminalTransition
provides:
  - Oolite-exact integer chart distance, fuel cost and jump time
  - the 1800-step (15 s) fixed-step countdown with zero-cost abort
  - deterministic per-route witchpoint arrival pose
  - arrival market seed chaining for the destination market
  - FlightState countdown/target fields and the hyperspace command/event seam
affects: [06-02 save schema v2, 06-03 chart model, 06-04 session wiring, 06-05 save/load UI]

actuals:
  tokens: 14090
  tasks: 3
  commits: 4
  plan_head_before: 54ecd65d2858ec29b9b6455a20a9d17fe6bc10ee
  plan_head_after: 19f1725359838b7c948961dcecb4d2e7310c8b3c

tech-stack:
  added: []
  patterns:
    - Integer-derived simulation arithmetic with a single pure owner module
    - Fixed-step countdown encoded as integer steps, committed by terminalTransition
    - Deterministic hash-sliced pose instead of a global random draw

key-files:
  created:
    - src/sim/hyperspace/jump.ts
    - src/sim/hyperspace/countdown.ts
    - src/sim/hyperspace/arrival.ts
    - tests/sim/hyperspace.test.ts
    - tests/sim/hyperspace-arrival.test.ts
  modified:
    - src/sim/economy/market.ts
    - src/sim/flight/state.ts
    - src/sim/flight/step.ts
    - src/sim/commands.ts
    - src/sim/events.ts
    - tests/sim/economy/market.test.ts

key-decisions:
  - "Distance and every derived value stay integer: fuelCost is 4*dist (1 at dist 0) and jumpTimeSeconds is 576*dist^2, never the 0.4*dist display float."
  - "canStartJump reports malformed fuel as insufficient fuel and malformed coordinates as too far, and never throws, so the fixed step loop cannot die on a forged step option."
  - "The countdown stores integer steps and skips its first tick, so the commit lands exactly 1800 steps after the draining step; only the commit sets terminalTransition."
  - "A commit clears the countdown snapshot and skips step 6 docking because the arrival pose belongs to the destination layout."
  - "Arrival uses one FNV-1a word per route: low 16 bits give the magnitude, high 16 bits the angle, and 8-bit slices give the near-identity tilt."
  - "The arrival offset is on X/Z because the planet lies on -Z; an X/Y offset would leave the horizontal scanner plane."

patterns-established:
  - "Pure hyperspace arithmetic in src/sim/hyperspace with no Three, DOM, content runtime import, clock or global random source."
  - "Read-only per-step facts travel through StepOptions (hyperspace beside equipment); fuel never enters FlightState."
  - "Countdown start/tick/cancel/commit use the existing command drain and terminalTransition contract rather than an app timer."

requirements-completed: [WORLD-06, NAV-01, NAV-03, NAV-04, NAV-05, NAV-06]

coverage:
  - id: D1
    description: "Oolite-exact integer chart distance, 4*dist fuel cost and 576*dist^2 jump time, pinned by the five route fixtures and the Legees->Laeden truncation discriminator"
    requirement: "WORLD-06"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace.test.ts#Oolite chart arithmetic"
        status: pass
    human_judgment: false
  - id: D2
    description: "The start predicate (target, 17-unit range, integer fuel gate) and the exact 1800-step countdown, abort and commit inside stepFlight"
    requirement: "NAV-04"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace.test.ts#fixed-step hyperspace countdown"
        status: pass
    human_judgment: false
  - id: D3
    description: "Deterministic per-route witchpoint arrival pose, clamped to the safety/scanner bounds and free of random or clock sources"
    requirement: "NAV-05"
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace-arrival.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Deterministic arrival market seed chained from the destination and the previously installed seed"
    requirement: "NAV-05"
    verification:
      - kind: unit
        ref: "tests/sim/economy/market.test.ts#arrival market seed"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-11-06
status: complete
---

# Phase 6 Plan 1: Hyperspace Core Summary

**Oolite-exact integer jump math, an abortable 1800-step countdown, and a deterministic per-route witchpoint arrival pose**

## Performance

- **Duration:** 16 min
- **Started:** 2026-11-06T17:16:00Z
- **Completed:** 2026-11-06T17:32:16Z
- **Tasks:** 3
- **Files modified:** 11

## Accomplishments

- `src/sim/hyperspace/jump.ts` is the single owner of Oolite's chart arithmetic: `Math.trunc` y-halving, `4 * dist` fuel (1 at dist 0) and `576 * dist^2` jump time. All five route fixtures pass, including `Legees -> Laeden` as dist 0, and `chartDistance` throws `RangeError` rather than returning a non-finite distance.
- `canStartJump` refuses a missing/current target, `dist > 17` and an under-fuelled tank with the exact `no target | too far | insufficient fuel` union; it accepts exactly `fuel === cost` and `dist === 17` and never throws on malformed step options.
- `FlightState` gains `hyperspaceCountdown` and the countdown target snapshot in a fixed serialization order; `beginHyperspace`/`cancelHyperspace` are payload-free and the four hyperspace events carry data only.
- `stepFlight` ticks the countdown after the speed/position step and commits exactly 1800 steps after the drain: `clockSeconds` gains exactly `46656`/`46656`/`112896`/`166464` with no extra `DT`, the commit step skips docking, a docked begin is inert, a refused/cancelled jump adds zero jump time, and a changed target cancels the countdown.
- `src/sim/hyperspace/arrival.ts` derives the offset magnitude, angle and near-identity tilt from one FNV-1a word, clamps every galaxy-0 destination to `[witchpoint.radius + 750, scannerRange / 2]`, and sets speed `min(maxSpeed, 50)`, rates 0, torus off, mode `inFlight`, `dockArmed` false and `launchElapsed` 0.
- `arrivalMarketSeed(targetId, previousSeed)` chains the destination with the installed seed, ready for plan 06-04's arrival market regeneration.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure integer jump math and the countdown contract** - `c84098e` (feat)
2. **Task 2: FlightState, commands/events, countdown tick/commit and exact clock** - `28d2c71` (feat)
3. **Task 3: Deterministic witchpoint arrival pose** - `d9cc4f8` (feat)
4. **Formatting follow-up** - `19f1725` (style)

**Plan metadata:** committed separately after this summary.

## Files Created/Modified

- `src/sim/hyperspace/jump.ts` - Oolite chart distance, fuel cost, jump time and the exact-identity helper.
- `src/sim/hyperspace/countdown.ts` - 1800-step constant, `canStartJump` refusal union and countdown rounding.
- `src/sim/hyperspace/arrival.ts` - deterministic witchpoint pose and route word.
- `src/sim/economy/market.ts` - `arrivalMarketSeed` beside `marketSeedForSystem`.
- `src/sim/flight/state.ts` - countdown and target snapshot fields, init and serialization.
- `src/sim/flight/step.ts` - `StepOptions.hyperspace`, start/cancel/refusal, tick 4b, terminal commit and the docking guard.
- `src/sim/commands.ts` - `beginHyperspace` / `cancelHyperspace`.
- `src/sim/events.ts` - countdown started/cancelled, jumped and refused events plus the refusal union.
- `tests/sim/hyperspace.test.ts` - fixtures, discriminators, refusal table and the real step-loop countdown proofs.
- `tests/sim/hyperspace-arrival.test.ts` - determinism, reversal, clamp for all 256 destinations, pose checklist and source scan.
- `tests/sim/economy/market.test.ts` - arrival seed stability, difference and exact FNV word.

## Decisions Made

- `fuelCost = dist === 0 ? 1 : 4 * dist` and `jumpTimeSeconds = 576 * dist * dist` are the only fuel/time identities; the `0.4 * dist` display float is never a fuel or clock input.
- Malformed step facts are refusals, not throws: `canStartJump` maps non-finite coordinates to `too far` and a bad tank to `insufficient fuel`, so a forged option cannot kill the frame.
- The countdown skip-first-tick encoding (`HYPERSPACE_COUNTDOWN_STEPS` set on the drain step, `startedThisStep` suppresses 4b) pins the observable "commit exactly 1800 steps later".
- Only the commit sets `terminalTransition`; refusal and cancel leave the ordinary `DT` as the tick's clock effect, which the tests measure against a control run.
- Arrival offsets on X/Z (planet on -Z), not X/Y as the research sketch showed; this keeps the ship on the horizontal scanner plane as the task action requires.
- `jumpTimeSecondsForDist(dist)` was added so the commit path and `jumpBetween` share the exact identity without re-reading coordinates absent from the snapshot.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test asserted exact float equality for `distanceLy`**
- **Found during:** Task 1 (jump fixtures)
- **Issue:** `14 * 0.4` is `5.6000000000000005`, so the route table's exact `5.6` row failed; the implementation was correct, the assertion was not.
- **Fix:** Compare `distanceLy` with `toBeCloseTo(..., 10)` while keeping `dist`, fuel and jump time exact integer assertions.
- **Files modified:** `tests/sim/hyperspace.test.ts`
- **Verification:** all 39 Task 1 tests pass.
- **Committed in:** `c84098e` (Task 1 commit)

**2. [Rule 2 - Missing Critical] Share the exact jump-time identity with the commit path**
- **Found during:** Task 2 (countdown commit)
- **Issue:** the snapshot holds `{ id, dist, fuelCost }` but no coordinates, so `jumpBetween` cannot be called at commit; duplicating `576 * dist * dist` in `step.ts` would create a second identity.
- **Fix:** exported `jumpTimeSecondsForDist(dist)` from `jump.ts` and used it in both `jumpBetween` and the commit.
- **Files modified:** `src/sim/hyperspace/jump.ts`, `src/sim/flight/step.ts`
- **Verification:** the four commit clock deltas are exact and the full suite is green.
- **Committed in:** `28d2c71` (Task 2 commit)

**3. [Rule 1 - Bug] Arrival near-identity assertion was too strict**
- **Found during:** Task 3 (arrival checklist)
- **Issue:** Oolite's `(rnd - 128) / 1024` tilt can reach ~0.124 per component, so the normalised `w` is ~0.993, not >0.999.
- **Fix:** assert `w > 0.95` and each vector component `< 0.15`, which still proves near identity and unit length.
- **Files modified:** `tests/sim/hyperspace-arrival.test.ts`
- **Verification:** all 10 arrival tests pass.
- **Committed in:** `d9cc4f8` (Task 3 commit)

**4. [Rule 3 - Blocking] Prettier formatting gate**
- **Found during:** plan-level verification
- **Issue:** `npm run lint` failed `prettier --check` on three new/changed files.
- **Fix:** ran Prettier on exactly those files; formatting only, no semantic change.
- **Files modified:** `src/sim/economy/market.ts`, `src/sim/hyperspace/countdown.ts`, `tests/sim/hyperspace.test.ts`
- **Verification:** `docker compose run --rm lint` is green.
- **Committed in:** `19f1725` (formatting follow-up)

---

**Total deviations:** 4 auto-fixed (2 test-correctness, 1 shared-identity refactor, 1 formatting).
**Impact on plan:** All necessary for correctness or the green gate; no scope creep and no behavioural change beyond the plan.

## Issues Encountered

- The first full `docker compose run --rm test` run timed out on the pre-existing `tests/guards/content-boundary.test.ts` "removes the probe even when the body throws" case (Vitest 5 s default while the guard spawns `tsc`/ESLint under load). The file passes in isolation (25.8 s) and the full suite passed on a clean re-run (990/990). Not caused by this plan's files and not modified.

## User Setup Required

None - no external service configuration required.

## Verification Evidence

- `docker compose run --rm test npx vitest run tests/sim/hyperspace.test.ts tests/sim/hyperspace-arrival.test.ts tests/sim/economy/market.test.ts` → 3 files, 62 tests passed.
- `docker compose run --rm typecheck` → both `tsconfig.json` and `tsconfig.sim.json` clean.
- `docker compose run --rm test npx vitest run tests/guards/sim-purity.test.ts` → 9 tests passed (the `src/sim/**` zone covers the new directory).
- `docker compose run --rm test` (full unit suite) → 84 files, 990 tests passed.
- `docker compose run --rm lint` → ESLint and Prettier clean.
- `rg -n "Math.trunc|4 \* dist|576 \* dist \* dist" src/sim/hyperspace/jump.ts` finds the y-halving, the truncation and both exact identities.

## Next Phase Readiness

- Plan 06-02 can bump the save schema to v2 and consume `arrivalMarketSeed`; fuel is passed read-only through `StepOptions.hyperspace` and never enters `FlightState`.
- Plan 06-03's chart readout should use `jumpBetween` for distance/fuel and `MAX_JUMP_DIST` for reachability, never a float.
- Plan 06-04 owns the app wiring: map a second H press to `cancelHyperspace`, forward `hyperspaceCountdownStarted/Cancelled/Refused` copy, and on `hyperspaceJumped` deduct the integer `fuelCost` and install `applyWitchpointArrival`.
- No blockers. The only open judgement is the equivalents of NAV-01/03/06 boundaries already pinned by tests (`dist 17` accepted, `fuel === cost` accepted, dist 0 costs 1 unit).

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-06*

## Self-Check: PASSED

All created files exist and all four task/follow-up commits are ancestors of HEAD.

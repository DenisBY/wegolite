---
phase: 13-views-lasers-and-shields
plan: 01
subsystem: app/session
tags: [world-lifecycle, hyperspace, foundation, torus, event-router]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: worldLifecycle begin/resume/end, inert populator, ship field mass lock
provides:
  - "begin() ends the origin world and clears the leg anchor on every refusal (FOUND-17, WR-01)"
  - "Controller-level scenario proving no origin ship survives a refused arrival"
  - "Oolite's 'Hyperspeed mass-locked.' for a running torus drive stopped by mass lock (IN-01)"
affects: [13-02, phase-13-weapons, phase-14]
actuals:
  tokens: 5100
  tasks: 2
  commits: 3
plan_head_before: 0a28a787134e2e0523fdd4f23c1bf23a9194c792
plan_head_after: ac84f651d63cdfc0190aa894e706a7bfcefb05e0
tech-stack:
  added: []
  patterns:
    - "Lifecycle owns the refusal: begin() clears world and anchor itself, the controller stays unchanged"
key-files:
  created: []
  modified:
    - src/app/session/world-lifecycle.ts
    - src/app/session/event-router.ts
    - src/sim/events.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session/hyperspace-controller.test.ts
    - tests/app/session-order.test.ts
    - CHANGELOG.md
    - .planning/todos/completed/2026-11-14-clear-world-when-arrival-begin-is-refused.md
key-decisions:
  - "FOUND-17 is fixed inside begin() (RESEARCH 'FOUND-17 fix site'), not by an end() call in handleHyperspaceJumped; resume() keeps leaving the world alone on a refusal."
requirements-completed: [FOUND-17]
coverage:
  - id: D1
    description: "A refused arrival begin() leaves no origin world: lifecycle.world and anchorNextEntityId are undefined, epoch unchanged"
    requirement: FOUND-17
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#a begin refused at the maximum epoch ends a populated world and its anchor (FOUND-17)"
        status: pass
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#a begin refused for a non-finite seed ends a populated world at a normal epoch (FOUND-17)"
        status: pass
    human_judgment: false
  - id: D2
    description: "After a refused arrival no origin ship is on the scanner, none mass-locks the torus, none builds a ship field that could block a jump"
    requirement: FOUND-17
    verification:
      - kind: integration
        ref: "tests/app/session/hyperspace-controller.test.ts#ends the origin world at the maximum live epoch"
        status: pass
    human_judgment: false
  - id: D3
    description: "A throwing populator still leaves epoch, world and anchor unchanged (build first, commit after)"
    requirement: FOUND-17
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#a begin whose populator throws rethrows and leaves epoch, world and anchor unchanged"
        status: pass
    human_judgment: false
  - id: D4
    description: "torusDisengaged with reason massLock prints 'Hyperspeed mass-locked.'; input and toggle keep 'Torus disengaged'"
    verification:
      - kind: unit
        ref: "tests/app/session-order.test.ts#the HUD-message kinds print their fixed copy"
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-11-14
status: complete
---

# Phase 13 Plan 01: Refused arrival ends the origin world Summary

**`begin()` now ends the world and clears the leg anchor on every refused arrival, proven by a controller-level scenario at epoch 4,294,967,294, and a mass-lock stop of a running torus drive prints Oolite's "Hyperspeed mass-locked."**

## Performance

- **Duration:** about 9 min (start 2026-11-14T22:49Z, end 22:58Z)
- **Tasks:** 2 of 2
- **Files modified:** 8 (238 insertions, 18 deletions)

## Accomplishments

- `createWorldLifecycle().begin()` sets `world` and `anchorNextEntityId` to undefined before returning on a refusal (epoch at 0xfffffffe, or a non-finite seed). The epoch is unchanged, `resume()` is unchanged, and the accepted path keeps "build first, commit after", so a throwing populator still leaves everything as it was. `hyperspace-controller.ts` was not touched.
- Controller-level FOUND-17 scenario in `hyperspace-controller.test.ts`: a real lifecycle at epoch 4,294,967,294 holding the 12 inert ships plus a ship beside a far player pose. The scenario is not vacuous: before the jump a `stepSim` step with the origin world mass-locks the torus and the ship field reports the lock, while the same pose with no world is clean. After `handleHyperspaceJumped`, `lifecycle.world` and the anchor are undefined, `npcContacts` is empty and a step with the lifecycle's world is not mass-locked. A second case confirms a failed destination build still leaves the origin world untouched.
- Verified red-to-green: with the old `begin()` the controller scenario and 6 lifecycle cases fail; with the fix all pass.
- IN-01: `torusDisengaged` with `reason: "massLock"` now prints "Hyperspeed mass-locked." (Oolite `PlayerEntity.m:2755-2758`); `input` and `toggle` keep "Torus disengaged". `tests/app/session-order.test.ts` pins both. The unreleased CHANGELOG `Changed` bullet was reworded and a `Fixed` entry added.
- The WR-01 todo moved to `.planning/todos/completed/` with a Resolution section and a "Still open" list (IN-02, IN-03, IN-04 as Phase 14 candidates).

## Task Commits

1. **Task 1 (tracer): refused arrival begin() ends the origin world** - `eb46161` (fix)
2. **Task 2: mass-lock wording and WR-01 todo closed** - `18ad886` (fix)
3. **Comment correction in `src/sim/events.ts`** - `ac84f65` (docs; see deviations)

## Verification

- `docker compose run --rm test npx vitest run` on the three plan test files: pass (world-lifecycle 57, hyperspace-controller 12, session-order 44 tests); all of `tests/app` also pass (29 files, 465 tests).
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: green.
- `docker compose run --rm verify`: exit 0 (lint, typecheck, content drift, unit tests, build, e2e smoke subset 27 passed).
- Acceptance greps: `world = undefined` appears 3 times and `anchorNextEntityId = undefined` 3 times in `world-lifecycle.ts`; `reason === "massLock"` appears in `event-router.ts`; the completed todo exists and the pending copy is gone.
- Tracer gate: the tracer `<verify>` passed end to end before expansion (auto, no human-check).

## Decisions Made

- The fix lives in `begin()` only, as the plan's RESEARCH directs, so the lifecycle is the single owner of the refusal. `resume()` refusals still leave the world alone (existing contract, still pinned by tests).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Existing lifecycle tests pinned the old refusal behaviour**
- **Found during:** Task 1
- **Issue:** Four cases in `world-lifecycle.test.ts` (non-finite seed, saturated epoch, refused-begin anchor, saturated-begin anchor) asserted that a refused `begin()` leaves the world or anchor in place, which is exactly the WR-01 behaviour being removed.
- **Fix:** Rewrote them to assert the new contract (world and anchor cleared, epoch kept, `resume` refusal unchanged) and moved the two new unit cases below `populateThree` so it is defined before use.
- **Files modified:** `tests/app/session/world-lifecycle.test.ts`
- **Commit:** `eb46161`

**2. [Rule 2 - Missing] Stale doc comment on `torusRefused`**
- **Found during:** Task 2
- **Issue:** The `SimEvent` comment in `src/sim/events.ts` said "Torus disengaged" is kept for a running drive, which is no longer true for a mass-lock stop.
- **Fix:** Comment-only correction; no behaviour change. This file is outside the plan's `files_modified` list, so it is noted here.
- **Files modified:** `src/sim/events.ts`
- **Commit:** `ac84f65`

**3. [Plan adaptation] Harness extended instead of a new one**
- The plan's controller scenario names `harness()`, which had no lifecycle. An optional `lifecycleEpoch` option (real lifecycle, traffic on, resumed at that epoch) and a `committedTraffic()` helper were added to it; existing callers are unaffected.

**Total deviations:** 2 auto-fixed (1 bug-pinning test update, 1 comment), 1 harness adaptation. **Impact:** none on scope or behaviour.

## Authentication Gates

None.

## Known Stubs

None.

## Threat Flags

None. T-13-01 (tampered epoch at the maximum) is mitigated: the refusal clears the world and anchor, and the controller scenario pins it.

## Issues Encountered

None.

## Next Phase Readiness

Ready for 13-02. A stale origin world can no longer reach the weapon code added by later plans. IN-02, IN-03 and IN-04 stay open as Phase 14 candidates (listed in the completed todo).

## Self-Check: PASSED

- Files modified exist on disk; commits `eb46161`, `18ad886` and `ac84f65` are ancestors of HEAD.
- All task acceptance criteria and plan verification commands re-run and pass.

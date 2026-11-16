---
phase: 13-views-lasers-and-shields
plan: 15
subsystem: sim/combat
tags: [ident, targeting, input-01, key-decisions, owner-pending, determinism]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-08 combat step (stepPlayerCombat, resolveShots, PlayerCombatState.identEngaged/identTarget, dockReset); 13-10 resolveShots with the world-step flag; 13-02 ident and untarget commands and keys"
provides:
  - "src/sim/combat/ident.ts: firstEntityTargetedByPlayer port, stepIdent (R, U, jump clear), updateIdentTarget (validate and acquire), identTargetSnapshot"
  - "SimEvent kinds identEngaged, identLocked { specKey }, identLost, identOff { wasEngaged }"
  - "Key Decisions rows: INPUT-01 migration, target station on KeyQ, D-04 and D-03 pending owner confirmation, ident id holder; amended input-filter row"
  - "13-CONTEXT.md block 'Advisor-recommended deviations, PENDING OWNER CONFIRMATION' for D-03 and D-04"
affects: [13-12, 13-13, 13-14]
requirements-completed: [INPUT-01]
actuals:
  tokens: 12500
  tasks: 2
  commits: 2
plan_head_before: adcf7a7c0a55f2987dd4fda779bbc1fccf028b83
plan_head_after: 5a665d9494700399e97b7f0b0103af1712a8f700
tech-stack:
  added: []
  patterns:
    - "Ident runs as two halves inside combat/step.ts: commands and the jump clear before the world step (stepPlayerCombat), validation and acquisition after it (end of resolveShots), so sim.ts is unchanged"
    - "Acquisition and validation run only on a tick that stepped the world, so the jump step never reads an old world's ids"
    - "The owner-pending rule sits in one branch of one function with one named test, so the literal alternative is a one-place change"
key-files:
  created:
    - src/sim/combat/ident.ts
    - tests/sim/combat/ident.test.ts
  modified:
    - src/sim/combat/step.ts
    - src/sim/events.ts
    - .planning/PROJECT.md
    - .planning/phases/13-views-lasers-and-shields/13-CONTEXT.md
key-decisions:
  - "D-04 (R while locked clears and re-acquires, U drops the lock) is implemented as Oolite's handleButtonIdent; recorded as an advisor-recommended deviation, PENDING OWNER CONFIRMATION. Literal alternative: the R-while-locked branch of stepIdent in src/sim/combat/ident.ts plus the D-04 cases of tests/sim/combat/ident.test.ts."
  - "D-03 (name-only lock message) recorded as an advisor-recommended deviation, PENDING OWNER CONFIRMATION. Literal alternative: the constant IDENT_LOCKED_TEMPLATE in src/app/session/event-router.ts (plan 13-12 Task 2) plus its expectation in tests/app/session-order.test.ts."
  - "The ident target id lives only in PlayerCombatState and is cleared at dock, at jump commit and by a fresh combat state on Load or Continue; recorded as a Key Decisions row (per-world id scope holder)."
  - "A lock at exactly 25,600 m from the player is kept (Oolite loses it only when the squared distance exceeds the range squared); acquisition uses the strict 25,500 m radius from the view origin."
coverage:
  - id: D1
    description: "R engages ident and locks the nearest ship in the sights of the current view within 25,500 m, on the same tick; of two ships the nearer wins, ties keep the lower id; behind, off-axis, out-of-range, non-ship and CLASS_NO_DRAW entities are never locked"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#R locks the ship in the sights (tracer)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#what the sights pick"
        status: pass
    human_judgment: false
  - id: D2
    description: "The view decides the axis: aft locks the ship behind and not the one ahead; port locks the ship to the left"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#uses the view as the axis: aft view locks the ship behind, not the one ahead"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#uses the port view: a ship to the left is locked"
        status: pass
    human_judgment: false
  - id: D3
    description: "R while locked clears the target and re-acquires what is in the sights (D-04 deviation, pinned by two named cases); U drops the lock and ident with wasEngaged true, or false when ident was off"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#R while a lock exists"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#U drops the lock"
        status: pass
    human_judgment: false
  - id: D4
    description: "A lock beyond 25,600 m or on a ship gone from the world is dropped with identLost, ident stays engaged and a new ship in the sights is locked on the same tick; non-finite positions and ids are never accepted"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#losing the lock"
        status: pass
    human_judgment: false
  - id: D5
    description: "The target never leaves its world: a hyperspaceJumped step clears it silently with ident kept and never acquires against the old world, docking clears target and ident, the launch-completion tick ignores the keys, a fresh combat state holds none; identTargetSnapshot returns position and radius or undefined"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#the target never leaves the world it names"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/ident.test.ts#identTargetSnapshot"
        status: pass
      - kind: unit
        ref: "tests/guards/entity-id-scope.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Key Decisions records the INPUT-01 input-filter amendment, the exact-legacy settings migration without a version bump, target station on KeyQ and the ident id holder; D-03 and D-04 are recorded in PROJECT.md and 13-CONTEXT.md as PENDING OWNER CONFIRMATION with the exact one-place literal alternative, not as resolved"
    requirement: INPUT-01
    verification:
      - kind: unit
        ref: "tests/contract/fidelity.test.ts"
        status: pass
      - kind: other
        ref: "rg -c 'PENDING OWNER CONFIRMATION' 13-CONTEXT.md = 3, PROJECT.md = 2; rg -c IDENT_LOCKED_TEMPLATE PROJECT.md = 1; git diff --numstat 6652ae7 -- 13-CONTEXT.md = 5 added, 0 deleted"
        status: pass
    human_judgment: false
---

# Phase 13 Plan 15: Ident in the simulation and the INPUT-01 decision records Summary

**R locks the nearest ship in the sights of the current view (25,500 m, sphere test on the collision radius, strict nearest, lower id on a tie), U drops the lock, a lock is lost beyond 25,600 m or when its ship is gone, and the target id is cleared at dock, jump commit and new sessions; D-03 and D-04 are recorded as advisor-recommended deviations PENDING OWNER CONFIRMATION, each with its exact one-place literal alternative.**

## Performance

- **Duration:** about 10 min wall clock (the sim, guard and compliance suite takes about 50 s in Docker)
- **Tasks:** 2 of 2
- **Files:** 2 created (1 source, 1 test), 4 modified (2 source, 2 planning documents)

## Accomplishments

- `src/sim/combat/ident.ts`: a port of Oolite's `firstEntityTargetedByPlayer` (origin = player position plus the rotated view offset; axis basis from `laserFrame(q, view)`, the same facing rotation as lasers and cameras; `dist2 < nearest2`, `df > 0 && df^2 < nearest2`, `du^2 + dr^2 < radius^2`), the `isValidTarget` rule (a live ship within 25,600 m of the player; the comparison is written so NaN is never valid), `stepIdent`, `updateIdentTarget` and `identTargetSnapshot`.
- Four events in `src/sim/events.ts`: `identEngaged`, `identLocked { specKey }`, `identLost`, `identOff { wasEngaged }`. They carry a spec key, never an entity id; the wording stays with the app (plan 13-12).
- The R-while-locked rule (D-04 deviation) is one clearly separated branch of the `ident` case, commented with `handleButtonIdent`, "PENDING OWNER CONFIRMATION" and the literal alternative, and pinned by two test cases whose names carry "D-04 (PENDING OWNER CONFIRMATION)".
- `tests/sim/combat/ident.test.ts`: 26 cases covering acquisition, nearest and tie rules, the exclusion cases, the aft and port axes, R and U, range loss at exactly 25,600 m and beyond, removal, non-finite inputs, jump, dock, launch-completion and the snapshot.
- PROJECT.md Key Decisions: the input-filter row amended in place (Escape is Back and an inert eject in flight, P is the universal pause) and five rows added (INPUT-01 migration, target station on KeyQ, D-04 pending, D-03 pending, ident id holder). 13-CONTEXT.md gained the "Advisor-recommended deviations, PENDING OWNER CONFIRMATION" block; the text of D-03 and D-04 is untouched (the diff since 6652ae7 is 5 added and 0 deleted lines).

## Owner decisions pending

Both are PENDING OWNER CONFIRMATION. The owner has not confirmed either; neither is described as resolved anywhere.

| Item | What the plans implement | If the owner keeps the decision literally |
| ---- | ------------------------ | ----------------------------------------- |
| D-04 | R while a lock exists clears it and re-acquires (Oolite's `handleButtonIdent`); U drops the lock | Change the R-while-locked branch of `stepIdent` in `src/sim/combat/ident.ts` (Task 1 here) to clear the target and switch ident off, emitting `identOff { wasEngaged: true }`, and change the two D-04 cases of `tests/sim/combat/ident.test.ts`. The keys of plan 13-02 stay. |
| D-03 | The lock message names the ship only ("Ident system locked onto [name].") | Change the one constant `IDENT_LOCKED_TEMPLATE` in `src/app/session/event-router.ts` (plan 13-12 Task 2) to "Ident system locked onto [name] ([class])." and its expectation in `tests/app/session-order.test.ts`; `[class]` renders the compiled `scanClass`. No simulation or content change. |

## Task Commits

1. **Task 1: R locks the ship in the sights, end to end through the combat step** - `b2c78a5` (feat)
2. **Task 2: Key Decisions rows for INPUT-01 and the pending D-03 and D-04 records** - `5a665d9` (docs)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `stepIdent` split into two halves instead of one call after `resolveShots`**
- **Found during:** Task 1
- **Issue:** The plan lists `stepIdent(combat, player, world, commands, flightEvents, events)` called after `resolveShots` inside `step.ts`, with `sim.ts` unchanged. `resolveShots` receives neither the commands nor the flight events (and `sim.ts` may not change, per plan 13-08), so one function after it cannot read the R and U keys or the `hyperspaceJumped` event.
- **Fix:** `stepIdent(combat, player, commands, flightEvents, inFlightAtStart, events)` handles the keys and the jump clear and is called from `stepPlayerCombat` before the world step (with the same in-flight-at-start guard as `setView`); `updateIdentTarget(combat, player, world, events)` validates and acquires and is called at the end of `resolveShots`, only on a tick that stepped the world. The exported `resolveShots` is now a thin wrapper over the renamed internal `resolveShotHits`; its signature and behaviour for shots are unchanged. Both halves stay inside `src/sim/combat/step.ts`'s call path; `sim.ts` is untouched. The observable behaviour the plan specifies is identical (R engages and the ship is locked at the end of the same tick; no ident id is touched on the jump step).
- **Files modified:** `src/sim/combat/ident.ts`, `src/sim/combat/step.ts`
- **Commit:** `b2c78a5`

**2. [Rule 1 - Format] Prettier**
- **Found during:** Task 1 verification
- **Issue:** `docker compose run --rm lint` flagged the new test file's formatting.
- **Fix:** ran Prettier in the lint container on the new files.
- **Commit:** `b2c78a5`

**Total deviations:** 2 auto-fixed (1 Rule 3, 1 formatting). **Impact:** none on scope; the plan's file list and `sim.ts` are respected. Plan 13-12/13-13 consumers use the event kinds and `identTargetSnapshot`, which are unchanged from the plan.

### Notes

- The amended input-filter row in PROJECT.md replaces its line with the same text plus the appended amendment (git shows one changed line); no wording was deleted.
- The acceptance criterion `git diff --numstat 6652ae7 -- 13-CONTEXT.md` reports `5 0`: the file only gained lines.

## Known Stubs

None.

## Threat Flags

None. T-13-22 (stale ident id across worlds) is mitigated (dock, jump commit, new combat state; Key Decisions row; entity-id guard unchanged and green). T-13-30 (non-finite positions, removed target) is mitigated: candidates are live non-dead ships, a non-finite distance fails the strict `<` tests and the validity test, and an invalid target is dropped with `identLost` before acquisition.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/combat/ident.test.ts` - 26 passed.
- `docker compose run --rm test npx vitest run tests/sim/ tests/guards/ tests/compliance.test.ts` - 66 files, 1616 passed, 1 skipped (includes `tests/guards/entity-id-scope.test.ts`, `tests/guards/sim-purity.test.ts`, `tests/guards/sim-determinism-bans.test.ts` and the SPDX compliance test).
- `docker compose run --rm test npx vitest run tests/contract/fidelity.test.ts` - passed.
- `docker compose run --rm typecheck` and `docker compose run --rm lint` - clean.
- Acceptance greps: `identLocked` in `events.ts` = 2; `ident.ts` exists; `PENDING OWNER CONFIRMATION` in `ident.ts` = 1, in 13-CONTEXT.md = 3, in PROJECT.md = 2; `IDENT_LOCKED_TEMPLATE` in PROJECT.md = 1.
- `tests/golden/flight-hash-pins.json` was not touched; `sim.ts` is unchanged.

## Next Phase Readiness

Plan 13-12 can route `identEngaged`, `identLocked { specKey }`, `identLost` and `identOff { wasEngaged }` to the message line ("Ident system active.", "Ident system locked onto [name].", "Target lost.", "Ident system deactivated." or "Missiles on safety."), and plan 13-13 can frame the target from `identTargetSnapshot(combat, world)`. Both D-03 and D-04 await the owner.

## Self-Check: PASSED

- `src/sim/combat/ident.ts`, `tests/sim/combat/ident.test.ts` and this summary exist.
- Commits `b2c78a5` and `5a665d9` are ancestors of HEAD; `git rev-list --count adcf7a7..HEAD` = 2 at the time of writing.

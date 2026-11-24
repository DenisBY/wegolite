---
phase: 18-stations-buoys-and-collisions
plan: 05
subsystem: combat
tags: [laser-hit, buoy, static-health, recharge, tumble, render-pose, CBT-17]

requires:
  - phase: 18-04
    provides: "statics.ts (StaticTarget, STATIC_TARGETS, staticTargetById, stationPose), the static branch of the ledger, the station candidate"
  - phase: 18-14
    provides: "World.buoys.{witchpoint,navBuoy} with the PD-02 offset, BUOY_MAX_ENERGY 250"
provides:
  - "the witchpoint and nav buoy rows, BUOY_ROLL_RATE, BUOY_PITCH_RATE, buoyOrientation, buoyPosition, staticPose, isBuoyDestroyed (src/sim/world/statics.ts)"
  - "destroyBuoy (src/sim/world/kill.ts): one shipDestroyed at the live pose; the buoy stays in world.statics"
  - "rechargeStatics and BUOY_ENERGY_RECHARGE_RATE: 2 energy/s up to 250, only while alive"
  - "the renderer draws the buoy with the sim's buoyOrientation"
affects: [18-06, 18-07, 18-08, 18-15, 18-18, 18-19, 18-22, 18-12]

actuals:
  tokens: 13900
  tasks: 3
  commits: 6
plan_head_before: 9a94e9134ae04508d6ec83e93feaab48d5b63fc0
plan_head_after: 8b7f54b1848324f62264154282b50682db51da5a

tech-stack:
  added: []
  patterns:
    - "One pose function per static (staticPose) feeds both the laser candidates and the renderer"
    - "Static recharge runs before the tick's hits and never revives a static at 0"

key-files:
  created: []
  modified:
    - src/sim/world/statics.ts
    - src/sim/world/limits.ts
    - src/sim/world/kill.ts
    - src/sim/combat/step.ts
    - src/sim/combat/ledger.ts
    - src/render/bodies/buoy.ts
    - tests/sim/world/statics.test.ts
    - tests/sim/world/kill.test.ts
    - tests/sim/combat/step.test.ts
    - tests/sim/combat/ledger.test.ts
    - tests/render/buoy.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/e2e/combat.spec.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "Buoys hold 250 energy in World.staticHealth, recharge 2/s while alive and are destroyed once at 0; a destroyed buoy releases no debris and stays in world.statics (CBT-17, D-04, D-13)"
  - "The buoy tumble (performBuoyTumble, roll 0.10 and pitch 0.15 rad/s) is a closed form of the flight clock in the sim; the renderer imports it, so the buoy is hit where it is drawn"
  - "The debris twin's world hash is re-pinned to f1926a36 in the Node twin and combat.spec.ts: the warm-up burst now hits the nav buoy (owner decision option A, 2026-11-20)"

patterns-established:
  - "A static's alive check is isBuoyDestroyed; 18-06 to 18-08 read it for ident, blockage, compass, scanner and view"

requirements-completed: [CBT-17]  # buoy half only; REQUIREMENTS.md stays Pending until the sibling plans land

coverage:
  - id: D1
    description: "A pulse hit lowers staticHealth.navBuoy 250 -> 235; with no recharge between hits the 17th hull hit destroys the buoy and emits one shipDestroyed with the static id, live position, layout radius, spec key and credited killer"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts, tests/sim/world/kill.test.ts, tests/sim/combat/ledger.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "Live buoys recharge 2 energy/s, reaching 250 in 3000 +/- 1 ticks; a destroyed buoy never revives (10,000-tick case); a recharged buoy hashes pristine"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts (buoy recharge)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The buoy is hit at buoyPosition and buoyOrientation, and the renderer draws the orientation from the same function"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/world/statics.test.ts, tests/render/buoy.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Edge cases: a record on a destroyed buoy, NaN, Infinity, 0 or negative amounts and an unloaded hull change nothing; two lethal records in one tick destroy the buoy once"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/ledger.test.ts, tests/sim/combat/step.test.ts"
        status: pass
    human_judgment: false

duration: 25min plus the checkpoint wait
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 05: Buoys as Laser Targets Summary

**The navigation buoys take laser damage at their live, tumbling pose: 250 energy in the per-world static health, 2/s recharge while alive, and destruction once at 0 that leaves them in world.statics with no debris. The renderer draws the tumble from the same sim function.**

## Performance

- **Started:** 2026-11-19T22:31:54Z (plan base 9a94e91)
- **Completed:** 2026-11-20 (resumed after the owner's checkpoint decision)
- **Tasks:** 3 of 3
- **Files modified:** 16

## Accomplishments

- The two buoys are laser candidates at `staticPose` (layout position plus the PD-02 offset, closed-form `performBuoyTumble`) unless they are destroyed. A lethal record goes to `destroyBuoy`.
- `rechargeStatics` runs before each stepped tick's hits. It recharges live buoys at 2 energy/s up to 250 and never revives a buoy at 0.
- `src/render/bodies/buoy.ts` imports `buoyOrientation`, and a test pins the drawn pose to the sim's pose (PITFALLS 11).
- The decisions and divergences are recorded in PROJECT.md, FIDELITY.md (energy, no debris, the tumble row 3724-3727) and CHANGELOG.md.

## Task Commits

1. **Task 1: The nav buoy shot to destruction at its live pose (TDD)**: `21e83d8` (test, RED), `9410c68` (feat, GREEN)
2. **Task 2: Buoy recharge (TDD)**: `9b24269` (test, RED), `4f0a9c9` (feat, GREEN)
3. **Task 3: One pose for hit and draw, the records**: `68bfb7f` (feat), `8b7f54b` (test: the twin hash re-pinned, owner decision)

## Verification evidence

- Local Docker: tick-parity 29/29; `test` 252 files, 6860 passed, 10 skipped; `lint` and `typecheck` clean (at 8b7f54b's tree).
- Evidence from the earlier run: the buoy is destroyed at the 17th shot; recharge reaches 250 in 3000 +/- 1 ticks; the fidelity contract passes 9/9.
- Remote QUAL-11 acceptance at 68bfb7f: 21/21 with unchanged totals. This only checks that the frozen worlds still match. The harness runs `realHullTable()` with no statics, so it does not exercise this plan's new paths.
- Remote `combat.spec.ts`: `snapshot 8b7f54b (committed HEAD)`, 1 passed, `exit=0 elapsed=16s snapshot=8b7f54b`.
- Remote `verify`: `snapshot 8b7f54b (committed HEAD)`, unit 252 files, 6860 passed, 10 skipped; e2e smoke 27 passed; `exit=0 elapsed=194s snapshot=8b7f54b`. No flake reruns were needed.

## Deviations from Plan

### Owner-sanctioned exception

**1. The `git diff --quiet 76229f5 -- tests/e2e` criterion is broken by a re-pin in `tests/e2e/combat.spec.ts`**
- **Found during:** Task 3 verification.
- **Issue:** After this plan, the player's 30-tick warm-up burst in the debris twin hits the nav buoy, 10 km ahead of the dock. That puts `staticHealth.navBuoy` (about 248.68, recharging) into the hash taken 60 ticks after the kill. The Node twin and the browser both produce `f1926a36` instead of the pinned `e909751a`. Everything else that is pinned is unchanged: kill offset 672, 16 entities, debris 2 pods/0 plates/2 wrecks, shield and energy.
- **Resolution:** The owner chose option A on 2026-11-20 and re-pinned both literals (`HASH_60_AFTER_KILL`, `TWIN_HASH_60_AFTER_KILL`), each with a comment that names the decision. This follows the 17-05/17-12 re-pin precedent. It is the second browser-spec edit in Phase 18, after 18-07's D-06 pose. `tests/acceptance` is untouched.
- **Committed in:** `8b7f54b`

### Auto-fixed issues

**2. [Rule 1 - Bug] The ledger test expected buoy records to be skipped**
- `tests/sim/combat/ledger.test.ts` encoded 18-04's rule that buoys are not targets. Its expectation now follows this plan: a buoy record lowers static health. Committed in `9410c68`.

**3. [Rule 1 - Bug] Stale FIDELITY pointer for the NPC recharge row**
- The row's source pointer was fixed while the buoy recharge row was added. Committed in `68bfb7f`.

### Choices the plan left open (recorded)

- A record on a buoy that is already at 0 emits nothing.
- A buoy that a lethal record dooms earlier in the same call still gets `shipHit` for later records in that call.
- `destroyBuoy` posts no AI notifications.
- Until 18-15, subentity hits lower the buoy's own energy. FIDELITY E-118 and PROJECT.md say so.
- The scene still places the buoy root at its layout position. Drawing it at the moved position (the PD-02 offset) is 18-08's work.

**Total deviations:** 1 owner-sanctioned and 2 auto-fixed. **Impact:** no scope creep. The only test-literal change is the twin hash, which the owner approved.

## Issues Encountered

The twin hash checkpoint (see deviation 1). The owner resolved it.

## Next Phase Readiness

`isBuoyDestroyed` and `staticPose` are ready for 18-06 (ident), 18-07 (blockage), 18-08 (view, scanner, moved root) and 18-15 (subentity). CBT-17 stays Pending in REQUIREMENTS.md until the sibling plans land.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*

## Self-Check: PASSED

All six plan commits are ancestors of HEAD; statics.ts, kill.ts, step.ts and buoy.ts exist with buoyPosition, destroyBuoy, rechargeStatics and the buoyOrientation import; no stubs.

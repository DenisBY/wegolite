---
phase: 18-stations-buoys-and-collisions
plan: 07
subsystem: hyperspace
tags: [witchspace, blockage, buoy, mass, ship-field, hud-copy, e2e-fixture, CBT-17, D-05, D-06, D-08, D-09, PD-01, PD-02]

requires:
  - phase: 18-05
    provides: "isBuoyDestroyed and buoyPosition (buoy liveness and live pose)"
  - phase: 18-14
    provides: "World.buoys.<key>.offset and subentityEnergy; pristine new worlds"
  - phase: 18-15
    provides: "isBuoySubentityAttached (PD-01 detachment)"
  - phase: 18-20
    provides: "the measured class-free blockage rule (pod within 9.967 m, plate within 5.229 m), evidence for the D-08 row"
provides:
  - "NAV_BUOY_MASS (698,691.1875), BUOY_SUBENTITY_MASS (7,646.7861328125), NAV_BUOY_HULL_MASS (691,044.375) in src/sim/hyperspace/countdown.ts, pinned to the compiled content"
  - "WitchspaceBlocker gains witchpointBeacon and navBuoy"
  - "StepOptions.hyperspace.buoyMass, always NAV_BUOY_MASS from buildStepOptions; absent means no buoy blocks"
  - "ShipField.buoy(key): alive, offset, subentityAttached from the previous tick's world"
  - "the completion order: station, witchpoint buoy, nav buoy, NPC ships"
  - "refusalCopy names the nav buoy and the witchpoint beacon"
  - "tests/sim/world/buoy-clearance.test.ts: the 2,048-layout arrival and launch clearance sweep"
affects: [18-08, 18-11, 18-12, 18-18]

actuals:
  tokens: 32100
  tasks: 3
  commits: 5
plan_head_before: cd7e1319da2787f6cf21e24a75cf7fc4911014f4
plan_head_after: 8a68443bcac4be25cedcbf40ad09f94fb3c57c77

tech-stack:
  added: []
  patterns:
    - "A static's blocking mass reaches the flight step as an option (like stationMass); its liveness, offset and attachment come from the previous tick's world through the ship field"
    - "Detached-subentity mass is the float32 of the difference, as Oolite's GLfloat holds it"

key-files:
  created:
    - tests/sim/world/buoy-clearance.test.ts
    - .planning/todos/pending/2026-11-20-torus-nearest-surface-live-buoys.md
  modified:
    - src/sim/hyperspace/countdown.ts
    - src/sim/world/ship-field.ts
    - src/sim/flight/step.ts
    - src/app/session/step-options.ts
    - src/app/session/hyperspace-controller.ts
    - tests/sim/hyperspace-blockage.test.ts
    - tests/sim/world/ship-field.test.ts
    - tests/sim/hyperspace-arrival.test.ts
    - tests/app/session/hyperspace-controller.test.ts
    - tests/app/session/sim-driver.test.ts
    - tests/e2e/hyperspace-failure.spec.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "Both live buoys block a completing jump by Oolite's mass rule (D-09): mass 698,691.1875, radius 264.33 m, from the live position (layout plus offset, PD-02), with the float32 hull mass 691,044.375 (radius 262.88 m) once the subentity is detached (PD-01); a destroyed buoy never blocks (D-05)"
  - "Order: station, witchpoint buoy, nav buoy, NPC ships; the mass is an app option (StepOptions.hyperspace.buoyMass), so world-less flights and the frozen worlds keep their pins"
  - "Beacon copy (provisional, owner confirmation pending): the plan's 'Witchspace jump aborted: too close to Witchpoint Beacon' is 55 characters, one over the 54-character HUD line, so the line reads 'Witchspace jump aborted: too near Witchpoint Beacon' (51); the nav buoy line is the plan's (53)"
  - "D-06: tests/e2e/hyperspace-failure.spec.ts ORIGIN_POSE moves from [0, 0, 0] to [1000, 0, 0] (owner sanction); the only browser-spec edit"
  - "D-08 is a recorded FIDELITY divergence: pods and plates never block or mass-lock, buoys never mass-lock"
  - "The torus nearest-surface still reads layout buoys: a FIDELITY divergence row and the todo 2026-11-20-torus-nearest-surface-live-buoys"

requirements-completed: [CBT-17]

coverage:
  - id: D1
    description: "A live buoy refuses a completing jump within its blockage radius and names itself; 263.3 m refused, 265.3 m committed; witchpoint beacon blocks too; no or forged buoyMass blocks nothing; order station, buoys, ships"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/hyperspace-blockage.test.ts#witchspace buoy blockage (D-09)"
        status: pass
      - kind: unit
        ref: "tests/app/session/hyperspace-controller.test.ts#names each buoy blocker by its Oolite name within the 54-character HUD line (D-09)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A buoy blocks from its live position with its live mass; a destroyed buoy never blocks; ShipField.buoy mirrors the world; D-08 pins"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/world/ship-field.test.ts#ship field: the buoys (D-05, D-08, D-09)"
        status: pass
    human_judgment: false
  - id: D3
    description: "No arrival or launch pose overlaps a buoy over all 2,048 layouts; 10,000 seeded arrivals clear of both buoys; new worlds have pristine buoys"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/world/buoy-clearance.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/hyperspace-arrival.test.ts#arrival clear of both buoys (Phase 18, D-06, D-09)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The sanctioned hyperspace-failure fixture pose [1000, 0, 0] passes in the browser"
    requirement: CBT-17
    verification:
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm e2e sh -lc \"npm run build && npm run test:e2e:seams\" (exit=0 snapshot=8a68443)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The witchpoint-beacon HUD copy 'Witchspace jump aborted: too near Witchpoint Beacon' replaces the plan's 55-character string"
    verification: []
    human_judgment: true
    rationale: "UI copy chosen by the executor because the plan's string exceeds the 54-character HUD line; the owner has to confirm or pick another wording"

duration: 35min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 07: Buoys Block Witchspace Summary

**Both live navigation buoys now refuse a completing witchspace jump by Oolite's `0.1 x mass > d^2` rule. Each buoy is checked at its live position with its live mass (698,691.1875, or the float32 691,044.375 once its subentity is gone), and a destroyed buoy never blocks. The HUD names the buoy, a 2,048-layout sweep proves that no arrival or launch pose starts inside a buoy's clearance, and the one sanctioned browser fixture moved off the witchpoint.**

## Performance

- **Duration:** 35 min
- **Started:** 2026-11-20T10:28:22Z
- **Completed:** 2026-11-20T11:03:23Z
- **Tasks:** 3
- **Files modified:** 16 (14 planned, plus `tests/app/session/sim-driver.test.ts` and the follow-up todo)

## Accomplishments

- Blockage boundary, whole buoy: completing 263.3 m from the nav buoy is refused with `{ reason: "blocked", blocker: "navBuoy" }`, the target is cleared and no fuel or jump time is spent. At 265.3 m the jump commits. The witchpoint buoy gives `witchpointBeacon`. The radius is sqrt(69,869.11875) = 264.328 m.
- Blockage boundary, detached subentity: the mass falls to `Math.fround(698,691.1875 - 7,646.7861328125)` = 691,044.375 and the radius to 262.877 m. A completion at 263.5 m is refused with the subentity attached and commits with it detached.
- Live pose and liveness: a nav buoy moved 300 m no longer blocks at its layout position but blocks at the moved one. A destroyed nav buoy or witchpoint buoy never blocks. Without a world both buoys count as alive, unmoved and whole.
- D-08 is pinned: a pod 5 m and a plate 3 m away neither block nor mass-lock, and a buoy never mass-locks, whether it is live, moved, detached or destroyed. `ShipField`'s members are exactly `blocks`, `buoy` and `massLocked`.
- Clearance sweep (`tests/sim/world/buoy-clearance.test.ts`, all 2,048 systems with the Coriolis station def). The required clearance is the blockage radius plus both hull radii: 264.328 + 59.136 + 72.697 = 396.161 m. Measured minimum margins above it:
  - Arrival shell against the nav buoy, `separation - (12,800 + 809.14) - 396.16`: 209,589.7 m (g1-s33 Diti).
  - Launch pose against the witchpoint buoy: 215,927.96 m (g1-s33 Diti).
  - Launch pose against the nav buoy: 9,103.58 m (the same in every system, since the nav buoy sits 10 km from the station and the mouth 500 m out on the same axis).
  - A new world's buoys are pristine in every system.
- Arrival property (`tests/sim/hyperspace-arrival.test.ts`): over 10,000 seeds the nearest arrival is exactly the safe exit distance, 809.1355 m (a zero radial draw), from the witchpoint buoy. No arrival is blocked by either buoy, so an immediate re-jump after arrival is not refused, as in Oolite.
- The generality of the D-06 pose: `[1000, 0, 0]` is justified for Lave only, where the spec parks the player. The clearance sweep above is the check that holds for all layouts.

## Task Commits

1. **Task 1: a live nav buoy refuses a completing jump and the HUD names it (tracer, TDD).** `b94b444` (test, RED) and `b1f740d` (feat, GREEN). Tracer gate: auto mode, `<verify>` re-run green (5 files, 173 tests, and typecheck), so expansion went ahead.
2. **Task 2: live pose, live mass, liveness, the D-08 pins and the clearance sweep (TDD).** `d874637` (test, RED) and `4312b79` (feat, GREEN).
3. **Task 3: the sanctioned fixture move, the decision rows and the remote checks.** `8a68443` (docs, with the spec edit).

## TDD Gate Compliance

- Task 1 RED (`b94b444`): 6 target tests failed on their assertions against the pre-plan code. The constants were undefined, the nav buoy and witchpoint completions committed or were named `ship` instead of `navBuoy`/`witchpointBeacon`, and `refusalCopy("blocked", "navBuoy")` returned the Coriolis line. Two new cases passed in RED as expected: 265.3 m commits, and no or forged mass blocks nothing. They hold before and after.
- Task 2 RED (`d874637`): 8 target tests failed (`field.buoy is not a function`, the members list, and the destroyed, moved and detached cases still refused). The D-08 pins, the clearance-shell bounds and the arrival property passed in RED. They pin properties that already held (pods have no mass entry, buoys are not store entities, and the arrival clamp predates this plan); they are regression guards, not new behaviour.
- GREEN: `b1f740d` and `4312b79`; all target files pass.

## Audit (Task 1): existing tests that could complete within 264.3 m of a buoy

Searched with `rg -n "buildStepOptions|hyperspaceRefused" tests/app tests/sim` (plus `tests/helpers`):

- `tests/helpers/tick-script.ts` through `tests/app/session/tick-parity.test.ts`: its one jump completes at `vec(1e7, 0, 0)`, outside every scanner range. Not refused.
- `tests/app/session/traffic-variants.test.ts` and `tests/app/session/sim-driver.test.ts`: no countdown completes. The sim-driver step-options pin gained `buoyMass` (see the deviation below).
- `tests/app/session-order.test.ts`: synthetic events only.
- `tests/sim/hyperspace.test.ts`, `tests/sim/hyperspace-blockage.test.ts`, `tests/sim/world/ship-field.test.ts`: they build their own options without `buoyMass`, so no buoy blocks there. The new cases add it explicitly.
- `tests/helpers/recorded-flights.ts` and `tests/sim/world/world-cadence.test.ts` (the frozen worlds): they build options without `buoyMass` and are unchanged.
- Browser specs: only `hyperspace-failure.spec.ts` completes near a buoy (0 m from the witchpoint), and its pose is the sanctioned D-06 edit. The fly-away specs complete at least 625 m past the nav buoy (PROJECT.md, Phase 12 row), and `verify`'s smoke subset passed.

No existing case that mirrors a browser spec was refused.

## Remote runs (committed HEAD 8a68443)

| Run | Snapshot | Result |
|-----|----------|--------|
| `run --rm test npm run test:acceptance` | 8a68443 | 21 passed; every seed had 0 stuck, 0 frozen, 0 repairs and 0 hashFailures; `exit=0 elapsed=79s` |
| `run --rm verify` | 8a68443 | 254 unit files, 6,923 passed and 10 skipped; e2e smoke 27 passed; `exit=0 elapsed=197s` |
| `run --rm e2e sh -lc "npm run build && npm run test:e2e:seams"` | 8a68443 | `hyperspace-failure.spec.ts` 2 passed; `exit=0 elapsed=25s` |

The acceptance run checks the frozen worlds only. The harness supplies no buoy mass and no statics, so it is no evidence for this plan's new paths (review L660@b45e113). Local runs: `test` (coverage) passed 254 files, 6,923 tests; `lint` and `typecheck` are clean.

No twin hash moved. `HASH_60_AFTER_KILL` and `TWIN_HASH_60_AFTER_KILL` are untouched: the blockage changes no hashed state unless a jump is refused, and no twin completes a countdown near a buoy.

## Files Created/Modified

- `src/sim/hyperspace/countdown.ts`: the three buoy masses, the widened `WitchspaceBlocker` and the rewritten header (no more "buoys stay non-blocking").
- `src/sim/flight/step.ts`: `StepOptions.hyperspace.buoyMass`, plus `buoyBlocker`, which skips a dead buoy, adds the offset and uses the float32 hull mass once the subentity is detached. It runs between the station and the NPC-ship checks.
- `src/sim/world/ship-field.ts`: `BuoyField` and `ShipField.buoy(key)`, with a module doc covering D-05, D-08 and D-09.
- `src/app/session/step-options.ts`: `buoyMass: NAV_BUOY_MASS`, always supplied.
- `src/app/session/hyperspace-controller.ts`: `refusalCopy` names both buoys. The old blocker comment is rewritten.
- `tests/sim/world/buoy-clearance.test.ts` (new): the 2,048-layout sweep.
- `tests/sim/hyperspace-blockage.test.ts`, `tests/sim/world/ship-field.test.ts`, `tests/sim/hyperspace-arrival.test.ts`, `tests/app/session/hyperspace-controller.test.ts`, `tests/app/session/sim-driver.test.ts`: the new and updated pins.
- `tests/e2e/hyperspace-failure.spec.ts`: `ORIGIN_POSE.position` and its comment only.
- `.planning/PROJECT.md`: two new rows, "Buoys block a completing jump (Phase 18, D-09)" and "The hyperspace-failure fixture pose leaves the witchpoint buoy (Phase 18, D-06, owner sanction)". "Keep the buoys non-blocking in Phase 12" is marked superseded, and the Coriolis row gained a pointer.
- `FIDELITY.md`:
  - The E-22 row now covers both buoys, and only the D-03 stations remain a divergence.
  - New D-08 row (pods and plates, with plan 18-20 as evidence).
  - New torus nearest-surface row (`2917-2924`).
  - The 261117-lka buoy note turns SAME.
  - Four moved line references were updated (`countdown.ts:61` and `:110`, `step.ts:213` and `:266`, `ship-field.ts:112` and `:123-124`).
- `CHANGELOG.md`: under `Changed`, a jump completing near a navigation buoy is aborted.
- `.planning/todos/pending/2026-11-20-torus-nearest-surface-live-buoys.md` (new): the recorded follow-up.

## Decisions Made

See `key-decisions`. The one decision not settled by the plan is the witchpoint-beacon copy (below).

## Deviations from Plan

**1. [Rule 1 - Bug in plan text] The witchpoint-beacon copy exceeds the HUD line.**
- **Found during:** Task 1.
- **Issue:** the plan prescribes "Witchspace jump aborted: too close to Witchpoint Beacon" and also "at most 54 characters". That string is 55 characters, and `clampMessage` would cut it to "...Witchpoint Beac…".
- **Fix:** the line reads "Witchspace jump aborted: too near Witchpoint Beacon" (51). It keeps the prefix and the full Oolite name. The nav buoy line is the plan's exact string (53). Both are pinned in `tests/app/session/hyperspace-controller.test.ts` and recorded as provisional in PROJECT.md.
- **Owner confirmation pending** (question in the hand-back).
- **Commit:** `b1f740d`.

**2. [Rule 3 - Blocking] `tests/app/session/sim-driver.test.ts` pins the exact `buildStepOptions` shape.**
- **Found during:** Task 1.
- **Fix:** added `buoyMass: NAV_BUOY_MASS` to its `toEqual`. The file is outside the plan's list but required by its `buildStepOptions` change.
- **Commit:** `b1f740d`.

**3. [Rule 3 - Blocking] A guard forbids naming `ships-static-hulls` in `src/sim`.**
- **Found during:** Task 1, in the full suite (`tests/content/ships-static-hulls.test.ts`).
- **Fix:** the `BUOY_SUBENTITY_MASS` doc comment no longer names the artifact file. The test pins the equality instead.
- **Commit:** `b1f740d`.

**4. [Rule 2 - Docs honesty] FIDELITY line references moved with the edits.** Four Wegolite cells and one note were re-pointed to the same code at the new line numbers. **Commit:** `8a68443`.

**5. [Rule 2 - Recorded follow-up] A todo for the torus nearest-surface fix.** The memory rule is that a deferred fix gets a todo. No guard test was added, since there is no first consumer to trip. **Commit:** `8a68443`.

**6. The "pinned member list" in `ship-field.test.ts` did not exist.** I added it as a new test (`Object.keys` of the field equals `blocks`, `buoy`, `massLocked`).

**7. Acceptance criterion `git diff --name-only 76229f5 -- tests/e2e` also prints `tests/e2e/combat.spec.ts`.** That is the owner-approved twin-hash re-pin of plans 18-05 and 18-06, made after the plan's base `76229f5`. Against this plan's own base (`git diff --name-only cd7e131 -- tests/e2e tests/acceptance`) only `tests/e2e/hyperspace-failure.spec.ts` changed.

**Total deviations:** 7: 1 plan-text fix awaiting the owner, 2 blocking fixes, 2 documentation follow-ups and 2 notes. **Impact:** no scope creep. No frozen threshold, detector or twin hash changed.

## Issues Encountered

- A scratch margin script first ran with `--root /`, which made Vitest scan the whole container and run out of memory. The repository was not affected. I reran it with `--root /scratch` (files only under `/tmp/wego-1807`).

## User Setup Required

None.

## Next Phase Readiness

- 18-08 (compass and HUD buoys) can rely on `ShipField.buoy` semantics and on the blocker kinds.
- Open owner question: the witchpoint-beacon HUD copy.

## Self-Check: PASSED

- Files: `tests/sim/world/buoy-clearance.test.ts`, `.planning/todos/pending/2026-11-20-torus-nearest-surface-live-buoys.md` and every modified file are present.
- Commits `b94b444`, `b1f740d`, `d874637`, `4312b79` and `8a68443` are all ancestors of HEAD.
- Acceptance criteria for Tasks 1 to 3 re-run: all pass (criterion 3.1 is read against this plan's base; see deviation 7).

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*

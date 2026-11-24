---
phase: 18-stations-buoys-and-collisions
plan: 15
subsystem: combat
tags: [laser-hit, buoy, frangible-subentity, sticky-routing, cargo-pods, alloy-plates, CBT-17, PD-01, D-07]

requires:
  - phase: 18-05
    provides: "buoys as laser targets (statics.ts rows, staticPose, isBuoyDestroyed, rechargeStatics, destroyBuoy)"
  - phase: 18-14
    provides: "World.buoys.<key>.subentityEnergy and subentityTakingDamage, BUOY_SUBENTITY_MAX_ENERGY 200, the pristine-omit buoys: hash line"
  - phase: 18-13
    provides: "HullData.subentities and HullData.frangible from the merged static hull table"
provides:
  - "WITCHPOINT_BUOY_SUBENTITY_ID 6 and NAV_BUOY_SUBENTITY_ID 7 (src/sim/world/ids.ts); the reserved range is now 8 to 99"
  - "FRANGIBLE_BLEED_THROUGH, BuoySubentityTarget, BUOY_SUBENTITY_TARGETS, buoySubentityTargetById, buoySubentityTargetOf, isBuoySubentityAttached (src/sim/world/statics.ts)"
  - "HitTarget.detachedSubentities: a detached part is skipped by firstShipHit"
  - "the sticky routing in resolveShotHits (routeBuoyHit) and the subentity branch of applyLedger"
  - "BUOY_SUBENTITY_RECHARGE_RATE 1 and the subentity recharge in rechargeStatics"
  - "cargo pods and alloy plates as laser candidates and ledger targets; wrecks stay out"
affects: [18-06, 18-07, 18-08, 18-11, 18-18, 18-19, 18-21, 18-12]

actuals:
  tokens: 13800
  tasks: 3
  commits: 5
plan_head_before: 8fff159b5dcd801b2105d413010563988b86c693
plan_head_after: f51b4f7438e7fede6f82945c2f17bf1866339999

tech-stack:
  added: []
  patterns:
    - "A frangible subentity is a static hit-target id (6, 7), so HitRecord stays an EntityId record; the beam meets it only as a part of its buoy's hull"
    - "Sticky routing is world state written during shot resolution (its one world write) and read for every later hit; the ledger clears it at detachment"

key-files:
  created: []
  modified:
    - src/sim/world/ids.ts
    - src/sim/world/statics.ts
    - src/sim/world/limits.ts
    - src/sim/world/entity.ts
    - src/sim/combat/hit.ts
    - src/sim/combat/step.ts
    - src/sim/combat/ledger.ts
    - tests/sim/combat/step.test.ts
    - tests/sim/combat/hit.test.ts
    - tests/sim/combat/ledger.test.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "Buoy subentities are static hit targets 6 (witchpoint) and 7 (nav buoy). A routed laser hit queues FRANGIBLE_BLEED_THROUGH (1 %) on the buoy, then the full damage on the subentity id. The routing is sticky (Universe.m:5634-5636, ShipEntity.m:10202-10209, 10409-10416), and detachment at 0 clears it, with no explosion or debris (PD-01)"
  - "Buoy subentity energy is 200 and recharges 1/s (ShipEntity.m:291-292), only while the subentity is attached and its buoy is alive. A record on a detached subentity, or on the subentity of a destroyed buoy (destroyed earlier in the same ledger call included), changes nothing"
  - "Cargo pods and alloy plates (kind cargo) are laser candidates in the ascending store pass and take damage like a ship. killShip removes them silently with no explosion, a recorded divergence. Wrecks are never candidates (ShipEntity.m:1858-1868, D-07)"

patterns-established:
  - "18-07, 18-08 and 18-18 read isBuoySubentityAttached for the mass drop, the hidden mesh and the collider; 18-18 can reuse FRANGIBLE_BLEED_THROUGH for the ram routing"

requirements-completed: []  # CBT-17 stays Pending in REQUIREMENTS.md: sibling Phase 18 plans still declare it

coverage:
  - id: D1
    description: "A pulse whose winning part is the nav buoy's subentity queues shipHit 5 at 0.15, then 7 at 15. Afterwards staticHealth.navBuoy is 249.85, subentityEnergy is 185 and the flag is set. The witchpoint buoy's subentity is target 6"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#the buoy's frangible subentity (tracer, PD-01, plan 18-15)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Sticky routing: after one subentity hit, a hull beam from the player or from an NPC Viper is split 1 % and 100 %. On a fresh world, a hull beam is one full record and the flag stays false"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#is sticky / an NPC shot reads the same flag"
        status: pass
    human_judgment: false
  - id: D3
    description: "14 routed hits detach the subentity at exactly 0 and clear the flag. The 15th beam on the same line ends on the hull 1,983.62 m out instead of 1,979.46 m, and a hull beam is one full record again. firstShipHit skips a part in detachedSubentities"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#14 routed hits detach it; tests/sim/combat/hit.test.ts#skips a subentity listed in detachedSubentities"
        status: pass
    human_judgment: false
  - id: D4
    description: "A Coriolis dock-subentity win is one full, absorbed station record, because the station is not frangible. Ledger totality: NaN, Infinity, 0 and -5, a detached subentity, a destroyed buoy and an unstepped world change nothing"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#a Coriolis dock-subentity win; subentity records in the ledger are total"
        status: pass
    human_judgment: false
  - id: D5
    description: "Subentity recharge: from 150 it reaches exactly 200 in 6000 +/- 1 ticks and the world hashes pristine. A detached subentity stays 0 through 10,000 ticks. The hashes at 30, 60 and 144 Hz agree at every common time"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#buoy subentity recharge (energy_recharge_rate 1, ShipEntity.m:292)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Pods and plates: one tick of fire kills a pod and a plate. Each is removed with one entityRemoved, with no shipDestroyed and no debris, and the Viper's missedShots goes from 2 to 1. A wreck is not a candidate, and with realHullTable nothing changes"
    requirement: CBT-17
    verification:
      - kind: unit
        ref: "tests/sim/combat/step.test.ts#pods and plates are shot; wrecks are not (D-07); tests/sim/combat/ledger.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "Frozen worlds and the combat route hold: the remote acceptance passes 21 of 21 and combat.spec.ts passes unedited, with the twin hashes unchanged"
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (exit=0 snapshot=f51b4f7)"
        status: pass
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm e2e ... tests/e2e/combat.spec.ts (1 passed, exit=0 snapshot=f51b4f7)"
        status: pass
    human_judgment: false

duration: 27min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 15: Buoy Subentity and Shootable Debris Summary

**A laser hit on a buoy's frangible subentity now does what Oolite does: 1 % of the damage goes to the buoy and the full damage goes to the subentity. The routing is sticky. The subentity has 200 energy, recharges 1/s and detaches at 0. Cargo pods and alloy plates can now be shot, and wrecks still cannot.**

## Performance

- **Started:** 2026-11-20T08:59:47Z (plan base 8fff159)
- **Completed:** 2026-11-20T09:26:16Z
- **Tasks:** 3 of 3
- **Files modified:** 13 (7 source, 3 tests, 3 docs)

## Accomplishments

- A shot whose winning part is a buoy's subentity sets `World.buoys.<key>.subentityTakingDamage`. While the flag is set, every laser hit on that buoy, from the player or from an NPC and including hull hits, queues two records: `{buoy, 0.01 x damage}`, then `{6 or 7, damage}`.
- The ledger lowers `subentityEnergy` and posts `shipHit` for target 6 or 7. A subentity record is never lethal. The write that reaches 0 detaches the subentity and clears the flag. From then on the buoy's `HitTarget` carries `detachedSubentities {0}`, so the beam never meets the subentity again.
- Measured on the nav buoy at the identity pose: the subentity wins about 1,979.46 m along the line (0, -4) world +Z. The 14th routed pulse detaches it. With the subentity detached, the same beam ends on the hull about 1,983.62 m out.
- `rechargeStatics` recharges an attached subentity of a live buoy at 1/s up to 200. A detached subentity never comes back in its world.
- Pods and plates (kind `cargo`, with `barrel` or `alloy` hulls) are candidates in the same ascending pass as the ships. One pulse kills one, and `killShip` removes it silently. A wreck is never a candidate.
- The rules and their divergences are recorded in PROJECT.md, FIDELITY.md (E-120 to E-124) and CHANGELOG.md. E-118 is marked faithful again.

## Task Commits

1. **Task 1: Hit on the subentity, two records, detached part (tracer, TDD).** `552af5b` (test, RED), `a4c7cf4` (feat, GREEN). Tracer gate: the task's verify passed again end to end before expansion. That run covered step, hit, ledger, dock-mouth and the entity-id-scope guard (130 tests) plus typecheck.
2. **Task 2: Subentity recharge, pods and plates (TDD).** `2af9dbd` (test, RED), `53d401a` (feat, GREEN).
3. **Task 3: The records and the remote checks.** `f51b4f7` (docs).

## Verification evidence

- Local Docker at f51b4f7's tree: the full `test` run passed 252 files (6,878 tests passed, 10 skipped) with no coverage-threshold error. `lint` and `typecheck` are clean. `tests/app/session` (the tick-parity twin) is green and the hash pins are unchanged.
- The FIDELITY contract ran in verbatim mode (`OOLITE_SRC` set to `git archive 7437f22 src`) and passed 9/9.
- Remote QUAL-11 acceptance: `snapshot f51b4f7 (committed HEAD)`, 21 passed, `exit=0 elapsed=77s snapshot=f51b4f7`. Every seed has 0 stuck, 0 frozen, 0 repairs and 0 hashFailures. This run only shows that the frozen worlds are unchanged. The harness runs `realHullTable()`, which has no `buoy`, `barrel` or `alloy` hull, so it never exercises this plan's paths.
- Remote `combat.spec.ts`: `snapshot f51b4f7 (committed HEAD)`, 1 passed, `exit=0 elapsed=15s snapshot=f51b4f7`. The spec is unedited, and `TWIN_HASH_60_AFTER_KILL` stays `f1926a36`.
- No `verify` run: the plan touches no browser-facing code.

## Decisions Made

- `FRANGIBLE_BLEED_THROUGH` lives in `src/sim/world/statics.ts`, next to the subentity rows, so plan 18-18's ram routing can import it from the world layer. `step.ts` uses it, which satisfies the key link.
- `buoySubentityTargetOf(key)` was added beside `buoySubentityTargetById`. The shot resolution needs to go from a buoy row to its subentity row.
- The flag is set as each shot resolves, so a later shot in the same tick reads it. It is cleared only in the ledger. This produces the same-tick difference recorded in the FIDELITY row.
- A subentity record whose buoy was destroyed earlier in the same ledger call changes nothing: the subentity goes with its buoy.

## Deviations from Plan

### Auto-fixed issues

**1. [Rule 1 - Bug] The ledger test expected cargo records to be skipped**
- `tests/sim/combat/ledger.test.ts` encoded the Phase 16 rule that cargo is no target. It now expects plan 18-15's rule: cargo takes the hit and a wreck is skipped. Committed in `2af9dbd`.

**2. [Rule 1 - Bug] Reticle line numbers in the sticky FIDELITY row**
- The plan cites `HeadUpDisplay.m:3314, 3321`. At the pin 7437f22, the precise-reticle calls to `firstEntityTargetedByPlayerPrecisely` are on lines 3311 and 3318; line 3314 is the low-accuracy reticle. FIDELITY.md cites 3311 and 3318. Committed in `f51b4f7`.

**3. [Rule 1 - Accuracy] E-118 row set to faithful**
- The E-118 row's only divergence was "until plan 18-15 a hit on a buoy's subentity lowers the buoy's own energy", which this plan resolves. The station's absorb divergence stays on E-48. Committed in `f51b4f7`.

**Total deviations:** 3, all auto-fixed. **Impact:** no scope creep. No test under `tests/e2e` or `tests/acceptance` was touched, and no pinned hash moved.

## Issues Encountered

- During the RED run, the cadence test's loop had no upper bound and hung while recharge was still unimplemented. I stopped that container, which I had started myself, with `docker stop`, and bounded the loop at 6,200 ticks with an `expect(fullAt)` check before the RED commit.
- A concurrent `lint` saw the transient `src/sim/__purity_three_probe.ts` written by `tests/guards/sim-purity.test.ts` during the full run. Rerun after the suite finished, `lint` was clean.

## Known Stubs

None.

## Next Phase Readiness

18-07, 18-08 and 18-18 can read `isBuoySubentityAttached` for the subentity's mass drop (about 7,646.79), its hidden mesh and its collider. CBT-17 stays Pending in REQUIREMENTS.md until the sibling plans land.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*

## Self-Check: PASSED

All five plan commits are ancestors of HEAD; ids.ts, statics.ts and hit.ts carry the new symbols; no stub patterns in the changed source.

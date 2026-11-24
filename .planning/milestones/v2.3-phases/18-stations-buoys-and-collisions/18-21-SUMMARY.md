---
phase: 18-stations-buoys-and-collisions
plan: 21
subsystem: sim/npc
tags: [proximity, buoys, collision-chain, oolite-fidelity, pd-06, pd-08]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-18 buoy colliders; 18-05/18-14 buoyPosition, isBuoyDestroyed, World.buoys offsets"
provides:
  - "live buoys as NPC proximity candidates through the world view (PD-06)"
  - "src/sim/npc/collision-chain.ts: Oolite's filterSortedLists as it really runs, gating buoy pairs (PD-08)"
  - "tests/guards/collision-chain-scope.test.ts and the all-pairs todo"
  - "tests/sim/combat/collision-traffic.scenario.test.ts: a populated world with collisions on"
affects: [18-19, 18-12, npc-steering, acceptance]

actuals:
  tokens: 34400
  tasks: 3
  commits: 4
plan_head_before: 79a02b242239cbea3e8b2d7c4a5c4fa003dcb1f8
plan_head_after: b78b30522aa9b2694ab0d176607b3dced151a257

tech-stack:
  added: []
  patterns:
    - "a static body enters the proximity pass through the world view, which omits a destroyed buoy"
    - "a deferred scope is a todo plus a guard test that fails, naming it, when the scope changes"

key-files:
  created:
    - src/sim/npc/collision-chain.ts
    - tests/sim/npc/buoy-proximity.test.ts
    - tests/sim/combat/collision-traffic.scenario.test.ts
    - tests/guards/collision-chain-scope.test.ts
    - .planning/todos/pending/2026-11-20-collision-chain-prefilter-all-pairs.md
  modified:
    - src/sim/npc/proximity.ts
    - src/sim/world/view-impl.ts
    - tests/sim/world/view.test.ts
    - tests/sim/npc/proximity.test.ts
    - tests/sim/npc/hot-weapon.test.ts
    - tests/sim/npc/fire-route.test.ts
    - tests/sim/npc/escort-refresh.test.ts
    - tests/sim/npc/step-integration.test.ts
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "Owner 2026-11-20 (Q1, option A): five Phase 14/17 test files whose scenarios fly through the Lave witchpoint beacon mark it destroyed in their scene setup; no expected value changed"
  - "Owner 2026-11-20 (Q2): port filterSortedLists as it really runs (dead downward walks, z chain only, planet and sun slabs), buoy pairs only; all-pairs deferred to a todo with a guard"
  - "PD-08 corrected 2026-11-20 by owner decision after code verification: the plan's eliminate-both-ways reading and its x-axis band were wrong"

requirements-completed: []

coverage:
  - id: D1
    description: "A steered Krait flying at the witchpoint beacon is alerted before contact, avoids within two ticks and turns away; a destroyed beacon is neither seen nor avoided; an offset beacon alerts from its live centre"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/npc/buoy-proximity.test.ts#a Krait flying at the witchpoint beacon is alerted and turns away (tracer)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The view reports a buoy at its live pose and omits a destroyed one (body, isValid, scan)"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/view.test.ts#the buoys in the view (Phase 18, PD-06)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The collision-chain prefilter: z-chain onset (213.66, 218.66] m for a Krait at the isolated beacon, 236.54 m trigger off the z axis and at the Lave nav buoy, silent at 236 m along z"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/npc/buoy-proximity.test.ts#the alert onset of a buoy (PD-08)"
        status: pass
      - kind: unit
        ref: "tests/guards/collision-chain-scope.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "A populated world runs 4,000 ticks with collisions on under sanity bounds"
    verification:
      - kind: integration
        ref: "tests/sim/combat/collision-traffic.scenario.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "QUAL-11 acceptance 21/21 at b78b305; traffic.spec.ts and npc-flight.spec.ts pass remotely"
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (exit=0 elapsed=81s snapshot=b78b305)"
        status: pass
      - kind: e2e
        ref: "wegolite-remote-run.sh ... playwright test tests/e2e/traffic.spec.ts tests/e2e/npc-flight.spec.ts (exit=0 elapsed=56s snapshot=b78b305)"
        status: pass
    human_judgment: false

duration: 31min (this session; the plan was started by an earlier executor that stopped on two owner questions)
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 21: Navigation buoys in the NPC proximity pass Summary

**Live buoys are NPC proximity candidates through the world view (PD-06), gated by a port of Oolite's `filterSortedLists` as it really runs (PD-08, buoy pairs only): a Krait meets the isolated witchpoint beacon along z at 217.5 m, along x at 235.0 m, and turns away; QUAL-11 is unchanged to the last digit.**

## Performance

- **Started:** 2026-11-20T14:30Z (resume after the owner's answers) | **Completed:** 2026-11-20T15:01Z
- **Tasks:** 3 of 3 | **Files modified:** 16 (5 created)

## Owner decisions (2026-11-20)

1. **Question 1, option A.** Five Phase 14/17 test files fly steered ships through the Lave witchpoint beacon at the origin. Only their scene setup changed: `world.staticHealth.witchpoint = 0` with the comment "PD-06: this scenario is not about the witchpoint beacon (owner decision 2026-11-20)". No expected value changed. The 16 cases this covers: `proximity.test.ts` (a) x2, (f) and (d) (builders `nearPass` and case (d)'s `pass`); `hot-weapon.test.ts` 7 (`duelWith`); `fire-route.test.ts` 3 (`duel`); `escort-refresh.test.ts` 1 (`convoy`); `step-integration.test.ts` 1. The plan's diff gate now lists exactly these five files outside the bounded set, plus the guard the owner asked for.
2. **Question 2: port Oolite as it really runs, buoy pairs only.** Three models and an independent read verified the code; this executor re-read it (`Universe.m:6713-7144`, `CollisionRegion.m:235-365`, `Entity.m:240-250` and 455-470). In summary:
   - Every downward walk is dead code: the upward `while (e0)` exits with `e0 == nil`, and `e0` is not reset. So no collidable body is ever eliminated.
   - A pair is tested only when both bodies are in one `collision_chain` built by the final upward z pass.
   - The lists are sorted by lower edge, `z - collision_radius`.
   - A body joins the chain when `next.z - 2r_next` is below the running finish.
   - The planet (`radius_km x 10`) and the sun are chain bodies.
   - Oolite's z is Wegolite's -z.
   - No subregion is ever added (`addSubregionAtPosition` has no caller outside itself), so the universe region holds every pair.

## Findings from this executor's verification

- **Rule 1 bug in the WIP: it sorted the lists by centre, not by lower edge.** Fixed in `sortedOn`. The test "sorts by the lower edge ... not by centre" pins the difference with a three-body case that chains under Oolite's sort and not under the centre sort.
- **The premise behind the buoy-only scope came from that bug.** The owner was told that the all-pairs prefilter moves Phase 14 station case (c). Measured with a temporary edit, then reverted:
  - With the centre sort, the all-pairs variant fails only `proximity.test.ts` case (c).
  - With Oolite's lower-edge sort, it holds every Phase 14 suite: `tests/sim/npc`, `tests/oracles/npc`, `populate`, `sim-driver` and `tick-parity` (38 files, 1,655 tests).
  - The owner's explicit scope (buoy pairs only) was kept. The todo `2026-11-20-collision-chain-prefilter-all-pairs` records the corrected fact and that the QUAL-11 effect of the all-pairs version is unmeasured. **This needs the owner's attention**, because PD-08's original condition ("every pair if the Phase 14 pins hold") would now favour all pairs.
- **Lave geometry** (computed in `buoy-proximity.test.ts`):
  - Planet: Wegolite z -452,760, R 41,160. Its slab in Oolite z is 370,440 to 535,080.
  - Sun: z -755,203.68, R 84,449.10.
  - Nav buoy: z -430,704.12, inside the planet's slab and chained with the planet and the station.
  - Witchpoint beacon: outside both slabs.
- **Slab counts over all 2,048 systems** (scratch, in the container, each buoy paired alone with the planet or the sun):

  | Body | In the planet's slab | In the sun's slab |
  |---|---|---|
  | Witchpoint beacon | 0 | 307 (15.0 %) |
  | Nav buoy | 2,048 (100 %) | 476 (23.2 %) |

  With all five statics together, the beacon shares a chain with the planet in 32 systems, through the sun's slab. These agree with the models' estimates: 0 for the beacon in the planet's slab, about 10-15 % in the sun's, and 70-99 % for the nav buoy in the planet's.

## Measured results (`tests/sim/npc/buoy-proximity.test.ts`)

- **Tracer, z approach at maxFlightSpeed 300 m/s.**
  - The alert names the beacon on tick 313, at a centre distance of 217.5 m.
  - `AVOID_COLLISION` follows within two ticks.
  - 30 ticks later the nose points further from the beacon.
  - **The closest approach is 22.24 m centre to centre, so contact happens** (contact distance is r_krait + r_buoy = 109.33 m). One tick of warning at 300 m/s is not enough to clear the buoy. This is recorded as faithful, not tuned (review L529, L301).
- **Control:** with the beacon destroyed, no alert and no behaviour change. The ship flies through the beacon's centre (closest 0 m; the bare world step runs no collisions).
- **Onset band:**
  - Along z: 217.5 m, inside (213.66, 218.66].
  - Along x: 235.0 m, inside (231.54, 236.54].
  - Lave nav buoy along z: 235.0 m, the pair trigger, because the buoy is inside the planet's slab.
  - At 236 m along z, no alert on that tick. A direct `proximityAlertFor` call that bypasses the prefilter does alert.
- **Offset beacon** (offset +300 m on x): alerted from its live centre, inside the z band.
- **A steered ship far from both buoys** produces the same store bytes as with both buoys destroyed.
- **The plan's band test was replaced as the owner instructed.** Its claim "along the world x axis, onset 218.66 m" was wrong.

## Re-pins and pinned worlds

- **No re-pin.** `sim-driver.test.ts`, `tick-parity.test.ts`, `npc-cadence.test.ts` and `steering.property.test.ts` are unchanged and pass. `HASH_60_AFTER_KILL` and `TWIN_HASH_60_AFTER_KILL` were not touched. No world golden or acceptance file moved: `git diff --quiet 76229f5 -- tests/acceptance tests/golden/world` exits 0, and so does the same check against 79a02b2 with `tests/e2e` added.
- **Pinned worlds with a steered ship within a buoy's alert extent, checked before the remote run:**
  - Unit pins: none moved.
  - QUAL-11: the flyer starts lie at least 8,172 m from the nav buoy and at least 419,360 m from the beacon. The parked player is 7,990 m from the nav buoy.
  - After the run, no seed value moved, so no acceptance flyer came within a buoy's alert extent in a way that changed any measure.

## QUAL-11 (remote, PD-07)

`exit=0 elapsed=81s snapshot=b78b305`, 21 of 21. Before is plan 18-18's run at 79a02b2. Every value is identical, seed by seed, so no value moved and no PD-07 acceptance was needed:

| Seed | Arrivals s/i/f | AVOID_COLLISION | Attack ticks | Stuck windows | Frozen windows | Min station clearance (m) | Min hull clearance (m) | Failure counters |
|---|---|---|---|---|---|---|---|---|
| 1 | 2/2/2 | 1 | 2972 | 9 | 14 | 2714.99 | 47.18 | 0 |
| 2 | 2/2/2 | 1 | 3091 | 9 | 14 | 2716.72 | 47.18 | 0 |
| 3 | 2/2/2 | 1 | 2960 | 8 | 13 | 2713.00 | 46.01 | 0 |
| 4 | 2/2/2 | 1 | 3197 | 8 | 15 | 2715.53 | 47.18 | 0 |
| 5 | 2/2/2 | 1 | 2061 | 8 | 15 | 2717.64 | 46.01 | 0 |
| 6 | 2/2/2 | 1 | 2014 | 8 | 15 | 2715.53 | 46.01 | 0 |
| 7 | 2/2/2 | 1 | 3164 | 10 | 16 | 2716.13 | 49.82 | 0 |
| 8 | 2/2/2 | 1 | 3865 | 9 | 14 | 2715.53 | 47.18 | 0 |
| 9 | 2/2/2 | 1 | 3006 | 8 | 13 | 2716.13 | 47.18 | 0 |
| 10 | 2/2/2 | 2 | 4106 | 9 | 14 | 2716.13 | 41.41 | 0 |
| 11 | 2/2/2 | 1 | 3422 | 10 | 15 | 2716.13 | 54.23 | 0 |
| 12 | 2/2/2 | 1 | 3880 | 8 | 13 | 2714.99 | 47.18 | 0 |
| 13 | 2/2/2 | 1 | 2385 | 10 | 16 | 2713.00 | 49.82 | 0 |
| 14 | 2/2/2 | 1 | 2950 | 9 | 15 | 2715.53 | 49.82 | 0 |
| 15 | 2/2/2 | 1 | 3257 | 8 | 15 | 2716.13 | 47.89 | 0 |
| 16 | 2/2/2 | 1 | 3826 | 9 | 16 | 2716.13 | 54.23 | 0 |
| 17 | 2/2/2 | 1 | 2916 | 9 | 14 | 2714.99 | 47.18 | 0 |
| 18 | 2/2/2 | 2 | 2166 | 8 | 15 | 2715.53 | 47.18 | 0 |
| 19 | 2/2/2 | 1 | 2962 | 8 | 15 | 2714.99 | 47.18 | 0 |
| 20 | 2/2/2 | 2 | 3462 | 10 | 16 | 2713.00 | 49.82 | 0 |

Totals before and after: arrivals 40/40/40, AVOID_COLLISION 23, attack ticks 61,662, stuck windows 175, frozen windows 293. The goal ticks are also identical. No `Detector-change-approved-by-owner` trailer was used, and nothing in `tests/acceptance` was edited.

## Populated collisions-on scenario (`collision-traffic.scenario.test.ts`)

Counts are contact pair-ticks: one per pair per tick in contact.

| Seed | Set-up | Ships | Ship-ship | Ship-buoy | Ship-pod | Ship-station | Player | Kills (laser/collision/other) | Buoy-alert ticks | Ships alerted by a buoy | Beacon offset |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 101 | acceptance parking set-up near the station | 12 | 0 | 0 | 0 | 0 | 0 | 0/0/0 | 0 | 0 | 0 |
| 202 | column through the witchpoint beacon, intercepting the player | 12 | 13 | 3 | 0 | 0 | 0 | 0/1/0 | 843 | 8 | 1.89 m |

Every sanity bound held over 4,000 ticks per seed. No buoy was destroyed.

## Remote traffic-on specs

`exit=0 elapsed=56s snapshot=b78b305`, 4 passed:
- `npc-flight.spec.ts:135`
- `traffic.spec.ts:229`
- `traffic.spec.ts:393`
- `traffic.spec.ts:651`

## Task Commits

1. **Tasks 1 and 2: buoys in the pass and the prefilter, the tests and the five setup files** - `24f7cda` (feat)
2. **Task 2: the scope guard and the all-pairs todo** - `fc0a7a6` (test)
3. **Task 3: the PROJECT and FIDELITY records** - `4af0cc4` (docs)
4. **Task 3: the populated scenario** - `b78b305` (test)

## Deviations from Plan

1. **[Rule 1 - Bug] The lists were sorted by centre.** Found while checking the WIP against `Entity.m:247` and 462-467. Fixed in `collision-chain.ts`, `24f7cda`.
2. **[Owner decision] The prefilter semantics changed.** `chainEliminated` now returns only the bodies that cannot collide (plus non-finite bodies); the plan's "eliminates both when farther" was wrong. The pair gate is `chainsPair` (one shared z chain). The band test and the x-axis claim were replaced as instructed.
3. **[Owner decision] Files outside the plan's list:** the five setup files, `tests/guards/collision-chain-scope.test.ts` and the todo.
4. **TDD order.** The implementation existed as WIP from the earlier executor, so the new tests were written after it and no separate RED commit exists. The 16 Phase 14/17 failures under the unguarded WIP served as the observed RED for PD-06.
5. **The populated scenario gathers its ships.** At their populated positions the ships are hundreds of kilometres apart. Measured with pilots: no contact, kill or alert in 4,000 ticks, and attack pilots give up out of scanner range. So seed 101 uses `setUpSeed` from `tests/acceptance/detectors.ts` (import only, nothing edited), and seed 202 puts the ships in a column through the beacon.
6. **The docs landed with the code instead of in Task 3.** The CHANGELOG line went into the feat commit (AGENTS.md: the same commit as a user-visible change). The PROJECT and FIDELITY records came in the next commit.

## Issues Encountered

None blocking. `requirements-completed` is empty on purpose: CBT-18 stays open while 18-19 and 18-12 declare it.

## Next Phase Readiness

- 18-19 and 18-12 still declare CBT-18, so it is not marked complete.
- **For the owner:** the all-pairs prefilter (todo `2026-11-20-collision-chain-prefilter-all-pairs`) now holds every Phase 14 suite with the corrected sort. Decide whether to schedule it, with a QUAL-11 run.

## Self-Check: PASSED

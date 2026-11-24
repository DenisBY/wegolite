---
phase: 18-stations-buoys-and-collisions
plan: 18
subsystem: combat
tags: [collisions, buoys, subentity, collideWithShip, cadence, cost, fast-check, tripwire]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-11 resolveCollisions, colliderRank, runContactCalls; 18-16 collideWithShip (dvOtherBody, dpOtherSubentity); 18-14 World.buoys; 18-17 stepBuoyDrift; 18-15 buoy subentity targets 6 and 7; 18-07 NAV_BUOY_MASS, BUOY_SUBENTITY_MASS, NAV_BUOY_HULL_MASS; 18-20 the real-Oolite buoy-ram record"
provides:
  - "src/sim/combat/collide.ts: the buoys as colliders and movers (PD-02), the subentity contact rule (PD-01), CollisionStats, resolveCollisions(..., layout?) returning { records, stats }"
  - "tests/guards/collision-player-death.test.ts and todo 2026-11-19-collision-reversal-on-player-death (the tripwire for the deferred player reversal)"
  - "tests/sim/world/collision-cadence.test.ts (30/60/144 Hz), tests/sim/combat/collision-cost.test.ts (pinned counters), tests/sim/combat/collision-stage.property.test.ts (totality with buoys)"
affects: [18-19, 18-21, 18-12, phase-20]

actuals:
  tokens: 39800
  tasks: 3
  commits: 5
plan_head_before: 5212ba7d40697c5db3c32ecf52a6c5a05d535725
plan_head_after: 42ed56740da66996b682ed89220c32fda3896b95

tech-stack:
  added: []
  patterns:
    - "A static body joins the collision stage through its layout key: pose, velocity, energy and writes read and write World.buoys and World.staticHealth, read live per call"
    - "A guard over (path, text) pairs keyed on producers and on a pinned union, with synthetic inputs per trigger"

key-files:
  created:
    - tests/sim/combat/collision-buoy.test.ts
    - tests/sim/combat/collision-cost.test.ts
    - tests/sim/combat/collision-stage.property.test.ts
    - tests/sim/world/collision-cadence.test.ts
    - tests/guards/collision-player-death.test.ts
    - .planning/todos/pending/2026-11-19-collision-reversal-on-player-death.md
  modified:
    - src/sim/combat/collide.ts
    - src/sim/combat/step.ts
    - docs/PERFORMANCE.md
    - .planning/PROJECT.md
    - FIDELITY.md
    - CHANGELOG.md

key-decisions:
  - "resolveCollisions takes an optional layout (5th argument); without it no buoy is a collider, so 18-11's direct stage tests keep their 4-argument calls; resolveShots passes its layout"
  - "The dam1 record of a buoy-subentity contact keeps the buoy's id (4, 5) as its source, as 18-11's stage did for any subentity; only dam2 moves to the subentity's id (6, 7)"
  - "The 18-20 contact-distance comparison is under-determined: at the probe's fixed roll the stage's first contact along the buoy's right axis (99.96 to 100.59 m) is outside Oolite's bracket (79.827 to 92.154 m), but scanning the player's roll and the buoy's spin gives 81.40 to 103.25 m, which contains it; 18-20 did not log either angle. Recorded in FIDELITY, flagged for the owner"

patterns-established:
  - "CollisionStats: plain counters returned with the records; the cost guard pins them for a fixed-seed scene"

requirements-completed: [CBT-18]

coverage:
  - id: D1
    description: "The player rams the nav buoy at 100 m/s: the 18-03 damages (139.738, 42.948), the buoy's velocity and offset in World.buoys, then 8.333 m nudge plus 9.583 m of braking; both hash lines; 250 m/s destroys it credited to the player and it never moves again"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-buoy.test.ts#the player rams the nav buoy (tracer, PD-02)"
        status: pass
    human_judgment: false
  - id: D2
    description: "The buoy's frangible subentity: a cavity contact damages id 7 with the subentity's mass and energy, the buoy keeps dvOtherBody (also when the rammer dies), the subentity stays at its authored offset; detached, no contact there and the hull mass NAV_BUOY_HULL_MASS"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-buoy.test.ts#the buoy's frangible subentity (PD-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Determinism: a Krait ram, a pod into an Adder and a nav-buoy touch hash equal at 30, 60 and 144 Hz; the frozen anchors and the world goldens unchanged"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/collision-cadence.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts, world-cadence, debris-cadence, npc-cadence, populate"
        status: pass
    human_judgment: false
  - id: D4
    description: "Cost at the cap: 259 colliders, the sweep looks at 1,373 of 33,411 pairs and narrow-tests exactly the 5 sphere-overlapping ones (pinned)"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-cost.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Totality with buoys (fast-check, 300 runs) and the directed edge cases (three bodies in rank order, the radius sum is no pair)"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/combat/collision-stage.property.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "Tripwire for the deferred player reversal: green on the tree, ten synthetic cases"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/guards/collision-player-death.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "The stage's first player-buoy contact distance against 18-20's real-Oolite record"
    verification: []
    human_judgment: true
    rationale: "The plan makes this a human gate: 18-20's values live in FIDELITY prose, and the record lacks the player's roll and the buoy's spin, so the comparison below needs the owner's reading"

duration: 41min
completed: 2026-11-20
status: complete
---

# Phase 18 Plan 18: Buoys in the Collision Stage Summary

**The two buoys are now colliders and movers: a ram damages the buoy by Oolite's rule, pushes it through `World.buoys` and lets it brake by its own thrust; a contact on its frangible subentity damages ids 6/7 and still moves the buoy; the stage reports `CollisionStats`, hashes equal at 30/60/144 Hz, is total with buoys, and the player's deferred death reversal has its tripwire.**

## Performance

- **Duration:** about 41 min
- **Started:** about 2026-11-20T12:50Z
- **Completed:** 2026-11-20T13:31Z
- **Tasks:** 3 (Tasks 1 and 2 TDD, Task 1 a tracer)
- **Files:** 12 (6 created, 6 modified)

## Accomplishments

- `gatherColliders` adds each buoy that is not destroyed and whose `buoy` hull is loaded (with a layout). Each one has its static id, the pose `buoyPosition` plus `buoyOrientation(flightTime)`, its drift as total velocity, and `staticHealth` as energy. Its mass is `NAV_BUOY_MASS`, or `NAV_BUOY_HULL_MASS` once the subentity is detached, which also excludes the subentity from the octree test.
- A buoy's share of a response goes to `World.buoys.<key>.velocity`, held at `MAX_ENTITY_VELOCITY`, and to `.offset`, held at `MAX_BUOY_OFFSET`.
- A contact on an attached buoy subentity makes the subentity the other party: `BUOY_SUBENTITY_MASS`, `subentityEnergy`, and the buoy's velocity as the parent's. `dam2` goes whole to id 6 or 7, with no bleed-through to the buoy. The buoy takes `dvOtherBody`; neither `dvOtherSubentity` nor `dpOtherSubentity` is applied.
- `CollisionStats { colliders, sweptPairs, narrowTests, contacts }` is returned with the records.
- Docs:
  - PROJECT.md: the collisions row is extended, and the statics row notes rams.
  - FIDELITY: five new rows (excerpts E-139 to E-141, and E-123 and E-132 reused), the buoy case added to the per-body list row, the comparison with 18-20, and the stale `collide.ts` line numbers moved.
  - PERFORMANCE: a new row for the collision stage.
  - CHANGELOG: one new line.

## Buoy ram numbers against the fixtures

| Case | Stage result | Fixture |
|---|---|---|
| Player at 100 m/s into the nav buoy (direct stage call, at first contact) | dam1 139.7382354736328, dam2 42.94753646850586, buoy velocity -100 m/s on z, offset -8.333333969116211, player drift +180.3800506591797 | `collide-player-buoy-100`: identical |
| The same through `stepSim`, engine off after the touch | buoy at rest after 240 ticks, offset z -17.917 (nudge 8.333 + braking 9.583, to 1e-6) | `brake-ship-buoy-thrust-100-from-100`: 9.583335928122201 |
| Player at 250 m/s | `shipDestroyed` for id 5, killer 100, health 0, no nudge, offset unchanged afterwards, player flies through | `dam2 = 268.4 > 250` |
| Pod at 60 m/s in the hull cavity (offset (-27.5, -5, 0), identity pose) | records [pod 0.5506 from 5], [7 0.0715 from pod]; buoy velocity = dvOtherBody; offset 0 | `collideWithShip` with m2 7,646.786 |
| Detached, player at 100 m/s | dam1 138.2089 (mass 691,044.375) | `collideWithShip` with `NAV_BUOY_HULL_MASS` |

Only a pod or a plate can touch the subentity without touching the hull. A 2.5 m grid scan found 102 such points for a pod, 95 for a plate, and none for the Cobra, a Sidewinder or an Adder.

## Comparison with 18-20 (first-contact centre distance, human gate)

Method: the player starts 150 m out, nose to the buoy, and is moved at the closing speed 18-20 observed. The stage is called once per tick, with the buoy's tumble running from several start times. Each tick of travel is 0.66 m (forward) or 0.63 m (right).

| Approach | Stage (this plan) | Oolite 18-20 (contact frame / frame before, no contact) | Verdict |
|---|---|---|---|
| Along buoy +forward, 79.7814 m/s | 95.48 to 100.80 m | 91.607 m / 105.125 m | inside Oolite's bracket |
| Along buoy +right, 75.0558 m/s | 99.96 to 100.59 m | 79.827 m / 92.154 m | 7.8 m outside the bracket at the probe's fixed player roll, beyond one tick: a dispute as the plan defines it |

The dispute is under-determined rather than a found error in the octree port. The first-contact distance along right depends on the player's roll about its nose and on the buoy's spin about that axis (pitch about local X spins it). Scanning both through `doOctreesCollide` gives 81.40 to 103.25 m along right, for example 87.7 m at a 90 degree roll and 81.4 m at 270 degrees. That range contains Oolite's bracket. Along forward the same scan gives a constant 103.25 m. 18-20 logged neither angle. The damage at the observed speeds equals 18-20's reference exactly (88.944 and 27.336, 78.720 and 24.194). This is recorded in FIDELITY after the 18-20 ram table. **Owner reading needed:** settle it with a re-measurement that logs the player's roll and the buoy's orientation at contact, or accept the scan as sufficient.

## Traffic-on spec pre-audit (before the remote run)

The launch leaves the slot at 175 m/s on the dock axis, straight at the nav buoy 10,000 m from the station centre. Node twin (`runTickScript`, traffic on, idle controls):

| Spec | Ticks flown after launch | From the station | To the nav buoy (closest) |
|---|---|---|---|
| `tick-hook` | 600 | 1,375 m | 8,625 m |
| `traffic` | 600 (each replay) | 1,375 m | 8,625 m |
| `npc-flight` | 600 + 1,200 | 3,125 m | 6,875 m |
| `combat` (upper bound 300 + 30 + 360 + 1,500 + 60) | at most 2,250 | at most 3,709 m | at least 6,291 m |

None is at risk. With idle controls the player would reach the buoy about 54 s after launch (6,000 ticks: 750 m to go).

## Cost

- At 259 colliders (seed 1894) the counts are swept pairs 1,373, narrow tests 5 and contacts 0, pinned.
- Median wall time of one stage call over 1,000 calls in the `test` container: 2.09 to 2.17 ms (90th percentile 2.29 to 2.38 ms). The 5 octree tests take about 1.34 ms of that.
- This is informational, recorded in `docs/PERFORMANCE.md`.

## Tripwire

`tests/guards/collision-player-death.test.ts` is a pure rule over (path, text) pairs. It is active only while `collide.ts` holds `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20`, and its messages name the todo. It fails on any of three triggers:

- (a) a non-comment `playerDestroyed` anywhere in `src/sim`, except the two `events.ts` declaration lines, matched by trimmed text and each allowed once;
- (b) `FlightMode` not exactly `"docked" | "launching" | "inFlight"`;
- (c) the ledger's floor marker sentence missing.

Cases:

- The current tree passes.
- These fail: a `kill.ts` push, an `events.ts` factory, a constant, `"destroyed"` and `"dead"` added to `FlightMode`, a non-literal member, the ledger without its marker, and a second declaration copy.
- The two declaration lines with a doc comment pass, and the guard retires once the marker is gone.

## Task Commits

1. **Task 1 (tracer): the player rams the nav buoy, end to end.** `b94053d` (test, RED: 6 of 8 failed on their assertions, for example `expected [] to deeply equal [["scrape",100,5],...]`, because buoys were not colliders), then `721eec6` (feat, GREEN, with the CHANGELOG line). Tracer gate in auto mode: I re-ran the Task 1 verify (31 passed, typecheck clean) before Task 2.
2. **Task 2: cadence, cost and totality.** `0a2576c` (test, RED: the stats cases failed, `stats` undefined; the cadence test already passed, since it needs no new code), then `70c2f30` (feat, GREEN, with the PERFORMANCE row).
3. **Task 3: the tripwire, the records and the remote gates.** `42ed567` (docs, with the guard and the todo).

`tdd_mode` is off, so the RED classifier was not run. Each GREEN commit follows its RED commit.

## Twin hashes

No twin value moved. `HASH_60_AFTER_KILL` and `TWIN_HASH_60_AFTER_KILL` passed unchanged (the local `tests/app/session` run and the remote `combat.spec`). The owner's standing approval was not used.

## Deviations from Plan

**1. [Rule 3 - Blocking] `src/sim/combat/step.ts` edited (not in the plan's file list).** The stage needs the layout to place the buoys, so `resolveShots` now passes it (one call). Committed in `721eec6`.

**2. [AGENTS.md rule] The CHANGELOG line shipped with the feature commit (Task 1), not in Task 3,** because a user-visible change and its line must be in the same commit (18-11's precedent).

**3. `collision-stage.test.ts` was not edited.** The 18-11 dock replay stays byte-identical with buoys colliding: its approach never reaches the nav buoy. So the start pose did not move.

**4. Test-input adjustments while writing the cases.**
- The hash check reads `serializeStaticHealth`, `serializeBuoyStates` and the pristine predicates, because `hashWorld` returns a digest.
- The cost seed is 1894 (the first seed from 1800 with five sphere-overlapping pairs), so the narrow count is not vacuously 0.
- The property generator now spawns at a finite position and poisons it after the spawn, because the spawn refuses NaN.
- The three-body scene is at 90 m, because the Cobra first touches the buoy below about 100 m.

**5. FIDELITY line refreshes.** Seven existing rows cited `collide.ts` lines that this plan shifted. They now point at the same statements.

**Total deviations:** 1 blocking fix, 1 AGENTS.md ordering, 1 non-edit and test-only adjustments. **Impact:** no scope change. No frozen threshold, detector, acceptance file or browser spec was touched (`git diff --quiet 5212ba7 -- tests/e2e tests/acceptance tests/golden/world` exits 0).

## Issues Encountered

- The first full local `test` run had 1 failure: `tools-determinism` "Math.sin fails lint" timed out at 38.8 s while I ran `typecheck` and `lint` in parallel. A typecheck in that window also saw a transient `__purity_` probe file. Rerun alone: 262 files, 7,002 passed, 10 skipped, exit 0.
- The comparison with 18-20 above is open for the owner.

## Verification

- Targeted: `collision-buoy`, `collision-stage`, `collision-cadence`, `collision-cost`, `collision-stage.property`, `flight-hash-pins`, `world-cadence`, `debris-cadence`, `npc-cadence`, `populate`: 10 files, 102 passed. Also `tests/sim/combat tests/sim/world tests/app/session tests/guards`: 79 files, 2,657 passed.
- `docker compose run --rm test` (coverage): 262 files, 7,002 passed, 10 skipped, exit 0.
- `lint`: exit 0, Prettier clean.
- `typecheck`: exit 0.
- FIDELITY contract with `OOLITE_SRC` set to a `git archive 7437f22 src` extract: 9 of 9, every excerpt verbatim.
- **Remote acceptance (QUAL-11):** `exit=0 elapsed=78s snapshot=42ed567`, 21 of 21.
  - Every failure counter is 0 on all 20 seeds.
  - The totals are unchanged from 18-11: arrivals 40 / 40 / 40, AVOID_COLLISION entries 23, attack ticks near the player 61,662, stuck windows 175, frozen windows 293, minimum station clearance 2,713.00 m, minimum hull clearance 41.41 m.
  - This is a frozen-worlds check only: the harness never sets collisions.
- **Remote traffic-on specs** (`combat`, `traffic`, `tick-hook`, `npc-flight`): `exit=0 elapsed=69s snapshot=42ed567`, 10 passed, none edited.
- **Acceptance criteria:**
  - In the non-comment code of `collide.ts`, `BUOY_SUBENTITY_MASS`, `NAV_BUOY_MASS` and `MAX_BUOY_OFFSET` each appear twice.
  - `killer|shipHit` in `collide.ts` prints nothing.
  - `CollisionStats` is present.
  - Both new test files exist.
  - `tests/golden/world` is unchanged since `76229f5`.
  - The guard and the todo exist.
  - "Navigation buoys collide too" appears once in CHANGELOG.md.
  - `playerDestroyed` in `src/sim` prints only `events.ts` lines (179, 195 doc, 227).
  - In the guard, `events\.ts` matches 7 times, `"destroyed"` twice and `inFlight` 8 times.
- CBT-18 stays open in REQUIREMENTS.md: plans 18-19, 18-21 and 18-12 still declare it.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- 18-21 can add the buoys to the NPC proximity pass; a traffic-on NPC may ram a buoy until then (noted in PROJECT.md).
- 18-19 extends the blast.
- 18-12 should re-run the guard's synthetic cases at phase close and carry the 18-20 comparison question.

## Self-Check: PASSED

- FOUND: every key file listed above.
- FOUND commits `b94053d`, `721eec6`, `0a2576c`, `70c2f30`, `42ed567` as ancestors of HEAD.

## Post-plan follow-up: Oolite re-measure (owner decision 2026-11-20)

The owner chose to settle the comparison with 18-20 by re-measuring on real Oolite with both orientations logged. Eleven sessions ran on the headless Oolite 1.93.1-255 reference, from `c988e17` with a clean tool tree, one at a time, 2026-11-20T15:12:10Z to 15:24:42Z, each `exit=0 container_exit=0`. Each session logged, on every frame up to the first contact, both bodies' positions, velocities, quaternions and basis vectors, the buoy's spin rates and the frame time. There were seven 18-20-style rams (100 m/s set, engine at rest with `maxSpeed = 0`): +right with the player rolled 0, 90, 180 and 270 degrees, then +forward, -right and -forward. There were also four step sessions at 0.5 m per frame. A scratch Vitest in the `test` container rebuilt every logged pose and called `doOctreesCollide` with `fullHullTable()`.

| Run | Oolite prime | Oolite touch / no touch (m) | Wegolite onset, Oolite's prime (m) | Verdict | Stage onset, player prime (m) | Verdict |
|---|---|---|---|---|---|---|
| ram +right, roll 0 | buoy | 79.012 / 92.194 | 89.00 | SAME | 96.06 | MISMATCH, 3.77 m |
| ram +right, roll 90 | buoy | 86.152 / 100.555 | 95.63 | SAME | 100.61 | SAME |
| ram +right, roll 180 | buoy | 72.171 / 85.421 | 83.89 | SAME | 100.58 | MISMATCH, 15.37 m |
| ram +right, roll 270 | buoy | 70.469 / 84.568 | 77.95 | SAME | 95.90 | MISMATCH, 11.42 m |
| ram +forward, roll 0 | player | 91.372 / 104.853 | 104.18 | SAME | 104.18 | SAME |
| ram -right, roll 0 | player | 99.558 / 115.331 | 102.45 | SAME | 102.45 | SAME |
| ram -forward, roll 0 | buoy | 82.362 / 97.678 | 95.84 | SAME | 94.78 | SAME |
| step +right, roll 0 | buoy | 71.5 / 72.0 | 73.44 | SAME | 94.40 | MISMATCH, 22.36 m |
| step -right, roll 0 | player | 101.5 / 102.0 | 102.14 | SAME | 102.14 | SAME |
| step +forward, roll 0 | player | 96.0 / 96.5 | 96.57 | SAME | 96.57 | SAME |
| step -forward, roll 0 | buoy | 96.5 / 97.0 | 97.79 | SAME | 102.76 | MISMATCH, 5.88 m |

Onsets are at the contact frame's orientations. SAME means the replay gives Oolite's answer on every logged frame (222 frames in all): no contact before the contact frame, contact on it.

- The octree port is SAME at matched orientations on all 11 sessions, provided the prime is Oolite's. Oolite's prime is the collision chain's `e1`, the body with the lower `z - collision_radius` (`Entity.m:247`, `Universe.m:7044-7073`, `CollisionRegion.m:287`).
- The octree test is not symmetric: at one pose the onset can differ by about 24 m between the primes. The stage always makes the player the prime (FIDELITY row E-135). It is a MISMATCH in the 5 sessions where Oolite's prime was the buoy, 3.77 to 22.36 m outside the bracket.
- This explains the 18-18 dispute: 18-20's +right session had the buoy as Oolite's prime, and its +forward session had the player. The dispute is **not closed**. Following the owner's instruction, nothing was changed in code, fixtures or tolerances. The todo `.planning/todos/pending/2026-11-20-buoy-contact-onset-mismatch.md` holds the evidence and two options (port Oolite's z-order prime, or accept and widen E-135) for triage at 18-12.
- FIDELITY.md, PD-03 section: the 18-18 comparison paragraph now points to the new paragraph "Buoy first-contact re-measure with both orientations logged", which carries the full table with session ids and orientations.
- Evidence, outside the repository: `/tmp/remeasure-1818/`. It holds the probe OXP template and scripts (`src/`), each session's OXP, steps file and outputs (`runs/<name>/`), the parsed frames and replay results (`analysis/`), and the scratch replay (`replay/replay.test.ts`, `replay/vitest.config.mjs`).

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-20*

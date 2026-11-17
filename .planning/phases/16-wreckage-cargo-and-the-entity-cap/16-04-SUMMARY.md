---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 04
subsystem: sim
tags: [debris, wreckage, alloy-plate, blast, octree, burn-down, entity-cap, test-pilot, cadence, property, world-17, cbt-08-staged, qual-11]
status: complete

requires:
  - phase: 16-wreckage-cargo-and-the-entity-cap
    provides: "plan 16-02: releaseDebris with the pods, the cap constants, clampDebrisVelocity, stepDebris (drift), CombatOptions.debris, debrisFixture"
provides:
  - "src/sim/combat/octree.ts: randomOctreePoint, the port of Octree.m randomFullNodeFrom over a fixed octant list"
  - "src/sim/world/debris.ts: the wreckage (up to three, from the victim's octree), the alloy plate, the blast on pods, plates and wrecks, debrisMassOf, wreckHeatDrain and the constants N_ALLOYS_MASS_UNIT, MAX_WRECKS, WRECK_LIFETIME_*, WRECK_MASS_FRACTION, OCTANT_DRAWS_PER_WRECK, WRECK_START_TEMPERATURE, WRECK_COOLING_PER_SECOND, WRECK_MIN_DAMAGE_TEMPERATURE, BLAST_MOMENTUM_FACTOR, BLAST_RANGE_FACTOR, BLAST_MIN_DISTANCE_SQUARED"
  - "src/sim/world/step.ts: stepDebris(world, tick, dt, events) burns wreckage down and removes it through killShip(world, id, NO_ENTITY, events)"
  - "src/sim/ai/pilots/test-pilot.ts: TEST_PILOT_SCAN_KINDS, passed to the seek scan"
  - "tests/sim/world/debris-cadence.test.ts: 30/60/144 Hz equality of a kill with every debris kind"
affects: [16-06, 16-08, 16-09, 17, 18]

plan_head_before: 890e10aeba5c018821888d8d4894ff8274a85922
plan_head_after: b1f280818c8d983fd6c5447cdd92ebbb20554e3a
commits: 3

actuals:
  tokens: 23752
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Fixed draw budget for a lazily loaded input: a wreck always takes MAX_OCTREE_DEPTH octant draws and the walk consumes them, so the stream never depends on whether the hull table has loaded (D16-17)"
    - "Draw everything, then gate, extended to wrecks and plates; the blast draws nothing and runs last over every live piece"
    - "A closed-form temperature from the hashed spawnTick, so the wreck burn-down needs no new state (D16-11, Pitfall 4)"

key-files:
  created:
    - tests/sim/world/debris-cadence.test.ts
  modified:
    - src/sim/world/debris.ts
    - src/sim/world/step.ts
    - src/sim/combat/octree.ts
    - src/sim/ai/pilots/test-pilot.ts
    - tests/sim/world/debris.test.ts
    - tests/sim/world/debris-cap.test.ts
    - tests/sim/world/kill.test.ts
    - tests/sim/combat/octree.test.ts
    - tests/sim/combat/kill.property.test.ts
    - tests/sim/ai/test-pilot.test.ts

key-decisions:
  - "D16-11: a wreck's energy is its lifetime / 2 and drains dt x (1000 - 10 x age) while above 256, floored at 0 in the same write; removal through killShip with no killer, no shipDestroyed (LOW confidence, arithmetic from the C)"
  - "D16-12 / D16-17: after the pods, the n_wreckage draw, then per wreck 7 octant draws, lifetime, model, mass, quaternion and push; then the n_alloys draw; then 13 draws per plate; the blast last and drawless"
  - "D16-04 / OC-4: the blast pushes pods, plates and wrecks only, clamped per component at MAX_ENTITY_VELOCITY; ships and the player are never pushed"
  - "D16-03 / OC-3: TEST_PILOT_SCAN_KINDS leaves cargo and wreckage out of the test pilot's scan"
  - "A wreck at the victim's centre (no octree) and any piece at distance 0 gets no blast kick: normal(0) is zero"

patterns-established:
  - "A piece's blast mass is debrisMassOf: model mass x (entity radius / model radius)^3, undefined (no kick) for an unknown key or a non-positive result"

requirements-completed: []  # WORLD-17 is advanced, not closed (16-07, 16-08, 16-09 finish it); CBT-08 is staged to Phase 19

coverage:
  - id: D1
    description: "A kill that can fragment leaves up to three wrecks placed from the victim's octree with Oolite's lifetime, scale and push, equal to an oracle written from the C"
    requirement: WORLD-17
    verification:
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#the wreckage rule (ShipEntity.m:8042-8069)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/octree.test.ts#randomOctreePoint: hand walks of Octree.m:683-714"
        status: pass
    human_judgment: false
  - id: D2
    description: "Wrecks burn down on the computed schedule (7, 22, 37, 52, 67, 82 ticks) and leave through killShip with no shipDestroyed and no repair"
    verification:
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#the wreck burn-down (D16-11, ShipEntity.m:2254-2272)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The alloy plate and the blast on pods, plates and wrecks, with the four pinned blast examples; ships and the player are never pushed"
    requirement: WORLD-17
    verification:
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#the alloy plate (ShipEntity.m:8068-8111, D16-07)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#the blast (ShipEntity.m:7680-7698, 8123-8126; D16-04)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The wreck gate at 127/128 live entities and a draw budget independent of the cap and of the hull table"
    verification:
      - kind: unit
        ref: "tests/sim/world/debris-cap.test.ts#the wreckage cap (D16-05)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/debris.test.ts#takes the same draws with and without the hull table; only the wreck positions move"
        status: pass
    human_judgment: false
  - id: D5
    description: "A test pilot in a field of 200 pods and wrecks still picks the ship"
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-pilot.test.ts#debris is never a test pilot's target (D16-03, Pitfall 2)"
        status: pass
    human_judgment: false
  - id: D6
    description: "Kills with every piece kind replay equal at 30, 60 and 144 Hz; random fights with debris keep the boundary and replay a fork equal; releaseDebris is total"
    verification:
      - kind: unit
        ref: "tests/sim/world/debris-cadence.test.ts"
        status: pass
      - kind: property
        ref: "tests/sim/combat/kill.property.test.ts#with debris: keep the boundary after every step, expire wrecks and replay a fork equal (plan 16-04)"
        status: pass
      - kind: property
        ref: "tests/sim/combat/kill.property.test.ts#releaseDebris never throws, never needs a repair and never takes the count above 244"
        status: pass
    human_judgment: false
  - id: D7
    description: "QUAL-11 standing gate: the frozen 20-seed NPC acceptance run after src/sim/world/** and the test pilot changed"
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance at b1f2808"
        status: pass
    human_judgment: false

duration: 26min
completed: 2026-11-17
---

# Phase 16 Plan 04: Wreckage, the Alloy Plate and the Blast Summary

**A destroyed ship that can fragment now also throws out up to three burning wrecks from random solid points of its own octree (`ShipEntity.m:8042-8069`, `Universe.m:5497-5526`, `Octree.m:683-714`) and Oolite's single alloy plate. The blast then pushes every pod, plate and wreck near the kill within the velocity bound. Wrecks burn down by `dt x (1000 - 10 x age)` and leave through `killShip`. All of this runs after plan 16-02's pods on the victim's own stream, and test pilots no longer see debris.**

## Performance

- **Duration:** about 26 min (2026-11-16T23:36:22Z to 2026-11-17T00:02:49Z)
- **Tasks:** 3 of 3
- **Files:** 1 created, 10 modified

## Accomplishments

- `randomOctreePoint(octree, octants)` ports `randomFullNodeFrom`. At each array node it takes the next octant `oct`, visits `oct ^ 0` to `oct ^ 7`, descends into the first non-empty child, adds `offsetForOctant(octant, radius)` and halves the radius. It stops when the octants run out, at a malformed node, at an all-empty node or at a non-finite radius, and it never recurses or throws (T-16-12).
- The wreck block runs only when `canFragment` holds and `n_alloys = sqrt(sqrt(mass / 6000)) > 0`:
  - One `n_wreckage` draw, `floor(u x (n_alloys + 2))`.
  - Per wreck, in the C's order: 7 octant draws, the lifetime `750u + 250i + 100`, the model (uniform over the five), the expected mass `0.1 x mass x (0.75 + 0.5u)`, a quaternion and the push.
  - Each wreck is placed at the victim's position plus the octree point rotated by the victim's orientation (the centre when no octree is loaded). Its radius is `model.radius x cbrt(expected / model.mass)`, its velocity is the drift plus `normal(dir) x u x radius`, and its energy is `maxEnergy = lifetime / 2`. It is kind `wreckage`, `CLASS_NO_DRAW`, with no AI and no recharge.
  - A wreck spawns only while fewer than 128 entities are live.
- The plates: after the wreck loop, the `n_alloys = u x n_alloys` draw. Then `floor(n_alloys)` plates (0 or 1 for every hull, none when the ship cannot fragment), each placed and moving like a pod with its 13 draws and no role draw. The pod placement code was factored into `scatter`, with the same operations in the same order, so the pinned pod values of plan 16-02 still hold.
- The blast runs last and draws nothing. It takes `amount = 0.125 x hull mass` and `range = 2.5 x victim radius`. Every live `cargo` or `wreckage` entity, in ascending id, whose centre is strictly within `range + radius` and not at the centre gets one kick, `normal(p2) x amount x range / max(0.1, |p2|^2 - r^2) / mass`, clamped per component at `MAX_ENTITY_VELOCITY`. The mass is `debrisMassOf` (model mass x the cube of the radius ratio). Ships and the player are never visited.
- `stepDebris(world, tick, dt, events)` keeps the drift and adds the burn-down: `energy = max(0, energy - wreckHeatDrain((tick - spawnTick) x dt, dt))`, then `killShip(world, id, NO_ENTITY, events)` at 0. The commit at the end of `stepWorld` emits `entityRemoved`, and no `shipDestroyed` is posted.
- `TEST_PILOT_SCAN_KINDS` (every `BodyKind` except `cargo` and `wreckage`, frozen) is passed to the seek scan. Oolite's own ship scan skips `CLASS_CARGO` the same way (`ShipEntity.m:8493`). The change is hash-neutral: the existing cadence and populate pins pass unchanged.

## Pinned oracle values

- n_alloys: adder 1.2788, cobramk1 1.7182, gecko 1.4240, krait 1.9857, mamba 1.5630, moray 1.7092, shuttle 1.1719, sidewinder 1.4300, viper 1.5433. All are below `MAX_WRECKS`, so the count draw is always taken and at most one plate is thrown out.
- Burn-down at dt 1/120: energies 50, 175, 300, 425, 550 and 675 are removed after exactly 7, 22, 37, 52, 67 and 82 `stepSim` ticks. On the last tick `entityRemoved` is emitted with no `shipDestroyed`, and `repairs` stays 0 throughout. `wreckHeatDrain` is 0 at or below 256 degrees (age 74.4 s) and for non-finite input.
- Blast with a Cobra Mk I victim (mass 52291.8359375, radius 39.260494232177734):
  - a pod at 15 m gains 3.3747 m/s (exactly `amount x range / (225 - 5.7986^2) / 993.37`) on top of its own drift;
  - a pod at 3 m gains 6458.5 m/s (the 0.1 floor);
  - a plate at 1 m is clamped to `(0, 0, -1e4)` with no sanitiser repair;
  - a pod at 104 m (outside 103.950 m) is unchanged;
  - an old `more-wreckage2` wreck of radius 25 at 40 m is kicked using the mass `5793.83 x (25 / 18.66)^3`;
  - an Adder neighbour at 10 m keeps its velocity, speed and position;
  - the player's flight state after the kill tick equals a run without debris content.
- Plan 16-02's tracer, world seed 7: 4 pods, and the first pod's position, orientation and release velocity `(-3.1, 9, -8.6)` are unchanged. Its final velocity is the release velocity plus the oracle's blast kick.

## Cadence non-vacuity counts

`tests/sim/world/debris-cadence.test.ts` searches for the first world seed whose Adder (cargo 20, radius 40) releases every kind; the search finds seed 5, with 3 pods, 1 plate and 2 wrecks (energies 404.45 and 290.56). At 30, 60 and 144 Hz the sampled hashes, the debris log (ids, kinds, spec keys, positions, velocities, energies), the removal ticks and the kill tick are identical. Both wrecks are removed between the kill tick and kill + 82. Every pod's velocity minus the ported kick at its position lies on the 0.1 m/s release grid, and at least one kick is non-zero. With 240 fillers the run sheds pieces identically at every cadence: no wreck, at most 4 pieces, fewer than the uncapped run, and the first pods at the same positions. The cadence file runs in about 30 ms of test time (T-16-14: the pair and scan cost of a few pieces is negligible here; nothing measured near the cap).

Random fights with debris (fixed seed 20261604, 50 runs): 39 runs with debris content, 44 with a kill, 169 pods, 93 wrecks, 20 plates, 17 wreck expiries, and 29 forks taken while debris was live that replayed equal. The `releaseDebris` totality property (seed 20261605, 200 runs) spawned pods in 13 runs, wrecks in 4 and plates in 7, and kicked an old pod in 4.

## Task Commits

1. **Task 1 (tracer): burning wreckage from the victim's octree with Oolite's burn-down**: `df95418` (feat)
2. **Task 2: the alloy plate, the blast on debris, and debris out of the test pilot's scan**: `aa0a706` (feat)
3. **Task 3: cadence equality and the debris property branch**: `b1f2808` (test)

## Decisions implemented (by ID)

D16-03 (OC-3), D16-04 (OC-4), D16-05 (wrecks), D16-07, D16-11, D16-12 (second part), D16-15 (wrecks and plates), D16-16, D16-17, D16-20 (unchanged proximity pass), D16-24, and 15-CONTEXT D-02 and D-15. The Key Decisions rows are written by plan 16-09.

## Verification

- Targeted runs in the local container after each task: Task 1 `debris`, `debris-cap`, `octree`, `step`, `kill` (155 passed); Task 2 the same plus `test-pilot`, `test-spawn`, `world-cadence`, `populate` (249 passed); Task 3 `debris-cadence` and `kill.property` (15 passed).
- Full suite in the local container with coverage thresholds: `docker compose run --rm test`, 212 files, 5404 passed and 10 skipped, exit 0. `docker compose run --rm lint` and `docker compose run --rm typecheck` both exit 0.
- `verify` was not run: this plan changes only `src/sim` and tests, and the gate policy for that is `test`, `lint` and `typecheck`.
- **QUAL-11 acceptance run (remote, by hand):** `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` at HEAD **b1f2808**. Result: **21 of 21 passed**. Every seed line shown (epochs 11 to 20) had `stuck`, `frozen`, `repairs`, `aiFaulted`, `aiDropped`, `hashFailures`, `hullCrossingEpisodes` and `hullCrossingsUnexcused` all 0, and the frozen detectors passed for all 20 epochs. Totals: 40 station, 40 intercept and 40 flee arrivals. Elapsed: 79 s wall clock, 77.2 s vitest. No detector or threshold was touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned plan 16-02 tests updated for the pieces that now follow the pods**
- **Found during:** Tasks 1 and 2
- **Issue:** Several plan 16-02 tests assumed the release ended after the pods:
  - the final-stream equality and the "1 + capsules + 13 x survivors" draw count;
  - `nextId` growing only by the pods (`debris-cap.test.ts`, and the bad-pod case in `kill.test.ts`);
  - `podsOf` counting every `cargo` entity, which now includes plates;
  - the tracer's pinned first-pod velocity, which the blast now adds to.
- **Fix:**
  - The oracle in `debris.test.ts` now covers the whole release from the C: pods, wrecks with an independent recursive `randomFullNodeFrom`, plates and the blast. It keeps each piece's release velocity.
  - The draw count adds `1 + 15 x wrecks + 1 + 13 x plates` when the ship can fragment.
  - The `nextId` checks count every debris piece, and pods are filtered by spec key `barrel`.
  - The tracer still pins the first pod's position, orientation and release velocity `(-3.1, 9, -8.6)`, and checks its final velocity against the oracle.
  - The drift test compares release velocities, because the blast adds the same kick in a different floating-point order.
- **Files modified:** tests/sim/world/debris.test.ts, tests/sim/world/debris-cap.test.ts, tests/sim/world/kill.test.ts (the last is not in the plan's file list)
- **Commits:** df95418, aa0a706

**2. [Rule 2 - Totality] Defensive reads beyond the listed cases**
- **Found during:** Task 1
- **Issue:** The wreck code read `victim.orientation`, `ctx.octrees` and `content.wrecks` directly. A non-object orientation, a hull table that is not a `Map`, a non-array wreck list, or an octree with a NaN half-width could throw or write NaN into a hashed position.
- **Fix:** `octreeOf` (a `Map` instance and object checks), `wreckModelsOf` (a non-array list reads as empty), identity for a non-object orientation, `finiteVecOrZero` on the rotated point, and an origin return in `randomOctreePoint` for a non-finite radius. The totality property covers each case.
- **Files modified:** src/sim/world/debris.ts, src/sim/combat/octree.ts
- **Commit:** df95418

**3. [Rule 2 - Totality] No blast kick for a piece at the exact centre**
- **Found during:** Task 2
- **Issue:** `vector_normal` of a zero vector has no direction, and a wreck placed with no octree sits exactly at the victim's centre.
- **Fix:** The blast skips `|p2| = 0`, as the plan's action text says. Such a wreck keeps its release velocity.
- **Commit:** aa0a706

**Total deviations:** 3 auto-fixed (1 blocking test update, 2 totality). **Impact:** no change to the planned rule or draw order. The pinned 16-02 values that the order protects (pod count, positions, orientations, release velocities) still hold.

### Process notes

- The tasks carry `tdd="true"`. As in plan 16-02, each task's tests and implementation went into one commit rather than separate RED and GREEN commits. The tracer gate was run: Task 1's `<verify>` passed end to end before Task 2 started.
- To read the cadence seed and piece counts for this SUMMARY, a scratch script under `/tmp` was run with `npx vite-node` in a throwaway `test` container. `npx` downloaded `vite-node@6.0.0` into that container's npm cache because the image does not ship it. Nothing was added to the repository or to the image. The property tallies were read through a temporary `console.log`, reverted before the commit.

## Known Stubs

None. Plan 16-02's `void canFragment` and the 16-04 seam are consumed.

## Threat Flags

None. No new network, auth or file surface. Debris spawns and expiries post no new event kind, and no entity id leaves `src/sim`. T-16-11, T-16-12 and T-16-13 are mitigated as planned and tested. For T-16-14 the scan filter is in place and the proximity pass is unchanged.

## Requirements

- WORLD-17: advanced, not checked off. Wrecks and plates now exist in the sim; drawing them is plans 16-07 and 16-08, and 16-09 closes the requirement.
- CBT-08: staged. Its destruction clauses are complete in the sim here but are checked off only in Phase 19, so CBT-08 is deliberately not under `requirements-completed`.

## Next

Ready for 16-05.

## Self-Check: PASSED

- FOUND: tests/sim/world/debris-cadence.test.ts, src/sim/world/debris.ts, src/sim/world/step.ts, src/sim/combat/octree.ts, src/sim/ai/pilots/test-pilot.ts
- FOUND: df95418, aa0a706, b1f2808 (ancestors of HEAD)

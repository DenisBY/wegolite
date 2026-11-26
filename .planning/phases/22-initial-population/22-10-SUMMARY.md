---
phase: 22-initial-population
plan: 10
subsystem: sim-world
tags: [populator, spawn, placement, witchpoint, entity-cap, debris-reserve, group-records, fast-check, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-03: World.groups bound 256 and pruneEmptyGroups"
  - phase: 22-initial-population
    provides: "plans 22-06 to 22-09: planSystemGroups, GroupPlan, SystemDraws, populationDraws, countDrawSource, remotePackZ"
provides:
  - "src/sim/world/population/spawn.ts: populateSystemWorld, spawnPlannedGroups, PopulateSystemResult, PopulateOptions, cargoCountForKind"
  - "src/sim/world/placement.ts: the WITCHPOINT location code (Universe.m:1786-1788)"
  - "src/sim/world/population/streams.ts: populationStream(worldSeed, ordinal, groupIndex, tag) -> RngState"
  - "src/sim/world/limits.ts: POPULATION_RESERVE_KILLS 4, POPULATION_DEBRIS_RESERVE 104, POPULATION_ENTITY_LIMIT 152"
  - "tests/sim/world/population/spawn.test.ts and debris-reserve.test.ts"
affects: [22-11, 22-12, 22-13, 22-14]

plan_head_before: ac6465e1272bdc5ae48ec9ca580e2c2f9c6df1ff
plan_head_after: 082ec61a (task commits 330a7fab and 082ec61a; the SUMMARY commit follows)

actuals:
  tokens: 19500
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A group's whole spawn is built first (draws, poses, kit, predicted ids), trial-spawned into a scratch world, and only then spawned for real: no partial group can enter the world"
    - "Every draw of a group (location, scatter, orientation, cargo count) comes from populationStream(worldSeed, ordinal, groupIndex, tag); the populator takes nothing from world.rng and nothing from an entity-id fork"
    - "The debris reserve is a measured constant: a test recomputes W through the production kill path and fails if the literal drifts"

key-files:
  created:
    - src/sim/world/population/spawn.ts
    - tests/sim/world/population/spawn.test.ts
    - tests/sim/world/population/debris-reserve.test.ts
  modified:
    - src/sim/world/placement.ts
    - src/sim/world/population/streams.ts
    - src/sim/world/limits.ts
    - tests/sim/world/placement.test.ts

key-decisions:
  - "Escorts spawn with the identity orientation (Entity.m:72: newShipWithRole leaves it; setUpOneEscort never sets one) and take no orient draw; only the three scatter jitter draws. Not a divergence, but plan 22-11 should mention it in the escort FIDELITY text"
  - "A leaderless addGroup group (hunters, independent pirates, police, interceptors) gets a group record whose id and leader are its FIRST ship, the founding member; a leader-linked group (freighter with escorts, pirate pack) takes its leader. Oolite's ShipGroup of an addGroup call has no leader at all; the record needs one, so the first ship stands for it (D-11 representation, no Oolite behaviour reads it yet)"
  - "The per-ship spread is the script's, by builder: freighter, couriers, smuggler, pack leader and station patrol 0; light hunters, police patrols and interceptors 2000; independent pirates 2500; pack assistants 4000. The plan does not carry it, so spawn.ts maps it from the entry's builder"
  - "A group with no ships, at a location the port never places (COORDINATES, PLANET_ORBIT_HIGH) or naming a record the catalogue lacks counts in skippedGroups, not spawnedGroups"
  - "W = 21 and the reserve 104 (limit 152), measured, see below"

patterns-established:
  - "populateSystemWorld = planSystemGroups(production draws) + spawnPlannedGroups; the census (22-12) and the live switch (22-13) call it"

requirements-completed: [WORLD-08]

duration: 85min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 10: Spawn path, WITCHPOINT and the measured debris reserve Summary

**`populateSystemWorld` turns a system's planned groups into inert ships at Oolite's locations from per-group forked streams, whole groups only under a measured entity limit of 152 (debris reserve 104, W = 21), with escorts in formation, group records by the `ShipGroup` rule and cargo count and kind together.**

## Performance

- **Duration:** about 85 min
- **Tasks:** 2 (2 commits), 3 files created, 4 modified, 1,967 insertions

## Accomplishments

- **WITCHPOINT and the streams (Task 1, tracer).** `locationByCode` gained `WITCHPOINT` (one `randomSpatial(layout.scannerRange)`, `Universe.m:1786-1788`); `placement.test.ts` pins three samples and the final stream state of each of the five existing codes (seed 4242), taken from the code before the edit, so no existing code moved. `populationStream(worldSeed, ordinal, groupIndex, tag)` returns the tag's `RngState` with the same derivation as `populationDraws` (which now shares the seed and tag helpers).
- **The spawn path (Task 1).** Per group: centre from `locationByCode` on the `location` stream (a remote pack's centre z through `remotePackZ`); each ship but an escort at `centre + randomSpatial(spread)` (spread 0 still takes the sampler's draws) with `randomQuaternion`; each escort at `escortCoordinates(mother pose, mother radius, slot)` plus `radius * 6 * (u - 0.5)` per axis (`ShipEntity.m:1690-1705`), identity orientation. Every `SpawnInit` names `cargo` and `cargoKind` together (`cargoCountForKind`, the `setCargoFlag` count for the final kind), `ai: null`, bounty, primary role, fuel, systems, injector and weapon types; `steer.accuracy` is written after `spawnEntity`. Leader first; `groupId` = leader id; escorts carry `ownerId` and slot; `World.groups` gets `{ id, leader }` ascending, none for the station patrol (E-209).
- **Atomic groups under a measured cap (Task 2).** A group's full size is compared with `entityLimit - liveEntityCount(world)`, the group records it creates with `MAX_WORLD_GROUPS`, and its ids with the id counter; a group that does not fit, whose inits the world would refuse in part (trial spawn into `createWorld(0)`), at an unplaced location or with no ships is skipped whole and the next group is tried.

## Populated Lave

Lave (`g0-s7`, the recorded facts of `g0-s7-seed1`, the committed 29-record catalogue), epochs 1 to 20 (`worldSeedFor(marketSeedForSystem("g0-s7"), epoch)`): 11 to 22 groups, **26 to 58 ships (mean 37.25)**, 5 to 12 group records, **0 skipped groups, 0 fallbacks** in every epoch. All 66 fixture systems at epochs 1 to 3 (198 worlds): no fallback, no skipped group, every group centre inside its location's region and every non-escort ship within the script's spread of it.

## W and the reserve (D-06)

- **W = 21**, from the **anaconda** (hull mass 437,686.9 kg: 2.92 alloys, so up to 15 pods with 200 capsules (`POD_LIMIT`), up to 4 wrecks (`floor(u * (n + 2))` for n below 3, one more than `MAX_WRECKS`) and up to 2 plates). Measured by killing all 29 catalogue records at their largest cargo (`min(maxCargo, 200)`) through `killShip` -> `releaseDebris`, 400 world seeds each, in an otherwise empty world; the measured W equals the analytic ceiling of those rules (`debris-reserve.test.ts` asserts `measured <= ceiling` for every record and seed).
- **Reserve:** `(256 - floor(0.95 * 256)) + 4 * 21 = 13 + 84 = 97`, rounded up to the next multiple of 8: **`POPULATION_DEBRIS_RESERVE` = 104**, **`POPULATION_ENTITY_LIMIT` = 152**, `POPULATION_RESERVE_KILLS` = 4. The test recomputes the rule from the measurement and fails if the literal drifts, and pins `POPULATION_ENTITY_LIMIT === MAX_ENTITIES - POPULATION_DEBRIS_RESERVE`. The Lave maximum (58) is far under 152; whether any committed system reaches it is plan 22-12's census (if one does, 22-12 lowers `POPULATION_RESERVE_KILLS` toward 1, and stops for the owner below one kill's worth).

## Properties (tests/sim/world/population/spawn.test.ts, 27 cases)

- **Determinism:** two builds from one seed hash equal (`hashWorld`), another seed differs; `world.rng` untouched; ids dense from 101.
- **Cap rule:** with `entityLimit` set so the third group does not fit, that group is skipped whole, a later smaller group still spawns, and every other group is equal in position, orientation and kit to the unlimited build (ids aside; owner and group links compared as offsets). The default limit holds on a crowded world.
- **Independence (pitfall C4):** inserting a group into the plan, or removing one, leaves every other group's ships equal. Mutation check: keying the group streams by the first entity id fails 7 tests.
- **Atomicity:** a record the world refuses in the middle of some groups (a NaN radius) skips exactly those groups whole and spends no id on them (mutation check: disabling the trial spawn fails this test); an id counter two from the end spawns at most two ships; a plan at an unplaced location is skipped.
- **Limit 0:** no NPC, no group record, `world.rng` and `nextId` untouched, the world hashes as the flight hash; empty records spawn nothing; Oresrati (`g7-s162`) spawns exactly its station patrol over 20 seeds.
- **Group bound:** with 255 prefilled records only the first record-holding group spawns, record-less groups still spawn, and `World.groups` stays strictly ascending even when a prefilled record has a higher id.
- **fast-check totality (200 runs):** arbitrary facts, records (hostile keys, NaN fields, bad scan classes), pre-filled worlds (0 to 256 live, 0 to 256 records, id counter within 12 of `MAX_UINT32`) and limits (negative, NaN, infinite) never throw, never exceed the limit or `MAX_WORLD_GROUPS`, leave no dangling group or owner link, and the spawned entities are exactly a subsequence of whole plans.

## Task Commits

1. **Task 1 (tracer): WITCHPOINT, group streams, the spawn path; Lave end to end** - `330a7fab` (feat)
2. **Task 2: the cap rule, the measured reserve, the properties** - `082ec61a` (feat)

Tracer gate: the targeted command (spawn, placement, populate, inert-isolation, pod-kind guard, all population tests) passed with Lave populated before the cap rule and reserve existed; expansion followed.

## Deviations from Plan

**1. [Plan detail] The task-1 spawn path already carries the entity-limit and group-bound checks.** The plan adds them in Task 2; Task 1's `spawn.ts` took `MAX_ENTITIES` as the default limit and Task 2 replaced it with `POPULATION_ENTITY_LIMIT`. No behaviour differs from the plan's end state. Commits 330a7fab, 082ec61a.

**2. [Plan detail] Escort orientation and the leaderless group record** are decided in the code (see key-decisions); the plan is silent on both.

**3. [Plan detail] A skipped group includes an empty plan group** (22-09's note), so `skippedGroups` rises with empty catalogue records; the census (22-12) reads it as "a group did not enter the world".

**4. Test-first order.** Both tasks are `tdd="true"`. The placement pins were captured from the code before the edit (as the plan requires); the spawn cases were written with the implementation and mutation-checked afterwards (above) because the planner's replay is the oracle for what is spawned and the spawn tests compare against it.

**Total deviations:** 4 plan details, no auto-fixes. **Impact:** none on the outcome.

## Gates

- Targeted (Docker, local): `spawn.test.ts`, `debris-reserve.test.ts`, `placement.test.ts`, `populate.test.ts`, `inert-isolation.test.ts`, `pod-kind-fallback.test.ts`, `npc-missiles-tripwire.test.ts` and the whole `tests/sim/world/population` directory: all passed (106 tests in the Task 2 command).
- `docker compose run --rm lint`: clean (eslint and Prettier). `docker compose run --rm typecheck`: clean (both tsconfigs).
- Acceptance greps: `"WITCHPOINT"` x2 in `placement.ts`; `export function populateSystemWorld` x1; no entity-id fork in `spawn.ts`; `POPULATION_DEBRIS_RESERVE`, `POPULATION_RESERVE_KILLS` and `POPULATION_ENTITY_LIMIT` one literal each; `fc.assert` in the spawn test; `INERT_PATH_FILES` unchanged; `git diff --name-only 67d12406..HEAD -- src/sim/world/populate.ts tests/golden/world` prints nothing.
- **Remote frozen 20-seed run (QUAL-12, `src/sim/world/**` gained code):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` at snapshot `082ec61a`: **exit 0, 86 s, 21 passed of 21** (epochs 1 to 20 plus the totals check). `ACCEPTANCE-TOTALS {"stationArrivals":40,"interceptArrivals":40,"fleeArrivals":40,"avoidCollisionEntries":23,"attackTicksNearPlayer":61662,"stuckWindowsEvaluated":175,"frozenWindowsEvaluated":293}`, identical to the totals recorded at plan 22-03: the new code is imported by no runtime path yet, so the run could not move. Thresholds and detectors untouched.
- **Full Vitest suite (remote, with coverage):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test` at snapshot `082ec61a`: **exit 0, 307 s, 318 test files passed and 1 skipped, 10,399 tests passed and 15 skipped**; the coverage thresholds held (`spawn.ts` 94.1 % statements, 91.5 % branches, 100 % functions, 95.6 % lines; `streams.ts` 100 %).

## Threat Flags

None. T-22-15 (partial group) mitigated by the trial spawn and the atomicity property; T-22-16 (unbounded loops, oversize population) by `MAX_PLACEMENT_TRIES`, the entity limit, the group-record check and the fast-check property over full stores; T-22-17 (pod-kind fallback) by `cargo` and `cargoKind` named together in the one `SpawnInit` of `spawn.ts` (the guard's allow-list is unchanged and passes; the runtime check and the todo's closure are plan 22-11's). T-22-SC: no package installed.

## Known Stubs

None. `populateSystemWorld` is imported by no runtime path yet: plans 22-12 (census), 22-13 and 22-14 (session wiring) call it. CHANGELOG.md: no entry, the change is not user-visible yet.

## Notes for the next plans

- **22-11:** the escort FIDELITY text can say escorts keep the identity orientation (as Oolite) and take three jitter draws; a leaderless addGroup group's record names its first ship as id and leader (D-11 representation); the new FIDELITY row for WITCHPOINT and the cap rule cite `limits.ts` (W = 21, reserve 104, limit 152). The runtime pod-kind check can iterate `populateSystemWorld` over sample worlds and assert `cargo > 0 => cargoKind > 0`; `spawn.test.ts` already asserts it for Lave epochs 1 to 12.
- **22-12:** read `PopulateSystemResult.skippedGroups` and `fallbacks` per committed system; `entities` against `POPULATION_ENTITY_LIMIT` (152). Lave peaks at 58.
- **22-13 and 22-14:** `populateSystemWorld(world, layout, facts, records, { entityLimit?, tick? })`; `tick` defaults to 0 as the inert path's spawn tick does, so the world section does not depend on the rebuild tick.

## Self-Check: PASSED

The three created files exist; commits 330a7fab and 082ec61a are ancestors of HEAD (2 commits since the plan base ac6465e1, measured with `git rev-list --count`); `git diff --name-only ac6465e1..HEAD` lists only the seven source and test files above (before this SUMMARY), so `populate.ts`, `tests/oracles/`, `tests/golden/`, STATE.md and ROADMAP.md are untouched.

---
phase: 22-initial-population
plan: 07
subsystem: sim-world
tags: [populator, freighters, escorts, kit, record-pick, fidelity, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-05: NpcShip.hyperspaceMotor in ships-npc.json"
  - phase: 22-initial-population
    provides: "plan 22-06: POPULATOR_ENTRIES, SystemFacts, PopulationDraws, loadPopulationFixtures, recordedDraws, factsFromFixture"
provides:
  - "src/sim/world/population/groups.ts: PopulationRecord, PlannedPopShip, GroupPlan, ShipDraft, BuildOptions, buildGroup, pickPopulationRecord (re-export)"
  - "src/sim/world/population/kit.ts: pickPopulationRecord, pickForRole, setWeapons, setSkill, setFuel, setReturnFuel, fuelTenths, initialAccuracy, clampAccuracy, weightedNearbyTradeSystem, createPlannedShip, finishShips and the script constants"
  - "src/sim/world/population/escorts.ts: setUpEscorts (engine escorts and the trader removal), setEscortWeapons, addOffenderEscortBounty"
  - "src/sim/world/population/traders.ts: buildFreighter (arriving and station-launch branches)"
  - "tests/helpers/population-fixtures.ts: committedPopulationRecords, describeShips, recordedShips, ShipProjection"
affects: [22-08, 22-09, 22-10, 22-11, 22-12]

actuals:
  tokens: 21000
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Draft ships are mutable inside a builder and finished into frozen PlannedPopShip values with group links resolved to indexes (finishShips)"
    - "A replay counts the draws the port takes per tag and compares them with the recorded counts, so a builder cannot match the ships while drifting off Oolite's stream use"
    - "Shared ship-creation helpers live in kit.ts and import group types type-only, so groups.ts can dispatch to traders.ts and escorts.ts without a runtime import cycle"

key-files:
  created:
    - src/sim/world/population/groups.ts
    - src/sim/world/population/kit.ts
    - src/sim/world/population/escorts.ts
    - src/sim/world/population/traders.ts
    - tests/sim/world/population/kit.test.ts
    - tests/sim/world/population/traders.oracle.test.ts
  modified:
    - tests/helpers/population-fixtures.ts

key-decisions:
  - "PopulationRecord carries `fuel` (tenths) and `bounty` besides the plan's field list: an escort's fuel and bounty come from its own record (the fixtures record an escort cobramk1 with fuel 70) and an offender mother ORs into the record bounty"
  - "The trader escort removal always removes every escort when its test passes: every catalogue hull with escort_roles has no `escorts`, so `_maxEscortCount` is 0 and `setPendingEscortCount:` clamps the pending count to 0 whatever `nx` is. The fixtures agree (no trader has an escort in a government 7 group, asserted by the replay)"
  - "pickPopulationRecord takes the draw as a value and pickForRole decides whether to draw: one candidate or none takes no draw (OOProbabilitySet's single-object set), matching the stub that recorded the fixtures. The frozen pickRecord draws for a one-record role; the two give the same record"
  - "The station-launch branch of the freighter is the script's data only (home here, destination from the trade system, plentiful goods, fuel 7); the engine's station launch path is not modelled and initial population never takes it (D-01, Phase 26)"
  - "System indexes the builders write are sanitised to 0..255 and fuel to 0..65535, so a malformed fact cannot put an out-of-range value in a plan; the replay is unaffected (valid input passes through)"

requirements-completed: [WORLD-08]

plan_head_before: 744e665d467f7c59a1e46bb23bc03f25f9a6f07b
plan_head_after: 5b939cb8 (task commits e551579c, 82675bea, 5b939cb8; the SUMMARY commit follows)

duration: 28min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 07: Freighter builders, engine escorts and the ship kit Summary

**`buildGroup` plans every recorded freighter and docking-freighter group of the 66 Oolite fixtures exactly (505 groups, escorts, offenders and opportunists included, with the same number of draws per site), on top of a ported ship kit (`_setWeapons`, `_setSkill`, `_setFuel`, the OOProbabilitySet float32 pick, initial accuracy) and the engine escort model of `setUpMixedEscorts` with the trader removal.**

## Performance

- **Duration:** about 28 min (2026-11-26T15:58Z to 16:26Z, including the remote runs)
- **Tasks:** 2 (3 commits)
- **Files:** 6 created, 1 modified

## Accomplishments

- **Group types and dispatcher.** `PopulationRecord` (no missile member), `PlannedPopShip`, `GroupPlan` and `buildGroup(entry, facts, records, draws, { groupIndex, arriving })`; builders that plans 22-08 and 22-09 add return an empty plan and take no draw until then.
- **Kit.** `setWeapons` takes exactly one draw per call that passes the `auto_weapons` test, even for an integer level, and writes `EQ_WEAPON_NONE` aft at levels 1 and 2; `setSkill` moves accuracy toward 4.99 (or -5) `|bias|` times and writes it through the float32 `setAccuracy:` clamp; `setFuel` is `lround(clamp(7 - dist, 0, 7) * 10)` tenths (17 chart units = 2, 18 = 0, home = 70); `initialAccuracy` is `randf() * 10 - 5`, positive for police and military. The script constants (weapon bias 0, skill bias 0, skill maximum 4.99) are asserted against the fixture header.
- **Record pick.** `pickPopulationRecord` is the `OOProbabilitySet` walk over float32 cumulative weights with the binary search of `OOProbabilitySet.m:493-538`. A property over every role of the catalogue (1,000 stream states) gives the same record as the frozen `pickRecord`; a pinned boundary case (weights 0.1, 0.2, 0.3, draw 0.5) shows where the float32 walk and a double walk differ and that the port follows Oolite.
- **Escorts (D-08).** `setUpEscorts` is `setUpMixedEscorts`: per `escort_roles` entry a `Ranrot() % 11 < government + 2` roll for each slot from `min` to `max - 1`, an empty role counted toward the cap of 16 without a ship, a role with no record ends its entry, primary role `escort`, owner, slot, and the offender-mother bounty `1 | (ranrot & 15)`. The trader removal of `Universe.m:2657-2665` applies only to an `addShips` role of exactly `trader` (a unit case shows a courier keeps its escorts at government 7).
- **Freighter (D-10, folded pod-kind todo).** `buildFreighter` sets the cargo kind from its spawn context: arriving `scarce`, medical name `medical` (bounty 0), opportunist `pirate`; the opportunist keeps `_setSkill(2)` and `_setWeapons(2.5)` (only `switchAI` is cut); an offender's escorts get `bounty |= 3 + floor(r * 12)`; `_setEscortWeapons` runs last, escorts in reverse order. The `Math.random() * 8 > government` draw is taken and its missile branch is cut.

## Replay result

All 66 fixtures: every group of the entries `oolite-freighters` (5) and `oolite-freighters-docking` (6), **505 groups**, is reproduced field by field (record key, role, primary role, bounty, cargo kind, fore and aft weapon, float32 accuracy, fuel, home and destination system, injector, whether Oolite made a group, leader, owner, escort slot), and the port takes exactly the recorded number of draws on each of the eight compared sites (`body`, `system`, `weapons`, `skill`, `pick`, `escort`, `accuracy`, `injector`). No mismatch, no change to a fixture, the recorder or the stub. The replay covers scarce, medical and pirate cargo, offenders, opportunists with and without escorts, and escorted traders in anarchy systems. Where the government is 7 no trader has an escort. The edge cases of `edge-draws.json` (offender test at 0.05, opportunist test at 0.5, `_setWeapons` level 1.5 at the equality 0.5) give Oolite's recorded results.

**Clamp behaviour (the plan's open point).** `setPendingEscortCount:` clamps to `_maxEscortCount` (`ShipEntity.m:6061-6064`). Every catalogue hull with `escort_roles` authors no `escorts`, so `_maxEscortCount` is 0 and the removal, whenever its `Ranrot() % 7 < government` test passes, leaves 0 pending escorts regardless of `nx`. The fixtures confirm it (the second removal draw `& 3` is consumed and recorded, its value has no effect). The value of `nx` is therefore unobservable: the `& 3` operand is an equivalent mutant (see mutation checks).

## Mutation checks (each restored)

Each of these makes the replay or the kit tests fail: escort roll `<` to `<=` (23 failures), removal test `<` to `<=` (20), removal for every role instead of `trader` only (2), offender escort bonus `3 +` to `2 +` (9), skill maximum 4.99 to 5 (13), opportunist and offender tests `<` to `<=` (1 each, the edge cases), `_setWeapons` `>` to `>=` (3), escort weapons in forward order (19), fuel rounding (57), trade danger weight (10), medical goods (24), escort bounty `1 |` (1), escort primary role (31), float32 cumulative weights in the pick (1, the pinned boundary case). One mutant survives and is equivalent: the removal's `& 3` operand cannot change anything while `_maxEscortCount` is 0.

## Task Commits

1. **Task 1 (tracer): group types, record pick, kit, freighter builder, escorts, tracer replay** - `e551579c` (feat)
2. **Task 2: full freighter replay, kit edge cases, pick equivalence, totality** - `82675bea` (test)
3. **Float32 pick boundary pinned** - `5b939cb8` (test)

Tracer gate: the first freighter group of a government 7 fixture (`g2-s138-seed1`) replayed ship for ship and draw for draw before the other fixtures were added; passed.

## Files Created/Modified

- `src/sim/world/population/groups.ts` - types and `buildGroup`
- `src/sim/world/population/kit.ts` - the ship kit, the pick, `createPlannedShip`, `finishShips`
- `src/sim/world/population/escorts.ts` - the escort model, `setEscortWeapons`, the offender escort bonus
- `src/sim/world/population/traders.ts` - `buildFreighter`
- `tests/helpers/population-fixtures.ts` - `committedPopulationRecords`, `describeShips`, `recordedShips`
- `tests/sim/world/population/kit.test.ts` - kit boundaries, pick equivalence and float32 case, escort cases, `buildGroup` totality (fast-check, 200 runs)
- `tests/sim/world/population/traders.oracle.test.ts` - the freighter replay

## Decisions Made

See `key-decisions` above. None revises a recorded Key Decisions row; the plan's own Key Decisions and FIDELITY rows (opportunist, escort removal, escort group model, D-08) land in plan 22-08 as planned.

## Deviations from Plan

**1. [Rule 2 - Missing critical] `PopulationRecord` carries `fuel` and `bounty`.** Found during Task 1. The plan lists the record's fields without them, but an escort's fuel and bounty come from its own record (the recorded escorts show fuel 70 for a cobramk1 and 0 for a gecko; an offender mother ORs into the record bounty). Both are read as data from `ships-npc.json`; neither is a missile field. Files: `groups.ts`, `population-fixtures.ts`. Commit `e551579c`.

**2. [Rule 3 - Blocking] The escort model landed in Task 1, not Task 2.** The plan says the escort loop is a no-op until Task 2. The builder, the removal and the escort set-up are one piece in Oolite (`addShipAt` runs the removal and the set-up around the script's callback), and writing the freighter without them would have meant a stub that Task 2 immediately replaced. Task 1's tracer group (government 7) has no escorts, so it proves the dispatcher, pick, kit and builder as planned; Task 2 proves the escorts (the 505-group replay, the unit cases, the mutation checks). Commit `e551579c`.

**3. Two plan items land in an extra file split.** `createPlannedShip`, `pickForRole`, `finishShips` and the readers live in `kit.ts` (type-only imports of `groups.ts`), not `groups.ts`, so `groups.ts` can dispatch to `traders.ts` without a runtime import cycle; `groups.ts` re-exports `pickPopulationRecord` as the plan's artifact list names it. `kit.test.ts` was created in Task 1 (the plan lists it under Task 2) because Task 1's behaviour list is kit behaviour.

**4. [Rule 1 - Bug, test side] Local lint found two useless assignments** (`level` in `setEscortWeapons`, `rate` in the trade-system weights) before the first commit; both restructured, no behaviour change.

**Total deviations:** 4 (1 missing-critical, 1 blocking-ordering, 1 layout, 1 lint). **Impact:** none on the outcome; the replay is exact.

## Gates

- Targeted (Docker): `traders.oracle.test.ts` 79 tests, `kit.test.ts` 32 tests, `tests/guards/npc-missiles-tripwire.test.ts` 7, `tests/sim/world/inert-isolation.test.ts` 39: all passed.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- Acceptance greps: `export function buildGroup` 1 in `groups.ts`; no `.missiles`, `.maxMissiles`, `Math.random` or `Math.hypot` in the non-comment lines of the four modules; `Math.fround` 4 in `kit.ts`; `export function setUpEscorts` 1; `fc.assert` 4 in `kit.test.ts`; `edge-draws` in both test files; `git diff 744e665d..HEAD` shows no change to `src/sim/world/populate.ts` or `tests/oracles/`.

## Remote runs (snapshot 5b939cb8, the plan's last code commit)

- **Frozen 20-seed run (QUAL-12):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`: **exit 0, 89 s, 21 passed of 21** (epochs 1 to 20 about 4.3 s each plus the pin). No change to the frozen thresholds or detectors. The new modules are imported by no runtime path yet, so the run could not move; it is recorded because the plan asks for it.
- **Full Vitest suite:** `~/.claude/scripts/wegolite-remote-run.sh run --rm test` (with coverage): **exit 0, 308 s, 315 test files passed and 1 skipped, 10,170 tests passed and 15 skipped**, the coverage thresholds held (population modules: `kit.ts` 96.8 % lines, `escorts.ts` 91.3 %, `groups.ts` 85.7 %, `traders.ts` 100 %).

## Threat Flags

None. The builders are pure arithmetic over injected facts and records. T-22-11 mitigated: roles and keys are compared with `===` over arrays and strings only (never an object keyed by content), `parseRoleToken` drives the pick, the totality property runs prototype-named roles and keys (`constructor`, `__proto__`, `toString`) and non-finite fields at 200 runs. T-22-12 mitigated: `PopulationRecord` has no missile member, no module reads `missiles` or `maxMissiles`, a replay test hands the builders records whose missile getters throw, and `tests/guards/npc-missiles-tripwire.test.ts` is green.

## Known Stubs

`buildGroup` returns an empty plan for the builders plans 22-08 (couriers, smugglers) and 22-09 (hunters, pirates, police) add; `dispatch` is a `switch` with one case. This is the plan's own split, not a data stub, and nothing imports `src/sim/world/population/` from a runtime path yet (plans 22-10 to 22-13 wire it). The station-launch branch of `buildFreighter` is parameter-only and unused by initial population (Phase 26). No `.planning/WINDOWS.md` entry was written: the file is shared across parallel executors and the stub is closed by the next two plans.

## Notes for the next plans

- `createPlannedShip(role, records, systemIndex, draws)` is the engine's `newShipWithRole` plus set-up draws; plan 22-09's `pirate` role bounty roll (`20 + randf() * 50`, the stub's `bounty` tag) is not modelled and needs a new `bounty` stream tag (append-only in `streams.ts`).
- `setUpEscorts(leader, records, government, draws, addShipsRole, systemIndex)` takes the system index as a sixth parameter; a police mother's `wingman` role (`ShipEntity.m:1693-1696`) is not modelled (plan 22-09).
- `describeShips` and `recordedShips` project to the same `ShipProjection`; plans 22-08 and 22-09 widen the replay by changing the entry filter in `traders.oracle.test.ts` and adding their builder cases to `buildGroup`.
- The frozen `pickRecord` of `populate.ts` walks double sums, Oolite's walk is float32; the two differ at cumulative boundaries (pinned in `kit.test.ts`). The inert path keeps the frozen pick.
- CHANGELOG.md: no entry, the change is not user-visible (nothing imports the new modules yet).

## Self-Check: PASSED

The six created files exist; commits e551579c, 82675bea and 5b939cb8 are ancestors of HEAD (3 commits since the plan base 744e665d, measured with `git rev-list --count`); `git diff --name-only 744e665d..HEAD` lists only the four new modules, the helper and the two test files, so `populate.ts`, `tests/oracles/`, STATE.md and ROADMAP.md are untouched.

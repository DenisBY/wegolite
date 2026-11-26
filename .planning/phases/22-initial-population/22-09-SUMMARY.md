---
phase: 22-initial-population
plan: 09
subsystem: sim-world
tags: [populator, pirates, packs, police, interceptors, hunters, planner, fidelity, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plans 22-07 and 22-08: buildGroup, the ship kit, setUpEscorts, the trade builders, the replay helpers"
  - phase: 22-initial-population
    provides: "plan 22-06: POPULATOR_ENTRIES, planCounts, PopulationDraws, the FIDELITY contract for script excerpts"
provides:
  - "src/sim/world/population/pirates.ts: buildIndependentPirate, buildPiratePack, PACK_COMPOSITION, remotePackZ, nearbyDangerousSystem"
  - "src/sim/world/population/police.ts: buildLightHunter, buildPolicePatrol, buildStationPatrol, buildInterceptors"
  - "src/sim/world/population/groups.ts: planSystemGroups, SystemDraws, GroupPlan.remotePack, BuildOptions.posZ; buildGroup dispatches all 15 builder ids"
  - "src/sim/world/population/kit.ts: addGroupShips, clampGroupSize, autoWeaponsOf, roleExists and chartDistance (moved from traders.ts)"
  - "tests/sim/world/population/groups.oracle.test.ts: the whole-system replay of all 66 fixtures (1,477 groups, 3,337 ships)"
  - "FIDELITY.md rows and excerpts E-207 (pack class counts, faithful), E-208 (remote pack z, faithful), E-209 (station patrol group, divergence)"
affects: [22-10, 22-11, 22-12, 22-13, 22-14]

plan_head_before: e14486ff974b9aa603b690ea93c011468b0f053c
plan_head_after: 1917e7c2 (task commits 0825ffab, c22dc132, 1917e7c2; the SUMMARY commit follows)

actuals:
  tokens: 28000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A leaderless addGroup group (hunters, independent pirates, police, interceptors) is built through addGroupShips: clamped to 1..64, every ship a group-record holder with no leader link"
    - "A whole-system replay feeds the recorded count draws and each group's recorded draws through one SystemDraws object and compares the plan group for group, ship for ship, and draws taken per compared site"
    - "A decision recorded as a divergence (the station patrol's group) is mapped explicitly in the replay's expected side, never by weakening the comparison"

key-files:
  created:
    - src/sim/world/population/pirates.ts
    - src/sim/world/population/police.ts
    - tests/sim/world/population/groups.oracle.test.ts
  modified:
    - src/sim/world/population/groups.ts
    - src/sim/world/population/kit.ts
    - src/sim/world/population/traders.ts
    - FIDELITY.md

key-decisions:
  - "planSystemGroups takes a SystemDraws object ({ counts, group(ordinal, groupIndex) }) instead of a bare drawsFor function: the planner needs the entries' count draws as well as each group's draws, and plan 22-10 builds the production one from countDrawSource and populationDraws"
  - "GroupPlan carries remotePack (true for entries 21, 24, 27): the spawner applies remotePackZ to the centre's z; the planner itself places nothing"
  - "BuildOptions.posZ models the script's `if (pos.z)` on the independent pirate's missile test; absent counts non-zero, which is every planned position, so production takes the draw and only a z of exactly 0 or NaN skips it"
  - "Ships of a pack are in creation order, as the recording has them: leader, its engine escorts, then the assistants (the plan text said leader, followers, escorts)"
  - "The pirate role's creation-time bounty draw (`20 + randf() * 50`, the stub's uncompared bounty tag) is not taken: the script overwrites that bounty with setBounty on every ship that role can reach, so the value is unobservable and no bounty stream tag was added"

requirements-completed: [WORLD-08]

duration: 75min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 09: Pirates, police and the whole-system planner Summary

**`planSystemGroups` now reproduces every recorded group of all 66 Oolite fixtures exactly, 1,477 groups and 3,337 ships in engine order with the recorded number of draws at every compared site, on top of ported independent pirates, the nine pirate pack entries (remote z rule and dangerous-system pick included), light hunters, police patrols, the station patrol and interceptor wings.**

## Performance

- **Duration:** about 75 min
- **Tasks:** 3 (3 commits)
- **Files:** 3 created, 4 modified

## Accomplishments

- **Light hunters and the planner (Task 1, tracer).** `buildLightHunter` is `_addLightHunter` (`oolite-populator.js:1578-1590`) through the new `addGroupShips` (a leaderless `addGroup` group, size clamped to 1..64). `planSystemGroups(facts, records, draws)` runs `planCounts` and then `buildGroup` for each kept entry and group index in engine order. The tracer replayed one whole recorded system (Lave seed 1: counts, every group, every ship) with the pirate and police builders still pending and an explicit `PENDING_BUILDERS` set that Tasks 2 and 3 emptied.
- **Pirates (Task 2).** `buildIndependentPirate` (`:1696-1734`: size, the `size > 8 - government` cut, bounty `20 + government + size + floor(r * 8)`, `PIRATE_GOODS`, weapons 1.75 with a hyperspace motor and 1.3 without, skill `4 - government`, the missile-test draw taken `if (pos.z)`). `buildPiratePack` (`:1796-1873`) with `PACK_COMPOSITION` for light `(2, 1, -1, 0)`, medium `(3, 2, 0, 1)` and heavy `(4, 4, 2, 2)` and the six local and remote wrappers: each assistant class has `floor(k + (0.5 + r1 - r2))` ships with both draws taken even when the base is 0 or negative, the leader gets its engine escorts through `setUpEscorts` (D-08), bounty `60 + government + floor(r * 8)`, `_setWeapons(2.8)`, `_setSkill(3)`, the chart fuel, the escorts' `bounty |= 3 + floor(r * 12)`, pirate goods. `remotePackZ` is `z % 100000`; `nearbyDangerousSystem` is the reservoir pick with one `system` draw per matching system.
- **Police and the rest (Task 3).** `buildPolicePatrol` (role `interceptor` when `9 + r * 6 < techlevel`, else `police`; `floor(r * 2) + floor(r * 2) + 2` ships), `buildStationPatrol` (one ship, primary role `police-station-patrol`, bounty 0, no group record) and `buildInterceptors` (`floor(r * 2) + floor(r * 2) + 1 + ceil(techlevel / 6)` ships, primary role `police-witchpoint-patrol`, `_setSkill(1)`). `PENDING_BUILDERS` is empty. FIDELITY E-207 to E-209 record the pack class counts (faithful), the remote z rule (faithful) and the station patrol's group (divergence, D-11).

## Replay result

All 66 fixtures: `planSystemGroups` returns exactly the recorded group sequence (entry, group index) of every system, and every group equals the recording field by field (record key, role, primary role, bounty, cargo kind, fore and aft weapon, float32 accuracy, fuel, home and destination system, injector, group flag, leader, owner, escort slot), with the port taking the recorded number of draws on each of the eight compared sites. Counts by builder (groups / ships): freighter 505 / 740, courierShort 84 / 110, courierLong 178 / 208, smuggler 34 / 34, lightHunter 105 / 314, independentPirate 262 / 866, light packs 69 + 6 remote / 323, medium packs 21 + 4 remote / 220, heavy packs 3 / 45, policePatrol 139 / 407, stationPatrol 66 / 66, interceptors 1 / 4; total 1,477 groups, 3,337 ships. No fixture, recorder or stub change (`git diff --name-only e14486ff..HEAD` lists no file under `tests/oracles/`).

Facts the replay pins beyond the ships:

- Every pack takes `9 + (ships - 1)` `body` draws: the leader bounty, two draws for each of the four classes whatever the base count, and one draw per further ship (Pitfall 3).
- A light pack's pirate interceptor and a medium pack's heavy fighter appear at `r1 - r2 >= 0.5` (unit cases at 0.75 and 0.25, and at 0.74 and 0.25) and the edge case `pirate-pack-class-count` of `edge-draws.json` (8 probes) gives Oolite's light-fighter counts.
- `remotePackZ(posIn.z) === posOut.z` and `remotePackZ(-posIn.z) === -posOut.z` for every recorded remote group (the three remote entries move z; every other entry leaves it alone); the three wrappers' danger limits (`government - 1`, `min(government - 1, 3)`, `min(government - 1, 1)`) are pinned by a unit case with a scripted draw.
- The station patrol exists exactly once in every one of the 66 systems; for g7-s162 (and seed 2) it is the plan's only group.
- The edge cases `police-patrol-interceptor-role` and `station-patrol-interceptor-role` (`9 + r * 6 < 12`, equality at 0.4999999999999998 and 0.49999999999999983) give Oolite's recorded roles.
- Totality: `planSystemGroups` never throws and keeps every group at most 80 ships, every bounty, fuel, system index, escort slot and link in range over arbitrary facts (including NaN and infinite fields), records (hostile role names such as `constructor`) and draws (fast-check, 200 runs).

**Coverage the recordings do not reach.** Two kept entries have no recorded group in any of the 66 fixtures: `oolite-pirate-heavy-remote` (entry 27) and `oolite-interceptors-route1` (entry 32), and the interceptor wing and heavy local packs have only 1 and 3 recorded groups. Entry 32 shares `buildInterceptors` with entry 33 (a unit case plans both from one recording and compares); entry 27 shares `buildPiratePack` with the recorded remote entries and its wrapper is pinned by the danger-limit unit case. The test asserts exactly these two names as the unrecorded ones, so a new fixture that records them is noticed.

## Mutation checks (each restored)

Each makes the replay or the unit cases fail: pack class constant `0.5` to `0.4` (4 failures), independent weapons 1.75 to 1.3 (1, the replay), heavy remote limit `min(.., 1)` to `min(.., 2)` (1, the unit case), the police role test `<` to `<=` (2, the edge cases), the station patrol given a group record (3). The equality mutant of the police role survives the oracle replay (only the edge probes sit on the boundary), which is why the edge cases are asserted.

## Task Commits

1. **Task 1 (tracer): light hunters and planSystemGroups, one whole recorded system replayed** - `0825ffab` (feat)
2. **Task 2: independent pirates and the nine pack entries, remote z rule, dangerous-system pick** - `c22dc132` (feat)
3. **Task 3: police patrols, station patrol, interceptors; every system complete; totality; FIDELITY E-207 to E-209** - `1917e7c2` (feat)

Tracer gate: the Lave system replayed group for group, ship for ship before the other builders existed and the targeted command passed; auto expansion followed.

## Files Created/Modified

- `src/sim/world/population/pirates.ts` - independent pirates, packs, `PACK_COMPOSITION`, `remotePackZ`, `nearbyDangerousSystem`
- `src/sim/world/population/police.ts` - light hunters, police patrols, the station patrol, interceptor wings
- `src/sim/world/population/groups.ts` - `planSystemGroups`, `SystemDraws`, `GroupPlan.remotePack`, `BuildOptions.posZ`, the full dispatcher
- `src/sim/world/population/kit.ts` - `addGroupShips`, `clampGroupSize`, `autoWeaponsOf`, `roleExists`, `chartDistance`
- `src/sim/world/population/traders.ts` - imports the two helpers that moved to `kit.ts`
- `tests/sim/world/population/groups.oracle.test.ts` - the whole-system replay, the pirate, remote and police cases, the cut-path guards and the totality property
- `FIDELITY.md` - rows and excerpts E-207 to E-209

## Decisions Made

See `key-decisions`. None revises a recorded Key Decisions row.

## Deviations from Plan

**1. [Plan detail] `planSystemGroups` takes a `SystemDraws` object, not a bare `drawsFor`.** The plan writes `planSystemGroups(facts, records, drawsFor)`; the planner also needs each counted entry's three `count` draws, so the third argument carries `counts` and `group(ordinal, groupIndex)`. `drawsFromFixture` lives in the test file. Commit `0825ffab`.

**2. [Plan detail] Ship order of a pack is leader, escorts, assistants.** The plan's behaviour line says leader, followers, then escorts; the recordings (and so the replay) have the leader's engine escorts created inside its `addShips`, before any assistant. The port follows the recording. Commit `c22dc132`.

**3. [Plan detail] The pirate creation bounty draw is not modelled.** The kit note of plan 22-07 expected a new `bounty` stream tag. Every ship that reaches the role `pirate` has its bounty overwritten by `setBounty` in the script, and the fixtures mark that tag uncompared, so no tag was added and `POPULATION_TAG_CODES` is unchanged. Commit `c22dc132`.

**4. [Rule 2 - Missing critical] Group-role hulls carry no escort set-up.** `addGroupShips` adds no engine escorts, as `addGroup` of the shipped catalogue never needs; a test asserts that no hull carrying the role `hunter`, `pirate`, `police` or `interceptor` authors `escort_roles`, so the omission fails loudly if a catalogue ever changes. Commit `1917e7c2`.

**5. [Plan detail] Edge-case system g0-s153 is not a committed fixture.** The two role edge cases of `edge-draws.json` name g0-s153 (tech level 12); the role draw reads only the tech level, so the test runs them on the Lave facts with `techlevel: 12`. Commit `1917e7c2`.

**6. Test-first order.** All three tasks are `tdd="true"`, but as in plans 22-06 to 22-08 the recorded fixtures are the oracle: the builders and their replay cases were written together, the replay was green on the first run for the pirate builders, and each guarded value was mutation-checked afterwards (above).

**Total deviations:** 6 (1 missing-critical, 5 plan details). **Impact:** none on the outcome.

## Gates

- Targeted (Docker, snapshot `1917e7c2`): `tests/sim/world/population` (kit, plan, traders, groups), `tests/contract/fidelity.test.ts`, `tests/guards/npc-missiles-tripwire.test.ts`, `tests/sim/world/inert-isolation.test.ts`: 7 files, 458 passed, 1 skipped (the verbatim excerpt case when `OOLITE_SRC` is unset).
- `tests/contract/fidelity.test.ts` with `OOLITE_SRC=/oolite` (the pinned `git archive 7437f22 src Resources`, mounted read-only): **10 passed, the verbatim case ran** over all excerpts including E-207 to E-209.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- Acceptance greps: `export function planSystemGroups` 1 and `buildLightHunter` 1; the four pirate exports 4; the three police exports 3; `fc.assert` in the replay 1; no `.missiles`, `.maxMissiles` or `Math.random` in the non-comment lines of the new modules; `populate.ts` untouched; `git diff --name-only e14486ff..HEAD -- tests/oracles` prints nothing.

## Remote runs (snapshot 1917e7c2, the plan's last code commit)

- **Frozen 20-seed run (QUAL-12, `src/sim/world/population/` gained code):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`: **exit 0, 91 s, 21 passed of 21** (epochs 1 to 20 each about 4.3 s, plus the pin). No change to the frozen thresholds or detectors. The new code is imported by no runtime path yet (plans 22-10 to 22-13 wire it), so the run could not move; it is recorded because the plan asks for it.
- **Full Vitest suite (remote):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test` (with coverage): **exit 0, 303 s, 316 test files passed and 1 skipped, 10,364 tests passed and 15 skipped**, the coverage thresholds held (population modules: `pirates.ts` 99.1 % lines, `police.ts` 96.2 %, `groups.ts` 95.3 %, `kit.ts` 98.9 %, `traders.ts` 100 %).

## Threat Flags

None. The builders are pure arithmetic over injected facts and records. T-22-13 mitigated: every `addGroup` size goes through `clampGroupSize` (1..64), escorts are capped at 16 by `setUpEscorts`, assistant classes at 16, and the fast-check totality property passes at 200 runs. T-22-14 mitigated: the cut writes (missiles, ECM, shield booster, AI switches, `maxEscorts`, `initial_group`) are not planned; `PlannedPopShip` has no member for them (asserted over every plan of every fixture) and the missiles tripwire and a throwing-getter replay over every system are green. T-22-SC: no package installed.

## Known Stubs

None in the sense of placeholder data. `planSystemGroups` is imported by no runtime path yet: plan 22-10 spawns the plans and plans 22-13 and 22-14 wire the session. The `arriving: false` (station launch) branch of the trade builders is parameter-only (Phase 26) and the pack `returning` branch of `_addPiratePack` is not taken by initial population. No `.planning/WINDOWS.md` entry was written (nothing is a stub that blocks the plan's goal). Entries 27 and 32 are the unrecorded ones (see Replay result).

## Notes for the next plans

- Plan 22-10: build `SystemDraws` as `{ counts: countDrawSource(worldSeed), group: (ordinal, index) => populationDraws(worldSeed, ordinal, index) }`; apply `remotePackZ` to the centre z of a group with `remotePack` true (the three remote entries); a group with no ships (a role the catalogue lacks) is a skipped group.
- The station patrol's `location` is `STATION_AEGIS`; its plan has `groupRecord: false`, so 22-10's `World.groups` must not expect it (D-11).
- CHANGELOG.md: no entry, the change is not user-visible (nothing imports the new modules from a runtime path yet).

## Self-Check: PASSED

The three created files exist; commits 0825ffab, c22dc132 and 1917e7c2 are ancestors of HEAD (3 commits since the plan base e14486ff, measured with `git rev-list --count`); `git diff --name-only e14486ff..HEAD` lists only the new modules, `groups.ts`, `kit.ts`, `traders.ts`, the replay test and `FIDELITY.md` (before this SUMMARY), so `populate.ts`, `tests/oracles/`, STATE.md and ROADMAP.md are untouched.

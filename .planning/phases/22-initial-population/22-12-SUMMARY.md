---
phase: 22-initial-population
plan: 12
subsystem: sim-world
tags: [census, population, entity-cap, group-bound, triangle-budget, draw-call-budget, launch-corridor, golden, WORLD-08, QUAL-09]

requires:
  - phase: 22-initial-population
    provides: "plan 22-10: populateSystemWorld, POPULATION_ENTITY_LIMIT 152, POPULATION_DEBRIS_RESERVE 104, POPULATION_RESERVE_KILLS 4"
  - phase: 22-initial-population
    provides: "plan 22-11: the cap row FIDELITY E-211 and the D-05/D-06 Key Decisions row, both waiting for the census result"
provides:
  - "tests/golden/world/population-census.json: the census of 2,048 systems x 20 epochs (statistics, anarchy tail, peaks, spec systems, per-system digest)"
  - "tests/sim/world/population/census.test.ts: no skipped group, no fallback, the cap, the group bound and both budgets per world, plus the golden comparison"
  - "tests/helpers/{glb-triangles,population-census,write-population-census,launch-corridor}.ts"
  - "tests/sim/world/population/launch-corridor.test.ts: the D-02 measurement pinned at zero"
  - "FIDELITY E-211 final text and the Key Decisions row 'Initial population census (WORLD-08, Phase 22)'"
affects: [22-13, 22-14, 22-15]

plan_head_before: f0a4222ad0f3971a9e13f9da1188c1d13bb2a8ac
plan_head_after: f09c9ffe7288aa985d94f0cdc0a45e3b18999318 (task commits 93ace51d, 3e9be2bf and f09c9ffe; the SUMMARY commit follows)

actuals:
  tokens: 188000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One census module (population-census.ts) computes a world and the statistics; the golden writer and the test both import it, so the golden and its check cannot compute two different things"
    - "A GLB's triangle count is read from the accessor table of its JSON chunk, no three.js"
    - "The golden's per-system digest is one string per system of 'ships/groups/keys/triangles' tokens, one per epoch, so a 40,960-world census is 630 kB"

key-files:
  created:
    - tests/helpers/glb-triangles.ts
    - tests/helpers/population-census.ts
    - tests/helpers/write-population-census.ts
    - tests/helpers/launch-corridor.ts
    - tests/golden/world/population-census.json
    - tests/sim/world/population/census.test.ts
    - tests/sim/world/population/launch-corridor.test.ts
  modified:
    - FIDELITY.md
    - .planning/PROJECT.md

key-decisions:
  - "The cap rule never triggers: 0 skipped groups and 0 placement fallbacks in all 40,960 worlds, so POPULATION_RESERVE_KILLS stays 4 and limits.ts is unchanged"
  - "No world is over either budget, so no stop for the owner: peak triangles 162,014 of 250,000 and peak call bound 45 of 50"
  - "Launch-corridor hits are zero, so no todo and no tripwire case; the zero is pinned as EXPECTED_CORRIDOR_HITS"
  - "The browser spec needs one galaxy-0 system, Qudira (g0-s116), at epoch 1: it is both the largest and the most-keys anarchy"

requirements-completed: [WORLD-08, QUAL-09]

duration: 40min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 12: Initial population census Summary

**All 2,048 systems populated through the production path for 20 epochs (40,960 worlds): not one group skipped and not one fallback, the largest world holds 134 ships against the limit 152, the peaks sit at 162,014 triangles and 45 draw calls against 250,000 and 50, no ship lands in the launch corridor, and the browser spec's system is Qudira.**

## Performance

- **Duration:** about 40 min
- **Tasks:** 3 (3 commits), 7 files created, 2 modified
- **Run times (container, local):** the golden writer, 40,960 worlds: 38.9 s (38.3 s on its second run); the census test, default (epochs 1 to 4, 8,192 worlds plus the consistency cases): 11 to 12 s; the census test with `POPULATION_CENSUS_FULL=1`: 91 s (it checks every galaxy at 20 epochs, then recomputes the whole census once more); the corridor test, default: 10 s, full: 49 s.

## The census (golden `tests/golden/world/population-census.json`)

| Statistic | Value |
|-----------|-------|
| Worlds | 40,960 (2,048 systems x 20 epochs) |
| Ships per world: mean, median, p95, p99 | 45.31, 44, 78, 94 |
| Peak ships | 134 (g0-s166 at epoch 2; g2-s179 at epoch 14 ties) |
| Headroom under `POPULATION_ENTITY_LIMIT` 152 | 18 |
| `skippedGroups`, `fallbacks` | 0, 0 |
| Peak `World.groups` | 31 (g6-s57, epoch 2) against `MAX_WORLD_GROUPS` 256 |
| Peak NPC triangles | 122,158 (g6-s57, epoch 3); with the scene (39,192) and the fight delta (664): 162,014 of 250,000 |
| Peak analytic call bound | 45 (g6-s125, epoch 20; 25 hull keys; 10 + 25 + 10) against 50 |

By government (mean, peak): 0 (anarchy) 60.07, 134; 1 54.11, 134; 2 42.86, 134; 3 44.45, 114; 4 41.60, 132; 5 40.17, 101; 6 37.16, 131; 7 41.95, 113.

Anarchy tail (the ten largest government-0 worlds, system at epoch: ships): g2-s179 at 14: 134; g2-s179 at 10: 133; g2-s248 at 12: 131; g3-s75 at 6: 124; g4-s160 at 10: 124; g2-s24 at 1: 122; g6-s187 at 19: 122; g3-s163 at 13: 121; g0-s219 at 13: 119; g2-s24 at 19: 118.

Galaxy 0 at epoch 1 alone (the tracer): mean 45.48, peak 114 (g0-s92).

**Spec systems.** A docked save is written at epoch 0 and its first launch bumps the epoch to 1 (`createWorldLifecycle.begin`), so the docked-launch epoch is 1. The galaxy-0 anarchy with the most ships and the one with the most distinct hull keys are the same system: **Qudira (`g0-s116`)**, the name `dockedSaveAt` takes, resolves to that id (first match of that name in galaxy 0): 96 ships, 22 distinct keys, 18 group records, 91,456 NPC triangles (131,312 in all) and a call bound of 42. One fixture serves both checks of the QUAL-09 browser spec.

## Accomplishments

- **Tracer (Task 1).** `glbTriangleCount` reads a GLB's accessor counts; the 29 hulls sum to within 1 % of 27,019. `population-census.ts` populates a world through `populateSystemWorld` and reduces it to ships, group records, distinct keys and realised triangles; the writer recorded galaxy 0 at epoch 1 and the test compared it, before the scope widened. Tracer gate: `end-of-phase` mode, automated `<verify>` only, re-run green, expansion followed.
- **All systems, all epochs (Task 2).** The writer's scope went to 8 galaxies and 20 epochs. The test recomputes epochs 1 to 4 for every system by default and every recorded epoch with `POPULATION_CENSUS_FULL=1`, checks the per-world rules (no skipped group, no fallback, ships below 152, groups below 256, both budgets through `withinBudget` of `tests/e2e/helpers/budgets.ts`), and checks the golden's own consistency from its digest: mean, median, p95, p99, peak, per-government figures and the descending anarchy tail are recomputed independently of `summarise`. g7-s162 (Oresrati) holds exactly one ship, the police station patrol, at all 20 epochs. Mutation check: changing one digest token fails four cases and names the world; the golden was restored.
- **Launch corridor and records (Task 3).** `launchCorridorHits` counts ships inside the dock aperture of the dock geometry (`ww`, `hh`), widened by each ship's radius, between the port plane and the end of the scripted launch path along the outward axis. 0 hits in 40,960 worlds. FIDELITY E-211 now states the result; the Key Decisions rows for D-05/D-06 and D-11 carry the measured peaks and the new row "Initial population census (WORLD-08, Phase 22)" records the whole census.

## Launch corridor (D-02)

The corridor is the docking aperture half extents (`ww` 51.7 m, `hh` 120.9 m), widened by the ship's radius, from the port plane out to the end of the scripted launch path: the launch speed (half the Cobra's 350 m/s) held for `LAUNCH_DURATION` 2 s, 350 m (a test drives `beginLaunch` and `stepLaunch` and checks the path length and that it lies on the port's outward axis). **Total hits: 0** over all 20 epochs of all 2,048 systems. Also 0 at reaches of 1, 2 and 5 km (a scratch measurement, not pinned); the closest ship clears the widened aperture by 381 m (a Viper in g4-s86 at epoch 3, 1,353 m out). **No todo is needed and no tripwire case exists**; `EXPECTED_CORRIDOR_HITS` pins `{ total: 0, worlds: [] }` and the test fails, naming the world, if a later change puts a ship inside.

## Task Commits

1. **Task 1 (tracer): the galaxy-0 epoch-1 census end to end** - `93ace51d` (test)
2. **Task 2: all 2,048 systems and 20 epochs** - `3e9be2bf` (test)
3. **Task 3: launch-corridor hits, the cap row and the census Key Decisions row** - `f09c9ffe` (docs)

## Deviations from Plan

**1. [Plan detail] A shared census module.** The plan names a writer and a test; both need the same computation, so `tests/helpers/population-census.ts` holds it (world census, statistics, digest, spec-system choice) and both import it. A writer imported by a test would write the golden on import.

**2. [Plan detail] The synthetic "1 km out" corridor case.** The plan's case "a ship on the axis 1 km out counts" assumes a launch path longer than 1 km; the scripted launch is 350 m. The helper takes an optional `launchDistance`: the default case counts a ship on the axis at 300 m and not one at 1 km, and the same ship counts when the distance is lengthened to 2 km.

**3. [Plan detail] The golden was written twice.** The first full run lacked the largest world's headroom under the cap (a must-have of the plan); `peakHeadroom` was added to the statistics and the writer rerun once more. The second run is byte-identical to the first in every other field (compared before committing); it was not a rerun to make a test pass. Task 1's galaxy-0 golden is the tracer's, replaced by the full-scope one in Task 2 as the plan intends.

**4. [Plan detail] The default census run is 12 s,** far under the 90 s limit, so the default epochs stay 1 to 4.

**5. [Plan detail] A `peakKeys`, `peakCalls` and `peakHeadroom` entry in the golden** beyond the plan's list, because the call bound and the headroom are must-haves that need a recorded peak.

**Total deviations:** 5 plan details, no auto-fixes of bugs. **Impact:** none on the outcome.

## TDD note

All three tasks are `tdd="true"` inside an `execute` plan. The census numbers are measurements, so the expectation could not be written before the writer produced them: the golden came first, the test second, and the test was mutation-checked afterwards (a changed digest token fails four cases). The plan does not require RED/GREEN commits (`type: execute`).

## Gates

- Targeted (Docker, local): `census.test.ts` default (22 passed, 1 skipped, the full case), `census.test.ts` with `POPULATION_CENSUS_FULL=1` (23 passed), `launch-corridor.test.ts` default (11 passed) and full (11 passed), `tests/contract/fidelity.test.ts` (10 passed, also with `OOLITE_SRC` mounted from `/tmp/oolite-7437f22`).
- `docker compose run --rm lint`: clean (eslint and Prettier). `docker compose run --rm typecheck`: clean (both tsconfigs).
- **Full Vitest suite (remote, with coverage):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test` at snapshot `f09c9ffe`: **exit 0, 305 s, 321 test files passed and 1 skipped, 10,437 tests passed and 16 skipped** (the one new skip is the full-census case, which runs only with `POPULATION_CENSUS_FULL=1`); coverage thresholds held (all files 97.03 % statements, 94.19 % branches, 99.2 % functions, 97.76 % lines).
- **Frozen 20-seed run (QUAL-12):** not run. `src/sim/world/limits.ts` is unchanged (the reserve rule did not fire) and no `src/` file changed in this plan, so NPC behaviour cannot have moved.
- Acceptance greps: `population-census.json` exists; `export function glbTriangleCount` x1; `e2e/helpers/budgets` in `census.test.ts` x1; `"skippedGroups": 0` x1, `"anarchyTail"` x1, `"specSystems"` x1 in the golden; `export function launchCorridorHits` x1; `EXPECTED_CORRIDOR_HITS` x4 in the corridor test; `Initial population census (WORLD-08, Phase 22)` x1 in `.planning/PROJECT.md`.

## Threat Flags

None. T-22-18 (golden regenerated to make a test pass) is mitigated: the writer's header says run once, the test recomputes from the production path and compares, and the one second run is documented above with every other field unchanged. T-22-19 (census too slow for the unit gate): the default run is 12 s. T-22-SC: no package installed.

## Known Stubs

None. No `src/` file changed, so no CHANGELOG.md entry (nothing user-visible).

## Notes for the next plans

- **22-13 and 22-14:** the live switch calls the same `populateSystemWorld`; the census golden is the Node-side reference for what a launch builds at epoch 1 (`dockedLaunchEpoch`).
- **22-15 (browser spec):** boot Qudira (`dockedSaveAt("Qudira")`), launch, and assert 96 ships, 22 distinct keys and the NPC triangle count 91,456 equal the golden's `specSystems`; the browser read is scene plus ships plus fight (the golden's peak is 162,014 of 250,000, so Qudira's 131,312 is not the worst world, only the worst galaxy-0 anarchy).
- **Phase 23:** the corridor hits are zero today because the AEGIS shell (1.2 station radii to 51,200 m) is vast against a 103 x 242 m aperture; AI that moves ships toward the station changes that, and `launch-corridor.test.ts` is where it would show if a populated ship then carried an AI.

## Self-Check: PASSED

The seven created files exist; commits `93ace51d`, `3e9be2bf` and `f09c9ffe` are ancestors of HEAD (3 commits since the plan base `f0a4222a`, measured with `git rev-list --count`); `git diff --name-only f0a4222a..HEAD` lists only the nine files above (before this SUMMARY), so `src/`, `limits.ts`, `tests/oracles/`, the other goldens, STATE.md and ROADMAP.md are untouched.

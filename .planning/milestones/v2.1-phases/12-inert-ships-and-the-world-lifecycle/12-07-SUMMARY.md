---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 07
subsystem: sim
tags: [populator, placement, oolite-location-codes, determinism, golden, fidelity]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-02 total spawnEntity (SpawnResult, malformed guards) and ai null entities held still; plan 12-06 compiled NPC radius in ships-npc.json"
provides:
  - "src/sim/world/placement.ts: LANE_WIDTH, MAX_PLACEMENT_TRIES, LocationCode, Sample, randomSpatial, positionInCylinder, positionInShell, locationByCode (LANE_WP, LANE_WS, LANE_PS, LANE_WPS, STATION_AEGIS), randomQuaternion"
  - "src/sim/world/populate.ts: InertShipRecord, POPULATOR_ROLES, INERT_POPULATION (12 singles), isScanClass, parseRoleToken, pickRecord, planInertPopulation, populateInertWorld"
  - "tests/golden/world/inert-lave-epoch1.json: the Lave launch world (seed 0x2b4e037c) section text and FNV-1a hash"
  - "FIDELITY rows E-34 and E-35 and the Key Decisions row First inert populator (WORLD-15)"
affects: [12-08, 12-09, 12-12]
status: complete
actuals:
  tokens: 17500
  tasks: 2
  commits: 2
plan_head_before: f1177fbf66272cfd88523a0c4a6072334993e4bc
plan_head_after: 78900fb1dc13e63b8b600936eb596b9678f5a8ce
tech-stack:
  added: []
  patterns:
    - "a rejection loop is a for loop bounded by MAX_PLACEMENT_TRIES that accepts the last candidate and reports Sample.fallback"
    - "a content-shaped string (scanClass) is narrowed to a closed union by a type-guard filter before planning, so the spawn input typechecks with no assertion and a bad record costs no draw"
    - "role matching by === over arrays only; no object keyed by role names"
key-files:
  created:
    - src/sim/world/placement.ts
    - src/sim/world/populate.ts
    - tests/sim/world/placement.test.ts
    - tests/sim/world/populate.test.ts
    - tests/helpers/inert-world.ts
    - tests/helpers/write-inert-world-golden.ts
    - tests/golden/world/inert-lave-epoch1.json
  modified:
    - FIDELITY.md
    - .planning/PROJECT.md
key-decisions:
  - "First inert populator (WORLD-15): fixed table of 12 single ships (traders 3, pirates 3, hunters 2, police 2, shuttle 1, scavenger 1) at Oolite location codes; draw order location, pick, orientation; spawn tick 0; 256-try cap with last-candidate fallback; ai null; total (refusals skipped, unknown scan class dropped before any draw); no draws without eligible records (D-01); placement draws only from world.rng, which closes roadmap Phase 12 Pitfall 2."
requirements-completed: []
---

# Phase 12 Plan 07: The first inert populator Summary

`populateInertWorld(world, layout, records)` places a fixed table of 12 single inert ships (six roles) at Oolite's location codes (LANE_WP, LANE_WS, LANE_PS, LANE_WPS, STATION_AEGIS) from the world stream alone, as a pure, total, deterministic function; the Lave launch world is pinned by a golden. WORLD-15 and WORLD-14 are only partly delivered here (no app wiring until plan 12-08) and are not marked complete.

## Performance

- **Duration:** about 30 min
- **Completed:** 2026-11-14
- **Tasks:** 2
- **Files:** 9 (7 created, 2 modified)

## Accomplishments

- **Samplers (Task 1, tracer).** `placement.ts` ports `OOHPVectorRandomSpatial`, `OORandomPositionInCylinder`, `OORandomPositionInShell`, `Universe.m` `locationByCode` and `quaternion_set_random`, with `randf()` replaced by `rngNext` over the passed stream. Every `do ... while` loop is a `for` bounded by `MAX_PLACEMENT_TRIES` (256) that accepts the last candidate and reports `Sample.fallback`. Only `+ - * /`, `Math.floor` and `Math.sqrt` are used.
- **Populator (Task 1).** `populate.ts` holds the frozen `INERT_POPULATION` table, `parseRoleToken` (OORoleSet.m 286-313; a weight that is not a finite non-negative number is 0), `pickRecord` (one draw times the weight sum, first record whose cumulative weight exceeds it, a zero-weight record never returned) and `planInertPopulation`/`populateInertWorld`. Per ship the order is location, pick, orientation; an entry whose role has no positive-weight record is skipped before any draw. Records whose `scanClass` is outside `SCAN_CLASSES` are removed by a type-guard filter before the first draw, so the spawn input typechecks with no assertion (`rg` for `as ScanClass|SpawnInit|EligibleRecord|unknown|any` outside comments: no match).
- **Behaviour proven.** On the Lave world: 12 ships, ids 101 to 112, `ai` null, speed 0, kind `ship`, spawn tick 0, radius and scan class equal to the record's, `nextId` 113; each planned position satisfies its location's region predicate (lane cylinder outside both exclusion spheres, or the aegis shell outside sqrt(1.5) planet radii); police are always Vipers; same inputs give the same section, another seed another section; no records or an all-bogus record list returns 0 with `world.rng` untouched, `isNeverSpawned` true and `hashWorld` equal to `hashFlight`; a bogus record added to the Lave records changes neither section, stream nor count; the populated world stepped 600 ticks through `stepFlight`/`stepWorld` keeps its section byte for byte.
- **Golden and sweep (Task 2).** `inert-lave-epoch1.json` (seed 726532988, count 12, fnv `b23d11d8`) was read by hand before committing: 12 lines e101-e112, all `ai:none`, all `speed:0.000000`, police lines `viper` with `CLASS_POLICE`, the traders moray/cobramk1/adder, hunters sidewinder x2, pirates krait/sidewinder/moray, shuttle adder, scavenger cobramk1. Across all 256 galaxy-0 systems at epoch 1, `populateInertWorld` returns 12 and `planInertPopulation(...).fallbacks` is 0; the LANE_PS sample of g1-s45 (the tightest committed lane) takes no fallback at epochs 1 to 32.
- **Docs.** FIDELITY.md rows E-34 (`placement.ts:177`, `Universe.m:1796-1815`) and E-35 (`populate.ts:90`, `Universe.m:2648-2648`) with excerpts, plus an Open items bullet for the three lane-length lines just above the E-34 range. The Key Decisions row "First inert populator (WORLD-15)" records the table, draw order, singles with spread 0, shuttles and scavengers at STATION_AEGIS (A2), spawn tick 0, the cap and fallback, station radius 500 m, nullAI, totality for rule (ii), D-01, and the Pitfall 2 sentence verbatim as the plan gives it.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | place 12 inert ships at Oolite location codes from the world stream (tracer) | 7ee4373 |
| 2 | pin the Lave launch world, sweep galaxy 0 and record the populator | 78900fb |

Tracer gate: the automated-only `<verify>` was re-run end to end after the commit (targeted Vitest, lint, typecheck, full suite); it passed, so expansion proceeded with no checkpoint.

## Gates run (all in Docker, local)

| Gate | Result |
| --- | --- |
| Targeted Vitest placement, populate, step (Task 1) | 3 files, 74 passed |
| Targeted Vitest placement, populate (Task 2) | 2 files, 39 passed |
| Fidelity contract with `OOLITE_SRC` (`git archive 7437f22 src` under /tmp/wegolite-12-07/oolite) | 9 passed, the verbatim excerpt case ran (not skipped) |
| `docker compose run --rm test` (full, coverage), after Task 1 | exit 0, 147 files, 2,907 passed, 2 skipped |
| `docker compose run --rm test` (full, coverage), after Task 2 | exit 0, 147 files, 2,910 passed, 2 skipped, no coverage error; placement.ts 96.55% stmts / 91.66% branches (uncovered lines 116, 149, 238), populate.ts 96.77% / 93.75% (lines 217-220, the defensive `record === undefined` continue) |
| `docker compose run --rm lint` | exit 0 (ESLint and Prettier) |
| `docker compose run --rm typecheck` | exit 0 |

No `verify`, `verify-full` or remote run: pure simulation, test and planning-doc changes (plan gate policy). Mutation sanity check (not committed): dropping the STATION_AEGIS planet clause made three placement tests fail; the file was restored byte for byte.

Acceptance counts: `LANE_WIDTH = 51_200` 1; `MAX_PLACEMENT_TRIES` 7 in placement.ts; `export function populateInertWorld` 1; trig/pow/random `Math` members: none; `spawnEntity(` files in `src` 2; `export function isScanClass` 1; type assertions on the spawn input: none; golden `"count": 12` 1; `inert-lave-epoch1` in populate.test.ts 2; `E-34` 3 and `E-35` 2 in FIDELITY.md; `First inert populator (WORLD-15)` 1 and `closes roadmap Phase 12 Pitfall 2` 1 in PROJECT.md.

## Deviations from Plan

### Auto-fixed Issues

None. No Rule 1 to 3 fix was needed.

### Departures worth a reviewer's eye (no rule triggered)

- **Extra helper file.** `tests/helpers/inert-world.ts` (not in the plan's file list) holds `laveInertRecords`, `buildInertWorld` and the pinned seed, so the golden writer and `populate.test.ts` build the world one way instead of duplicating it.
- **Optional `maxTries` parameter.** `randomSpatial`, `positionInCylinder` and `positionInShell` take a trailing `maxTries` (default `MAX_PLACEMENT_TRIES`) so the cap and the fallback are testable without a 256-try run for `randomSpatial` itself (a forced rejection is not reachable with a real stream). `locationByCode` always uses the default. Forced rejection elsewhere uses unsatisfiable geometry (an exclusion sphere covering the whole region) with the default cap, and the test replays the 256 candidates to check the stream advanced exactly that far.
- **E-34 range and fidelity cell.** The plan's example range is 1792-1811; E-34 quotes 1796-1815 (also 20 lines, inside 1783-1815), so it includes the STATION_AEGIS loop; the three lane-length lines 1793-1795 are outside it and are named in an Open items bullet. The Fidelity cell is `divergence:` (capped loops) quoting the Key Decisions row, because the contract accepts only `faithful` or a divergence that quotes PROJECT.md.
- **Test-first order.** The implementation files were written before the test files, so there was no red run; tests were run green with the code and a mutation check confirmed they fail when a rule is broken. Each task is one commit (tests and code together), as in plan 12-02.
- **Commits.** The plan's project brief says "do not commit"; the dispatch for this run required per-task commits, so the tasks were committed. Nothing was pushed or tagged.
- **No CHANGELOG entry.** Nothing is user-visible until plan 12-08 wires the populator behind the traffic flag.

## Known Stubs

None. `aiType` is intentionally ignored until the AI phases (D-02, recorded in the Key Decisions row).

## Threat Flags

None. T-12-16 (capped loops, galaxy-0 sweep with no fallback), T-12-17 (role matching by `===` over arrays, tested with `constructor`, `__proto__` and `toString` tokens) and T-12-18 (bad weights count as 0, unknown scan class dropped before any draw, refusals skipped) are mitigated as the plan states; no new endpoint or trust boundary.

## Next

Ready for 12-08 (the app calls `populateInertWorld` from the world lifecycle with traffic on).

## Self-Check: PASSED

- FOUND: src/sim/world/placement.ts, src/sim/world/populate.ts, tests/sim/world/placement.test.ts, tests/sim/world/populate.test.ts, tests/helpers/inert-world.ts, tests/helpers/write-inert-world-golden.ts, tests/golden/world/inert-lave-epoch1.json
- FOUND commits 7ee4373 and 78900fb on HEAD

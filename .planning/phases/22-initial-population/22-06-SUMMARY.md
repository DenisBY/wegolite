---
phase: 22-initial-population
plan: 06
subsystem: sim-world
tags: [populator, entry-table, rates, randomise, forked-streams, fidelity, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-02: the 66 system fixtures, neighbourhood-all.json, edge-draws.json"
  - phase: 22-initial-population
    provides: "plan 22-04: buildNeighbourhood and the Neighbourhood facts"
provides:
  - "src/sim/world/population/table.ts: POPULATOR_ENTRIES (36 registrations, 24 kept, 12 cut), PopulatorBuilderId, PopulatorEntry, POPULATOR_CUTS, entriesInEngineOrder"
  - "src/sim/world/population/plan.ts: SystemFacts, systemFactsFrom, entryRates, randomise, planCounts, CountDraws, PlannedCount, EntryRates"
  - "src/sim/world/population/streams.ts: PopulationDraws, populationDraws, countDraws, countDrawSource, POPULATION_TAG_CODES, PopulationTag"
  - "src/sim/rng.ts: RNG purpose pop (code 10), pinned by a literal vector"
  - "tests/helpers/population-fixtures.ts: loadPopulationFixtures, loadPopulationFixture, loadNeighbourhoodTable, loadEdgeDraws, galaxySystems, factsFromFixture, countDrawsFromFixture, recordedDraws"
  - "tests/contract/fidelity.test.ts admits Resources/Scripts/<file>.js citations (js fence); FIDELITY rows E-199 to E-203; Key Decisions row 'Initial population port (WORLD-08, Phase 22)'"
affects: [22-07, 22-08, 22-09, 22-10, 22-12, 22-13]

actuals:
  tokens: 25300
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Planner reads untrusted facts through total readers (read, num, list): a malformed field becomes NaN or an empty list, a non-finite rate counts 0, a count is clamped to 0..MAX_ENTITIES"
    - "A replay helper hands recorded draws back through the same interface the port draws from (PopulationDraws, CountDraws)"
    - "A script excerpt in FIDELITY.md carries a Prettier guard comment so the embedded js is not reformatted"

key-files:
  created:
    - src/sim/world/population/table.ts
    - src/sim/world/population/plan.ts
    - src/sim/world/population/streams.ts
    - tests/helpers/population-fixtures.ts
    - tests/sim/world/population/plan.oracle.test.ts
  modified:
    - src/sim/rng.ts
    - tests/sim/rng.test.ts
    - tests/contract/fidelity.test.ts
    - FIDELITY.md
    - .planning/PROJECT.md

key-decisions:
  - "planCounts takes `drawsForEntry(ordinal)` returning the entry's next count draw; production passes `countDrawSource(worldSeed)`, which creates each entry's own stream on first use"
  - "Rates are computed only for kept entries; the repopulator frequencies, the medium and heavy hunter rates, the assassin rate and the Thargoid rates feed cut entries and are not ported"
  - "A non-finite rate is 0 in entryRates (and the `pindependents > 10` halving loop is guarded against Infinity); a negative finite rate is kept as Oolite computes it and the count is clamped to 0 in planCounts"
  - "The group streams have no `count` tag: an entry's count draws come from countDraws, whose seed is `mix32(forkSeed(worldSeed, ordinal, 'pop'), 0)`, and group draws use `groupIndex + 1`"
  - "FIDELITY script excerpts carry `<!-- prettier-ignore -->` before the js fence, and the contract parser skips that line, because Prettier formats embedded js and broke the tabs of the quotation"

requirements-completed: [WORLD-08]

plan_head_before: 4965518c5ff6000eef3fe59fb6dc68fc4f1a92d8
plan_head_after: c9be70c52a2eccbe74dd520fcb8038b416b3e921 (task commits 39bea27c, 09f0fa98, c9be70c5; the SUMMARY commit follows)

duration: 80min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 06: The planning half of the initial populator Summary

**The frozen 36-entry populator table (24 kept, 12 cut with reasons), Oolite's rates, `randomise` and per-entry counts ported line by line with their upstream quirks, new forked `pop` streams (RNG purpose 10), and a replay that reproduces the recorded group count of every kept entry of all 66 fixtures from the recorded facts and draws.**

## Performance

- **Duration:** about 80 min (start 2026-11-26T15:28Z)
- **Tasks:** 3
- **Files:** 5 created, 5 modified

## Accomplishments

- **Entry table.** `POPULATOR_ENTRIES` lists the script's 36 `setPopulator` registrations in registration order (ordinal = stream key, frozen, append-only). The replay asserts its names, priorities, locations, counted flags and cut flags equal every fixture's entry list, and that the engine order (stable sort by priority, then ordinal) equals every fixture's `engineOrder`.
- **Kept (24):** freighters and freighters-docking, couriers route 1 and 3, smugglers, hunters triangle and route 1, the three independent-pirate routes, the nine pirate pack entries (light, medium, heavy; two local, one remote each), police route 1, triangle and station patrol, interceptors route 1 and witchpoint.
- **Cut (12), `POPULATOR_CUTS`:** the two buoys, the two asteroid entries and the off-lane hermit (D-09, A2; D-03), the four medium and heavy hunter entries and the assassins (WORLD-08b), the Thargoid scouts and strikes (D-09, A1). Cut writes: `switchAI` (D-10), `_setMissiles`, `EQ_ECM`, `EQ_SHIELD_BOOSTER`, `heatInsulation`, `maxEscorts`. Recorded as not initial entries: the aegis raiders (a repopulator rate) and the scavengers and shuttles (Phase 26).
- **Rates and counts.** `entryRates` is `oolite-populator.js:275-608` plus the `initial` of `:655-986`, expression by expression in the script's operator order. `randomise` takes three draws. `planCounts` runs the kept entries in engine order and takes three draws per counted entry even at a 0 rate; the station patrol counts 1 with no draw.
- **Streams.** `RNG_PURPOSE_CODES.pop = 10` (inj stays 9), pinned by `forkSeed(0x2b4e037c, 1, "pop") = 0xffaa813c` and `forkSeed(0x2b4e037c, 0, "pop") = 0x80b8a953`. `countDraws(worldSeed, ordinal)` and `populationDraws(worldSeed, ordinal, groupIndex)` (per-tag lazy streams, tag codes frozen) are pinned by literal first draws; an unknown or inherited tag throws a `RangeError`.
- **FIDELITY.** The contract admits `Resources/Scripts/<file>.js:a-b` under a `js` fence (the `src/Core` form and `objc` fence unchanged) and refuses a script under an `objc` fence. New rows E-199 (courier bottleneck quirk), E-200 (`randomise`), E-201 (police fold), all faithful; E-202 (engine order, A5) and E-203 (the cuts), divergences that quote the new Key Decisions row.

## Count replay result

All 66 fixtures (35 systems x seeds 1 and 2, minus four second seeds): `planCounts` fed the recorded facts and the recorded count draws returns exactly the recorded `count` of every kept entry; no mismatch, no fixture or recorder change. Facts derived from the content (`systemFactsFrom` over `deriveSystemLayout`) give the same counts and lane lengths within 1e-6 relative. Bottleneck systems (Arazaes g0-s92, Timabi g3-s239 and others with 2 or more locals) reproduce their courier counts, and with the `*= 1.5` removed at least one fixture's recorded counts no longer match (asserted). g7-s162 plans only the station patrol. The edge draw `randomise-third-draw` is reproduced to the last bit (a third draw equal to `count - floor(count)` does not add one, the double below it does).

Mutation checks (each restored): removing `couriers *= 1.5` fails the Lave tracer; changing `<` to `<=` in `randomise` fails four tests including the edge-draw replay; dropping `hlight += police` fails seven fixtures.

## Task Commits

1. **Task 1 (tracer): entry table, facts, rates, randomise, Lave replay** - `39bea27c`
2. **Task 2: pop streams, every fixture's counts, table completeness, totality** - `09f0fa98`
3. **Task 3: FIDELITY contract widening, rows, Key Decisions row** - `c9be70c5`

## Deviations from Plan

None that change the plan's outcome. Three details to know:

**1. [Rule 3 - Blocking] Prettier reformatted the embedded `js` excerpts.** Found during Task 3. Prettier formats code under a `js` fence in markdown, which rewrote the tabs of E-199 and broke the verbatim check. Fix: a `<!-- prettier-ignore -->` line before each `js` fence in FIDELITY.md, and the contract parser skips that line (and blank lines) between a heading and its fence. No `.prettierrc` was added.

**2. Test-first order.** Tasks 1 and 2 are `tdd="true"`, but the module and its tests were written together and run green on the first run (the recorded fixtures are the oracle, so the port was written against them). Each guarded value was mutation-checked afterwards (see above).

**3. `planCounts` signature.** Named as the plan names it (`drawsForEntry(ordinal)` returns the next count draw); `countDrawSource(worldSeed)` in `streams.ts` is the production implementation.

## Gates

- Targeted: `tests/sim/world/population/plan.oracle.test.ts` 98 passed, `tests/sim/rng.test.ts` 39 passed, `tests/sim/world/inert-isolation.test.ts` 39 passed; `tests/guards` and `tests/sim/world` (62 files, 2,456 tests) passed.
- `tests/contract/fidelity.test.ts` without `OOLITE_SRC`: 9 passed, 1 skipped (the verbatim case). With `OOLITE_SRC=/oolite` (`git archive 7437f22 src Resources`, mounted read-only): **10 passed, the verbatim case passed (not skipped)** over all excerpts including E-199 to E-203.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- Remote full suite and remote frozen acceptance run: see below (both green).

## Remote runs (snapshot c9be70c5, the plan's last code commit)

- **Frozen 20-seed run (QUAL-12, `src/sim/rng.ts` gained a purpose and `src/sim/world/` gained files):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`: **exit 0, 86 s, 21 passed of 21** (epochs 1 to 20 each about 4.3 s, plus the pin). No change to the frozen thresholds or detectors. The new modules are not imported by any runtime path yet, and `rng.ts` only gained an appended purpose, so the run could not move; it is recorded because the plan asks for it. The epoch 1 to 20 inert pin holds.
- **Full Vitest suite (remote):** `~/.claude/scripts/wegolite-remote-run.sh run --rm test` (with coverage): **exit 0, 303 s, 313 test files passed and 1 skipped, 10,059 tests passed and 15 skipped**, the coverage thresholds held. The earlier local failures of `tools/oolite-ingest/drift.test.ts` under load did not recur.

## Threat Flags

None. The planner is pure arithmetic over injected facts (T-22-09 mitigated: non-finite rates count 0, counts clamped to `MAX_ENTITIES`, the pirate halving loop cannot spin on Infinity, fast-check totality property at 300 runs; T-22-10 mitigated: `===` over frozen arrays, `Object.hasOwn` for tag codes, a `RangeError` for an unknown tag).

## Known Stubs

None. `src/sim/world/population/` is not imported by any runtime path yet (plans 22-07 to 22-13 wire it); `populate.ts`, `INERT_POPULATION` and `INERT_RECORD_KEYS` are not edited.

## Notes for the next plans

- `SystemFacts.neighbourhood.seconds[i]` are `Neighbour[]` lists (plan 22-04); the planner reads their length and, for `veryseconds`, each neighbour's `government`.
- `entryRates(facts).initial[ordinal]` holds each kept entry's `randomise` argument (0 for a cut or uncounted entry); `couriers`, `pirates`, `hlight`, `police` and `interceptors` are exposed for tests.
- The group streams take `PopulationTag` keys: `body, system, weapons, skill, pick, escort, accuracy, injector, location, scatter, orient, cargo`. `recordedDraws(group)` implements `PopulationDraws` and throws, naming the tag, when a tag has no recording or is used up.
- CHANGELOG.md: no entry, the change is not user-visible (nothing imports the new modules yet).

## Self-Check: PASSED

The five created files exist; commits 39bea27c, 09f0fa98 and c9be70c5 are ancestors of HEAD; `git diff --name-only 4965518c..HEAD` shows no change to `tests/oracles/`, `src/sim/world/populate.ts`, STATE.md or ROADMAP.md. Acceptance greps: `planCounts` export 1, `POPULATOR_ENTRIES` in table.ts, no `Math.random`, `Math.hypot`, `Date.` or `for..in` in plan.ts and table.ts, `fc.assert` and `edge-draws` in the replay test, `pop: 10` once and `inj: 9` once in `rng.ts`, `Resources` 7 times in the contract test, 4 script excerpts in FIDELITY.md (E-199, E-200, E-201, E-203), 1 Key Decisions row. PLAN_BASE for the fixtures check: 4965518c5ff6000eef3fe59fb6dc68fc4f1a92d8.

---
phase: 22-initial-population
plan: 02
subsystem: tools-oracle
tags: [oracle-first, populator, fixtures, selector, edge-draws, neighbourhood-table, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-01: the stub host, the recorder core, PopulationFixtureSchema, the Lave tracer fixture"
provides:
  - "tools/ai-harness/population-systems.ts: selectPopulationSystems (deterministic stratified selector), the committed 35-system POPULATION_SYSTEMS with reasons and seeds, POPULATION_SEEDS, recordedSeeds"
  - "tools/ai-harness/populator-record.ts: recordNeighbourhoodTable, recordEdgeDraws, recordShipFacts, proxyPopulation, collectCandidates, recomputeSelection, writeAll and the --all and --select CLI modes"
  - "tests/oracles/population/codec.ts: the lossless compact fixture file form (decodePopulationFixture, encodePopulationFixture, POPULATION_ENTRY_TABLE, POPULATION_STARTUP)"
  - "tests/oracles/population/schema.ts: NeighbourhoodTableSchema, EdgeDrawsSchema, ShipFactsSchema"
  - "fixtures: 66 system fixtures, neighbourhood-all.json (2,048 systems), edge-draws.json, ship-facts.json; 919,714 bytes (du -sb)"
affects: [22-04, 22-05, 22-06, 22-07, 22-08, 22-09]

actuals:
  tokens: 28000
  tasks: 3
  commits: 4

tech-stack:
  added: []
  patterns:
    - "A fixture has two forms: the logical PopulationFixture (strict zod, what tests use) and a compact file form with an exact decode/encode pair; the recorder checks decode(encode(x)) equals x on every write"
    - "Boundary probes: a crafted double fed to the nth Math.random call on a script line (found from the V8 stack), the threshold found to the last bit by bisection over the double bit patterns"

key-files:
  created:
    - tools/ai-harness/population-systems.ts
    - tests/oracles/population/codec.ts
    - tests/oracles/population/fixtures/ (66 system fixtures, neighbourhood-all.json, edge-draws.json, ship-facts.json)
  modified:
    - tools/ai-harness/populator-record.ts
    - tools/ai-harness/populator-record.test.ts
    - tests/oracles/population/schema.ts
    - tests/oracles/population/population.self.test.ts
    - .prettierignore

key-decisions:
  - "Size rule applied beyond the plan's two steps: the plan's premise (10 KB per fixture) was off by 8x; the sample is 35 systems with seed 1 and, except four, seed 2, no third seed (66 fixtures, 919,714 bytes), not 35 x 3 = 105 (see Size decision)"
  - "Fixtures are stored in a compact one-line JSON form (codec.ts) and the fixture directory is in .prettierignore"
  - "The selector's proxy population is the sum of every registered groupCount at draws of 0.5 (the plan's literal definition); under it Reteti (g2-s179) is not the largest anarchy of the universe, g3-s123 is, and the selector replaces it"

requirements-completed: [WORLD-08]

plan_head_before: 5714fe2261898a9a774fba09ccde4646e54f0a6a
plan_head_after: 8856dc262e0eed64c774c5f32cde3519cb95633b (task commits; the SUMMARY commit follows)

duration: 240min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 02: The populator oracle, widening half Summary

**The oracle of plan 22-01 now covers the stratified 35-system sample of D-04 (66 fixtures), all 2,048 systems' neighbourhoods and bottlenecks, seven boundary-draw cases pinned to the last bit, and the per-key ship facts; every file is recorded from Oolite's own `oolite-populator.js` through the stub host, strict and self-tested, reproducible byte for byte, and 919,714 bytes in total.**

## Size decision (read this first: it changes the fixture shape 22-06 reads)

The plan expected about 10 KB per fixture; plan 22-01 had already measured 75 KB for Lave. Recording the 35-system sample at 3 seeds in the 22-01 format gave **105 fixtures, 8.87 MB** (median 77 KB, maximum 190 KB), against the 1,000,000-byte ceiling and "hundreds of KB". The plan's own rule (base-36 draws, then drop third seeds) is nowhere near enough: even the tightest lossless encoding of 105 fixtures is 1.3 MB. The ceiling and 105 fixtures cannot both hold, and the plan ranks the ceiling above the third seed, so the ceiling won. The chain, in order, with measured sizes for the 105-fixture set:

1. **Compact file form** (`tests/oracles/population/codec.ts`), lossless: the script's registration constants (entry names, priorities, locations, `startUp` values) live once in `POPULATION_ENTRY_TABLE` / `POPULATION_STARTUP` and the recorder stops on any difference; repeated strings go to a per-file dictionary; ships, calls, ship groups and groups are tuples; the draws of a site are one string of 7 base-36 digits per draw; accuracy is the shortest decimal with the same float32; the file is one line of sorted-key JSON (the directory is in `.prettierignore`). The 105 fixtures go from 8.87 MB to 1.38 MB.
2. **Logical content trimmed** where the final state or another file already carries it: only the cut writes of a ship are stored (the others equal the ship's final fields), the per-fixture `shipFacts` moved to `ship-facts.json`, a neighbour keeps its government, economy and tech level but not its `seconds` (they equal the table row), `within25` became `within25Count`. 1.38 MB becomes 1.32 MB after these (the compact form had already removed most of it).
3. **Seeds**: no third seed for any system, and no second seed for the four largest non-anchor systems (g1-s219, g5-s121, g5-s183, g6-s238). Every anchor keeps seeds 1 and 2. Result: **66 system fixtures** plus the table, edge draws and ship facts: **919,714 bytes**, `du -sb` of the fixture directory, below 1,000,000.

Consequences for later plans:
- **Reading a fixture:** `PopulationFixtureSchema` is still the logical, strict type, but a file is no longer a `PopulationFixture`. Use `decodePopulationFixture(JSON.parse(text))` from `tests/oracles/population/codec.ts` (22-06's `loadPopulationFixtures` must). It returns the same logical shape as before except: `shipFacts` is gone (read `fixtures/ship-facts.json`), `ships[].writes` holds only the cut writes (each `cut: true`), `inputs.within25` is now `inputs.within25Count`, and neighbours have no `seconds`.
- **Acceptance count:** the plan's `>= 90` fixtures is not met (66), by the size rule above. Restoring 105 means raising the ceiling and `POPULATION_SECOND_SEED_DROPPED` / `recordedSeeds`; the recorder and codec already handle it (3 seeds is 1.32 MB for the fixtures alone).
- **Lave seed 1** changed bytes (74,774 to 11,532) because the format changed, not the content: it decodes to the same ships and draws as 22-01's file apart from the dropped redundant writes.

## Selected systems (35, count within the plan's 30 to 36)

Chosen by `selectPopulationSystems` (cell medians by proxy population, ties by galaxy then id, plus the ten RESEARCH anchors re-checked from the candidate data; an anchor replaces its cell's median, a second anchor in one cell is added). Proxy is the sum of every registered `groupCount` with all draws 0.5; gov/eco/TL are the plist values. 34 non-empty cells give 34 medians; the ten anchors replaced 9 of them and one cell holds two anchors (g0-s219 and g3-s123, gov 0, ind, mid), giving 35.

| System | Name | gov | eco | TL | locals | very | bn | proxy | seeds | bytes | Why |
|---|---|---|---|---|---|---|---|---|---|---|---|
| g0-s4 | Xequerin | 4 | 3 | 6 | 5 | 1 | yes | 22 | 1,2 | 20625 | cell median: gov 4, ind, mid |
| g0-s7 | Lave | 3 | 5 | 4 | 6 | 0 | yes | 21 | 1,2 | 20963 | the start system; continuity with every existing traffic-on test |
| g0-s29 | Atrabiin | 2 | 2 | 6 | 7 | 1 | yes | 20 | 1,2 | 17462 | cell median: gov 2, ind, mid |
| g0-s92 | Arazaes | 6 | 4 | 6 | 10 | 1 | yes | 82 | 1,2 | 52221 | anchor: bottleneck with 10 or more neighbours (`couriers *= 1.5`) |
| g0-s219 | Onisqu | 0 | 3 | 5 | 5 | 2 | no | 36 | 1,2 | 42673 | anchor: the largest anarchy of galaxy 0 by proxy population |
| g1-s26 | Ramaza | 3 | 2 | 7 | 10 | 3 | no | 23 | 1,2 | 23005 | cell median: gov 3, ind, mid |
| g1-s56 | Soinuste | 6 | 7 | 3 | 5 | 0 | no | 25 | 1,2 | 18007 | cell median: gov 6, agr, low |
| g1-s185 | Zabeso | 2 | 0 | 10 | 7 | 3 | no | 17 | 1,2 | 21612 | cell median: gov 2, ind, high |
| g1-s189 | Resori | 4 | 1 | 11 | 8 | 0 | no | 40 | 1,2 | 28904 | anchor: no neighbour within 3.5 LY, government 5 or below (also TL 11) |
| g1-s219 | Israra | 1 | 6 | 5 | 6 | 0 | yes | 25 | 1 | 10859 | cell median: gov 1, agr, mid |
| g1-s227 | Ratite | 5 | 3 | 7 | 8 | 2 | no | 24 | 1,2 | 23010 | cell median: gov 5, ind, mid |
| g2-s35 | Edriuson | 0 | 7 | 0 | 7 | 2 | no | 23 | 1,2 | 29331 | cell median: gov 0, agr, low |
| g2-s49 | Vereza | 5 | 4 | 9 | 7 | 0 | yes | 25 | 1,2 | 18768 | cell median: gov 5, agr, high |
| g2-s60 | Teanti | 2 | 6 | 2 | 6 | 1 | no | 18 | 1,2 | 22073 | cell median: gov 2, agr, low |
| g2-s134 | Gemasoti | 5 | 6 | 4 | 6 | 2 | no | 22 | 1,2 | 17973 | cell median: gov 5, agr, low |
| g2-s138 | Anenveza | 7 | 6 | 8 | 7 | 0 | no | 27 | 1,2 | 20399 | cell median: gov 7, agr, mid |
| g3-s13 | Mavelege | 6 | 4 | 9 | 4 | 2 | no | 24 | 1,2 | 15169 | cell median: gov 6, agr, high |
| g3-s71 | Uscearti | 4 | 7 | 2 | 6 | 2 | no | 24 | 1,2 | 23073 | cell median: gov 4, agr, low |
| g3-s123 | Laxema | 0 | 3 | 7 | 12 | 2 | yes | 44 | 1,2 | 39958 | anchor: the largest anarchy of the universe by proxy population (replaces Reteti) |
| g3-s173 | Orxeteed | 6 | 1 | 9 | 5 | 1 | no | 24 | 1,2 | 17876 | cell median: gov 6, ind, high |
| g3-s239 | Timabi | 4 | 7 | 5 | 12 | 2 | yes | 72 | 1,2 | 38193 | anchor: bottleneck with 10 or more neighbours (`couriers *= 1.5`) |
| g4-s18 | Intedi | 6 | 2 | 8 | 9 | 0 | yes | 38 | 1,2 | 26830 | anchor: no neighbour within 3.5 LY, government above 5 |
| g4-s20 | Anbedi | 5 | 2 | 9 | 8 | 2 | no | 24 | 1,2 | 19115 | cell median: gov 5, ind, high |
| g4-s134 | Onsoor | 7 | 4 | 9 | 7 | 1 | no | 30 | 1,2 | 26041 | cell median: gov 7, agr, high |
| g5-s121 | Biqule | 0 | 3 | 4 | 7 | 0 | yes | 23 | 1 | 14991 | cell median: gov 0, ind, low |
| g5-s152 | Dirien | 3 | 1 | 11 | 4 | 1 | no | 23 | 1,2 | 24694 | cell median: gov 3, ind, high |
| g5-s183 | Isata | 7 | 3 | 8 | 7 | 1 | no | 38 | 1 | 13484 | cell median: gov 7, ind, mid |
| g5-s197 | Istiesri | 3 | 4 | 5 | 4 | 0 | yes | 20 | 1,2 | 17932 | cell median: gov 3, agr, mid |
| g5-s239 | Areis | 5 | 4 | 8 | 5 | 4 | no | 26 | 1,2 | 18048 | cell median: gov 5, agr, mid |
| g6-s53 | Quandixe | 7 | 0 | 14 | 8 | 2 | yes | 40 | 1,2 | 24432 | anchor: tech level 14 (the highest proxy of the six) |
| g6-s57 | Ausaso | 1 | 2 | 6 | 11 | 5 | no | 46 | 1,2 | 50187 | anchor: the largest feudal state by proxy population |
| g6-s238 | Intean | 1 | 7 | 3 | 4 | 2 | no | 23 | 1 | 15361 | cell median: gov 1, agr, low |
| g7-s162 | Oresrati | 7 | 7 | 4 | 0 | 0 | no | 7 | 1,2 | 3313 | anchor: isolated, no neighbour within 7 LY, only the station patrol |
| g7-s202 | Atisen | 1 | 2 | 9 | 9 | 4 | no | 25 | 1,2 | 27076 | cell median: gov 1, ind, high |
| g7-s216 | Diesdi | 2 | 5 | 5 | 3 | 0 | yes | 20 | 1,2 | 25867 | cell median: gov 2, agr, mid |

(`bytes` is the size of the system's committed fixtures; "ind" is economy 0 to 3, "agr" 4 to 7; "low" TL <= 4, "mid" 5 to 8, "high" >= 9.) The full reasons strings are in `POPULATION_SYSTEMS`.

**Anchor checks.** Every named RESEARCH anchor was re-checked from the recorder's own output. One property did not hold: **g2-s179 Reteti is not the largest anarchy of the universe** (proxy 32; the largest is g3-s123 Laxema at 44, also a 12-neighbour bottleneck), so the selector replaced it with Laxema. Also: Arazaes and Timabi are both bottlenecks with 10 and 12 neighbours (proxy 82 and 72, among the highest of the universe); Onisqu is the largest anarchy of galaxy 0; Ausaso the largest feudal state; Oresrati the only system with no neighbour within 7 LY. No selection was above 36, so no trimming by dropping cells was needed. The "no neighbour within 3.5 LY" pair is Intedi (gov 6) and Resori (gov 4); the TL 14 anchor is Quandixe.

## Accomplishments

- **Neighbourhood table** (`neighbourhood-all.json`, 81,898 bytes): per galaxy, per system id, the ids within 7 LY and within 3.5 LY, the count within 25 LY, and the bottleneck ids, from the stub's own transliteration of `legacy_random.h:154-160` (no import of `src/sim/hyperspace`) and the script's own `_systemIsBottleneck(locals, seconds)` run in the vm after the pin check. The self-test proves it symmetric, internally consistent (3.5 LY within 7 LY, no self, ascending), has 322 bottlenecks over the universe, none of them a system with fewer than two neighbours, and equals every fixture's recorded neighbourhood.
- **Edge draws** (`edge-draws.json`, 5,705 bytes): seven cases run through the script's own functions with crafted doubles, each probing 0, the largest double below 1 and the threshold found to the last bit (an adjacent pair with different results, asserted by the self-test).
- **Ship facts** (`ship-facts.json`, 2,586 bytes): 29 catalogue keys with `hasHyperspaceMotor` (false for gecko, krait, mamba, mamba-escort, shuttle, sidewinder, sidewinder-escort, viper and viper-pursuit, true for the other 20), `accuracy` and `cargoCarried` (null for all 29).
- **Rerun test** widened: with `OOLITE_SRC` set it re-records every system fixture, the table, the edge draws and the ship facts and compares bytes (naming the first differing key), checks the committed fixture set equals the sample, and recomputes the selection and compares ids and reasons; five cases pass in 43.8 s. Without `OOLITE_SRC` they are skipped. Mutation check: a one-digit change of `edge-draws.json` fails with `edge-draws.json differs from a rerun at $.cases[0].probes[0].result` (restored).

## Edge cases (all `Math.random` at fixed 0.5 except the named slots)

| Case | Site (script line) | Observed | Threshold (recorded) |
|---|---|---|---|
| randomise-third-draw | `:648` | groupCount of the freighters entry, g0-s7 (count 4.19972129602122) | draw 0.19972129602122024 = count - floor gives 4; the double below gives 5 |
| freighter-offender-test | `:1418` | bounty of the trader | 0.05 gives 0; the double below gives 10 |
| freighter-opportunist-test | `:1423` (offender forced true) | cargo kind | 0.5 gives scarce; the double below gives pirate |
| police-patrol-interceptor-role | `:2055` (g0-s153, TL 12) | requested role | `9 + r * 6 < 12` flips at 0.49999999999999983 (not 0.5): the double below gives interceptor |
| station-patrol-interceptor-role | `:2082` (g0-s153) | requested role | same threshold |
| set-weapons-level-one-and-a-half | `:2242` | forward/aft weapon of hunter 0 | 0.5 gives pulse, the double below gives beam |
| pirate-pack-class-count | `:1813` | light fighters of a light pack | (0.75, 0.25) gives 3, (0.25, 0.75) gives 2, (0.25, 0.7500000000000001) still 2 (the sum rounds to 2), (0, 1-ulp) gives 1 |

One unreachable boundary is recorded with its reason: `randomise` equality on a fraction that is not a multiple of 2^-32 cannot be hit through a u32 stream.

## RED / GREEN

- **Task 1 (tracer), RED** `9db241b5`: `NeighbourhoodTableSchema` and the self-test (table symmetry, fixtures equal table rows, Oresrati has only the station patrol); the run (vitest TAP) failed on `includes the neighbourhood table and the isolated anchor` with `expected false to be true`. **GREEN** `6a2f9ed0`: `--all`, the table, the Oresrati and Lave seeds; 143 tests pass. Auto mode is on: the end-to-end re-run of Task 1's `<verify>` passed (`Tracer verified end-to-end -- expanding`), and the Lave seed 1 fixture came out byte-identical to 22-01's through the same code path before the format change.
- **Tasks 2 and 3:** the sample and boundary checks need the recorded data as input (the selector's output is what they check), so their tests landed in the same commits as the recordings (`dace2e23`, `8856dc26`) with no separate RED commit. Each was run against the data and mutation-checked where it guards a value (the rerun test above).

## Findings that change what later plans assume

- **The police interceptor hull is authored with fuel 160 (16 LY)**, above the 70 the script's own `fuel` clamp allows, and the script never writes police fuel. The self-test's fuel bound is 70, except 160 for `viper-interceptor` (22-07 must carry the authored fuel for that hull).
- **`9 + r * 6 < TL` flips at r = 0.49999999999999983, not 0.5, for TL 12** because of double rounding. A port that computes the same expression in doubles reproduces it; a port that compares `r < (TL - 9) / 6` does not.
- **Features for the later replays** (system fixtures containing them): escorted anaconda or boa traders in 33 fixtures (for example g0-s7-seed1, g0-s4-seed1, g1-s189-seed1); heavy pirate packs in g0-s219-seed2 (the Onisqu anarchy), g2-s35-seed1 and g2-s35-seed2; opportunist traders in 11 (g0-s219-seed1, g0-s4-seed2, g1-s227-seed1, ...); bottleneck systems in 24 fixtures (g0-s7, g0-s92, g0-s4, g0-s29, ...). **Interceptor-entry groups** (`oolite-interceptors-*`) occur in only one fixture (g5-s152-seed2), the police-patrol interceptors in several TL >= 9 systems; the 20-seed run covers the rest.
- The recorder was split: `loadPopulator` (pin check, host, script load) is shared by `recordPopulation`, the table, the proxy and the edge runs.

## Gates

- Targeted, with `OOLITE_SRC=/oolite` (pinned tree): `tools/ai-harness/populator-record.test.ts` 5 passed, `tests/oracles/population` 1,293 passed, `tests/guards/oracle-independence.test.ts` 10 passed, `tests/guards/harness-isolation.test.ts` passed (no edit needed: it scans by directory).
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- `docker compose run --rm test` (full, with coverage, 690 s): 310 test files passed, 1 skipped (`populator-record.test.ts`, 5 cases reported skipped: no `OOLITE_SRC` in that run); 9,858 tests passed, 15 skipped; the coverage thresholds held.
- `rg -c "PriorityAIController|oolite-libPriorityAI" tools/ai-harness/dist-check.ts` = 2 (unchanged, no new marker). `git diff --name-only 5714fe22..HEAD -- src` prints nothing. No `verify`, no 20-seed run (no `src/` file and no QUAL-12 path changed).
- `du -sb tests/oracles/population/fixtures` = 919,714.

## Deviations from Plan

**1. [Rule 3 - Blocking] The size ceiling and the fixture count cannot both hold; ceiling kept, seeds cut.** See "Size decision". Files outside the plan's list were touched for it: `tests/oracles/population/codec.ts` (new) and `.prettierignore` (the fixture directory is excluded: compact one-line JSON, byte-compared by the rerun test; the same device as `src/content/generated`).
**2. [Rule 1 - Bug] Fuel bound.** The 22-01 self-test asserted every ship's fuel <= 70; the police interceptor hull is authored at 160. The test now allows 160 for `viper-interceptor` (found when the sample widened past Lave).
**3. [Rule 3] Anchor replaced:** g2-s179 Reteti by g3-s123 Laxema (property did not hold), as the plan prescribes.
**4. The proxy population sums every registered entry** (including the cut ones), the plan's literal definition; with the kept entries only the ranking of the anchors is the same (checked on a first pass: the same largest anarchy, feudal state, galaxy-0 anarchy).
**5. Logical fixture changes** (shipFacts, non-cut writes, neighbour seconds, within25 count): see "Size decision".

## Threat Flags

None. The recorder still runs one pinned file after a hash check; no network, no new dependency, nothing under `src/`, `public/` or `dist` imports the harness (`harness-isolation` guard passes, `DIST_MARKERS` unchanged).

## Known Stubs

None. (`system.pseudoRandomNumber` still answers 0 for the cut asteroid and hermit registrations: `inventory.cutReads`, unchanged from 22-01.)

## Self-Check: PASSED

The created files exist (`population-systems.ts`, `codec.ts`, the 66 fixtures and the three widened files, this SUMMARY); commits 9db241b5, 6a2f9ed0, dace2e23 and 8856dc26 are ancestors of HEAD; `git diff --name-only 5714fe22..HEAD -- src` is empty; STATE.md and ROADMAP.md are untouched. Not met as written, by the Size decision: the acceptance count of at least 90 fixtures (66 recorded).

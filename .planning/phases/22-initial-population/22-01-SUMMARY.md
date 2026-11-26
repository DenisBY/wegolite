---
phase: 22-initial-population
plan: 01
subsystem: tools-oracle
tags: [oracle-first, populator, node-vm, ai-harness, fixtures, WORLD-08]

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: "tools/ai-harness (host.ts, load.ts, AI_HARNESS_SENTINEL), the oracle-independence and harness-isolation guards, the strict-schema oracle pattern"
  - phase: 21-roster-state-shape-and-seams
    provides: "the 29-record NPC catalogue (ships-npc.json) the stub picks from"
provides:
  - "tools/ai-harness/populator-host.ts: createPopulatorHost, the stub host for oolite-populator.js (system, SystemInfo, Ship, ShipGroup, Vector3D, the engine model, per-site draw tagging)"
  - "tools/ai-harness/populator-record.ts: recordPopulation, writeFixture, fixtureText, the CLI, POPULATOR_SCRIPT_SHA256, PopulatorPinError"
  - "tests/oracles/population/schema.ts: PopulationFixtureSchema, POPULATION_DRAW_TAGS, POPULATION_ENTRY_NAMES (strict zod contract)"
  - "tests/oracles/population/fixtures/g0-s7-seed1.json: Lave, seed 1, recorded from Oolite's own script"
  - "tools/ai-harness/populator-record.test.ts: the byte-for-byte rerun and the hash refusal (skipped without OOLITE_SRC)"
affects: [22-02, 22-04, 22-06, 22-07, 22-08, 22-09]

actuals:
  tokens: 46200
  tasks: 2
  commits: 4

tech-stack:
  added: []
  patterns:
    - "Run an Oolite script unmodified in node:vm against a recording stub host; tag every Math.random with the site that took it by wrapping the script's own helper properties"
    - "Oracle fixtures recorded by a dev-only tool, written with sorted keys through prettier, replayed in CI without the Oolite checkout and re-recorded byte for byte when OOLITE_SRC is set"

key-files:
  created:
    - tools/ai-harness/populator-host.ts
    - tools/ai-harness/populator-record.ts
    - tools/ai-harness/populator-record.test.ts
    - tests/oracles/population/schema.ts
    - tests/oracles/population/population.self.test.ts
    - tests/oracles/population/fixtures/g0-s7-seed1.json
  modified: []

key-decisions:
  - "The trader escort removal is computed as the engine computes it: Ranrot() % 7 < government, then nx = pending - 2 * (1 + (Ranrot() & 3)) clamped by setPendingEscortCount to the maximum (0 for escort_roles hulls); it takes one draw when it does not fire and two when it fires, and only runs for hulls whose pending count is non-zero (those with escort_roles)"
  - "Cut entries (buoys, asteroids, hermit, medium and heavy hunters, assassins, Thargoids) are recorded as registrations with their count draws, but their callbacks are never run"
  - "Draw tag vocabulary: the plan's fourteen tags plus one added tag, bounty, for the engine's 20 + randf() * 50 bounty of a pirate-role ship (overwritten by the script)"

requirements-completed: [WORLD-08]

plan_head_before: 7ea62e6a3bc18325015ecde1d235129fc3e1c1d6
plan_head_after: 83acbb36bd3071c6e9b9b3febe6f4fde0f52ba70 (task commits; the SUMMARY commit follows)

duration: 120min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 01: The populator oracle, tracer half Summary

**Oolite's own `oolite-populator.js` (pin 7437f22, sha256 96a734a6...) now runs unmodified in `node:vm` against a stub host and its output for Lave seed 1 is committed, strict-schema checked and reproducible byte for byte, before any file under `src/sim/world/population/` exists.**

## Accomplishments

- **Stub host** (`populator-host.ts`): `system`, `SystemInfo` (`systemsInRange`, `distanceToSystem`, its own transliteration of `legacy_random.h:154-160` and `oolite-global-prefix.js:80-91`, no import of `jump.ts`), `Ship` with the engine's setter semantics (accuracy float32 clamp, fuel `lround(clamp(v,0,7)*10)`, 32-bit bounty OR, police bounty guard), `ShipGroup` (`setLeader` adds the leader, `setGroup` leaves the escort group alone), `Vector3D`, `Ship.keysForRole`, `System.infoForSystem`, `expandDescription`. The engine model: the `OOProbabilitySet` record pick (float32 cumulative weights, binary search, a one-record set takes no draw), the initial accuracy, the `has_fuel_injection` roll, the trader's random initial cargo flag and escort removal (`Universe.m:2650-2665`), `setUpMixedEscorts` and `setUpOneEscort`, `setCargoFlag`.
- **Recorder** (`populator-record.ts`): verifies the script hash before anything runs (`PopulatorPinError`), loads the script in its own context (counted global getters, `ENTRY_TIMEOUT_MS`, the sentinel), calls `startUp`, `systemWillPopulate`, attributes the draws between `setPopulator` calls to the next entry (three `count` draws; the two assassin draws before the first counted entry go under `setup`), runs the kept entries in the engine's stable priority order, and records per group the draws per tag, the engine calls, and every ship with every write (cut writes marked). The CLI takes `--out`, `--system`, `--seed`; output is JSON with sorted keys through `prettier`.
- **Schema and self-test**: `PopulationFixtureSchema` is strict throughout; `population.self.test.ts` (26 tests, no `src` import) checks header pins, entry registration order, the stable engine order, three count draws per counted entry, the station patrol (no `groupCount`, count 1), the two `setup` draws, one `injector` and one `accuracy` draw per created ship, ships = calls plus escorts, escort leader/slot/role, group links, float32 and fuel bounds, the `pos.z % 100000` remote tweak, the opportunist writes, `inventory.missing` within `cutReads`, and the neighbourhood lists.
- **Lave seed 1 fixture**: 36 entries (12 cut), 16 groups, 44 ships (8 escorts), 408 group draws plus 92 entry draws, 74,774 bytes. The inputs record the neighbourhood (6 locals, 0 very locals, 59 systems within 25 LY, bottleneck true) and the lane lengths l1 = 452,760, l2 = 906,043.69, l3 = 1,140,077.01.
- **Rerun test**: `populator-record.test.ts` re-records every committed fixture into a temp directory and compares bytes (naming the first differing key); it also refuses a copy of the script with one byte changed. Mutation check: a one-digit change of a committed fixture fails the rerun with `differs from a rerun at $.inputs.laneLengths.l1` (restored).

## RED / GREEN

- **RED** (`c6d83150`): `schema.ts` and `population.self.test.ts`. The run (vitest `--reporter=tap`) failed on the target test `includes the tracer fixture: Lave, seed 1` with `expected [] to include 'g0-s7-seed1.json'`; `gsd check tdd-red-evidence` returned `RED_EVIDENCE_OK` (`target_test_failed`, 6 failing of 8). Semantic assessment: the target ran and failed on its own assertion because no fixture exists before the recorder does; the ENOENT failures of the strictness cases are the same absence.
- **GREEN** (`15d342a6`): host, recorder and the recorded fixture; 36 tests pass in `tests/oracles/population` and `tests/guards/oracle-independence.test.ts`.
- **REFACTOR** (`83acbb36`): removed an unused record map from the populator world. Task 2 is `9c753609`.
- Task 1 is a tracer. Auto mode is on (`workflow.auto_advance`); the end-to-end re-run of its `<verify>` passed: `⚡ Tracer verified end-to-end — expanding`.

## Tag vocabulary (for 22-06)

`count`, `setup`, `body`, `system`, `weapons`, `skill`, `missiles`, `pick`, `escort`, `accuracy`, `injector`, `cargo`, `scatter`, `orient`, plus **`bounty`** (new). Compared exactly by the port: `count`, `body`, `system`, `weapons`, `skill`, `pick`, `escort`, `accuracy`, `injector`. Cut or not stream-compared: `setup`, `missiles`, `cargo`, `scatter`, `orient`, `bounty`. `orient` is reserved: the stub takes no orientation or per-ship scatter draws (positions are not compared); `scatter` draws are the group location and the three position draws per escort.

## Script constants read by `startUp`

`this.$medicalReg` = `/medical/i` (the stub reads `medical-word` from `Resources/Config/descriptions.plist` at the pin; it is at line 2005 there, not 2050 as the plan says), `$weaponLevelBias` 0, `$skillLevelBias` 0, `$skillLevelMaximum` 4.99. They are recorded in every fixture header (`startUp`).

## Lave seed 1 hand check

- Entries (registration order, counts from the recorded `randomise` draws): freighters 4, freighters-docking 0, couriers-route1 1, couriers-route3 1, smugglers 1, hunters-triangle 1, hunters-route1 0, independent pirates 2 + 1 + 1, light pack route1 1, medium pack route1 1, police-route1 1, police-triangle 0, station patrol 1 (no `groupCount`), both interceptor entries 0 (Lave is TL 4, so the interceptor rate is 0; both entries are still listed, not cut). The cut entries' counts are recorded too (for example hunters-medium-route1 = 1, assassins = 1).
- I recomputed the freighter, docking, courier and smuggler counts by hand from the recorded neighbourhood and the three recorded draws of each entry, including the `couriers *= 1.5` accumulator bug of a bottleneck system (`oolite-populator.js:311-314`): 4, 0, 1, 1, 1, equal to the recorded counts. The 7, 3.5 and 25 LY lists and the bottleneck flag also equal an independent Python computation from the system table.
- A freighter with escorts: group 0 of `oolite-freighters` is a `boa` (home system 147, destination 7, fuel 34, cargo scarce) with two escorts: `cobramk1` (slot 0) and `mamba-escort` (slot 1), both primary role `escort`, owner and leader index 0, bounty 0. Its escort set-up took 12 `Ranrot() % 11` draws plus the one `% 7` removal check that did not fire.
- Over a 320-fixture scratch sweep (8 systems x 40 seeds, not committed) the recorder never failed and every branch the plan names was taken: opportunist traders (23), offender traders (52), the medical boat (104), couriers' `heatInsulation` cut write, escorts (1,341), bottleneck systems (80).

## `inventory.missing`

Empty for Lave seed 1 (and for the whole sweep). `cutReads` lists `system.pseudoRandomNumber`, which the stub answers with 0 because only the cut asteroid and hermit registration reads it.

## Ship facts the host read beyond the catalogue

`hyperspace_motor` (default YES) for every record, from `shipdata.plist` through `like_ship` with the content ingester's own parser and resolver: false for gecko, krait, mamba, mamba-escort, shuttle, sidewinder, sidewinder-escort, viper and viper-pursuit, true for the other 20. Plan 22-05 compiles it. Also read, and absent for all 29 records: an authored `accuracy` (so every ship takes the `accuracy` roll) and `cargo_carried` (so every ship starts with cargo flag unset); the host throws if a picked record has either `cargo_carried` or plain (non-`escort_roles`) escorts. Plan 22-05 needs no field for these. No other ship member was needed.

## Stub assumptions the port must know (all recorded, none silent)

- Record pick order is the catalogue order (key sorted); Oolite's real order depends on the `NSDictionary` iteration of its registry. A role with one record takes no `pick` draw (`police`, `interceptor`). The pick uses float32 cumulative weights and Oolite's binary search.
- The engine turns role `interceptor` into primary role `police` at spawn (`Universe.m:3652-3655`); `_addInterceptors` overwrites it with `police-witchpoint-patrol`.
- Engine `randf()` is modelled at u32 resolution (Oolite's is 16 bit); engine `Ranrot()` draws are reduced as the engine reduces them (`% 11`, `% 7`, `& 3`, `& 15`).
- The witchpoint arrival path (`witchspaceLeavingEffects`) for ships spawned inside scanner range of the witchpoint, positions, orientations and crew are not modelled.
- `AIScript.oolite_intership` is an empty object on every ship, so the police patrol's `initial_group` write is recorded as a cut write.
- `ShipGroup.addShip`'s escort-group merge rule is not modelled (the kept paths never hit it).
- The Lave fixture is 74,774 bytes. At that size the 96 sample fixtures plan 22-02 records come to about 7 MB; RESEARCH assumed about 10 KB each. Plan 22-02 should decide the compaction before recording the sample (candidates: base-36 draws, dropping `writes` for kept-path writes the final ship state already carries, tuple-form writes).

## Task 2 notes

- `tests/guards/harness-isolation.test.ts` scans `src/`, `public/`, `index.html` and the root Vite configs for an import into `tools/ai-harness` and for the sentinel, by directory, so it already covers `populator-host.ts`, `populator-record.ts` and `populator-record.test.ts`; no edit was needed. The vm globals carry the sentinel (`__aiHarnessSentinel`).
- `DIST_MARKERS` is unchanged (`rg -c "PriorityAIController|oolite-libPriorityAI" tools/ai-harness/dist-check.ts` = 2): the populator script name occurs in `src/` comments and would false-positive through the shipped source maps; the sentinel on the vm globals is the marker.
- Rerun result with the pinned tree (`OOLITE_SRC=/oolite`): `tools/ai-harness/populator-record.test.ts` 2 passed (byte-for-byte rerun of every committed fixture, pin refusal); without `OOLITE_SRC` the same 2 cases are reported as skipped, not passed.

## Gates

- `docker compose run --rm -v /tmp/oolite-7437f22:/oolite:ro -e OOLITE_SRC=/oolite test npx vitest run tools/ai-harness/populator-record.test.ts`: 2 passed.
- `docker compose run --rm test npx vitest run tests/oracles/population tests/guards/oracle-independence.test.ts`: 36 passed.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- `docker compose run --rm test` (full, with coverage, 690 s): 310 test files passed, 1 skipped (`populator-record.test.ts`, no `OOLITE_SRC` in that run); 8,591 tests passed, 12 skipped; the coverage thresholds held.
- After the refactor commit: `lint`, `typecheck` clean; `populator-record.test.ts` (with `OOLITE_SRC`), `tests/oracles/population`, both guards and `tools/ai-harness` pass (71 tests).
- No `verify` and no 20-seed acceptance run (no `src/` file and no QUAL-12 path changed): `git diff --name-only 7ea62e6a -- src` prints nothing.

## Deviations from Plan

**1. [Rule 3 - Blocking] Docker-created files are root-owned.** The fixture directory was created by the container as root; it was handed back to the worktree user so the worktree can be removed.

None other: the plan otherwise executed as written. The `medical-word` line number in the plan (2050) is 2005 at the pin (documentation only).

## Threat Flags

None: the recorder runs one pinned file after a hash check, the harness stays out of `src/`, `public/` and `dist`.

## Known Stubs

None. (`system.pseudoRandomNumber` answers 0 for the cut asteroid registration; listed under `inventory.cutReads`.)

## Self-Check: PASSED

All six created files exist; commits c6d83150, 15d342a6, 9c753609 and 83acbb36 are ancestors of HEAD; `git diff --name-only 7ea62e6a -- src` is empty; STATE.md and ROADMAP.md are untouched.

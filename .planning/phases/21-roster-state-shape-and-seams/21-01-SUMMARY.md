---
phase: 21-roster-state-shape-and-seams
plan: 01
subsystem: sim-world
tags: [inert-populator, golden, isolation, fast-check, FOUND-20, pitfall-C1]

requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "planInertPopulation, INERT_POPULATION and the Lave inert world golden"
provides:
  - "INERT_RECORD_KEYS and inertRecords: the inert populator reads only the nine existing record keys"
  - "tests/golden/world/inert-lave-epochs-1-20.json: the owner-reserved epoch 1-20 pin (section and hashWorld FNVs)"
  - "tests/golden/world/inert-records-nine.json: the eight inert-path fields of the nine records"
  - "D-04 recorded in PROJECT.md Key Decisions (standing re-pin approval for v2.4)"
affects: [21-03, 21-04, 21-05, 21-08, 22-new-populator]

actuals:
  tokens: 8800
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Reduce a growing catalogue to an explicit key list before any draw (=== on the key, never an object lookup)"
    - "Pin a frozen experiment per epoch with both the section FNV and the hashWorld FNV, measured before the source change"

key-files:
  created:
    - tests/helpers/write-inert-epochs-golden.ts
    - tests/golden/world/inert-lave-epochs-1-20.json
    - tests/golden/world/inert-records-nine.json
    - tests/sim/world/inert-isolation.test.ts
  modified:
    - src/sim/world/populate.ts
    - tests/sim/world/populate.test.ts
    - tests/helpers/inert-world.ts
    - .planning/PROJECT.md

key-decisions:
  - "D-04 recorded in PROJECT.md without an owner question: the Phase 18 standing re-pin approval covers v2.4, with its two conditions and the three items it does not cover"
  - "The first inert populator reads an explicit list of nine record keys (INERT_RECORD_KEYS), reduced inside planInertPopulation before the scan-class filter and any draw"

requirements-completed: [FOUND-20]

plan_head_before: 7ba0a4c051a91fbd65d95eb0566c908a404b444d
plan_head_after: 9636bb11 (task commits; the SUMMARY commit follows)

duration: 40min
completed: 2026-11-26
status: complete
---

# Phase 21 Plan 01: Inert-world isolation from catalogue growth Summary

**The first inert populator now reads only the nine `INERT_RECORD_KEYS`, and the epoch 1-20 Lave worlds are pinned by section and hashWorld FNVs measured before the source change, so a 29-record catalogue cannot move the frozen inert world.**

## Accomplishments

- Measured `laveInertWorld(epoch)` for epochs 1 to 20 on the base commit `7ba0a4c0` and committed the golden (`411f7e00`) with its one-shot writer and the rebuilding test, before `src/sim/world/populate.ts` changed (the Task 1 commit lists no `src/` file).
- Added `INERT_RECORD_KEYS` (frozen, code-unit order, which is also the draw order) and the exported `inertRecords` reduction (first record per key by `===`, skips non-objects and keyless entries). It is the first statement of `planInertPopulation`; `INERT_POPULATION`, `pickRecord`, location codes and draw order are untouched.
- `tests/sim/world/inert-isolation.test.ts` (39 tests): the 20-epoch pin, epoch 1 cross-check, synthetic catalogue growth (appended, prepended, interleaved, reversed, growth over a reversed nine) with plan and both FNVs of all 20 epochs unchanged, the empty and single-key edges, ordering, duplicate-key rule, the nine-record field pin, and a fast-check totality property (300 runs, own inputs only, never reads the epoch golden).
- `tests/golden/world/inert-records-nine.json` pins key, roles, scanClass, radius, maxEnergy, energyRechargeRate, likelyCargo, maxCargo of the nine, so a converter change in plans 21-05 or 21-08 that alters one fails a test instead of moving the world.
- Mutation check: replacing `inertRecords(records)` with `records` in `planInertPopulation` fails 13 tests of the isolation file (restored before the commit).

## The 20 measured rows (match with RESEARCH section 5)

Measured on base commit `7ba0a4c0` with `docker compose run --rm test npx tsx tests/helpers/write-inert-epochs-golden.ts`. All 20 rows were compared programmatically with the RESEARCH table (measured at `9736e01b`): every worldSeed, section FNV and hashWorld FNV is equal, and every world holds 12 ships. Epoch 1 reproduces `ff6489bf` (equal to `tests/golden/world/inert-lave-epoch1.json`) and `c5949d60`.

| epoch | worldSeed | section fnv | hashWorld fnv |
|------|-----------|-------------|---------------|
| 1 | 726532988 | ff6489bf | c5949d60 |
| 2 | 2358620270 | 0ef67b3a | e7e2eb3f |
| 3 | 1658048036 | 6e6d4311 | 7bb70d62 |
| 4 | 2874323896 | 3f81e315 | 8d5324ba |
| 5 | 2362479205 | d3d5b910 | b94703ad |
| 6 | 365507317 | 4a3e09e1 | d3176e9a |
| 7 | 15436524 | d1db14c9 | cce0f3de |
| 8 | 2944482225 | f72a4849 | 31b4648a |
| 9 | 3470242674 | f03e216e | 800ac33b |
| 10 | 2667883293 | 8e0e6386 | bbfc696f |
| 11 | 3655716072 | 88586be9 | f489cb02 |
| 12 | 2662853381 | b8a7ba66 | 87d3ca7b |
| 13 | 2149423861 | d930ee18 | 2f3713af |
| 14 | 2138280794 | 6ec0d08b | 9c988798 |
| 15 | 2607074892 | dcba3d46 | ab365617 |
| 16 | 20192838 | 503d539e | 2b5da771 |
| 17 | 2079961999 | 0c4585ca | ac9ba941 |
| 18 | 312477038 | 969b7225 | fbc35b7c |
| 19 | 3161095431 | b4c8645b | 2db8a23a |
| 20 | 2529836020 | 31186a2b | aaeb9e80 |

The golden did not move across the plan: `git diff --stat 411f7e00..9f8ca89a` on both epoch goldens is empty, and the same 40 values hold at the final commit `9636bb11`.

## Task commits

| Task | Commit | What |
|------|--------|------|
| 1 (tracer) | `411f7e00` | epoch 1-20 golden, writer, isolation test; no `src/` file |
| 2 | `9f8ca89a` | `INERT_RECORD_KEYS`, `inertRecords`, behaviour and property tests, nine-record field pin |
| 3 | `9636bb11` | `laveInertRecords` selects by key; PROJECT.md D-04 and nine-key rows |

## Helper audit (Task 3)

Classes: (a) content assertion over the whole catalogue, left for plans 21-04/05/08; (b) a read whose result changes when records are added, changed to explicit keys; (c) goes through `createInertPopulate`/`planInertPopulation`, protected by Task 2.

| File | Class | Change |
|------|-------|--------|
| `tests/helpers/inert-world.ts` `laveInertRecords` | b | now selects the nine by `INERT_RECORD_KEYS` (throws on a missing key); byte-identical result on today's nine records. Used by populate, HUD model and render-driver tests, which would otherwise have received 29 records and a different `records.find`/role expectation |
| `tests/helpers/traffic-fixture.ts` (`committedTrafficContent`, `laveInertWorld`) | c | none: all records flow through `createInertPopulate` |
| `tests/helpers/tick-script.ts` (`committedTrafficContent`) | c | none: same path; masses and flight tables are keyed by `specKey` |
| `tests/helpers/npc-flight.ts`, `npc-weapons.ts`, `debris-fixture.ts` | keyed maps | none: flight table rows, weapon map and hull map are all looked up by spec key, so extra records change nothing for the nine |
| `tests/helpers/flyer-records.ts` | key-based | none: `npcRecord(key)` already picks by explicit key |
| `tests/sim/ai/test-spawn.test.ts`, `combat/{npc-fire,internal-damage-cadence}.test.ts`, `death-freeze`, `death.test.ts`, `step.test.ts`, `death-flow` | key-based | none: `find(record => record.key === "viper")` |
| `tests/sim/world/ship-field.test.ts` (masses), `populate.test.ts:445` (cargo by key) | keyed | none |
| `tests/sim/combat/collision-traffic.scenario.test.ts`, `tests/persistence/save-v3.test.ts`, `tests/app/session/{tick-parity,death-twin,traffic-variants,probe-publisher,world-lifecycle,hyperspace-controller,session-order}.test.ts` | c | none: feed `trafficContent` and the real populate |
| `tests/app/session/traffic.test.ts` (`toHaveLength(9)`, "nine committed records ... in catalogue order") | a | none; updated by the catalogue plans |
| `tests/content/ships-npc.test.ts`, `ships-hulls.test.ts`, `tests/guards/hud-message-length.test.ts`, `tests/app/asset-cache-npc.test.ts`, `tools/ai-harness/dist-check.test.ts`, `tools/oolite-ingest/convert/*.test.ts`, `tests/e2e/{budget,npc-assets,traffic,npc-flight}.spec.ts` | a | none; counts and schema assertions, derived or updated by plans 21-04, 21-05, 21-08 |
| `tests/acceptance/detectors.ts` (`committedTrafficContent`) | c | none (frozen; not edited) |

No class (b) read was found in a file outside the plan's `<files>` list; no listed helper other than `inert-world.ts` needed a change.

## Gate results

- `docker compose run --rm test`: exit 0, 290 files passed, 7691 tests passed, 10 skipped (full suite with coverage).
- `docker compose run --rm lint`: exit 0 (eslint and prettier clean).
- `docker compose run --rm typecheck`: exit 0.
- Remote frozen 20-seed run (QUAL-12), `~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`: exit 0, 1 file and 21 of 21 tests passed, elapsed 86 s, snapshot `9636bb11` (the committed HEAD of this worktree after Task 3). `tests/acceptance/thresholds.ts` and the detectors were not edited (`git diff --name-only 7ba0a4c0..HEAD -- tests/acceptance` is empty).
- No `verify` run (no browser-facing change), per the plan's gate policy.

## Decisions Made

- D-04 recorded as a PROJECT.md Key Decisions row instead of an owner question (orchestrator settled decision 1), together with a second row for the nine-key list.
- `inertRecords` is generic over `{ key: string }` and tolerates non-object entries with a runtime guard, so the totality property can feed it arbitrary garbage without the type system standing in for the check.

## Deviations from Plan

None - plan executed exactly as written. (The plan's acceptance criterion `rg -c '"c5949d60"' ... == 1` holds; `rg -c '"hashWorldFnv"'` counts lines and is 20.)

## Known Stubs

None.

## Threat Flags

None. No network, auth, file-access or schema surface was added.

## Issues Encountered

- Running `docker compose run --rm lint` while the full `test` run was in progress failed with ENOENT on `src/sim/__purity_ok_sort_cmp.ts`: the purity guard test writes a temporary file under `src/sim/` and eslint globbed it. Re-running lint with no test running passed. Not a code issue; do not run lint and test concurrently in one worktree.

## Self-Check: PASSED

- Created files exist: `tests/helpers/write-inert-epochs-golden.ts`, `tests/golden/world/inert-lave-epochs-1-20.json`, `tests/golden/world/inert-records-nine.json`, `tests/sim/world/inert-isolation.test.ts` (all committed).
- Commits `411f7e00`, `9f8ca89a`, `9636bb11` are on the branch; `git show --stat 411f7e00` lists no `src/` file.
- The epoch golden and `inert-lave-epoch1.json` are unchanged from Task 1 to the final commit.

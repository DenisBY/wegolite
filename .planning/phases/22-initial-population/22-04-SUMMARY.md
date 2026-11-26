---
phase: 22-initial-population
plan: 04
subsystem: sim-world
tags: [neighbourhood, populator, bottleneck, systemsInRange, totality, WORLD-08]

requires:
  - phase: 22-initial-population
    provides: "plan 22-02: neighbourhood-all.json (2,048 systems), the 66 system fixtures, the compact fixture codec"
provides:
  - "src/sim/world/neighbourhood.ts: buildNeighbourhood, systemsInRange, isBottleneck, NEIGHBOUR_RANGE_LY (7), VERY_NEAR_RANGE_LY (3.5), LONG_COURIER_RANGE_LY (25), the types NeighbourSystem, Neighbour, Neighbourhood"
  - "tests/sim/world/neighbourhood.test.ts: the all-2,048 table equality, the per-fixture input equality, the boundary and empty cases, the totality property"
affects: [22-06, 22-13, 22-14]

actuals:
  tokens: 6400
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A pure fact module over the galaxy list: records are cleaned (non-object, bad index, non-integer or non-finite chart coordinate, duplicate index) before any chartDistance call, so the RangeError is unreachable; the input type is `readonly unknown[]` so the cleaning is not dead code to the type checker"
    - "The oracle table is compared field by field and every mismatch is collected with its system id and field name before the one expect"

key-files:
  created:
    - src/sim/world/neighbourhood.ts
    - tests/sim/world/neighbourhood.test.ts
  modified: []

key-decisions:
  - "`seconds` and `veryseconds` are lists of neighbours, not counts: the very-local pirate raid rate (oolite-populator.js:414-428) reads each second's `government`, and the bottleneck test reads the ids"
  - "buildNeighbourhood and systemsInRange take `readonly unknown[]`, so a content `System[]` passes and a malformed list is a handled case, not a cast"

requirements-completed: [WORLD-08]

plan_head_before: 4eebadfbf75771afb32280badeca367c72fd7ae8
plan_head_after: 8333d5ed97cb9847c14a3e1b6625e029d9bd582e (task commits; the SUMMARY commit follows)

duration: 55min
completed: 2026-11-26
status: complete
---

# Phase 22 Plan 04: The neighbourhood facts Summary

**A pure, total `buildNeighbourhood(galaxy, systemIndex)` returns the 7 LY and 3.5 LY neighbours (with their own neighbour lists), the 25 LY range query, `distanceTo` and Oolite's bottleneck value, and it equals the table recorded from Oolite's own script for all 2,048 systems and the inputs of all 66 recorded population fixtures.**

## Accomplishments

- `src/sim/world/neighbourhood.ts`: `systemsInRange` is `oolite-global-prefix.js:80-91` over `chartDistance` (the only distance source), with Oolite's own double comparison `0.4 * dist <= range`, ascending system index, the current system excluded. `isBottleneck` is `_systemIsBottleneck` (`oolite-populator.js:2542-2583`) ported as written: the connected set is seeded with `locals[0]`, grown while it grows in the script's loop order, `true` when it ends smaller than `locals`, `false` for empty locals. `buildNeighbourhood` returns a frozen `{ locals, seconds, verylocals, veryseconds, bottleneck, inRange(rangeLy), distanceTo(index) }`.
- Total by construction (T-22-04): a malformed record is dropped before any distance is taken (non-object, `systemIndex` not an integer in 0..255, `chartX`/`chartY` not an integer, a later duplicate index); an unknown or out-of-range current system gives empty lists, `bottleneck` false and `distanceTo` undefined; a non-finite range gives an empty list.
- The module imports nothing from `src/content` and has no `Math.hypot`, `Math.random`, `for..in` or default sort.

## Does `seconds` need lists or counts?

Lists. The plan guessed counts ("the script reads `second.length` only"); that holds for the trader rates (`:308-324`, `second.length`) but not for two other reads: the bottleneck test reads each `second[k].systemID` (`:2558-2566`), and the very-local pirate raid rate reads `second[j].government` (`:414-428`). So `seconds[i]` and `veryseconds[i]` are the neighbour lists (id, government, economy, tech level), and `.length` gives the count. 22-06 reads `seconds[i].length` for the courier and smuggler rates and `veryseconds[i][j].government` for the raids. The current system is always in each local's `seconds[i]` (symmetric distance), so the length is never 0 for a local.

## Table comparison result

All 2,048 systems (g0..g7, 256 each) equal `neighbourhood-all.json` on the first run, with no change to the port and none to the table: the 7 LY ids, the 3.5 LY ids, the 25 LY count, the bottleneck flag (322 bottleneck systems in the table), and for every local and very local its own neighbour list equal to that neighbour's table row. All 66 population fixtures equal the port's locals and very locals (id, government, economy, tech level as the raw plist value, with no +1), the 25 LY count and the bottleneck. A mutation check (`connectionSet.length < locals.length - 1`) made 15 tests fail, including the all-2,048 case (restored).

## Boundaries (inclusive, as Oolite)

Synthetic two-system galaxies: chart distance 17 is within 7 LY and 18 is not; 8 is within 3.5 LY and 9 is not; 62 is within 25 LY and 63 is not. The vertical axis counts at half weight with C truncation (`dy = trunc(34 / 2) = 17` is in, 36 is out). g7-s162 Oresrati has no local and `bottleneck` false; a one-system galaxy, an empty galaxy and an unknown current system give empty lists and `bottleneck` false. A shuffled galaxy gives the same lists as the ordered one, ascending, without the current system.

## RED / GREEN

- **Task 1 (tracer), RED:** with the module moved out of the tree the test file failed to import (`Test Files 1 failed`, no tests). **GREEN** `19623fa1`: the module plus the tracer tests (Lave reproduces the recorded locals, very locals, neighbour lists, 25 LY count and bottleneck; 10 tests pass). Auto mode: the end-to-end re-run of Task 1's `<verify>` passed before expanding. The RED state was not committed on its own (a pre-commit hook would run lint over a test that cannot import); the test and the module landed in one commit.
- **Task 2** `8333d5ed`: the tests for the all-2,048 table, the 66 fixtures, the edges and the totality property were written against the finished port and passed on the first run (the table is the oracle, the port needed no change), then mutation-checked as above. 87 tests in the file.

## Gates

- `docker compose run --rm test npx vitest run tests/sim/world/neighbourhood.test.ts tests/sim/world/inert-isolation.test.ts`: 126 passed (87 + 39), repeated 12 more times without a failure; the neighbourhood file alone 30 more times without a failure (300 fast-check runs each). One earlier pair run, made while typecheck and lint of this plan were still running and the parallel executor was loading the machine, reported 1 failed of 126; it did not reproduce in 42 reruns and the failing test was not captured. Recorded here as an unexplained single failure under load.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean (one `TS2352` cast fixed before the commit of Task 2).
- `docker compose run --rm test` (full): see "Full test run" below.
- Acceptance greps: `rg -c "export function buildNeighbourhood"` = 1, `rg -c chartDistance` = 6, comment-stripped `content/|Math.hypot|Math.random` = 0 matches, `rg -c "fc\.assert"` and `neighbourhood-all` in the test are above 0. `git diff --name-only 4eebadfb..HEAD` lists only the two plan files (no fixture, no `populate.ts`, no inert golden).

## Remote frozen run (QUAL-12, `src/sim/world/` gained a file)

`~/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`: **exit 0, 88 s, snapshot 8333d5ed, 21 passed of 21** (epochs 1 to 20 each about 4.3 s, plus the pin). The new module is not imported by any runtime path yet (22-13 and 22-14 wire it), so the run could not change; it is recorded because the plan asks for it.

## Full test run

The full suite ran locally (925 s, started before the coordinator moved heavy runs to the remote machine, so it was let finish): 311 test files passed, 1 skipped; 9,952 tests passed, 15 skipped, **3 failed, all in `tools/oolite-ingest/drift.test.ts`** (180,000 ms timeouts under load from the parallel executor; a known-flake file, nothing this plan touches). The file was rerun alone on the remote test machine (`wegolite-remote-run.sh run --rm test npx vitest run tools/oolite-ingest/drift.test.ts`, snapshot 8333d5ed): exit 0, 6 of 6 passed in 116 s. The 20-seed acceptance run was also remote (above). The full suite was not rerun remotely as a whole; the local run is the full-suite evidence and its only failures are the load timeouts that the remote rerun cleared.

## Deviations from Plan

**1. [Rule 1 - Bug in the plan's premise] `seconds` are lists, not counts.** See "Does `seconds` need lists or counts?". The plan's own instruction ("keep the lists if a rate reads more than the length") was followed. `isBottleneck` takes `(locals ids, seconds id lists)` rather than a `secondsOf` accessor; the behaviour is the script's.

**2. [Rule 3] Tracer RED not committed separately** (see RED / GREEN).

Otherwise the plan was executed as written.

## Threat Flags

None. Pure arithmetic over a content list; no endpoint, auth path, file access or schema change.

## Known Stubs

None.

## Self-Check: PASSED

`src/sim/world/neighbourhood.ts` and `tests/sim/world/neighbourhood.test.ts` exist; commits 19623fa1 and 8333d5ed are ancestors of HEAD; `git diff --name-only 4eebadfb..HEAD` lists only those two files plus this SUMMARY; STATE.md and ROADMAP.md are untouched.

---
phase: quick
plan: 261117-mne
subsystem: sim/flight
tags: [mass-lock, torus, fidelity, oolite]
status: complete
requires: [261117-lka measurement]
provides: [strict station mass-lock boundary]
affects: [src/sim/flight/torus.ts massLocked]
tech-stack:
  added: []
  patterns: [exact-geometry boundary pins with the squared distance asserted first]
key-files:
  created: []
  modified:
    - src/sim/flight/torus.ts
    - src/sim/world/ship-field.ts
    - tests/sim/mass-lock.test.ts
    - tests/sim/torus.test.ts
    - CHANGELOG.md
    - FIDELITY.md
    - .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md
decisions:
  - "Station mass lock is strict `<` at 25,600 m, as Oolite's outer gate (PlayerEntity.m:2936) is for every ship; owner decision 2026-11-17"
requirements: [FLGT-04, WORLD-10]
metrics:
  duration: 3min
  completed: 2026-11-17
actuals:
  tokens: 4750
  tasks: 2
  commits: 2
commits: 2
plan_head_before: a498409f5dd3c9e4060fef874306c7a047fc7ea5
plan_head_after: f14361e
---

# Quick 261117-mne: Strict station mass-lock boundary Summary

The station's mass lock in `massLocked()` is now strict `<` at 25,600 m, matching Oolite's outer gate for every ship (`PlayerEntity.m:2936`, and a station is a ship at `StationEntity.m:573`). The change is pinned on exact station-at-origin geometry and recorded in FIDELITY.md, the measurement todo and the CHANGELOG.

## Commits

| Commit  | Message | Files |
| ------- | ------- | ----- |
| a11aa9b | fix(quick-261117-mne): make the station mass-lock boundary strict like Oolite | src/sim/flight/torus.ts, src/sim/world/ship-field.ts, tests/sim/mass-lock.test.ts, tests/sim/torus.test.ts, CHANGELOG.md |
| f14361e | docs(quick-261117-mne): record the strict station mass-lock boundary in FIDELITY.md | FIDELITY.md, .planning/todos/pending/2026-11-14-measure-oolite-reference-in-docker.md |

plan_head_before: `a498409`. plan_head_after: `f14361e`. `git diff --stat a498409 HEAD` lists exactly the seven `files_modified`. No 261117-mng commits landed in between, so none were in the synced snapshots.

## Code changes

Operator, `src/sim/flight/torus.ts:103` (line unchanged in position):
- Old: `if (stationDistanceSquared <= SCANNER_MAX_RANGE * SCANNER_MAX_RANGE) {`
- New: `if (stationDistanceSquared < SCANNER_MAX_RANGE * SCANNER_MAX_RANGE) {`

Docstring, `src/sim/flight/torus.ts:94`:
- Old: ` * - Station: within 25,600 m of the centre (`<=`, so the boundary itself locks).`
- New: ` * - Station: strictly inside 25,600 m of the centre (`<`, PlayerEntity.m:2936).`

Header, `src/sim/world/ship-field.ts:19-20` (line 18 kept):
- Old: ` * lock. The station keeps its own inclusive `<=` in `torus.ts`; the two rules` / ` * are deliberately different, as they are in Oolite.`
- New: ` * lock. A station is a ship too (StationEntity.m:573), so the same strict gate` / ` * decides for it, and the station rule in `torus.ts` is `<` as well.`

Both files keep their line counts (numstat 2/2 each), so the FIDELITY.md anchors `torus.ts:99`, `torus.ts:103`, `ship-field.ts:82` and `ship-field.ts:93-94` still point at the same code.

## Test pins

In both `tests/sim/mass-lock.test.ts` (`describe("station boundary")`) and `tests/sim/torus.test.ts` (`describe("mass lock boundaries")`):
- Lave geometry (kept, renamed): 25,599 m locked, 25,601 m clear, on `station - stationToPlanet * d`. The old `[25_600, true]` entry is dropped because that path does not guarantee an exact squared distance.
- Exact geometry (new): station at the origin, every other body at `vec(1e9, 0, 0)`; asserts `lengthSquared(sub(vec(25_600, 0, 0), station)) === 655_360_000` first, then 25,599 locked, 25,599.999 locked, 25,600 clear, 25,601 clear. mass-lock.test.ts uses the existing `isolated()` helper; torus.test.ts builds the layout inline.
- The mass-lock.test.ts header now states the station rule as `d^2 < 25,600^2`, strict like every ship.

RED argument: the boundary point's squared distance is asserted to be exactly 655,360,000, so the old `<=` returns true there and the 25,600 clear pin fails against it. No separate remote RED run was made (the wrapper syncs committed HEAD only, and the plan commits test and operator together).

## Gate runs (remote test machine, wegolite-remote-run.sh)

Each run started after `pgrep -af wegolite-remote-run.sh` showed no other wrapper run.

| Gate | Command | Exit | Elapsed | Snapshot | Result |
| ---- | ------- | ---- | ------- | -------- | ------ |
| Targeted (tracer) | `run --rm test npx vitest run tests/sim/mass-lock.test.ts tests/sim/torus.test.ts tests/sim/world/ship-field.test.ts` | 0 | 6 s | a11aa9b | 3 files, 60 tests passed |
| test | `run --rm test` | 0 | 69 s | f14361e | 218 files; 5,609 passed, 10 skipped |
| lint | `run --rm lint` | 0 | 28 s | f14361e | eslint clean; Prettier clean |
| typecheck | `run --rm typecheck` | 0 | 10 s | f14361e | both tsconfigs clean |

No `verify`, `verify-full` or `e2e` was run (SB-6).

## SB-4 proof and NPC acceptance

`git diff -U0 a498409 HEAD -- src/sim/world/ship-field.ts` has no non-comment line (every changed line starts with ` *`), with 2 added and 2 deleted. The planet and sun rules, `ship-field.ts:93-94`, `src/sim/hyperspace/countdown.ts` and `src/sim/combat/ident.ts` are untouched. No code under `src/sim/npc/**` or `src/sim/world/**` changed, so the 20-seed NPC acceptance run was not due and was not run.

## Documentation

- FIDELITY.md: the 261117-lka station ledger line now records Wegolite at 42c4394 as locked, LOCKED, unlocked and the fix in 261117-mne (now locked, unlocked, unlocked, SAME). The E-07 station-branch bullet says the check is strict `<` since 261117-mne. The Open items bullet is retitled "Station mass-lock boundary (resolved in quick task 261117-mne)" and rewritten as a resolved record. No remaining sentence says Wegolite's station rule is inclusive or waits for the owner.
- Measurement todo: the mass-lock bullet records the fix; the "Waiting for the owner" sentence is replaced. The todo stays in `pending/`.
- CHANGELOG.md: new `### Fixed` group under `[Unreleased]`.

## Deviations from Plan

None. The plan was executed as written.

## Known Stubs

None.

## Self-Check: PASSED

- All seven modified files exist; commits a11aa9b and f14361e are ancestors of HEAD.

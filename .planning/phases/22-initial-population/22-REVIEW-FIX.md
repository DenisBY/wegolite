---
phase: 22-initial-population
fixed_at: 2026-11-26T22:00:00Z
review_path: .planning/phases/22-initial-population/22-REVIEW.md
iteration: 2
findings_in_scope: 7
fixed: 6
skipped: 1
status: partial
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-11-26
**Source review:** .planning/phases/22-initial-population/22-REVIEW.md
**Iteration:** 2

**Summary:**
- Findings in scope: 7 (WR-01, WR-02, IN-01 to IN-05; `fix_scope` is `all`)
- Fixed: 6 (WR-01 and WR-02 in iteration 1, IN-01 to IN-04 in this iteration, IN-05 in part)
- Skipped: 1 (IN-05, the removal; its comment gap was fixed)

IN-04 and IN-05 carry the `necessity` category. Per the project's deferred-work rule nothing the review marked as a planned consumer was deleted.

## Fixed Issues

### WR-01: `buildNeighbourhood` can throw for extreme integer chart coordinates, though the arrival install block relies on it being total

**Files modified:** `src/sim/world/neighbourhood.ts`, `src/content/schemas/system.ts`, `tests/sim/world/neighbourhood.test.ts`
**Commit:** e632100f
**Status:** fixed: requires human verification (a condition change, the logic is checked by tests but not by a human)
**Applied fix:** `isChartCoordinate` now also requires `0 <= value <= 255` (Oolite's chart byte range), so a record with `chartX` of 9e15 or 1e300 is dropped before any `chartDistance` call. The `SystemSchema` `chartX` and `chartY` got `.min(0).max(255)`. Shipped content spans exactly 0..255 on all 2,048 systems, and `assets:check` reports no differences. Two tests were added: a deterministic one for the extreme values (9e15, -9e15, 1e300, -1e300, 256, -1, MAX_VALUE on either axis) and a fast-check property over ±2^53 integers, ±9e15, 1e300, NaN, Infinity and arbitrary doubles paired with two valid records. Both fail without the fix (checked by stashing `neighbourhood.ts`) and pass with it. Two existing bottleneck fixtures used negative `chartX` (-16, -8); they were translated by +16 (distances are translation invariant), with the same assertions.

### WR-02: The per-entry / per-group / per-site RNG stream design (assumption A8) is a divergence with no `FIDELITY.md` row

**Files modified:** `FIDELITY.md`
**Commit:** c687f27f
**Applied fix:** Added a Mechanics row after the last population row, with Wegolite cell `src/sim/world/population/streams.ts:73` (`countDraws`), Oolite cell `Resources/Scripts/oolite-populator.js:661-674` and excerpt E-212 (the two freighter `setPopulator` entries whose `groupCount: randomise(...)` draws come from the one global `Math.random` stream in script order). The Fidelity cell is a divergence that quotes the Key Decisions row "Initial population port (WORLD-08, Phase 22)". E-212 is the next free number and carries the `<!-- prettier-ignore -->` line before its `js` fence. The contract test `tests/contract/fidelity.test.ts` passes without `OOLITE_SRC` (9 passed, 1 skipped) and with it, against the pinned tree 7437f22 (10 passed). Prettier needed no change.

### IN-01: Stale contracts and comments still describe the inert populator

**Files modified:** `src/app/session/world-lifecycle.ts`, `src/app/session/hyperspace-controller.ts`, `src/sim/world/population/groups.ts`
**Commit:** 72fbc412
**Applied fix:** Comments only. Rule (ii) of the world lifecycle now names both populators the session and the Node replay install (`createSystemPopulate` and the frozen `createInertPopulate`) and why each is total. Rule (iii) now says the post-populate counter is `101` plus the ships placed: 12 (anchor 113) for the inert populator, variable for the system populator (28 ships for Lave at epoch 1, anchor 129; the 28 is the committed census golden token for `g0-s7`). The install-block comment in `hyperspace-controller.ts` names `createSystemPopulate`. The `PopulationRecord` `fuel` comment now says the catalogue value is already in tenths (70 for 7 LY) and is not scaled again.

### IN-02: Names and duplicated total-read helpers

**Files modified:** `src/sim/world/population/reads.ts` (new), `src/sim/world/population/plan.ts`, `src/sim/world/population/kit.ts`, `src/sim/world/population/traders.ts`, `src/sim/world/population/pirates.ts`
**Commit:** 369da2bc
**Applied fix:** A pure refactor. `plan.ts` carried `read`, `num` and `list`, identical to `readField`, `numberOf` and `listOf` in `kit.ts`. Importing them from `kit.ts` would have pulled `populate.ts` and `world.ts` into the planner's runtime graph, so the three helpers now live in a new import-free module `population/reads.ts`. `plan.ts` imports them from there, and `kit.ts` imports and re-exports them, so every existing importer (`escorts.ts`, `traders.ts`, `police.ts`, `pirates.ts`, test helpers) is unchanged. `plan.ts` keeps its own `finiteOrZero`, which has no twin. The `kit.ts` closure builder `chartDistance(facts)` was renamed `homeDistanceOf(facts)`, with the callers in `traders.ts` and `pirates.ts` updated (no other `src/` or test file used it). No import cycle was created and no frozen path was touched. The 12 population test files (1,860 tests) pass; no golden moved.

### IN-03: Latent galaxy mismatch between the arrival system and the neighbourhood list

**Files modified:** `src/app/session/traffic.ts`, `tests/app/session/traffic.test.ts`
**Commit:** ed06d075
**Status:** fixed: requires human verification (a new filtering condition on a path unreachable in v2.4)
**Applied fix:** `createSystemPopulate` now passes the galaxy list through `sameGalaxyOnly(list, arrival.galaxy)` before `buildNeighbourhood`. A record whose numeric `galaxy` differs from the arrival's is dropped; a record without a numeric `galaxy` is kept, so malformed or hand-made entries still go through `buildNeighbourhood`'s own rules, and the closure stays total (rule ii). A galaxy-0 list given to a galaxy-1 arrival now yields an empty neighbourhood instead of the galaxy-0 neighbours of the same index. Shipped behaviour is unchanged (galaxy 0 only). The tripwire is the new test "takes no neighbours from a list of another galaxy than the arrival's (IN-03 tripwire)" in `tests/app/session/traffic.test.ts`: a galaxy-1 arrival with the galaxy-0 list equals the same arrival with an empty list, differs from the galaxy-0 arrival's population, and a matching galaxy-1 list is still used. It fails when `traffic.ts` is stashed (checked) and passes with the fix. The galactic-drive work still has to pass a per-galaxy list; this guard keeps a missing one from being silent.

### IN-04: Impossible-state guards in the spawn path

**Files modified:** `src/sim/world/population/spawn.ts`, `tests/sim/world/population/spawn.test.ts`
**Commit:** f3cab060
**Status:** fixed in part (the clamp); the rollback branch is kept on purpose
**Applied fix:** `cargoKind: Math.max(0, CARGO_KINDS.indexOf(ship.cargoKind))` is now `CARGO_KINDS.indexOf(ship.cargoKind)`. An unknown kind becomes -1, which `spawnEntity` already refuses as out of domain (`world.ts:698-699`), so `trialSpawns` skips the whole group and counts it in `skippedGroups`. I chose that over the review's thrown `RangeError` because rule (ii) of the world lifecycle forbids a throw inside the arrival's install block, and a skipped, counted group is the module's existing response to malformed input. No test or totality property relied on the clamp (the 12 population test files, the traffic test and the guards pass). A new test, "an unknown cargo kind ... skips the group instead of masking the kind as unset", corrupts one planned group's kind and expects `skippedGroups` of 1 and no ship from that group; it fails with the clamp restored (checked) and passes now.
**Not changed:** the `if (refused)` rollback after the trial spawn. It is part of the atomicity mitigation (T-22-15), the review itself says it is unreachable only given the `fits` and `trialSpawns` checks, and removing a defence that cannot be shown dead by a test is not a pure cleanup. The review's fix allows "keep them as documented invariants", which the existing "Unreachable after the trial spawn" comment already is.

## Skipped Issues

### IN-05: Station-launch and repopulator branches with no caller

**File:** `src/sim/world/population/traders.ts:114-119,267-271,297-301,334-336`, `src/sim/world/population/kit.ts:303-313,512-517`, `src/app/session/traffic.ts:441-452`
**Reason:** skipped as a removal, by the owner brief and on the evidence; comments added (commit 402e45f6).
- The `arriving: false` branches of the freighter, courier and smuggler builders, and `STATION_LAUNCH_FUEL`, are the station-launch seam that Phase 26 (repopulation) takes; `traders.ts`, `groups.ts` and the options type already say so ("kept for Phase 26", D-01).
- `setReturnFuel` is called upstream only by the returning leg of `_addPiratePack` (`oolite-populator.js:1839`, the repopulator, Phase 26) and by `_addHunterPack` (`:1648`, hunters are cut). It is covered by `kit.test.ts`. Its doc comment named no consumer, so it now does.
- `roleExists` is not dead code: `traders.ts:208` and `pirates.ts:242,338` call it. Only its `false` branch is unreachable with the shipped catalogue, which its comment already says, and the port is as written.
- `createInertPopulate` has no `src/` caller, but `laveInertWorld` builds the epoch 1-20 pin and the 20-seed acceptance run (`tests/acceptance/detectors.ts`) through it, and both are frozen. Its doc comment now says so.
**Original issue:** Paths with one instantiation (none today) are kept for later phases; the rubric calls it judgment.

**Comment-only commit:** 402e45f6 (`src/sim/world/population/kit.ts`, `src/app/session/traffic.ts`). It is counted under Skipped because no code was removed; no guard test was added since each kept path has a named, planned or frozen consumer.

## Verification

Gates ran in the main checkout (branch main) and on the remote test machine's synced copy of the committed HEAD 402e45f6, not in a worktree: the caller directed work on the main tree (`use_worktrees` is true in config, so no worktree was created).

- Local (Docker): `lint` (eslint and prettier) and `typecheck` clean after each commit; targeted Vitest on `tests/sim/world/population`, `tests/sim/world/neighbourhood.test.ts`, `tests/oracles/population`, `tests/app/session/traffic.test.ts` and `tests/guards` pass.
- Remote machine, snapshot 402e45f6 (HEAD): full Vitest suite 322 files passed, 1 skipped; 10,457 tests passed, 16 skipped; exit 0 (the two extra tests over iteration 1 are the IN-03 and IN-04 tests). No twin hash, golden or census value moved.
- Remote 20-seed acceptance run (`npm run test:acceptance`, thresholds and detectors untouched): 21 tests passed, exit 0. It was run because `spawn.ts` (`src/sim/world`) changed.
- Remote `verify` (the fast gate, run because `src/app/session/traffic.ts` and comments in two other `src/app/` files changed), snapshot 402e45f6: exit 0 after 478 s (its unit stage: 322 files passed, 1 skipped; 10,457 tests passed, 16 skipped).

## Notes

- No CHANGELOG entry: none of the changes is user-visible (comments, a rename and refactor, a guard on an unreachable path).
- Not touched: STATE.md, ROADMAP.md, the uncommitted `.planning` edits or the phase 22.1 directory.

---

_Fixed: 2026-11-26_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_

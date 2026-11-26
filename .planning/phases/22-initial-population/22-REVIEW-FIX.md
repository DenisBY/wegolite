---
phase: 22-initial-population
fixed_at: 2026-11-26T21:20:00Z
review_path: .planning/phases/22-initial-population/22-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 22: Code Review Fix Report

**Fixed at:** 2026-11-26
**Source review:** .planning/phases/22-initial-population/22-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (WR-01, WR-02; IN-01 to IN-05 out of scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `buildNeighbourhood` can throw for extreme integer chart coordinates

**Files modified:** `src/sim/world/neighbourhood.ts`, `src/content/schemas/system.ts`, `tests/sim/world/neighbourhood.test.ts`
**Commit:** e632100f
**Status:** fixed: requires human verification (a condition change, the logic is checked by tests but not by a human)
**Applied fix:** `isChartCoordinate` now also requires `0 <= value <= 255` (Oolite's chart byte range), so a record with `chartX` of 9e15 or 1e300 is dropped before any `chartDistance` call. The `SystemSchema` `chartX` and `chartY` got `.min(0).max(255)`. Shipped content spans exactly 0..255 on all 2,048 systems, and `assets:check` reports no differences. Two tests were added: a deterministic one for the extreme values (9e15, -9e15, 1e300, -1e300, 256, -1, MAX_VALUE on either axis) and a fast-check property over ±2^53 integers, ±9e15, 1e300, NaN, Infinity and arbitrary doubles paired with two valid records. Both fail without the fix (checked by stashing `neighbourhood.ts`) and pass with it. Two existing bottleneck fixtures used negative `chartX` (-16, -8); they were translated by +16 (distances are translation invariant), with the same assertions.

### WR-02: Forked RNG streams (assumption A8) had no `FIDELITY.md` row

**Files modified:** `FIDELITY.md`
**Commit:** c687f27f
**Applied fix:** Added a Mechanics row after the last population row, with Wegolite cell `src/sim/world/population/streams.ts:73` (`countDraws`), Oolite cell `Resources/Scripts/oolite-populator.js:661-674` and excerpt E-212 (the two freighter `setPopulator` entries whose `groupCount: randomise(...)` draws come from the one global `Math.random` stream in script order). The Fidelity cell is a divergence that quotes the Key Decisions row "Initial population port (WORLD-08, Phase 22)". E-212 is the next free number and carries the `<!-- prettier-ignore -->` line before its `js` fence. The contract test `tests/contract/fidelity.test.ts` passes without `OOLITE_SRC` (9 passed, 1 skipped) and with it, against the pinned tree 7437f22 (10 passed). Prettier needed no change.

## Verification

- Local (Docker): `neighbourhood.test.ts`, `tests/content`, content-boundary guard and ingest `systems.test.ts` pass; `lint`, `typecheck` and `assets:check` clean.
- Remote machine, snapshot c687f27f (HEAD): full Vitest suite 322 files passed, 1 skipped; 10,455 tests passed, 16 skipped; exit 0. No twin hash, golden or census value moved.
- Remote 20-seed acceptance run (`npm run test:acceptance`, thresholds and detectors untouched): 21 tests passed (epochs 1 to 20 each pass), exit 0.
- These gates ran in the main checkout and on the remote machine's synced copy of the committed HEAD, not in a worktree (`use_worktrees` is true in config, but the caller directed work on the main tree, branch main, so no worktree was created).

## Notes

- No CHANGELOG entry: neither change is user-visible.
- Not touched: STATE.md, ROADMAP.md, IN-01 to IN-05.

---

_Fixed: 2026-11-26_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

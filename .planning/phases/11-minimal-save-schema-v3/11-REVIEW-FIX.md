---
phase: 11-minimal-save-schema-v3
fixed_at: 2026-11-14T00:00:00Z
review_path: .planning/phases/11-minimal-save-schema-v3/11-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 11: Code Review Fix Report

**Fixed at:** 2026-11-14
**Source review:** .planning/phases/11-minimal-save-schema-v3/11-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2 (critical_warning; IN-01 to IN-04 are out of scope)
- Fixed: 2
- Skipped: 0

## Fixed Issues

### WR-01: `begin` can bump the epoch to 0xffffffff, a value the v3 writer then refuses forever

**Files modified:** `src/app/session/world-lifecycle.ts`, `tests/app/session/world-lifecycle.test.ts`
**Commit:** 4e93fa0
**Status:** fixed: requires human verification (logic bound change)
**Applied fix:** Fix option 1 (matches D-04). `begin` now refuses when `epoch >= MAX_LIVE_EPOCH` (`MAX_EPOCH - 1` = 0xfffffffe), so a live epoch never exceeds the largest epoch a v3 save can carry. `resume` and `resetForRestore` are unchanged. The two saturation tests now use `MAX_SAVE_EPOCH` (last legal begin goes from `MAX_SAVE_EPOCH - 1` to `MAX_SAVE_EPOCH`; the next one changes nothing). Added a test that `begin` from `resetForRestore(MAX_SAVE_EPOCH)` refuses and leaves the epoch writable.

### WR-02: Cold Continue's epoch re-anchor has no behavioural test; the test replicates the sequence and pins source text

**Files modified:** `src/app/session/world-lifecycle.ts`, `src/app/session/save-controller.ts`, `src/app/session/start-session.ts`, `tests/app/session/world-lifecycle.test.ts`
**Commit:** 6728aa6
**Status:** fixed: requires human verification (restore ordering refactor)
**Applied fix:** Took the reviewer's alternative (extract a pure function) rather than a new browser spec. Added `restoreWorldAnchor(lifecycle, savedEpoch, marketSeed, inFlight)` in `world-lifecycle.ts` (epoch reset, then an in-flight resume without a bump; no-op for an absent lifecycle). The warm Load (`save-controller.ts`) and the cold Continue (`start-session.ts`) both call it in the same position as before, after the market-seed install. The test `coldContinue` helper now calls the real function instead of a copy of the sequence, a new unit test covers docked, in-flight, missing-seed and absent-lifecycle cases, and the start-session source-text test now pins only the wiring (one `restoreWorldAnchor(` call carrying `restore.epoch` and `restoredInFlight`, no direct `resetForRestore`/`resume` left). No browser spec with a non-zero epoch fixture was added; the in-flight Continue is still covered by the existing save-load specs at epoch 0.

## Verification

Run in the main checkout (the project's `workflow.use_worktrees` is `false`, so no worktree was created), inside the Docker containers: `docker compose run --rm test` (full Vitest suite, exit 0), `docker compose run --rm lint` (eslint and prettier clean), `docker compose run --rm typecheck` (both tsconfigs clean). No browser gate was run; both changes are session logic, not render, input or persistence code.

---

_Fixed: 2026-11-14_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_

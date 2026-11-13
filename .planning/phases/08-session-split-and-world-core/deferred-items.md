# Phase 8 deferred items

Out-of-scope discoveries logged during execution (not fixed by the plan that found them).

## D-1: two stale docked-home assertions fail on the phase base (found by plan 08-01)

- **Found during:** 08-01 Task 2, the verify-full baseline on a detached worktree of 5b189e4.
- **Failures (deterministic, reproduced on main HEAD 9f2083c):**
  - `tests/e2e/scene.spec.ts:111` "the docked view is exactly one status panel with the D-09 facts" expects `Market (F8)`, `Outfitting (F3)`, `Status (F5)` in `#docked`.
  - `tests/e2e/docking.spec.ts:371` "the docked home shows real credits, ship, fuel and the four screen entries" expects `Market [F8]`, `Outfitting [F3]`, `Status [F5]` in `#docked`.
- **Cause:** commit 46c9305 ("redesign docked home screen with Variant 1B berth and arrival report", 2026-11-11) renders the station nav as `F8 Market`, `F3 Outfitting`, `F5 Status`; the two specs were not updated. It is a test-side stale assertion, not a runtime regression: the panel renders Lave, 100.0 Cr, Cobra Mk III and 7.0 LY correctly.
- **Impact:** `docker compose run --rm verify` (the fast gate runs scene.spec.ts and docking.spec.ts) and `verify-full` are red on the phase base, independent of every Phase 8 change. The seams e2e stage of verify-full is never reached because the chain stops at the Chromium stage.
- **Not touched by 08-01:** neither spec is in this plan's `files_modified`, and the scope boundary forbids fixing a pre-existing failure in an unrelated file. A fix is a test-only edit (update the expected labels) and should land before split step 1 so every later gate can be read as green or red on its own merits.

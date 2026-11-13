---
phase: 06-hyperspace-navigation-persistence
plan: 09
subsystem: ui
tags: [save-load, overwrite-dialog, input-bindings, focus, gap-closure, f2]

# Dependency graph
requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: F2 Save/Load screen, overwrite confirmation and the one-slot manual Save (06-05)
provides:
  - SaveLoadScreen.isConfirming() as the single owner of the overwrite dialog state
  - One resolveConfirm path for mouse Cancel, mouse Accept, Enter and Y, which hides the dialog and restores focus before any handler runs
  - onOverwriteCancelled, acceptOverwrite and confirmFocused on SaveLoadScreen
  - saveScreenActivate action on Enter (focus-following); saveScreenConfirm is Y only
  - Browser proof of mouse Cancel, mouse Accept and Enter on focused Cancel in tests/e2e/save-load.spec.ts
affects: [06-10, 06-11, 06-12, verify-work]

# Actuals (#2632) - chars/4 over the realized diff, same scale as the plan estimate
actuals:
  tokens: 4776
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "One owner for a modal's open state: the screen reports isConfirming() and the session reads it instead of keeping a second flag"
    - "Focus-following activation: Enter resolves the focused control, while Y is a direct confirm that ignores focus"
    - "Persisted binding maps can carry a retired code; ACTION_IDS order decides which action keeps a shared key"

key-files:
  created: []
  modified:
    - src/ui/save-load.ts
    - src/app/game-session.ts
    - src/input/actions.ts
    - tests/input/bindings.test.ts
    - tests/e2e/save-load.spec.ts

key-decisions:
  - "SaveLoadScreen.isConfirming() is the only record of whether the overwrite dialog is open; the session's overwritePending flag is removed"
  - "Mouse Cancel and Accept both resolve through one resolveConfirm that hides the dialog and restores focus to the Save/Load section before invoking the handler"
  - "Enter maps to saveScreenActivate and follows the focused control (Cancel cancels, Accept confirms); Y maps to saveScreenConfirm and confirms regardless of focus"
  - "saveScreenActivate is ordered before saveScreenConfirm in ACTION_IDS so a persisted Enter on the old confirm binding cannot take Enter from the focus-following action"
  - "While the overwrite dialog is open, Up/Down/Save/Load and row clicks are inert; only Accept, Cancel, Return and Y/N resolve it"

patterns-established:
  - "Modal close path: hide, clear text, restore focus, then invoke the resolution handler"
  - "Browser proofs of a destructive confirm check the committed revision and the raw bytes, not only the dialog's visibility"

requirements-completed: [SAVE-05]

coverage:
  - id: D1
    description: "Mouse Cancel closes the overwrite dialog without writing, and the next Save asks again instead of silently doing nothing"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#the overwrite dialog: mouse Cancel, mouse Accept and Enter on Cancel each resolve once (G-3)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Mouse Accept writes exactly one new revision and leaves focus inside the Save/Load section"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#the overwrite dialog: mouse Cancel, mouse Accept and Enter on Cancel each resolve once (G-3)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Enter on the focused Cancel cancels the overwrite; the bytes and committed revision are unchanged, and Y still confirms"
    requirement: "SAVE-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts#the overwrite dialog: mouse Cancel, mouse Accept and Enter on Cancel each resolve once (G-3)"
        status: pass
      - kind: unit
        ref: "tests/input/bindings.test.ts#save screen bindings"
        status: pass
    human_judgment: false
  - id: D4
    description: "Enter and Y resolve to separate actions; a persisted Enter on the old confirm binding cannot take Enter from saveScreenActivate"
    requirement: "SAVE-05"
    verification:
      - kind: unit
        ref: "tests/input/bindings.test.ts#keeps Enter on saveScreenActivate when old settings still bind Enter to confirm"
        status: pass
    human_judgment: false

# Metrics
duration: approx. 30 min (not timed; the full verify gate alone took 14.1 min)
completed: 2026-11-07
status: complete
---

# Phase 6 Plan 09: Overwrite dialog owns its confirmation (G-3) Summary

**The F2 overwrite dialog has one owner: mouse Cancel no longer disables Save, mouse Accept restores focus, and Enter on a focused Cancel cannot overwrite the only save.**

## Performance

- **Duration:** approx. 30 min (not timed; the full verify gate alone took 14.1 min)
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Mouse Cancel closes the overwrite dialog through the same path as every other resolution, so the next Save asks again instead of silently returning.
- Mouse Accept writes exactly one revision and leaves focus on the Save/Load section rather than on `BODY`.
- Enter follows the focused control: on Cancel it cancels, on Accept it confirms. Y is the direct confirm and ignores focus.
- While the dialog is open, Up/Down/Save/Load and row clicks are inert, so nothing behind the dialog can act on the save.
- Browser proof covers mouse Cancel then Save, mouse Accept, and Enter on focused Cancel, asserting the committed revision and raw bytes, not just the dialog's visibility.

## Task Commits

1. **Task 1: Make the screen own the confirmation state and route the session through it** - `6693c7b` (fix)
2. **Task 2: Split Enter activation from Y confirmation** - `893ff47` (fix)
3. **Task 3: Add the mouse-Cancel, mouse-Accept and Enter-on-Cancel browser cases** - `e8eb787` (test)

## Files Created/Modified

- `src/ui/save-load.ts` - One `resolveConfirm`/`closeConfirm` path; `acceptOverwrite`, `confirmFocused`, `onOverwriteCancelled`; row clicks gated while confirming; key hint copy updated.
- `src/app/game-session.ts` - `overwritePending` removed; `manualSave` reads `isConfirming()`; `saveScreenActivate` case; Up/Down/Save/Load gated while confirming; cancel callback wired to the probe.
- `src/input/actions.ts` - `saveScreenActivate` (Enter, saveScreen context, ordered before `saveScreenConfirm`); `saveScreenConfirm` is `KeyY` only.
- `tests/input/bindings.test.ts` - Pins both ids, the saveScreen context, the Enter/Y dispatch split, and the persisted-settings case.
- `tests/e2e/save-load.spec.ts` - New G-3 case covering mouse Cancel, mouse Accept and Enter on focused Cancel, plus Y confirm.

## Decisions Made

- `SaveLoadScreen.isConfirming()` is the only record of the dialog's open state; the session's duplicate flag is removed.
- Enter is focus-following (`saveScreenActivate`); Y is the direct confirm (`saveScreenConfirm`). Both are in `ACTION_IDS` with Activate before Confirm.
- Row clicks behind the open dialog are inert, matching the keyboard rule.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Row clicks behind the open dialog**
- **Found during:** Task 1
- **Issue:** The plan made Up/Down/Save/Load inert for keyboard actions only. A mouse click on the Load row while the dialog was open would still run `loadFromSave`, which is a bypass of the dialog's ownership.
- **Fix:** The overlay click handler returns early while `confirming` is true.
- **Files modified:** `src/ui/save-load.ts`
- **Verification:** Typecheck and the unit suites pass; the browser spec's mouse paths resolve the dialog without row interference.
- **Committed in:** `6693c7b`

**2. [Rule 2 - Missing Critical] Persisted settings could re-bind Enter to confirm**
- **Found during:** Task 2
- **Issue:** Settings persist the full binding map. A player who saved bindings before this change carries `saveScreenConfirm: ["Enter", "KeyY"]`. With the new action added later in `ACTION_IDS`, Enter would still reach the blind confirm path and reintroduce G-3 for that player.
- **Fix:** `saveScreenActivate` is ordered before `saveScreenConfirm`, so the existing conflict rule in `createBindingMap` drops Enter from the confirm binding. A unit test pins this.
- **Files modified:** `src/input/actions.ts`, `tests/input/bindings.test.ts`
- **Verification:** `tests/input/bindings.test.ts` (42 tests) passes.
- **Committed in:** `893ff47`

**3. [Rule 1 - Bug] Prettier formatting on the new spec block**
- **Found during:** Lint, after Task 3
- **Issue:** `prettier --check` flagged one line-wrap in the new browser case.
- **Fix:** `prettier --write` on that one file; the diff is whitespace-only (`diff -w` is empty).
- **Files modified:** `tests/e2e/save-load.spec.ts`
- **Committed in:** `e8eb787`

**Total deviations:** 3 auto-fixed (2 missing critical, 1 formatting). **Impact:** None on scope; the two Rule 2 items close dialog bypasses the plan's own threat model (T-06-28, T-06-27) on paths the plan did not name.

## Copy change not named in the plan

- The key hint line changed from "Enter/Y confirm" to "Enter activate · Y confirm". Enter on a focused Cancel now cancels, so the old text misdescribed the dialog. No test asserted the old string.

## Issues Encountered

- Nothing blocking. Enter on a focused button does not also fire a native click: the keyboard layer calls `preventDefault()` on any bound key in the active context, so the queued action is the only resolution. This is why the Enter path does not double-resolve.

## Known Stubs

None.

## Threat Flags

None. No new network, auth, or file-access surface.

## Self-Check: PASSED

- Commits exist: `6693c7b`, `893ff47`, `e8eb787` (checked with `git merge-base --is-ancestor` below).
- Gap G-3 closed: mouse Cancel no longer disables Save, mouse Accept restores focus, Enter on Cancel cannot overwrite. Verified by the browser proof and the unit bindings suite.
- SAVE-05 items from the plan's assumptions:
  - Idempotency (one revision per accepted request): the browser case asserts exactly one committed increment per accepted Save; the dialog gates repeated Save while open.
  - Concurrency: a mouse Cancel and a keyboard Save are serialized by the synchronous `isConfirming()` state and the existing `manualSavePending` guard. This is proven for the serialized inputs the browser test drives, not for truly parallel input (none exists in a single-threaded page).

## Verification Results

- `docker compose run --rm typecheck`: exit 0 (after each task).
- `docker compose run --rm test npx vitest run tests/input/bindings.test.ts tests/persistence/autosave.test.ts`: 2 files, 62 tests passed.
- `docker compose run --rm test`: 88 files, 1089 tests passed.
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/save-load.spec.ts"`: 8 passed, including the new G-3 case.
- `docker compose run --rm lint`: exit 0 (after the Prettier fix).
- `docker compose run --rm verify` (full gate): exit 0; 88 unit files, 74 Playwright tests passed.

## Not done in this plan

- `.planning/PROJECT.md` has no decision row for the Enter/Y split and the single-owner rule. AGENTS.md asks for significant decisions to be recorded there, but the plan's `files_modified` excludes it and the sequential-run scope forbids touching it. Recorded here so the orchestrator or a follow-up can add it.
- The new browser case was not run against the pre-fix code to demonstrate it fails there. The reasoning is that the pre-fix mouse Cancel leaves the session flag set, so the next Save returns silently and the dialog never reopens; pre-fix Enter writes, which changes the committed revision. This is a reasoned claim, not a measured one.

## Next Phase Readiness

- G-3 is closed. Remaining gaps from 06-VERIFICATION.md (G-1, G-2, G-4 to G-9) belong to other plans in this gap-closure run.

---
*Phase: 06-hyperspace-navigation-persistence*
*Completed: 2026-11-07*

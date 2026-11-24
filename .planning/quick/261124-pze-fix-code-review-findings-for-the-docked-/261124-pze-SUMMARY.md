---
phase: quick
plan: 261124-pze
subsystem: input, app/session, ui, content-build, docs
tags: [docked-f-keys, key-order, save-load, fidelity, changelog]
status: complete
requires: []
provides:
  - "setQueuedEdgeFlush on the input state; createQueuedEdgeFlush in frame-loop.ts"
  - "navigateByKey inert under the overwrite question"
  - "saveScreenGeneration guard on an in-session Load"
  - "KeyModifiers.textField scope for F-keys from a text field"
affects: [src/input/keyboard.ts, src/app/session/*, src/ui/station.ts, FIDELITY.md, CHANGELOG.md]
tech-stack:
  added: []
  patterns:
    - "flush-then-re-resolve before a synchronous screen sink (bounded recursion)"
    - "generation counter across an async IndexedDB read"
key-files:
  created:
    - tests/app/session/queued-edge-flush.test.ts
  modified:
    - src/input/keyboard.ts
    - src/app/session/frame-loop.ts
    - src/app/game-session.ts
    - src/app/session/start-session.ts
    - src/app/session/station-controller.ts
    - src/app/session/save-controller.ts
    - src/app/session/context.ts
    - src/app/session/chart-controller.ts
    - src/ui/station.ts
    - tools/oolite-ingest/convert/commodities.ts
    - tests/input/station-actions.test.ts
    - tests/input/bindings.test.ts
    - tests/app/session/station-controller.test.ts
    - tests/app/session/save-controller.test.ts
    - tests/e2e/station-fkeys.spec.ts
    - FIDELITY.md
    - CHANGELOG.md
    - .planning/PROJECT.md
    - .planning/ROADMAP.md
decisions:
  - "F2 key order: a docked screen key flushes the queued screen edges first and is resolved again if the flush changed the context; frame() untouched"
  - "F1: navigateByKey returns while the overwrite question is open (faithful, FIDELITY E-189)"
  - "F6: no binding migration (alpha policy); the earlier ACTION_IDS entry keeps a shared code, pinned by a unit test"
metrics:
  completed: 2026-11-24
  tasks: 3
actuals:
  tokens: 55600
  tasks: 3
  commits: 4
plan_head_before: da57cd58739a80e3e4f52e4cdc7a7cd344c5201f
plan_head_after: 57d8b5c5a154b6486977cfe6a8d40c5228d9c558
---

# Quick 261124-pze: code review fixes for the docked F-keys Summary

Keys pressed in one frame now apply in the order they were pressed. Before a docked screen key goes to the synchronous sink, the queued screen edges are flushed first, and the key is resolved again if that flush changed the context. While the overwrite question is open, the screen keys do nothing. A stale Load is dropped through a screen-generation counter. A key from a text field can only fire the docked screen keys. The dead F2 toggle is gone, and the docs now match the shipped behaviour.

## Commits

| Task | Commit | Message |
| ---- | ------ | ------- |
| 1 | 9282131d | fix(quick-261124-pze): keep same-frame key order across a docked screen key; screen keys inert under the overwrite question |
| 2 | 146cd234 | fix(quick-261124-pze): drop the dead F2 toggle, guard a Load across a closed F2 screen, scope the text-field F-key bypass |
| 3a | 78ca563e | fix(quick-261124-pze): comment line title, resolver without the dead branch, browser proofs of key order |
| 3b | 57d8b5c5 | docs(quick-261124-pze): key order, inert keys under the overwrite question, digit aliases, v0.8.0 as the latest release |

Nothing pushed, nothing tagged.

## Findings coverage

- **F1** `navigateByKey` returns while `isConfirming()` is true. Covered by a unit case for all six actions and by the e2e step where F3 does nothing under the question. FIDELITY E-183 and the new faithful row E-189 record it; E-189 carries a verbatim 7437f22 excerpt of `PlayerEntityLoadSave.m:778-786`.
- **F2** `setQueuedEdgeFlush` and `createQueuedEdgeFlush` (which mirrors frame steps 2, 3 and 6), wired in game-session and start-session. `frame()` and `session-order.test.ts` are unchanged. Covered by unit tests at the input layer, the flush routing, both finding sequences through the real input state, the in-flight Escape+F4 and Escape+F6 cases, and by the e2e same-frame test (S+F3 with and without a save, Escape+F6 on the galaxy preset reopening at the local preset).
- **F3** Removed the `saveLoad` queue clause in keyboard.ts and the toggle arm in `applySaveScreenAction`. The chart arm is now commented as flight-only. A unit test checks that no saveLoad edge is queued in any context.
- **F4** Added a bubble-phase window recorder for `defaultPrevented`. `expectNoReload` asserts that every recorded F-key was cancelled. The Find-box test now asserts an entry for every key, F7 included. A MutationObserver on the `hidden` attribute of `#save-load` must see zero records for F2.
- **F5** `saveScreenGeneration` is bumped in `closeSaveScreen` and compared after `store.read()`. Unit-tested for both a close and a close-then-reopen.
- **F6** A unit test pins the collisions (Market on KeyS, and chartUp on Digit8). CHANGELOG has a Changed note. There is no migration.
- **F7** PROJECT.md:13 and ROADMAP.md:23 now name v0.8.0, tagged 2026-11-24. ROADMAP.md:95 marks the F-key bugs fixed and counts 37 pending todos.
- **F8** CHANGELOG has a Changed note for the digit aliases 3/4/5/8. FIDELITY E-183, E-185 and E-186 name them.
- **F9** Removed the unreachable `authored === ""` branch and narrowed the doc comment. E-188 is narrowed to plain text or one whole `[key]` token. `assets:check` reports no differences.
- **F10** The comment line's `title` is set to `commentText`. The e2e test asserts the full slaves note, and `""` for food.
- **F11** Added `KeyModifiers.textField`. From a text field only `STATION_NAV_ACTIONS` pass. Unit-tested with an F7 binding to chartRange.
- **F12** The F5 test now also covers the Manifest: F5, F5 (page 2), F8, then F5 lands on Status page 1.
- The two "Accepted, no change" items were left alone.

## Gates (all on the committed HEAD 57d8b5c5 unless noted)

| Gate | Result | Exit | Elapsed |
| ---- | ------ | ---- | ------- |
| Local `docker compose run --rm test` | 289 files, 7618 passed, 10 skipped | 0 | ~290 s |
| Local `lint` | eslint + prettier clean | 0 | - |
| Local `typecheck` | clean | 0 | - |
| Local `assets npm run assets:check` | no differences | 0 | - |
| Local fidelity with `OOLITE_SRC` (git archive 7437f22) | 9/9 passed, none skipped | 0 | - |
| Remote Chromium station-fkeys, station, save-load, chart-gestures | 41 passed | 0 | 98 s |
| Remote `verify-full` | unit 7618 passed / 10 skipped; Chromium 162 passed + 2 passed | 0 | 909 s |
| Remote `e2e-cross` (Firefox, includes station-fkeys) | 14 passed | 0 | 82 s |

`tests/guards/dead-mode-gates.test.ts` passed without a re-pin and without any edit. station-controller is still at 5 and frame-loop at 0. The only new mode comparison is the positive `=== "docked"` in `createQueuedEdgeFlush`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale FIDELITY line cites in files this plan shifted**
- **Found during:** Task 3
- **Issue:** `src/app/session/frame-loop.ts:124` (the game-over branch) moved to 133 when the header doc grew. `src/ui/station.ts:300` (`renderOutfitting`; the cite was already two lines off) now sits at 305.
- **Fix:** Updated both cites in FIDELITY.md.
- **Commit:** 57d8b5c5

### Process notes

- Task 2 is marked `tdd="true"`, but its tests were written alongside the code. There are no separate RED commits. Every new case covers behaviour the old code does not have, either because the API did not exist or because the old guard installed the Load and let the F7 binding fire.
- One run of the full local suite timed out in `tests/guards/tools-determinism.test.ts` (an ESLint-in-test case, 4.6 s). That happened because I ran typecheck and assets:check at the same time. The file passed on its own, and the clean full rerun on the committed tree was green (table above).
- The plan's e2e step 4 was tightened: the chart is moved to the galaxy preset before Escape+F6, so reopening at the local preset proves that the chart closed and opened again.

## Known Stubs

None.

## Self-Check: PASSED

- tests/app/session/queued-edge-flush.test.ts exists.
- Commits 9282131d, 146cd234, 78ca563e and 57d8b5c5 are ancestors of HEAD.
- `rev-list --count da57cd58..HEAD` = 4.

---
phase: quick-261110-fnh
plan: 261110-fnh
subsystem: ui
tags: [station-footer, chart, save-load, bindings, template]
status: complete
requirements: []
commits: 3
plan_head_before: 2a3d620b65d9f193d0f49795a0722795c3822550
plan_head_after: 9963c66bad3c22dea84c5e0b9d8e25863cfd2f3d
key-files:
  created:
    - src/ui/station-footer.ts
    - src/ui/station-hints.ts
    - tests/ui/station-footer.test.ts
    - tests/ui/station-hints.test.ts
  modified:
    - index.html
    - src/ui/station.ts
    - src/ui/chart.ts
    - src/ui/save-load.ts
    - src/app/game-session.ts
    - tests/e2e/station-tabs.spec.ts
    - tests/e2e/station.spec.ts
    - tests/e2e/autosave.spec.ts
    - tests/e2e/core-loop.spec.ts
    - tests/e2e/save-load.spec.ts
    - tests/e2e/hyperspace.spec.ts
    - tests/e2e/dispose.spec.ts
    - .planning/PROJECT.md
    - CHANGELOG.md
deviations: 4
---

# Quick task 261110-fnh: unify the docked, chart and Save/Load footer

## What changed

- **One inert template, three clones.** `index.html` now carries
  `<template id="station-footer-template">` with exactly two `<p>` lines:
  `data-footer-role="hints"` first and `data-footer-role="status"` second. The
  inline footers in `#docked`, `#chart` and `#save-load` are gone, and
  `createStationFooter(host)` clones the template into each overlay. The
  document keeps its single `<footer>`.
- **Two always-present lines.** `.station-footer` is the last in-flow flex row
  of its overlay. Both lines use `line-height: 1.5` and `min-height: 1.5em`
  with `white-space: nowrap`, `overflow: hidden` and `text-overflow: ellipsis`,
  so an empty status line and a text line are the same height and the market
  hint stays on one line at 1280x720.
- **Priority status.** `resolveFooterStatus` returns the first non-whitespace
  part in the order `confirm > notice > save > info`, preserving the displayed
  text. `setStatus` merges: an omitted part is untouched and an empty string
  clears only that part. A failed autosave therefore cannot clear a pending
  `[Y/N]`, and cancelling the confirmation reveals the retained save error.
- **Live key labels.** `src/ui/station-hints.ts` derives every label from the
  binding map with `primaryKeyLabel`/`codeLabel` (compacting `Up arrow` to
  `Up`, joining multi-code actions with `/`). `keyHints()`, `KEY_HINT` and
  `KEY_HINTS` are deleted. `refreshStationChrome()` pushes new hints to all
  three overlays on every rebind and reset, and runs once at startup after the
  binding map exists.
- **Chart occlusion fixed.** The chart footer is in normal flow. `#chart-canvas`
  keeps `flex: 1; min-height: 0`; the `ResizeObserver` observes the canvas and
  the footer, and a footer reflow rebuilds the view at the new viewport and
  repaints. The separate target/distance/fuel fields became one `info` status
  line: `target · distance · fuel`.
- **Save/Load prompt.** The overwrite prompt is the footer's `confirm` part;
  the `alertdialog`, Cancel focus, Tab trap and focus return to
  `#save-load-screen` are otherwise unchanged.
- **Disposal.** Each overlay component disposes its footer; the `pagehide` spec
  now asserts no `.station-footer` remains.

## Files

- New: `src/ui/station-footer.ts`, `src/ui/station-hints.ts`,
  `tests/ui/station-footer.test.ts`, `tests/ui/station-hints.test.ts`.
- Implementation: `index.html`, `src/ui/station.ts`, `src/ui/chart.ts`,
  `src/ui/save-load.ts`, `src/app/game-session.ts`.
- Browser proofs: `tests/e2e/station-tabs.spec.ts`, `station.spec.ts`,
  `autosave.spec.ts`, `core-loop.spec.ts`, `save-load.spec.ts`,
  `hyperspace.spec.ts`, `dispose.spec.ts`; `docking.spec.ts` needed no change
  (line ~402 was already scoped).
- Docs: `.planning/PROJECT.md` (Key Decision row, supersedes the footer part of
  deferred D-25; Last updated line) and `CHANGELOG.md` (`Changed` + `Fixed`).

## Test results (Docker only)

- `docker compose run --rm test npx vitest run tests/ui/station-footer.test.ts tests/ui/station-hints.test.ts`
  — 2 files, 10 tests passed.
- `docker compose run --rm test npx vitest run tests/ui/station-footer.test.ts tests/ui/station-hints.test.ts tests/ui/station-tabs.test.ts`
  — 3 files, 27 tests passed.
- `docker compose run --rm typecheck` — passed.
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/station-tabs.spec.ts tests/e2e/station.spec.ts tests/e2e/autosave.spec.ts tests/e2e/core-loop.spec.ts"`
  — 43 passed (Task 2).
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/station-tabs.spec.ts tests/e2e/station.spec.ts tests/e2e/autosave.spec.ts tests/e2e/docking.spec.ts tests/e2e/save-load.spec.ts tests/e2e/hyperspace.spec.ts tests/e2e/core-loop.spec.ts tests/e2e/dispose.spec.ts"`
  — 67 passed (Task 3, including the chart canvas/footer bounds, backing
  store, Save/Load dialog focus and footer disposal).
- `docker compose run --rm lint` — passed.
- `docker compose run --rm test` — 103 files, 1364 passed, 1 pre-existing
  skipped.
- `docker compose run --rm verify` — passed on the committed tree (lint,
  typecheck, content drift, unit, build, 19 fast browser tests).
- Re-ran `tests/e2e/station-tabs.spec.ts` after the final footer-level
  assertion — 14 passed.

`verify-full` and `e2e-cross` were not run; the full Chromium suite was not
re-run as a whole, but every affected spec (station tabs, station, autosave,
docking, Save/Load, hyperspace, core loop, disposal) was.

## Deviations from the plan

1. **Task 2 rebind test could not assert the chart footer yet.** The plan's
   Task 2 asks the rebind test to open the chart and assert `G: preset`, but
   the chart footer is mounted in Task 3. Task 2 asserted the docked footer;
   the chart half was added in Task 3, where it now passes.
2. **Playwright runs used `--project=chromium`.** Without it, Playwright also
   selects the configured `firefox` project, whose browser is only installed
   in the `e2e-cross` image; the command failed on the missing binary, not on
   the app. Firefox coverage remains in `e2e-cross`.
3. **Two third-`Y` assertions now expect `Requires TL 5`.** The old specs only
   looked at the confirmation field; in the unified line the existing
   passenger-berth notice is the visible status. The assertions now check the
   notice text and `data-status-tone="notice"`, preserving the intent (no
   prompt, no credits, no save).
4. **The "no raw code names" unit assertion exempts `PageDown`.** `codeLabel`
   has no `PageDown` entry, so its display label and code name are identical;
   `ArrowUp`, `ArrowDown` and `Escape` are proven absent. The exact
   `Tab/PageDown next page` substring remains pinned.

Also: the `let` → `const` lint fix in `station-footer.ts` landed in the Task 3
commit because Task 1/2 ran typecheck/unit/e2e but not lint.

## Visual check notes (`docker compose up app`)

At 1280x720, with a fresh game docked at Lave:

- **Home:** footer is two lines — dim `1 launch · P pause` above an empty
  reserved status line. The old four-line block is gone.
- **Market (F8):** the longest hint line still fits on one line; press Right to
  raise `Buy 1 t Food for 3.8 Cr? [Y/N]` in amber. The footer must not grow or
  shift `#station-screen`.
- **Outfitting (F3):** press Y on a disabled row (Docking Computers) to see the
  mint `Requires TL 9` notice; the amber target line from the chart is gone.
- **Status (F5):** `Tab/PageDown next page · PageUp previous · Esc back ·
  P pause`.
- **Chart (F6):** the plot now ends above the footer; the status line shows
  `No system · -- · --` or the selected system, distance and fuel. Tab toggles
  the preset; resize the window and confirm the plot repaints without stale
  marker positions.
- **Save/Load (F2):** hints line mentions `Esc return`; Save twice to see the
  overwrite dialog over a footer whose status line reads
  `Overwrite the autosave? [Y/N]`; Cancel returns focus to `#save-load-screen`
  and clears only the status text.
- **Rebind:** pause → Controls → Rebind `Confirm` to K or `Chart preset` to G,
  Back → Resume, and the footer labels change without a reload (market shows
  `K confirm`; the chart shows `G: preset`).

## Working tree

Three task commits plus the quick-task artifact commit are on
`refactor/station-footer-template`. The working tree is clean except the
pre-existing untracked `.planning` diagnostic directories
(`.review-diagnostics/`, `.planning/ui-reviews/`, `COVERAGE.md`).

## Self-Check: PASSED

- `src/ui/station-footer.ts`, `src/ui/station-hints.ts`,
  `tests/ui/station-footer.test.ts`, `tests/ui/station-hints.test.ts` and this
  summary exist.
- Commits `d588662`, `e13304f` and `9963c66` are ancestors of HEAD.
- The quick-task artifact commit (`docs: record the unified station footer quick
  task`) contains this summary.
- `docker compose run --rm verify` exited 0 on the committed tree.

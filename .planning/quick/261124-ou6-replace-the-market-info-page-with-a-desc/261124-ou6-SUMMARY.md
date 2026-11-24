---
phase: quick
plan: 261124-ou6
subsystem: station-ui
tags: [market, station, fidelity, f8]
requires: [261124-nbu]
provides:
  - market comment line under the list (MarketModel.commentText)
  - F8 on the Market does nothing
affects: [src/ui/station-model.ts, src/ui/station.ts, src/app/session/station-controller.ts, index.html, FIDELITY.md]
key-files:
  modified:
    - src/ui/station-model.ts
    - src/ui/station.ts
    - src/ui/station-hints.ts
    - src/app/session/station-controller.ts
    - src/app/probe.ts
    - src/app/session/context.ts
    - src/content/schemas/commodity.ts
    - index.html
    - tests/ui/station-market.test.ts
    - tests/ui/station-hints.test.ts
    - tests/app/session/station-controller.test.ts
    - tests/e2e/station-fkeys.spec.ts
    - tests/e2e/station.spec.ts
    - FIDELITY.md
    - .planning/PROJECT.md
    - CHANGELOG.md
    - README.md
key-decisions:
  - "The market has no Market Info screen: F8 on the Market does nothing, and a line under the list shows the selected commodity's comment, blank for the default no-comment text (owner decision 2026-11-24)"
metrics:
  duration: ~35 min
  completed: 2026-11-24
status: complete
commits: 3
plan_head_before: edea6b00cd4e077c65ad0ba38e25a78c355049c0
plan_head_after: 6c331ffa383558b9e15be3e9f64a002ddd8e4ad6
actuals:
  tokens: 40000
  tasks: 3
  commits: 3
---

# Phase quick Plan 261124-ou6: Market comment line instead of Market Info Summary

One reserved, never-wrapping comment line under the market table replaces the Market Info page, and F8 on the Market does nothing.

## What changed

- `buildMarketModel` lost its `page` parameter and the `page`/`title`/`info` fields; `MarketModel.commentText` holds the selected commodity's compiled comment, empty for no selection, a non-market key, or `MARKET_NO_COMMENT_TEXT` (`No additional information available`, pinned to the vendored `descriptions.plist`).
- `index.html`: plain `Market` heading; `<p class="station-market-comment" data-field="market-comment">` between the table and the cash-and-load line, using the footer's reserved-line pattern (`min-height: 1.2em`, `line-height: 1.2`, `nowrap`, `overflow: hidden`, `text-overflow: ellipsis`); no new font size or colour.
- `navigateByKey` returns at once for F8 on the Market with no chart or F2 screen open (no state change, no render). F5 second press unchanged; the dead-mode-gates pin stays 5.
- Market footer is the 0.8.0 string on every page; the Status F5 hints are unchanged.
- FIDELITY: two divergence rows (missing Market Info screen with comment line; F8 on the Market) quoting the new PROJECT.md row; F5 footer row quotes the rewritten F5 row; excerpts renumbered E-1..E-188. PROJECT.md: the 261124-nbu row rewritten for the F5 half, new market row. CHANGELOG and README updated.

## Gates

| Gate | Result |
| --- | --- |
| Local unit: station-market, station-controller, station-hints, dead-mode-gates | pass (117 tests) |
| Local fidelity contract, with and without `OOLITE_SRC` (7437f22 tree) | pass (9/9 with, 8 + 1 skipped without) |
| Local full `docker compose run --rm test` | 7598 passed, 10 skipped, 1 failed: `tests/guards/tools-determinism.test.ts` "Math.sin fails lint" hit its timeout because I ran `lint` concurrently; rerun alone passes (5/5, 4.7 s) |
| Local lint, typecheck | pass |
| Remote Chromium `station-fkeys` (after Task 1, snapshot ba1568a8) | 11 passed, 26 s |
| Remote Chromium `station-fkeys` + `station` + `station-tabs` (snapshot 6c331ffa) | 37 passed, 85 s |
| Remote `verify` (snapshot 6c331ffa) | exit 0, Chromium subset 28 passed, 209 s |
| Remote `e2e-cross` Firefox (snapshot 6c331ffa) | 13 passed, 82 s (includes the 1280x720 comment-line case) |

1280x720 fit: the new `station-fkeys` case asserts, in Chromium and Firefox, that the comment box lies inside `#station-screen`, ends above the cash line and the footer hints line, is not ellipsised, that `#station-screen` does not scroll, and that the cash line's y is identical for the empty line (Food), the Slaves text and back. All passed with market-only spacing unchanged (no padding or margin tweak was needed). I did not record the raw pixel gaps; only the pass/fail of those assertions.

## Deviations from Plan

None. The full local suite showed one timeout in an unrelated lint-determinism test caused by running `lint` in parallel; it passes alone.

## Known Stubs

None.

## Threat Flags

None. The comment is written with `textContent` only (T-ou6-01); the F8 early return sits inside the capture-cancelled path and the browser case ends with `expectNoReload` (T-ou6-02).

## Self-Check: PASSED

Commits ba1568a8, 186acb7f, 6c331ffa are ancestors of HEAD; all listed files exist.

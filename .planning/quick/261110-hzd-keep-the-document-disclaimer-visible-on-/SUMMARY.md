---
phase: quick-261110-hzd
plan: 261110-hzd
subsystem: ui
tags: [station-footer, document-footer, chart, save-load, layout]
status: complete
requirements: []
commits: 1
plan_head_before: ae29f73ff4a542c7e392e5f14da2e396abfdf1b1
plan_head_after: 07d6371fa2f93fd964b2b6bfb8df4a4d80b2d9cd
key-files:
  modified:
    - index.html
    - src/main.ts
    - src/ui/save-load.ts
    - tests/ui/station-footer.test.ts
    - tests/e2e/station-tabs.spec.ts
    - .planning/PROJECT.md
    - CHANGELOG.md
deviations: 0
---

# Quick task 261110-hzd: keep the document disclaimer visible on every station overlay

## What changed

- **Runtime-measured reservation.** `:root` defines
  `--document-footer-height: 6rem` as a no-script fallback. `trackDocumentFooterHeight`
  in `src/main.ts` observes the single `body > footer` with a `ResizeObserver`
  and writes its real pixel height to that custom property, disconnecting on
  the existing lifecycle abort. `#docked`, `#chart` and `#save-load` all use
  `padding-bottom: var(--document-footer-height, 6rem)`.
- **Disclaimer paints above the station overlays.** `body > footer` gained
  `z-index: 15`, so it is visible and clickable over `#docked`, `#chart` and
  `#save-load` (z-index 10) but stays below the pause overlay (20).
- **Station footers end flush.** Because each overlay reserves exactly the
  disclaimer's height, each in-flow station footer's bottom edge ends within
  one pixel of the disclaimer's top edge at 1280x720.
- **Modal keeps its authority.** `setConfirming` now mirrors its state to
  `#save-load[data-confirming]`; while the overwrite dialog is open the overlay
  rises to z-index 16 and covers the disclaimer and its links, so the existing
  focus trap and pointer blocking remain authoritative. Closing the dialog
  restores the normal layer.
- **Tests.** `tests/ui/station-footer.test.ts` pins the CSS contract for all
  three overlays, the fallback, the disclaimer z-index and the confirming rule.
  `tests/e2e/station-tabs.spec.ts` gained `expectFlushDocumentFooter`, which
  asserts flush geometry on all three overlays and hit-tests the first
  disclaimer link with `elementFromPoint`; the overwrite-dialog test proves the
  disclaimer is covered while `data-confirming="true"`.
- **Docs.** `CHANGELOG.md` records the fix under `## [Unreleased] / ### Fixed`.
  `.planning/PROJECT.md` extends the unified-footer Key Decision and updates
  `Last updated`.

## Verification (Docker only)

| Command | Result |
|---|---|
| `docker compose run --rm typecheck` | passed |
| `docker compose run --rm test npx vitest run tests/ui/station-footer.test.ts` | 7 passed |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test --project=chromium tests/e2e/station-tabs.spec.ts"` | 14 passed |
| `docker compose run --rm lint` | passed after Prettier formatting |
| `docker compose run --rm verify-full` | passed — 1366 unit tests (1 skipped) and 116 Chromium e2e |

`e2e-cross` (Firefox) was not run. `verify-full` was run after the user
approved the visual check.

## Visual check

The dev server is running at http://localhost:5173 (`wegolite-app-1`, HTTP 200).
On F6 and F2 the document disclaimer is visible at the bottom, the station
footer sits directly above it and its links are clickable. Opening the
Save/Load overwrite dialog covers the disclaimer until the dialog closes.

## Out of scope

- Removing or restyling the document disclaimer.
- Reworking the unified footer template or hint strings.
- `e2e-cross` (Firefox) until the user asks.

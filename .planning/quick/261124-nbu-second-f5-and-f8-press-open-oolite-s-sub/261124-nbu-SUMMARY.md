---
phase: quick
plan: 261124-nbu
subsystem: station-ui
tags: [oolite-fidelity, station, market-info, manifest, f-keys, content-build]
requires: []
provides:
  - Market Info (page 2 of the market screen) with the compiled commodity comment
  - second F5 press shows the Manifest, second F8 press shows Market Info
  - page-aware footer hints for the next F5/F8 press (recorded divergence)
affects: [src/ui/station-model.ts, src/ui/station.ts, src/ui/station-hints.ts, src/app/session/station-controller.ts, tools/oolite-ingest/convert/commodities.ts, FIDELITY.md]
tech-stack:
  added: []
  patterns: [content-build-resolved-description-tokens, second-press-station-page]
key-files:
  created: []
  modified:
    - src/content/schemas/commodity.ts
    - tools/oolite-ingest/convert/commodities.ts
    - src/content/generated/commodities.json
    - src/content/generated/manifest.json
    - src/ui/station-model.ts
    - src/ui/station.ts
    - src/ui/station-hints.ts
    - index.html
    - src/app/session/station-controller.ts
    - src/app/session/context.ts
    - src/app/probe.ts
    - FIDELITY.md
    - .planning/PROJECT.md
    - CHANGELOG.md
    - README.md
decisions:
  - "A second F5 or F8 press opens Oolite's Manifest or Market Info, and the station footer names that press (owner decision 2026-11-24, quick 261124-nbu)"
metrics:
  duration: n/a
  completed: 2026-11-24
status: complete
commits: 3
plan_head_before: 38567c2c5188853dc670c38643aee84493f43444
plan_head_after: c780fa3f91db5add3f40f1c70c996488e83f8f9a
actuals:
  tokens: 60000
  tasks: 3
  commits: 3
---

# Phase quick Plan 261124-nbu: Second F5/F8 press Summary

Second F5 on Status opens the Manifest and second F8 on the Market opens a ported Oolite Market Info screen (comment compiled from `trade-goods.plist` through `descriptions.plist`), with the docked footer naming the next F5/F8 press as a recorded owner-decided divergence.

## What was built

- **Content (R2).** `CommoditySchema` has a required `comment`. `tools/oolite-ingest/convert/commodities.ts` resolves it with `resolveComment`: absent or empty becomes `oolite-commodity-no-comment`, bracket-free text is kept, a whole `[key]` token resolves through `descriptions.plist`, and anything else (unknown key, mixed text and token, nested token, non-string) is a SCHEMA error. Slaves, narcotics and firearms resolve to "It is illegal to export this good from Cooperative stations."; the other 14 records to "No additional information available". Only `commodities.json` and `manifest.json` changed under `src/content/generated`; `third_party/` is untouched; `assets:check` passes.
- **Model and shell (R2).** `buildMarketModel` takes a `page`; page 2 is honoured only for a selection that is a market row with a catalogue record, else it falls back to page 1. New exports `MARKET_TITLE`, `MARKET_INFO_TITLE_TEMPLATE` (pinned to the vendored `oolite-commodity-information-@`), `MarketInfo`. The shell has `market-title` and `market-info-comment` fields; Market Info shows one row with no selected highlight, the comment, then the cash-and-load line. The contracted line never draws (no cargo contracts).
- **Controller (R1/R2).** `navigateByKey` handles the second press when no overlay is open, the screen is Status or Market, and the page is 1 (and for the Market a commodity is selectable via `marketInfoAvailable()`); everything else opens page 1 through `openStationScreen`. `renderStation` resets a Market Info page whose selection left the market. No new mode comparison (dead-mode-gates test passes unchanged). Up/Down and the trade keys work on Market Info unchanged.
- **Hints (R3).** `dockedHints(bindings, screen, page)` adds `F5 manifest` / `F5 status` and `F8 commodity info` / `F8 commodity list` from the live bindings. The Market Info line is not ellipsised at 1280x720 (browser case).
- **Records.** FIDELITY rows and excerpts E-185 to E-189 plus two divergence rows (footer hints) quoting the new PROJECT.md Key Decisions row; E-183/E-184 Wegolite cells re-pointed. CHANGELOG, README updated; the todo moved to `.planning/todos/completed/` with a resolution.

## Commits

| Task | Commit | Description |
| ---- | ------ | ----------- |
| 1 (tracer) | e2b26d0e | F8 twice opens Market Info with the compiled commodity comment |
| 2 | 8cdd8502 | F5 twice shows the Manifest; footers name the next F5/F8 press |
| 3 | c780fa3f | FIDELITY/PROJECT/README records, todo closed |

## Verification (all green)

| Check | Result | Snapshot / notes |
| ----- | ------ | ---------------- |
| `docker compose run --rm test` (local, full) | exit 0 | after Task 3 |
| `docker compose run --rm lint` / `typecheck` (local) | pass | after Task 3 |
| Targeted Vitest (converter, failure-contract, drift, station-market, station-controller, station-hints, dead-mode-gates) | pass | per task |
| `tests/contract/fidelity.test.ts` | 8 passed, 1 skipped (no OOLITE_SRC) | |
| Same with `OOLITE_SRC` = 7437f22 `src` tree | 9 passed (verbatim excerpts match) | |
| Remote Chromium: station-fkeys (tracer, after Task 1) | 10 passed, 24 s | e2b26d0e |
| Remote Chromium: station-fkeys (after Task 2) | 12 passed, 25 s | 8cdd8502 |
| Remote Chromium: station-fkeys, station, station-tabs, autosave, context-loss | 61 passed, 222 s | c780fa3f |
| Remote `verify` (lint, typecheck, assets:check, unit, build, e2e smoke subset) | exit 0, 288 test files / 7594 tests passed (10 skipped), e2e subset 28 passed, 206 s | c780fa3f |
| Remote `e2e-cross` (Firefox) | 14 passed, 82 s | c780fa3f |

Tracer gate: the tracer slice (F8 F8 F8 browser case) passed end to end in Chromium before the F5 and hint work was added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Empty authored comment failed the strict schema before resolution**
- **Found during:** Task 1 (synthetic-plist test)
- **Issue:** `project()` passed an empty `comment` string to `CommoditySchema` (`min(1)`), so the documented "empty resolves to the no-comment text" path threw.
- **Fix:** `readComment` maps an empty string to the default token before validation.
- **Files modified:** `tools/oolite-ingest/convert/commodities.ts`
- **Commit:** e2b26d0e

**2. [Rule 3 - Blocking] ESLint `no-useless-escape` on the comment-token regex**
- **Fix:** `/^\[([^[\]]+)\]$/`. **Commit:** e2b26d0e

No existing spec needed its expectation changed: the per-screen F-key loop and station specs pass unchanged (the second press keeps the screen `status`/`market`).

## Known Stubs

None.

## Threat Flags

None. T-nbu-01 (fail-closed `resolveComment`, strict schema), T-nbu-02 (`textContent` only for title and comment) and T-nbu-03 (`expectNoReload` in the new Chromium and Firefox cases) are implemented as planned.

## Notes for the orchestrator

- The Oolite acceptance run (`test:acceptance`) is not needed: no change under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.
- FIDELITY E-185 and E-186 are each cited by two rows (faithful and the footer divergence); the contract test accepts this.
- The footer hint on the Market reads `F8 commodity info` even when no commodity is selectable (F8 then stays on the list); this matches the recorded hint wording and was not special-cased.

## Self-Check: PASSED

- Commits e2b26d0e, 8cdd8502, c780fa3f exist on `worktree-agent-ac2327900b3844dc2` (3 commits measured from `38567c2c`).
- Created/changed files present; generated content regenerated with `docker compose run --rm assets`, `assets:check` reports no differences.

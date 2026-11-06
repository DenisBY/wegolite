---
phase: 05-docked-economy-station-screens
plan: 04
subsystem: station view models and labels
tags: [view-model, labels, market, outfitting, status, system-data, money, tdd]
requires:
  - 05-01 market model and the pinned buildMarketModel signature
  - 05-02 total-cost TradePlan, clamps and sell path
  - 05-03 outfitting rules, FitContext and REMOVAL_DESCRIPTIONS
provides:
  - parseLabels, loadLabels and LabelsError
  - StationModelError, formatWholeCredits and the re-exported formatDecicredits
  - buildStatusModel (two F5 pages, 16-row manifest)
  - buildSystemDataModel (7 sysdata fields plus the inhabitants row)
  - buildOutfittingModel (D-11 order, reasons, truthful removal copy)
  - tradeNoticeText and the completed buildMarketModel confirmation/notice
affects:
  - 05-05 (renders all four models and builds the FitContext)
  - 05-06 (phase gate re-runs these suites)
tech-stack:
  added: []
  patterns:
    - one literal one-pass replacer for the four documented sysdata value tokens
    - separate confirm/notice strings with a nullable confirmation
    - explicit model flags (`dimmed`, `confirmable`) so the shell never re-derives a rule
    - the view model owns clamp copy; the session owns refusal copy through the same helper
key-files:
  created:
    - src/content/labels.ts
    - tests/helpers/labels.ts
    - tests/content/labels.test.ts
    - tests/ui/station-status.test.ts
    - tests/ui/station-system-data.test.ts
    - tests/ui/station-outfitting.test.ts
    - tests/ui/station-market.test.ts
  modified:
    - src/ui/station-model.ts
    - src/app/game-session.ts
decisions:
  - The label record is validated by LabelsSchema with a named first failing path; loadLabels caches one promise.
  - F7 expands only the four documented value tokens in one pass with a replacer function and throws on any leftover `[`.
  - F5 page 1 labels are app literals; legal status and rating come from labels.json and page 2 filters to the 16 tradeable commodities.
  - F3 removal rows use whole-credit labels while the detail and confirmation keep the exact decimal price.
  - The F8 confirmation uses TradePlan.cost (the total); the model derives the clamp notice from plan.clamp and the session supplies refusal copy through tradeNoticeText.
metrics:
  duration: 8 min
  completed: 2026-11-06
status: complete
actuals:
  tokens: 15092
  tasks: 3
  commits: 5
  plan_head_before: f49f7b55ce0b2144eff61efd8a8465bb91dbde73
  plan_head_after: e98476664503f6072994a9f73db204d0bde2d25a
---

# Phase 5 Plan 4: Station View Models, Labels and Exact Money Summary

Projects the station screens into pure data before any DOM exists: the compiled labels join the F7 templates, the F5 status/manifest pages pin every Lave figure, the F3 rows carry the D-11 order and truthful removal copy, and the F8 confirmation uses the approved total cost with a separate clamp/refusal notice.

## What Was Built

### Labels loader (`src/content/labels.ts`)

- Mirrors `equipment.ts`: `generated/labels.json` through a `?raw` glob, a named `LabelsError`, an exported `parseLabels` and one cached `loadLabels` promise.
- `parseLabels` validates with the strict `LabelsSchema` and names the first failing path, so a drifted record fails at boot rather than inside F7.
- `tests/helpers/labels.ts` reads the committed bytes with `readFileSync` and calls `parseLabels`, keeping Node tests off Vite's glob.

### F5 status and manifest (`buildStatusModel`)

- Page 1 renders Commander Jameson, Cobra Mk III, Present System Lave, Hyperspace System `(Unknown)`, Condition Docked, Fuel `7.0 Light Years`, Cash `100.0 Cr`, Legal Status `Clean`, Rating `Harmless` and the owned equipment names.
- The equipment list is omitted only when equipment, missiles and berths are all zero; a new game lists `Missile ×3` and a berth lists `Passenger Berth ×N`.
- Page 2 filters to the 16 `tradeable` commodities in `sortOrder` (never `alien_items`), uses each commodity's own unit and renders `—` for an empty hold. The load line is `Load X of Y t`; the cargo bay raises capacity from 20 to 35 and a berth subtracts five.
- The page indicator is `Page N/2` and the page clamps to 1..2.

### F7 system data (`buildSystemDataModel`)

- The title is `Data on Lave` from `sysdata-data-on-system`; the seven field labels come from `sysdata-eco|govt|tl|pop|prod|radius|distance`.
- Values are `Rich Agricultural`, `Dictatorship`, `5`, `2.5 Billion`, `7000 M₢`, `4116 km`, `0.0 ly`, plus the `(Human Colonials)` inhabitants row; the description is `System.description` verbatim.
- The four value templates are expanded in one pass with a literal, closed regex and a replacer function, so `$&`, `$'` and `$1` in a value survive verbatim. A missing key or a leftover `[` throws `StationModelError`; no general template language or generated prose exists.

### F3 outfitting (`buildOutfittingModel`)

- Rows follow `VISIBLE_EQUIPMENT_KEYS` exactly, omit Fuel at a full tank and each removal row at a zero count, and expose `{key,label,name,cost,priceText,enabled,dimmed,reason,owned,multiCount,confirmable}`.
- Refusals use the exact short copy: `Requires TL N`, `Already installed`, `Not enough credits`, `Pylons full`, `No cargo space`, `Full tank`, `Nothing to remove`, `Maximum reached`, `Not offered`, `Price unavailable`, `Not available`.
- The fuel row is the fill cost (`7.2 Cr` at 34 units), never the 2 dc unit price.
- Removal rows use D-15's whole-credit labels (`Remove Missile — 20 Cr`, `Remove Passenger Berth — 100 Cr`) while `name` is the short confirmation name; the detail keeps the decimal price and overrides the description with `REMOVAL_DESCRIPTIONS` (missile full catalogue value re-sale, berth `No refund is paid`).
- A disabled row stays selectable for its reason but has `confirmable: false`.

### F8 market (`buildMarketModel`)

- 17 rows in `sortOrder` with `—` for zero stock and zero held, the `Ex` flag from `legalityExport`, and each commodity's own unit.
- Zero-stock tradeable rows are dimmed but selectable; Alien Items is dimmed and non-selectable.
- The confirmation is the D-06 line using `TradePlan.cost` (`Buy 12 t Food for 45.6 Cr? [Y/N]`), not the unit price.
- `confirmText` is `null` for a refusal and for a silent zero step; `noticeText` carries the derived clamp reason (`Only 16 t available`) alongside the clamped confirmation.
- `tradeNoticeText` is the single clamp/refusal copy source; the session now uses it and passes the result as `feedback.notice`.

## Tasks and Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Labels loader, F5 status model and F7 system-data model | `d4036b6` |
| 2 | Outfitting row model: D-11 order, reasons, removal copy, whole-credit labels | `3fd36fe` |
| 3 | Complete the F8 market model, total confirmation and separate notice | `d7ae3f6` |
| — | Prettier formatting of the new files | `3881df0` |
| — | Documentation clarification (removal copy, UI-free labels test) | `e984766` |

## Verification

All commands ran in Docker, never on the host.

| Command | Result |
|---|---|
| `docker compose run --rm test npx vitest run tests/content/labels.test.ts tests/ui/station-status.test.ts tests/ui/station-system-data.test.ts` | RED first (missing `src/content/labels.ts`), then 28 passed |
| `docker compose run --rm test npx vitest run tests/ui/station-outfitting.test.ts tests/sim/player/outfitting.test.ts` | RED first (`buildOutfittingModel` absent), then 66 passed |
| `docker compose run --rm test npx vitest run tests/ui/station-market.test.ts` | RED first (11 failures), then 18 passed |
| `docker compose run --rm test npx vitest run tests/ui tests/content` | 6 files / 64 tests passed |
| `docker compose run --rm typecheck` | green (both projects) |
| `docker compose run --rm test` (full unit) | 81 files / 914 tests passed |
| `docker compose run --rm lint` | green (ESLint + Prettier) |

Acceptance greps: no `eval`/`new Function`/`new RegExp`, no `document.`/`window.` and no content loader import in `src/ui/station-model.ts`; no second `formatDecicredits` definition; `parseLabels`, `loadLabels` and `LabelsError` are exported; every `sysdata-*` key F7 reads appears in the model; `tests/content/labels.test.ts` imports no UI module.

## Deviations from Plan

### Auto-fixed / interpretation issues

**1. [Plan requirement] Zero-stock tradeable rows are `selectable: true`**
- **Found during:** Task 3.
- **Issue:** plan 05-02 had set `selectable` to `stock > 0 || held > 0`, so a zero-stock row with an empty hold was non-selectable. This plan's truth and acceptance explicitly require `selectable` false only for Alien Items.
- **Fix:** `selectable: tradeable` in `buildMarketModel`. The session's own row-navigation predicate is unchanged, so this plan widens only the model flag (05-05 owns navigation).
- **Files modified:** `src/ui/station-model.ts`.

**2. [Plan interpretation] Kept `cashText` and `loadText` as the shell's two independent lines**
- **Found during:** Task 3.
- **Issue:** the truth describes `cashText` as the combined `Cash: … Load … t.` line, but the existing shell renders two `<p>` fields and `tests/e2e/station.spec.ts` pins `Load 1 / 20 t`.
- **Fix:** `cashText` is `Cash: <formatDecicredits>.` and `loadText` stays `Load N / M t`, each with exactly one period. Folding them into one string would duplicate the load text in the shell; 05-05 can change the panel if desired.
- **Files modified:** `src/ui/station-model.ts`, `tests/ui/station-market.test.ts`.

**3. [Rule 2 - Missing critical functionality] One exported copy source for clamp/refusal notices**
- **Found during:** Task 3.
- **Issue:** the pinned `feedback` argument carries a string, but the plan also requires the model to report the clamp reason and the session to use the exact D-06 copy. Two implementations would drift.
- **Fix:** exported `tradeNoticeText(plan, commodity)`; `buildMarketModel` derives a clamp notice from `pending.clamp`, and the session uses the same helper for a refusal plan before clearing `pending`. The five-argument signature and `MarketFeedback` type are unchanged.
- **Files modified:** `src/ui/station-model.ts`, `src/app/game-session.ts`.

**4. [Plan requirement] Session refusal copy updated to the exact D-06 wording**
- **Found during:** Task 3.
- **Issue:** the session still spoke wave-1 copy (`No stock available`, `No cargo space`, `The station cannot take any more`, …).
- **Fix:** the session now calls `tradeNoticeText`; `zeroAmount` stays silent.
- **Files modified:** `src/app/game-session.ts`.

No authentication gates and no package installs occurred. The plan estimated 60k tokens across 3 tasks; the realized diff is ~15.1k tokens over 3 task commits (plus 2 formatting/doc commits).

## Known Stubs

None. The four models are complete for the plan's scope; the F3/F5/F7 DOM branches remain plan 05-05's work, not stubs here.

## Threat Flags

None beyond the plan's threat register. T-05-10/T-05-11 are covered by `LabelsSchema` validation, the closed one-pass replacer and the leftover-token throw; T-05-24 is proved by the `$&`/`$'`/`$1` preservation test; T-05-29 is covered by the per-entry `REMOVAL_DESCRIPTIONS` assertions; T-05-SC is untouched (no install).

## Self-Check: PASSED

- Created files exist: `src/content/labels.ts`, `tests/helpers/labels.ts`, `tests/content/labels.test.ts`, and the four `tests/ui/station-*.test.ts` files.
- Commits exist and are ancestors of HEAD: `d4036b6`, `3fd36fe`, `d7ae3f6`, `3881df0`, `e984766`.
- Measured commits: `git rev-list --count f49f7b5..e984766` = 5, matching `actuals.commits`.
- Full unit suite, typecheck and lint pass in Docker.

---
phase: 05-docked-economy-station-screens
plan: 01
subsystem: docked economy and station computer
tags: [economy, market, cargo, persistence, input, station-ui, e2e]
requires:
  - 04 manual docking (docked mode, profile, save store, probe)
  - 02 content pipeline (trade-goods, descriptions, equipment, systems)
provides:
  - generated commodity peaks and resolved display names
  - pure RANROT, market, cargo and buy-path modules
  - extended profile and additive v1 save fields with one shared semantic validator
  - mode-aware keyboard contexts and the station shell with home + F8
  - persisted marketSeed lifetime and the tracer browser proof
affects:
  - 05-02 (sell, gold/kg and gem/g capacity)
  - 05-03 (outfitting rules and equipment transactions)
  - 05-04 (labels and view models)
  - 05-05 (F3/F5/F7 screens and full keyboard proof)
  - 05-06 (save hardening and phase gate)
tech-stack:
  added: []
  patterns:
    - pure float32 economy port with a seeded 32-bit RANROT
    - entry-array cargo on the wire and a null-prototype runtime map
    - one semantic validator shared by the save reader and writer
    - context-filtered input with a narrow capture-phase F-key guard
key-files:
  created:
    - src/content/commodities.ts
    - src/sim/economy/ranrot.ts
    - src/sim/economy/market.ts
    - src/sim/economy/cargo.ts
    - src/sim/economy/trade.ts
    - src/ui/station-model.ts
    - src/ui/station.ts
    - tests/helpers/commodities.ts
    - tests/sim/economy/market.test.ts
    - tests/sim/economy/cargo.test.ts
    - tests/sim/economy/trade.test.ts
    - tests/input/station-actions.test.ts
    - tests/e2e/station.spec.ts
  modified:
    - src/content/schemas/commodity.ts
    - src/content/types.ts
    - src/content/generated/commodities.json
    - src/content/generated/manifest.json
    - tools/oolite-ingest/convert/commodities.ts
    - tools/oolite-ingest/generate.ts
    - src/sim/player/profile.ts
    - src/persistence/save.ts
    - src/persistence/autosave.ts
    - src/input/actions.ts
    - src/input/keyboard.ts
    - src/input/bindings.ts
    - src/ui/controls.ts
    - src/ui/docked.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/main.ts
    - index.html
    - tests/e2e/docking.spec.ts
decisions:
  - Oolite's economy-only formula with quantity before price, four RANROT draws per commodity including Alien Items, float32 grouping and a stock-only 127 cap.
  - marketSeedForSystem(systemId) = Number.parseInt(fnv1a32(`${systemId}:0`), 16) >>> 0; one persisted seed, never re-seeded by docking.
  - Cargo is persisted as an entry array and validated by one validateSaveSemantics shared by parseSave and isEncodedSaveValid.
  - The station footer is a div.station-footer with four independent fields; the document footer stays the only <footer>.
metrics:
  duration: 55 min
  completed: 2026-11-06
status: complete
actuals:
  tokens: 52977
  tasks: 2
  commits: 2
plan_head_before: 1e5090da7b19ef00aa61b99d19185c67c9dfc5b1
plan_head_after: a460ace6733d6e771d1ed76fa2eae7db6ad666de
---

# Phase 5 Plan 1: Buy Food at Lave, Autosave It and Reload Into the Same Hold Summary

A tracer that turns the generated commodity catalogue into a real Lave market, buys one tonne of Food through a keyboard `[Y/N]` footer, autosaves one atomic profile snapshot, and reloads into the same cargo and credits. The pure economy is anchored independently (Food 38/16, Computers 902/0) and the equal-peaks guard is proven at economy 0.

## What Was Built

### Content

- `CommoditySchema` gains required `peakExport`/`peakImport` integers bounded 0..7; `name` is documented as the resolved display string and `key` remains identity.
- `compileCommodities(parsed, descriptions)` extracts the authored `[commodity-name <token>]` token, requires it to match the entry key, resolves the display name from `descriptions.plist`, and fails as `SCHEMA` when either is missing. `emitCommodities` writes both peaks.
- Regenerated `src/content/generated/commodities.json` and `manifest.json` through the assets service; the content golden was regenerated from the emitted array and Prettier-cleaned.
- `src/content/commodities.ts` mirrors the equipment loader (`parseCommodities`, `loadCommodities`, `findCommodity`, `CommoditiesError`), and `tests/helpers/commodities.ts` reads the committed bytes with `readFileSync`.

### Pure economy

- `src/sim/economy/ranrot.ts` ports Oolite's 32-bit RANROT/MakeRanrotSeed exactly. The pinned vector for seed `0x12345678` is `11060, 14835, 46555, 54929` over 65536.
- `src/sim/economy/market.ts` implements `MARKET_LIMIT`, `marketSeedForSystem`, `generateMarket` and `economicBias`. Quantity is drawn before price, four draws per commodity, every intermediate is `Math.fround`, stock is the only capped value, and equal peaks return exactly `0` before any division.
- `src/sim/economy/cargo.ts` implements the pod constants, the safe half-unit, unclamped `capacityPodsFor`, `availablePods`, `maxAdditional`, `emptyCargo` and a non-mutating `setCargo`.
- `src/sim/economy/trade.ts` implements the pinned seven-field `TradePlan`, `planBuy` and `applyBuy`; a plan clamps to stock/affordability/hold and `applyBuy` re-runs it and refuses any mismatch.

### Profile, persistence and save semantics

- `PlayerProfile` gains `cargo`, `fuel`, `missiles` and `passengerBerths`; `purchase`, `setCredits` and `grantCredits` spread the profile so the new fields survive. `formatDecicredits` uses integer quotient/remainder and `formatCredits` delegates to it.
- `SaveV1Schema` gains optional cargo/fuel/missiles/passengerBerths/marketSeed without a version bump. `validateSaveSemantics(save, allow, mode)` is the one stage used by `parseSave` (read) and `isEncodedSaveValid` (write); it rejects unknown/duplicate/zero cargo keys, over-capacity holds, `EQ_FUEL`, removal keys, and aliases in write mode. A Phase 4 berth alias and a non-zero explicit count together are corrupt; the alias alone folds into one berth and measures against the reduced capacity.
- `snapshotForSave` projects cargo sorted by `sortOrder`, omits zero entries and records the seed; `profileFromSave` defaults a field-less Phase 4 blob to an empty hold, full tank, three missiles and no berths.

### Input and station computer

- `ActionId` gains the four screen actions, Back, arrows, confirm/cancel, page actions and the two shift variants. `ACTION_CONTEXTS` decides every action's legal modes; `SHIFT_VARIANT_ACTIONS` maps Right/Left to buy-max/sell-max; `RESERVED_F_KEYS` holds F3/F5/F7/F8.
- `createInputState` gains `setContext`/`getContext`/`setPaused`/`drainStationActions` and a synchronous `setStationScreenHandler`. Escape in a section is Back and never pause; KeyP is universal pause; while paused only pause resolves and Tab/Enter return `false`.
- The action dispatcher stays on the bubble phase. A separate window capture listener only `preventDefault`s a plain reserved F-key and returns early under Ctrl/Meta/Alt, a rebind capture or a text field. It never dispatches or stops propagation.
- `createBindingMap` sanitises overlapping-context duplicate codes deterministically and exempts exactly pause/Back on Escape; `detectConflict` is context-aware.
- `src/ui/docked.ts` is reduced to system/credits/ship/fuel/message + Launch with `setFuel` and `formatFuel`; the dockcomp path and `DOCKED_FUEL` are gone.
- `src/ui/station.ts` composes that panel as the home screen and owns the persistent header, market table and four independent footer fields. `src/ui/station-model.ts` builds the fixed F8 columns, dimming, cash/load line and separate confirmation/notice copy.
- `index.html` uses one `<section id="station-screen">`, a `div.station-footer` and `body > footer` scoping, so `page.locator("footer")` still resolves to exactly one element and the two footer boxes do not intersect.

### Session and probe

- The session loads commodities beside equipment, resolves the seed once (`restore.marketSeed ?? marketSeedForSystem(system.id)` or the new-game derivation), generates the market once, and never regenerates it on `docked`.
- Station actions are drained only while docked and unpaused, revalidated per action, and discarded otherwise. A queued `stationConfirm` re-plans against the live profile and market. Every accepted trade commits the profile and autosaves.
- `probe.station` publishes open/screen/selectedKey and `probe.economy` publishes credits/cargo/marketSeed/market rows; the market array is rebuilt only on state change.

## Tasks and Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | Tracer: buy 1 t Food at Lave, autosave it, reload into the same hold | `a37b3d6` |
| 2 | Expansion: independent economy anchors, keyboard/pause proofs and persisted-seed lifetime | `a460ace` |

## Verification

All commands ran in Docker, never on the host.

| Command | Result |
|---|---|
| `docker compose run --rm assets npm run assets:check` | `assets:check: no differences` |
| focused `vitest run tests/sim/economy tests/persistence tests/sim/player-profile.test.ts tests/input/... tools/oolite-ingest/... tests/guards/content-boundary.test.ts` | green |
| `docker compose run --rm typecheck` | green |
| full `vitest run` | 73 files / 763 tests passed |
| e2e: station, docking, scene, launch, autosave, precision, fallback, flight, settings, hud | 43 passed |
| e2e: aspect, dispose, models, resize | 9 passed |
| diag `tests/diag/frame-cost.spec.ts` | 2 passed |
| `docker compose run --rm lint` | green (ESLint + Prettier) |

Key browser evidence: Food is 38 dc / 16 stock from seed `0xd3515f15`; a plain ArrowRight shows `Buy 1 t Food for 3.8 Cr? [Y/N]`; KeyY leaves 962 dc, cargo `food: 1`, load `1 / 20 t`; the save commits and Continue restores the same cargo and credits. A launch + Shift+C dock leaves the seed, every price and every stock unchanged. `Digit8` followed by `ArrowRight` (or `Escape`) in one `page.evaluate` turn reaches the market and steps/returns, proving the synchronous context switch.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Excluded the harness `.agents` directory from the compliance walk and Prettier**
- **Found during:** full unit run and lint.
- **Issue:** the untracked `.agents/` skill directory (harness environment configuration) contains `.sh` files without the project SPDX header, so `tests/compliance.test.ts` failed, and Prettier checked its Markdown.
- **Fix:** added `.agents` to `SKIP_DIRECTORIES` and `.prettierignore` with a comment that it is environment configuration, not repository source.
- **Files modified:** `tests/compliance.test.ts`, `.prettierignore`.

**2. [Plan instruction deviation] Static home/market panels toggled with `hidden` instead of rebuilding the section with `replaceChildren`**
- **Found during:** station shell implementation.
- **Issue:** the plan asked for one section rebuilt per render, then required the one stored launch handler to be re-attached to the newly created button. Keeping one `createDockedPanel` and two static panels is simpler and preserves one live home path with one listener.
- **Fix:** `#station-screen` holds `[data-station-panel="home"]` and `[data-station-panel="market"]`; `applyScreen` toggles `hidden` and sets `data-screen`. The reduced panel is constructed once and composed by the shell, exactly as the plan's composition requirement states.
- **Files modified:** `index.html`, `src/ui/station.ts`.

**3. [Rule 2 - Missing critical functionality] Exported the pure reserved-F-key guard**
- **Found during:** making the `defaultPrevented` proof runnable in Node.
- **Issue:** the plan requires a synthetic F5 to be `defaultPrevented` while Ctrl+F5 and a capture-mode F5 are not, but the Vitest project is Node-only.
- **Fix:** `shouldCancelReservedKey`/`cancelReservedKey` are pure helpers; the window capture listener is a thin adapter over them. Node tests and the browser proof both exercise the same predicate.
- **Files modified:** `src/input/keyboard.ts`, `tests/input/station-actions.test.ts`, `tests/e2e/station.spec.ts`.

**4. [Rule 1 - Bug] Kept `ACTION_CONTEXTS` typed as `InputContext[]`**
- **Found during:** typecheck.
- **Issue:** `Object.freeze(["flight"])` widens to `readonly string[]`, which does not satisfy the context record.
- **Fix:** a small `contexts(...values: InputContext[])` helper returns the frozen readonly array with the literal union intact.

No authentication gates and no package installs occurred.

## Known Stubs

None. Wave 1 deliberately leaves F3/F5/F7 unopened and the sell direction inert; those are planned expansions for 05-02 to 05-05, not stubs in the shipped buy/F8 path.

## Threat Flags

None beyond the plan's threat register. The new surface (cargo on the save wire, market coefficients, station DOM strings) is covered by T-05-01, T-05-02, T-05-03, T-05-04, T-05-05, T-05-06 and T-05-19. Every station string is written with `textContent`; cargo is an entry array and the runtime map has a null prototype.

## Self-Check

- Created files exist: `src/content/commodities.ts`, `src/sim/economy/{ranrot,market,cargo,trade}.ts`, `src/ui/{station,station-model}.ts`, `tests/e2e/station.spec.ts`, `tests/input/station-actions.test.ts` — all present.
- Commits exist: `a37b3d6` and `a460ace` are ancestors of HEAD; the two task commits sit between `1e5090d` and `a460ace`, and the metadata commit follows them.
- Verification: full unit, lint, typecheck, assets drift, all 52 e2e tests across the planned and remaining specs, and the diag spec pass.

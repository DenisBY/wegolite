---
created: 2026-11-11T16:30:00.000Z
title: Track cargo purchase cost basis for profit/loss display
area: economy
severity: low
files:
  - src/sim/economy/trade.ts
  - src/persistence/save-schema.ts
  - src/ui/station-model.ts
  - src/ui/docked.ts
---

## Problem

Currently `PlayerProfile.cargo` only records held commodity quantities (`Record<string, number>`). Because the purchase cost basis (total or average decicredits paid per commodity) is not stored in `PlayerProfile` or the save format, the Docked Home `Cargo Hold Manifest` and `F8 Market` screen can only compare the current station's local price against the static Galactic Average (`commodity.priceAverage`), rather than showing the commander's actual unrealized profit/loss relative to what they paid.

## Solution

- Track per-commodity purchase cost basis (e.g. total decicredits spent or weighted average purchase price in decicredits) in `PlayerProfile` when buying and proportionally reduce/clear it when selling in `src/sim/economy/trade.ts`.
- Persist the optional/versioned cost basis in the save schema (`src/persistence/save-schema.ts`) with backward-compatible fallback when loading older saves.
- Update `buildHomeModel` (`Cargo Hold Manifest`) and `buildMarketModel` (`F8 Market`) to display actual profit/loss per unit (and/or total) against purchase price when known, falling back to Galactic Average comparison for legacy saves.

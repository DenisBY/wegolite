---
created: 2026-11-21T00:00:00.000Z
title: Port hull wear, EQ_RENOVATION and the fuel-price effect together
source: Phase 19 owner decision D-05, 2026-11-21 (plan 19-02)
area: sim
severity: minor
files:
  - src/sim/combat/internal-damage.ts
  - src/persistence/save.ts
  - src/sim/player/profile.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Oolite's `ship_trade_in_factor` starts at 95 for a new commander (`PlayerEntity.m:1739`, load default `:1063`).
It falls by one each time the cosmetic branch of `takeInternalDamage` fires (`PlayerEntity.m:6179-6182`:
`(damage_to & 7) == 7 && ship_trade_in_factor > 75`) and by 1 to 4 on a jump (`:6868-6871`). `EQ_RENOVATION`
raises it by `5 + tech level`, capped at 100 (`PlayerEntity.m:9279-9289`), and the fuel price rises while it is
between 75 and 90 (`PlayerEntity.m:11420-11422`). Phase 19 keeps the factor as the constant
`SHIP_TRADE_IN_FACTOR = 95` in `src/sim/combat/internal-damage.ts`, never persisted, and does not port the
cosmetic branch (Key Decisions row "Keep Oolite's new-ship trade-in factor 95 as a constant and do not port
hull wear (Phase 19, D-05)"). That is exact for a new ship, but a worn ship would in Oolite be more vulnerable
(a lower `n_considered`), cost more to refuel and fetch less on trade-in.

## Goal

Port `ship_trade_in_factor` as one saved, decreasing field together with the cosmetic branch, `EQ_RENOVATION`
and the fuel-price effect, with its own save version bump. The tripwire `tests/guards/hull-wear-tripwire.test.ts`
fails on the first consumer: a non-comment `EQ_RENOVATION` token in `src/`, a second reader of
`SHIP_TRADE_IN_FACTOR` or its spellings outside `src/sim/combat/internal-damage.ts`, or the constant no longer
being exactly `export const SHIP_TRADE_IN_FACTOR = 95;`. Retire the tripwire in the same change.

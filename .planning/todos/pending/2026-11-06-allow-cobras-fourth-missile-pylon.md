---
created: 2026-11-06T11:58:23.065Z
title: Allow Cobra's fourth missile pylon
area: outfitting
severity: major
files:
  - src/sim/player/outfitting.ts:43,214-215,315,407-413
  - src/sim/player/profile.ts:41,58-59
  - src/persistence/save.ts:77,127
  - src/ui/station-model.ts:546,616
  - src/app/game-session.ts:120,430
  - tests/sim/player/outfitting.test.ts:586-600,651-680
  - tests/persistence/save.test.ts
  - .planning/phases/05-docked-economy-station-screens/05-RESEARCH.md:476
  - .planning/PROJECT.md:111
---

## Problem

Oolite's Cobra has `max_missiles = 4` (`Resources/Config/shipdata.plist`; `PlayerEntity.h:284-286` sets `PLAYER_MAX_MISSILES` to 16 and the starting maximum to 4). A new commander starts with three missiles but can buy a fourth.

Wegolite deliberately caps the pylon count at three: `MAX_MISSILES = 3` in `src/sim/player/outfitting.ts:43`, mirrored by `MAX_SAVE_MISSILES = 3` in `src/persistence/save.ts:77` and the `0..3` profile comment. `NEW_GAME_MISSILES` is also 3, which is correct for the starting loadout but is not the purchasable maximum. The cap was recorded as D-14 and `05-RESEARCH.md:476` explicitly says not to fix it back to four.

This is a visible economy/loadout divergence from the Oolite-source-of-truth decision in `PROJECT.md:111`, and Phase 5 is still open. It also changes the missile-removal trade-in: with four 300 dc missiles the catalogue refund is +1000 dc net (4 × 300 − 200), not the current +700 dc at three.

## Solution

Set `MAX_MISSILES` to 4 and `MAX_SAVE_MISSILES` to 4, while keeping `NEW_GAME_MISSILES = 3`. Update the profile comment to `0..4`, every `FitContext.missileCapacity`/F3 capacity display, and the save bounds.

Cover at least these tests:
- buying from three to four succeeds for 300 dc;
- buying at four refuses `pylonsFull`;
- removing all four missiles refunds the full catalogue value (net +1000 dc);
- the save validator accepts `missiles: 4` and rejects `5`;
- the F3 line renders `Missile (3/4)` and `Missile (4/4)`.

Update `PROJECT.md` and `05-RESEARCH.md:476` so the old three-missile decision is explicitly superseded. No content-build change is needed: the compiled Cobra record already carries `max_missiles: 4`.

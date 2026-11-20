---
created: 2026-11-19T12:00:00.000Z
title: Give the player Oolite's inelastic collision reversal when Phase 20 gives the player a death
area: sim
severity: minor
files:
  - src/sim/combat/collide.ts
  - src/sim/combat/response.ts
  - src/sim/combat/ledger.ts
  - src/sim/flight/state.ts
  - src/sim/events.ts
  - tests/guards/collision-player-death.test.ts
---

## Problem

The collision stage (plans 18-11 and 18-18) never makes the player `destroyable`
(`PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` in `src/sim/combat/collide.ts`), because the
player has no death before Phase 20 (D-13). So when a ram would kill the player, Oolite's
inelastic branch is not taken:

- `selfDestroyed = (dam1 > energy)` (`ShipEntity.m:11111`) never holds with the player as
  self, so the other party never gets the reversed `vel2a` (11117-11119), and the 10-tick
  nudge (11136-11147) still runs where Oolite skips it.
- `otherDestroyed` never holds with the player as the other, so a rammer that kills the
  player keeps its rebound and its nudge.
- The ledger floors the player's energy at 0 instead of killing it.

The 18-20 measurements show the real outcome: at 350 m/s into the nav buoy both the player
and the buoy are destroyed (FIDELITY "Player-against-buoy ram").

## Fix (Phase 20's death path)

1. Make the player `destroyable` in `gatherColliders` (remove
   `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20`) in the same commit that gives the player a
   death, and let the D-03 blast give the other party its rebound.
2. Keep Oolite's detail: `selfDestroyed` compares `dam1` with the energy bank only
   (`ShipEntity.m:11111`), although the shields absorb the scrape first in the player's
   `takeScrapeDamage` (`PlayerEntity.m:5726-5744`). A player with full shields can
   therefore survive a ram and still take the inelastic reversal and skip the nudge. Phase
   20 must not "correct" this to shields plus energy (review L246@b45e113).
3. Replace the ledger's energy floor for the player with the death path, and update the
   ledger's marker sentence and this guard together.

## Guard

`tests/guards/collision-player-death.test.ts` fails, naming this file, while
`src/sim/combat/collide.ts` still holds `PLAYER_NOT_DESTROYABLE_UNTIL_PHASE_20` and any of:

- a non-comment `playerDestroyed` token anywhere in `src/sim` other than its two
  declaration lines in `src/sim/events.ts` (the union member and the kind-list entry): an
  emit, a push, a factory, a constant;
- the `FlightMode` union in `src/sim/flight/state.ts` is no longer exactly `"docked"`,
  `"launching"` and `"inFlight"` (a new mode may be a death path);
- `src/sim/combat/ledger.ts` no longer says that the player's energy floors at 0 until the
  player's death in Phase 20.

The commit that gives the player a death removes the marker constant, which retires the
guard, and closes this todo.

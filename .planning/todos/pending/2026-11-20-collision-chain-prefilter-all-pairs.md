---
created: 2026-11-20T12:00:00.000Z
title: Apply Oolite's collision-chain prefilter to every proximity pair, not only buoy pairs
area: sim
severity: minor
files:
  - src/sim/npc/proximity.ts
  - src/sim/npc/collision-chain.ts
  - tests/sim/npc/proximity.test.ts
  - tests/sim/npc/buoy-proximity.test.ts
  - tests/guards/collision-chain-scope.test.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Plan 18-21 ported Oolite's collision-chain prefilter (`filterSortedLists`,
`Universe.m:6713-7144`; `CollisionRegion.m:243-248`, 284-365) as
`src/sim/npc/collision-chain.ts`, and by owner decision (2026-11-20) the
proximity pass applies it to pairs that include a buoy only. Every other pair
(ship-ship, ship-station, ship-player) keeps Phase 14's rule: no prefilter.

In Oolite every pair goes through the chain: a pair is tested only when both
bodies are in one z collision chain (lists sorted by lower edge
`position.z - collision_radius`; a body joins a run when its `z - 2r` lies below
the running `z + 2r` finish; the downward walks never run, so nothing collidable
is eliminated; Oolite z is Wegolite -z). Outside the planet's and the sun's z
slabs this delays the alert of two ships approaching each other along z from
the 4 x r pair trigger to 2 x (r1 + r2), which matters when the radii differ.

## What is known (measured in plan 18-21)

- The owner's 2026-11-20 decision assumed the all-pairs version moves Phase 14
  station case (c) of `tests/sim/npc/proximity.test.ts`. That was measured with
  the work-in-progress port that sorted the lists by centre. With Oolite's
  lower-edge sort, the all-pairs version held every Phase 14 suite unchanged
  (`tests/sim/npc`, `tests/oracles/npc`, `tests/sim/world/populate.test.ts`,
  `tests/app/session/sim-driver.test.ts`, `tests/app/session/tick-parity.test.ts`:
  38 files, 1,655 tests passed); with the centre sort, case (c) fails.
- Not measured: the QUAL-11 acceptance totals (`npm run test:acceptance`) under
  the all-pairs version. They may move (ship-ship alerts far from the planet).

## Fix

1. In `runProximityPass`, compute the chains on every pass with a steered ship
   and gate the station, player and entity-entity pairs with `chainsPair`, as
   the buoy pairs are.
2. Run the Phase 14 suites and the remote QUAL-11 acceptance; record old and
   new numbers. A move needs the owner's acceptance rule (as PD-07 for 18-21).
3. Retire `tests/guards/collision-chain-scope.test.ts` (its rule is this todo)
   and amend the PROJECT.md PD-08 row and FIDELITY's prefilter row.

The guard fails, naming this todo, as soon as the prefilter's scope changes.

---
created: 2026-11-14T12:00:00.000Z
title: Make the buoys block hyperspace jumps, as in Oolite
area: sim
severity: minor
files:
  - src/sim/hyperspace/countdown.ts
  - src/sim/world/layout.ts
  - tests/e2e/hyperspace-failure.spec.ts
  - FIDELITY.md
---

## Problem

Phase 12 keeps both buoys (nav buoy and witchpoint buoy) non-blocking for the jump blockage check, so the
player can start a jump right next to a buoy. Oolite blocks within sqrt(0.1 x mass) of any massive entity;
for each buoy (mass 698,691.1875) that is about 264.3 m. Owner decision (2026-11-14): option A, ships only
in Phase 12. The divergence is recorded in FIDELITY E-22 and in a Key Decisions row of PROJECT.md (plan 12-04).

Why it was not done in Phase 12: `tests/e2e/hyperspace-failure.spec.ts` (seams bundle) restores a save at
(0,0,0) with speed 0, so its countdown completes at the witchpoint buoy. With blocking buoys the jump would be
refused, the injected arrival fault would never run and the spec would time out. The fly-away specs
(`hyperspace.spec.ts`, `autosave.spec.ts`, `core-loop.spec.ts`) commit 10.6 to 13.3 km from the station, outside
the nav buoy window (9,736 to 10,264 m), so they are not affected.

## Solution

Include both buoys in the blockage predicate (the same `isWitchspaceBlocked` path used for ships), move the
`hyperspace-failure.spec.ts` fixture pose off the witchpoint (owner sanction needed: it edits an existing
browser test), and update FIDELITY E-22 and the Key Decisions row.

Check first: the player arrives at the witchpoint buoy, so an immediate re-jump after arrival may be refused
until the ship is about 264 m away. Decide whether that matches Oolite before shipping it.

Revisit: before the next phase that gives buoys another consumer, or in the next fidelity audit.

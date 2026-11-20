---
created: 2026-11-20T12:00:00.000Z
title: Let the torus factor's nearest surface read the live buoys
area: sim
severity: low
files:
  - src/sim/flight/torus.ts
  - FIDELITY.md
---

## Problem

`nearestSurfaceDistance` (`src/sim/flight/torus.ts:53-71`, used by the torus step at :160 and :252) still reads
`layout.navBuoy` and `layout.witchpoint`. Since Phase 18 a buoy can be destroyed (D-04) or moved by a ram (PD-02), so a
destroyed witchpoint beacon still caps the torus factor within 102.4 km of where it was, and a moved buoy counts at its
layout position. Oolite takes the nearest live collidable entity (`PlayerEntity.m:2917-2924`; a dead buoy is gone from
the universe). Raised in the round-2 review of plan 18-07 (L148@2e0bfb3) and recorded as a FIDELITY divergence row by
plan 18-07, which was at its 14-file limit.

## Solution

Pass the live buoy state into the torus step the same way the jump blockage reads it (`ShipField.buoy(key)`: skip a
dead buoy, add the offset), and update the FIDELITY row "Torus factor's nearest surface reads the layout buoys" to
faithful. Deterministic, so no hash risk while the buoys are pristine; a moved or destroyed buoy changes the factor only
within 102.4 km of it. Run the 20-seed NPC acceptance if the change touches `src/sim/world/**`.

---
created: 2026-11-20T00:00:00.000Z
title: Match Oolite's player drift braking at the torus edges (E-138)
source: Phase 18 UAT owner decision 2026-11-20
area: sim
severity: minor
files:
  - src/sim/flight/drift.ts
  - src/sim/flight/torus.ts
---

## Problem

FIDELITY.md row E-138 (`src/Core/Entities/PlayerEntity.m:3387-3405`): after the torus disengages above
maxSpeed Wegolite resets the factor to 1 (Oolite keeps the torus factor); a drift too small for a float32
magnitude is zeroed.

Key sentence from the row: "Oolite brakes with `hyperspeedFactor` for as long as `flightSpeed > maxFlightSpeed`,
while Wegolite resets `torus.factor` to 1 on a disengage (`src/sim/flight/torus.ts:188`) as the speed still
ramps down ... and a drift whose float32 magnitude is 0 becomes the zero vector, where Oolite would keep it
unbraked."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).

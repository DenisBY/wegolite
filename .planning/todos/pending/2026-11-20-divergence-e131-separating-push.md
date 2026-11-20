---
created: 2026-11-20T00:00:00.000Z
title: Port Oolite's 1 m/s separating push from the other body's own collision call (E-131)
source: Phase 18 UAT owner decision 2026-11-20
area: sim
severity: minor
files:
  - src/sim/combat/collide.ts
  - src/sim/combat/step.ts
---

## Problem

FIDELITY.md row E-131 (`src/Core/Entities/ShipEntity.m:11149-11150`): Oolite's other body pushes a separating
player 1 m/s in the same frame; Wegolite runs collisions once after all motion so it does not.

Key sentence from the row: "the stage runs once after every body has moved, not between the bodies' own
updates, so the other side's call sees the same relative velocity as the first call and also returns early.
The 1 m/s push that plan 18-20 measured in Oolite ... therefore does not occur."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).

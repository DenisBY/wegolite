---
created: 2026-11-20T00:00:00.000Z
title: Give a burnt-out wreck Oolite's explosion blast (E-150)
source: Phase 18 UAT owner decision 2026-11-20
area: sim
severity: minor
files:
  - src/sim/world/step.ts
  - src/sim/world/debris.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

FIDELITY.md row E-150 (`src/Core/Entities/ShipEntity.m:11690-11697`): a wreck that burns out gives no blast;
Oolite's explodes with momentum.

Key sentence from the row: "the wreck leaves through `killShip` with no blast, where Oolite's
`takeHeatDamage` destroys it through `getDestroyedBy`, whose explosion deals momentum like any ship's
(`ShipEntity.m:8123-8126`)."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).

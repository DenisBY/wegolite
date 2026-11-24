---
created: 2026-11-20T00:00:00.000Z
title: Port Oolite's compass cycle and its destroyed-beacon handling (E-126)
source: Phase 18 UAT owner decision 2026-11-20
area: sim
severity: minor
files:
  - src/sim/world/aegis.ts
  - src/sim/world/compass.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

FIDELITY.md row E-126 (`src/Core/Entities/PlayerEntity.m:4789-4807`): Wegolite keeps its own compass-cycle model
and skips a destroyed witchpoint beacon; port Oolite's cycle.

Key sentence from the row: "Wegolite has no sun, target or beacon-list compass mode and keeps its own order.
Oolite's cycle walks only the beacons left in the universe (a destroyed one is cleared from the list,
`Universe.m:3446-3463`, `9615-9619`); D-05's destroyed-beacon effect is ported into Wegolite's model as the skip
of the destroyed witchpoint."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).

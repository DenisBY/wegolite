---
created: 2026-11-20T00:00:00.000Z
title: Make the station a collider and resolve subentity contacts as Oolite does (E-135)
source: Phase 18 UAT owner decision 2026-11-20
area: sim
severity: minor
files:
  - src/sim/combat/collide.ts
  - src/sim/world/sorted-lists.ts
  - src/sim/world/step.ts
---

## Problem

FIDELITY.md row E-135 (`src/Core/CollisionRegion.m:341-343`): the station is not a collider in the collision
stage, and a contact through a subentity is resolved once where Oolite may run it twice.

Key sentence from the row: "a contact found through a subentity is resolved once, while Oolite's
`removeObject:self` (`ShipEntity.m:11150`) misses a subentity entry and may process the contact a second time
from the other side ...; and the station, Oolite's prime whenever it is in a pair (`CollisionRegion.m:327-340`),
is not a collider."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).

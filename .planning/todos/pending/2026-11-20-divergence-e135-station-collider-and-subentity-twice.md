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
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

FIDELITY.md row E-135 (`src/Core/CollisionRegion.m:341-343`): the station is not a collider in the collision
stage, and a contact through a subentity is resolved once where Oolite may run it twice.

Key sentence from the row: "a contact found through a subentity is resolved once, while Oolite's
`removeObject:self` (`ShipEntity.m:11150`) misses a subentity entry and may process the contact a second time
from the other side ...; and the station, Oolite's prime whenever it is in a pair (`CollisionRegion.m:327-340`),
is not a collider."

Goal: decide with the owner, when this is scheduled, whether to port Oolite's behaviour or keep the recorded divergence (owner undecided, 2026-11-20).

## Contact proxy per station kind (Phase 22.1)

Phase 22.1 gives each main station kind its own dock record (`src/content/generated/dock-port*.json`). The player's
dock hull contact is still the D-06 axis-aligned contact box of that record, unchanged in this phase by owner
decision D-B (2026-11-27); this todo is where Phase 22.2 finds what that box costs per kind. The hull box of every
kind is the union of its hull meshes (the Icosahedron's includes its main-hull subentity `oolite_ico_hull.dat`); the
contact box is that union plus the parts that protrude past it. Measured from the emitted records (extents in m, full
width x height of the box's front face, against the bounding box of the part that forms the visible front face; the
empty share is `1 - part area / box area`, a lower bound because a bounding box over-counts a part's real silhouette):

| Kind | Contact box x by y | Front-face part | Part x by y | Empty share of the box's front face |
| --- | --- | --- | --- | --- |
| Coriolis | 1000 x 1000 | `oolite_coriolis_faceplate.dat` | 1000 x 1000 | 0 % |
| Dodecahedron | 1336.798 x 1414.3 | `oolite_dodo_faceplate.dat` | 808.15 x 767.68 | 67.2 % |
| Icosahedron | 1286.006 x 1286.006 | `oolite_ico.dat` (front section) | 1271.528 x 794.754 | 38.9 % |

A player off-axis near a Dodecahedron or Icosahedron bounces on that empty space: for the Dodecahedron the box is much
wider and taller than its faceplate (it spans the whole dodecahedron body), and for the Icosahedron the front section
is about 62 % as tall as the box. This is the D-06 axis-aligned box simplification, not a new bug, and it is why the
Coriolis (whose faceplate fills its box) never showed it. Phase 22.2 decides, with the E-135 collider question above,
whether the contact proxy stays a box or becomes the octree.

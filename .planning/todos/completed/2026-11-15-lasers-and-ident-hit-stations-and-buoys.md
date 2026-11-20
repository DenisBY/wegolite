---
created: 2026-11-15T12:00:00.000Z
title: Let lasers hit, and ident lock, the station and the buoys, as in Oolite
area: sim
severity: minor
resolves_phase: 18
files:
  - src/sim/combat/hit.ts
  - src/sim/combat/ident.ts
  - src/sim/combat/aim.ts
  - src/sim/world/layout.ts
  - FIDELITY.md
audit_acknowledged:
  milestone: v2.2
  at: 2026-11-16
---

## Problem

Phase 13 (OQ4, owner-confirmed 2026-11-15) treats the Coriolis station and the
navigation buoys as static entities: a laser beam passes through them, they do
not shield a ship behind them, and the ident system never locks them. Oolite
treats them as ordinary ships, so a laser stops at a station hull and ident can
lock a station or a buoy and print its name.

## Scope when picked up

- Give the station and buoys a hull table (octree) and a collision radius as hit
  and ident candidates, with a stable key for the locked target.
- Teach the ident frame and the lock message to handle that key.
- Decide with the damage work (station damage, missiles) so the hull table and
  the hit rules are built once.
- Update the two FIDELITY.md divergence rows and the PROJECT.md statics row.
- Keep replay hashes unchanged for runs that never fire or ident.

Source: `13-RESEARCH.md` OQ4 and F10; `PROJECT.md` Key Decisions row
"Statics are neither laser nor ident targets".

## Resolution

Done 2026-11-20 in Phase 18 (CBT-17, the folded todo of 18-CONTEXT), closed at the phase close by plan 18-12.

- Plan 18-04: the station is a laser target through Oolite's subentity rule (`doesHitLine:v1:hitEntity:`,
  `ShipEntity.m:1323-1357`): the hull octree, then the faceplate, tris and dock octrees, so a beam stops at
  the station and shields a ship behind it. The station only absorbs a hit (A6).
- Plan 18-05: the buoys are laser targets with 250 energy, recharge 2 per second, are destroyed once at 0
  and tumble where they are drawn.
- Plan 18-15: the buoy's frangible subentity takes routed hits (1 % bleed-through on the buoy), detaches at
  0, and cargo pods and alloy plates are laser targets.
- Plan 18-06: ident locks the station, both buoys (live pose), pods and plates, never wrecks or buoy
  subentities, and names them from the compiled static artifact.

FIDELITY.md: E-48 (the subentity rule, ported; its one divergence is the station's absorb, with no energy
change and no offender consequence) and E-52 (ident acquisition, `faithful`), plus E-118 to E-124. PROJECT.md:
"Statics are laser targets through Oolite's subentity rule (Phase 18, CBT-17)" supersedes "Statics are
neither laser nor ident targets". Still open and tracked elsewhere: the traffic-off HUD prints the raw static
key (`2026-11-20-ident-hud-raw-static-key-traffic-off.md`).

---
created: 2026-11-18T14:00:00.000Z
title: Use each system's main station type (Coriolis, Dodecahedron, Icosahedron)
area: world
severity: normal
files:
  - src/content/schemas/system.ts
  - src/sim/world/layout.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Oolite picks each system's main station from `planetinfo.plist`'s `station` key (`Universe.m:1550`, default
`"coriolis"`): across the 2,048 systems, 167 use `"dodecahedron"` and 57 `"icosahedron"`; the rest are Coriolis.
Wegolite carries the field (`src/content/schemas/system.ts:52`) but always builds a Coriolis station. Owner question
2026-11-18. Rock hermits are a separate, already planned item (REQUIREMENTS `DEATH-04` / `AI-09` / `WORLD-12`).

## Solution

Build the main station from the system's `station` role (the shipdata entries with roles
"dodo dodec dodecahedron station" and "ico icosa icosahedron station"): model, subentities and dock, mass and
collision radius (both compiled by the content build, as for Coriolis in quick tasks 261117-jji and 261117-k1l),
the dock slot shape (`tunnel_*` keys) for docking and the launch view (quick task 261118-l26), and the scanner/aegis
behaviour. Check every place that assumes Coriolis constants (`CORIOLIS_STATION_MASS`, `STATION_RADIUS`, the dock
port geometry, acceptance `STATION_RADIUS_M`), make them per-station, and measure the new stations in the reference
Oolite container (masses and radii, as in 261117-jji). The NPC acceptance run is due (src/sim/world/**).
The launch view (quick 261118-l26) reads the slot depth from `DockGeometry.port.depth` and the mouth from
`layout.dockOffset`, so a per-station dock-port record feeds it without change.

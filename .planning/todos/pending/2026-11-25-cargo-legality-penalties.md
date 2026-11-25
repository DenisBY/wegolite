---
created: 2026-11-25T10:00:00.000Z
title: Apply Oolite's cargo legality penalties on docking and launch
area: economy
severity: minor
files:
  - src/ui/station-model.ts
  - src/sim/events.ts
---

## Problem

The market's Restricted column (FIDELITY E-190) tells the player in its hover
text that docking at the main station with goods it may not import, or
launching from it with goods it may not export, adds to the bounty and marks
the commander as an offender. Wegolite does not apply that penalty yet: the
legality fields feed only the market column, and no code emits
`legalStatusChanged` (`src/sim/events.ts`).

Oolite (7437f22): a station with `market_monitored` (the Coriolis,
dodecahedron and icosahedron main stations, `shipdata.plist`) calls
`markAsOffender:[station legalStatusOfManifest:... export:NO]` on docking
(`PlayerEntity.m:6340-6342`) and `export:YES` on launch
(`PlayerEntity.m:6410-6413`); `legalStatusOfManifest` sums legality × tons
(`StationEntity.m:150-163`) and `markAsOffender` ORs it into `legalStatus`
(`PlayerEntity.m:6024-6032`).

## Solution

Port the docking and launch checks when the legal status and police response
are in scope. The tooltip text in `LEGALITY_TITLES` already describes the
penalty, so it needs no change; check it against the port.

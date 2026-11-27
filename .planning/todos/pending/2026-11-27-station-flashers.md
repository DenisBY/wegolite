---
created: 2026-11-27T18:00:00.000Z
title: Draw the main station's flashers (14 per station in Oolite)
source: Phase 22.1 owner decision D-C, 2026-11-27
area: render
severity: minor
files:
  - src/render/bodies/station.ts
  - src/render/bodies/buoy.ts
  - tests/render/station.test.ts
  - FIDELITY.md
---

## Problem

Oolite draws 14 `flasher` subentities on each main station: the templates
`oolite_template_coriolis-station`, `oolite_template_dodecahedron-station` and
`oolite_template_icosahedron-station` in `shipdata.plist` list them, and
`-[ShipEntity setUpOneFlasher:]` (`src/Core/Entities/ShipEntity.m:851`) builds each as an
`OOFlasherEntity`. Wegolite draws none for any station, the Coriolis included, so the absence
is unrelated to the station kind. Phase 22.1 gave every system its own station model and left
the flashers out by owner decision D-C of 2026-11-27 (PROJECT.md Key Decisions, the Phase 22.1
row).

The divergence is recorded in FIDELITY.md ("Main station flashers (14 `flasher` subentities on
each station type) are not drawn (owner decision D-C)").

## Solution

1. Read the 14 flasher definitions of each of the three station templates from
   `shipdata.plist` (position, size, frequency, phase, colours; the buoy flashers in
   `src/render/bodies/buoy.ts` are the precedent for the compiled form and the drawing).
2. Compile them into each station GLB's extras (`tools/oolite-ingest/convert/glb.ts`) and draw
   them from `src/render/bodies/station.ts`, mindful of the draw-call budget (QUAL-09): 42
   flashers are 14 more draws per station unless they are batched.
3. Replace the tripwire in `tests/render/station.test.ts` ("draws no flasher ...", which names
   this todo) with a test of the drawn flashers, and change the FIDELITY.md row to `faithful`
   or record what remains different.

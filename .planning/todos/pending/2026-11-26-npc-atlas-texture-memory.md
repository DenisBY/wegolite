---
created: 2026-11-26T09:00:00.000Z
title: Reduce NPC atlas texture memory added by the per-hull merge (plan 21-17)
area: content
severity: minor
resolves_phase: null
files:
  - tools/oolite-ingest/convert/atlas.ts
  - .planning/phases/21-roster-state-shape-and-seams/21-17-SUMMARY.md
  - docs/PERFORMANCE.md
---

## Problem

The per-hull atlas merge raised NPC texture memory from 601.0 to 1,023.2 MiB
summed over the 29 records (458.2 to 712.2 MiB counting each file once), and the
background prefetch from 31.2 MB to 33.0 MB. The Cobra variants no longer share
the player's six maps.

Update 2026-11-26 (review fix TOOLS-WR-01): the 32-texel mirrored gutter raised
it further, to 1,200.1 MiB summed (828.3 MiB counting each file once). The prefetch
is now 35.75 MB. An atlas can no longer hold two 1,024-texel maps under the 2,048 cap.

## Solution

Two reductions noted in 21-17-SUMMARY.md, not applied:
- a nearest-filtered one-texel-per-region roughness map;
- a per-slot atlas layout so slots without a texture take no area.

Measure GPU memory on the remote machine before and after. Plan 21-19 records
the GPU frame time; act on this if it shows pressure or when lower-end GPU
support comes into scope.

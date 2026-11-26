---
created: 2026-11-26T09:30:00.000Z
title: World.station, groups and populator must join repairWorldFields when first written
area: sim
severity: minor
resolves_phase: 22
files:
  - src/sim/world/step.ts
  - src/sim/world/sanitize.ts
  - tests/guards/world-record-repair.test.ts
  - .planning/phases/21-roster-state-shape-and-seams/21-06-SUMMARY.md
---

## Problem

Plan 21-06 added the v5 world records `World.station`, `World.groups` and
`World.populator` with sanitizers (`sanitizeStation`, `sanitizeGroups`,
`sanitizePopulator`). Only `hashWorld` calls them today. `repairWorldFields` in
`src/sim/world/step.ts` was left untouched, because no production path writes
the records yet (21-06-SUMMARY deviation 2).

## Tripwire

`tests/guards/world-record-repair.test.ts` fails when any `src/sim/**` code
outside `sanitize.ts` writes one of the records while `repairWorldFields` does
not call all three sanitizers.

## Solution

In the commit that first writes a record (Phase 22 populator, 25 or 26), call the
three sanitizers from `repairWorldFields`, before the step reads the records.

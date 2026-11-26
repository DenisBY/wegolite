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
  - src/sim/world/snapshot.ts
  - tests/sim/world/snapshot-codec.test.ts
resolved: 2026-11-26
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

## Resolution (2026-11-26, phase 21 code review SIM-WR-02)

Done ahead of the first writer, because the review showed that `snapshotWorld`
could write a snapshot `parseWorldSnapshot` refuses (an unsorted group list,
out-of-order station marks, or a launch count past 255) whenever no hash call
had repaired the records first. `repairWorldFields` now calls
`sanitizeGroups`, `sanitizePopulator` and `sanitizeStation` (the order
`hashWorld` uses) before every world step, and `snapshotWorld` calls them after
its non-finite checks and before it copies the records, so a snapshot always
satisfies the parser's invariants. 21-06's recorded design is unchanged: a
repaired out-of-bound leaf becomes its pristine value, not a clamp. On a valid
world the sanitizers repair nothing, so no hash moves (tick-parity, death-twin,
inert-isolation and populate goldens pass unchanged). New tests in
`tests/sim/world/snapshot-codec.test.ts` round-trip a corrupted world through
snapshot and parse, after a step and before any step or hash call. The guard
`tests/guards/world-record-repair.test.ts` stays and passes. Writers that keep
the records sorted (a sorted-insert helper) and saturating `launched` instead
of resetting it remain open for the first writer (Phase 22, 25 or 26), as the
review suggested; they would revise 21-06's pristine-value rule and are not
part of this fix.

---
created: 2026-11-26T09:00:00.000Z
title: Variant family instancing (deferred plan 21-18) when the anarchy draw calls exceed the budget
area: render
severity: minor
resolves_phase: null
files:
  - .planning/phases/21-roster-state-shape-and-seams/21-18-PLAN.md
  - .planning/phases/21-roster-state-shape-and-seams/21-18-SUMMARY.md
  - src/render/bodies/npc-ships.ts
  - tests/e2e/anarchy.spec.ts
---

## Problem

D-05 fix (2) was deferred (21-18-SUMMARY.md): after the per-hull atlas merge the
full anarchy draws 39 / 42 calls against `DRAW_CALL_BUDGET` 50. Variant hulls
(pirate pairs, Cobra, Mamba, Viper, Moray, Python variants) still draw one
instanced mesh set per record key.

## Trigger (tripwire)

`tests/e2e/anarchy.spec.ts` asserts the calls before and after the kill against
`DRAW_CALL_BUDGET` (plan 21-19). When it fails, or when a later phase adds
render keys, run plan 21-18 as written, re-measured on the remote machine,
before any budget raise (D-05 order).

## Solution

Execute `21-18-PLAN.md` (renderKey / variantKey families, `createVariantMaterial`).

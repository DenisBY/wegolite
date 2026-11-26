---
created: 2026-11-26T03:00:00.000Z
title: Phase 22's live populator must set cargoKind; add the runtime check that no ship it places has cargo with kind 0
area: sim
severity: minor
resolves_phase: 22
files:
  - src/sim/world/debris.ts
  - src/sim/world/populate.ts
  - tests/guards/pod-kind-fallback.test.ts
  - .planning/phases/21-roster-state-shape-and-seams/21-14-PLAN.md
---

## Problem

A destroyed ship's cargo pods are drawn with a cargo kind resolved at release
(`resolvePodCargoKind`, `src/sim/world/debris.ts`, plan 21-14, orchestrator
decision 3): the stored `cargoKind` when set, otherwise the role family (trader and
shuttle give plentiful goods, pirate gives pirate goods), otherwise scarce legal
goods. The fallback exists for the frozen inert path only. The inert ships
(`src/sim/world/populate.ts`) must not store a kind at spawn: a stored kind would
print a `ck:` segment and move the epoch 1-20 pin.

If Phase 22's live populator placed ships with cargo and no kind, every pod it
released would silently use the fallback instead of the kind Oolite's populator
assigns (`setCargoType`, `oolite-populator.js`), and nothing would fail.

## Solution

Phase 22's populator sets `cargoKind` on every ship it places with cargo above 0.
It adds a runtime test, over the worlds it builds for a sample of systems and seeds,
that no placed ship has `cargo` above 0 with `cargoKind` 0, and that each placed
ship's kind matches its role's `setCargoType` call.

`tests/guards/pod-kind-fallback.test.ts` already fails when a `src/sim` spawn site
other than `src/sim/world/populate.ts` passes a `cargo` init without naming
`cargoKind`; it is a source-text tripwire and cannot see a kind assembled out of its
sight, hence this runtime check. Phase 22 must not widen the guard's allow-list.

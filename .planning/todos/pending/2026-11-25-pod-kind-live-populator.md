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

## Oolite's assignment to match (owner review, 2026-11-26)

Oolite fixes the cargo when a ship is spawned, never when it dies. The populator
calls `setCargoType(...)` (`oolite-populator.js:1385-1448` and the call sites at
:1492-1522, :1557, :1713, :1864), and `setCargoFlag` (`ShipEntity.m:7323-7375`)
creates the containers there and then. A death releases what is in the hold. The
populator ported in Phase 22 must reproduce this per spawn context:

- a trader leaving the station gets `PLENTIFUL_GOODS`, and one arriving in the
  system gets `SCARCE_GOODS` (Wegolite's role fallback gives every trader
  plentiful goods, so it does not tell the two apart);
- a medical ship gets `MEDICAL_GOODS`, filled with narcotics as recorded in
  FIDELITY E-198 (Oolite's own hold stays empty because of the `@"Narcotics"`
  case mismatch);
- an offender trader switched to the opportunist AI gets `PIRATE_GOODS`, and so do
  pirates; couriers get `ILLEGAL_GOODS`;
- a ship whose type is never set, with no `cargo_carried` in `shipdata`, carries no
  cargo and releases no pods. The scarce-legal fallback in `resolvePodCargoKind`
  stays only for the frozen inert path and the test shooter; live ships must never
  reach it.

When the populator lands, compare each spawn site against the lines above and
update the FIDELITY rows that describe the fallback (E-197 and the E-78 rewrite)
so they say that it applies only to the inert path.

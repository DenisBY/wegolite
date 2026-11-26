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
resolved: 2026-11-26
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

## Resolution (2026-11-26, Phase 22 plans 22-07 to 22-11)

Closed by the runtime check `tests/sim/world/population/cargo-kind.test.ts`
(plan 22-11). It populates worlds through `populateSystemWorld` (the production
spawn path of plan 22-10) for Lave over 20 seeds, the largest anarchy of the
fixtures, Oresrati, and every fixture system at epochs 1 to 3, and asserts for
every placed ship that `cargo` above 0 never goes with `cargoKind` 0 and that
the kind is the one its builder sets: an arriving freighter and courier
`scarce`, a medical hull's freighter `medical`, an opportunist freighter and
every independent or pack-leader pirate `pirate`, a smuggler `contraband`, and
every other ship (hunters, police, the station patrol, interceptors, every
engine escort and pack assistant) no cargo. A medical-only catalogue pins the
`medical` case, which the committed catalogue reaches only through one hull.
Mutation check: storing kind 0 for the smuggler fails four of the five cases.

The builders set the kinds in plans 22-07 (freighter), 22-08 (couriers and the
smuggler) and 22-09 (pirates); plan 22-10's `spawn.ts` names `cargo` and
`cargoKind` together in the one `SpawnInit`. The guard
`tests/guards/pod-kind-fallback.test.ts` keeps its allow-list
(`INERT_PATH_FILES`, the frozen `populate.ts` only) and only its todo path
moved to this file. The role-family fallback in `resolvePodCargoKind` now serves
the inert path alone; FIDELITY E-197 and E-78 say so.

### Correction: couriers do not get `ILLEGAL_GOODS`

The list above says "couriers get `ILLEGAL_GOODS`". That line was a
transcription error (repeated in 22-CONTEXT's Folded Todos). In
`oolite-populator.js` (the same lines at the pin `7437f22`), `_addCourierShort`
(`:1482-1502`) and `_addCourierLong` (`:1505-1525`) set `PLENTIFUL_GOODS` from a
station and `SCARCE_GOODS` arriving (`setCargoType` at `:1492`, `:1499`,
`:1514`, `:1522`), and only `_addSmuggler` sets `ILLEGAL_GOODS` (`:1557`). The
port follows the script, so this is no divergence and takes no FIDELITY row. The
original todo text above is left as it was written.

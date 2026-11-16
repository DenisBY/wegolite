---
created: 2026-11-15T12:00:00.000Z
title: Let lasers hit, and ident lock, the station and the buoys, as in Oolite
area: sim
severity: minor
resolves_phase: 18
files:
  - src/sim/combat/hit.ts
  - src/sim/combat/ident.ts
  - src/sim/combat/aim.ts
  - src/sim/world/layout.ts
  - FIDELITY.md
audit_acknowledged:
  milestone: v2.2
  at: 2026-11-16
---

## Problem

Phase 13 (OQ4, owner-confirmed 2026-11-15) treats the Coriolis station and the
navigation buoys as static entities: a laser beam passes through them, they do
not shield a ship behind them, and the ident system never locks them. Oolite
treats them as ordinary ships, so a laser stops at a station hull and ident can
lock a station or a buoy and print its name.

## Scope when picked up

- Give the station and buoys a hull table (octree) and a collision radius as hit
  and ident candidates, with a stable key for the locked target.
- Teach the ident frame and the lock message to handle that key.
- Decide with the damage work (station damage, missiles) so the hull table and
  the hit rules are built once.
- Update the two FIDELITY.md divergence rows and the PROJECT.md statics row.
- Keep replay hashes unchanged for runs that never fire or ident.

Source: `13-RESEARCH.md` OQ4 and F10; `PROJECT.md` Key Decisions row
"Statics are neither laser nor ident targets".

# Phase 15: Damage Ledger and Kills - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-16
**Phase:** 15-Damage Ledger and Kills
**Areas discussed:** Debris motion model, Events and AI notification, Entity fields and NPC record, Old tests

---

## Debris motion model

| Option | Description | Selected |
|--------|-------------|----------|
| Heading + speed | No new field; drift tied to the nose | |
| Velocity vector | New pristine-omit hashed field; drift independent of orientation, as in Oolite | ✓ |

**User's choice:** Velocity vector (after asking which is more realistic; vector is closer to Oolite and the bump is paid once now).
**Notes:** Lifetime via `Entity.energy` (Oolite way), not a separate field.

## Events and AI notification

| Option | Description | Selected |
|--------|-------------|----------|
| Killer + ships targeting the victim | shipTargetDestroyed/shipKilledOther/shipTargetLost | ✓ |
| Killer only | Minimum | |

**User's choice:** Killer plus those targeting the victim; payloads unchanged (no cause/reason now).

## Entity fields and NPC record

| Option | Description | Selected |
|--------|-------------|----------|
| Capsule count only | One number; commodities drawn at explosion | ✓ |
| Commodity list | Per-capsule commodity stored | |
| Temperature + shot tick | Whole fire-gate state | ✓ |
| Temperature only | Shot timer elsewhere | |

**User's choice:** Count only; temperature + shot tick.

## Old tests

| Option | Description | Selected |
|--------|-------------|----------|
| List in first plan, amend with reason | | ✓ |
| Fix as they fail | | |

**User's choice:** List in the first plan, amend each with a reason.

## Claude's Discretion

Field names, bounds, plan split, ledger record shape, ident message wording.

## Deferred Ideas

Explosion/debris (16), NPC fire (17), statics and collisions (18), `cause` on `playerDestroyed` (20).

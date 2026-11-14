# Phase 13: Views, Lasers and Shields - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 13-views-lasers-and-shields
**Areas discussed:** Octree hit data, Ident lock, Cabin temperature

---

## Octree hit data

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy separate file | First-load unchanged | ✓ |
| In first-load bundle | Simpler, eats the ~597 KB headroom | |
| Researcher decides by measurement | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Sphere first, then octree | As in Oolite | ✓ |
| Octree only | | |

## Ident lock

| Option | Description | Selected |
|--------|-------------|----------|
| Frame on target + name in message line | | ✓ |
| State indicator only | | |
| Nothing until missiles exist | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Oolite rule: R again clears, leaving range resets | | ✓ |
| Only R again clears | | |

## Cabin temperature

| Option | Description | Selected |
|--------|-------------|----------|
| Energy damage only | | ✓ |
| Energy plus sun heating | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Gauge always on HUD, Oolite cooling | | ✓ |
| Gauge only above zero | | |

## Claude's Discretion

- IN-01 fold-in, target-station key, view cameras, HUD layout, constants ledger values

## Deferred Ideas

- Sun and atmosphere heating (DEATH-03, DEATH-05); autonomous NPC fire (CBT-15)

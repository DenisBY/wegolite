# Phase 18: Stations, Buoys and Collisions - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-19
**Phase:** 18-stations-buoys-and-collisions
**Areas discussed:** Collision push, Destroyed buoy, Debris as targets, Buoys block the jump

---

## Collision push

| Option | Description | Selected |
|--------|-------------|----------|
| Full port | Oolite's collideWithShip push, drift vector and thrust braking for NPCs and the player | ✓ |
| Damage only | One damage per contact; ships pass through each other | |
| Player only | Push the player, not NPCs | |

**Blast push onto ships (OC-4), first round:** recommended "do not port" (at most 0.027 m/s). The owner asked for a model check and why Oolite has it at all.
**Independent check (subagent, 2026-11-19):** invisible at non-overlapping range; 14 to 550 m/s on the player when the dying ship's centre is inside the receiver's sphere (a ramming kill). It is Oolite's survivor rebound after a lethal collision (`ShipEntity.m:11111-11131`).

| Option | Description | Selected |
|--------|-------------|----------|
| Port onto everyone | Blast push on ships, player and debris through the same drift | ✓ |
| Debris only | Keep the Phase 16 rule; record the divergence | |

## Destroyed buoy

| Option | Description | Selected |
|--------|-------------|----------|
| Back with a new world | Destroyed for the current world; a jump or load restores it; save format unchanged | ✓ |
| Persist in save | Survives a load; new save schema; not Oolite | |

Note: the question text said "dock and relaunch" as well. Since Wegolite rebuilds the world on every launch, the buoy also returns after a dock, unlike Oolite. That was recorded as an existing lifecycle divergence and deferred.

| Option | Description | Selected |
|--------|-------------|----------|
| Compass as in Oolite | Destroyed beacon leaves the compass cycle by Oolite's rule | ✓ |
| Keep pointing at the point | Simpler; divergence | |

| Option | Description | Selected |
|--------|-------------|----------|
| Move the fixture pose | Sanctioned edit of hyperspace-failure.spec.ts, plus a unit test | ✓ |
| Work around without editing | Hidden test mode; not recommended | |

## Debris as targets

| Option | Description | Selected |
|--------|-------------|----------|
| As in Oolite | canCollide rule: pods and plates are shot, rammed and identified; wrecks are not; no mass-lock | ✓ |
| No ident on debris | Divergence | |

## Buoys block the jump

| Option | Description | Selected |
|--------|-------------|----------|
| Fold into the phase | Buoys block within ~264 m; the fixture is edited once; E-22 closes | ✓ |
| Keep separate | Smaller phase; the fixture is touched twice | |

## Claude's Discretion

- The Coriolis hull file (decided by measurement), the player's collision damage path through shields, the broad phase and pair cost, and the subentity rule at the dock mouth.

## Deferred Ideas

- Keep a destroyed buoy destroyed across dock and relaunch (world-lifecycle change).
- Per-system main station types (its own phase).

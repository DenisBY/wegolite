# Phase 10: Ship Mass - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 10-Ship Mass
**Areas discussed:** Hull set with mass, Jump blockage value, Mass storage and golden

---

## Hull set with mass

| Option | Description | Selected |
|--------|-------------|----------|
| Buoy: compute mass now | Closes the 06-16 data gap | ✓ |
| Buoy: defer | Stays non-blocking | |
| Dodeca/icosa stations: stay non-blocking | Not consumed by Phase 12 | ✓ |
| Dodeca/icosa stations: compute mass | Revisits the recorded 06-16 decision | |

**User's choice:** Buoy yes; the two other station kinds stay non-blocking.

---

## Jump blockage value

| Option | Description | Selected |
|--------|-------------|----------|
| Within tolerance → octree, else ask owner | | ✓ |
| Always octree mass | | |
| Always 455,223,200 | | |

**User's choice:** Within tolerance use the octree value, otherwise ask.

---

## Mass storage and golden

| Option | Description | Selected |
|--------|-------------|----------|
| `mass` field in the NPC catalogue (and client catalogue for Cobra/Coriolis) | | ✓ |
| Separate `ship-mass.json` | | |

**User's choice:** First option. **Notes:** The owner asked whether this repeats the growth of the game-session file; answer: mass is one number per ship in the already separate lazy `ships-npc.json`, so growth is negligible.

---

## Claude's Discretion

- Octree depth, float precision, tolerance, module layout, density default.

## Deferred Ideas

- Dodecahedron/icosahedron station mass; runtime octree queries (DATA-16).

# Phase 8: Session Split and World Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-11
**Phase:** 8-session-split-and-world-core
**Areas discussed:** CI baseline todo, World seed policy (D1), Fixed entity id table, Test hook & traffic opt-in, Split rollout style

The discussion was held in Russian; the answers are recorded in English.

---

## CI baseline todo (Shift+C docking timeout)

| Option | Description | Selected |
|--------|-------------|----------|
| Fold it in | First Phase 8 plan: read CI runs, find the race, fix, get verify-full green | |
| Separate quick task | Handle via /gsd-quick before planning | |

**User's choice:** Neither: skip and ignore it.
**Notes:** The test passes locally; the owner thinks the GitHub runners are slow and the test fails there on a timeout. The baseline is the local container `verify-full`.

---

## World seed policy (D1)

| Option | Description | Selected |
|--------|-------------|----------|
| mix32(marketSeed, epoch) | Saved counter bumped per populate; reload gives the same traffic, later launches differ | ✓ |
| mix32(marketSeed, clock) | No counter; quantised game clock; a same-second relaunch repeats traffic | |
| mix32(systemId, epoch) | Same counter, decoupled from the market seed | |

**User's choice:** mix32(marketSeed, epoch), after an explanation of what the world seed controls and a worked launch/relaunch/reload example.

---

## Fixed entity id table

| Option | Description | Selected |
|--------|-------------|----------|
| Statics low, player 100 | 1 planet, 2 sun, 3 station, 4-5 buoys, 6-99 reserved, 100 player, 101+ dynamic | ✓ |
| Player 1, statics next | 1 player, 2-6 statics, 7+ dynamic (ARCHITECTURE.md draft) | |

| Option | Description | Selected |
|--------|-------------|----------|
| Both buoys are entities | Fixed ids; read from SystemLayout | ✓ |
| Layout-only for now | Buoys join later | |

---

## Test hook & traffic opt-in

| Option | Description | Selected |
|--------|-------------|----------|
| Manual-clock URL mode | `?test=1&clock=manual`; only `advanceTicks(n)` steps the sim | ✓ |
| Only while paused | Works under P pause | |
| Anytime, additive | On top of the live loop; not reproducible | |

| Option | Description | Selected |
|--------|-------------|----------|
| URL flag at boot | `?test=1&traffic=1`, read once | ✓ |
| Hook call at runtime | Toggle mid-session | |

**Notes:** The owner asked what fits the future better and whether this is test-only. The answer: it is test-only; production always has traffic. Combat specs will use a separate scenario-spawn tool. A boot flag keeps the world a pure function of URL and save, and a hook method can be added later because the probe only grows.

| Option | Description | Selected |
|--------|-------------|----------|
| src/sim/ai/ as a real AI module | In the lint zone; reused by Phase 13 | ✓ |
| tests/ fixture only | Out of the bundle | |

---

## Split rollout style

| Option | Description | Selected |
|--------|-------------|----------|
| 10 research steps | One commit per step, verify-full at 3/6/9 | ✓ |
| Coarser, 3-4 moves | Fewer plans, harder to bisect | |

| Option | Description | Selected |
|--------|-------------|----------|
| Parallel with file ownership | Core in Vitest beside the split; shared files owned by the core track; plugged in after step 8 | ✓ |
| Strictly after the split | Simpler, slower, determinism risks surface late | |

**Notes:** The owner asked for the pros and cons of both before choosing.

| Option | Description | Selected |
|--------|-------------|----------|
| Freeze probe during the split | Snapshot pins the shape; new fields added afterwards in one commit | ✓ |
| Add fields as we go | Additive only | |

---

## Claude's Discretion

- Migration of the sim-side `createSeededRandom` caller to the serialisable RNG (identical draw sequence)
- `hashWorld` format (subject to empty-world identity), `EntityStore` internals, lint-rule shape, audio event type reservation, `advanceTicks` naming, changelog handling

## Deferred Ideas

- A scenario-spawn test tool for combat specs (Phase 13 or the first phase that needs it)
- Persisting `epoch`/`nextEntityId` in the save (Phase 11)

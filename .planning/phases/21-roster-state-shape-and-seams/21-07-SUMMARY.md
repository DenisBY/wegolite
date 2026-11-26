---
phase: 21-roster-state-shape-and-seams
plan: 07
subsystem: sim/ai
tags: [priority-ai, ai-keys, ai-events, snapshot-v5, guard, fast-check]
requires:
  - phase: 21-03
    provides: snapshot v5 and the AiComponent params limits it already bounds
provides:
  - the "priority" AI key with an inert registered module
  - PRIORITY_PARAM_KEYS (27 packed keys) and PRIORITY_PARAM_SOURCES (Oolite source per key)
  - 13 appended AI event names
  - a tripwire that nothing spawns a priority AI before Phase 23
affects: [phase-23-priority-ai, 21-12]
tech-stack:
  added: []
  patterns: ["frozen key list pinned in tests/ against world/limits (the AI lint zone forbids the import in src/sim/ai)"]
key-files:
  created:
    - src/sim/ai/priority.ts
    - tests/sim/ai/priority-params.test.ts
    - tests/guards/priority-ai-unspawned.test.ts
  modified:
    - src/sim/ai/types.ts
    - src/sim/ai/registry.ts
key-decisions:
  - "PRIORITY_PARAM_KEYS holds 27 keys (limit in the test: 28, so 4 spare under MAX_AI_PARAMS_KEYS 32; 5 actually spare)"
  - "Oolite's oolite_intership cargo-demand values (cargodemand, cargodemanded, cargodemandmet, cargodemandpaid) and oolite_cargoDropped share one packed key, cd"
  - "lastFleeing, lastAssist and lastPirateVictim are ship references in Oolite (not ticks); the ts key stores them as entity ids"
  - "oolite_cascadeDetected and oolite_pirateLurk are positions in Oolite, not flags; cscd and lurk store [x,y,z]"
status: complete
completed: 2026-11-26
duration: ~35 min
actuals:
  tokens: 6200
  tasks: 2
  commits: 2
plan_head_before: 5b40eb349086b179e008c6f7027f59a6bfd8f54e
plan_head_after: 67edcbf0145ca5898cd8d701c6207b0c95458a46
---

# Phase 21 Plan 07: Priority-AI State Shape Summary

The priority-AI vocabulary is closed inside the one v5 field set: a `"priority"` AI key with an inert registered module, a 27-key packed `params` list proven to round-trip through the v5 snapshot at its largest shape, 13 appended event names, and a guard that nothing spawns the AI before Phase 23.

## What was built

- `src/sim/ai/types.ts`: `AI_KEYS` is now `["test-pilot", "flight-script", "priority"]`; `AI_EVENT_NAMES` gains the 13 names appended in order (the 23 earlier names are untouched; `shipAttacked` stays Wegolite's name for Oolite's `shipBeingAttacked`).
- `src/sim/ai/priority.ts` (new): the inert `priorityAi` (`think` does nothing and reads nothing from `params`; no `onEvent`, so `tests/guards/on-event-handlers.test.ts` stays at one handler), the frozen `PRIORITY_PARAM_KEYS`, the shape type and `PRIORITY_PARAM_SOURCES` (key to shape and Oolite source). The module is `Object.freeze`d, as the AI zone's FOUND-13 lint requires.
- `src/sim/ai/registry.ts`: `priority: Object.freeze(priorityAi)`.
- `tests/sim/ai/priority-params.test.ts` (new): key-list pin against `MAX_AI_PARAMS_KEYS`, the event-name order pin, the largest-shape round trip, the think totality property.
- `tests/guards/priority-ai-unspawned.test.ts` (new): the Phase 23 tripwire.

## PRIORITY_PARAM_KEYS (27) with Oolite sources

Line numbers are `oolite-priorityai.js` at the pin `7437f22`. Absent key means unset; packed arrays use -1 for an unset slot.

| Key | Shape | Stores (Oolite source) |
|-----|-------|------------------------|
| `tree` | id string | the priority list a role script gives the controller (code literal :38-593), selected by id |
| `beh` | id string | the current behaviour function (ARCHITECTURE 4.1) |
| `hs` | id string | the active handler set built per behaviour (`applyHandlers`) |
| `fire` | flag | the hull has a forward weapon (ARCHITECTURE 4.2) |
| `tgt` | number | `oolite_rememberedTarget` (:2621, :3332) |
| `def` | numbers | `ship.defenseTargets` (:1229, :1531, :1620), at most 8 ids |
| `stn` | number | `oolite_selectedStation` (:1884, :4264) |
| `pln` | number | `oolite_selectedPlanet` (:1872, :4223) |
| `dock` | number | `oolite_dockingStation` (:2971, :4732) |
| `dockPos` | numbers | `__ltcache.oolite_dockingclearpos`, the random clearance point (3 numbers) |
| `wpgen` | id string | the waypoint generator closure (:2789, :5213): stationPatrol, witchpointPatrol, spacelanePatrol |
| `wp` | numbers | `oolite_waypoints` (:2789, :5213), flat `[x,y,z,...]` |
| `wpi` | number | the index into `oolite_waypoints` (ARCHITECTURE 4.2) |
| `wpcur` | numbers | `oolite_waypoint` and `oolite_waypointRange` (:6482-6483, :6631-6632): `[x,y,z,range]` |
| `lead` | number | the group leader hint, re-validated at use (`ship.group.leader`, :1178) |
| `cd` | numbers | `oolite_intership` cargo demand and `oolite_cargoDropped`: `[cargodemand (:2138, :3681), cargodemanded (:2042, :3672), cargodemandmet (:2044, :2081), cargodemandpaid (:1519, :3460), oolite_cargoDropped (:5008, :5608)]` |
| `comm` | numbers | `lastCommSent`, `lastCommHeard` (:58-59, :393, :454), in ticks |
| `crp` | strings | `commsRole`, `commsPersonality` (:60-61, :480, :558) |
| `ws` | numbers | the witchspace plan: `[oolite_witchspaceEntry tick (:3105), oolite_witchspaceDestination (:1256, :4337; -1 none), oolite_witchspaceWormhole (:2661, :5651)]` |
| `dist` | numbers | the distress trio (:2602-2604, :5055-5057): `[sender, aggressor, timestamp]` |
| `icpt` | numbers | `oolite_interceptTarget`, `oolite_interceptCoordinates` (:5720-5721): `[target,x,y,z]` |
| `ts` | numbers | `[oolite_lastFleeing (:3230), oolite_lastAssist (:5324), oolite_lastPirateVictim (:3690)]` as entity ids |
| `lurk` | numbers | `oolite_pirateLurk` (:4605): `[x,y,z]` |
| `cscd` | numbers | `oolite_cascadeDetected` (:5017): `[x,y,z]`, absent when none |
| `gp` | number | `oolite_groupPower` (:1471, :1476) |
| `ff` | flag | `oolite_playerFriendlyFireAlready` (:1019) |
| `prole` | id string | `oolite_intership.oolite_player_role` (:1182-1201) |

Deliberately left out: the ECM timer and the missile-launch flag (deferred with ECM and missiles, FIDELITY E-194 / plan 21-05); `oolite_scanResults` and `oolite_scanResultSpecific` (cleared every reconsideration, a per-`think` memo in the port); the `oolite_flag_*` role constants (tree-level constants).

## The 13 appended event names

`approachingPlanetSurface` (:4890, :4981), `cargoDumpedNearby` (:4891, :4998), `commsMessageReceived` (:4893, :5024), `escortAccepted` (:4895, :5062), `shipAcceptedEscort` (:4898, :5194), `shipAttackerDistracted` (:4901, :5294), `shipWillEnterWormhole` (:4908, :5619), `wormholeSuggested` (:4909, :5645), `playerWillEnterWitchspace` (:4915, :5179, :6181), `shipWitchspaceBlocked` (:3055, :5626), `stationWithdrewDockingClearance` (:4929, :6074), `escortDock` (:4938, :6081), `shipScoopedFuel` (:4945, :6172). Each carries a one-line doc naming its Oolite response in `types.ts`. Neither `kill.property.test.ts` nor `steering.property.test.ts` pins a length, and both pass unchanged.

## Evidence

- Round trip: a world with one `viper` ship whose AI is `{ aiKey: "priority", params }`, every key at its largest shape (64-element arrays, 128-character strings, magnitudes near `MAX_ENTITY_MAGNITUDE`), goes `spawnEntity` -> `snapshotWorld` -> JSON -> `parseWorldSnapshot` -> `restoreWorld` with an equal snapshot, an equal `hashWorld`, equal params and a stable second snapshot. One key past `MAX_AI_PARAMS_KEYS` is refused by `spawnEntity`, so the cap the test relies on is the real one.
- Totality property (fast-check): `priorityAi.think` over arbitrary `params` (any value, non-finite numbers, arrays over 64, strings over 128, key counts over 32, keys over 128 characters) never throws; `ctl`, `view` and `random` are Proxies that record any touch, and the test asserts none and that `params` is the same object. The same holds through `AI_REGISTRY.priority` at the largest shape.
- Guard: `priority-ai-unspawned.test.ts` passes on the tree (vacuity floor of 100+ files and named files present), and fails with file and line on synthetic `aiKey: "priority"` in `src/sim/world/populate.ts`, the literal in `src/app/probe.ts`, single-quoted and template forms; comments and `FOOTER_STATUS_PRIORITY`-like identifiers pass; the three defining files are allowed.

## Gate results

| Command | Result |
|---------|--------|
| `docker compose run --rm test npx vitest run tests/sim/ai/priority-params.test.ts tests/guards/on-event-handlers.test.ts tests/guards/ai-zone.test.ts tests/sim/world/snapshot-codec.test.ts` (Task 1) | 4 files, 586 tests passed |
| `docker compose run --rm test npx vitest run tests/guards/priority-ai-unspawned.test.ts tests/guards/on-event-handlers.test.ts tests/sim/combat/kill.property.test.ts tests/sim/npc/steering.property.test.ts tests/sim/ai/priority-params.test.ts` (Task 2) | 5 files, 77 tests passed |
| `docker compose run --rm test` (full) | two full runs, 7 then 6 failures, every one a `TestTimeoutError` (5000 ms, one 30000 ms) under concurrent worktree containers; the six files of the second run (`tests/app/session/tick-flyers.test.ts`, `tests/guards/tools-determinism.test.ts`, `tests/sim/combat/collision-buoy.test.ts`, `tests/sim/combat/kill.property.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`, `tools/oolite-ingest/convert/textures.test.ts`) rerun alone: 6 files, 118 tests passed. The first run's other failing files were cut off by `tail`; the second full run (all assertions, no non-timeout error) shows the same pattern. Timeouts not changed, per the wave brief. |
| `docker compose run --rm lint` | passed (eslint and prettier) |
| `docker compose run --rm typecheck` | passed |

No `verify` and no 20-seed acceptance run: the plan changes no `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The inert module needed `Object.freeze`**
- **Found during:** Task 1 (`lint`)
- **Issue:** the AI zone's FOUND-13 rule (`no-restricted-syntax`) rejects a module-level mutable object in `src/sim/ai/`.
- **Fix:** `export const priorityAi: AiModule = Object.freeze({ think })`, as `TEST_PILOT` and `FLIGHT_SCRIPT` do.
- **Files modified:** `src/sim/ai/priority.ts`
- **Commit:** 3ee28664

### Additions beyond the plan's file list

- `tests/sim/ai/priority-params.test.ts` also holds the event-name order pin (Task 2's behaviour bullet "23 previous names in order followed by the 13") instead of a separate file, so Task 2 modifies that file as well as `types.ts` and the guard.
- The Task 1 test builds the largest shape with every array at 64 elements and every string at 128 characters (stronger than each key's documented length), so any later growth of a key up to the snapshot limit is already covered.

## Hand-offs

- **Phase 23:** the first consumer must (a) add its spawn file to `PRIORITY_FILES` in `tests/guards/priority-ai-unspawned.test.ts` in the same commit, (b) handle the `on-event-handlers` tripwire (`MAX_ON_EVENT_HANDLERS = 1`) before giving `priorityAi` an `onEvent`, and (c) keep new state inside `PRIORITY_PARAM_KEYS` (27 of 32; the test caps the list at 28).
- **21-05 (already noted by the orchestrator):** the ECM cut has no FIDELITY row; not touched here.

## Known Stubs

None. `priorityAi.think` is intentionally inert until Phase 23 (documented in its module doc, guarded by the unspawned tripwire); it is not wired to any UI or data path.

## Threat Flags

None. T-21-14 (a priority AI reaching play early, or a second `onEvent`) is mitigated by the guard and the handler-less module; T-21-35 (oversized params) by the largest-shape round trip and the one-over-the-limit refusal test.

## Self-Check: PASSED

- Files exist: `src/sim/ai/priority.ts`, `tests/sim/ai/priority-params.test.ts`, `tests/guards/priority-ai-unspawned.test.ts` (created); `src/sim/ai/types.ts`, `src/sim/ai/registry.ts` (modified).
- Commits `3ee28664` and `67edcbf0` are ancestors of HEAD.
- `STATE.md` and `ROADMAP.md` untouched.

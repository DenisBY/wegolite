---
phase: 15-damage-ledger-and-kills
plan: 02
subsystem: sim
tags: [world-state, hash, snapshot, sanitiser, found-18, pristine-omit]
status: complete

requires:
  - phase: 15-damage-ledger-and-kills
    provides: plan 15-01 NPC record fields (cargo counts, facings, fragment chance)
provides:
  - "Entity.velocity, Entity.weapon {temperature, lastShotTick, missedShots} and Entity.cargo, pristine at spawn"
  - "World.staticHealth {station, witchpoint, navBuoy} at 25000/250/250 with createStaticHealth and isPristineStaticHealth"
  - "pristine-omit hash segments ;vel: ;wpn: ;cargo: after ;steer: and a staticHealth: line after the world section and before the combat line"
  - "WORLD_SNAPSHOT_VERSION 4 with velocity, weapon, cargo per entity and staticHealth at the root"
  - "sanitizeEntity repair of the three entity fields and the exported sanitizeStaticHealth"
  - "SpawnInit.cargo (validated at spawn) and the bounds MAX_ENTITY_VELOCITY, MAX_WEAPON_TEMPERATURE, MAX_ENTITY_CARGO, STATION_MAX_ENERGY, BUOY_MAX_ENERGY in limits.ts"
affects: [15-03, 16, 17, 18, 19, 20]

plan_head_before: 3e33aab3f2b6fd79cff4b708a1ced481a40d16a2
plan_head_after: 67339cdc35a8958dfa23da8bfc34b5755045097e
commits: 3

actuals:
  tokens: 17700
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pristine-omit hash segments appended after the always-present steer segment, each printing whenever any component is non-zero"
    - "World-level hashed state repaired both every stepped tick (repairWorldFields) and in place before hashing (hashWorld), mirroring sanitizeCombat"

key-files:
  created: []
  modified:
    - src/sim/world/limits.ts
    - src/sim/world/entity.ts
    - src/sim/world/world.ts
    - src/sim/world/serialize.ts
    - src/sim/world/snapshot.ts
    - src/sim/world/sanitize.ts
    - src/sim/world/step.ts
    - src/sim/npc/state.ts
    - tests/sim/world/hash.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/sanitize.test.ts
    - tests/sim/world/spawn-refusal.test.ts

key-decisions:
  - "Every new hashed field of milestone v2.3 is designed once, behind one snapshot bump (3 to 4), so Phases 16 to 20 add no further field or bump"
  - "weapon.temperature is Oolite's forward_weapon_temp only; per-facing temperatures would be a snapshot-format change and are guarded by the converter refusal of aft/port/starboard NPC weapons"
  - "lastShotTick 0 means never fired and reads as ready to fire, never as tick - 0 elapsed"
  - "energy means health for ships and remaining lifetime for debris (D-02), exclusive per kind; tumble stays render-side (D-03); no contact-guard field (D-17)"
  - "A non-finite static-health value heals to the maximum and a static-health repair is counted in no hashed counter"
  - "The codec reports a missing staticHealth root key as not-object (asObject refuses the absent key; the parser does not check presence first)"

requirements-completed: [FOUND-18]

duration: 40 min
completed: 2026-11-16
---

# Phase 15 Plan 02: Hashed fields for debris, weapon, cargo and static health Summary

**Entity velocity, weapon record and cargo count plus per-world static health, hashed pristine-omit, snapshotted under version 4 and repaired by the sanitiser, with the Lave golden still at c1068643.**

## Performance

- **Duration:** about 40 min (including one 79 s remote acceptance run)
- **Tasks:** 3 (tracer for the entity fields, then spawn input and sanitiser, then static health)
- **Files modified:** 12

## Accomplishments

- `Entity.velocity` (D-01), `Entity.weapon` (D-07, D-16) and `Entity.cargo` (D-06) exist on every entity and hold the pristine values (zero vector, zero weapon record, cargo 0) after `spawnEntity`. A fresh spawn hashes byte-identically to its line before the phase: `;steer:` stays the last segment, and each non-pristine field adds exactly its labelled segment after it in the order `;vel:`, `;wpn:`, `;cargo:`. A weapon record with only `temperature`, only `lastShotTick` or only `missedShots` non-zero still prints `;wpn:` (T-15-06).
- `World.staticHealth` (D-08) holds the station, witchpoint and nav-buoy energy at 25000/250/250. `hashWorld` repairs it first (`sanitizeStaticHealth`), then prints one `staticHealth:` line after the world section and before the combat line only when it is not pristine, also for a never-spawned world.
- `WORLD_SNAPSHOT_VERSION` is 4. `parseEntity` and `parseStaticHealth` bound every new key with the `limits.ts` constants through closed `asObject` key lists; versions 3 and 5 are refused.
- `sanitizeEntity` repairs velocity, weapon and cargo field by field and counts no pristine or in-domain value. `sanitizeStaticHealth` runs every stepped tick and before hashing. `SpawnInit.cargo` is validated at spawn (`malformed` for a non-number, `outOfDomain` outside the integers 0..200).
- The Lave golden `tests/golden/world/inert-lave-epoch1.json` is unchanged (fnv `c1068643`) and `populate.test.ts` passes against it: no populated ship has a non-default new field yet.

## Task Commits

1. **Task 1: velocity, weapon and cargo through spawn, hash and snapshot v4 (tracer)** - `11f648c` (feat)
2. **Task 2: spawn cargo input and sanitiser for the entity fields; parser agreement** - `32ca0ff` (feat)
3. **Task 3: per-world staticHealth through world, hash, sanitiser, world step and snapshot** - `67339cd` (feat)

The tracer gate re-ran Task 1's verify (four test files and typecheck) before expansion: green.

## Executor check (R2-14): missing `staticHealth` root key

The codec reports a missing `staticHealth` root key as **`not-object`**. `parseWorldSnapshot` passes the absent key (`read` returns `undefined`) straight to `asObject`, which refuses a non-object with that reason (`src/sim/world/snapshot.ts`, `asObject`). The rejection row pins `not-object`. A present `staticHealth` with a missing leaf (for example `station`) reports `type`, also pinned.

## Acceptance run (QUAL-11 standing gate, by hand on the remote machine)

`/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` against committed HEAD `67339cd`:

- **21 of 21 cases pass** (20 epochs plus the run-minimums case); remote elapsed 79 s (suite 76.7 s); exit 0.
- Across all 20 seeds: `repairs` 0, `aiFaulted` 0, `aiDropped` 0, `hashFailures` 0. `ACCEPTANCE-TOTALS`: stationArrivals 40, interceptArrivals 40, fleeArrivals 40, avoidCollisionEntries 23, attackTicksNearPlayer 61662, stuckWindowsEvaluated 175, frozenWindowsEvaluated 294.
- This one run covers **plans 15-01 and 15-02** (15-01 changed `ships-npc.json`; 15-02 changed `src/sim/world/**`). `repairs 0` counts entity repairs only: static-health repairs are counted nowhere.

## Deviations from Plan

None - plan executed exactly as written.

Minor notes (no behaviour change): `serializeStaticHealth` is exported from `serialize.ts` (the plan named it); `createStaticHealth` and `isPristineStaticHealth` live in `world.ts` and `sanitize.ts` imports `createStaticHealth` from there (no import cycle: `world.ts` does not import the sanitiser). Prettier reformatted a few test lines.

## Gate results

- Targeted per task: hash, snapshot-codec, snapshot, populate (Task 1); sanitize, spawn-refusal, snapshot-codec, populate (Task 2); hash, snapshot-codec, sanitize, snapshot, populate, world-cadence (Task 3): all pass, `world-cadence.test.ts` unchanged.
- `docker compose run --rm test` (full, coverage thresholds on `src/sim/**` met): exit 0. `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean.
- `verify` and `verify-full` not run (pure `src/sim/` plan, per the gate policy).
- Acceptance criteria: `WORLD_SNAPSHOT_VERSION = 4` present and `= 3` absent; the three entity limits and the two static limits each present in `limits.ts`; `forward_weapon_temp` in `entity.ts`; `staticHealth:` and `worldHash` in `serialize.ts`; `sanitizeStaticHealth` in `step.ts`; `MAX_ENTITY_CARGO` in `sanitize.ts`; `init.cargo` in `world.ts`; no `export const` in `sanitize.ts`; golden `c1068643` present.

## Known Stubs

None. The new fields are written only by spawn defaults and tests; their writers arrive in Phases 16 to 18 by design.

## Threat Flags

None. No new endpoint, auth path or network surface. The snapshot parser boundary (T-15-04) gained closed key lists, bounds and refusal rows for every new key, and the non-finite path (T-15-05) is covered by the sanitiser and a per-field NaN case.

## Self-Check: PASSED

- All twelve modified files exist; commits `11f648c`, `32ca0ff` and `67339cd` are ancestors of HEAD; `commits: 3` measured from the plan-head ledger (`3e33aab..HEAD`).

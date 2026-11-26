---
phase: 21-roster-state-shape-and-seams
plan: 12
subsystem: sim-combat
tags: [fire-queue, per-facing-weapons, aft-fire, tripwire, FOUND-20]
requires:
  - phase: 21-03
    provides: per-facing weapon state (aft/port/starboard temperatures, weaponTypes)
  - phase: 21-08
    provides: the 29-record catalogue with six aft-armed hulls
  - phase: 21-09
    provides: widened views, hit-reaction sink
provides:
  - FireRequest { id, facing } and requestFire(world, id, facing)
  - ShipControl.fire(id, facing?)
  - NpcWeapons { fore, aft, port, starboard } and npcLaserRay(entity, weapon, facing)
  - per-facing drain, heat, cooling and on-target sign
  - NpcFlightStats.aftWeapon
  - AFT_ATTACK_BRANCHES_PORTED marker and its guard
affects: [phase-23-combat-ai, 21-14, 21-16]
tech-stack:
  added: []
  patterns: [deferred-work tripwire marker plus guard, per-facing record with absent unarmed facings]
key-files:
  created:
    - tests/sim/npc/fire-aft.test.ts
    - tests/guards/aft-weapon-tripwire.test.ts
  modified:
    - src/sim/world/world.ts
    - src/sim/world/control.ts
    - src/sim/world/control-impl.ts
    - src/sim/combat/aim.ts
    - src/sim/combat/step.ts
    - src/sim/npc/fire.ts
    - src/sim/npc/stats.ts
    - src/sim/npc/behaviours/attack.ts
    - src/sim/ai/test-spawn.ts
    - src/app/session/traffic.ts
    - src/app/session/step-options.ts
    - src/app/session/probe-publisher.ts
    - tests/helpers/npc-weapons.ts
key-decisions:
  - "Forward entry of NpcWeapons is always present (EQ_WEAPON_NONE kept), so a forward-unarmed ship still takes the gate's one draw; only aft/port/starboard omit an unarmed facing"
  - "requestFire ignores non-integer ids and malformed facings; the queue cap is 4 x MAX_ENTITIES (MAX_FIRE_REQUESTS)"
  - "NpcFlightStats.aftWeapon is optional in the type (flightTableFrom always sets it), so hand-built rows of the legacy shape stay valid"
  - "ShipControl.fire spells the facing as its literal union, because the AI-zone guard allows only ./ids.js and ../math.js type imports in control.ts"
requirements-completed: [FOUND-20]
duration: ~95min
completed: 2026-11-26
status: complete
commits: 4
plan_head_before: e9f795e4da35aee7dc0bcf82bbdf1dc73777b385
plan_head_after: 2061c556a4adb46850febb51cc2cd336e8f612c1
actuals:
  tokens: 24000
  tasks: 3
  commits: 4
---

# Phase 21 Plan 12: Per-facing NPC fire and the aft tripwire Summary

**The fire queue, drain, ray, heat, cooling and on-target sign are per facing (fore, aft, port, starboard) with forward behaviour byte-identical, and a marker plus guard keep every attacking AI away from the six aft-armed hulls until Phase 23 ports the aft attack branches.**

## What was built

- **Request shape (`src/sim/world/world.ts`, `control.ts`, `control-impl.ts`).** `FireRequest { id, facing }`; `world.fireQueue: FireRequest[]`; `requestFire(world, id, facing = "fore")` dedupes by (id, facing), caps at `MAX_FIRE_REQUESTS` (4 x `MAX_ENTITIES` = 1024) and ignores non-safe-integer ids and anything that is not one of the four facings. `ShipControl.fire(id, facing?)` is actor-only and delegates to it.
- **Weapon shape (`src/sim/combat/aim.ts`, `src/app/session/traffic.ts`).** `NpcWeapons { fore?, aft?, port?, starboard? }` per spec key; `npcLaserRay(entity, weapon, facing = "fore")` builds the ray through `laserFrame(orientation, facing)`. `trafficContent` builds the map from the compiled facing weapons and positions through `npcWeaponsOf`: `fore` is always present, `aft`/`port`/`starboard` only when armed. Result: anaconda and the other five aft hulls have `fore` and `aft`; adder and the other 22 hulls have `fore` only; no hull has port or starboard.
- **Drain (`src/sim/combat/step.ts`).** `compareFireRequests` sorts by ascending id, then fore, aft, port, starboard. `resolveNpcWeapon` takes the record's weapon for the facing, replaced by `entity.weaponTypes[facing]` when not null (`EQ_WEAPON_NONE` and unknown keys fire nothing with no draw; a laser key swaps the type and keeps the record's mount, or the model origin when the record authors no mount on that facing). The gate gets the facing's temperature and `npcOnTarget(..., facing)`; the heat goes to that facing's temperature; `lastShotTick` and `missedShots` stay single. The gate's draws and their order are unchanged for fore.
- **On-target sign (`src/sim/npc/fire.ts`).** `onTargetCone`/`npcOnTarget` take a facing: fore `+dot(urp, F)`, aft `-dot(urp, F)`, port `-dot(urp, R)`, starboard `+dot(urp, R)` (`ShipEntity.m:9874-9892`). The default is fore.
- **Cooling.** `coolShips` cools all four temperatures by the one float32 rule; a zero temperature is never written, so a forward-only ship prints nothing new in the hash.
- **Stats (`src/sim/npc/stats.ts`).** `NpcFlightStats.aftWeapon` (anaconda pulse laser, `EQ_WEAPON_NONE` for the nine `INERT_RECORD_KEYS`); `isUsable` refuses a row whose aft key is outside the mount vocabulary.
- **Tripwire.** `AFT_ATTACK_BRANCHES_PORTED = false` in `attack.ts` beside the rewritten RUNNING_DEFENSE/ATTACK_BROADSIDE cut note; `TEST_SHOOTER_KEY` ("viper", value unchanged) moved from `probe-publisher.ts` to `test-spawn.ts` and exported; `tests/guards/aft-weapon-tripwire.test.ts` fails while the marker is false if a hook key (`TEST_SHOOTER_KEY`, the three `TEST_FLYER_KEYS`) or an `INERT_RECORD_KEYS` member is aft-armed, if the compiled aft-armed set is not exactly anaconda, anaconda-pirate, boa, boa-pirate, boa-mk2, boa-mk2-pirate, or if any record has a port or starboard weapon. Phase 23 (CBT-19) removes the marker and the guard together.

## Task commits

| Task | Commit | What |
| ---- | ------ | ---- |
| 1 (tracer) | 0eb86abe | queue, control, weapon map, drain, ray, heat, cooling, on-target sign, override rule, tests |
| 2 | abb444a7 | `NpcFlightStats.aftWeapon`, stats and cone-facing tests, queue-shape fixes of existing fire tests |
| 3 | d749cb34 | marker, `TEST_SHOOTER_KEY` export, tripwire guard |
| fix | 2061c556 | `control.ts` keeps the AI-zone import rule (facing as literal union) |

## Verification

- Targeted Vitest per task, `typecheck` and `lint` (exit 0, eslint plus prettier) local.
- Local full `test`: 5 failures on the first run. One was real (the AI-zone guard, fixed in 2061c556). Four were 5 s and 30 s timeouts under parallel container load (`tools-determinism` Math.sin, `tick-flyers`, `world-lifecycle`, `kill.property` releaseDebris); all four files pass alone (78 tests).
- **Remote `verify`:** exit 0, elapsed 213 s, snapshot 2061c556; unit 300 files / 8420 passed (10 skipped), e2e smoke 28 passed.
- **Remote frozen 20-seed acceptance run** (`test npm run test:acceptance`): exit 0, 21 of 21 passed (epochs 0-20), elapsed 88 s, snapshot 2061c556.

## Unchanged pins

No oracle, golden, twin literal or epoch pin was edited (`git diff --name-only e9f795e4..HEAD -- tests/oracles tests/golden` is empty). The fire oracle, fire-cadence, tick-parity and twin tests pass unchanged apart from queue-shape adaptations listed below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing fire tests asserted the old queue shape**
- **Found during:** Task 1 typecheck and Task 2 test runs
- **Issue:** `world.fireQueue` is now `FireRequest[]` and the map values are `NpcWeapons`; about 20 test files built `Map<string, NpcWeapon>` or compared the queue to ids.
- **Fix:** mechanical fixture updates (`{ fore: VIPER_BEAM }`, `{ id, facing: "fore" }`); `realNpcWeapons()` now builds the same per-facing map as `trafficContent`. Behaviour assertions untouched. The `fire-route` property test now expects non-integer ids to be ignored (the integer guard is new).
- **Commits:** 0eb86abe, abb444a7

**2. [Rule 3 - Blocking] AI-zone guard on `control.ts`**
- **Found during:** local full `test`
- **Issue:** the guard allows only type imports from `./ids.js` and `../math.js` in `control.ts`; importing `Facing` broke it.
- **Fix:** spelled the facing as its literal union in `control.ts`; `control-impl.ts` types it as `Facing`, so the compiler keeps them equal. The guard was not edited.
- **Commit:** 2061c556

**3. [Plan wording] `NpcWeapons.fore` kept for a forward-unarmed hull**
- The plan says an `EQ_WEAPON_NONE` facing is omitted. For `fore` that would drop the gate's one draw for a ship with no forward weapon and change draw order, which the byte-identical rule forbids. Only aft, port and starboard omit an unarmed facing.

**4. [Plan wording] `NpcFlightStats.aftWeapon` is optional in the type**
- Required would have forced edits to a dozen hand-built stats rows ("existing stats tests unchanged"). `flightTableFrom` always sets it; `step-integration.test.ts` gained the new field in its exact-equality row.

**5. [Task ordering] Cooling, sign and override landed in the Task 1 commit**
- The tracer needs the aft sign and the facing temperature, so those pieces of Task 2 shipped in Task 1's commit; Task 2's commit carries `aftWeapon`, its tests and the cone-facing tests.

**6. [Scope] `TEST_SHOOTER_KEY` moved**
- The plan said to export the hook keys from `test-spawn.ts` if not already exported; the constant lived privately in `probe-publisher.ts`, so it moved with its value unchanged.

## Issues Encountered

Timeouts in the local full run under load (see Verification); no code change.

## Known Stubs

None. Aft, port and starboard requests are only queued by tests; this is the recorded Phase 23 (CBT-19) hand-off, enforced by the tripwire, not a stub.

## Threat Flags

None. T-21-23 (actor-only, deduped, bounded, sorted drain) and T-21-24 (closed `Facing` union, `isMountKey` before any ray, `isFacing` and integer-id checks in `requestFire`) are mitigated as planned.

## Self-Check: PASSED

- Files exist: `tests/sim/npc/fire-aft.test.ts`, `tests/guards/aft-weapon-tripwire.test.ts`, `src/sim/world/world.ts` (`FireRequest`), `src/sim/combat/aim.ts` (`NpcWeapons`), `src/sim/npc/behaviours/attack.ts` (`AFT_ATTACK_BRANCHES_PORTED = false`).
- Commits 0eb86abe, abb444a7, d749cb34, 2061c556 are ancestors of HEAD.

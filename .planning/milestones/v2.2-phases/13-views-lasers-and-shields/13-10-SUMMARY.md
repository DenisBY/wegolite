---
phase: 13-views-lasers-and-shields
plan: 10
subsystem: sim/combat
tags: [combat, ship-control, npc-fire, shields, energy-recharge, determinism, test-pilot]
status: complete
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-08 resolveShots, CombatOptions, ShotRequest/HitRecord; 13-05 routeDamage; 13-07 Entity.energy; 13-03 firstShipHit; 13-04 hull table"
provides:
  - "ShipControl.fire(id): queues the actor on world.fireQueue, once per tick, ignored for any other id"
  - "World.fireQueue: EntityId[] (empty at every tick boundary, never hashed or saved; snapshotWorld refuses a non-empty queue)"
  - "aim.ts: PLAYER_HULL_KEY, NpcWeapon, npcLaserRay"
  - "CombatOptions.npcWeapons?: ReadonlyMap<string, NpcWeapon>"
  - "resolveShots drains the fire queue, treats the player as a hit candidate and routes a hit on PLAYER_ID through routeDamage; NPC energy recharges before the tick's hits"
  - "createTestPilotAi(tick, { fire }): ctl.fire(self) on each hold-phase think"
  - "tests/helpers/npc-weapons.ts: realNpcWeapons() from ships-npc.json"
affects: [13-11, 13-12, 13-13, 13-15, 14]
requirements-completed: [CBT-07, CBT-06]
actuals:
  tokens: 14400
  tasks: 2
  commits: 3
plan_head_before: 2a15c524d69dcc72798eca94d87dc6ac64011fc9
plan_head_after: a0383033bfe91b3e6e01c24f861b7d8ebb1d4078
tech-stack:
  added: []
  patterns:
    - "Fire is queued data, not an action: the control pushes an id, resolveShots resolves every shot (player and NPC) at the one fixed point after stepWorld, by one hit rule and one damage function"
    - "An optional AI param is added to the param set only when asked for (fire), so existing pilots keep their params and hashes"
    - "Generated file names stay out of src/sim comments: boot-path isolation guards scan source text for them"
key-files:
  created:
    - tests/sim/combat/npc-fire.test.ts
    - tests/helpers/npc-weapons.ts
  modified:
    - src/sim/world/control.ts
    - src/sim/world/control-impl.ts
    - src/sim/world/world.ts
    - src/sim/world/snapshot.ts
    - src/sim/combat/aim.ts
    - src/sim/combat/step.ts
    - src/sim/sim.ts
    - src/sim/ai/pilots/test-pilot.ts
    - tests/sim/world/control.test.ts
    - tests/sim/ai/test-pilot.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/world-cadence.test.ts
key-decisions:
  - "resolveShots gained a trailing dt parameter (seven parameters) because the NPC energy recharge (N1) runs inside it, before the tick's hits apply; the plan placed the recharge there but did not list the parameter. sim.ts passes dt."
  - "A shooter is never its own hit candidate: candidates are filtered per shot, so the player's shot cannot strike the player and an NPC's cannot strike itself. The player is listed first (id 100) so it also leads the ascending-id candidate list."
  - "NPC shots are resolved only when the world was stepped this tick; the fire queue is always drained and cleared first, so on the jump step (or with no world step) queued NPC shots are discarded and the queue is empty at the boundary."
  - "A hit on the player emits shipHit with shield = routeDamage's shieldAbsorbed; the attacker offset is shooter position minus player position and the side test uses the player's forward axis (local -Z)."
  - "The NPC recharge runs for every live non-dead ship each stepped tick, in resolveShots; a full bank is read and left untouched, so no pinned hash moves."
  - "The fire param is added to a test pilot's params only when fire is true, keeping the existing params and hashes of every non-firing pilot."
  - "snapshotWorld reuses the existing queue-not-empty reason for a non-empty fireQueue rather than adding a new SnapshotErrorReason."
coverage:
  - id: D1
    description: "ShipControl.fire queues the actor once per tick; a call for another entity, the player, a static, a ghost or a dead actor is ignored and never throws; the queue stays bounded by the store"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/world/control.test.ts#fire (CBT-07, Pitfall 19, T-13-20, T-13-21)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/control.test.ts#equals the pinned CONTROL_MEMBERS exactly (Pitfall 19)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A Viper 1,500 m ahead facing the player drains the forward shield by 6 and emits shipHit with target PLAYER_ID; from behind the aft shield drains; with the shield down the overflow drains energy and heats the cabin; a player behind the shooter, off the beam or over the hull is not hit"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#an NPC fires at the player through ShipControl (tracer, CBT-07)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The same Viper shot at another NPC drains its energy by the same 6: one hit rule and one damage function for every shooter"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#the same Viper shot at another NPC drains its energy by the same 6"
        status: pass
    human_judgment: false
  - id: D4
    description: "A test pilot created with fire: true fires through its own think in the hold phase and hits the player; without the option it never fires and keeps its old params"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-pilot.test.ts#fire mode (CBT-07)"
        status: pass
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#a scripted test pilot is a working shooter (CBT-07)"
        status: pass
    human_judgment: false
  - id: D5
    description: "NPC energy recharges at its record's rate up to its maximum (70 to 85 at rate 2 in 7.5 s, never above 85), before the tick's hits, only on a stepped tick; a full bank is untouched"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#NPC energy recharge (N1, ShipEntity.m:2414-2422)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The fire queue is empty after every stepped tick and snapshotWorld refuses a non-empty queue"
    requirement: CBT-07
    verification:
      - kind: unit
        ref: "tests/sim/combat/npc-fire.test.ts#the fire queue never reaches a snapshot or a hash"
        status: pass
      - kind: unit
        ref: "tests/sim/world/snapshot-codec.test.ts#refuses an unresolved fire request"
        status: pass
    human_judgment: false
  - id: D7
    description: "Combat with the player holding fire on an Adder and a firing pilot shooting back hashes identically (world plus combat state) at 30, 60 and 144 Hz, with identical shot, hit and refusal tallies"
    requirement: CBT-06
    verification:
      - kind: unit
        ref: "tests/sim/world/world-cadence.test.ts#combat cross-cadence determinism (CBT-06, CBT-07)"
        status: pass
    human_judgment: false
---

# Phase 13 Plan 10: Fire as a ShipControl command Summary

**`ShipControl.fire` queues a shot on a world fire queue that `resolveShots` drains after the world step, so a scripted test pilot hits the player (forward or aft shield first, then energy and cabin heat) and other ships by the same two-stage hit rule and the same damage function as the player's own shots; NPC energy recharges at its record's rate, and a combat scenario hashes identically at 30, 60 and 144 Hz.**

## Performance

- **Duration:** about 25 min wall clock (the full `docker compose run --rm test` takes about 2.5 min)
- **Tasks:** 2 of 2
- **Files:** 2 created (1 test, 1 test helper), 12 modified (8 sim, 4 test)

## Accomplishments

- `ShipControl.fire(id)`: pushes the actor id onto `world.fireQueue` only for a live actor, at most once per tick and at most `MAX_ENTITIES` entries; any other id (another ship, the player, a static, a ghost, a dead actor) is ignored and never throws. The exhaustive `Record<keyof ShipControl, true>` pin gained `fire`.
- `aim.ts`: `PLAYER_HULL_KEY` (`oolite_template_cobra3-player`), `NpcWeapon { laser, offset }` and `npcLaserRay` (origin = position + rotate(q, toWegoliteLocal(offset)), forward facing, range from `LASER_STATS`; null for `EQ_WEAPON_NONE`).
- `resolveShots` drains the queue (copy, numeric sort, clear), builds NPC shot requests from `CombatOptions.npcWeapons`, adds the player as a candidate (key `PLAYER_HULL_KEY`) while launching or in flight with a combat state, merges player and NPC shots in ascending shooter id, and applies a hit on `PLAYER_ID` through `routeDamage(combat, amount, shooterPosition - playerPosition, playerForward)`. NPC-versus-NPC hits are unchanged.
- Test pilot: `createTestPilotAi(tick, { fire })`; a firing pilot calls `ctl.fire(self)` on each hold-phase think while its target is valid.
- NPC energy recharge (N1): every live ship gains `energyRechargeRate * dt` up to `maxEnergy` on a stepped tick, before that tick's hits apply. 70 of 85 at rate 2 is back at 85 after 900 ticks (7.5 s) and never above it.
- `snapshotWorld` refuses a non-empty `fireQueue`; `restoreWorld` and `createWorld` start it empty.
- Cadence: a 6 s scenario (player holds fire on an Adder 2,000 m ahead; a Viper test pilot 1,500 m behind fires back) hashes world plus combat state identically at 30, 60 and 144 Hz and produces identical tallies (the aft shield falls to about 0 and the bank then drains).

## Task Commits

1. **Task 1 (tracer): An NPC fires through ShipControl and hits the player by the shared rule** - `9ee4de0` (feat)
2. **Task 2: Test pilot fire mode, NPC recharge pins, snapshot guard and cross-cadence determinism** - `5deb133` (feat)
3. **Boot-path guard fix** - `a038303` (fix)

Tracer gate: `HUMAN_VERIFY_MODE` end-of-phase with an automated-only `<verify>`; the tracer's tests were re-run green before expansion (`Tracer verified end-to-end - expanding`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `resolveShots` needs `dt`**
- **Found during:** Task 1
- **Issue:** The plan puts the NPC recharge inside `resolveShots` but the function (six parameters, from 13-08) had no step length.
- **Fix:** Added a trailing `dt: number`; `stepSim` passes it. The underscore parameters `_player` and `_combat` are now used.
- **Files modified:** `src/sim/combat/step.ts`, `src/sim/sim.ts`
- **Commit:** `9ee4de0`

**2. [Rule 1 - Bug] Generated file names in new sim comments broke the boot-path isolation guards**
- **Found during:** final full-suite run
- **Issue:** `tests/content/ships-hulls.test.ts` and `ships-npc.test.ts` scan `src/` for the substrings `ships-hulls` and `ships-npc`; my doc comments in `aim.ts` and `step.ts` named the generated files, so two guards failed.
- **Fix:** Reworded the three comments to say "the NPC ship catalogue" and "the generated hull data". No behaviour change.
- **Files modified:** `src/sim/combat/aim.ts`, `src/sim/combat/step.ts`
- **Commit:** `a038303`

**3. [Plan ordering] NPC recharge and the snapshot guard landed in the wrong commits**
- The recharge (listed under Task 2's `step.ts` change) was written in Task 1 together with the rest of the `resolveShots` rewrite, and the `fireQueue: []` line in `restoreWorld` was needed by Task 1's type change. Task 2's commit therefore carries the recharge pins, the pilot fire mode, the `snapshotWorld` refusal and the cadence scenario, but not the recharge code itself. The recharge tests could not show a RED state first for the same reason; they pin the behaviour as specified.
- **Files modified:** `src/sim/combat/step.ts`, `src/sim/world/snapshot.ts`

**Total deviations:** 3 (1 Rule 3, 1 Rule 1, 1 ordering note). **Impact:** none on scope or behaviour; no architectural change.

## Authentication Gates

None.

## Issues Encountered

- The first cadence assertion expected the aft shield at exactly 0; after the shield is shot down it regains 2 points per second, so the scenario asserts it stays below 2 instead.
- The recharge test at exactly 900 ticks cannot assert equality with 85 (float accumulation of 900 additions of 2/120); it asserts within 1e-6 and exact 85 after 60 more ticks.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/combat/npc-fire.test.ts tests/sim/world/control.test.ts` : passed (Task 1)
- `docker compose run --rm test npx vitest run tests/sim/ai/test-pilot.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/snapshot-codec.test.ts` : passed (Task 2)
- `docker compose run --rm test npx vitest run tests/sim/ tests/guards/` : passed (includes the AI-zone import guard)
- `docker compose run --rm test` (whole suite, includes `tests/compliance.test.ts` SPDX check): 166 files, 3450 passed, 2 skipped
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: clean
- Acceptance: `rg -c 'fire\(id: EntityId\)' src/sim/world/control.ts` = 1; `rg -c fireQueue src/sim/world/world.ts` = 2; `rg -c 'ctl.fire' src/sim/ai/pilots/test-pilot.ts` = 1
- `tests/golden/` untouched (`flight-hash-pins.json` not regenerated); `verify` was not run: the plan is pure `src/sim` plus tests (gate policy).

## Known Stubs

None. The `npcWeapons` map is supplied by the caller; until the app wires it (a later plan, with the hull table), NPC shots do not fire in the browser. No NPC fires autonomously in this milestone (the test pilot is never spawned by the populator, D-11).

## Threat Flags

None. T-13-20 (spoofed `fire` for another actor): the `actor(id)` guard, pinned by the wrong-actor cases in `control.test.ts`. T-13-21 (queue flooding): one entry per actor per tick, bounded by `MAX_ENTITIES`, drained every step, refused by `snapshotWorld`.

## Notes for later plans

- `resolveShots(world, worldStepped, player, combat, shots, options, dt)`: seven parameters now. 13-15 adds `stepIdent` after it in `combat/step.ts`; `sim.ts` call shape is otherwise unchanged.
- The app must pass `options.combat.npcWeapons` (from `ships-npc.json`, as `tests/helpers/npc-weapons.ts` shows) for an NPC shot to fire, and `hulls` for it to hit. `PLAYER_HULL_KEY` must be present in the hull table for a hit on the player to land; it is in the generated file.
- `laserRefused` still fires every held tick (throttling is 13-12). NPC fire has no heat, timer or energy cost (A7: autonomous fire and NPC weapon bookkeeping are CBT-15); a firing pilot shoots once per think while it holds.
- CHANGELOG.md not touched: sim-internal, no user-visible effect until the app wires the NPC weapon map.

## Next

Ready for 13-11.

## Self-Check: PASSED

- Created files exist on disk (`tests/sim/combat/npc-fire.test.ts`, `tests/helpers/npc-weapons.ts`); commits `9ee4de0`, `5deb133` and `a038303` are ancestors of HEAD.
- All acceptance criteria and plan verification commands re-run green in Docker.

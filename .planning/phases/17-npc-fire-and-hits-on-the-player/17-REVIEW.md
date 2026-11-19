---
phase: 17-npc-fire-and-hits-on-the-player
reviewed: 2026-11-19T12:00:00Z
depth: standard
files_reviewed: 26
files_reviewed_list:
  - src/app/probe.ts
  - src/app/session/probe-publisher.ts
  - src/sim/ai/pilots/flight-script.ts
  - src/sim/ai/pilots/test-pilot.ts
  - src/sim/ai/test-spawn.ts
  - src/sim/combat/step.ts
  - src/sim/npc/behaviours/attack-close.ts
  - src/sim/npc/behaviours/attack-evade.ts
  - src/sim/npc/behaviours/attack.ts
  - src/sim/npc/behaviours/evasive.ts
  - src/sim/npc/behaviours/flee.ts
  - src/sim/npc/constants.ts
  - src/sim/npc/dispatch.ts
  - src/sim/npc/fire.ts
  - src/sim/npc/target.ts
  - src/sim/npc/track.ts
  - src/sim/world/control-impl.ts
  - src/sim/world/step.ts
  - src/sim/world/world.ts
  - tests/sim/npc/oracle-runner.ts
  - tests/sim/npc/oracle-groups.ts
  - tests/guards/fire-decision-source.test.ts
  - tests/guards/kill-credit-consumers.test.ts
  - tests/guards/on-event-handlers.test.ts
  - tests/guards/ship-hit-consumers.test.ts
  - tests/e2e/combat.spec.ts
findings:
  critical: 0
  warning: 2
  info: 6
  total: 8
  necessity: 0
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-11-19T12:00:00Z
**Depth:** standard
**Files Reviewed:** 26
**Status:** issues_found

## Summary

Reviewed the diff `63a8eaf..HEAD` for the 26 scoped files. Each Oolite claim was checked against `/home/opencode/git/oolite`. The checks covered the gate in `fireWeapon:direction:range:` (`ShipEntity.m:9910-10007`), `onTarget:` (9851-9908), `fireMainWeapon:` and the unarmed weapon data (10009-10046, 440-466, 6461-6467, `equipment.plist:109-119`), cooling (2214-2218), the regen order (2415-2425), `fireLaserShotInDirection:` and `adjustMissedShots:` (10360-10477), `currentAimTolerance` (9761-9810), the `min_d` missed-shot rule (9118-9141), and every fire site and hot-weapon branch (4035, 4038-4180, 3925-3940, 4397-4459, 4550-4580, 4611-4731, 4878-4892).

The port matches Oolite in the places that matter most:

- **Gate order and draw count:** heat, energy and timer refuse with no draw; exactly one `randf()` follows; then roll, range, `onTarget` and the unarmed weapon. An unarmed ship gets EQ_WEAPON_NONE's 32,000 m and 0 energy inside the gate and 0 m in the behaviours, as Oolite's `setWeaponDataFromType` switch gives.
- **Float32 widths:** heat, cooling, and the `0.85f * 256` / `0.25f * 256` thresholds all match.
- **Hot-weapon reads:** they take the pre-shot temperature, the same value Oolite's `weapon_temp` holds after `fireWeapon` sets it from `forward_weapon_temp` and heats only `forward_weapon_temp`.
- **Missed-shot feedback:** it moves at resolution, and `currentAimTolerance` and `trackPrimaryTarget` both read it.
- **Behaviour tails:** the sniper restructure (no return inside 15 km, so both sides reach the 4454 tail) is right.

Determinism and production reachability hold:

- **Non-opt-in worlds stay byte-identical.** Without a firing pilot the temperature stays 0, `coolShips` never writes a 0, every hot branch is an exact no-op, and the `fire` param key exists only when true.
- **Draws stay on the shooter's own stream.** The gate draws from the shooter's combat stream through a local copy that is written back, and no other combat-stream consumer runs between steering and the drain.
- **No ordinary-play firing source.** Populated ships are `ai: null` (`populate.ts:354`), and `npcFireBlocked` refuses `ai === null`. The only pilot builders are called from `src/sim/ai/test-spawn.ts`, which `probe-publisher.ts` alone imports, behind `ctx.runtime.testHookEnabled` (`start-session.ts:750`). Worlds are never persisted: the save keeps only the anchor.
- **Kill-time fire requests are dropped.** A request from a kill-time `onEvent` handler is discarded by `drainAiEventsNow` (`world/step.ts:410-412`).

No BLOCKER was found. The two warnings are:

- **WR-01:** a fidelity divergence that Phase 17's live heat makes reachable, recorded on a false premise.
- **WR-02:** the phase's only browser spec does not assert the HUD readout that criterion 3 names.

The info items are stale docs, a totality gap that the caller covers, an unrecorded energy-width divergence, the open owner question on the D-07 period, guard blind spots, and duplicated preamble code.

## Warnings

### WR-01: The player's ident lock is invisible to `[target primaryTarget] == self`, and Phase 17 makes the heating back-off branch live on that false premise

**File:** `src/sim/npc/behaviours/attack.ts:90-106` (the helper). Consumers: `attack.ts:212-221` (4122, now reachable through live heat) and `attack-close.ts:154` (4658, 4669).
**Issue:** `targetTargetsSelf` returns false whenever the target is the player, because `view.ship(PLAYER_ID)` is undefined. Its doc justifies this as "the player (who never targets an NPC, a recorded scope cut)". That premise has been false since Phase 13:

- The player ident-locks NPCs (`CombatState.identTarget`, `src/sim/combat/state.ts:49`).
- In Oolite the ident lock is the player's primary target: `PlayerEntity.m:3739-3746` calls `[self addTarget:target]` when `ident_engaged` finds a target.

Before Phase 17 the divergence touched only fly-to speed choices. Phase 17 makes the ATTACK_TARGET weapons-heating branch reachable (`ShipEntity.m:4122`: "if our current target isn't targeting us ... back off a bit"). A firing NPC attacking the player, the D-02 hook attacker included, now always takes the evasive-jink back-off (`ATTACK_FLY_FROM_TARGET`) once its weapon passes 64. Oolite would skip that branch while the player holds an ident lock on it and press the attack (the `nearby` / sniper / fly-to selection). The owner's UAT dogfight therefore shows non-Oolite behaviour in exactly the situation it is meant to exercise: the player locked on and shooting back. The "recorded scope cut" wording also hides this from the divergence rows.
**Fix:** Either carry the player's ident target into the view and read it in `targetTargetsSelf`, or keep the cut but correct the record. For the first option, add `playerTargetId` to `WorldView` from `combat.identTarget`:

```ts
export function targetTargetsSelf(view: WorldView, targetId: EntityId, selfId: EntityId): boolean {
  if (targetId === PLAYER_ID) return view.playerTargetId === selfId;
  const ship = view.ship(targetId);
  return ship !== undefined && ship.targetId === selfId;
}
```

The view change touches the steering hash, so make it an explicit decision with a twin re-pin. For the second option, rewrite the doc and the Phase 14 divergence row to say the player's ident lock is ignored, and list the 4122, 4658, 4669 and 3921 reads it changes once heat is live.

### WR-02: The only browser spec does not assert the HUD shield and energy readout that criterion 3 requires

**File:** `tests/e2e/combat.spec.ts:281-302`
**Issue:** Roadmap criterion 3 says the opt-in browser spec "proves the whole route, from a hook-spawned shooter to the shield and energy readout on the HUD". The spec asserts `window.__wegolite.combat.fwdShield` / `.energy` (the sim's combat state through the probe) and `hud.drawn === true`. `hud.drawn` is a generic flag (`src/app/probe.ts:57`) that says nothing about the gauges. The comment admits the gauges "are not separate `hud.elements`" and infers that the HUD "must be drawing" the same state. A regression that broke the gauge wiring (wrong field, stale value, gauge not drawn) would leave this spec green, so the final hop of the criterion is unproven.
**Fix:** Expose the drawn gauge values in the HUD probe (for example `hud.gauges.fwdShield` / `hud.gauges.energy`, the values the renderer last drew) and assert them against the twin's literals, the same way the combat values are asserted. Otherwise, narrow criterion 3's wording in the verification record so it does not claim HUD coverage.

## Info

### IN-01: Stale comments about when an NPC shot happens

**File:** `src/sim/npc/fire.ts:8-10`, `src/sim/ai/test-spawn.ts:68-71`, `tests/e2e/combat.spec.ts:59`
**Issue:** Three comments no longer match the code:

- `fire.ts` says "nothing calls the gate yet: plan 17-05 puts it on the fire-queue drain". `combat/step.ts:274` calls it now.
- `spawnTestShooter`'s doc says "the first think fires and the shot meets the player's hull". Since D-08 the first think only *asks*; the gate may refuse on the roll or `onTarget` (D-04 forbids a first-tick expectation).
- `SHOOTING_TICKS` says "the first within 12 ticks of the spawn". `lastShotTick` 0 is ready at once, and how soon the first shot comes depends on the roll, not on the 12-tick period.

**Fix:** Update the three comments to describe the gated request.

### IN-02: `npcFireGate` is not total for an out-of-type `laser`

**File:** `src/sim/npc/fire.ts:132-144, 176-187`
**Issue:** `laserEnergyUse` and `npcRechargeTicks` index `LASER_STATS[laser]` without a guard. A non-`MountKey` string throws a `TypeError` at the energy check. The only caller guards with `isMountKey` (`combat/step.ts:272`), and `fire.property.test.ts` draws only valid keys. The module header still claims "every function total" (D-17, Pitfall 16).
**Fix:** Return `refuse("noWeapon", false)` (or treat the value as unarmed) when `!isMountKey(input.laser)`, and add the malformed key to the property test. Otherwise, narrow the totality claim to "total over its typed domain".

### IN-03: NPC energy is float64, while Oolite's `energy` and `weapon_energy_use` are GLfloat; Phase 17 adds a compare and a cost on it without recording the width

**File:** `src/sim/combat/step.ts:283, 298`; `src/sim/npc/fire.ts:176-181`
**Issue:** Oolite declares `GLfloat energy` (`Entity.h:134`), and `weapon_energy_use` is GLfloat too (0.8f is not 0.8). `energy <= weapon_energy_use` and `energy -= weapon_energy_use` are float32 operations (`ShipEntity.m:9944, 9968`). The port does both in float64. The temperature gets an explicit float32 rule and a decision-row entry; the energy gate and cost do not. The practical effect is limited to one-ulp boundary cases and slow drift in long fights, but the divergence is unrecorded.
**Fix:** Add the energy width to the NPC fire gate decision row, or apply `Math.fround` to the cost and the bank if the GLfloat rule is meant to extend here.

### IN-04: The D-07 NPC shot period remains an open owner question (beam and military fire about 8 % faster than literal Oolite)

**File:** `src/sim/npc/fire.ts:121-136`
**Issue:** `npcRechargeTicks` returns `round(rate x 120)`: 12 ticks for beam and military. Literal Oolite adds `shot_time += delta_t` (a double) before the behaviour and compares against the float32 `0.1f` (`ShipEntity.m:2221, 9946`), so it fires on frame 13. The divergence is recorded in the decision row and the SUMMARY as owner question 1. It is listed here only so the sign-off does not close with the question unanswered: the twin and browser pins (`TWIN_*` in `combat.spec.ts`) depend on the answer.
**Fix:** None in code until the owner answers. The alternative is a one-line body change plus a re-pin, as documented.

### IN-05: Guard blind spots in the firing-decision and kill-credit tripwires

**File:** `tests/guards/fire-decision-source.test.ts:165-189`, `tests/guards/kill-credit-consumers.test.ts:47-53`
**Issue:** `fire-decision-source` restricts only three things outside `src/sim/ai/**`: the two builder names, `aiKey: "<literal>"`, and value imports of `test-spawn`. Three cases slip through:

- A new builder exported from another `src/sim/ai/**` module and called by `populate.ts`.
- `aiKey: someConst`.
- Code that sets `params.fire = true` on an existing AI component.

The runtime `populate.test.ts` covers only the first case. `kill-credit-consumers` allowlists all of `src/sim/combat/step.ts`, a likely home for a future bounty or rating read. Both guards say they are tripwires, not proofs.
**Fix:** In `fire-decision-source`, also flag writes of a `fire` param outside `src/sim/ai/**` (`/params\s*(?:\.\s*fire|\[\s*["'`]fire["'`]\s*\])\s*=/`) and imports of any `src/sim/ai/**` value module from `src/sim/world/populate.ts`. In `kill-credit-consumers`, narrow the `combat/step.ts` allowance to the specific lines or functions that pass the killer through.

### IN-06: Duplicated preamble in the hook spawn seams

**File:** `src/app/session/probe-publisher.ts:207-224, 238-254`
**Issue:** `spawnAttacker` copies `spawnShooter`'s state, mode, world and record lookup line for line, and both look up `TEST_SHOOTER_KEY`. A future fix to one guard (for example a new mode) can miss the other.
**Fix:** Extract a `liveSpawnContext(): { liveState, world, record } | undefined` helper that both seams call before `markHookMutation()`.

---

_Reviewed: 2026-11-19T12:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

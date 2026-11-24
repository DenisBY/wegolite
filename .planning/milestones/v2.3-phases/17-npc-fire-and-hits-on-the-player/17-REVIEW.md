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

---

# Additional independent reviews (2026-11-19)

Two further independent deep reviews, run at the owner's request after the first (Opus, standard) review above. Neither reviewer saw the other reports.

## Fable — Oolite fidelity and determinism (deep)


# Phase 17: Code Review Report

**Reviewed:** 2026-11-19T07:56:13Z
**Depth:** deep
**Files Reviewed:** 17
**Status:** issues_found

## Summary

Independent deep review of the Phase 17 diff (`63a8eaf..HEAD`) with the focus set by the caller: fidelity of the NPC fire port to Oolite at pin `7437f22` and determinism. Every Oolite citation below was read from `/home/opencode/git/oolite` with `git show 7437f22:...`; the necessity rubric (`~/.claude/gsd-core/references/necessity-review.md`) was read before classification.

**What was verified and holds** (no finding):

- **Gate order and boundaries** (`src/sim/npc/fire.ts:153-204` against `ShipEntity.m:9912-9966`): heat `weapon_temp / 256.0f >= 0.85f` refuses with no draw (`9935-9936`; the port's `temp / 256 < fround(0.85)` is bit-identical because a float32 divided by 256 is exact); energy `<=` refuses (`9944-9945`, port `!(energy > use)`); shot timer `<` refuses so `>=` allows (`9946-9947`, port whole ticks per D-07, `lastShotTick` 0 = ready as `INITIAL_SHOT_TIME 100.0`, `ShipEntity.m:208`, `ShipEntity.h:102`); exactly one `randf()` after the three cheap checks (`9949`); range strict `>` (`9951`); `onTarget` (`9954`); `isWeaponNone` fires nothing after the draw (`9958`). The unarmed path is right: `fireMainWeapon:` reloads `weaponRange` from the registered `EQ_WEAPON_NONE` object (`10014`, `OOWeaponTypeFromString` -> `equipmentTypeWithIdentifier`, `OOConstToString.m:258-270`; range 32000, `equipment.plist:114-121`) and the behaviours see 0 again after `setWeaponDataFromType:nil` (`10042`, `443-464`).
- **Float32 widths**: cooling `fmaxf(t - (float)(6.0f * delta_t), 0.0f)` (`2214-2218`) = `fround(t - fround(6 * dt))` (`fire.ts:280-287`); heat `forward_weapon_temp += weapon_shot_temperature` in float (`9972`) = `fround(t + fround(shot))` (`fire.ts:294-301`); `COMBAT_AI_WEAPON_TEMP_USABLE` = `0.85f * 256.0f` = 217.60000610351562 (`ShipEntity.h:117,120`, `constants.ts:379-393`), `READY` = 64 exactly. Behaviour hot branches compare the float32 field with the float32 product (`attack-close.ts`, `attack-evade.ts`, `attack.ts`).
- **Hot branches read the pre-shot temperature**: Oolite's `weapon_temp` is copied from `forward_weapon_temp` at gate entry (`9917`) before the heat at `9972`, so `4456`, `4577`, `4713` see the post-cooling, pre-shot value; the port reads `entity.weapon.temperature` at steering time, which is the previous tick's cooling result and this tick's pre-shot value. Same recurrence. Break-off `3932` (`forward_weapon_temp < READY`) and the dispatcher's `weapons_heating` (`4078-4090`, `4122`) are live on the same field.
- **Fire sites**: `4035` (evasive), `4454` (sniper), `4575` (six/twelve), `4711` (fly-to) are ported at Oolite's position in control flow (after the early returns, after the frustration blocks, `4414` sniper if/else now falls through to the shared tail as `4449-4458` does). The other `fireMainWeapon:` sites are outside Phase 14's IN list or unreachable: `4607` (`behaviour_attack_mining_target`, no port of ATTACK_MINING_TARGET), `4821` (`behaviour_running_defense`, never selected, turret-guarded), `4891` (flee, turret-guarded), `5391` (`behaviour_scripted_ai`).
- **`onTarget:`** (`9851-9909`): `vector_normal_or_zbasis` on a zero offset, `dq < 0` refuses, `dq > aim*aim` accepts, `astq = sqrt(1 - r^2/(9 d2))` else (`fire.ts:229-250`); `currentAimTolerance` adds `basic_aim /= 1 + missed/4` only at `accuracy >= 0` (`9765-9770`, `target.ts:145-149`); `trackPrimaryTarget`'s `min_d -= 0.0001 * missedShots` floor 0.001 with the factor doubling, only in the `!retreat` `ISNT_AWFUL` branch (`9134-9141`, `track.ts:404-413`). Both are exact identities at `missedShots` 0, so frozen worlds do not move.
- **`adjustMissedShots:`** (`10395-10396`, `10424-10425`, `10468-10477`): -1 on any ship hit, +1 on a miss, floored at 0 (`combat/step.ts:423-428`, `fire.ts:308-312`).
- **Player hit routing** (`PlayerEntity.m:5627-5662`): `rel_pos = attacker position - player position`, `d_forward >= 0` drains the forward shield; the ledger passes the shooter's position and `routeDamage` uses `!(dForward < 0)` (`ledger.ts:99-104`, `shields.ts:132-134`).
- **Determinism**: per ship, steering draws first (`world/step.ts:250-271`, a local copy of `rng.combat` written back), then the gate's single draw at the drain (`combat/step.ts:279-293`, same copy-and-write-back); the drain sorts the queue by id (`:258`), `requestFire` bounds and de-duplicates it (`world.ts:199-203`), and the queue has exactly one drain (`rg fireQueue`: `combat/step.ts:258-259` only; `drainAiEventsNow` truncates handler requests, `world/step.ts:410-412`; `snapshot.ts:493-496` refuses a snapshot with a pending request). `player.tick` is incremented in `stepFlight` (`flight/step.ts:420`) before `stepWorld` and `resolveShots` (`sim.ts:122-135`), so the drain never runs at tick 0 and `lastShotTick = tick` can never collide with the 0 sentinel. No new hashed entity field; `fire` is put on `params` only when true (`flight-script.ts:95-98`, `test-pilot.ts:76-78`); `coolShips` never writes a 0 record (`combat/step.ts:336`); `coolWeapon`, `heatWeapon`, `adjustMissedShots` never return -0.
- **Totality**: every compare is written as a negated `<`/`>=` so NaN refuses; `npcFireBlocked` covers `ai === null` and self-target before the gate with no draw (Oolite's `addTarget:` refuses self at `8660-8661`, so no Oolite draw moves); an unknown laser key is filtered by `isMountKey` before `LASER_STATS` is indexed (`combat/step.ts:272`); a degenerate tracking curve yields a NaN aim point which `onTargetCone` answers `false`.

**Concern**: one fidelity gap the port's own independent oracle models but the port does not (WR-01). The remaining items are documentation and a type-narrowing guard.

## Warnings

### WR-01: The range roll's `randf() * weaponRange` product is float64 in the port, float32 in Oolite and in the phase's own oracle

**File:** `src/sim/npc/fire.ts:189-199`
**Issue:** Oolite evaluates `range > randf() * weaponRange * (accuracy + 7.5)` (`ShipEntity.m:9949`) as `((float)randf() * (GLfloat)weaponRange)` first, a float32 product, then times the double `accuracy + 7.5` (`randf` returns `float`, `legacy_random.c:142-145`; `weaponRange` is `GLfloat`). The port computes `u * weaponRange * (input.accuracy + NPC_FIRE_ACCURACY_OFFSET)` entirely in float64. The independently written oracle states and models the float32 step explicitly: `tests/oracles/npc/fire/derive.ts:219-221` ("the product is `float * float` first, then times a double") and `:264-267` (`Math.fround(draw * weaponRange) * (Math.fround(accuracy) + 7.5)`). The gate fixtures do not catch the gap because every roll row uses a dyadic draw (`gate-roll-passes-at-equality` and `gate-roll-refuses-one-ulp-above-equality`, `fixtures/gate.json:560-609`: `0.25 x 12500 = 3125`, exact in both widths). With the 32-bit fractions `rngNext` produces (`src/sim/rng.ts:36-42`) the two limits differ: for `u = 1234567891 / 2^32`, pulse laser, accuracy -5, the port's limit is `8982.663646747824` and the float32 model's is `8982.66357421875` (7.3e-5 m apart), so a range in that band passes one and fails the other. The `fire.ts` header (lines 19-36) records the sun clause, the turret branch, `unresolved` and `npcFireBlocked` as its cuts and says nothing about this width; neither does `17-04-SUMMARY.md`, `17-05-SUMMARY.md` nor the PROJECT.md decision rows (`rg -i 'roll.*float|fround\(draw'` finds only the oracle). The effect per shot is small (a sub-millimetre band of range) but it is an unrecorded bit-level divergence from the source and from the oracle the phase was told to match (roadmap criterion 4), in the one place the gate draws.
**Fix:** Either match the width in one line and pin it with a non-dyadic equality row, or record the divergence where the header records the other cuts.
```ts
// fire.ts, the roll (ShipEntity.m:9949): float * float first, then times a double
const rollLimit =
  Math.fround(u * weaponRange) * (input.accuracy + NPC_FIRE_ACCURACY_OFFSET);
if (!Number.isFinite(input.range) || !(input.range <= rollLimit)) {
  return refuse("roll", true);
}
```
and add a `gate.json` row whose draw is not a dyadic fraction (for example `draws: [0.3, 0.75]`, pulse laser, accuracy -5, `range` set to `fround(0.3 * 12500) * 2.5`), so `derive.ts` and `npcFireGate` are held to the same boundary. If the owner prefers float64 here (Phase 14's "float64 for every GLfloat field" rule, `14-FIDELITY-REPORT.md:145`, covers fields, not this product), add the divergence to the `fire.ts` header and to the Phase 17 divergence row with the measured 7.3e-5 m figure.

## Info

### IN-01: Already-defended-elsewhere — `weapon.laser === NO_LASER` after `fired`

**File:** `src/sim/combat/step.ts:296`
**Category:** necessity
**Issue:** The clause `|| weapon.laser === NO_LASER` runs after the gate returned `fired`, which it cannot do for `NO_LASER` (`fire.ts:202` refuses `noWeapon` first), and after `npcLaserRay` returned non-null, which it cannot do for `NO_LASER` either (`aim.ts:114`). The branch is unreachable; it exists only to narrow `NpcWeapon.laser: MountKey` (`aim.ts:40-43`) to `LaserKey` for `LASER_STATS[weapon.laser]`. The classification rests on judgment because the guard is load-bearing for the type system, not for behaviour.
**Fix:** Narrow once where the ray is built instead of re-testing the gate's result, for example have `npcLaserRay` return `{ ray, laser: LaserKey } | null`, or compute `const laser = weapon.laser; if (laser === NO_LASER) { /* unreachable after fired */ continue; }` before `npcLaserRay` with a comment that names the gate's `noWeapon` refusal as the real guard.

### IN-02: The unarmed weapon range is 32000 in `fire.ts` and 0 in `attack.ts`; both are right, neither says so

**File:** `src/sim/npc/fire.ts:66-75`, `src/sim/npc/behaviours/attack.ts:9-13`
**Issue:** `fire.ts` documents the unarmed gate call with `weaponRange` 32000 (the registered `EQ_WEAPON_NONE` object that `fireMainWeapon:` loads at `ShipEntity.m:10014`), while `attack.ts` documents `NO_WEAPON_RANGE` 0 for the same weapon ("`getWeaponRangeFromType(nil)` is 0", `443-466`, `13041-13044`). Both are what Oolite does, because `fireMainWeapon:` resets `weaponRange` to the nil type's 0 again after the gate (`10020-10043`), but a reader of either header sees a contradiction and the compiled catalogue does carry one `EQ_WEAPON_NONE` record (`src/content/generated/ships-npc.json`).
**Fix:** One sentence in each header pointing at the other: the gate sees the NONE object's 32000 (`10014`), the behaviours see the nil type's 0 (`10042`), and the reload between them is why the two constants differ.

### IN-03: Width divergences inherited from recorded rules but not cited at the new sites

**File:** `src/sim/combat/step.ts:298`, `src/sim/npc/target.ts:147-148`
**Issue:** Two new arithmetic sites run in float64 where Oolite rounds to float32, and the only record of that choice lives elsewhere: (a) `shooter.energy -= stats.energy` and the gate's `energy <= use` compare on a double `entity.energy` where Oolite's `energy` is `GLfloat` (`Entity.h:134`); the oracle states "Energy is float64 by the plan's contract" (`derive.ts:36-37`). (b) `basicAim /= 1 + missedShots / 4` in float64 where Oolite stores `basic_aim` back into a `GLfloat` after each divide (`ShipEntity.m:9763, 9769, 9775`) and squares it in float (`9804`); Phase 14 recorded "float64 for every GLfloat field except `frustration` and `successFactor`" (`14-FIDELITY-REPORT.md:145`) and the oracle holds the on-target equality fixture in both widths. Neither site cites the rule it relies on, so the next reader of `fire.ts`'s "float32 temperature" comment will not know why energy and aim are not.
**Fix:** Add the rule citation at each site (one comment line each: "energy is float64 by the 17-01 oracle contract (`derive.ts:36`)"; "float64 like every GLfloat field, 14-09 rule"), so the width decisions are discoverable from the code.

### IN-04: The drain skips the gate, and its draw, when no NPC weapon table is passed

**File:** `src/sim/combat/step.ts:262-263`
**Issue:** When `options.combat.npcWeapons` is undefined the queue is cleared and no gate runs, so an opted-in ship's `rng.combat` does not advance; with the table present it advances once per request. The app passes the table only when traffic content is loaded (`src/app/session/step-options.ts:122`, `src/app/session/sim-driver.ts:180-182`), so the same seed and command stream produce different combat-stream positions for an opted-in ship depending on content loading. Frozen worlds opt in to nothing and the `?test=1` session is tainted, so no durable state is affected; this is a replay nuance for the hook and for tests that construct a world without the table.
**Fix:** State it in the drain's header next to "nothing fires when ... no weapon table was passed" ("and no draw is taken, so a world stepped without the table does not advance an opted-in ship's combat stream"), or have the test helpers always pass the compiled table so hashes in tests do not depend on the option.

---

_Reviewed: 2026-11-19T07:56:13Z_
_Reviewer: Claude (gsd-code-reviewer, Fable 5.1)_
_Depth: deep_

## Sonnet — simplicity, maintainability, test quality (deep)


# Phase 17: Code Review Report (simplicity, maintainability, test quality)

**Depth:** deep. Docker run of the four guards and `oracle-coverage.test.ts`: 5 files, 68 tests, all green.

## Summary

No correctness bug found in the focus area. src/sim stays pure (no Three.js or DOM imports in `fire.ts`,
`combat/step.ts`, `world/*`, `ai/*`), no scratch files were added, and CHANGELOG has `Added` and `Changed`
entries. The cost is in the tests: three of the four guards carry ~120 lines of copy-pasted lexer code, the
kill-credit guard is a heuristic regex where a whole-word scan is stronger, one guard hard-codes a registry key set,
and a dead `FIRE_ORACLE_PENDING` scaffold shipped.

## Warnings

### WR-01: Guard helpers copy-pasted into every guard (`withoutComments`, `lineOf`, `listSrcFiles`)

**File:** `tests/guards/fire-decision-source.test.ts:69-116,192-207`, `tests/guards/kill-credit-consumers.test.ts:67-114,172-187`, `tests/guards/ship-hit-consumers.test.ts:51-98,114-129`
**Issue:** Three new byte-identical copies of the comment stripper, `lineOf` and the `src` walker, on top of the
existing copies in `entity-id-scope.test.ts:50,91,152` and `sim-purity.test.ts:93`. The stated reason ("each guard
stays independent of the others' helpers") does not hold: `tests/guards/` already shares `eslint-gate.ts`,
`probe-lock.ts` and `sim-probe.ts`. A bug fix to the lexer (see WR-03) now needs five edits.
**Fix:** Add `tests/guards/source-scan.ts` exporting `withoutComments`, `lineOf`, `listSrcFiles` (and
`valueSpecifiers` if kept) and import it. Net about -130 lines. Worth doing now, before a fifth guard is copied.

### WR-02: Kill-credit guard is a heuristic regex stack; a whole-word scan is narrower in code and stronger

**File:** `tests/guards/kill-credit-consumers.test.ts:116-169`, allowlist at `:47-53`
**Issue:** Reads are caught with `PROPERTY_READ`, `INDEX_READ` and `DESTRUCTURING_READ` (`:129-130`). That last
pattern is the most brittle line in the phase: it only matches flat `{...}` patterns and misses nested patterns,
`const e = event; e["kil"+"ler"]`-style access and aliased types. The word `killer` appears in src only in
`ledger.ts`, `kill.ts`, `step.ts` and `events.ts` (verified with `rg -nw killer src`). A plain
`\bkiller\b` scan outside those four files, as `ship-hit-consumers` already does for `shipHit`, catches every form
including destructuring and renamed aliases. Its only false positive is a local named `killer`, which is the
signal the guard wants to raise anyway. Also `src/sim/ai/types.ts` is in `KILL_PATH_FILES` (`:52`) but contains
no `killer`, so the allowlist is wider than needed and a consumer added there would pass.
**Fix:** Replace the three regexes and `patternHasKillerKey` with one word scan, drop `src/sim/ai/types.ts` from
`KILL_PATH_FILES`, keep the `shipTargetDestroyed|shipKilledOther` scan. The test file shrinks from 317 to about 120
lines. Worth doing now: it also removes the blind spot the header admits to.

### WR-03: Hand-rolled comment stripper treats a regex literal as a string

**File:** `tests/guards/fire-decision-source.test.ts:88-100` (same code in the other two guards and the two old ones)
**Issue:** Any `"`, `'` or backtick inside a regex literal opens a "string". Today it works by luck:
`src/persistence/save.ts:457` (`/"version"\s*:.../`) and `src/content/systems.test.ts:74` have balanced quotes.
The first src regex such as `/['"]/` or `/'/` desynchronises the scanner for the rest of the file. The result is
silent: text after it is swallowed or comments are kept, so a guard can pass while a real consumer sits in that file.
**Fix:** `typescript` is already a devDependency; `ts.createSourceFile` plus an identifier walk gives exact
comment and string handling and also lets `shipHit` or `killer` checks look at `Identifier` and string-literal
nodes only. Alternative with no new dependency: keep the scanner but add one guard-test case with a stray-quote
regex so the failure is at least visible. Can wait, but fold it into the WR-01 helper so there is one place to fix.

### WR-04: `on-event-handlers` pins the registry key set, so an unrelated AI module fails it

**File:** `tests/guards/on-event-handlers.test.ts:54-63`
**Issue:** `expect(Object.keys(AI_REGISTRY).sort()).toEqual(["flight-script", "test-pilot"])` and
`onEventHandlerCount(AI_REGISTRY)).toBe(1)` make the guard fail when someone adds any third pilot with no
`onEvent`, or removes the `flight-script` handler. That is a false positive on a legitimate change, and the
failure carries no todo path (the todo text sits only in `ON_EVENT_RULE`, which this test does not print). The
guard intent is "at most one"; the vacuity floor needs only "at least one".
**Fix:** `expect(Object.keys(AI_REGISTRY).length).toBeGreaterThan(0)` and `expect(count).toBeGreaterThanOrEqual(1)`
(or drop the exact assertions and keep `holds the bound on the real registry`). Worth doing now, one line.

### WR-05: `fire-decision-source` guard is 387 lines for weak, evadable rules

**File:** `tests/guards/fire-decision-source.test.ts:165-189,209-387`
**Issue:** Rule 2 (`\baiKey\s*:\s*["'`]`, `:176`) is evaded by `aiKey: KEY` or a spread, and is mostly covered by
rule 1 (the builders are the only way to make a pilot record). Rule 3 (seam importer) has real value (the AI zone
lint bans imports out of the AI zone, not into it) but carries a `valueSpecifiers` parser (`:135-162`) for
re-exports, dynamic and side-effect imports. 13 tests, about 60% of the file, test the guard's own scanner. A seam
re-exported by a new file under `src/sim/ai/` (allowed by the `AI_DIRECTORY` prefix) and imported from the app
slips through. The failure text also cites process jargon ("advisor decision 3, orchestrator disposition 3",
`:5-6,53`) that means nothing to a later maintainer.
**Fix:** Keep rule 1 (builder name outside `src/sim/ai/` and `probe-publisher.ts`) and rule 3 reduced to "the string
`sim/ai/test-spawn` outside `probe-publisher.ts` and tests, value or type, ignoring comments"; drop rule 2 and the
specifier parser; replace jargon with "CBT-15 / D-14". Target about 120 lines. Can wait; do it together with WR-01.

### WR-06: Dead scaffold `FIRE_ORACLE_PENDING` / `FireOraclePending`

**File:** `tests/sim/npc/oracle-groups.ts:106-116,148-156`, consumers `tests/sim/npc/oracle-coverage.test.ts:55,161,168`
**Issue:** The list is empty "since plan 17-08" and `oracle-coverage.test.ts:168` asserts it stays empty. An
empty frozen array, an interface, a union in the coverage test and an assertion that it is empty protect nothing
(necessity: generality without instantiation; the phase is complete and the list can never be non-empty by plan).
**Fix:** Delete the interface, the constant, the spread at `oracle-coverage.test.ts:161` and the `toEqual([])`
assertion at `:168`. Worth doing now, trivial.
**Category:** necessity (provable from the repo: sole non-test reference is the assertion itself).

## Info

### IN-01: Triplicated hook precondition block in `probe-publisher.ts`

**File:** `src/app/session/probe-publisher.ts:207-254,266-291`
**Issue:** `spawnShooter`, `spawnAttacker` and `spawnFlyers` repeat the "state defined, not disposed, `inFlight`,
world defined" prelude (about 10 lines each). `spawnAttacker` also finds its record through `TEST_SHOOTER_KEY`, a
name that now reads wrong for the attacker.
**Fix:** One local `inFlightWorld(): { state: FlightState; world: World } | undefined`, and a
`TEST_VIPER_KEY` alias or rename. Optional; do when a fourth seam appears.

### IN-02: `spawnTestAttacker` copies `spawnTestShooter`'s spawn body; distance constant duplicated

**File:** `src/sim/ai/test-spawn.ts:118-170` against `:84-116`, `:123` against `:173`
**Issue:** Position along the nose, half turn about up, radius, energy fields and `spawnEntity` call are identical
except the AI record and `cargo`. `TEST_ATTACKER_DISTANCE = 3_000` is a second constant with the value of
`TEST_FLYER_DISTANCE` (`:173`), and a test pins the literal (`tests/sim/ai/test-spawn.test.ts:406`).
**Fix:** Private `spawnFacingPlayer(world, player, record, tick, distance, ai, extra)` used by both, and reuse
`TEST_FLYER_DISTANCE` or a single `TEST_SPAWN_DISTANCE`. A small win; do not make it a general spawner.

### IN-03: Process jargon and an open owner question left in source comments

**File:** `src/sim/npc/fire.ts:121-131` ("orchestrator disposition 1", "Owner question 1 at sign-off may replace this
body"), `src/sim/combat/step.ts:226` ("advisor decision 2"), `src/sim/ai/test-spawn.ts:67-73` and
`src/sim/combat/step.ts:~345` (comment lines reflowed unevenly, one over 100 columns), `tests/e2e/combat.spec.ts:74-77`
(over-long line).
**Issue:** The comments cite chat roles and an unresolved sign-off question instead of a durable source (a decision
row or a D-number). The 13/301 alternative is described in code as pending.
**Fix:** Replace with the D-number or Key Decisions row; if the owner already answered question 1, delete the
sentence; if not, move it to a todo. Re-wrap the long comment lines.

### IN-04: `weapon.laser === NO_LASER` after `fired` is type narrowing only

**File:** `src/sim/combat/step.ts:~293` (`if (ray === null || weapon.laser === NO_LASER) continue;`)
**Issue:** The gate refuses `noWeapon` for `NO_LASER` and `npcLaserRay` returns null for it, so the second clause
is unreachable; it exists only so `LASER_STATS[weapon.laser]` type-checks. A reader will take it for a live branch.
**Fix:** Add `// narrows weapon.laser to LaserKey; the gate already refused NO_LASER` or narrow once above the gate.

### IN-05: Exports no one uses outside `fire.ts`; `drew` only read by tests

**File:** `src/sim/npc/fire.ts:57,64` (`NPC_FIRE_ACCURACY_OFFSET`, `ON_TARGET_RADIUS_FACTOR`), `:112-119` (`drew`)
**Issue:** The two constants are exported but unused elsewhere and, unlike every other NPC constant, are not in the
`constants.test.ts` ledger. `drew` is produced on every refusal but read only by tests (production reads
`result.kind` alone); tests already count draws with a stub, so it is a result field for the test.
**Fix:** Drop `export` on the constants or move them to `constants.ts` with a ledger row. Keep `drew` only if the
oracle really needs it. Can wait.
**Category:** necessity (judgment).

### IN-06: `oracle-runner.ts` per-tick destructure and a mirrored cooling cadence

**File:** `tests/sim/npc/oracle-runner.ts:~808` (`const { fireCalls } = options;` inside the update loop),
`:458-470` (`weaponHooks` re-implements `coolShips` ordering)
**Issue:** The destructure is loop-invariant. `weaponHooks` cools after each update to match
`combat/step.ts:coolShips`; if that cadence changes the fixtures would drift with no compile error.
**Fix:** Hoist the destructure above the loop; add a one-line comment pointing at `coolShips`.

### IN-07: Tautological and brittle test assertions

**File:** `tests/sim/npc/constants.test.ts:324-327`, `tests/e2e/combat.spec.ts:82,407,75-95`
**Issue:** `NPC_WEAPON_TEMP_USABLE` is asserted equal to the same expression the source computes, after the
literal row at `:226` already pins it. In the e2e spec, `TWIN_PLATES_AT_KILL = 0` with `...(TWIN_PLATES_AT_KILL > 0
? [PLATE_GLB] : [])` is a branch that cannot run; the 9-decimal floats `210.13333333333128` and
`0.18333333333333332` plus `TWIN_KILL_OFFSET = 672` re-pin on any RNG-stream or ordering change in two places
(the Node twin and this spec).
**Fix:** Delete the two derived assertions; remove the plate constant and branch (and `PLATE_GLB` if unused); keep the
twin pin but note it is a snapshot. Can wait.
**Category:** necessity (the plate branch, provable: constant is 0).

---

_Reviewed: 2026-11-19_
_Reviewer: Claude (gsd-code-reviewer, sonnet)_
_Depth: deep_

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC fire gate (CBT-15, Phase 17 plan 17-04): Oolite's
 * `fireWeapon:direction:range:` refusal chain and `onTarget:` as pure, total
 * functions, plus the three weapon-state updates the caller applies around it
 * (cooling, heating, the missed-shot counter). Nothing here writes entity
 * state; the one caller is the fire-queue drain in `src/sim/combat/step.ts`
 * (plan 17-05).
 *
 * Sources (pin `7437f22`): the gate `ShipEntity.m:9933-9993`, `onTarget:`
 * 9851-9909, the cooling at the top of every update 2214-2218, and
 * `adjustMissedShots:` 10468-10477. Decisions: D-04 (the roll as in Oolite,
 * from the shooter's own draw, no bypass), D-07 (a whole-tick shot timer at
 * Oolite's literal frame count, revised by the owner 2026-11-19, UAT test 1,
 * gap G-17-1; float32 temperature, cost and heat on a fired shot) and D-17
 * (every function total).
 *
 * Width of the roll: `randf()` is a float and `weaponRange` a GLfloat, so the
 * product `u * weaponRange` is rounded to float32 (`Math.fround`) before the
 * double `accuracy + 7.5` factor, as in Oolite (9949) and in the independent
 * oracle. This is the one product the gate rounds; the energy compare and the
 * aim tolerance stay float64 (the 17-01 oracle contract, Phase 14 rule).
 *
 * Recorded cuts and additions:
 *
 * - The sun clause of `onTarget:` (9868, `isSunlit && !target->isSunlit &&
 *   randf() < 0.75`) is inert: no shadow is modelled, so no ship is sunlit and
 *   the clause draws nothing. The same holds for the glare term of
 *   `currentAimTolerance` (see `target.ts`).
 * - A turret laser answers YES at the top of `onTarget:` (9858); no compiled
 *   ship mounts one, so the branch is not ported.
 * - `unresolved`: a ship whose accuracy is still the unresolved sentinel
 *   refuses with no draw (Wegolite-only; Oolite draws its accuracy at spawn).
 * - `npcFireBlocked`: a ship with no AI, or one that targets itself, is
 *   refused by the caller before the gate with no draw and no write. Oolite
 *   has neither case (`addTarget:` refuses self, 8661-8662), so blocking them
 *   moves no draw Oolite could take (Pitfall 16).
 *
 * Totality: every compare is written so a NaN refuses (`!(x < y)`), there is no
 * indexing without a guard and there is no try/catch (steering and combat sit
 * outside AI fault containment, Pitfall 16). The gate takes at most one draw.
 */

import { TICKS_PER_SECOND } from "../ai/time.js";
import { LASER_STATS, WEAPON_COOLING_FACTOR } from "../combat/constants.js";
import { NO_LASER } from "../combat/mounts.js";
import type { LaserKey, MountKey } from "../combat/mounts.js";
import { dot, length, rotate, sub, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { Entity } from "../world/entity.js";
import { MAX_UINT32, MAX_WEAPON_TEMPERATURE } from "../world/limits.js";
import type { WorldView } from "../world/view.js";
import { NPC_MAX_WEAPON_TEMP, NPC_WEAPON_CUTOUT_F32 } from "./constants.js";
import { ACCURACY_UNRESOLVED } from "./state.js";
import { currentAimTolerance, targetBody } from "./target.js";
import { calculateTargetPosition } from "./tracking-curve.js";

/**
 * The roll's accuracy offset: `range > randf() * weaponRange * (accuracy +
 * 7.5)` (`ShipEntity.m:9949`).
 */
export const NPC_FIRE_ACCURACY_OFFSET = 7.5;

/**
 * The target radius share of the on-target width: `astq = sqrt(1 - radius *
 * radius / (d2 * 9))` (`ShipEntity.m:9907`), a cone of a third of the half
 * angle the target subtends.
 */
export const ON_TARGET_RADIUS_FACTOR = 9;

/**
 * The unarmed weapon, `EQ_WEAPON_NONE` (`equipment.plist:114-121`): range
 * 32000, energy use 0, recharge 100 s. An NPC without a forward weapon holds
 * this registered object, not nil (`ShipEntity.m:299-300, 13046-13049`), so its
 * gate call passes the energy and timer checks, takes the draw and refuses at
 * `noWeapon` (9958).
 */
const UNARMED_RANGE = 32000;
const UNARMED_ENERGY_USE = 0;
const UNARMED_RECHARGE_SECONDS = 100;

/** Oolite's world +Z (`kBasisZVector`) in Wegolite's frame (z negated). */
const ZBASIS: Vec3 = vec(0, 0, -1);
const LOCAL_FORWARD: Vec3 = vec(0, 0, -1);

/**
 * Where the gate refused. The first seven are the oracle's names (`gate.json`);
 * `unresolved` is the Wegolite-only sentinel refusal.
 */
export type NpcFireRefusal =
  | "heat"
  | "energy"
  | "timer"
  | "roll"
  | "range"
  | "onTarget"
  | "noWeapon"
  | "unresolved";

export interface NpcFireGateInput {
  /** The forward weapon temperature the gate reads (float32 value). */
  readonly temperature: number;
  readonly energy: number;
  /** The current world tick. */
  readonly tick: number;
  /** The world tick of the last shot; 0 means never fired (ready). */
  readonly lastShotTick: number;
  readonly laser: MountKey;
  /** The resolved accuracy (`ACCURACY_UNRESOLVED` refuses). */
  readonly accuracy: number;
  /** `rangeToPrimaryTarget`: the centre distance less both radii. */
  readonly range: number;
  /** `onTarget:`, evaluated only after the draw and the roll and range checks. */
  readonly onTarget: () => boolean;
}

export type NpcFireResult =
  | { readonly kind: "fired" }
  | {
      readonly kind: "refused";
      readonly reason: NpcFireRefusal;
      /** Whether the gate took its one draw before refusing. */
      readonly drew: boolean;
    };

/** Bound of the shot-timer loop: well above the unarmed 12000 frames. */
const MAX_SHOT_FRAMES = 1_000_000;

/**
 * Oolite's literal shot-timer frame count at exactly 1 / 120 s per frame, the
 * port of the timer's own arithmetic. After a shot `shot_time` is reset to 0
 * (`resetShotTime`, called at 10463), every later `update:` adds `delta_t` once,
 * a double sum, before the behaviours run (`ShipEntity.m:2221`), and the gate
 * refuses while `[self shotTime] < weapon_recharge_rate` (9946), a double
 * compared with the float32 field promoted to double. The first frame that is
 * not refused is the smallest k with `!(sum_k < Math.fround(rate))`, where
 * `sum_k` is k successive double additions of 1 / 120. Total for every finite
 * positive rate (the loop is bounded), and NaN or a non-positive rate opens at
 * the first frame.
 */
function literalShotFrames(rateSeconds: number): number {
  const rateF32 = Math.fround(rateSeconds);
  const step = 1 / TICKS_PER_SECOND;
  let shotTime = 0;
  for (let frames = 1; frames < MAX_SHOT_FRAMES; frames += 1) {
    shotTime += step;
    if (!(shotTime < rateF32)) return frames;
  }
  return MAX_SHOT_FRAMES;
}

/**
 * The literal frame count per laser, evaluated once at module load from the
 * laser's own float seconds (`LASER_STATS[laser].rechargeRate`, never from the
 * player's rounded `rechargeTicks`): pulse 60, beam 13, mining 301, military
 * 13. Frozen, so the player's own period cannot move through it.
 */
const NPC_RECHARGE_TICKS: Readonly<Record<LaserKey, number>> = Object.freeze({
  EQ_WEAPON_PULSE_LASER: literalShotFrames(
    LASER_STATS.EQ_WEAPON_PULSE_LASER.rechargeRate,
  ),
  EQ_WEAPON_BEAM_LASER: literalShotFrames(
    LASER_STATS.EQ_WEAPON_BEAM_LASER.rechargeRate,
  ),
  EQ_WEAPON_MINING_LASER: literalShotFrames(
    LASER_STATS.EQ_WEAPON_MINING_LASER.rechargeRate,
  ),
  EQ_WEAPON_MILITARY_LASER: literalShotFrames(
    LASER_STATS.EQ_WEAPON_MILITARY_LASER.rechargeRate,
  ),
});

/** The unarmed weapon's literal frame count: 100 s, 12000 frames. */
const UNARMED_RECHARGE_TICKS = literalShotFrames(UNARMED_RECHARGE_SECONDS);

/**
 * The NPC shot period in whole ticks, the one home of the number the gate reads
 * (orchestrator disposition 1): Oolite's LITERAL frame count at 120 Hz, 60 for
 * the pulse laser, 13 for beam and military, 301 for mining and 12000 for the
 * unarmed weapon. D-07 as revised by the owner 2026-11-19 (UAT test 1, gap
 * G-17-1); equal to plan 17-01's oracle `literalShotFrames`, which
 * `tests/sim/npc/fire.oracle.test.ts` checks for every weapon. The NPC compare
 * is `>=` (`ShipEntity.m:9946`), so a shot fires exactly that many ticks after
 * the last one, and the player's own strict-`>` period (61, 13, 301, 13, the
 * player's rounded `rechargeTicks`) is untouched. History: D-07 first read
 * `round(rate * 120)` (60, 12, 300, 12), one tick short of Oolite's count for
 * beam, mining and military.
 */
export function npcRechargeTicks(laser: MountKey): number {
  return laser === NO_LASER
    ? UNARMED_RECHARGE_TICKS
    : NPC_RECHARGE_TICKS[laser];
}

function laserRange(laser: MountKey): number {
  return laser === NO_LASER ? UNARMED_RANGE : LASER_STATS[laser].range;
}

function laserEnergyUse(laser: MountKey): number {
  return laser === NO_LASER ? UNARMED_ENERGY_USE : LASER_STATS[laser].energy;
}

/**
 * The refusal chain of `fireWeapon:direction:range:` (`ShipEntity.m:9933-9993`)
 * in Oolite's order. The heat, energy and timer checks refuse with no draw;
 * otherwise exactly one draw is taken, then the roll, the range, `onTarget`
 * and the unarmed weapon refuse, else the shot fires. The gate writes nothing:
 * the caller applies the energy cost, the heat and the timer on `fired`.
 */
export function npcFireGate(
  input: NpcFireGateInput,
  draw: () => number,
): NpcFireResult {
  const refuse = (reason: NpcFireRefusal, drew: boolean): NpcFireResult => ({
    kind: "refused",
    reason,
    drew,
  });
  if (
    input.accuracy === ACCURACY_UNRESOLVED ||
    !Number.isFinite(input.accuracy)
  ) {
    return refuse("unresolved", false);
  }
  // heat: weapon_temp / NPC_MAX_WEAPON_TEMP >= WEAPON_COOLING_CUTOUT (9935-9936)
  if (
    !Number.isFinite(input.temperature) ||
    !(input.temperature / NPC_MAX_WEAPON_TEMP < NPC_WEAPON_CUTOUT_F32)
  ) {
    return refuse("heat", false);
  }
  // energy: energy <= weapon_energy_use (9944-9945)
  if (
    !Number.isFinite(input.energy) ||
    !(input.energy > laserEnergyUse(input.laser))
  ) {
    return refuse("energy", false);
  }
  // timer: shot_time < weapon_recharge_rate (9946-9947), whole ticks, NPC >=
  if (
    input.lastShotTick !== 0 &&
    !(input.tick - input.lastShotTick >= npcRechargeTicks(input.laser))
  ) {
    return refuse("timer", false);
  }
  const u = draw(); // randf() (9949), the gate's only draw
  const weaponRange = laserRange(input.laser);
  // randf() * weaponRange is float * float, a float32 product, and only then
  // times the double accuracy + 7.5 (9949); the oracle models the same width.
  const rollLimit =
    Math.fround(u * weaponRange) * (input.accuracy + NPC_FIRE_ACCURACY_OFFSET);
  if (!Number.isFinite(input.range) || !(input.range <= rollLimit)) {
    return refuse("roll", true);
  }
  if (input.range > weaponRange) return refuse("range", true);
  if (!input.onTarget()) return refuse("onTarget", true);
  if (input.laser === NO_LASER) return refuse("noWeapon", true);
  return { kind: "fired" };
}

/**
 * The Wegolite-only refusal a caller takes before the gate, with no draw and
 * no write: a ship whose `ai` is null (never steered, or nulled by a think
 * throw while its steering state stayed resolved) or whose nav target is
 * itself. Neither case is reachable in Oolite (`addTarget:` refuses self,
 * 8661-8662), so no Oolite draw moves (Pitfall 16).
 */
export function npcFireBlocked(entity: Entity): "noAi" | "selfTarget" | null {
  if (entity.ai === null) return "noAi";
  if (entity.nav.targetId === entity.id) return "selfTarget";
  return null;
}

/**
 * The cone test of `onTarget:` for a forward weapon (`ShipEntity.m:9874-9909`):
 * the cosine `dq` between the ship's forward vector and the unit direction to
 * the aim point (Oolite's `vector_normal_or_zbasis`, so a zero offset points
 * along world +Z, here (0, 0, -1)). Behind the ship is off target; inside the
 * aim circle (`dq > aim * aim`) is on target; otherwise the target must fill
 * `|dq| >= sqrt(1 - radius^2 / (9 * d2))`. Oolite holds the locals as float32;
 * this is float64, and the equality fixture holds in both widths (plan 17-01).
 * Never throws: a non-finite input answers false.
 */
export function onTargetCone(
  position: Vec3,
  orientation: Quat,
  aimPoint: Vec3,
  targetRadius: number,
  aimTolerance: number,
): boolean {
  const rel = sub(aimPoint, position);
  const d2 = dot(rel, rel);
  let urp = ZBASIS;
  if (!(rel.x === 0 && rel.y === 0 && rel.z === 0)) {
    const magnitude = length(rel);
    urp = vec(rel.x / magnitude, rel.y / magnitude, rel.z / magnitude);
  }
  const dq = dot(urp, rotate(orientation, LOCAL_FORWARD));
  if (dq < 0) return false;
  if (dq > aimTolerance * aimTolerance) return true;
  const astq = Math.sqrt(
    1 - (targetRadius * targetRadius) / (d2 * ON_TARGET_RADIUS_FACTOR),
  );
  return Math.abs(dq) >= astq;
}

/**
 * `onTarget:` for `entity` (`ShipEntity.m:9851-9909`): no valid target, or a
 * target that is the ship itself, is off target; else the cone test against the
 * reaction-time aim point (`calculateTargetPosition`), the target's collision
 * radius and `currentAimTolerance` (which carries the live `missedShots` term).
 */
export function npcOnTarget(
  entity: Entity,
  view: WorldView,
  tick: number,
): boolean {
  const target = targetBody(entity, view);
  if (target === undefined) return false;
  return onTargetCone(
    entity.position,
    entity.orientation,
    calculateTargetPosition(entity, view, tick),
    target.radius,
    currentAimTolerance(entity),
  );
}

/**
 * The cooling of one update (`ShipEntity.m:2214-2218`): `fmaxf(t - (float)(6 *
 * delta_t), 0.0f)` with float32 arithmetic. Returns 0, never -0, for a
 * temperature of 0 or a non-finite input, and stays within
 * `[0, MAX_WEAPON_TEMPERATURE]`.
 */
export function coolWeapon(temperature: number, dt: number): number {
  if (!Number.isFinite(temperature)) return 0;
  const cooled = Math.fround(
    temperature - Math.fround(WEAPON_COOLING_FACTOR * dt),
  );
  if (!(cooled > 0)) return 0;
  return cooled < MAX_WEAPON_TEMPERATURE ? cooled : MAX_WEAPON_TEMPERATURE;
}

/**
 * The heat of a fired shot (`ShipEntity.m:9972`): `forward_weapon_temp +=
 * weapon_shot_temperature` in float32, clamped to the stored bound. A
 * non-finite or negative result is 0.
 */
export function heatWeapon(
  temperature: number,
  shotTemperature: number,
): number {
  const heated = Math.fround(temperature + Math.fround(shotTemperature));
  if (!(heated > 0)) return 0;
  return heated < MAX_WEAPON_TEMPERATURE ? heated : MAX_WEAPON_TEMPERATURE;
}

/**
 * `adjustMissedShots:` (`ShipEntity.m:10468-10477`): add `delta` and floor at
 * 0; Wegolite also saturates at `MAX_UINT32`, the field's stored bound. The
 * result is a whole number and never -0.
 */
export function adjustMissedShots(current: number, delta: number): number {
  const next = Math.trunc(current + delta);
  if (!(next >= 1)) return 0;
  return next < MAX_UINT32 ? next : MAX_UINT32;
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_attack_target:` (AI-01, plan 14-14; `ShipEntity.m:4038-4185`): the
 * dispatcher that picks the attack sub-behaviour for the next update, plus the
 * helpers the sub-behaviours share (`attack-close.ts`, `attack-evade.ts`).
 *
 * The weapon facts. The forward weapon's range comes from the Phase 13 laser
 * stats (`LASER_STATS`) keyed by `stats.forwardWeapon`, and is `NO_WEAPON_RANGE`
 * (0) for `EQ_WEAPON_NONE`: `isWeaponNone` leaves the type nil and
 * `getWeaponRangeFromType(nil)` is `[nil weaponRange]`, 0 (`ShipEntity.m:443-466,
 * 13041-13044`). The weapon temperature is `NPC_WEAPON_TEMP` (0): nothing fires,
 * so nothing heats (CBT-15 is unscheduled). Every sub-behaviour of this phase
 * skips Oolite's `fireMainWeapon:`, the missile and cloak calls and the
 * afterburner (`canBurn` is false).
 *
 * Scope cuts at the dispatcher, each ported as the branch Oolite takes when the
 * feature is absent (recorded for plan 14-19):
 *  - 4056-4071, 4073-4074: no weapon on a sub-entity and no turret laser (the
 *    compiled records author neither), so `forward_weapon_real_type` is the
 *    ship's own forward weapon and the TWELVE-for-turrets branch never runs;
 *  - aft, port and starboard weapons are none for every compiled record, so the
 *    `aft/port/starboard_weapon_ready` terms are false: RUNNING_DEFENSE
 *    (4131-4133, 4174-4176) and ATTACK_BROADSIDE (4134-4136, 4171-4173) are never
 *    selected, and the last `else` (4177-4180) is unreachable because the
 *    forward weapon is ready whenever the first `if` does not take the branch;
 *  - the weapon temperature is `forwardWeaponTemp`, a parameter fixed at
 *    `NPC_WEAPON_TEMP` (0) by the caller; the heating branch (4122) is reachable
 *    only through a forced temperature, which `attack-dispatch.test.ts` does.
 *
 * Divergences: `COMBAT_IN_RANGE_FACTOR` and its siblings are float literals in
 * C and `factor * weaponRange` is a float product; here the factor is a double,
 * so a range within about one part in 10^7 of a threshold can compare
 * differently. The velocity is `forward x flightSpeed` for both ships
 * (`ShipEntity.m:11159-11166`); the Newtonian part is not modelled.
 */

import { LASER_STATS } from "../../combat/constants.js";
import { NO_LASER } from "../../combat/mounts.js";
import { clamp, rotate, vec } from "../../math.js";
import type { Vec3 } from "../../math.js";
import type { Entity } from "../../world/entity.js";
import type { EntityId } from "../../world/ids.js";
import { MAX_ENTITY_MAGNITUDE } from "../../world/limits.js";
import type { BodyView, WorldView } from "../../world/view.js";
import {
  AIM_TOLERANCE_ACCURACY_FACTOR,
  AIM_TOLERANCE_BASE,
  ATTACK_SMART_EVASIVE_CHANCE,
  COMBAT_AI_CONFIDENCE_FACTOR,
  COMBAT_AI_FLEES_BETTER,
  COMBAT_AI_ISNT_AWFUL,
  COMBAT_AI_IS_SMART,
  COMBAT_IN_RANGE_FACTOR,
  COMBAT_JINK_OFFSET,
  COMBAT_OUT_RANGE_FACTOR,
  NO_WEAPON_RANGE,
  NPC_WEAPON_TEMP,
  NPC_WEAPON_TEMP_READY,
  NPC_WEAPON_TEMP_USABLE,
  SNIPER_ENTRY_RANGE,
  SNIPER_WEAPON_RANGE,
} from "../constants.js";
import type { SteerContext } from "../dispatch.js";
import {
  approachAspectToPrimaryTarget,
  rangeToPrimaryTarget,
  targetBody,
} from "../target.js";
import { setEvasiveJink } from "../track.js";
import type { NpcFlightStats } from "../stats.js";

const LOCAL_FORWARD: Vec3 = vec(0, 0, -1);

/**
 * `weaponRange` of the ship: the forward weapon's range from the Phase 13 laser
 * stats, or `NO_WEAPON_RANGE` for no weapon (`ShipEntity.m:443-466`).
 */
export function weaponRangeOf(stats: NpcFlightStats): number {
  if (stats.forwardWeapon === NO_LASER) return NO_WEAPON_RANGE;
  return LASER_STATS[stats.forwardWeapon].range;
}

/** `aim_tolerance = 240 - 18 * accuracy` (`setAccuracy:`, `ShipEntity.m:1138`). */
export function aimToleranceOf(accuracy: number): number {
  return AIM_TOLERANCE_BASE - AIM_TOLERANCE_ACCURACY_FACTOR * accuracy;
}

/**
 * Oolite's `[target primaryTarget] == self` for the target of `selfId`
 * (`ShipEntity.m:3921, 4122, 4658, 4669`): false for the player (who never
 * targets an NPC, a recorded scope cut), and for an NPC target true exactly when
 * the view returns that ship and its `targetId` is `selfId`. Oolite's validity
 * check of the target's own primary target (`isValidTarget:`, 8718-8733) holds
 * by construction: the steered ship is live and a ship.
 */
export function targetTargetsSelf(
  view: WorldView,
  targetId: EntityId,
  selfId: EntityId,
): boolean {
  const ship = view.ship(targetId);
  return ship !== undefined && ship.targetId === selfId;
}

/** `thrustVector` (`ShipEntity.m:11159-11162`): forward times the flight speed. */
function velocityOf(orientation: Entity["orientation"], speed: number): Vec3 {
  const forward = rotate(orientation, LOCAL_FORWARD);
  return vec(forward.x * speed, forward.y * speed, forward.z * speed);
}

/**
 * `magnitude(vector_subtract([self velocity], [target velocity]))`
 * (`ShipEntity.m:4124, 4147`). A missing target has the zero velocity (a
 * message to nil returns zero).
 */
export function relativeSpeedTo(
  entity: Entity,
  target: BodyView | undefined,
): number {
  const own = velocityOf(entity.orientation, entity.speed);
  const other =
    target === undefined
      ? vec(0, 0, 0)
      : velocityOf(target.orientation, target.speed);
  const dx = own.x - other.x;
  const dy = own.y - other.y;
  const dz = own.z - other.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * The argument of `setEvasiveJink:` at 4125 and 4148:
 * `range + COMBAT_JINK_OFFSET - relativeSpeed / max_flight_pitch`, a GLfloat.
 * Wegolite addition (T-14-16), not an Oolite line: a ship that cannot pitch
 * (`maxFlightPitch` 0) would divide by zero, and an enormous quotient would leave
 * the record's domain, so the quotient is 0 without a pitch rate and the result
 * is clamped to the entity magnitude bound.
 */
export function attackJinkZ(
  entity: Entity,
  ctx: SteerContext,
  range: number,
  target: BodyView | undefined,
): number {
  const pitch = ctx.stats.maxFlightPitch;
  const quotient = pitch > 0 ? relativeSpeedTo(entity, target) / pitch : 0;
  return clamp(
    Math.fround(range + COMBAT_JINK_OFFSET - quotient),
    -MAX_ENTITY_MAGNITUDE,
    MAX_ENTITY_MAGNITUDE,
  );
}

/**
 * `behaviour_attack_target:` (`ShipEntity.m:4038-4185`). `forwardWeaponTemp` is
 * the forward weapon's temperature: the caller leaves it at `NPC_WEAPON_TEMP`
 * (0); a test forces it to reach the branches a ship that never fires cannot.
 */
export function behaviourAttackTarget(
  entity: Entity,
  ctx: SteerContext,
  forwardWeaponTemp: number = NPC_WEAPON_TEMP,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const accuracy = steer.accuracy;
  const range = rangeToPrimaryTarget(entity, ctx);
  const weaponRange = weaponRangeOf(ctx.stats);
  const forwardNone = ctx.stats.forwardWeapon === NO_LASER;

  const inGoodRange =
    aimToleranceOf(accuracy) * range < COMBAT_AI_CONFIDENCE_FACTOR;

  // 4078-4081: aft, port and starboard are none (scope cut above); the forward
  // weapon "does not require in_good_range".
  let forwardReady = !forwardNone && forwardWeaponTemp < NPC_WEAPON_TEMP_READY;
  // if no weapons cool enough to be good choices, be less picky (4083-4090)
  let weaponsHeating = false;
  if (!forwardReady) {
    weaponsHeating = true;
    forwardReady = !forwardNone && forwardWeaponTemp < NPC_WEAPON_TEMP_USABLE;
  }

  const target = targetBody(entity, ctx.view);
  const aspect = approachAspectToPrimaryTarget(entity, ctx);

  if (!forwardReady) {
    // no usable weapons! Either not fitted or overheated (4095)
    if (forwardNone) {
      // if unarmed (4098-4099): the jink is left as it is
      nav.behaviour = "ATTACK_FLY_FROM_TARGET";
    } else if (aspect > 0) {
      if (inGoodRange) {
        if (
          accuracy >= COMBAT_AI_IS_SMART &&
          ctx.draw() < ATTACK_SMART_EVASIVE_CHANCE
        ) {
          nav.behaviour = "EVASIVE_ACTION";
        } else {
          nav.behaviour = "ATTACK_FLY_FROM_TARGET";
        }
      } else {
        // ready to get more accurate shots later
        nav.behaviour = "ATTACK_FLY_TO_TARGET";
      }
    } else if (range < COMBAT_IN_RANGE_FACTOR * weaponRange) {
      // if target is running away, stay on target unless too close for safety
      nav.behaviour = "ATTACK_FLY_FROM_TARGET";
    } else {
      nav.behaviour = "ATTACK_FLY_TO_TARGET";
    }
  } else if (
    weaponsHeating &&
    accuracy >= COMBAT_AI_ISNT_AWFUL &&
    target !== undefined &&
    !targetTargetsSelf(ctx.view, target.id, entity.id) &&
    range < COMBAT_OUT_RANGE_FACTOR * weaponRange
  ) {
    // our target isn't targeting us, our weapons are running hot and we are
    // fairly near: back off a bit so they cool (4122-4126)
    setEvasiveJink(entity, ctx, attackJinkZ(entity, ctx, range, target));
    nav.behaviour = "ATTACK_FLY_FROM_TARGET";
  } else {
    const nearby = range < COMBAT_IN_RANGE_FACTOR * weaponRange; // 4128
    if (nearby) {
      // (4131-4136, the aft and broadside branches, are the scope cut above)
      if (!steer.pitchingOver) {
        // don't change jink in the middle of a sharp turn (4138-4149)
        setEvasiveJink(entity, ctx, attackJinkZ(entity, ctx, range, target));
      }
      // good pilots use behaviour_attack_break_off_target instead
      nav.behaviour =
        accuracy >= COMBAT_AI_FLEES_BETTER
          ? "ATTACK_BREAK_OFF_TARGET"
          : "ATTACK_FLY_FROM_TARGET";
    } else {
      // forward_weapon_ready (4156): always true here, see the scope cut
      steer.jink = vec(0, 0, 0); // almost all behaviours
      if (weaponRange > SNIPER_WEAPON_RANGE && range > SNIPER_ENTRY_RANGE) {
        nav.behaviour = "ATTACK_SNIPER";
      } else if (accuracy < COMBAT_AI_ISNT_AWFUL && aspect < 0) {
        // generally not good tactics the next two
        nav.behaviour = "ATTACK_FLY_TO_TARGET_SIX";
      } else if (accuracy < COMBAT_AI_ISNT_AWFUL) {
        nav.behaviour = "ATTACK_FLY_TO_TARGET_TWELVE";
      } else {
        nav.behaviour = "ATTACK_FLY_TO_TARGET";
      }
    }
  }

  steer.frustration = Math.fround(0); // behaviour changed, so reset frustration
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The close-range attack sub-behaviours (AI-01, plan 14-14): fly to target
 * (`ShipEntity.m:4611-4731`), fly from target (4733-4799) and fly to target six
 * and twelve, non-turret (4461-4580).
 *
 * Scope cuts, each ported as the branch Oolite takes when the feature is absent
 * (recorded for plan 14-19):
 *  - no afterburner: `canBurn` is false, so `max_available_speed` is
 *    `maxFlightSpeed`, `isUsingAfterburner` and `closeQuickly` are false;
 *  - no weapon fire, no missile, no cloak (`fireMainWeapon:`,
 *    `considerFiringMissile:`, `activateCloakingDevice`): nothing fires, so the
 *    weapon never heats and `weapon_temp > COMBAT_AI_WEAPON_TEMP_USABLE` is
 *    false (4713, 4577);
 *  - fly-to's accuracy >= 9 dodge (4721-4729) needs the target's weapon types,
 *    which the view does not carry: the target counts as unarmed there, so the
 *    dodge never fires from fly-to (fly-from's own dodge, 4790-4797, has no weapon
 *    test and is ported);
 *  - the turret branch of twelve (4537-4549) is out (no turret lasers);
 *  - `isThargoid` is false (no Thargoid records), so the standstill test of
 *    six depends only on the ship's id;
 *  - the sub-entity weapon lookups are out (no sub-entity weapons).
 * Recorded divergence: `[self universalID] & 14` (4523) is evaluated on
 * Wegolite's entity id (ids start at 101 and never repeat in a world).
 *
 * `frustration` and `successFactor` are GLfloat in Oolite: every write is
 * `Math.fround`.
 */

import { vec } from "../../math.js";

import type { Entity } from "../../world/entity.js";

import {
  avoidCollision,
  hasProximityAlertIgnoringTarget,
  proximityAlertBody,
} from "../avoid.js";
import {
  ATTACK_FRUSTRATION_JINK_Z,
  ATTACK_SUCCESS_GOOD,
  COMBAT_AI_FLEES_BETTER,
  COMBAT_AI_FLEES_BETTER_2,
  COMBAT_AI_IS_SMART,
  COMBAT_IN_RANGE_FACTOR,
  COMBAT_OUT_RANGE_FACTOR,
  COMBAT_WEAPON_RANGE_FACTOR,
  COMBAT_AI_CONFIDENCE_FACTOR,
  FLY_FROM_CHANCE,
  FLY_FROM_DODGE_BEHIND,
  FLY_FROM_DODGE_FRONT,
  FLY_FROM_FRUSTRATION_LIMIT,
  FLY_FROM_HALVING,
  FLY_FROM_JINK_WEIGHT,
  FLY_FROM_MIN_SPEED_SHARE,
  FLY_FROM_SLOW_FRUSTRATION_DIVISOR,
  FLY_FROM_SPEED_FACTOR,
  FLY_FROM_TURN_DIVISOR,
  FLY_TO_TARGET_AIMED_ASPECT,
  FLY_TO_TARGET_BACK_OFF_BASE,
  FLY_TO_TARGET_FRUSTRATION_LIMIT,
  FLY_TO_TARGET_SLOW_ASPECT,
  FLY_TO_TARGET_SPEEDS,
  SCANNER_MAX_RANGE,
} from "../constants.js";
import type { SteerContext } from "../dispatch.js";
import {
  approachAspectToPrimaryTarget,
  canStillTrackPrimaryTarget,
  noteLostTargetAndGoIdle,
  rangeToPrimaryTarget,
  targetBody,
} from "../target.js";
import {
  noteFrustration,
  setEvasiveJink,
  trackPrimaryTarget,
} from "../track.js";
import { aimToleranceOf, targetTargetsSelf, weaponRangeOf } from "./attack.js";

/**
 * `behaviour_attack_fly_to_target:` (`ShipEntity.m:4611-4731`): close on the
 * target at a speed matched to its own and the weapon range, and fall back to
 * ATTACK_TARGET after three seconds without tracking progress.
 */
export function behaviourAttackFlyToTarget(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const stats = ctx.stats;
  const accuracy = steer.accuracy;
  const maxSpeed = stats.maxFlightSpeed;
  const weaponRange = weaponRangeOf(stats);
  const range = rangeToPrimaryTarget(entity, ctx);

  const target = targetBody(entity, ctx.view);
  if (target === undefined) {
    // 4618-4627 (a planet or the sun is no valid target, "can't attack a wormhole")
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }

  if (
    range < COMBAT_IN_RANGE_FACTOR * weaponRange ||
    proximityAlertBody(entity, ctx) !== undefined
  ) {
    if (!hasProximityAlertIgnoringTarget(entity, ctx, true)) {
      nav.behaviour = "ATTACK_TARGET";
    } else {
      avoidCollision(entity, ctx);
      return;
    }
  } else if (!canStillTrackPrimaryTarget(entity, ctx)) {
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }

  // control speed (4644-4685; no afterburner)
  const slowDownRange = weaponRange * COMBAT_WEAPON_RANGE_FACTOR;
  const backOffRange = FLY_TO_TARGET_BACK_OFF_BASE * COMBAT_OUT_RANGE_FACTOR;
  const targetSpeed = target.speed;
  const aspect = approachAspectToPrimaryTarget(entity, ctx);
  const speeds = FLY_TO_TARGET_SPEEDS;
  const targetAimsAtUs = targetTargetsSelf(ctx.view, target.id, entity.id);

  if (range <= slowDownRange) {
    if (range < backOffRange) {
      if (
        accuracy < COMBAT_AI_IS_SMART ||
        (targetAimsAtUs && aspect > FLY_TO_TARGET_AIMED_ASPECT) ||
        aimToleranceOf(accuracy) * range > COMBAT_AI_CONFIDENCE_FACTOR
      ) {
        if (
          accuracy >= COMBAT_AI_FLEES_BETTER &&
          aspect > FLY_TO_TARGET_AIMED_ASPECT
        ) {
          // stay at high speed if might be taking return fire
          nav.desiredSpeed = Math.max(
            targetSpeed * speeds.aimedTarget,
            speeds.aimedMax * maxSpeed,
          );
        } else {
          // within the weapon's range match speed
          nav.desiredSpeed = Math.max(
            targetSpeed * speeds.matchTarget,
            speeds.matchMax * maxSpeed,
          );
        }
      } else {
        // smart, and not being shot at right now - slow down to attack
        nav.desiredSpeed = Math.max(
          speeds.patient * targetSpeed,
          speeds.patient * maxSpeed,
        );
      }
    } else if (
      accuracy < COMBAT_AI_IS_SMART ||
      targetAimsAtUs ||
      range > weaponRange / 2
    ) {
      nav.desiredSpeed = Math.max(targetSpeed * speeds.farTarget, maxSpeed);
    } else if (aspect > FLY_TO_TARGET_SLOW_ASPECT) {
      // smart, and not being shot at right now - slow down to attack
      nav.desiredSpeed = Math.max(
        speeds.slowTarget * targetSpeed,
        speeds.slowMax * maxSpeed,
      );
    } else {
      nav.desiredSpeed = Math.max(
        speeds.slowBehindTarget * targetSpeed,
        speeds.slowMax * maxSpeed,
      );
    }
  } else {
    // max_available_speed is maxFlightSpeed without the afterburner (4683)
    nav.desiredSpeed = Math.max(
      maxSpeed,
      Math.min(speeds.approachTarget * targetSpeed, maxSpeed),
    );
  }

  const lastSuccessFactor = steer.successFactor;
  steer.successFactor = Math.fround(trackPrimaryTarget(entity, ctx, false)); // do the actual piloting

  if (
    steer.successFactor > ATTACK_SUCCESS_GOOD ||
    steer.successFactor > lastSuccessFactor
  ) {
    steer.frustration = Math.fround(steer.frustration - ctx.dt);
    if (steer.frustration < 0) steer.frustration = 0;
  } else {
    steer.frustration = Math.fround(steer.frustration + ctx.dt);
    if (steer.frustration > FLY_TO_TARGET_FRUSTRATION_LIMIT) {
      // 3s of frustration
      noteFrustration(ctx);
      setEvasiveJink(entity, ctx, ATTACK_FRUSTRATION_JINK_Z);
      nav.behaviour = "ATTACK_TARGET";
      steer.frustration = Math.fround(0);
      nav.desiredSpeed = maxSpeed;
    }
  }
  // 4706-4730: missiles, cloak, fireMainWeapon, the hot-weapon return to
  // ATTACK_TARGET and the accuracy >= 9 dodge are the scope cuts above.
}

/**
 * `behaviour_attack_fly_from_target:` (`ShipEntity.m:4733-4799`): back away at
 * speed, with a jink, until the range exceeds half the weapon range plus 15
 * times the jink, then return to ATTACK_TARGET.
 */
export function behaviourAttackFlyFromTarget(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const stats = ctx.stats;
  const maxSpeed = stats.maxFlightSpeed;
  const weaponRange = weaponRangeOf(stats);
  const range = rangeToPrimaryTarget(entity, ctx);

  const lastSuccessFactor = steer.successFactor;
  steer.successFactor = Math.fround(range);

  const target = targetBody(entity, ctx.view);
  if (target === undefined) {
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }
  if (lastSuccessFactor > steer.successFactor) {
    // our target is closing in.
    steer.frustration = Math.fround(steer.frustration + ctx.dt);
  } else {
    // not getting away fast enough?
    steer.frustration = Math.fround(
      steer.frustration + ctx.dt / FLY_FROM_SLOW_FRUSTRATION_DIVISOR,
    );
  }

  if (steer.frustration > FLY_FROM_FRUSTRATION_LIMIT) {
    if (ctx.draw() < FLY_FROM_CHANCE) {
      nav.desiredSpeed = maxSpeed; // no fuel injection
    } else if (range > COMBAT_IN_RANGE_FACTOR * weaponRange) {
      // the second draw is made only inside this branch (4753)
      if (ctx.draw() < FLY_FROM_CHANCE) nav.behaviour = "ATTACK_TARGET";
    }
    // Oolite's jink.z is -steer.jink.z (the stored frame is z negated)
    let z = Math.fround(0 - steer.jink.z);
    if (ctx.draw() < FLY_FROM_CHANCE) {
      // move the z-offset closer to the target to let him fly away from it
      z = Math.fround(z / FLY_FROM_HALVING);
      nav.desiredSpeed = entity.speed * FLY_FROM_SPEED_FACTOR; // increase speed a bit
    }
    setEvasiveJink(entity, ctx, z);
    steer.frustration = Math.fround(steer.frustration / FLY_FROM_HALVING);
  }

  if (nav.desiredSpeed > maxSpeed) {
    if (nav.desiredSpeed > target.speed * FLY_FROM_SPEED_FACTOR) {
      nav.desiredSpeed = maxSpeed; // don't overuse the injectors
    }
  } else if (nav.desiredSpeed < maxSpeed * FLY_FROM_MIN_SPEED_SHARE) {
    nav.desiredSpeed = maxSpeed;
  }

  if (
    range >
      COMBAT_OUT_RANGE_FACTOR * weaponRange +
        FLY_FROM_JINK_WEIGHT * steer.jink.x ||
    entity.speed >
      ((SCANNER_MAX_RANGE - range) * stats.maxFlightPitch) /
        FLY_FROM_TURN_DIVISOR
  ) {
    steer.jink = vec(0, 0, 0);
    nav.behaviour = "ATTACK_TARGET";
    steer.frustration = Math.fround(0);
  }
  trackPrimaryTarget(entity, ctx, true);

  if (hasProximityAlertIgnoringTarget(entity, ctx, true)) {
    avoidCollision(entity, ctx);
  }

  if (steer.accuracy >= COMBAT_AI_FLEES_BETTER_2) {
    const aspect = approachAspectToPrimaryTarget(entity, ctx);
    // if we're right in their gunsights, dodge! need to dodge sooner if in aft
    // sights
    if (aspect > FLY_FROM_DODGE_FRONT || aspect < FLY_FROM_DODGE_BEHIND) {
      steer.frustration = Math.fround(0);
      nav.behaviour = "EVASIVE_ACTION";
    }
  }
}

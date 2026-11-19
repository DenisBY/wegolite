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
 *  - no missile, no cloak (`considerFiringMissile:`, `activateCloakingDevice`);
 *    `fireMainWeapon:` is the optional `ctx.fire` call at fly-to (4711) and
 *    six/twelve (4575), present only for a pilot that opted in (Phase 17,
 *    D-05); the hot-weapon returns that follow it read the live
 *    `entity.weapon.temperature` as it stands at steering time (4577: any
 *    accuracy; 4713: accuracy >= 0 and the raw `aim_tolerance` x range under
 *    `COMBAT_AI_CONFIDENCE_FACTOR`, then aspect < 0 sets frustration 0 and
 *    ATTACK_TARGET). Without the opt-in the temperature stays 0 and no return
 *    is taken. Fly-to's `aft/port/starboard_weapon_type` terms (4717) are none
 *    on every compiled record, so they are false;
 *  - fly-to's dodge, the `else if` at 4721-4730, is not ported (Phase 14
 *    divergence 21; D-06 covers fire sites and hot-weapon branches only): when
 *    the 4713 condition is false, accuracy >= `COMBAT_AI_FLEES_BETTER_2` (9),
 *    the target is not fleeing and has a forward weapon at aspect > 0.99999 (or
 *    an aft weapon at aspect < -0.999), Oolite sets frustration 0 and
 *    EVASIVE_ACTION. The view carries no weapon types of the target, so the
 *    port never dodges from fly-to (fly-from's own dodge, 4790-4797, has no
 *    weapon test and is ported);
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

import { rotate, vec } from "../../math.js";
import type { Vec3 } from "../../math.js";
import type { Entity } from "../../world/entity.js";
import type { BodyView } from "../../world/view.js";
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
  COMBAT_AI_ISNT_AWFUL,
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
  NPC_WEAPON_TEMP_USABLE,
  SCANNER_MAX_RANGE,
  SIX_BEHIND_SHARE,
  SIX_CONFIDENCE_LIMIT,
  SIX_FRUSTRATION_LIMIT,
  SIX_FRUSTRATION_RELIEF,
  SIX_HEAD_ON_SHARE,
  SIX_SPEEDS,
  SIX_STANDSTILL_ID_BOUND,
  SIX_STANDSTILL_ID_MASK,
  SIX_STANDSTILL_SPEED,
  SIX_VECTOR_IN_ASPECT,
  SIX_VECTOR_IN_DISTANCE,
  SIX_VECTOR_IN_MAX_SHARE,
  TWELVE_ABOVE,
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
  rangeToDestination,
  setEvasiveJink,
  trackDestination,
  trackPrimaryTarget,
} from "../track.js";
import { aimToleranceOf, targetTargetsSelf, weaponRangeOf } from "./attack.js";

const LOCAL_UP: Vec3 = vec(0, 1, 0);
const LOCAL_FORWARD: Vec3 = vec(0, 0, -1);

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
  // 4706-4711: missiles and cloak are the scope cuts above. `fireMainWeapon:`
  // (4711) is the request for a pilot that opted in (D-05); it is reached on
  // every path that did not return earlier, also after the frustration block
  // above switched the behaviour.
  ctx.fire?.();

  // 4713-4720: a weapon that runs hot hands the attack back to the dispatcher
  // when the aim is good enough to wait. `aim_tolerance` is the raw ivar of
  // `setAccuracy:` (`aimToleranceOf`), not `currentAimTolerance`, so a non-zero
  // `missedShots` does not enter this test. The read is the steering-time
  // temperature. Oolite's `aspect < 0 || aft/port/starboard weapon` (4717):
  // the three other weapons are none on every compiled record, so only the
  // aspect term is reachable. There is no else after the inner `if`: with
  // `aspect >= 0` nothing changes, and the 4721 `else if` below is skipped
  // because this condition held.
  if (
    entity.weapon.temperature > NPC_WEAPON_TEMP_USABLE &&
    accuracy >= COMBAT_AI_ISNT_AWFUL &&
    aimToleranceOf(accuracy) * range < COMBAT_AI_CONFIDENCE_FACTOR
  ) {
    if (aspect < 0) {
      steer.frustration = Math.fround(0);
      nav.behaviour = "ATTACK_TARGET";
    }
  }
  // 4721-4730, unported (Phase 14 divergence 21; D-06 covers fire sites and
  // hot-weapon branches only): when the 4713 condition is false and accuracy >=
  // COMBAT_AI_FLEES_BETTER_2 (9), a target that is not fleeing and has a
  // forward weapon at aspect > 0.99999 (or an aft weapon at aspect < -0.999)
  // makes Oolite set frustration 0 and EVASIVE_ACTION. The port never dodges
  // from fly-to.
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

/** `[target distance_six:dist]` (`ShipEntity.m:8849-8856`). */
function distanceSix(target: BodyView, dist: number): Vec3 {
  const forward = rotate(target.orientation, LOCAL_FORWARD);
  return vec(
    target.position.x - dist * forward.x,
    target.position.y - dist * forward.y,
    target.position.z - dist * forward.z,
  );
}

/** `[target distance_twelve:dist withOffset:0]` (`ShipEntity.m:8858-8869`). */
function distanceTwelve(target: BodyView, dist: number): Vec3 {
  const up = rotate(target.orientation, LOCAL_UP);
  return vec(
    target.position.x + dist * up.x,
    target.position.y + dist * up.y,
    target.position.z + dist * up.z,
  );
}

/**
 * `behaviour_fly_to_target_six:` (`ShipEntity.m:4461-4580`), the routine of both
 * ATTACK_FLY_TO_TARGET_SIX and ATTACK_FLY_TO_TARGET_TWELVE (the non-turret
 * branch): head for a point behind (six) or above (twelve) the target.
 */
export function behaviourFlyToTargetSix(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const stats = ctx.stats;
  const maxSpeed = stats.maxFlightSpeed;
  const weaponRange = weaponRangeOf(stats);
  const range = rangeToPrimaryTarget(entity, ctx);

  // deal with collisions and lost targets (4469-4482)
  const alert = proximityAlertBody(entity, ctx);
  if (alert !== undefined) {
    if (alert.id === targetBody(entity, ctx.view)?.id) {
      nav.behaviour = "ATTACK_FLY_TO_TARGET"; // this behaviour will handle proximity_alert.
      behaviourAttackFlyFromTarget(entity, ctx); // do it now.
    } else {
      avoidCollision(entity, ctx);
    }
    return;
  }
  if (!canStillTrackPrimaryTarget(entity, ctx)) {
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }

  // control speed (4484-4491; no afterburner)
  const slowDownRange = weaponRange * COMBAT_WEAPON_RANGE_FACTOR;
  const backOffRange = weaponRange * COMBAT_OUT_RANGE_FACTOR;
  const target = targetBody(entity, ctx.view);
  if (target === undefined) {
    // 4492-4496 (canStillTrackPrimaryTarget held, so this is not reached)
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }
  const targetSpeed = target.speed;
  const lastSuccessFactor = steer.successFactor;
  const distance = rangeToDestination(entity);
  steer.successFactor = Math.fround(distance);

  if (range < slowDownRange && nav.behaviour === "ATTACK_FLY_TO_TARGET_SIX") {
    if (range < backOffRange) {
      nav.desiredSpeed = Math.max(
        SIX_SPEEDS.closeTarget * targetSpeed,
        SIX_SPEEDS.closeMax * maxSpeed,
      );
    } else {
      nav.desiredSpeed = Math.max(
        SIX_SPEEDS.slowTarget * targetSpeed,
        maxSpeed,
      );
    }

    // avoid head-on collision
    if (range < SIX_HEAD_ON_SHARE * distance) {
      nav.behaviour = "ATTACK_FLY_TO_TARGET_TWELVE";
    }
  } else if (range < backOffRange) {
    nav.desiredSpeed = Math.max(
      SIX_SPEEDS.closeTarget * targetSpeed,
      SIX_SPEEDS.nearMax * maxSpeed,
    );
  } else {
    nav.desiredSpeed = maxSpeed; // use afterburner to approach
  }

  // if within 0.75km of the target's six or twelve, or if target almost at
  // standstill for 62.5% of non-thargoid ships (!), then vector in attack
  if (
    distance < SIX_VECTOR_IN_DISTANCE ||
    (targetSpeed < SIX_STANDSTILL_SPEED &&
      (entity.id & SIX_STANDSTILL_ID_MASK) > SIX_STANDSTILL_ID_BOUND)
  ) {
    nav.behaviour = "ATTACK_FLY_TO_TARGET";
    steer.frustration = Math.fround(0);
    nav.desiredSpeed = Math.max(
      targetSpeed,
      SIX_VECTOR_IN_MAX_SHARE * maxSpeed,
    );
  }

  // target-six: head for a point weapon-range * 0.5 to the six of the target
  if (nav.behaviour === "ATTACK_FLY_TO_TARGET_SIX") {
    nav.destination = distanceSix(target, SIX_BEHIND_SHARE * weaponRange);
  }
  // target-twelve: head for a point 1.25km above the target (the turret
  // branch is out)
  if (nav.behaviour === "ATTACK_FLY_TO_TARGET_TWELVE") {
    nav.destination = distanceTwelve(target, TWELVE_ABOVE);
  }

  steer.pitchingOver = false; // in case it's set from elsewhere
  const confidenceFactor = trackDestination(entity, ctx, false);

  if (
    steer.successFactor > lastSuccessFactor ||
    confidenceFactor < SIX_CONFIDENCE_LIMIT
  ) {
    steer.frustration = Math.fround(steer.frustration + ctx.dt);
  } else if (steer.frustration > 0) {
    steer.frustration = Math.fround(
      steer.frustration - ctx.dt * SIX_FRUSTRATION_RELIEF,
    );
    // Wegolite addition (T-14-16), not an Oolite line: the relief of 0.75 dt
    // leaves a counter in (0, 0.75 dt) negative, and Oolite lets it stay so. The
    // steering record keeps frustration in [0, MAX_FRUSTRATION] (the sanitiser
    // repairs anything else), so the counter is floored at 0 (the counter is
    // then a hair above Oolite's for the next few updates).
    if (steer.frustration < 0) steer.frustration = 0;
  }

  const aspect = approachAspectToPrimaryTarget(entity, ctx);
  if (
    steer.frustration > SIX_FRUSTRATION_LIMIT ||
    aspect > SIX_VECTOR_IN_ASPECT
  ) {
    nav.behaviour = "ATTACK_FLY_TO_TARGET";
  }
  // 4569-4575: missiles and cloak are the scope cuts above. `fireMainWeapon:`
  // (4575) is the request for a pilot that opted in (D-05), reached on every
  // update that did not return earlier, six and twelve alike.
  ctx.fire?.();

  // 4577-4579: a weapon that runs hot hands the attack back to the dispatcher
  // at any accuracy. The read is the steering-time temperature.
  if (entity.weapon.temperature > NPC_WEAPON_TEMP_USABLE) {
    nav.behaviour = "ATTACK_TARGET";
  }
}

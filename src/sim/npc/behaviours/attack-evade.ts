// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The sniper and the evasive attack sub-behaviours (AI-01, plan 14-14):
 * `behaviour_attack_sniper:` (`ShipEntity.m:4397-4459`),
 * `behaviour_attack_break_off_target:` (3886-3942) and
 * `behaviour_attack_slow_dogfight:` (3944-3994).
 *
 * Scope cuts, as in `attack-close.ts`: no afterburner (`canBurn` false), no
 * `fireMainWeapon:`, missile or cloak call, and a weapon that never heats, so
 * `weapon_temp > COMBAT_AI_WEAPON_TEMP_USABLE` (4456) is false and
 * `forward_weapon_temp` (3932) is 0.
 *
 * `frustration` and `successFactor` are GLfloat in Oolite: every write is
 * `Math.fround`.
 */

import type { Entity } from "../../world/entity.js";
import {
  avoidCollision,
  hasProximityAlertIgnoringTarget,
  proximityAlertBody,
} from "../avoid.js";
import {
  ATTACK_FRUSTRATION_JINK_Z,
  ATTACK_SUCCESS_GOOD,
  BREAK_OFF_DOGFIGHT_ASPECT,
  BREAK_OFF_FAR_RANGE,
  BREAK_OFF_HAND_OVER_ASPECT,
  BREAK_OFF_HAND_OVER_FRUSTRATION,
  BREAK_OFF_ROLL_COEFFICIENT,
  BREAK_OFF_SLOW_FRUSTRATION,
  COMBAT_AI_DOGFIGHTER,
  COMBAT_IN_RANGE_FACTOR,
  COMBAT_OUT_RANGE_FACTOR,
  DOGFIGHT_BEHIND_ASPECT,
  DOGFIGHT_BREAK_OFF_ASPECT,
  DOGFIGHT_CLOSE_FACTOR,
  DOGFIGHT_FRUSTRATION_LIMIT,
  DOGFIGHT_SIDE_ASPECT,
  DOGFIGHT_SPEEDS,
  NPC_WEAPON_TEMP,
  NPC_WEAPON_TEMP_READY,
  SCANNER_MAX_RANGE,
  SNIPER_BOUNCE_RANGE,
  SNIPER_FRUSTRATION_LIMIT,
  SNIPER_SCANNER_SHARE,
  SNIPER_SLOW_DIVISOR,
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
  evasiveAction,
  noteFrustration,
  setEvasiveJink,
  trackPrimaryTarget,
} from "../track.js";
import { targetTargetsSelf, weaponRangeOf } from "./attack.js";

/**
 * `behaviour_attack_sniper:` (`ShipEntity.m:4397-4459`): hold off at long range
 * with a long-range weapon, closing slowly while the aim holds, and hand back to
 * ATTACK_TARGET inside 15,000 m.
 */
export function behaviourAttackSniper(entity: Entity, ctx: SteerContext): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const maxSpeed = ctx.stats.maxFlightSpeed;
  if (!canStillTrackPrimaryTarget(entity, ctx)) {
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }
  if (targetBody(entity, ctx.view) === undefined) {
    // 4403-4408: a wormhole is no target (canStillTrack held, not reached)
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }

  const range = rangeToPrimaryTarget(entity, ctx);

  if (range < SNIPER_BOUNCE_RANGE) {
    nav.behaviour = "ATTACK_TARGET";
    return;
  }

  if (
    range > weaponRangeOf(ctx.stats) ||
    range > SCANNER_MAX_RANGE * SNIPER_SCANNER_SHARE
  ) {
    nav.desiredSpeed = maxSpeed; // no fuel injection
  } else {
    nav.desiredSpeed = maxSpeed / SNIPER_SLOW_DIVISOR;
  }

  const lastSuccessFactor = steer.successFactor;
  steer.successFactor = Math.fround(trackPrimaryTarget(entity, ctx, false));

  if (
    steer.successFactor > ATTACK_SUCCESS_GOOD ||
    steer.successFactor > lastSuccessFactor
  ) {
    steer.frustration = Math.fround(steer.frustration - ctx.dt);
    if (steer.frustration < 0) steer.frustration = 0;
  } else {
    steer.frustration = Math.fround(steer.frustration + ctx.dt);
    if (steer.frustration > SNIPER_FRUSTRATION_LIMIT) {
      // 3s of frustration
      noteFrustration(ctx);
      setEvasiveJink(entity, ctx, ATTACK_FRUSTRATION_JINK_Z);
      nav.behaviour = "ATTACK_TARGET";
      steer.frustration = Math.fround(0);
      nav.desiredSpeed = maxSpeed;
    }
  }
  // 4449-4458: missiles, cloak, fireMainWeapon and the hot-weapon return.
}

/**
 * `behaviour_attack_break_off_target:` (`ShipEntity.m:3886-3942`): fly away at
 * full speed, or evade when the target is not aiming at the ship, and hand over
 * to ATTACK_TARGET, slow dogfight or fly-to-target.
 */
export function behaviourAttackBreakOffTarget(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const stats = ctx.stats;
  const maxSpeed = stats.maxFlightSpeed;
  if (!canStillTrackPrimaryTarget(entity, ctx)) {
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }
  const range = rangeToPrimaryTarget(entity, ctx);

  nav.desiredSpeed = maxSpeed; // max_available_speed, no afterburner

  const target = targetBody(entity, ctx.view);

  if (hasProximityAlertIgnoringTarget(entity, ctx, false)) {
    avoidCollision(entity, ctx);
    return;
  }

  steer.frustration = Math.fround(steer.frustration + ctx.dt);
  if (
    steer.frustration > BREAK_OFF_SLOW_FRUSTRATION &&
    steer.accuracy >= COMBAT_AI_DOGFIGHTER
  ) {
    nav.desiredSpeed = maxSpeed / 2;
  }
  const aspect = approachAspectToPrimaryTarget(entity, ctx);
  if (
    range > BREAK_OFF_FAR_RANGE ||
    (target !== undefined &&
      !targetTargetsSelf(ctx.view, target.id, entity.id)) ||
    steer.frustration - Math.floor(steer.frustration) >
      Math.min(BREAK_OFF_ROLL_COEFFICIENT / stats.maxFlightRoll, aspect)
  ) {
    trackPrimaryTarget(entity, ctx, true);
  } else {
    // less useful at long range if not under direct fire
    evasiveAction(entity, ctx);
  }

  if (range > COMBAT_OUT_RANGE_FACTOR * weaponRangeOf(stats)) {
    nav.behaviour = "ATTACK_TARGET";
  } else if (
    aspect < BREAK_OFF_DOGFIGHT_ASPECT &&
    steer.accuracy >= COMBAT_AI_DOGFIGHTER
  ) {
    nav.behaviour = "ATTACK_SLOW_DOGFIGHT";
  } else if (
    steer.frustration > BREAK_OFF_HAND_OVER_FRUSTRATION &&
    approachAspectToPrimaryTarget(entity, ctx) < BREAK_OFF_HAND_OVER_ASPECT &&
    NPC_WEAPON_TEMP < NPC_WEAPON_TEMP_READY
  ) {
    steer.frustration = Math.fround(0);
    nav.behaviour =
      steer.accuracy >= COMBAT_AI_DOGFIGHTER
        ? "ATTACK_SLOW_DOGFIGHT"
        : "ATTACK_FLY_TO_TARGET";
  }
}

/**
 * `behaviour_attack_slow_dogfight:` (`ShipEntity.m:3944-3994`): stay behind the
 * target at its speed, slow right down abeam and speed up in front of it.
 */
export function behaviourAttackSlowDogfight(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const stats = ctx.stats;
  const maxSpeed = stats.maxFlightSpeed;
  if (!canStillTrackPrimaryTarget(entity, ctx)) {
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }
  if (hasProximityAlertIgnoringTarget(entity, ctx, true)) {
    avoidCollision(entity, ctx);
    return;
  }
  const range = rangeToPrimaryTarget(entity, ctx);
  const target = targetBody(entity, ctx.view);
  if (target === undefined) {
    // canStillTrackPrimaryTarget held, so a target exists
    noteLostTargetAndGoIdle(entity, ctx);
    return;
  }
  const aspect = approachAspectToPrimaryTarget(entity, ctx);
  if (
    range < DOGFIGHT_CLOSE_FACTOR * (entity.radius + target.radius) &&
    proximityAlertBody(entity, ctx)?.id === target.id &&
    aspect > 0
  ) {
    nav.desiredSpeed = maxSpeed;
    avoidCollision(entity, ctx);
    return;
  }
  if (
    aspect < DOGFIGHT_BEHIND_ASPECT &&
    range > COMBAT_IN_RANGE_FACTOR * weaponRangeOf(stats) * 2
  ) {
    nav.behaviour = "ATTACK_TARGET";
  } else if (aspect < DOGFIGHT_BEHIND_ASPECT) {
    // mostly behind target - try to stay there and keep up
    nav.desiredSpeed = Math.min(
      maxSpeed * DOGFIGHT_SPEEDS.behindShare,
      target.speed * DOGFIGHT_SPEEDS.behindShare,
    );
  } else if (aspect < DOGFIGHT_SIDE_ASPECT) {
    // to side of target - slow right down
    nav.desiredSpeed = maxSpeed * DOGFIGHT_SPEEDS.sideShare;
  } else {
    // coming to front of target - accelerate for a quick getaway
    nav.desiredSpeed =
      maxSpeed * Math.min(aspect * DOGFIGHT_SPEEDS.frontFactor, 1);
  }
  if (aspect > DOGFIGHT_BREAK_OFF_ASPECT) {
    nav.behaviour = "ATTACK_BREAK_OFF_TARGET";
  }
  if (aspect > 0) {
    steer.frustration = Math.fround(steer.frustration + ctx.dt);
  } else {
    steer.frustration = Math.fround(steer.frustration - ctx.dt);
  }
  if (steer.frustration > DOGFIGHT_FRUSTRATION_LIMIT) {
    nav.desiredSpeed /= 2;
  } else if (steer.frustration < 0) {
    steer.frustration = 0;
  }

  trackPrimaryTarget(entity, ctx, false);
  // 3989-3993: missiles and cloak.
}

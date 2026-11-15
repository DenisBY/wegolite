// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_formation_form_up:` (AI-01, plan 14-15; `ShipEntity.m:5002-5047`):
 * an escort flying to its slot behind its leader.
 *
 * The leader is the follower's own `ownerId`, read through `ctx.view` (the owner
 * is not on `ShipView`, so the follower reads its own entity). The destination
 * is NOT set here: "destination for each escort is set in update() from owner"
 * (5004), which is the escort leader refresh the world step runs right after
 * the leader's own update (`../escort.js`, plan 14-15). A follower whose owner
 * is gone, or is itself, takes Oolite's no-leader path: it flies at its
 * maximum speed and reports frustration (5036-5037).
 *
 * `frustration` and `successFactor` are GLfloat in Oolite: every write is
 * `Math.fround` (the steering contract of plan 14-09).
 */

import type { Entity } from "../../world/entity.js";
import {
  FLY_TO_ETA_SPEED_FACTOR,
  FLY_TO_NO_THRUST_SLOWDOWN,
  FLY_TO_SPEED_CUT,
  FLY_TO_TURN_SPEED_COEFFICIENT,
  FORMATION_ETA_LIMIT,
  FORMATION_ETA_SLOPE,
  FORMATION_FAR_SCANNER_SHARE,
  FORMATION_FRUSTRATION_LIMIT,
  FORMATION_FRUSTRATION_RELIEF,
  SCANNER_MAX_RANGE,
} from "../constants.js";
import { avoidCollision, hasProximityAlertIgnoringTarget } from "../avoid.js";
import type { SteerContext } from "../dispatch.js";
import {
  noteFrustration,
  rangeToDestination,
  trackDestination,
} from "../track.js";

/** `behaviour_formation_form_up:` (5002-5047). */
export function behaviourFormationFormUp(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const dt = ctx.dt;
  const stats = ctx.stats;
  const leader =
    entity.ownerId === 0 || entity.ownerId === entity.id
      ? undefined
      : ctx.view.ship(entity.ownerId);
  const distance = rangeToDestination(entity);
  const flightSpeed = entity.speed;

  let eta = (distance - nav.desiredRange) / flightSpeed;
  if (eta < 0) eta = 0;
  if (eta < FORMATION_ETA_LIMIT && leader !== undefined) {
    nav.desiredSpeed = leader.speed * (1 + eta * FORMATION_ETA_SLOPE);
  } else {
    nav.desiredSpeed = stats.maxFlightSpeed;
  }

  const lastDistance = steer.successFactor;
  steer.successFactor = Math.fround(distance);

  // do the actual piloting!!
  trackDestination(entity, ctx, false);

  eta = eta / FLY_TO_ETA_SPEED_FACTOR; // 2% safety margin assuming half the current speed
  const slowdownTime =
    stats.thrust > 0 ? flightSpeed / stats.thrust : FLY_TO_NO_THRUST_SLOWDOWN;
  const minTurnSpeedFactor =
    FLY_TO_TURN_SPEED_COEFFICIENT * stats.maxFlightPitch * stats.maxFlightRoll;

  if (
    eta < slowdownTime &&
    flightSpeed > stats.maxFlightSpeed * minTurnSpeedFactor
  ) {
    nav.desiredSpeed = flightSpeed * FLY_TO_SPEED_CUT; // cut speed by 50%
  }

  if (distance < lastDistance) {
    // improvement
    steer.frustration = Math.fround(
      steer.frustration - FORMATION_FRUSTRATION_RELIEF * dt,
    );
    if (steer.frustration < 0) steer.frustration = 0;
  } else {
    steer.frustration = Math.fround(steer.frustration + dt);
    if (steer.frustration > FORMATION_FRUSTRATION_LIMIT) {
      if (leader === undefined) {
        // escorts never reach their destination when following a leader
        noteFrustration(ctx);
      } else if (
        distance > FORMATION_FAR_SCANNER_SHARE * SCANNER_MAX_RANGE &&
        !steer.pitchingOver
      ) {
        // force a 180 degree turn, to let escorts break out of formation
        steer.pitchingOver = true;
      }
      steer.frustration = 0;
    }
  }
  if (hasProximityAlertIgnoringTarget(entity, ctx, true)) {
    avoidCollision(entity, ctx); // 5044-5045
  }
}

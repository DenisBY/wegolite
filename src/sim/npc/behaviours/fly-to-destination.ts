// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The fly-to-destination behaviours (AI-01, plan 14-10):
 * `behaviour_fly_range_from_destination:` (`ShipEntity.m:4903-4918`),
 * `behaviour_fly_to_destination:` (5049-5134) and
 * `behaviour_fly_from_destination:` (5136-5153, shared with FORMATION_BREAK at
 * 2604-2607).
 *
 * Not ported, by design:
 *  - the docking branches (`dockingInstructions`, `docking_match_rotation`:
 *    5052, 5059, 5088-5093, 5101-5115). No NPC docks in v2.2 (WORLD-09 is
 *    unscheduled), so `docking_match_rotation` is false and
 *    `dockingInstructions` is nil wherever it is read;
 *  - the proximity call sites (`hasProximityAlertIgnoringTarget:` then
 *    `avoidCollision`, 4914-4915, 5131-5132, 5150-5151): the alert is always 0
 *    until plan 14-15's pass, and `avoidCollision` needs the body radius and the
 *    tracking curve, so plan 14-13 adds `avoid.ts` and inserts the call sites
 *    marked below.
 *
 * Events. `doScriptEvent("shipAchievedDesiredRange")` becomes a queued AI event
 * (`ctx.emit`), never a synchronous call. Fly-to and fly-from post it once
 * because they switch to IDLE on the same tick. The plist-only AI messages
 * (`DESIRED_RANGE_ACHIEVED`, `FRUSTRATED`) have no consumer and are not posted.
 * `noteFrustration:` posts `shipAIFrustrated` without the context argument
 * Oolite passes (the behaviour name): a recorded divergence.
 *
 * `frustration` and `successFactor` are GLfloat in Oolite: every write is
 * `Math.fround` (the steering contract of plan 14-09).
 */

import type { Entity } from "../../world/entity.js";
import {
  FLY_TO_ETA_SPEED_FACTOR,
  FLY_TO_FRUSTRATION_LIMIT,
  FLY_TO_FRUSTRATION_RELIEF,
  FLY_TO_MIN_CONFIDENCE,
  FLY_TO_NO_THRUST_SLOWDOWN,
  FLY_TO_ORBIT_FACTOR,
  FLY_TO_SLOWDOWN_LIMIT_FACTOR,
  FLY_TO_SLOWDOWN_RESET_FACTOR,
  FLY_TO_SPEED_CUT,
  FLY_TO_TURN_SPEED_COEFFICIENT,
} from "../constants.js";
import type { SteerContext } from "../dispatch.js";
import {
  noteFrustration,
  rangeToDestination,
  trackDestination,
} from "../track.js";

/**
 * `behaviour_fly_range_from_destination:` (4903-4918): pick fly-from when the
 * ship is inside the desired range and fly-to otherwise. It does not move the
 * ship itself; the next update runs the chosen behaviour.
 */
export function behaviourFlyRangeFromDestination(
  entity: Entity,
  ctx: SteerContext,
): void {
  const nav = entity.nav;
  const distance = rangeToDestination(entity);
  if (distance < nav.desiredRange) {
    nav.behaviour = "FLY_FROM_DESTINATION";
    if (nav.desiredSpeed < ctx.stats.maxFlightSpeed) {
      // Not all AIs define a speed when flying away: start at the maximum
      // (4909).
      nav.desiredSpeed = ctx.stats.maxFlightSpeed;
    }
  } else {
    nav.behaviour = "FLY_TO_DESTINATION";
  }
  // 4914-4915: the proximity alert and avoidCollision: plan 14-13.
  entity.steer.frustration = 0;
}

/** `behaviour_fly_to_destination:` (5049-5134). */
export function behaviourFlyToDestination(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const dt = ctx.dt;
  const distance = rangeToDestination(entity);
  if (distance < nav.desiredRange) {
    // desired range achieved
    ctx.emit({ name: "shipAchievedDesiredRange" });
    // `docking_match_rotation` is false for every NPC (5059).
    nav.behaviour = "IDLE";
    nav.desiredSpeed = 0;
    steer.frustration = 0;
  } else {
    const lastDistance = steer.successFactor;
    steer.successFactor = Math.fround(distance);

    // do the actual piloting
    let confidenceFactor = trackDestination(entity, ctx, false);
    if (confidenceFactor < FLY_TO_MIN_CONFIDENCE) {
      confidenceFactor = FLY_TO_MIN_CONFIDENCE; // don't allow small or negative values
    }

    const flightSpeed = entity.speed;
    const stats = ctx.stats;
    // The ETA assumes half the current speed with a 2% margin (5085).
    const eta =
      (distance + 1 - nav.desiredRange) /
      (FLY_TO_ETA_SPEED_FACTOR * flightSpeed * confidenceFactor);
    const slowdownTime =
      stats.thrust > 0 ? flightSpeed / stats.thrust : FLY_TO_NO_THRUST_SLOWDOWN;
    // faster turning implies higher speeds (5087); `dockingInstructions` is
    // nil, so the divisions of 5089-5092 do not apply.
    const minTurnSpeedFactor =
      FLY_TO_TURN_SPEED_COEFFICIENT *
      stats.maxFlightPitch *
      stats.maxFlightRoll;

    if (
      (eta < slowdownTime &&
        flightSpeed > stats.maxFlightSpeed * minTurnSpeedFactor) ||
      flightSpeed >
        stats.maxFlightPitch * FLY_TO_ORBIT_FACTOR * confidenceFactor * distance
    ) {
      nav.desiredSpeed = flightSpeed * FLY_TO_SPEED_CUT; // cut speed by 50%
    }

    // 5099-5115: the docking flight correction block does not apply.

    if (distance < lastDistance) {
      // improvement
      steer.frustration = Math.fround(
        steer.frustration - FLY_TO_FRUSTRATION_RELIEF * dt,
      );
      if (steer.frustration < 0) steer.frustration = 0;
    } else {
      steer.frustration = Math.fround(steer.frustration + dt);
      if (
        (steer.frustration > slowdownTime * FLY_TO_SLOWDOWN_LIMIT_FACTOR &&
          slowdownTime > 0) ||
        steer.frustration > FLY_TO_FRUSTRATION_LIMIT
      ) {
        // 10x slowdownTime or 15 s of frustration
        noteFrustration(ctx);
        // repeat after another five units of frustration. Wegolite addition
        // (T-14-16), not an Oolite line: the 15 s branch can fire while 5 x
        // slowdownTime is larger than 15 (a fast ship with little thrust), and
        // Oolite's counter then goes negative, even to -infinity for a
        // vanishing thrust. The steering record keeps frustration in
        // [0, MAX_FRUSTRATION] (the sanitiser repairs anything else), so the
        // counter is floored at 0: the next report comes after 15 s instead of
        // after the longer relief Oolite's negative value would give.
        steer.frustration = Math.max(
          0,
          Math.fround(
            steer.frustration - slowdownTime * FLY_TO_SLOWDOWN_RESET_FACTOR,
          ),
        );
      }
    }
  }
  // 5131-5132: the proximity alert and avoidCollision: plan 14-13.
}

/** `behaviour_fly_from_destination:` (5136-5153; FORMATION_BREAK shares it). */
export function behaviourFlyFromDestination(
  entity: Entity,
  ctx: SteerContext,
): void {
  const distance = rangeToDestination(entity);
  if (distance > entity.nav.desiredRange) {
    // desired range achieved
    ctx.emit({ name: "shipAchievedDesiredRange" });
    entity.nav.behaviour = "IDLE";
    entity.steer.frustration = 0;
    entity.nav.desiredSpeed = 0;
  }

  trackDestination(entity, ctx, true);
  // 5150-5151: the proximity alert and avoidCollision: plan 14-13.
}

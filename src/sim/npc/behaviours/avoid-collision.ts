// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_avoid_collision:` (AI-01, plan 14-15; `ShipEntity.m:5155-5171`).
 *
 * Entered through `avoidCollision` (plan 14-13, `../avoid.js`) and left through
 * `resumePostProximityAlert`. While the alert names a body the view still
 * returns, the desired range is ten of that body's radii and the destination is
 * its position, written every update (5160-5163); the ship retreats from it
 * (`trackDestination` with retreat) and flies at
 * `maxFlightSpeed x (0.5 dq + 0.5)`: heading towards the other ship with a
 * positive speed avoids collisions better than stopping (5165-5167). Once the
 * alert is gone (cleared by the pass, or naming a body that no longer exists)
 * the destination keeps the other ship's last known position and the ship keeps
 * retreating from it until the range exceeds the desired range, then the saved
 * condition resumes (5157-5158).
 */

import { vec } from "../../math.js";
import type { Entity } from "../../world/entity.js";
import { PROXIMITY_AVOID_DISTANCE_FACTOR } from "../constants.js";
import { proximityAlertBody, resumePostProximityAlert } from "../avoid.js";
import type { SteerContext } from "../dispatch.js";
import { rangeToDestination, trackDestination } from "../track.js";

/** `behaviour_avoid_collision:` (5155-5171). */
export function behaviourAvoidCollision(
  entity: Entity,
  ctx: SteerContext,
): void {
  const nav = entity.nav;
  const distance = rangeToDestination(entity);
  if (distance > nav.desiredRange) {
    resumePostProximityAlert(entity, ctx);
    return;
  }
  const other = proximityAlertBody(entity, ctx);
  if (other !== undefined) {
    nav.desiredRange = other.radius * PROXIMITY_AVOID_DISTANCE_FACTOR;
    nav.destination = vec(other.position.x, other.position.y, other.position.z);
  }
  // returns 0 when heading towards the other ship
  const dq = trackDestination(entity, ctx, true);
  nav.desiredSpeed = ctx.stats.maxFlightSpeed * (0.5 * dq + 0.5);
}

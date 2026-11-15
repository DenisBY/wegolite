// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `behaviour_face_destination:` (AI-01, plan 14-10; `ShipEntity.m:4920-4965`).
 *
 * Turn to face `nav.destination` at speed 0, post `shipNowFacingDestination`
 * once facing and settled (the plist message `FACING_DESTINATION` has no
 * consumer), then go IDLE (`docking_match_rotation` is false for every NPC,
 * 4935-4940). The docking branch is not ported (no NPC docks in v2.2, WORLD-09
 * is unscheduled). The proximity call site (4962-4963) is plan 14-13's.
 *
 * Frustration is a GLfloat in Oolite: every write is `Math.fround`, so the
 * `15 / max_flight_pitch` threshold fires on the oracle's tick.
 */

import type { Entity } from "../../world/entity.js";
import {
  FACE_DAMPING_CONFIDENCE,
  FACE_DAMPING_FRUSTRATION,
  FACE_DAMPING_SHARE,
  FACE_ESCAPE_PITCH,
  FACE_FRUSTRATION_LIMIT,
  FACE_MIN_RANGE,
  FACE_PRECISION,
  MAX_COS,
} from "../constants.js";
import type { SteerContext } from "../dispatch.js";
import {
  noteFrustration,
  rangeToDestination,
  trackDestination,
} from "../track.js";

export function behaviourFaceDestination(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const nav = entity.nav;
  const maxFlightPitch = ctx.stats.maxFlightPitch;
  let maxCos = MAX_COS;
  const distance = rangeToDestination(entity);
  const oldPitch = steer.flightPitch;
  nav.desiredSpeed = 0;
  if (nav.desiredRange > FACE_MIN_RANGE && distance > nav.desiredRange) {
    // head for a point within the range sphere (must match trackDestination)
    maxCos = Math.sqrt(
      1 -
        (FACE_PRECISION * nav.desiredRange * nav.desiredRange) /
          (distance * distance),
    );
  }
  const confidenceFactor = trackDestination(entity, ctx, false);
  if (confidenceFactor >= maxCos && steer.flightPitch === 0) {
    // desired facing achieved and movement stabilised
    ctx.emit({ name: "shipNowFacingDestination" });
    steer.frustration = 0;
    nav.behaviour = "IDLE";
  }

  if (entity.speed === 0) {
    steer.frustration = Math.fround(steer.frustration + ctx.dt);
  }
  if (steer.frustration > FACE_FRUSTRATION_LIMIT / maxFlightPitch) {
    // allow more time for slow ships
    steer.frustration = 0;
    noteFrustration(ctx);
    if (steer.flightPitch === oldPitch) {
      steer.flightPitch = FACE_ESCAPE_PITCH * maxFlightPitch; // hack to get out of frustration
    }
  }

  // Damping of a pitch sign flip (4953-4960). Its conditions are state (speed
  // 0, frustration above 5, confidence above 0.5, a sign flip of the pitch),
  // not a frame count, so it is reachable at 1/120 s: the oracle fixture
  // face-destination-sign-flip-damping exercises it on ticks 605 to 607.
  if (
    entity.speed === 0 &&
    steer.frustration > FACE_DAMPING_FRUSTRATION &&
    confidenceFactor > FACE_DAMPING_CONFIDENCE &&
    ((steer.flightPitch > 0 && oldPitch < 0) ||
      (steer.flightPitch < 0 && oldPitch > 0))
  ) {
    steer.flightPitch += FACE_DAMPING_SHARE * oldPitch; // damping with last pitch value
  }

  // 4962-4963: the proximity alert and avoidCollision: plan 14-13.
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The oracle's reference navigation behaviours, transliterated line by line
 * from the pinned Oolite source (commit 7437f22) in Oolite's own frame, on top
 * of the flight model of `flight.ts`. Nothing here imports Wegolite code.
 *
 * - `trackDestination:retreat:`        ShipEntity.m:9450-9591
 * - `behaviour_fly_range_from_destination`  ShipEntity.m:4903-4918
 * - `behaviour_face_destination`       ShipEntity.m:4920-4965
 * - `behaviour_fly_to_destination`     ShipEntity.m:5049-5134
 * - `behaviour_fly_from_destination`   ShipEntity.m:5136-5153
 * - `noteFrustration:`                 ShipEntity.m:2641-2645
 * - `hasProximityAlertIgnoringTarget:` ShipEntity.m:9751-9757
 * - performFaceDestination / performFlyToRangeFromDestination
 *                                      ShipEntityAI.m:373-377, 394-398
 *
 * Float handling follows `flight.ts`: GLfloat stores go through `mode.r`, and
 * `frustration` and `successFactor` through `fr` in both modes (contract item
 * 8). Oolite's own double locals (`min_d`, `max_cos`, `distance`, `eta`'s
 * numerator) stay doubles.
 *
 * Scope: the avoid-collision, escort and proximity rules belong to plan 14-06.
 * A fixture whose self holds a proximity alert fails loudly here instead of
 * being replayed without the rule. Docking instructions and
 * `docking_match_rotation` are never set (a recorded scope cut).
 */

import type { OracleFixture } from "../schema.js";
import {
  BASE_BEHAVIOURS,
  applySticks,
  fr,
  rangeToDestination,
  replayWith,
  type BehaviourTable,
  type Ctx,
  type Mode,
  type ReplayResult,
  type Ship,
} from "./flight.js";
import { dot, magnitude2, vectorNormal, type Vec } from "./vec.js";

/** `MAX_COS` (`ShipEntity.h:142`). */
export const MAX_COS = 0.995;

/** `hasProximityAlertIgnoringTarget:` (`ShipEntity.m:9751-9757`). */
function hasProximityAlertIgnoringTarget(
  ship: Ship,
  ignoreTarget: boolean,
): boolean {
  return (
    ship.proximityAlert !== 0 &&
    (!ignoreTarget || ship.proximityAlert !== ship.targetId)
  );
}

/** `avoidCollision` is plan 14-06's: refuse to replay it silently. */
function avoidCollisionIfAlerted(ship: Ship): void {
  if (hasProximityAlertIgnoringTarget(ship, true)) {
    throw new Error("avoidCollision is filled by plan 14-06");
  }
}

/**
 * `trackDestination:retreat:` (`ShipEntity.m:9450-9591`) for a non-player,
 * non-docking ship. Returns the same confidence value (`d_forward`, 0 or 1).
 */
export function trackDestination(
  ship: Ship,
  ctx: Ctx,
  retreat: boolean,
): number {
  const mode = ctx.mode;
  const r = mode.r;
  const dt = ctx.dt;
  const maxRoll = ship.stats.maxFlightRoll;
  const maxPitch = ship.stats.maxFlightPitch;

  ship.stickRoll = 0.0; // desired roll and pitch
  ship.stickPitch = 0.0;
  ship.stickYaw = 0.0;

  let reverse = 1.0;
  const reversePlayer = 1.0;

  const minD = 0.004;
  let maxCos = MAX_COS;
  const precision = 0.9025;

  if (retreat) reverse = -reverse;

  let relPos: Vec = {
    x: r(ship.destination.x - ship.position.x),
    y: r(ship.destination.y - ship.position.y),
    z: r(ship.destination.z - ship.position.z),
  };
  const range2 = magnitude2(mode, relPos);
  const desiredRange2 = ship.desiredRange * ship.desiredRange;

  if (range2 > desiredRange2) {
    maxCos = Math.sqrt(1 - (precision * desiredRange2) / range2);
    if (maxCos >= 0.99999) maxCos = 0.99999;
  }

  if (relPos.x !== 0 || relPos.y !== 0 || relPos.z !== 0) {
    relPos = vectorNormal(mode, relPos);
  } else {
    relPos = { x: relPos.x, y: relPos.y, z: 1.0 };
  }

  const dRight = dot(mode, relPos, ship.right);
  let dUp = dot(mode, relPos, ship.up);
  let dForward = dot(mode, relPos, ship.forward); // cos of the angle to the target

  // begin rule-of-thumb manoeuvres
  ship.stickPitch = 0.0;
  ship.stickRoll = 0.0;

  // pitching_over: immediate pitch corrections instead of waiting for the roll
  if (ship.pitchingOver) {
    if (reverse * dUp > 0) {
      ship.stickPitch = r(-maxPitch); // pitch up
    } else {
      ship.stickPitch = r(maxPitch);
    }
    ship.pitchingOver = reverse * dForward < 0.707;
  }

  // check if we are flying toward (or away from) the destination
  if (dForward < maxCos || retreat) {
    // not on course, so adjust the controls
    if (dForward <= -maxCos || (retreat && dForward >= maxCos)) {
      // hack to avoid just flying away from the destination
      dUp = r(minD * 2.0);
    }

    if (dUp > minD) {
      let factor = Math.trunc(Math.sqrt(Math.abs(dRight) / Math.abs(minD)));
      if (factor > 8) factor = 8;
      if (dRight > minD)
        ship.stickRoll = r(-maxRoll * reversePlayer * 0.125 * factor);
      if (dRight < -minD)
        ship.stickRoll = r(+maxRoll * reversePlayer * 0.125 * factor);
      if (Math.abs(dRight) < Math.abs(ship.stickRoll) * dt) {
        ship.stickRoll = r(
          (Math.abs(dRight) / dt) * (ship.stickRoll < 0 ? -1 : 1),
        ); // don't overshoot heading
      }
    }

    if (dUp < -minD) {
      let factor = Math.trunc(Math.sqrt(Math.abs(dRight) / Math.abs(minD)));
      if (factor > 8) factor = 8;
      if (dRight > minD)
        ship.stickRoll = r(+maxRoll * reversePlayer * 0.125 * factor);
      if (dRight < -minD)
        ship.stickRoll = r(-maxRoll * reversePlayer * 0.125 * factor);
      if (Math.abs(dRight) < Math.abs(ship.stickRoll) * dt) {
        ship.stickRoll = r(
          (Math.abs(dRight) / dt) * (ship.stickRoll < 0 ? -1 : 1),
        );
      }
    }

    if (ship.stickRoll === 0.0) {
      let factor = Math.trunc(Math.sqrt(Math.abs(dUp) / Math.abs(minD)));
      if (factor > 8) factor = 8;
      if (dUp > minD) ship.stickPitch = r(-maxPitch * reverse * 0.125 * factor);
      if (dUp < -minD)
        ship.stickPitch = r(+maxPitch * reverse * 0.125 * factor);
      if (Math.abs(dUp) < Math.abs(ship.stickPitch) * dt) {
        ship.stickPitch = r(
          (Math.abs(dUp) / dt) * (ship.stickPitch < 0 ? -1 : 1),
        ); // don't overshoot heading
      }
    }

    if (ship.stickPitch === 0.0) {
      // not sufficiently on course yet, but min_d is too high:
      // turn anyway slightly to adjust
      ship.stickPitch = r(0.01);
    }
  }

  // end rule-of-thumb manoeuvres
  applySticks(ship, ctx);

  if (retreat) dForward = r(dForward * dForward); // make positive AND decrease granularity

  if (dForward < 0.0) return 0.0;

  if (!ship.flightRoll && !ship.flightPitch) return 1.0; // no correction

  return dForward;
}

/** `noteFrustration:` (`ShipEntity.m:2641-2645`): the AI event. */
function noteFrustration(ctx: Ctx): void {
  ctx.post("shipAIFrustrated");
}

/** `behaviour_fly_range_from_destination:` (`ShipEntity.m:4903-4918`). */
function behaviourFlyRangeFromDestination(ship: Ship, ctx: Ctx): void {
  const distance = rangeToDestination(ship, ctx.mode);
  if (distance < ship.desiredRange) {
    ship.behaviour = "FLY_FROM_DESTINATION";
    if (ship.desiredSpeed < ship.stats.maxFlightSpeed) {
      ship.desiredSpeed = ship.stats.maxFlightSpeed;
    }
  } else {
    ship.behaviour = "FLY_TO_DESTINATION";
  }
  avoidCollisionIfAlerted(ship);
  ship.frustration = fr(0.0);
}

/** `behaviour_face_destination:` (`ShipEntity.m:4920-4965`). */
function behaviourFaceDestination(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  let maxCos = MAX_COS;
  const distance = rangeToDestination(ship, ctx.mode);
  const oldPitch = ship.flightPitch;
  ship.desiredSpeed = 0.0;
  if (ship.desiredRange > 1.0 && distance > ship.desiredRange) {
    maxCos = Math.sqrt(
      1 - (0.9 * ship.desiredRange * ship.desiredRange) / (distance * distance),
    );
  }
  const confidenceFactor = trackDestination(ship, ctx, false);
  if (confidenceFactor >= maxCos && ship.flightPitch === 0.0) {
    // desired facing achieved and movement stabilised
    ctx.post("shipNowFacingDestination");
    ship.frustration = fr(0.0);
    ship.behaviour = "IDLE"; // docking_match_rotation is never set
  }

  if (ship.flightSpeed === 0) ship.frustration = fr(ship.frustration + ctx.dt);
  if (ship.frustration > 15.0 / ship.stats.maxFlightPitch) {
    // allow more time for slow ships
    ship.frustration = fr(0.0);
    noteFrustration(ctx);
    if (ship.flightPitch === oldPitch) {
      ship.flightPitch = r(0.5 * ship.stats.maxFlightPitch); // hack to get out of frustration
    }
  }

  // the sign-flip damping branch (low-FPS "flippering" hack)
  if (
    ship.flightSpeed === 0 &&
    ship.frustration > 5 &&
    confidenceFactor > 0.5 &&
    ((ship.flightPitch > 0 && oldPitch < 0) ||
      (ship.flightPitch < 0 && oldPitch > 0))
  ) {
    ship.flightPitch = r(ship.flightPitch + 0.5 * oldPitch); // damping with last pitch value
    ctx.counters["damping"] = (ctx.counters["damping"] ?? 0) + 1;
  }

  avoidCollisionIfAlerted(ship);
}

/** `behaviour_fly_to_destination:` (`ShipEntity.m:5049-5134`). */
function behaviourFlyToDestination(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  const dt = ctx.dt;
  const distance = rangeToDestination(ship, ctx.mode);
  if (distance < ship.desiredRange) {
    // desired range achieved
    ctx.post("shipAchievedDesiredRange");
    ship.behaviour = "IDLE"; // docking_match_rotation is never set
    ship.desiredSpeed = 0.0;
    ship.frustration = fr(0.0);
  } else {
    const lastDistance = ship.successFactor;
    ship.successFactor = fr(distance);

    // do the actual piloting
    let confidenceFactor = trackDestination(ship, ctx, false);
    if (confidenceFactor < 0.2) confidenceFactor = 0.2; // don't allow small or negative values

    const eta = r(
      (distance + 1 - ship.desiredRange) /
        (0.51 * ship.flightSpeed * confidenceFactor),
    );
    const slowdownTime =
      ship.stats.thrust > 0.0 ? r(ship.flightSpeed / ship.stats.thrust) : 4.0;
    const minTurnSpeedFactor = r(
      0.05 * ship.stats.maxFlightPitch * ship.stats.maxFlightRoll,
    );

    if (
      (eta < slowdownTime &&
        ship.flightSpeed > r(ship.stats.maxFlightSpeed * minTurnSpeedFactor)) ||
      ship.flightSpeed >
        r(ship.stats.maxFlightPitch * 5) * confidenceFactor * distance
    ) {
      ship.desiredSpeed = r(ship.flightSpeed * 0.5); // cut speed by 50%
    }

    if (distance < lastDistance) {
      // improvement
      ship.frustration = fr(ship.frustration - 0.25 * dt);
      if (ship.frustration < 0.0) ship.frustration = fr(0.0);
    } else {
      ship.frustration = fr(ship.frustration + dt);
      if (
        (ship.frustration > slowdownTime * 10.0 && slowdownTime > 0) ||
        ship.frustration > 15.0
      ) {
        // 10x slowdownTime or 15 s of frustration
        noteFrustration(ctx);
        ship.frustration = fr(ship.frustration - slowdownTime * 5.0); // repeat after another five units
      }
    }
  }
  avoidCollisionIfAlerted(ship);
}

/** `behaviour_fly_from_destination:` (`ShipEntity.m:5136-5153`). */
function behaviourFlyFromDestination(ship: Ship, ctx: Ctx): void {
  const distance = rangeToDestination(ship, ctx.mode);
  if (distance > ship.desiredRange) {
    // desired range achieved
    ctx.post("shipAchievedDesiredRange");
    ship.behaviour = "IDLE";
    ship.frustration = fr(0.0);
    ship.desiredSpeed = 0.0;
  }

  trackDestination(ship, ctx, true);
  avoidCollisionIfAlerted(ship);
}

/** `performFaceDestination` (`ShipEntityAI.m:373-377`). */
function performFaceDestination(ship: Ship): void {
  ship.behaviour = "FACE_DESTINATION";
  ship.frustration = fr(0.0);
}

/** `performFlyToRangeFromDestination` (`ShipEntityAI.m:394-398`). */
function performFlyToRangeFromDestination(ship: Ship): void {
  ship.behaviour = "FLY_RANGE_FROM_DESTINATION";
  ship.frustration = fr(0.0);
}

/** The navigation behaviours of this file (plan 14-06 adds avoid and escort). */
export const NAVIGATION_BEHAVIOURS: BehaviourTable = {
  FLY_RANGE_FROM_DESTINATION: {
    process: behaviourFlyRangeFromDestination,
    perform: performFlyToRangeFromDestination,
  },
  FLY_TO_DESTINATION: { process: behaviourFlyToDestination },
  FLY_FROM_DESTINATION: { process: behaviourFlyFromDestination },
  FORMATION_BREAK: { process: behaviourFlyFromDestination },
  FACE_DESTINATION: {
    process: behaviourFaceDestination,
    perform: performFaceDestination,
  },
};

/** Every behaviour the reference models in this plan. */
export const ALL_BEHAVIOURS: BehaviourTable = {
  ...BASE_BEHAVIOURS,
  ...NAVIGATION_BEHAVIOURS,
};

/** Replay a fixture with every behaviour of this plan. */
export function replayAll(
  fixture: OracleFixture,
  mode: Mode,
  wanted?: ReadonlySet<number>,
): ReplayResult {
  return replayWith(fixture, mode, ALL_BEHAVIOURS, wanted);
}

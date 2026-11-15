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
 * - `avoidCollision`                   ShipEntity.m:5904-5936
 * - `resumePostProximityAlert`         ShipEntity.m:5938-5958
 * - `behaviour_avoid_collision`        ShipEntity.m:5155-5171
 * - `behaviour_formation_form_up`      ShipEntity.m:5002-5047
 * - `performEscort`                    ShipEntityAI.m:365-371
 * - `setProximityAlert:`               ShipEntity.m:6098-6146
 * - the proximity pair trigger         CollisionRegion.m:262-312, Universe.h:98-101
 * - escort destination refresh         ShipEntity.m:2427-2436, 11900-11903, 12029-12044
 * - default escort pattern             Resources/Scripts/oolite-global-prefix.js:165-193
 *
 * Float handling follows `flight.ts`: GLfloat stores go through `mode.r`, and
 * `frustration` and `successFactor` through `fr` in both modes (contract item
 * 8). Oolite's own double locals (`min_d`, `max_cos`, `distance`, `eta`'s
 * numerator) stay doubles.
 *
 * Scope: plan 14-06 adds the avoid-collision, proximity and escort rules,
 * filling slots (b) and (d) of the replay loop through `NAVIGATE_HOOKS`.
 * Docking instructions and `docking_match_rotation` are never set, and self is
 * a crewed ship that is neither launching nor docking (recorded scope cuts and
 * contract item 4). The tracking curve is not modelled here (plan 14-02's
 * `derive.ts` holds it), so `resumePostProximityAlert`'s `startTrackingCurve`
 * (`ShipEntity.m:5946`) is a no-op in this reference.
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
  type ReplayBody,
  type ReplayHooks,
  type ReplayResult,
  type Ship,
} from "./flight.js";
import {
  dot,
  magnitude2,
  quatFromBasis,
  vec,
  vectorNormal,
  type Quat,
  type Vec,
} from "./vec.js";

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

/** `PROXIMITY_WARN_DISTANCE2` (`Universe.h:98-99`): 4 squared. */
export const PROXIMITY_WARN_DISTANCE2 = 16;
/** `PROXIMITY_AVOID_DISTANCE_FACTOR` (`Universe.h:101`). */
export const PROXIMITY_AVOID_DISTANCE_FACTOR = 10.0;

/**
 * `setProximityAlert:` (`ShipEntity.m:6098-6146`) for self, given the other
 * ship of a pair that already passed the pair trigger. Self is crewed, is not
 * launching or docking, and `other.mass` is the body's mass (contract item 4).
 */
export function setProximityAlert(
  ship: Ship,
  other: ReplayBody,
  ctx: Ctx,
): void {
  const r = ctx.mode.r;
  if (other.mass < 2000) return; // 6105: not alerted by small objects
  if (ship.scanClass === "CLASS_STATION") return; // 6108: stations do not worry

  // check vectors (6120-6123): GLfloat components of the separation
  const vdiff: Vec = {
    x: r(other.position.x - ship.position.x),
    y: r(other.position.y - ship.position.y),
    z: r(other.position.z - ship.position.z),
  };
  let dForward = dot(ctx.mode, vdiff, ship.forward);
  const dUp = dot(ctx.mode, vdiff, ship.up);
  const dRight = dot(ctx.mode, vdiff, ship.right);
  if (dForward > 0.0 && ship.flightSpeed > 0.0) {
    // it's ahead of us and we're moving forward: extend the zone forward
    dForward = r(
      dForward * ((0.25 * ship.stats.maxFlightSpeed) / ship.flightSpeed),
    );
  }
  const d2 = r(r(r(dForward * dForward) + r(dUp * dUp)) + r(dRight * dRight));
  let cr2 = ship.radius * 2.0 + other.radius;
  cr2 *= cr2; // twice the combined radius
  if (d2 > cr2) return; // we're okay

  if (ship.behaviour === "AVOID_COLLISION" && ship.proximityAlert !== 0) {
    // already avoiding something: keep the one that subtends the greater angle
    const prox = ctx.bodies.find(
      (candidate) => candidate.id === ship.proximityAlert,
    );
    if (prox !== undefined && prox.id !== other.id) {
      const distance2 = (a: Vec, b: Vec): number =>
        (a.x - b.x) * (a.x - b.x) +
        (a.y - b.y) * (a.y - b.y) +
        (a.z - b.z) * (a.z - b.z);
      const saProx = r(
        r(prox.radius * prox.radius) / distance2(ship.position, prox.position),
      );
      const saOther = r(
        r(other.radius * other.radius) /
          distance2(ship.position, other.position),
      );
      if (saProx < saOther) return;
    }
  }
  ship.proximityAlert = other.id;
}

/**
 * Slot (d) of the in-tick order: the proximity rule. Self's alert is cleared
 * (`CollisionRegion.m:271`), then for every body that is a ship (not a planet
 * or a sun), in ascending id (Oolite visits the collision chain's order; a
 * recorded divergence, contract item 4 (d)), the pair trigger
 * `dist2 < PROXIMITY_WARN_DISTANCE2 * r2^2 || dist2 < PROXIMITY_WARN_DISTANCE2 * r1^2`
 * inside the outer gate `dist2 < PROXIMITY_WARN_DISTANCE2 * (r1 + r2)^2`
 * (`CollisionRegion.m:296-312`), followed by `setProximityAlert:`. The
 * collision-chain prefilter (`Universe.m:6713-6760`, 7045-7073) is not
 * modelled: a recorded divergence that no fixture of this plan depends on.
 */
export function proximityRule(ship: Ship, ctx: Ctx): void {
  ship.proximityAlert = 0;
  const ordered = [...ctx.bodies].sort((a, b) => a.id - b.id);
  for (const body of ordered) {
    if (body.kind === "planet" || body.kind === "sun") continue;
    const r1 = ship.radius;
    const r2 = body.radius;
    const r0 = r1 + r2;
    const dx = body.position.x - ship.position.x;
    const dy = body.position.y - ship.position.y;
    const dz = body.position.z - ship.position.z;
    const dist2 = dx * dx + dy * dy + dz * dz;
    const minDist2 = r0 * r0;
    if (dist2 < PROXIMITY_WARN_DISTANCE2 * minDist2) {
      if (
        dist2 < PROXIMITY_WARN_DISTANCE2 * r2 * r2 ||
        dist2 < PROXIMITY_WARN_DISTANCE2 * r1 * r1
      ) {
        setProximityAlert(ship, body, ctx);
      }
    }
  }
}

/** `avoidCollision` (`ShipEntity.m:5904-5936`) for a ship that is not a missile. */
function avoidCollision(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  const prox = ctx.bodies.find(
    (candidate) => candidate.id === ship.proximityAlert,
  );
  if (prox === undefined) return;
  ship.previousCondition = {
    behaviour: ship.behaviour,
    targetId: ship.targetId,
    desiredRange: ship.desiredRange,
    desiredSpeed: ship.desiredSpeed,
    destination: ship.destination,
  };
  // 5929: the point between us and them (OOHPVectorInterpolate, fraction 0.5)
  ship.destination = {
    x: ship.position.x * 0.5 + prox.position.x * 0.5,
    y: ship.position.y * 0.5 + prox.position.y * 0.5,
    z: ship.position.z * 0.5 + prox.position.z * 0.5,
  };
  ship.desiredRange = r(prox.radius * PROXIMITY_AVOID_DISTANCE_FACTOR);
  ship.behaviour = "AVOID_COLLISION";
  ship.pitchingOver = true;
}

/** `resumePostProximityAlert` (`ShipEntity.m:5938-5958`); no tracking curve is modelled. */
function resumePostProximityAlert(ship: Ship): void {
  const previous = ship.previousCondition;
  if (previous === null) return;
  ship.behaviour = previous.behaviour;
  ship.targetId = previous.targetId;
  ship.desiredRange = previous.desiredRange;
  ship.desiredSpeed = previous.desiredSpeed;
  ship.destination = previous.destination;
  ship.previousCondition = null;
  ship.frustration = fr(0.0);
  ship.proximityAlert = 0; // DESTROY(_proximityAlert)
}

/** `behaviour_avoid_collision:` (`ShipEntity.m:5155-5171`). */
function behaviourAvoidCollision(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  const distance = rangeToDestination(ship, ctx.mode);
  if (distance > ship.desiredRange) {
    resumePostProximityAlert(ship);
  } else {
    const prox = ctx.bodies.find(
      (candidate) => candidate.id === ship.proximityAlert,
    );
    if (prox !== undefined) {
      ship.desiredRange = r(prox.radius * PROXIMITY_AVOID_DISTANCE_FACTOR);
      ship.destination = { ...prox.position };
    }
    const dq = trackDestination(ship, ctx, true); // returns 0 when heading towards prox_ship
    // heading towards the target with desired_speed > 0 avoids collisions better
    ship.desiredSpeed = r(ship.stats.maxFlightSpeed * (0.5 * dq + 0.5));
  }
}

/** The call site shared by every navigation behaviour: `ShipEntity.m:4914-4916` and its twins. */
function avoidCollisionIfAlerted(ship: Ship, ctx: Ctx): void {
  if (hasProximityAlertIgnoringTarget(ship, true)) {
    avoidCollision(ship, ctx);
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
  avoidCollisionIfAlerted(ship, ctx);
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

  avoidCollisionIfAlerted(ship, ctx);
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
  avoidCollisionIfAlerted(ship, ctx);
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
  avoidCollisionIfAlerted(ship, ctx);
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

/** `behaviour_formation_form_up:` (`ShipEntity.m:5002-5047`). */
function behaviourFormationFormUp(ship: Ship, ctx: Ctx): void {
  const r = ctx.mode.r;
  const dt = ctx.dt;
  // destination for each escort is set in update() from owner (5004)
  const leader = ctx.bodies.find((candidate) => candidate.id === ship.ownerId);
  const distance = rangeToDestination(ship, ctx.mode);
  let eta = (distance - ship.desiredRange) / ship.flightSpeed;
  if (eta < 0) eta = 0;
  if (eta < 5.0 && leader !== undefined) {
    ship.desiredSpeed = r(leader.speed * (1 + eta * 0.05));
  } else {
    ship.desiredSpeed = ship.stats.maxFlightSpeed;
  }

  const lastDistance = ship.successFactor;
  ship.successFactor = fr(distance);

  // do the actual piloting!!
  trackDestination(ship, ctx, false);

  eta = eta / 0.51; // 2% safety margin assuming an average of half current speed
  const slowdownTime =
    ship.stats.thrust > 0.0 ? r(ship.flightSpeed / ship.stats.thrust) : 4.0;
  const minTurnSpeedFactor = r(
    0.05 * ship.stats.maxFlightPitch * ship.stats.maxFlightRoll,
  );
  if (
    eta < slowdownTime &&
    ship.flightSpeed > r(ship.stats.maxFlightSpeed * minTurnSpeedFactor)
  ) {
    ship.desiredSpeed = r(ship.flightSpeed * 0.5); // cut speed by 50%
  }

  if (distance < lastDistance) {
    // improvement
    ship.frustration = fr(ship.frustration - 0.25 * dt);
    if (ship.frustration < 0.0) ship.frustration = fr(0.0);
  } else {
    ship.frustration = fr(ship.frustration + dt);
    if (ship.frustration > 15.0) {
      if (leader === undefined) {
        noteFrustration(ctx); // escorts never reach their destination when following leader
      } else if (
        distance > 0.5 * ship.stats.scannerRange &&
        !ship.pitchingOver
      ) {
        ship.pitchingOver = true; // force a 180 degree turn
      }
      ship.frustration = fr(0);
    }
  }
  avoidCollisionIfAlerted(ship, ctx);
}

/** `performEscort` (`ShipEntityAI.m:365-371`). */
function performEscort(ship: Ship): void {
  if (ship.behaviour !== "FORMATION_FORM_UP") {
    ship.behaviour = "FORMATION_FORM_UP";
    ship.frustration = fr(0.0); // behaviour changed, reset frustration
  }
}

/** The default escort pattern (`oolite-global-prefix.js:165-171`, V-shape). */
const ESCORT_POSITIONS: readonly (readonly [number, number, number])[] = [
  [-2, 0, -1],
  [2, 0, -1],
  [-3, 0, -3],
  [3, 0, -3],
];
const ESCORT_SPACING_FACTOR = 3;

/** `quaternion_rotate_vector` (`OOQuaternion.m:378-392`), GLfloat arithmetic. */
function quatRotateVector(mode: Mode, q: Quat, v: Vec): Vec {
  const r = mode.r;
  const qvw = r(r(r(0 - r(q.x * v.x)) - r(q.y * v.y)) - r(q.z * v.z));
  const qvx = r(r(r(-q.w * v.x) + r(q.y * v.z)) - r(q.z * v.y));
  const qvy = r(r(r(-q.w * v.y) + r(q.z * v.x)) - r(q.x * v.z));
  const qvz = r(r(r(-q.w * v.z) + r(q.x * v.y)) - r(q.y * v.x));
  return {
    x: r(r(r(r(qvw * -q.x) + r(qvx * -q.w)) + r(qvy * -q.z)) - r(qvz * -q.y)),
    y: r(r(r(r(qvw * -q.y) + r(qvy * -q.w)) + r(qvz * -q.x)) - r(qvx * -q.z)),
    z: r(r(r(r(qvw * -q.z) + r(qvz * -q.w)) + r(qvx * -q.y)) - r(qvy * -q.x)),
  };
}

/**
 * `coordinatesForEscortPosition:` for the default script
 * (`ShipEntity.m:12029-12044`, `oolite-global-prefix.js:186-193`): the leader's
 * position plus the pattern offset of the slot, scaled by the leader's
 * collision radius, rotated into the leader's frame.
 */
export function coordinatesForEscortPosition(
  mode: Mode,
  leader: ReplayBody,
  index: number,
): Vec {
  const r = mode.r;
  const highPart = Math.floor(index / ESCORT_POSITIONS.length) + 1;
  const lowPart = index % ESCORT_POSITIONS.length;
  const spacing = leader.radius * ESCORT_SPACING_FACTOR * highPart;
  const pattern = ESCORT_POSITIONS[lowPart] ?? [0, 0, 0];
  const offset = vec(
    r(pattern[0] * spacing),
    r(pattern[1] * spacing),
    r(pattern[2] * spacing),
  );
  const basis = quatFromBasis(leader.right, leader.up, leader.forward);
  const orientation: Quat = {
    w: r(basis.w),
    x: r(basis.x),
    y: r(basis.y),
    z: r(basis.z),
  };
  const rotated = quatRotateVector(mode, orientation, offset);
  return {
    x: leader.position.x + rotated.x,
    y: leader.position.y + rotated.y,
    z: leader.position.z + rotated.z,
  };
}

/**
 * Slot (b) of the in-tick order: the escort leader writes self's destination
 * after its own update (`ShipEntity.m:2427-2436`, `setEscortDestination:` at
 * 11900-11903, which does not reset frustration). A self whose `ownerId`
 * names no body has no leader and keeps its destination.
 */
export function refreshLeader(ship: Ship, ctx: Ctx): void {
  if (ship.ownerId === 0) return;
  const leader = ctx.bodies.find((candidate) => candidate.id === ship.ownerId);
  if (leader === undefined) return;
  ship.destination = coordinatesForEscortPosition(
    ctx.mode,
    leader,
    ship.escortSlot,
  );
}

/** The two in-tick rules this plan adds, for the replay loop of `flight.ts`. */
export const NAVIGATE_HOOKS: ReplayHooks = {
  refreshLeader,
  proximity: proximityRule,
};

/** The navigation behaviours of this file, with avoid collision and escort. */
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
  AVOID_COLLISION: { process: behaviourAvoidCollision },
  FORMATION_FORM_UP: {
    process: behaviourFormationFormUp,
    perform: performEscort,
  },
};

/** Every behaviour the reference models in this plan. */
export const ALL_BEHAVIOURS: BehaviourTable = {
  ...BASE_BEHAVIOURS,
  ...NAVIGATION_BEHAVIOURS,
};

/** Replay a fixture with every behaviour of plans 14-01 and 14-06 and the in-tick hooks. */
export function replayAll(
  fixture: OracleFixture,
  mode: Mode,
  wanted?: ReadonlySet<number>,
): ReplayResult {
  return replayWith(fixture, mode, ALL_BEHAVIOURS, wanted, NAVIGATE_HOOKS);
}

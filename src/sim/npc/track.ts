// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `trackDestination:retreat:` (AI-01, plan 14-10; `ShipEntity.m:9450-9591`): the
 * rule-of-thumb steering toward (or away from) `nav.destination`.
 *
 * Frame. Oolite computes `relPos`, `v_right`, `v_up` and `v_forward` in its
 * world frame. Wegolite's world is Oolite's with every z negated and a ship's
 * forward is local -Z, so the three dot products are the same numbers computed
 * here from the Wegolite vectors (a reflection preserves dot products). The one
 * literal vector of the method is the zero relative position guard,
 * `relPos.z = 1.0` (9496), a WORLD vector: it is (0, 0, -1) here.
 *
 * Integer truncation. The three `int factor = sqrt(...)` lines (9526, 9538,
 * 9550) convert a double to a C int, which truncates toward zero: `Math.trunc`.
 * (`trackPrimaryTarget` has the same three lines in plan 14-12.)
 *
 * Not ported: the docking branches (`we_are_docking`, `docking_match_rotation`,
 * 9455, 9466 and 9568-9575). No NPC docks in v2.2 (WORLD-09 is unscheduled), so
 * `we_are_docking` is false and the `precision` is 0.9025.
 *
 * `isPlayer` is false for every NPC, so `reverse` is 1 (or -1 for a retreat)
 * and `reversePlayer` is 1.
 */

import { clamp, dot, normalizeVec, rotate, sub, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { Entity } from "../world/entity.js";
import {
  MAX_COS,
  PITCHING_OVER_COS,
  TRACK_FACTOR_CAP,
  TRACK_MAX_COS_CEILING,
  TRACK_MIN_D,
  TRACK_PITCH_FALLBACK,
  TRACK_PRECISION,
  TRACK_STICK_STEP,
} from "./constants.js";
import type { SteerContext } from "./dispatch.js";
import { applySticks } from "./flight.js";

const LOCAL_RIGHT = vec(1, 0, 0);
const LOCAL_UP = vec(0, 1, 0);
const LOCAL_FORWARD = vec(0, 0, -1);

/**
 * The zero relative position guard: Oolite sets `relPos.z = 1.0` (9496), the
 * world vector (0, 0, 1), which is (0, 0, -1) in Wegolite's frame.
 */
const ZERO_GUARD: Vec3 = vec(0, 0, -1);

/**
 * `rangeToDestination` (`ShipEntity.m:9617-9620`, `HPdistance`): the
 * centre-to-centre distance from the ship to `nav.destination`.
 */
export function rangeToDestination(entity: Entity): number {
  const dx = entity.nav.destination.x - entity.position.x;
  const dy = entity.nav.destination.y - entity.position.y;
  const dz = entity.nav.destination.z - entity.position.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

/**
 * `noteFrustration:` (`ShipEntity.m:2641-2645`): the AI message `FRUSTRATED` is
 * plist-only and has no consumer, so only the script event is posted, as
 * `shipAIFrustrated` WITHOUT the context argument Oolite passes (the behaviour
 * name): a recorded divergence for plan 14-19.
 */
export function noteFrustration(ctx: SteerContext): void {
  ctx.emit({ name: "shipAIFrustrated" });
}

/** C's double-to-int cast of a non-negative double, capped at 8 (9526-9528). */
function stickFactor(ratio: number): number {
  const factor = Math.trunc(Math.sqrt(ratio / TRACK_MIN_D));
  return factor > TRACK_FACTOR_CAP ? TRACK_FACTOR_CAP : factor;
}

/** `fabs(a) / delta_t * (stick < 0 ? -1 : 1)` (9534 and its siblings). */
function noOvershoot(delta: number, stick: number, dt: number): number {
  return (Math.abs(delta) / dt) * (stick < 0 ? -1 : 1);
}

/**
 * Set the sticks toward the destination, apply them and return Oolite's
 * confidence factor: 0 to 1, the cosine of the angle to the destination, or its
 * square in retreat mode.
 */
export function trackDestination(
  entity: Entity,
  ctx: SteerContext,
  retreat: boolean,
): number {
  const steer = entity.steer;
  const dt = ctx.dt;
  const maxFlightRoll = ctx.stats.maxFlightRoll;
  const maxFlightPitch = ctx.stats.maxFlightPitch;
  const desiredRange = entity.nav.desiredRange;

  steer.stickRoll = 0; // desired roll and pitch
  steer.stickPitch = 0;

  let reverse = 1;
  const minD = TRACK_MIN_D;
  let maxCos = MAX_COS;
  const precision = TRACK_PRECISION;

  if (retreat) reverse = -reverse;

  let relPos = sub(entity.nav.destination, entity.position);
  const range2 =
    relPos.x * relPos.x + relPos.y * relPos.y + relPos.z * relPos.z;
  const desiredRange2 = desiredRange * desiredRange;

  if (range2 > desiredRange2) {
    maxCos = Math.sqrt(1 - (precision * desiredRange2) / range2); // head for a point within the range sphere
    if (maxCos >= TRACK_MAX_COS_CEILING) maxCos = TRACK_MAX_COS_CEILING;
  }

  if (!(relPos.x === 0 && relPos.y === 0 && relPos.z === 0)) {
    relPos = normalizeVec(relPos);
  } else {
    relPos = ZERO_GUARD;
  }

  const dRight = dot(relPos, rotate(entity.orientation, LOCAL_RIGHT));
  let dUp = dot(relPos, rotate(entity.orientation, LOCAL_UP));
  // Wegolite addition (T-14-16), not an Oolite line: the cosine is a dot
  // product of two unit vectors, so rounding may leave it a hair outside
  // [-1, 1]; clamp it before any compare so a compare never sees 1.0000002.
  let dForward = clamp(
    dot(relPos, rotate(entity.orientation, LOCAL_FORWARD)),
    -1,
    1,
  );

  // begin rule-of-thumb manoeuvres
  steer.stickPitch = 0;
  steer.stickRoll = 0;

  // pitching_over is set in behaviour_formation_form_up and avoidCollision.
  if (steer.pitchingOver) {
    if (reverse * dUp > 0) {
      steer.stickPitch = -maxFlightPitch; // pitch up
    } else {
      steer.stickPitch = maxFlightPitch;
    }
    steer.pitchingOver = reverse * dForward < PITCHING_OVER_COS;
  }

  // check if we are flying toward (or away from) the destination
  if (dForward < maxCos || retreat) {
    // not on course so we must adjust controls
    if (dForward <= -maxCos || (retreat && dForward >= maxCos)) {
      dUp = minD * 2; // hack to avoid just flying away from the destination
    }

    if (dUp > minD) {
      const factor = stickFactor(Math.abs(dRight));
      if (dRight > minD) {
        steer.stickRoll = -maxFlightRoll * TRACK_STICK_STEP * factor;
      }
      if (dRight < -minD) {
        steer.stickRoll = +maxFlightRoll * TRACK_STICK_STEP * factor;
      }
      if (Math.abs(dRight) < Math.abs(steer.stickRoll) * dt) {
        steer.stickRoll = noOvershoot(dRight, steer.stickRoll, dt); // don't overshoot heading
      }
    }

    if (dUp < -minD) {
      const factor = stickFactor(Math.abs(dRight));
      if (dRight > minD) {
        steer.stickRoll = +maxFlightRoll * TRACK_STICK_STEP * factor;
      }
      if (dRight < -minD) {
        steer.stickRoll = -maxFlightRoll * TRACK_STICK_STEP * factor;
      }
      if (Math.abs(dRight) < Math.abs(steer.stickRoll) * dt) {
        steer.stickRoll = noOvershoot(dRight, steer.stickRoll, dt); // don't overshoot heading
      }
    }

    if (steer.stickRoll === 0) {
      const factor = stickFactor(Math.abs(dUp));
      if (dUp > minD) {
        steer.stickPitch =
          -maxFlightPitch * reverse * TRACK_STICK_STEP * factor;
      }
      if (dUp < -minD) {
        steer.stickPitch =
          +maxFlightPitch * reverse * TRACK_STICK_STEP * factor;
      }
      if (Math.abs(dUp) < Math.abs(steer.stickPitch) * dt) {
        steer.stickPitch = noOvershoot(dUp, steer.stickPitch, dt); // don't overshoot heading
      }
    }

    if (steer.stickPitch === 0) {
      // not sufficiently on course yet, but min_d is too high: turn anyway
      // slightly to adjust
      steer.stickPitch = TRACK_PITCH_FALLBACK;
    }
  }

  // end rule-of-thumb manoeuvres

  applySticks(entity, dt);

  if (retreat) dForward *= dForward; // make positive AND decrease granularity

  if (dForward < 0) return 0;

  if (steer.flightRoll === 0 && steer.flightPitch === 0) return 1; // no correction

  return dForward;
}

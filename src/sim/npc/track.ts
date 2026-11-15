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
 * (`trackPrimaryTarget` has the same three lines at 9178, 9187 and 9197, below.)
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
  COMBAT_AI_FLEES_BETTER,
  COMBAT_AI_FLEES_BETTER_2,
  COMBAT_AI_ISNT_AWFUL,
  COMBAT_AI_TRACKS_CLOSER,
  MAX_COS,
  PITCHING_OVER_COS,
  PRIMARY_AVOID_DOT,
  PRIMARY_AVOID_RANGE_FACTOR,
  PRIMARY_JINK_BOOST,
  PRIMARY_JINK_RANGE,
  PRIMARY_MAX_FACTOR,
  PRIMARY_MIN_D,
  PRIMARY_MIN_D_PRECISE,
  PRIMARY_PITCH_DIVISOR,
  PRIMARY_PITCH_LIMIT_SHARE,
  PRIMARY_PITCH_OVER_END_COS,
  PRIMARY_PITCH_OVER_START_COS,
  PRIMARY_PRECISE_MULTIPLIER,
  PRIMARY_R_MAX_FACTOR,
  TRACK_FACTOR_CAP,
  TRACK_MAX_COS_CEILING,
  TRACK_MIN_D,
  TRACK_PITCH_FALLBACK,
  TRACK_PRECISION,
  TRACK_STICK_STEP,
} from "./constants.js";
import type { SteerContext } from "./dispatch.js";
import { applySticks } from "./flight.js";
import {
  canStillTrackPrimaryTarget,
  currentAimTolerance,
  noteLostTargetAndGoIdle,
  targetBody,
} from "./target.js";

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

/* ---------------------------------------------------------------------------
 * trackPrimaryTarget
 * ------------------------------------------------------------------------- */

/**
 * C's double-to-int cast of `sqrt(fabs(d) / fabs(min_d))`, capped at
 * `max_factor` (`ShipEntity.m:9178-9180`, `9187-9189`, `9197-9199`). The cast
 * truncates toward zero: `Math.trunc`, never `Math.round`.
 */
function primaryFactor(d: number, minD: number, maxFactor: number): number {
  const factor = Math.trunc(Math.sqrt(Math.abs(d) / Math.abs(minD)));
  return factor > maxFactor ? maxFactor : factor;
}

function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * `trackPrimaryTarget:retreat:` (AI-01, plan 14-12; `ShipEntity.m:9034-9244`):
 * set the sticks toward (or, in retreat, away from) the primary target's
 * predicted position, apply them and return Oolite's confidence factor.
 *
 * A target that is gone, invalid or beyond 1.25 scanner ranges takes
 * `noteLostTargetAndGoIdle` and returns 0 (9037-9048).
 *
 * Frame. The three dot products are the same numbers in Wegolite's frame (a
 * reflection preserves them). The two `kBasisZVector` fallbacks (9081, 9112)
 * are the world vector (0, 0, -1). The retreat jink is a body-frame offset of
 * the TARGET (`jink.x * v_right + jink.y * v_up + jink.z * v_forward`, 9103-9105).
 * `steer.jink` is stored in Wegolite's frame, Oolite's with z negated (the
 * oracle runner reads it back that way), so Oolite's `jink.z` is `-steer.jink.z`;
 * the target's right, up and forward are Wegolite's world vectors (forward is
 * the rotated local -Z), and the offset's world z component is added without
 * `dist_adjust_factor`, as 9105 does. The mirror leaves each of these
 * statements true.
 *
 * Scope cuts, each recorded for plan 14-19: `missedShots` is 0 (no NPC fire,
 * so the "improve precision when missing" rule of 9134-9141 never binds and is
 * not ported); a missile takes Oolite's `missileTrackPrimaryTarget` (9053-9055)
 * in Oolite and the ordinary steering here; the retreat branch's
 * `setEvasiveJink:400` (9096-9098) is inserted by plan 14-13 with
 * `setEvasiveJink`.
 */
export function trackPrimaryTarget(
  entity: Entity,
  ctx: SteerContext,
  retreat: boolean,
): number {
  const target = targetBody(entity, ctx.view);
  if (target === undefined) {
    // leave now! (9037-9041)
    noteLostTargetAndGoIdle(entity, ctx);
    return 0;
  }
  if (!canStillTrackPrimaryTarget(entity, ctx)) {
    noteLostTargetAndGoIdle(entity, ctx);
    return 0;
  }

  const steer = entity.steer;
  const dt = ctx.dt;
  const maxFlightRoll = ctx.stats.maxFlightRoll;
  const maxFlightPitch = ctx.stats.maxFlightPitch;
  const accuracy = steer.accuracy;

  const vRight = rotate(entity.orientation, LOCAL_RIGHT);
  const vUp = rotate(entity.orientation, LOCAL_UP);
  const vForward = rotate(entity.orientation, LOCAL_FORWARD);

  // Task 2 of plan 14-12 replaces this with `calculateTargetPosition`.
  let relPos = sub(target.position, entity.position);
  const toTarget = sub(target.position, entity.position);
  const range2 =
    toTarget.x * toTarget.x + toTarget.y * toTarget.y + toTarget.z * toTarget.z;

  // jink if retreating (9062-9106)
  if (retreat) {
    const vx = rotate(target.orientation, LOCAL_RIGHT);
    const vy = rotate(target.orientation, LOCAL_UP);
    const vz = rotate(target.orientation, LOCAL_FORWARD);

    let avoidCollision = false;
    if (range2 < entity.radius * target.radius * PRIMARY_AVOID_RANGE_FACTOR) {
      // Check direction within 10 * collision radius.
      let targetDirection = ZERO_GUARD; // kBasisZVector
      if (!(relPos.x === 0 && relPos.y === 0 && relPos.z === 0)) {
        targetDirection = normalizeVec(relPos);
      }
      // is flying toward target or only slightly outward
      avoidCollision = dot(targetDirection, vForward) > PRIMARY_AVOID_DOT;
    }

    let distAdjustFactor = 1;
    if (accuracy >= COMBAT_AI_FLEES_BETTER) {
      const range = magnitude(relPos);
      if (range > PRIMARY_JINK_RANGE) {
        distAdjustFactor = range / PRIMARY_JINK_RANGE;
        if (accuracy >= COMBAT_AI_FLEES_BETTER_2) {
          distAdjustFactor *= PRIMARY_JINK_BOOST;
        }
      }
      // 9096-9098: `if (jink.x == 0.0 && behaviour != RUNNING_DEFENSE)
      // [self setEvasiveJink:400.0]`. Plan 14-13 inserts it with setEvasiveJink;
      // no behaviour ported before flee calls this function with retreat.
    }

    if (!avoidCollision) {
      // it is safe to jink: Oolite's jink.z is -steer.jink.z (see above)
      const jx = steer.jink.x;
      const jy = steer.jink.y;
      const jz = -steer.jink.z;
      relPos = vec(
        relPos.x + (jx * vx.x + jy * vy.x + jz * vz.x) * distAdjustFactor,
        relPos.y + (jx * vx.y + jy * vy.y + jz * vz.y) * distAdjustFactor,
        relPos.z + (jx * vx.z + jy * vy.z + jz * vz.z),
      );
    }
  }

  if (!(relPos.x === 0 && relPos.y === 0 && relPos.z === 0)) {
    relPos = normalizeVec(relPos);
  } else {
    relPos = ZERO_GUARD; // relPos.z = 1.0 (9112)
  }

  const maxCos = currentAimTolerance(entity);

  steer.stickRoll = 0; // desired roll and pitch
  steer.stickPitch = 0;

  const reverse = retreat ? -1 : 1;

  let minD = PRIMARY_MIN_D; // ~= 40m at 10km
  let maxFactor = PRIMARY_MAX_FACTOR;
  let rMaxFactor = PRIMARY_R_MAX_FACTOR;
  if (!retreat) {
    if (accuracy >= COMBAT_AI_TRACKS_CLOSER) {
      // much greater precision in combat
      if (maxFlightPitch > 1) {
        maxFactor = Math.floor(maxFlightPitch / PRIMARY_PITCH_DIVISOR);
        rMaxFactor = 1 / maxFactor;
      }
      minD = PRIMARY_MIN_D_PRECISE; // 10 times more precision ~= 4m at 10km
      maxFactor *= PRIMARY_PRECISE_MULTIPLIER;
      rMaxFactor /= PRIMARY_PRECISE_MULTIPLIER;
    }
    // accuracy >= COMBAT_AI_ISNT_AWFUL: "min_d -= 0.0001 * missedShots" and its
    // floor of 0.001 (9134-9141) never bind with missedShots fixed at 0.
  }

  const dRight = dot(relPos, vRight);
  let dUp = dot(relPos, vUp);
  // Wegolite addition (T-14-16), not an Oolite line: see trackDestination.
  let dForward = clamp(dot(relPos, vForward), -1, 1); // == cos of angle between v_forward and vector to target

  if (dForward * reverse > maxCos) {
    return dForward; // on_target!
  }

  // begin rule-of-thumb manoeuvres
  steer.stickPitch = 0;
  steer.stickRoll = 0;

  if (
    reverse * dForward < PRIMARY_PITCH_OVER_START_COS &&
    !steer.pitchingOver
  ) {
    steer.pitchingOver = true; // we're going the wrong way!
  }

  if (steer.pitchingOver) {
    if (reverse * dUp > 0) {
      steer.stickPitch = -maxFlightPitch; // pitch up
    } else {
      steer.stickPitch = maxFlightPitch;
    }
    steer.pitchingOver = reverse * dForward < PRIMARY_PITCH_OVER_END_COS;
  }

  // check if we are flying toward the destination..
  if (dForward < maxCos || retreat) {
    // not on course so we must adjust controls..
    if (dForward < -maxCos) {
      dUp = minD * 2; // hack to avoid just flying away from the destination
    }

    if (dUp > minD) {
      const factor = primaryFactor(dRight, minD, maxFactor);
      if (dRight > minD) {
        steer.stickRoll = -maxFlightRoll * rMaxFactor * factor; // note#
      }
      if (dRight < -minD) {
        steer.stickRoll = +maxFlightRoll * rMaxFactor * factor; // note#
      }
    }
    if (dUp < -minD) {
      const factor = primaryFactor(dRight, minD, maxFactor);
      if (dRight > minD) {
        steer.stickRoll = +maxFlightRoll * rMaxFactor * factor; // note#
      }
      if (dRight < -minD) {
        steer.stickRoll = -maxFlightRoll * rMaxFactor * factor; // note#
      }
    }

    if (steer.stickRoll === 0) {
      const factor = primaryFactor(dUp, minD, maxFactor);
      if (dUp > minD) {
        steer.stickPitch = -maxFlightPitch * reverse * rMaxFactor * factor;
      }
      if (dUp < -minD) {
        steer.stickPitch = +maxFlightPitch * reverse * rMaxFactor * factor;
      }
    }

    if (accuracy >= COMBAT_AI_ISNT_AWFUL) {
      // don't overshoot target (helps accuracy at low frame rates)
      if (Math.abs(dRight) < Math.abs(steer.stickRoll) * dt) {
        steer.stickRoll = noOvershoot(dRight, steer.stickRoll, dt);
      }
      if (Math.abs(dUp) < Math.abs(steer.stickPitch) * dt) {
        steer.stickPitch =
          (Math.abs(dUp) / dt) *
          (steer.stickPitch < 0
            ? -PRIMARY_PITCH_LIMIT_SHARE
            : PRIMARY_PITCH_LIMIT_SHARE);
      }
    }
  }
  // end rule-of-thumb manoeuvres

  applySticks(entity, dt);

  if (retreat) dForward *= dForward; // make positive AND decrease granularity

  if (dForward < 0) return 0;

  if (steer.flightRoll === 0 && steer.flightPitch === 0) return 1; // no correction

  return dForward;
}

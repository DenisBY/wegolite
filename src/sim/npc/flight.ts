// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The NPC flight model (AI-01, plan 14-09): `applySticks`, the attitude step and
 * `applyThrust`, transliterated from `ShipEntity.m`.
 *
 * The flight model is Oolite's own, not the player's ramped keyboard model
 * (`../flight/attitude.ts`): a behaviour sets the sticks, `applySticks` slews
 * the rates toward them, the attitude step turns the ship by the rates and
 * `applyThrust` ramps the speed toward the desired speed and moves the ship
 * along its nose. Yaw is not modelled (every in-scope behaviour holds the yaw
 * stick at 0 and yaw starts at 0).
 *
 * Frame: Wegolite's local forward is -Z, right +X, up +Y; Oolite's world maps
 * to Wegolite's by negating z. A body-frame rotation about local X by `a` in
 * Oolite is a rotation about local X by `-a` here (a reflection reverses the
 * sense of an axis in the mirrored plane), and a rotation about Z is unchanged:
 * `ShipEntity.m:5881-5897` composes `Rz(-roll) * Rx(-climb)` on the left of the
 * inverse-convention quaternion Oolite stores, which is the body-frame turn
 * `Rx(climb) * Rz(roll)` on the right of the standard quaternion, and in this
 * frame `Rx(-climb) * Rz(roll)`.
 *
 * The oracle fixtures pin the result (the attitude fixtures of
 * `flight-model.json`), and `tests/sim/npc/flight.oracle.test.ts` pins one
 * physical turn direction besides (PITFALLS 1).
 *
 * Every function writes only the steered entity. Steering has no try/catch
 * (FOUND-15 containment is for AI modules only), so each function is total for
 * a domain-valid entity (`../world/limits.ts`).
 */

import { add, axisAngle, mul, normalize, rotate, scale, vec } from "../math.js";
import type { Entity } from "../world/entity.js";
import {
  COMBAT_AI_TRACKS_CLOSER,
  MIN_HYPERSPEED_FACTOR,
  SHIP_THRUST_FACTOR,
  STICK_PITCH_RATE,
  STICK_REVERSAL_FACTOR,
  STICK_ROLL_RATE,
  STICK_ZERO_FACTOR,
} from "./constants.js";
import type { NpcFlightStats } from "./stats.js";

/** Wegolite's local forward (`../combat/aim.ts` `LOCAL_FORWARD`). */
const LOCAL_FORWARD = vec(0, 0, -1);

/**
 * Slew the roll and pitch rates toward the sticks (`ShipEntity.m:7018-7065`).
 * The yaw part of that method is omitted: yaw stays 0.
 */
export function applySticks(entity: Entity, dt: number): void {
  const steer = entity.steer;
  let rate1 = STICK_ROLL_RATE * dt; // roll
  let rate2 = STICK_PITCH_RATE * dt; // pitch

  if (
    (steer.stickRoll > 0 && steer.flightRoll < 0) ||
    (steer.stickRoll < 0 && steer.flightRoll > 0)
  ) {
    rate1 *= STICK_REVERSAL_FACTOR; // much faster correction
  }
  if (
    (steer.stickPitch > 0 && steer.flightPitch < 0) ||
    (steer.stickPitch < 0 && steer.flightPitch > 0)
  ) {
    rate2 *= STICK_REVERSAL_FACTOR; // much faster correction
  }

  if (steer.accuracy >= COMBAT_AI_TRACKS_CLOSER) {
    if (steer.stickRoll === 0) rate1 *= STICK_ZERO_FACTOR; // faster correction
    if (steer.stickPitch === 0) rate2 *= STICK_ZERO_FACTOR; // faster correction
  }

  // apply stick movement limits
  if (steer.flightRoll < steer.stickRoll - rate1) {
    steer.flightRoll = steer.flightRoll + rate1;
  } else if (steer.flightRoll > steer.stickRoll + rate1) {
    steer.flightRoll = steer.flightRoll - rate1;
  } else {
    steer.flightRoll = steer.stickRoll;
  }

  if (steer.flightPitch < steer.stickPitch - rate2) {
    steer.flightPitch = steer.flightPitch + rate2;
  } else if (steer.flightPitch > steer.stickPitch + rate2) {
    steer.flightPitch = steer.flightPitch - rate2;
  } else {
    steer.flightPitch = steer.stickPitch;
  }
}

/**
 * Turn the ship by its roll and pitch rates (`applyAttitudeChanges:`,
 * `ShipEntity.m:5899-5902`, through `applyRoll:climb:andYaw:`, 5881-5897, with
 * yaw 0). Does nothing for two zero rates (5883-5884).
 */
export function applyAttitude(entity: Entity, dt: number): void {
  const roll = entity.steer.flightRoll * dt;
  const climb = entity.steer.flightPitch * dt;
  if (roll === 0 && climb === 0) return;

  let orientation = entity.orientation;
  if (climb !== 0) orientation = mul(orientation, axisAngle(1, 0, 0, -climb));
  if (roll !== 0) orientation = mul(orientation, axisAngle(0, 0, 1, roll));
  entity.orientation = normalize(orientation);
}

/**
 * `increase_flight_speed:` (`ShipEntity.m:7405-7415`). The afterburner factor is
 * a scope cut, so the factor is 1.
 */
export function increaseFlightSpeed(
  entity: Entity,
  stats: NpcFlightStats,
  delta: number,
): void {
  if (entity.speed < stats.maxFlightSpeed) {
    entity.speed += delta;
  } else {
    entity.speed = stats.maxFlightSpeed;
  }
}

/**
 * `decrease_flight_speed:` (`ShipEntity.m:7417-7429`): the step is multiplied by
 * `MIN_HYPERSPEED_FACTOR` while the ship is faster than its `maxFlightSpeed`,
 * and the speed never goes below 0.
 */
export function decreaseFlightSpeed(
  entity: Entity,
  stats: NpcFlightStats,
  delta: number,
): void {
  const factor =
    entity.speed > stats.maxFlightSpeed ? MIN_HYPERSPEED_FACTOR : 1;
  if (entity.speed > factor * delta) {
    entity.speed -= factor * delta;
  } else {
    entity.speed = 0;
  }
}

/**
 * `applyThrust:` (`ShipEntity.m:5808-5854`), in Oolite's order. The Newtonian
 * velocity brake of 5817-5824 is a no-op because Newtonian velocity is not
 * modelled, and the afterburner is a scope cut, so the available speed is
 * `maxFlightSpeed`.
 */
export function applyThrust(
  entity: Entity,
  stats: NpcFlightStats,
  dt: number,
): void {
  const thrust = SHIP_THRUST_FACTOR * stats.thrust * dt;

  // A tumbling ship neither ramps nor moves (5826-5827).
  if (entity.nav.behaviour === "TUMBLE") return;

  // check for speed (5829-5831): the clamp is written back
  if (entity.nav.desiredSpeed > stats.maxFlightSpeed) {
    entity.nav.desiredSpeed = stats.maxFlightSpeed;
  }
  const desired = entity.nav.desiredSpeed;

  if (entity.speed > desired) {
    decreaseFlightSpeed(entity, stats, thrust);
    if (entity.speed < desired) entity.speed = desired;
  }
  if (entity.speed < desired) {
    increaseFlightSpeed(entity, stats, thrust);
    if (entity.speed > desired) entity.speed = desired;
  }

  // moveForward: (5843, `Entity.m:796-800`)
  const forward = rotate(entity.orientation, LOCAL_FORWARD);
  entity.position = add(entity.position, scale(forward, dt * entity.speed));
}

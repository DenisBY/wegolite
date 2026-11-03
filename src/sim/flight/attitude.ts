// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Ramped, damped, yaw-free attitude (FLGT-02).
 *
 * Oolite's keyboard path ramps a rate toward the held target at
 * `2 * max_rate` per second, clamps at the max rate, damps toward zero at
 * 1 rad/s^2 when nothing is held, and zeroes the rate before reversing. There is
 * no yaw: only pitch about local +X and roll about local +Z exist.
 *
 * The roll sign is pinned by test: a positive roll must put the local +X
 * (starboard) vector's Y component below zero. That is why the roll quaternion
 * is built with `-rollRate`; do not "fix" the minus sign.
 */

import { axisAngle, mul, normalize } from "../math.js";
import type { FlightConfig } from "./config.js";
import type { ControlIntent } from "./controller.js";
import type { FlightState } from "./state.js";

/**
 * Move a rate toward `target`: damp toward zero when idle, otherwise zero on a
 * reversal and ramp at `accel` without overshooting.
 */
export function slew(
  rate: number,
  target: number,
  accel: number,
  damping: number,
  dt: number,
): number {
  if (target === 0) {
    const step = damping * dt;
    if (Math.abs(rate) <= step) return 0;
    return rate - Math.sign(rate) * step;
  }
  let current = rate;
  // The keyboard path zeroes a reversed rate instead of braking through it.
  if (current * target < 0) current = 0;
  const step = accel * dt;
  return current < target
    ? Math.min(current + step, target)
    : Math.max(current - step, target);
}

/** Advance the attitude rates and compose roll-then-pitch into the orientation. */
export function stepAttitude(
  state: FlightState,
  intent: ControlIntent,
  config: FlightConfig,
  dt: number,
): void {
  const scale = intent.precision ? config.precisionFactor : 1;
  const pitchTarget = intent.pitch * config.maxPitch * scale;
  const rollTarget = intent.roll * config.maxRoll * scale;

  state.pitchRate = slew(
    state.pitchRate,
    pitchTarget,
    config.pitchAccel,
    config.damping,
    dt,
  );
  state.rollRate = slew(
    state.rollRate,
    rollTarget,
    config.rollAccel,
    config.damping,
    dt,
  );

  const roll = axisAngle(0, 0, 1, -state.rollRate * dt);
  const pitch = axisAngle(1, 0, 0, state.pitchRate * dt);
  state.orientation = normalize(mul(mul(state.orientation, roll), pitch));
}

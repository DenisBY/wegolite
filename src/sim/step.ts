// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import { axisAngle, mul, normalize, rotate, vec } from "./math.js";
import type { InputFrame, SimState } from "./state.js";

/** The fixed timestep (FOUND-07). 1/120 s, locked by D-10. */
export const DT = 1 / 120;

/** Catch-up cap: at most 41.7 ms of simulation per frame. */
export const MAX_STEPS_PER_FRAME = 5;

/** Longest frame delta honoured; protects against sleep and tab throttling. */
export const MAX_FRAME_DELTA = 0.25;

/**
 * Probe scales, NOT Oolite's flight constants (D-09). They are chosen only so
 * the kinematic probe moves; Phase 3 replaces every one of them with a tuned
 * flight value. Nothing here may be copied into the flight model.
 */
export const PROBE_PITCH_RATE = 1;
export const PROBE_ROLL_RATE = 1;
export const PROBE_MAX_SPEED = 100;
export const PROBE_THRUST_ACCEL = 10;

/** Local forward (-Z) in ship space. */
const FORWARD = vec(0, 0, -1);

/**
 * Advance the probe by one fixed step. Pure with respect to everything except
 * the state it is handed: `dt` is a parameter, no clock is read, no randomness
 * is used, and nothing outside `state` is mutated. Callers pass `DT`, which is
 * what makes replay identical at every frame cadence (T-01-08).
 */
export function step(state: SimState, input: InputFrame, dt: number): void {
  const roll = axisAngle(0, 0, 1, input.roll * PROBE_ROLL_RATE * dt);
  const pitch = axisAngle(1, 0, 0, input.pitch * PROBE_PITCH_RATE * dt);
  state.orientation = normalize(mul(mul(state.orientation, roll), pitch));

  const forward = rotate(state.orientation, FORWARD);
  const currentSpeed = Math.sqrt(
    state.velocity.x * state.velocity.x +
      state.velocity.y * state.velocity.y +
      state.velocity.z * state.velocity.z,
  );
  const speed = Math.min(
    Math.max(currentSpeed + input.thrust * PROBE_THRUST_ACCEL * dt, 0),
    PROBE_MAX_SPEED,
  );
  state.velocity = vec(forward.x * speed, forward.y * speed, forward.z * speed);

  state.position = vec(
    state.position.x + state.velocity.x * dt,
    state.position.y + state.velocity.y * dt,
    state.position.z + state.velocity.z * dt,
  );
  state.tick += 1;
}

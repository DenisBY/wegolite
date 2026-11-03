// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Aristotelian speed (FLGT-03, FLGT-04, T-3-07).
 *
 * There is one scalar forward speed and no persistent lateral velocity: the
 * position advances along the ship's *current* forward vector every step, so a
 * turn changes the direction of travel immediately. `thrustAccel` is 160 u/s^2
 * for the Cobra and the normal-flight cap is 350 u/s.
 *
 * While the torus drive is engaged the target is `maxSpeed * factor` and the
 * acceleration is `thrustAccel * factor * dt`. After a disengage the speed is
 * moved back toward `maxSpeed` at `thrustAccel * lastFactor` — multiplied by 3
 * when the disengage was a mass lock (Oolite's multiplier). It is never snapped.
 */

import { add, clamp, moveToward, rotate, scale, vec } from "../math.js";
import type { FlightConfig } from "./config.js";
import type { ControlIntent } from "./controller.js";
import type { FlightState } from "./state.js";

/** Local forward (-Z) in ship space. */
const FORWARD = vec(0, 0, -1);

/** Oolite's mass-lock deceleration multiplier (`PlayerEntity.m`). */
const MASS_LOCK_DECELERATION_FACTOR = 3;

/** Accelerate/decelerate the scalar speed and integrate along forward. */
export function stepSpeed(
  state: FlightState,
  intent: ControlIntent,
  config: FlightConfig,
  dt: number,
): void {
  if (state.torus.engaged) {
    const target = config.maxSpeed * state.torus.factor;
    state.speed = moveToward(
      state.speed,
      target,
      config.thrustAccel * state.torus.factor * dt,
    );
  } else if (state.speed > config.maxSpeed) {
    // Preserve the "slowing from hyperspeed" feel: a finite ramp back to the
    // normal cap, never a snap. A mass-lock disengage decelerates three times
    // faster, matching Oolite's input-vs-mass-lock difference.
    const multiplier = state.torus.massLocked
      ? MASS_LOCK_DECELERATION_FACTOR
      : 1;
    state.speed = moveToward(
      state.speed,
      config.maxSpeed,
      config.thrustAccel * state.torus.lastFactor * multiplier * dt,
    );
  } else {
    state.speed = clamp(
      state.speed + intent.speed * config.thrustAccel * dt,
      0,
      config.maxSpeed,
    );
  }

  // A corrupted or injected value is clamped/rejected, never allowed to poison
  // the position (or the hash) with `Infinity`/`NaN` (T-3-07).
  if (!Number.isFinite(state.speed) || state.speed < 0) {
    state.speed = 0;
  }

  const forward = rotate(state.orientation, FORWARD);
  state.position = add(state.position, scale(forward, state.speed * dt));
}

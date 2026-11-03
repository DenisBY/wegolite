// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Aristotelian speed (FLGT-03).
 *
 * There is one scalar forward speed and no persistent lateral velocity: the
 * position advances along the ship's *current* forward vector every step, so a
 * turn changes the direction of travel immediately. `thrustAccel` is 160 u/s^2
 * for the Cobra and the normal-flight cap is 350 u/s.
 *
 * Torus speed is plan 04's; this module owns only the normal-flight model.
 */

import { add, clamp, rotate, scale, vec } from "../math.js";
import type { FlightConfig } from "./config.js";
import type { ControlIntent } from "./controller.js";
import type { FlightState } from "./state.js";

/** Local forward (-Z) in ship space. */
const FORWARD = vec(0, 0, -1);

/** Accelerate/decelerate the scalar speed and integrate along forward. */
export function stepSpeed(
  state: FlightState,
  intent: ControlIntent,
  config: FlightConfig,
  dt: number,
): void {
  state.speed = clamp(
    state.speed + intent.speed * config.thrustAccel * dt,
    0,
    config.maxSpeed,
  );

  const forward = rotate(state.orientation, FORWARD);
  state.position = add(state.position, scale(forward, state.speed * dt));
}

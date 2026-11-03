// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted launch (FLGT-01, D-10).
 *
 * `beginLaunch` is the only way out of `docked`: it applies the +600 s clock
 * advance exactly once, parks the ship at the dock mouth (station centre plus
 * `dockOffset` along `stationToPlanet`), aims local -Z at the planet and gives
 * it half its top speed. The two-second exit holds that speed, rolls the hull
 * with the station so the slot looks steady, and hands control to `inFlight`.
 *
 * A second launch while launching or in flight is ignored, not thrown: the
 * command is user-reachable and an exception would kill the frame.
 */

import { add, axisAngle, mul, normalize, rotate, scale, vec } from "../math.js";
import type { FlightConfig } from "./config.js";
import { dockMouthPosition, type FlightState } from "./state.js";
import type { SystemLayout } from "../world/layout.js";

/** D-10: "about two seconds". */
export const LAUNCH_DURATION = 2;

/**
 * A float64 accumulator summing 1/120 cannot land exactly on 2.0 (240 steps
 * reach 1.9999999999999953), so the handover compares with a small tolerance.
 */
const LAUNCH_EPSILON = 1e-9;

const FORWARD = vec(0, 0, -1);

/**
 * Enter `launching` from `docked`.
 *
 * @returns `true` when the launch started, `false` when it was ignored.
 */
export function beginLaunch(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
): boolean {
  if (state.mode !== "docked") return false;

  state.mode = "launching";
  state.launchElapsed = 0;
  state.launchCount += 1;
  state.clockSeconds += 600;
  state.position = dockMouthPosition(layout);
  state.orientation = layout.stationBaseQuat;
  state.speed = config.launchSpeed;
  state.pitchRate = 0;
  // The world-sense station rate: the slot stays steady during the exit.
  state.rollRate = layout.stationRollRadPerSec;
  state.stationAngle = 0;
  return true;
}

/** Finish the exit and hand control to the player. */
export function completeLaunch(state: FlightState): void {
  state.mode = "inFlight";
  state.launchElapsed = LAUNCH_DURATION;
  state.rollRate = 0;
  state.pitchRate = 0;
}

/**
 * Advance one launching step.
 *
 * @returns `true` when this step completed the exit.
 */
export function stepLaunch(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  dt: number,
): boolean {
  // Hold the dock speed; the scripted exit never accelerates.
  state.speed = config.launchSpeed;

  const forward = rotate(state.orientation, FORWARD);
  state.position = add(state.position, scale(forward, state.speed * dt));
  state.orientation = normalize(
    mul(
      state.orientation,
      axisAngle(0, 0, 1, layout.stationRollRadPerSec * dt),
    ),
  );

  state.launchElapsed += dt;
  if (state.launchElapsed >= LAUNCH_DURATION - LAUNCH_EPSILON) {
    completeLaunch(state);
    return true;
  }
  return false;
}

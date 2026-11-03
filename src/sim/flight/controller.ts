// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The controller seam (FLGT-07, FLGT-08).
 *
 * A controller turns the one sim-owned `InputFrame` into a `ControlIntent`.
 * `stepFlight` consumes intents only, so a future AI, docking or touch
 * controller implements the same interface without touching the flight model.
 * `InputFrame` is imported from `../state.js` — never from `src/input/**`,
 * which the ESLint sim zone denies.
 */

import { clamp } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { InputFrame } from "../state.js";
import type { FlightMode, FlightState } from "./state.js";

export interface ControlIntent {
  /** -1..1, + noses up. */
  readonly pitch: number;
  /** -1..1, + rolls right (starboard wing down). */
  readonly roll: number;
  /** -1..1, + accelerates. */
  readonly speed: number;
  /** The precision modifier scales pitch/roll by `precisionFactor`. */
  readonly precision: boolean;
  /** An edge, consumed once. Plan 04 owns the torus; this is always false here. */
  readonly torusToggle: boolean;
}

/** The read-only slice of the state a controller may see. */
export interface FlightView {
  readonly mode: FlightMode;
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly speed: number;
  readonly clockSeconds: number;
  readonly flightTime: number;
}

/** Build the controller-facing view from the authoritative state. */
export function flightView(state: FlightState): FlightView {
  return {
    mode: state.mode,
    position: state.position,
    orientation: state.orientation,
    speed: state.speed,
    clockSeconds: state.clockSeconds,
    flightTime: state.flightTime,
  };
}

export interface ShipController {
  update(
    view: Readonly<FlightView>,
    frame: Readonly<InputFrame>,
  ): ControlIntent;
}

export const ZERO_INTENT: ControlIntent = {
  pitch: 0,
  roll: 0,
  speed: 0,
  precision: false,
  torusToggle: false,
};

function axis(value: number): number {
  return clamp(value, -1, 1);
}

/** Maps the keyboard frame to a flight intent; only active in flight. */
export class PlayerController implements ShipController {
  update(
    view: Readonly<FlightView>,
    frame: Readonly<InputFrame>,
  ): ControlIntent {
    if (view.mode !== "inFlight") return ZERO_INTENT;
    return {
      pitch: axis(frame.pitch),
      roll: axis(frame.roll),
      speed: axis(frame.speed),
      precision: frame.precision,
      // Plan 04 wires the torus edge; the frame carries axes only.
      torusToggle: false,
    };
  }
}

/** The scripted exit: the player has no control during `launching` (D-10). */
export class ScriptedLaunchController implements ShipController {
  update(): ControlIntent {
    return ZERO_INTENT;
  }
}

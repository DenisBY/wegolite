// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flight step (FLGT-01..FLGT-03, Pattern B).
 *
 * Pure with respect to everything except the state it is handed: `dt` is a
 * parameter, no clock is read, no randomness is used, and nothing outside
 * `state` is mutated. Commands are drained once at the start of the step; the
 * caller passes them on the first step of a frame only, so a click cannot be
 * applied twice because a frame ran two steps.
 *
 * Order (research § Step 2): commands -> mode transition -> attitude ->
 * speed/position -> station angle/flight time/clock -> events.
 */

import type { Command } from "../commands.js";
import type { SimEvent } from "../events.js";
import type { SystemLayout } from "../world/layout.js";
import { stepAttitude } from "./attitude.js";
import type { FlightConfig } from "./config.js";
import type { ControlIntent } from "./controller.js";
import { beginLaunch, completeLaunch, stepLaunch } from "./launch.js";
import { stepSpeed } from "./speed.js";
import type { FlightState } from "./state.js";

/**
 * Advance the flight simulation by one fixed step.
 *
 * @throws {Error} when `dt` is not a positive finite number — a zero or NaN
 * step would silently freeze or poison the state.
 */
export function stepFlight(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  intent: ControlIntent,
  commands: readonly Command[],
  dt: number,
): SimEvent[] {
  if (!Number.isFinite(dt) || dt <= 0) {
    throw new Error(
      `Wegolite: stepFlight requires a positive finite dt, received ${String(dt)}.`,
    );
  }

  const events: SimEvent[] = [];
  const modeAtStart = state.mode;
  let skipLaunch = false;
  let launchedThisStep = false;

  // 1. Drain this frame's commands exactly once.
  for (const command of commands) {
    switch (command.kind) {
      case "launch":
        if (beginLaunch(state, layout, config)) {
          events.push({ kind: "launched" });
          launchedThisStep = true;
        }
        break;
      case "skipLaunch":
        skipLaunch = true;
        break;
      case "toggleTorus":
      case "setPaused":
      case "cycleCompass":
      case "targetStation":
        // The torus is plan 04's; pause is app-owned; compass/targeting arrive
        // with the full HUD in plan 05.
        break;
    }
  }

  // 2. Apply the mode transition.
  if (state.mode === "launching" && skipLaunch) {
    completeLaunch(state);
    events.push({ kind: "launchComplete" });
  }

  // 3. Attitude and 4. speed/position, per mode. The step that *entered*
  // launching leaves the ship exactly at the dock mouth: the +600 s clock and
  // the dock pose are the whole observable effect of that step.
  if (launchedThisStep) {
    // no motion
  } else if (state.mode === "launching") {
    if (stepLaunch(state, layout, config, dt)) {
      events.push({ kind: "launchComplete" });
    }
  } else if (state.mode === "inFlight") {
    stepAttitude(state, intent, config, dt);
    stepSpeed(state, intent, config, dt);
  }

  // 5. Station roll, flight time and the ship clock. A docked ship is static,
  // and the launch step itself does not advance the clock: the +600 s is the
  // whole of the launch's clock change, so a test can pin it exactly.
  if (modeAtStart !== "docked") {
    state.stationAngle += layout.stationRollRadPerSec * dt;
    state.flightTime += dt;
    state.clockSeconds += dt;
  }

  state.tick += 1;

  // 6. Events were collected in order above.
  return events;
}

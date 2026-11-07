// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docking computer (DOCK-05, D-11, D-12).
 *
 * Shift+C is Oolite's fast autopilot (`n_key_autodock`, `PlayerEntityControls.m`):
 * it needs the equipment, it only engages inside the station aegis, and it
 * transitioned instantly in this phase by decision (D-12) — no fly-in, no
 * animation, no timer. The transition therefore happens on the same tick as the
 * command and adds exactly 1,200 s to the ship clock.
 *
 * The aegis predicate is `aegisStatus` (inside 51,200 m, inclusive at the
 * boundary), never a local copy of the radius: the same number the HUD and the
 * compass read, so the three cannot drift.
 *
 * Ownership is an argument, not a command payload (T-04-19). The app derives
 * it from the player profile and passes a read-only set through
 * `StepOptions.equipment`; a stray command is a no-op the sim can explain.
 */

import { vec } from "../math.js";
import type { SimEvent } from "../events.js";
import { clearHyperspaceAttempt, dockMouthPosition } from "../flight/state.js";
import type { FlightState } from "../flight/state.js";
import { aegisStatus } from "../world/aegis.js";
import type { SystemLayout } from "../world/layout.js";

/** The catalogue key that grants the computer (equipment.json). */
export const DOCK_COMPUTER_KEY = "EQ_DOCK_COMP";

/** D-12: exactly twenty minutes. */
export const DOCK_COMPUTER_CLOCK_DELTA = 1200;

/**
 * Dock instantly when the computer is fitted and the station is in range.
 *
 * @returns exactly one event: `docked` on success, otherwise `dockDenied`
 * naming the reason. A command outside `inFlight` is ignored silently, so a
 * same-tick dock cannot also launch.
 */
export function dockWithComputer(
  state: FlightState,
  layout: SystemLayout,
  hasComputer: boolean,
): SimEvent[] {
  if (state.mode !== "inFlight") return [];
  if (!hasComputer) {
    return [{ kind: "dockDenied", reason: "notInstalled" }];
  }
  if (aegisStatus(state.position, layout) !== "dockingRange") {
    return [{ kind: "dockDenied", reason: "outsideAegis" }];
  }

  state.mode = "docked";
  state.speed = 0;
  state.pitchRate = 0;
  state.rollRate = 0;
  state.impulse = vec(0, 0, 0);
  state.position = dockMouthPosition(layout);
  state.orientation = layout.stationBaseQuat;
  // A docked ship never carries an engaged drive or residual mass-lock state.
  state.torus = {
    engaged: false,
    factor: 1,
    massLocked: false,
    lastFactor: 1,
  };
  state.dockArmed = false;
  state.clockSeconds += DOCK_COMPUTER_CLOCK_DELTA;
  state.dockCount += 1;
  // A computer dock ends the jump attempt too (gap G-2). Refused docks return
  // above this point and leave the attempt untouched.
  clearHyperspaceAttempt(state);

  return [
    {
      kind: "docked",
      via: "computer",
      clockDelta: DOCK_COMPUTER_CLOCK_DELTA,
    },
  ];
}

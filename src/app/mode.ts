// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The app-side mode machine (D-10, RESEARCH § Step 3).
 *
 * `docked -> launching -> inFlight`; `paused` is orthogonal and never a mode.
 * Illegal transitions are ignored rather than thrown: a second launch command
 * while launching is user-reachable and must be a no-op, not a crash.
 *
 * The simulation owns the authoritative mode (`FlightState.mode`); this module
 * names the same table for the presentation layer so the panels and HUD are
 * driven by one predicate instead of scattered string comparisons.
 */

import type { FlightMode } from "../sim/flight/state.js";

export type ModeTransition = "launch" | "launchComplete" | "dock";
export type AppScreen = "docked" | "flight";

/** Apply one transition; an illegal one returns the mode unchanged. */
export function advanceMode(
  mode: FlightMode,
  transition: ModeTransition,
): FlightMode {
  switch (transition) {
    case "launch":
      return mode === "docked" ? "launching" : mode;
    case "launchComplete":
      return mode === "launching" ? "inFlight" : mode;
    case "dock":
      return mode === "inFlight" ? "docked" : mode;
  }
}

/** Which panel the app shows for a simulation mode. */
export function screenForMode(mode: FlightMode): AppScreen {
  return mode === "docked" ? "docked" : "flight";
}

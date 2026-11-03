// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD view model (Pattern 5).
 *
 * A pure read-only projection of the simulation into what the canvas draws. It
 * lives in `src/app` because it is app-owned presentation, not simulation, and
 * it is Node-testable: no canvas, no DOM, no state mutation. Plan 05 adds the
 * scanner contacts, compass and bars to this same model.
 */

import type { HudModel } from "../render/hud/draw.js";
import type { FlightState } from "../sim/flight/state.js";
import type { SystemLayout } from "../sim/world/layout.js";

export function buildHudModel(
  state: FlightState,
  layout: SystemLayout,
  message: string,
): HudModel {
  return {
    speed: state.speed,
    clockSeconds: state.clockSeconds,
    message,
    condition: "green",
    massLocked: state.torus.massLocked,
    scannerRange: layout.scannerRange,
  };
}

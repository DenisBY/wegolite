// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The HUD view model (Pattern 5, FLGT-05).
 *
 * A pure read-only projection of the simulation into what the canvas draws. It
 * lives in `src/app` because it is app-owned presentation, not simulation, and
 * it is Node-testable: no canvas, no DOM, no state mutation.
 *
 * The scanner plots only the Coriolis, the nav buoy and the witchpoint (D-07);
 * the planet and sun are deliberately absent because a 41 km planet would fill
 * the 25.6 km display. The aegis/compass rules come from `src/sim/world/aegis`,
 * which is the single owner of the 51,200 m and 3r boundaries.
 */

import { aegisStatus, resolveCompassTarget } from "../sim/world/aegis.js";
import type { AegisStatus } from "../sim/world/aegis.js";
import type { CompassTarget } from "../sim/flight/state.js";
import type { FlightConfig } from "../sim/flight/config.js";
import type { FlightState } from "../sim/flight/state.js";
import { clamp, sub } from "../sim/math.js";
import type { Vec3 } from "../sim/math.js";
import type { Body, SystemLayout } from "../sim/world/layout.js";
import {
  COMPASS_RADIUS,
  SCANNER_HEIGHT,
  SCANNER_WIDTH,
} from "../render/hud/draw.js";
import type {
  HudBars,
  HudCompass,
  HudContact,
  HudModel,
} from "../render/hud/draw.js";
import {
  MAX_MESSAGE_CHARS,
  clampMessage,
  formatClock,
  formatFuel,
  formatSpeed,
} from "../render/hud/format.js";
import {
  projectToCompass,
  projectToScanner,
} from "../render/hud/projection.js";

interface ScannerTarget {
  readonly id: HudContact["id"];
  readonly kind: HudContact["kind"];
  readonly body: Body;
}

function bodyFor(target: CompassTarget, layout: SystemLayout): Body {
  switch (target) {
    case "planet":
      return layout.planet;
    case "station":
      return layout.station;
    case "witchpoint":
      return layout.witchpoint;
  }
}

function scannerTargets(layout: SystemLayout): readonly ScannerTarget[] {
  return [
    { id: "station", kind: "station", body: layout.station },
    { id: "navBuoy", kind: "buoy", body: layout.navBuoy },
    { id: "witchpoint", kind: "beacon", body: layout.witchpoint },
  ];
}

function buildContacts(
  state: FlightState,
  layout: SystemLayout,
): readonly HudContact[] {
  return scannerTargets(layout).map((target) => {
    const relative: Vec3 = sub(target.body.position, state.position);
    const blip = projectToScanner(
      relative,
      state.orientation,
      SCANNER_WIDTH,
      SCANNER_HEIGHT,
      layout.scannerRange,
      target.body.radius,
    );
    return { id: target.id, kind: target.kind, ...blip };
  });
}

function buildCompass(state: FlightState, layout: SystemLayout): HudCompass {
  const target = resolveCompassTarget(
    state.position,
    state.compassMode,
    layout,
  );
  const relative = sub(bodyFor(target, layout).position, state.position);
  const blip = projectToCompass(relative, state.orientation, COMPASS_RADIUS);
  return { target, ...blip };
}

function buildBars(state: FlightState, config: FlightConfig): HudBars {
  return {
    speed: config.maxSpeed > 0 ? clamp(state.speed / config.maxSpeed, 0, 1) : 0,
    roll:
      config.maxRoll > 0 ? clamp(state.rollRate / config.maxRoll, -1, 1) : 0,
    pitch:
      config.maxPitch > 0 ? clamp(state.pitchRate / config.maxPitch, -1, 1) : 0,
    // Phase 3 has no fuel consumption; the tank is the catalogue's full value.
    fuel: 1,
  };
}

export function buildHudModel(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  message: string,
  flashAlpha = 0,
): HudModel {
  const aegis: AegisStatus = aegisStatus(state.position, layout);

  return {
    speed: state.speed,
    clockSeconds: state.clockSeconds,
    message: clampMessage(message, MAX_MESSAGE_CHARS),
    condition: "green",
    // D-08: the red frame overlay is app-owned feedback, clamped so a bad
    // envelope can never paint outside the canvas.
    flashAlpha: clamp(flashAlpha, 0, 1),
    massLocked: state.torus.massLocked,
    scannerRange: layout.scannerRange,
    contacts: buildContacts(state, layout),
    compass: buildCompass(state, layout),
    aegis,
    bars: buildBars(state, config),
    speedText: formatSpeed(state.speed),
    fuelText: formatFuel(config.maxFuel),
    clockText: formatClock(state.clockSeconds),
  };
}

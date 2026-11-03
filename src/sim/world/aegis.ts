// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The aegis and compass rules (FLGT-05, D-06, D-07).
 *
 * This module is the single owner of the two boundaries the HUD reads:
 *
 * - `aegisStatus`: station aegis inside 51,200 m (two scanner ranges), else the
 *   planetary aegis inside `3 * planetRadius` (123,480 m for Lave), else none.
 *   The ranges come from `SystemLayout`, never re-derived here.
 * - `autoCompassTarget`: Oolite's basic compass switches to the main station
 *   inside the planetary aegis or in docking range, and otherwise points at the
 *   planet.
 *
 * It is pure: squared-distance comparisons only, no Three, no DOM, no clock.
 * The HUD model calls these functions; `draw.ts` never repeats a threshold.
 */

import { lengthSquared, sub } from "../math.js";
import type { Vec3 } from "../math.js";
import type { CompassMode, CompassTarget } from "../flight/state.js";
import type { SystemLayout } from "./layout.js";

/** Oolite's `AEGIS_*` states; only `dockingRange` draws the indicator. */
export type AegisStatus = "none" | "planet" | "dockingRange";

/**
 * The aegis the ship is currently inside.
 *
 * The station is checked first: at Lave's launch point the ship is inside both
 * the station and planetary aegis, and Oolite reports the station aegis.
 */
export function aegisStatus(position: Vec3, layout: SystemLayout): AegisStatus {
  const stationRange = layout.stationAegisRange;
  if (
    lengthSquared(sub(position, layout.station.position)) <=
    stationRange * stationRange
  ) {
    return "dockingRange";
  }

  const planetRange = layout.planetAegisRange;
  if (
    lengthSquared(sub(position, layout.planet.position)) <=
    planetRange * planetRange
  ) {
    return "planet";
  }

  return "none";
}

/**
 * The auto compass target: the station inside either aegis, otherwise the
 * planet. The witchpoint is never an automatic target.
 */
export function autoCompassTarget(
  position: Vec3,
  layout: SystemLayout,
): CompassTarget {
  return aegisStatus(position, layout) === "none" ? "planet" : "station";
}

/** The manual cycle: auto -> planet -> station -> witchpoint -> auto. */
export function nextCompassMode(mode: CompassMode): CompassMode {
  switch (mode) {
    case "auto":
      return "planet";
    case "planet":
      return "station";
    case "station":
      return "witchpoint";
    case "witchpoint":
      return "auto";
  }
}

/**
 * Resolve the target the compass should point at for a given mode.
 *
 * `auto` is the only mode that depends on position; the manual modes are the
 * target themselves.
 */
export function resolveCompassTarget(
  position: Vec3,
  mode: CompassMode,
  layout: SystemLayout,
): CompassTarget {
  switch (mode) {
    case "auto":
      return autoCompassTarget(position, layout);
    case "planet":
      return "planet";
    case "station":
      return "station";
    case "witchpoint":
      return "witchpoint";
  }
}

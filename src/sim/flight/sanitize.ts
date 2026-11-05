// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Flight-state repair (DOCK-06, T-04-41).
 *
 * `stepFlight` calls this before draining commands. A non-finite or absurd
 * value that reached the live state — through a test hook, a future restore, or
 * an arithmetic error — is repaired deterministically instead of being
 * integrated into `Infinity`/`NaN`. Speed is bounded by the torus cap before
 * the speed step can multiply it by `dt`, which is what closes the `1e308`
 * hook: the value is clamped before it can move the ship.
 *
 * The repair is observable through `repairCount`, so a probe or a test can tell
 * a repaired tick from a clean one.
 */

import { lengthSquared, vec } from "../math.js";
import type { FlightConfig } from "./config.js";
import { dockMouthPosition } from "./state.js";
import type { FlightState } from "./state.js";
import { TORUS_MAX_FACTOR } from "./torus.js";
import type { SystemLayout } from "../world/layout.js";

function finiteVec(value: { x: number; y: number; z: number }): boolean {
  return (
    Number.isFinite(value.x) &&
    Number.isFinite(value.y) &&
    Number.isFinite(value.z)
  );
}

/**
 * Repair one state in place.
 *
 * @returns `true` when anything changed; `repairCount` increments once.
 */
export function sanitizeFlightState(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
): boolean {
  let repaired = false;

  if (!finiteVec(state.position)) {
    state.position = dockMouthPosition(layout);
    repaired = true;
  }

  const orientationLengthSquared = lengthSquared(state.orientation);
  if (
    !finiteVec(state.orientation) ||
    !(orientationLengthSquared > 0) ||
    !Number.isFinite(orientationLengthSquared)
  ) {
    state.orientation = layout.stationBaseQuat;
    repaired = true;
  }

  if (!Number.isFinite(state.speed)) {
    state.speed = 0;
    repaired = true;
  }
  if (!Number.isFinite(state.pitchRate)) {
    state.pitchRate = 0;
    repaired = true;
  }
  if (!Number.isFinite(state.rollRate)) {
    state.rollRate = 0;
    repaired = true;
  }
  if (!Number.isFinite(state.stationAngle)) {
    state.stationAngle = 0;
    repaired = true;
  }
  if (!finiteVec(state.impulse)) {
    state.impulse = vec(0, 0, 0);
    repaired = true;
  }
  if (!Number.isFinite(state.torus.factor)) {
    state.torus.factor = 1;
    repaired = true;
  }

  // The torus cap is the widest speed the model can legitimately produce; a
  // larger value is either a hook injection or a bug, never a flight state.
  const speedCap = config.maxSpeed * TORUS_MAX_FACTOR;
  if (Number.isFinite(speedCap) && state.speed > speedCap) {
    state.speed = speedCap;
    repaired = true;
  } else if (state.speed < 0) {
    state.speed = 0;
    repaired = true;
  }

  if (repaired) state.repairCount += 1;
  return repaired;
}

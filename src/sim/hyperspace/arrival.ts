// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Deterministic witchpoint arrival (NAV-05, D-08).
 *
 * Oolite's `leaveWitchspace` (`PlayerEntity.m:6913-6969`) draws a random
 * offset inside scanner range, clamps it to the buoy safety distance, and gives
 * the ship an almost-identity orientation (`Universe.m:8771-8791`) with zero
 * roll/pitch and `fmin(maxFlightSpeed, 50)` speed. Wegolite keeps the shape but
 * replaces the two `Ranrot` draws with one FNV-1a word over the route, so the
 * same origin and destination always produce the same pose and a replay never
 * depends on a global random stream or a wall clock.
 *
 * The offset lies in the **X/Z plane**. `src/sim/world/layout.ts` places the
 * planet on -Z from the witchpoint, so X/Z is the horizontal scanner plane; an
 * X/Y offset would lift the ship out of it. The near-identity orientation
 * already faces the planet down -Z, and only the small Oolite tilt is added.
 *
 * The module is pure: no Three, no DOM, no content import, no clock.
 */

import { fnv1a32 } from "../hash.js";
import { normalize, quat, vec } from "../math.js";
import type { FlightConfig } from "../flight/config.js";
import type { FlightState } from "../flight/state.js";
import type { SystemLayout } from "../world/layout.js";

/** Oolite's `fmin(maxFlightSpeed, 50.0f)`. */
export const ARRIVAL_SPEED = 50;

/** `getWitchspaceExitRotation` uses `(rnd - 128) / 1024` (`Universe.m:8785`). */
export const OOLITE_ORIENTATION_EPSILON = 1 / 1024;

/** `MIN_DISTANCE_TO_BUOY` (`Universe.h:162`). */
const MIN_DISTANCE_TO_BUOY = 750;

/**
 * Stable uint32 for one route. One word feeds both the offset and the tilt;
 * FNV-1a avalanches, so the independent 16-bit slices are not correlated.
 */
export function arrivalWord(originId: string, destinationId: string): number {
  return (
    Number.parseInt(fnv1a32(`${originId}>${destinationId}:arrival`), 16) >>> 0
  );
}

/**
 * Install the deterministic witchpoint arrival pose.
 *
 * The magnitude is uniform in `[witchpoint.radius + 750, scannerRange / 2]`
 * by construction, so the safety clamp can never be violated. Every field a
 * pose change must touch is written here; the launch module is the checklist.
 */
export function applyWitchpointArrival(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  originId: string,
  destinationId: string,
): void {
  const word = arrivalWord(originId, destinationId);
  const uMagnitude = (word & 0xffff) / 0x10000;
  const uAngle = ((word >>> 16) & 0xffff) / 0x10000;

  const safe = layout.witchpoint.radius + MIN_DISTANCE_TO_BUOY;
  const span = layout.scannerRange * 0.5;
  const high = Math.max(safe, span);
  const magnitude = safe + uMagnitude * (high - safe);
  const angle = uAngle * Math.PI * 2;

  state.position = vec(
    layout.witchpoint.position.x + Math.cos(angle) * magnitude,
    layout.witchpoint.position.y,
    layout.witchpoint.position.z + Math.sin(angle) * magnitude,
  );

  const tilt = (slice: number): number =>
    (((word >>> slice) & 0xff) - 128) * OOLITE_ORIENTATION_EPSILON;
  state.orientation = normalize(quat(1, tilt(24), tilt(16), tilt(8)));

  state.speed = Math.min(config.maxSpeed, ARRIVAL_SPEED);
  state.pitchRate = 0;
  state.rollRate = 0;
  state.torus = {
    engaged: false,
    factor: 1,
    massLocked: false,
    lastFactor: 1,
  };
  state.mode = "inFlight";
  state.dockArmed = false;
  // No launch cinematic is in progress; the in-flight restore writes the same
  // 0, so a reload cannot change the pose.
  state.launchElapsed = 0;
  state.stationAngle = 0;
  state.impulse = vec(0, 0, 0);
  state.compassMode = "auto";
}

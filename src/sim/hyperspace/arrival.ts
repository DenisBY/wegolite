// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Seeded witchpoint arrival (NAV-05).
 *
 * Oolite's `leaveWitchspace` (`PlayerEntity.m:6913-6928`) places the ship at a
 * random radial offset along a random quaternion's forward vector. The radial
 * draw spans plus or minus half the scanner range (`SCANNER_MAX_RANGE` is
 * 25600 m, `Entity.h:49`), an offset inside the buoy safety distance is pushed
 * out to that distance along its sign, and the orientation comes from
 * `getWitchspaceExitRotation` (`Universe.m:8776-8791`) with zero roll and pitch
 * rates and `fmin(maxFlightSpeed, 50)` speed.
 *
 * Wegolite draws every value from one `createSeededRandom` stream, seeded by
 * the origin system's persisted market seed. The draw is made once, at the jump
 * commit, and the saved pose is restored on reload without a second draw. No
 * save field is added, and a replay from the same seed gives the same pose.
 *
 * The offset is a full three-dimensional direction, because nothing in WebGL
 * prevents it. Oolite's quaternion draw (`OOQuaternion.m:40-48`) is weighted
 * towards the corners of the hypercube, as its own comment documents. Wegolite
 * keeps that weighting deliberately, because it follows Oolite. The stream
 * change from Ranrot and gen_rnd_number does not change any draw's range or
 * distribution.
 *
 * The module is pure: no Three, no DOM, no content import, no clock.
 */

import { createSeededRandom, normalize, quat, vec } from "../math.js";
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
 * One arrival draw, made once from a seed. The draw holds raw values only. The
 * placement and the Oolite clamp are applied by `applyWitchpointArrival`.
 */
export interface WitchpointExitDraw {
  /** Radial draw in [-0.5, 0.5), a multiple of 1/256 (`PlayerEntity.m:6915`). */
  readonly radial: number;
  /** Unit forward direction from the random quaternion (`OOQuaternion.m:50-81`). */
  readonly direction: readonly [number, number, number];
  /** Orientation tilts for x, y and z (`Universe.m:8785-8787`). */
  readonly tilt: readonly [number, number, number];
}

/**
 * Draw the arrival offset from one seeded stream, in this fixed order.
 *
 * 1. `radial` is `(Ranrot() & 255) / 256 - 0.5`, from `PlayerEntity.m:6915`.
 * 2. Four quaternion components, w, x, y, z, each `Ranrot() % 1024 - 511.5`,
 *    then normalised by their length (`OOQuaternion.m:40-48`).
 * 3. `direction` is the quaternion's forward vector: x = 2(xz - wy),
 *    y = 2(yz + wx), z = 1 - 2x^2 - 2y^2, normalised. An all-zero vector falls
 *    back to (0, 0, 1), as `OOQuaternion.m:81` does.
 * 4. Three tilts, each `(gen_rnd_number() - 128) / 1024` for x, y and z
 *    (`Universe.m:8785-8787`).
 *
 * The draw is pure and cannot throw. It is made at jump commit, never per
 * frame.
 */
export function drawWitchpointExit(seed: number): WitchpointExitDraw {
  const next = createSeededRandom(seed);

  const radial = Math.floor(next() * 256) / 256 - 0.5;

  let w = Math.floor(next() * 1024) - 511.5;
  let x = Math.floor(next() * 1024) - 511.5;
  let y = Math.floor(next() * 1024) - 511.5;
  let z = Math.floor(next() * 1024) - 511.5;
  // Each component is a nonzero half-integer, so the length is never zero.
  const length = Math.hypot(w, x, y, z);
  w /= length;
  x /= length;
  y /= length;
  z /= length;

  const fx = 2 * (x * z - w * y);
  const fy = 2 * (y * z + w * x);
  const fz = 1 - 2 * x * x - 2 * y * y;
  const forwardLength = Math.hypot(fx, fy, fz);
  const direction: readonly [number, number, number] =
    forwardLength > 0
      ? [fx / forwardLength, fy / forwardLength, fz / forwardLength]
      : [0, 0, 1];

  const tilt = (): number =>
    (Math.floor(next() * 256) - 128) * OOLITE_ORIENTATION_EPSILON;
  const tiltX = tilt();
  const tiltY = tilt();
  const tiltZ = tilt();

  return { radial, direction, tilt: [tiltX, tiltY, tiltZ] };
}

/**
 * Install the witchpoint arrival pose from one draw.
 *
 * `distance` is the radial draw scaled by the scanner range. Following
 * `PlayerEntity.m:6917-6919`, a distance whose truncated magnitude is below the
 * safety distance (witchpoint radius plus 750 m) is pushed out to that distance
 * along its sign, so a zero draw takes the negative branch. The position is the
 * witchpoint plus `distance` along the draw's direction, on all three axes.
 *
 * Every field a pose change must touch is written here; the launch module is
 * the checklist.
 */
export function applyWitchpointArrival(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  draw: WitchpointExitDraw,
): void {
  const safety = layout.witchpoint.radius + MIN_DISTANCE_TO_BUOY;
  let distance = layout.scannerRange * draw.radial;
  if (Math.abs(Math.trunc(distance)) < safety) {
    distance += distance > 0 ? safety : -safety;
  }

  const [dx, dy, dz] = draw.direction;
  state.position = vec(
    layout.witchpoint.position.x + dx * distance,
    layout.witchpoint.position.y + dy * distance,
    layout.witchpoint.position.z + dz * distance,
  );

  const [tiltX, tiltY, tiltZ] = draw.tilt;
  state.orientation = normalize(quat(1, tiltX, tiltY, tiltZ));

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
  // The witchpoint lies far outside the station corridor, so the clearance
  // latch is armed exactly as a fresh state and a cleared launch hand-over
  // are. The disarmed tunnel-end clamp in stepDocking is a departure unstick
  // only; it must never act on an arrival, or open space reads as the tunnel
  // end and the first fixed step moves the ship.
  state.dockArmed = true;
  // No launch cinematic is in progress; the in-flight restore writes the same
  // 0, so a reload cannot change the pose.
  state.launchElapsed = 0;
  state.stationAngle = 0;
  state.impulse = vec(0, 0, 0);
  state.compassMode = "auto";
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted launch (FLGT-01, D-10).
 *
 * `beginLaunch` is the only way out of `docked`: it applies the +600 s clock
 * advance exactly once, parks the ship at the dock mouth (station centre plus
 * `dockOffset` along `stationToPlanet`), aims local -Z at the planet, applies
 * Oolite's launch twist (`launchOrientation`: when the slot and the ship lie
 * differently, a quarter turn about the nose axis puts the wings along the
 * slot's long side) and gives it half its top speed. The two-second exit holds
 * that speed, rolls the hull with the station about the same nose axis (D-10),
 * so the twist and the roll commute and the slot looks steady, and hands
 * control to `inFlight`.
 *
 * A second launch while launching or in flight is ignored, not thrown: the
 * command is user-reachable and an exception would kill the frame.
 */

import { slotTwistedForShip } from "../dock/corridor.js";
import type { DockGeometry } from "../dock/geometry.js";
import { add, axisAngle, mul, normalize, rotate, scale, vec } from "../math.js";
import type { Quat } from "../math.js";
import type { FlightConfig } from "./config.js";
import { dockMouthPosition, type FlightState } from "./state.js";
import type { SystemLayout } from "../world/layout.js";

/** D-10: "about two seconds". */
export const LAUNCH_DURATION = 2;

/**
 * A float64 accumulator summing 1/120 cannot land exactly on 2.0 (240 steps
 * reach 1.9999999999999953), so the handover compares with a small tolerance.
 */
const LAUNCH_EPSILON = 1e-9;

const FORWARD = vec(0, 0, -1);

/**
 * The launch pose: Oolite's `DockEntity launchShip:` orientation
 * (`src/Core/Entities/DockEntity.m:819-827` at 7437f22).
 *
 * Oolite builds `q1` from the station and dock orientations and, when
 * `(port_dimensions.x < port_dimensions.y) ^ (bb.max.x - bb.min.x < bb.max.y -
 * bb.min.y)`, calls `quaternion_rotate_about_axis(&q1, launchVector, pi/2)`
 * "to account for the slot being at 90 degrees to vertical". The predicate is
 * `slotTwistedForShip`, read from `dock.port` and the extents of `dock.ship`
 * (Oolite's `[ship boundingBox]`), so no station or ship number lives here.
 *
 * The sign. Oolite stores the conjugate of the local-to-world rotation: its
 * `vector_forward_from_quaternion` and `vector_right_from_quaternion` return
 * the third and first rows of the standard rotation matrix
 * (`OOQuaternion.m:50-150`). `quaternion_rotate_about_axis` right-multiplies
 * by (cos a/2, axis sin a/2) with the Hamilton product (`OOQuaternion.m:30-38`,
 * `:345-358`). With the axis being `q1`'s own world forward, conjugating
 * `q1 * q2` gives the local-to-world rotation of `q1` followed (on the right)
 * by -pi/2 about the ship's local nose axis. Check with `q1` = identity:
 * Oolite's right vector becomes (0,-1,0) and its up vector (1,0,0). The content
 * mirror `(x, y, -z)` (`tools/oolite-ingest/convert/glb.ts`) commutes with any
 * rotation about z, and the Coriolis dock subentity has identity orientation,
 * so in Wegolite's frame the pose is `stationBaseQuat * axisAngle(0,0,1,-pi/2)`
 * (`../math.ts` uses the standard Hamilton product and right-hand axis-angle).
 *
 * The resulting axis mapping on the port frame: local +X (the wings) lies along
 * port -j, the slot's long axis; local +Y along port +i; local -Z (the nose)
 * along port k, toward the planet.
 *
 * Without dock geometry (probe steps that carry none) there are no port
 * dimensions to evaluate, so the result is the untwisted `stationBaseQuat`.
 */
export function launchOrientation(
  layout: SystemLayout,
  dock: DockGeometry | undefined,
): Quat {
  if (dock === undefined) return layout.stationBaseQuat;
  const ship = {
    width: dock.ship.max.x - dock.ship.min.x,
    height: dock.ship.max.y - dock.ship.min.y,
  };
  if (!slotTwistedForShip(dock.port, ship)) return layout.stationBaseQuat;
  return normalize(
    mul(layout.stationBaseQuat, axisAngle(0, 0, 1, -Math.PI / 2)),
  );
}

/**
 * Enter `launching` from `docked`.
 *
 * `dock` is the station's validated dock geometry; it decides the launch twist
 * (`launchOrientation`).
 *
 * @returns `true` when the launch started, `false` when it was ignored.
 */
export function beginLaunch(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  dock: DockGeometry | undefined,
): boolean {
  if (state.mode !== "docked") return false;

  state.mode = "launching";
  state.launchElapsed = 0;
  state.launchCount += 1;
  state.clockSeconds += 600;
  state.position = dockMouthPosition(layout);
  state.orientation = launchOrientation(layout, dock);
  state.speed = config.launchSpeed;
  state.pitchRate = 0;
  // Contacts are reported per departure: a relaunch starts a fresh approach,
  // which is what the skipped-launch browser assertion reads.
  state.bounceCount = 0;
  state.impulse = vec(0, 0, 0);
  // The drift (D-02): Oolite's `leaveDock:` zeroes the velocity
  // (PlayerEntity.m:6465).
  state.drift = vec(0, 0, 0);
  // The world-sense station rate: the slot stays steady during the exit.
  state.rollRate = layout.stationRollRadPerSec;
  state.stationAngle = 0;
  // A launch leaves through the mouth, overlapping the contact proxy; the latch
  // re-arms only after the whole box is clear of the proxy's outward face.
  state.dockArmed = false;
  return true;
}

/** Finish the exit and hand control to the player. */
export function completeLaunch(state: FlightState): void {
  state.mode = "inFlight";
  state.launchElapsed = LAUNCH_DURATION;
  state.rollRate = 0;
  state.pitchRate = 0;
}

/**
 * Advance one launching step.
 *
 * @returns `true` when this step completed the exit.
 */
export function stepLaunch(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  dt: number,
): boolean {
  // Hold the dock speed; the scripted exit never accelerates.
  state.speed = config.launchSpeed;

  const forward = rotate(state.orientation, FORWARD);
  state.position = add(state.position, scale(forward, state.speed * dt));
  state.orientation = normalize(
    mul(
      state.orientation,
      axisAngle(0, 0, 1, layout.stationRollRadPerSec * dt),
    ),
  );

  state.launchElapsed += dt;
  if (state.launchElapsed >= LAUNCH_DURATION - LAUNCH_EPSILON) {
    completeLaunch(state);
    return true;
  }
  return false;
}

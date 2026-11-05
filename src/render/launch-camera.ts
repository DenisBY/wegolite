// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The scripted launch camera (D-10, A1, research step 8).
 *
 * Pure maths: no Three objects and no DOM, so both poses are decidable in Node
 * (`tests/render/launch-camera.test.ts`). The launch camera sits in front of
 * the dock and looks back at the Cobra as it slides out; the cockpit pose is the
 * ship pose plus the Oolite view offset.
 *
 * `sync.ts` is the only module that turns either *world* pose into a render
 * pose. Nothing here knows about a camera object, a canvas or a clock.
 */

import {
  add,
  cross,
  lengthSquared,
  normalizeVec,
  quatFromUnitVectors,
  rotate,
  scale,
  sub,
  vec,
} from "../sim/math.js";
import type { Quat, Vec3 } from "../sim/math.js";
import type { SystemLayout } from "../sim/world/layout.js";

/** The world up axis the station's right vector is derived from. */
export const WORLD_UP: Vec3 = vec(0, 1, 0);

/** Metres in front of the dock mouth, along `stationToPlanet`. */
export const LAUNCH_FORWARD_OFFSET = 220;
/** Metres to the station's right. */
export const LAUNCH_RIGHT_OFFSET = 110;
/** Metres above the dock plane, along `stationUp`. */
export const LAUNCH_UP_OFFSET = 60;

/** Oolite `view_position_forward = "0.0 7.25 31.0"` in +Z, converted to -Z. */
export const COCKPIT_OFFSET: Vec3 = vec(0, 7.25, -31);

/** Below this squared length the cross product is numerically degenerate. */
const DEGENERATE_BASIS = 1e-12;

/** A world pose the renderer can adopt without re-deriving anything. */
export interface CameraPose {
  readonly position: Vec3;
  readonly quaternion: Quat;
}

/** The station-relative basis the cinematic offset is expressed in. */
export interface CameraBasis {
  readonly right: Vec3;
  readonly up: Vec3;
}

/**
 * The orthonormal `(right, up)` pair around `stationToPlanet`.
 *
 * The normal case is `right = normalize(cross(stationToPlanet, worldUp))`.
 * When `stationToPlanet` is parallel to world up the cross product vanishes, so
 * the X axis is used instead; `up` is always re-derived from `right`, so the
 * pair stays orthonormal and finite.
 */
export function launchCameraBasis(layout: SystemLayout): CameraBasis {
  const toPlanet = layout.stationToPlanet;
  const crossUp = cross(toPlanet, WORLD_UP);
  const right =
    lengthSquared(crossUp) < DEGENERATE_BASIS
      ? normalizeVec(cross(toPlanet, vec(1, 0, 0)))
      : normalizeVec(crossUp);
  return { right, up: cross(right, toPlanet) };
}

/**
 * The external cinematic pose: in front of the dock, offset right and up,
 * looking at the ship. Local -Z is the look direction, exactly as for the
 * station (`quatFromUnitVectors`, never `Object3D.lookAt()`).
 */
export function computeLaunchCamera(
  layout: SystemLayout,
  shipPos: Vec3,
): CameraPose {
  const dockPos = add(
    layout.station.position,
    scale(layout.stationToPlanet, layout.dockOffset),
  );
  const { right, up } = launchCameraBasis(layout);
  const position = add(
    dockPos,
    add(
      scale(layout.stationToPlanet, LAUNCH_FORWARD_OFFSET),
      add(scale(right, LAUNCH_RIGHT_OFFSET), scale(up, LAUNCH_UP_OFFSET)),
    ),
  );
  // A zero look vector (ship exactly at the camera) normalises to zero, and
  // `quatFromUnitVectors` then returns the identity: finite, never NaN.
  const look = normalizeVec(sub(shipPos, position));
  return {
    position,
    quaternion: quatFromUnitVectors(vec(0, 0, -1), look),
  };
}

/**
 * The cockpit pose at handover: the ship pose plus the Oolite view offset, with
 * the ship's own orientation as the camera orientation. `shakeOffset` is a
 * world-space camera nudge from the app's deterministic feedback envelope; it
 * defaults to zero so every existing caller is unchanged.
 */
export function computeCockpitCamera(
  position: Vec3,
  orientation: Quat,
  shakeOffset: Vec3 = vec(0, 0, 0),
): CameraPose {
  return {
    position: add(
      add(position, rotate(orientation, COCKPIT_OFFSET)),
      shakeOffset,
    ),
    quaternion: orientation,
  };
}

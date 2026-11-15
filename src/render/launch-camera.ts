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
  COBRA_VIEW_OFFSETS,
  toWegoliteLocal,
} from "../sim/combat/constants.js";
import type { Facing } from "../sim/combat/mounts.js";
import {
  add,
  axisAngle,
  cross,
  lengthSquared,
  mul,
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

/**
 * The Cobra's four cockpit view positions in Wegolite's local frame (forward is
 * -Z): the compiled Oolite `view_position_*` through `toWegoliteLocal`
 * (`shipdata.plist:1344-1347`). The fore entry equals `COCKPIT_OFFSET`.
 */
export const VIEW_OFFSETS: Readonly<Record<Facing, Vec3>> = Object.freeze({
  fore: toWegoliteLocal(COBRA_VIEW_OFFSETS.fore),
  aft: toWegoliteLocal(COBRA_VIEW_OFFSETS.aft),
  port: toWegoliteLocal(COBRA_VIEW_OFFSETS.port),
  starboard: toWegoliteLocal(COBRA_VIEW_OFFSETS.starboard),
});

/**
 * The yaw about the ship's own up axis that turns the fore view into each view
 * (A1): aft pi, port +pi/2 (toward the ship's left, local -X), starboard -pi/2.
 * It is the rotation `laserFrame` (`src/sim/combat/aim.ts`) applies to the
 * laser, so a camera and the laser on the same facing look the same way.
 */
const VIEW_YAW: Readonly<Record<Facing, number>> = Object.freeze({
  fore: 0,
  aft: Math.PI,
  port: Math.PI / 2,
  starboard: -Math.PI / 2,
});

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
 * The cockpit pose for one view (CBT-04): the ship pose plus that view's Oolite
 * position offset rotated by the ship's orientation, looking along the facing
 * (the ship's orientation turned about its own up axis by the view's yaw, so
 * the camera's forward equals `laserFrame(orientation, view).forward`).
 * `shakeOffset` is a world-space camera nudge from the app's deterministic
 * feedback envelope; it defaults to zero.
 */
export function computeViewCamera(
  position: Vec3,
  orientation: Quat,
  view: Facing,
  shakeOffset: Vec3 = vec(0, 0, 0),
): CameraPose {
  return {
    position: add(
      add(position, rotate(orientation, VIEW_OFFSETS[view])),
      shakeOffset,
    ),
    quaternion:
      view === "fore"
        ? orientation
        : mul(orientation, axisAngle(0, 1, 0, VIEW_YAW[view])),
  };
}

/**
 * The cockpit pose at handover: the fore view. Kept as the name the launch
 * handover and its tests use; it is `computeViewCamera` for the fore view.
 */
export function computeCockpitCamera(
  position: Vec3,
  orientation: Quat,
  shakeOffset: Vec3 = vec(0, 0, 0),
): CameraPose {
  return computeViewCamera(position, orientation, "fore", shakeOffset);
}

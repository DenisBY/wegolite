// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one world -> render path (WORLD-02, Pattern 1, T-3-03).
 *
 * The simulation keeps float64 world positions; the GPU takes float32. At Lave's
 * extent a float32 coordinate has a ~0.1 m ULP, so uploading absolute positions
 * would shimmer exactly when the player lines up the dock. Every body's
 * `position` is therefore written from `cameraRelative(bodyWorld, cameraWorld)`
 * — the subtraction happens in JS doubles before the upload — and the camera
 * object stays at `(0, 0, 0)` with orientation only.
 *
 * The camera world pose is derived from the *same* interpolated ship pose used
 * for the hull; mixing current and interpolated poses produces sub-metre
 * shimmer at speed.
 */

import * as THREE from "three";
import type { FlightPose } from "../sim/flight/state.js";
import { add, axisAngle, mul, nlerp, rotate, vec } from "../sim/math.js";
import type { Vec3 } from "../sim/math.js";
import type { SystemLayout } from "../sim/world/layout.js";
import { cameraRelative } from "./camera-relative.js";
import type { SystemScene } from "./system-scene.js";

/** Oolite `view_position_forward = "0.0 7.25 31.0"` in +Z, converted to -Z. */
export const VIEW_OFFSET: Vec3 = vec(0, 7.25, -31);

/** Interpolate the ship pose once per rendered frame. */
export function interpolatePose(
  previous: FlightPose,
  current: FlightPose,
  alpha: number,
): FlightPose {
  return {
    position: {
      x:
        previous.position.x +
        (current.position.x - previous.position.x) * alpha,
      y:
        previous.position.y +
        (current.position.y - previous.position.y) * alpha,
      z:
        previous.position.z +
        (current.position.z - previous.position.z) * alpha,
    },
    orientation: nlerp(previous.orientation, current.orientation, alpha),
  };
}

/** Only the camera-relative subtraction is allowed to touch Object3D.position. */
function placeRelative(
  object: THREE.Object3D,
  world: Vec3,
  cameraWorld: Vec3,
): void {
  const relative = cameraRelative(world, cameraWorld);
  object.position.set(relative.x, relative.y, relative.z);
}

function setQuaternion(
  object: THREE.Object3D,
  quaternion: {
    readonly w: number;
    readonly x: number;
    readonly y: number;
    readonly z: number;
  },
): void {
  object.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
}

/** Roll the station about its local +Z, on top of the base orientation. */
export function applyStationRoll(
  scene: SystemScene,
  layout: SystemLayout,
  stationAngle: number,
): void {
  setQuaternion(
    scene.station,
    mul(layout.stationBaseQuat, axisAngle(0, 0, 1, stationAngle)),
  );
}

/** Place every body and orient the camera for one rendered frame. */
export function applyFrame(
  scene: SystemScene,
  previous: FlightPose,
  current: FlightPose,
  alpha: number,
  layout: SystemLayout,
  elapsedSeconds: number,
): void {
  const pose = interpolatePose(previous, current, alpha);
  const cameraWorld = add(pose.position, rotate(pose.orientation, VIEW_OFFSET));

  scene.camera.position.set(0, 0, 0);
  setQuaternion(scene.camera, pose.orientation);

  placeRelative(scene.planet.mesh, layout.planet.position, cameraWorld);
  scene.planet.update(elapsedSeconds);
  placeRelative(scene.sun, layout.sun.position, cameraWorld);
  placeRelative(scene.station, layout.station.position, cameraWorld);
  placeRelative(scene.ship, pose.position, cameraWorld);
  setQuaternion(scene.ship, pose.orientation);

  // The starfield is camera-locked: it stays at the origin, so its points never
  // leave the frustum however far the ship travels.
  scene.starfield.position.set(0, 0, 0);
}

/**
 * The largest absolute `Object3D.position` component in the scene. The probe
 * publishes it so a regression that writes a world coordinate into a body is
 * caught numerically rather than by eye (WORLD-02).
 */
export function maxRelativeMagnitude(scene: SystemScene): number {
  let maximum = 0;
  scene.scene.traverse((object) => {
    maximum = Math.max(
      maximum,
      Math.abs(object.position.x),
      Math.abs(object.position.y),
      Math.abs(object.position.z),
    );
  });
  return maximum;
}

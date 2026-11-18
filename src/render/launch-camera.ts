// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The cockpit cameras and the launch view from inside the dock slot (D-10,
 * CBT-04, A1; owner decision 2026-11-18, option 1, quick 261118-l26).
 *
 * Pure maths: no Three objects and no DOM, so every pose is decidable in Node
 * (`tests/render/launch-camera.test.ts`). The cockpit pose is the ship pose
 * plus the Oolite view offset.
 *
 * The launch view. Oolite hides the world and draws its break pattern while
 * launching (`Universe.m:2895-2913` at 7437f22); Wegolite instead shows the
 * live cockpit view, starting deep inside the station's dock slot and flying
 * out through the mouth. The path is presentation only: the simulation, like
 * Oolite (`DockEntity.m:812-837`), parks the ship at the dock mouth and moves
 * it out at half its top speed (`src/sim/flight/launch.ts`), and nothing here
 * changes that. The camera is the fore cockpit pose of the interpolated sim
 * pose, pulled back along the slot axis by a distance that eases to zero with
 * a smoothstep over `LAUNCH_DURATION`, so the view starts at the ship's speed
 * and lands on the cockpit pose, with the ship's velocity, at handover.
 *
 * Every station number comes from content data, never from a constant here:
 * the mouth is `layout.dockOffset` (the station's dock subentity position),
 * the axis is `layout.stationToPlanet`, and the depth is the caller's
 * `DockGeometry.port.depth` (compiled from the dock subentity mesh). Another
 * station type therefore only needs its own dock-port record.
 *
 * The camera keeps the ship's orientation, and the sim rolls the hull with
 * the station during the exit (D-10), so the slot walls hold still in the view
 * while the planet and stars turn through the opening.
 *
 * `sync.ts` is the only module that turns a *world* pose into a render pose.
 * Nothing here knows about a camera object, a canvas or a clock.
 */

import {
  COBRA_VIEW_OFFSETS,
  toWegoliteLocal,
} from "../sim/combat/constants.js";
import type { Facing } from "../sim/combat/mounts.js";
import { LAUNCH_DURATION } from "../sim/flight/launch.js";
import { add, axisAngle, mul, rotate, scale, sub, vec } from "../sim/math.js";
import type { Quat, Vec3 } from "../sim/math.js";
import { DT } from "../sim/time.js";
import type { SystemLayout } from "../sim/world/layout.js";

/** Oolite `view_position_forward = "0.0 7.25 31.0"` in +Z, converted to -Z. */
export const COCKPIT_OFFSET: Vec3 = vec(0, 7.25, -31);

/**
 * The share of the station's dock depth the launch view starts inside the
 * mouth (owner decision 2026-11-18, option 1).
 */
export const LAUNCH_VIEW_START_FRACTION = 0.8;

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

/** A world pose the renderer can adopt without re-deriving anything. */
export interface CameraPose {
  readonly position: Vec3;
  readonly quaternion: Quat;
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

/** Clamp to [0, 1]. */
function unit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Zero slope at both ends, so the view leaves and lands at the ship's speed. */
function smoothstep(value: number): number {
  const x = unit(value);
  return x * x * (3 - 2 * x);
}

/**
 * The launch time of the pose drawn at `alpha`: the interpolated pose lies
 * `(1 - alpha)` of a step behind the sim's current one. A non-finite alpha is
 * read as 1 and a non-finite elapsed as 0; the result is always finite and in
 * [0, LAUNCH_DURATION].
 */
export function launchViewElapsed(
  launchElapsed: number,
  alpha: number,
): number {
  const a = Number.isFinite(alpha) ? unit(alpha) : 1;
  const elapsed = Number.isFinite(launchElapsed) ? launchElapsed : 0;
  return Math.min(LAUNCH_DURATION, Math.max(0, elapsed - (1 - a) * DT));
}

/**
 * The station's roll angle at a launch time. While launching the sim's
 * `stationAngle` equals `stationRollRadPerSec * launchElapsed`: `beginLaunch`
 * zeroes both, and every launching step adds `dt` to the one and
 * `stationRollRadPerSec * dt` to the other (`step.ts`, the station roll in
 * block 5). The renderer therefore rolls the station at the same interpolated
 * time as the pose, so the walls do not jitter against the camera.
 */
export function launchViewStationAngle(
  layout: SystemLayout,
  elapsed: number,
): number {
  return layout.stationRollRadPerSec * elapsed;
}

/**
 * The launch view at `elapsed` seconds into the exit: the fore cockpit pose of
 * the ship pose, pulled back along the slot axis (`layout.stationToPlanet`) by
 * `(LAUNCH_VIEW_START_FRACTION * slotDepth + cockpit lead) * (1 - smoothstep)`.
 * At 0 the camera is `LAUNCH_VIEW_START_FRACTION` of the slot depth inside the
 * mouth; at `LAUNCH_DURATION` it is exactly the cockpit pose.
 *
 * `slotDepth` is the station's `DockGeometry.port.depth`. An undefined,
 * non-finite or non-positive depth gives the plain cockpit pose, so missing
 * data cannot put a NaN into the camera.
 */
export function computeSlotLaunchCamera(
  layout: SystemLayout,
  slotDepth: number | undefined,
  position: Vec3,
  orientation: Quat,
  elapsed: number,
): CameraPose {
  const cockpit = computeCockpitCamera(position, orientation);
  if (slotDepth === undefined || !Number.isFinite(slotDepth) || slotDepth <= 0)
    return cockpit;
  const progress = Number.isFinite(elapsed) ? elapsed / LAUNCH_DURATION : 1;
  // The cockpit leads the hull centre by -VIEW_OFFSETS.fore.z metres, so the
  // pull back covers that lead too and the start depth is measured from the
  // mouth, where the sim parks the hull.
  const pullback =
    (LAUNCH_VIEW_START_FRACTION * slotDepth - VIEW_OFFSETS.fore.z) *
    (1 - smoothstep(progress));
  return {
    position: sub(cockpit.position, scale(layout.stationToPlanet, pullback)),
    quaternion: cockpit.quaternion,
  };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The cockpit cameras and the launch view from inside the dock slot (D-10,
 * CBT-04, A1; owner decisions 2026-11-18: option 1, quick 261118-l26, and the
 * pre-roll, quick 261118-os8).
 *
 * Pure maths: no Three objects and no DOM, so every pose is decidable in Node
 * (`tests/render/launch-camera.test.ts`). The cockpit pose is the ship pose
 * plus the Oolite view offset.
 *
 * The launch view. Oolite has no pre-roll: it draws its break pattern while
 * the ship is already launching (`Universe.m:2895-2913` at 7437f22) and hides
 * the world only while more than five of its rings are alive
 * (`Universe.m:3516-3520`). Wegolite instead shows the live cockpit view from
 * inside the station's dock slot, in two parts on one view timeline `tau`:
 *
 * 1. The pre-roll, `LAUNCH_PRE_ROLL_DURATION` seconds of presentation only. The
 *    simulation stays docked (no game time passes); the camera starts at the
 *    inner end of the slot, the full `DockGeometry.port.depth` from the mouth,
 *    with the ship's launch orientation and the station's roll
 *    (`preRollPose`), and starts to move toward the mouth.
 * 2. The simulated launch, `LAUNCH_DURATION` seconds. The simulation, like
 *    Oolite (`DockEntity.m:812-837`), parks the ship at the dock mouth and
 *    moves it out at half its top speed (`src/sim/flight/launch.ts`); nothing
 *    here changes that.
 *
 * The camera's distance from the mouth along the slot axis is one curve over
 * both parts (`launchViewAxial`): it starts at rest at the full depth and lands
 * on the fore cockpit position, with the ship's speed, at handover. The camera
 * is the fore cockpit pose of the (pre-roll or interpolated sim) pose, pulled
 * back along the axis so that it sits on that curve, so the path is
 * continuous in position and velocity where the hull goes from parked to the
 * launch speed.
 *
 * Every station number comes from content data, never from a constant here:
 * the mouth is `layout.dockOffset` (the station's dock subentity position),
 * the axis is `layout.stationToPlanet`, and the depth is the caller's
 * `DockGeometry.port.depth` (compiled from the dock subentity mesh). Another
 * station type therefore only needs its own dock-port record.
 *
 * The camera keeps the ship's orientation, and the ship rolls with the station
 * over the whole view (the pre-roll pose here, the sim during the exit, D-10),
 * so the slot walls hold still in the view while the planet and stars turn
 * through the opening.
 *
 * `sync.ts` is the only module that turns a *world* pose into a render pose.
 * Nothing here knows about a camera object, a canvas or a clock.
 */

import {
  COBRA_VIEW_OFFSETS,
  toWegoliteLocal,
} from "../sim/combat/constants.js";
import type { Facing } from "../sim/combat/mounts.js";
import type { DockGeometry } from "../sim/dock/geometry.js";
import { LAUNCH_DURATION, launchOrientation } from "../sim/flight/launch.js";
import { dockMouthPosition } from "../sim/flight/state.js";
import type { FlightPose } from "../sim/flight/state.js";
import {
  add,
  axisAngle,
  mul,
  normalize,
  rotate,
  scale,
  sub,
  vec,
} from "../sim/math.js";
import type { Quat, Vec3 } from "../sim/math.js";
import { DT } from "../sim/time.js";
import type { SystemLayout } from "../sim/world/layout.js";

/** Oolite `view_position_forward = "0.0 7.25 31.0"` in +Z, converted to -Z. */
export const COCKPIT_OFFSET: Vec3 = vec(0, 7.25, -31);

/**
 * The presentation pre-roll before the simulated launch, in seconds (owner
 * decision 2026-11-18, quick 261118-os8): the camera rests at the inner end of
 * the dock slot and starts toward the mouth while the simulation stays docked.
 * The one named constant to tune; the app plays none under the manual test
 * clock (D-09), where the view starts at this time instead.
 */
export const LAUNCH_PRE_ROLL_DURATION = 1.5;

/** The whole launch view: the pre-roll, then the simulated launch. */
export const LAUNCH_VIEW_DURATION = LAUNCH_PRE_ROLL_DURATION + LAUNCH_DURATION;

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
 * The view time of the pre-roll frame drawn at `alpha`, with the same reading
 * as `launchViewElapsed`: the pre-roll's elapsed time `(1 - alpha)` of a step
 * back, clamped to [0, LAUNCH_PRE_ROLL_DURATION]. A non-finite alpha is read as
 * 1 and a non-finite elapsed as 0.
 */
export function preRollViewTime(preRollElapsed: number, alpha: number): number {
  const a = Number.isFinite(alpha) ? unit(alpha) : 1;
  const elapsed = Number.isFinite(preRollElapsed) ? preRollElapsed : 0;
  return Math.min(
    LAUNCH_PRE_ROLL_DURATION,
    Math.max(0, elapsed - (1 - a) * DT),
  );
}

/**
 * The station's roll angle at a view time (quick 261118-os8, design decision
 * 6): `stationRollRadPerSec * (viewTime - LAUNCH_PRE_ROLL_DURATION)`. It is
 * negative during the pre-roll and 0 at the launch step. While launching the
 * view time is `LAUNCH_PRE_ROLL_DURATION + launchElapsed`, and the sim's
 * `stationAngle` equals `stationRollRadPerSec * launchElapsed`: `beginLaunch`
 * zeroes both, and every launching step adds `dt` to the one and
 * `stationRollRadPerSec * dt` to the other (`step.ts`, the station roll in
 * block 5). The renderer therefore rolls the station at the same time as the
 * camera, so the walls do not jitter against it.
 */
export function launchViewStationAngle(
  layout: SystemLayout,
  viewTime: number,
): number {
  return layout.stationRollRadPerSec * (viewTime - LAUNCH_PRE_ROLL_DURATION);
}

/**
 * The camera's signed distance from the dock mouth along the slot axis
 * (`layout.stationToPlanet`) at view time `tau`; negative is inside the slot
 * (quick 261118-os8, design decision 4).
 *
 * With `lead` the fore cockpit's lead over the hull centre, the path runs from
 * `start = -slotDepth` to `end = launchSpeed * LAUNCH_DURATION + lead`, the
 * cockpit's position at handover. Over `u = tau / LAUNCH_VIEW_DURATION` it is
 * `start + span * g(u)` with `g(u) = (4 - m) u^3 + (m - 3) u^4` and
 * `m = launchSpeed * LAUNCH_VIEW_DURATION / span`: it starts at rest with zero
 * acceleration, `g(1) = 1`, and `g'(1) = m`, so it ends at the cockpit with the
 * ship's speed. It is monotone for m < 4 and never ahead of the cockpit for
 * m < 2. A non-finite `tau` reads as the end of the view.
 */
export function launchViewAxial(
  slotDepth: number,
  launchSpeed: number,
  tau: number,
): number {
  const lead = -VIEW_OFFSETS.fore.z;
  const start = -slotDepth;
  const end = launchSpeed * LAUNCH_DURATION + lead;
  const span = end - start;
  const slope = (launchSpeed * LAUNCH_VIEW_DURATION) / span;
  const u = unit(
    (Number.isFinite(tau) ? tau : LAUNCH_VIEW_DURATION) / LAUNCH_VIEW_DURATION,
  );
  const u3 = u * u * u;
  return start + span * ((4 - slope) * u3 + (slope - 3) * u3 * u);
}

/**
 * The ship pose the pre-roll is drawn from (quick 261118-os8, design decision
 * 6): the dock mouth, where `beginLaunch` will park the hull, and the launch
 * orientation (Oolite's quarter twist, `launchOrientation`) rolled with the
 * station to the view time. At `tau = LAUNCH_PRE_ROLL_DURATION` it is exactly
 * the pose `beginLaunch` sets.
 */
export function preRollPose(
  layout: SystemLayout,
  dock: DockGeometry | undefined,
  tau: number,
): FlightPose {
  return {
    position: dockMouthPosition(layout),
    orientation: normalize(
      mul(
        launchOrientation(layout, dock),
        axisAngle(0, 0, 1, launchViewStationAngle(layout, tau)),
      ),
    ),
  };
}

/**
 * The launch view at view time `tau` (quick 261118-os8, design decision 5):
 * the fore cockpit pose of `position` and `orientation` (the pre-roll pose, or
 * the interpolated sim pose while launching), pulled back along the slot axis
 * by `lead + launchSpeed * max(0, tau - LAUNCH_PRE_ROLL_DURATION) -
 * launchViewAxial(...)`. The middle term is the cockpit's nominal position
 * (parked during the pre-roll, at the ship's speed afterwards), so the
 * camera's position along the axis is the curve, and the pull back is exactly
 * zero at handover.
 *
 * `slotDepth` is the station's `DockGeometry.port.depth`, and `launchSpeed`
 * the flight config's. An undefined, non-finite or non-positive depth, or a
 * non-finite or negative speed, gives the plain cockpit pose, so missing data
 * cannot put a NaN into the camera.
 */
export function computeSlotLaunchCamera(
  layout: SystemLayout,
  slotDepth: number | undefined,
  launchSpeed: number,
  position: Vec3,
  orientation: Quat,
  tau: number,
): CameraPose {
  const cockpit = computeCockpitCamera(position, orientation);
  if (
    slotDepth === undefined ||
    !Number.isFinite(slotDepth) ||
    slotDepth <= 0 ||
    !Number.isFinite(launchSpeed) ||
    launchSpeed < 0
  ) {
    return cockpit;
  }
  const time = Number.isFinite(tau)
    ? Math.min(LAUNCH_VIEW_DURATION, Math.max(0, tau))
    : LAUNCH_VIEW_DURATION;
  // The cockpit leads the hull centre by -VIEW_OFFSETS.fore.z metres.
  const nominal =
    -VIEW_OFFSETS.fore.z +
    launchSpeed * Math.max(0, time - LAUNCH_PRE_ROLL_DURATION);
  const pullback = nominal - launchViewAxial(slotDepth, launchSpeed, time);
  return {
    position: sub(cockpit.position, scale(layout.stationToPlanet, pullback)),
    quaternion: cockpit.quaternion,
  };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's laser frame and ray (CBT-04, CBT-05, CBT-07).
 *
 * A port of the setup half of `-[Universe firstShipHitByLaserFromShip:
 * inDirection:offset:gettingRangeFound:]` (`Universe.m:5584-5611`): the mount
 * offset is applied in the ship's own (unrotated) basis, then the weapon facing
 * rotates the beam about the ship's up axis (aft by pi, port by +pi/2,
 * starboard by -pi/2). The octree descent that consumes the ray is `./hit.ts`.
 *
 * Wegolite's ship frame has forward on local -Z, right on +X and up on +Y; the
 * facing table below is the rotation about up expressed on those axes (A1).
 */

import { add, rotate, scale, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import {
  COBRA_WEAPON_OFFSETS,
  LASER_STATS,
  toWegoliteLocal,
} from "./constants.js";
import type { LaserRay } from "./hit.js";
import type { Facing, LaserKey } from "./mounts.js";

/** The three axes of a laser's frame in world space. */
export interface LaserFrame {
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}

/** Local forward (-Z), right (+X) and up (+Y) of the player's ship. */
const LOCAL_FORWARD = vec(0, 0, -1);
const LOCAL_RIGHT = vec(1, 0, 0);
const LOCAL_UP = vec(0, 1, 0);

/**
 * The laser frame for a weapon facing (`Universe.m:5585-5611`). With the ship's
 * axes `F`, `R`, `U`: fore is `f = F, r = R`; aft `f = -F, r = -R`; port
 * `f = -R, r = F`; starboard `f = R, r = -F`; `u = U` for all four, since the
 * facing rotates about the up axis.
 */
export function laserFrame(orientation: Quat, facing: Facing): LaserFrame {
  const forward = rotate(orientation, LOCAL_FORWARD);
  const right = rotate(orientation, LOCAL_RIGHT);
  const up = rotate(orientation, LOCAL_UP);
  switch (facing) {
    case "fore":
      return { forward, right, up };
    case "aft":
      return { forward: scale(forward, -1), right: scale(right, -1), up };
    case "port":
      return { forward: scale(right, -1), right: forward, up };
    case "starboard":
      return { forward: right, right: scale(forward, -1), up };
  }
}

/**
 * The ray of the player's laser on `facing` (`Universe.m:5584-5611`): the origin
 * is the position plus the Cobra's mount offset for that facing, converted to
 * Wegolite's frame and rotated by the ship's orientation; the direction is the
 * facing's forward axis; the range is the laser's reach.
 */
export function playerLaserRay(
  position: Vec3,
  orientation: Quat,
  facing: Facing,
  laser: LaserKey,
): LaserRay {
  const frame = laserFrame(orientation, facing);
  const offset = rotate(
    orientation,
    toWegoliteLocal(COBRA_WEAPON_OFFSETS[facing]),
  );
  return {
    origin: add(position, offset),
    forward: frame.forward,
    right: frame.right,
    up: frame.up,
    range: LASER_STATS[laser].range,
  };
}

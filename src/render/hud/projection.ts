// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Pure scanner and compass projection (FLGT-05, D-07).
 *
 * Oolite's scanner is a 3D ellipse: the ship-local frame is compressed
 * non-uniformly so a contact's forward distance plots into the upper half of
 * the ellipse (inside the forward FOV cone) and its elevation plots as a
 * vertical lollipop stalk. The exact maths from `HeadUpDisplay.m`:
 *
 *   zFactor = height / width          (64 / 288 ~= 0.222)
 *   yFactor = 1 - sqrt(zFactor)       (~0.529)
 *   scale   = 0.5 * width / range
 *   x       = local.x * scale
 *   yBase   = -forward * zFactor * scale  (positive forward plots up)
 *   yTail   = -local.y * yFactor * scale  (positive up plots up)
 *
 * This module is DOM-free and Three-free, so Vitest can pin every numeric edge
 * without a canvas. The design keeps Oolite's 4.5:1 ellipse (360x80).
 */

import { rotateInverse } from "../../sim/math.js";
import type { Quat, Vec3 } from "../../sim/math.js";
import type { AegisStatus } from "../../sim/world/aegis.js";

/** Oolite's `SCANNER_MAX_RANGE` (Entity.h:49-50); also `layout.scannerRange`. */
export const SCANNER_MAX_RANGE = 25_600;

export interface ScannerBlip {
  /** Offset from the scanner centre in design pixels. */
  readonly x: number;
  /** Vertical offset of the blip foot on the XZ plane; negative is up (ahead). */
  readonly yBase: number;
  /** Elevation offset from `yBase` to the lollipop head; negative points up (above). */
  readonly yTail: number;
  readonly visible: boolean;
  /** True 3D distance from the ship, in metres. */
  readonly distance: number;
}

export interface CompassBlip {
  /** Offset from the compass centre; the blip sits at 0.4x the radius. */
  readonly x: number;
  readonly y: number;
  /** True when the target is ahead of the ship (green, not amber). */
  readonly forward: boolean;
}

function finiteVec(vector: Vec3): boolean {
  return (
    Number.isFinite(vector.x) &&
    Number.isFinite(vector.y) &&
    Number.isFinite(vector.z)
  );
}

function finiteQuat(quaternion: Quat): boolean {
  return (
    Number.isFinite(quaternion.w) &&
    Number.isFinite(quaternion.x) &&
    Number.isFinite(quaternion.y) &&
    Number.isFinite(quaternion.z)
  );
}

const HIDDEN_BLIP: ScannerBlip = {
  x: 0,
  yBase: 0,
  yTail: 0,
  visible: false,
  distance: 0,
};

/**
 * Project a world-space contact into the scanner's design-space ellipse.
 *
 * `radius` is the contact's collision radius: a contact whose centre is just
 * outside the range but whose surface still intersects it is pinned to the rim,
 * exactly as Oolite scales the relative vector by `range / distance`. A
 * non-finite input is omitted rather than drawn off-canvas (T-3-12).
 */
export function projectToScanner(
  relativeWorld: Vec3,
  shipOrientation: Quat,
  width: number,
  height: number,
  range = SCANNER_MAX_RANGE,
  radius = 0,
): ScannerBlip {
  if (
    !finiteVec(relativeWorld) ||
    !finiteQuat(shipOrientation) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(range) ||
    width <= 0 ||
    height <= 0 ||
    range <= 0
  ) {
    return HIDDEN_BLIP;
  }

  const local = rotateInverse(shipOrientation, relativeWorld);
  const distance = Math.hypot(local.x, local.y, local.z);
  if (!Number.isFinite(distance)) return HIDDEN_BLIP;

  const zFactor = height / width;
  const yFactor = 1 - Math.sqrt(zFactor);
  const scannerScale = (0.5 * width) / range;

  // Pin a contact that is just outside the range onto the rim; leave an
  // in-range contact at its true position.
  const ratio = distance > range ? range / distance : 1;
  const plottedX = local.x * ratio;
  const plottedY = local.y * ratio;
  const plottedZ = local.z * ratio;
  const forward = -plottedZ;

  return {
    x: plottedX * scannerScale,
    yBase: -forward * zFactor * scannerScale,
    yTail: -plottedY * yFactor * scannerScale,
    visible: distance - radius <= range,
    distance,
  };
}

/**
 * Project the compass target onto the compass dial.
 *
 * The horizontal component points right and the vertical component points up
 * (negated for canvas coordinates). A target directly ahead or behind has no
 * horizontal/vertical magnitude, so the blip is drawn at the centre rather than
 * divided by zero.
 */
export function projectToCompass(
  relativeWorld: Vec3,
  shipOrientation: Quat,
  radius: number,
): CompassBlip {
  if (
    !finiteVec(relativeWorld) ||
    !finiteQuat(shipOrientation) ||
    !Number.isFinite(radius) ||
    radius <= 0
  ) {
    return { x: 0, y: 0, forward: false };
  }

  const local = rotateInverse(shipOrientation, relativeWorld);
  const forward = -local.z >= 0;
  const magnitude = Math.hypot(local.x, local.y);
  if (magnitude < 1e-9) return { x: 0, y: 0, forward };

  const blipRadius = 0.4 * radius;
  return {
    x: (local.x / magnitude) * blipRadius,
    y: (-local.y / magnitude) * blipRadius,
    forward,
  };
}

/** The text label under the aegis glyph; only docking range draws it. */
export function aegisLabel(status: AegisStatus): string {
  switch (status) {
    case "dockingRange":
      return "AEGIS";
    case "planet":
      return "PLANET";
    case "none":
      return "";
  }
}

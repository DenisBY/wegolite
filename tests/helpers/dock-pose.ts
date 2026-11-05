// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Port-frame pose helpers (Wave 0, DOCK-01, DOCK-02, DOCK-04).
 *
 * Tests state intent ("nose 90 m past the plane, rolled to match the slot")
 * rather than opaque world coordinates. The orientation is built from the same
 * port frame the simulation uses:
 *
 * - the matched pose points the ship's local **-Z inward** (toward the station
 *   centre), so the forward-most (nose) corner is the minimum-`k` corner and
 *   `box.min.z` is the nose;
 * - `nosePastPlane` is metres of that nose beyond the mouth plane along `k`,
 *   positive inside the station, so the returned pose has
 *   `box.min.z === -nosePastPlane` and `box.max.z === 81.3726 - nosePastPlane`;
 * - `rollFromMatched` is radians away from the tall-slot pose (`0` matches the
 *   slot, `pi/2` puts the wings across it);
 * - `lateral` offsets along `i`.
 *
 * `rollLimitRadians` derives the positive roll limit by bisection over the
 * exact committed Cobra corners instead of asserting a round number.
 */

import { readFileSync } from "node:fs";

import type { DockPort } from "../../src/content/schemas/dock-port.js";
import {
  createDockGeometry,
  type DockGeometry,
} from "../../src/sim/dock/geometry.js";
import { portFrame, portQuaternion } from "../../src/sim/dock/port-frame.js";
import { add, axisAngle, mul, normalize, scale } from "../../src/sim/math.js";
import type { Quat, Vec3 } from "../../src/sim/math.js";
import type { SystemLayout } from "../../src/sim/world/layout.js";
import { laveFixture } from "./lave.js";

export interface PortPose {
  readonly position: Vec3;
  readonly orientation: Quat;
  readonly speed: number;
}

export interface PlaceShipOptions {
  /** Metres of nose beyond the mouth plane along k; positive is inside. */
  readonly nosePastPlane: number;
  /** Radians away from the tall-slot pose (0 matches, pi/2 is wings across). */
  readonly rollFromMatched?: number;
  /** Metres along i. */
  readonly lateral?: number;
  /** Scalar forward speed in game units per second. */
  readonly forwardSpeed?: number;
  /** Station roll phase; defaults to 0 so the port frame is the base frame. */
  readonly stationAngle?: number;
}

/**
 * The rotation that turns the port-aligned basis into the matched docking
 * basis: local X -> j (wings along the tall slot), local Y -> i, local Z -> k
 * (nose points inward). It is a half turn about the local (1,1,0) axis.
 */
function matchedBasisRotation(): Quat {
  return normalize(axisAngle(1, 1, 0, Math.PI));
}

let cachedGeometry: DockGeometry | undefined;

/** The committed dock geometry, validated exactly as the app builds it. */
export function laveDockGeometry(): DockGeometry {
  cachedGeometry ??= (() => {
    const raw = JSON.parse(
      readFileSync(
        new URL("../../src/content/generated/dock-port.json", import.meta.url),
        "utf8",
      ),
    ) as DockPort;
    return createDockGeometry(raw, laveFixture().layout.dockOffset);
  })();
  return cachedGeometry;
}

/** Build a ship pose in the station's port frame. */
export function placeShipInPortFrame(
  layout: SystemLayout,
  geometry: DockGeometry,
  options: PlaceShipOptions,
): PortPose {
  const roll = options.rollFromMatched ?? 0;
  const lateral = options.lateral ?? 0;
  const stationAngle = options.stationAngle ?? 0;

  const qPort = portQuaternion(layout, stationAngle);
  const orientation = normalize(
    mul(qPort, mul(matchedBasisRotation(), axisAngle(0, 0, 1, roll))),
  );

  const frame = portFrame(layout, stationAngle);
  // With local +Z mapped to +k, a local z is its port z. The nose is the
  // minimum local z, so the centre sits at (nose offset + min.z) along k.
  const centreAlongK = -geometry.ship.min.z - options.nosePastPlane;
  const position = add(
    frame.origin,
    add(scale(frame.i, lateral), scale(frame.k, centreAlongK)),
  );

  return {
    position,
    orientation,
    speed: options.forwardSpeed ?? 0,
  };
}

/**
 * The positive roll limit, in radians, at which the rotated Cobra footprint
 * first touches the corridor's x half-extent. Bisection over the exact emitted
 * corners; for the committed geometry it is about 31.296 degrees.
 */
export function rollLimitRadians(geometry: DockGeometry): number {
  const { ww } = geometry.corridor;
  const xs = [geometry.ship.min.x, geometry.ship.max.x] as const;
  const ys = [geometry.ship.min.y, geometry.ship.max.y] as const;

  const overflow = (roll: number): number => {
    const sin = Math.sin(roll);
    const cos = Math.cos(roll);
    let maxX = Number.NEGATIVE_INFINITY;
    let minX = Number.POSITIVE_INFINITY;
    for (const x of xs) {
      for (const y of ys) {
        // Port x of a local (x, y) after the matched basis plus a roll about
        // local Z: x*sin(roll) + y*cos(roll).
        const portX = x * sin + y * cos;
        maxX = Math.max(maxX, portX);
        minX = Math.min(minX, portX);
      }
    }
    return Math.max(maxX - ww, -ww - minX);
  };

  let low = 0;
  let high = Math.PI / 2;
  if (overflow(low) >= 0) return low;
  if (overflow(high) < 0) return high;

  for (let iteration = 0; iteration < 80; iteration += 1) {
    const middle = (low + high) / 2;
    if (overflow(middle) < 0) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

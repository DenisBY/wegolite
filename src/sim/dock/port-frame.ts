// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docking-port frame (DOCK-01, RESEARCH Pattern 1).
 *
 * It is exactly the renderer's station orientation for the same tick:
 * `stationBaseQuat * axisAngle(0, 0, 1, stationAngle)`. `i` and `j` are the
 * port's right/up axes and `k` points **outward** (Wegolite's local -Z, toward
 * the planet). The origin is the mouth: station centre plus `k * dockOffset`,
 * which equals `dockMouthPosition(layout)`.
 *
 * Every projection is relative to `origin` so the large world coordinates
 * (~1e5 m) never enter the corridor arithmetic (RESEARCH Pitfall 3).
 */

import { add, axisAngle, mul, rotate, scale, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { SystemLayout } from "../world/layout.js";

export interface PortFrame {
  /** The dock mouth: station centre plus `k * dockOffset`. */
  readonly origin: Vec3;
  /** Port right axis. */
  readonly i: Vec3;
  /** Port up axis. */
  readonly j: Vec3;
  /** Port outward axis (toward the planet). */
  readonly k: Vec3;
}

/** The station's port quaternion at `stationAngle` (the renderer's own maths). */
export function portQuaternion(
  layout: SystemLayout,
  stationAngle: number,
): Quat {
  return mul(layout.stationBaseQuat, axisAngle(0, 0, 1, stationAngle));
}

/** Build the port frame that rotates with the station at `stationAngle`. */
export function portFrame(
  layout: SystemLayout,
  stationAngle: number,
): PortFrame {
  const q = portQuaternion(layout, stationAngle);
  const i = rotate(q, vec(1, 0, 0));
  const j = rotate(q, vec(0, 1, 0));
  const k = rotate(q, vec(0, 0, -1));
  const origin = add(layout.station.position, scale(k, layout.dockOffset));
  return { origin, i, j, k };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/** The player's drift braking (CBT-18, D-02). RED stub: no braking yet. */

import type { Vec3 } from "../math.js";

export const VELOCITY_CLEANUP_MIN = 2000;
export const VELOCITY_CLEANUP_FULL = 5000;
export const VELOCITY_CLEANUP_RATE = 0.001;

export function brakePlayerDrift(
  drift: Vec3,
  _dt: number,
  _thrust: number,
  _thrustFactor: number,
): Vec3 {
  return drift;
}

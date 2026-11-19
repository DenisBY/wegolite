// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drift of NPC ships and buoys (CBT-18, D-02, PD-02). RED skeleton.
 */

import type { Vec3 } from "../math.js";
import type { NpcStepFacts } from "../npc/stats.js";
import type { World } from "./world.js";

/** Oolite's `SHIP_THRUST_FACTOR` (`ShipEntity.h:46`). */
export const SHIP_DRIFT_THRUST_FACTOR = 5;

/** The compiled buoy record's `thrust`. */
export const BUOY_THRUST = 100;

/** One tick of an NPC's drift brake (skeleton: returns the input). */
export function brakeShipDrift(
  velocity: Vec3,
  thrust: number,
  dt: number,
): Vec3 {
  void thrust;
  void dt;
  return velocity;
}

/** The ship drift pass (skeleton: writes nothing). */
export function stepShipDrift(
  world: World,
  dt: number,
  npc?: NpcStepFacts,
): void {
  void world;
  void dt;
  void npc;
}

/** The buoy drift pass (skeleton: writes nothing). */
export function stepBuoyDrift(world: World, dt: number): void {
  void world;
  void dt;
}

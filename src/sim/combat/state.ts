// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's combat state (CBT-04, CBT-05, CBT-06), held beside the flight
 * state and never inside it: `FlightState` fields enter `serializeFlight`, which
 * every pinned golden hashes (RESEARCH Pattern 3).
 *
 * The ident target is an id of the current world only. Dock and jump clear it,
 * and no code outside `src/sim` stores it, because entity ids are unique only
 * within the world that issued them (`src/sim/world/ids.ts`).
 */

import type { Facing } from "./mounts.js";
import {
  BASELINE_SHIELD_LEVEL,
  COBRA_MAX_ENERGY,
  SHIP_MIN_CABIN_TEMP,
  SHOT_TIMER_SATURATION_TICKS,
} from "./constants.js";
import { NO_ENTITY } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";

/** One value per weapon facing. */
export type PerFacing = Record<Facing, number>;

export interface PlayerCombatState {
  /** The current cockpit view, which is also the weapon facing. */
  view: Facing;
  /** Forward shield, `0..BASELINE_SHIELD_LEVEL`. */
  fwdShield: number;
  /** Aft shield, `0..BASELINE_SHIELD_LEVEL`. */
  aftShield: number;
  /** Energy banks, `0..COBRA_MAX_ENERGY`. */
  energy: number;
  /** Cabin temperature, `0..SHIP_MAX_CABIN_TEMP`. */
  cabinTemp: number;
  /** Laser temperature per facing, `0..PLAYER_MAX_WEAPON_TEMP`. */
  laserTemp: PerFacing;
  /** Ticks since the last shot per facing, saturating at the start value. */
  shotTicks: PerFacing;
  /** Whether the ident system is engaged. */
  identEngaged: boolean;
  /** The locked ident target, `NO_ENTITY` when none. */
  identTarget: EntityId;
}

function perFacing(value: number): PerFacing {
  return { fore: value, aft: value, port: value, starboard: value };
}

/**
 * A fresh docked-and-idle state: view fore, both shields full, energy full,
 * cabin at its 60 floor, every laser cold, every shot timer at its start value
 * (so the first shot is never gated, `PlayerEntity.m:1792-1803`), ident off.
 */
export function createPlayerCombatState(): PlayerCombatState {
  return {
    view: "fore",
    fwdShield: BASELINE_SHIELD_LEVEL,
    aftShield: BASELINE_SHIELD_LEVEL,
    energy: COBRA_MAX_ENERGY,
    cabinTemp: SHIP_MIN_CABIN_TEMP,
    laserTemp: perFacing(0),
    shotTicks: perFacing(SHOT_TIMER_SATURATION_TICKS),
    identEngaged: false,
    identTarget: NO_ENTITY,
  };
}

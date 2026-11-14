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

import { FACINGS, isFacing } from "./mounts.js";
import type { Facing } from "./mounts.js";
import {
  BASELINE_SHIELD_LEVEL,
  COBRA_MAX_ENERGY,
  PLAYER_MAX_WEAPON_TEMP,
  SHIP_MAX_CABIN_TEMP,
  SHIP_MIN_CABIN_TEMP,
  SHOT_TIMER_SATURATION_TICKS,
} from "./constants.js";
import { canon } from "../hash.js";
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

/**
 * Whether the state is field-for-field equal to `createPlayerCombatState()`.
 *
 * The world hash appends the combat line only for a non-pristine state, so a
 * run that never fights hashes exactly as it did before combat existed (the
 * same device as `isNeverSpawned`, Pattern 3).
 */
export function isPristineCombat(state: PlayerCombatState): boolean {
  if (
    state.view !== "fore" ||
    state.fwdShield !== BASELINE_SHIELD_LEVEL ||
    state.aftShield !== BASELINE_SHIELD_LEVEL ||
    state.energy !== COBRA_MAX_ENERGY ||
    state.cabinTemp !== SHIP_MIN_CABIN_TEMP ||
    state.identEngaged ||
    state.identTarget !== NO_ENTITY
  ) {
    return false;
  }
  for (const facing of FACINGS) {
    if (
      state.laserTemp[facing] !== 0 ||
      state.shotTicks[facing] !== SHOT_TIMER_SATURATION_TICKS
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Docking (DOCK-10, F7, `PlayerEntity.m:6321-6325`): both shields and the
 * energy banks refill, the four laser temperatures go to 0 and the cabin to 60,
 * and the weapon facing returns to fore (the launch routine does the same,
 * `:6439-6448`, and bookkeeping does not run while docked, so the two routes
 * agree). The ident lock is cleared: its target id is meaningless outside the
 * world that issued it. Shot timers are not reset; Oolite advances them only in
 * bookkeeping (`:2487-2491`).
 */
export function dockReset(state: PlayerCombatState): void {
  state.fwdShield = BASELINE_SHIELD_LEVEL;
  state.aftShield = BASELINE_SHIELD_LEVEL;
  state.energy = COBRA_MAX_ENERGY;
  state.cabinTemp = SHIP_MIN_CABIN_TEMP;
  for (const facing of FACINGS) state.laserTemp[facing] = 0;
  state.view = "fore";
  state.identEngaged = false;
  state.identTarget = NO_ENTITY;
}

/**
 * Launching (`PlayerEntity.m:6439-6448`): the weapon facing returns to fore, the
 * four laser temperatures go to 0 and both shields refill.
 */
export function launchReset(state: PlayerCombatState): void {
  state.view = "fore";
  for (const facing of FACINGS) state.laserTemp[facing] = 0;
  state.fwdShield = BASELINE_SHIELD_LEVEL;
  state.aftShield = BASELINE_SHIELD_LEVEL;
}

/** A finite number clamped to `low..high`, else `fallback`; null when valid. */
function repaired(
  value: number,
  low: number,
  high: number,
  fallback: number,
): number | null {
  if (!Number.isFinite(value)) return fallback;
  if (value < low) return low;
  if (value > high) return high;
  return null;
}

/**
 * Repair the state in place so `canon` never sees a non-finite number
 * (T-13-09). Non-finite shields, energy and cabin return to their pristine
 * values and finite out-of-range ones clamp; a non-finite laser temperature is
 * 0; an unknown view is fore; a timer that is not an integer within
 * `0..SHOT_TIMER_SATURATION_TICKS` is saturated; a target that is not a uint32
 * is cleared; a non-boolean ident flag is off.
 *
 * @returns the number of repaired fields; 0 for a valid state. Idempotent.
 */
export function sanitizeCombat(state: PlayerCombatState): number {
  let count = 0;

  if (!isFacing(state.view)) {
    state.view = "fore";
    count += 1;
  }

  const fwd = repaired(
    state.fwdShield,
    0,
    BASELINE_SHIELD_LEVEL,
    BASELINE_SHIELD_LEVEL,
  );
  if (fwd !== null) {
    state.fwdShield = fwd;
    count += 1;
  }
  const aft = repaired(
    state.aftShield,
    0,
    BASELINE_SHIELD_LEVEL,
    BASELINE_SHIELD_LEVEL,
  );
  if (aft !== null) {
    state.aftShield = aft;
    count += 1;
  }
  const energy = repaired(state.energy, 0, COBRA_MAX_ENERGY, COBRA_MAX_ENERGY);
  if (energy !== null) {
    state.energy = energy;
    count += 1;
  }
  const cabin = repaired(
    state.cabinTemp,
    0,
    SHIP_MAX_CABIN_TEMP,
    SHIP_MIN_CABIN_TEMP,
  );
  if (cabin !== null) {
    state.cabinTemp = cabin;
    count += 1;
  }

  for (const facing of FACINGS) {
    const temp = repaired(
      state.laserTemp[facing],
      0,
      PLAYER_MAX_WEAPON_TEMP,
      0,
    );
    if (temp !== null) {
      state.laserTemp[facing] = temp;
      count += 1;
    }
    const ticks = state.shotTicks[facing];
    if (
      !Number.isInteger(ticks) ||
      ticks < 0 ||
      ticks > SHOT_TIMER_SATURATION_TICKS
    ) {
      state.shotTicks[facing] = SHOT_TIMER_SATURATION_TICKS;
      count += 1;
    }
  }

  if (typeof state.identEngaged !== "boolean") {
    state.identEngaged = false;
    count += 1;
  }
  const target = state.identTarget;
  if (!Number.isInteger(target) || target < 0 || target > 0xffffffff) {
    state.identTarget = NO_ENTITY;
    count += 1;
  }
  return count;
}

/**
 * Canonical text: one `combat=` line, fixed field order, every number through
 * `canon`, never `JSON.stringify`. Throws on a non-finite number, so call
 * `sanitizeCombat` first.
 */
export function serializeCombat(state: PlayerCombatState): string {
  const temps = FACINGS.map((facing) => canon(state.laserTemp[facing]));
  const shots = FACINGS.map((facing) => canon(state.shotTicks[facing], 0));
  return [
    `combat=view:${state.view}`,
    `shield:${canon(state.fwdShield)},${canon(state.aftShield)}`,
    `energy:${canon(state.energy)}`,
    `cabin:${canon(state.cabinTemp)}`,
    `temp:${temps.join(",")}`,
    `shot:${shots.join(",")}`,
    `ident:${String(state.identEngaged)}:${canon(state.identTarget, 0)}`,
  ].join("|");
}

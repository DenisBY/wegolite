// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Laser gating, cost and heat for the player (CBT-05).
 *
 * Exact ports of Oolite's `fireMainWeapon` gates, the shot cost, and the weapon
 * cooling and shot-timer bookkeeping. Order inside one player tick, as Oolite
 * runs it (`update`: pollControls, then doBookkeeping, `PlayerEntity.m:2404-2432`):
 * `fireGate` and `applyShot` first, then `coolWeapons`. Plan 13-08 wires that
 * order into `stepSim`.
 */

import {
  LASER_STATS,
  PLAYER_MAX_WEAPON_TEMP,
  SHOT_TIMER_SATURATION_TICKS,
  WEAPON_COOLING_CUTOUT,
  WEAPON_COOLING_FACTOR,
} from "./constants.js";
import { FACINGS, NO_LASER } from "./mounts.js";
import type { Facing, LaserKey, LaserMounts } from "./mounts.js";
import type { PlayerCombatState } from "./state.js";

/** The outcome of asking the current facing's laser to fire. */
export type FireGate =
  | { readonly kind: "fire"; readonly facing: Facing; readonly laser: LaserKey }
  | { readonly kind: "refused"; readonly reason: "overheat" | "noEnergy" }
  | { readonly kind: "idle" };

const IDLE: FireGate = Object.freeze({ kind: "idle" });

/**
 * Decide whether the laser on the current view's facing fires this tick.
 *
 * Order: no laser fitted is idle (`isWeaponNone`, `PlayerEntity.m:5466`); a
 * recharge that has not elapsed is idle (W4, `shot_time > weapon_recharge_rate`,
 * strict, in integer ticks, `PlayerEntityControls.m:1187`); a temperature at or
 * above the cut-out refuses with `overheat` (W1, `PlayerEntity.m:5460`); an
 * energy at or below the shot's cost refuses with `noEnergy` (W2, strict `<=`,
 * `PlayerEntity.m:5478`).
 */
export function fireGate(
  state: PlayerCombatState,
  mounts: LaserMounts,
): FireGate {
  const facing = state.view;
  const mount = mounts[facing];
  if (mount === NO_LASER) return IDLE;
  const stats = LASER_STATS[mount];
  if (!(state.shotTicks[facing] > stats.rechargeTicks)) return IDLE;
  if (
    state.laserTemp[facing] / PLAYER_MAX_WEAPON_TEMP >=
    WEAPON_COOLING_CUTOUT
  ) {
    return { kind: "refused", reason: "overheat" };
  }
  if (state.energy <= stats.energy) {
    return { kind: "refused", reason: "noEnergy" };
  }
  return { kind: "fire", facing, laser: mount };
}

/**
 * Pay for a shot (W3, `PlayerEntity.m:5485-5494`): the energy cost, the heat of
 * the firing facing, and the facing's shot timer back to zero.
 */
export function applyShot(
  state: PlayerCombatState,
  facing: Facing,
  laser: LaserKey,
): void {
  const stats = LASER_STATS[laser];
  state.energy -= stats.energy;
  state.laserTemp[facing] += stats.shotTemperature;
  state.shotTicks[facing] = 0;
}

/**
 * One tick of weapon bookkeeping (W6, `PlayerEntity.m:2481-2491`): every
 * facing cools by `WEAPON_COOLING_FACTOR * dt` and floors at 0 (`fdim`), and
 * every shot timer advances one tick, saturating at its start value.
 */
export function coolWeapons(state: PlayerCombatState, dt: number): void {
  const coolAmount = WEAPON_COOLING_FACTOR * dt;
  for (const facing of FACINGS) {
    state.laserTemp[facing] = Math.max(0, state.laserTemp[facing] - coolAmount);
    state.shotTicks[facing] = Math.min(
      SHOT_TIMER_SATURATION_TICKS,
      state.shotTicks[facing] + 1,
    );
  }
}

/**
 * The LT gauge (W8, `PlayerEntity.m:4300-4303`): the current facing's laser
 * temperature over `PLAYER_MAX_WEAPON_TEMP`, clamped to `0..1`.
 */
export function laserTempGauge(state: PlayerCombatState): number {
  const level = state.laserTemp[state.view] / PLAYER_MAX_WEAPON_TEMP;
  return Math.min(1, Math.max(0, level));
}

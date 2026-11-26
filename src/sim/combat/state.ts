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
import { MAX_BOUNTY, MAX_KILL_TALLY } from "../world/limits.js";

/** One value per weapon facing. */
export type PerFacing = Record<Facing, number>;

/**
 * The player's standing with the law (FOUND-20, plan 21-06): Oolite's player
 * bounty, the legal-status score (`PlayerEntity` `legalStatus`; 0 is clean, a
 * fugitive is above 50), and the kill tally (`ship_kills`). Hashed through the
 * combat line so the law is visible to every cadence and golden (pitfall C2);
 * save v6 persists them in Phase 24. At rest until Phase 25 writes them: no
 * production path sets either field, and a dock or a launch leaves both alone.
 */
export interface PlayerStanding {
  /** The legal status, an integer `0..MAX_BOUNTY`. */
  legalStatus: number;
  /** The kill tally, an integer `0..MAX_KILL_TALLY`. */
  kills: number;
}

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
  /** The legal status and kill tally (FOUND-20); never reset by dock or launch. */
  standing: PlayerStanding;
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
    standing: { legalStatus: 0, kills: 0 },
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
    state.identTarget !== NO_ENTITY ||
    state.standing.legalStatus !== 0 ||
    state.standing.kills !== 0
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
 * bookkeeping (`:2487-2491`). The standing (legal status and kill tally) is not
 * touched: a dock does not clear a bounty or a tally.
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
 * four laser temperatures go to 0 and both shields refill. The standing is not
 * touched.
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
 * is cleared; a non-boolean ident flag is off; a standing that is not an object
 * is pristine, and a legal status or kill tally that is not an integer within
 * its bound (`MAX_BOUNTY`, `MAX_KILL_TALLY`) is 0, each leaf on its own.
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

  const standing: unknown = state.standing;
  if (typeof standing !== "object" || standing === null) {
    state.standing = { legalStatus: 0, kills: 0 };
    count += 1;
  } else {
    const held = state.standing;
    count += repairStandingLeaf(held, "legalStatus", MAX_BOUNTY);
    count += repairStandingLeaf(held, "kills", MAX_KILL_TALLY);
  }
  return count;
}

/** One standing leaf held to an integer `0..max`, else 0; `-0` becomes 0 (no repair). */
function repairStandingLeaf(
  standing: PlayerStanding,
  key: keyof PlayerStanding,
  max: number,
): number {
  const value: unknown = standing[key];
  if (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= max
  ) {
    standing[key] = value === 0 ? 0 : value;
    return 0;
  }
  standing[key] = 0;
  return 1;
}

/**
 * Canonical text: one `combat=` line, fixed field order, every number through
 * `canon`, never `JSON.stringify`. Throws on a non-finite number, so call
 * `sanitizeCombat` first. The standing (FOUND-20, plan 21-06) is the optional
 * last part, `|std:<legalStatus>,<kills>`, printed only while it is not
 * pristine, so a state that never set it prints the text it printed before.
 */
export function serializeCombat(state: PlayerCombatState): string {
  const temps = FACINGS.map((facing) => canon(state.laserTemp[facing]));
  const shots = FACINGS.map((facing) => canon(state.shotTicks[facing], 0));
  const parts = [
    `combat=view:${state.view}`,
    `shield:${canon(state.fwdShield)},${canon(state.aftShield)}`,
    `energy:${canon(state.energy)}`,
    `cabin:${canon(state.cabinTemp)}`,
    `temp:${temps.join(",")}`,
    `shot:${shots.join(",")}`,
    `ident:${String(state.identEngaged)}:${canon(state.identTarget, 0)}`,
  ];
  const { legalStatus, kills } = state.standing;
  if (legalStatus !== 0 || kills !== 0) {
    parts.push(`std:${canon(legalStatus, 0)},${canon(kills, 0)}`);
  }
  return parts.join("|");
}

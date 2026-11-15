// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-kind flight stats the steering reads (AI-01, plan 14-09).
 *
 * The compiled NPC records carry them (`maxFlightSpeed`, `maxFlightRoll`,
 * `maxFlightPitch`, `thrust`, `forwardWeapon`) and the Phase 12 ship masses
 * carry the mass; the app hands the sim one list per world through step
 * options, keyed by `specKey`, and the steering asks for one row per ship.
 * The sim never imports content: this module declares the type and the lookup
 * only, and a type-only import is the single door the content side may use.
 *
 * `statsFor` copies the linear scan and the finite-number guard of `massOf`
 * (`../world/ship-field.ts`, T-12-10): a missing table, a missing row or a row
 * with a value outside its domain falls back to Oolite's stock defaults
 * (`ShipEntity.m:263-270`), so the steering never reads a corrupt number.
 */

import type { MountKey } from "../combat/mounts.js";
import { MAX_ENTITY_MAGNITUDE, MAX_STEER_RATE } from "../world/limits.js";
import {
  DEFAULT_MAX_FLIGHT_PITCH,
  DEFAULT_MAX_FLIGHT_ROLL,
  DEFAULT_MAX_FLIGHT_SPEED,
  DEFAULT_THRUST,
} from "./constants.js";

/** One ship kind's flight stats. */
export interface NpcFlightStats {
  readonly specKey: string;
  /** Metres per second (`max_flight_speed`). */
  readonly maxFlightSpeed: number;
  /** Radians per second (`max_flight_roll`). */
  readonly maxFlightRoll: number;
  /** Radians per second (`max_flight_pitch`). */
  readonly maxFlightPitch: number;
  /** The speed ramp's thrust (`thrust`). */
  readonly thrust: number;
  /** The ship's mass (`mass`); 0 when the record has none. */
  readonly mass: number;
  /** The forward weapon's equipment key (`forward_weapon_type`). */
  readonly forwardWeapon: MountKey;
}

/**
 * Oolite's stock stats for a ship that authors none (`ShipEntity.m:263-270`),
 * with no mass and no forward weapon.
 */
export const OOLITE_DEFAULT_FLIGHT_STATS: NpcFlightStats = Object.freeze({
  specKey: "",
  maxFlightSpeed: DEFAULT_MAX_FLIGHT_SPEED,
  maxFlightRoll: DEFAULT_MAX_FLIGHT_ROLL,
  maxFlightPitch: DEFAULT_MAX_FLIGHT_PITCH,
  thrust: DEFAULT_THRUST,
  mass: 0,
  forwardWeapon: "EQ_WEAPON_NONE",
});

function inRange(value: number, max: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= max;
}

/** Whether a row holds only values the steering may read. */
function isUsable(row: NpcFlightStats): boolean {
  return (
    inRange(row.maxFlightSpeed, MAX_ENTITY_MAGNITUDE) &&
    inRange(row.maxFlightRoll, MAX_STEER_RATE) &&
    inRange(row.maxFlightPitch, MAX_STEER_RATE) &&
    inRange(row.thrust, MAX_ENTITY_MAGNITUDE) &&
    inRange(row.mass, MAX_ENTITY_MAGNITUDE)
  );
}

/**
 * The usable stats of `specKey`, or `OOLITE_DEFAULT_FLIGHT_STATS` when the
 * table is absent, has no row for it or the row holds a value outside its
 * domain. A linear scan over a list of at most nine kinds: no Map, no
 * allocation.
 */
export function statsFor(
  table: readonly NpcFlightStats[] | undefined,
  specKey: string,
): NpcFlightStats {
  if (table === undefined) return OOLITE_DEFAULT_FLIGHT_STATS;
  for (let i = 0; i < table.length; i += 1) {
    const row = table[i];
    if (row !== undefined && row.specKey === specKey) {
      return isUsable(row) ? row : OOLITE_DEFAULT_FLIGHT_STATS;
    }
  }
  return OOLITE_DEFAULT_FLIGHT_STATS;
}

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

import { isMountKey, NO_LASER } from "../combat/mounts.js";
import type { MountKey } from "../combat/mounts.js";
import { MAX_ENTITY_MAGNITUDE, MAX_STEER_RATE } from "../world/limits.js";
import type { ShipMass } from "../world/ship-field.js";
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

/**
 * Whether a row holds only values the steering may read: the five numbers in
 * their domains and a `forwardWeapon` inside the mount vocabulary (the weapon
 * range lookup indexes the laser table by it). `statsFor` and `massFor` share
 * this one predicate, so a row is usable for flight and proximity alike or for
 * neither.
 */
function isUsable(row: NpcFlightStats): boolean {
  return (
    inRange(row.maxFlightSpeed, MAX_ENTITY_MAGNITUDE) &&
    inRange(row.maxFlightRoll, MAX_STEER_RATE) &&
    inRange(row.maxFlightPitch, MAX_STEER_RATE) &&
    inRange(row.thrust, MAX_ENTITY_MAGNITUDE) &&
    inRange(row.mass, MAX_ENTITY_MAGNITUDE) &&
    isMountKey(row.forwardWeapon)
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

/**
 * The read-only facts the world step hands to the steering (AI-01, plan 14-11).
 * Both lists come from the compiled NPC records through `StepOptions`
 * (`npcFlight`, `hyperspace.shipMasses`), never from a command. The player's
 * collision radius is not a fact: it is the compiled constant
 * `PLAYER_COLLISION_RADIUS_M`.
 */
export interface NpcStepFacts {
  /** One row per ship kind, from `flightTableFrom`. */
  readonly flight?: readonly NpcFlightStats[];
  /** The Phase 12 compiled masses, the fallback of `massFor`. */
  readonly masses?: readonly ShipMass[];
}

/**
 * The Cobra Mk III player hull's collision radius in metres: the
 * `collisionRadius` of the `oolite_template_cobra3-player` row of the
 * generated hull table (the content build's value for the model). It is a compiled constant, not read from `CombatOptions.hulls`,
 * because that table is absent until the lazy hull file has loaded
 * (`../combat/step.ts`, `CombatOptions.hulls`): a radius read from it would make
 * ranges, flee and attack decisions, the player's proximity zone and every
 * steered hash depend on asset-load timing and break browser-versus-Node replay
 * parity. A test pins it to the compiled row.
 */
export const PLAYER_COLLISION_RADIUS_M = 72.69734954833984;

/** The fields of a compiled NPC record the flight table reads. */
export interface FlightRecord {
  readonly key: string;
  readonly maxFlightSpeed: number;
  readonly maxFlightRoll: number;
  readonly maxFlightPitch: number;
  readonly thrust: number;
  readonly mass: number;
  readonly forwardWeapon: string;
}

/**
 * The one builder of the flight table: compiled NPC records to a frozen list of
 * `NpcFlightStats` keyed by spec key. The test helper and the app both call it,
 * so there is one table shape. An unknown `forwardWeapon` becomes no weapon.
 */
export function flightTableFrom(
  records: readonly FlightRecord[],
): readonly NpcFlightStats[] {
  return Object.freeze(
    records.map((record) =>
      Object.freeze({
        specKey: record.key,
        maxFlightSpeed: record.maxFlightSpeed,
        maxFlightRoll: record.maxFlightRoll,
        maxFlightPitch: record.maxFlightPitch,
        thrust: record.thrust,
        mass: record.mass,
        forwardWeapon: isMountKey(record.forwardWeapon)
          ? record.forwardWeapon
          : NO_LASER,
      }),
    ),
  );
}

/**
 * The mass of `specKey` for the proximity rules: the flight row's mass when the
 * row exists and is usable, else the `facts.masses` row's mass, else 0. The second scan and
 * its finite-positive guard are a copy of `massOf` (`../world/ship-field.ts`,
 * T-12-10, module-private there), so a missing flight table does not silently
 * disable proximity alerts: mass 0 is below Oolite's 2,000 kg alert threshold.
 */
export function massFor(
  facts: NpcStepFacts | undefined,
  specKey: string,
): number {
  const flight = facts?.flight;
  if (flight !== undefined) {
    for (let i = 0; i < flight.length; i += 1) {
      const row = flight[i];
      if (row !== undefined && row.specKey === specKey) {
        // An unusable row is skipped, as `statsFor` skips it: the Phase 12
        // masses below answer instead of a number the steering must not read.
        if (isUsable(row)) return row.mass;
        break;
      }
    }
  }
  const masses = facts?.masses;
  if (masses === undefined) return 0;
  for (let i = 0; i < masses.length; i += 1) {
    const entry = masses[i];
    if (entry !== undefined && entry.specKey === specKey) {
      return Number.isFinite(entry.mass) && entry.mass > 0 ? entry.mass : 0;
    }
  }
  return 0;
}

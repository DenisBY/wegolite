// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ship kit of the initial populator (Phase 22, WORLD-08): the helpers
 * Oolite's `oolite-populator.js` and the engine apply to every ship they add,
 * ported as written.
 *
 * Script helpers (`Resources/Scripts/oolite-populator.js`):
 *
 * - `setWeapons` is `_setWeapons` (`:2217-2273`): one draw per call that
 *   passes the `auto_weapons` test, even for an integer level, and the aft
 *   mount is written as `EQ_WEAPON_NONE` at levels 1 and 2;
 * - `setSkill` is `_setSkill` (`:2276-2294`): accuracy moves toward 4.99 (or
 *   -5) `|bias|` times, then goes through the `setAccuracy:` clamp;
 * - `setFuel` and `setReturnFuel` are `_setFuel` and `_setReturnFuel`
 *   (`:2322-2345`) with the fuel property setter of `OOJSShip.m:1315-1320`
 *   (`lround(clamp(v, 0, 7) * 10)`, integer tenths of a light year);
 * - `weightedNearbyTradeSystem` is `_weightedNearbyTradeSystem`
 *   (`:2586-2635`).
 *
 * Engine pieces:
 *
 * - `pickPopulationRecord` is the `OOProbabilitySet` walk
 *   (`OOProbabilitySet.m:449-575`): a one-record set returns it with no draw,
 *   otherwise one draw scales the float32 cumulative weights and a binary
 *   search finds the leftmost record that reaches the target;
 * - `initialAccuracy` and `clampAccuracy` are `ShipEntity.m:658-676` and
 *   `:1126-1143`;
 * - `createPlannedShip` is `newShipWithRole:` plus the set-up draws of
 *   `setUpShipFromDictionary` (the injector roll, the initial accuracy and the
 *   trader bounty).
 *
 * The script constants `$weaponLevelBias` 0, `$skillLevelBias` 0 and
 * `$skillLevelMaximum` 4.99 (`:59`, `:71`, `:78`) are the values every fixture
 * header records; a test pins them to the fixture.
 *
 * The module is pure and total: no clock, no platform randomness, no
 * `Math.random`, no `Math.hypot`, no `for..in`. Role matching is `===` over
 * arrays, never an object keyed by a content string, so a role such as
 * `constructor` cannot reach a prototype lookup (T-22-11). No function reads a
 * record's missile counts (T-22-12, FIDELITY E-194).
 */

import { parseRoleToken } from "../populate.js";
import {
  MAX_ACCURACY,
  MAX_BOUNTY,
  MAX_SHIP_FUEL,
  MAX_SYSTEM_INDEX,
  MIN_ACCURACY,
} from "../limits.js";
import type { PlannedPopShip, PopulationRecord, ShipDraft } from "./groups.js";
import type { SystemFacts } from "./plan.js";
import type { PopulationDraws } from "./streams.js";

/** `$weaponLevelBias` (`oolite-populator.js:59`). */
export const WEAPON_LEVEL_BIAS = 0;
/** `$skillLevelBias` (`oolite-populator.js:71`). */
export const SKILL_LEVEL_BIAS = 0;
/** `$skillLevelMaximum` (`oolite-populator.js:78`). */
export const SKILL_LEVEL_MAXIMUM = 4.99;

/**
 * The medical ship test of `_addFreighter` (`oolite-populator.js:40`, `:1410`):
 * `new RegExp(expandDescription("[medical-word]"), "i")` with `medical-word`
 * `"medical"` (`descriptions.plist:2050`), matched against the ship's name.
 */
export const MEDICAL_PATTERN = /medical/i;

/** The most fuel a ship holds: `MAX_JUMP_RANGE`, 7 LY (`OOJSShip.m:1315-1320`). */
const MAX_FUEL_LY = 7;
/** The most iterations `setSkill` runs, so an absurd bias cannot spin the loop. */
const MAX_SKILL_STEPS = 64;

// --- Total reads of untrusted facts ----------------------------------------

/** A member of an untrusted value, or undefined. */
export function readField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** A number field; anything else reads as NaN. */
export function numberOf(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

/** A list field; anything else reads as an empty list. */
export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

/** A finite number, else `fallback`. */
function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** A galaxy-local system index (an integer `0..MAX_SYSTEM_INDEX`), else `fallback`. */
export function systemIndexOf(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_SYSTEM_INDEX
    ? value
    : fallback;
}

/** `bounty` as the entity holds it: an integer `0..MAX_BOUNTY`. */
export function boundedBounty(value: number): number {
  if (!(value > 0)) {
    return 0;
  }
  return Math.min(Math.trunc(value), MAX_BOUNTY);
}

// --- The record pick --------------------------------------------------------

interface Candidate<T> {
  readonly record: T;
  readonly weight: number;
}

/** The weight a record has for `role`: its first matching token, else 0. */
function weightFor(record: unknown, role: string): number {
  for (const token of listOf(readField(record, "roles"))) {
    if (typeof token !== "string") {
      continue;
    }
    const parsed = parseRoleToken(token);
    if (parsed !== undefined && parsed.role === role) {
      return parsed.weight;
    }
  }
  return 0;
}

/** The records with a positive weight for `role`, in the given order. */
function candidatesFor<T>(
  records: readonly T[],
  role: string,
): readonly Candidate<T>[] {
  const found: Candidate<T>[] = [];
  for (const record of records) {
    const weight = weightFor(record, role);
    if (weight > 0) {
      found.push({ record, weight });
    }
  }
  return found;
}

/**
 * `OOConcreteProbabilitySet privObjectForWeight:` over float32 cumulative
 * weights (`OOProbabilitySet.m:493-538`): a binary search for the leftmost
 * record whose cumulative weight reaches `draw * sum`, then a linear settle.
 */
function selectCandidate<T>(
  candidates: readonly Candidate<T>[],
  draw: number,
): T | undefined {
  const cumulative: number[] = [];
  let total = 0;
  for (const candidate of candidates) {
    total = Math.fround(total + Math.fround(candidate.weight));
    cumulative.push(total);
  }
  const target = Math.fround(Math.fround(draw) * total);
  const last = candidates.length - 1;
  let low = 0;
  let high = last;
  let index = 0;
  let weight = 0;
  while (low < high) {
    index = Math.floor((low + high) / 2);
    weight = cumulative[index] ?? 0;
    if (weight > target) {
      if (index === 0) {
        break;
      }
      high = index - 1;
    } else if (weight < target) {
      low = index + 1;
    } else {
      break;
    }
  }
  if (weight > target) {
    while (index > 0 && (cumulative[index - 1] ?? 0) >= target) {
      index -= 1;
    }
  } else {
    while (index < last && (cumulative[index] ?? 0) < target) {
      index += 1;
    }
  }
  return candidates[index]?.record;
}

/**
 * The record `OOProbabilitySet` picks for `role` from `records` (in the given
 * order), for the draw `draw` in `[0, 1)`. A role no record carries gives
 * undefined; a role one record carries gives that record whatever the draw
 * (Oolite takes no draw for a one-record set, so a caller draws only when
 * {@link pickForRole} says so). It is the same record as the frozen
 * `pickRecord` (`populate.ts`) gives for the same draw, apart from float32
 * rounding at a cumulative boundary.
 */
export function pickPopulationRecord<
  T extends { readonly roles: readonly string[] },
>(draw: number, records: readonly T[], role: string): T | undefined {
  const candidates = candidatesFor(records, role);
  if (candidates.length <= 1) {
    return candidates[0]?.record;
  }
  return selectCandidate(candidates, draw);
}

/**
 * The pick of one ship: no draw when the role has no record or one record,
 * else one draw on the `pick` stream, as the engine takes (`randomObject`).
 */
export function pickForRole<T extends { readonly roles: readonly string[] }>(
  draws: PopulationDraws,
  records: readonly T[],
  role: string,
): T | undefined {
  const candidates = candidatesFor(records, role);
  if (candidates.length <= 1) {
    return candidates[0]?.record;
  }
  return selectCandidate(candidates, draws.next("pick"));
}

// --- Accuracy ---------------------------------------------------------------

/**
 * `setAccuracy:` (`ShipEntity.m:1126-1143`) on the float32 property: a
 * negative missile accuracy becomes 0, then the range `-5..10`; the stored
 * value is the float32 one. NaN stays NaN (no draw reaches it).
 */
export function clampAccuracy(value: number, scanClass: string): number {
  let accuracy = value;
  if (accuracy < 0 && scanClass === "CLASS_MISSILE") {
    accuracy = 0;
  } else if (accuracy < MIN_ACCURACY) {
    accuracy = MIN_ACCURACY;
  } else if (accuracy > MAX_ACCURACY) {
    accuracy = MAX_ACCURACY;
  }
  return Math.fround(accuracy);
}

/**
 * The accuracy a new ship rolls when its record authors none
 * (`ShipEntity.m:658-676`): `randf() * 10 - 5`, made positive for police and
 * military pilots, written through the `setAccuracy:` clamp. No catalogue hull
 * authors an accuracy (plan 22-05), so the roll always happens.
 */
export function initialAccuracy(draw: number, scanClass: string): number {
  let accuracy = Math.fround(draw * 10 - 5);
  if (
    accuracy < 0 &&
    (scanClass === "CLASS_POLICE" || scanClass === "CLASS_MILITARY")
  ) {
    accuracy = -accuracy;
  }
  return clampAccuracy(accuracy, scanClass);
}

// --- Fuel -------------------------------------------------------------------

/**
 * The fuel property setter (`OOJSShip.m:1315-1320`): the value in light years
 * is clamped to `0..7` and stored as `lround(v * 10)` tenths. A non-finite
 * value holds nothing.
 */
export function fuelTenths(lightYears: number): number {
  if (!Number.isFinite(lightYears)) {
    return 0;
  }
  const clamped = Math.min(Math.max(lightYears, 0), MAX_FUEL_LY);
  return Math.floor(clamped * 10 + 0.5);
}

/**
 * `_setFuel` (`oolite-populator.js:2322-2332`): fuel `7 - distance` to the
 * ship's home system, or 7 at home. `distanceTo` is `0.4 * dist` of the
 * chart (`Neighbourhood.distanceTo`); an unknown home holds no fuel.
 */
export function setFuel(
  homeSystem: number,
  systemIndex: number,
  distanceTo: (systemIndex: number) => number | undefined,
): number {
  if (homeSystem === systemIndex) {
    return fuelTenths(MAX_FUEL_LY);
  }
  return fuelTenths(MAX_FUEL_LY - (distanceTo(homeSystem) ?? MAX_FUEL_LY));
}

/**
 * `_setReturnFuel` (`oolite-populator.js:2335-2345`): the same rule over the
 * destination system.
 */
export function setReturnFuel(
  destinationSystem: number,
  systemIndex: number,
  distanceTo: (systemIndex: number) => number | undefined,
): number {
  return setFuel(destinationSystem, systemIndex, distanceTo);
}

// --- Weapons and skill ------------------------------------------------------

/** The weapon mounts `setWeapons` writes; `null` is the record's own type. */
export interface WeaponMounts {
  fore: string | null;
  aft: string | null;
}

/**
 * `_setWeapons` (`oolite-populator.js:2217-2273`), the script's levels:
 * `<= 1` pulse laser, 2 beam laser, 3 beam and aft beam, 4 military and aft
 * beam, `>= 5` military both. A fractional level rounds up when
 * `level - floor(level) > draw` (strict), so the draw is taken once per call
 * that passes the `auto_weapons` test, even for an integer level. The aft
 * mount is written `EQ_WEAPON_NONE` at levels 1 and 2. A ship without
 * `auto_weapons` takes no draw and keeps its weapons. Side weapons are
 * unchanged. Returns whether the weapons were set.
 *
 * Ships whose forward weapon sits on a sub-entity are not modelled: no
 * catalogue hull has one.
 */
export function setWeapons(
  mounts: WeaponMounts,
  level: number,
  autoWeapons: boolean,
  draw: () => number,
): boolean {
  const biased = level + WEAPON_LEVEL_BIAS;
  if (!autoWeapons) {
    return false;
  }
  let choice = Math.floor(biased);
  if (biased - Math.floor(biased) > draw()) {
    choice += 1;
  }
  if (choice <= 1) {
    mounts.fore = "EQ_WEAPON_PULSE_LASER";
    mounts.aft = "EQ_WEAPON_NONE";
  } else if (choice === 2) {
    mounts.fore = "EQ_WEAPON_BEAM_LASER";
    mounts.aft = "EQ_WEAPON_NONE";
  } else if (choice === 3) {
    mounts.fore = "EQ_WEAPON_BEAM_LASER";
    mounts.aft = "EQ_WEAPON_BEAM_LASER";
  } else if (choice === 4) {
    mounts.fore = "EQ_WEAPON_MILITARY_LASER";
    mounts.aft = "EQ_WEAPON_BEAM_LASER";
  } else if (choice >= 5) {
    mounts.fore = "EQ_WEAPON_MILITARY_LASER";
    mounts.aft = "EQ_WEAPON_MILITARY_LASER";
  }
  return true;
}

/**
 * `_setSkill` (`oolite-populator.js:2276-2294`): when the ship has
 * `auto_weapons`, an accuracy below 5 and a non-zero bias, the accuracy moves
 * toward 4.99 (toward -5 for a negative bias) `|bias|` times by a fraction
 * `draw()` of the remaining distance, then is written through the
 * `setAccuracy:` clamp (float32). Otherwise it takes no draw and returns the
 * accuracy unchanged. A non-finite bias changes nothing and the steps are
 * capped at 64, so the loop is bounded.
 */
export function setSkill(
  accuracy: number,
  bias: number,
  autoWeapons: boolean,
  scanClass: string,
  draw: () => number,
): number {
  const biased = bias + SKILL_LEVEL_BIAS;
  if (
    !autoWeapons ||
    !(accuracy < 5) ||
    biased === 0 ||
    !Number.isFinite(biased)
  ) {
    return accuracy;
  }
  const target = biased < 0 ? MIN_ACCURACY : SKILL_LEVEL_MAXIMUM;
  let acc = accuracy;
  let steps = 0;
  for (let i = Math.abs(biased); i > 0 && steps < MAX_SKILL_STEPS; i -= 1) {
    acc += (target - acc) * draw();
    steps += 1;
  }
  return clampAccuracy(acc, scanClass);
}

// --- Trade systems ----------------------------------------------------------

/**
 * `_weightedNearbyTradeSystem` (`oolite-populator.js:2586-2635`): the local
 * system a trader comes from, weighted by how well its economy matches this
 * system's and discounted where either end is dangerous. One draw on the
 * `system` stream, taken even with no locals; the fallback is the first
 * local, else this system.
 */
export function weightedNearbyTradeSystem(
  facts: SystemFacts,
  draws: PopulationDraws,
): number {
  const locals = listOf(readField(facts.neighbourhood, "locals"));
  const economy = numberOf(facts.economy);
  const government = numberOf(facts.government);
  const weights: number[] = [];
  let total = 0;
  for (const local of locals) {
    const localEconomy = numberOf(readField(local, "economy"));
    const localGovernment = numberOf(readField(local, "government"));
    const ecomatch = -(economy - 3.5) * (localEconomy - 3.5);
    let trdanger = 0;
    if (localGovernment < 4) {
      trdanger = (4 - localGovernment) * 2.5;
    }
    if (government < 4) {
      trdanger += (4 - government) * 2.5;
    }
    // a good economic match: one every half hour if safe; else one every 2 hours
    const rate =
      ecomatch > 0 ? 60 / (30 + trdanger) : 60 / (120 + trdanger * 2);
    total += rate;
    weights.push(rate);
  }
  const fallback = systemIndexOf(facts.systemIndex, 0);
  let pick = 0;
  total *= draws.next("system");
  for (let i = 0; i < locals.length; i += 1) {
    pick += weights[i] ?? 0;
    if (pick >= total) {
      return systemIndexOf(readField(locals[i], "systemIndex"), fallback);
    }
  }
  const first = locals[0];
  if (first !== undefined) {
    return systemIndexOf(readField(first, "systemIndex"), fallback);
  }
  return fallback;
}

// --- A new ship -------------------------------------------------------------

/**
 * `newShipWithRole:` for the populator: pick the record for `role` (no draw
 * for zero or one record), then the set-up draws of the new ship, the
 * `has_fuel_injection` roll on the `injector` stream and the initial accuracy
 * on the `accuracy` stream. A trader whose record allows the auto AI starts
 * with bounty 0; every other ship keeps its record's bounty. The ship starts
 * at home in `systemIndex` with its record's weapons (`null` mounts) and no
 * cargo kind.
 *
 * Roles that roll a bounty at creation (`pirate`, Phase 22 plan 22-09) are
 * not modelled here. Returns undefined, with no further draw, when the role
 * has no record.
 */
export function createPlannedShip(
  role: string,
  records: readonly PopulationRecord[],
  systemIndex: number,
  draws: PopulationDraws,
): ShipDraft | undefined {
  const record = pickForRole(draws, records, role);
  if (record === undefined) {
    return undefined;
  }
  const injector = draws.next("injector") < numberOf(record.hasFuelInjection);
  const accuracy = initialAccuracy(draws.next("accuracy"), record.scanClass);
  const traderBounty = numberOf(record.autoAi) > 0 && role === "trader";
  return {
    record,
    recordKey: record.key,
    role,
    // `newShipWithRole:`: an interceptor is a police ship (`Universe.m:3652`).
    primaryRole: role === "interceptor" ? "police" : role,
    bounty: traderBounty ? 0 : boundedBounty(numberOf(record.bounty)),
    cargoKind: "unset",
    weaponTypes: { fore: null, aft: null, port: null, starboard: null },
    accuracy,
    fuel: Math.min(
      MAX_SHIP_FUEL,
      Math.max(0, Math.trunc(finiteOr(record.fuel, 0))),
    ),
    homeSystem: systemIndexOf(systemIndex, 0),
    destinationSystem: systemIndexOf(systemIndex, 0),
    injector,
    escortSlot: null,
    groupRecord: false,
    owner: null,
    groupLeader: null,
  };
}

/**
 * `_roleExists` (`oolite-populator.js:2162-2170`): whether the catalogue has a
 * record for the role (`Ship.keysForRole`). Dead with the shipped catalogue,
 * which carries every role the builders ask for; ported as written.
 */
export function roleExists(
  records: readonly PopulationRecord[],
  role: string,
): boolean {
  return pickPopulationRecord(0, records, role) !== undefined;
}

/**
 * `Neighbourhood.distanceTo` of untrusted facts as a total function: an
 * unknown system, or facts without the function, give no distance.
 */
export function chartDistance(
  facts: SystemFacts,
): (systemIndex: number) => number | undefined {
  const distanceTo = readField(facts.neighbourhood, "distanceTo");
  return (systemIndex) => {
    if (typeof distanceTo !== "function") {
      return undefined;
    }
    const distance = (distanceTo as (index: number) => unknown).call(
      facts.neighbourhood,
      systemIndex,
    );
    return typeof distance === "number" ? distance : undefined;
  };
}

/** The script's `ship.autoWeapons`: the compiled fuzzy boolean, tested `> 0`. */
export function autoWeaponsOf(record: PopulationRecord): boolean {
  return numberOf(record.autoWeapons) > 0;
}

/** `addGroup` accepts a count of 1 to 64 only (`OOJSSystem.m`, Pitfall 8). */
export const MIN_GROUP_SIZE = 1;
export const MAX_GROUP_SIZE = 64;

/**
 * The size an `addGroup` call is made with: an integer in `1..64`. Oolite throws
 * for a count outside that range; every in-scope size is far below it, so the
 * port clamps instead, which keeps each per-ship loop bounded for any fact
 * (T-22-13). NaN counts 1.
 */
export function clampGroupSize(value: number): number {
  if (Number.isNaN(value)) {
    return MIN_GROUP_SIZE;
  }
  return Math.min(Math.max(Math.trunc(value), MIN_GROUP_SIZE), MAX_GROUP_SIZE);
}

/**
 * `system.addGroup(role, size, pos, spread)` (`_addGroup`,
 * `oolite-populator.js:2390-2415`) for a lane position: `size` ships of the
 * role in one `ShipGroup` that has no leader, so each is a group-record holder
 * (D-11) with no leader link. Undefined, with no further draw, when no record
 * carries the role: the engine returns no group and the script's `if (!h)
 * return` ends the callback.
 */
export function addGroupShips(
  role: string,
  size: number,
  records: readonly PopulationRecord[],
  systemIndex: number,
  draws: PopulationDraws,
): readonly ShipDraft[] | undefined {
  const ships: ShipDraft[] = [];
  const count = clampGroupSize(size);
  for (let i = 0; i < count; i += 1) {
    const ship = createPlannedShip(role, records, systemIndex, draws);
    if (ship === undefined) {
      break;
    }
    ship.groupRecord = true;
    ships.push(ship);
  }
  return ships.length === 0 ? undefined : ships;
}

/** The finished ships of a group: indexes resolved, the draft links dropped. */
export function finishShips(
  drafts: readonly ShipDraft[],
): readonly PlannedPopShip[] {
  const indexOf = (ship: ShipDraft | null): number | null => {
    if (ship === null) {
      return null;
    }
    const at = drafts.indexOf(ship);
    return at < 0 ? null : at;
  };
  return drafts.map((draft) =>
    Object.freeze({
      recordKey: draft.recordKey,
      role: draft.role,
      primaryRole: draft.primaryRole,
      bounty: draft.bounty,
      cargoKind: draft.cargoKind,
      weaponTypes: Object.freeze({ ...draft.weaponTypes }),
      accuracy: draft.accuracy,
      fuel: draft.fuel,
      homeSystem: draft.homeSystem,
      destinationSystem: draft.destinationSystem,
      injector: draft.injector,
      leaderIndex: indexOf(draft.groupLeader),
      ownerIndex: indexOf(draft.owner),
      escortSlot: draft.escortSlot,
      groupRecord: draft.groupRecord,
    }),
  );
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The first populator: inert NPC ships of the six roles, placed at Oolite
 * location codes from the world stream (WORLD-15, the deterministic half of
 * WORLD-14).
 *
 * `populateInertWorld(world, layout, records)` is a pure function of the world
 * seed (through `world.rng`), the layout and the records, so an arrival, a
 * reload at the leg anchor and the Node replay build the same world.
 *
 * The table, `INERT_POPULATION`, is the planner's reading of Oolite's system
 * populator (research recommendations A1 and A2; counts and rates are out of
 * scope of the roadmap): 12 single ships, spread 0, no groups, no
 * repopulation. Shuttles and scavengers are not populator roles in Oolite (the
 * station launches them, StationEntity.m lines 830-834 and 1464-1502); they are
 * placed at STATION_AEGIS, the code closest to "launched from the station".
 * The Oolite-side roles and codes come from oolite-populator.js.
 *
 * Draw order per ship, as in Oolite's populator callback: the location, then
 * the ship pick, then the orientation. An entry whose role has no record with
 * a positive weight is skipped before any draw. Every ship spawns at tick 0
 * ("present at world creation"), so the world section does not depend on the
 * tick at which the world was rebuilt.
 *
 * Totality (rule (ii) of the world lifecycle: nothing may throw inside the
 * arrival's synchronous install block): a record whose scan class is outside
 * the closed `SCAN_CLASSES` vocabulary is dropped before planning, so it never
 * enters a weight sum and costs no draw; a `spawnEntity` refusal is skipped;
 * every rejection loop is capped (placement.ts).
 *
 * D-01: with no eligible records nothing is drawn, `world.rng` and the id
 * counter are untouched and the world still hashes as the flight hash. The app
 * calls this only with traffic on. D-02: ships are `ai: null` (Oolite's nullAI);
 * the records' `aiType` is ignored until the AI phases.
 *
 * Cargo (D-06, plan 15-03): each ship spawns with a cargo capsule count from
 * `cargoCountAtSpawn`. The count is drawn from a stateless stream forked per
 * spawn, `forkSeed(world.worldSeed, id, "cargo")`, never stored, so the draw
 * order of `world.rng` above is unchanged and so are the id counter and every
 * stored ai and combat stream: a world built from records with and without the
 * cargo fields differs only in each entity's `cargo`. Oolite draws `randf()`
 * and `Ranrot()` from its one global generator, so the counts are
 * statistically equal to Oolite's, not stream-equal.
 *
 * Role matching is by `===` over arrays only, never an object keyed by role
 * names, so a token such as `constructor` cannot reach a prototype lookup
 * (T-12-17).
 */

import type { Quat, Vec3 } from "../math.js";
import { createRngState, forkSeed, rngNext } from "../rng.js";
import type { RngState } from "../rng.js";
import type { SpawnInit } from "./entity.js";
import { SCAN_CLASSES } from "./ids.js";
import type { ScanClass } from "./ids.js";
import type { SystemLayout } from "./layout.js";
import { MAX_ENTITY_CARGO, MAX_UINT32 } from "./limits.js";
import { locationByCode, randomQuaternion } from "./placement.js";
import type { LocationCode } from "./placement.js";
import { spawnEntity } from "./world.js";
import type { World } from "./world.js";

/**
 * One NPC ship as the populator needs it. `scanClass` stays a content-shaped
 * string on purpose: the catalogue schema only pattern-checks it, and the app
 * builds these records in `src/app`, which may not import the id module. The
 * narrowing to `ScanClass` happens here, in `isScanClass`.
 */
export interface InertShipRecord {
  readonly key: string;
  readonly roles: readonly string[];
  readonly scanClass: string;
  readonly radius: number;
  /** The energy bank the ship spawns with (CBT-07): its record's `max_energy`. */
  readonly maxEnergy: number;
  /** The record's `energy_recharge_rate`. */
  readonly energyRechargeRate: number;
  /** The record's `likely_cargo` (DATA-14); absent means 0. */
  readonly likelyCargo?: number;
  /** The record's `max_cargo` (DATA-14); absent means 0. */
  readonly maxCargo?: number;
}

/** The six roles of the first populator. */
export const POPULATOR_ROLES = [
  "trader",
  "pirate",
  "hunter",
  "police",
  "shuttle",
  "scavenger",
] as const;
export type PopulatorRole = (typeof POPULATOR_ROLES)[number];

interface PopulationEntry {
  readonly role: PopulatorRole;
  readonly location: LocationCode;
  readonly count: number;
}

/**
 * The population table, in placement order: 12 single ships (traders 3,
 * pirates 3, hunters 2, police 2, shuttle 1, scavenger 1). Changing it
 * re-pins tests/golden/world/inert-lave-epoch1.json.
 */
export const INERT_POPULATION: readonly PopulationEntry[] = Object.freeze([
  Object.freeze({ role: "trader", location: "LANE_WP", count: 2 }),
  Object.freeze({ role: "trader", location: "STATION_AEGIS", count: 1 }),
  Object.freeze({ role: "hunter", location: "LANE_WPS", count: 2 }),
  Object.freeze({ role: "pirate", location: "LANE_WP", count: 1 }),
  Object.freeze({ role: "pirate", location: "LANE_PS", count: 1 }),
  Object.freeze({ role: "pirate", location: "LANE_WS", count: 1 }),
  Object.freeze({ role: "police", location: "LANE_WPS", count: 1 }),
  Object.freeze({ role: "police", location: "STATION_AEGIS", count: 1 }),
  Object.freeze({ role: "shuttle", location: "STATION_AEGIS", count: 1 }),
  Object.freeze({ role: "scavenger", location: "STATION_AEGIS", count: 1 }),
]);

/**
 * Whether `value` names a member of the closed scan-class vocabulary. An `===`
 * comparison over the tuple: no object lookup, so "constructor" is false.
 */
export function isScanClass(value: string): value is ScanClass {
  return SCAN_CLASSES.some((name) => name === value);
}

/**
 * Parse one role token as `OOParseRolesFromString` does (OORoleSet.m lines
 * 286-313): `name` (weight 1) or `name(p)`. A `p` that is not a finite
 * non-negative number gives weight 0, so the role never selects the record.
 * An empty name or a shipKey-style `[name]` token is malformed: undefined.
 */
export function parseRoleToken(
  token: string,
): { readonly role: string; readonly weight: number } | undefined {
  const open = token.indexOf("(");
  const role = open < 0 ? token : token.slice(0, open);
  if (role === "" || role.startsWith("[")) return undefined;
  if (open < 0) return { role, weight: 1 };
  const close = token.indexOf(")", open);
  const text = close < 0 ? token.slice(open + 1) : token.slice(open + 1, close);
  const weight = Number(text);
  return {
    role,
    weight: Number.isFinite(weight) && weight > 0 ? weight : 0,
  };
}

/** The weight `record` has for `role`: its first matching token, else 0. */
function roleWeight(
  record: { readonly roles: readonly string[] },
  role: string,
) {
  for (const token of record.roles) {
    const parsed = parseRoleToken(token);
    if (parsed !== undefined && parsed.role === role) return parsed.weight;
  }
  return 0;
}

/** The sum of the weights of `records` for `role`, in catalogue order. */
function totalWeight(
  records: readonly { readonly roles: readonly string[] }[],
  role: string,
): number {
  let total = 0;
  for (const record of records) total += roleWeight(record, role);
  return total;
}

/**
 * The weighted pick of `OOProbabilitySet` (OOProbabilitySet.m lines 525-575):
 * one draw times the weight sum, then the first record in catalogue order
 * whose cumulative weight exceeds it. A zero-weight record is never returned.
 * Returns undefined, with no draw, when the weights sum to nothing positive.
 */
export function pickRecord<T extends { readonly roles: readonly string[] }>(
  rng: RngState,
  records: readonly T[],
  role: string,
): T | undefined {
  const total = totalWeight(records, role);
  if (!(total > 0)) return undefined;
  const target = rngNext(rng) * total;
  let chosen: T | undefined;
  let cumulative = 0;
  for (const record of records) {
    const weight = roleWeight(record, role);
    if (weight <= 0) continue;
    cumulative += weight;
    chosen = record;
    if (cumulative > target) break;
  }
  return chosen;
}

/** A record whose scan class has passed `isScanClass`. */
type EligibleRecord = InertShipRecord & { readonly scanClass: ScanClass };

/** One planned ship: everything `spawnEntity` needs, already narrowed. */
export interface PlannedShip {
  readonly role: PopulatorRole;
  readonly location: LocationCode;
  readonly key: string;
  readonly scanClass: ScanClass;
  readonly radius: number;
  readonly maxEnergy: number;
  readonly energyRechargeRate: number;
  readonly likelyCargo: number;
  readonly maxCargo: number;
  readonly position: Vec3;
  readonly orientation: Quat;
}

/**
 * Plan the population from `rng` alone (no world touched). Its first step,
 * before any draw, keeps only the eligible records, so a record with an
 * unknown scan class never enters a weight sum. Per table entry and per count:
 * skip without drawing when the role has no positive-weight eligible record,
 * else location, then pick, then orientation. `fallbacks` counts the placements
 * where a rejection loop hit its cap.
 */
export function planInertPopulation(
  rng: RngState,
  layout: SystemLayout,
  records: readonly InertShipRecord[],
): { readonly ships: readonly PlannedShip[]; readonly fallbacks: number } {
  const eligible = records.filter((record): record is EligibleRecord =>
    isScanClass(record.scanClass),
  );
  const ships: PlannedShip[] = [];
  let fallbacks = 0;
  for (const entry of INERT_POPULATION) {
    if (!(totalWeight(eligible, entry.role) > 0)) continue;
    for (let i = 0; i < entry.count; i++) {
      const place = locationByCode(rng, entry.location, layout);
      if (place.fallback) fallbacks += 1;
      const record = pickRecord(rng, eligible, entry.role);
      const orientation = randomQuaternion(rng);
      if (record === undefined) continue;
      ships.push({
        role: entry.role,
        location: entry.location,
        key: record.key,
        scanClass: record.scanClass,
        radius: record.radius,
        maxEnergy: record.maxEnergy,
        energyRechargeRate: record.energyRechargeRate,
        likelyCargo: record.likelyCargo ?? 0,
        maxCargo: record.maxCargo ?? 0,
        position: place.position,
        orientation,
      });
    }
  }
  return { ships, fallbacks };
}

/** A count input as Oolite's `oo_unsignedIntForKey` yields it: a safe integer >= 0, else 0. */
function countInput(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * The cargo capsule count of one ship at spawn: a port of Oolite's
 * `setCargoFlag:` counting rule (`ShipEntity.m:7323-7373`) for the cargo type
 * the live populator, `oolite-populator.js`, gives each role.
 *
 * - trader: `setCargoType(goods)` with `PLENTIFUL_GOODS` or `SCARCE_GOODS`
 *   (`oolite-populator.js:1448`, `1492-1522`), so the full count `num`.
 * - shuttle: `CARGO_FLAG_FULL_SCARCE` (`StationEntity.m:1629`), the full count.
 * - pirate: `PIRATE_GOODS` (`CARGO_FLAG_PIRATE`), a Ranrot fraction
 *   `Ranrot() % (1 + num / 2)` of `num`. Oolite sets it only when the group is
 *   not placed at a station or planet (`:1711-1713`, `:1862-1865`); that always
 *   holds here, because `INERT_POPULATION` puts every pirate on a lane, never at
 *   a station or planet entity.
 * - hunter, police, scavenger: no cargo type is set, so 0 and no draw.
 *
 * Oolite's opportunist-trader branch (5 % of traders get a bounty and half of
 * those switch to the opportunist AI with `PIRATE_GOODS`, `:1418-1431`) is not
 * modelled: no Wegolite trader has a bounty or a switched AI.
 *
 * `num` is `likelyCargo * (0.5 + randf())` truncated and capped at the
 * capacity when `likelyCargo > 0`, else the capacity; then capped at 200
 * (`MAX_ENTITY_CARGO`). The capacity is `maxCargo`. Oolite's
 * `maxAvailableCargoSpace` is `max_cargo - equipment_weight`
 * (`ShipEntity.m:7198-7201`); the weight is 0 for the nine stock ships, so a
 * later equipment phase must revisit the capacity line below.
 *
 * Total: an input that is not a safe integer >= 0 counts as 0, an unknown role
 * returns 0 without a draw, and it never throws. The result is an integer in
 * `0..MAX_ENTITY_CARGO`.
 */
export function cargoCountAtSpawn(
  role: PopulatorRole,
  likelyCargo: number,
  maxCargo: number,
  rng: RngState,
): number {
  if (role !== "trader" && role !== "shuttle" && role !== "pirate") return 0;
  const likely = countInput(likelyCargo);
  // equipment_weight is 0 for the nine stock ships (ShipEntity.m:7198-7201).
  const capacity = countInput(maxCargo);
  let num = capacity;
  if (likely > 0) {
    num = Math.min(Math.floor(likely * (0.5 + rngNext(rng))), capacity);
  }
  num = Math.min(num, MAX_ENTITY_CARGO);
  if (role !== "pirate") return num;
  if (num === 0) return 0;
  return Math.floor(rngNext(rng) * (1 + Math.floor(num / 2)));
}

/**
 * Populate `world` with the inert ships of `INERT_POPULATION` and return how
 * many spawned. Draws only from `world.rng` (plus the stateless per-spawn
 * cargo stream, which is stored nowhere); a `spawnEntity` refusal is skipped,
 * so the call is total.
 *
 * The `?test=1` hooks (`spawnTestShooter`, `spawnTestFlyers`) spawn with cargo
 * 0. A later phase that needs a hook-spawned ship with cargo passes
 * `SpawnInit.cargo` itself.
 */
export function populateInertWorld(
  world: World,
  layout: SystemLayout,
  records: readonly InertShipRecord[],
): number {
  const plan = planInertPopulation(world.rng, layout, records);
  let spawned = 0;
  for (const ship of plan.ships) {
    // The id this ship is about to get. spawnEntity refuses `idExhausted` past
    // MAX_UINT32 and forkSeed would throw there, so an out-of-range id counts 0.
    const id = world.store.nextId;
    const cargo =
      Number.isSafeInteger(id) && id >= 0 && id <= MAX_UINT32
        ? cargoCountAtSpawn(
            ship.role,
            ship.likelyCargo,
            ship.maxCargo,
            createRngState(forkSeed(world.worldSeed, id, "cargo")),
          )
        : 0;
    const init: SpawnInit = {
      kind: "ship",
      specKey: ship.key,
      scanClass: ship.scanClass,
      position: ship.position,
      orientation: ship.orientation,
      radius: ship.radius,
      speed: 0,
      ai: null,
      maxEnergy: ship.maxEnergy,
      energyRechargeRate: ship.energyRechargeRate,
      cargo,
    };
    if (spawnEntity(world, init, 0).ok) spawned += 1;
  }
  return spawned;
}

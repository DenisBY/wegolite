// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The spawn half of the initial populator (Phase 22, WORLD-08): turn the planned
 * groups of one system into inert ships in a world.
 *
 * {@link populateSystemWorld} plans the system (`planSystemGroups` with the
 * production draws, `populationDraws` and `countDrawSource` of `streams.ts`) and
 * spawns the plan; {@link spawnPlannedGroups} spawns plans it is given.
 *
 * Placement follows Oolite (D-01, D-03). Each group's centre is one
 * `locationByCode` sample (`Universe.m:1783-1815`; no launch, no exclusion zone
 * beyond Oolite's own, no planet location) from the group's own `location`
 * stream; a remote pirate pack's centre z is `remotePackZ(z)`. Every ship but an
 * escort is scattered `randomSpatial(spread)` around the centre
 * (`Universe.m:2608-2692`, `addShipAt:`; spread 0 still takes the sampler's
 * draws) and given `randomQuaternion` (`scatter` and `orient` streams). An
 * escort sits at `escortCoordinates` of its mother's pose, the formation slot,
 * plus the per-axis jitter `escort radius * 6 * (u - 0.5)` of
 * `ShipEntity.m:1690-1705` (`scatter` stream), with the identity orientation
 * `newShipWithRole:` leaves it (`Entity.m:72`).
 *
 * Pitfall C4: every draw of a group (location, scatter, orientation, cargo
 * count) comes from that group's own stream, `populationStream(worldSeed,
 * ordinal, groupIndex, tag)`, never from an entity-id fork and never from
 * `world.rng`. Adding a group, or skipping one, therefore moves no other
 * group's ships in position, orientation or kit (ids aside, which are the
 * store's counter). The populator takes no draw from `world.rng` at all.
 *
 * D-05: a group spawns whole or not at all. Its full size counts against
 * `entityLimit - liveEntityCount(world)` and, for the records it creates,
 * against `MAX_WORLD_GROUPS`; a group that does not fit is skipped and the
 * next one is tried, in engine order. A group `spawnEntity` would refuse in part
 * is found by trial-spawning its inits into a scratch world first (the
 * `spawnTestAnarchy` pattern), so no partial group ever enters the world.
 *
 * D-11: the leader spawns first and its id is the group id. `World.groups`
 * gains `{ id, leader }` for each group a ship carries a record for
 * (`PlannedPopShip.groupRecord`): a leader-linked group (a freighter and its
 * escorts, a pirate pack) takes its leader's id; a leaderless `addGroup` group
 * (hunters, independent pirates, police, interceptors) takes its first ship, the
 * founding member, as both id and leader. Followers and escorts carry
 * `groupId` = that id; an escort carries `ownerId` = its mother's id and its
 * slot. The records stay strictly ascending.
 *
 * Every ship is inert (`ai: null`) and carries its kit: bounty, primary role,
 * cargo count and kind together (the folded pod-kind todo, spawn half), fuel,
 * home and destination system, injector, weapon types and, written after
 * `spawnEntity`, `steer.accuracy`. No ship carries a missile (T-22-14, a cut).
 *
 * Total (T-22-15, T-22-16): never throws for any facts, records or world; every
 * rejection loop is capped by `MAX_PLACEMENT_TRIES`; a plan the world cannot
 * take is skipped whole.
 */

import { add, identity, vec } from "../../math.js";
import type { Quat, Vec3 } from "../../math.js";
import { rngNext } from "../../rng.js";
import type { RngState } from "../../rng.js";
import { escortCoordinates } from "../../npc/escort.js";
import { CARGO_KINDS } from "../entity.js";
import type { CargoKindName, SpawnInit } from "../entity.js";
import { NO_ENTITY, MAX_ENTITIES } from "../ids.js";
import type { SystemLayout } from "../layout.js";
import {
  MAX_ENTITY_CARGO,
  MAX_UINT32,
  MAX_WORLD_GROUPS,
  POPULATION_ENTITY_LIMIT,
} from "../limits.js";
import {
  locationByCode,
  randomQuaternion,
  randomSpatial,
} from "../placement.js";
import type { LocationCode } from "../placement.js";
import { isScanClass } from "../populate.js";
import { createWorld, liveEntityCount, spawnEntity } from "../world.js";
import type { World } from "../world.js";
import { planSystemGroups } from "./groups.js";
import type { GroupPlan, PlannedPopShip, PopulationRecord } from "./groups.js";
import { remotePackZ } from "./pirates.js";
import type { SystemFacts } from "./plan.js";
import { POPULATOR_ENTRIES } from "./table.js";
import {
  countDrawSource,
  populationDraws,
  populationStream,
} from "./streams.js";

/** What a spawn call did. */
export interface PopulateSystemResult {
  /** Groups whose ships all entered the world. */
  readonly spawnedGroups: number;
  /**
   * Groups left out: one that did not fit the entity limit, the group bound or
   * the id counter, one the world would refuse in part, one at a location the
   * port does not place, and one with no ships (a role the catalogue lacks).
   */
  readonly skippedGroups: number;
  /** Ships spawned. */
  readonly entities: number;
  /** Group records added to `World.groups`. */
  readonly groupRecords: number;
  /** Placement samples that took a rejection loop's fallback (spawned groups). */
  readonly fallbacks: number;
}

export interface PopulateOptions {
  /**
   * The most live entities the populated world may hold; default
   * `POPULATION_ENTITY_LIMIT` (the store's cap less the measured debris
   * reserve, D-06). Values above `MAX_ENTITIES` count as `MAX_ENTITIES`, as the
   * store cannot hold more.
   */
  readonly entityLimit?: number;
  /** The spawn tick of every ship; default 0 ("present at world creation"). */
  readonly tick?: number;
}

/** The largest group index a stream can key (`streams.ts`). */
const MAX_GROUP_INDEX = 0xfffffffe;

/** `addGroup` and `addShips` spreads of the script, in metres. */
const SPREAD_LIGHT_HUNTERS = 2_000;
const SPREAD_INDEPENDENT_PIRATES = 2_500;
const SPREAD_PIRATE_ASSISTANTS = 4_000;
const SPREAD_POLICE = 2_000;
const SPREAD_INTERCEPTORS = 2_000;

/**
 * The `spread` the script passes for a ship of the entry's builder
 * (`oolite-populator.js:1385`, `1459-1537` single traders: 0; `:1580` hunters
 * 2E3; `:1706` independent pirates 2.5E3; `:1800` pack leaders 0, `:1741` pack
 * assistants 4E3; `:2059` police 2E3; `:2086` the station patrol 0; `:2105`
 * interceptors 2E3). A pack's escorts are not scattered, they are placed in
 * formation.
 */
function spreadOf(plan: GroupPlan, index: number): number {
  const builder = POPULATOR_ENTRIES[plan.ordinal]?.builder ?? null;
  switch (builder) {
    case "lightHunter":
      return SPREAD_LIGHT_HUNTERS;
    case "independentPirate":
      return SPREAD_INDEPENDENT_PIRATES;
    case "policePatrol":
      return SPREAD_POLICE;
    case "interceptors":
      return SPREAD_INTERCEPTORS;
    case "lightPirateLocal":
    case "lightPirateRemote":
    case "mediumPirateLocal":
    case "mediumPirateRemote":
    case "heavyPirateLocal":
    case "heavyPirateRemote":
      return index === 0 ? 0 : SPREAD_PIRATE_ASSISTANTS;
    case "freighter":
    case "courierShort":
    case "courierLong":
    case "smuggler":
    case "stationPatrol":
    case null:
      return 0;
  }
}

/** A count input as Oolite's `oo_unsignedIntForKey` yields it: a safe integer >= 0, else 0. */
function countInput(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * The cargo capsule count of one ship at spawn for its final cargo kind: the
 * count rule of `setCargoFlag:` (`ShipEntity.m:7323-7375`). A kind-keyed
 * sibling of the frozen inert `cargoCountAtSpawn`, which keys on the populator
 * role instead.
 *
 * - `unset`: no cargo, no draw.
 * - Every other kind: `num` is `likelyCargo * (0.5 + randf())` truncated and
 *   capped at the capacity `maxCargo` when `likelyCargo > 0` (one draw), else
 *   the capacity; then capped at 200 (`MAX_ENTITY_CARGO`).
 * - `pirate` (`CARGO_FLAG_PIRATE`): a Ranrot fraction `Ranrot() % (1 + num / 2)`
 *   of `num` (a second draw, none when `num` is 0).
 *
 * `maxAvailableCargoSpace` is `max_cargo - equipment_weight`; the weight is 0 for
 * the shipped catalogue, so the capacity is `maxCargo` (as in the inert path).
 * Total: an input that is not a safe integer >= 0 counts as 0; the result is an
 * integer in `0..MAX_ENTITY_CARGO`.
 */
export function cargoCountForKind(
  kind: CargoKindName,
  record: Pick<PopulationRecord, "likelyCargo" | "maxCargo">,
  rng: RngState,
): number {
  if (kind === "unset") return 0;
  const likely = countInput(record.likelyCargo);
  const capacity = countInput(record.maxCargo);
  let num = capacity;
  if (likely > 0) {
    num = Math.min(Math.floor(likely * (0.5 + rngNext(rng))), capacity);
  }
  num = Math.min(num, MAX_ENTITY_CARGO);
  if (kind !== "pirate") return num;
  if (num === 0) return 0;
  return Math.floor(rngNext(rng) * (1 + Math.floor(num / 2)));
}

/** One ship of a group, ready for `spawnEntity`, with the accuracy written after it. */
interface ShipSpawn {
  readonly init: SpawnInit;
  readonly accuracy: number;
}

/** A group's built spawn: its ships and the group records it creates. */
interface GroupSpawn {
  readonly ships: readonly ShipSpawn[];
  /** Offsets from the first ship's id of each new group record's leader, ascending. */
  readonly recordLeaders: readonly number[];
  readonly fallbacks: number;
}

/** The placement of the code, or undefined for a code the port never places. */
function isPlaceable(code: string): code is LocationCode {
  return (
    code === "LANE_WP" ||
    code === "LANE_WS" ||
    code === "LANE_PS" ||
    code === "LANE_WPS" ||
    code === "STATION_AEGIS" ||
    code === "WITCHPOINT"
  );
}

/** The ship index whose id is the group id of ship `index`, or -1 for no group. */
function groupKeyOf(
  ships: readonly PlannedPopShip[],
  index: number,
  firstLeaderless: number,
): number {
  const ship = ships[index];
  if (ship === undefined || !ship.groupRecord) return -1;
  const link = ship.leaderIndex;
  if (link === null) return firstLeaderless;
  if (!Number.isInteger(link) || link < 0 || link > index) return -1;
  return ships[link]?.groupRecord === true ? link : -1;
}

/**
 * Build the inits of one group: the draws, the poses and the kit. Undefined when
 * the plan cannot be built (no ships, an unplaced location, a record the plan
 * names but the catalogue lacks or an unknown scan class). Pure in the world: it
 * reads only `firstId`, the id the first ship will get.
 */
function buildGroupSpawn(
  worldSeed: number,
  layout: SystemLayout,
  plan: GroupPlan,
  byKey: ReadonlyMap<string, PopulationRecord>,
  firstId: number,
): GroupSpawn | undefined {
  const { ships } = plan;
  if (ships.length === 0 || !isPlaceable(plan.location)) return undefined;
  if (
    !Number.isSafeInteger(plan.ordinal) ||
    plan.ordinal < 0 ||
    plan.ordinal > MAX_UINT32 ||
    !Number.isSafeInteger(plan.groupIndex) ||
    plan.groupIndex < 0 ||
    plan.groupIndex > MAX_GROUP_INDEX
  ) {
    return undefined;
  }
  const records: PopulationRecord[] = [];
  for (const ship of ships) {
    const record = byKey.get(ship.recordKey);
    if (record === undefined || !isScanClass(record.scanClass)) {
      return undefined;
    }
    records.push(record);
  }
  const { ordinal, groupIndex } = plan;
  const stream = (tag: "location" | "scatter" | "orient" | "cargo"): RngState =>
    populationStream(worldSeed, ordinal, groupIndex, tag);
  const location = stream("location");
  const scatter = stream("scatter");
  const orient = stream("orient");
  const cargoStream = stream("cargo");

  const sample = locationByCode(location, plan.location, layout);
  let fallbacks = sample.fallback ? 1 : 0;
  const centre: Vec3 = plan.remotePack
    ? vec(sample.position.x, sample.position.y, remotePackZ(sample.position.z))
    : sample.position;

  let firstLeaderless = -1;
  for (let i = 0; i < ships.length; i += 1) {
    if (ships[i]?.groupRecord === true && ships[i]?.leaderIndex === null) {
      firstLeaderless = i;
      break;
    }
  }

  const positions: Vec3[] = [];
  const orientations: Quat[] = [];
  const spawns: ShipSpawn[] = [];
  const recordLeaders: number[] = [];
  for (let i = 0; i < ships.length; i += 1) {
    const ship = ships[i] as PlannedPopShip;
    const record = records[i] as PopulationRecord;
    const owner = ship.ownerIndex;
    const mother =
      ship.escortSlot !== null &&
      owner !== null &&
      Number.isInteger(owner) &&
      owner >= 0 &&
      owner < i
        ? owner
        : -1;

    let position: Vec3;
    let orientation: Quat;
    if (mother >= 0) {
      const motherRecord = records[mother] as PopulationRecord;
      const slot = ship.escortSlot ?? 0;
      const formation = escortCoordinates(
        {
          position: positions[mother] as Vec3,
          orientation: orientations[mother] as Quat,
        },
        motherRecord.radius,
        slot,
      );
      // `setUpOneEscort:` (`ShipEntity.m:1690-1705`): per axis, the escort's own
      // collision radius times 6 (12 above `MAX_ESCORTS`) times `randf() - 0.5`.
      const reach = record.radius * (slot < 16 ? 6 : 12);
      const jx = reach * (rngNext(scatter) - 0.5);
      const jy = reach * (rngNext(scatter) - 0.5);
      const jz = reach * (rngNext(scatter) - 0.5);
      position = add(formation, vec(jx, jy, jz));
      orientation = identity();
    } else {
      const offset = randomSpatial(scatter, spreadOf(plan, i));
      if (offset.fallback) fallbacks += 1;
      position = add(centre, offset.position);
      orientation = randomQuaternion(orient);
    }
    positions.push(position);
    orientations.push(orientation);

    const key = groupKeyOf(ships, i, firstLeaderless);
    if (key === i) recordLeaders.push(i);
    const cargo = cargoCountForKind(ship.cargoKind, record, cargoStream);
    // Cargo and its kind are named together in every init (the pod-kind guard).
    const init: SpawnInit = {
      kind: "ship",
      specKey: record.key,
      scanClass: record.scanClass as SpawnInit["scanClass"],
      position,
      orientation,
      radius: record.radius,
      speed: 0,
      ai: null,
      maxEnergy: record.maxEnergy,
      energyRechargeRate: record.energyRechargeRate,
      escortSlot: ship.escortSlot ?? 0,
      ownerId: mother >= 0 ? firstId + mother : NO_ENTITY,
      groupId: key >= 0 ? firstId + key : NO_ENTITY,
      bounty: ship.bounty,
      role: ship.primaryRole,
      cargo,
      // An unknown kind is -1 on purpose: `spawnEntity` refuses it as out of
      // domain, so `trialSpawns` skips the group (counted in `skippedGroups`)
      // instead of the kind being masked as `unset` (IN-04 of the review).
      cargoKind: CARGO_KINDS.indexOf(ship.cargoKind),
      fuel: ship.fuel,
      homeSystem: ship.homeSystem,
      destinationSystem: ship.destinationSystem,
      injector: ship.injector ? { accumulator: 1 } : null,
      weaponTypes: { ...ship.weaponTypes },
    };
    spawns.push({ init, accuracy: ship.accuracy });
  }
  return { ships: spawns, recordLeaders, fallbacks };
}

/** Whether `world` takes every init of the group (the scratch world's own rules). */
function trialSpawns(spawns: readonly ShipSpawn[], tick: number): boolean {
  const scratch = createWorld(0);
  for (const { init } of spawns) {
    if (!spawnEntity(scratch, init, tick).ok) return false;
  }
  return true;
}

/** Insert a group record keeping `world.groups` strictly ascending by id. */
function insertGroupRecord(world: World, id: number, leader: number): void {
  let at = world.groups.length;
  while (at > 0 && (world.groups[at - 1]?.id ?? 0) > id) at -= 1;
  world.groups.splice(at, 0, { id, leader });
}

/**
 * Spawn the planned groups into `world`, in the order given (engine order for a
 * `planSystemGroups` result). See the module comment for the rules; the
 * result counts what happened.
 */
export function spawnPlannedGroups(
  world: World,
  layout: SystemLayout,
  plans: readonly GroupPlan[],
  records: readonly PopulationRecord[],
  options: PopulateOptions = {},
): PopulateSystemResult {
  const limit = Math.min(
    options.entityLimit ?? POPULATION_ENTITY_LIMIT,
    MAX_ENTITIES,
  );
  const tick = options.tick ?? 0;
  const byKey = new Map<string, PopulationRecord>();
  for (const record of records) {
    if (!byKey.has(record.key)) byKey.set(record.key, record);
  }
  let spawnedGroups = 0;
  let skippedGroups = 0;
  let entities = 0;
  let groupRecords = 0;
  let fallbacks = 0;

  for (const plan of plans) {
    const size = plan.ships.length;
    const firstId = world.store.nextId;
    const fits =
      size > 0 &&
      Number.isSafeInteger(firstId) &&
      firstId + size - 1 <= MAX_UINT32 &&
      size <= limit - liveEntityCount(world);
    const built = fits
      ? buildGroupSpawn(world.worldSeed, layout, plan, byKey, firstId)
      : undefined;
    if (
      built === undefined ||
      world.groups.length + built.recordLeaders.length > MAX_WORLD_GROUPS ||
      built.recordLeaders.some((offset) =>
        world.groups.some((group) => group.id === firstId + offset),
      ) ||
      !trialSpawns(built.ships, tick)
    ) {
      skippedGroups += 1;
      continue;
    }

    const spawnedIds: number[] = [];
    let refused = false;
    for (const { init, accuracy } of built.ships) {
      const result = spawnEntity(world, init, tick);
      if (!result.ok) {
        refused = true;
        break;
      }
      result.entity.steer.accuracy = accuracy;
      spawnedIds.push(result.entity.id);
    }
    if (refused) {
      // Unreachable after the trial spawn; never leave a partial group.
      for (const id of spawnedIds) world.store.kill(id);
      skippedGroups += 1;
      continue;
    }
    for (const offset of built.recordLeaders) {
      insertGroupRecord(world, firstId + offset, firstId + offset);
    }
    spawnedGroups += 1;
    entities += size;
    groupRecords += built.recordLeaders.length;
    fallbacks += built.fallbacks;
  }
  return Object.freeze({
    spawnedGroups,
    skippedGroups,
    entities,
    groupRecords,
    fallbacks,
  });
}

/**
 * Populate `world` with the initial population of the system `facts` describe:
 * plan every group with the production draws (each entry and group on its own
 * forked streams of the world seed) and spawn them. A pure function of the world
 * seed, the layout, the facts and the records, so the same arrival builds the
 * same world (equal `hashWorld`).
 */
export function populateSystemWorld(
  world: World,
  layout: SystemLayout,
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  options: PopulateOptions = {},
): PopulateSystemResult {
  const plans = planSystemGroups(facts, records, {
    counts: countDrawSource(world.worldSeed),
    group: (ordinal, groupIndex) =>
      populationDraws(world.worldSeed, ordinal, groupIndex),
  });
  return spawnPlannedGroups(world, layout, plans, records, options);
}

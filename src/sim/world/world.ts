// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world: five static entities, the dynamic store and the world stream
 * (FOUND-11, D-04, D-06, D-07, D-08).
 *
 * The player (id 100) is not stored here: `FlightState` stays its only
 * authority and is passed in per call. Static entities are references into
 * `SystemLayout` and never enter the dynamic store or the world hash.
 *
 * Per-world id scope (CONTEXT D-06 as amended 2026-11-12): `createWorld`
 * always starts its store at `FIRST_DYNAMIC_ID`, so every new world restarts
 * dynamic ids at 101, and within one world an id is never reused. The module
 * declares no module-level mutable binding, so no counter can carry ids from
 * one world into the next.
 */

import type { AiComponent, AiEvent, ParamValue } from "../ai/types.js";
import { AI_EVENT_NAMES, AI_KEYS } from "../ai/types.js";
import type { Quat, Vec3 } from "../math.js";
import { createRngState, forkSeed } from "../rng.js";
import type { RngState } from "../rng.js";
import { CARGO_KINDS } from "./entity.js";
import type {
  BuoyState,
  BuoyStates,
  Entity,
  SpawnInit,
  StaticEntity,
  StaticHealth,
} from "./entity.js";
import { createSteerComponent } from "../npc/state.js";
import {
  ENTITY_KINDS,
  FIRST_DYNAMIC_ID,
  MAIN_STATION_ID,
  MAX_ENTITIES,
  NO_ENTITY,
  PLANET_ID,
  SCAN_CLASSES,
  STATION_NAV_BUOY_ID,
  SUN_ID,
  WITCHPOINT_BUOY_ID,
} from "./ids.js";
import type { EntityId } from "./ids.js";
import {
  BUOY_MAX_ENERGY,
  BUOY_SUBENTITY_MAX_ENERGY,
  COMMODITY_KEY_PATTERN,
  MAX_AI_PARAMS_KEYS,
  MAX_BOUNTY,
  MAX_COMMODITY_KEY_LENGTH,
  MAX_ENERGY_RECHARGE_RATE,
  MAX_ENTITY_CARGO,
  MAX_ENTITY_ENERGY,
  MAX_ENTITY_MAGNITUDE,
  MAX_ENTITY_VELOCITY,
  MAX_ESCORT_SLOT,
  MAX_INJECTOR_ACCUMULATOR,
  MAX_POD_AMOUNT,
  MAX_ROLE_LENGTH,
  MAX_SHIP_FUEL,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_SYSTEM_INDEX,
  MAX_UINT32,
  MAX_WEAPON_TYPE_LENGTH,
  NO_SYSTEM_INDEX,
  NPC_DEFAULT_ENERGY_RECHARGE_RATE,
  NPC_DEFAULT_MAX_ENERGY,
  QUAT_UNIT_TOLERANCE,
  ROLE_PATTERN,
  WEAPON_TYPE_PATTERN,
  STATION_ALERT_GREEN,
  STATION_MAX_ENERGY,
} from "./limits.js";
import { createEntityStore } from "./store.js";
import type { EntityStore } from "./store.js";

/**
 * The five static entities in ascending id (D-06, D-07), frozen at runtime
 * along with each record. Scan classes follow Oolite: planet and sun
 * CLASS_NO_DRAW (OOPlanetEntity.m:94, OOSunEntity.m:131), the main station
 * CLASS_STATION and the buoys CLASS_BUOY (shipdata.plist `scan_class` of
 * coriolis-station and the buoy entries). Aegis and the compass keep reading
 * the layout; these records only name which layout body each id stands for.
 */
export const STATIC_ENTITIES: readonly StaticEntity[] = Object.freeze([
  Object.freeze<StaticEntity>({
    id: PLANET_ID,
    kind: "planet",
    scanClass: "CLASS_NO_DRAW",
    layoutKey: "planet",
  }),
  Object.freeze<StaticEntity>({
    id: SUN_ID,
    kind: "sun",
    scanClass: "CLASS_NO_DRAW",
    layoutKey: "sun",
  }),
  Object.freeze<StaticEntity>({
    id: MAIN_STATION_ID,
    kind: "station",
    scanClass: "CLASS_STATION",
    layoutKey: "station",
  }),
  Object.freeze<StaticEntity>({
    id: WITCHPOINT_BUOY_ID,
    kind: "buoy",
    scanClass: "CLASS_BUOY",
    layoutKey: "witchpoint",
  }),
  Object.freeze<StaticEntity>({
    id: STATION_NAV_BUOY_ID,
    kind: "buoy",
    scanClass: "CLASS_BUOY",
    layoutKey: "navBuoy",
  }),
]);

/**
 * The most AI events the world queue holds at any moment. A well-formed event
 * posted while the queue is full is dropped and counted in `aiDropped`.
 */
export const MAX_AI_QUEUE_LENGTH = 4096;

export interface World {
  readonly worldSeed: number;
  readonly statics: readonly StaticEntity[];
  readonly store: EntityStore;
  /** The world-level stream (entity id 0, purpose "world"). */
  rng: RngState;
  /**
   * Queued AI events, first in first out. World-owned (no module-level queue),
   * so an event naming an entity id dies with its world (per-world id scope).
   * Empty at every tick boundary, so it is never hashed or saved.
   */
  aiQueue: AiEvent[];
  /**
   * Ids of the actors that asked `ShipControl.fire` this tick, in call order,
   * at most one entry per actor. Drained and cleared by `resolveShots` after
   * the world step, so it is empty at every tick boundary and is never hashed
   * or saved; `snapshotWorld` refuses a non-empty queue.
   */
  fireQueue: EntityId[];
  /**
   * Well-formed AI events dropped by the pass cap, the per-drain delivery
   * budget or the queue-length cap. Hashed state; saturates at `MAX_UINT32`.
   */
  aiDropped: number;
  /**
   * The energy of the damageable statics (FOUND-18, D-08). Mutable, so a
   * repair can replace it. Statics never enter the store, so `isNeverSpawned`
   * ignores this field and the station and buoys can never be removed by the
   * kill path (D-13). Hashed only when not pristine (D-09).
   */
  staticHealth: StaticHealth;
  /**
   * The displacement, drift and subentity state of both buoys (Phase 18, PD-01,
   * PD-02; the owner-approved amendment of the version-4 field set). Mutable,
   * so a repair can replace it. A new world starts pristine, so every arrival,
   * launch and Load restores both buoys and their subentities (D-04; saves
   * never carry world state). Hashed and snapshotted only when not pristine.
   */
  buoys: BuoyStates;
  /**
   * The main station's minimal responder state (FOUND-20, owner decision D2):
   * its alert level, a launch counter and the offenders it has marked. At rest
   * until Phase 25 (the station responder and the law); the Coriolis itself
   * stays a static, not an entity. Hashed (`station:`) and snapshotted
   * (`station`) only when not pristine.
   */
  station: StationRecord;
  /**
   * Oolite's `ShipGroup` as data (FOUND-20): one `{ id, leader }` record per
   * group, ascending by id. The group id is the founding leader's entity id, so
   * no counter state exists; membership is derived by scanning `Entity.groupId`.
   * At rest until Phase 22 writes it. Hashed (`groups:`) and snapshotted
   * (`groups`) only when not empty.
   */
  groups: GroupRecord[];
  /**
   * The repopulation clock and the stateless-fork counter (FOUND-20; the
   * populator of Phase 26). At rest until then. Hashed (`repop:`) and
   * snapshotted (`populator`) only when not pristine.
   */
  populator: PopulatorClock;
}

/**
 * The main station's responder state (FOUND-20, owner decision D2).
 *
 * `alert` is Oolite's `ALERT_CONDITION_*` (`ShipEntity.h:169-172`): 0 docked, 1
 * green, 2 yellow, 3 red; pristine 1. `launched` counts the ships the station
 * launched, 0 to `MAX_STATION_LAUNCHED`. `marks` are the entity ids the station
 * marks as offenders, strictly ascending and unique, at most
 * `MAX_STATION_MARKS`. The per-ship `markedForFines` flag is a different
 * thing (a ship the police fine on its own), kept on the entity.
 */
export interface StationRecord {
  alert: number;
  launched: number;
  marks: EntityId[];
}

/** One group: its id is the founding leader's entity id (a leader equal to its id is valid). */
export interface GroupRecord {
  id: EntityId;
  leader: EntityId;
}

/** The populator's clock: the next repopulation tick and the rolls made so far, each a uint32. */
export interface PopulatorClock {
  nextTick: number;
  rolls: number;
}

/** The pristine station: green alert, nothing launched, no marks. */
export function createStationRecord(): StationRecord {
  return { alert: STATION_ALERT_GREEN, launched: 0, marks: [] };
}

/** True when the station is at its created state, so the hash prints no `station:` line. */
export function isPristineStation(station: StationRecord): boolean {
  return (
    station.alert === STATION_ALERT_GREEN &&
    station.launched === 0 &&
    station.marks.length === 0
  );
}

/** The pristine populator clock: tick 0, no rolls. */
export function createPopulatorClock(): PopulatorClock {
  return { nextTick: 0, rolls: 0 };
}

/** True when the clock is at its created state, so the hash prints no `repop:` line. */
export function isPristinePopulator(populator: PopulatorClock): boolean {
  return populator.nextTick === 0 && populator.rolls === 0;
}

/** True when no group exists, so the hash prints no `groups:` line. */
export function isPristineGroups(groups: readonly GroupRecord[]): boolean {
  return groups.length === 0;
}

/** The pristine static health: every damageable static at its maximum. */
export function createStaticHealth(): StaticHealth {
  return {
    station: STATION_MAX_ENERGY,
    witchpoint: BUOY_MAX_ENERGY,
    navBuoy: BUOY_MAX_ENERGY,
  };
}

/** True when every static is at its maximum, so the hash prints nothing. */
export function isPristineStaticHealth(health: StaticHealth): boolean {
  return (
    health.station === STATION_MAX_ENERGY &&
    health.witchpoint === BUOY_MAX_ENERGY &&
    health.navBuoy === BUOY_MAX_ENERGY
  );
}

/** One pristine buoy: at its layout position, at rest, its subentity whole. */
function createBuoyState(): BuoyState {
  return {
    offset: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    subentityEnergy: BUOY_SUBENTITY_MAX_ENERGY,
    subentityTakingDamage: false,
  };
}

/** The pristine buoy states (PD-01, PD-02): both buoys as `createWorld` sets them. */
export function createBuoyStates(): BuoyStates {
  return { witchpoint: createBuoyState(), navBuoy: createBuoyState() };
}

function isPristineBuoyState(buoy: BuoyState): boolean {
  return (
    buoy.offset.x === 0 &&
    buoy.offset.y === 0 &&
    buoy.offset.z === 0 &&
    buoy.velocity.x === 0 &&
    buoy.velocity.y === 0 &&
    buoy.velocity.z === 0 &&
    buoy.subentityEnergy === BUOY_SUBENTITY_MAX_ENERGY &&
    buoy.subentityTakingDamage === false
  );
}

/**
 * True when both buoys are pristine (zero offset and velocity, a whole
 * subentity, no sticky routing), so the hash prints no `buoys:` line and the
 * snapshot carries no `buoys` key. `-0` reads as pristine, as it hashes as 0.
 */
export function isPristineBuoyStates(buoys: BuoyStates): boolean {
  return (
    isPristineBuoyState(buoys.witchpoint) && isPristineBuoyState(buoys.navBuoy)
  );
}

/**
 * A new, empty world. `worldSeed` must be a safe integer in `0..MAX_UINT32`
 * (fixed-step callers pass `worldSeedFor` outputs, uint32 by construction, so
 * the throw is unreachable in the frame loop): the hash prints it through
 * `canon(n, 0)`, which rounds, while `forkSeed` truncates, so a non-integer
 * seed would make the hash blind to a real stream difference.
 */
export function createWorld(worldSeed: number): World {
  if (
    !Number.isSafeInteger(worldSeed) ||
    worldSeed < 0 ||
    worldSeed > MAX_UINT32
  ) {
    throw new RangeError(
      `worldSeed must be an integer in [0, ${MAX_UINT32}], got ${worldSeed}`,
    );
  }
  return {
    worldSeed,
    statics: STATIC_ENTITIES,
    store: createEntityStore(),
    rng: createRngState(forkSeed(worldSeed, NO_ENTITY, "world")),
    aiQueue: [],
    fireQueue: [],
    aiDropped: 0,
    staticHealth: createStaticHealth(),
    buoys: createBuoyStates(),
    station: createStationRecord(),
    groups: [],
    populator: createPopulatorClock(),
  };
}

/**
 * Queue `id` for the NPC fire gate at the drain: the one push of the fire queue,
 * shared by `ShipControl.fire` and the steering's `ctx.fire` (Phase 17, advisor
 * decision 2). Bounded by `MAX_ENTITIES` (the most live entities a world can
 * hold) and de-duplicated, so one actor makes at most one request per tick
 * (T-13-21). It never throws and takes no draw; whether the shot happens is the
 * gate's decision at the drain.
 */
export function requestFire(world: World, id: EntityId): void {
  if (world.fireQueue.length >= MAX_ENTITIES) return;
  if (world.fireQueue.includes(id)) return;
  world.fireQueue.push(id);
}

/** The static record for ids 1-5; undefined for any other id. */
export function staticEntity(
  world: World,
  id: EntityId,
): StaticEntity | undefined {
  const index = id - PLANET_ID;
  if (!Number.isInteger(index) || index < 0) return undefined;
  const record = world.statics[index];
  return record !== undefined && record.id === id ? record : undefined;
}

/**
 * True exactly when nothing was ever spawned in the world and its own stream
 * was never drawn: the store's next id is still `FIRST_DYNAMIC_ID`, the live
 * array is empty and `world.rng` is still at its initial seed state. Draws from
 * `world.rng` are co-committed with spawning, so any draw or any spawn flips
 * this to false. A world that spawned and then lost every entity is not
 * "never spawned": its counter and streams are part of its identity (D-08
 * covers worlds where no NPC has existed and `world.rng` has not been drawn).
 * A world that dropped an AI event (`aiDropped` above 0) is hashed too.
 */
export function isNeverSpawned(world: World): boolean {
  return (
    world.store.nextId === FIRST_DYNAMIC_ID &&
    world.store.live.length === 0 &&
    world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world") &&
    world.aiDropped === 0
  );
}

/**
 * The count of live non-dead dynamic entities. `src/app/**` reads the entity
 * count from here (for `probe.sim.entities`) without touching `world.store`.
 */
export function liveEntityCount(world: World): number {
  return world.store.live.reduce((n, e) => n + (e.dead ? 0 : 1), 0);
}

function isUint32(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_UINT32;
}

function isBounded(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= MAX_ENTITY_MAGNITUDE;
}

/** A finite energy or max energy in `0..MAX_ENTITY_ENERGY`. */
function isLegalEnergy(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= MAX_ENTITY_ENERGY;
}

/** A finite recharge rate in `0..MAX_ENERGY_RECHARGE_RATE`. */
function isLegalRechargeRate(n: number): boolean {
  return Number.isFinite(n) && n >= 0 && n <= MAX_ENERGY_RECHARGE_RATE;
}

function isBoundedVec(v: Vec3): boolean {
  return isBounded(v.x) && isBounded(v.y) && isBounded(v.z);
}

/** A finite velocity component with magnitude at most `MAX_ENTITY_VELOCITY`. */
function isLegalVelocityComponent(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= MAX_ENTITY_VELOCITY;
}

/** A drift velocity inside the sanitiser's domain (D-01). */
function isLegalVelocity(v: Vec3): boolean {
  return (
    isLegalVelocityComponent(v.x) &&
    isLegalVelocityComponent(v.y) &&
    isLegalVelocityComponent(v.z)
  );
}

function isUnitQuat(q: Quat): boolean {
  if (
    !Number.isFinite(q.w) ||
    !Number.isFinite(q.x) ||
    !Number.isFinite(q.y) ||
    !Number.isFinite(q.z)
  ) {
    return false;
  }
  const normSq = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
  return Number.isFinite(normSq) && Math.abs(normSq - 1) <= QUAT_UNIT_TOLERANCE;
}

function isLegalString(s: string): boolean {
  return s.length <= MAX_SNAPSHOT_STRING_LENGTH;
}

/** A role: at most `MAX_ROLE_LENGTH` characters of `[a-z0-9-]` (FOUND-20). */
function isLegalRole(s: string): boolean {
  return s.length <= MAX_ROLE_LENGTH && ROLE_PATTERN.test(s);
}

/** A weapon type key: `EQ_WEAPON_*`, at most `MAX_WEAPON_TYPE_LENGTH` (FOUND-20). */
function isLegalWeaponType(s: string): boolean {
  return s.length <= MAX_WEAPON_TYPE_LENGTH && WEAPON_TYPE_PATTERN.test(s);
}

/** A commodity key: at most `MAX_COMMODITY_KEY_LENGTH` of `[a-z0-9_]` (FOUND-20). */
function isLegalCommodityKey(s: string): boolean {
  return s.length <= MAX_COMMODITY_KEY_LENGTH && COMMODITY_KEY_PATTERN.test(s);
}

const FORBIDDEN_PARAM_KEYS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
];

function isLegalParam(value: ParamValue): boolean {
  if (value === null || typeof value === "boolean") return true;
  if (typeof value === "number") return isBounded(value);
  if (typeof value === "string") return isLegalString(value);
  if (!Array.isArray(value)) return false;
  const items = value as readonly unknown[];
  if (items.length > MAX_SNAPSHOT_PARAM_LENGTH) return false;
  return items.every(
    (item) =>
      (typeof item === "number" && isBounded(item)) ||
      (typeof item === "string" && isLegalString(item)),
  );
}

function isLegalAi(ai: AiComponent): boolean {
  if (!(AI_KEYS as readonly string[]).includes(ai.aiKey)) return false;
  if (!isUint32(ai.wakeTick) || !isUint32(ai.nextThinkTick)) return false;
  // Object.keys lists own enumerable keys only, so an inherited name never
  // reaches the loop; `__proto__` as an own key (JSON.parse makes one) is
  // refused by name.
  const keys = Object.keys(ai.params);
  if (keys.length > MAX_AI_PARAMS_KEYS) return false;
  return keys.every(
    (key) =>
      key.length > 0 &&
      isLegalString(key) &&
      !FORBIDDEN_PARAM_KEYS.includes(key) &&
      isLegalParam(ai.params[key] as ParamValue),
  );
}

/** A non-null, non-array object: the only shape a record field may have. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An object whose listed components are all JS numbers (domain checks come later). */
function hasNumberFields(
  value: unknown,
  fields: readonly string[],
): value is Record<string, number> {
  return (
    isRecord(value) && fields.every((field) => typeof value[field] === "number")
  );
}

/** The number-typed v5 `SpawnInit` members (`bounty` first, FOUND-20). */
const V5_NUMBER_INIT_KEYS = [
  "bounty",
  "groupId",
  "cargoKind",
  "podAmount",
  "fuel",
  "homeSystem",
  "destinationSystem",
] as const;

/** The string-typed v5 `SpawnInit` members (FOUND-20). */
const V5_STRING_INIT_KEYS = ["role", "podCommodity"] as const;

/** The four weapon facings of `WeaponTypes`. */
const WEAPON_FACINGS = ["fore", "aft", "port", "starboard"] as const;

/** An integer in `min..max`. */
const isIntegerIn = (value: number, min: number, max: number): boolean =>
  Number.isSafeInteger(value) && value >= min && value <= max;

/**
 * True when `init` or `tick` has the wrong shape or a wrong JS type, which the
 * type system cannot rule out for deserialised or script-like callers. Only
 * `typeof` and `Array.isArray` are used, and a property is read only from a
 * value already known to be a non-null object, so this never throws. It runs
 * before every domain check (FOUND-16).
 */
function isMalformedInit(init: unknown, tick: unknown): boolean {
  if (!isRecord(init)) return true;
  if (typeof tick !== "number") return true;
  if (typeof init["specKey"] !== "string") return true;
  if (typeof init["kind"] !== "string") return true;
  if (typeof init["scanClass"] !== "string") return true;
  if (typeof init["radius"] !== "number") return true;
  const speed = init["speed"];
  if (speed !== undefined && typeof speed !== "number") return true;
  const ownerId = init["ownerId"];
  if (ownerId !== undefined && typeof ownerId !== "number") return true;
  const maxEnergy = init["maxEnergy"];
  if (maxEnergy !== undefined && typeof maxEnergy !== "number") return true;
  const rate = init["energyRechargeRate"];
  if (rate !== undefined && typeof rate !== "number") return true;
  const escortSlot = init["escortSlot"];
  if (escortSlot !== undefined && typeof escortSlot !== "number") return true;
  const cargo = init["cargo"];
  if (cargo !== undefined && typeof cargo !== "number") return true;
  for (const key of V5_NUMBER_INIT_KEYS) {
    const value = init[key];
    if (value !== undefined && typeof value !== "number") return true;
  }
  for (const key of V5_STRING_INIT_KEYS) {
    const value = init[key];
    if (value !== undefined && typeof value !== "string") return true;
  }
  const injector = init["injector"];
  if (
    injector !== undefined &&
    injector !== null &&
    !hasNumberFields(injector, ["accumulator"])
  ) {
    return true;
  }
  const weaponTypes = init["weaponTypes"];
  if (weaponTypes !== undefined) {
    if (!isRecord(weaponTypes)) return true;
    for (const facing of WEAPON_FACINGS) {
      const type = weaponTypes[facing];
      if (type !== null && typeof type !== "string") return true;
    }
  }
  const markedForFines = init["markedForFines"];
  if (markedForFines !== undefined && typeof markedForFines !== "boolean") {
    return true;
  }
  const velocity = init["velocity"];
  if (velocity !== undefined && !hasNumberFields(velocity, ["x", "y", "z"])) {
    return true;
  }
  if (!hasNumberFields(init["position"], ["x", "y", "z"])) return true;
  if (!hasNumberFields(init["orientation"], ["w", "x", "y", "z"])) return true;
  const ai = init["ai"];
  if (ai === undefined || ai === null) return false;
  if (!isRecord(ai)) return true;
  if (typeof ai["aiKey"] !== "string") return true;
  if (typeof ai["wakeTick"] !== "number") return true;
  if (typeof ai["nextThinkTick"] !== "number") return true;
  return !isRecord(ai["params"]);
}

/**
 * The first domain rule `init` and `tick` violate, or undefined when both lie
 * inside the shared serialised domain. An AI component outside the domain is
 * `ai`; every other violated field is `outOfDomain`.
 */
function domainRefusal(
  init: SpawnInit,
  tick: number,
): SpawnRefusal | undefined {
  if (!isUint32(tick)) return "outOfDomain";
  if (init.specKey.length === 0 || !isLegalString(init.specKey)) {
    return "outOfDomain";
  }
  if (!(ENTITY_KINDS as readonly string[]).includes(init.kind)) {
    return "outOfDomain";
  }
  if (!(SCAN_CLASSES as readonly string[]).includes(init.scanClass)) {
    return "outOfDomain";
  }
  if (!Number.isFinite(init.radius) || !(init.radius > 0)) return "outOfDomain";
  if (init.radius > MAX_ENTITY_MAGNITUDE) return "outOfDomain";
  if (init.ownerId !== undefined && !isUint32(init.ownerId)) {
    return "outOfDomain";
  }
  if (init.speed !== undefined) {
    if (!isBounded(init.speed) || init.speed < 0) return "outOfDomain";
  }
  if (init.maxEnergy !== undefined && !isLegalEnergy(init.maxEnergy)) {
    return "outOfDomain";
  }
  if (
    init.energyRechargeRate !== undefined &&
    !isLegalRechargeRate(init.energyRechargeRate)
  ) {
    return "outOfDomain";
  }
  if (
    init.escortSlot !== undefined &&
    !(
      Number.isSafeInteger(init.escortSlot) &&
      init.escortSlot >= 0 &&
      init.escortSlot <= MAX_ESCORT_SLOT
    )
  ) {
    return "outOfDomain";
  }
  if (
    init.cargo !== undefined &&
    !(
      Number.isSafeInteger(init.cargo) &&
      init.cargo >= 0 &&
      init.cargo <= MAX_ENTITY_CARGO
    )
  ) {
    return "outOfDomain";
  }
  if (init.bounty !== undefined && !isIntegerIn(init.bounty, 0, MAX_BOUNTY)) {
    return "outOfDomain";
  }
  if (init.role !== undefined && !isLegalRole(init.role)) return "outOfDomain";
  if (
    init.groupId !== undefined &&
    init.groupId !== 0 &&
    !isIntegerIn(init.groupId, FIRST_DYNAMIC_ID, MAX_UINT32)
  ) {
    return "outOfDomain";
  }
  if (
    init.cargoKind !== undefined &&
    !isIntegerIn(init.cargoKind, 0, CARGO_KINDS.length - 1)
  ) {
    return "outOfDomain";
  }
  if (
    init.podCommodity !== undefined &&
    !isLegalCommodityKey(init.podCommodity)
  ) {
    return "outOfDomain";
  }
  if (
    init.podAmount !== undefined &&
    !isIntegerIn(init.podAmount, 0, MAX_POD_AMOUNT)
  ) {
    return "outOfDomain";
  }
  if (init.fuel !== undefined && !isIntegerIn(init.fuel, 0, MAX_SHIP_FUEL)) {
    return "outOfDomain";
  }
  if (
    init.homeSystem !== undefined &&
    !isIntegerIn(init.homeSystem, -1, MAX_SYSTEM_INDEX)
  ) {
    return "outOfDomain";
  }
  if (
    init.destinationSystem !== undefined &&
    !isIntegerIn(init.destinationSystem, -1, MAX_SYSTEM_INDEX)
  ) {
    return "outOfDomain";
  }
  if (
    init.injector !== undefined &&
    init.injector !== null &&
    !(
      Number.isFinite(init.injector.accumulator) &&
      init.injector.accumulator >= 0 &&
      init.injector.accumulator <= MAX_INJECTOR_ACCUMULATOR
    )
  ) {
    return "outOfDomain";
  }
  if (init.weaponTypes !== undefined) {
    for (const facing of WEAPON_FACINGS) {
      const type = init.weaponTypes[facing];
      if (type !== null && !isLegalWeaponType(type)) return "outOfDomain";
    }
  }
  if (init.velocity !== undefined && !isLegalVelocity(init.velocity)) {
    return "outOfDomain";
  }
  if (!isBoundedVec(init.position) || !isUnitQuat(init.orientation)) {
    return "outOfDomain";
  }
  if (init.ai === undefined || init.ai === null || isLegalAi(init.ai)) {
    return undefined;
  }
  return "ai";
}

function copyAi(ai: AiComponent): AiComponent {
  const params = Object.create(null) as Record<string, ParamValue>;
  for (const key of Object.keys(ai.params)) {
    const value = ai.params[key] as ParamValue;
    params[key] = Array.isArray(value)
      ? (value as readonly (number | string)[]).slice()
      : value;
  }
  return {
    aiKey: ai.aiKey,
    params,
    wakeTick: ai.wakeTick,
    nextThinkTick: ai.nextThinkTick,
  };
}

/**
 * The closed list of reasons `spawnEntity` refuses. Each reason is a
 * payload-free code: no refusal carries text built from the input.
 * `malformed` is for input the type system cannot rule out (a nullish or
 * wrong-typed field, FOUND-16); `outOfDomain` is a field outside the shared serialised
 * domain; `ai` an AI component outside it; `idExhausted` a spent id counter;
 * `storeFull` a store already holding `MAX_ENTITIES` live entities.
 */
export const SPAWN_REFUSALS = [
  "malformed",
  "outOfDomain",
  "ai",
  "idExhausted",
  "storeFull",
] as const;

export type SpawnRefusal = (typeof SPAWN_REFUSALS)[number];

export type SpawnResult =
  | { readonly ok: true; readonly entity: Entity }
  | { readonly ok: false; readonly reason: SpawnRefusal };

/**
 * Spawn an entity. Returns `{ ok: true, entity }`, or `{ ok: false, reason }`
 * with `reason` from `SPAWN_REFUSALS`; it never throws, whatever `init` and
 * `tick` hold. It refuses when `init` or `tick` has a nullish or wrong-typed
 * field (`malformed`), when they lie outside the shared serialised domain
 * (`./limits.ts`, the closed vocabularies of `./ids.ts` and `../ai/types.ts`),
 * when the id counter is spent or when the store is full. Every refusal
 * happens before `store.allocate`, so `nextId`, the live array and the world
 * stream are untouched by a refusal and the next valid spawn receives the id
 * the counter showed before it. The refusal order is `malformed`, then the
 * domain (`outOfDomain`, `ai`), then `idExhausted`, then `storeFull`. Membership checks use
 * `Array.prototype.includes` over the vocabulary arrays, never the `in`
 * operator, so a prototype name such as "constructor" is refused. The
 * orientation must already be a unit quaternion: spawn neither normalises nor
 * accepts a near-zero norm.
 *
 * The entity's streams are forked from `(worldSeed, id, purpose)` here and
 * stored as plain uint32 states, so spawning or killing another entity never
 * changes its draws (D-04).
 */
export function spawnEntity(
  world: World,
  init: SpawnInit,
  tick: number,
): SpawnResult {
  if (isMalformedInit(init, tick)) return { ok: false, reason: "malformed" };
  const refusal = domainRefusal(init, tick);
  if (refusal !== undefined) return { ok: false, reason: refusal };
  const nextId = world.store.nextId;
  if (!Number.isSafeInteger(nextId) || nextId > MAX_UINT32) {
    return { ok: false, reason: "idExhausted" };
  }
  if (liveEntityCount(world) >= MAX_ENTITIES) {
    return { ok: false, reason: "storeFull" };
  }
  const entity = world.store.allocate((id) => {
    const speed = init.speed ?? 0;
    const maxEnergy = init.maxEnergy ?? NPC_DEFAULT_MAX_ENERGY;
    return {
      id,
      kind: init.kind,
      dead: false,
      position: { x: init.position.x, y: init.position.y, z: init.position.z },
      orientation: {
        w: init.orientation.w,
        x: init.orientation.x,
        y: init.orientation.y,
        z: init.orientation.z,
      },
      radius: init.radius,
      speed,
      scanClass: init.scanClass,
      specKey: init.specKey,
      ownerId: init.ownerId ?? NO_ENTITY,
      spawnTick: tick,
      rng: {
        ai: forkSeed(world.worldSeed, id, "ai"),
        combat: forkSeed(world.worldSeed, id, "combat"),
      },
      nav: {
        behaviour: "IDLE",
        targetId: NO_ENTITY,
        destination: {
          x: init.position.x,
          y: init.position.y,
          z: init.position.z,
        },
        desiredRange: 0,
        desiredSpeed: speed,
      },
      ai: init.ai === undefined || init.ai === null ? null : copyAi(init.ai),
      repairs: 0,
      energy: maxEnergy,
      maxEnergy,
      energyRechargeRate:
        init.energyRechargeRate ?? NPC_DEFAULT_ENERGY_RECHARGE_RATE,
      steer: createSteerComponent(init.escortSlot ?? 0),
      velocity:
        init.velocity === undefined
          ? { x: 0, y: 0, z: 0 }
          : { x: init.velocity.x, y: init.velocity.y, z: init.velocity.z },
      weapon: {
        temperature: 0,
        lastShotTick: 0,
        missedShots: 0,
        aftTemperature: 0,
        portTemperature: 0,
        starboardTemperature: 0,
      },
      cargo: init.cargo ?? 0,
      bounty: init.bounty ?? 0,
      role: init.role ?? "",
      groupId: init.groupId ?? NO_ENTITY,
      cargoKind: init.cargoKind ?? 0,
      podCommodity: init.podCommodity ?? "",
      podAmount: init.podAmount ?? 0,
      fuel: init.fuel ?? 0,
      homeSystem: init.homeSystem ?? NO_SYSTEM_INDEX,
      destinationSystem: init.destinationSystem ?? NO_SYSTEM_INDEX,
      injector:
        init.injector === undefined || init.injector === null
          ? null
          : { accumulator: init.injector.accumulator },
      weaponTypes:
        init.weaponTypes === undefined
          ? { fore: null, aft: null, port: null, starboard: null }
          : {
              fore: init.weaponTypes.fore,
              aft: init.weaponTypes.aft,
              port: init.weaponTypes.port,
              starboard: init.weaponTypes.starboard,
            },
      markedForFines: init.markedForFines ?? false,
    };
  });
  return entity === undefined
    ? { ok: false, reason: "storeFull" }
    : { ok: true, entity };
}

/** Add `count` dropped events to `aiDropped`, saturating at `MAX_UINT32`. */
export function countAiDropped(world: World, count: number): void {
  world.aiDropped = Math.min(MAX_UINT32, world.aiDropped + count);
}

/** Whether `event` is well formed: every field inside the shared domain. */
function isWellFormedAiEvent(event: AiEvent): boolean {
  if (!Number.isSafeInteger(event.to) || event.to < 1) return false;
  if (event.to > MAX_UINT32) return false;
  if (!(AI_EVENT_NAMES as readonly string[]).includes(event.name)) {
    return false;
  }
  if (event.a !== undefined && !isUint32(event.a)) return false;
  if (event.b !== undefined && !isUint32(event.b)) return false;
  return event.n === undefined || isBounded(event.n);
}

/**
 * Queue an AI event for the next AI phase; nothing is delivered synchronously.
 * A malformed event (an id or `name` outside the shared domain, a non-finite or
 * over-large `n`) is ignored and not counted. A well-formed event posted while
 * the queue holds `MAX_AI_QUEUE_LENGTH` events is dropped and counted in
 * `aiDropped`. Otherwise a copy holding only `to`, `name` and the present `a`,
 * `b` and `n` is appended, so no extra field travels with it.
 */
export function postAiEvent(world: World, event: AiEvent): void {
  if (!isWellFormedAiEvent(event)) return;
  if (world.aiQueue.length >= MAX_AI_QUEUE_LENGTH) {
    countAiDropped(world, 1);
    return;
  }
  world.aiQueue.push({
    to: event.to,
    name: event.name,
    ...(event.a === undefined ? {} : { a: event.a }),
    ...(event.b === undefined ? {} : { b: event.b }),
    ...(event.n === undefined ? {} : { n: event.n }),
  });
}

/**
 * A test-only primitive: a bare `store.kill` with no `shipDestroyed`, no killer
 * normalisation and (from plan 15-05) no AI notification. It marks an entity
 * dead; it leaves `live` at the next `commitWorld`. Only files under `tests/`
 * call it, for scenarios that need a dead entity without the kill path.
 *
 * Production code removes a ship only through `killShip`
 * (`./kill.ts`). The one other removal in non-test code is the sanitiser's
 * corruption repair: `sanitizeEntity` marks an entity of unknown kind dead
 * (`./sanitize.ts`), which is never a ship, posts no `shipDestroyed` and no
 * notification, and stays as it is.
 */
export function killEntity(world: World, id: EntityId): boolean {
  return world.store.kill(id);
}

/** Remove dead entities; returns their ids ascending. */
export function commitWorld(world: World): EntityId[] {
  return world.store.commit();
}

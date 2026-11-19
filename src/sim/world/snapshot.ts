// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The world snapshot codec (FOUND-12, D-04, D-06, D-07).
 *
 * A snapshot is the plain, JSON-safe state of ONE world: the seed, the id
 * counter, the world stream, the AI drop counter and every live entity with
 * both of its streams and its AI component. It names exactly the fields the
 * world hash covers (`./serialize.ts`), so a world restored from a snapshot
 * hashes like the world it came from. It never carries the five static
 * entities (they are the constant `STATIC_ENTITIES` table referencing
 * `SystemLayout`, D-07) or the AI queue (empty at every tick boundary).
 *
 * The format is the de facto contract Phase 11 (SAVE-07, SAVE-08) reuses: a
 * field change, or a change to a limit in `./limits.ts`, bumps
 * `WORLD_SNAPSHOT_VERSION`. Phase 11 imports the limits from `./limits.ts`
 * directly; this module declares and re-exports none.
 *
 * `snapshotWorld` runs outside the fixed step (in tests now, on the save path
 * later) and refuses by throwing a typed `SnapshotError`: an uncommitted dead
 * entity, an undrained AI event, or a non-finite number anywhere, because
 * `JSON.stringify` would turn a NaN into a legal `null` and silently change
 * the state. `parseWorldSnapshot` is the one boundary parser; `restoreWorld`
 * runs it first, so it is not an unchecked second entry point. The parser
 * builds a fresh output tree while it validates, reads each input property
 * exactly once into a local that is both checked and copied, and never
 * compares prototypes, so it accepts its own null-prototype `ai.params`.
 *
 * Per-world scope (CONTEXT D-06 as amended 2026-11-12): `nextId` is that
 * world's own counter. `restoreWorld` rebuilds one world as a new object with
 * the stored counter, never `max + 1` and never 101, and shares no store with
 * any other world.
 */

import type { AiComponent, AiKey, ParamValue } from "../ai/types.js";
import { AI_KEYS } from "../ai/types.js";
import { createRngState } from "../rng.js";
import { ACCURACY_UNRESOLVED } from "../npc/state.js";
import type { BuoyState, BuoyStates, Entity, EntityStreams } from "./entity.js";
import {
  BEHAVIOUR_IDS,
  ENTITY_KINDS,
  FIRST_DYNAMIC_ID,
  MAX_ENTITIES,
  SCAN_CLASSES,
} from "./ids.js";
import type { BehaviourId, EntityId, EntityKind, ScanClass } from "./ids.js";
import {
  BUOY_MAX_ENERGY,
  MAX_ACCURACY,
  MAX_AI_PARAMS_KEYS,
  MAX_ENERGY_RECHARGE_RATE,
  MAX_ENTITY_CARGO,
  MAX_ENTITY_ENERGY,
  MAX_ENTITY_MAGNITUDE,
  MAX_ENTITY_VELOCITY,
  MAX_ESCORT_SLOT,
  MAX_FRUSTRATION,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_STEER_RATE,
  MAX_UINT32,
  MAX_WEAPON_TEMPERATURE,
  MIN_ACCURACY,
  QUAT_UNIT_TOLERANCE,
  STATION_MAX_ENERGY,
  TRACKING_SAMPLES,
} from "./limits.js";
import { createEntityStore } from "./store.js";
import {
  STATIC_ENTITIES,
  createBuoyStates,
  isPristineBuoyStates,
} from "./world.js";
import type { World } from "./world.js";

/** The `format` tag of every world snapshot. */
export const WORLD_SNAPSHOT_FORMAT = "wegolite-world";

/**
 * The snapshot layout version; bump on any field or limit change. Version 2
 * (Phase 13, CBT-07) adds the energy bank (`energy`, `maxEnergy`,
 * `energyRechargeRate`) to every entity; a version-1 snapshot is refused.
 * Version 3 (Phase 14, AI-01) adds the steering record `steer` to every entity;
 * a version-2 snapshot is refused. Version 4 (Phase 15, FOUND-18) adds
 * `velocity`, `weapon` and `cargo` to every entity and `staticHealth` to the
 * world; a version-3 snapshot is refused. Phase 18 amends the version-4 field
 * set without a bump, by the owner's decisions PD-01 and PD-02 (FOUND-18: an
 * owner-approved amendment, not a quiet second bump): the optional world key
 * `buoys` (each buoy's offset, drift velocity, subentity energy and sticky
 * subentity routing flag), written only when not pristine, so every existing
 * snapshot stays valid and restores pristine buoys.
 * World snapshots are not persisted to IndexedDB yet (SAVE-07 is later), so no
 * save migration exists.
 */
export const WORLD_SNAPSHOT_VERSION = 4;

export interface VectorSnapshot {
  x: number;
  y: number;
  z: number;
}

export interface QuaternionSnapshot {
  w: number;
  x: number;
  y: number;
  z: number;
}

export interface NavSnapshot {
  behaviour: BehaviourId;
  targetId: EntityId;
  destination: VectorSnapshot;
  desiredRange: number;
  desiredSpeed: number;
}

/** The condition `avoidCollision` saved (`SavedCondition` in `../npc/state.ts`). */
export interface SavedConditionSnapshot {
  behaviour: BehaviourId;
  targetId: EntityId;
  desiredRange: number;
  desiredSpeed: number;
  destination: VectorSnapshot;
}

/**
 * The steering record (`SteerComponent` in `../npc/state.ts`). Canonical form:
 * at `trackingCount` 0 every tick and position is zero.
 */
export interface SteerSnapshot {
  flightRoll: number;
  flightPitch: number;
  stickRoll: number;
  stickPitch: number;
  accuracy: number;
  frustration: number;
  successFactor: number;
  pitchingOver: boolean;
  jink: VectorSnapshot;
  proximityAlert: EntityId;
  escortSlot: number;
  trackingCount: number;
  trackingTicks: [number, number, number, number];
  trackingPositions: [
    VectorSnapshot,
    VectorSnapshot,
    VectorSnapshot,
    VectorSnapshot,
  ];
  saved: SavedConditionSnapshot | null;
  entryPending: boolean;
}

/** The weapon record (`WeaponComponent` in `./entity.ts`). */
export interface WeaponSnapshot {
  temperature: number;
  lastShotTick: number;
  missedShots: number;
}

/** One live entity: every `Entity` field except `dead` (never snapshotted). */
export interface EntitySnapshot {
  id: EntityId;
  kind: EntityKind;
  position: VectorSnapshot;
  orientation: QuaternionSnapshot;
  radius: number;
  speed: number;
  scanClass: ScanClass;
  specKey: string;
  ownerId: EntityId;
  spawnTick: number;
  rng: EntityStreams;
  nav: NavSnapshot;
  ai: AiComponent | null;
  repairs: number;
  energy: number;
  maxEnergy: number;
  energyRechargeRate: number;
  steer: SteerSnapshot;
  velocity: VectorSnapshot;
  weapon: WeaponSnapshot;
  cargo: number;
}

/** The energy of the damageable statics (`StaticHealth` in `./entity.ts`). */
export interface StaticHealthSnapshot {
  station: number;
  witchpoint: number;
  navBuoy: number;
}

/** One buoy's state (`BuoyState` in `./entity.ts`, PD-01, PD-02). */
export interface BuoyStateSnapshot {
  offset: VectorSnapshot;
  velocity: VectorSnapshot;
  subentityEnergy: number;
  subentityTakingDamage: boolean;
}

/** Both buoys' state (`BuoyStates` in `./entity.ts`). */
export interface BuoyStatesSnapshot {
  witchpoint: BuoyStateSnapshot;
  navBuoy: BuoyStateSnapshot;
}

export interface WorldSnapshot {
  format: typeof WORLD_SNAPSHOT_FORMAT;
  version: typeof WORLD_SNAPSHOT_VERSION;
  worldSeed: number;
  /** The id the world's next spawn issues; the world's own counter. */
  nextId: number;
  /** The world stream state, `world.rng.s`, a plain uint32 integer. */
  rng: number;
  aiDropped: number;
  /** The energy of the station and both buoys (Phase 15, D-08). */
  staticHealth: StaticHealthSnapshot;
  /**
   * The displacement, drift and subentity state of both buoys (Phase 18,
   * PD-01, PD-02): present only when not pristine; an absent key restores
   * pristine buoys.
   */
  buoys?: BuoyStatesSnapshot;
  /** Strictly ascending by id. */
  entities: EntitySnapshot[];
}

export type SnapshotErrorReason =
  | "uncommitted"
  | "queue-not-empty"
  | "non-finite"
  | "not-object"
  | "unknown-key"
  | "forbidden-key"
  | "type"
  | "format"
  | "version"
  | "world-seed"
  | "next-id"
  | "entities"
  | "too-many-entities"
  | "entity-id"
  | "entity-order"
  | "magnitude"
  | "range"
  | "counter"
  | "stream"
  | "quaternion"
  | "vocabulary"
  | "string"
  | "param";

/** A refused snapshot or a refused snapshot input; `reason` is the stable code. */
export class SnapshotError extends Error {
  readonly reason: SnapshotErrorReason;

  constructor(reason: SnapshotErrorReason, detail: string) {
    super(`Wegolite: invalid world snapshot (${reason}): ${detail}`);
    this.name = "SnapshotError";
    this.reason = reason;
  }
}

const FORBIDDEN_KEYS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
];

const compareCodeUnits = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** `-0` as `0`; JSON cannot carry it and the hash never tells them apart. */
const noNegativeZero = (n: number): number => (n === 0 ? 0 : n);

// ---------------------------------------------------------------------------
// snapshotWorld

function requireFinite(value: unknown, path: string): void {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new SnapshotError("non-finite", `${path} is ${String(value)}`);
  }
}

function requireFiniteParam(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    const items = value as readonly unknown[];
    for (let i = 0; i < items.length; i += 1) {
      requireFinite(items[i], `${path}[${String(i)}]`);
    }
    return;
  }
  requireFinite(value, path);
}

/** Refuse the first non-finite number leaf of a steering record. */
function requireFiniteSteer(steer: Entity["steer"], at: string): void {
  requireFinite(steer.flightRoll, `${at}.flightRoll`);
  requireFinite(steer.flightPitch, `${at}.flightPitch`);
  requireFinite(steer.stickRoll, `${at}.stickRoll`);
  requireFinite(steer.stickPitch, `${at}.stickPitch`);
  requireFinite(steer.accuracy, `${at}.accuracy`);
  requireFinite(steer.frustration, `${at}.frustration`);
  requireFinite(steer.successFactor, `${at}.successFactor`);
  requireFinite(steer.jink.x, `${at}.jink.x`);
  requireFinite(steer.jink.y, `${at}.jink.y`);
  requireFinite(steer.jink.z, `${at}.jink.z`);
  requireFinite(steer.proximityAlert, `${at}.proximityAlert`);
  requireFinite(steer.escortSlot, `${at}.escortSlot`);
  requireFinite(steer.trackingCount, `${at}.trackingCount`);
  for (let i = 0; i < TRACKING_SAMPLES; i += 1) {
    requireFinite(steer.trackingTicks[i], `${at}.trackingTicks[${String(i)}]`);
    const p = steer.trackingPositions[i];
    requireFinite(p?.x, `${at}.trackingPositions[${String(i)}].x`);
    requireFinite(p?.y, `${at}.trackingPositions[${String(i)}].y`);
    requireFinite(p?.z, `${at}.trackingPositions[${String(i)}].z`);
  }
  if (steer.saved !== null) {
    requireFinite(steer.saved.targetId, `${at}.saved.targetId`);
    requireFinite(steer.saved.desiredRange, `${at}.saved.desiredRange`);
    requireFinite(steer.saved.desiredSpeed, `${at}.saved.desiredSpeed`);
    requireFinite(steer.saved.destination.x, `${at}.saved.destination.x`);
    requireFinite(steer.saved.destination.y, `${at}.saved.destination.y`);
    requireFinite(steer.saved.destination.z, `${at}.saved.destination.z`);
  }
}

/** Refuse the first non-finite number leaf of `entity`. */
function requireFiniteEntity(entity: Entity): void {
  const at = `entity ${String(entity.id)}`;
  const { position: p, orientation: q, nav, rng } = entity;
  requireFinite(entity.id, `${at}.id`);
  requireFinite(p.x, `${at}.position.x`);
  requireFinite(p.y, `${at}.position.y`);
  requireFinite(p.z, `${at}.position.z`);
  requireFinite(q.w, `${at}.orientation.w`);
  requireFinite(q.x, `${at}.orientation.x`);
  requireFinite(q.y, `${at}.orientation.y`);
  requireFinite(q.z, `${at}.orientation.z`);
  requireFinite(entity.radius, `${at}.radius`);
  requireFinite(entity.speed, `${at}.speed`);
  requireFinite(entity.ownerId, `${at}.ownerId`);
  requireFinite(entity.spawnTick, `${at}.spawnTick`);
  requireFinite(rng.ai, `${at}.rng.ai`);
  requireFinite(rng.combat, `${at}.rng.combat`);
  requireFinite(nav.targetId, `${at}.nav.targetId`);
  requireFinite(nav.destination.x, `${at}.nav.destination.x`);
  requireFinite(nav.destination.y, `${at}.nav.destination.y`);
  requireFinite(nav.destination.z, `${at}.nav.destination.z`);
  requireFinite(nav.desiredRange, `${at}.nav.desiredRange`);
  requireFinite(nav.desiredSpeed, `${at}.nav.desiredSpeed`);
  requireFinite(entity.repairs, `${at}.repairs`);
  requireFinite(entity.energy, `${at}.energy`);
  requireFinite(entity.maxEnergy, `${at}.maxEnergy`);
  requireFinite(entity.energyRechargeRate, `${at}.energyRechargeRate`);
  requireFiniteSteer(entity.steer, `${at}.steer`);
  requireFinite(entity.velocity.x, `${at}.velocity.x`);
  requireFinite(entity.velocity.y, `${at}.velocity.y`);
  requireFinite(entity.velocity.z, `${at}.velocity.z`);
  requireFinite(entity.weapon.temperature, `${at}.weapon.temperature`);
  requireFinite(entity.weapon.lastShotTick, `${at}.weapon.lastShotTick`);
  requireFinite(entity.weapon.missedShots, `${at}.weapon.missedShots`);
  requireFinite(entity.cargo, `${at}.cargo`);
  if (entity.ai !== null) {
    requireFinite(entity.ai.wakeTick, `${at}.ai.wakeTick`);
    requireFinite(entity.ai.nextThinkTick, `${at}.ai.nextThinkTick`);
    for (const key of Object.keys(entity.ai.params)) {
      requireFiniteParam(entity.ai.params[key], `${at}.ai.params.${key}`);
    }
  }
}

function copyParam(value: ParamValue): ParamValue {
  if (typeof value === "number") return noNegativeZero(value);
  if (!Array.isArray(value)) return value;
  return (value as readonly (number | string)[]).map((item) =>
    typeof item === "number" ? noNegativeZero(item) : item,
  );
}

function copyParams(
  params: Record<string, ParamValue>,
): Record<string, ParamValue> {
  const out = Object.create(null) as Record<string, ParamValue>;
  for (const key of Object.keys(params).sort(compareCodeUnits)) {
    out[key] = copyParam(params[key] as ParamValue);
  }
  return out;
}

function copyAi(ai: AiComponent): AiComponent {
  return {
    aiKey: ai.aiKey,
    params: copyParams(ai.params),
    wakeTick: noNegativeZero(ai.wakeTick),
    nextThinkTick: noNegativeZero(ai.nextThinkTick),
  };
}

const copyVec = (v: { x: number; y: number; z: number }): VectorSnapshot => ({
  x: noNegativeZero(v.x),
  y: noNegativeZero(v.y),
  z: noNegativeZero(v.z),
});

/**
 * The canonical copy of a steering record: `-0` written as 0, and the ticks and
 * positions of a curve that does not exist (count 0) written as zeros, so a
 * stale sample never reaches the JSON and equal states snapshot alike.
 */
function snapshotSteer(steer: Entity["steer"]): SteerSnapshot {
  const started = steer.trackingCount !== 0;
  const tick = (i: 0 | 1 | 2 | 3): number =>
    started ? noNegativeZero(steer.trackingTicks[i]) : 0;
  const position = (i: 0 | 1 | 2 | 3): VectorSnapshot =>
    started ? copyVec(steer.trackingPositions[i]) : { x: 0, y: 0, z: 0 };
  return {
    flightRoll: noNegativeZero(steer.flightRoll),
    flightPitch: noNegativeZero(steer.flightPitch),
    stickRoll: noNegativeZero(steer.stickRoll),
    stickPitch: noNegativeZero(steer.stickPitch),
    accuracy: noNegativeZero(steer.accuracy),
    frustration: noNegativeZero(steer.frustration),
    successFactor: noNegativeZero(steer.successFactor),
    pitchingOver: steer.pitchingOver,
    jink: copyVec(steer.jink),
    proximityAlert: noNegativeZero(steer.proximityAlert),
    escortSlot: noNegativeZero(steer.escortSlot),
    trackingCount: noNegativeZero(steer.trackingCount),
    trackingTicks: [tick(0), tick(1), tick(2), tick(3)],
    trackingPositions: [position(0), position(1), position(2), position(3)],
    saved:
      steer.saved === null
        ? null
        : {
            behaviour: steer.saved.behaviour,
            targetId: noNegativeZero(steer.saved.targetId),
            desiredRange: noNegativeZero(steer.saved.desiredRange),
            desiredSpeed: noNegativeZero(steer.saved.desiredSpeed),
            destination: copyVec(steer.saved.destination),
          },
    entryPending: steer.entryPending,
  };
}

function snapshotEntity(entity: Entity): EntitySnapshot {
  const { position: p, orientation: q, nav, rng } = entity;
  return {
    id: entity.id,
    kind: entity.kind,
    position: {
      x: noNegativeZero(p.x),
      y: noNegativeZero(p.y),
      z: noNegativeZero(p.z),
    },
    orientation: {
      w: noNegativeZero(q.w),
      x: noNegativeZero(q.x),
      y: noNegativeZero(q.y),
      z: noNegativeZero(q.z),
    },
    radius: noNegativeZero(entity.radius),
    speed: noNegativeZero(entity.speed),
    scanClass: entity.scanClass,
    specKey: entity.specKey,
    ownerId: noNegativeZero(entity.ownerId),
    spawnTick: noNegativeZero(entity.spawnTick),
    rng: { ai: noNegativeZero(rng.ai), combat: noNegativeZero(rng.combat) },
    nav: {
      behaviour: nav.behaviour,
      targetId: noNegativeZero(nav.targetId),
      destination: {
        x: noNegativeZero(nav.destination.x),
        y: noNegativeZero(nav.destination.y),
        z: noNegativeZero(nav.destination.z),
      },
      desiredRange: noNegativeZero(nav.desiredRange),
      desiredSpeed: noNegativeZero(nav.desiredSpeed),
    },
    ai: entity.ai === null ? null : copyAi(entity.ai),
    repairs: noNegativeZero(entity.repairs),
    energy: noNegativeZero(entity.energy),
    maxEnergy: noNegativeZero(entity.maxEnergy),
    energyRechargeRate: noNegativeZero(entity.energyRechargeRate),
    steer: snapshotSteer(entity.steer),
    velocity: copyVec(entity.velocity),
    weapon: {
      temperature: noNegativeZero(entity.weapon.temperature),
      lastShotTick: noNegativeZero(entity.weapon.lastShotTick),
      missedShots: noNegativeZero(entity.weapon.missedShots),
    },
    cargo: noNegativeZero(entity.cargo),
  };
}

function requireFiniteBuoy(buoy: BuoyState, at: string): void {
  requireFinite(buoy.offset.x, `${at}.offset.x`);
  requireFinite(buoy.offset.y, `${at}.offset.y`);
  requireFinite(buoy.offset.z, `${at}.offset.z`);
  requireFinite(buoy.velocity.x, `${at}.velocity.x`);
  requireFinite(buoy.velocity.y, `${at}.velocity.y`);
  requireFinite(buoy.velocity.z, `${at}.velocity.z`);
  requireFinite(buoy.subentityEnergy, `${at}.subentityEnergy`);
}

function snapshotBuoy(buoy: BuoyState): BuoyStateSnapshot {
  return {
    offset: copyVec(buoy.offset),
    velocity: copyVec(buoy.velocity),
    subentityEnergy: noNegativeZero(buoy.subentityEnergy),
    subentityTakingDamage: buoy.subentityTakingDamage,
  };
}

/**
 * The plain JSON-safe snapshot of `world`: deep copies only, so mutating the
 * result never reaches the live world. Throws a `SnapshotError` with reason
 * "uncommitted" for a killed but uncommitted entity, "queue-not-empty" for an
 * undrained AI event or fire request and "non-finite" for a NaN or infinite number anywhere in
 * the world or its entities; nothing is returned in those cases, so no JSON
 * with a null in a number slot is ever produced.
 */
export function snapshotWorld(world: World): WorldSnapshot {
  for (const entity of world.store.live) {
    if (entity.dead) {
      throw new SnapshotError(
        "uncommitted",
        `entity ${String(entity.id)} is dead but not committed`,
      );
    }
  }
  if (world.aiQueue.length > 0) {
    throw new SnapshotError(
      "queue-not-empty",
      `${String(world.aiQueue.length)} AI event(s) are not drained`,
    );
  }
  if (world.fireQueue.length > 0) {
    throw new SnapshotError(
      "queue-not-empty",
      `${String(world.fireQueue.length)} fire request(s) are not resolved`,
    );
  }
  requireFinite(world.worldSeed, "worldSeed");
  requireFinite(world.store.nextId, "nextId");
  requireFinite(world.rng.s, "rng");
  requireFinite(world.aiDropped, "aiDropped");
  requireFinite(world.staticHealth.station, "staticHealth.station");
  requireFinite(world.staticHealth.witchpoint, "staticHealth.witchpoint");
  requireFinite(world.staticHealth.navBuoy, "staticHealth.navBuoy");
  requireFiniteBuoy(world.buoys.witchpoint, "buoys.witchpoint");
  requireFiniteBuoy(world.buoys.navBuoy, "buoys.navBuoy");
  for (const entity of world.store.live) requireFiniteEntity(entity);
  return {
    format: WORLD_SNAPSHOT_FORMAT,
    version: WORLD_SNAPSHOT_VERSION,
    worldSeed: world.worldSeed,
    nextId: world.store.nextId,
    rng: world.rng.s,
    aiDropped: world.aiDropped,
    staticHealth: {
      station: noNegativeZero(world.staticHealth.station),
      witchpoint: noNegativeZero(world.staticHealth.witchpoint),
      navBuoy: noNegativeZero(world.staticHealth.navBuoy),
    },
    // Pristine-omit (PD-01, PD-02): pristine buoys add no key.
    ...(isPristineBuoyStates(world.buoys)
      ? {}
      : {
          buoys: {
            witchpoint: snapshotBuoy(world.buoys.witchpoint),
            navBuoy: snapshotBuoy(world.buoys.navBuoy),
          },
        }),
    entities: world.store.live.map(snapshotEntity),
  };
}

// ---------------------------------------------------------------------------
// parseWorldSnapshot

function fail(
  reason: SnapshotErrorReason,
  path: string,
  detail?: string,
): never {
  throw new SnapshotError(
    reason,
    detail === undefined ? path : `${path}: ${detail}`,
  );
}

/**
 * `value` as a plain object. `allowed` lists the only own keys it may carry;
 * undefined means any key (the `ai.params` dictionary), where only the forbidden
 * names are refused here.
 */
function asObject(
  value: unknown,
  path: string,
  allowed: readonly string[] | undefined,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("not-object", path, "expected an object");
  }
  const object = value as Record<string, unknown>;
  for (const key of Object.keys(object)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      fail("forbidden-key", path, `own key "${key}"`);
    }
    if (allowed !== undefined && !allowed.includes(key)) {
      fail("unknown-key", path, `unknown key "${key}"`);
    }
  }
  return object;
}

/** One own property, read once; undefined when absent. */
function read(object: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(object, key) ? object[key] : undefined;
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number") {
    return fail(
      value === null ? "non-finite" : "type",
      path,
      "expected a finite number",
    );
  }
  if (!Number.isFinite(value)) return fail("non-finite", path);
  return value;
}

function boundedNumber(value: unknown, path: string): number {
  const n = finiteNumber(value, path);
  if (Math.abs(n) > MAX_ENTITY_MAGNITUDE) {
    return fail("magnitude", path, "exceeds the magnitude cap");
  }
  return noNegativeZero(n);
}

function nonNegativeNumber(value: unknown, path: string): number {
  const n = boundedNumber(value, path);
  if (n < 0) return fail("range", path, "must not be negative");
  return n;
}

/** A finite number in `0..limit`: `magnitude` above it, `range` below zero. */
function limitedNumber(value: unknown, path: string, limit: number): number {
  const n = finiteNumber(value, path);
  if (n > limit) return fail("magnitude", path, "exceeds its limit");
  if (n < 0) return fail("range", path, "must not be negative");
  return noNegativeZero(n);
}

function uint32(
  value: unknown,
  path: string,
  reason: SnapshotErrorReason,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_UINT32
  ) {
    return fail(reason, path, "expected an unsigned 32-bit integer");
  }
  return noNegativeZero(value);
}

function legalString(value: unknown, path: string): string {
  if (typeof value !== "string") return fail("type", path, "expected a string");
  if (value.length > MAX_SNAPSHOT_STRING_LENGTH) {
    return fail("string", path, "string is too long");
  }
  return value;
}

function vocabulary(
  value: unknown,
  path: string,
  names: readonly string[],
): string {
  if (typeof value !== "string" || !names.includes(value)) {
    return fail("vocabulary", path, "not a known name");
  }
  return value;
}

function parseVector(value: unknown, path: string): VectorSnapshot {
  const o = asObject(value, path, ["x", "y", "z"]);
  return {
    x: boundedNumber(read(o, "x"), `${path}.x`),
    y: boundedNumber(read(o, "y"), `${path}.y`),
    z: boundedNumber(read(o, "z"), `${path}.z`),
  };
}

function parseQuaternion(value: unknown, path: string): QuaternionSnapshot {
  const o = asObject(value, path, ["w", "x", "y", "z"]);
  const w = finiteNumber(read(o, "w"), `${path}.w`);
  const x = finiteNumber(read(o, "x"), `${path}.x`);
  const y = finiteNumber(read(o, "y"), `${path}.y`);
  const z = finiteNumber(read(o, "z"), `${path}.z`);
  const normSq = w * w + x * x + y * y + z * z;
  if (
    !Number.isFinite(normSq) ||
    !(normSq > 0) ||
    Math.abs(normSq - 1) > QUAT_UNIT_TOLERANCE
  ) {
    return fail("quaternion", path, "not a unit quaternion");
  }
  return {
    w: noNegativeZero(w),
    x: noNegativeZero(x),
    y: noNegativeZero(y),
    z: noNegativeZero(z),
  };
}

function parseParamValue(value: unknown, path: string): ParamValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return boundedNumber(value, path);
  if (typeof value === "string") return legalString(value, path);
  if (!Array.isArray(value)) {
    return fail("param", path, "nested objects are not legal params");
  }
  const source = value as readonly unknown[];
  if (source.length > MAX_SNAPSHOT_PARAM_LENGTH) {
    return fail("param", path, "array is too long");
  }
  const out: (number | string)[] = [];
  for (let i = 0; i < source.length; i += 1) {
    const element = source[i];
    const at = `${path}[${String(i)}]`;
    if (typeof element === "number") out.push(boundedNumber(element, at));
    else if (typeof element === "string") out.push(legalString(element, at));
    else fail("param", at, "elements are finite numbers or strings only");
  }
  return out;
}

function parseParams(value: unknown, path: string): Record<string, ParamValue> {
  const o = asObject(value, path, undefined);
  const keys = Object.keys(o).sort(compareCodeUnits);
  if (keys.length > MAX_AI_PARAMS_KEYS) {
    fail("param", path, "too many keys");
  }
  const out = Object.create(null) as Record<string, ParamValue>;
  for (const key of keys) {
    const at = `${path}.${key}`;
    if (key.length === 0 || key.length > MAX_SNAPSHOT_STRING_LENGTH) {
      fail("string", at, "param key length is out of range");
    }
    out[key] = parseParamValue(read(o, key), at);
  }
  return out;
}

function parseAi(value: unknown, path: string): AiComponent | null {
  if (value === null) return null;
  const o = asObject(value, path, [
    "aiKey",
    "params",
    "wakeTick",
    "nextThinkTick",
  ]);
  const aiKey = vocabulary(read(o, "aiKey"), `${path}.aiKey`, AI_KEYS) as AiKey;
  const params = parseParams(read(o, "params"), `${path}.params`);
  const wakeTick = uint32(read(o, "wakeTick"), `${path}.wakeTick`, "counter");
  const nextThinkTick = uint32(
    read(o, "nextThinkTick"),
    `${path}.nextThinkTick`,
    "counter",
  );
  return { aiKey, params, wakeTick, nextThinkTick };
}

function parseNav(value: unknown, path: string): NavSnapshot {
  const o = asObject(value, path, [
    "behaviour",
    "targetId",
    "destination",
    "desiredRange",
    "desiredSpeed",
  ]);
  return {
    behaviour: vocabulary(
      read(o, "behaviour"),
      `${path}.behaviour`,
      BEHAVIOUR_IDS,
    ) as BehaviourId,
    targetId: uint32(read(o, "targetId"), `${path}.targetId`, "counter"),
    destination: parseVector(read(o, "destination"), `${path}.destination`),
    desiredRange: nonNegativeNumber(
      read(o, "desiredRange"),
      `${path}.desiredRange`,
    ),
    desiredSpeed: nonNegativeNumber(
      read(o, "desiredSpeed"),
      `${path}.desiredSpeed`,
    ),
  };
}

function parseStreams(value: unknown, path: string): EntityStreams {
  const o = asObject(value, path, ["ai", "combat"]);
  return {
    ai: uint32(read(o, "ai"), `${path}.ai`, "stream"),
    combat: uint32(read(o, "combat"), `${path}.combat`, "stream"),
  };
}

function parseRadius(value: unknown, path: string): number {
  const n = boundedNumber(value, path);
  if (!(n > 0)) return fail("range", path, "radius must be positive");
  return n;
}

/** A boolean; any other type is refused. */
function flag(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") {
    return fail("type", path, "expected a boolean");
  }
  return value;
}

/** A finite number with `|n| <= limit`: `magnitude` above it. */
function symmetricNumber(value: unknown, path: string, limit: number): number {
  const n = finiteNumber(value, path);
  if (Math.abs(n) > limit) return fail("magnitude", path, "exceeds its limit");
  return noNegativeZero(n);
}

/** The unresolved accuracy sentinel or a resolved value in its range. */
function parseAccuracy(value: unknown, path: string): number {
  const n = finiteNumber(value, path);
  if (n === ACCURACY_UNRESOLVED) return n;
  if (n < MIN_ACCURACY || n > MAX_ACCURACY) {
    return fail("range", path, "outside the accuracy range");
  }
  return noNegativeZero(n);
}

/** An integer in `0..max`; a non-integer or an out-of-range value is `range`. */
function boundedInteger(value: unknown, path: string, max: number): number {
  const n = finiteNumber(value, path);
  if (!Number.isSafeInteger(n) || n < 0 || n > max) {
    return fail("range", path, `expected an integer in 0..${String(max)}`);
  }
  return noNegativeZero(n);
}

/** A signed integer tick with `|tick| <= MAX_UINT32`. */
function signedTick(value: unknown, path: string): number {
  const n = finiteNumber(value, path);
  if (!Number.isSafeInteger(n)) return fail("counter", path, "not an integer");
  if (Math.abs(n) > MAX_UINT32) {
    return fail("magnitude", path, "exceeds the signed tick domain");
  }
  return noNegativeZero(n);
}

/** An array of exactly `TRACKING_SAMPLES` elements, each parsed once. */
function parseSamples<T>(
  value: unknown,
  path: string,
  parseOne: (element: unknown, at: string) => T,
): [T, T, T, T] {
  if (!Array.isArray(value)) return fail("type", path, "expected an array");
  const source = value as readonly unknown[];
  if (source.length !== TRACKING_SAMPLES) {
    return fail("type", path, "expected exactly four samples");
  }
  const at = (i: number): string => `${path}[${String(i)}]`;
  return [
    parseOne(source[0], at(0)),
    parseOne(source[1], at(1)),
    parseOne(source[2], at(2)),
    parseOne(source[3], at(3)),
  ];
}

function parseSaved(
  value: unknown,
  path: string,
): SavedConditionSnapshot | null {
  if (value === null) return null;
  const o = asObject(value, path, [
    "behaviour",
    "targetId",
    "desiredRange",
    "desiredSpeed",
    "destination",
  ]);
  return {
    behaviour: vocabulary(
      read(o, "behaviour"),
      `${path}.behaviour`,
      BEHAVIOUR_IDS,
    ) as BehaviourId,
    targetId: uint32(read(o, "targetId"), `${path}.targetId`, "counter"),
    desiredRange: nonNegativeNumber(
      read(o, "desiredRange"),
      `${path}.desiredRange`,
    ),
    desiredSpeed: nonNegativeNumber(
      read(o, "desiredSpeed"),
      `${path}.desiredSpeed`,
    ),
    destination: parseVector(read(o, "destination"), `${path}.destination`),
  };
}

/**
 * The steering record. `trackingCount` is 0 or 4; with 4 the ticks must strictly
 * decrease (so `calculateTrackingCurve` never divides by zero), and with 0 every
 * tick and position must be zero, the canonical form `snapshotWorld` writes. A
 * state outside that is refused, never repaired.
 */
function parseSteer(value: unknown, path: string): SteerSnapshot {
  const o = asObject(value, path, [
    "flightRoll",
    "flightPitch",
    "stickRoll",
    "stickPitch",
    "accuracy",
    "frustration",
    "successFactor",
    "pitchingOver",
    "jink",
    "proximityAlert",
    "escortSlot",
    "trackingCount",
    "trackingTicks",
    "trackingPositions",
    "saved",
    "entryPending",
  ]);
  const flightRoll = symmetricNumber(
    read(o, "flightRoll"),
    `${path}.flightRoll`,
    MAX_STEER_RATE,
  );
  const flightPitch = symmetricNumber(
    read(o, "flightPitch"),
    `${path}.flightPitch`,
    MAX_STEER_RATE,
  );
  const stickRoll = symmetricNumber(
    read(o, "stickRoll"),
    `${path}.stickRoll`,
    MAX_STEER_RATE,
  );
  const stickPitch = symmetricNumber(
    read(o, "stickPitch"),
    `${path}.stickPitch`,
    MAX_STEER_RATE,
  );
  const accuracy = parseAccuracy(read(o, "accuracy"), `${path}.accuracy`);
  const frustration = limitedNumber(
    read(o, "frustration"),
    `${path}.frustration`,
    MAX_FRUSTRATION,
  );
  const successFactor = boundedNumber(
    read(o, "successFactor"),
    `${path}.successFactor`,
  );
  const pitchingOver = flag(read(o, "pitchingOver"), `${path}.pitchingOver`);
  const jink = parseVector(read(o, "jink"), `${path}.jink`);
  const proximityAlert = uint32(
    read(o, "proximityAlert"),
    `${path}.proximityAlert`,
    "counter",
  );
  const escortSlot = boundedInteger(
    read(o, "escortSlot"),
    `${path}.escortSlot`,
    MAX_ESCORT_SLOT,
  );
  const trackingCount = boundedInteger(
    read(o, "trackingCount"),
    `${path}.trackingCount`,
    TRACKING_SAMPLES,
  );
  if (trackingCount !== 0 && trackingCount !== TRACKING_SAMPLES) {
    fail("range", `${path}.trackingCount`, "expected 0 or 4");
  }
  const trackingTicks = parseSamples(
    read(o, "trackingTicks"),
    `${path}.trackingTicks`,
    signedTick,
  );
  const trackingPositions = parseSamples(
    read(o, "trackingPositions"),
    `${path}.trackingPositions`,
    parseVector,
  );
  if (trackingCount === TRACKING_SAMPLES) {
    const [a, b, c, d] = trackingTicks;
    if (!(a > b && b > c && c > d)) {
      fail("range", `${path}.trackingTicks`, "not strictly decreasing");
    }
  } else if (
    trackingTicks.some((tick) => tick !== 0) ||
    trackingPositions.some((p) => p.x !== 0 || p.y !== 0 || p.z !== 0)
  ) {
    fail("range", `${path}.trackingCount`, "stale samples at count 0");
  }
  const saved = parseSaved(read(o, "saved"), `${path}.saved`);
  const entryPending = flag(read(o, "entryPending"), `${path}.entryPending`);
  return {
    flightRoll,
    flightPitch,
    stickRoll,
    stickPitch,
    accuracy,
    frustration,
    successFactor,
    pitchingOver,
    jink,
    proximityAlert,
    escortSlot,
    trackingCount,
    trackingTicks,
    trackingPositions,
    saved,
    entryPending,
  };
}

/** A velocity: finite components of magnitude at most `MAX_ENTITY_VELOCITY`. */
function parseVelocity(value: unknown, path: string): VectorSnapshot {
  const o = asObject(value, path, ["x", "y", "z"]);
  const component = (key: "x" | "y" | "z"): number => {
    const n = finiteNumber(read(o, key), `${path}.${key}`);
    if (Math.abs(n) > MAX_ENTITY_VELOCITY) {
      return fail("magnitude", `${path}.${key}`, "exceeds its limit");
    }
    return noNegativeZero(n);
  };
  return { x: component("x"), y: component("y"), z: component("z") };
}

function parseWeapon(value: unknown, path: string): WeaponSnapshot {
  const o = asObject(value, path, [
    "temperature",
    "lastShotTick",
    "missedShots",
  ]);
  return {
    temperature: limitedNumber(
      read(o, "temperature"),
      `${path}.temperature`,
      MAX_WEAPON_TEMPERATURE,
    ),
    lastShotTick: uint32(
      read(o, "lastShotTick"),
      `${path}.lastShotTick`,
      "counter",
    ),
    missedShots: uint32(
      read(o, "missedShots"),
      `${path}.missedShots`,
      "counter",
    ),
  };
}

function parseStaticHealth(value: unknown, path: string): StaticHealthSnapshot {
  const o = asObject(value, path, ["station", "witchpoint", "navBuoy"]);
  return {
    station: limitedNumber(
      read(o, "station"),
      `${path}.station`,
      STATION_MAX_ENERGY,
    ),
    witchpoint: limitedNumber(
      read(o, "witchpoint"),
      `${path}.witchpoint`,
      BUOY_MAX_ENERGY,
    ),
    navBuoy: limitedNumber(
      read(o, "navBuoy"),
      `${path}.navBuoy`,
      BUOY_MAX_ENERGY,
    ),
  };
}

function parseBuoy(value: unknown, path: string): BuoyStateSnapshot {
  const o = asObject(value, path, [
    "offset",
    "velocity",
    "subentityEnergy",
    "subentityTakingDamage",
  ]);
  return {
    offset: parseVector(read(o, "offset"), `${path}.offset`),
    velocity: parseVelocity(read(o, "velocity"), `${path}.velocity`),
    subentityEnergy: finiteNumber(
      read(o, "subentityEnergy"),
      `${path}.subentityEnergy`,
    ),
    subentityTakingDamage: flag(
      read(o, "subentityTakingDamage"),
      `${path}.subentityTakingDamage`,
    ),
  };
}

function parseBuoys(value: unknown, path: string): BuoyStatesSnapshot {
  const o = asObject(value, path, ["witchpoint", "navBuoy"]);
  return {
    witchpoint: parseBuoy(read(o, "witchpoint"), `${path}.witchpoint`),
    navBuoy: parseBuoy(read(o, "navBuoy"), `${path}.navBuoy`),
  };
}

function parseEntity(value: unknown, path: string): EntitySnapshot {
  const o = asObject(value, path, [
    "id",
    "kind",
    "position",
    "orientation",
    "radius",
    "speed",
    "scanClass",
    "specKey",
    "ownerId",
    "spawnTick",
    "rng",
    "nav",
    "ai",
    "repairs",
    "energy",
    "maxEnergy",
    "energyRechargeRate",
    "steer",
    "velocity",
    "weapon",
    "cargo",
  ]);
  const id = read(o, "id");
  if (
    typeof id !== "number" ||
    !Number.isSafeInteger(id) ||
    id < FIRST_DYNAMIC_ID ||
    id > MAX_UINT32
  ) {
    return fail("entity-id", `${path}.id`, "not a dynamic entity id");
  }
  const kind = vocabulary(
    read(o, "kind"),
    `${path}.kind`,
    ENTITY_KINDS,
  ) as EntityKind;
  const position = parseVector(read(o, "position"), `${path}.position`);
  const orientation = parseQuaternion(
    read(o, "orientation"),
    `${path}.orientation`,
  );
  const radius = parseRadius(read(o, "radius"), `${path}.radius`);
  const speed = nonNegativeNumber(read(o, "speed"), `${path}.speed`);
  const scanClass = vocabulary(
    read(o, "scanClass"),
    `${path}.scanClass`,
    SCAN_CLASSES,
  ) as ScanClass;
  const specKey = legalString(read(o, "specKey"), `${path}.specKey`);
  if (specKey.length === 0) fail("string", `${path}.specKey`, "is empty");
  const ownerId = uint32(read(o, "ownerId"), `${path}.ownerId`, "counter");
  const spawnTick = uint32(
    read(o, "spawnTick"),
    `${path}.spawnTick`,
    "counter",
  );
  const rng = parseStreams(read(o, "rng"), `${path}.rng`);
  const nav = parseNav(read(o, "nav"), `${path}.nav`);
  const ai = parseAi(read(o, "ai"), `${path}.ai`);
  const repairs = uint32(read(o, "repairs"), `${path}.repairs`, "counter");
  const maxEnergy = limitedNumber(
    read(o, "maxEnergy"),
    `${path}.maxEnergy`,
    MAX_ENTITY_ENERGY,
  );
  const energy = limitedNumber(read(o, "energy"), `${path}.energy`, maxEnergy);
  const energyRechargeRate = limitedNumber(
    read(o, "energyRechargeRate"),
    `${path}.energyRechargeRate`,
    MAX_ENERGY_RECHARGE_RATE,
  );
  const steer = parseSteer(read(o, "steer"), `${path}.steer`);
  const velocity = parseVelocity(read(o, "velocity"), `${path}.velocity`);
  const weapon = parseWeapon(read(o, "weapon"), `${path}.weapon`);
  const cargo = uint32(read(o, "cargo"), `${path}.cargo`, "counter");
  if (cargo > MAX_ENTITY_CARGO) {
    fail("magnitude", `${path}.cargo`, "exceeds its limit");
  }
  return {
    id,
    kind,
    position,
    orientation,
    radius,
    speed,
    scanClass,
    specKey,
    ownerId,
    spawnTick,
    rng,
    nav,
    ai,
    repairs,
    energy,
    maxEnergy,
    energyRechargeRate,
    steer,
    velocity,
    weapon,
    cargo,
  };
}

/**
 * Validate `input` and return a fresh `WorldSnapshot` that shares no reference
 * with it. Throws a `SnapshotError` whose `reason` names the first violation.
 * Never trusts a prototype: only own properties are read.
 */
export function parseWorldSnapshot(input: unknown): WorldSnapshot {
  const root = asObject(input, "snapshot", [
    "format",
    "version",
    "worldSeed",
    "nextId",
    "rng",
    "aiDropped",
    "staticHealth",
    "buoys",
    "entities",
  ]);
  if (read(root, "format") !== WORLD_SNAPSHOT_FORMAT) {
    fail("format", "snapshot.format", "unknown format tag");
  }
  if (read(root, "version") !== WORLD_SNAPSHOT_VERSION) {
    fail("version", "snapshot.version", "unsupported version");
  }
  const worldSeed = uint32(
    read(root, "worldSeed"),
    "snapshot.worldSeed",
    "world-seed",
  );
  const nextId = read(root, "nextId");
  if (
    typeof nextId !== "number" ||
    !Number.isSafeInteger(nextId) ||
    nextId < FIRST_DYNAMIC_ID ||
    nextId > MAX_UINT32 + 1
  ) {
    fail("next-id", "snapshot.nextId", "outside the id counter range");
  }
  const rng = uint32(read(root, "rng"), "snapshot.rng", "stream");
  const aiDropped = uint32(
    read(root, "aiDropped"),
    "snapshot.aiDropped",
    "counter",
  );
  const staticHealth = parseStaticHealth(
    read(root, "staticHealth"),
    "snapshot.staticHealth",
  );
  // Optional (PD-01, PD-02): absent means pristine buoys.
  const buoysValue = read(root, "buoys");
  const buoys =
    buoysValue === undefined
      ? undefined
      : parseBuoys(buoysValue, "snapshot.buoys");
  const source = read(root, "entities");
  if (!Array.isArray(source)) {
    return fail("entities", "snapshot.entities", "expected an array");
  }
  const list = source as readonly unknown[];
  if (list.length > MAX_ENTITIES) {
    fail("too-many-entities", "snapshot.entities", "over the entity cap");
  }
  const entities: EntitySnapshot[] = [];
  let maxId = FIRST_DYNAMIC_ID - 1;
  for (let i = 0; i < list.length; i += 1) {
    const entity = parseEntity(list[i], `snapshot.entities[${String(i)}]`);
    if (entity.id <= maxId) {
      fail(
        "entity-order",
        `snapshot.entities[${String(i)}].id`,
        "not ascending",
      );
    }
    maxId = entity.id;
    entities.push(entity);
  }
  if (nextId <= maxId) {
    fail("next-id", "snapshot.nextId", "does not exceed the highest id");
  }
  return {
    format: WORLD_SNAPSHOT_FORMAT,
    version: WORLD_SNAPSHOT_VERSION,
    worldSeed,
    nextId,
    rng,
    aiDropped,
    staticHealth,
    ...(buoys === undefined ? {} : { buoys }),
    entities,
  };
}

// ---------------------------------------------------------------------------
// restoreWorld

/**
 * Rebuild a world from `snapshot`. The input is validated through
 * `parseWorldSnapshot` first and the world is built from the validated deep
 * copy, so it shares no reference with the caller's object. The five static
 * entities are recreated as `createWorld` sets them; the AI queue starts empty.
 */
export function restoreWorld(snapshot: WorldSnapshot): World {
  const parsed = parseWorldSnapshot(snapshot);
  const entities: Entity[] = parsed.entities.map((e) => ({
    id: e.id,
    kind: e.kind,
    dead: false,
    position: e.position,
    orientation: e.orientation,
    radius: e.radius,
    speed: e.speed,
    scanClass: e.scanClass,
    specKey: e.specKey,
    ownerId: e.ownerId,
    spawnTick: e.spawnTick,
    rng: e.rng,
    nav: e.nav,
    ai: e.ai,
    repairs: e.repairs,
    energy: e.energy,
    maxEnergy: e.maxEnergy,
    energyRechargeRate: e.energyRechargeRate,
    steer: e.steer,
    velocity: e.velocity,
    weapon: e.weapon,
    cargo: e.cargo,
  }));
  return {
    worldSeed: parsed.worldSeed,
    statics: STATIC_ENTITIES,
    store: createEntityStore({ nextId: parsed.nextId, entities }),
    rng: createRngState(parsed.rng),
    aiQueue: [],
    fireQueue: [],
    aiDropped: parsed.aiDropped,
    staticHealth: parsed.staticHealth,
    buoys:
      parsed.buoys === undefined
        ? createBuoyStates()
        : restoreBuoys(parsed.buoys),
  };
}

function restoreBuoy(buoy: BuoyStateSnapshot): BuoyState {
  return {
    offset: buoy.offset,
    velocity: buoy.velocity,
    subentityEnergy: buoy.subentityEnergy,
    subentityTakingDamage: buoy.subentityTakingDamage,
  };
}

function restoreBuoys(buoys: BuoyStatesSnapshot): BuoyStates {
  return {
    witchpoint: restoreBuoy(buoys.witchpoint),
    navBuoy: restoreBuoy(buoys.navBuoy),
  };
}

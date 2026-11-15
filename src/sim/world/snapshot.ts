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
import { createSteerComponent } from "../npc/state.js";
import type { Entity, EntityStreams } from "./entity.js";
import {
  BEHAVIOUR_IDS,
  ENTITY_KINDS,
  FIRST_DYNAMIC_ID,
  MAX_ENTITIES,
  SCAN_CLASSES,
} from "./ids.js";
import type { BehaviourId, EntityId, EntityKind, ScanClass } from "./ids.js";
import {
  MAX_AI_PARAMS_KEYS,
  MAX_ENERGY_RECHARGE_RATE,
  MAX_ENTITY_ENERGY,
  MAX_ENTITY_MAGNITUDE,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_UINT32,
  QUAT_UNIT_TOLERANCE,
} from "./limits.js";
import { createEntityStore } from "./store.js";
import { STATIC_ENTITIES } from "./world.js";
import type { World } from "./world.js";

/** The `format` tag of every world snapshot. */
export const WORLD_SNAPSHOT_FORMAT = "wegolite-world";

/**
 * The snapshot layout version; bump on any field or limit change. Version 2
 * (Phase 13, CBT-07) adds the energy bank (`energy`, `maxEnergy`,
 * `energyRechargeRate`) to every entity; a version-1 snapshot is refused.
 */
export const WORLD_SNAPSHOT_VERSION = 2;

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
  for (const entity of world.store.live) requireFiniteEntity(entity);
  return {
    format: WORLD_SNAPSHOT_FORMAT,
    version: WORLD_SNAPSHOT_VERSION,
    worldSeed: world.worldSeed,
    nextId: world.store.nextId,
    rng: world.rng.s,
    aiDropped: world.aiDropped,
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
    // Task 2 of plan 14-08 carries the record through the snapshot; until then
    // every restored entity holds the default one (nothing steers yet).
    steer: createSteerComponent(0),
  }));
  return {
    worldSeed: parsed.worldSeed,
    statics: STATIC_ENTITIES,
    store: createEntityStore({ nextId: parsed.nextId, entities }),
    rng: createRngState(parsed.rng),
    aiQueue: [],
    fireQueue: [],
    aiDropped: parsed.aiDropped,
  };
}

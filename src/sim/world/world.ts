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

import type { AiComponent, ParamValue } from "../ai/types.js";
import { AI_KEYS } from "../ai/types.js";
import type { Quat, Vec3 } from "../math.js";
import { createRngState, forkSeed } from "../rng.js";
import type { RngState } from "../rng.js";
import type { Entity, SpawnInit, StaticEntity } from "./entity.js";
import {
  ENTITY_KINDS,
  FIRST_DYNAMIC_ID,
  MAIN_STATION_ID,
  NO_ENTITY,
  PLANET_ID,
  SCAN_CLASSES,
  STATION_NAV_BUOY_ID,
  SUN_ID,
  WITCHPOINT_BUOY_ID,
} from "./ids.js";
import type { EntityId } from "./ids.js";
import {
  MAX_AI_PARAMS_KEYS,
  MAX_ENTITY_MAGNITUDE,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_UINT32,
  QUAT_UNIT_TOLERANCE,
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

export interface World {
  readonly worldSeed: number;
  readonly statics: readonly StaticEntity[];
  readonly store: EntityStore;
  /** The world-level stream (entity id 0, purpose "world"). */
  rng: RngState;
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
  };
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
 */
export function isNeverSpawned(world: World): boolean {
  return (
    world.store.nextId === FIRST_DYNAMIC_ID &&
    world.store.live.length === 0 &&
    world.rng.s === forkSeed(world.worldSeed, NO_ENTITY, "world")
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

function isBoundedVec(v: Vec3): boolean {
  return isBounded(v.x) && isBounded(v.y) && isBounded(v.z);
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

/** Whether `init` and `tick` lie inside the shared serialised domain. */
function isLegalSpawn(init: SpawnInit, tick: number): boolean {
  if (!isUint32(tick)) return false;
  if (typeof init.specKey !== "string") return false;
  if (init.specKey.length === 0 || !isLegalString(init.specKey)) return false;
  if (!(ENTITY_KINDS as readonly string[]).includes(init.kind)) return false;
  if (!(SCAN_CLASSES as readonly string[]).includes(init.scanClass)) {
    return false;
  }
  if (!Number.isFinite(init.radius) || !(init.radius > 0)) return false;
  if (init.radius > MAX_ENTITY_MAGNITUDE) return false;
  if (init.ownerId !== undefined && !isUint32(init.ownerId)) return false;
  if (init.speed !== undefined) {
    if (!isBounded(init.speed) || init.speed < 0) return false;
  }
  if (!isBoundedVec(init.position) || !isUnitQuat(init.orientation)) {
    return false;
  }
  return init.ai === undefined || init.ai === null || isLegalAi(init.ai);
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
 * Spawn an entity. Refuses, returning undefined and leaving `nextId` untouched,
 * when `init` or `tick` lies outside the shared serialised domain
 * (`./limits.ts`, the closed vocabularies of `./ids.ts` and `../ai/types.ts`)
 * or when the store is full. Membership checks use `Array.prototype.includes`
 * over the vocabulary arrays, never the `in` operator, so a prototype name such
 * as "constructor" is refused. The orientation must already be a unit
 * quaternion: spawn neither normalises nor accepts a near-zero norm.
 *
 * The entity's streams are forked from `(worldSeed, id, purpose)` here and
 * stored as plain uint32 states, so spawning or killing another entity never
 * changes its draws (D-04).
 */
export function spawnEntity(
  world: World,
  init: SpawnInit,
  tick: number,
): Entity | undefined {
  if (!isLegalSpawn(init, tick)) return undefined;
  return world.store.allocate((id) => {
    const speed = init.speed ?? 0;
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
    };
  });
}

/** Mark an entity dead; it leaves `live` at the next `commitWorld`. */
export function killEntity(world: World, id: EntityId): boolean {
  return world.store.kill(id);
}

/** Remove dead entities; returns their ids ascending. */
export function commitWorld(world: World): EntityId[] {
  return world.store.commit();
}

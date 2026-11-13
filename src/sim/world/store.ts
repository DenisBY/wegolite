// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The dynamic entity store (FOUND-11, D-06).
 *
 * `live` is strictly ascending by id and includes entities spawned this tick
 * and not-yet-committed dead ones. Lookup is a binary search over that array:
 * there is no `Map`, no `Set` and no object used as an index, so after any
 * restore no container iteration order can decide anything. Ids come from a
 * stored counter that only increases within one store, so an id never comes
 * back in its world, not even after the highest id is killed and committed. A
 * refused allocation leaves the counter unchanged.
 *
 * Scope: `get` and `live` are simulation-internal. `src/app/**` must never
 * import this module; it reads `liveEntityCount` from `./world.ts`. The module
 * declares no module-level mutable binding: the counter lives in the store
 * object, so no state can carry ids from one world into the next (per-world id
 * scope, CONTEXT D-06 as amended 2026-11-12).
 */

import type { Entity } from "./entity.js";
import { FIRST_DYNAMIC_ID, MAX_ENTITIES } from "./ids.js";
import type { EntityId } from "./ids.js";
import { MAX_UINT32 } from "./limits.js";

export interface EntityStore {
  /** Strictly ascending by id; includes this tick's spawns and uncommitted dead. */
  readonly live: readonly Entity[];
  /** The id the next successful allocation issues. Only ever increases. */
  readonly nextId: number;
  /** The live, non-dead entity with `id`; undefined for a missing or dead id. */
  get(id: EntityId): Entity | undefined;
  /**
   * Allocate the next id and store the entity `make` builds for it. Refuses
   * (returns undefined, `nextId` unchanged) when MAX_ENTITIES non-dead entities
   * are already stored or when the counter cannot issue a uint32 id. `make`
   * must return an entity whose `id` is the id it was given.
   */
  allocate(make: (id: EntityId) => Entity): Entity | undefined;
  /** Mark the entity dead. False for a missing or already dead id. */
  kill(id: EntityId): boolean;
  /** Remove dead entities in place; returns their ids in ascending order. */
  commit(): EntityId[];
}

/** The index of `id` in `entities`, or -1. A binary search over ascending ids. */
function indexOfId(entities: readonly Entity[], id: EntityId): number {
  let low = 0;
  let high = entities.length - 1;
  while (low <= high) {
    const mid = (low + high) >>> 1;
    const entity = entities[mid] as Entity;
    if (entity.id === id) return mid;
    if (entity.id < id) low = mid + 1;
    else high = mid - 1;
  }
  return -1;
}

/**
 * A store, empty at `FIRST_DYNAMIC_ID` by default. `init` restores one
 * (plan 08-13): the entities must be strictly ascending and below `nextId`,
 * otherwise a RangeError is thrown, because the lookup and the id rule both
 * depend on it.
 */
export function createEntityStore(init?: {
  nextId: number;
  entities: readonly Entity[];
}): EntityStore {
  const items: Entity[] = init === undefined ? [] : [...init.entities];
  let next = init === undefined ? FIRST_DYNAMIC_ID : init.nextId;
  const last = items[items.length - 1];
  if (last !== undefined && last.id >= next) {
    throw new RangeError(
      `nextId ${next} must exceed the highest stored id ${last.id}`,
    );
  }
  for (let i = 1; i < items.length; i += 1) {
    if ((items[i] as Entity).id <= (items[i - 1] as Entity).id) {
      throw new RangeError("stored entity ids must be strictly ascending");
    }
  }

  return {
    get live(): readonly Entity[] {
      return items;
    },
    get nextId(): number {
      return next;
    },
    get(id: EntityId): Entity | undefined {
      const index = indexOfId(items, id);
      if (index < 0) return undefined;
      const entity = items[index] as Entity;
      return entity.dead ? undefined : entity;
    },
    allocate(make: (id: EntityId) => Entity): Entity | undefined {
      if (!Number.isSafeInteger(next) || next > MAX_UINT32) return undefined;
      if (items.filter((entity) => !entity.dead).length >= MAX_ENTITIES) {
        return undefined;
      }
      const entity = make(next);
      items.push(entity);
      next += 1;
      return entity;
    },
    kill(id: EntityId): boolean {
      const index = indexOfId(items, id);
      if (index < 0) return false;
      const entity = items[index] as Entity;
      if (entity.dead) return false;
      entity.dead = true;
      return true;
    },
    commit(): EntityId[] {
      const removed: EntityId[] = [];
      let write = 0;
      for (const entity of items) {
        if (entity.dead) removed.push(entity.id);
        else {
          items[write] = entity;
          write += 1;
        }
      }
      items.length = write;
      return removed;
    },
  };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `killShip`: the one idempotent kill path (FOUND-19, D-02, D-04, D-13).
 *
 * It lives in `src/sim/world/` and not in `combat/` so that Phase 16's debris
 * expiry inside `stepWorld` can call it without importing combat. It marks an
 * entity dead through `world.store.kill`; the entity leaves `live` at the next
 * `commitWorld`, which the caller runs (the second commit of
 * `resolveShots`, `../combat/step.ts`).
 *
 * A ship leaves the world through this function and nowhere else in
 * non-test code. The bare `killEntity` of `./world.ts` is a test-only primitive,
 * and the one other removal is the sanitiser's repair of an entity whose kind is
 * unknown (`sanitizeEntity`), which is never a ship.
 *
 * The killer is normalised here, at the call (D-04: a dead or missing killer is
 * tolerated, recorded as `NO_ENTITY`): `PLAYER_ID` stays `PLAYER_ID`; any other
 * id stays only when it is a safe integer in `0..MAX_UINT32`, differs from the
 * victim and names a live ship in the store at this moment. A killer that an
 * earlier `killShip` of the same pass already marked dead therefore becomes
 * `NO_ENTITY`, so in a same-tick mutual kill, resolved in ascending victim id,
 * the lower-id victim is credited to the other ship and the higher-id victim
 * carries `NO_ENTITY`.
 *
 * The player, the station and the buoys are never in the store, so they never
 * die here (D-13).
 *
 * Total (D-15): a missing, static, dead or non-finite id changes nothing and
 * returns false.
 */

import type { SimEvent } from "../events.js";
import { NO_ENTITY, PLAYER_ID } from "./ids.js";
import type { EntityId } from "./ids.js";
import { MAX_UINT32 } from "./limits.js";
import type { World } from "./world.js";

/** The killer to record: the player, a live ship other than the victim, or nobody. */
function normaliseKiller(
  world: World,
  victim: EntityId,
  killer: EntityId,
): EntityId {
  if (killer === PLAYER_ID) return PLAYER_ID;
  if (!Number.isSafeInteger(killer) || killer < 0 || killer > MAX_UINT32) {
    return NO_ENTITY;
  }
  if (killer === NO_ENTITY || killer === victim) return NO_ENTITY;
  return world.store.get(killer)?.kind === "ship" ? killer : NO_ENTITY;
}

/**
 * Destroy the entity `id`: returns false (and changes nothing) when it is
 * missing, already dead or static; otherwise marks it dead and returns true.
 *
 * A ship also gets a `shipDestroyed` event with its position, radius and spec
 * key and the normalised killer. Any other kind (Phase 16's cargo and wreckage)
 * is only marked dead.
 */
export function killShip(
  world: World,
  id: EntityId,
  killer: EntityId,
  events: SimEvent[],
): boolean {
  const entity = world.store.get(id);
  if (entity === undefined) return false;
  // Capture before the kill: `kill` flips `dead`, and a ship's fields stay valid.
  const kind = entity.kind;
  if (!world.store.kill(id)) return false;
  if (kind !== "ship") return true;
  events.push({
    kind: "shipDestroyed",
    id,
    position: {
      x: entity.position.x,
      y: entity.position.y,
      z: entity.position.z,
    },
    radius: entity.radius,
    specKey: entity.specKey,
    killer: normaliseKiller(world, id, killer),
  });
  return true;
}

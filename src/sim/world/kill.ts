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
 * Notifications (D-04, FOUND-19). After `shipDestroyed`, a ship's death posts AI
 * events through `postAiEvent` (never delivered here, never a write to another
 * ship's `nav` or `steer`): `shipTargetLost` to every live ship other than the
 * victim whose `nav.targetId` is the victim, in ascending id; then, when the
 * normalised killer is a live NPC ship, `shipTargetDestroyed` and
 * `shipKilledOther` to it, both with `a` the victim. A killer normalised to
 * `NO_ENTITY` (dead or missing at this call) is told nothing, and the player has
 * no AI (its lock ends through `updateIdentTarget`). The caller delivers them
 * with `drainAiEventsNow` before the tick's second commit. Oolite gates
 * `noteTargetDestroyed` on the primary target and tells third parties one
 * update later through `noteLostTargetAndGoIdle` (`ShipEntity.m:8774-8812`);
 * here the killer is told regardless of its own target and third parties at
 * kill time, so a holder whose handler does not change its behaviour can get
 * `shipTargetLost` twice (at kill time, then from its own steering on its next
 * update), and every `onEvent` must be idempotent for that event.
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
import { postAiEvent } from "./world.js";
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
 * Tell the ships that care: `shipTargetLost` to every live ship that held
 * `victim` as its target (one bounded ascending pass over at most `MAX_ENTITIES`
 * ships), then the killer's pair when it is an NPC ship.
 */
function notifyKill(world: World, victim: EntityId, killer: EntityId): void {
  for (const holder of world.store.live) {
    if (holder.dead || holder.kind !== "ship" || holder.id === victim) continue;
    if (holder.nav.targetId !== victim) continue;
    postAiEvent(world, { to: holder.id, name: "shipTargetLost" });
  }
  if (killer === NO_ENTITY || killer === PLAYER_ID) return;
  postAiEvent(world, { to: killer, name: "shipTargetDestroyed", a: victim });
  postAiEvent(world, { to: killer, name: "shipKilledOther", a: victim });
}

/**
 * Destroy the entity `id`: returns false (and changes nothing) when it is
 * missing, already dead or static; otherwise marks it dead and returns true.
 *
 * A ship also gets a `shipDestroyed` event with its position, radius and spec
 * key and the normalised killer, and posts the kill notifications described
 * above. Any other kind (Phase 16's cargo and wreckage) is only marked dead and
 * posts nothing.
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
  const normalised = normaliseKiller(world, id, killer);
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
    killer: normalised,
  });
  notifyKill(world, id, normalised);
  return true;
}

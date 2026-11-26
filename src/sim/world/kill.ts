// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `killShip`: the one idempotent kill path (FOUND-19, D-02, D-04, D-13).
 *
 * It lives in `src/sim/world/` and not in `combat/` so that Phase 16's debris
 * expiry inside `stepWorld` can call it without importing combat: debris leaves
 * the world through this same function (D-02). It marks an
 * entity dead through `world.store.kill`; the entity leaves `live` at the next
 * `commitWorld`, which the caller runs (the second commit of
 * `resolveShots`, `../combat/step.ts`).
 *
 * A ship leaves the world through this function when it dies and through
 * `retireShip` (`./retire.ts`) when it departs (docks, jumps, lands, expires),
 * and nowhere else in non-test code (pitfall C11): a departure never explodes,
 * drops cargo or credits a kill, and a death never vanishes without them.
 * `tests/guards/departure-path.test.ts` keeps the two call sets apart. The bare
 * `killEntity` of `./world.ts` is a test-only primitive, and the one other
 * removal is the sanitiser's repair of an entity whose kind is unknown
 * (`sanitizeEntity`), which is never a ship.
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
 * `killShip` never rewrites another ship's reference to the victim. Every field
 * that holds another entity's id tolerates a removed id:
 *
 * - `nav.targetId`: `targetBody` re-reads through `view.body` on every use
 *   (`../npc/target.ts`); a gone target runs `noteLostTargetAndGoIdle`, which
 *   posts `shipTargetLost` and writes 0.
 * - `steer.proximityAlert`: `proximityAlertBody` resolves through `view.body`
 *   and clears a gone id (`../npc/avoid.ts`); `runProximityPass` rewrites the
 *   alerts every tick.
 * - `steer.saved.targetId`: restored into `nav.targetId` by
 *   `resumePostProximityAlert` (`../npc/avoid.ts`), then read through
 *   `targetBody`.
 * - an escort's `ownerId`: `behaviourFormationFormUp` reads the leader through
 *   `view.ship`, undefined when gone (`../npc/behaviours/formation.ts`);
 *   `refreshEscorts` runs only for a live, steered leader, so a dead leader's
 *   followers keep their last destination.
 * - a test pilot's `params.targetId`: `hold` re-checks `view.isValid` and drops
 *   to seek (`../ai/pilots/test-pilot.ts`).
 *
 * Debris (Phase 16, `./debris.ts`). When the caller passes a `DebrisContext`,
 * a ship's debris is released here, after `shipDestroyed` and the kill
 * notifications, into the same tick: `releaseDebris` draws from the victim's own
 * `combat` stream and spawns the pieces. They are spawned after `stepWorld`'s
 * sanitise pass, are in the domain by construction, post no event and stay live
 * through the caller's second commit. Without a context (every Phase 15 caller)
 * nothing is released, and a non-ship victim never releases debris.
 *
 * The player, the station and the buoys are never in the store, so they never
 * die here (D-13). A buoy brought to 0 energy is announced by `destroyBuoy`
 * below instead (Phase 18, CBT-17): it stays in `world.statics`, its health
 * stays 0 for the life of the world (D-04), and it releases no debris (a
 * recorded divergence: Oolite's buoy releases 3 wrecks and 0 to 3 plates,
 * `ShipEntity.m:7916, 8050-8081`, drawn from a per-entity stream statics do not
 * have). With a debris context it blasts, as Oolite's buoy does (D-03): its
 * attached subentity first, then its hull (`blastBuoy`).
 *
 * Total (D-15): a missing, static, dead or non-finite id changes nothing and
 * returns false.
 */

import type { SimEvent } from "../events.js";
import { blastBuoy, blastDebrisPiece, releaseDebris } from "./debris.js";
import type { DebrisContext } from "./debris.js";
import { NO_ENTITY, PLAYER_ID } from "./ids.js";
import type { EntityId } from "./ids.js";
import type { SystemLayout } from "./layout.js";
import { MAX_UINT32 } from "./limits.js";
import { buoyPosition } from "./statics.js";
import type { StaticTarget } from "./statics.js";
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
 * above, then, with a `debris` context, releases its debris, whose blast ends
 * the release. Any other kind (Phase 16's cargo and wreckage) is only marked
 * dead, posts nothing and releases nothing; with a `debris` context a pod or
 * a plate then blasts from its centre with its model mass and radius
 * (`blastDebrisPiece`, D-03: Oolite's `becomeExplosion` deals momentum for
 * every exploding ship, `ShipEntity.m:8121-8126`). A wreck that burns out
 * leaves without a context (`./step.ts`) and so without a blast.
 */
export function killShip(
  world: World,
  id: EntityId,
  killer: EntityId,
  events: SimEvent[],
  debris?: DebrisContext,
): boolean {
  const entity = world.store.get(id);
  if (entity === undefined) return false;
  // Capture before the kill: `kill` flips `dead`, and a ship's fields stay valid.
  const kind = entity.kind;
  if (!world.store.kill(id)) return false;
  if (kind !== "ship") {
    // A pod or plate explodes too: its blast, after it is marked dead (D-03).
    if (kind === "cargo" && debris !== undefined) {
      blastDebrisPiece(world, entity, debris);
    }
    return true;
  }
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
  if (debris !== undefined) releaseDebris(world, entity, debris);
  return true;
}

/**
 * Announce the destruction of the buoy `target` (Phase 18, CBT-17, D-04, D-13):
 * one `shipDestroyed` with the static id, a copy of its live position
 * (`buoyPosition`, PD-02), its layout radius, its ident key as the spec key
 * (`"buoy"` or `"buoy-witchpoint"`) and the killer normalised as for a ship.
 * Returns whether it emitted.
 *
 * Total: it does nothing for the station, or for a buoy whose health is not
 * exactly 0 (the ledger floors a lethal hit at 0 and collects it once, so a
 * buoy is announced once per world). The buoy never enters or leaves any
 * collection and posts no AI notification (no NPC targets a static). With a
 * `debris` context it then explodes in the C's order (`blastBuoy`,
 * `ShipEntity.m:8115-8126`): its subentity, while attached, from the buoy's
 * centre with its own mass and radius, then the hull with
 * `NAV_BUOY_HULL_MASS` and the layout radius; the blast writes only the
 * receivers' velocities (and the context's player accumulator).
 */
export function destroyBuoy(
  world: World,
  target: StaticTarget,
  killer: EntityId,
  events: SimEvent[],
  layout: SystemLayout,
  debris?: DebrisContext,
): boolean {
  if (target.layoutKey === "station") return false;
  if (world.staticHealth[target.healthKey] !== 0) return false;
  const position = buoyPosition(world, layout, target.layoutKey);
  events.push({
    kind: "shipDestroyed",
    id: target.id,
    position: { x: position.x, y: position.y, z: position.z },
    radius: layout[target.layoutKey].radius,
    specKey: target.identKey,
    killer: normaliseKiller(world, target.id, killer),
  });
  if (debris !== undefined) blastBuoy(world, layout, target.layoutKey, debris);
  return true;
}

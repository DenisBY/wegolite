// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The damage ledger (FOUND-19, D-12, D-13).
 *
 * Every hit of a tick is queued as a `HitRecord` while the shots resolve
 * (`./step.ts`) and applied here, after the world step, in the order the shots
 * resolved (ascending shooter id). Damage is never applied from inside a handler
 * or mid-resolution (RESEARCH A6, Pitfall 7), so one shot cannot change what a
 * later shot of the same tick sees.
 *
 * Oolite lowers a ship's energy in `takeEnergyDamage` and calls
 * `becomeExplosion` once it is at 0 or below. Here the ledger lowers the energy
 * and reports which victims reached 0; `killShip` (`../world/kill.ts`) marks
 * them dead afterwards. The ledger itself marks nothing dead.
 *
 * Every record applies before lethality is decided (the Phase 13 rule that
 * damage is never applied mid-resolution), so a ship already doomed by an
 * earlier record of the same tick still receives `shipHit` for a later record,
 * where in Oolite it would already be dead. Consumers of `shipHit` (the HUD,
 * future audio) may therefore show a hit on a ship that dies on that tick.
 *
 * The player is a target too, but never a lethal one: a hit on the player goes
 * through `routeDamage` (the facing shield first, then energy, heating the
 * cabin), a collision's scrape through `routeScrapeDamage` (the same shield
 * rule, no heat, CBT-18), and the energy floors at 0 until the player's death
 * in Phase 20 (D-13).
 *
 * A static target (`../world/statics.ts`) is one of two kinds (Phase 18,
 * CBT-17). The main station only absorbs a hit (A6): the record posts
 * `shipHit` with `shield: false` and writes and collects nothing, so it is
 * never lethal and changes no hashed state. Oolite's main station lowers its
 * energy only while the amount is below its energy and recharges 100 per
 * second (`StationEntity.m:1110-1160`): a 15-point dip on 25,000 is gone in
 * 0.15 s and nothing reads it. A buoy holds damage in `World.staticHealth`
 * (250 energy): its health is read once, the floored result written once, and
 * it is collected once when it reaches 0 from above; `resolveShots` then
 * announces it through `destroyBuoy` (`../world/kill.ts`). A record on a buoy
 * already at 0 before this ledger call changes nothing; one brought to 0 by
 * an earlier record of the same call still shows as a hit, as a doomed ship's
 * does.
 *
 * A buoy's frangible subentity (PD-01) is a static target id too (6 for the
 * witchpoint buoy, 7 for the nav buoy). Its record lowers
 * `World.buoys[key].subentityEnergy` (200, Oolite's default `max_energy`,
 * `ShipEntity.m:291`) and posts `shipHit`; it is never lethal and collects
 * nothing, because detachment is the 0 itself: the write that reaches 0 also
 * clears the sticky `subentityTakingDamage` (`subEntityDied`,
 * `ShipEntity.m:8187-8188`), and from then on the subentity is no beam part
 * and nothing recharges it. A record on a detached subentity, or on the
 * subentity of a buoy that is destroyed (before this call, or by an earlier
 * record of it), changes nothing. Oolite would explode the detached part and
 * scatter its debris; Wegolite draws neither (a FIDELITY divergence, PD-01).
 *
 * A pod or plate (kind `cargo`, D-07) takes a hit as a ship does: its energy
 * (1) is its health, so one pulse collects it, and `killShip` then marks it
 * dead silently (no `shipDestroyed`, no debris). Oolite draws a small
 * explosion for it; Wegolite draws none (a FIDELITY divergence).
 *
 * Total (D-15): a record with a non-finite or non-positive amount, a target
 * that is missing, dead or neither a ship nor cargo, and a record on a non-player target
 * applied to a world that was not stepped are skipped, never thrown on.
 */

import type { SimEvent } from "../events.js";
import type { FlightState } from "../flight/state.js";
import { rotate, sub, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import { NO_ENTITY, PLAYER_ID } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import {
  buoySubentityTargetById,
  isBuoyDestroyed,
  staticTargetById,
} from "../world/statics.js";
import type { World } from "../world/world.js";
import { routeDamage, routeScrapeDamage } from "./shields.js";
import type { PlayerCombatState } from "./state.js";

/**
 * One hit queued during resolution and applied after every shot is resolved.
 *
 * `kind` says which half of Oolite's damage it is: `"laser"` is
 * `takeEnergyDamage` (`PlayerEntity.m:5599-5700`), `"scrape"` a collision's
 * `takeScrapeDamage` (`PlayerEntity.m:5701-5753`, `ShipEntity.m:11636-11676`,
 * queued by the collision stage, `./collide.ts`). Only the player tells them
 * apart (a scrape does not heat the cabin); every other target takes either
 * kind the same way.
 */
export interface HitRecord {
  readonly kind: "laser" | "scrape";
  readonly target: EntityId;
  readonly source: EntityId;
  readonly amount: number;
  /**
   * Where the source was when the record was queued (a copy, never a live
   * reference), which decides the shield a hit on the player drains.
   */
  readonly sourcePosition: Vec3;
}

/**
 * A ship or buoy the ledger brought to 0 energy this tick, with the source of
 * the first lethal record. `killShip` and `destroyBuoy` re-check the killer at
 * kill time (D-04), so this is a claim, not the final credit.
 */
export interface LethalHit {
  readonly victim: EntityId;
  readonly killer: EntityId;
}

/** Local forward (-Z) in ship space, the player's nose. */
const LOCAL_FORWARD = vec(0, 0, -1);

/**
 * Apply `records` in order and return the victims that reached 0 energy, sorted
 * by victim id (an explicit numeric comparator).
 *
 * - A record whose amount is not finite or not above 0 is skipped.
 * - A record on `PLAYER_ID` is applied exactly as in Phase 13 (skipped without a
 *   combat state; `routeDamage` with the offset from the player to the
 *   shooter and the player's forward; `shipHit` with `shield`) and is never
 *   lethal. A `"scrape"` record takes `routeScrapeDamage` instead, which does
 *   not heat the cabin (CBT-18).
 * - Any other target is skipped when the world is missing or was not stepped.
 * - A buoy subentity (`buoySubentityTargetById`) is skipped when its buoy is
 *   destroyed or its energy is not above 0. Otherwise it writes
 *   `Math.max(0, before - amount)`, clears the buoy's routing flag when that
 *   is 0, and posts `shipHit` with `shield: false`; never lethal.
 * - The station (`staticTargetById`) posts `shipHit` with `shield: false` and
 *   nothing else: no write, never lethal (A6).
 * - A buoy reads its `staticHealth` once. At 0 or below it is skipped, unless
 *   an earlier record of this call collected it (then `shipHit` only).
 *   Otherwise it writes `Math.max(0, before - amount)`, posts `shipHit` with
 *   `shield: false`, and is collected once, with the record's credit, when the
 *   unfloored result is 0 or below.
 * - Any other target is skipped when it is not a live entity of the store (a
 *   missing or dead id), or when its kind is neither `"ship"` nor `"cargo"`
 *   (a pod or plate, D-07, plan 18-15; a wreck never). Otherwise its energy is read once and the
 *   floored result written once; `shipHit` carries `shield: false`. When the
 *   unfloored result is 0 or below the victim is collected once, with the first
 *   lethal record's credit: `PLAYER_ID` for a player shot, the source when it is
 *   a live ship other than the victim, else `NO_ENTITY`.
 *
 * Every record applies before lethality is decided; see the module comment.
 * Nothing is marked dead here, and energy is never read again after the write.
 */
export function applyLedger(
  world: World | undefined,
  worldStepped: boolean,
  player: FlightState,
  combat: PlayerCombatState | undefined,
  records: readonly HitRecord[],
  events: SimEvent[],
): LethalHit[] {
  const lethal = new Map<EntityId, EntityId>();
  for (const record of records) {
    if (!Number.isFinite(record.amount) || !(record.amount > 0)) continue;
    if (record.target === PLAYER_ID) {
      if (combat === undefined) continue;
      // A laser heats the cabin (`takeEnergyDamage`); a collision's scrape
      // does not (`takeScrapeDamage`, CBT-18). Both drain the shield on the
      // source's side first and floor the energy at 0.
      const route = record.kind === "scrape" ? routeScrapeDamage : routeDamage;
      const result = route(
        combat,
        record.amount,
        sub(record.sourcePosition, player.position),
        rotate(player.orientation, LOCAL_FORWARD),
      );
      events.push({
        kind: "shipHit",
        target: PLAYER_ID,
        source: record.source,
        amount: record.amount,
        shield: result.shieldAbsorbed,
      });
      continue;
    }
    if (world === undefined || !worldStepped) continue;
    const subentity = buoySubentityTargetById(record.target);
    if (subentity !== undefined) {
      // A buoy's frangible subentity (PD-01): never lethal.
      if (isBuoyDestroyed(world, subentity.buoyKey)) continue;
      const buoy = world.buoys[subentity.buoyKey];
      const before = buoy.subentityEnergy;
      if (!(before > 0)) continue;
      const after = Math.max(0, before - record.amount);
      buoy.subentityEnergy = after;
      // Detached: Oolite's subEntityDied clears the routing (8187-8188).
      if (after === 0) buoy.subentityTakingDamage = false;
      events.push({
        kind: "shipHit",
        target: record.target,
        source: record.source,
        amount: record.amount,
        shield: false,
      });
      continue;
    }
    const row = staticTargetById(record.target);
    if (row !== undefined) {
      if (row.layoutKey !== "station") {
        // A buoy holds its damage (CBT-17, D-04).
        const before = world.staticHealth[row.healthKey];
        if (!(before > 0)) {
          // Destroyed before this call: nothing. Doomed earlier in this call:
          // the hit still shows, as a doomed ship's does.
          if (lethal.has(record.target)) {
            events.push({
              kind: "shipHit",
              target: record.target,
              source: record.source,
              amount: record.amount,
              shield: false,
            });
          }
          continue;
        }
        const after = before - record.amount;
        world.staticHealth[row.healthKey] = Math.max(0, after);
        events.push({
          kind: "shipHit",
          target: record.target,
          source: record.source,
          amount: record.amount,
          shield: false,
        });
        if (after <= 0) {
          lethal.set(record.target, creditedKiller(world, record));
        }
        continue;
      }
      // The station only absorbs (A6): no write, nothing collected.
      events.push({
        kind: "shipHit",
        target: record.target,
        source: record.source,
        amount: record.amount,
        shield: false,
      });
      continue;
    }
    const entity = world.store.get(record.target);
    if (entity === undefined) continue;
    // Ships, and pods and plates (D-07): a wreck is never a target.
    if (entity.kind !== "ship" && entity.kind !== "cargo") continue;
    const before = Number.isFinite(entity.energy) ? entity.energy : 0;
    const after = before - record.amount;
    entity.energy = Math.max(0, after);
    events.push({
      kind: "shipHit",
      target: record.target,
      source: record.source,
      amount: record.amount,
      shield: false,
    });
    if (after <= 0 && !lethal.has(record.target)) {
      lethal.set(record.target, creditedKiller(world, record));
    }
  }
  return [...lethal.entries()]
    .map(([victim, killer]) => ({ victim, killer }))
    .sort((a, b) => a.victim - b.victim);
}

/** The killer a lethal record credits: the player, a live other ship, or nobody. */
function creditedKiller(world: World, record: HitRecord): EntityId {
  if (record.source === PLAYER_ID) return PLAYER_ID;
  if (record.source === record.target) return NO_ENTITY;
  return world.store.get(record.source)?.kind === "ship"
    ? record.source
    : NO_ENTITY;
}

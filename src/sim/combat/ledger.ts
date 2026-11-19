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
 * cabin) and the energy floors at 0 until the player's death in Phase 20
 * (D-13).
 *
 * A static target (`../world/statics.ts`, the main station) only absorbs a hit
 * (Phase 18, CBT-17, A6): the record posts `shipHit` with `shield: false` and
 * writes and collects nothing, so it is never lethal and changes no hashed
 * state. Oolite's main station lowers its energy only while the amount is
 * below its energy and recharges 100 per second (`StationEntity.m:1110-1160`):
 * a 15-point dip on 25,000 is gone in 0.15 s and nothing reads it.
 *
 * Total (D-15): a record with a non-finite or non-positive amount, a target
 * that is missing, dead or not a ship, and a record on a non-player target
 * applied to a world that was not stepped are skipped, never thrown on.
 */

import type { SimEvent } from "../events.js";
import type { FlightState } from "../flight/state.js";
import { rotate, sub, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import { NO_ENTITY, PLAYER_ID } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import { staticTargetById } from "../world/statics.js";
import type { World } from "../world/world.js";
import { routeDamage } from "./shields.js";
import type { PlayerCombatState } from "./state.js";

/** One hit queued during resolution and applied after every shot is resolved. */
export interface HitRecord {
  readonly target: EntityId;
  readonly source: EntityId;
  readonly amount: number;
  /** Where the shooter was, which decides the shield a hit on the player drains. */
  readonly sourcePosition: Vec3;
}

/**
 * A ship the ledger brought to 0 energy this tick, with the source of the first
 * lethal record. `killShip` re-checks the killer at kill time (D-04), so this
 * is a claim, not the final credit.
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
 *   lethal.
 * - Any other target is skipped when the world is missing or was not stepped.
 * - A static target (`staticTargetById`) posts `shipHit` with `shield: false`
 *   and nothing else: no write, never lethal (A6).
 * - Any other target is skipped when it is not a live ship of the store (a
 *   missing or dead id), or when its kind is not `"ship"`. Otherwise its energy is read once and the
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
      const result = routeDamage(
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
    if (staticTargetById(record.target) !== undefined) {
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
    if (entity === undefined || entity.kind !== "ship") continue;
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

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's combat step (CBT-04, CBT-05, CBT-06, CBT-07, DOCK-10).
 *
 * Two functions, bracketing `stepWorld` inside `stepSim` (`../sim.ts`):
 *
 * - `stepPlayerCombat` runs right after `stepFlight`. It applies the dock and
 *   launch resets, the `setView` commands, the held fire key (gate, cost, heat
 *   and a queued `ShotRequest`) and the bookkeeping (weapon cooling, energy and
 *   shield recharge, cabin cooling). Order, as Oolite's `update`: controls
 *   first, then bookkeeping (`PlayerEntity.m:2404-2432`).
 * - `resolveShots` runs after `stepWorld`. It resolves every queued shot in
 *   ascending shooter id against the world as the world step left it, queues
 *   one `HitRecord` per hit and only then applies them all. Damage is never
 *   applied from inside a handler or mid-resolution (RESEARCH A6, Pitfall 7),
 *   so one shot cannot change what a later shot of the same tick sees.
 *
 * Neither function reads the clock or a random stream.
 */

import type { SimEvent } from "../events.js";
import type { Command } from "../commands.js";
import type { ControlIntent } from "../flight/controller.js";
import type { FlightState } from "../flight/state.js";
import type { StepOptions } from "../flight/step.js";
import { add, scale } from "../math.js";
import { PLAYER_ID } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import type { World } from "../world/world.js";
import { playerLaserRay } from "./aim.js";
import { LASER_STATS } from "./constants.js";
import { firstShipHit } from "./hit.js";
import type { HitTarget, HullTable, LaserRay } from "./hit.js";
import { DEFAULT_LASER_MOUNTS, isFacing } from "./mounts.js";
import type { LaserKey, LaserMounts } from "./mounts.js";
import { rechargeEnergyAndShields, coolCabin } from "./shields.js";
import { dockReset, launchReset, sanitizeCombat } from "./state.js";
import type { PlayerCombatState } from "./state.js";
import { applyShot, coolWeapons, fireGate } from "./weapons.js";

/**
 * The read-only combat facts the app supplies each step, derived from the
 * profile and the loaded content and never carried in a command (like
 * `StepOptions.equipment`). Later plans of Phase 13 extend this interface here.
 */
export interface CombatOptions {
  /** The laser fitted on each facing; absent facings are empty mounts. */
  readonly mounts: LaserMounts;
  /**
   * The loaded hull data (D-01). Absent until the lazy file has loaded: a shot
   * fired in that state is drawn but cannot hit.
   */
  readonly hulls?: HullTable;
}

/** One shot queued for resolution after the world step. */
export interface ShotRequest {
  readonly shooter: EntityId;
  readonly ray: LaserRay;
  readonly laser: LaserKey;
}

/** One hit queued during resolution and applied after every shot is resolved. */
export interface HitRecord {
  readonly target: EntityId;
  readonly source: EntityId;
  readonly amount: number;
}

/** What `stepPlayerCombat` produced for this tick. */
export interface PlayerCombatResult {
  readonly events: SimEvent[];
  readonly shots: ShotRequest[];
}

function hasEvent(
  events: readonly SimEvent[],
  kind: SimEvent["kind"],
): boolean {
  return events.some((event) => event.kind === kind);
}

/**
 * One tick of the player's combat, after `stepFlight`.
 *
 * 1. Repair the state (T-13-15), so no non-finite number reaches a hash.
 * 2. A `docked` event restores the ship (`dockReset`, DOCK-10) and ends the
 *    step: nothing cools, recharges or fires while docked (F6). A `launched`
 *    event applies `launchReset`.
 * 3. In flight, a `setView` command drained this step switches the view and the
 *    weapon facing together. It counts only when the ship was in flight at the
 *    start of the step as well as at its end, so the command of the tick that
 *    completes the launch is ignored (`launchComplete` marks that tick). A
 *    payload that is not a `Facing` is ignored (T-13-16).
 * 4. In flight, a held fire key asks the current facing's laser to fire: a shot
 *    is queued, a refusal emits `laserRefused`, no laser fitted does nothing.
 * 5. While launching or in flight, bookkeeping runs after the fire path, as in
 *    Oolite.
 */
export function stepPlayerCombat(
  combat: PlayerCombatState,
  player: FlightState,
  intent: ControlIntent,
  commands: readonly Command[],
  flightEvents: readonly SimEvent[],
  options: StepOptions | undefined,
  dt: number,
): PlayerCombatResult {
  const events: SimEvent[] = [];
  const shots: ShotRequest[] = [];
  sanitizeCombat(combat);

  if (hasEvent(flightEvents, "docked")) {
    dockReset(combat);
    return { events, shots };
  }
  if (hasEvent(flightEvents, "launched")) launchReset(combat);

  if (player.mode === "inFlight") {
    const inFlightAtStart = !hasEvent(flightEvents, "launchComplete");
    if (inFlightAtStart) {
      for (const command of commands) {
        if (command.kind === "setView" && isFacing(command.view)) {
          combat.view = command.view;
        }
      }
    }

    if (intent.fire === true) {
      const mounts = options?.combat?.mounts ?? DEFAULT_LASER_MOUNTS;
      const gate = fireGate(combat, mounts);
      if (gate.kind === "fire") {
        applyShot(combat, gate.facing, gate.laser);
        shots.push({
          shooter: PLAYER_ID,
          ray: playerLaserRay(
            player.position,
            player.orientation,
            gate.facing,
            gate.laser,
          ),
          laser: gate.laser,
        });
      } else if (gate.kind === "refused") {
        events.push({ kind: "laserRefused", reason: gate.reason });
      }
    }
  }

  if (player.mode === "launching" || player.mode === "inFlight") {
    coolWeapons(combat, dt);
    rechargeEnergyAndShields(combat, dt);
    coolCabin(combat, dt);
  }
  return { events, shots };
}

/** Ascending shooter id, stable for equal ids. */
function byShooter(a: ShotRequest, b: ShotRequest): number {
  return a.shooter - b.shooter;
}

/**
 * Resolve the tick's shots, after `stepWorld`.
 *
 * Every shot, in ascending shooter id, draws a `laserFired` event from the ray's
 * origin to the first hit's distance (or the laser's full range on a miss) and
 * queues a `HitRecord` when `firstShipHit` finds a ship. The candidates are the
 * live, non-dead dynamic ships of the world, in ascending id: the station and
 * the buoys are static entities and never hit candidates in this milestone (OQ4,
 * F10). They are listed only when the world was stepped this tick, so a tick
 * that skipped the world (the jump step, or no world at all) draws the beam and
 * hits nothing. After every shot is resolved the hits are applied in queue
 * order: an NPC target loses the laser's damage from its energy, floored at 0
 * (N2: nothing is destroyed this milestone), and a `shipHit` event with
 * `shield: false` is emitted. A non-finite or non-positive amount is never
 * queued (T-13-15).
 *
 * `_player` and `_combat` are part of the call shape so the plan that routes
 * NPC fire onto the player (13-10) extends this function without changing its
 * callers.
 */
export function resolveShots(
  world: World | undefined,
  worldStepped: boolean,
  _player: FlightState,
  _combat: PlayerCombatState | undefined,
  shots: readonly ShotRequest[],
  options: StepOptions | undefined,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (shots.length === 0) return events;

  const targets: HitTarget[] = [];
  if (world !== undefined && worldStepped) {
    for (const entity of world.store.live) {
      if (entity.dead || entity.kind !== "ship") continue;
      targets.push({
        id: entity.id,
        specKey: entity.specKey,
        position: entity.position,
        orientation: entity.orientation,
      });
    }
  }

  const hulls = options?.combat?.hulls;
  const hits: HitRecord[] = [];
  for (const shot of [...shots].sort(byShooter)) {
    const hit = firstShipHit(shot.ray, targets, hulls);
    const reach = hit === null ? shot.ray.range : hit.distance;
    const stats = LASER_STATS[shot.laser];
    events.push({
      kind: "laserFired",
      shooter: shot.shooter,
      from: shot.ray.origin,
      to: add(shot.ray.origin, scale(shot.ray.forward, reach)),
      laserKind: stats.laserKind,
    });
    if (hit !== null && Number.isFinite(stats.damage) && stats.damage > 0) {
      hits.push({
        target: hit.id,
        source: shot.shooter,
        amount: stats.damage,
      });
    }
  }

  if (world === undefined) return events;
  for (const hit of hits) {
    const entity = world.store.get(hit.target);
    if (entity === undefined) continue;
    const before = Number.isFinite(entity.energy) ? entity.energy : 0;
    entity.energy = Math.max(0, before - hit.amount);
    events.push({
      kind: "shipHit",
      target: hit.target,
      source: hit.source,
      amount: hit.amount,
      shield: false,
    });
  }
  return events;
}

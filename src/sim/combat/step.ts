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
import { add, rotate, scale, sub, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import { PLAYER_ID } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import type { World } from "../world/world.js";
import { PLAYER_HULL_KEY, npcLaserRay, playerLaserRay } from "./aim.js";
import type { NpcWeapon } from "./aim.js";
import { LASER_STATS } from "./constants.js";
import { firstShipHit } from "./hit.js";
import type { HitTarget, HullTable, LaserRay } from "./hit.js";
import { DEFAULT_LASER_MOUNTS, NO_LASER, isFacing } from "./mounts.js";
import type { LaserKey, LaserMounts } from "./mounts.js";
import { coolCabin, rechargeEnergyAndShields, routeDamage } from "./shields.js";
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
  /**
   * The forward weapon of each NPC hull, keyed by spec key (compiled from
   * `ships-npc.json`). A ship whose key has no entry, or whose laser is
   * `EQ_WEAPON_NONE`, cannot fire through `ShipControl.fire`.
   */
  readonly npcWeapons?: ReadonlyMap<string, NpcWeapon>;
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
  /** Where the shooter was, which decides the shield a hit on the player drains. */
  readonly sourcePosition: Vec3;
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

/** Local forward (-Z) in ship space, the player's nose. */
const LOCAL_FORWARD = vec(0, 0, -1);

/**
 * Drain `world.fireQueue` into shot requests (CBT-07, Pitfall 19). The queue is
 * copied, sorted by an explicit numeric comparator and cleared, so it is empty
 * at the tick boundary whatever happens next. A shooter that is gone or dead,
 * that is not a ship, or whose spec key has no usable forward weapon is
 * skipped; so is every entry when the world was not stepped this tick. An NPC
 * shot has no heat, timer or energy cost (RESEARCH A7: autonomous fire and NPC
 * weapon bookkeeping are CBT-15).
 */
function drainFireQueue(
  world: World,
  worldStepped: boolean,
  options: StepOptions | undefined,
): ShotRequest[] {
  const queued = [...world.fireQueue].sort((a, b) => a - b);
  world.fireQueue.length = 0;
  const shots: ShotRequest[] = [];
  if (!worldStepped) return shots;
  const weapons = options?.combat?.npcWeapons;
  if (weapons === undefined) return shots;
  for (const id of queued) {
    const shooter = world.store.get(id);
    if (shooter === undefined || shooter.dead || shooter.kind !== "ship") {
      continue;
    }
    const weapon = weapons.get(shooter.specKey);
    if (weapon === undefined || weapon.laser === NO_LASER) continue;
    const ray = npcLaserRay(shooter, weapon);
    if (ray === null) continue;
    shots.push({ shooter: id, ray, laser: weapon.laser });
  }
  return shots;
}

/**
 * Recharge every live ship's energy bank at its record's rate, up to its
 * maximum (N1, `ShipEntity.m:2414-2422`). Runs before this tick's hits apply, so
 * a hit always lands on a bank that has already had its tick of recharge.
 */
function rechargeShips(world: World, dt: number): void {
  for (const entity of world.store.live) {
    if (entity.dead || entity.kind !== "ship") continue;
    if (!(entity.energy < entity.maxEnergy)) continue;
    entity.energy = Math.min(
      entity.maxEnergy,
      entity.energy + entity.energyRechargeRate * dt,
    );
  }
}

/**
 * Resolve the tick's shots, after `stepWorld`.
 *
 * The shots are the player's (queued by `stepPlayerCombat`) and every NPC's that
 * asked `ShipControl.fire` during the world step (`world.fireQueue`, drained
 * here). Every shot, in ascending shooter id, draws a `laserFired` event from the
 * ray's origin to the first hit's distance (or the laser's full range on a miss)
 * and queues a `HitRecord` when `firstShipHit` finds a ship. The candidates are
 * the live, non-dead dynamic ships of the world, in ascending id, plus the
 * player (id 100, the Cobra's hull) when a combat state is passed and the player
 * is launching or in flight; a shooter is never its own candidate. The station
 * and the buoys are static entities and never candidates in this milestone (OQ4,
 * F10). Ships are listed only when the world was stepped this tick, so a tick
 * that skipped the world (the jump step, or no world at all) draws the beam and
 * hits nothing. Before any hit applies, every live ship recharges its energy
 * bank (N1). Then the hits are applied in queue order: an NPC target loses the
 * laser's damage from its energy, floored at 0 (N2: nothing is destroyed this
 * milestone) and `shipHit` carries `shield: false`; a hit on the player goes
 * through `routeDamage` (the facing shield first, then energy, heating the
 * cabin) and `shipHit` carries `shield` true when the shield took all of it. A
 * non-finite or non-positive amount is never queued (T-13-15).
 */
export function resolveShots(
  world: World | undefined,
  worldStepped: boolean,
  player: FlightState,
  combat: PlayerCombatState | undefined,
  shots: readonly ShotRequest[],
  options: StepOptions | undefined,
  dt: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  const npcShots =
    world === undefined ? [] : drainFireQueue(world, worldStepped, options);
  if (world !== undefined && worldStepped) rechargeShips(world, dt);
  const all = [...shots, ...npcShots];
  if (all.length === 0) return events;

  const targets: HitTarget[] = [];
  if (
    combat !== undefined &&
    (player.mode === "launching" || player.mode === "inFlight")
  ) {
    targets.push({
      id: PLAYER_ID,
      specKey: PLAYER_HULL_KEY,
      position: player.position,
      orientation: player.orientation,
    });
  }
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
  for (const shot of all.sort(byShooter)) {
    const candidates = targets.filter((target) => target.id !== shot.shooter);
    const hit = firstShipHit(shot.ray, candidates, hulls);
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
        sourcePosition:
          world?.store.get(shot.shooter)?.position ?? shot.ray.origin,
      });
    }
  }

  for (const hit of hits) {
    if (hit.target === PLAYER_ID) {
      if (combat === undefined) continue;
      const result = routeDamage(
        combat,
        hit.amount,
        sub(hit.sourcePosition, player.position),
        rotate(player.orientation, LOCAL_FORWARD),
      );
      events.push({
        kind: "shipHit",
        target: PLAYER_ID,
        source: hit.source,
        amount: hit.amount,
        shield: result.shieldAbsorbed,
      });
      continue;
    }
    if (world === undefined) continue;
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

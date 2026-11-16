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
 *   one `HitRecord` per hit and only then applies them all through the damage
 *   ledger (`./ledger.ts`, `applyLedger`). Damage is never applied from inside
 *   a handler or mid-resolution (RESEARCH A6, Pitfall 7), so one shot cannot
 *   change what a later shot of the same tick sees. A ship the ledger brings to
 *   0 energy is destroyed on that tick through `killShip` (FOUND-19, D-12),
 *   removed by a second `commitWorld` so the tick boundary holds no dead
 *   entity, and an ident lock on it ends on the same step.
 *
 * Neither function reads the clock. `resolveShots` draws no random value itself,
 * but a kill tick runs the immediate AI drain (`drainAiEventsNow`), whose
 * `onEvent` handlers may draw from the entity's hashed `ai` stream; that draw is
 * deterministic and part of the world hash.
 */

import type { SimEvent } from "../events.js";
import type { Command } from "../commands.js";
import type { ControlIntent } from "../flight/controller.js";
import type { FlightState } from "../flight/state.js";
import type { StepOptions } from "../flight/step.js";
import { AI_REGISTRY } from "../ai/registry.js";
import { add, scale } from "../math.js";
import { PLAYER_ID } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import { killShip } from "../world/kill.js";
import type { SystemLayout } from "../world/layout.js";
import { drainAiEventsNow } from "../world/step.js";
import type { AiRegistry } from "../world/step.js";
import { commitWorld } from "../world/world.js";
import type { World } from "../world/world.js";
import { PLAYER_HULL_KEY, npcLaserRay, playerLaserRay } from "./aim.js";
import type { NpcWeapon } from "./aim.js";
import { LASER_STATS } from "./constants.js";
import { firstShipHit } from "./hit.js";
import { stepIdent, updateIdentTarget } from "./ident.js";
import type { HitTarget, HullTable, LaserRay } from "./hit.js";
import { applyLedger } from "./ledger.js";
import type { HitRecord } from "./ledger.js";
import { DEFAULT_LASER_MOUNTS, NO_LASER, isFacing } from "./mounts.js";
import type { LaserKey, LaserMounts } from "./mounts.js";
import { coolCabin, rechargeEnergyAndShields } from "./shields.js";
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
   * The forward weapon of each NPC hull, keyed by spec key (compiled from the
   * NPC ship catalogue). A ship whose key has no entry, or whose laser is
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
 * 5. The ident commands (R, U) and the jump clear of the ident target run
 *    (`./ident.ts`, `stepIdent`); the lock itself is acquired and dropped after
 *    the world step, at the end of `resolveShots` (`updateIdentTarget`).
 * 6. While launching or in flight, bookkeeping runs after the fire path, as in
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

  const inFlightAtStart = !hasEvent(flightEvents, "launchComplete");
  if (player.mode === "inFlight") {
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

  stepIdent(combat, player, commands, flightEvents, inFlightAtStart, events);

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
 * Resolve the tick's shots against the world as the world step left it; applies
 * nothing.
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
 * hits nothing. Before any hit is queued, every live ship recharges its energy
 * bank (N1). A non-finite or non-positive damage is never queued (T-13-15).
 *
 * Returns the beam events and the `HitRecord` list; `resolveShots` applies the
 * list through the ledger.
 */
function resolveShotHits(
  world: World | undefined,
  worldStepped: boolean,
  player: FlightState,
  combat: PlayerCombatState | undefined,
  shots: readonly ShotRequest[],
  options: StepOptions | undefined,
  dt: number,
): { events: SimEvent[]; records: HitRecord[] } {
  const events: SimEvent[] = [];
  const npcShots =
    world === undefined ? [] : drainFireQueue(world, worldStepped, options);
  if (world !== undefined && worldStepped) rechargeShips(world, dt);
  const all = [...shots, ...npcShots];
  if (all.length === 0) return { events, records: [] };

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
  const records: HitRecord[] = [];
  for (const shot of all.sort(byShooter)) {
    const candidates = targets.filter((target) => target.id !== shot.shooter);
    const hit = firstShipHit(shot.ray, candidates, hulls);
    const reach = hit === null ? shot.ray.range : hit.distance;
    const stats = LASER_STATS[shot.laser];
    events.push({
      kind: "laserFired",
      shooter: shot.shooter,
      playerShot: shot.shooter === PLAYER_ID,
      from: shot.ray.origin,
      to: add(shot.ray.origin, scale(shot.ray.forward, reach)),
      laserKind: stats.laserKind,
    });
    if (hit !== null && Number.isFinite(stats.damage) && stats.damage > 0) {
      records.push({
        target: hit.id,
        source: shot.shooter,
        amount: stats.damage,
        sourcePosition: {
          ...(world?.store.get(shot.shooter)?.position ?? shot.ray.origin),
        },
      });
    }
  }

  return { events, records };
}

/**
 * Resolve the tick's shots, apply the damage, destroy what reached 0 energy and
 * update the ident lock, after `stepWorld`.
 *
 * 1. `resolveShotHits` draws the beams and queues the hits.
 * 2. `applyLedger` (`./ledger.ts`) applies every record in queue order (ascending
 *    shooter id) and returns the ships brought to 0 energy; every record applies
 *    before lethality is decided.
 * 3. When the world was stepped, `killShip` (`../world/kill.ts`) destroys each
 *    lethal victim in ascending victim id, crediting the ledger's killer only
 *    when it is still alive at that call (D-04). In a same-tick mutual kill the
 *    lower-id victim is therefore credited to the other ship and the higher-id
 *    victim carries `NO_ENTITY`.
 * 4. `drainAiEventsNow` (`../world/step.ts`) delivers the AI events the kills
 *    posted (`shipTargetLost`, `shipTargetDestroyed`, `shipKilledOther`, D-04)
 *    before the commit, discarding any fire request a handler makes meanwhile,
 *    so the tick boundary holds no queued AI event or fire request.
 * 5. The second `commitWorld` removes the dead on every stepped tick (gated on
 *    the world, never on `combat`), one `entityRemoved` per id, so a snapshot at
 *    the tick boundary holds no dead entity.
 * 6. `updateIdentTarget` (`./ident.ts`) validates and, with ident engaged,
 *    acquires the lock against the world as it now stands, so a destroyed lock
 *    is dropped on the same tick. It runs only on a tick that stepped the world,
 *    so the jump step (which skips the world) never touches an old world's ids.
 *
 * Event order: `laserFired*`, `shipHit*`, `shipDestroyed*`, `aiFaulted*` (a
 * handler that faults during the immediate drain), `entityRemoved*`, then the
 * ident events.
 *
 * `layout` and `registry` feed the immediate drain only; `stepSim` passes its
 * layout and `AI_REGISTRY`, a test may inject a registry.
 */
export function resolveShots(
  world: World | undefined,
  worldStepped: boolean,
  player: FlightState,
  combat: PlayerCombatState | undefined,
  shots: readonly ShotRequest[],
  options: StepOptions | undefined,
  dt: number,
  layout: SystemLayout,
  registry: AiRegistry = AI_REGISTRY,
): SimEvent[] {
  const { events, records } = resolveShotHits(
    world,
    worldStepped,
    player,
    combat,
    shots,
    options,
    dt,
  );
  const lethal = applyLedger(
    world,
    worldStepped,
    player,
    combat,
    records,
    events,
  );
  if (world !== undefined && worldStepped) {
    for (const hit of lethal) killShip(world, hit.victim, hit.killer, events);
    drainAiEventsNow(world, player, layout, player.tick, events, registry);
    for (const id of commitWorld(world))
      events.push({ kind: "entityRemoved", id });
    if (combat !== undefined) updateIdentTarget(combat, player, world, events);
  }
  return events;
}

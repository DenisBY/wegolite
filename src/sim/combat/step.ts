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
 *   entity, and an ident lock on it ends on the same step. With debris content
 *   in the options, the kill releases the ship's debris (`../world/debris.ts`)
 *   on the same tick; the pieces post no event and survive the second commit.
 *
 * Every NPC shot passes Oolite's NPC fire gate (CBT-15, D-08, `../npc/fire.ts`)
 * at one place, the fire-queue drain in `resolveShots`: heat, energy, the
 * whole-tick shot timer, then one draw from the shooter's own "combat" stream
 * for the range roll and `onTarget`. Cost, heat and the timer are written only
 * together with a pushed `ShotRequest`. After the drain and the energy recharge
 * every live ship's forward weapon cools (Oolite's order: the shot in the
 * behaviour step, then regeneration, then the next update's cooling,
 * `ShipEntity.m:2214-2218, 2414-2425`). Resolution moves the shooter's
 * `missedShots` (`ShipEntity.m:10396, 10425`).
 *
 * Neither function reads the clock. `resolveShots` draws no random value from
 * the world stream: the gate's draw is the shooter's own, and a kill tick runs
 * the immediate AI drain (`drainAiEventsNow`), whose `onEvent` handlers may draw
 * from the entity's hashed `ai` stream; those draws are deterministic and part
 * of the world hash.
 */

import type { SimEvent } from "../events.js";
import type { Command } from "../commands.js";
import type { ControlIntent } from "../flight/controller.js";
import type { FlightState } from "../flight/state.js";
import type { StepOptions } from "../flight/step.js";
import { AI_REGISTRY } from "../ai/registry.js";
import { add, scale } from "../math.js";
import {
  adjustMissedShots,
  coolWeapon,
  heatWeapon,
  npcFireBlocked,
  npcFireGate,
  npcOnTarget,
} from "../npc/fire.js";
import { PLAYER_COLLISION_RADIUS_M } from "../npc/stats.js";
import { rangeToTargetIn } from "../npc/target.js";
import { createRngState, rngNext } from "../rng.js";
import { PLAYER_ID } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import {
  STATIC_TARGETS,
  isBuoyDestroyed,
  staticPose,
  staticTargetById,
} from "../world/statics.js";
import type { DebrisContent, DebrisContext } from "../world/debris.js";
import { destroyBuoy, killShip } from "../world/kill.js";
import type { SystemLayout } from "../world/layout.js";
import { drainAiEventsNow } from "../world/step.js";
import type { AiRegistry } from "../world/step.js";
import type { WorldView } from "../world/view.js";
import { createWorldView } from "../world/view-impl.js";
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
import {
  DEFAULT_LASER_MOUNTS,
  NO_LASER,
  isFacing,
  isMountKey,
} from "./mounts.js";
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
  /**
   * The compiled debris content (Phase 16, `../world/debris.ts`), built by the
   * app from the lazily loaded catalogues. Absent with traffic off or before the
   * content has loaded; absent means a kill releases no debris.
   */
  readonly debris?: DebrisContent;
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
 * Drain `world.fireQueue` into shot requests (CBT-07, CBT-15, Pitfall 19), the
 * one place an NPC shot is gated (D-08, advisor decision 2). The queue is
 * copied, sorted by an explicit numeric comparator and cleared, so it is empty
 * at the tick boundary whatever happens next; nothing fires when the world was
 * not stepped this tick or no weapon table was passed.
 *
 * Each request is refused with no draw and no write when the shooter is gone,
 * dead or not a ship, when `npcFireBlocked` refuses it (no AI, whether never
 * steered or nulled by a think throw, or a nav target equal to its own id), when
 * its spec key has no weapon row, or when the row's laser is not a mount key (a
 * malformed table; the gate indexes `LASER_STATS` with it). An unarmed row
 * (`EQ_WEAPON_NONE`) reaches the gate, takes its one draw and refuses.
 *
 * Otherwise the gate runs with the shooter's own "combat" stream (a local copy,
 * written back after the call as `steerEntity` does), its weapon temperature as
 * the previous tick's cooling left it, its energy, the tick, `lastShotTick`, its
 * resolved accuracy, the range to its nav target and `onTarget` over a view built
 * with the compiled player radius. Range and `onTarget` therefore read the pose
 * after the world step, not the pose at the shooter's own update: a divergence
 * extending A6 (Oolite fires inside the update, before the target moves).
 *
 * On `fired` the ray is built first. Only when it is non-null are the energy
 * cost, the float32 heat and `lastShotTick` written, together with the pushed
 * `ShotRequest` (Pitfall 16: no tick writes cost, heat or the timer for a shot
 * that never resolves).
 */
function drainFireQueue(
  world: World,
  worldStepped: boolean,
  player: FlightState,
  layout: SystemLayout,
  options: StepOptions | undefined,
): ShotRequest[] {
  const queued = [...world.fireQueue].sort((a, b) => a - b);
  world.fireQueue.length = 0;
  const shots: ShotRequest[] = [];
  if (!worldStepped) return shots;
  const weapons = options?.combat?.npcWeapons;
  if (weapons === undefined) return shots;
  let view: WorldView | undefined;
  for (const id of queued) {
    const shooter = world.store.get(id);
    if (shooter === undefined || shooter.dead || shooter.kind !== "ship") {
      continue;
    }
    if (npcFireBlocked(shooter) !== null) continue;
    const weapon = weapons.get(shooter.specKey);
    if (weapon === undefined || !isMountKey(weapon.laser)) continue;
    const gateView = (view ??= createWorldView(
      world,
      player,
      layout,
      PLAYER_COLLISION_RADIUS_M,
    ));
    const stream = createRngState(shooter.rng.combat);
    const result = npcFireGate(
      {
        temperature: shooter.weapon.temperature,
        energy: shooter.energy,
        tick: player.tick,
        lastShotTick: shooter.weapon.lastShotTick,
        laser: weapon.laser,
        accuracy: shooter.steer.accuracy,
        range: rangeToTargetIn(shooter, gateView),
        onTarget: () => npcOnTarget(shooter, gateView, player.tick),
      },
      () => rngNext(stream),
    );
    shooter.rng.combat = stream.s;
    if (result.kind !== "fired") continue;
    const ray = npcLaserRay(shooter, weapon);
    if (ray === null || weapon.laser === NO_LASER) continue;
    const stats = LASER_STATS[weapon.laser];
    shooter.energy -= stats.energy;
    shooter.weapon.temperature = heatWeapon(
      shooter.weapon.temperature,
      stats.shotTemperature,
    );
    shooter.weapon.lastShotTick = player.tick;
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
 * Cool every live ship's forward weapon by `fround(6 x dt)` in float32, floored
 * at 0 (`ShipEntity.m:2214-2218`, D-07). Runs after the drain and the recharge,
 * so a shot of this tick sees the temperature the previous tick left, as the
 * behaviour step of an Oolite update sees the cooling of the update before it.
 * A weapon at 0 is never written, so a pristine record stays the pristine record
 * and a world that never fires hashes as it did before Phase 17.
 */
function coolShips(world: World, dt: number): void {
  for (const entity of world.store.live) {
    if (entity.dead || entity.kind !== "ship") continue;
    if (entity.weapon.temperature === 0) continue;
    entity.weapon.temperature = coolWeapon(entity.weapon.temperature, dt);
  }
}

/**
 * Resolve the tick's shots against the world as the world step left it; applies
 * nothing.
 *
 * The shots are the player's (queued by `stepPlayerCombat`) and every NPC's that
 * asked `ShipControl.fire` during the world step (`world.fireQueue`, drained
 * and gated here, see `drainFireQueue`). Every shot, in ascending shooter id, draws a `laserFired` event from the
 * ray's origin to the first hit's distance (or the laser's full range on a miss)
 * and queues a `HitRecord` when `firstShipHit` finds a ship. The candidates, in
 * ascending id, are the static targets of `../world/statics.ts` whose hull is in
 * the hull table, at `staticPose` (the main station, id 3, at the port pose;
 * the witchpoint buoy, 4, and the nav buoy, 5, at their live position, PD-02,
 * and tumble, unless destroyed, D-05; Oolite lists every entity that `isShip`
 * and `canCollide`, `Universe.m:5575-5585`), the player
 * (id 100, the Cobra's hull) when a combat state is passed and the player is
 * launching or in flight, and the live, non-dead dynamic ships of the world; a
 * shooter is never its own candidate. Without the static hulls (traffic off, or
 * the ten-hull table of the frozen acceptance worlds) no static is listed. The
 * statics and the ships are listed only when the world was stepped this tick,
 * so a tick that skipped the world (the jump step, or no world at all) draws the
 * beam and hits no static or ship. Before any hit is queued, every live ship
 * recharges its energy bank (N1) and then cools its forward weapon; the cooling
 * runs on every stepped tick, ahead of the empty-shot return. A shot moves its
 * NPC shooter's `missedShots` (-1 on a hit, a static target included; +1 on a
 * miss), and an NPC shot's `laserFired`
 * carries the shooter's `specKey` (the app maps it to a shot colour; the
 * player's shot carries none). A non-finite or non-positive damage is never
 * queued (T-13-15).
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
  layout: SystemLayout,
): { events: SimEvent[]; records: HitRecord[] } {
  const events: SimEvent[] = [];
  const npcShots =
    world === undefined
      ? []
      : drainFireQueue(world, worldStepped, player, layout, options);
  if (world !== undefined && worldStepped) {
    rechargeShips(world, dt);
    // Before the empty-shot return below, so a tick with no shot still cools.
    coolShips(world, dt);
  }
  const all = [...shots, ...npcShots];
  if (all.length === 0) return { events, records: [] };

  const hulls = options?.combat?.hulls;
  const targets: HitTarget[] = [];
  if (world !== undefined && worldStepped && hulls !== undefined) {
    // The static targets first: their ids (3 to 99) are below the player's.
    for (const row of STATIC_TARGETS) {
      if (!hulls.has(row.hullKey)) continue;
      // A destroyed buoy is no target (D-05).
      if (row.layoutKey !== "station" && isBuoyDestroyed(world, row.layoutKey)) {
        continue;
      }
      const pose = staticPose(row, layout, player, world);
      targets.push({
        id: row.id,
        specKey: row.hullKey,
        position: pose.position,
        orientation: pose.orientation,
      });
    }
  }
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

  const records: HitRecord[] = [];
  for (const shot of all.sort(byShooter)) {
    const candidates = targets.filter((target) => target.id !== shot.shooter);
    const hit = firstShipHit(shot.ray, candidates, hulls);
    // A shot moves its NPC shooter's missed-shot counter: -1 on a hit, +1 on a
    // miss (`ShipEntity.m:10396, 10425`, D-15). A shot that ends on a static
    // target is a hit, as Oolite counts any ShipEntity hit.
    const shooter =
      shot.shooter === PLAYER_ID ? undefined : world?.store.get(shot.shooter);
    if (shooter !== undefined) {
      shooter.weapon.missedShots = adjustMissedShots(
        shooter.weapon.missedShots,
        hit === null ? 1 : -1,
      );
    }
    const reach = hit === null ? shot.ray.range : hit.distance;
    const stats = LASER_STATS[shot.laser];
    events.push({
      kind: "laserFired",
      shooter: shot.shooter,
      playerShot: shot.shooter === PLAYER_ID,
      from: shot.ray.origin,
      to: add(shot.ray.origin, scale(shot.ray.forward, reach)),
      laserKind: stats.laserKind,
      ...(shooter === undefined ? {} : { specKey: shooter.specKey }),
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
 * The debris context of this tick's kills, or undefined without debris
 * content. The hull octrees ride along when loaded (plan 16-04 reads them);
 * the key is omitted otherwise (exactOptionalPropertyTypes).
 */
function debrisContext(
  options: StepOptions | undefined,
  tick: number,
): DebrisContext | undefined {
  const combat = options?.combat;
  const content = combat?.debris;
  if (content === undefined) return undefined;
  return combat?.hulls === undefined
    ? { tick, content }
    : { tick, content, octrees: combat.hulls };
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
 *    when it is still alive at that call (D-04); a lethal static victim (a
 *    buoy, ids 4 and 5, so always first) goes to `destroyBuoy` instead, which
 *    emits its `shipDestroyed` and leaves it in `world.statics` (D-13). In a
 *    same-tick mutual kill the
 *    lower-id victim is therefore credited to the other ship and the higher-id
 *    victim carries `NO_ENTITY`. With `options.combat.debris`, each kill also
 *    releases the victim's debris from its own stream (Phase 16), spawning
 *    pieces that post no event; the event order below is unchanged.
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
    layout,
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
    const debris = debrisContext(options, player.tick);
    for (const hit of lethal) {
      const row = staticTargetById(hit.victim);
      if (row === undefined) {
        killShip(world, hit.victim, hit.killer, events, debris);
      } else {
        destroyBuoy(world, row, hit.killer, events, layout);
      }
    }
    drainAiEventsNow(world, player, layout, player.tick, events, registry);
    for (const id of commitWorld(world))
      events.push({ kind: "entityRemoved", id });
    if (combat !== undefined) updateIdentTarget(combat, player, world, events);
  }
  return events;
}

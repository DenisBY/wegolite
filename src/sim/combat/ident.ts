// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ident system (INPUT-01, D-04): R engages it and locks the nearest ship in
 * the sights of the current view, U drops the lock, and a lock is lost when its
 * ship leaves scanner range or the world.
 *
 * A port of Oolite's targeting: `handleButtonIdent` and the untarget key
 * (`PlayerEntityControls.m` pinned `:1255-1258`, `:1404-1418`, `:4758-4773`),
 * `updateTargeting` (`PlayerEntity.m:3699-3750`), `isValidTarget` (`:3595-3628`)
 * and `firstEntityTargetedByPlayer` (`Universe.m:5648-5710`). The search is
 * sphere-based on the target's collision radius and tied to the view
 * direction, so it needs no hull data and works with traffic off.
 *
 * The targets are everything Oolite's search lists that `canCollide`
 * (`Universe.m:5689-5707`, plan 18-06, CBT-17): the main station and the two
 * buoys (the static targets of `../world/statics.ts`, ids 3 to 5, at their
 * live position, PD-02, and their layout radius, the collision radius), the
 * dynamic ships, and the pods and plates (kind `cargo`, D-07). A wreck cannot
 * collide (`ShipEntity.m:1858-1868`) and is never a target; a destroyed buoy is
 * no target (D-05); a buoy's frangible subentity is no entity of its own in
 * Oolite's list and is never a target either.
 *
 * The combat step runs it in two halves, both inside `./step.ts` so `../sim.ts`
 * is unchanged:
 *
 * - `stepIdent` runs before the world step, with the drained commands and the
 *   flight events: the R and U keys and the silent clear on a jump commit.
 * - `updateIdentTarget` runs after shot resolution, against the world as the
 *   world step left it: it drops an invalid lock and acquires a new one.
 *
 * The target id is an id of the current world only. It is held in
 * `PlayerCombatState`, never outside `src/sim`, and is cleared at dock
 * (`dockReset`), at jump commit (here) and by a fresh combat state on Load or
 * Continue, so no id outlives its world.
 */

import type { Command } from "../commands.js";
import type { SimEvent } from "../events.js";
import type { FlightState } from "../flight/state.js";
import { add, dot, lengthSquared, rotate, sub } from "../math.js";
import type { Vec3 } from "../math.js";
import type { Entity } from "../world/entity.js";
import { NO_ENTITY } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import type { SystemLayout } from "../world/layout.js";
import {
  STATIC_TARGETS,
  buoyPosition,
  isBuoyDestroyed,
  staticIdentKey,
  staticTargetById,
} from "../world/statics.js";
import type { StaticTarget } from "../world/statics.js";
import type { World } from "../world/world.js";
import { laserFrame } from "./aim.js";
import {
  COBRA_VIEW_OFFSETS,
  IDENT_ACQUIRE_RANGE,
  SCANNER_MAX_RANGE,
  toWegoliteLocal,
} from "./constants.js";
import type { PlayerCombatState } from "./state.js";

/** A locked target as the HUD frames it: where it is and its collision radius. */
export interface IdentTargetSnapshot {
  readonly position: Vec3;
  readonly radius: number;
}

function hasEvent(
  events: readonly SimEvent[],
  kind: SimEvent["kind"],
): boolean {
  return events.some((event) => event.kind === kind);
}

/**
 * The ident sphere of a static target now: the station at its layout centre,
 * a buoy at its live position (`buoyPosition`, PD-02), each with its layout
 * radius, Oolite's collision radius (`../world/layout.ts`). Undefined for a
 * destroyed buoy (D-05).
 */
function staticSphere(
  row: StaticTarget,
  world: World,
  layout: SystemLayout,
): IdentTargetSnapshot | undefined {
  if (row.layoutKey === "station") {
    return {
      position: layout.station.position,
      radius: layout.station.radius,
    };
  }
  if (isBuoyDestroyed(world, row.layoutKey)) return undefined;
  return {
    position: buoyPosition(world, layout, row.layoutKey),
    radius: layout[row.layoutKey].radius,
  };
}

/**
 * Whether a store entity can be an ident target: a live ship, pod or plate
 * (`canCollide`, D-07). A wreck never can.
 */
function isTargetableEntity(entity: Entity): boolean {
  return !entity.dead && (entity.kind === "ship" || entity.kind === "cargo");
}

/**
 * The target `id` names now, or undefined when it names no target of this
 * world: a static row (a buoy not destroyed) or a live ship, pod or plate.
 */
function targetSphere(
  world: World,
  layout: SystemLayout,
  id: EntityId,
): IdentTargetSnapshot | undefined {
  const row = staticTargetById(id);
  if (row !== undefined) return staticSphere(row, world, layout);
  const entity = world.store.get(id);
  if (entity === undefined || !isTargetableEntity(entity)) return undefined;
  return { position: entity.position, radius: entity.radius };
}

/**
 * Whether the locked target is still valid (`isValidTarget`): it is a target of
 * this world (a static row whose buoy is not destroyed, or a live ship, pod or
 * plate) and lies within scanner range of the player. Oolite loses a target
 * when `zero_distance > SCANNER_MAX_RANGE2`, so a target at exactly 25,600 m
 * is still valid. The test is written so a non-finite distance is never valid.
 */
function isValidTarget(
  world: World,
  player: FlightState,
  id: EntityId,
  layout: SystemLayout,
): boolean {
  const sphere = targetSphere(world, layout, id);
  if (sphere === undefined) return false;
  const distance2 = lengthSquared(sub(sphere.position, player.position));
  return distance2 <= SCANNER_MAX_RANGE * SCANNER_MAX_RANGE;
}

/**
 * `-[Universe firstEntityTargetedByPlayer]`: the nearest target whose collision
 * sphere the view axis passes through, within `IDENT_ACQUIRE_RANGE` (100 m
 * inside the scanner range) and in front of the view. The origin is the player
 * position plus the view offset rotated by the ship's orientation; the axis is
 * the facing's forward from `laserFrame`, the same rotation the lasers and the
 * cameras use. Candidates are visited in ascending id: the static targets (the
 * station, 3, and the buoys, 4 and 5, unless destroyed, at their live position
 * and layout radius), then the live dynamic ships, pods and plates of the
 * store; the strict `<` keeps the first on an equal distance. A wreck cannot
 * collide and is skipped, as is a `CLASS_NO_DRAW` entity, as Oolite skips both
 * (`Universe.m:5691`). Returns `NO_ENTITY` when nothing is in the sights.
 */
function firstEntityTargetedByPlayer(
  player: FlightState,
  combat: PlayerCombatState,
  world: World,
  layout: SystemLayout,
): EntityId {
  const frame = laserFrame(player.orientation, combat.view);
  const origin = add(
    player.position,
    rotate(
      player.orientation,
      toWegoliteLocal(COBRA_VIEW_OFFSETS[combat.view]),
    ),
  );
  let nearest2 = IDENT_ACQUIRE_RANGE * IDENT_ACQUIRE_RANGE;
  let hit: EntityId = NO_ENTITY;
  const consider = (id: EntityId, position: Vec3, radius: number): void => {
    const rp = sub(position, origin);
    const dist2 = lengthSquared(rp);
    if (!(dist2 < nearest2)) return;
    const df = dot(frame.forward, rp);
    if (!(df > 0 && df * df < nearest2)) return;
    const du = dot(frame.up, rp);
    const dr = dot(frame.right, rp);
    if (du * du + dr * dr < radius * radius) {
      hit = id;
      nearest2 = dist2;
    }
  };
  // The static targets first: their ids (3 to 5) are below every store id.
  for (const row of STATIC_TARGETS) {
    const sphere = staticSphere(row, world, layout);
    if (sphere !== undefined) consider(row.id, sphere.position, sphere.radius);
  }
  for (const entity of world.store.live) {
    if (!isTargetableEntity(entity) || entity.scanClass === "CLASS_NO_DRAW") {
      continue;
    }
    consider(entity.id, entity.position, entity.radius);
  }
  return hit;
}

/**
 * The pre-world half: the ident and untarget commands and the jump clear.
 *
 * A `hyperspaceJumped` step clears the target silently and keeps the engaged
 * flag (the old world is replaced right after the step, so its id would name
 * nothing). The commands count only in flight and only when the ship was in
 * flight at the start of the step too, as `setView` does (`inFlightAtStart` is
 * false on the tick that completes the launch).
 *
 * `ident` (R), as Oolite's `handleButtonIdent`: engage ident. A lock that
 * exists is cleared first and the next update re-acquires whatever is in the
 * sights.
 *
 * `untarget` (U, Oolite's `key_untarget_missile`): drop the lock and switch
 * ident off; `wasEngaged` says whether Oolite prints "Ident system
 * deactivated." (true) or "Missiles on safety." (false).
 */
export function stepIdent(
  combat: PlayerCombatState,
  player: FlightState,
  commands: readonly Command[],
  flightEvents: readonly SimEvent[],
  inFlightAtStart: boolean,
  events: SimEvent[],
): void {
  if (hasEvent(flightEvents, "hyperspaceJumped")) {
    combat.identTarget = NO_ENTITY;
  }
  if (player.mode !== "inFlight" || !inFlightAtStart) return;
  for (const command of commands) {
    if (command.kind === "ident") {
      // D-04: advisor-recommended deviation, owner-confirmed 2026-11-15.
      // R while a lock exists clears it and re-acquires what is in the sights,
      // as Oolite's `handleButtonIdent` ("Clear current target if we're already
      // in Ident mode"). D-04 read literally ("pressing R again clears the
      // lock") would instead clear the target, switch ident off and emit
      // `identOff { wasEngaged: true }` here, and change the D-04 case of
      // `tests/sim/combat/ident.test.ts`. Nothing else depends on this branch.
      if (combat.identEngaged && combat.identTarget !== NO_ENTITY) {
        combat.identTarget = NO_ENTITY;
      }
      combat.identEngaged = true;
      events.push({ kind: "identEngaged" });
    } else if (command.kind === "untarget") {
      const wasEngaged = combat.identEngaged;
      combat.identTarget = NO_ENTITY;
      combat.identEngaged = false;
      events.push({ kind: "identOff", wasEngaged });
    }
  }
}

/**
 * The post-world half (`updateTargeting`): runs after shot resolution and the
 * kills, only on a tick that stepped the world. A target that is no longer
 * valid is dropped with `identLost` (ident stays engaged), so a buoy destroyed
 * this tick loses its lock on the same tick (D-05); then, with ident engaged,
 * no target and the player in flight, the target in the sights is locked and
 * `identLocked` carries its spec key: a static's compiled ident name key, or
 * the entity's spec key.
 */
export function updateIdentTarget(
  combat: PlayerCombatState,
  player: FlightState,
  world: World,
  events: SimEvent[],
  layout: SystemLayout,
): void {
  if (
    combat.identTarget !== NO_ENTITY &&
    !isValidTarget(world, player, combat.identTarget, layout)
  ) {
    combat.identTarget = NO_ENTITY;
    if (combat.identEngaged) events.push({ kind: "identLost" });
  }
  if (
    combat.identEngaged &&
    combat.identTarget === NO_ENTITY &&
    player.mode === "inFlight"
  ) {
    const found = firstEntityTargetedByPlayer(player, combat, world, layout);
    if (found !== NO_ENTITY) {
      const row = staticTargetById(found);
      // The main station is the system's own kind (Phase 22.1, WORLD-20).
      const specKey =
        row === undefined
          ? world.store.get(found)?.specKey
          : staticIdentKey(row, layout);
      if (specKey !== undefined) {
        combat.identTarget = found;
        events.push({ kind: "identLocked", specKey });
      }
    }
  }
}

/**
 * The locked target's position and collision radius, for the HUD frame and the
 * probe, or undefined when nothing is locked, there is no world or no layout,
 * or the id names no target of the world (a destroyed buoy, a ship that is
 * gone). A static's position is its live one. Read-only; no id leaves it.
 */
export function identTargetSnapshot(
  combat: PlayerCombatState,
  world: World | undefined,
  layout: SystemLayout | undefined,
): IdentTargetSnapshot | undefined {
  if (
    world === undefined ||
    layout === undefined ||
    combat.identTarget === NO_ENTITY
  ) {
    return undefined;
  }
  return targetSphere(world, layout, combat.identTarget);
}

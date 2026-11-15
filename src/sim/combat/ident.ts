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
 * sphere-based on the entity's `radius` and tied to the view direction, so it
 * needs no hull data.
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
import { NO_ENTITY } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import type { World } from "../world/world.js";
import { laserFrame } from "./aim.js";
import {
  COBRA_VIEW_OFFSETS,
  IDENT_ACQUIRE_RANGE,
  SCANNER_MAX_RANGE,
  toWegoliteLocal,
} from "./constants.js";
import type { PlayerCombatState } from "./state.js";

/** A locked ship as the HUD frames it: where it is and its collision radius. */
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
 * Whether the locked ship is still a valid target (`isValidTarget`): it exists
 * in this world, is a live ship and lies within scanner range of the player.
 * Oolite loses a target when `zero_distance > SCANNER_MAX_RANGE2`, so a ship at
 * exactly 25,600 m is still valid. The test is written so a non-finite distance
 * is never valid.
 */
function isValidTarget(
  world: World,
  player: FlightState,
  id: EntityId,
): boolean {
  const entity = world.store.get(id);
  if (entity === undefined || entity.dead || entity.kind !== "ship") {
    return false;
  }
  const distance2 = lengthSquared(sub(entity.position, player.position));
  return distance2 <= SCANNER_MAX_RANGE * SCANNER_MAX_RANGE;
}

/**
 * `-[Universe firstEntityTargetedByPlayer]`: the nearest ship whose collision
 * sphere the view axis passes through, within `IDENT_ACQUIRE_RANGE` (100 m
 * inside the scanner range) and in front of the view. The origin is the player
 * position plus the view offset rotated by the ship's orientation; the axis is
 * the facing's forward from `laserFrame`, the same rotation the lasers and the
 * cameras use. Candidates are the live, non-dead dynamic ships in ascending id;
 * the strict `<` keeps the first on an equal distance. The station and the
 * buoys are static entities and never candidates; a `CLASS_NO_DRAW` ship is
 * skipped as Oolite skips it. Returns `NO_ENTITY` when nothing is in the sights.
 */
function firstEntityTargetedByPlayer(
  player: FlightState,
  combat: PlayerCombatState,
  world: World,
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
  for (const entity of world.store.live) {
    if (
      entity.dead ||
      entity.kind !== "ship" ||
      entity.scanClass === "CLASS_NO_DRAW"
    ) {
      continue;
    }
    const rp = sub(entity.position, origin);
    const dist2 = lengthSquared(rp);
    if (!(dist2 < nearest2)) continue;
    const df = dot(frame.forward, rp);
    if (!(df > 0 && df * df < nearest2)) continue;
    const du = dot(frame.up, rp);
    const dr = dot(frame.right, rp);
    if (du * du + dr * dr < entity.radius * entity.radius) {
      hit = entity.id;
      nearest2 = dist2;
    }
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
 * The post-world half (`updateTargeting`): runs after shot resolution, only on a
 * tick that stepped the world. A target that is no longer valid is dropped with
 * `identLost` (ident stays engaged); then, with ident engaged, no target and
 * the player in flight, the ship in the sights is locked and `identLocked`
 * carries its spec key.
 */
export function updateIdentTarget(
  combat: PlayerCombatState,
  player: FlightState,
  world: World,
  events: SimEvent[],
): void {
  if (
    combat.identTarget !== NO_ENTITY &&
    !isValidTarget(world, player, combat.identTarget)
  ) {
    combat.identTarget = NO_ENTITY;
    if (combat.identEngaged) events.push({ kind: "identLost" });
  }
  if (
    combat.identEngaged &&
    combat.identTarget === NO_ENTITY &&
    player.mode === "inFlight"
  ) {
    const found = firstEntityTargetedByPlayer(player, combat, world);
    if (found !== NO_ENTITY) {
      const entity = world.store.get(found);
      if (entity !== undefined) {
        combat.identTarget = found;
        events.push({ kind: "identLocked", specKey: entity.specKey });
      }
    }
  }
}

/**
 * The locked ship's position and collision radius, for the HUD frame, or
 * undefined when nothing is locked, there is no world or the id names no live
 * ship in it. Read-only.
 */
export function identTargetSnapshot(
  combat: PlayerCombatState,
  world: World | undefined,
): IdentTargetSnapshot | undefined {
  if (world === undefined || combat.identTarget === NO_ENTITY) return undefined;
  const entity = world.store.get(combat.identTarget);
  if (entity === undefined || entity.dead || entity.kind !== "ship") {
    return undefined;
  }
  return { position: entity.position, radius: entity.radius };
}

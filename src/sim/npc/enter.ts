// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The entry effects of the `perform*` methods and the lazy accuracy draw
 * (AI-01, plan 14-09; `ShipEntityAI.m:350-480`, `ShipEntity.m:665-672,
 * 1126-1143`).
 *
 * `ShipControl.perform` runs inside an AI think, where the AI has no random
 * stream of the actor's `combat` kind and no access to the ship's stats. So
 * `enterBehaviour` applies the part of a `perform*` method that needs neither a
 * draw, the stats nor another body (the behaviour, `frustration`, the desired
 * speed) at once, and sets `steer.entryPending` when the method has more to do.
 * `completeEntry` runs that remaining part at the start of the actor's next
 * update, where the steering holds the stats and the draw source.
 *
 * Entry-pending rules:
 *  - `enterBehaviour` always sets `nav.behaviour` and, for an entry with a
 *    deferred part, sets `entryPending`; for an entry without one it clears the
 *    flag, so a later perform in the same think cancels an earlier deferred
 *    part;
 *  - `completeEntry` switches on the CURRENT `nav.behaviour`, so with two
 *    performs in one think only the last one's deferred part runs;
 *  - a perform whose Oolite guard makes it a no-op changes no field and clears
 *    the flag (the guarded no-ops of later plans).
 * Recorded divergences (plan 14-19): an AI write in the same think after a
 * perform whose deferred part sets a field is overwritten by the deferred part
 * at the next update, where Oolite's AI write would win; and the same deferred
 * perform issued twice in one think draws once at completion where Oolite draws
 * once per call.
 */

import type { BehaviourId } from "../world/ids.js";
import type { Entity } from "../world/entity.js";
import { ACCURACY_DRAW_OFFSET, ACCURACY_DRAW_SPAN } from "./constants.js";
import type { SteerContext } from "./dispatch.js";
import { MAX_ACCURACY, MIN_ACCURACY } from "../world/limits.js";

/**
 * The context-free part of the `perform*` method for `behaviour`, in Oolite's
 * order. An id with no Oolite `perform*` method (for example
 * FLY_TO_DESTINATION) only sets the behaviour and clears the flag.
 */
export function enterBehaviour(entity: Entity, behaviour: BehaviourId): void {
  const steer = entity.steer;
  const nav = entity.nav;
  switch (behaviour) {
    case "IDLE": // performIdle, ShipEntityAI.m:407-411
      nav.behaviour = "IDLE";
      steer.frustration = 0;
      steer.entryPending = false;
      break;
    case "STOP_STILL": // performStop, ShipEntityAI.m:466-471
      nav.behaviour = "STOP_STILL";
      nav.desiredSpeed = 0;
      steer.frustration = 0;
      steer.entryPending = false;
      break;
    case "TUMBLE": // performTumble, ShipEntityAI.m:473-479
      nav.behaviour = "TUMBLE";
      steer.frustration = 0;
      // The sticks need two draws and the ship's stats: deferred.
      steer.entryPending = true;
      break;
    case "FLY_RANGE_FROM_DESTINATION": // performFlyToRangeFromDestination, ShipEntityAI.m:394-398
      nav.behaviour = "FLY_RANGE_FROM_DESTINATION";
      steer.frustration = 0;
      steer.entryPending = false;
      break;
    case "FACE_DESTINATION": // performFaceDestination, ShipEntityAI.m:373-377
      nav.behaviour = "FACE_DESTINATION";
      steer.frustration = 0;
      steer.entryPending = false;
      break;
    case "INTERCEPT_TARGET": // performIntercept, ShipEntityAI.m:413-417
      nav.behaviour = "INTERCEPT_TARGET";
      steer.frustration = 0;
      steer.entryPending = false;
      break;
    default:
      nav.behaviour = behaviour;
      steer.entryPending = false;
      break;
  }
}

/**
 * The deferred part of the pending entry for the current behaviour, then clear
 * the flag. Called by `steerShip` when `steer.entryPending` is set.
 */
export function completeEntry(entity: Entity, ctx: SteerContext): void {
  const steer = entity.steer;
  switch (entity.nav.behaviour) {
    case "TUMBLE": {
      // performTumble, ShipEntityAI.m:475-476: roll first, then pitch.
      const roll = ctx.draw();
      steer.stickRoll = ctx.stats.maxFlightRoll * 2 * (roll - 0.5);
      const pitch = ctx.draw();
      steer.stickPitch = ctx.stats.maxFlightPitch * 2 * (pitch - 0.5);
      break;
    }
    default:
      break;
  }
  steer.entryPending = false;
}

/**
 * Draw the ship's accuracy once, when it is still the unresolved sentinel
 * (`ShipEntity.m:665-672` through the `setAccuracy:` clamp, 1126-1143). A lazy
 * draw instead of Oolite's setup draw, so the populator's world stream does not
 * move (Pitfall 3); the changed draw order is a recorded divergence.
 */
export function resolveAccuracy(entity: Entity, ctx: SteerContext): void {
  const steer = entity.steer;
  if (steer.accuracy >= MIN_ACCURACY) return;
  let accuracy = ctx.draw() * ACCURACY_DRAW_SPAN + ACCURACY_DRAW_OFFSET;
  if (
    accuracy < 0 &&
    (entity.scanClass === "CLASS_MILITARY" ||
      entity.scanClass === "CLASS_POLICE")
  ) {
    // police and military pilots have a better average skill (669-671)
    accuracy = -accuracy;
  }
  // setAccuracy: clamp (1128-1134)
  if (accuracy < 0 && entity.scanClass === "CLASS_MISSILE") {
    accuracy = 0;
  } else if (accuracy < MIN_ACCURACY) {
    accuracy = MIN_ACCURACY;
  } else if (accuracy > MAX_ACCURACY) {
    accuracy = MAX_ACCURACY;
  }
  steer.accuracy = accuracy;
}

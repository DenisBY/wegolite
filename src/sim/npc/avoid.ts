// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The avoid-collision entry and exit (AI-01, plan 14-13): `avoidCollision`
 * (`ShipEntity.m:5904-5936`), `resumePostProximityAlert` (5938-5958) and
 * `hasProximityAlertIgnoringTarget:` (9751-9758). BEHAVIOUR_AVOID_COLLISION
 * itself is plan 14-15's.
 *
 * The alert is `steer.proximityAlert`, an entity id read through `ctx.view` on
 * every use. Oolite's `proximityAlert` clears a reference whose object is gone
 * (6089-6096); an id the view no longer returns (a removed entity, the ship
 * itself) counts as no alert and is cleared here the same way (T-14-50).
 *
 * The saved condition is `steer.saved` (Oolite's `previousCondition`
 * dictionary): the behaviour, the primary target (absent from the dictionary
 * for none, which `resumePostProximityAlert` restores as none), the desired
 * range and speed and the destination.
 */

import { vec } from "../math.js";
import type { Entity } from "../world/entity.js";
import type { BodyView } from "../world/view.js";
import {
  AVOID_MIDPOINT,
  PROXIMITY_AVOID_DISTANCE_FACTOR,
} from "./constants.js";
import type { SteerContext } from "./dispatch.js";
import { targetBody } from "./target.js";
import { startTrackingCurve } from "./tracking-curve.js";

/**
 * `proximityAlert` (6089-6096): the body the ship is steering away from, or
 * undefined (and the id cleared) when there is none or it is gone.
 */
export function proximityAlertBody(
  entity: Entity,
  ctx: SteerContext,
): BodyView | undefined {
  const id = entity.steer.proximityAlert;
  if (id === 0) return undefined;
  const body = id === entity.id ? undefined : ctx.view.body(id);
  if (body === undefined) {
    entity.steer.proximityAlert = 0; // DESTROY(_proximityAlert)
  }
  return body;
}

/**
 * `hasProximityAlertIgnoringTarget:` (9751-9758): an alert exists and, when
 * `ignoreTarget` is set, it is not the primary target.
 */
export function hasProximityAlertIgnoringTarget(
  entity: Entity,
  ctx: SteerContext,
  ignoreTarget: boolean,
): boolean {
  const alert = proximityAlertBody(entity, ctx);
  if (alert === undefined) return false;
  if (!ignoreTarget) return true;
  return alert.id !== targetBody(entity, ctx.view)?.id;
}

/**
 * `avoidCollision` (5904-5936): save the current condition, steer for the
 * midpoint between the ship and the other one with a desired range of ten of
 * the other's radii, and pitch over. A missile does not avoid (5909).
 */
export function avoidCollision(entity: Entity, ctx: SteerContext): void {
  if (entity.scanClass === "CLASS_MISSILE") return; // missiles are SUPPOSED to collide!
  const other = proximityAlertBody(entity, ctx);
  if (other === undefined) return;

  const nav = entity.nav;
  entity.steer.saved = {
    behaviour: nav.behaviour,
    targetId: targetBody(entity, ctx.view)?.id ?? 0,
    desiredRange: nav.desiredRange,
    desiredSpeed: nav.desiredSpeed,
    destination: vec(nav.destination.x, nav.destination.y, nav.destination.z),
  };

  // OOHPVectorInterpolate(position, other, 0.5) = a + 0.5 * (b - a)
  const here = entity.position;
  nav.destination = vec(
    here.x + AVOID_MIDPOINT * (other.position.x - here.x),
    here.y + AVOID_MIDPOINT * (other.position.y - here.y),
    here.z + AVOID_MIDPOINT * (other.position.z - here.z),
  );
  nav.desiredRange = other.radius * PROXIMITY_AVOID_DISTANCE_FACTOR;
  nav.behaviour = "AVOID_COLLISION";
  entity.steer.pitchingOver = true;
}

/**
 * `resumePostProximityAlert` (5938-5958): restore the saved condition, restart
 * the tracking curve (5946), zero the frustration (5953) and clear the saved
 * condition and the alert. Does nothing when nothing is saved.
 */
export function resumePostProximityAlert(
  entity: Entity,
  ctx: SteerContext,
): void {
  const steer = entity.steer;
  const saved = steer.saved;
  if (saved === null) return;

  const nav = entity.nav;
  nav.behaviour = saved.behaviour;
  nav.targetId = saved.targetId;
  startTrackingCurve(entity, ctx.view, ctx.view.tick);
  nav.desiredRange = saved.desiredRange;
  nav.desiredSpeed = saved.desiredSpeed;
  nav.destination = vec(
    saved.destination.x,
    saved.destination.y,
    saved.destination.z,
  );

  steer.saved = null;
  steer.frustration = Math.fround(0);
  steer.proximityAlert = 0; // DESTROY(_proximityAlert)
}

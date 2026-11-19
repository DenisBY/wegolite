// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Target sensing for the native steering (AI-01, plan 14-12): which body a ship
 * may steer at, how far and at what aspect it is, whether it can still be
 * tracked, how tight the aim must be, and what losing it does.
 *
 * Oolite keeps the primary target as a weak reference and `primaryTarget`
 * clears it as a side effect of reading it when it is no longer valid. Wegolite
 * keeps the id in `nav.targetId` and re-reads it through the world view on every
 * use, so a stale id (a removed entity, a planet, the ship itself) behaves as
 * Oolite's cleared reference: the lost-target path runs, which writes the id 0.
 * Every read goes through `view.body`, which answers only live ids of this
 * world (T-14-21).
 *
 * Collision radii come from `BodyView.radius` (plan 14-05); the step passes the
 * compiled player radius to the view (plan 14-12), so a range to the player
 * does not depend on when a lazy hull file loads.
 */

import type { Vec3 } from "../math.js";
import { dot, normalizeVec, rotate, sub, vec } from "../math.js";
import type { Entity } from "../world/entity.js";
import type { BodyView, WorldView } from "../world/view.js";
import {
  AIM_BEST_COS_AWFUL,
  AIM_BEST_COS_BETTER,
  AIM_BEST_COS_DEADLY,
  AIM_DEADLY_DIVISOR,
  AIM_MISSED_SHOT_DIVISOR,
  AIM_TOLERANCE_ACCURACY_FACTOR,
  AIM_TOLERANCE_BASE,
  AIM_TOLERANCE_SCALE,
  ASPECT_ZERO_SNAP,
  CAN_TRACK_RANGE2_FACTOR,
  COMBAT_AI_ISNT_AWFUL,
  COMBAT_AI_TRACKS_CLOSER,
  SCANNER_MAX_RANGE,
} from "./constants.js";
import type { SteerContext } from "./dispatch.js";

const LOCAL_FORWARD: Vec3 = vec(0, 0, -1);

/**
 * The body `entity` is targeting when it is a valid target, else undefined.
 *
 * `isValidTarget:` (`ShipEntity.m:8638-8656`) accepts a ship (`isShip`: every
 * dynamic kind, the station, buoys and the player; Wegolite has no wormholes),
 * and `primaryTarget` drops a reference to the ship itself (8724-8730). So the
 * target is valid when its id is not the ship's own and the view returns a body
 * that is not a planet or the sun. The id 0 ("none") resolves to no body.
 */
export function targetBody(
  entity: Entity,
  view: WorldView,
): BodyView | undefined {
  const id = entity.nav.targetId;
  if (id === entity.id) return undefined;
  const body = view.body(id);
  if (body === undefined) return undefined;
  if (body.kind === "planet" || body.kind === "sun") return undefined;
  return body;
}

/**
 * `rangeToPrimaryTarget` (`ShipEntity.m:9718-9733`) from a world view alone: the
 * centre distance minus both collision radii, or 0 for no valid target. A
 * target that is the ship itself is no valid target, so its range is 0.
 */
export function rangeToTargetIn(entity: Entity, view: WorldView): number {
  const target = targetBody(entity, view);
  if (target === undefined) return 0;
  const delta = sub(target.position, entity.position);
  const dist = Math.sqrt(
    delta.x * delta.x + delta.y * delta.y + delta.z * delta.z,
  );
  return dist - target.radius - entity.radius;
}

/**
 * `rangeToPrimaryTarget` (`ShipEntity.m:9718-9733`): `rangeToTargetIn` through
 * the steering context's view.
 */
export function rangeToPrimaryTarget(
  entity: Entity,
  ctx: SteerContext,
): number {
  return rangeToTargetIn(entity, ctx.view);
}

/**
 * `approachAspectToPrimaryTarget` (`ShipEntity.m:9736-9749`): the cosine
 * between the target's forward vector and the direction from the target to this
 * ship, or 0 for no valid target. `vector_normal` of a zero vector is the zero
 * vector, so coincident centres give 0. A cosine within `ASPECT_ZERO_SNAP` of 0
 * is 0 (an exactly abeam pose, which Oolite's exact basis vectors hold exactly).
 */
export function approachAspectToPrimaryTarget(
  entity: Entity,
  ctx: SteerContext,
): number {
  const target = targetBody(entity, ctx.view);
  if (target === undefined) return 0;
  const delta = normalizeVec(sub(entity.position, target.position));
  const aspect = dot(delta, rotate(target.orientation, LOCAL_FORWARD));
  // Wegolite addition (plan 14-14), not an Oolite line: see ASPECT_ZERO_SNAP.
  return Math.abs(aspect) < ASPECT_ZERO_SNAP ? 0 : aspect;
}

/**
 * `canStillTrackPrimaryTarget` (`ShipEntity.m:8696-8715`): a valid target
 * within 1.25 scanner ranges. (Cloaking is not modelled.)
 */
export function canStillTrackPrimaryTarget(
  entity: Entity,
  ctx: SteerContext,
): boolean {
  const target = targetBody(entity, ctx.view);
  if (target === undefined) return false;
  const delta = sub(target.position, entity.position);
  const range2 = delta.x * delta.x + delta.y * delta.y + delta.z * delta.z;
  return !(
    range2 >
    SCANNER_MAX_RANGE * SCANNER_MAX_RANGE * CAN_TRACK_RANGE2_FACTOR
  );
}

/**
 * `currentAimTolerance` (`ShipEntity.m:9759-9810`): the cosine inside which the
 * ship thinks it is on target; lower is worse. The "aim better after a miss"
 * term is live: for accuracy at least `COMBAT_AI_ISNT_AWFUL` the basic aim is
 * divided by `1 + missedShots / 4` (9769) before the deadly divisor, and it is
 * the exact identity at `missedShots` 0. One Oolite term stays cut: the
 * sun-glare term is not modelled (a recorded scope cut: every ship is treated
 * as not sunlit, 9784-9797). The weapon-facing terms (9777-9784) never apply:
 * the compiled records author no aft, port or starboard weapon, so every
 * ship's `currentWeaponFacing` is forward.
 */
export function currentAimTolerance(entity: Entity): number {
  const accuracy = entity.steer.accuracy;
  // setAccuracy: aim_tolerance = 240 - 18 * accuracy (1138)
  let basicAim = AIM_TOLERANCE_BASE - AIM_TOLERANCE_ACCURACY_FACTOR * accuracy;
  let bestCos = AIM_BEST_COS_AWFUL;
  if (accuracy >= COMBAT_AI_ISNT_AWFUL) {
    bestCos = AIM_BEST_COS_BETTER; // better general targeting
    // if missing, aim better! (9769); the identity at missedShots 0
    basicAim /= 1 + entity.weapon.missedShots / AIM_MISSED_SHOT_DIVISOR;
  }
  if (accuracy >= COMBAT_AI_TRACKS_CLOSER) {
    bestCos = AIM_BEST_COS_DEADLY; // deadly shots
    basicAim /= AIM_DEADLY_DIVISOR; // and an extremely good aim circle
  }
  const maxCos = Math.sqrt(1 - (basicAim * basicAim) / AIM_TOLERANCE_SCALE);
  return maxCos < bestCos ? maxCos : bestCos;
}

/**
 * `noteLostTargetAndGoIdle` (`ShipEntity.m:8798-8803`) with `noteLostTarget`
 * (8779-8792): behaviour IDLE, frustration 0 (a GLfloat write), the target
 * cleared, and one `shipTargetLost`. The event carries the target id only when
 * the target is still a valid ship (it was lost by range); a gone or invalid
 * target posts it with no argument. The plist-only `TARGET_LOST` AI message has
 * no consumer and is not posted.
 */
export function noteLostTargetAndGoIdle(
  entity: Entity,
  ctx: SteerContext,
): void {
  const target = targetBody(entity, ctx.view);
  entity.nav.behaviour = "IDLE";
  entity.steer.frustration = Math.fround(0);
  entity.nav.targetId = 0;
  ctx.emit(
    target === undefined
      ? { name: "shipTargetLost" }
      : { name: "shipTargetLost", a: target.id },
  );
}

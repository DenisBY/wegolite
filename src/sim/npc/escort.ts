// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The escort leader refresh (AI-01, plan 14-15): Oolite's `update:` writes the
 * formation destination of every escort of a ship right after the ship's own
 * behaviour has run (`ShipEntity.m:2427-2436`), whatever behaviour the escort is
 * in. The write goes to OTHER ships, so it cannot live in `steerShip` (which
 * writes only the steered entity): the world step calls `refreshEscorts` right
 * after each steered leader's own update, so the leader moves first and a
 * higher-id follower reads the fresh destination in the same tick.
 *
 * The default pattern is the V of `oolite-global-prefix.js:165-193`:
 * `highPart = floor(slot / 4) + 1`, `lowPart = slot % 4`, spacing
 * `collisionRadius x 3 x highPart`, the pattern vector scaled by the spacing,
 * rotated into the leader's frame and added to its position
 * (`coordinatesForEscortPosition:`, `ShipEntity.m:12029-12044`). Wegolite's
 * local forward is -Z, so each pattern z is negated.
 *
 * Recorded divergences (plan 14-19): a follower's slot is fixed (`escortSlot`,
 * set at spawn; Oolite's index shifts when an escort dies); an inert leader
 * (no AI, never updated by the world step) refreshes nobody; a follower whose id
 * is lower than its leader's steers before the leader moves and reads the
 * previous tick's destination.
 */

import { rotate, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import { MAX_ESCORT_SLOT } from "../world/limits.js";
import type { Entity } from "../world/entity.js";
import type { World } from "../world/world.js";
import { ESCORT_PATTERN, ESCORT_SPACING_FACTOR } from "./constants.js";

/** The pose of a leader the formation is built around. */
export interface LeaderPose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

/**
 * `coordinatesForEscortPosition:` with the default pattern: the world position
 * of formation slot `slot` behind a leader of collision radius `leaderRadius`.
 * A slot above `MAX_ESCORT_SLOT` takes the last one (12031: "return the same
 * last escort position if we have escorts above MAX_ESCORTS").
 */
export function escortCoordinates(
  leaderPose: LeaderPose,
  leaderRadius: number,
  slot: number,
): Vec3 {
  const index = Math.min(slot, MAX_ESCORT_SLOT);
  const highPart = Math.floor(index / ESCORT_PATTERN.length) + 1;
  const lowPart = index % ESCORT_PATTERN.length;
  const spacing = leaderRadius * ESCORT_SPACING_FACTOR * highPart;
  const pattern = ESCORT_PATTERN[lowPart] ?? ESCORT_PATTERN[0] ?? [0, 0];
  const local = vec(pattern[0] * spacing, 0, -pattern[1] * spacing);
  const offset = rotate(leaderPose.orientation, local);
  return vec(
    leaderPose.position.x + offset.x,
    leaderPose.position.y + offset.y,
    leaderPose.position.z + offset.z,
  );
}

/**
 * Write `nav.destination` of every live steered ship whose `ownerId` is
 * `leader`, in ascending id, from its own `steer.escortSlot`, regardless of its
 * behaviour (`ShipEntity.m:2431-2436`, `setEscortDestination:` does not reset
 * the frustration, 11900-11903). Writes only `nav.destination`, and only of a
 * follower.
 */
export function refreshEscorts(world: World, leader: Entity): void {
  const live = world.store.live;
  for (let i = 0; i < live.length; i += 1) {
    const follower = live[i];
    if (
      follower === undefined ||
      follower.dead ||
      follower.ai === null ||
      follower.id === leader.id ||
      follower.ownerId !== leader.id
    ) {
      continue;
    }
    follower.nav.destination = escortCoordinates(
      leader,
      leader.radius,
      follower.steer.escortSlot,
    );
  }
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's collision response (CBT-18, D-01): stub for the RED step of plan
 * 18-16. The port replaces this body.
 */

import { vec } from "../math.js";
import type { Vec3 } from "../math.js";

/** `dam = m x v2b^2 / 50000000` (`ShipEntity.m:11089-11090`). */
export const COLLISION_DAMAGE_DIVISOR = 50_000_000;
/** `v2b < -1.0f`: already separating, no response (`ShipEntity.m:11080`). */
export const SEPARATING_SPEED_LIMIT = -1;
/** `magnitude2(v) <= 0.1`: the 1 m/s anti-conjoin rule (`ShipEntity.m:11096`). */
export const ANTI_CONJOIN_MAGNITUDE2 = 0.1;
/** `dam > 0.05`: the scrape floor (`ShipEntity.m:11114, 11123`). */
export const MIN_SCRAPE_DAMAGE = 0.05;
/** `t = 10.0 * getTimeDelta`, "10 ticks" (`ShipEntity.m:11138`). */
export const COLLISION_NUDGE_TICKS = 10;

/** One side of a contact. */
export interface CollisionParty {
  readonly position: Vec3;
  readonly velocity: Vec3;
  readonly mass: number;
  readonly energy: number;
  readonly destroyable: boolean;
}

/** The two sides of a contact; `self` is the entity whose call runs. */
export interface CollisionInput {
  readonly self: CollisionParty;
  readonly other: CollisionParty & {
    readonly parentVelocity?: Vec3;
    readonly parentFrangible?: boolean;
  };
}

/** The response of one `collideWithShip` call. */
export type CollisionResponse =
  | { readonly kind: "separating" }
  | {
      readonly kind: "collided";
      readonly loc: Vec3;
      readonly v2b: number;
      readonly v1a: number;
      readonly dam1: number;
      readonly dam2: number;
      readonly antiConjoin: boolean;
      readonly applied1: boolean;
      readonly applied2: boolean;
      readonly dam2Receiver: "other" | "otherParent" | null;
      readonly selfDestroyed: boolean;
      readonly otherDestroyed: boolean;
      readonly dv1: Vec3;
      readonly dvOtherBody: Vec3;
      readonly dvOtherSubentity: Vec3 | null;
      readonly nudged: boolean;
      readonly dp1: Vec3;
      readonly dpOther: Vec3;
      readonly dpOtherSubentity: Vec3 | null;
    };

const ZERO = vec(0, 0, 0);

/** Stub: always a zero response. */
export function collideWithShip(input: CollisionInput): CollisionResponse {
  return {
    kind: "collided",
    loc: ZERO,
    v2b: 0,
    v1a: 0,
    dam1: 0,
    dam2: 0,
    antiConjoin: false,
    applied1: false,
    applied2: false,
    dam2Receiver: null,
    selfDestroyed: false,
    otherDestroyed: false,
    dv1: ZERO,
    dvOtherBody: ZERO,
    dvOtherSubentity: input.other.parentVelocity === undefined ? null : ZERO,
    nudged: false,
    dp1: ZERO,
    dpOther: ZERO,
    dpOtherSubentity: input.other.parentVelocity === undefined ? null : ZERO,
  };
}

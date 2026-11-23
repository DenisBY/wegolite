// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's collision response, `-[ShipEntity collideWithShip:]`
 * (`ShipEntity.m:11020-11152`, pin `7437f22`), as a pure kernel (CBT-18,
 * D-01, PD-01, PD-02, PD-05).
 *
 * It applies nothing. It reports the damage each side would take, the net
 * velocity change of each body and the position nudges, and the caller (the
 * collision stage, plans 18-11 and 18-18) applies them. "Once per contact"
 * is not a guard here: after the response the pair separates faster than
 * 1 m/s, and the next call returns `separating` (D-01).
 *
 * What is ported and what is not:
 *
 * - No scoop branch (11035-11042, PD-05): rammed pods take damage.
 * - No station special case (`otherIsStation`, 11030, 11112, 11142): the
 *   station is not a collider in Wegolite (PD-02).
 * - The damage half is the scrape (`takeScrapeDamage:`), never the energy
 *   (laser) half; this kernel reports amounts and the caller routes them
 *   (the player's through `routeScrapeDamage`, which does not heat).
 * - The `shipCollided` script event and the `COLLISION` AI message (11152+)
 *   are not ported (RESEARCH A8).
 * - `selfDestroyed` / `otherDestroyed` (11111-11112) are read before any
 *   damage and only for a `destroyable` party: the player is destroyable (D-11),
 *   its energy is the bank only (never shields plus energy), and a player
 *   brought to 0 dies through `killPlayer` (`./death.ts`).
 *
 * Axes: Wegolite world axes are Oolite's with z negated. Every float step
 * below is sign-symmetric (`f(-x) = -f(x)`, products and sums of negated
 * pairs), so the arithmetic is the C's in either frame; only the
 * coincident-centre fallback `kBasisZHPVector` (Oolite +z,
 * `OOHPVector.h:283-286`) becomes Wegolite (0, 0, -1).
 *
 * Float choices (the C's types; `f` is `Math.fround`):
 *
 * - `hploc` is an `HPVector` (double): `vec x (1 / sqrt(|vec|^2))`, or the
 *   z basis when `|vec|^2 == 0` (`OOHPVector.h:265-271`). `loc` is its float
 *   (`HPVectorToVector`, `OOHPVector.h:175-182`).
 * - The GLfloat locals `m1`, `m2`, `v2b`, `v1a` and `t`, the `Vector`
 *   velocities and every `Vector` op (`vector_subtract`, `dot_product`,
 *   `magnitude2`, `vector_multiply_scalar`) round at every step, left to
 *   right as the C evaluates them (`OOVector.h:180-302`).
 * - `sqrt` is the double function rounded back on assignment to `v1a`.
 * - `dam1` and `dam2` are doubles holding the float expression
 *   `m x v2b x v2b / 50000000` (each step rounded, the integer divisor exact
 *   as a float). The compares with the double literals 0.1 and 0.05 are
 *   double compares of the widened float.
 * - `t = 10.0 x getTimeDelta` with Wegolite's fixed `DT` (1/120), never a
 *   frame time, so the nudge cannot depend on the frame rate (RESEARCH
 *   Pattern 4 step 8).
 * - Positions are `HPVector` (double): the 1 m step and the nudges are
 *   double offsets of float vectors.
 *
 * Velocity changes are the exact sum of the `adjustVelocity:` arguments
 * Oolite applies to a body (`ShipEntity.m:11173-11176`): a reversal that adds
 * `-x` after `+x` reports zero.
 *
 * Totality (T-18-21): a non-finite or non-positive mass (after rounding to a
 * float) is `separating`, and so is any response with a non-finite number in
 * it (a NaN position, a float overflow at absurd speeds); such a pair gets
 * nothing, where Oolite would propagate the NaN or the infinity.
 */

import { DT } from "../step.js";
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
  /** World position; for a subentity, its absolute position (11032). */
  readonly position: Vec3;
  /**
   * Total velocity: drift plus forward x speed (`ShipEntity.m:11159-11162`).
   * Unused for a subentity contact, which takes its parent's.
   */
  readonly velocity: Vec3;
  readonly mass: number;
  readonly energy: number;
  /**
   * Whether `dam > energy` may set the destroyed flag (11111-11112). True for
   * the player (D-11): its energy is the bank only, and a lethal ram takes
   * Oolite's inelastic reversal.
   */
  readonly destroyable: boolean;
}

/** The two sides of a contact; `self` is the entity whose call runs. */
export interface CollisionInput {
  readonly self: CollisionParty;
  readonly other: CollisionParty & {
    /**
     * Present exactly for a subentity contact: the parent's total velocity,
     * which replaces the other's in `v` (11057-11067). The parent is the body
     * that moves (11103-11106).
     */
    readonly parentVelocity?: Vec3;
    /**
     * For a subentity contact: whether the parent is frangible (default
     * `YES`, `ShipEntity.m:376`). A non-frangible parent takes `dam2` in the
     * subentity's place (11124-11125).
     */
    readonly parentFrangible?: boolean;
  };
}

/** The response of one `collideWithShip` call. */
export type CollisionResponse =
  /** `v2b < -1` (11080-11081), or a degenerate input: nothing happens. */
  | { readonly kind: "separating" }
  | {
      readonly kind: "collided";
      /** The float line of centres, self to other (11032-11033). */
      readonly loc: Vec3;
      /** Closing speed along `loc` (11072). */
      readonly v2b: number;
      /** Self's rebound speed, signed as `v2b` (11074-11076). */
      readonly v1a: number;
      /** Damage to self (11089). */
      readonly dam1: number;
      /** Damage to the other side (11090). */
      readonly dam2: number;
      /** `magnitude2(v) <= 0.1`: the 1 m/s solution (11096-11099). */
      readonly antiConjoin: boolean;
      /** `dam1 > 0.05`: self takes `dam1` as scrape damage (11114-11115). */
      readonly applied1: boolean;
      /** `dam2 > 0.05`: the other side takes `dam2` (11123-11128). */
      readonly applied2: boolean;
      /**
       * Who takes `dam2`: the contacted entity (for a subentity contact, the
       * subentity) or a non-frangible parent; null when not applied.
       */
      readonly dam2Receiver: "other" | "otherParent" | null;
      readonly selfDestroyed: boolean;
      readonly otherDestroyed: boolean;
      /** Net velocity change of self. */
      readonly dv1: Vec3;
      /** Net velocity change of the body that moves: the other, or the parent. */
      readonly dvOtherBody: Vec3;
      /**
       * Null for a whole-ship other. For a subentity contact, the change
       * Oolite makes to the subentity itself (the selfDestroyed reversal,
       * 11117-11119); the caller records it and never applies it, because an
       * attached subentity has no velocity of its own.
       */
      readonly dvOtherSubentity: Vec3 | null;
      /** Whether the 10-tick nudge ran (11136-11147). */
      readonly nudged: boolean;
      /** Self's displacement: the 1 m step (11083) plus the nudge (11140-11141). */
      readonly dp1: Vec3;
      /** The other whole ship's nudge (11143-11146); zero for a subentity. */
      readonly dpOther: Vec3;
      /**
       * Null for a whole-ship other. For a subentity contact, the nudge Oolite
       * adds to the subentity's own position (11143-11146): the parent does
       * not move. The caller records it as a divergence and does not apply it.
       */
      readonly dpOtherSubentity: Vec3 | null;
    };

const SEPARATING: CollisionResponse = Object.freeze({ kind: "separating" });

const ZERO: Vec3 = vec(0, 0, 0);

/** Oolite's `kBasisZHPVector` in Wegolite axes. */
const Z_BASIS: Vec3 = vec(0, 0, -1);

const f = Math.fround;

function floatVec(v: Vec3): Vec3 {
  return vec(f(v.x), f(v.y), f(v.z));
}

/** `vector_subtract` on float vectors (`OOVector.h:218-224`). */
function floatSub(a: Vec3, b: Vec3): Vec3 {
  return vec(f(a.x - b.x), f(a.y - b.y), f(a.z - b.z));
}

/** `dot_product`, left to right in float (`OOVector.h:299-302`). */
function floatDot(a: Vec3, b: Vec3): number {
  return f(f(f(a.x * b.x) + f(a.y * b.y)) + f(a.z * b.z));
}

/** `vector_multiply_scalar` in float (`OOVector.h:180-190`). */
function floatScale(v: Vec3, s: number): Vec3 {
  return vec(f(v.x * s), f(v.y * s), f(v.z * s));
}

/** `m x v2b x v2b / 50000000` as the C's float expression (11089-11090). */
function floatDamage(mass: number, v2b: number): number {
  return f(f(f(mass * v2b) * v2b) / COLLISION_DAMAGE_DIVISOR);
}

function addVec(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function negVec(v: Vec3): Vec3 {
  return vec(-v.x, -v.y, -v.z);
}

function isFiniteVec(v: Vec3 | null): boolean {
  return v === null || Number.isFinite(v.x + v.y + v.z);
}

/** `HPvector_normal_or_zbasis` (`OOHPVector.h:265-286`), in double. */
function normalOrZBasis(v: Vec3): Vec3 {
  const mag2 = v.x * v.x + v.y * v.y + v.z * v.z;
  if (mag2 === 0) return Z_BASIS;
  const inv = 1 / Math.sqrt(mag2);
  return vec(v.x * inv, v.y * inv, v.z * inv);
}

/**
 * One `collideWithShip:` call with `self` as the receiver (`ShipEntity.m:
 * 11020-11152`), step by step; see the module header for the float choices.
 */
export function collideWithShip(input: CollisionInput): CollisionResponse {
  const { self, other } = input;

  // 11053-11054: GLfloat m1 = mass, m2 = [other mass]. A degenerate mass has
  // no response (T-18-21).
  const m1 = f(self.mass);
  const m2 = f(other.mass);
  if (!(m1 > 0) || !(m2 > 0) || !Number.isFinite(m1 + m2)) return SEPARATING;

  // 11032-11033: the line of centres, self to other.
  const hploc = normalOrZBasis({
    x: other.position.x - self.position.x,
    y: other.position.y - self.position.y,
    z: other.position.z - self.position.z,
  });
  const loc = floatVec(hploc);

  // 11057-11070: the subentity takes its parent's velocity.
  const isSubentity = other.parentVelocity !== undefined;
  const otherVelocity = floatVec(other.parentVelocity ?? other.velocity);
  let v = floatSub(floatVec(self.velocity), otherVelocity);

  // 11072-11076.
  const v2b = floatDot(v, loc);
  let v1a = f(Math.sqrt(f(f(f(v2b * v2b) * m2) / m1)));
  if (v2b < 0) v1a = -v1a;

  // 11079-11086: apart at over 1 m/s already; else the 1 m step and v = 0.
  let step = ZERO;
  if (v2b < 0) {
    if (v2b < SEPARATING_SPEED_LIMIT) return SEPARATING;
    step = negVec(hploc);
    v = ZERO;
  }

  // 11089-11090.
  const dam1 = floatDamage(m2, v2b);
  const dam2 = floatDamage(m1, v2b);

  // 11093-11099.
  let vel1a = floatScale(loc, -v1a);
  let vel2a = floatScale(loc, v2b);
  const antiConjoin = floatDot(v, v) <= ANTI_CONJOIN_MAGNITUDE2;
  if (antiConjoin) {
    vel1a = floatScale(loc, -1);
    vel2a = loc;
  }

  // 11102-11109: the other (or its parent) first, then self.
  let dvOtherBody = vel2a;
  let dvOtherSubentity: Vec3 | null = isSubentity ? ZERO : null;
  let dv1 = vel1a;

  // 11111-11112: read before this pair's damage.
  const selfDestroyed = self.destroyable && dam1 > self.energy;
  const otherDestroyed = other.destroyable && dam2 > other.energy;

  // 11114-11121: the reversal lands on `other` itself, which for a subentity
  // contact is the subentity, not the parent pushed at 11103-11106.
  const applied1 = dam1 > MIN_SCRAPE_DAMAGE;
  if (applied1 && selfDestroyed) {
    const reversal = floatScale(vel2a, -1);
    if (dvOtherSubentity !== null) {
      dvOtherSubentity = addVec(dvOtherSubentity, reversal);
    } else {
      dvOtherBody = addVec(dvOtherBody, reversal);
    }
  }

  // 11123-11135.
  const applied2 = dam2 > MIN_SCRAPE_DAMAGE;
  let dam2Receiver: "other" | "otherParent" | null = null;
  if (applied2) {
    dam2Receiver =
      isSubentity && other.parentFrangible === false ? "otherParent" : "other";
    if (otherDestroyed) {
      dv1 = addVec(dv1, floatScale(vel1a, -1));
    }
  }

  // 11136-11147: the 10-tick nudge, self by t x v1a and the other by t x v2b,
  // both along loc (self moves toward the other when closing: literal Oolite).
  const nudged = !selfDestroyed && !otherDestroyed;
  let dp1 = step;
  let dpOther = ZERO;
  let dpOtherSubentity: Vec3 | null = isSubentity ? ZERO : null;
  if (nudged) {
    const t = f(COLLISION_NUDGE_TICKS * DT);
    dp1 = addVec(step, floatScale(loc, f(t * v1a)));
    const otherNudge = floatScale(loc, f(t * v2b));
    if (isSubentity) {
      dpOtherSubentity = otherNudge;
    } else {
      dpOther = otherNudge;
    }
  }

  const response: CollisionResponse = {
    kind: "collided",
    loc,
    v2b,
    v1a,
    dam1,
    dam2,
    antiConjoin,
    applied1,
    applied2,
    dam2Receiver,
    selfDestroyed,
    otherDestroyed,
    dv1,
    dvOtherBody,
    dvOtherSubentity,
    nudged,
    dp1,
    dpOther,
    dpOtherSubentity,
  };
  const finite =
    Number.isFinite(v2b + v1a + dam1 + dam2) &&
    [
      loc,
      dv1,
      dvOtherBody,
      dvOtherSubentity,
      dp1,
      dpOther,
      dpOtherSubentity,
    ].every(isFiniteVec);
  return finite ? response : SEPARATING;
}

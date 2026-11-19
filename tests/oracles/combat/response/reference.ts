// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independent transliteration of Oolite's collision response (Phase 18, plan
 * 18-03): `collideWithShip:` (`ShipEntity.m:11020-11152`) with
 * `adjustVelocity:` (11173-11176).
 *
 * Independence: this module imports nothing outside `tests/oracles` (a type
 * import of this tree's own `schema.ts` only). Its sole input is the pinned
 * Oolite source (commit `7437f22`), cited line by line below.
 *
 * Float widths, as the C declares them. `Vector` components are `GLfloat`
 * (`OOScalar`, `OOMaths.h:49`); `HPVector` components are double
 * (`OOHPScalar`, `OOMaths.h:51`). In `collideWithShip:` the locals `m1`, `m2`,
 * `v2b` and `v1a` are `GLfloat` (11053-11074), `dam1` and `dam2` are `double`
 * (11024) but assigned from the float expression `m2 * v2b * v2b / 50000000`
 * (the integer literal converts to the float 5e7 exactly), and the nudge time
 * `t` is a `float` (11138). Every float operation is rounded with
 * `Math.fround` step by step, in the C's evaluation order (left to right; no
 * fused multiply-add, the x86-64 SSE baseline Oolite builds for has none);
 * compares against the double literals `0.1` and `0.05` widen the float.
 * `sqrt` is the double function: the float argument widens, the result is
 * rounded back on assignment (11074).
 *
 * Scope cuts recorded here (none changes a modelled line):
 *
 * - no scooping (PD-05): the scoop branch (11035-11042) is out of phase, and a
 *   rammed pod takes damage;
 * - the other is never the main station (`otherIsStation`, 11030, 11112,
 *   11143): the station is not a collider in Wegolite;
 * - the damage itself (`takeScrapeDamage:`) is not applied here: a fixture
 *   says whether it is called and with what amount; the player's shield path
 *   is `playerScrapeReference`'s, and ShipEntity's own `takeScrapeDamage:`
 *   (11641-11676) is never used to derive a damage figure (PITFALLS 12);
 * - `destroyable: false` (the player) masks the destroyed flag of
 *   11111-11112: the player's death is Phase 20's.
 */

import type {
  BlastFixture,
  BrakingFixture,
  CollideFixture,
  ScrapeFixture,
} from "./schema.js";

type Vec3 = readonly [number, number, number];
type MutableVec3 = [number, number, number];

const f = Math.fround;

/** One native update step (1/120 s exactly). */
export const DT = 1 / 120;

/** The divisor of the damage energy (`ShipEntity.m:11089-11090`). */
export const COLLISION_DAMAGE_DIVISOR = 50000000;
/** `v2b < -1.0f`: already separating faster than 1 m/s (11080). */
export const SEPARATING_SPEED_LIMIT = -1;
/** `magnitude2(v) <= 0.1`, a double literal (11096). */
export const ANTI_CONJOIN_MAGNITUDE2 = 0.1;
/** `dam > 0.05`, a double literal (11114, 11123). */
export const MIN_SCRAPE_DAMAGE = 0.05;
/** `10.0 * [UNIVERSE getTimeDelta]` (11138). */
export const COLLISION_NUDGE_TICKS = 10;

/** `magnitude2` (`OOVector.h:237-240`), float. */
export function magnitude2f(v: Vec3): number {
  return f(f(f(v[0] * v[0]) + f(v[1] * v[1])) + f(v[2] * v[2]));
}

/** `dot_product` (`OOVector.h:299-302`), float. */
export function dotf(a: Vec3, b: Vec3): number {
  return f(f(f(a[0] * b[0]) + f(a[1] * b[1])) + f(a[2] * b[2]));
}

/** `vector_multiply_scalar` (`OOVector.h:180-193`), float; `s` is a float. */
export function scalef(v: Vec3, s: number): MutableVec3 {
  const sf = f(s);
  return [f(v[0] * sf), f(v[1] * sf), f(v[2] * sf)];
}

/** `vector_subtract` (`OOVector.h:218-225`), float. */
function subtractf(a: Vec3, b: Vec3): MutableVec3 {
  return [f(a[0] - b[0]), f(a[1] - b[1]), f(a[2] - b[2])];
}

/** `HPvector_subtract` (`OOHPVector.h:236-243`), double. */
function subtractd(a: Vec3, b: Vec3): MutableVec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/**
 * `HPvector_normal_or_zbasis` (`OOHPVector.h:265-271, 283-286`): the double
 * magnitude squared, `+z` when it is exactly zero, else `v x (1.0 / sqrt)`.
 */
function normalOrZBasisd(v: Vec3): MutableVec3 {
  const mag2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (mag2 === 0) return [0, 0, 1];
  const s = 1 / Math.sqrt(mag2);
  return [v[0] * s, v[1] * s, v[2] * s];
}

/** Exact accumulation of `adjustVelocity:` arguments. */
function add(a: Vec3, b: Vec3): MutableVec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function negate(v: Vec3): MutableVec3 {
  return [-v[0], -v[1], -v[2]];
}

const zero = (): MutableVec3 => [0, 0, 0];

/** The inputs of one collision: a fixture without its expectation. */
export type CollideInput = Pick<CollideFixture, "dt" | "self" | "other">;

/** What `collideWithShip:` does to both parties. */
export type CollideResult = CollideFixture["expected"];

/**
 * `collideWithShip:` (`ShipEntity.m:11020-11152`), self against other, step
 * by step.
 */
export function collideWithShipReference(input: CollideInput): CollideResult {
  const { self, other } = input;
  const sub = other.isSubentityOf;

  // 11031-11033: the line of centres from self to the other's absolute
  // position, in double, then narrowed to a float Vector.
  const hploc = normalOrZBasisd(subtractd(other.position, self.position));
  const loc: MutableVec3 = [f(hploc[0]), f(hploc[1]), f(hploc[2])];

  // 11053-11054: GLfloat masses.
  const m1 = f(self.mass);
  const m2 = f(other.mass);

  // 11057-11070: the other's velocity is its parent's for a subentity.
  const vel1b = self.velocity;
  const velOther = sub === null ? other.velocity : sub.parentVelocity;
  let v: MutableVec3 = subtractf(vel1b, velOther);

  // 11072-11076.
  const v2b = dotf(v, loc);
  let v1a = f(Math.sqrt(f(f(f(v2b * v2b) * m2) / m1)));
  if (v2b < 0) v1a = -v1a;

  const dpSelf = zero();
  const isSub = sub !== null;

  // 11079-11086: already separating.
  if (v2b < 0) {
    if (v2b < SEPARATING_SPEED_LIMIT) {
      return {
        outcome: "separating",
        loc,
        v2b,
        v1a,
        dam1: 0,
        dam2: 0,
        antiConjoin: false,
        applied1: false,
        applied2: false,
        dam2Receiver: null,
        selfDestroyed: false,
        otherDestroyed: false,
        dv1: zero(),
        dvOtherBody: zero(),
        dvOtherSubentity: isSub ? zero() : null,
        nudged: false,
        dp1: zero(),
        dpOther: zero(),
        dpOtherSubentity: isSub ? zero() : null,
      };
    }
    // position = position - hploc (double); v = 0: the 1 m/s solution.
    dpSelf[0] = -hploc[0];
    dpSelf[1] = -hploc[1];
    dpSelf[2] = -hploc[2];
    v = zero();
  }

  // 11089-11090: float expressions, widened to double on assignment.
  const dam1 = f(f(f(m2 * v2b) * v2b) / f(COLLISION_DAMAGE_DIVISOR));
  const dam2 = f(f(f(m1 * v2b) * v2b) / f(COLLISION_DAMAGE_DIVISOR));

  // 11093-11099.
  let vel1a = scalef(loc, -v1a);
  let vel2a = scalef(loc, v2b);
  const antiConjoin = magnitude2f(v) <= ANTI_CONJOIN_MAGNITUDE2;
  if (antiConjoin) {
    vel1a = scalef(loc, -1);
    vel2a = [loc[0], loc[1], loc[2]];
  }

  // 11102-11109: the other's parent (or the other) first, then self.
  let dvOtherBody = add(zero(), vel2a);
  let dvOtherSubentity: MutableVec3 | null = isSub ? zero() : null;
  let dv1 = add(zero(), vel1a);

  // 11111-11112: read before any damage is dealt (the station term is
  // never true here; `destroyable` masks the player's flag).
  const selfDestroyed = self.destroyable && dam1 > self.energy;
  const otherDestroyed = other.destroyable && dam2 > other.energy;

  // 11114-11120.
  const applied1 = dam1 > MIN_SCRAPE_DAMAGE;
  if (applied1 && selfDestroyed) {
    vel2a = negate(vel2a);
    // `[other adjustVelocity:]`: the contacted entity, the subentity itself.
    if (dvOtherSubentity !== null) {
      dvOtherSubentity = add(dvOtherSubentity, vel2a);
    } else {
      dvOtherBody = add(dvOtherBody, vel2a);
    }
  }

  // 11123-11135.
  const applied2 = dam2 > MIN_SCRAPE_DAMAGE;
  let dam2Receiver: CollideResult["dam2Receiver"] = null;
  if (applied2) {
    dam2Receiver = sub !== null && !sub.frangible ? "otherParent" : "other";
    if (otherDestroyed) {
      vel1a = negate(vel1a);
      dv1 = add(dv1, vel1a);
    }
  }

  // 11137-11147: the 10-tick nudge, t = f(10.0 x dt).
  const nudged = !selfDestroyed && !otherDestroyed;
  let dp1: MutableVec3 = dpSelf;
  let dpOther = zero();
  let dpOtherSubentity: MutableVec3 | null = isSub ? zero() : null;
  if (nudged) {
    const t = f(COLLISION_NUDGE_TICKS * input.dt);
    const nudge1 = scalef(loc, f(t * v1a));
    dp1 = add(dpSelf, nudge1);
    const nudge2 = scalef(loc, f(t * v2b));
    // `[other setPosition:]`: the subentity's own position for a subentity.
    if (dpOtherSubentity !== null) dpOtherSubentity = nudge2;
    else dpOther = nudge2;
  }

  return {
    outcome: "collided",
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
}

// ---------------------------------------------------------------------------
// Task 2 (RED stubs)

export type BrakingInput = Omit<
  BrakingFixture,
  "expected" | "id" | "title" | "citations" | "derivation" | "tolerance"
>;
export type BrakingResult = BrakingFixture["expected"];
export type ScrapeInput = Pick<
  ScrapeFixture,
  "amount" | "otherOffset" | "forward" | "shields" | "energy"
>;
export type ScrapeResult = ScrapeFixture["expected"];
export type BlastInput = Pick<BlastFixture, "victims" | "receivers">;
export type BlastResult = BlastFixture["expected"];

const STUB_BRAKE: BrakingResult = {
  perTickLoss: 0,
  firstTickLoss: 0,
  samples: [{ tick: 1, speed: 0 }],
  positionChange: [0, 0, 0],
  finalVelocity: [0, 0, 0],
  stopTick: null,
};

/** RED stub. */
export function playerBrakeReference(input: BrakingInput): BrakingResult {
  void input;
  return STUB_BRAKE;
}

/** RED stub. */
export function npcBrakeReference(input: BrakingInput): BrakingResult {
  void input;
  return STUB_BRAKE;
}

/** RED stub. */
export function playerScrapeReference(input: ScrapeInput): ScrapeResult {
  return {
    dForward: 0,
    shieldHit: "forward",
    shields: { ...input.shields },
    remainder: 0,
    energy: input.energy,
    heatChange: 0,
  };
}

/** RED stub. */
export function blastReference(input: BlastInput): BlastResult {
  return {
    victims: input.victims.map(() => ({ desiredRange: 1, amount: 1 })),
    receivers: input.receivers.map(() => ({ dv: null, contributions: [] })),
  };
}

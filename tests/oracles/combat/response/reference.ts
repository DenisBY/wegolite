// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independent transliteration of Oolite's collision response (Phase 18, plan
 * 18-03): `collideWithShip:` (`ShipEntity.m:11020-11152`) with
 * `adjustVelocity:` (11173-11176); the drift braking of the player
 * (`PlayerEntity.m:3372-3405`) and of ships and buoys
 * (`ShipEntity.m:5808-5823`); the player's scrape through the shields
 * (`PlayerEntity.m:5701-5753`); the explosion blast (`ShipEntity.m:7680-7698,
 * 8114-8126`, `Universe.m:5862-5868`).
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
// drift braking (D-02)

/** `VELOCITY_CLEANUP_MIN 2000.0f` (`PlayerEntity.m:3346`). */
export const VELOCITY_CLEANUP_MIN = Math.fround(2000);
/** `VELOCITY_CLEANUP_FULL 5000.0f` (`PlayerEntity.m:3347`). */
export const VELOCITY_CLEANUP_FULL = Math.fround(5000);
/** `VELOCITY_CLEANUP_RATE 0.001f` (`PlayerEntity.m:3348`): a float constant. */
export const VELOCITY_CLEANUP_RATE = Math.fround(0.001);
/** `SHIP_THRUST_FACTOR 5.0f` (`ShipEntity.h:46`). */
export const SHIP_THRUST_FACTOR = 5;

/** The inputs of one braking run: a fixture without its expectation. */
export type BrakingInput = Pick<
  BrakingFixture,
  | "kind"
  | "dt"
  | "velocity"
  | "speed"
  | "maxSpeed"
  | "torusFactor"
  | "thrust"
  | "ticks"
>;
export type BrakingResult = BrakingFixture["expected"];

/** The ticks a braking result samples: fixed, increasing, within the run. */
function sampleTicks(ticks: number, stopTick: number | null): number[] {
  const wanted = [1, 2, 10, 60, 120, 600, ticks];
  if (stopTick !== null) wanted.push(stopTick - 1, stopTick);
  return [...new Set(wanted)]
    .filter((tick) => tick >= 1 && tick <= ticks)
    .sort((a, b) => a - b);
}

function speedOf(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

/** `magnitude` (`OOVector.h:242-245`): the double sqrt of the float square. */
function magnitudef(v: Vec3): number {
  return f(Math.sqrt(magnitude2f(v)));
}

interface BrakeStep {
  /** The drift after this tick's braking. */
  readonly velocity: MutableVec3;
  /** The speed this tick removed. */
  readonly loss: number;
}

function runBraking(
  input: BrakingInput,
  perTickLoss: number,
  step: (v: MutableVec3) => BrakeStep,
  moveFirst: boolean,
): BrakingResult {
  let v: MutableVec3 = [...input.velocity];
  const position = zero();
  const speeds: number[] = [];
  let stopTick: number | null = null;
  let firstTickLoss = 0;
  // `applyVelocity:` (Entity.m:878-881): position += (double)velocity x dt.
  const move = (): void => {
    position[0] += v[0] * input.dt;
    position[1] += v[1] * input.dt;
    position[2] += v[2] * input.dt;
  };
  for (let tick = 1; tick <= input.ticks; tick += 1) {
    const moving = speedOf(v) > 0;
    if (moveFirst) move();
    const result = step(v);
    v = result.velocity;
    if (!moveFirst) move();
    if (tick === 1) firstTickLoss = result.loss;
    if (moving && stopTick === null && speedOf(v) === 0) stopTick = tick;
    speeds.push(speedOf(v));
  }
  return {
    perTickLoss,
    firstTickLoss,
    samples: sampleTicks(input.ticks, stopTick).map((tick) => ({
      tick,
      speed: speeds[tick - 1] ?? Number.NaN,
    })),
    positionChange: position,
    finalVelocity: [v[0] + 0, v[1] + 0, v[2] + 0],
    stopTick,
  };
}

/**
 * The player's drift (`PlayerEntity.m:3372-3405`): `applyVelocity:` first
 * (3376), then the thrust factor (1, or the torus factor while flightSpeed >
 * maxFlightSpeed, 3378-3385; injectors are not modelled), then
 * `velmag2 = velmag - (float)dt x thrust x thrust_factor` (3387-3388), the
 * cleanup term above 2000 m/s (3392-3400) and the clamp or rescale
 * (3401-3404). Floats: `velmag`, `velmag2`, `rate`, `thrust_factor`.
 */
export function playerBrakeReference(input: BrakingInput): BrakingResult {
  const { speed, maxSpeed, torusFactor } = input;
  if (speed === null || maxSpeed === null || torusFactor === null) {
    throw new Error("a player braking run needs speed, maxSpeed, torusFactor");
  }
  const thrustFactor = f(speed) > f(maxSpeed) ? f(torusFactor) : 1;
  const perTickLoss = f(f(f(input.dt) * f(input.thrust)) * thrustFactor);
  const step = (v: MutableVec3): BrakeStep => {
    const velmag = magnitudef(v);
    let velmag2 = f(velmag - perTickLoss);
    if (!(velmag > 0)) return { velocity: v, loss: 0 };
    if (velmag > VELOCITY_CLEANUP_MIN) {
      const rate =
        velmag > VELOCITY_CLEANUP_FULL
          ? VELOCITY_CLEANUP_RATE
          : f(
              f(
                f(velmag - VELOCITY_CLEANUP_MIN) /
                  f(VELOCITY_CLEANUP_FULL - VELOCITY_CLEANUP_MIN),
              ) * VELOCITY_CLEANUP_RATE,
            );
      velmag2 = f(velmag2 - f(velmag * rate));
    }
    if (velmag2 < 0) return { velocity: zero(), loss: velmag };
    return {
      velocity: scalef(v, f(velmag2 / velmag)),
      loss: velmag - velmag2,
    };
  };
  return runBraking(input, perTickLoss, step, true);
}

/**
 * A ship's (and a buoy's) drift: `applyThrust:` brakes the Newtonian velocity
 * only when `thrust` is non-zero (`ShipEntity.m:5808-5823`), by
 * `dt_thrust = SHIP_THRUST_FACTOR x thrust x delta_t` (a GLfloat, 5810) with
 * `vscale = fmaxf((velmag - dt_thrust) / velmag, 0.0f)` (5817-5822). The
 * ship's update brakes first (`processBehaviour:` at `ShipEntity.m:2415`
 * reaches `applyThrust:` at 2633-2637; a tumbling buoy too, 2487-2491) and
 * moves after (`[super update:]` at 2462, `Entity.m:868-881`).
 */
export function npcBrakeReference(input: BrakingInput): BrakingResult {
  const thrust = f(input.thrust);
  const dtThrust = f(f(SHIP_THRUST_FACTOR * thrust) * input.dt);
  const step = (v: MutableVec3): BrakeStep => {
    if (thrust === 0) return { velocity: v, loss: 0 };
    const velmag = magnitudef(v);
    if (velmag === 0) return { velocity: v, loss: 0 };
    const vscale = Math.max(f(f(velmag - dtThrust) / velmag), 0);
    const next = scalef(v, vscale);
    return { velocity: next, loss: velmag - magnitudef(next) };
  };
  return runBraking(input, thrust === 0 ? 0 : dtThrust, step, false);
}

// ---------------------------------------------------------------------------
// the player's scrape (PlayerEntity.m:5701-5753)

export type ScrapeInput = Pick<
  ScrapeFixture,
  "amount" | "otherOffset" | "forward" | "shields" | "energy"
>;
export type ScrapeResult = ScrapeFixture["expected"];

/**
 * `PlayerEntity takeScrapeDamage:from:` up to the hand-off to ShipEntity's
 * energy decrement: the amount made positive (5710-5713), `d_forward` as the
 * float dot product of the narrowed offset with `v_forward` (5717-5720), the
 * shield on that side (`GLfloat`, `PlayerEntity.h:448`) lowered by the double
 * amount and narrowed back, the overflow passed on (5726-5744), then
 * `energy -= amount` (`ShipEntity.m:11651`, a GLfloat). No heat changes; the
 * internal-damage loop (5746-5752) is Phase 19's.
 */
export function playerScrapeReference(input: ScrapeInput): ScrapeResult {
  let amount = input.amount < 0 ? -input.amount : input.amount;
  const rel: Vec3 = [
    f(input.otherOffset[0]),
    f(input.otherOffset[1]),
    f(input.otherOffset[2]),
  ];
  const dForward = dotf(rel, input.forward);
  let forward = f(input.shields.forward);
  let aft = f(input.shields.aft);
  const shieldHit = dForward >= 0 ? "forward" : "aft";
  if (shieldHit === "forward") {
    forward = f(forward - amount);
    if (forward < 0) {
      amount = -forward;
      forward = 0;
    } else {
      amount = 0;
    }
  } else {
    aft = f(aft - amount);
    if (aft < 0) {
      amount = -aft;
      aft = 0;
    } else {
      amount = 0;
    }
  }
  return {
    dForward,
    shieldHit,
    shields: { forward, aft },
    remainder: amount,
    energy: f(input.energy - amount),
    heatChange: 0,
  };
}

// ---------------------------------------------------------------------------
// the explosion blast (D-03)

export type BlastInput = Pick<BlastFixture, "victims" | "receivers">;
export type BlastResult = BlastFixture["expected"];
type BlastContribution =
  BlastResult["receivers"][number]["contributions"][number];

/** `d2 < 0.1 -> 0.1` (`ShipEntity.m:7688-7690`). */
export const BLAST_MIN_D2 = 0.1;
/** `desired_range = collision_radius * 2.5f` (8124). */
export const BLAST_RANGE_FACTOR = 2.5;
/** `dealMomentumWithinDesiredRange:0.125f * mass` (8125). */
export const BLAST_MOMENT_FACTOR = 0.125;

/**
 * Every victim's `dealMomentumWithinDesiredRange:` (`ShipEntity.m:7680-7698`)
 * on every receiver, in the victims' order. A victim's range is
 * `f(collision_radius x 2.5f)` and its amount `f(0.125f x mass)` (8124-8125).
 * A receiver is in range when the double distance squared is below the float
 * `(range + r_receiver)^2` (`Universe.m:5862-5868`, strict). Then
 * `p2 = vectorTo:` narrowed to float (`Entity.m:603-606`), `d2 =
 * magnitude2(p2) - r_receiver^2` in double with the RECEIVER's radius,
 * floored at 0.1, `moment = amount x range / d2` (7685-7691), and
 * `addImpactMoment:vector_normal(p2) fraction:moment` (11178-11181): the
 * GLfloat fraction over the receiver's mass, times the float unit vector
 * (`vector_normal` gives zero for a receiver at the victim's centre,
 * `OOVector.h:247-273`).
 */
export function blastReference(input: BlastInput): BlastResult {
  const victims = input.victims.map((victim) => ({
    desiredRange: f(f(victim.radius) * f(BLAST_RANGE_FACTOR)),
    amount: f(f(BLAST_MOMENT_FACTOR) * f(victim.mass)),
  }));
  const receivers = input.receivers.map((receiver) => {
    const contributions: BlastContribution[] = input.victims.map(
      (victim, i) => {
        const { desiredRange, amount } = victims[i]!;
        const cr = f(desiredRange + f(receiver.radius));
        const d = subtractd(receiver.position, victim.position);
        const distance2 = d[0] * d[0] + d[1] * d[1] + d[2] * d[2];
        if (!(distance2 < f(cr * cr))) {
          return {
            inRange: false,
            d2: null,
            floored: false,
            moment: null,
            dv: null,
          };
        }
        const p2: Vec3 = [f(d[0]), f(d[1]), f(d[2])];
        const ecr = receiver.radius;
        let d2 = magnitude2f(p2) - ecr * ecr;
        const floored = d2 < BLAST_MIN_D2;
        if (floored) d2 = BLAST_MIN_D2;
        const moment = (amount * desiredRange) / d2;
        const mag2 = magnitude2f(p2);
        const unit: Vec3 =
          mag2 === 0 ? [0, 0, 0] : scalef(p2, f(1 / Math.sqrt(mag2)));
        const k = f(f(moment) / f(receiver.mass));
        const dv = scalef(unit, k);
        return {
          inRange: true,
          d2,
          floored,
          moment,
          dv: [dv[0] + 0, dv[1] + 0, dv[2] + 0],
        };
      },
    );
    let total: MutableVec3 | null = null;
    for (const c of contributions) {
      if (c.dv !== null) total = add(total ?? zero(), c.dv);
    }
    return { dv: total, contributions };
  });
  return { victims, receivers };
}

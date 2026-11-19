// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `collideWithShip` hand cases (CBT-18, D-01, PD-01, PD-02, PD-05).
 *
 * Every expected value is worked by hand from `ShipEntity.m:11020-11152`
 * (Oolite pin `7437f22`), never from running the code under test or from the
 * 18-03 fixtures. Wegolite axes are Oolite's with z negated, so a ship ahead
 * of another sits at -z and the coincident-centre fallback `kBasisZHPVector`
 * (Oolite +z) is Wegolite (0, 0, -1).
 *
 * The C's GLfloat arithmetic matters only where a hand value is not exact:
 * the nudge time `t = 10.0 x getTimeDelta` is the float of 10/120,
 * 0.0833333358168602, so a 100 m/s nudge is f(t x 100) = 8.333333969116211 m.
 */

import { describe, expect, it } from "vitest";

import {
  ANTI_CONJOIN_MAGNITUDE2,
  COLLISION_DAMAGE_DIVISOR,
  COLLISION_NUDGE_TICKS,
  MIN_SCRAPE_DAMAGE,
  SEPARATING_SPEED_LIMIT,
  collideWithShip,
} from "../../../src/sim/combat/response.js";
import type {
  CollisionInput,
  CollisionParty,
  CollisionResponse,
} from "../../../src/sim/combat/response.js";
import { vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";

const f = Math.fround;
/** `t = 10.0 x getTimeDelta` held in a float (11138), one tick 1/120 s. */
const T = f(10 * (1 / 120));

type Collided = Extract<CollisionResponse, { kind: "collided" }>;

function party(patch: Partial<CollisionParty> = {}): CollisionParty {
  return {
    position: vec(0, 0, 0),
    velocity: vec(0, 0, 0),
    mass: 1000,
    energy: 200,
    destroyable: true,
    ...patch,
  };
}

/** Self at the origin, other 50 m ahead (-z), self closing at `speed`. */
function headOn(
  speed: number,
  self: Partial<CollisionParty> = {},
  other: Partial<CollisionInput["other"]> = {},
): CollisionInput {
  return {
    self: party({ velocity: vec(0, 0, -speed), ...self }),
    other: { ...party({ position: vec(0, 0, -50) }), ...other },
  };
}

function collided(response: CollisionResponse): Collided {
  if (response.kind !== "collided") {
    throw new Error(`expected a collision, got ${response.kind}`);
  }
  return response;
}

/** Component compare that treats -0 and +0 alike. */
function expectVec(actual: Vec3 | null, x: number, y: number, z: number): void {
  expect(actual).not.toBeNull();
  if (actual === null) return;
  expect(actual.x).toBeCloseTo(x, 9);
  expect(actual.y).toBeCloseTo(y, 9);
  expect(actual.z).toBeCloseTo(z, 9);
}

describe("collideWithShip constants", () => {
  it("carries the C's literals", () => {
    expect(COLLISION_DAMAGE_DIVISOR).toBe(50_000_000);
    expect(SEPARATING_SPEED_LIMIT).toBe(-1);
    expect(ANTI_CONJOIN_MAGNITUDE2).toBe(0.1);
    expect(MIN_SCRAPE_DAMAGE).toBe(0.05);
    expect(COLLISION_NUDGE_TICKS).toBe(10);
  });
});

describe("collideWithShip: hand cases from ShipEntity.m:11020-11152", () => {
  it("head-on, equal masses closing at 100 m/s: elastic exchange, damage and nudge", () => {
    // loc = (0,0,-1); v = (0,0,-100); v2b = 100; v1a = sqrt(100^2 x m/m) = 100.
    // dam = 1000 x 100^2 / 5e7 = f(0.2) each (11089-11090).
    // vel1a = loc x -100 = (0,0,100); vel2a = loc x 100 = (0,0,-100) (11093-11094).
    // Nudge (11138-11146): self += loc x f(t x 100), other += loc x f(t x 100).
    const r = collided(collideWithShip(headOn(100)));
    expectVec(r.loc, 0, 0, -1);
    expect(r.v2b).toBe(100);
    expect(r.v1a).toBe(100);
    // The float expression widened: f(1e7 / 5e7) = f(0.2).
    expect(r.dam1).toBe(f(0.2));
    expect(r.dam2).toBe(f(0.2));
    expect(r.antiConjoin).toBe(false);
    expect(r.applied1).toBe(true);
    expect(r.applied2).toBe(true);
    expect(r.dam2Receiver).toBe("other");
    expect(r.selfDestroyed).toBe(false);
    expect(r.otherDestroyed).toBe(false);
    expectVec(r.dv1, 0, 0, 100);
    expectVec(r.dvOtherBody, 0, 0, -100);
    expect(r.dvOtherSubentity).toBeNull();
    expect(r.nudged).toBe(true);
    // Self moves toward the other (literal Oolite, never "fixed").
    expectVec(r.dp1, 0, 0, -f(T * 100));
    expectVec(r.dpOther, 0, 0, -f(T * 100));
    expect(r.dpOtherSubentity).toBeNull();
    expect(f(T * 100)).toBe(8.333333969116211);
  });

  it("separating faster than 1 m/s returns before any response", () => {
    // v = (0,0,2); v2b = dot(v, loc) = -2 < -1 (11080-11081).
    expect(collideWithShip(headOn(-2)).kind).toBe("separating");
    // Same relative motion with the other moving away.
    expect(
      collideWithShip(headOn(0, {}, { velocity: vec(0, 0, -2) })).kind,
    ).toBe("separating");
  });

  it("separating at 0.5 m/s: the 1 m step, the anti-conjoin 1 m/s and the 10-tick nudges", () => {
    // v2b = -0.5 (not < -1); v1a = -sqrt(0.25) = -0.5 (11074-11076).
    // Self steps back by hploc: (0,0,+1) (11083); v = 0 (11084), so
    // magnitude2(v) = 0 <= 0.1: vel1a = -loc = (0,0,1), vel2a = loc (11096-11099).
    // dam = 1000 x 0.25 / 5e7 = 5e-6: no scrape (11114, 11123).
    // Nudge: self += loc x f(t x -0.5) = (0,0,+t/2), away from the other;
    // other += loc x f(t x -0.5) = (0,0,+t/2), toward self.
    const r = collided(collideWithShip(headOn(-0.5)));
    expect(r.v2b).toBe(-0.5);
    expect(r.v1a).toBe(-0.5);
    expect(r.antiConjoin).toBe(true);
    expect(r.dam1).toBe(f(f(f(1000 * -0.5) * -0.5) / 50_000_000));
    expect(r.applied1).toBe(false);
    expect(r.applied2).toBe(false);
    expect(r.dam2Receiver).toBeNull();
    expectVec(r.dv1, 0, 0, 1);
    expectVec(r.dvOtherBody, 0, 0, -1);
    expect(r.nudged).toBe(true);
    // Self in total: the 1 m step plus the nudge.
    expectVec(r.dp1, 0, 0, 1 + f(T * 0.5));
    expectVec(r.dpOther, 0, 0, f(T * 0.5));
  });

  it("a destroyable self that dies takes the other's push back and stops the nudge", () => {
    // dam1 0.2 > energy 0.1: selfDestroyed, read before damage (11111).
    // dam1 > 0.05, so vel2a is reversed onto other (11117-11119): net zero.
    const r = collided(collideWithShip(headOn(100, { energy: 0.1 })));
    expect(r.selfDestroyed).toBe(true);
    expect(r.otherDestroyed).toBe(false);
    expectVec(r.dv1, 0, 0, 100);
    expectVec(r.dvOtherBody, 0, 0, 0);
    expect(r.dvOtherSubentity).toBeNull();
    expect(r.nudged).toBe(false);
    expectVec(r.dp1, 0, 0, 0);
    expectVec(r.dpOther, 0, 0, 0);
  });

  it("a self that is not destroyable never reports selfDestroyed", () => {
    const r = collided(
      collideWithShip(headOn(100, { energy: 0.1, destroyable: false })),
    );
    expect(r.selfDestroyed).toBe(false);
    expectVec(r.dvOtherBody, 0, 0, -100);
    expect(r.nudged).toBe(true);
  });

  it("selfDestroyed with dam1 at or below 0.05 skips the reversal but still stops the nudge", () => {
    // 20 m/s: dam1 = 1000 x 400 / 5e7 = 0.008 > energy 0, not > 0.05.
    const r = collided(collideWithShip(headOn(20, { energy: 0 })));
    expect(r.dam1).toBe(f(f(f(1000 * 20) * 20) / 50_000_000));
    expect(r.selfDestroyed).toBe(true);
    expect(r.applied1).toBe(false);
    expectVec(r.dvOtherBody, 0, 0, -20);
    expect(r.nudged).toBe(false);
  });

  it("an other that dies reverses self's rebound and stops the nudge", () => {
    // dam2 0.2 > 0.1 (11112); dam2 > 0.05 so vel1a is reversed onto self (11130-11134).
    const r = collided(collideWithShip(headOn(100, {}, { energy: 0.1 })));
    expect(r.otherDestroyed).toBe(true);
    expect(r.selfDestroyed).toBe(false);
    expect(r.dam2Receiver).toBe("other");
    expectVec(r.dv1, 0, 0, 0);
    expectVec(r.dvOtherBody, 0, 0, -100);
    expect(r.nudged).toBe(false);
  });

  it("a subentity contact moves the parent, damages the subentity and reports its own nudge", () => {
    // The subentity's own velocity is unused: v = vel1b - parent velocity
    // (11057-11070). With (7,8,9) used, v2b would be 109.
    const r = collided(
      collideWithShip(
        headOn(
          100,
          {},
          { velocity: vec(7, 8, 9), parentVelocity: vec(0, 0, 0) },
        ),
      ),
    );
    expect(r.v2b).toBe(100);
    expect(r.dam2Receiver).toBe("other");
    expectVec(r.dvOtherBody, 0, 0, -100);
    expectVec(r.dvOtherSubentity, 0, 0, 0);
    expect(r.nudged).toBe(true);
    expectVec(r.dpOther, 0, 0, 0);
    expectVec(r.dpOtherSubentity, 0, 0, -f(T * 100));
  });

  it("the parent's velocity enters v for a subentity contact", () => {
    // Parent drifting at (0,0,-20): v = (0,0,-80), v2b = 80.
    const r = collided(
      collideWithShip(headOn(100, {}, { parentVelocity: vec(0, 0, -20) })),
    );
    expect(r.v2b).toBe(80);
  });

  it("a rammer dying on a subentity: the parent keeps +vel2a, the subentity takes -vel2a", () => {
    // 11103-11106 push the parent; 11117-11119 reverse onto `other`, the subentity.
    const r = collided(
      collideWithShip(
        headOn(100, { energy: 0.1 }, { parentVelocity: vec(0, 0, 0) }),
      ),
    );
    expect(r.selfDestroyed).toBe(true);
    expectVec(r.dvOtherBody, 0, 0, -100);
    expectVec(r.dvOtherSubentity, 0, 0, 100);
    expect(r.nudged).toBe(false);
    expectVec(r.dpOtherSubentity, 0, 0, 0);
  });

  it("a non-frangible parent takes the subentity's damage", () => {
    // 11124-11125: [otherParent takeScrapeDamage:] when the parent is not frangible.
    const r = collided(
      collideWithShip(
        headOn(
          100,
          {},
          { parentVelocity: vec(0, 0, 0), parentFrangible: false },
        ),
      ),
    );
    expect(r.dam2Receiver).toBe("otherParent");
  });

  it("coincident centres take Oolite's +z, Wegolite's (0, 0, -1)", () => {
    const r = collided(
      collideWithShip({
        self: party({ position: vec(5, 5, 5), velocity: vec(0, 0, -10) }),
        other: party({ position: vec(5, 5, 5) }),
      }),
    );
    expectVec(r.loc, 0, 0, -1);
    expect(r.v2b).toBe(10);
    for (const v of [r.dv1, r.dvOtherBody, r.dp1, r.dpOther]) {
      expect(Number.isFinite(v.x + v.y + v.z)).toBe(true);
    }
  });

  it("a non-finite or non-positive mass is `separating` with nothing applied", () => {
    for (const mass of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(collideWithShip(headOn(100, { mass })).kind).toBe("separating");
      expect(collideWithShip(headOn(100, {}, { mass })).kind).toBe(
        "separating",
      );
    }
  });

  it("the Cobra against a Krait at 100 m/s matches the worked table", () => {
    // RESEARCH Pattern 4 worked values: dam1 18.658, dam2 42.948, v1a 65.91.
    const r = collided(
      collideWithShip(
        headOn(
          100,
          { mass: 214_737.6875, energy: 256, destroyable: false },
          { mass: 93_291.40625, energy: 250 },
        ),
      ),
    );
    expect(r.dam1).toBeCloseTo(18.658, 3);
    expect(r.dam2).toBeCloseTo(42.948, 3);
    expect(r.v1a).toBeCloseTo(65.91, 2);
    // The float expression, step by step (11089-11090).
    expect(r.dam1).toBe(f(f(f(93_291.40625 * 100) * 100) / 50_000_000));
  });

  it("the anti-conjoin test compares the float magnitude2 with the double 0.1", () => {
    // A sideways v (v2b = 0): magnitude2 is f(x x x). f(0.1) = 0.10000000149
    // is above the double 0.1, so no anti-conjoin; the float just below is.
    const above = 0.3162277638912201;
    const below = 0.3162277340888977;
    expect(f(above * above)).toBe(f(0.1));
    expect(f(below * below)).toBeLessThan(0.1);
    const sideways = (x: number): Collided =>
      collided(
        collideWithShip({
          self: party({ velocity: vec(x, 0, 0) }),
          other: party({ position: vec(0, 0, -50) }),
        }),
      );
    const r1 = sideways(above);
    expect(r1.antiConjoin).toBe(false);
    expectVec(r1.dv1, 0, 0, 0);
    const r2 = sideways(below);
    expect(r2.antiConjoin).toBe(true);
    expectVec(r2.dv1, 0, 0, 1);
    expectVec(r2.dvOtherBody, 0, 0, -1);
  });

  it("zero relative speed pushes the other away at 1 m/s (the buoy-as-self case)", () => {
    // 18-20: a self whose pair is at rest gets v2b = 0, magnitude2(v) = 0, so
    // vel2a = loc: the other is pushed away from self at 1 m/s (11096-11099).
    const r = collided(collideWithShip(headOn(0)));
    expect(r.antiConjoin).toBe(true);
    expect(r.v1a).toBe(0);
    expectVec(r.dvOtherBody, 0, 0, -1);
    expectVec(r.dv1, 0, 0, 1);
    expectVec(r.dp1, 0, 0, 0);
    expectVec(r.dpOther, 0, 0, 0);
  });
});

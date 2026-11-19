// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The collision response kernels: agreement with the independent 18-03
 * transliteration and totality (CBT-18, D-01, T-18-21, T-18-22).
 *
 * Agreement: on random float32 velocities, masses and energies and random
 * double positions (coincident centres included), `collideWithShip` returns
 * what `collideWithShipReference` returns for the same contact in Oolite
 * axes, within the oracle's 1e-6 relative tolerance; booleans, outcomes and
 * receivers exactly. The comparison lives here, outside the oracle tree,
 * which imports no Wegolite code.
 *
 * Totality: any doubles, NaN, the infinities and +/-1e308 included, in any
 * position, velocity, mass or energy never throw. A collided response holds
 * only finite numbers whatever the input, its damages are never negative (so
 * `routeScrapeDamage`'s non-positive rule is unreachable from it), and a
 * non-finite or non-positive mass is `separating`. `routeScrapeDamage` never
 * throws, never touches the cabin temperature, and from a finite state
 * (shields not negative) and a finite amount leaves only finite numbers.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { collideWithShip } from "../../../src/sim/combat/response.js";
import type {
  CollisionInput,
  CollisionResponse,
} from "../../../src/sim/combat/response.js";
import { routeScrapeDamage } from "../../../src/sim/combat/shields.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import { vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { DT } from "../../../src/sim/step.js";
import { collideWithShipReference } from "../../oracles/combat/response/reference.js";
import type { CollideInput } from "../../oracles/combat/response/reference.js";
import { withinTolerance } from "../../oracles/combat/response/schema.js";

type Triple = readonly [number, number, number];

const TOLERANCE = 1e-6;

function toWegolite(v: Triple): Vec3 {
  return vec(v[0], v[1], -v[2]);
}

function finiteVec(v: Vec3 | null): boolean {
  return (
    v === null ||
    (Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z))
  );
}

function allFinite(r: Extract<CollisionResponse, { kind: "collided" }>) {
  return (
    [r.v2b, r.v1a, r.dam1, r.dam2].every(Number.isFinite) &&
    [
      r.loc,
      r.dv1,
      r.dvOtherBody,
      r.dvOtherSubentity,
      r.dp1,
      r.dpOther,
      r.dpOtherSubentity,
    ].every(finiteVec)
  );
}

// ---------------------------------------------------------------------------
// agreement

const f32 = (min: number, max: number) =>
  fc.float({ min: Math.fround(min), max: Math.fround(max), noNaN: true });
const f32Triple = (span: number) =>
  fc.tuple(f32(-span, span), f32(-span, span), f32(-span, span));
const position = fc.tuple(
  fc.double({ min: -300, max: 300, noNaN: true }),
  fc.double({ min: -300, max: 300, noNaN: true }),
  fc.double({ min: -300, max: 300, noNaN: true }),
);

const partyArb = fc.record({
  position,
  velocity: f32Triple(400),
  mass: f32(1, 1e7),
  energy: f32(0, 1000),
  destroyable: fc.boolean(),
});

const contactArb = fc.record({
  self: partyArb,
  other: partyArb,
  coincident: fc.boolean(),
  sub: fc.option(
    fc.record({ parentVelocity: f32Triple(400), frangible: fc.boolean() }),
    { nil: null },
  ),
});

function portVec(label: string, actual: Vec3 | null, expected: Triple | null) {
  if (expected === null) {
    expect(actual, label).toBeNull();
    return;
  }
  expect(actual, label).not.toBeNull();
  if (actual === null) return;
  const want = toWegolite(expected);
  for (const axis of ["x", "y", "z"] as const) {
    expect(
      withinTolerance(actual[axis], want[axis], TOLERANCE),
      `${label}.${axis}: ${String(actual[axis])} vs ${String(want[axis])}`,
    ).toBe(true);
  }
}

function portNumber(label: string, actual: number, expected: number): void {
  expect(
    withinTolerance(actual, expected, TOLERANCE),
    `${label}: ${String(actual)} vs ${String(expected)}`,
  ).toBe(true);
}

describe("collideWithShip agrees with the 18-03 transliteration", () => {
  it("on random contacts, coincident centres and subentities included", () => {
    fc.assert(
      fc.property(contactArb, (c) => {
        const otherPosition = c.coincident ? c.self.position : c.other.position;
        const reference = collideWithShipReference({
          dt: DT,
          self: c.self,
          other: { ...c.other, position: otherPosition, isSubentityOf: c.sub },
        } satisfies CollideInput);
        const input: CollisionInput = {
          self: {
            position: toWegolite(c.self.position),
            velocity: toWegolite(c.self.velocity),
            mass: c.self.mass,
            energy: c.self.energy,
            destroyable: c.self.destroyable,
          },
          other: {
            position: toWegolite(otherPosition),
            velocity: toWegolite(c.other.velocity),
            mass: c.other.mass,
            energy: c.other.energy,
            destroyable: c.other.destroyable,
            ...(c.sub === null
              ? {}
              : {
                  parentVelocity: toWegolite(c.sub.parentVelocity),
                  parentFrangible: c.sub.frangible,
                }),
          },
        };
        const port = collideWithShip(input);
        expect(port.kind).toBe(reference.outcome);
        if (port.kind !== "collided") return;
        portVec("loc", port.loc, reference.loc);
        portNumber("v2b", port.v2b, reference.v2b);
        portNumber("v1a", port.v1a, reference.v1a);
        portNumber("dam1", port.dam1, reference.dam1);
        portNumber("dam2", port.dam2, reference.dam2);
        expect(port.antiConjoin).toBe(reference.antiConjoin);
        expect(port.applied1).toBe(reference.applied1);
        expect(port.applied2).toBe(reference.applied2);
        expect(port.dam2Receiver).toBe(reference.dam2Receiver);
        expect(port.selfDestroyed).toBe(reference.selfDestroyed);
        expect(port.otherDestroyed).toBe(reference.otherDestroyed);
        expect(port.nudged).toBe(reference.nudged);
        portVec("dv1", port.dv1, reference.dv1);
        portVec("dvOtherBody", port.dvOtherBody, reference.dvOtherBody);
        portVec(
          "dvOtherSubentity",
          port.dvOtherSubentity,
          reference.dvOtherSubentity,
        );
        portVec("dp1", port.dp1, reference.dp1);
        portVec("dpOther", port.dpOther, reference.dpOther);
        portVec(
          "dpOtherSubentity",
          port.dpOtherSubentity,
          reference.dpOtherSubentity,
        );
      }),
      { numRuns: 500, seed: 18161 },
    );
  });
});

// ---------------------------------------------------------------------------
// totality

const anyDouble = fc.oneof(
  fc.double(),
  fc.constantFrom(
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    1e308,
    -1e308,
    0,
    -0,
  ),
);
const finiteDouble = fc.oneof(
  fc.double({ noNaN: true, noDefaultInfinity: true }),
  fc.constantFrom(1e308, -1e308, 0, 1e-308),
);
const vecOf = (n: fc.Arbitrary<number>) =>
  fc.tuple(n, n, n).map(([x, y, z]) => vec(x, y, z));

function totalityInput(n: fc.Arbitrary<number>) {
  const partyOf = fc.record({
    position: vecOf(n),
    velocity: vecOf(n),
    mass: n,
    energy: n,
    destroyable: fc.boolean(),
  });
  return fc.record({
    self: partyOf,
    other: partyOf,
    parentVelocity: fc.option(vecOf(n), { nil: undefined }),
    parentFrangible: fc.option(fc.boolean(), { nil: undefined }),
  });
}

function toInput(
  c: ReturnType<typeof totalityInput> extends fc.Arbitrary<infer T> ? T : never,
): CollisionInput {
  return {
    self: c.self,
    other: {
      ...c.other,
      ...(c.parentVelocity === undefined
        ? {}
        : { parentVelocity: c.parentVelocity }),
      ...(c.parentFrangible === undefined
        ? {}
        : { parentFrangible: c.parentFrangible }),
    },
  };
}

describe("collideWithShip totality", () => {
  it("never throws and a collided response is finite with non-negative damage, for any doubles", () => {
    fc.assert(
      fc.property(totalityInput(anyDouble), (c) => {
        const r = collideWithShip(toInput(c));
        if (r.kind === "collided") {
          expect(allFinite(r)).toBe(true);
          expect(r.dam1).toBeGreaterThanOrEqual(0);
          expect(r.dam2).toBeGreaterThanOrEqual(0);
          expect(r.dvOtherSubentity === null).toBe(
            c.parentVelocity === undefined,
          );
          expect(r.dpOtherSubentity === null).toBe(
            c.parentVelocity === undefined,
          );
        }
      }),
      { numRuns: 1000, seed: 18162 },
    );
  });

  it("from finite inputs up to 1e308: no throw and no non-finite number", () => {
    fc.assert(
      fc.property(totalityInput(finiteDouble), (c) => {
        const r = collideWithShip(toInput(c));
        if (r.kind === "collided") expect(allFinite(r)).toBe(true);
      }),
      { numRuns: 1000, seed: 18163 },
    );
  });

  it("a non-finite or non-positive mass on either side is separating", () => {
    const badMass = fc.oneof(
      fc.constantFrom(
        0,
        -0,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        1e-50,
        1e39,
      ),
      fc.double({ max: -Number.MIN_VALUE, noNaN: true }),
    );
    fc.assert(
      fc.property(
        totalityInput(finiteDouble),
        badMass,
        fc.boolean(),
        (c, mass, onSelf) => {
          const input = toInput(c);
          const r = collideWithShip(
            onSelf
              ? { ...input, self: { ...input.self, mass } }
              : { ...input, other: { ...input.other, mass } },
          );
          expect(r.kind).toBe("separating");
        },
      ),
      { numRuns: 500, seed: 18164 },
    );
  });

  it("coincident centres give loc (0, 0, -1) whenever they collide", () => {
    fc.assert(
      fc.property(
        vecOf(fc.double({ min: -1e6, max: 1e6, noNaN: true })),
        vecOf(f32(-400, 400)),
        (p, v) => {
          const r = collideWithShip({
            self: {
              position: p,
              velocity: v,
              mass: 1000,
              energy: 200,
              destroyable: true,
            },
            other: {
              position: p,
              velocity: vec(0, 0, 0),
              mass: 1000,
              energy: 200,
              destroyable: true,
            },
          });
          if (r.kind === "collided") {
            expect(r.loc.x).toBe(0);
            expect(r.loc.y).toBe(0);
            expect(r.loc.z).toBe(-1);
          }
        },
      ),
      { numRuns: 300, seed: 18165 },
    );
  });
});

describe("routeScrapeDamage totality", () => {
  it("never throws and never touches the cabin, for any doubles", () => {
    fc.assert(
      fc.property(
        anyDouble,
        anyDouble,
        anyDouble,
        anyDouble,
        anyDouble,
        vecOf(anyDouble),
        vecOf(anyDouble),
        (fwd, aft, energy, cabin, amount, offset, forward) => {
          const state = {
            ...createPlayerCombatState(),
            fwdShield: fwd,
            aftShield: aft,
            energy,
            cabinTemp: cabin,
          };
          routeScrapeDamage(state, amount, offset, forward);
          expect(Object.is(state.cabinTemp, cabin)).toBe(true);
        },
      ),
      { numRuns: 1000, seed: 18166 },
    );
  });

  it("from a finite state and amount leaves only finite numbers", () => {
    const shield = fc.double({ min: 0, max: 1e308, noNaN: true });
    fc.assert(
      fc.property(
        shield,
        shield,
        finiteDouble,
        finiteDouble,
        vecOf(finiteDouble),
        vecOf(finiteDouble),
        (fwd, aft, energy, amount, offset, forward) => {
          const state = {
            ...createPlayerCombatState(),
            fwdShield: fwd,
            aftShield: aft,
            energy,
          };
          const result = routeScrapeDamage(state, amount, offset, forward);
          expect(Number.isFinite(state.fwdShield)).toBe(true);
          expect(Number.isFinite(state.aftShield)).toBe(true);
          expect(Number.isFinite(state.energy)).toBe(true);
          expect(Number.isFinite(result.applied)).toBe(true);
          expect(result.applied).toBeGreaterThanOrEqual(0);
        },
      ),
      { numRuns: 1000, seed: 18167 },
    );
  });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The collision response kernels against the independent 18-03 response
 * oracle (CBT-18, D-01): every fixture of `collide.json` runs through
 * `collideWithShip`.
 *
 * The mapping from a fixture's Oolite axes to Wegolite's is `S = diag(1, 1,
 * -1)`: positions, velocities and every expected vector go through `S`;
 * scalars, flags and receivers are unchanged. Each party's `destroyable`
 * comes from the fixture (review L412@b45e113), and a subentity contact
 * passes the fixture's parent velocity and frangibility. Every fixture's
 * `dt` must be the kernel's fixed `DT`.
 *
 * Numbers compare with the fixture's own relative tolerance through the
 * oracle's `withinTolerance`; booleans, outcomes and receivers are exact. A
 * failing fixture is a dispute with the C, recorded in the SUMMARY, never a
 * widened tolerance.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collideWithShip } from "../../../src/sim/combat/response.js";
import type { CollisionInput } from "../../../src/sim/combat/response.js";
import { vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { DT } from "../../../src/sim/step.js";
import {
  COLLIDE_FIXTURE_FILE,
  CollideFileSchema,
  withinTolerance,
} from "../../oracles/combat/response/schema.js";
import type { CollideFixture } from "../../oracles/combat/response/schema.js";

const THIS_FILE = "tests/sim/combat/response.oracle.test.ts";

function readJson(file: string): unknown {
  return JSON.parse(
    readFileSync(
      new URL(`../../oracles/combat/response/${file}`, import.meta.url),
      "utf8",
    ),
  ) as unknown;
}

type Triple = readonly [number, number, number];

/** Oolite axes to Wegolite: z negated. */
function toWegolite(v: Triple): Vec3 {
  return vec(v[0], v[1], -v[2]);
}

function collideInput(fixture: CollideFixture): CollisionInput {
  const sub = fixture.other.isSubentityOf;
  return {
    self: {
      position: toWegolite(fixture.self.position),
      velocity: toWegolite(fixture.self.velocity),
      mass: fixture.self.mass,
      energy: fixture.self.energy,
      destroyable: fixture.self.destroyable,
    },
    other: {
      position: toWegolite(fixture.other.position),
      velocity: toWegolite(fixture.other.velocity),
      mass: fixture.other.mass,
      energy: fixture.other.energy,
      destroyable: fixture.other.destroyable,
      ...(sub === null
        ? {}
        : {
            parentVelocity: toWegolite(sub.parentVelocity),
            parentFrangible: sub.frangible,
          }),
    },
  };
}

function expectNumber(
  label: string,
  actual: number,
  expected: number,
  tolerance: number,
): void {
  expect(
    withinTolerance(actual, expected, tolerance),
    `${label}: ${String(actual)} vs ${String(expected)}`,
  ).toBe(true);
}

function expectVec(
  label: string,
  actual: Vec3 | null,
  expected: Triple | null,
  tolerance: number,
): void {
  if (expected === null) {
    expect(actual, label).toBeNull();
    return;
  }
  expect(actual, label).not.toBeNull();
  if (actual === null) return;
  const want = toWegolite(expected);
  expectNumber(`${label}.x`, actual.x, want.x, tolerance);
  expectNumber(`${label}.y`, actual.y, want.y, tolerance);
  expectNumber(`${label}.z`, actual.z, want.z, tolerance);
}

const collideFixtures = CollideFileSchema.parse(readJson(COLLIDE_FIXTURE_FILE));

describe(THIS_FILE, () => {
  it("reads every collide fixture", () => {
    expect(collideFixtures.length).toBe(28);
  });

  describe("collideWithShip against collide.json", () => {
    it.each(collideFixtures.map((fx) => [fx.id, fx] as const))(
      "%s",
      (_id, fixture) => {
        expect(fixture.dt).toBe(DT);
        const response = collideWithShip(collideInput(fixture));
        const e = fixture.expected;
        expect(response.kind).toBe(e.outcome);
        if (response.kind !== "collided") return;
        const tol = fixture.tolerance;
        expectVec("loc", response.loc, e.loc, tol);
        expectNumber("v2b", response.v2b, e.v2b, tol);
        expectNumber("v1a", response.v1a, e.v1a, tol);
        expectNumber("dam1", response.dam1, e.dam1, tol);
        expectNumber("dam2", response.dam2, e.dam2, tol);
        expect(response.antiConjoin, "antiConjoin").toBe(e.antiConjoin);
        expect(response.applied1, "applied1").toBe(e.applied1);
        expect(response.applied2, "applied2").toBe(e.applied2);
        expect(response.dam2Receiver, "dam2Receiver").toBe(e.dam2Receiver);
        expect(response.selfDestroyed, "selfDestroyed").toBe(e.selfDestroyed);
        expect(response.otherDestroyed, "otherDestroyed").toBe(
          e.otherDestroyed,
        );
        expectVec("dv1", response.dv1, e.dv1, tol);
        expectVec("dvOtherBody", response.dvOtherBody, e.dvOtherBody, tol);
        expectVec(
          "dvOtherSubentity",
          response.dvOtherSubentity,
          e.dvOtherSubentity,
          tol,
        );
        expect(response.nudged, "nudged").toBe(e.nudged);
        expectVec("dp1", response.dp1, e.dp1, tol);
        expectVec("dpOther", response.dpOther, e.dpOther, tol);
        expectVec(
          "dpOtherSubentity",
          response.dpOtherSubentity,
          e.dpOtherSubentity,
          tol,
        );
      },
    );
  });
});

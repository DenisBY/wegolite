// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The collision response kernels against the independent 18-03 response
 * oracle (CBT-18, D-01): every fixture of `collide.json` runs through
 * `collideWithShip`, and every fixture of `scrape.json` through
 * `routeScrapeDamage`.
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
 *
 * One scrape fixture is a documented divergence, held to the port's rule
 * rather than the C's: `scrape-negative-amount-made-positive`. Oolite's player
 * turns a negative scrape amount positive (`PlayerEntity.m:5710-5713`); plan
 * 18-16 (review L413@b45e113) keeps `routeScrapeDamage`'s "a non-positive
 * amount is no damage", because the collision response never produces a
 * negative damage (`response.property.test.ts` holds `dam1, dam2 >= 0`). The
 * fixture still runs: it must leave the state unchanged, and it fails here if
 * the port starts flipping the sign without this list changing.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collideWithShip } from "../../../src/sim/combat/response.js";
import { routeScrapeDamage } from "../../../src/sim/combat/shields.js";
import { createPlayerCombatState } from "../../../src/sim/combat/state.js";
import type { CollisionInput } from "../../../src/sim/combat/response.js";
import { vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { DT } from "../../../src/sim/step.js";
import {
  COLLIDE_FIXTURE_FILE,
  CollideFileSchema,
  SCRAPE_FIXTURE_FILE,
  ScrapeFileSchema,
  withinTolerance,
} from "../../oracles/combat/response/schema.js";
import type {
  CollideFixture,
  ScrapeFixture,
} from "../../oracles/combat/response/schema.js";

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
const scrapeFixtures = ScrapeFileSchema.parse(readJson(SCRAPE_FIXTURE_FILE));

/** Scrape fixtures held to a documented port divergence (see the header). */
const SCRAPE_DIVERGENCES: ReadonlySet<string> = new Set([
  "scrape-negative-amount-made-positive",
]);

function runScrape(fixture: ScrapeFixture): void {
  const state = {
    ...createPlayerCombatState(),
    fwdShield: fixture.shields.forward,
    aftShield: fixture.shields.aft,
    energy: fixture.energy,
  };
  const before = { ...state };
  const result = routeScrapeDamage(
    state,
    fixture.amount,
    toWegolite(fixture.otherOffset),
    toWegolite(fixture.forward),
  );
  if (SCRAPE_DIVERGENCES.has(fixture.id)) {
    expect(fixture.amount).toBeLessThan(0);
    expect(state).toEqual(before);
    expect(result).toEqual({ shieldAbsorbed: false, applied: 0 });
    return;
  }
  const e = fixture.expected;
  const tol = fixture.tolerance;
  // The shield on the other side is untouched (d_forward >= 0, 5726).
  if (e.shieldHit === "forward") {
    expect(state.aftShield, "aft untouched").toBe(before.aftShield);
  } else {
    expect(state.fwdShield, "forward untouched").toBe(before.fwdShield);
  }
  expectNumber("forward shield", state.fwdShield, e.shields.forward, tol);
  expectNumber("aft shield", state.aftShield, e.shields.aft, tol);
  expectNumber("remainder", result.applied, e.remainder, tol);
  expectNumber("energy", state.energy, e.energy, tol);
  expect(result.shieldAbsorbed).toBe(e.remainder === 0);
  expect(state.cabinTemp - before.cabinTemp).toBe(e.heatChange);
}

describe(THIS_FILE, () => {
  it("reads every collide and scrape fixture", () => {
    expect(collideFixtures.length).toBe(28);
    expect(scrapeFixtures.length).toBe(8);
    for (const id of SCRAPE_DIVERGENCES) {
      expect(scrapeFixtures.some((fx) => fx.id === id)).toBe(true);
    }
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

  describe("routeScrapeDamage against scrape.json", () => {
    it.each(scrapeFixtures.map((fx) => [fx.id, fx] as const))(
      "%s",
      (_id, fixture) => {
        runScrape(fixture);
      },
    );
  });
});

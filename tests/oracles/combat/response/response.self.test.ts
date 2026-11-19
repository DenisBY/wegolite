// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Self-test of the response oracle (Phase 18, plan 18-03).
 *
 * The oracle has to be right before the port exists, so this file checks it
 * against itself: every fixture parses with the strict schema, every expected
 * value is re-derived through `reference.ts` (the transliteration of Oolite's
 * `collideWithShip:` at the pin `7437f22`), and hand anchors written from the
 * C lines sit next to the generic re-derivation so a mistake in
 * `reference.ts` cannot hide behind the fixtures it produced.
 *
 * Nothing here reads Wegolite code or the Oolite checkout.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { collideWithShipReference, type CollideResult } from "./reference.js";
import {
  COLLIDE_FIXTURE_FILE,
  CollideFileSchema,
  type CollideFixture,
} from "./schema.js";

const HERE = fileURLToPath(new URL("./", import.meta.url));

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${HERE}${name}`, "utf8"));
}

type Vec3 = readonly [number, number, number];

function close(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

function vecClose(a: Vec3, b: Vec3, tolerance: number): boolean {
  return a.every((value, i) => close(value, b[i] ?? Number.NaN, tolerance));
}

// ---------------------------------------------------------------------------
// collideWithShip (Task 1)

/** Re-derives one collision fixture and lists every field that disagrees. */
function collideProblems(fixture: CollideFixture): string[] {
  const got = collideWithShipReference(fixture);
  const e = fixture.expected;
  const tol = fixture.tolerance;
  const problems: string[] = [];
  const exact = [
    "outcome",
    "antiConjoin",
    "applied1",
    "applied2",
    "dam2Receiver",
    "selfDestroyed",
    "otherDestroyed",
    "nudged",
  ] as const;
  for (const key of exact) {
    if (got[key] !== e[key]) problems.push(key);
  }
  for (const key of ["v2b", "v1a", "dam1", "dam2"] as const) {
    if (!close(got[key], e[key], tol)) problems.push(key);
  }
  for (const key of ["loc", "dv1", "dvOtherBody", "dp1", "dpOther"] as const) {
    if (!vecClose(got[key], e[key], tol)) problems.push(key);
  }
  for (const key of ["dvOtherSubentity", "dpOtherSubentity"] as const) {
    const a = got[key];
    const b = e[key];
    if (a === null || b === null) {
      if (a !== b) problems.push(key);
    } else if (!vecClose(a, b, tol)) {
      problems.push(key);
    }
  }
  return problems;
}

function collideFixtures(): CollideFixture[] {
  return CollideFileSchema.parse(readJson(COLLIDE_FIXTURE_FILE));
}

function collideById(id: string): CollideFixture {
  const fixture = collideFixtures().find((candidate) => candidate.id === id);
  if (fixture === undefined) throw new Error(`no fixture ${id}`);
  return fixture;
}

/** Checks a result against hand-written values, exactly. */
function expectAnchor(got: CollideResult, want: Partial<CollideResult>): void {
  for (const [key, value] of Object.entries(want)) {
    const actual = got[key as keyof CollideResult];
    if (Array.isArray(value)) {
      expect(actual, key).not.toBeNull();
      (value as number[]).forEach((component, i) => {
        // `+ 0` folds -0 into 0: the C's 0 x -v1a is a -0 that no port needs.
        expect((actual as number[])[i]! + 0, `${key}[${i}]`).toBe(
          component + 0,
        );
      });
    } else {
      expect(actual, key).toBe(value);
    }
  }
}

describe("collideWithShip oracle (ShipEntity.m:11020-11152)", () => {
  it("parses strictly and re-derives every collision fixture", () => {
    const fixtures = collideFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    const bad = fixtures
      .map((fixture) => [fixture.id, collideProblems(fixture)] as const)
      .filter(([, problems]) => problems.length > 0);
    expect(bad).toEqual([]);
  });

  it("states the fixed-step substitution in every nudged fixture's derivation", () => {
    for (const fixture of collideFixtures()) {
      if (fixture.expected.nudged) {
        expect(fixture.derivation, fixture.id).toMatch(/fixed-step/);
      }
    }
  });

  // Hand anchors. Every literal below is worked from the C lines by hand
  // (f = round to float32), not produced by reference.ts.
  //
  // Krait mass m = 93291.40625 (a float32), one tick dt = 1/120, so the
  // nudge time t = f(10 x 1/120) = 0.0833333358168602 (11138).

  it("anchor: equal Krait masses head-on at 100 m/s", () => {
    const m = 93291.40625;
    const r = 50.196590423583984;
    const input = {
      dt: 1 / 120,
      self: {
        position: [0, 0, 0] as [number, number, number],
        velocity: [0, 0, 100] as [number, number, number],
        mass: m,
        energy: 250,
        destroyable: true,
      },
      other: {
        position: [0, 0, 2 * r] as [number, number, number],
        velocity: [0, 0, 0] as [number, number, number],
        mass: m,
        energy: 250,
        destroyable: true,
        isSubentityOf: null,
      },
    };
    // loc = (0, 0, 1) (11032-11033); v = (0, 0, 100) (11057-11070);
    // v2b = 100 (11072). v1a = f(sqrt(f(f(f(100 x 100) x m) / m))):
    // f(1e4 m) = 932914048, / m = 9999.99984 -> f = 10000, sqrt = 100 (11074).
    // dam1 = dam2 = f(f(f(m x 100) x 100) / 5e7): f(m x 100) = 9329141,
    // x 100 = 932914100 -> f = 932914112, / 5e7 = 18.65828224 -> f =
    // 18.658281326293945 (11089-11090), above 0.05 and below energy 250.
    // vel1a = (0, 0, -100), vel2a = (0, 0, 100) (11093-11094); |v|^2 = 1e4 >
    // 0.1, no anti-conjoin (11096). Nudges (11138-11146): f(t x 100) =
    // 8.333333969116211 for both, self along +loc x v1a, other along +loc x v2b.
    const want: Partial<CollideResult> = {
      outcome: "collided",
      loc: [0, 0, 1],
      v2b: 100,
      v1a: 100,
      dam1: 18.658281326293945,
      dam2: 18.658281326293945,
      antiConjoin: false,
      applied1: true,
      applied2: true,
      dam2Receiver: "other",
      selfDestroyed: false,
      otherDestroyed: false,
      dv1: [0, 0, -100],
      dvOtherBody: [0, 0, 100],
      dvOtherSubentity: null,
      nudged: true,
      dp1: [0, 0, 8.333333969116211],
      dpOther: [0, 0, 8.333333969116211],
      dpOtherSubentity: null,
    };
    expectAnchor(collideWithShipReference(input), want);
    expectAnchor(
      collideById("collide-equal-mass-krait-head-on-100").expected,
      want,
    );
  });

  it("anchor: separating at 1.5 m/s returns before any damage or response", () => {
    // Player (m1 = 214737.6875) backing away from a Krait at 1.5 m/s:
    // v2b = -1.5 < -1 -> return NO (11080-11081). v1a was already set:
    // -f(sqrt(f(f(2.25 x m2) / m1))) = -0.9886850118637085 (11074-11076).
    const want: Partial<CollideResult> = {
      outcome: "separating",
      v2b: -1.5,
      v1a: -0.9886850118637085,
      dam1: 0,
      dam2: 0,
      applied1: false,
      applied2: false,
      nudged: false,
      dv1: [0, 0, 0],
      dvOtherBody: [0, 0, 0],
      dp1: [0, 0, 0],
      dpOther: [0, 0, 0],
    };
    expectAnchor(
      collideWithShipReference(collideById("collide-separating-fast-1-5")),
      want,
    );
    expectAnchor(collideById("collide-separating-fast-1-5").expected, want);
  });

  it("anchor: separating at 0.5 m/s takes the 1 m step and the 1 m/s solution", () => {
    // Same pair at 0.5 m/s: v2b = -0.5, v1a = -f(sqrt(f(f(0.25 x m2) / m1)))
    // = -0.32956165075302124. -1 <= v2b < 0: self moves by -hploc = (0,0,-1)
    // and v = 0 (11083-11084). dam1 = f(f(f(m2 x -0.5) x -0.5) / 5e7) =
    // 0.00046645704424008727, dam2 = 0.0010736883850768209 (11089-11090):
    // neither above 0.05. |v|^2 = 0 <= 0.1: vel1a = -loc, vel2a = loc
    // (11096-11099). Nudge: self f(t x v1a) = -0.02746347151696682 on top of
    // the 1 m step, total -1.0274634715169668; other f(t x v2b) =
    // -0.0416666679084301, toward self (11141-11146).
    const want: Partial<CollideResult> = {
      outcome: "collided",
      v2b: -0.5,
      v1a: -0.32956165075302124,
      dam1: 0.00046645704424008727,
      dam2: 0.0010736883850768209,
      antiConjoin: true,
      applied1: false,
      applied2: false,
      dam2Receiver: null,
      selfDestroyed: false,
      otherDestroyed: false,
      dv1: [0, 0, -1],
      dvOtherBody: [0, 0, 1],
      nudged: true,
      dp1: [0, 0, -1.0274634715169668],
      dpOther: [0, 0, -0.0416666679084301],
    };
    expectAnchor(
      collideWithShipReference(collideById("collide-separating-slow-0-5")),
      want,
    );
    expectAnchor(collideById("collide-separating-slow-0-5").expected, want);
  });

  it("anchor: a selfDestroyed contact on the buoy subentity reverses the push on the subentity, not the parent", () => {
    const fixture = collideById("collide-subentity-self-destroyed");
    const got = collideWithShipReference(fixture);
    expect(got.selfDestroyed).toBe(true);
    expect(got.applied1).toBe(true);
    // vel2a lands on the parent (11103-11105); its reversal on `other`, the
    // subentity (11117-11119): the parent keeps +vel2a.
    expect(got.dvOtherSubentity).not.toBeNull();
    got.dvOtherBody.forEach((component, i) => {
      expect(component + (got.dvOtherSubentity?.[i] ?? Number.NaN)).toBe(0);
    });
    expect(got.dvOtherBody[2]).toBeGreaterThan(0);
    expect(got.nudged).toBe(false);
  });
});

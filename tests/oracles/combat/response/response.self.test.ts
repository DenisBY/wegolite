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

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  blastReference,
  collideWithShipReference,
  npcBrakeReference,
  playerBrakeReference,
  playerScrapeReference,
  type CollideResult,
} from "./reference.js";
import {
  BLAST_FIXTURE_FILE,
  BRAKING_NPC_FIXTURE_FILE,
  BRAKING_PLAYER_FIXTURE_FILE,
  BlastFileSchema,
  BrakingFileSchema,
  COLLIDE_FIXTURE_FILE,
  CollideFileSchema,
  SCRAPE_FIXTURE_FILE,
  ScrapeFileSchema,
  type BlastFixture,
  type BrakingFixture,
  type CollideFixture,
  type ScrapeFixture,
  withinTolerance,
} from "./schema.js";

const HERE = fileURLToPath(new URL("./", import.meta.url));

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${HERE}${name}`, "utf8"));
}

type Vec3 = readonly [number, number, number];

function close(a: number, b: number, tolerance: number): boolean {
  return withinTolerance(a, b, tolerance);
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
  it("compares relatively: a wrong factor fails, a few float ulps pass", () => {
    expect(close(230.6931610107422 * (1 + 1e-7), 230.6931610107422, 1e-6)).toBe(
      true,
    );
    expect(close(230.6931610107422 * 1.001, 230.6931610107422, 1e-6)).toBe(
      false,
    );
    expect(close(1e-10, 0, 1e-6)).toBe(true);
    expect(close(1e-7, 0, 1e-6)).toBe(false);
  });

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

// ---------------------------------------------------------------------------
// braking, the player's scrape and the blast (Task 2)

function brakeProblems(fixture: BrakingFixture): string[] {
  const got =
    fixture.kind === "player"
      ? playerBrakeReference(fixture)
      : npcBrakeReference(fixture);
  const e = fixture.expected;
  const tol = fixture.tolerance;
  const problems: string[] = [];
  if (!close(got.perTickLoss, e.perTickLoss, tol)) problems.push("perTickLoss");
  if (!close(got.firstTickLoss, e.firstTickLoss, tol)) {
    problems.push("firstTickLoss");
  }
  if (got.stopTick !== e.stopTick) problems.push("stopTick");
  if (!vecClose(got.positionChange, e.positionChange, tol)) {
    problems.push("positionChange");
  }
  if (!vecClose(got.finalVelocity, e.finalVelocity, tol)) {
    problems.push("finalVelocity");
  }
  if (got.samples.length !== e.samples.length) problems.push("samples");
  e.samples.forEach((sample, i) => {
    const mine = got.samples[i];
    if (
      mine === undefined ||
      mine.tick !== sample.tick ||
      !close(mine.speed, sample.speed, tol)
    ) {
      problems.push(`samples[${i}]`);
    }
  });
  return problems;
}

function scrapeProblems(fixture: ScrapeFixture): string[] {
  const got = playerScrapeReference(fixture);
  const e = fixture.expected;
  const tol = fixture.tolerance;
  const problems: string[] = [];
  if (got.shieldHit !== e.shieldHit) problems.push("shieldHit");
  if (got.heatChange !== e.heatChange) problems.push("heatChange");
  if (!close(got.dForward, e.dForward, tol)) problems.push("dForward");
  if (!close(got.shields.forward, e.shields.forward, tol)) {
    problems.push("shields.forward");
  }
  if (!close(got.shields.aft, e.shields.aft, tol)) problems.push("shields.aft");
  if (!close(got.remainder, e.remainder, tol)) problems.push("remainder");
  if (!close(got.energy, e.energy, tol)) problems.push("energy");
  return problems;
}

function blastProblems(fixture: BlastFixture): string[] {
  const got = blastReference(fixture);
  const e = fixture.expected;
  const tol = fixture.tolerance;
  const problems: string[] = [];
  e.victims.forEach((victim, i) => {
    const mine = got.victims[i];
    if (
      mine === undefined ||
      !close(mine.desiredRange, victim.desiredRange, tol) ||
      !close(mine.amount, victim.amount, tol)
    ) {
      problems.push(`victims[${i}]`);
    }
  });
  e.receivers.forEach((receiver, i) => {
    const mine = got.receivers[i];
    if (mine === undefined) {
      problems.push(`receivers[${i}]`);
      return;
    }
    if (receiver.dv === null || mine.dv === null) {
      if (receiver.dv !== mine.dv) problems.push(`receivers[${i}].dv`);
    } else if (!vecClose(mine.dv, receiver.dv, tol)) {
      problems.push(`receivers[${i}].dv`);
    }
    receiver.contributions.forEach((c, j) => {
      const m = mine.contributions[j];
      const where = `receivers[${i}].contributions[${j}]`;
      if (
        m === undefined ||
        m.inRange !== c.inRange ||
        m.floored !== c.floored
      ) {
        problems.push(where);
        return;
      }
      if (c.d2 === null || m.d2 === null) {
        if (c.d2 !== m.d2) problems.push(`${where}.d2`);
      } else if (!close(m.d2, c.d2, tol)) {
        problems.push(`${where}.d2`);
      }
      if (c.moment === null || m.moment === null) {
        if (c.moment !== m.moment) problems.push(`${where}.moment`);
      } else if (!close(m.moment, c.moment, tol)) {
        problems.push(`${where}.moment`);
      }
      if (c.dv === null || m.dv === null) {
        if (c.dv !== m.dv) problems.push(`${where}.dv`);
      } else if (!vecClose(m.dv, c.dv, tol)) {
        problems.push(`${where}.dv`);
      }
    });
  });
  return problems;
}

function brakingFixtures(): BrakingFixture[] {
  return [
    ...BrakingFileSchema.parse(readJson(BRAKING_PLAYER_FIXTURE_FILE)),
    ...BrakingFileSchema.parse(readJson(BRAKING_NPC_FIXTURE_FILE)),
  ];
}

function byId<T extends { readonly id: string }>(
  list: readonly T[],
  id: string,
): T {
  const found = list.find((candidate) => candidate.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

describe("braking oracle (PlayerEntity.m:3372-3405, ShipEntity.m:5808-5823)", () => {
  it("parses strictly and re-derives every braking fixture", () => {
    const player = BrakingFileSchema.parse(
      readJson(BRAKING_PLAYER_FIXTURE_FILE),
    );
    const npc = BrakingFileSchema.parse(readJson(BRAKING_NPC_FIXTURE_FILE));
    expect(player.length).toBeGreaterThanOrEqual(4);
    expect(npc.length).toBeGreaterThanOrEqual(3);
    expect(player.every((fixture) => fixture.kind === "player")).toBe(true);
    expect(npc.every((fixture) => fixture.kind === "ship")).toBe(true);
    const bad = brakingFixtures()
      .map((fixture) => [fixture.id, brakeProblems(fixture)] as const)
      .filter(([, problems]) => problems.length > 0);
    expect(bad).toEqual([]);
  });

  it("anchor: the player's drift below maxSpeed loses f(f(f(dt) x 32) x 1) per tick", () => {
    // PlayerEntity.m:3378-3388: thrust_factor 1 while flightSpeed <=
    // maxFlightSpeed; (float)delta_t x thrust x thrust_factor in float:
    // f(f(f(1/120) x 32) x 1) = 0.2666666805744171.
    const fixture = byId(brakingFixtures(), "brake-player-below-max-speed");
    expect(playerBrakeReference(fixture).perTickLoss).toBe(0.2666666805744171);
    expect(fixture.expected.perTickLoss).toBe(0.2666666805744171);
    // A 50 m/s drift needs at least 50 / 0.2667 = 187.5 ticks to stop.
    expect(fixture.expected.stopTick).toBeGreaterThanOrEqual(188);
  });

  it("anchor: a buoy (thrust 100) brakes by dt_thrust = f(f(5 x 100) x dt)", () => {
    // ShipEntity.m:5810: SHIP_THRUST_FACTOR 5.0f x thrust in float, x the
    // double delta_t, assigned to a GLfloat: f(500 / 120) = 4.166666507720947.
    const fixture = byId(
      brakingFixtures(),
      "brake-ship-buoy-thrust-100-from-100",
    );
    expect(npcBrakeReference(fixture).perTickLoss).toBe(4.166666507720947);
    expect(fixture.expected.perTickLoss).toBe(4.166666507720947);
    // 100 / 4.1667 = 24.0000: the drift is gone by tick 24 or 25.
    expect([24, 25]).toContain(fixture.expected.stopTick);
  });
});

describe("player scrape oracle (PlayerEntity.m:5701-5753)", () => {
  it("parses strictly and re-derives every scrape fixture", () => {
    const fixtures = ScrapeFileSchema.parse(readJson(SCRAPE_FIXTURE_FILE));
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    const bad = fixtures
      .map((fixture) => [fixture.id, scrapeProblems(fixture)] as const)
      .filter(([, problems]) => problems.length > 0);
    expect(bad).toEqual([]);
  });

  it("anchor: a 40 scrape from ahead comes off the forward shield only", () => {
    // d_forward = 100 >= 0 (5720, 5726): forward_shield -= 40 -> 88 >= 0, so
    // amount = 0 (5727-5733) and energy -= 0 (ShipEntity.m:11651).
    const got = playerScrapeReference({
      amount: 40,
      otherOffset: [0, 0, 100],
      forward: [0, 0, 1],
      shields: { forward: 128, aft: 128 },
      energy: 256,
    });
    expect(got.shieldHit).toBe("forward");
    expect(got.shields.forward).toBe(88);
    expect(got.shields.aft).toBe(128);
    expect(got.remainder).toBe(0);
    expect(got.energy).toBe(256);
    expect(got.heatChange).toBe(0);
  });
});

describe("blast oracle (ShipEntity.m:7680-7698, 8114-8126)", () => {
  it("parses strictly and re-derives every blast fixture", () => {
    const fixtures = BlastFileSchema.parse(readJson(BLAST_FIXTURE_FILE));
    expect(fixtures.length).toBeGreaterThanOrEqual(9);
    const bad = fixtures
      .map((fixture) => [fixture.id, blastProblems(fixture)] as const)
      .filter(([, problems]) => problems.length > 0);
    expect(bad).toEqual([]);
  });

  it("anchor: a Krait blast on the player 10 m away takes the d2 floor", () => {
    // amount = f(0.125 x 93291.40625) = 11661.42578125 (8125); desired_range
    // = f(50.196590423583984 x 2.5) = 125.4914779663086 (8124). p2 = (6, 0,
    // 8): magnitude2 = 100, d2 = 100 - 72.69734954833984^2 < 0.1 -> 0.1
    // (7686-7690); moment = 11661.42578125 x 125.4914779663086 / 0.1 =
    // 14634095.564834774 (7691); howmuch = f(moment) = 14634096, / mass ->
    // f(14634096 / 214737.6875) = 68.1487045288086; vector_normal(p2) =
    // (f(6 x f(0.1)), 0, f(8 x f(0.1))) = (0.6000000238418579, 0,
    // 0.800000011920929); dv = (40.889225006103516, 0, 54.51896286010742)
    // (11178-11181).
    const got = blastReference({
      victims: [
        {
          name: "Krait",
          position: [0, 0, 0],
          mass: 93291.40625,
          radius: 50.196590423583984,
        },
      ],
      receivers: [
        {
          name: "player",
          position: [6, 0, 8],
          mass: 214737.6875,
          radius: 72.69734954833984,
        },
      ],
    });
    expect(got.victims[0]?.desiredRange).toBe(125.4914779663086);
    expect(got.victims[0]?.amount).toBe(11661.42578125);
    const c = got.receivers[0]?.contributions[0];
    expect(c?.inRange).toBe(true);
    expect(c?.floored).toBe(true);
    expect(c?.d2).toBe(0.1);
    expect(c?.moment).toBe(14634095.564834774);
    const dv = got.receivers[0]?.dv;
    expect(dv?.[0]).toBe(40.889225006103516);
    expect(dv?.[1]).toBe(0);
    expect(dv?.[2]).toBe(54.51896286010742);
  });
});

describe("fixture ids across the combat oracle trees", () => {
  it("are unique across every JSON fixture file under tests/oracles/combat/", () => {
    const root = fileURLToPath(new URL("../", import.meta.url));
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    const walk = (dir: string): void => {
      if (!existsSync(dir)) return;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}${entry.name}`;
        if (entry.isDirectory()) {
          walk(`${path}/`);
        } else if (entry.name.endsWith(".json")) {
          const data: unknown = JSON.parse(readFileSync(path, "utf8"));
          if (!Array.isArray(data)) continue;
          for (const item of data as unknown[]) {
            if (typeof item !== "object" || item === null) continue;
            const id = (item as { id?: unknown }).id;
            if (typeof id !== "string") continue;
            const where = path.slice(root.length);
            const before = seen.get(id);
            if (before !== undefined)
              duplicates.push(`${id}: ${before}, ${where}`);
            seen.set(id, where);
          }
        }
      }
    };
    for (const tree of ["geometry/", "response/"]) walk(`${root}${tree}`);
    expect(seen.size).toBeGreaterThan(0);
    expect(duplicates).toEqual([]);
  });
});

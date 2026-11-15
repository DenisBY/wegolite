// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Self-test of the pursuit oracle (Phase 14, plan 14-02).
 *
 * The oracle has to be right before the port exists, so this file checks it
 * against itself: every fixture parses with a local, strict copy of the
 * contract's structure (this tree imports nothing from plan 14-01), every
 * check and event is re-derived through `derive.ts` (the one-tick
 * transliteration of the Oolite steering code and its closed forms), and the
 * acceptance facts of the plan are asserted. Hand-computed anchors sit next to
 * the generic re-derivation so a mistake in `derive.ts` cannot hide behind the
 * fixtures it produced.
 *
 * Nothing here reads Wegolite code: the expected values come from the pinned
 * Oolite source lines cited in each fixture and from closed forms.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import * as derive from "./derive.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

// ---------------------------------------------------------------------------
// a local copy of the contract's structure (closed lists from the plan text)

const FIELDS = [
  "flightSpeed",
  "flightRoll",
  "flightPitch",
  "stickRoll",
  "stickPitch",
  "desiredSpeed",
  "desiredRange",
  "frustration",
  "successFactor",
  "pitchingOver",
  "accuracy",
  "behaviour",
  "targetId",
  "proximityAlert",
  "rangeToDestination",
  "rangeToTarget",
  "headingErrorDestination",
  "headingErrorTarget",
  "positionX",
  "positionY",
  "positionZ",
  "forwardX",
  "forwardY",
  "forwardZ",
  "upX",
  "upY",
  "upZ",
  "jinkX",
  "jinkY",
  "jinkZ",
  "destinationX",
  "destinationY",
  "destinationZ",
  "aimPointX",
  "aimPointY",
  "aimPointZ",
] as const;
const DISCRETE = new Set([
  "behaviour",
  "targetId",
  "proximityAlert",
  "pitchingOver",
]);
const EVENTS = [
  "shipAchievedDesiredRange",
  "shipNowFacingDestination",
  "shipAIFrustrated",
  "shipTargetLost",
] as const;
const BEHAVIOURS = [
  "IDLE",
  "TRACK_TARGET",
  "TUMBLE",
  "STOP_STILL",
  "STATION_KEEPING",
  "ATTACK_TARGET",
  "ATTACK_FLY_TO_TARGET",
  "ATTACK_FLY_FROM_TARGET",
  "RUNNING_DEFENSE",
  "FLEE_TARGET",
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_MINING_TARGET",
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
  "ATTACK_BREAK_OFF_TARGET",
  "ATTACK_SLOW_DOGFIGHT",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  "ATTACK_SNIPER",
  "ATTACK_BROADSIDE",
  "ATTACK_BROADSIDE_LEFT",
  "ATTACK_BROADSIDE_RIGHT",
  "CLOSE_TO_BROADSIDE_RANGE",
  "CLOSE_WITH_TARGET",
  "AVOID_COLLISION",
  "TRACK_AS_TURRET",
  "FLY_RANGE_FROM_DESTINATION",
  "FLY_TO_DESTINATION",
  "FLY_FROM_DESTINATION",
  "FACE_DESTINATION",
  "FLY_THRU_NAVPOINTS",
  "LAND_ON_PLANET",
  "COLLECT_TARGET",
  "INTERCEPT_TARGET",
  "FORMATION_FORM_UP",
  "FORMATION_BREAK",
  "ENERGY_BOMB_COUNTDOWN",
  "TRACTORED",
  "SCRIPTED_AI",
  "SCRIPTED_ATTACK_AI",
] as const;
const SCAN_CLASSES = [
  "CLASS_NOT_SET",
  "CLASS_NO_DRAW",
  "CLASS_NEUTRAL",
  "CLASS_STATION",
  "CLASS_TARGET",
  "CLASS_CARGO",
  "CLASS_MISSILE",
  "CLASS_ROCK",
  "CLASS_MINE",
  "CLASS_THARGOID",
  "CLASS_BUOY",
  "CLASS_VISUAL_EFFECT",
  "CLASS_WORMHOLE",
  "CLASS_PLAYER",
  "CLASS_POLICE",
  "CLASS_MILITARY",
] as const;
const WEAPONS = [
  "EQ_WEAPON_NONE",
  "EQ_WEAPON_PULSE_LASER",
  "EQ_WEAPON_BEAM_LASER",
  "EQ_WEAPON_MINING_LASER",
  "EQ_WEAPON_MILITARY_LASER",
] as const;
const KINDS = ["ship", "player", "station", "planet", "sun", "buoy"] as const;
const CITATION =
  /^(?:src\/Core|Resources)\/[A-Za-z0-9_./-]+:([1-9]\d*)-([1-9]\d*)$/;

const vec3 = z.tuple([z.number(), z.number(), z.number()]);
const frame = {
  position: vec3,
  forward: vec3,
  up: vec3,
  right: vec3,
};
const ShapeSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    title: z.string().min(1),
    oolite: z
      .array(
        z.string().refine((c) => {
          const m = CITATION.exec(c);
          return m !== null && Number(m[1]) <= Number(m[2]);
        }, "citation"),
      )
      .min(1),
    derivation: z.string().min(1),
    dt: z.literal(1 / 120),
    horizon: z.number().int().min(1).max(36000),
    stats: z.strictObject({
      maxFlightSpeed: z.number().positive(),
      maxFlightRoll: z.number().positive(),
      maxFlightPitch: z.number().positive(),
      thrust: z.number().positive(),
      mass: z.number().positive(),
      forwardWeapon: z.enum(WEAPONS),
      scannerRange: z.literal(25600),
    }),
    self: z.strictObject({
      id: z.literal(101),
      scanClass: z.enum(SCAN_CLASSES),
      radius: z.number().positive(),
      ...frame,
      speed: z.number(),
      flightRoll: z.number(),
      flightPitch: z.number(),
      stickRoll: z.number(),
      stickPitch: z.number(),
      accuracy: z.number().min(-5).max(10),
      frustration: z.number(),
      successFactor: z.number(),
      pitchingOver: z.union([z.literal(0), z.literal(1)]),
      jink: vec3,
      behaviour: z.enum(BEHAVIOURS),
      targetId: z.number().int().min(0),
      destination: vec3,
      desiredRange: z.number(),
      desiredSpeed: z.number(),
      ownerId: z.number().int().min(0),
      escortSlot: z.number().int().min(0),
    }),
    bodies: z.array(
      z.strictObject({
        id: z.number().int().min(1),
        kind: z.enum(KINDS),
        scanClass: z.enum(SCAN_CLASSES),
        radius: z.number().positive(),
        mass: z.number().positive(),
        ...frame,
        speed: z.number(),
        behaviour: z.enum(BEHAVIOURS),
        targetId: z.number().int().min(0),
      }),
    ),
    motion: z.enum(["static", "constant-velocity"]),
    assign: z.array(
      z.strictObject({
        op: z.enum([
          "setTarget",
          "setDestination",
          "setDesiredRange",
          "setDesiredSpeed",
          "perform",
        ]),
        value: z.union([z.number(), z.string(), vec3]),
      }),
    ),
    draws: z.array(z.number().min(0).lt(1)),
    checks: z
      .array(
        z.strictObject({
          tick: z.number().int().min(0),
          field: z.enum(FIELDS),
          expected: z.union([z.number(), z.string()]),
          tolerance: z.number().min(0),
          note: z.string().min(1),
        }),
      )
      .min(1),
    events: z.array(
      z.strictObject({
        tick: z.number().int().min(1),
        name: z.enum(EVENTS),
      }),
    ),
  })
  .superRefine((fixture, ctx) => {
    const bad = (message: string): void => {
      ctx.addIssue({ code: "custom", message });
    };
    const poses = [
      ["self", fixture.self] as const,
      ...fixture.bodies.map((b) => [`body ${String(b.id)}`, b] as const),
    ];
    for (const [name, pose] of poses) {
      const { forward, up, right } = pose;
      for (const [axisName, axis] of [
        ["forward", forward],
        ["up", up],
        ["right", right],
      ] as const) {
        if (Math.abs(derive.mag(axis) - 1) > 1e-9)
          bad(`${name} ${axisName} is not unit`);
      }
      if (Math.abs(derive.dot(forward, up)) > 1e-9) bad(`${name} forward.up`);
      if (Math.abs(derive.dot(forward, right)) > 1e-9)
        bad(`${name} forward.right`);
      if (Math.abs(derive.dot(up, right)) > 1e-9) bad(`${name} up.right`);
      const handed = derive.cross(right, up);
      for (let i = 0; i < 3; i += 1) {
        if (Math.abs((handed[i] ?? 0) - (forward[i] ?? 0)) > 1e-9) {
          bad(`${name}: right x up is not forward`);
          break;
        }
      }
    }
    const ids = new Set<number>();
    for (const body of fixture.bodies) {
      if (ids.has(body.id)) bad(`duplicate body id ${String(body.id)}`);
      ids.add(body.id);
      if (body.id === 101) bad("id 101 is the steered ship");
      if (body.kind === "player" && body.id !== 100)
        bad("the player is id 100");
      if (body.kind === "ship" && body.id < 102)
        bad("other ships are id 102 and up");
    }
    if (new Set(fixture.draws).size !== fixture.draws.length)
      bad("draws are distinct");
    for (const check of fixture.checks) {
      if (check.tick > fixture.horizon)
        bad(`check tick ${String(check.tick)} beyond the horizon`);
      if (DISCRETE.has(check.field) && check.tolerance !== 0)
        bad("discrete tolerance is 0");
      if (check.field === "behaviour") {
        if (
          typeof check.expected !== "string" ||
          !(BEHAVIOURS as readonly string[]).includes(check.expected)
        ) {
          bad("behaviour expects a BEHAVIOUR name");
        }
      } else if (typeof check.expected !== "number") {
        bad("this field expects a number");
      }
    }
    let previous = 0;
    for (const event of fixture.events) {
      if (event.tick > fixture.horizon) bad("event tick beyond the horizon");
      if (event.tick < previous) bad("events are in tick order");
      previous = event.tick;
    }
  });

type Fixture = z.infer<typeof ShapeSchema>;

function loadFile(name: string): Fixture[] {
  const raw = JSON.parse(
    readFileSync(`${FIXTURE_DIR}${name}`, "utf8"),
  ) as unknown;
  return z.array(ShapeSchema).min(1).parse(raw);
}

function fileNames(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function allFixtures(): Fixture[] {
  return fileNames().flatMap((name) => loadFile(name));
}

function byId(id: string): Fixture {
  const found = allFixtures().find((fixture) => fixture.id === id);
  if (found === undefined) throw new Error(`no fixture ${id}`);
  return found;
}

function like(fixture: Fixture): derive.FixtureLike {
  return fixture;
}

function checkAt(
  fixture: Fixture,
  tick: number,
  field: string,
): Fixture["checks"][number] {
  const found = fixture.checks.find(
    (c) => c.tick === tick && c.field === field,
  );
  if (found === undefined)
    throw new Error(`${fixture.id} has no ${field} check at ${String(tick)}`);
  return found;
}

// ---------------------------------------------------------------------------

describe("fixture files", () => {
  it("has at least the intercept and flee groups", () => {
    expect(fileNames()).toEqual(
      expect.arrayContaining(["intercept.json", "flee.json"]),
    );
  });

  it("parses every fixture against the contract structure", () => {
    for (const name of fileNames()) {
      expect(() => loadFile(name), name).not.toThrow();
    }
  });

  it("keeps fixture ids unique inside the tree", () => {
    const ids = allFixtures().map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cites every fixture to Oolite lines", () => {
    for (const fixture of allFixtures()) {
      expect(fixture.oolite.length, fixture.id).toBeGreaterThan(0);
      expect(fixture.derivation.length, fixture.id).toBeGreaterThan(80);
    }
  });
});

describe("the accumulator helper (contract item 8)", () => {
  it("crosses a time threshold later than a float64 sum does", () => {
    // float32 accumulation of 1/120: 0.5 s at 61 (float64 sum: 60)
    expect(derive.firstTickAbove(0.5)).toBe(61);
    expect(derive.firstTickAbove(7.5)).toBe(901);
    expect(derive.firstTickAbove(10)).toBe(1201);
    expect(derive.firstTickAbove(15)).toBe(1801);
    expect(derive.firstTickAbove(9.375)).toBe(1126);
    expect(derive.firstTickAbove(12.5)).toBe(1501);
    // the same thresholds in float64 for contrast
    let sum = 0;
    let first = 0;
    for (let k = 1; first === 0; k += 1) {
      sum += 1 / 120;
      if (sum > 0.5) first = k;
    }
    expect(first).toBe(60);
  });
});

describe("closed forms re-derive from the poses", () => {
  it("measures range as the centre distance minus both radii", () => {
    expect(derive.rangeBetween([0, 0, 0], 40, [0, 0, 10000], 40)).toBe(9920);
    expect(derive.rangeBetween([0, 0, 0], 40, [0, 0, 70], 30)).toBe(0);
    expect(derive.rangeBetween([0, 0, 0], 40, [0, 0, 60], 40)).toBe(-20);
  });

  it("measures the approach aspect against the target's nose", () => {
    expect(derive.approachAspect([0, 0, 0], [0, 0, 5000], [0, 0, -1])).toBe(1);
    expect(derive.approachAspect([0, 0, 0], [0, 0, 5000], [0, 0, 1])).toBe(-1);
    const towards: derive.V3 = [0, 0, -1];
    const forward = derive.forwardWithAspect(0.9, towards);
    expect(derive.approachAspect([0, 0, 0], [0, 0, 5000], forward)).toBeCloseTo(
      0.9,
      12,
    );
  });

  it("derives the aim cosine from accuracy (aim_tolerance = 240 - 18 * accuracy)", () => {
    // accuracy 2: aim 204, sqrt(1 - 204^2 / 1e8) is below the 0.999999 best cosine
    expect(derive.currentAimTolerance(2)).toBeCloseTo(
      Math.sqrt(1 - (204 * 204) / 1e8),
      12,
    );
    // accuracy -2: aim 276, best cosine 0.99999 is higher than sqrt(1 - 276^2 / 1e8)
    expect(derive.currentAimTolerance(-2)).toBeCloseTo(
      Math.sqrt(1 - (276 * 276) / 1e8),
      12,
    );
    // accuracy 8: aim 96 / 5 = 19.2 and sqrt(1 - 19.2^2 / 1e8) is below the
    // 0.9999999 cap, which therefore never binds for accuracy at most 10
    expect(derive.currentAimTolerance(8)).toBeCloseTo(
      Math.sqrt(1 - (19.2 * 19.2) / 1e8),
      12,
    );
  });

  it("samples the tracking curve every 60 ticks and fits samples 1 to 3 only", () => {
    const position = (k: number): derive.V3 => [
      3000 - (100 * k) / 120,
      0,
      8000,
    ];
    const aimX = (tick: number): number =>
      derive.trackingAimPoint(position, tick)[0];
    // the closed form of the plan: P0 until the second sample is visible
    for (const tick of [0, 59, 60, 61, 90, 119])
      expect(aimX(tick)).toBeCloseTo(3000, 9);
    // P0 + 1.5 v at tick 120 (v = -100 m/s), the exact position at tick 180
    expect(aimX(120)).toBeCloseTo(3000 - 150, 9);
    expect(aimX(180)).toBeCloseTo(3000 - 150, 9);
    // v (s + 0.5)(s + 1) with s = 0.5 + 1/120 at tick 121
    const s = 0.5 + 1 / 120;
    expect(aimX(121)).toBeCloseTo(3000 - 100 * (s + 0.5) * (s + 1), 9);
  });
});

describe("every check re-derives through derive.ts", () => {
  for (const name of ["intercept.json", "flee.json"]) {
    for (const fixture of loadFile(name)) {
      it(`${fixture.id}: checks, events and draws`, () => {
        for (const check of fixture.checks) {
          const derived = derive.deriveCheck(like(fixture), check);
          if (typeof check.expected === "string") {
            expect(derived, `${check.field}@${String(check.tick)}`).toBe(
              check.expected,
            );
          } else {
            expect(typeof derived, `${check.field}@${String(check.tick)}`).toBe(
              "number",
            );
            expect(
              Math.abs((derived as number) - check.expected),
              `${check.field}@${String(check.tick)}: derived ${String(derived)} vs ${String(check.expected)}`,
            ).toBeLessThanOrEqual(check.tolerance + 1e-12);
          }
        }
        expect(derive.deriveEvents(like(fixture))).toEqual(fixture.events);
        expect(derive.deriveDrawCount(like(fixture))).toBe(
          fixture.draws.length,
        );
      });
    }
  }
});

/**
 * A replay of more than one update holds the steered ship's pose (derive.ts
 * does not move it), so a fixture that asks for a later-tick value must prove
 * the held pose is exact: either the ship cannot move at all, or its largest
 * possible displacement leaves every decision threshold the behaviour reads
 * out of reach.
 */
const STATIC_SELF = new Set(["flee-frustration-fires-at-tick-1801"]);
const FROZEN_THRESHOLDS: Record<string, number[]> = {
  "intercept-inside-desired-range-posts-every-tick": [1500],
  "intercept-tracking-curve-aim-point-of-crossing-target": [100, 32000],
  "intercept-removed-target-posts-range-then-lost": [],
  "intercept-planet-target-is-not-valid": [],
  "intercept-target-beyond-scanner-reach-is-lost": [],
  "flee-removed-target-goes-idle-posting-target-lost": [],
  "flee-target-beyond-scanner-reach-is-lost": [],
};

function needsFrozenReplay(fixture: Fixture): boolean {
  return (
    fixture.checks.some(
      (c) => c.tick >= 2 && !c.field.startsWith("aimPoint"),
    ) || fixture.events.some((e) => e.tick >= 2)
  );
}

function initialRange(fixture: Fixture): number {
  const world = derive.tickZeroWorld(like(fixture));
  return derive.rangeToPrimaryTarget(world);
}

describe("later-tick values come from an exact held pose", () => {
  for (const fixture of allFixtures()) {
    if (!needsFrozenReplay(fixture)) continue;
    it(`${fixture.id}: the held pose is exact`, () => {
      if (STATIC_SELF.has(fixture.id)) {
        // the ship cannot move: it starts at rest, wants speed 0 and, being
        // outside its desired range, never raises it (flee, ShipEntity.m:4855-4858)
        expect(fixture.self.speed).toBe(0);
        expect(fixture.self.desiredSpeed).toBe(0);
        expect(initialRange(fixture)).toBeGreaterThan(
          fixture.self.desiredRange,
        );
        expect(
          derive.deriveCheck(like(fixture), {
            ...checkAt(fixture, 1802, "desiredSpeed"),
          }),
        ).toBe(0);
        return;
      }
      const thresholds = FROZEN_THRESHOLDS[fixture.id];
      expect(
        thresholds,
        `${fixture.id} needs a FROZEN_THRESHOLDS entry`,
      ).toBeDefined();
      const world = derive.tickZeroWorld(like(fixture));
      const target = derive.primaryTarget(world);
      const range0 = initialRange(fixture);
      const shipTravel =
        fixture.horizon * fixture.dt * fixture.stats.maxFlightSpeed;
      const targetTravel =
        target === null || fixture.motion === "static"
          ? 0
          : fixture.horizon * fixture.dt * Math.abs(target.speed);
      const reach = shipTravel + targetTravel;
      for (const threshold of thresholds ?? []) {
        // a decision threshold must stay clear of the range the poses can sweep
        expect(
          Math.abs(range0 - threshold),
          `${fixture.id} threshold ${String(threshold)}`,
        ).toBeGreaterThan(reach);
      }
    });
  }
});

describe("no proximity warning can fire before the horizon ends", () => {
  it("keeps every body outside four radii of the ship through the held poses", () => {
    for (const fixture of allFixtures()) {
      const reach = STATIC_SELF.has(fixture.id)
        ? 0
        : fixture.horizon *
          fixture.dt *
          Math.max(fixture.stats.maxFlightSpeed, Math.abs(fixture.self.speed));
      const world = derive.tickZeroWorld(like(fixture));
      // the alert set at tick k is read at tick k + 1, so ticks 1 .. horizon - 1 matter
      for (let k = 1; k <= fixture.horizon - 1; k += 1) {
        for (const body of fixture.bodies) {
          if (body.kind === "planet" || body.kind === "sun") continue;
          const position = derive.bodyPosition(world, body, k);
          const dist = derive.mag(derive.sub(position, fixture.self.position));
          const zone = 4 * Math.max(fixture.self.radius, body.radius);
          expect(
            dist - reach,
            `${fixture.id} tick ${String(k)}`,
          ).toBeGreaterThan(zone);
        }
      }
    }
  });
});

describe("intercept fixtures", () => {
  const intercept = (): Fixture[] => loadFile("intercept.json");

  it("lists the removed-target events as range achieved then target lost on one tick", () => {
    const row = byId("intercept-removed-target-posts-range-then-lost");
    expect(row.events).toEqual([
      { tick: 1, name: "shipAchievedDesiredRange" },
      { tick: 1, name: "shipTargetLost" },
    ]);
    expect(row.bodies).toHaveLength(0);
    expect(checkAt(row, 1, "behaviour").expected).toBe("IDLE");
    expect(checkAt(row, 1, "frustration").expected).toBe(0);
  });

  it("lists a target lost by range as shipTargetLost alone", () => {
    const row = byId("intercept-target-beyond-scanner-reach-is-lost");
    expect(row.events).toEqual([{ tick: 1, name: "shipTargetLost" }]);
    const target = row.bodies[0];
    expect(target).toBeDefined();
    // the centre distance exceeds 1.25 x scannerRange (8705-8708)
    expect(
      derive.mag(derive.sub(target?.position ?? [0, 0, 0], row.self.position)),
    ).toBeGreaterThan(25600 * 1.25);
  });

  it("treats a planet as an invalid target", () => {
    const row = byId("intercept-planet-target-is-not-valid");
    expect(row.bodies[0]?.kind).toBe("planet");
    expect(row.events.map((e) => e.name)).toEqual([
      "shipAchievedDesiredRange",
      "shipTargetLost",
    ]);
  });

  it("posts shipAchievedDesiredRange once per tick while inside the range", () => {
    const row = byId("intercept-inside-desired-range-posts-every-tick");
    expect(row.events).toEqual(
      [1, 2, 3, 4, 5].map((tick) => ({
        tick,
        name: "shipAchievedDesiredRange",
      })),
    );
  });

  it("checks the aim point at ticks 0, 90, 119, 120, 121 and 180", () => {
    const row = byId("intercept-tracking-curve-aim-point-of-crossing-target");
    const x = (tick: number): number =>
      Number(checkAt(row, tick, "aimPointX").expected);
    for (const tick of [0, 90, 119]) expect(x(tick)).toBeCloseTo(3000, 9);
    // hand closed forms: P0 + 1.5 v at 120, v (s + 0.5)(s + 1) at 121, exact at 180
    expect(x(120)).toBeCloseTo(2850, 9);
    expect(x(121)).toBeCloseTo(3000 - 100 * (1 + 1 / 120) * (1.5 + 1 / 120), 9);
    expect(x(180)).toBeCloseTo(2850, 9);
    expect(
      row.checks.filter((c) => c.field === "aimPointX").map((c) => c.tick),
    ).toEqual(expect.arrayContaining([0, 90, 119, 120, 121, 180]));
    // no check sits on the base-dependent sampling edge
    for (const tick of [59, 60, 61]) {
      expect(
        row.checks.some(
          (c) => c.field.startsWith("aimPoint") && c.tick === tick,
        ),
      ).toBe(false);
    }
  });

  it("pins the exact-zero abeam quirk and the pitch-over damping by hand", () => {
    expect(
      Number(
        checkAt(
          byId("intercept-target-above-pitches-up-full-stick"),
          1,
          "stickPitch",
        ).expected,
      ),
    ).toBe(-1.8);
    expect(
      Number(
        checkAt(
          byId("intercept-target-dead-behind-pitches-over"),
          1,
          "stickPitch",
        ).expected,
      ),
    ).toBeCloseTo(-0.225, 12);
    expect(
      checkAt(
        byId("intercept-target-dead-behind-pitches-over"),
        1,
        "pitchingOver",
      ).expected,
    ).toBe(1);
    const abeam = byId("intercept-target-abeam-gives-no-turn-command");
    expect(checkAt(abeam, 1, "stickRoll").expected).toBe(0);
    expect(checkAt(abeam, 1, "stickPitch").expected).toBe(0);
    expect(checkAt(abeam, 1, "desiredSpeed").expected).toBe(320);
  });

  it("holds the group of nine rows", () => {
    expect(intercept().length).toBeGreaterThanOrEqual(9);
  });
});

describe("flee fixtures", () => {
  it("holds a row at accuracy 2 with a tick-0 aspect above 0.9995 for each evasive outcome", () => {
    const outcomes = new Set<string>();
    for (const id of [
      "flee-accuracy-2-aspect-above-0-9995-takes-evasive-action",
      "flee-accuracy-2-aspect-above-0-9995-takes-flee-evasive-action",
    ]) {
      const row = byId(id);
      expect(row.self.accuracy).toBe(2);
      const target = row.bodies.find((b) => b.id === 102);
      expect(target).toBeDefined();
      const aspect = derive.approachAspect(
        row.self.position,
        target?.position ?? [0, 0, 0],
        target?.forward ?? [0, 0, 1],
      );
      expect(aspect).toBeGreaterThan(0.9995);
      expect(row.draws).toHaveLength(3);
      const third = row.draws[2] ?? 1;
      outcomes.add(String(checkAt(row, 1, "behaviour").expected));
      expect(third < 0.15 ? "EVASIVE_ACTION" : "FLEE_EVASIVE_ACTION").toBe(
        checkAt(row, 1, "behaviour").expected,
      );
    }
    expect([...outcomes].sort()).toEqual([
      "EVASIVE_ACTION",
      "FLEE_EVASIVE_ACTION",
    ]);
  });

  it("holds the aspect-0.9 row that draws only the jink pair", () => {
    const row = byId("flee-accuracy-2-jink-draws-and-aspect-below-threshold");
    expect(row.self.accuracy).toBe(2);
    expect(row.draws).toHaveLength(2);
    const target = row.bodies[0];
    expect(
      derive.approachAspect(
        row.self.position,
        target?.position ?? [0, 0, 0],
        target?.forward ?? [0, 0, 1],
      ),
    ).toBeCloseTo(0.9, 9);
    // floor(0.7 * 256) - 128 (+128), floor(0.3 * 256) - 128 (-128), z 400
    expect(checkAt(row, 1, "jinkX").expected).toBe(179);
    expect(checkAt(row, 1, "jinkY").expected).toBe(-180);
    expect(checkAt(row, 1, "jinkZ").expected).toBe(400);
  });

  it("draws nothing below accuracy 0", () => {
    const row = byId("flee-accuracy-minus-2-draws-nothing-and-turns-away");
    expect(row.self.accuracy).toBe(-2);
    expect(row.draws).toHaveLength(0);
    expect(checkAt(row, 1, "jinkX").expected).toBe(0);
    expect(checkAt(row, 1, "stickPitch").expected).toBe(1.8);
  });

  it("counts range 0 as safety and a negative range as not safe", () => {
    expect(
      Number(
        checkAt(byId("flee-range-zero-counts-as-safety"), 1, "desiredSpeed")
          .expected,
      ),
    ).toBe(100);
    expect(
      Number(
        checkAt(byId("flee-negative-range-is-not-safety"), 1, "desiredSpeed")
          .expected,
      ),
    ).toBe(320);
  });

  it("fires the 15 s frustration at tick 1801, not 1800", () => {
    const row = byId("flee-frustration-fires-at-tick-1801");
    expect(derive.firstTickAbove(15)).toBe(1801);
    expect(row.events).toEqual([{ tick: 1801, name: "shipAIFrustrated" }]);
    expect(
      Number(checkAt(row, 1800, "frustration").expected),
    ).toBeLessThanOrEqual(15);
    expect(Number(checkAt(row, 1800, "frustration").expected)).toBe(
      derive.accumulate(0, 1 / 120, 1800),
    );
    expect(checkAt(row, 1801, "frustration").expected).toBe(0);
    expect(checkAt(row, 1801, "frustration").tolerance).toBe(0);
  });

  it("lists a lost target as shipTargetLost alone", () => {
    expect(
      byId("flee-removed-target-goes-idle-posting-target-lost").events,
    ).toEqual([{ tick: 1, name: "shipTargetLost" }]);
    expect(byId("flee-target-beyond-scanner-reach-is-lost").events).toEqual([
      { tick: 1, name: "shipTargetLost" },
    ]);
  });
});

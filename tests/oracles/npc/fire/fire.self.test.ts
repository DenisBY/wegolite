// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Self-test of the fire-gate oracle (Phase 17, plan 17-01).
 *
 * The oracle has to be right before the port exists, so this file checks it
 * against itself: every fixture parses with the strict schema, every expected
 * value is re-derived through `derive.ts` (the transliteration of Oolite's
 * `fireWeapon:`, `onTarget:` and `currentAimTolerance` at the pin `7437f22`),
 * and hand-written anchors sit next to the generic re-derivation so a mistake
 * in `derive.ts` cannot hide behind the fixtures it reproduced.
 *
 * Nothing here reads Wegolite code or the Oolite checkout: the Oolite facts are
 * transliterated into `derive.ts` and the lines are cited in each fixture.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  COOLING_CUTOUT,
  COOLING_PER_TICK,
  CUTOUT_TEMPERATURE,
  WEAPON_INFO,
  deriveAimTolerance,
  deriveGate,
  deriveHeat,
  deriveOnTarget,
  literalShotFrames,
  rechargeRateF32,
  rechargeTicks,
  traceOnTarget,
} from "./derive.js";
import { FrameRateRuleSchema } from "../schema.js";
import {
  FIRE_REFUSALS,
  FIRE_WEAPONS,
  FireGateFileSchema,
  FireGateFixtureSchema,
  OnTargetFileSchema,
  OnTargetFixtureSchema,
  WeaponHeatFileSchema,
  WeaponHeatFixtureSchema,
  type FireGateFixture,
  type OnTargetFixture,
  type WeaponHeatFixture,
} from "./schema.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, "utf8"));
}

/** The float32 value immediately below a positive float32 value. */
function float32Below(value: number): number {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value);
  view.setUint32(0, view.getUint32(0) - 1);
  return view.getFloat32(0);
}

// ---------------------------------------------------------------------------
// the gate family (Task 1)

/** Re-derives one gate fixture and lists every field that disagrees. */
function gateProblems(fixture: FireGateFixture): string[] {
  const derived = deriveGate(fixture);
  const problems: string[] = [];
  const e = fixture.expected;
  if (derived.fired !== e.fired) problems.push("fired");
  if (derived.refusedAt !== e.refusedAt) problems.push("refusedAt");
  if (derived.drawsUsed !== e.drawsUsed) problems.push("drawsUsed");
  if (derived.shotTimerReset !== e.shotTimerReset) {
    problems.push("shotTimerReset");
  }
  if (Math.abs(derived.energyAfter - e.energyAfter) > fixture.tolerance) {
    problems.push("energyAfter");
  }
  if (
    Math.abs(derived.temperatureAfter - e.temperatureAfter) > fixture.tolerance
  ) {
    problems.push("temperatureAfter");
  }
  return problems;
}

/**
 * The intent of every gate fixture, written by hand beside the JSON: id,
 * where the gate refuses (null = fires) and how many draws it takes. A
 * fixture edited to agree with a changed derivation fails here.
 */
const GATE_INTENT: readonly (readonly [
  string,
  (typeof FIRE_REFUSALS)[number] | null,
  0 | 1,
])[] = [
  ["gate-fires-pulse-clean", null, 1],
  ["gate-heat-at-cutout-refuses-before-energy-timer-and-roll", "heat", 0],
  ["gate-heat-one-float32-below-cutout-passes", null, 1],
  ["gate-heat-far-above-cutout-refuses", "heat", 0],
  ["gate-energy-equal-to-cost-refuses-before-timer", "energy", 0],
  ["gate-energy-just-above-cost-passes", null, 1],
  ["gate-energy-equal-to-cost-beam-refuses", "energy", 0],
  ["gate-timer-refuses-before-roll-range-and-aim", "timer", 0],
  ["gate-timer-exact-period-pulse-fires", null, 1],
  ["gate-timer-one-tick-over-pulse-fires", null, 1],
  ["gate-timer-same-tick-pulse-refuses", "timer", 0],
  ["gate-timer-one-tick-short-beam-refuses", "timer", 0],
  ["gate-timer-exact-period-beam-fires", null, 1],
  ["gate-timer-one-tick-over-beam-fires", null, 1],
  ["gate-timer-never-fired-is-ready-beam", null, 1],
  ["gate-timer-one-tick-short-mining-refuses", "timer", 0],
  ["gate-timer-exact-period-mining-fires", null, 1],
  ["gate-timer-one-tick-short-military-refuses", "timer", 0],
  ["gate-roll-refuses-draw-too-high", "roll", 1],
  ["gate-roll-passes-at-equality", null, 1],
  ["gate-roll-refuses-one-ulp-above-equality", "roll", 1],
  ["gate-roll-product-is-float32-before-the-accuracy-factor", "roll", 1],
  ["gate-roll-accuracy-0-narrow-circle-refuses", "roll", 1],
  ["gate-roll-accuracy-9-wide-circle-passes", null, 1],
  ["gate-range-equal-to-weapon-range-passes-roll-and-range", null, 1],
  ["gate-range-one-ulp-above-weapon-range-refuses-at-range", "range", 1],
  ["gate-no-target-refuses-after-the-draw", "onTarget", 1],
  ["gate-off-target-refuses-after-the-draw-military", "onTarget", 1],
  [
    "gate-unarmed-positive-energy-takes-the-draw-and-never-fires",
    "noWeapon",
    1,
  ],
  ["gate-unarmed-zero-energy-refuses-at-energy", "energy", 0],
  ["gate-unarmed-range-beyond-32000-refuses-at-range", "range", 1],
  ["gate-unarmed-timer-needs-the-100-second-period", "timer", 0],
  ["gate-fires-beam-float32-heat", null, 1],
  ["gate-fires-military-at-the-weapon-range", null, 1],
];

describe("fire gate fixtures (gate.json)", () => {
  const fixtures = FireGateFileSchema.parse(readJson("gate.json"));
  const byId = (id: string): FireGateFixture => {
    const found = fixtures.find((fixture) => fixture.id === id);
    if (found === undefined) throw new Error(`no gate fixture ${id}`);
    return found;
  };

  it("holds at least twenty fixtures and every one is re-derived from the gate transliteration", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    for (const fixture of fixtures) {
      expect(gateProblems(fixture), fixture.id).toEqual([]);
    }
  });

  it("matches the hand-written intent table (refusal and draw count) for every fixture, and lists no other", () => {
    expect(fixtures.map((fixture) => fixture.id)).toEqual(
      GATE_INTENT.map(([id]) => id),
    );
    for (const [id, refusedAt, drawsUsed] of GATE_INTENT) {
      const fixture = byId(id);
      expect(fixture.expected.refusedAt, id).toBe(refusedAt);
      expect(fixture.expected.drawsUsed, id).toBe(drawsUsed);
      expect(fixture.expected.fired, id).toBe(refusedAt === null);
    }
  });

  it("covers every refusal kind and every forward weapon", () => {
    const refusals = new Set(fixtures.map((f) => f.expected.refusedAt));
    for (const name of FIRE_REFUSALS) {
      expect(refusals.has(name), `no fixture refuses at ${name}`).toBe(true);
    }
    expect(refusals.has(null)).toBe(true);
    const weapons = new Set(fixtures.map((f) => f.weapon));
    for (const name of FIRE_WEAPONS) {
      expect(weapons.has(name), `no fixture for ${name}`).toBe(true);
    }
  });

  it("gives every fixture a unique id with the gate prefix, cited lines and a derivation", () => {
    const ids = new Set<string>();
    for (const fixture of fixtures) {
      expect(fixture.id.startsWith("gate-"), fixture.id).toBe(true);
      expect(ids.has(fixture.id), `duplicate ${fixture.id}`).toBe(false);
      ids.add(fixture.id);
      expect(
        fixture.oolite.some((line) =>
          line.startsWith("src/Core/Entities/ShipEntity.m:"),
        ),
        fixture.id,
      ).toBe(true);
      expect(fixture.derivation.length, fixture.id).toBeGreaterThan(40);
    }
  });

  describe("order and draw count (ShipEntity.m:9935-9993)", () => {
    it("refuses at heat, then energy, then the timer with no draw, and takes exactly one draw once those three pass", () => {
      // A shot that fails everything: heat refuses first, energy second, the
      // timer third; none draws. Relax one check at a time.
      const hopeless = {
        weapon: "EQ_WEAPON_PULSE_LASER",
        draws: [0.5, 0.25],
        input: {
          temperature: CUTOUT_TEMPERATURE,
          energy: 0,
          ticksSinceShot: 0,
          accuracy: 0,
          range: 99999,
          onTarget: false,
        },
      } as const;
      expect(deriveGate(hopeless).refusedAt).toBe("heat");
      expect(
        deriveGate({
          ...hopeless,
          input: { ...hopeless.input, temperature: 0 },
        }).refusedAt,
      ).toBe("energy");
      expect(
        deriveGate({
          ...hopeless,
          input: { ...hopeless.input, temperature: 0, energy: 100 },
        }).refusedAt,
      ).toBe("timer");
      const afterTimer = deriveGate({
        ...hopeless,
        input: {
          ...hopeless.input,
          temperature: 0,
          energy: 100,
          ticksSinceShot: null,
        },
      });
      expect(afterTimer.refusedAt).toBe("roll");
      expect(afterTimer.drawsUsed).toBe(1);
      for (const id of [
        "gate-heat-at-cutout-refuses-before-energy-timer-and-roll",
        "gate-energy-equal-to-cost-refuses-before-timer",
        "gate-timer-refuses-before-roll-range-and-aim",
      ]) {
        expect(byId(id).expected.drawsUsed, id).toBe(0);
      }
    });

    it("takes the one draw whether or not the ship is armed and whether or not it has a target", () => {
      for (const id of [
        "gate-no-target-refuses-after-the-draw",
        "gate-off-target-refuses-after-the-draw-military",
        "gate-unarmed-positive-energy-takes-the-draw-and-never-fires",
        "gate-fires-pulse-clean",
      ]) {
        expect(byId(id).expected.drawsUsed, id).toBe(1);
      }
    });

    it("reads an unarmed ship's gate call against the EQ_WEAPON_NONE object: energy 0, range 32000, recharge 100 s", () => {
      const none = WEAPON_INFO.EQ_WEAPON_NONE;
      expect(none.energy).toBe(0);
      expect(none.range).toBe(32000);
      expect(none.rechargeRate).toBe(100);
      expect(none.shotTemperature).toBe(0);
      // energy > 0 passes the energy test (energy <= 0 is false); energy 0 does not.
      expect(
        byId("gate-unarmed-zero-energy-refuses-at-energy").expected,
      ).toMatchObject({ refusedAt: "energy", drawsUsed: 0 });
      const unarmed = byId(
        "gate-unarmed-positive-energy-takes-the-draw-and-never-fires",
      );
      expect(unarmed.expected).toMatchObject({
        fired: false,
        refusedAt: "noWeapon",
        drawsUsed: 1,
        shotTimerReset: false,
        energyAfter: unarmed.input.energy,
        temperatureAfter: unarmed.input.temperature,
      });
    });
  });

  describe("edge adjacency", () => {
    it("refuses at exactly fround(0.85) x 256 (>=) and passes the next float32 below it", () => {
      expect(COOLING_CUTOUT).toBe(Math.fround(0.85));
      // 0.85f is 0.85000002384..., just above 0.85, so the cutout is just
      // above 217.6 and 217.6 itself (a float64) is below it.
      expect(CUTOUT_TEMPERATURE).toBeCloseTo(217.6, 4);
      expect(CUTOUT_TEMPERATURE).toBeGreaterThan(217.6);
      expect(CUTOUT_TEMPERATURE).toBe(Math.fround(0.85) * 256);
      expect(Math.fround(CUTOUT_TEMPERATURE)).toBe(CUTOUT_TEMPERATURE);
      const atCutout = byId(
        "gate-heat-at-cutout-refuses-before-energy-timer-and-roll",
      );
      expect(atCutout.input.temperature).toBe(CUTOUT_TEMPERATURE);
      const below = byId("gate-heat-one-float32-below-cutout-passes");
      expect(below.input.temperature).toBe(float32Below(CUTOUT_TEMPERATURE));
      expect(below.expected.fired).toBe(true);
    });

    it("refuses at energy exactly equal to the shot cost (<=) and passes just above it", () => {
      const equal = byId("gate-energy-equal-to-cost-refuses-before-timer");
      expect(equal.input.energy).toBe(WEAPON_INFO.EQ_WEAPON_PULSE_LASER.energy);
      expect(equal.expected.refusedAt).toBe("energy");
      const above = byId("gate-energy-just-above-cost-passes");
      expect(above.input.energy).toBeGreaterThan(
        WEAPON_INFO.EQ_WEAPON_PULSE_LASER.energy,
      );
      expect(above.input.energy - 0.8).toBeCloseTo(0.001, 12);
      expect(above.expected.energyAfter).toBeCloseTo(0.001, 6);
    });

    it("fires at exactly round(rate x 120) ticks since the shot (NPC >=), refuses one tick short, and treats null as ready", () => {
      // Hand-computed periods: 0.5 s -> 60, 0.1 s -> 12, 2.5 s -> 300.
      expect(rechargeTicks("EQ_WEAPON_PULSE_LASER")).toBe(60);
      expect(rechargeTicks("EQ_WEAPON_BEAM_LASER")).toBe(12);
      expect(rechargeTicks("EQ_WEAPON_MINING_LASER")).toBe(300);
      expect(rechargeTicks("EQ_WEAPON_MILITARY_LASER")).toBe(12);
      const sinceByWeapon: [string, number | null, boolean][] = [
        ["gate-timer-refuses-before-roll-range-and-aim", 59, false],
        ["gate-timer-exact-period-pulse-fires", 60, true],
        ["gate-timer-one-tick-over-pulse-fires", 61, true],
        ["gate-timer-one-tick-short-beam-refuses", 11, false],
        ["gate-timer-exact-period-beam-fires", 12, true],
        ["gate-timer-one-tick-over-beam-fires", 13, true],
        ["gate-timer-one-tick-short-mining-refuses", 299, false],
        ["gate-timer-exact-period-mining-fires", 300, true],
        ["gate-timer-one-tick-short-military-refuses", 11, false],
        ["gate-timer-never-fired-is-ready-beam", null, true],
      ];
      for (const [id, since, fires] of sinceByWeapon) {
        const fixture = byId(id);
        expect(fixture.input.ticksSinceShot, id).toBe(since);
        expect(fixture.expected.fired, id).toBe(fires);
      }
    });

    it("lets a range equal to the weapon range pass both the roll and the range check, and one double above it refuse at range", () => {
      const equal = byId(
        "gate-range-equal-to-weapon-range-passes-roll-and-range",
      );
      expect(equal.input.range).toBe(12500);
      expect(equal.expected.fired).toBe(true);
      const over = byId(
        "gate-range-one-ulp-above-weapon-range-refuses-at-range",
      );
      expect(over.input.range).toBeGreaterThan(12500);
      expect(over.input.range - 12500).toBeLessThan(1e-11);
      expect(over.expected.refusedAt).toBe("range");
    });

    it("passes the roll when the range equals u x weaponRange x (accuracy + 7.5) and refuses one double above", () => {
      const equal = byId("gate-roll-passes-at-equality");
      // Hand arithmetic: 0.25 x 12500 x (-5 + 7.5) = 7812.5, all exact.
      expect(0.25 * 12500 * (-5 + 7.5)).toBe(7812.5);
      expect(equal.draws[0]).toBe(0.25);
      expect(equal.input.range).toBe(7812.5);
      expect(equal.expected.fired).toBe(true);
      const above = byId("gate-roll-refuses-one-ulp-above-equality");
      expect(above.input.range).toBeGreaterThan(7812.5);
      expect(above.input.range - 7812.5).toBeLessThan(1e-11);
      expect(above.expected.refusedAt).toBe("roll");
    });

    it("takes the accuracy through (accuracy + 7.5): the same draw and range refuse at 0 and pass at 9", () => {
      const narrow = byId("gate-roll-accuracy-0-narrow-circle-refuses");
      const wide = byId("gate-roll-accuracy-9-wide-circle-passes");
      expect(narrow.draws[0]).toBe(wide.draws[0]);
      expect(narrow.input.range).toBe(wide.input.range);
      expect(narrow.input.accuracy).toBe(0);
      expect(wide.input.accuracy).toBe(9);
      expect(0.0625 * 12500 * 7.5).toBe(5859.375);
      expect(0.0625 * 12500 * 16.5).toBe(12890.625);
      expect(narrow.expected.refusedAt).toBe("roll");
      expect(wide.expected.fired).toBe(true);
    });
  });

  describe("fired shots", () => {
    it("costs the weapon's energy and adds its shot temperature in float32", () => {
      const beam = byId("gate-fires-beam-float32-heat");
      // 200 + fround(3.2) = 203.2000000476837 in float64; float32 spacing at
      // 203 is 2^-16 = 1.52e-5, so the float32 sum is 203.1999969482422.
      const exact64 = 200 + Math.fround(3.2);
      expect(exact64).toBeCloseTo(203.2000000476837, 12);
      expect(beam.expected.temperatureAfter).toBeCloseTo(203.19999695, 7);
      expect(Math.fround(beam.expected.temperatureAfter)).toBe(
        beam.expected.temperatureAfter,
      );
      expect(
        Math.abs(beam.expected.temperatureAfter - exact64),
        "the fixture must tell float32 from float64",
      ).toBeGreaterThan(beam.tolerance);
      expect(beam.expected.energyAfter).toBe(49.5);
      const mining = byId("gate-timer-exact-period-mining-fires");
      expect(mining.expected.energyAfter).toBeCloseTo(8.6, 12);
      expect(mining.expected.temperatureAfter).toBe(20.5);
      const military = byId("gate-fires-military-at-the-weapon-range");
      expect(military.expected.energyAfter).toBeCloseTo(3.9, 12);
      expect(military.expected.temperatureAfter).toBe(4.25);
    });

    it("cools by fround(6 x 1/120) per tick (a float32 constant, not 0.05)", () => {
      expect(COOLING_PER_TICK).toBe(Math.fround(6 * (1 / 120)));
      expect(COOLING_PER_TICK).toBe(0.05000000074505806);
      expect(COOLING_PER_TICK).not.toBe(0.05);
    });
  });

  describe("non-vacuity: the schema and the comparison refuse what they must", () => {
    const base = byId("gate-fires-pulse-clean");
    const refused = byId("gate-roll-refuses-draw-too-high");
    const early = byId("gate-timer-refuses-before-roll-range-and-aim");

    const mutate = (
      fixture: FireGateFixture,
      patch: Partial<FireGateFixture["expected"]>,
    ): unknown => ({
      ...fixture,
      expected: { ...fixture.expected, ...patch },
    });

    it("accepts the unmodified fixtures", () => {
      expect(FireGateFixtureSchema.safeParse(base).success).toBe(true);
      expect(FireGateFixtureSchema.safeParse(refused).success).toBe(true);
    });

    it("rejects a fired fixture with a refusal, and a refused fixture with none", () => {
      expect(
        FireGateFixtureSchema.safeParse(mutate(base, { refusedAt: "roll" }))
          .success,
      ).toBe(false);
      expect(
        FireGateFixtureSchema.safeParse(mutate(refused, { refusedAt: null }))
          .success,
      ).toBe(false);
    });

    it("rejects a refusal at heat, energy or timer with a draw, and one at roll, range, onTarget or noWeapon without", () => {
      for (const refusedAt of ["heat", "energy", "timer"] as const) {
        expect(
          FireGateFixtureSchema.safeParse(
            mutate(early, { refusedAt, drawsUsed: 1 }),
          ).success,
          refusedAt,
        ).toBe(false);
      }
      for (const refusedAt of [
        "roll",
        "range",
        "onTarget",
        "noWeapon",
      ] as const) {
        expect(
          FireGateFixtureSchema.safeParse(
            mutate(refused, { refusedAt, drawsUsed: 0 }),
          ).success,
          refusedAt,
        ).toBe(false);
      }
    });

    it("rejects a fired fixture with no draw and a timer reset that disagrees with the shot", () => {
      expect(
        FireGateFixtureSchema.safeParse(mutate(base, { drawsUsed: 0 })).success,
      ).toBe(false);
      expect(
        FireGateFixtureSchema.safeParse(mutate(base, { shotTimerReset: false }))
          .success,
      ).toBe(false);
      expect(
        FireGateFixtureSchema.safeParse(
          mutate(refused, { shotTimerReset: true }),
        ).success,
      ).toBe(false);
    });

    it("rejects a bad citation, an empty derivation, a negative tolerance, a non-float32 temperature and non-distinct draws", () => {
      const parse = (patch: Record<string, unknown>): boolean =>
        FireGateFixtureSchema.safeParse({ ...base, ...patch }).success;
      expect(parse({ oolite: ["src/Core/Entities/ShipEntity.m:9946"] })).toBe(
        false,
      );
      expect(
        parse({ oolite: ["src/Core/Entities/ShipEntity.m:9950-9946"] }),
      ).toBe(false);
      expect(parse({ oolite: ["src/sim/world/step.ts:1-2"] })).toBe(false);
      expect(parse({ oolite: [] })).toBe(false);
      expect(parse({ derivation: "" })).toBe(false);
      expect(parse({ tolerance: -1 })).toBe(false);
      expect(parse({ id: "heat-pulse" })).toBe(false);
      expect(parse({ draws: [0.5, 0.5] })).toBe(false);
      expect(parse({ draws: [0.5] })).toBe(false);
      expect(parse({ draws: [0.5, 1] })).toBe(false);
      expect(parse({ input: { ...base.input, temperature: 0.1 } })).toBe(false);
      expect(parse({ input: { ...base.input, temperature: -1 } })).toBe(false);
      expect(parse({ weapon: "EQ_WEAPON_PLASMA" })).toBe(false);
      expect(parse({ unknownField: 1 })).toBe(false);
    });

    it("rejects duplicate ids in a file", () => {
      expect(FireGateFileSchema.safeParse([base, base]).success).toBe(false);
      expect(FireGateFileSchema.safeParse([base, refused]).success).toBe(true);
    });

    it("lets the comparison see a wrong expectation", () => {
      expect(
        gateProblems({
          ...base,
          expected: { ...base.expected, energyAfter: 99 },
        }),
      ).toContain("energyAfter");
      expect(
        gateProblems({
          ...base,
          expected: { ...base.expected, temperatureAfter: 7.01 },
        }),
      ).toContain("temperatureAfter");
      expect(
        gateProblems({
          ...base,
          expected: {
            ...base.expected,
            fired: false,
            refusedAt: "roll",
            drawsUsed: 1,
            shotTimerReset: false,
          },
        }),
      ).toContain("fired");
      expect(
        gateProblems({
          ...early,
          expected: { ...early.expected, refusedAt: "roll", drawsUsed: 1 },
        }),
      ).toContain("refusedAt");
    });
  });
});

// ---------------------------------------------------------------------------
// onTarget and the aim tolerance (Task 2)

/** The closed form of `currentAimTolerance` in float64 (no scope-cut terms). */
function closedAim(accuracy: number, missedShots: number): number {
  let basic = 240 - 18 * accuracy;
  let best = 0.99999;
  if (accuracy >= 0) {
    best = 0.999999;
    basic /= 1 + missedShots / 4;
  }
  if (accuracy >= 7.5) {
    best = 0.9999999;
    basic /= 5;
  }
  return Math.min(Math.sqrt(1 - (basic * basic) / 1e8), best);
}

/** Re-derives one on-target fixture and lists every field that disagrees. */
function onTargetProblems(fixture: OnTargetFixture): string[] {
  const derived = deriveOnTarget(fixture.input);
  const problems: string[] = [];
  if (derived.onTarget !== fixture.expected.onTarget) {
    problems.push("onTarget");
  }
  if (
    Math.abs(derived.aimTolerance - fixture.expected.aimTolerance) >
    fixture.tolerance
  ) {
    problems.push("aimTolerance");
  }
  return problems;
}

/** Which test of 9863-9909 decides each fixture, written by hand. */
const ON_TARGET_DECIDED_BY: readonly (readonly [
  string,
  ReturnType<typeof traceOnTarget>["decidedBy"],
  boolean,
])[] = [
  ["on-target-no-live-target-reports-the-aim-tolerance", "noTarget", false],
  ["on-target-target-behind-is-no", "behind", false],
  ["on-target-perpendicular-dq-zero-is-no", "astq", false],
  ["on-target-awful-accuracy-minus-5-dead-ahead", "aimCircle", true],
  ["on-target-awful-ignores-missed-shots", "aimCircle", true],
  ["on-target-accuracy-0-missed-0-marginal-pose-is-yes", "aimCircle", true],
  ["on-target-accuracy-0-missed-3-marginal-pose-is-no", "astq", false],
  ["on-target-accuracy-0-missed-31-marginal-pose-is-no", "astq", false],
  ["on-target-accuracy-0-missed-3-closer-pose-is-yes", "aimCircle", true],
  ["on-target-accuracy-0-missed-31-closer-pose-is-no", "astq", false],
  ["on-target-accuracy-5-missed-3-aim-tolerance", "aimCircle", true],
  ["on-target-accuracy-5-missed-31-aim-tolerance", "aimCircle", true],
  ["on-target-accuracy-7-missed-31-clamps-to-best-cos", "aimCircle", true],
  ["on-target-accuracy-7p5-deadly-divides-by-five", "aimCircle", true],
  ["on-target-accuracy-7p5-missed-3-both-divisions", "aimCircle", true],
  ["on-target-accuracy-9-missed-0-deadly-aim", "aimCircle", true],
  [
    "on-target-accuracy-9-missed-31-clamps-to-deadly-best-cos",
    "aimCircle",
    true,
  ],
  ["on-target-astq-path-yes-offset-rotated-shooter", "astq", true],
  ["on-target-astq-path-no-offset-rotated-shooter", "astq", false],
  ["on-target-radius-too-large-makes-astq-nan-no", "astq", false],
  ["on-target-zero-relative-position-uses-the-z-basis-yes", "aimCircle", true],
  ["on-target-zero-relative-position-facing-away-is-no", "behind", false],
  ["on-target-equality-dq-equals-astq-both-widths", "astq", true],
];

describe("on-target fixtures (on-target.json)", () => {
  const fixtures = OnTargetFileSchema.parse(readJson("on-target.json"));
  const byId = (id: string): OnTargetFixture => {
    const found = fixtures.find((fixture) => fixture.id === id);
    if (found === undefined) throw new Error(`no on-target fixture ${id}`);
    return found;
  };

  it("holds at least fourteen fixtures, all re-derived from the onTarget transliteration", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(14);
    for (const fixture of fixtures) {
      expect(onTargetProblems(fixture), fixture.id).toEqual([]);
      expect(fixture.id.startsWith("on-target-"), fixture.id).toBe(true);
    }
  });

  it("matches the hand-written table of which test decides each fixture, and lists no other", () => {
    expect(fixtures.map((fixture) => fixture.id)).toEqual(
      ON_TARGET_DECIDED_BY.map(([id]) => id),
    );
    for (const [id, decidedBy, onTarget] of ON_TARGET_DECIDED_BY) {
      const trace = traceOnTarget(byId(id).input);
      expect(trace.decidedBy, id).toBe(decidedBy);
      expect(trace.onTarget, id).toBe(onTarget);
      expect(byId(id).expected.onTarget, id).toBe(onTarget);
    }
  });

  it("gives the same answer in float64 as in float32 for every fixture (none sits on a rounding edge)", () => {
    for (const fixture of fixtures) {
      const wide = deriveOnTarget(fixture.input, "f64");
      expect(wide.onTarget, fixture.id).toBe(fixture.expected.onTarget);
      expect(
        Math.abs(wide.aimTolerance - fixture.expected.aimTolerance),
        fixture.id,
      ).toBeLessThanOrEqual(fixture.tolerance);
    }
  });

  describe("currentAimTolerance (ShipEntity.m:9761-9810) with the live missedShots term (D-15)", () => {
    it("agrees with the float64 closed form for every fixture", () => {
      for (const fixture of fixtures) {
        expect(
          Math.abs(
            closedAim(fixture.input.accuracy, fixture.input.missedShots) -
              fixture.expected.aimTolerance,
          ),
          fixture.id,
        ).toBeLessThanOrEqual(fixture.tolerance);
      }
    });

    it("pins hand-computed values: sqrt(1 - basic^2 / 1e8) with the divisors written out", () => {
      const cases: [number, number, number][] = [
        // accuracy, missedShots, expected: basic_aim = 240 - 18 accuracy
        // divided by (1 + missed / 4) when accuracy >= 0 and by 5 when >= 7.5.
        [-5, 0, Math.sqrt(1 - (330 * 330) / 1e8)],
        [-5, 31, Math.sqrt(1 - (330 * 330) / 1e8)],
        [0, 0, Math.sqrt(1 - (240 * 240) / 1e8)],
        [0, 3, Math.sqrt(1 - (240 / 1.75) ** 2 / 1e8)],
        [0, 31, Math.sqrt(1 - (240 / 8.75) ** 2 / 1e8)],
        [5, 3, Math.sqrt(1 - (150 / 1.75) ** 2 / 1e8)],
        [5, 31, Math.sqrt(1 - (150 / 8.75) ** 2 / 1e8)],
        [7, 31, 0.999999],
        [7.5, 0, Math.sqrt(1 - (105 / 5) ** 2 / 1e8)],
        [7.5, 3, Math.sqrt(1 - (105 / 1.75 / 5) ** 2 / 1e8)],
        [9, 0, Math.sqrt(1 - (78 / 5) ** 2 / 1e8)],
        [9, 31, 0.9999999],
      ];
      for (const [accuracy, missedShots, expected] of cases) {
        expect(
          deriveAimTolerance(accuracy, missedShots, "f64"),
          `${accuracy}/${missedShots}`,
        ).toBeCloseTo(expected, 12);
        expect(
          Math.abs(deriveAimTolerance(accuracy, missedShots) - expected),
          `${accuracy}/${missedShots} float32`,
        ).toBeLessThan(1e-7);
      }
    });

    it("moves the cosine toward 1 as missedShots grows, for accuracy >= 0 only", () => {
      for (const accuracy of [0, 5, 7.5, 9]) {
        const m0 = deriveAimTolerance(accuracy, 0, "f64");
        const m3 = deriveAimTolerance(accuracy, 3, "f64");
        const m31 = deriveAimTolerance(accuracy, 31, "f64");
        expect(m3, `accuracy ${accuracy}`).toBeGreaterThanOrEqual(m0);
        expect(m31, `accuracy ${accuracy}`).toBeGreaterThanOrEqual(m3);
      }
      expect(deriveAimTolerance(-5, 31, "f64")).toBe(
        deriveAimTolerance(-5, 0, "f64"),
      );
      expect(deriveAimTolerance(-0.5, 31, "f64")).toBe(
        deriveAimTolerance(-0.5, 0, "f64"),
      );
    });

    it("lets missedShots alone flip the answer for one pose (the term goes live this phase)", () => {
      expect(
        byId("on-target-accuracy-0-missed-0-marginal-pose-is-yes").input,
      ).toMatchObject({ aimPoint: [245, 0, 10000], missedShots: 0 });
      expect(
        byId("on-target-accuracy-0-missed-3-marginal-pose-is-no").input,
      ).toMatchObject({ aimPoint: [245, 0, 10000], missedShots: 3 });
      expect(
        byId("on-target-accuracy-0-missed-3-closer-pose-is-yes").expected
          .onTarget,
      ).toBe(true);
      expect(
        byId("on-target-accuracy-0-missed-31-closer-pose-is-no").expected
          .onTarget,
      ).toBe(false);
      // The poses: dq = z / hypot(x, z) by hand.
      expect(10000 / Math.hypot(245, 10000)).toBeCloseTo(0.9997, 5);
      expect(10000 / Math.hypot(100, 10000)).toBeCloseTo(0.99995, 6);
    });
  });

  describe("onTarget geometry (ShipEntity.m:9863-9909)", () => {
    it("answers NO for no live target, dq < 0 and a negative or zero-dq pose outside the cone", () => {
      expect(
        byId("on-target-no-live-target-reports-the-aim-tolerance").expected
          .onTarget,
      ).toBe(false);
      expect(byId("on-target-target-behind-is-no").expected.onTarget).toBe(
        false,
      );
      expect(
        traceOnTarget(byId("on-target-perpendicular-dq-zero-is-no").input).dq,
      ).toBe(0);
    });

    it("answers YES inside the aim circle (dq > aim x aim) and decides by astq outside it", () => {
      const inside = traceOnTarget(
        byId("on-target-awful-accuracy-minus-5-dead-ahead").input,
      );
      expect(inside.dq).toBe(1);
      expect(inside.dq).toBeGreaterThan(inside.aimSquared);
      const yes = traceOnTarget(
        byId("on-target-astq-path-yes-offset-rotated-shooter").input,
      );
      expect(yes.dq).toBeLessThan(yes.aimSquared);
      expect(yes.dq).toBeGreaterThanOrEqual(yes.astq);
      // By hand: d2 = 1000^2 + 45^2, dq = 1000 / sqrt(d2), r = 200.
      expect(yes.dq).toBeCloseTo(1000 / Math.hypot(1000, 45), 6);
      expect(yes.astq).toBeCloseTo(
        Math.sqrt(1 - 200 ** 2 / (9 * (1000 ** 2 + 45 ** 2))),
        6,
      );
      const no = traceOnTarget(
        byId("on-target-astq-path-no-offset-rotated-shooter").input,
      );
      expect(no.dq).toBeLessThan(no.astq);
    });

    it("makes astq NaN when radius^2 > 9 d2 and answers NO", () => {
      const trace = traceOnTarget(
        byId("on-target-radius-too-large-makes-astq-nan-no").input,
      );
      expect(Number.isNaN(trace.astq)).toBe(true);
      expect(trace.onTarget).toBe(false);
      // By hand: d2 is 100^2 = 10000, so 9 d2 = 90000 < 400^2 = 160000.
      expect(400 ** 2).toBeGreaterThan(9 * 10000);
    });

    it("uses the +z basis for a zero relative position", () => {
      const ahead = traceOnTarget(
        byId("on-target-zero-relative-position-uses-the-z-basis-yes").input,
      );
      expect(ahead.dq).toBe(1);
      expect(ahead.onTarget).toBe(true);
      const away = traceOnTarget(
        byId("on-target-zero-relative-position-facing-away-is-no").input,
      );
      expect(away.dq).toBe(-1);
      expect(away.onTarget).toBe(false);
    });
  });

  describe("width (review Opus L1): Oolite's dq, d2, radius, aim and astq are GLfloat", () => {
    it("answers YES at |dq| = astq in float32 and in float64, with the two sides exactly equal in each", () => {
      const fixture = byId("on-target-equality-dq-equals-astq-both-widths");
      const narrow = traceOnTarget(fixture.input, "f32");
      const wide = traceOnTarget(fixture.input, "f64");
      expect(narrow.decidedBy).toBe("astq");
      expect(wide.decidedBy).toBe("astq");
      expect(narrow.dq).toBe(narrow.astq);
      expect(wide.dq).toBe(wide.astq);
      expect(narrow.onTarget).toBe(true);
      expect(wide.onTarget).toBe(true);
      // By hand: offset x = radius / 3 puts the pose on the cone, d2 = 1700,
      // dq = 40 / sqrt(1700), astq = sqrt(1600 / 1700).
      expect(wide.dq).toBeCloseTo(40 / Math.sqrt(1700), 12);
      expect(wide.astq).toBeCloseTo(Math.sqrt(1600 / 1700), 12);
    });

    it("records that other exact-equality poses round differently in the two widths", () => {
      const pose = {
        accuracy: 0,
        missedShots: 0,
        position: [0, 0, 0],
        forward: [0, 0, 1],
        targetPresent: true,
        aimPoint: [10, 0, 23],
        targetRadius: 30,
      } as const;
      // The same construction (x = radius / 3) at z = 23: float32 says YES and
      // float64 says NO, so a float64 port differs from Oolite at exact
      // equality there. No fixture demands it; the equality fixture is the
      // width-independent pose.
      expect(deriveOnTarget(pose, "f32").onTarget).toBe(true);
      expect(deriveOnTarget(pose, "f64").onTarget).toBe(false);
    });
  });

  describe("non-vacuity: the schema and the comparison refuse what they must", () => {
    const base = byId("on-target-astq-path-yes-offset-rotated-shooter");
    const parse = (patch: Record<string, unknown>): boolean =>
      OnTargetFixtureSchema.safeParse({ ...base, ...patch }).success;
    const withInput = (patch: Record<string, unknown>): boolean =>
      parse({ input: { ...base.input, ...patch } });

    it("accepts the unmodified fixture and rejects a bad citation, an empty derivation, a negative tolerance and a foreign id", () => {
      expect(parse({})).toBe(true);
      expect(parse({ oolite: ["src/Core/Entities/ShipEntity.m:9910"] })).toBe(
        false,
      );
      expect(parse({ derivation: "" })).toBe(false);
      expect(parse({ tolerance: -1e-7 })).toBe(false);
      expect(parse({ id: "gate-astq" })).toBe(false);
      expect(parse({ unknownField: true })).toBe(false);
    });

    it("rejects a frame that is not unit, not orthogonal or not right-handed", () => {
      expect(withInput({ forward: [0.6, 0, 0.9] })).toBe(false);
      expect(withInput({ forward: [0.8, 0, 0.6], up: [0.6, 0.8, 0] })).toBe(
        false,
      );
      expect(withInput({ right: [-0.8, 0, 0.6] })).toBe(false);
    });

    it("rejects a non-integer or negative missedShots and a non-positive radius", () => {
      expect(withInput({ missedShots: -1 })).toBe(false);
      expect(withInput({ missedShots: 1.5 })).toBe(false);
      expect(withInput({ targetRadius: 0 })).toBe(false);
      expect(withInput({ accuracy: 11 })).toBe(false);
    });

    it("rejects an aim tolerance outside (0, 1) and duplicate ids", () => {
      expect(parse({ expected: { aimTolerance: 1.2, onTarget: true } })).toBe(
        false,
      );
      expect(OnTargetFileSchema.safeParse([base, base]).success).toBe(false);
    });

    it("lets the comparison see a flipped answer and a wrong aim tolerance", () => {
      expect(
        onTargetProblems({
          ...base,
          expected: { ...base.expected, onTarget: false },
        }),
      ).toContain("onTarget");
      expect(
        onTargetProblems({
          ...base,
          expected: { ...base.expected, aimTolerance: 0.9999 },
        }),
      ).toContain("aimTolerance");
      expect(onTargetProblems(base)).toEqual([]);
    });
  });
});

// ---------------------------------------------------------------------------
// float32 heat and cooling trajectories (Task 2)

/** Re-derives one heat fixture and lists every field that disagrees. */
function heatProblems(fixture: WeaponHeatFixture): string[] {
  const run = deriveHeat(fixture);
  const problems: string[] = [];
  const e = fixture.expected;
  if (JSON.stringify(run.shotTicks) !== JSON.stringify(e.shotTicks)) {
    problems.push("shotTicks");
  }
  if (run.firstHeatRefusalTick !== e.firstHeatRefusalTick) {
    problems.push("firstHeatRefusalTick");
  }
  if (run.firstResumeTick !== e.firstResumeTick) {
    problems.push("firstResumeTick");
  }
  if (run.drawsUsed !== e.drawsUsed) problems.push("drawsUsed");
  for (const check of e.temperatureChecks) {
    const read = run.reads[check.tick - 1];
    if (
      read === undefined ||
      Math.abs(read - check.temperature) > fixture.tolerance
    ) {
      problems.push(`temperature@${check.tick}`);
    }
  }
  return problems;
}

/** A float64 run of the same loop, to show the fixtures pin float32. */
function heatReadsFloat64(fixture: WeaponHeatFixture): number[] {
  const info = WEAPON_INFO[fixture.weapon];
  const period = rechargeTicks(fixture.weapon);
  let temperature = fixture.startTemperature;
  let since = fixture.startTicksSinceShot;
  const reads: number[] = [];
  for (let tick = 1; tick <= fixture.horizon; tick += 1) {
    if (tick > 1) {
      temperature = Math.max(temperature - 6 / 120, 0);
      if (since !== null) since += 1;
    }
    reads.push(temperature);
    if (temperature / 256 >= 0.85) continue;
    if (since !== null && since < period) continue;
    temperature += info.shotTemperature;
    since = 0;
  }
  return reads;
}

describe("weapon heat fixtures (heat.json)", () => {
  const fixtures = WeaponHeatFileSchema.parse(readJson("heat.json"));
  const byId = (id: string): WeaponHeatFixture => {
    const found = fixtures.find((fixture) => fixture.id === id);
    if (found === undefined) throw new Error(`no heat fixture ${id}`);
    return found;
  };

  it("re-derives every fixture from the per-tick gate loop", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(5);
    for (const fixture of fixtures) {
      expect(heatProblems(fixture), fixture.id).toEqual([]);
      expect(fixture.id.startsWith("heat-"), fixture.id).toBe(true);
    }
  });

  it("covers every armed laser from 0 and the start-at-cutout case", () => {
    const weapons = new Set(fixtures.map((fixture) => fixture.weapon));
    for (const weapon of FIRE_WEAPONS.filter((w) => w !== "EQ_WEAPON_NONE")) {
      expect(weapons.has(weapon), weapon).toBe(true);
    }
    for (const id of [
      "heat-pulse-from-zero",
      "heat-beam-from-zero",
      "heat-military-from-zero",
      "heat-mining-from-zero",
    ]) {
      expect(byId(id).startTemperature, id).toBe(0);
      expect(byId(id).startTicksSinceShot, id).toBeNull();
      expect(byId(id).expected.shotTicks[0], id).toBe(1);
    }
    const atCutout = byId("heat-beam-start-at-cutout-refuses-then-resumes");
    expect(atCutout.startTemperature).toBe(CUTOUT_TEMPERATURE);
    expect(atCutout.expected.firstHeatRefusalTick).toBe(1);
    expect(atCutout.expected.shotTicks[0]).toBe(
      atCutout.expected.firstResumeTick,
    );
  });

  it("fires every round(rate x 120) ticks while the cutout does not refuse", () => {
    const period: [string, number][] = [
      ["heat-pulse-from-zero", 60],
      ["heat-beam-from-zero", 12],
      ["heat-military-from-zero", 12],
      ["heat-mining-from-zero", 300],
    ];
    for (const [id, ticks] of period) {
      const shots = byId(id).expected.shotTicks;
      const refusal = byId(id).expected.firstHeatRefusalTick;
      const regular = shots.filter(
        (tick) => refusal === null || tick < refusal,
      );
      for (let i = 1; i < regular.length; i += 1) {
        expect(
          (regular[i] as number) - (regular[i - 1] as number),
          `${id} shot ${i}`,
        ).toBe(ticks);
      }
    }
  });

  it("gives drawsUsed equal to the shot count, and a refusal that happens at the cutout", () => {
    for (const fixture of fixtures) {
      expect(fixture.expected.drawsUsed, fixture.id).toBe(
        fixture.expected.shotTicks.length,
      );
      const run = deriveHeat(fixture);
      const refusal = fixture.expected.firstHeatRefusalTick;
      if (refusal === null) continue;
      expect(
        run.reads[refusal - 1] as number,
        fixture.id,
      ).toBeGreaterThanOrEqual(CUTOUT_TEMPERATURE);
      const resume = fixture.expected.firstResumeTick as number;
      expect(run.reads[resume - 1] as number, fixture.id).toBeLessThan(
        CUTOUT_TEMPERATURE,
      );
    }
  });

  describe("hand closed forms (float64): the cooling is per tick, the net heat per period decides the cutout", () => {
    const c = 6 * (1 / 120);
    const closed = (weapon: "pulse" | "beam" | "military"): number => {
      const info = {
        pulse: { st: 7, period: 60 },
        beam: { st: 3.2, period: 12 },
        military: { st: 4.25, period: 12 },
      }[weapon];
      // read before shot j = (j - 1) (st - period c); after it + st; the next
      // tick reads that minus c; the cutout refuses at the first read >= 217.6.
      for (let j = 1; j < 1000; j += 1) {
        const after = (j - 1) * (info.st - info.period * c) + info.st;
        if (after - c >= CUTOUT_TEMPERATURE) {
          return 1 + info.period * (j - 1) + 1;
        }
      }
      throw new Error("no refusal");
    };

    it("predicts the first refusal tick of the pulse, beam and military runs", () => {
      expect(closed("pulse")).toBe(
        byId("heat-pulse-from-zero").expected.firstHeatRefusalTick,
      );
      expect(closed("beam")).toBe(
        byId("heat-beam-from-zero").expected.firstHeatRefusalTick,
      );
      expect(closed("military")).toBe(
        byId("heat-military-from-zero").expected.firstHeatRefusalTick,
      );
    });

    it("shows the mining laser never heats: it cools 15 degrees per period and gains 10", () => {
      expect(300 * c - 10).toBeGreaterThan(4.9);
      const mining = byId("heat-mining-from-zero");
      expect(mining.expected.firstHeatRefusalTick).toBeNull();
      expect(mining.expected.firstResumeTick).toBeNull();
      expect(mining.expected.shotTicks).toEqual([1, 301, 601, 901]);
      for (const check of mining.expected.temperatureChecks) {
        if (check.tick === 301 || check.tick === 601 || check.tick === 901) {
          expect(check.temperature).toBe(0);
        }
      }
    });

    it("matches the cooling arithmetic at the first periods", () => {
      const at = (id: string, tick: number): number => {
        const found = byId(id).expected.temperatureChecks.find(
          (check) => check.tick === tick,
        );
        if (found === undefined)
          throw new Error(`${id} has no check at ${tick}`);
        return found.temperature;
      };
      expect(at("heat-pulse-from-zero", 61)).toBeCloseTo(7 - 60 * c, 4);
      expect(at("heat-beam-from-zero", 13)).toBeCloseTo(3.2 - 12 * c, 4);
      expect(at("heat-military-from-zero", 13)).toBeCloseTo(4.25 - 12 * c, 4);
      expect(at("heat-mining-from-zero", 2)).toBeCloseTo(10 - c, 5);
    });
  });

  describe("float32: the fixtures tell a float32 run from a float64 one", () => {
    it("differs from a float64 simulation by far more than the fixture tolerance at the refusal tick", () => {
      for (const id of ["heat-pulse-from-zero", "heat-beam-from-zero"]) {
        const fixture = byId(id);
        const refusal = fixture.expected.firstHeatRefusalTick as number;
        const wide = heatReadsFloat64(fixture)[refusal - 1] as number;
        const narrow = fixture.expected.temperatureChecks.find(
          (check) => check.tick === refusal,
        )?.temperature as number;
        expect(Math.abs(wide - narrow), id).toBeGreaterThan(
          1e4 * fixture.tolerance,
        );
      }
    });

    it("cools by the float32 constant fround(6 x 1/120), which is not 0.05", () => {
      const fixture = byId("heat-beam-start-at-cutout-refuses-then-resumes");
      const second = fixture.expected.temperatureChecks.find(
        (check) => check.tick === 2,
      )?.temperature as number;
      expect(second).toBe(Math.fround(CUTOUT_TEMPERATURE - COOLING_PER_TICK));
      expect(Math.fround(second)).toBe(second);
    });

    it("starts a cutout run with no draw at tick 1 and resumes on the first cooled tick (timer ready), or when the timer opens", () => {
      const ready = byId("heat-mining-start-at-cutout-refuses-then-resumes");
      expect(ready.expected.firstHeatRefusalTick).toBe(1);
      expect(ready.expected.firstResumeTick).toBe(2);
      expect(ready.expected.drawsUsed).toBe(1);
      const waiting = byId(
        "heat-pulse-at-cutout-with-running-timer-resumes-when-the-timer-opens",
      );
      // 30 ticks since the shot at tick 1 and 60 needed: tick 31 is the first
      // tick the count reaches 60, by hand.
      expect(1 + (60 - 30)).toBe(waiting.expected.firstResumeTick);
    });
  });

  describe("non-vacuity: the schema and the comparison refuse what they must", () => {
    const base = byId("heat-beam-start-at-cutout-refuses-then-resumes");
    const parse = (patch: Record<string, unknown>): boolean =>
      WeaponHeatFixtureSchema.safeParse({ ...base, ...patch }).success;
    const withExpected = (patch: Record<string, unknown>): boolean =>
      parse({ expected: { ...base.expected, ...patch } });

    it("accepts the unmodified fixture", () => {
      expect(parse({})).toBe(true);
    });

    it("rejects the unarmed weapon, a non-float32 start, a horizon above 20000 and a foreign id", () => {
      expect(parse({ weapon: "EQ_WEAPON_NONE" })).toBe(false);
      expect(parse({ startTemperature: 217.6 })).toBe(false);
      expect(parse({ horizon: 20001 })).toBe(false);
      expect(parse({ horizon: 0 })).toBe(false);
      expect(parse({ id: "gate-beam" })).toBe(false);
      expect(parse({ tolerance: -1 })).toBe(false);
    });

    it("rejects unordered shot ticks, ticks beyond the horizon, and draws that do not equal the shots", () => {
      expect(withExpected({ shotTicks: [3, 2], drawsUsed: 2 })).toBe(false);
      expect(withExpected({ shotTicks: [2, 2], drawsUsed: 2 })).toBe(false);
      expect(withExpected({ shotTicks: [41], drawsUsed: 1 })).toBe(false);
      expect(withExpected({ drawsUsed: 5 })).toBe(false);
    });

    it("rejects checks beyond the horizon, unordered checks, no checks and a non-float32 check", () => {
      expect(
        withExpected({ temperatureChecks: [{ tick: 41, temperature: 1 }] }),
      ).toBe(false);
      expect(
        withExpected({
          temperatureChecks: [
            { tick: 2, temperature: 1 },
            { tick: 1, temperature: 1 },
          ],
        }),
      ).toBe(false);
      expect(withExpected({ temperatureChecks: [] })).toBe(false);
      expect(
        withExpected({ temperatureChecks: [{ tick: 1, temperature: 0.1 }] }),
      ).toBe(false);
    });

    it("rejects a resume without a refusal, a resume at or before the refusal, and a resume that is not a shot", () => {
      expect(withExpected({ firstHeatRefusalTick: null })).toBe(false);
      expect(withExpected({ firstResumeTick: 1 })).toBe(false);
      expect(withExpected({ firstResumeTick: 3 })).toBe(false);
    });

    it("rejects duplicate ids in a file", () => {
      expect(WeaponHeatFileSchema.safeParse([base, base]).success).toBe(false);
    });

    it("lets the comparison see a wrong refusal tick, a wrong shot list and a wrong temperature", () => {
      expect(
        heatProblems({
          ...base,
          expected: { ...base.expected, firstHeatRefusalTick: 2 },
        }),
      ).toContain("firstHeatRefusalTick");
      expect(
        heatProblems({
          ...base,
          expected: { ...base.expected, shotTicks: [3], drawsUsed: 1 },
        }),
      ).toContain("shotTicks");
      expect(
        heatProblems({
          ...base,
          expected: {
            ...base.expected,
            temperatureChecks: [{ tick: 2, temperature: 217.5 }],
          },
        }),
      ).toContain("temperature@2");
      expect(heatProblems(base)).toEqual([]);
    });
  });
});

// The gate fixtures and the heat loop agree: the loop is the gate called once
// per tick, so a one-tick gate fixture and a heat run give the same shot.
describe("the heat loop is the gate", () => {
  it("fires at tick 1 from cold exactly as a clean gate call does", () => {
    const clean = deriveGate({
      weapon: "EQ_WEAPON_BEAM_LASER",
      input: {
        temperature: 0,
        energy: 1e9,
        ticksSinceShot: null,
        accuracy: 0,
        range: 0,
        onTarget: true,
      },
      draws: [0.5, 0.25],
    });
    expect(clean.fired).toBe(true);
    const run = deriveHeat({
      weapon: "EQ_WEAPON_BEAM_LASER",
      startTemperature: 0,
      startTicksSinceShot: null,
      horizon: 1,
    });
    expect(run.shotTicks).toEqual([1]);
    expect(run.drawsUsed).toBe(clean.drawsUsed);
  });
});

// ---------------------------------------------------------------------------
// the frame-rate rows for cooling, the shot timer and the roll (Task 3)

/** Sum of `steps` successive double additions of 1/120 (`shot_time += delta_t`). */
function shotTimeAfter(steps: number): number {
  let shotTime = 0;
  for (let i = 0; i < steps; i += 1) shotTime += 1 / 120;
  return shotTime;
}

const RULE_FILE = `${fileURLToPath(new URL("../", import.meta.url))}frame-rate-rule.json`;

/** The rows the rule file held before plan 17-01 appended three. */
const ROWS_BEFORE_PLAN_17_01 = 45;

describe("the fire rows of the frame-rate rule (frame-rate-rule.json)", () => {
  const rule = FrameRateRuleSchema.parse(
    JSON.parse(readFileSync(RULE_FILE, "utf8")),
  );
  const fireIds = new Set<string>();
  for (const name of ["gate.json", "on-target.json", "heat.json"]) {
    for (const entry of readJson(name) as { id: string }[]) {
      fireIds.add(entry.id);
    }
  }
  const rowAt = (line: string) => {
    const found = rule.rows.find((row) => row.oolite.endsWith(line));
    if (found === undefined) throw new Error(`no frame-rate row for ${line}`);
    return found;
  };

  it("appends exactly three rows after the existing ones and leaves the tolerance alone", () => {
    expect(rule.rows).toHaveLength(ROWS_BEFORE_PLAN_17_01 + 3);
    expect(rule.crossDtTolerance).toBe(0.01);
    const appended = rule.rows.slice(ROWS_BEFORE_PLAN_17_01);
    expect(appended.map((row) => row.oolite)).toEqual([
      "src/Core/Entities/ShipEntity.m:2214-2218",
      "src/Core/Entities/ShipEntity.m:9946-9946",
      "src/Core/Entities/ShipEntity.m:9949-9949",
    ]);
    expect(appended.map((row) => row.kind)).toEqual([
      "rate-times-dt",
      "time-compare",
      "draw",
    ]);
    for (const row of rule.rows.slice(0, ROWS_BEFORE_PLAN_17_01)) {
      expect(
        row.confirmedBy.some((id) => fireIds.has(id)),
        row.site,
      ).toBe(false);
    }
  });

  it("confirms each new row by fire fixtures that exist", () => {
    for (const line of [":2214-2218", ":9946-9946", ":9949-9949"]) {
      const row = rowAt(line);
      expect(row.confirmedBy.length, row.site).toBeGreaterThan(0);
      for (const id of row.confirmedBy) {
        expect(fireIds.has(id), `${row.site} cites unknown ${id}`).toBe(true);
      }
    }
    expect(
      rowAt(":2214-2218").confirmedBy.every((id) => id.startsWith("heat-")),
    ).toBe(true);
    expect(
      rowAt(":9949-9949").confirmedBy.every((id) => id.startsWith("gate-")),
    ).toBe(true);
  });

  describe("the shot timer: the rule's whole ticks against Oolite's literal frame count at 1/120 s", () => {
    // The literal counts below are derived from the source alone (plan 17-01
    // Task 3), before anyone else's numbers were read. After a shot,
    // resetShotTime sets the double shot_time to 0 (ShipEntity.m:10080-10083,
    // 10463), every update adds the double delta_t = 1/120 once before the
    // behaviours (2221) and the gate refuses while shot_time < the float32
    // recharge_rate (9946-9947). The first frame that is not refused is the
    // smallest k whose k-fold sum of 1/120 is not below the rate:
    //
    //  pulse    rate 0.5                  (exact):  sum of 59 steps 0.4916666666666674
    //           < 0.5, sum of 60 steps 0.5000000000000007 >= 0.5 -> literal 60.
    //  beam     rate fround(0.1) = 0.10000000149011612: sum of 12 steps
    //           0.09999999999999999 < rate (the rate is 1.49e-9 above 0.1 and
    //           the sum is 1e-17 below it), 13 steps 0.10833333333333332 -> 13.
    //  mining   rate 2.5 (exact): sum of 300 steps 2.499999999999994 < 2.5,
    //           301 steps 2.508333333333327 -> literal 301.
    //  military rate fround(0.1), as the beam                           -> 13.
    //
    // The rule gives round(rate x 120): 60, 12, 300, 12.
    const LITERAL: Record<
      | "EQ_WEAPON_PULSE_LASER"
      | "EQ_WEAPON_BEAM_LASER"
      | "EQ_WEAPON_MINING_LASER"
      | "EQ_WEAPON_MILITARY_LASER",
      { name: string; rule: number; literal: number }
    > = {
      EQ_WEAPON_PULSE_LASER: { name: "pulse", rule: 60, literal: 60 },
      EQ_WEAPON_BEAM_LASER: { name: "beam", rule: 12, literal: 13 },
      EQ_WEAPON_MINING_LASER: { name: "mining", rule: 300, literal: 301 },
      EQ_WEAPON_MILITARY_LASER: { name: "military", rule: 12, literal: 13 },
    };
    const weapons = Object.keys(LITERAL) as (keyof typeof LITERAL)[];

    it("derives the literal frame counts 60, 13, 301 and 13 against the rule's 60, 12, 300 and 12", () => {
      for (const weapon of weapons) {
        const expected = LITERAL[weapon];
        expect(
          literalShotFrames(rechargeRateF32(weapon)),
          `${expected.name} literal`,
        ).toBe(expected.literal);
        expect(rechargeTicks(weapon), `${expected.name} rule`).toBe(
          expected.rule,
        );
      }
    });

    it("shows the sums that decide each literal count", () => {
      expect(shotTimeAfter(59)).toBeLessThan(0.5);
      expect(shotTimeAfter(60)).toBeGreaterThanOrEqual(0.5);
      expect(shotTimeAfter(60)).toBeCloseTo(0.5, 12);
      const tenth = Math.fround(0.1);
      expect(tenth).toBeGreaterThan(0.1);
      expect(shotTimeAfter(12)).toBeLessThan(tenth);
      expect(shotTimeAfter(13)).toBeGreaterThanOrEqual(tenth);
      expect(shotTimeAfter(300)).toBeLessThan(2.5);
      expect(shotTimeAfter(301)).toBeGreaterThanOrEqual(2.5);
    });

    it("records the rule, the literal counts per laser and the largest difference in the shot-timer row", () => {
      const row = rowAt(":9946-9946");
      expect(row.kind).toBe("time-compare");
      expect(row.treatment).toContain("DIVERGENCE");
      expect(row.treatment).toContain("D-07");
      let largest = 0;
      for (const weapon of weapons) {
        const { name, rule, literal } = LITERAL[weapon];
        expect(row.treatment, `${name} literal`).toContain(
          `${name} ${literal} (`,
        );
        expect(row.treatment, `${name} rule`).toContain(
          `the rule gives ${rule})`,
        );
        largest = Math.max(largest, Math.abs(literal - rule));
      }
      expect(largest).toBe(1);
      expect(row.measuredDifference).toBe(largest);
    });

    it("keeps the fixtures on the rule: the exact period fires and one tick short refuses", () => {
      const gate = FireGateFileSchema.parse(readJson("gate.json"));
      const periods: [string, number][] = [
        ["gate-timer-exact-period-pulse-fires", 60],
        ["gate-timer-exact-period-beam-fires", 12],
        ["gate-timer-exact-period-mining-fires", 300],
      ];
      for (const [id, ticks] of periods) {
        const fixture = gate.find((entry) => entry.id === id);
        expect(fixture?.input.ticksSinceShot, id).toBe(ticks);
        expect(fixture?.expected.fired, id).toBe(true);
      }
    });
  });

  describe("cooling and the roll", () => {
    it("states the cooling as a verbatim rate times dt with the float32 constant", () => {
      const row = rowAt(":2214-2218");
      expect(row.kind).toBe("rate-times-dt");
      expect(row.treatment).toContain("0.05000000074505806");
      expect(Math.fround(6 * (1 / 120))).toBe(0.05000000074505806);
    });

    it("states the roll as one draw per call that passes heat, energy and the timer", () => {
      const row = rowAt(":9949-9949");
      expect(row.kind).toBe("draw");
      expect(row.treatment).toContain("one draw");
    });
  });
});

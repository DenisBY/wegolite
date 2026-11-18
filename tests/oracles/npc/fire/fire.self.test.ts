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
  deriveGate,
  rechargeTicks,
} from "./derive.js";
import {
  FIRE_REFUSALS,
  FIRE_WEAPONS,
  FireGateFileSchema,
  FireGateFixtureSchema,
  type FireGateFixture,
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

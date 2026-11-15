// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Self-test of the NPC oracle (Phase 14, plan 14-01).
 *
 * The oracle must be correct before the port exists, so this file proves it
 * against itself: every fixture parses with the strict contract schema, the
 * reference replays it (in the float32 emulation Oolite runs) within every
 * stated tolerance, no tolerance is tighter than four times the measured
 * float32-versus-float64 difference at its check, no discrete decision or
 * event tick flips between the two widths, and the scripted draws are
 * consumed exactly. Nothing here reads Wegolite code: the expected values in
 * the fixtures come from Oolite's source lines and the reference maths.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  OracleFileSchema,
  OracleFixtureSchema,
  ORACLE_DISCRETE_FIELDS,
  type OracleFixture,
} from "./schema.js";
import {
  F32,
  F64,
  firstTickAbove,
  firstTickAboveFloat64,
  replayWith,
  valueOf,
} from "./reference/flight.js";
import { ALL_BEHAVIOURS } from "./reference/navigate.js";
import {
  forwardFromQuat,
  quatFromBasis,
  rightFromQuat,
  upFromQuat,
  vec,
} from "./reference/vec.js";

/** Every behaviour the reference implements: idle, stop still, tumble and navigation. */
const TABLE = ALL_BEHAVIOURS;

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));
const PURSUIT_DIR = fileURLToPath(
  new URL("./pursuit/fixtures/", import.meta.url),
);

const DISCRETE = new Set<string>(ORACLE_DISCRETE_FIELDS);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}

function fixtureFiles(): string[] {
  return readdirSync(FIXTURE_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

function loadFile(name: string): OracleFixture[] {
  return OracleFileSchema.parse(readJson(`${FIXTURE_DIR}${name}`));
}

function allFixtures(): OracleFixture[] {
  return fixtureFiles().flatMap((name) => loadFile(name));
}

describe("fixture files", () => {
  it("has the five fixture groups of plan 14-01", () => {
    const names = fixtureFiles();
    for (const group of [
      "flight-model",
      "idle",
      "tumble",
      "fly-to-destination",
      "face-destination",
    ]) {
      expect(names).toContain(`${group}.json`);
    }
  });

  for (const name of fixtureFiles()) {
    it(`${name} parses with OracleFileSchema`, () => {
      expect(() =>
        OracleFileSchema.parse(readJson(`${FIXTURE_DIR}${name}`)),
      ).not.toThrow();
    });
  }

  it("keeps fixture ids unique across both oracle trees", () => {
    const ids = allFixtures().map((fixture) => fixture.id);
    expect(new Set(ids).size).toBe(ids.length);
    if (existsSync(PURSUIT_DIR)) {
      for (const name of readdirSync(PURSUIT_DIR).filter((n) =>
        n.endsWith(".json"),
      )) {
        const other = readJson(`${PURSUIT_DIR}${name}`);
        if (!Array.isArray(other)) continue;
        for (const entry of other as unknown[]) {
          const id = (entry as { id?: unknown }).id;
          if (typeof id === "string") expect(ids).not.toContain(id);
        }
      }
    }
  });

  it("cites every fixture to Oolite lines and states scannerRange 25600", () => {
    for (const fixture of allFixtures()) {
      expect(fixture.oolite.length).toBeGreaterThan(0);
      expect(fixture.stats.scannerRange).toBe(25600);
    }
  });
});

describe("the schema is strict", () => {
  const base = (): Record<string, unknown> => {
    const first = allFixtures()[0];
    if (first === undefined) throw new Error("no fixtures");
    return structuredClone(first);
  };

  it("accepts an unmodified fixture", () => {
    expect(OracleFixtureSchema.safeParse(base()).success).toBe(true);
  });

  const mutations: readonly [
    string,
    (fixture: Record<string, unknown>) => void,
  ][] = [
    ["an extra key", (f) => void (f["surprise"] = 1)],
    [
      "a missing scannerRange",
      (f) =>
        void delete (f["stats"] as Record<string, unknown>)["scannerRange"],
    ],
    ["a wrong dt", (f) => void (f["dt"] = 0.01)],
    ["dt 1/60 without a rate- id", (f) => void (f["dt"] = 1 / 60)],
    ["a horizon of zero", (f) => void (f["horizon"] = 0)],
    [
      "a citation outside the pinned tree",
      (f) => void (f["oolite"] = ["src/Wegolite/x.ts:1-2"]),
    ],
    [
      "a citation with a reversed range",
      (f) => void (f["oolite"] = ["src/Core/Entities/ShipEntity.m:9-2"]),
    ],
    [
      "a non-orthogonal frame",
      (f) =>
        void ((f["self"] as Record<string, unknown>)["up"] = [0.1, 0.99, 0]),
    ],
    [
      "a check beyond the horizon",
      (f) =>
        void ((f["checks"] as Record<string, unknown>[])[0]!["tick"] = 99999),
    ],
    [
      "an unknown field",
      (f) =>
        void ((f["checks"] as Record<string, unknown>[])[0]!["field"] =
          "madeUp"),
    ],
    [
      "a discrete field with a tolerance",
      (f) =>
        void (f["checks"] as Record<string, unknown>[]).push({
          tick: 1,
          field: "behaviour",
          expected: "IDLE",
          tolerance: 0.1,
          note: "x",
        }),
    ],
    ["a draw outside [0, 1)", (f) => void (f["draws"] = [1])],
    ["duplicate draws", (f) => void (f["draws"] = [0.25, 0.25])],
    [
      "an unknown event name",
      (f) => void (f["events"] = [{ tick: 1, name: "shipExploded" }]),
    ],
  ];
  for (const [label, mutate] of mutations) {
    it(`rejects ${label}`, () => {
      const fixture = base();
      mutate(fixture);
      expect(OracleFixtureSchema.safeParse(fixture).success).toBe(false);
    });
  }
});

describe("the reference helpers", () => {
  it("derives time-threshold ticks by fround accumulation, not ceil(seconds * 120)", () => {
    expect(firstTickAbove(0.5)).toBe(61);
    expect(firstTickAbove(7.5)).toBe(901);
    expect(firstTickAbove(10.0)).toBe(1201);
    // The same sums in float64 cross one tick earlier: this line only proves
    // that the difference exists; fixtures use the fround helper above.
    expect(firstTickAboveFloat64(0.5)).toBe(60);
    expect(firstTickAboveFloat64(7.5)).toBe(900);
    expect(firstTickAboveFloat64(10.0)).toBe(1200);
  });

  it("round-trips a basis through the quaternion in Oolite's convention", () => {
    const bases: readonly [number, number, number][] = [
      [0, 0, 0],
      [0.3, -0.7, 1.9],
      [Math.PI, 0.1, -2.4],
      [2.9, 2.8, -0.2],
      [-1.2, 3.0, 0.9],
    ];
    for (const [a, b, c] of bases) {
      // An arbitrary rotation built from three axis rotations of the matrix
      // convention the contract states (rows right, up, forward).
      const ca = Math.cos(a),
        sa = Math.sin(a);
      const cb = Math.cos(b),
        sb = Math.sin(b);
      const cc = Math.cos(c),
        sc = Math.sin(c);
      const rotation = [
        [cb * cc, -cb * sc, sb],
        [ca * sc + sa * sb * cc, ca * cc - sa * sb * sc, -sa * cb],
        [sa * sc - ca * sb * cc, sa * cc + ca * sb * sc, ca * cb],
      ] as const;
      const row = (i: 0 | 1 | 2) =>
        vec(rotation[i][0], rotation[i][1], rotation[i][2]);
      const q = quatFromBasis(row(0), row(1), row(2));
      for (const [mode, tolerance] of [
        [F64, 1e-9],
        [F32, 1e-5],
      ] as const) {
        const right = rightFromQuat(mode, q);
        const up = upFromQuat(mode, q);
        const forward = forwardFromQuat(mode, q);
        const pairs = [
          [right, row(0)],
          [up, row(1)],
          [forward, row(2)],
        ] as const;
        for (const [got, want] of pairs) {
          expect(Math.abs(got.x - want.x)).toBeLessThan(tolerance);
          expect(Math.abs(got.y - want.y)).toBeLessThan(tolerance);
          expect(Math.abs(got.z - want.z)).toBeLessThan(tolerance);
        }
      }
    }
  });
});

describe("the reference replays every fixture", () => {
  for (const fixture of allFixtures()) {
    it(`${fixture.id}: every check within its tolerance`, () => {
      const ticks = new Set(fixture.checks.map((check) => check.tick));
      const f32 = replayWith(fixture, F32, TABLE, ticks);
      const f64 = replayWith(fixture, F64, TABLE, ticks);

      for (const check of fixture.checks) {
        const label = `${fixture.id} tick ${check.tick} ${check.field}`;
        const v32 = valueOf(f32, check);
        const v64 = valueOf(f64, check);
        if (typeof check.expected === "string") {
          expect(v32, label).toBe(check.expected);
          expect(v64, `${label} (float64)`).toBe(check.expected);
          continue;
        }
        expect(typeof v32, label).toBe("number");
        expect(typeof v64, label).toBe("number");
        const a = v32 as number;
        const b = v64 as number;
        expect(
          Number.isNaN(a),
          `${label} is not modelled by the reference`,
        ).toBe(false);
        if (DISCRETE.has(check.field)) {
          // A discrete decision must not flip between the two widths.
          expect(check.tolerance, label).toBe(0);
          expect(a, label).toBe(check.expected);
          expect(b, `${label} (float64)`).toBe(check.expected);
          continue;
        }
        expect(
          Math.abs(a - check.expected),
          `${label} float32 replay`,
        ).toBeLessThanOrEqual(check.tolerance);
        // Contract item 6: a tolerance is at least four times the measured
        // float32-versus-float64 difference at this check, plus 1e-9.
        expect(check.tolerance, `${label} tolerance`).toBeGreaterThanOrEqual(
          4 * Math.abs(a - b) + 1e-9 - 1e-15,
        );
      }

      // The port runs in float64: it must meet every check as well.
      for (const check of fixture.checks) {
        if (typeof check.expected !== "number") continue;
        const b = valueOf(f64, check) as number;
        expect(
          Math.abs(b - check.expected),
          `${fixture.id} tick ${check.tick} ${check.field} float64 replay`,
        ).toBeLessThanOrEqual(check.tolerance);
      }

      // Event ticks are exact, in both widths (contract item 8).
      expect(f32.events, `${fixture.id} events`).toEqual(fixture.events);
      expect(f64.events, `${fixture.id} events (float64)`).toEqual(
        fixture.events,
      );
      // The scripted draws are consumed exactly.
      expect(f32.drawsConsumed, `${fixture.id} draws`).toBe(
        fixture.draws.length,
      );
    });
  }
});

describe("the flight-model fixtures the port will be held to", () => {
  const byId = (id: string): OracleFixture => {
    const found = allFixtures().find((fixture) => fixture.id === id);
    if (found === undefined) throw new Error(`fixture ${id} is missing`);
    return found;
  };
  const tickOne = (
    fixture: OracleFixture,
    field: "flightRoll" | "flightPitch",
  ): number => {
    const row = fixture.checks.find((c) => c.tick === 1 && c.field === field);
    if (row === undefined || typeof row.expected !== "number") {
      throw new Error(`${fixture.id} has no tick-1 ${field} check`);
    }
    return row.expected;
  };

  it("doubles the settle rate at accuracy 8 when the stick is 0 (ShipEntity.m:7032-7039)", () => {
    const high = byId("sticks-accuracy-8-stick-zero");
    const low = byId("sticks-accuracy-2-stick-zero");
    expect(high.self.accuracy).toBeGreaterThanOrEqual(7.5);
    expect(low.self.accuracy).toBeLessThan(7.5);
    for (const [field, start, snapAt] of [
      ["flightRoll", "flightRoll", 1 / 60],
      ["flightPitch", "flightPitch", 1 / 30],
    ] as const) {
      expect(high.self[start]).toBe(low.self[start]);
      // Far enough from zero that neither row snaps in its first tick.
      expect(Math.abs(high.self[start])).toBeGreaterThan(4 * snapAt);
      const lowStep = high.self[start] - tickOne(low, field);
      const highStep = high.self[start] - tickOne(high, field);
      expect(highStep / lowStep).toBeCloseTo(2, 6);
    }
  });
});

describe("the navigation fixtures the port will be held to", () => {
  const byId = (id: string): OracleFixture => {
    const found = allFixtures().find((fixture) => fixture.id === id);
    if (found === undefined) throw new Error(`fixture ${id} is missing`);
    return found;
  };

  it("fires the 15 s fly-to frustration events at the fround-accumulated tick and repeats them", () => {
    const fixture = byId("fly-to-frustration-fires");
    const first = firstTickAbove(15);
    expect(first).toBe(1801);
    expect(fixture.events).toEqual([
      { tick: first, name: "shipAIFrustrated" },
      { tick: first + 1, name: "shipAIFrustrated" },
      { tick: first + 2, name: "shipAIFrustrated" },
    ]);
  });

  it("fires the face frustration escape at 15 / maxFlightPitch seconds, fround-accumulated", () => {
    const fixture = byId("face-destination-frustration-escape");
    expect(fixture.stats.maxFlightPitch).toBe(2);
    const tick = firstTickAbove(15 / fixture.stats.maxFlightPitch);
    expect(tick).toBe(901);
    expect(fixture.events).toEqual([{ tick, name: "shipAIFrustrated" }]);
  });

  it("reaches the sign-flip damping branch at 1/120 s in both widths", () => {
    const fixture = byId("face-destination-sign-flip-damping");
    const ticks = new Set([fixture.horizon]);
    for (const mode of [F32, F64]) {
      const result = replayWith(fixture, mode, TABLE, ticks);
      expect(result.counters["damping"], mode.name).toBe(3);
    }
  });

  it("settles every face fixture on the same tick in both widths (no flipped decision)", () => {
    for (const id of [
      "face-destination-already-facing",
      "face-destination-waits-for-zero-pitch",
      "face-destination-turns-from-up-and-right",
      "face-destination-turns-from-behind",
      "face-destination-sign-flip-damping",
    ]) {
      const fixture = byId(id);
      expect(fixture.events, id).toHaveLength(1);
      expect(fixture.events[0]?.name, id).toBe("shipNowFacingDestination");
    }
  });
});

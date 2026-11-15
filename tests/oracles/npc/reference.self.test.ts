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
  FrameRateRuleSchema,
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

// ---------------------------------------------------------------------------
// Plan 14-06: the recorded frame-rate rule and the 1/60 versus 1/120 grid.
// ---------------------------------------------------------------------------

const RULE_PATH = fileURLToPath(
  new URL("./frame-rate-rule.json", import.meta.url),
);

/** Fixture ids of both oracle trees (the pursuit tree is read for ids only). */
function allFixtureIds(): Set<string> {
  const ids = new Set(allFixtures().map((fixture) => fixture.id));
  if (existsSync(PURSUIT_DIR)) {
    for (const name of readdirSync(PURSUIT_DIR).filter((n) =>
      n.endsWith(".json"),
    )) {
      const other = readJson(`${PURSUIT_DIR}${name}`);
      if (!Array.isArray(other)) continue;
      for (const entry of other as unknown[]) {
        const id = (entry as { id?: unknown }).id;
        if (typeof id === "string") ids.add(id);
      }
    }
  }
  return ids;
}

/** The two step sizes of one grid pose, keyed by the pose name. */
function ratePairs(): Map<
  string,
  { dt60: OracleFixture; dt120: OracleFixture }
> {
  const pairs = new Map<
    string,
    { dt60?: OracleFixture; dt120?: OracleFixture }
  >();
  for (const fixture of allFixtures()) {
    const match = /^(rate-.+)-dt(60|120)$/.exec(fixture.id);
    if (match === null) continue;
    const key = match[1] as string;
    const entry = pairs.get(key) ?? {};
    if (match[2] === "60") entry.dt60 = fixture;
    else entry.dt120 = fixture;
    pairs.set(key, entry);
  }
  const complete = new Map<
    string,
    { dt60: OracleFixture; dt120: OracleFixture }
  >();
  for (const [key, entry] of pairs) {
    if (entry.dt60 === undefined || entry.dt120 === undefined) {
      throw new Error(`rate pose ${key} lacks one of its two step sizes`);
    }
    complete.set(key, { dt60: entry.dt60, dt120: entry.dt120 });
  }
  return complete;
}

function checkValue(
  fixture: OracleFixture,
  tick: number,
  field: string,
): number {
  const found = fixture.checks.find(
    (c) => c.tick === tick && c.field === field,
  );
  if (found === undefined || typeof found.expected !== "number") {
    throw new Error(`${fixture.id} has no numeric ${field} check at ${tick}`);
  }
  return found.expected;
}

describe("the recorded frame-rate rule (frame-rate-rule.json)", () => {
  const rule = FrameRateRuleSchema.parse(readJson(RULE_PATH));
  const ids = allFixtureIds();

  it("states the cross-step tolerance 0.01 rad, derived from the dead band at the 0.99999 cap", () => {
    expect(rule.crossDtTolerance).toBe(0.01);
    // The dead band is acos(0.99999); two settled values inside it differ by
    // at most twice that half-angle, which the tolerance covers.
    const band = Math.acos(0.99999);
    expect(band).toBeCloseTo(0.004472, 6);
    expect(2 * band).toBeLessThan(rule.crossDtTolerance);
    // max_cos reaches its cap only for range / desiredRange >= 212.43, so the
    // grid's 250 keeps it there (ShipEntity.m:9486-9491).
    const ratioAtCap = Math.sqrt(0.9025 / (1 - 0.99999 ** 2));
    expect(ratioAtCap).toBeCloseTo(212.43, 1);
    expect(Math.sqrt(1 - 0.9025 / 250 ** 2)).toBeGreaterThanOrEqual(0.99999);
    expect(rule.rule).toContain("crossDtTolerance");
    expect(rule.rule).toContain("212.43");
  });

  it("gives every row a known site once and a confirming fixture in one of the two trees", () => {
    const sites = new Set<string>();
    expect(rule.rows.length).toBeGreaterThan(0);
    for (const row of rule.rows) {
      expect(sites.has(row.site), `duplicate site ${row.site}`).toBe(false);
      sites.add(row.site);
      if (row.kind === "out-of-scope") {
        expect(row.confirmedBy, row.site).toEqual([]);
        continue;
      }
      for (const id of row.confirmedBy) {
        expect(ids.has(id), `${row.site} cites unknown fixture ${id}`).toBe(
          true,
        );
      }
    }
  });

  it("records the tracking-curve sampling gate as a one-tick divergence (ShipEntity.m:5448)", () => {
    const row = rule.rows.find((r) => r.oolite.endsWith(":5444-5449"));
    expect(row?.kind).toBe("time-compare");
    expect(row?.measuredDifference).toBe(1);
    expect(row?.confirmedBy).toContain(
      "intercept-tracking-curve-aim-point-of-crossing-target",
    );
    // The measurement itself: a double sum of 1/120 opens the gate after 60
    // steps from a base of 0 and after 61 from a base of 1000.0.
    const opens = (base: number): number => {
      let now = base;
      for (let k = 1; k < 100; k += 1) {
        now += 1 / 120;
        if (!(base + 1.5 / 3.0 > now)) return k;
      }
      throw new Error("gate never opens");
    };
    expect(opens(0)).toBe(60);
    expect(opens(1000)).toBe(61);
  });

  it("names the fround-derived tick of every accumulator row, never ceil(seconds x 120)", () => {
    const known = new Set(
      [0.5, 3, 7.5, 9.375, 10, 12.5, 15].map((seconds) =>
        firstTickAbove(seconds),
      ),
    );
    expect(known.has(61)).toBe(true);
    expect(known.has(1801)).toBe(true);
    const accumulators = rule.rows.filter((r) => r.kind === "accumulator");
    expect(accumulators.length).toBeGreaterThanOrEqual(8);
    for (const row of accumulators) {
      const stated = [...row.treatment.matchAll(/tick (\d+)/g)].map((m) =>
        Number(m[1]),
      );
      expect(stated.length, `${row.site} names no tick`).toBeGreaterThan(0);
      expect(
        stated.some((tick) => known.has(tick) || tick === 1),
        `${row.site} names no fround-derived tick`,
      ).toBe(true);
    }
  });
});

describe("the rate-rule grid (rate-rule.json)", () => {
  const rule = FrameRateRuleSchema.parse(readJson(RULE_PATH));
  const pairs = ratePairs();

  it("holds at least nine poses at both step sizes", () => {
    expect(pairs.size).toBeGreaterThanOrEqual(9);
    for (const [key, pair] of pairs) {
      expect(pair.dt60.dt, key).toBe(1 / 60);
      expect(pair.dt120.dt, key).toBe(1 / 120);
      expect(pair.dt60.horizon * 2, key).toBe(pair.dt120.horizon);
      // The same pose: only dt, horizon and the sampled ticks differ.
      expect(pair.dt60.self, key).toEqual(pair.dt120.self);
      expect(pair.dt60.stats, key).toEqual(pair.dt120.stats);
      expect(pair.dt60.bodies, key).toEqual(pair.dt120.bodies);
      expect(pair.dt60.self.behaviour, key).toBe("FLY_TO_DESTINATION");
    }
  });

  it("keeps range / desiredRange at or above 250 on every tick of the compare window", () => {
    for (const fixture of allFixtures().filter((f) =>
      f.id.startsWith("rate-"),
    )) {
      const ticks = new Set<number>();
      for (let tick = 0; tick <= fixture.horizon; tick += 1) ticks.add(tick);
      for (const mode of [F32, F64]) {
        const result = replayWith(fixture, mode, TABLE, ticks);
        for (const tick of ticks) {
          const range = valueOf(result, {
            tick,
            field: "rangeToDestination",
          }) as number;
          expect(
            range / fixture.self.desiredRange,
            `${fixture.id} tick ${tick}`,
          ).toBeGreaterThanOrEqual(250);
        }
        expect(result.events, `${fixture.id} posts no event`).toEqual([]);
      }
    }
  });

  it("agrees across step sizes within crossDtTolerance, or has a divergence row with the measured difference", () => {
    for (const [key, pair] of pairs) {
      const a = checkValue(
        pair.dt60,
        pair.dt60.horizon,
        "headingErrorDestination",
      );
      const b = checkValue(
        pair.dt120,
        pair.dt120.horizon,
        "headingErrorDestination",
      );
      const difference = Math.abs(a - b);
      if (difference <= rule.crossDtTolerance) continue;
      const row = rule.rows.find(
        (r) =>
          r.measuredDifference !== undefined &&
          r.confirmedBy.includes(pair.dt60.id) &&
          r.confirmedBy.includes(pair.dt120.id),
      );
      expect(
        row,
        `${key} differs by ${difference} with no divergence row`,
      ).toBeDefined();
      expect(
        Math.abs((row?.measuredDifference ?? 0) - difference),
        key,
      ).toBeLessThan(1e-6);
    }
  });

  it("settles the same simulated time at 2x the ticks, and ramps the rates at rate per second", () => {
    for (const [key, pair] of pairs) {
      const sixty = (pair.dt60.horizon * pair.dt60.dt).toFixed(9);
      const hundredTwenty = (pair.dt120.horizon * pair.dt120.dt).toFixed(9);
      expect(sixty, key).toBe(hundredTwenty);
      for (const [stick, flight, rate] of [
        ["stickRoll", "flightRoll", 2],
        ["stickPitch", "flightPitch", 4],
      ] as const) {
        const s60 = checkValue(pair.dt60, 1, stick);
        const s120 = checkValue(pair.dt120, 1, stick);
        const f60 = checkValue(pair.dt60, 1, flight);
        const f120 = checkValue(pair.dt120, 1, flight);
        // An unsnapped first step is rate x dt: twice as large at 1/60.
        if (
          Math.abs(s60) > rate * (1 / 60) &&
          Math.abs(s120) > rate * (1 / 60)
        ) {
          expect(f60 / f120, `${key} ${flight}`).toBeCloseTo(2, 6);
        }
      }
    }
  });

  it("keeps the first-update sticks equal across step sizes except in the one limiter pose", () => {
    const limiterKey = "rate-limiter";
    for (const [key, pair] of pairs) {
      for (const stick of ["stickRoll", "stickPitch"] as const) {
        const s60 = checkValue(pair.dt60, 1, stick);
        const s120 = checkValue(pair.dt120, 1, stick);
        if (key === limiterKey && stick === "stickRoll") {
          // ShipEntity.m:9533-9534: |d_right| 0.005 < 0.35 / 60 binds at 1/60
          // only, so the stick is -0.005 * 60 = -0.3 against -0.35.
          expect(s60).toBeCloseTo(-0.3, 9);
          expect(s120).toBeCloseTo(-0.35, 9);
        } else {
          expect(s60, `${key} ${stick}`).toBeCloseTo(s120, 9);
        }
      }
    }
    expect(pairs.has(limiterKey)).toBe(true);
    const row = rule.rows.find((r) =>
      r.confirmedBy.includes("rate-limiter-dt60"),
    );
    expect(row?.kind).toBe("dt-limiter");
  });
});

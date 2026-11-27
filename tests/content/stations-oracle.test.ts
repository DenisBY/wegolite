// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The compiled main stations against the numbers measured in the reference
 * Oolite container (Phase 22.1 plan 01, WORLD-20).
 *
 * `tests/fixtures/oolite-reference/stations.json` holds the numbers read from a
 * real Oolite 1.93.1-255 (`tools/oolite-reference/README.md`, section "Station
 * measurement (Phase 22.1)"). Every measured number is the string `String(value)`
 * exactly as the probe logged it, so a float32 keeps its bits and no JSON round
 * trip rounds it. This file applies the mismatch rule MS-2 of quick task
 * 261117-jji: EQUAL is the same string, ROUNDING a relative difference of at most
 * 1e-6, anything else DIFFERS. A DIFFERS is never a pass: it stops the work and is
 * investigated (decision O1, PROJECT.md row "Each system's main station is its
 * own Oolite type").
 *
 * `ORACLE_KINDS` are the stations the content build compiles today. The two
 * kinds in `PENDING_KINDS` are measured but not compiled yet; while they are
 * pending this test asserts that `ships-client.json` has NO entry for them, so
 * plan 22.1-02 (which compiles them) fails here on the first consumer and has to
 * move each kind into `ORACLE_KINDS`, which turns the comparison on.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** Stations the content build compiles: the comparison is on. */
const ORACLE_KINDS: readonly string[] = ["coriolis-station"];

/** Stations measured but not compiled yet (plan 22.1-02 compiles them). */
const PENDING_KINDS: readonly string[] = [];

type Verdict = "EQUAL" | "ROUNDING" | "DIFFERS";

/**
 * MS-2 of quick task 261117-jji. `measured` is the string the probe logged,
 * `compiled` the number the build emitted: EQUAL when `String(compiled)` is the
 * logged string, ROUNDING when the relative difference is at most 1e-6.
 */
function compareMeasured(measured: string, compiled: number): Verdict {
  if (String(compiled) === measured) return "EQUAL";
  const m = Number(measured);
  if (!Number.isFinite(m) || !Number.isFinite(compiled)) return "DIFFERS";
  const scale = Math.max(Math.abs(m), Math.abs(compiled));
  if (scale === 0) return "EQUAL";
  return Math.abs(m - compiled) / scale <= 1e-6 ? "ROUNDING" : "DIFFERS";
}

interface FixtureSubEntity {
  dataKey: string;
  isDock: boolean;
  mass: string;
  collisionRadius: string;
  position: string[];
  boundingBox: string[];
}

interface FixtureStation {
  dataKey: string;
  name: string;
  mass: string;
  collisionRadius: string;
  boundingBox: string[];
  stationRoll: string;
  dock: { dataKey: string; position: string[]; boundingBox: string[] };
  subEntities: FixtureSubEntity[];
  tunnel: {
    authored: boolean;
    corners: string;
    startAngle: string;
    aspectRatio: string;
  };
  blockage?: {
    radius: string;
    inner: string;
    outer: string;
    blockedInner: boolean;
    blockedOuter: boolean;
  };
}

interface Fixture {
  source: Record<string, string>;
  stations: Record<string, FixtureStation>;
  systems: unknown[];
}

interface ClientShip {
  key: string;
  mass: number;
  collisionRadius: number;
  shipDef: { stationRoll: number };
}

interface DockPort {
  port: { width: number; height: number; depth: number };
}

function readJson<T>(relative: string): T {
  return JSON.parse(
    readFileSync(new URL(relative, import.meta.url), "utf8"),
  ) as T;
}

const fixture = readJson<Fixture>("../fixtures/oolite-reference/stations.json");
const clientShips = readJson<ClientShip[]>(
  "../../src/content/generated/ships-client.json",
);
const dockPort = readJson<DockPort>(
  "../../src/content/generated/dock-port.json",
);

function station(key: string): FixtureStation {
  const entry = fixture.stations[key];
  if (entry === undefined) throw new Error(`fixture has no station ${key}`);
  return entry;
}

function compiled(key: string): ClientShip {
  const entry = clientShips.find((ship) => ship.key === key);
  if (entry === undefined) throw new Error(`ships-client.json has no ${key}`);
  return entry;
}

/** A DIFFERS fails with the way out the plan recorded (O1). */
function expectNotDiffers(
  what: string,
  measured: string,
  compiledValue: number,
): void {
  const verdict = compareMeasured(measured, compiledValue);
  expect(
    verdict,
    `${what}: measured ${measured}, compiled ${compiledValue} is DIFFERS. ` +
      "Decision O1 (plan 22.1-01): stop and investigate the build tool, never " +
      "hand-type the value.",
  ).not.toBe("DIFFERS");
}

/** Every measured number, scalar or vector component, as it appears in the fixture. */
function measuredNumbers(entry: FixtureStation): string[] {
  const numbers: string[] = [
    entry.mass,
    entry.collisionRadius,
    entry.stationRoll,
    entry.tunnel.corners,
    entry.tunnel.startAngle,
    entry.tunnel.aspectRatio,
    ...entry.boundingBox,
    ...entry.dock.position,
    ...entry.dock.boundingBox,
  ];
  for (const sub of entry.subEntities) {
    numbers.push(
      sub.mass,
      sub.collisionRadius,
      ...sub.position,
      ...sub.boundingBox,
    );
  }
  if (entry.blockage !== undefined) {
    numbers.push(
      entry.blockage.radius,
      entry.blockage.inner,
      entry.blockage.outer,
    );
  }
  return numbers;
}

/** True when a JSON number occurs anywhere under `value`. */
function containsJsonNumber(value: unknown): boolean {
  if (typeof value === "number") return true;
  if (Array.isArray(value)) return value.some(containsJsonNumber);
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(containsJsonNumber);
  }
  return false;
}

describe("compareMeasured (MS-2 of quick task 261117-jji)", () => {
  it("calls the same float32 string EQUAL", () => {
    expect(compareMeasured("779.3702392578125", 779.3702392578125)).toBe(
      "EQUAL",
    );
  });

  it("calls a relative difference of at most 1e-6 ROUNDING", () => {
    expect(compareMeasured("103.41230010986328", 103.4123)).toBe("ROUNDING");
  });

  it("calls anything else DIFFERS", () => {
    expect(compareMeasured("912357312", 515483904)).toBe("DIFFERS");
    expect(compareMeasured("not a number", 1)).toBe("DIFFERS");
  });
});

describe("the fixture's shape", () => {
  it("holds only strings for measured numbers and booleans for flags", () => {
    expect(containsJsonNumber(fixture)).toBe(false);
  });

  it("holds the three stations the phase compares, each complete", () => {
    for (const key of [...ORACLE_KINDS, ...PENDING_KINDS]) {
      const entry = station(key);
      expect(entry.dataKey).toBe(key);
      expect(entry.name.length).toBeGreaterThan(0);
      expect(entry.boundingBox).toHaveLength(3);
      expect(entry.dock.position).toHaveLength(3);
      expect(entry.dock.boundingBox).toHaveLength(3);
      expect(entry.subEntities.length).toBeGreaterThan(0);
      expect(entry.subEntities.filter((sub) => sub.isDock)).toHaveLength(1);
      expect(typeof entry.tunnel.authored).toBe("boolean");
      for (const number of measuredNumbers(entry)) {
        expect(Number.isFinite(Number(number)), `not numeric: ${number}`).toBe(
          true,
        );
        expect(number.trim()).toBe(number);
        expect(number.length).toBeGreaterThan(0);
      }
    }
  });

  it("records Oolite's defaults for the unauthored tunnel keys", () => {
    for (const key of [...ORACLE_KINDS, ...PENDING_KINDS]) {
      const { tunnel } = station(key);
      expect(tunnel.authored).toBe(false);
      expect(tunnel.corners).toBe("4");
      expect(tunnel.startAngle).toBe("45");
      expect(tunnel.aspectRatio).toBe("2.67");
    }
  });
});

describe("the compiled stations against the measured Oolite values", () => {
  for (const key of ORACLE_KINDS) {
    describe(key, () => {
      it("has the measured mass and collision radius", () => {
        const measured = station(key);
        const entry = compiled(key);
        expectNotDiffers(`${key} mass`, measured.mass, entry.mass);
        expectNotDiffers(
          `${key} collisionRadius`,
          measured.collisionRadius,
          entry.collisionRadius,
        );
      });

      it("has the dock subentity's bounding box as its port", () => {
        const [x, y, z] = station(key).dock.boundingBox;
        if (x === undefined || y === undefined || z === undefined) {
          throw new Error(`${key}: the dock bounding box is incomplete`);
        }
        expectNotDiffers(`${key} port width`, x, dockPort.port.width);
        expectNotDiffers(`${key} port height`, y, dockPort.port.height);
        expectNotDiffers(`${key} port depth`, z, dockPort.port.depth);
      });

      it("has the authored station_roll", () => {
        expect(
          compareMeasured(
            station(key).stationRoll,
            compiled(key).shipDef.stationRoll,
          ),
        ).toBe("EQUAL");
      });
    });
  }
});

describe.skipIf(PENDING_KINDS.length === 0)(
  "the pending kinds (the tripwire for plan 22.1-02)",
  () => {
    for (const key of PENDING_KINDS) {
      it(`${key} is measured and not compiled yet`, () => {
        expect(station(key).mass.length).toBeGreaterThan(0);
        expect(
          clientShips.some((ship) => ship.key === key),
          `${key} is compiled now: move it from PENDING_KINDS to ORACLE_KINDS ` +
            "in tests/content/stations-oracle.test.ts (plan 22.1-02) so its " +
            "comparison with the fixture turns on.",
        ).toBe(false);
      });
    }
  },
);

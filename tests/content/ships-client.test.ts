// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The client's trimmed ship catalogue.
 *
 * The game reads the three main stations and the player ship of the 194 entries
 * the compiler emits. `ships-client.json` carries those four plus the navigation
 * buoy, which is carried for its mass only (owner decision in plan 10-03; Phase
 * 12 reads it). Each entry appears as
 * in the complete `ships.json` plus its Oolite `mass` (DATA-11) and its Oolite
 * `collisionRadius` (quick task 261117-k1l), and the client source imports only
 * the trimmed file. `ships.json` itself carries neither.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  findShip,
  loadShipCatalogue,
  playerShip,
} from "../../src/content/ships.js";
import { STATION_KINDS, STATION_RECORDS } from "../../src/content/stations.js";
import {
  CLIENT_SHIP_KEYS,
  CLIENT_SHIPS_PATH,
  emitClientShips,
} from "../../tools/oolite-ingest/convert/ships.js";
import type { ShipCatalogue } from "../../tools/oolite-ingest/convert/ships.js";
import { ShipCatalogueSchema } from "../../src/content/schemas/ship.js";

interface Entry {
  readonly key: string;
  readonly mass?: number;
  readonly collisionRadius?: number;
  readonly modelVendored?: boolean;
  readonly extras?: Readonly<Record<string, unknown>>;
}

interface StationFixture {
  readonly stations: Readonly<
    Record<string, { readonly mass: string; readonly collisionRadius: string }>
  >;
}

function readJson(relative: string): Entry[] {
  return JSON.parse(
    readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8"),
  ) as Entry[];
}

const full = readJson("src/content/generated/ships.json");
const client = readJson(CLIENT_SHIPS_PATH);
const measured = JSON.parse(
  readFileSync(
    new URL("../fixtures/oolite-reference/stations.json", import.meta.url),
    "utf8",
  ),
) as StationFixture;

describe("ships-client.json", () => {
  it("holds exactly the client's entries, in catalogue order", () => {
    expect(client.map((entry) => entry.key)).toEqual([...CLIENT_SHIP_KEYS]);
    expect([...CLIENT_SHIP_KEYS]).toEqual([...CLIENT_SHIP_KEYS].sort());
  });

  it("copies each entry unchanged from the complete catalogue, apart from the mass and radius", () => {
    for (const entry of client) {
      const { mass: _mass, collisionRadius: _radius, ...rest } = entry;
      void _mass;
      void _radius;
      expect(rest).toEqual(full.find((other) => other.key === entry.key));
    }
  });

  it("carries Oolite's octree mass on each client entry", () => {
    const mass = (key: string): number | undefined =>
      client.find((entry) => entry.key === key)?.mass;
    expect(mass("buoy")).toBe(698691.1875);
    expect(mass("coriolis-station")).toBe(515483904);
    expect(mass("oolite_template_cobra3-player")).toBe(214737.6875);
  });

  it("carries Oolite's collision radius on each client entry, as measured in quick task 261117-jji", () => {
    const radius = (key: string): number | undefined =>
      client.find((entry) => entry.key === key)?.collisionRadius;
    expect(radius("buoy")).toBe(59.13554763793945);
    // The dock subentity sets it: fround(500.2561 + 279.1141662597656).
    expect(radius("coriolis-station")).toBe(779.3702392578125);
    expect(radius("oolite_template_cobra3-player")).toBe(72.69734954833984);
  });

  it("carries the measured Oolite mass and collision radius of the two new stations", () => {
    for (const key of ["dodecahedron-station", "icosahedron-station"]) {
      const entry = client.find((other) => other.key === key);
      const oolite = measured.stations[key];
      if (entry === undefined || oolite === undefined) {
        throw new Error(`no ${key} in ships-client.json or the fixture`);
      }
      // The probe logs each float32 as a string; EQUAL is the same string.
      expect(String(entry.mass)).toBe(oolite.mass);
      expect(String(entry.collisionRadius)).toBe(oolite.collisionRadius);
    }
  });

  it("keeps modelVendored false for the stations whose GLB plan 22.1-10 emits", () => {
    const flag = (key: string): boolean | undefined =>
      client.find((entry) => entry.key === key)?.modelVendored;
    expect(flag("coriolis-station")).toBe(true);
    expect(flag("dodecahedron-station")).toBe(false);
    expect(flag("icosahedron-station")).toBe(false);
  });

  it("marks every main station market-monitored, as Oolite's three templates do", () => {
    // Oolite authors `"market_monitored" = yes;` on all three station
    // templates (shipdata.plist lines 1706, 1895 and 2352); the content build
    // compiles it to the boolean. LAW-07 (Phase 25) relies on it.
    for (const kind of STATION_KINDS) {
      const { shipKey } = STATION_RECORDS[kind];
      const entry = client.find((other) => other.key === shipKey);
      expect(entry, `ships-client.json has no ${shipKey}`).toBeDefined();
      expect(entry?.extras?.["market_monitored"], shipKey).toBe(true);
    }
  });

  it("validates against the strict catalogue schema", () => {
    expect(ShipCatalogueSchema.safeParse(client).success).toBe(true);
  });

  it("keeps the complete catalogue free of mass and collision radius", () => {
    for (const entry of full) {
      expect(entry).not.toHaveProperty("mass");
      expect(entry).not.toHaveProperty("collisionRadius");
    }
  });

  it("is a small fraction of the complete catalogue", () => {
    expect(full.length).toBeGreaterThan(100);
    const size = (relative: string): number =>
      readFileSync(new URL(`../../${relative}`, import.meta.url)).byteLength;
    expect(size(CLIENT_SHIPS_PATH)).toBeLessThan(
      size("src/content/generated/ships.json") / 10,
    );
  });
});

describe("the client loader", () => {
  it("resolves the player ship and every main station from the trimmed file", async () => {
    const catalogue = await loadShipCatalogue();
    expect(catalogue.map((entry) => entry.key)).toEqual([...CLIENT_SHIP_KEYS]);
    expect(CLIENT_SHIP_KEYS).toContain(playerShip(catalogue).key);
    // Every station still carries the dock the layout and the save allow-list
    // are derived from.
    for (const kind of STATION_KINDS) {
      const { shipKey } = STATION_RECORDS[kind];
      expect(CLIENT_SHIP_KEYS).toContain(shipKey);
      const ship = findShip(catalogue, shipKey);
      expect(
        ship.shipDef.subentities.some((subentity) => subentity.isDock === true),
        `${shipKey} has no dock subentity`,
      ).toBe(true);
    }
  });

  it("does not import the complete catalogue", () => {
    const source = readFileSync(
      new URL("../../src/content/ships.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain('"./generated/ships-client.json"');
    expect(source).not.toMatch(/glob\(\s*"\.\/generated\/ships\.json"/);
  });
});

describe("emitClientShips", () => {
  it("fails the content build when a client entry is missing", () => {
    const empty = { entries: [] } as unknown as ShipCatalogue;
    expect(() => emitClientShips(empty, new Map(), new Map())).toThrow(
      /has no "buoy"/,
    );
  });

  it("fails the content build when a client entry has no computed mass", () => {
    const entry = (key: string): unknown => ({ key });
    const catalogue = {
      entries: CLIENT_SHIP_KEYS.map(entry),
    } as unknown as ShipCatalogue;
    expect(() => emitClientShips(catalogue, new Map(), new Map())).toThrow(
      /no computed mass for "buoy"/,
    );
  });

  it("fails the content build when a client entry has no computed collision radius", () => {
    const entry = (key: string): unknown => ({ key });
    const catalogue = {
      entries: CLIENT_SHIP_KEYS.map(entry),
    } as unknown as ShipCatalogue;
    const masses = new Map(CLIENT_SHIP_KEYS.map((key) => [key, 1]));
    expect(() => emitClientShips(catalogue, masses, new Map())).toThrow(
      /no computed collision radius for "buoy"/,
    );
  });
});

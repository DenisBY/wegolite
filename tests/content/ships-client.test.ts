// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The client's trimmed ship catalogue.
 *
 * The game reads two entries of the 194 the compiler emits. `ships-client.json`
 * carries exactly those two, byte-for-byte as they appear in the complete
 * `ships.json`, and the client source imports only the trimmed file.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  loadShipCatalogue,
  playerShip,
  stationShip,
} from "../../src/content/ships.js";
import {
  CLIENT_SHIP_KEYS,
  CLIENT_SHIPS_PATH,
  emitClientShips,
} from "../../tools/oolite-ingest/convert/ships.js";
import type { ShipCatalogue } from "../../tools/oolite-ingest/convert/ships.js";

interface Entry {
  readonly key: string;
}

function readJson(relative: string): Entry[] {
  return JSON.parse(
    readFileSync(new URL(`../../${relative}`, import.meta.url), "utf8"),
  ) as Entry[];
}

const full = readJson("src/content/generated/ships.json");
const client = readJson(CLIENT_SHIPS_PATH);

describe("ships-client.json", () => {
  it("holds exactly the client's entries, in catalogue order", () => {
    expect(client.map((entry) => entry.key)).toEqual([...CLIENT_SHIP_KEYS]);
    expect([...CLIENT_SHIP_KEYS]).toEqual([...CLIENT_SHIP_KEYS].sort());
  });

  it("copies each entry unchanged from the complete catalogue", () => {
    for (const entry of client) {
      expect(entry).toEqual(full.find((other) => other.key === entry.key));
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
  it("resolves the player ship and the station from the trimmed file", async () => {
    const catalogue = await loadShipCatalogue();
    expect(catalogue.map((entry) => entry.key)).toEqual([...CLIENT_SHIP_KEYS]);
    expect(CLIENT_SHIP_KEYS).toContain(playerShip(catalogue).key);
    expect(CLIENT_SHIP_KEYS).toContain(stationShip(catalogue).key);
    // The station still carries the dock the layout and the save allow-list
    // are derived from.
    expect(
      stationShip(catalogue).shipDef.subentities.some(
        (subentity) => subentity.isDock === true,
      ),
    ).toBe(true);
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
    expect(() => emitClientShips(empty)).toThrow(/has no "coriolis-station"/);
  });
});

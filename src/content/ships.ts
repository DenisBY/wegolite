// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ship catalogue loader (DATA-02, FLGT-03, Pitfall 12).
 *
 * The client loads `generated/ships-client.json`: only the two entries it
 * reads, the Coriolis station and the player Cobra. The compiler's complete
 * catalogue, `generated/ships.json`, is 194 entries and ~706 KB; it stays in the
 * repository for the golden and the tests and is not imported here, so it is
 * not in the bundle. The file is loaded as a `?raw` string and `JSON.parse`d
 * exactly like `systems.ts` does for the galaxy chunks; the chunk is code-split
 * and the promise is cached.
 *
 * One consequence: the save allow-list of station keys (`src/main.ts`) is built
 * from this catalogue, so it now holds `coriolis-station` only. That is the
 * only key this build ever writes.
 *
 * The player entry is `oolite_template_cobra3-player` **by key**, not by
 * `usable` or role: it is a template (`isTemplate: true`, `usable: false`) but
 * it is the only entry carrying the player's 350/32/1/2/20 t/70 flight stats.
 * `cobra3-trader` (300/30) and `cobra3-alternate` (300/32, 35 t) are not the
 * player ship.
 */

import type { CatalogEntry, ShipCatalogue } from "./schemas/ship.js";

const PLAYER_SHIP_KEY = "oolite_template_cobra3-player";
const STATION_SHIP_KEY = "coriolis-station";
const SHIPS_PATH = "./generated/ships-client.json";

const lazyShips = import.meta.glob("./generated/ships-client.json", {
  query: "?raw",
  import: "default",
});

let cachedCatalogue: Promise<ShipCatalogue> | undefined;

/** Load and parse the committed catalogue once; later calls share the promise. */
export function loadShipCatalogue(): Promise<ShipCatalogue> {
  cachedCatalogue ??= (async () => {
    const load = lazyShips[SHIPS_PATH];
    if (load === undefined) {
      throw new Error(
        `Wegolite: expected the ship catalogue at ${SHIPS_PATH}, but it is missing.`,
      );
    }
    const parsed: unknown = JSON.parse(await load()) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Wegolite: the ship catalogue is not an entry array.");
    }
    return parsed as ShipCatalogue;
  })();
  return cachedCatalogue;
}

/**
 * Find one catalogue entry by key.
 *
 * @throws {Error} naming the key; a silent `undefined` would become a flight
 * config built from nothing.
 */
export function findShip(catalogue: ShipCatalogue, key: string): CatalogEntry {
  const entry = catalogue.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    throw new Error(
      `Wegolite: the ship catalogue has no entry with key "${key}".`,
    );
  }
  return entry;
}

/** The player's Cobra Mk III template (350 u/s, thrust 32, 20 t). */
export function playerShip(catalogue: ShipCatalogue): CatalogEntry {
  return findShip(catalogue, PLAYER_SHIP_KEY);
}

/** The Coriolis station entry; carries `stationRoll` and the dock subentity. */
export function stationShip(catalogue: ShipCatalogue): CatalogEntry {
  return findShip(catalogue, STATION_SHIP_KEY);
}

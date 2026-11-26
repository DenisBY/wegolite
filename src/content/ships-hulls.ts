// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy hull-octree catalogue (CBT-07, D-01).
 *
 * The octrees and collision radii of the player's Cobra Mk III and the NPC
 * hulls (one entry per model, with the keys that share it as aliases) live in their own generated file and are loaded only when something asks
 * for them: the glob below is non-eager, so Vite splits the file into its own
 * chunk that the first load never fetches, and the first-load ceiling is
 * unaffected. Loaded by `start-session.ts` (traffic on only) and built into the
 * hull table by `hullTable` (`src/app/session/traffic.ts`), with aliases.
 *
 * The module name starts with `ships` on purpose, so the simulation's ESLint
 * denial of `**\/content/ships*` covers it: `src/sim` sees hull data only as a
 * caller-supplied table, never by importing the loader.
 *
 * The file is loaded as a `?raw` string, parsed, and validated against the
 * strict, bounded schema, so a malformed, oversized or over-deep tree fails here
 * with the path named instead of reaching the ray test (T-13-06, T-13-07).
 */

import { ShipHullCatalogueSchema } from "./schemas/ship-hull.js";
import type { ShipHull, ShipHullCatalogue } from "./schemas/ship-hull.js";

export type { ShipHull, ShipHullCatalogue };

const SHIP_HULLS_PATH = "./generated/ships-hulls.json";

const lazyShipHulls = import.meta.glob("./generated/ships-hulls.json", {
  query: "?raw",
  import: "default",
});

let cachedCatalogue: Promise<ShipHullCatalogue> | undefined;

/** Load, parse and validate the hull records once; later calls share the promise. */
export function loadShipHulls(): Promise<ShipHullCatalogue> {
  cachedCatalogue ??= (async () => {
    const load = lazyShipHulls[SHIP_HULLS_PATH];
    if (load === undefined) {
      throw new Error(
        `Wegolite: expected the ship hull octrees at ${SHIP_HULLS_PATH}, but they are missing.`,
      );
    }
    const parsed = ShipHullCatalogueSchema.safeParse(
      JSON.parse(await load()) as unknown,
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Wegolite: ${SHIP_HULLS_PATH} is not a valid ship hull catalogue: ${
          issue === undefined
            ? "invalid"
            : `${issue.path.join(".")}: ${issue.message}`
        }.`,
      );
    }
    return parsed.data;
  })();
  return cachedCatalogue;
}

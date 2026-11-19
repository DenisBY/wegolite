// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy static and debris hull artifact (DATA-15, Phase 18).
 *
 * The octrees, subentities, collision radii and frangibility of the Coriolis
 * station, the navigation buoy, the cargo barrel and the alloy plate, and the
 * compiled display names of the ident targets, live in their own generated
 * file, separate from the ten-hull artifact (`loadShipHulls`) because the Coriolis
 * octrees exceed that file's caps (PROJECT.md Key Decisions, "Statics and
 * debris hulls ship in their own lazily loaded file"). The glob below is
 * non-eager, so Vite splits the file into its own chunk that the first load
 * never fetches. The session start-up is its one importer (plan 18-13): the
 * boot call is traffic-gated beside `loadShipHulls()`, so a traffic-off session
 * never fetches the chunk.
 *
 * The module name starts with `ships` on purpose, so the simulation's ESLint
 * denial of `**\/content/ships*` covers it: `src/sim` sees hull data only as a
 * caller-supplied table, never by importing the loader.
 *
 * The file is loaded as a `?raw` string, parsed, and validated against the
 * strict, bounded schema, so a malformed, oversized or over-deep tree fails
 * here with the path named instead of reaching a hit or collision test
 * (T-18-01).
 */

import { StaticHullArtifactSchema } from "./schemas/ship-static-hull.js";
import type {
  StaticHull,
  StaticHullArtifact,
  StaticName,
  StaticSubentity,
} from "./schemas/ship-static-hull.js";

export type { StaticHull, StaticHullArtifact, StaticName, StaticSubentity };

const STATIC_HULLS_PATH = "./generated/ships-static-hulls.json";

const lazyStaticHulls = import.meta.glob(
  "./generated/ships-static-hulls.json",
  {
    query: "?raw",
    import: "default",
  },
);

let cachedArtifact: Promise<StaticHullArtifact> | undefined;

/** Load, parse and validate the static hulls once; later calls share the promise. */
export function loadStaticHulls(): Promise<StaticHullArtifact> {
  cachedArtifact ??= (async () => {
    const load = lazyStaticHulls[STATIC_HULLS_PATH];
    if (load === undefined) {
      throw new Error(
        `Wegolite: expected the static hull octrees at ${STATIC_HULLS_PATH}, but they are missing.`,
      );
    }
    const parsed = StaticHullArtifactSchema.safeParse(
      JSON.parse(await load()) as unknown,
    );
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new Error(
        `Wegolite: ${STATIC_HULLS_PATH} is not a valid static hull artifact: ${
          issue === undefined
            ? "invalid"
            : `${issue.path.join(".")}: ${issue.message}`
        }.`,
      );
    }
    return parsed.data;
  })();
  return cachedArtifact;
}

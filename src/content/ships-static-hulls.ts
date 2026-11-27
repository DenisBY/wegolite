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
 * The Dodecahedron and Icosahedron stations (Phase 22.1) each have a file of
 * their own, `ships-static-hulls-<kind>.json`, loaded by `loadStationHulls`; the
 * kind-to-file mapping is `STATION_RECORDS[kind].hullsFile`, never glob order.
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
import { stationRecord } from "./stations.js";
import type { StationKind } from "./stations.js";

export type { StaticHull, StaticHullArtifact, StaticName, StaticSubentity };

const GENERATED_PREFIX = "./generated/";
const SHARED_HULLS_FILE = "ships-static-hulls.json";

const lazyStaticHulls = import.meta.glob(
  "./generated/ships-static-hulls*.json",
  {
    query: "?raw",
    import: "default",
  },
);

/** A missing, invalid or incomplete static hull artifact. */
export class StaticHullsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StaticHullsError";
  }
}

/** Read, parse and validate one artifact by file name (uncached). */
async function readArtifact(fileName: string): Promise<StaticHullArtifact> {
  const path = `${GENERATED_PREFIX}${fileName}`;
  const load = lazyStaticHulls[path];
  if (load === undefined) {
    throw new StaticHullsError(
      `Wegolite: expected the static hull octrees at ${path}, but they are missing.`,
    );
  }
  const parsed = StaticHullArtifactSchema.safeParse(
    JSON.parse(await load()) as unknown,
  );
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new StaticHullsError(
      `Wegolite: ${path} is not a valid static hull artifact: ${
        issue === undefined
          ? "invalid"
          : `${issue.path.join(".")}: ${issue.message}`
      }.`,
    );
  }
  return parsed.data;
}

let cachedArtifact: Promise<StaticHullArtifact> | undefined;

/** Load, parse and validate the static hulls once; later calls share the promise. */
export function loadStaticHulls(): Promise<StaticHullArtifact> {
  cachedArtifact ??= readArtifact(SHARED_HULLS_FILE);
  return cachedArtifact;
}

const cachedStations = new Map<StationKind, Promise<StaticHullArtifact>>();

/**
 * Check that an artifact holds the hull of one station kind, so a station can
 * never be installed without it (and be silently immune to lasers).
 *
 * @throws {StaticHullsError} naming the kind's file and ship key.
 */
export function assertStationHull(
  artifact: StaticHullArtifact,
  kind: StationKind,
): StaticHullArtifact {
  const record = stationRecord(kind);
  if (!artifact.hulls.some((hull) => hull.key === record.shipKey)) {
    throw new StaticHullsError(
      `Wegolite: ${GENERATED_PREFIX}${record.hullsFile} has no hull for "${record.shipKey}".`,
    );
  }
  return artifact;
}

/**
 * The hull artifact holding one station kind's octrees and display name. The
 * Coriolis lives in the shared artifact, so it resolves to the very promise
 * {@link loadStaticHulls} returns; the other kinds load their own file, once.
 * An artifact that does not hold the kind's ship key is rejected: a station
 * without its hull would be silently immune to lasers.
 */
export function loadStationHulls(
  kind: StationKind,
): Promise<StaticHullArtifact> {
  const record = stationRecord(kind);
  if (record.hullsFile === SHARED_HULLS_FILE) return loadStaticHulls();
  let cached = cachedStations.get(kind);
  if (cached === undefined) {
    cached = readArtifact(record.hullsFile).then((artifact) =>
      assertStationHull(artifact, kind),
    );
    cachedStations.set(kind, cached);
  }
  return cached;
}

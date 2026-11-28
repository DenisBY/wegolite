// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The dock-port loader (DOCK-01, D-01, T-04-34).
 *
 * `generated/dock-port*.json` are shipped static assets, so they are loaded as
 * `?raw` strings and `JSON.parse`d exactly like the ship catalogue: a literal
 * JSON import would put the whole record in `tsc`'s inferred type for no
 * benefit. Unlike `ships.ts` the parsed value is validated with the same strict
 * schema the emitter used, because the loader is the trust boundary between a
 * build artefact and the numbers `src/sim/dock` will consume (plan 04-02).
 *
 * The promise is cached, and a missing or invalid file throws a named
 * `DockPortError` instead of returning a half-formed record — a silent fallback
 * would become a docking corridor built from `undefined`.
 *
 * Phase 22.1 adds one record per station kind (`dock-port-<kind>.json`). The
 * glob matches all of them, but the file a kind reads is named explicitly by
 * `STATION_RECORDS[kind].dockPortFile`, never found by glob order.
 */

import { DockPortSchema } from "./schemas/dock-port.js";
import type { DockPort } from "./schemas/dock-port.js";
import { STATION_KINDS, stationRecord } from "./stations.js";
import type { StationKind } from "./stations.js";

const GENERATED_PREFIX = "./generated/";

const lazyDockPort = import.meta.glob("./generated/dock-port*.json", {
  query: "?raw",
  import: "default",
});

/** A missing or invalid generated dock-port record. */
export class DockPortError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DockPortError";
  }
}

/** The raw loaders of the generated records, keyed by `./generated/<file>`. */
export type DockPortLoaders = Readonly<
  Record<string, (() => Promise<unknown>) | undefined>
>;

/**
 * Read one generated record by file name and validate it. Uncached: the public
 * loaders cache the promise. `loaders` is a seam for the tests, which pass a
 * table with a missing or corrupt record.
 */
export async function readDockPortFile(
  fileName: string,
  loaders: DockPortLoaders = lazyDockPort,
): Promise<DockPort> {
  const path = `${GENERATED_PREFIX}${fileName}`;
  const load = loaders[path];
  if (load === undefined) {
    throw new DockPortError(
      `Wegolite: expected the dock-port geometry at ${path}, but it is missing.`,
    );
  }
  const raw = await load();
  let parsed: unknown;
  try {
    parsed = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
  } catch {
    throw new DockPortError(
      `Wegolite: the dock-port geometry at ${path} is not valid JSON.`,
    );
  }
  const result = DockPortSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where =
      issue === undefined || issue.path.length === 0
        ? "record"
        : issue.path.join(".");
    throw new DockPortError(
      `Wegolite: the dock-port geometry at ${path} is invalid at ${where}: ${
        issue === undefined ? "unknown issue" : issue.message
      }.`,
    );
  }
  return result.data;
}

/**
 * A per-kind loader with its own cache over `loaders`. A load that rejects is
 * evicted, so the next ask reads again instead of being handed the same
 * failure for the page lifetime (as the asset cache does). The factory is the
 * seam for the tests; the shipped loader below is its one production use.
 */
export function createStationDockPortLoader(
  loaders: DockPortLoaders,
): (kind: StationKind) => Promise<DockPort> {
  const cachedByKind = new Map<StationKind, Promise<DockPort>>();
  return (kind) => {
    let cached = cachedByKind.get(kind);
    if (cached === undefined) {
      const pending = readDockPortFile(
        stationRecord(kind).dockPortFile,
        loaders,
      ).catch((error: unknown) => {
        cachedByKind.delete(kind);
        throw error;
      });
      cachedByKind.set(kind, pending);
      cached = pending;
    }
    return cached;
  };
}

/** Load and validate one station kind's dock-port record once. */
export const loadStationDockPort: (kind: StationKind) => Promise<DockPort> =
  createStationDockPortLoader(lazyDockPort);

/** The dock-port records of every station kind (three small files). */
export async function loadDockPorts(): Promise<
  Readonly<Record<StationKind, DockPort>>
> {
  const entries = await Promise.all(
    STATION_KINDS.map(
      async (kind) => [kind, await loadStationDockPort(kind)] as const,
    ),
  );
  // STATION_KINDS is every key of the record, so the entries cover it (no kind
  // is named here: the station-constants guard keeps the names in
  // src/content/stations.ts).
  return Object.fromEntries(entries) as Record<StationKind, DockPort>;
}

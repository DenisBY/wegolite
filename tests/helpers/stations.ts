// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-kind station fixtures for Node tests (Phase 22.1, WORLD-20).
 *
 * Reads the committed generated JSON with `readFileSync`, like `lave.ts`: the
 * client catalogue (`ships-client.json`, the only file that carries a station's
 * mass and collision radius) and the per-kind dock-port records. Each file is
 * parsed once per test file (module-level memo), so a census that asks per
 * system or a corridor sweep that asks per world never re-parses it, and every
 * call for one kind returns the same object.
 *
 * A test that needs another kind at a fixed position builds the layout from a
 * copy of the system whose `station` is that kind
 * (`deriveSystemLayout({ ...system, station: kind }, stationSpecOf(kind))`), so
 * the spec and the system always agree.
 */

import { readFileSync } from "node:fs";

import { DockPortSchema } from "../../src/content/schemas/dock-port.js";
import type { DockPort } from "../../src/content/schemas/dock-port.js";
import type { CatalogEntry } from "../../src/content/schemas/ship.js";
import { stationRecord, stationSpecFor } from "../../src/content/stations.js";
import type { StationKind } from "../../src/content/stations.js";
import type { StationSpec } from "../../src/content/types.js";
import { createDockGeometry } from "../../src/sim/dock/geometry.js";
import type { DockGeometry } from "../../src/sim/dock/geometry.js";

function readGenerated(fileName: string): unknown {
  const raw = readFileSync(
    new URL(`../../src/content/generated/${fileName}`, import.meta.url),
    "utf8",
  );
  return JSON.parse(raw) as unknown;
}

let clientEntries: readonly CatalogEntry[] | undefined;
const specs = new Map<StationKind, StationSpec>();
const ports = new Map<StationKind, DockPort>();
const geometries = new Map<StationKind, DockGeometry>();

/** The parsed `ships-client.json` entries, once. */
export function clientCatalogue(): readonly CatalogEntry[] {
  clientEntries ??= readGenerated("ships-client.json") as CatalogEntry[];
  return clientEntries;
}

/** The compiled spec of one station kind (the same object on every call). */
export function stationSpecOf(kind: StationKind): StationSpec {
  let spec = specs.get(kind);
  if (spec === undefined) {
    spec = stationSpecFor(clientCatalogue(), kind);
    specs.set(kind, spec);
  }
  return spec;
}

/** The validated dock-port record of one station kind (memoised). */
export function dockPortOf(kind: StationKind): DockPort {
  let port = ports.get(kind);
  if (port === undefined) {
    port = DockPortSchema.parse(
      readGenerated(stationRecord(kind).dockPortFile),
    );
    ports.set(kind, port);
  }
  return port;
}

/** The dock geometry of one station kind, from its port and dock offset. */
export function dockGeometryOf(kind: StationKind): DockGeometry {
  let geometry = geometries.get(kind);
  if (geometry === undefined) {
    geometry = createDockGeometry(
      dockPortOf(kind),
      stationSpecOf(kind).dockOffset,
    );
    geometries.set(kind, geometry);
  }
  return geometry;
}

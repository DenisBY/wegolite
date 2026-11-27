// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The per-system station install (Phase 22.1, WORLD-20, Pitfall P2).
 *
 * Oolite builds a system's main station from its planetinfo `station` key every
 * time the system is set up (`Universe.m:1550`), so the station follows the
 * system. Wegolite loads the three station specs and the three dock-port
 * records once at boot (a few kilobytes), and `stationFor` picks the pair that
 * belongs to a system. It is synchronous and total for a loaded set, so a
 * hyperspace arrival, an F2 Load and the boot all install the station with the
 * same call, and the arrival swap stays one atomic step (G-7): everything that
 * can throw (`stationFor`, the layout derivation, the scene build) runs before
 * the commit block, and the commit block only assigns.
 *
 * There is no Coriolis fallback (decision O8): a kind that did not load is a
 * named error on the boot-failure surface, never a silently wrong station.
 */

import { loadDockPorts } from "../../content/dock-port.js";
import type { DockPort } from "../../content/schemas/dock-port.js";
import type { CatalogEntry } from "../../content/schemas/ship.js";
import { StationSpecSchema } from "../../content/schemas/station.js";
import {
  STATION_KINDS,
  StationRecordError,
  stationSpecFor,
} from "../../content/stations.js";
import type { StationKind } from "../../content/stations.js";
import type { StationSpec, System } from "../../content/types.js";
import { createDockGeometry } from "../../sim/dock/geometry.js";
import type { DockGeometry } from "../../sim/dock/geometry.js";

/** Every station kind's spec and dock-port record, loaded once at boot. */
export interface StationRecords {
  readonly specs: ReadonlyMap<StationKind, StationSpec>;
  readonly dockPorts: ReadonlyMap<StationKind, DockPort>;
}

/** The station a system is installed with: its spec and its dock geometry. */
export interface InstalledStation {
  readonly spec: StationSpec;
  readonly dockGeometry: DockGeometry;
}

/**
 * Build the spec of every station kind from the compiled catalogue and read the
 * three dock-port records. A spec that fails `StationSpecSchema` is rejected
 * with the kind and the field named (T-22.1-17).
 *
 * @throws {StationRecordError} a missing catalogue entry or datum, or a spec
 * that does not match the schema.
 * @throws {DockPortError} a missing or invalid dock-port record.
 */
export async function loadStationRecords(
  catalogue: readonly CatalogEntry[],
  readDockPorts: () => Promise<
    Readonly<Record<StationKind, DockPort>>
  > = loadDockPorts,
): Promise<StationRecords> {
  const specs = new Map<StationKind, StationSpec>();
  for (const kind of STATION_KINDS) {
    const built = stationSpecFor(catalogue, kind);
    const checked = StationSpecSchema.safeParse(built);
    if (!checked.success) {
      const issue = checked.error.issues[0];
      const field =
        issue === undefined || issue.path.length === 0
          ? "record"
          : issue.path.join(".");
      throw new StationRecordError(
        `Wegolite: the ${kind} station spec is invalid at ${field}: ${
          issue === undefined ? "unknown issue" : issue.message
        }.`,
      );
    }
    specs.set(kind, checked.data);
  }
  const ports = await readDockPorts();
  const dockPorts = new Map<StationKind, DockPort>();
  for (const kind of STATION_KINDS) dockPorts.set(kind, ports[kind]);
  return { specs, dockPorts };
}

/**
 * The station of one system: the spec and dock geometry of the kind the system
 * authors (`system.station`, Universe.m:1550). Synchronous, so the arrival
 * swap keeps its atomic shape.
 *
 * @throws {StationRecordError} when the kind has no loaded spec or dock record.
 * @throws {DockGeometryError} when the kind's dock record cannot become a
 * geometry (an invalid aperture or dock offset).
 */
export function stationFor(
  records: StationRecords,
  system: Pick<System, "station" | "id">,
): InstalledStation {
  const kind = system.station;
  const spec = records.specs.get(kind);
  if (spec === undefined) {
    throw new StationRecordError(
      `Wegolite: no ${kind} station spec is loaded for system ${system.id}.`,
    );
  }
  const dockPort = records.dockPorts.get(kind);
  if (dockPort === undefined) {
    throw new StationRecordError(
      `Wegolite: no ${kind} dock-port record is loaded for system ${system.id}.`,
    );
  }
  return { spec, dockGeometry: createDockGeometry(dockPort, spec.dockOffset) };
}

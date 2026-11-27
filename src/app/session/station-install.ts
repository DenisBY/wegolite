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
import { loadStationHulls } from "../../content/ships-static-hulls.js";
import type { StaticHullArtifact } from "../../content/ships-static-hulls.js";
import {
  STATION_KINDS,
  StationRecordError,
  stationRecord,
  stationSpecFor,
} from "../../content/stations.js";
import type { StationKind } from "../../content/stations.js";
import type { StationSpec, System } from "../../content/types.js";
import type { AssetCache } from "../../render/asset-cache.js";
import { createDockGeometry } from "../../sim/dock/geometry.js";
import type { DockGeometry } from "../../sim/dock/geometry.js";
import type { SessionState } from "./context.js";
import { mergeStationHulls } from "./traffic.js";

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

/** The loader of a station kind's hull artifact; a test injects a double. */
export type StationHullLoader = (
  kind: StationKind,
) => Promise<StaticHullArtifact>;

/** The loads in flight, per session and kind: one request per kind. */
const hullLoadsInFlight = new WeakMap<
  SessionState,
  Map<StationKind, Promise<void>>
>();

/**
 * Make the hull and ident name of one station kind part of a traffic-on
 * session (Phase 22.1, WORLD-20, decision O3). The Coriolis lives in the shared
 * static artifact the boot already merged, so it is a no-op; a Dodecahedron or
 * Icosahedron station has an artifact of its own, which is loaded and merged
 * into `ctx.core.hulls` (through `mergeStationHulls`, a new table) with its
 * display names added to `ctx.core.targetNames`. The ident lock names a station
 * from that map and the hit rule finds its octrees in that table.
 *
 * With traffic off nothing is loaded (WORLD-16): the table does not exist. A
 * kind whose hull is already present loads nothing; concurrent asks for one
 * kind share one request. Nothing is written once `ctx.runtime.disposed` is set
 * (the signal the save controller's G-8 checks use), so a load that lands after
 * a dispose changes nothing.
 *
 * The boot and an F2 Load await it before the first step; a hyperspace arrival
 * does not (`prefetchStationFor`).
 *
 * @throws the loader's error (a missing, invalid or incomplete artifact), after
 * which the session is exactly as it was and a later call loads again.
 */
export function ensureStationHulls(
  ctx: SessionState,
  kind: StationKind,
  load: StationHullLoader = loadStationHulls,
): Promise<void> {
  const table = ctx.core.hulls;
  if (!ctx.runtime.testFlags.traffic || table === undefined) {
    return Promise.resolve();
  }
  if (table.has(stationRecord(kind).shipKey)) return Promise.resolve();
  let loads = hullLoadsInFlight.get(ctx);
  if (loads === undefined) {
    loads = new Map();
    hullLoadsInFlight.set(ctx, loads);
  }
  const inFlight = loads.get(kind);
  if (inFlight !== undefined) return inFlight;
  const started = load(kind)
    .then((artifact) => {
      if (ctx.runtime.disposed) return;
      const current = ctx.core.hulls;
      if (current === undefined) return;
      const merged = mergeStationHulls(current, artifact);
      const names = new Map(ctx.core.targetNames);
      for (const entry of artifact.names) names.set(entry.key, entry.name);
      ctx.core.hulls = merged;
      ctx.core.targetNames = names;
    })
    .finally(() => {
      loads.delete(kind);
    });
  loads.set(kind, started);
  return started;
}

/**
 * Start loading the hull artifact of a destination system's station without
 * waiting for it (decision O3): the hyperspace countdown calls it 15 s before
 * the arrival, the arrival calls it again (a no-op when the hull is present).
 * The destination is resolved through the session's validated galaxy, never a
 * fixture. The arrival swap never awaits this: an arrival that beats the load
 * simply has no hull for the station until the merge lands, so the station is
 * no laser candidate for that moment (the no-hull rule of the combat step). A
 * rejection is logged once, with the file name, and leaves the session as it
 * is. A countdown the player cancels may leave a completed prefetch, which is
 * harmless: one small artifact, reused at a later visit.
 *
 * With `models` (the countdown start; the arrival passes none) the
 * destination's station model is requested too (Phase 22.1, O3). This is the
 * only place a station model is prefetched: nothing fetches every kind in the
 * background, so a session that never starts a countdown toward another kind
 * of station requests no other station model. The cache memoises per kind, so
 * a second countdown asks for nothing new; a rejection is logged once and the
 * arrival then builds the station meshless and attaches the model late.
 */
export function prefetchStationFor(
  ctx: SessionState,
  galaxyById: ReadonlyMap<string, Pick<System, "station">>,
  systemId: string,
  load: StationHullLoader = loadStationHulls,
  models?: Pick<AssetCache, "loadStation">,
): void {
  const system = galaxyById.get(systemId);
  if (system === undefined) return;
  if (models !== undefined) {
    models.loadStation(system.station).catch((error: unknown) => {
      // A load that fails after the session was disposed is not an error
      // anyone can act on, as with the NPC model prefetch.
      if (ctx.runtime.disposed) return;
      console.error(
        `Wegolite: the ${stationRecord(system.station).glb} station model could not be prefetched`,
        error,
      );
    });
  }
  ensureStationHulls(ctx, system.station, load).catch((error: unknown) => {
    console.error(
      `Wegolite: the ${stationRecord(system.station).hullsFile} station hull artifact could not be loaded`,
      error,
    );
  });
}

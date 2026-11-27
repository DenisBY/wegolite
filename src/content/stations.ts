// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one station record: which kinds of main station a system can have and
 * which ship each kind is (Phase 22.1, WORLD-20, Success Criterion 4).
 *
 * Oolite builds a system's main station from its planetinfo `station` key: the
 * key is the role fragment `newShipWithRole:` looks up as `<key>-station`
 * (`Universe.m:1550`, the default role when the key is absent; `Universe.m:1555-1580`
 * for the retry that Wegolite does not port, decision O8). The pinned data
 * authors three values: 1,824 `coriolis`, 167 `dodecahedron` and 57
 * `icosahedron` systems. Each maps to the shipdata entry of the same role:
 * `coriolis-station` (shipdata.plist line 1739), `dodecahedron-station` (line
 * 1920) and `icosahedron-station` (line 2377).
 *
 * This module imports nothing at runtime: the Node content tool
 * (`tools/oolite-ingest/convert/stations.ts`, the system schema) and the game
 * both read it, so the kinds and ship keys are stated exactly once.
 */

/** The station kinds, in the fixed order every consumer iterates them. */
export const STATION_KINDS = [
  "coriolis",
  "dodecahedron",
  "icosahedron",
] as const;

/** One of the three authored `station` values of a planetinfo system. */
export type StationKind = (typeof STATION_KINDS)[number];

/**
 * Oolite's default station role when a system authors no `station` key
 * (`Universe.m:1550`): the Coriolis.
 */
export const DEFAULT_STATION_KIND: StationKind = STATION_KINDS[0];

/** What the content build and the game know about one station kind. */
export interface StationRecord {
  readonly kind: StationKind;
  /** The shipdata key, and the `ships-client.json` entry, of the station. */
  readonly shipKey: string;
  /**
   * The generated dock-port record of this kind, a file name under
   * `src/content/generated/` (Phase 22.1 plan 03). The Coriolis keeps the file
   * it had before the phase.
   */
  readonly dockPortFile: string;
  /**
   * The generated static hull artifact holding this kind's octrees and name.
   * The Coriolis shares `ships-static-hulls.json` with the buoys and the barrel;
   * the other kinds have their own lazily loaded files, so the shared file (and
   * its byte cap) does not grow.
   */
  readonly hullsFile: string;
}

/** Every kind's record, frozen. */
export const STATION_RECORDS: Readonly<Record<StationKind, StationRecord>> =
  Object.freeze({
    coriolis: Object.freeze({
      kind: "coriolis",
      shipKey: "coriolis-station",
      dockPortFile: "dock-port.json",
      hullsFile: "ships-static-hulls.json",
    }),
    dodecahedron: Object.freeze({
      kind: "dodecahedron",
      shipKey: "dodecahedron-station",
      dockPortFile: "dock-port-dodecahedron.json",
      hullsFile: "ships-static-hulls-dodecahedron.json",
    }),
    icosahedron: Object.freeze({
      kind: "icosahedron",
      shipKey: "icosahedron-station",
      dockPortFile: "dock-port-icosahedron.json",
      hullsFile: "ships-static-hulls-icosahedron.json",
    }),
  });

/** The record of one kind. */
export function stationRecord(kind: StationKind): StationRecord {
  return STATION_RECORDS[kind];
}

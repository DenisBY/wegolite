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
 * This module imports nothing at runtime (types only): the Node content tool
 * (`tools/oolite-ingest/convert/stations.ts`, the system schema) and the game
 * both read it, so the kinds and ship keys are stated exactly once.
 */

import type { CatalogEntry } from "./schemas/ship.js";
import type { StationSpec } from "./schemas/station.js";

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

/**
 * How the render draws one node of a station model (Phase 22.1, plan 10).
 * The layer is data in the record, never inferred from the node's name:
 *
 * - `body`: the plain hull, drawn first and pushed back with `polygonOffset`
 *   so the raised layers on top of it do not z-fight with it;
 * - `detail`: a raised layer drawn over the body (a faceplate, the Coriolis
 *   triangles, the Icosahedron's detailed front section);
 * - `dock`: the dock mesh, drawn last.
 */
export type StationNodeLayer = "body" | "detail" | "dock";

/** One node of a station's GLB, in the file's node order. */
export interface StationNode {
  /** The glTF node name, as the content build writes it. */
  readonly name: string;
  readonly layer: StationNodeLayer;
}

/** What the content build and the game know about one station kind. */
export interface StationRecord {
  readonly kind: StationKind;
  /** The shipdata key, and the `ships-client.json` entry, of the station. */
  readonly shipKey: string;
  /**
   * The station's model, `models/<name>.glb` under `public/` (the anchored
   * path rule of `NPC_GLB_PATH_PATTERN`). The content build derives the file
   * name from it, so the path is stated once.
   */
  readonly glb: string;
  /**
   * The nodes of that GLB in file order, with the render layer of each. The
   * content build builds one node per entry from the kind's own meshes
   * (`STATION_BUILDS[].parts`), so the names here are the names in the file.
   * Exactly one node is `body` and exactly one is `dock`.
   */
  readonly nodes: readonly StationNode[];
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
  /**
   * The HUD line a refused witchspace jump shows when this kind of station is
   * the blocker (Oolite: `witch-blocked` with the ship's `name`,
   * PlayerEntity.m:6551-6553): the fixed witch-blocked prefix plus the compiled
   * display name (`extras.name`) of `shipKey`.
   *
   * The three names are typed here, the one place outside the compiled data,
   * because the HUD message guard (`tests/guards/hud-message-length.test.ts`)
   * forbids building the line at run time (a dynamic name of any length is the
   * first consumer of the word wrap). The same guard proves each line equals
   * the prefix plus the name compiled into `ships-client.json` and fits
   * `MAX_MESSAGE_CHARS`, so a rename in the content build fails there.
   */
  readonly witchBlockedLine: string;
}

/** Every kind's record, frozen. */
export const STATION_RECORDS: Readonly<Record<StationKind, StationRecord>> =
  Object.freeze({
    coriolis: Object.freeze({
      kind: "coriolis",
      shipKey: "coriolis-station",
      glb: "models/coriolis.glb",
      nodes: Object.freeze([
        Object.freeze({ name: "hull", layer: "body" }),
        Object.freeze({ name: "faceplate", layer: "detail" }),
        Object.freeze({ name: "tris", layer: "detail" }),
        Object.freeze({ name: "dock", layer: "dock" }),
      ]),
      dockPortFile: "dock-port.json",
      hullsFile: "ships-static-hulls.json",
      witchBlockedLine:
        "Witchspace jump aborted: too close to Coriolis Station",
    }),
    dodecahedron: Object.freeze({
      kind: "dodecahedron",
      shipKey: "dodecahedron-station",
      glb: "models/dodecahedron.glb",
      nodes: Object.freeze([
        Object.freeze({ name: "hull", layer: "body" }),
        Object.freeze({ name: "faceplate", layer: "detail" }),
        Object.freeze({ name: "dock", layer: "dock" }),
      ]),
      dockPortFile: "dock-port-dodecahedron.json",
      hullsFile: "ships-static-hulls-dodecahedron.json",
      witchBlockedLine:
        "Witchspace jump aborted: too close to Dodecahedron Station",
    }),
    icosahedron: Object.freeze({
      kind: "icosahedron",
      shipKey: "icosahedron-station",
      glb: "models/icosahedron.glb",
      // The front section (`oolite_ico.dat`, the GLB root) is the detailed
      // layer; the plain main hull (`oolite_ico_hull.dat`) is the body that is
      // pushed back.
      nodes: Object.freeze([
        Object.freeze({ name: "hull", layer: "detail" }),
        Object.freeze({ name: "mainhull", layer: "body" }),
        Object.freeze({ name: "dock", layer: "dock" }),
      ]),
      dockPortFile: "dock-port-icosahedron.json",
      hullsFile: "ships-static-hulls-icosahedron.json",
      witchBlockedLine:
        "Witchspace jump aborted: too close to Icosahedron Station",
    }),
  });

/** The record of one kind. */
export function stationRecord(kind: StationKind): StationRecord {
  return STATION_RECORDS[kind];
}

/** A station record that cannot become a spec: a missing entry or datum (O8). */
export class StationRecordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StationRecordError";
  }
}

/**
 * Build the spec the simulation reads from the compiled catalogue entry of one
 * station kind (`ships-client.json`): the collision radius and mass compiled at
 * build time, the display name, the roll and the dock offset (the absolute
 * value of the `is_dock` subentity's `z`, the arithmetic `deriveSystemLayout`
 * used before the spec existed).
 *
 * There is no Coriolis fallback (decision O8): an absent entry or datum is a
 * content build defect, named here, never a silently wrong station.
 *
 * @throws {StationRecordError} naming the ship key and the missing datum.
 */
export function stationSpecFor(
  entries: readonly CatalogEntry[],
  kind: StationKind,
): StationSpec {
  const key = stationRecord(kind).shipKey;
  const entry = entries.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    throw new StationRecordError(
      `Wegolite: the ship catalogue has no entry "${key}" for the ${kind} station.`,
    );
  }
  const missing = (datum: string): StationRecordError =>
    new StationRecordError(
      `Wegolite: the catalogue entry "${key}" has no ${datum}; the ${kind} station spec cannot be built.`,
    );

  const dock = entry.shipDef.subentities.find(
    (subentity) => subentity.isDock === true,
  );
  if (dock === undefined) throw missing("dock subentity (is_dock)");
  const dockPosition = dock.position;
  if (dockPosition === undefined) throw missing("dock subentity position");
  const { mass, collisionRadius } = entry;
  if (mass === undefined) throw missing("mass");
  if (collisionRadius === undefined) throw missing("collisionRadius");
  const name = entry.extras["name"];
  if (typeof name !== "string") throw missing("name (extras.name)");
  const { stationRoll } = entry.shipDef;
  if (stationRoll === undefined) throw missing("station_roll");

  return {
    kind,
    key,
    name,
    collisionRadius,
    mass,
    dockOffset: Math.abs(dockPosition[2]),
    stationRoll,
  };
}

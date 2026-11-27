// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The content build's view of the three main stations (Phase 22.1, WORLD-20).
 *
 * `src/content/stations.ts` owns the kinds and ship keys; this table adds, per
 * kind, the vendored `.dat` meshes the build reads for the station's mass and
 * collision radius (`ShipEntity.m:417-419`, `2028-2044`): the main mesh, the
 * solid subentities (flashers are not `ShipEntity`s and add nothing) and the
 * dock subentity. `generate.ts` reads the union of these files together with
 * `MODEL_SOURCE_FILES`.
 *
 * From plan 22.1-10 the table also says how each kind's GLB is built: `parts`
 * lists one part per node of the record's `nodes`, in that order, each with the
 * mesh it is drawn from and the shipdata entry whose materials texture it.
 * `convert/glb.ts` derives the station rows of `MODEL_SOURCE_FILES` and
 * `EMITTED_ENTRIES` from it.
 */

import {
  STATION_KINDS,
  STATION_RECORDS,
} from "../../../src/content/stations.js";
import type { StationKind } from "../../../src/content/stations.js";

/** One node of a station GLB: its mesh and the entry that textures it. */
export interface StationPart {
  /** The glTF node name, from the kind's `StationRecord.nodes`. */
  readonly node: string;
  /** The vendored `.dat` the node's mesh is built from. */
  readonly model: string;
  /**
   * The shipdata entry whose `materials` texture the part: the station key for
   * the root node, the subentity key for every other node. The translation of
   * a non-root node is that subentity's `position` in the root's entry.
   */
  readonly owner: string;
}

/** One station kind's build inputs. */
export interface StationBuild {
  readonly kind: StationKind;
  /** The shipdata key, from `STATION_RECORDS`. */
  readonly shipKey: string;
  /** The station's own mesh (`model` of the shipdata entry). */
  readonly mainModel: string;
  /** The meshes of the solid, non-dock subentities, in shipdata order. */
  readonly solidModels: readonly string[];
  /** The mesh of the `is_dock = true` subentity. */
  readonly dockModel: string;
  /**
   * The meshes whose union is the hull box of the dock record (Pitfall P6): the
   * whole body of the station, so the Icosahedron lists its main-hull subentity
   * beside its front section. The Coriolis lists its hull mesh only, so its
   * record does not move.
   */
  readonly hullModels: readonly string[];
  /**
   * The meshes whose union is the contact box: the hull meshes plus the parts
   * that protrude past them (the Coriolis triangles and faceplate, the
   * Dodecahedron faceplate).
   */
  readonly contactModels: readonly string[];
  /** The GLB file under `public/models`, from `StationRecord.glb`. */
  readonly glbFile: string;
  /**
   * The GLB's nodes in file order, one per `StationRecord.nodes` entry. The
   * first part is the root (the station's own mesh, translation zero).
   */
  readonly parts: readonly StationPart[];
}

/** What `MODELS` states per kind; the node names come from the record. */
interface PartSource {
  readonly model: string;
  readonly owner: string;
}

const MODELS: Readonly<
  Record<
    StationKind,
    Pick<
      StationBuild,
      "mainModel" | "solidModels" | "dockModel" | "hullModels" | "contactModels"
    > & { readonly partSources: readonly PartSource[] }
  >
> = {
  coriolis: {
    mainModel: "oolite_coriolis.dat",
    solidModels: ["oolite_coriolis_faceplate.dat", "oolite_coriolis_tris.dat"],
    dockModel: "oolite_coriolis_dock.dat",
    hullModels: ["oolite_coriolis.dat"],
    contactModels: [
      "oolite_coriolis.dat",
      "oolite_coriolis_tris.dat",
      "oolite_coriolis_faceplate.dat",
    ],
    partSources: [
      { model: "oolite_coriolis.dat", owner: "coriolis-station" },
      {
        model: "oolite_coriolis_faceplate.dat",
        owner: "oolite_coriolis_faceplate",
      },
      { model: "oolite_coriolis_tris.dat", owner: "oolite_coriolis_tris" },
      { model: "oolite_coriolis_dock.dat", owner: "oolite_coriolis_dock" },
    ],
  },
  dodecahedron: {
    mainModel: "oolite_dodo.dat",
    solidModels: ["oolite_dodo_faceplate.dat"],
    dockModel: "oolite_dodo_dock.dat",
    hullModels: ["oolite_dodo.dat"],
    contactModels: ["oolite_dodo.dat", "oolite_dodo_faceplate.dat"],
    partSources: [
      { model: "oolite_dodo.dat", owner: "dodecahedron-station" },
      { model: "oolite_dodo_faceplate.dat", owner: "oolite_dodo_faceplate" },
      { model: "oolite_dodo_dock.dat", owner: "oolite_dodo_dock" },
    ],
  },
  icosahedron: {
    mainModel: "oolite_ico.dat",
    solidModels: ["oolite_ico_hull.dat"],
    dockModel: "oolite_ico_dock.dat",
    hullModels: ["oolite_ico.dat", "oolite_ico_hull.dat"],
    contactModels: ["oolite_ico.dat", "oolite_ico_hull.dat"],
    partSources: [
      { model: "oolite_ico.dat", owner: "icosahedron-station" },
      { model: "oolite_ico_hull.dat", owner: "oolite_ico_mainhull" },
      { model: "oolite_ico_dock.dat", owner: "oolite_ico_dock" },
    ],
  },
};

const GLB_PATH_PREFIX = "models/";

/** The build entry of one kind: `MODELS` joined with the record's nodes. */
function stationBuild(kind: StationKind): StationBuild {
  const record = STATION_RECORDS[kind];
  const { partSources, ...models } = MODELS[kind];
  if (partSources.length !== record.nodes.length) {
    throw new Error(
      `Wegolite: the ${kind} station has ${String(partSources.length)} part sources and ${String(record.nodes.length)} record nodes`,
    );
  }
  const parts = record.nodes.map((node, index): StationPart => {
    const source = partSources[index];
    if (source === undefined) {
      throw new Error(
        `Wegolite: the ${kind} station has no part ${String(index)}`,
      );
    }
    return Object.freeze({ node: node.name, ...source });
  });
  if (!record.glb.startsWith(GLB_PATH_PREFIX)) {
    throw new Error(
      `Wegolite: the ${kind} station glb "${record.glb}" is outside ${GLB_PATH_PREFIX}`,
    );
  }
  return Object.freeze({
    kind,
    shipKey: record.shipKey,
    glbFile: record.glb.slice(GLB_PATH_PREFIX.length),
    parts: Object.freeze(parts),
    ...models,
  });
}

/** One frozen build entry per station kind, in `STATION_KINDS` order. */
export const STATION_BUILDS: readonly StationBuild[] = Object.freeze(
  STATION_KINDS.map(stationBuild),
);

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Every model file of every station kind, de-duplicated, code-unit sorted. */
export const STATION_MODEL_FILES: readonly string[] = [
  ...new Set(
    STATION_BUILDS.flatMap((build) => [
      build.mainModel,
      ...build.solidModels,
      build.dockModel,
    ]),
  ),
].sort(compareCodeUnits);

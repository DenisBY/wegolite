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
 * `MODEL_SOURCE_FILES`; no GLB is emitted from them in this plan, so the meshes
 * count toward mass and radius only.
 */

import {
  STATION_KINDS,
  STATION_RECORDS,
} from "../../../src/content/stations.js";
import type { StationKind } from "../../../src/content/stations.js";

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
}

const MODELS: Readonly<
  Record<
    StationKind,
    Pick<StationBuild, "mainModel" | "solidModels" | "dockModel">
  >
> = {
  coriolis: {
    mainModel: "oolite_coriolis.dat",
    solidModels: ["oolite_coriolis_faceplate.dat", "oolite_coriolis_tris.dat"],
    dockModel: "oolite_coriolis_dock.dat",
  },
  dodecahedron: {
    mainModel: "oolite_dodo.dat",
    solidModels: ["oolite_dodo_faceplate.dat"],
    dockModel: "oolite_dodo_dock.dat",
  },
  icosahedron: {
    mainModel: "oolite_ico.dat",
    solidModels: ["oolite_ico_hull.dat"],
    dockModel: "oolite_ico_dock.dat",
  },
};

/** One frozen build entry per station kind, in `STATION_KINDS` order. */
export const STATION_BUILDS: readonly StationBuild[] = Object.freeze(
  STATION_KINDS.map((kind) =>
    Object.freeze({
      kind,
      shipKey: STATION_RECORDS[kind].shipKey,
      ...MODELS[kind],
    }),
  ),
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

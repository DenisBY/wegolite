// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-kind dock geometry → `src/content/generated/dock-port*.json`
 * (DOCK-01, D-01, T-04-02, T-04-33, T-04-34; Phase 22.1, WORLD-20).
 *
 * Oolite derives its port dimensions from the **dock subentity's** bounding box,
 * not the hull's (`DockEntity.m:1044-1045`), so the aperture here is measured
 * from each station's own dock mesh (`oolite_coriolis_dock.dat`,
 * `oolite_dodo_dock.dat`, `oolite_ico_dock.dat`) and never inferred from the
 * hull or inspected from the runtime GLB. One record per station kind, written
 * to the file name `STATION_RECORDS` gives it; the Coriolis record keeps its
 * pre-phase file and bytes. Nothing in this module is hand-typed geometry: every
 * number comes from a parsed `.dat` mesh that `generate.ts` already read.
 *
 * The corridor half-extents are a bounded port of `shipIsInDockingCorridor`
 * (`DockEntity.m:636-654`): the ship's local bbox is paired against the port's
 * long/short axes, each axis expands in x1.25 steps until the ship fits within
 * 90 %, and the result is halved. Oolite's loop is unbounded and assumes a
 * positive finite aperture; here the loop requires strict progress, refuses a
 * non-finite step and caps at {@link MAX_EXPANSIONS}, so degenerate input is a
 * named `SCHEMA` failure instead of a hung build.
 *
 * The emitted path is the repository-relative `GENERATED_DIR` joined with the
 * kind's `STATION_RECORDS[kind].dockPortFile`, not a bare filename:
 * `generateContent` resolves an emitted path directly beneath its output root,
 * and the drift gate only scans the declared emitted roots (T-04-34).
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { DockPortSchema } from "../../../src/content/schemas/dock-port.js";
import { STATION_RECORDS } from "../../../src/content/stations.js";
import { boundingBox } from "./dat.js";
import type { MeshBounds, ParsedMesh } from "./dat.js";
import { STATION_BUILDS } from "./stations.js";
import type { StationBuild } from "./stations.js";

/** The repository-relative directory every dock-port record is written to. */
const GENERATED_DIR = "src/content/generated";

/** The vendored snapshot every measured number comes from. */
const SOURCE = "third_party/oolite";

/** The one ship every record's corridor is fitted to. */
const SHIP_MODEL = "oolite_cobra3.dat";

/** Oolite's aperture fit ratio: the ship must fit inside 90 % of the slot. */
const FIT_RATIO = 0.9;

/** Oolite's expansion step: each iteration grows the aperture by 25 %. */
const EXPANSION_FACTOR = 1.25;

/** Defensive bound on the expansion loop; Oolite's own loop has none. */
const MAX_EXPANSIONS = 64;

export interface EmittedDockPort {
  readonly path: string;
  readonly bytes: Uint8Array;
}

/** Narrow one model by name, failing as `SCHEMA` rather than reading `undefined`. */
function requireMesh(
  meshes: Readonly<Record<string, ParsedMesh>>,
  name: string,
): ParsedMesh {
  const mesh = meshes[name];
  if (mesh === undefined) {
    throw contentError("SCHEMA", `${SOURCE}/Models/${name}`, name, {
      excerpt: `the model set has no parsed mesh for "${name}"`,
    });
  }
  return mesh;
}

/** Axis-aligned extents (span, not max) in the authored Oolite frame. */
function extents(bounds: MeshBounds): {
  readonly x: number;
  readonly y: number;
  readonly z: number;
} {
  return {
    x: bounds.max.x - bounds.min.x,
    y: bounds.max.y - bounds.min.y,
    z: bounds.max.z - bounds.min.z,
  };
}

/** One station-local collision box, in Wegolite's negated-Z frame (glb.ts:19). */
interface StationBox {
  readonly halfX: number;
  readonly halfY: number;
  readonly zMin: number;
  readonly zMax: number;
}

/**
 * Convert authored mesh bounds to a station-local box: x/y are symmetric half
 * extents about the station origin, and Z is negated and swapped exactly once,
 * mirroring the GLB conversion (`glb.ts:19`: `position' = (x, y, -z)`).
 */
function stationBox(bounds: MeshBounds): StationBox {
  return {
    halfX: Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)),
    halfY: Math.max(Math.abs(bounds.min.y), Math.abs(bounds.max.y)),
    zMin: -bounds.max.z,
    zMax: -bounds.min.z,
  };
}

/**
 * The contact proxy (T-04-35): a box covering the union of every converted
 * collision mesh, so the protruding faceplate (station-local z -534.298) is
 * inside it. It is deliberately a box, not the mesh: it contains empty volume
 * around the diamond hull, and a contact can fire slightly before visible
 * contact. That is the v1 collision-only model (D-06), not an accident.
 */
function unionBoxes(boxes: readonly StationBox[]): StationBox {
  let halfX = Number.NEGATIVE_INFINITY;
  let halfY = Number.NEGATIVE_INFINITY;
  let zMin = Number.POSITIVE_INFINITY;
  let zMax = Number.NEGATIVE_INFINITY;
  for (const box of boxes) {
    if (box.halfX > halfX) halfX = box.halfX;
    if (box.halfY > halfY) halfY = box.halfY;
    if (box.zMin < zMin) zMin = box.zMin;
    if (box.zMax > zMax) zMax = box.zMax;
  }
  return { halfX, halfY, zMin, zMax };
}

/** The ship bbox as explicit min/max corners in the Wegolite frame. */
function shipBox(bounds: MeshBounds): {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
} {
  return {
    min: [bounds.min.x, bounds.min.y, -bounds.max.z],
    max: [bounds.max.x, bounds.max.y, -bounds.min.z],
  };
}

/**
 * Grow one aperture axis until `shipExtent` fits in 90 % of it, exactly as
 * `DockEntity.m:645-651` does — with the termination guarantees Oolite assumes.
 */
function expandAperture(
  start: number,
  shipExtent: number,
  construct: string,
  file: string,
): number {
  let value = start;
  let iterations = 0;
  while (shipExtent > value * FIT_RATIO) {
    if (iterations >= MAX_EXPANSIONS) {
      throw contentError("SCHEMA", file, construct, {
        excerpt: `aperture expansion did not converge after ${String(MAX_EXPANSIONS)} steps`,
      });
    }
    const next = value * EXPANSION_FACTOR;
    if (!Number.isFinite(next) || !(next > value)) {
      throw contentError("SCHEMA", file, construct, {
        excerpt: `aperture expansion made no progress from ${String(value)}`,
      });
    }
    value = next;
    iterations += 1;
  }
  return value;
}

/**
 * Oolite's rotated pairing (`DockEntity.m:636-651`): when the port and the ship
 * disagree about which local axis is longer, the ship's y extent is tested
 * against the port's x extent and vice versa.
 */
function pairedShipExtents(
  portWidth: number,
  portHeight: number,
  shipWidth: number,
  shipHeight: number,
): readonly [number, number] {
  const rotatedPort = portWidth < portHeight;
  const rotatedShip = shipWidth < shipHeight;
  return rotatedPort === rotatedShip
    ? [shipWidth, shipHeight]
    : [shipHeight, shipWidth];
}

interface CorridorHalfExtents {
  readonly ww: number;
  readonly hh: number;
}

/** The halved corridor half-extents Oolite tests lane membership against. */
export function corridorHalfExtents(
  portWidth: number,
  portHeight: number,
  shipWidth: number,
  shipHeight: number,
  file: string = `${SOURCE}/Models/oolite_coriolis_dock.dat`,
): CorridorHalfExtents {
  const [widthExtent, heightExtent] = pairedShipExtents(
    portWidth,
    portHeight,
    shipWidth,
    shipHeight,
  );
  const expandedWidth = expandAperture(
    portWidth,
    widthExtent,
    "corridor.ww",
    file,
  );
  const expandedHeight = expandAperture(
    portHeight,
    heightExtent,
    "corridor.hh",
    file,
  );
  return { ww: expandedWidth * 0.5, hh: expandedHeight * 0.5 };
}

/** The union box of the named meshes, in the station-local Wegolite frame. */
function unionOf(
  meshes: Readonly<Record<string, ParsedMesh>>,
  names: readonly string[],
): StationBox {
  return unionBoxes(
    names.map((name) => stationBox(boundingBox(requireMesh(meshes, name)))),
  );
}

/**
 * Measure one station's aperture, corridor, hull, contact proxy and ship boxes
 * from parsed meshes and return the canonical JSON bytes at the record's own
 * dock-port path. Pure: the same meshes produce the same bytes, and
 * `generate.ts` owns every write.
 *
 * The hull box is the union of the build's `hullModels` and the contact box the
 * union of its `contactModels` (Pitfall P6), so a station whose body is more
 * than one mesh (the Icosahedron's main hull is a subentity) is covered whole.
 */
export function measureDockPort(
  meshes: Readonly<Record<string, ParsedMesh>>,
  build: StationBuild,
): EmittedDockPort {
  const dockFile = `${SOURCE}/Models/${build.dockModel}`;
  const dock = extents(boundingBox(requireMesh(meshes, build.dockModel)));
  const ship = extents(boundingBox(requireMesh(meshes, SHIP_MODEL)));

  const corridor = corridorHalfExtents(
    dock.x,
    dock.y,
    ship.x,
    ship.y,
    dockFile,
  );

  // Hull and contact are station-local (Wegolite z, the same frame as every
  // other box here). The dock-geometry builder converts the contact box into
  // port coordinates once with `layout.dockOffset`; committing a port-frame
  // literal here would double-convert it.
  const hull = unionOf(meshes, build.hullModels);
  const contact = unionBoxes([hull, unionOf(meshes, build.contactModels)]);
  const cobra = shipBox(boundingBox(requireMesh(meshes, SHIP_MODEL)));

  const candidate: PlistJson = {
    version: 1,
    source: SOURCE,
    port: {
      width: dock.x,
      height: dock.y,
      depth: dock.z,
    },
    corridor: {
      ww: corridor.ww,
      hh: corridor.hh,
    },
    hull: {
      halfX: hull.halfX,
      halfY: hull.halfY,
      zMin: hull.zMin,
      zMax: hull.zMax,
    },
    contact: {
      halfX: contact.halfX,
      halfY: contact.halfY,
      zMin: contact.zMin,
      zMax: contact.zMax,
    },
    ship: {
      min: [cobra.min[0], cobra.min[1], cobra.min[2]],
      max: [cobra.max[0], cobra.max[1], cobra.max[2]],
    },
  };

  const result = DockPortSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw contentError(
      "SCHEMA",
      dockFile,
      issue === undefined ? "dock-port" : issue.path.join("."),
      {
        excerpt:
          issue === undefined ? "invalid dock-port record" : issue.message,
      },
    );
  }

  return {
    path: `${GENERATED_DIR}/${STATION_RECORDS[build.kind].dockPortFile}`,
    bytes: Buffer.from(canonicalJson(candidate), "utf8"),
  };
}

/** One dock-port record per station kind, in `STATION_KINDS` order. */
export function emitDockPorts(
  meshes: Readonly<Record<string, ParsedMesh>>,
): readonly EmittedDockPort[] {
  return STATION_BUILDS.map((build) => measureDockPort(meshes, build));
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Coriolis dock geometry → `src/content/generated/dock-port.json`
 * (DOCK-01, D-01, T-04-02, T-04-33, T-04-34).
 *
 * Oolite derives its port dimensions from the **dock subentity's** bounding box,
 * not the hull's (`DockEntity.m:1044-1045`), so the aperture here is measured
 * from `oolite_coriolis_dock.dat` and never inferred from the hull or inspected
 * from the runtime GLB. Nothing in this module is hand-typed geometry: every
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
 * The emitted path is the repository-relative constant
 * {@link DOCK_PORT_PATH}, not a bare filename: `generateContent` resolves an
 * emitted path directly beneath its output root, and the drift gate only scans
 * the declared emitted roots (T-04-34).
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { DockPortSchema } from "../../../src/content/schemas/dock-port.js";
import { boundingBox } from "./dat.js";
import type { MeshBounds, ParsedMesh } from "./dat.js";

/** The repository-relative output path, resolved beneath the generation root. */
export const DOCK_PORT_PATH = "src/content/generated/dock-port.json";

/** The vendored snapshot every measured number comes from. */
const SOURCE = "third_party/oolite";

const DOCK_MODEL = "oolite_coriolis_dock.dat";
const SHIP_MODEL = "oolite_cobra3.dat";

const DOCK_FILE = `${SOURCE}/Models/${DOCK_MODEL}`;

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
    throw contentError("SCHEMA", DOCK_FILE, name, {
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

/**
 * Grow one aperture axis until `shipExtent` fits in 90 % of it, exactly as
 * `DockEntity.m:645-651` does — with the termination guarantees Oolite assumes.
 */
function expandAperture(
  start: number,
  shipExtent: number,
  construct: string,
): number {
  let value = start;
  let iterations = 0;
  while (shipExtent > value * FIT_RATIO) {
    if (iterations >= MAX_EXPANSIONS) {
      throw contentError("SCHEMA", DOCK_FILE, construct, {
        excerpt: `aperture expansion did not converge after ${String(MAX_EXPANSIONS)} steps`,
      });
    }
    const next = value * EXPANSION_FACTOR;
    if (!Number.isFinite(next) || !(next > value)) {
      throw contentError("SCHEMA", DOCK_FILE, construct, {
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
): CorridorHalfExtents {
  const [widthExtent, heightExtent] = pairedShipExtents(
    portWidth,
    portHeight,
    shipWidth,
    shipHeight,
  );
  const expandedWidth = expandAperture(portWidth, widthExtent, "corridor.ww");
  const expandedHeight = expandAperture(
    portHeight,
    heightExtent,
    "corridor.hh",
  );
  return { ww: expandedWidth * 0.5, hh: expandedHeight * 0.5 };
}

/**
 * Measure the aperture and corridor from parsed meshes and return the canonical
 * JSON bytes at {@link DOCK_PORT_PATH}. Pure: the same meshes produce the same
 * bytes, and `generate.ts` owns every file write.
 */
export function emitDockPort(
  meshes: Readonly<Record<string, ParsedMesh>>,
): EmittedDockPort {
  const dock = extents(boundingBox(requireMesh(meshes, DOCK_MODEL)));
  const ship = extents(boundingBox(requireMesh(meshes, SHIP_MODEL)));

  const corridor = corridorHalfExtents(dock.x, dock.y, ship.x, ship.y);

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
  };

  const result = DockPortSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw contentError(
      "SCHEMA",
      DOCK_FILE,
      issue === undefined ? "dock-port" : issue.path.join("."),
      {
        excerpt:
          issue === undefined ? "invalid dock-port record" : issue.message,
      },
    );
  }

  return {
    path: DOCK_PORT_PATH,
    bytes: Buffer.from(canonicalJson(candidate), "utf8"),
  };
}

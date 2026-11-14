// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's ship collision radius, computed at build time (WORLD-15, owner
 * decision 2026-11-14). Never imported by `src/`: the content build keeps only
 * the resulting numbers.
 *
 * The radius is Oolite's `collision_radius` for a ship without solid
 * subentities (`ShipEntity.m:1073`, `collision_radius = [self findCollisionRadius]`,
 * which reads the mesh's `collisionRadius`). The mesh sets it in
 * `calculateBoundingVolumes`: the largest squared distance of any vertex from
 * the model origin (`d_squared = magnitude2(_vertices[i])`, `OOMesh.m:1801-1803`,
 * every operand a `float`), then `collisionRadius = sqrtf(result)`
 * (`OOMesh.m:1822`). It is consumed by the populator as the entity's `radius`.
 *
 * The model origin is Oolite's own. The GLB handedness flip negates one axis,
 * which does not change a distance, so the radius is taken from the parsed
 * `.dat` vertices as authored.
 *
 * Oolite also grows a ship's radius by every solid subentity
 * (`addSubentityToCollisionRadius:`, `ShipEntity.m:2028-2044`: the subentity's
 * position magnitude plus its own radius when that exceeds the hull's). That term
 * is not ported: none of the nine NPC ships has a non-flasher subentity, and a
 * key whose entry has one is a build failure rather than a silently short
 * radius.
 */

import { contentError } from "../content-error.js";
import type { ParsedMesh } from "./dat.js";
import { MODELS_DIR, SHIPDATA_FILE } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";

const fround = Math.fround;

/**
 * The hull radius as a float32: the square root of the largest squared vertex
 * distance from the model origin, every step rounded to float32 as Oolite's
 * `float` arithmetic does (`OOMesh.m:1801-1822`).
 *
 * Throws `SCHEMA` for a mesh with no vertices or a result that is not finite and
 * above zero, naming the ship key and the model file.
 */
export function hullRadius(
  key: string,
  modelFile: string,
  mesh: ParsedMesh,
): number {
  if (mesh.vertices.length === 0) {
    return fail(key, modelFile, "the mesh has no vertices, so no radius");
  }
  let largest = 0;
  for (const vertex of mesh.vertices) {
    const x = fround(vertex.x);
    const y = fround(vertex.y);
    const z = fround(vertex.z);
    const squared = fround(
      fround(fround(x * x) + fround(y * y)) + fround(z * z),
    );
    if (squared > largest) largest = squared;
  }
  const radius = fround(Math.sqrt(largest));
  if (!Number.isFinite(radius) || radius <= 0) {
    return fail(
      key,
      modelFile,
      `the hull radius ${String(radius)} is not finite and above zero`,
    );
  }
  return radius;
}

function fail(key: string, file: string, detail: string): never {
  throw contentError("SCHEMA", file, key, { excerpt: detail });
}

/**
 * Oolite's collision radius of one ship as a float32.
 *
 * Throws `SCHEMA` for a key or model the catalogue or mesh set lacks, an entry
 * with a non-flasher subentity (the subentity radius term is not ported), a mesh
 * with no vertices, or a radius that is not finite and above zero.
 */
function shipRadius(
  key: string,
  catalogue: ShipCatalogue,
  meshes: Readonly<Record<string, ParsedMesh>>,
): number {
  const entry = catalogue.entries.find((candidate) => candidate.key === key);
  if (entry === undefined) {
    return fail(
      key,
      SHIPDATA_FILE,
      `the compiled ship catalogue has no "${key}" entry`,
    );
  }
  const model = entry.model;
  if (model === null) {
    return fail(key, SHIPDATA_FILE, "the entry has no model, so no radius");
  }
  const modelFile = `${MODELS_DIR}/${model}`;
  const mesh = meshes[model];
  if (mesh === undefined) {
    return fail(
      key,
      modelFile,
      `the model set has no parsed mesh for "${model}"`,
    );
  }
  if (
    entry.shipDef.subentities.some((subentity) => subentity.type !== "flasher")
  ) {
    return fail(
      key,
      SHIPDATA_FILE,
      "the entry has a solid subentity, but the radius port does not implement the subentity radius term (ShipEntity.m:2028-2044) because no NPC ship has one",
    );
  }
  return hullRadius(key, modelFile, mesh);
}

/** One radius per distinct key, in the given order. */
export function computeShipRadii(
  keys: readonly string[],
  catalogue: ShipCatalogue,
  meshes: Readonly<Record<string, ParsedMesh>>,
): ReadonlyMap<string, number> {
  const radii = new Map<string, number>();
  for (const key of keys) {
    if (!radii.has(key)) radii.set(key, shipRadius(key, catalogue, meshes));
  }
  return radii;
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's ship mass, composed at build time (DATA-11, D-01, D-02, T-10-04).
 * Never imported by `src/`: the content build keeps only the resulting numbers.
 *
 * Oolite sets a ship's mass in two steps, and both are ported:
 *
 * 1. The hull term, `density * 20 * octree volume` (`ShipEntity.m:417-419`),
 *    with the octree and its volume from `octree.ts`. `density` is the
 *    `shipdata` key of that name, 1.0 when absent.
 * 2. The solid subentity term: every subentity that is a `ShipEntity` adds its
 *    own mass, `mass += [subent mass]` (`ShipEntity.m:2034-2041`, reached from
 *    `addSubEntity:` at line 5791). Flashers (`OOFlasherEntity`) are not
 *    `ShipEntity`s and add nothing (`ShipEntity.m:841-846` creates them
 *    separately), so only the entries that are not `type = flasher` count. A dock
 *    subentity is a `DockEntity`, a `ShipEntity` subclass (`Universe.m:3774`), and
 *    adds its octree mass like any other. Each subentity's mass follows the same
 *    rule from its own `shipdata` entry (its own density, mesh and adaptive
 *    depth), and the sum is a float32 running add, hull first and then the
 *    subentities in `shipdata` list order.
 *
 * The roadmap formula names only the hull term. The subentity term is what makes
 * the Coriolis 515,483,904 rather than its 228,650,880 hull, and the navigation
 * buoy 698,691.1875 rather than 691,044.375.
 *
 * `model_scale_factor` (`ShipEntity.m:261`, `OOMesh.m:1225`) would scale the
 * vertices before the octree. No measured ship authors one, so it is not
 * implemented, and its presence is a build failure rather than a silently wrong
 * mass.
 */

import { contentError } from "../content-error.js";
import type { ParsedMesh } from "./dat.js";
import { buildOctree, octreeVolume } from "./octree.js";
import type { OctreeMesh } from "./octree.js";
import { MODELS_DIR, SHIPDATA_FILE } from "./ships.js";
import type { ShipCatalogue } from "./ships.js";

/** The `20.0f` in `mass = density * 20.0f * [octree volume]` (`ShipEntity.m:419`). */
export const MASS_FACTOR = 20;

/** `oo_floatForKey:@"density" defaultValue:1.0f` (`ShipEntity.m:417`). */
export const DEFAULT_DENSITY = 1;

const fround = Math.fround;

/**
 * The hull mass as a float32, in Oolite's evaluation order: `density * 20.0f`
 * first, then the product with the volume. Throws `SCHEMA` when the result is not
 * finite and above zero, so a bad density or mesh is never recorded silently.
 */
export function hullMass(
  mesh: OctreeMesh,
  density: number,
  file: string,
): number {
  const volume = octreeVolume(buildOctree(mesh, file));
  const mass = fround(fround(fround(density) * MASS_FACTOR) * volume);
  if (!Number.isFinite(mass) || mass <= 0) {
    throw contentError("SCHEMA", file, "mass", {
      excerpt: `the hull mass ${String(mass)} (density ${String(density)}, volume ${String(volume)}) is not finite and above zero`,
    });
  }
  return mass;
}

function fail(key: string, file: string, detail: string): never {
  throw contentError("SCHEMA", file, key, { excerpt: detail });
}

/** The density of one entry: the authored number, else Oolite's default. */
function densityOf(key: string, extras: Readonly<Record<string, unknown>>) {
  if (!Object.hasOwn(extras, "density")) return DEFAULT_DENSITY;
  const density = extras["density"];
  if (
    typeof density !== "number" ||
    !Number.isFinite(density) ||
    density <= 0
  ) {
    return fail(
      key,
      SHIPDATA_FILE,
      `density must be a finite number above zero, not ${JSON.stringify(density) ?? String(density)}`,
    );
  }
  return density;
}

function massOf(
  key: string,
  catalogue: ShipCatalogue,
  meshes: Readonly<Record<string, ParsedMesh>>,
  chain: readonly string[],
): number {
  if (chain.includes(key)) {
    const loop = [...chain, key];
    throw contentError("SCHEMA", SHIPDATA_FILE, key, {
      chain: loop,
      excerpt: `subentity cycle: ${loop.join(" -> ")}`,
    });
  }
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
    return fail(key, SHIPDATA_FILE, "the entry has no model, so no octree");
  }
  if (Object.hasOwn(entry.extras, "model_scale_factor")) {
    return fail(
      key,
      SHIPDATA_FILE,
      "model_scale_factor is authored, but the mass port does not implement the scale (ShipEntity.m:261, OOMesh.m:1225) because no measured ship authors one",
    );
  }
  const density = densityOf(key, entry.extras);
  const modelFile = `${MODELS_DIR}/${model}`;
  const mesh = meshes[model];
  if (mesh === undefined) {
    return fail(
      key,
      modelFile,
      `the model set has no parsed mesh for "${model}"`,
    );
  }

  let mass = hullMass(mesh, density, modelFile);
  const next = [...chain, key];
  for (const subentity of entry.shipDef.subentities) {
    // An OOFlasherEntity is not a ShipEntity and adds no mass; exhaust plumes
    // come from the separate `exhaust` key and are never in this list.
    if (subentity.type === "flasher") continue;
    const subentityKey = subentity.subentity_key;
    if (typeof subentityKey !== "string") {
      return fail(
        key,
        SHIPDATA_FILE,
        "a non-flasher subentity has no subentity_key, so its mass cannot be found",
      );
    }
    mass = fround(mass + massOf(subentityKey, catalogue, meshes, next));
  }
  if (!Number.isFinite(mass) || mass <= 0) {
    return fail(
      key,
      SHIPDATA_FILE,
      `the ship mass ${String(mass)} is not finite and above zero`,
    );
  }
  return mass;
}

/**
 * Oolite's mass of one ship as a float32: the hull term plus the mass of every
 * non-flasher subentity, in `shipdata` list order.
 *
 * Throws `SCHEMA` for a key or model the catalogue or mesh set lacks, an authored
 * `model_scale_factor`, a density that is not a finite positive number, a
 * subentity without a key, a subentity cycle, or a mass that is not finite and
 * above zero; `DAT_MESH` for a malformed mesh.
 */
export function shipMass(
  key: string,
  catalogue: ShipCatalogue,
  meshes: Readonly<Record<string, ParsedMesh>>,
): number {
  return massOf(key, catalogue, meshes, []);
}

/** One {@link shipMass} per distinct key, in the given order. */
export function computeShipMasses(
  keys: readonly string[],
  catalogue: ShipCatalogue,
  meshes: Readonly<Record<string, ParsedMesh>>,
): ReadonlyMap<string, number> {
  const masses = new Map<string, number>();
  for (const key of keys) {
    if (!masses.has(key)) masses.set(key, shipMass(key, catalogue, meshes));
  }
  return masses;
}

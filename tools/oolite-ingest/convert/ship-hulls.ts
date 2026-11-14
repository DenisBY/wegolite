// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull octrees and collision radii of the ships a laser can hit (CBT-07,
 * the delivery half of the ray part of DATA-16, D-01).
 *
 * The laser ray test of Phase 13 walks Oolite's hull octree
 * (`Octree.m isHitByLine`), so the octree itself has to reach the client. It is
 * built here, at build time, from the vendored `.dat` models with the same
 * `buildOctree` the mass port uses and the same `hullRadius` the NPC radii use:
 * nothing about the octree or the radius is re-derived. The artifact covers the
 * ten hulls a shot can meet: the player's Cobra Mk III (so a scripted pilot can
 * hit the player, RESEARCH Pitfall 11) and the nine NPC hulls.
 *
 * The file is separate from `ships-npc.json` on purpose (D-01): it is loaded
 * lazily by `src/content/ships-hulls.ts`, so it never joins the first-load
 * set whose size is gated. The octree is carried as nested arrays of the
 * build-time `OctreeNode` shape (`0` empty, `-1` solid, eight children
 * otherwise), so the client needs no decoder (RESEARCH OQ3).
 */

import { canonicalNumber } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import {
  ShipHullCatalogueSchema,
  type ShipHull,
} from "../../../src/content/schemas/ship-hull.js";
import type { ParsedMesh } from "./dat.js";
import { NPC_SHIP_KEYS } from "./npc-ships.js";
import { buildOctree } from "./octree.js";
import { hullRadius } from "./ship-radius.js";
import { MODELS_DIR, SHIPDATA_FILE } from "./ships.js";
import type { EmittedShips, ShipCatalogue } from "./ships.js";

/** Where the hull records are written, repository-relative. */
export const SHIP_HULLS_PATH = "src/content/generated/ships-hulls.json";

/**
 * The client's Cobra Mk III player record, whose hull a firing NPC can hit
 * (the same key `CLIENT_SHIP_KEYS` carries).
 */
export const PLAYER_HULL_KEY = "oolite_template_cobra3-player";

/**
 * The ten hulls, player first and then the nine NPC keys in their own order.
 */
export const HULL_SHIP_KEYS: readonly string[] = [
  PLAYER_HULL_KEY,
  ...NPC_SHIP_KEYS,
];

function fail(key: string, file: string, detail: string): never {
  throw contentError("SCHEMA", file, key, { excerpt: detail });
}

/**
 * Compile the hull records, one per {@link HULL_SHIP_KEYS} entry, in that order.
 *
 * @throws {ContentError} when a key or its mesh is missing, the mesh has no
 * triangle (`DAT_MESH`), or the record fails `ShipHullCatalogueSchema`.
 */
export function compileShipHulls(
  catalogue: ShipCatalogue,
  models: Readonly<Record<string, ParsedMesh>>,
): ShipHull[] {
  const records = HULL_SHIP_KEYS.map((key) => {
    const entry = catalogue.entries.find((candidate) => candidate.key === key);
    if (entry === undefined) {
      return fail(
        key,
        SHIPDATA_FILE,
        `the compiled ship catalogue has no "${key}" entry`,
      );
    }
    if (entry.model === null) {
      return fail(key, SHIPDATA_FILE, "the entry has no model, so no hull");
    }
    const file = `${MODELS_DIR}/${entry.model}`;
    const mesh = models[entry.model];
    if (mesh === undefined) {
      return fail(
        key,
        file,
        `the model set has no parsed mesh for "${entry.model}"`,
      );
    }
    const octree = buildOctree(mesh, file);
    return {
      key,
      collisionRadius: hullRadius(key, file, mesh),
      octree: { radius: octree.radius, depth: octree.depth, root: octree.root },
    };
  });

  const parsed = ShipHullCatalogueSchema.safeParse(records);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return fail(
      issue === undefined ? "hulls" : `hulls.${issue.path.join(".")}`,
      SHIP_HULLS_PATH,
      issue === undefined ? "invalid hull catalogue" : issue.message,
    );
  }
  return parsed.data;
}

/**
 * One octree root as a single compact line. A node is `0`, `-1` or an array of
 * eight nodes, so `JSON.stringify` is already canonical for it (integers only,
 * no object keys to order).
 */
function compactRoot(root: ShipHull["octree"]["root"]): string {
  return JSON.stringify(root);
}

/**
 * Serialise the hull records in {@link HULL_SHIP_KEYS} order, in the canonical
 * layout (keys in code-unit order, two-space indent, `\n` endings, one final
 * newline) with one exception: each octree `root` is one compact line.
 *
 * The shared `canonicalJson` writes one array element per line, which puts the
 * ten hulls (about 37,000 nodes) at roughly 750 KB; the compact root brings them
 * to about 100 KB, inside `MAX_HULL_ARTIFACT_BYTES` (RESEARCH Alternatives: use
 * the compact encoding rather than raise a ceiling). The bytes remain a pure
 * function of the records.
 */
export function emitShipHulls(
  catalogue: ShipCatalogue,
  models: Readonly<Record<string, ParsedMesh>>,
): EmittedShips {
  const records = compileShipHulls(catalogue, models);
  const body = records
    .map(
      (hull) =>
        `  {\n` +
        `    "collisionRadius": ${canonicalNumber(hull.collisionRadius)},\n` +
        `    "key": ${JSON.stringify(hull.key)},\n` +
        `    "octree": {\n` +
        `      "depth": ${canonicalNumber(hull.octree.depth)},\n` +
        `      "radius": ${canonicalNumber(hull.octree.radius)},\n` +
        `      "root": ${compactRoot(hull.octree.root)}\n` +
        `    }\n` +
        `  }`,
    )
    .join(",\n");
  return {
    path: SHIP_HULLS_PATH,
    bytes: Buffer.from(`[\n${body}\n]\n`, "utf8"),
  };
}

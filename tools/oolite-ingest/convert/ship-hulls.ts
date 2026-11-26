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
 * One octree per model (DATA-18, RESEARCH A8): records that share a model share
 * one entry. The entry's `key` is the group's existing key (the player's Cobra
 * key for the Cobra Mk III group, otherwise the first key of the group in
 * code-unit order) and the other keys of the group ride in its optional
 * `aliases` list, so the hull chunk never carries one octree twice. A group of
 * one key has no `aliases` key, which keeps today's ten entries byte-identical.
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

/** Code-unit order, the order the generated files sort their keys in. */
function byCodeUnit(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * The keys of `keys` grouped by their resolved model, each group as the entry
 * key plus the sorted aliases, in the order of the entry keys within `keys`
 * (player first, then each group at the position of its entry key).
 */
function groupByModel(
  catalogue: ShipCatalogue,
  keys: readonly string[],
): { key: string; aliases: string[]; model: string }[] {
  const groups = new Map<string, string[]>();
  const listed = new Set<string>();
  for (const key of keys) {
    // A key listed twice would become an alias of itself or of another entry.
    if (listed.has(key)) {
      return fail(
        key,
        SHIP_HULLS_PATH,
        `the hull key "${key}" is listed twice, so it would repeat as an alias`,
      );
    }
    listed.add(key);
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
    const group = groups.get(entry.model);
    if (group === undefined) groups.set(entry.model, [key]);
    else group.push(key);
  }
  return [...groups]
    .map(([model, members]) => {
      const sorted = [...members].sort(byCodeUnit);
      const key = sorted.includes(PLAYER_HULL_KEY)
        ? PLAYER_HULL_KEY
        : (sorted[0] as string);
      return {
        key,
        aliases: sorted.filter((member) => member !== key),
        model,
      };
    })
    .sort((left, right) => keys.indexOf(left.key) - keys.indexOf(right.key));
}

/**
 * Compile the hull records, one per distinct model among `keys` (default
 * {@link HULL_SHIP_KEYS}), ordered by the position of each entry key in `keys`.
 * A key that shares its model with the entry key is that entry's alias.
 *
 * @throws {ContentError} when a key or its mesh is missing, the mesh has no
 * triangle (`DAT_MESH`), or the record fails `ShipHullCatalogueSchema`.
 */
export function compileShipHulls(
  catalogue: ShipCatalogue,
  models: Readonly<Record<string, ParsedMesh>>,
  keys: readonly string[] = HULL_SHIP_KEYS,
): ShipHull[] {
  const records = groupByModel(catalogue, keys).map(
    ({ key, aliases, model }) => {
      const file = `${MODELS_DIR}/${model}`;
      const mesh = models[model];
      if (mesh === undefined) {
        return fail(
          key,
          file,
          `the model set has no parsed mesh for "${model}"`,
        );
      }
      const octree = buildOctree(mesh, file);
      return {
        key,
        ...(aliases.length === 0 ? {} : { aliases }),
        collisionRadius: hullRadius(key, file, mesh),
        octree: {
          radius: octree.radius,
          depth: octree.depth,
          root: octree.root,
        },
      };
    },
  );

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

/** The `"aliases"` member of an entry in canonical layout, or nothing. */
function aliasLines(aliases: readonly string[] | undefined): string {
  if (aliases === undefined || aliases.length === 0) return "";
  const items = aliases.map((alias) => `      ${JSON.stringify(alias)}`);
  return `    "aliases": [\n${items.join(",\n")}\n    ],\n`;
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
 * Serialise the hull records in {@link compileShipHulls} order, in the canonical
 * layout (keys in code-unit order, two-space indent, `\n` endings, one final
 * newline) with one exception: each octree `root` is one compact line. An entry
 * with aliases writes an `"aliases"` array first (code-unit key order), one
 * element per line; an entry without aliases writes no such key.
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
  keys: readonly string[] = HULL_SHIP_KEYS,
): EmittedShips {
  const records = compileShipHulls(catalogue, models, keys);
  const body = records
    .map(
      (hull) =>
        `  {\n` +
        aliasLines(hull.aliases) +
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

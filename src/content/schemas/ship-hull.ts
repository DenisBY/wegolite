// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull octree record a laser can hit (CBT-07, D-01, T-13-06, T-13-07).
 *
 * One record per hull: the ship key, Oolite's collision radius, and the hull
 * octree as nested arrays of the build-time node shape (`Octree.m:640-645`):
 * `0` is empty, `-1` is solid, and anything else is exactly eight children in
 * index order `x * 4 + y * 2 + z`. The file is generated at build time by
 * `tools/oolite-ingest/convert/ship-hulls.ts` and loaded lazily by
 * `src/content/ships-hulls.ts`; the loader parses it as untrusted input, so the
 * schema bounds the tree before any caller walks it.
 *
 * The bounds, each of which makes a hostile or corrupted chunk fail here
 * instead of reaching the ray test:
 *
 * - the tree is walked iteratively (no recursion on untrusted nesting);
 * - the nesting never exceeds `MAX_HULL_DEPTH` (7, Oolite's `OCTREE_MAX_DEPTH`)
 *   and never exceeds the record's own declared `depth`;
 * - a hull holds at most `MAX_HULL_NODES` nodes;
 * - a catalogue holds one to sixteen hulls;
 * - a hull lists at most `MAX_HULL_ALIASES` further ship keys that share its
 *   octree (DATA-18), and no key or alias repeats across the catalogue.
 */

import { z } from "zod";

/** Oolite's `OCTREE_MAX_DEPTH`: the deepest an octree can be built. */
export const MAX_HULL_DEPTH = 7;

/**
 * The most nodes one hull may hold (every node counts, leaves included). The
 * largest measured hull (the shuttle) has 5,465 nodes and the ten hulls hold
 * about 37,000 between them; the cap is three times the largest, so a rebuilt
 * hull has room and a runaway tree does not.
 */
export const MAX_HULL_NODES = 16_384;

/** The most hulls one catalogue may hold. */
export const MAX_HULLS = 16;

/**
 * The most extra keys one hull entry may carry in `aliases` (DATA-18): records
 * that share a model share its octree. The largest group the roster needs is
 * the Cobra Mk III family, three variants beside the player's key (21-RESEARCH
 * section 1); the bound leaves headroom over that and stays far under
 * `MAX_HULLS`, so a hostile chunk cannot widen the lookup unboundedly.
 */
export const MAX_HULL_ALIASES = 8;

/**
 * The size the generated file must stay under, in bytes: the first-load
 * ceiling (9,437,184 bytes) is measured with the file outside it (D-01), but
 * the file is still bounded so a runaway artifact cannot grow unnoticed. The
 * ten stock hulls measure well under half of it.
 */
export const MAX_HULL_ARTIFACT_BYTES = 200_000;

/** An octree node: `0` empty, `-1` solid, or exactly eight child nodes. */
export type HullNode = 0 | -1 | readonly HullNode[];

const ChildrenPerNode = 8;

/**
 * Walk the tree without recursion and describe the first rule it breaks, or
 * `undefined` when it holds. `maxNodes` is the node cap of the calling schema:
 * the ten-hull catalogue keeps {@link MAX_HULL_NODES}; the static hulls
 * (`ship-static-hull.ts`) pass their own, larger per-octree cap.
 */
export function checkHullTree(
  root: unknown,
  declaredDepth: number,
  maxNodes: number = MAX_HULL_NODES,
): string | undefined {
  const limit = Math.min(declaredDepth, MAX_HULL_DEPTH);
  // Each entry is a node and the number of arrays that enclose it.
  const stack: { node: unknown; enclosing: number }[] = [
    { node: root, enclosing: 0 },
  ];
  let nodes = 0;
  for (;;) {
    const next = stack.pop();
    if (next === undefined) return undefined;
    nodes++;
    if (nodes > maxNodes) {
      return `the octree has more than ${String(maxNodes)} nodes`;
    }
    const { node, enclosing } = next;
    if (node === 0 || node === -1) continue;
    if (!Array.isArray(node)) {
      return "an octree node must be 0, -1 or an array of eight nodes";
    }
    if (node.length !== ChildrenPerNode) {
      return `an octree node array must hold exactly eight children, not ${String(node.length)}`;
    }
    if (enclosing + 1 > limit) {
      return `the octree nests deeper than ${String(limit)} levels`;
    }
    for (const child of node as unknown[]) {
      stack.push({ node: child, enclosing: enclosing + 1 });
    }
  }
}

export const ShipHullSchema = z
  .strictObject({
    key: z.string().min(1),
    // Further ship keys whose records use this same model, so this one octree
    // serves them all (DATA-18). Omitted when the model has one key.
    aliases: z.array(z.string().min(1)).max(MAX_HULL_ALIASES).optional(),
    // Oolite's float32 collision radius of the hull, in metres (WORLD-15).
    collisionRadius: z.number().positive(),
    octree: z.strictObject({
      // The root half-width: the cube is centred on the model origin.
      radius: z.number().positive(),
      // The depth the tree was built to, not the volume limit.
      depth: z.number().int().min(0).max(MAX_HULL_DEPTH),
      root: z.custom<HullNode>(() => true),
    }),
  })
  .superRefine((hull, context) => {
    const problem = checkHullTree(hull.octree.root, hull.octree.depth);
    if (problem !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["octree", "root"],
        message: problem,
      });
    }
  });

export const ShipHullCatalogueSchema = z
  .array(ShipHullSchema)
  .min(1)
  .max(MAX_HULLS)
  .superRefine((hulls, context) => {
    // Every key and alias names one hull: a repeat across entries, or an alias
    // equal to its own entry's key, would make the lookup ambiguous (T-21-11).
    const seen = new Set<string>();
    hulls.forEach((hull, index) => {
      const names: [string, (string | number)[]][] = [
        [hull.key, [index, "key"]],
        ...(hull.aliases ?? []).map(
          (alias, position): [string, (string | number)[]] => [
            alias,
            [index, "aliases", position],
          ],
        ),
      ];
      for (const [name, path] of names) {
        if (seen.has(name)) {
          context.addIssue({
            code: "custom",
            path,
            message: `the hull key "${name}" repeats within the catalogue`,
          });
        }
        seen.add(name);
      }
    });
  });

export type ShipHull = z.infer<typeof ShipHullSchema>;
export type ShipHullCatalogue = z.infer<typeof ShipHullCatalogueSchema>;

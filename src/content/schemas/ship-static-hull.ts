// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static and debris hull records (DATA-15, Phase 18 first plan).
 *
 * The Coriolis station, the navigation buoy, the cargo barrel and the alloy
 * plate carry their hull octrees in a second lazily loaded file,
 * `src/content/generated/ships-static-hulls.json`, beside the ten-hull
 * `ships-hulls.json`. The Coriolis hull octree (32,841 nodes) and its tris
 * subentity (30,089) each exceed the ten-hull per-hull cap `MAX_HULL_NODES`
 * (16,384), and the whole set exceeds that file's byte cap, so the statics get
 * their own schema and bounds instead of a raised ten-hull cap (T-13-06/07 stay
 * intact). The file is generated at build time by
 * `tools/oolite-ingest/convert/static-hulls.ts` and loaded by
 * `src/content/ships-static-hulls.ts`, which parses it as untrusted input.
 *
 * A record carries the hull key, Oolite's collision radius (the compiled
 * client or debris radius, solid subentities included), `frangible` (Oolite's
 * `isFrangible`, default true, `ShipEntity.m:376`), the hull octree, and the
 * solid subentities, each with its own octree, its compiled mass and its
 * position as authored in Oolite model axes. Flashers are not subentities here
 * (`ShipEntity.m:1219-1222`); every subentity orientation is the identity (the
 * converter fails the build otherwise), so no orientation is carried. The file
 * also carries the compiled display names of the ident targets.
 *
 * The bounds, each of which makes a corrupted chunk fail here instead of
 * reaching a hit or collision test (T-18-01):
 *
 * - every octree is walked iteratively (`checkHullTree`, no recursion on
 *   untrusted nesting) against its declared depth and `MAX_HULL_DEPTH`;
 * - one octree holds at most `MAX_STATIC_OCTREE_NODES` nodes;
 * - the whole artifact holds at most `MAX_STATIC_ARTIFACT_NODES` nodes;
 * - a hull has at most `MAX_STATIC_SUBENTITIES` subentities;
 * - every object is strict, and names and keys are bounded strings.
 *
 * The caps are headroom over a measurement that the digest golden
 * (`tests/golden/content/ships-static-hulls.json`) pins, not an independent
 * bound: they let a rebuilt hull grow a little and stop a runaway tree.
 */

import { z } from "zod";

import { MAX_HULL_DEPTH, checkHullTree } from "./ship-hull.js";
import type { HullNode } from "./ship-hull.js";

/** The most solid subentities one static hull may carry (the Coriolis has 3). */
export const MAX_STATIC_SUBENTITIES = 4;

/**
 * The most nodes one static octree may hold (every node counts, leaves
 * included). Provisional; re-derived from the emitted file.
 */
export const MAX_STATIC_OCTREE_NODES = 40_000;

/** The most nodes the whole static artifact may hold. Provisional. */
export const MAX_STATIC_ARTIFACT_NODES = 120_000;

/** The size the generated static file must stay under, in bytes. Provisional. */
export const MAX_STATIC_HULL_ARTIFACT_BYTES = 300_000;

/** The most hull records the static artifact may hold. */
export const MAX_STATIC_HULLS = 8;

/** The most display names the static artifact may hold. */
export const MAX_STATIC_NAMES = 16;

/** The longest key or display name, in characters (T-18-15 relies on it). */
export const MAX_STATIC_NAME_LENGTH = 64;

const BoundedString = z.string().min(1).max(MAX_STATIC_NAME_LENGTH);

export const StaticOctreeSchema = z.strictObject({
  // The root half-width: the cube is centred on the model origin.
  radius: z.number().positive(),
  // The depth the tree was built to, not the volume limit.
  depth: z.number().int().min(0).max(MAX_HULL_DEPTH),
  // Bounded by the artifact walk below (checkHullTree, node caps).
  root: z.custom<HullNode>(() => true),
});

export const StaticSubentitySchema = z.strictObject({
  key: BoundedString,
  // The authored position in Oolite model axes, metres.
  position: z.tuple([z.number(), z.number(), z.number()]),
  // The compiled Oolite mass of the subentity, kilograms.
  mass: z.number().positive(),
  octree: StaticOctreeSchema,
});

export const StaticHullSchema = z.strictObject({
  key: BoundedString,
  // Oolite's float32 collision radius, solid subentities included (WORLD-15).
  collisionRadius: z.number().positive(),
  // Oolite's isFrangible: can a subentity be destroyed separately.
  frangible: z.boolean(),
  octree: StaticOctreeSchema,
  subentities: z.array(StaticSubentitySchema).max(MAX_STATIC_SUBENTITIES),
});

export const StaticNameSchema = z.strictObject({
  key: BoundedString,
  name: BoundedString,
});

type StaticOctree = z.infer<typeof StaticOctreeSchema>;

/** Count the nodes of a tree `checkHullTree` has already accepted. */
function countNodes(root: unknown): number {
  const stack: unknown[] = [root];
  let nodes = 0;
  for (;;) {
    const node = stack.pop();
    if (node === undefined) return nodes;
    nodes++;
    if (Array.isArray(node)) {
      for (const child of node as unknown[]) stack.push(child);
    }
  }
}

export const StaticHullArtifactSchema = z
  .strictObject({
    hulls: z.array(StaticHullSchema).min(1).max(MAX_STATIC_HULLS),
    names: z.array(StaticNameSchema).max(MAX_STATIC_NAMES),
  })
  .superRefine((artifact, context) => {
    const octrees: { octree: StaticOctree; path: (string | number)[] }[] = [];
    artifact.hulls.forEach((hull, index) => {
      octrees.push({
        octree: hull.octree,
        path: ["hulls", index, "octree", "root"],
      });
      hull.subentities.forEach((subentity, subIndex) => {
        octrees.push({
          octree: subentity.octree,
          path: ["hulls", index, "subentities", subIndex, "octree", "root"],
        });
      });
    });
    let total = 0;
    for (const { octree, path } of octrees) {
      const problem = checkHullTree(
        octree.root,
        octree.depth,
        MAX_STATIC_OCTREE_NODES,
      );
      if (problem !== undefined) {
        context.addIssue({ code: "custom", path, message: problem });
        return;
      }
      total += countNodes(octree.root);
      if (total > MAX_STATIC_ARTIFACT_NODES) {
        context.addIssue({
          code: "custom",
          path: ["hulls"],
          message: `the static hull artifact has more than ${String(MAX_STATIC_ARTIFACT_NODES)} nodes`,
        });
        return;
      }
    }
  });

export type StaticOctreeRecord = StaticOctree;
export type StaticSubentity = z.infer<typeof StaticSubentitySchema>;
export type StaticHull = z.infer<typeof StaticHullSchema>;
export type StaticName = z.infer<typeof StaticNameSchema>;
export type StaticHullArtifact = z.infer<typeof StaticHullArtifactSchema>;

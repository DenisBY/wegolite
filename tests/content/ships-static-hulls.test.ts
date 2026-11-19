// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy static and debris hull artifact (DATA-15, T-18-01, T-18-02).
 *
 * The generated file is compiled at build time from the vendored `.dat` models
 * with the existing octree, radius and mass ports. These cases pin that it
 * parses under the strict, bounded static schema and through the lazy loader,
 * and that the Coriolis hull carries its three solid subentities at their
 * authored positions with Oolite's collision radius. The node count of every
 * Coriolis octree is asserted: that is the DATA-15 measurement against the
 * ten-hull cap `MAX_HULL_NODES`.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_HULL_NODES } from "../../src/content/schemas/ship-hull.js";
import { StaticHullArtifactSchema } from "../../src/content/schemas/ship-static-hull.js";
import type {
  StaticHull,
  StaticHullArtifact,
} from "../../src/content/schemas/ship-static-hull.js";
import { loadStaticHulls } from "../../src/content/ships-static-hulls.js";

const REPO_ROOT = process.cwd();
const GENERATED = "src/content/generated/ships-static-hulls.json";

function readGenerated(): unknown {
  const file = join(REPO_ROOT, GENERATED);
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, "utf8")) as unknown)
    : undefined;
}

function parsedArtifact(): StaticHullArtifact {
  const parsed = StaticHullArtifactSchema.safeParse(readGenerated());
  expect(parsed.success, GENERATED).toBe(true);
  if (!parsed.success) throw new Error(`${GENERATED} does not parse`);
  return parsed.data;
}

function hullOf(key: string): StaticHull {
  const hull = parsedArtifact().hulls.find(
    (candidate) => candidate.key === key,
  );
  expect(hull, key).toBeDefined();
  if (hull === undefined) throw new Error(`no ${key} hull`);
  return hull;
}

/** Every node of a tree, leaves included. */
function nodeCount(root: unknown): number {
  let nodes = 0;
  const stack: unknown[] = [root];
  for (;;) {
    const node = stack.pop();
    if (node === undefined) return nodes;
    nodes++;
    if (Array.isArray(node)) stack.push(...(node as unknown[]));
  }
}

describe("the generated static hull file", () => {
  it("exists and parses under the strict static hull artifact schema", () => {
    expect(existsSync(join(REPO_ROOT, GENERATED))).toBe(true);
    expect(StaticHullArtifactSchema.safeParse(readGenerated()).success).toBe(
      true,
    );
  });

  it("holds the Coriolis station with Oolite's collision radius, not frangible", () => {
    const station = hullOf("coriolis-station");
    expect(station.collisionRadius).toBe(779.3702392578125);
    expect(station.frangible).toBe(false);
  });

  it("gives the Coriolis its three solid subentities at the authored positions", () => {
    const station = hullOf("coriolis-station");
    expect(
      station.subentities.map((subentity) => [
        subentity.key,
        subentity.position,
      ]),
    ).toEqual([
      ["oolite_coriolis_faceplate", [0, 0, 0]],
      ["oolite_coriolis_tris", [0, 0, 0]],
      ["oolite_coriolis_dock", [0, 0, 500.2561]],
    ]);
  });

  it("records the Coriolis octree sizes: the hull and the tris exceed the ten-hull cap", () => {
    const station = hullOf("coriolis-station");
    const measured: Record<string, number> = {
      hull: nodeCount(station.octree.root),
      ...Object.fromEntries(
        station.subentities.map((subentity) => [
          subentity.key,
          nodeCount(subentity.octree.root),
        ]),
      ),
    };
    expect(measured).toEqual({
      hull: 32_841,
      oolite_coriolis_faceplate: 6_601,
      oolite_coriolis_tris: 30_089,
      oolite_coriolis_dock: 1_737,
    });
    expect(measured.hull).toBeGreaterThan(MAX_HULL_NODES);
    expect(measured.oolite_coriolis_tris).toBeGreaterThan(MAX_HULL_NODES);
  });
});

describe("loadStaticHulls", () => {
  it("resolves the parsed artifact, equal to the generated file", async () => {
    await expect(loadStaticHulls()).resolves.toEqual(readGenerated());
  });
});

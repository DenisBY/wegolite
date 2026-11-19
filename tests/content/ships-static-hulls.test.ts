// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The lazy static and debris hull artifact (DATA-15, T-18-01, T-18-02).
 *
 * The generated file is compiled at build time from the vendored `.dat` models
 * with the existing octree, radius and mass ports. These cases pin that it
 * parses under the strict, bounded static schema and through the lazy loader;
 * that it holds exactly the four static and debris hulls and the five ident
 * names in order; that the Coriolis and buoy subentities sit where Oolite puts
 * them; that every radius equals the compiled client or debris record; that it
 * stays under its size gate and matches a golden digest; that the schema
 * rejects every bound it carries, naming the path; and that nothing in the sim
 * or the app names the loader yet. The node count of every Coriolis octree is
 * asserted: that is the DATA-15 measurement against the ten-hull cap
 * `MAX_HULL_NODES`.
 *
 * The digest golden is written from the same build it pins, so it detects drift
 * but is no independent evidence that the octrees are right.
 */

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { MAX_HULL_NODES } from "../../src/content/schemas/ship-hull.js";
import {
  MAX_STATIC_ARTIFACT_NODES,
  MAX_STATIC_HULL_ARTIFACT_BYTES,
  MAX_STATIC_HULLS,
  MAX_STATIC_OCTREE_NODES,
  MAX_STATIC_SUBENTITIES,
  StaticHullArtifactSchema,
} from "../../src/content/schemas/ship-static-hull.js";
import type {
  StaticHull,
  StaticHullArtifact,
} from "../../src/content/schemas/ship-static-hull.js";
import { loadStaticHulls } from "../../src/content/ships-static-hulls.js";

const REPO_ROOT = process.cwd();
const GENERATED = "src/content/generated/ships-static-hulls.json";
const GOLDEN = "tests/golden/content/ships-static-hulls.json";

function readText(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}

function readGenerated(): unknown {
  const file = join(REPO_ROOT, GENERATED);
  return existsSync(file) ? (JSON.parse(readText(GENERATED)) as unknown) : undefined;
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

/** `levels` arrays nested on the first child, the rest empty leaves. */
function nested(levels: number): unknown {
  let node: unknown = -1;
  for (let level = 0; level < levels; level++) {
    node = [node, 0, 0, 0, 0, 0, 0, 0];
  }
  return node;
}

/**
 * The shallowest tree of at least `nodes` nodes: leaves are split breadth
 * first into eight solid children, so the depth grows only as log8 of the size.
 */
function treeOf(nodes: number): { root: unknown; depth: number; nodes: number } {
  const root: unknown[] = [-1, -1, -1, -1, -1, -1, -1, -1];
  let count = 9;
  let depth = 1;
  let frontier: unknown[][] = [root];
  while (count < nodes) {
    const next: unknown[][] = [];
    for (const parent of frontier) {
      for (let index = 0; index < 8 && count < nodes; index++) {
        const child: unknown[] = [-1, -1, -1, -1, -1, -1, -1, -1];
        parent[index] = child;
        next.push(child);
        count += 8;
      }
    }
    frontier = next;
    depth++;
  }
  return { root, depth, nodes: count };
}

/** A minimal valid artifact, one hull, for the rejection cases. */
function minimalArtifact(): Record<string, unknown> {
  return {
    hulls: [
      {
        key: "coriolis-station",
        collisionRadius: 1,
        frangible: false,
        octree: { radius: 1, depth: 1, root: [-1, 0, 0, 0, 0, 0, 0, 0] },
        subentities: [],
      },
    ],
    names: [{ key: "coriolis-station", name: "Coriolis Station" }],
  };
}

function hullWith(
  change: Record<string, unknown>,
  octree?: Record<string, unknown>,
): Record<string, unknown> {
  const artifact = minimalArtifact();
  const hull = (artifact["hulls"] as Record<string, unknown>[])[0] ?? {};
  return {
    ...artifact,
    hulls: [
      {
        ...hull,
        ...change,
        ...(octree === undefined
          ? {}
          : { octree: { ...(hull["octree"] as object), ...octree } }),
      },
    ],
  };
}

/** The first issue's path, joined, or undefined when the artifact passes. */
function rejectionPath(artifact: unknown): string | undefined {
  const parsed = StaticHullArtifactSchema.safeParse(artifact);
  if (parsed.success) return undefined;
  return parsed.error.issues[0]?.path.join(".") ?? "";
}

interface OctreeDigest {
  readonly key: string;
  readonly depth: number;
  readonly nodes: number;
  readonly solidLeaves: number;
  readonly rootHalfWidth: number;
}

interface HullDigest extends OctreeDigest {
  readonly collisionRadius: number;
  readonly subentities: readonly OctreeDigest[];
}

function octreeDigest(
  key: string,
  octree: { depth: number; radius: number; root: unknown },
): OctreeDigest {
  let nodes = 0;
  let solidLeaves = 0;
  const stack: unknown[] = [octree.root];
  for (;;) {
    const node = stack.pop();
    if (node === undefined) break;
    nodes++;
    if (node === -1) solidLeaves++;
    else if (Array.isArray(node)) stack.push(...(node as unknown[]));
  }
  return {
    key,
    depth: octree.depth,
    nodes,
    solidLeaves,
    rootHalfWidth: octree.radius,
  };
}

/** Per octree: depth, nodes, solid leaves, root half-width; per hull: radius. */
function digestOf(artifact: StaticHullArtifact): HullDigest[] {
  return artifact.hulls.map((hull) => ({
    ...octreeDigest(hull.key, hull.octree),
    collisionRadius: hull.collisionRadius,
    subentities: hull.subentities.map((subentity) =>
      octreeDigest(subentity.key, subentity.octree),
    ),
  }));
}

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, directory), {
    withFileTypes: true,
  })) {
    // Skip the guard probes tests/guards/ writes into src/sim while it runs.
    if (entry.name.startsWith("__purity_")) continue;
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      sourceFiles(relative, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

describe("the generated static hull file", () => {
  it("exists and parses under the strict static hull artifact schema", () => {
    expect(existsSync(join(REPO_ROOT, GENERATED))).toBe(true);
    expect(StaticHullArtifactSchema.safeParse(readGenerated()).success).toBe(
      true,
    );
  });

  it("holds exactly the four hulls and the five ident names, in order", () => {
    const artifact = parsedArtifact();
    expect(artifact.hulls.map((hull) => hull.key)).toEqual([
      "coriolis-station",
      "buoy",
      "barrel",
      "alloy",
    ]);
    expect(artifact.names.map((name) => name.key)).toEqual([
      "coriolis-station",
      "buoy",
      "buoy-witchpoint",
      "barrel",
      "alloy",
    ]);
  });

  it("carries the compiled display names after like_ship resolution", () => {
    expect(parsedArtifact().names).toEqual([
      { key: "coriolis-station", name: "Coriolis Station" },
      { key: "buoy", name: "Navigation Buoy" },
      { key: "buoy-witchpoint", name: "Witchpoint Beacon" },
      { key: "barrel", name: "Cargo container" },
      { key: "alloy", name: "Metal fragment" },
    ]);
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

  it("gives the buoy its one subentity at the origin with its compiled mass", () => {
    const buoy = hullOf("buoy");
    expect(
      buoy.subentities.map((subentity) => [
        subentity.key,
        subentity.position,
        subentity.mass,
      ]),
    ).toEqual([["oolite_buoy_subentity", [0, 0, 0], 7_646.7861328125]]);
    expect(buoy.collisionRadius).toBe(59.13554763793945);
  });

  it("gives the barrel and the plate no subentities", () => {
    expect(hullOf("barrel").subentities).toEqual([]);
    expect(hullOf("alloy").subentities).toEqual([]);
  });

  it("makes every hull but the Coriolis frangible (Oolite's default)", () => {
    expect(
      parsedArtifact().hulls.map((hull) => [hull.key, hull.frangible]),
    ).toEqual([
      ["coriolis-station", false],
      ["buoy", true],
      ["barrel", true],
      ["alloy", true],
    ]);
  });

  it("gives every hull the radius of its compiled client or debris record", () => {
    const client = JSON.parse(
      readText("src/content/generated/ships-client.json"),
    ) as { key: string; collisionRadius: number }[];
    const debris = JSON.parse(
      readText("src/content/generated/ships-debris.json"),
    ) as { key: string; radius: number }[];
    for (const key of ["coriolis-station", "buoy"]) {
      const record = client.find((candidate) => candidate.key === key);
      expect(record, key).toBeDefined();
      expect(hullOf(key).collisionRadius, key).toBe(record?.collisionRadius);
    }
    for (const key of ["barrel", "alloy"]) {
      const record = debris.find((candidate) => candidate.key === key);
      expect(record, key).toBeDefined();
      expect(hullOf(key).collisionRadius, key).toBe(record?.radius);
    }
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
    expect(measured["hull"]).toBeGreaterThan(MAX_HULL_NODES);
    expect(measured["oolite_coriolis_tris"]).toBeGreaterThan(MAX_HULL_NODES);
  });

  it("is at most MAX_STATIC_HULL_ARTIFACT_BYTES, so the lazy chunk stays bounded", () => {
    expect(statSync(join(REPO_ROOT, GENERATED)).size).toBeLessThanOrEqual(
      MAX_STATIC_HULL_ARTIFACT_BYTES,
    );
  });

  it("matches the golden digest", () => {
    expect(existsSync(join(REPO_ROOT, GOLDEN)), GOLDEN).toBe(true);
    const golden = JSON.parse(readText(GOLDEN)) as {
      version: number;
      hulls: HullDigest[];
    };
    expect(golden.version).toBe(1);
    expect(digestOf(parsedArtifact())).toEqual(golden.hulls);
  });
});

describe("StaticHullArtifactSchema bounds", () => {
  it("accepts the minimal artifact and a 64-character name and key", () => {
    expect(rejectionPath(minimalArtifact())).toBeUndefined();
    const long = "x".repeat(64);
    expect(
      rejectionPath({ ...minimalArtifact(), names: [{ key: long, name: long }] }),
    ).toBeUndefined();
  });

  it("rejects a 65-character name or key, naming the path", () => {
    const long = "x".repeat(65);
    expect(
      rejectionPath({
        ...minimalArtifact(),
        names: [{ key: "buoy", name: long }],
      }),
    ).toBe("names.0.name");
    expect(
      rejectionPath({
        ...minimalArtifact(),
        names: [{ key: long, name: "Navigation Buoy" }],
      }),
    ).toBe("names.0.key");
    expect(rejectionPath(hullWith({ key: long }))).toBe("hulls.0.key");
  });

  it("rejects a tree deeper than its declared depth, naming the path", () => {
    expect(rejectionPath(hullWith({}, { depth: 2, root: nested(3) }))).toBe(
      "hulls.0.octree.root",
    );
    expect(
      rejectionPath(hullWith({}, { depth: 3, root: nested(3) })),
    ).toBeUndefined();
  });

  it("rejects a node array that is not eight children, naming the path", () => {
    expect(
      rejectionPath(hullWith({}, { root: [0, 0, 0, 0, 0, 0, 0] })),
    ).toBe("hulls.0.octree.root");
    expect(
      rejectionPath(hullWith({}, { root: [0, 0, 0, 0, 0, 0, 0, 0, 0] })),
    ).toBe("hulls.0.octree.root");
  });

  it("rejects one octree over MAX_STATIC_OCTREE_NODES, naming the path", () => {
    const under = treeOf(MAX_STATIC_OCTREE_NODES - 8);
    const over = treeOf(MAX_STATIC_OCTREE_NODES + 1);
    expect(under.nodes).toBeLessThanOrEqual(MAX_STATIC_OCTREE_NODES);
    expect(over.nodes).toBeGreaterThan(MAX_STATIC_OCTREE_NODES);
    expect(
      rejectionPath(hullWith({}, { depth: under.depth, root: under.root })),
    ).toBeUndefined();
    expect(
      rejectionPath(hullWith({}, { depth: over.depth, root: over.root })),
    ).toBe("hulls.0.octree.root");
    // A subentity octree is bounded the same way.
    const subentity = {
      key: "oolite_coriolis_tris",
      position: [0, 0, 0],
      mass: 1,
      octree: { radius: 1, depth: over.depth, root: over.root },
    };
    expect(rejectionPath(hullWith({ subentities: [subentity] }))).toBe(
      "hulls.0.subentities.0.octree.root",
    );
  });

  it("rejects an artifact over MAX_STATIC_ARTIFACT_NODES, naming the path", () => {
    const tree = treeOf(MAX_STATIC_OCTREE_NODES - 8);
    const hullsNeeded = Math.ceil((MAX_STATIC_ARTIFACT_NODES + 1) / tree.nodes);
    expect(hullsNeeded).toBeLessThanOrEqual(MAX_STATIC_HULLS);
    const hull = (minimalArtifact()["hulls"] as Record<string, unknown>[])[0];
    const hulls = Array.from({ length: hullsNeeded }, (_, index) => ({
      ...hull,
      key: `hull-${String(index)}`,
      octree: { radius: 1, depth: tree.depth, root: tree.root },
    }));
    expect(rejectionPath({ ...minimalArtifact(), hulls })).toBe("hulls");
    // One hull fewer is at most the cap, by the choice of hullsNeeded.
    expect(
      rejectionPath({ ...minimalArtifact(), hulls: hulls.slice(1) }),
    ).toBeUndefined();
  });

  it("rejects more than MAX_STATIC_SUBENTITIES subentities, naming the path", () => {
    const subentity = {
      key: "oolite_coriolis_dock",
      position: [0, 0, 500.2561],
      mass: 1,
      octree: { radius: 1, depth: 0, root: -1 },
    };
    expect(
      rejectionPath(
        hullWith({
          subentities: Array.from(
            { length: MAX_STATIC_SUBENTITIES },
            () => subentity,
          ),
        }),
      ),
    ).toBeUndefined();
    expect(
      rejectionPath(
        hullWith({
          subentities: Array.from(
            { length: MAX_STATIC_SUBENTITIES + 1 },
            () => subentity,
          ),
        }),
      ),
    ).toBe("hulls.0.subentities");
  });

  it("rejects an unknown key at every level, naming the path", () => {
    expect(rejectionPath({ ...minimalArtifact(), extra: 1 })).toBe("");
    expect(rejectionPath(hullWith({ mass: 1 }))).toBe("hulls.0");
    expect(rejectionPath(hullWith({}, { extra: 1 }))).toBe("hulls.0.octree");
    expect(
      rejectionPath({
        ...minimalArtifact(),
        names: [{ key: "buoy", name: "Navigation Buoy", extra: 1 }],
      }),
    ).toBe("names.0");
    const subentity = {
      key: "oolite_buoy_subentity",
      position: [0, 0, 0],
      mass: 1,
      octree: { radius: 1, depth: 0, root: -1 },
      orientation: [1, 0, 0, 0],
    };
    expect(rejectionPath(hullWith({ subentities: [subentity] }))).toBe(
      "hulls.0.subentities.0",
    );
  });
});

describe("loadStaticHulls", () => {
  it("resolves the parsed artifact, equal to the generated file", async () => {
    await expect(loadStaticHulls()).resolves.toEqual(readGenerated());
  });

  it("returns the same promise to two concurrent calls", () => {
    expect(loadStaticHulls()).toBe(loadStaticHulls());
  });
});

describe("boot-path isolation", () => {
  it("is named by no file under src/sim or src/app yet (plan 18-13 adds the one boot call)", () => {
    const names = /ships-static-hulls|loadStaticHulls/;
    const named = [...sourceFiles("src/sim"), ...sourceFiles("src/app")].filter(
      (file) => names.test(readText(file)),
    );
    expect(named).toEqual([]);
  });
});

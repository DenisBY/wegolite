// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hull octree port pinned against hand-derived synthetic cases and the
 * vendored meshes (DATA-11, D-01, T-10-01, T-10-02, T-10-03).
 *
 * The synthetic expectations are derived by hand from the Oolite lines the port
 * follows (`OOMesh.m:591-623`, `OOMeshToOctreeConverter.m:263-412, 456-784`,
 * `Octree.m:634-681, 851-878`, `ShipEntity.m:417-419`). The vendored values are
 * float32 and bit-exact, so they are pinned with `toBe`, never `toBeCloseTo`.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh, Vec3 } from "./dat.js";
import {
  OCTREE_BASE_DEPTH,
  OCTREE_MAX_DEPTH,
  OCTREE_MIN_HALF_WIDTH,
  OCTREE_ROOT_PADDING,
  OCTREE_SIZE_THRESHOLD,
  OCTREE_SMALL_DEPTH,
  OCTREE_SMALL_SIZE_THRESHOLD,
  VOLUME_DEPTH_LIMIT,
  buildOctree,
  octreeDepthFor,
  octreeVolume,
} from "./octree.js";
import type { OctreeMesh, OctreeNode } from "./octree.js";
import { hullMass } from "./ship-mass.js";

const FILE = "synthetic.dat";

function vec(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

/** A synthetic mesh: the given vertices and one face per index triple. */
function meshOf(
  vertices: readonly Vec3[],
  faces: readonly (readonly [number, number, number])[],
): OctreeMesh {
  return {
    vertices: [...vertices],
    faces: faces.map((face) => ({ vertices: [face[0], face[1], face[2]] })),
  };
}

/** One triangle at the given corners. */
function triangleMesh(a: Vec3, b: Vec3, c: Vec3): OctreeMesh {
  return meshOf([a, b, c], [[0, 1, 2]]);
}

/** Vertices only (no faces): enough for the depth rule, which reads the box. */
function boxMesh(span: Vec3): OctreeMesh {
  return meshOf([vec(0, 0, 0), span], []);
}

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

function loadMesh(name: string): ParsedMesh {
  const file = `third_party/oolite/Models/${name}`;
  const source = readFileSync(
    new URL(`../../../${file}`, import.meta.url),
    "utf8",
  );
  return parseDat(source, file);
}

/** The indices of the non-empty children of an inner node. */
function occupied(node: OctreeNode): number[] {
  if (typeof node === "number") throw new Error("expected an inner node");
  const indices: number[] = [];
  node.forEach((child, index) => {
    if (child !== 0) indices.push(index);
  });
  return indices;
}

describe("constants", () => {
  it("carry the values Oolite cites", () => {
    expect(OCTREE_BASE_DEPTH).toBe(5);
    expect(OCTREE_SMALL_DEPTH).toBe(4);
    expect(OCTREE_SIZE_THRESHOLD).toBe(900);
    expect(OCTREE_SMALL_SIZE_THRESHOLD).toBe(20);
    expect(OCTREE_MAX_DEPTH).toBe(7);
    expect(OCTREE_MIN_HALF_WIDTH).toBe(1);
    expect(OCTREE_ROOT_PADDING).toBe(0.5);
    expect(VOLUME_DEPTH_LIMIT).toBe(5);
  });
});

describe("octreeDepthFor (OOMesh.m:591-623)", () => {
  it("uses the mean of the two largest bounding-box spans", () => {
    expect(octreeDepthFor(boxMesh(vec(130, 34.9649, 81.3726)))).toBe(5);
    expect(octreeDepthFor(boxMesh(vec(1000, 1000, 996)))).toBe(6);
    expect(octreeDepthFor(boxMesh(vec(10, 10, 1)))).toBe(4);
    expect(octreeDepthFor(boxMesh(vec(2000, 2000, 1)))).toBe(7);
  });

  it("is independent of which axes carry the two largest spans", () => {
    expect(octreeDepthFor(boxMesh(vec(1, 2000, 2000)))).toBe(7);
    expect(octreeDepthFor(boxMesh(vec(2000, 1, 2000)))).toBe(7);
    expect(octreeDepthFor(boxMesh(vec(996, 1000, 1000)))).toBe(6);
  });

  it("steps up at exactly the thresholds", () => {
    // size < 900 stays at the base depth; 900 is not below it.
    expect(octreeDepthFor(boxMesh(vec(900, 900, 1)))).toBe(6);
    expect(octreeDepthFor(boxMesh(vec(899, 899, 1)))).toBe(5);
    // size < 20 is the small depth; 20 is not below it.
    expect(octreeDepthFor(boxMesh(vec(20, 20, 1)))).toBe(5);
    expect(octreeDepthFor(boxMesh(vec(19, 19, 1)))).toBe(4);
  });

  it("covers every vertex, referenced or not", () => {
    const mesh = meshOf(
      [vec(0, 0, 0), vec(0.5, 0, 0), vec(0, 0.5, 0), vec(1000, 1000, 0)],
      [[0, 1, 2]],
    );
    expect(octreeDepthFor(mesh)).toBe(6);
    const octree = buildOctree(mesh, FILE);
    expect(octree.depth).toBe(6);
    // The cube still comes from the triangle alone.
    expect(octree.radius).toBe(1);
  });

  it("rejects an empty or non-finite vertex set as DAT_MESH", () => {
    const empty = capture(() => octreeDepthFor(meshOf([], []), FILE));
    expect(empty.code).toBe("DAT_MESH");
    expect(empty.file).toBe(FILE);
    const nan = capture(() =>
      octreeDepthFor(boxMesh(vec(Number.NaN, 1, 1)), FILE),
    );
    expect(nan.code).toBe("DAT_MESH");
  });
});

describe("buildOctree (OOMeshToOctreeConverter.m:260-412)", () => {
  it("pads the largest absolute coordinate by half a metre", () => {
    const octree = buildOctree(
      triangleMesh(vec(0, 0, 0), vec(-3.25, 0, 0), vec(0, 2, 0)),
      FILE,
    );
    expect(octree.radius).toBe(3.75);
  });

  it("ignores a degenerate triangle for the radius and the geometry", () => {
    const base = triangleMesh(vec(0, 0, 0), vec(0.5, 0, 0), vec(0, 0.5, 0));
    const withDegenerate = meshOf(
      [
        vec(0, 0, 0),
        vec(0.5, 0, 0),
        vec(0, 0.5, 0),
        vec(5, 5, 5),
        vec(5, 5, 5),
        vec(2, 3, 4),
      ],
      [
        [0, 1, 2],
        [3, 4, 5],
      ],
    );
    expect(buildOctree(withDegenerate, FILE)).toEqual(buildOctree(base, FILE));
  });

  it("makes a small triangle a solid root of volume one", () => {
    const mesh = triangleMesh(vec(0, 0, 0), vec(0.5, 0, 0), vec(0, 0.5, 0));
    const octree = buildOctree(mesh, FILE);
    expect(octree.depth).toBe(4);
    expect(octree.radius).toBe(1);
    expect(octree.root).toBe(-1);
    expect(octreeVolume(octree)).toBe(1);
    expect(hullMass(mesh, 1, FILE)).toBe(20);
  });

  it("descends the all-positive octant at every level", () => {
    const mesh = triangleMesh(
      vec(10, 10, 10),
      vec(10.5, 10, 10),
      vec(10, 10.5, 10),
    );
    const octree = buildOctree(mesh, FILE);
    expect(octree.depth).toBe(4);
    expect(octree.radius).toBe(11);
    let node: OctreeNode = octree.root;
    for (let level = 0; level < 3; level++) {
      expect(occupied(node)).toEqual([7]);
      if (typeof node === "number") throw new Error("unreachable");
      node = node[7] as OctreeNode;
    }
    // The fourth level is the depth-1 node whose child 7 is the solid leaf.
    expect(occupied(node)).toEqual([7]);
    if (typeof node === "number") throw new Error("unreachable");
    expect(node[7]).toBe(-1);
    // 0.6875 is the leaf half-width: 11 / 2^4.
    expect(octreeVolume(octree)).toBe(0.324951171875);
    expect(hullMass(mesh, 1, FILE)).toBe(6.4990234375);
  });

  it("ports the y-plane quirk: a triangle in y = 0 enters both halves", () => {
    const inY = buildOctree(
      triangleMesh(vec(2, 0, 2), vec(4, 0, 2), vec(2, 0, 4)),
      FILE,
    );
    expect(occupied(inY.root)).toEqual([5, 7]);
    // The same triangle in x = 0 goes to the plus half only (else-if).
    const inX = buildOctree(
      triangleMesh(vec(0, 2, 2), vec(0, 4, 2), vec(0, 2, 4)),
      FILE,
    );
    expect(occupied(inX.root)).toEqual([7]);
  });

  it("cuts a triangle that crosses a plane into both octants", () => {
    const octree = buildOctree(
      triangleMesh(vec(-2, 2, 2), vec(2, 2, 2), vec(0, 3, 2)),
      FILE,
    );
    expect(occupied(octree.root)).toEqual([3, 7]);
  });

  it("leaves its input untouched", () => {
    const mesh = triangleMesh(vec(-2, 2, 2), vec(2, -3, 2), vec(0.25, 3, -4.5));
    const before = structuredClone(mesh);
    buildOctree(mesh, FILE);
    expect(mesh).toEqual(before);
  });

  it("rejects a non-finite used coordinate as DAT_MESH", () => {
    const error = capture(() =>
      buildOctree(
        triangleMesh(vec(0, 0, 0), vec(Number.NaN, 0, 0), vec(0, 1, 0)),
        FILE,
      ),
    );
    expect(error.code).toBe("DAT_MESH");
    expect(error.file).toBe(FILE);
  });

  it("rejects a coordinate that overflows float32 as DAT_MESH", () => {
    const error = capture(() =>
      buildOctree(
        triangleMesh(vec(0, 0, 0), vec(1e300, 0, 0), vec(0, 1, 0)),
        FILE,
      ),
    );
    expect(error.code).toBe("DAT_MESH");
  });

  it("rejects a face index outside the vertex list as DAT_MESH", () => {
    const error = capture(() =>
      buildOctree(meshOf([vec(0, 0, 0), vec(1, 0, 0)], [[0, 1, 2]]), FILE),
    );
    expect(error.code).toBe("DAT_MESH");
  });

  it("rejects a mesh with no non-degenerate triangle as DAT_MESH", () => {
    const allDegenerate = capture(() =>
      buildOctree(
        meshOf([vec(1, 1, 1), vec(1, 1, 1), vec(2, 2, 2)], [[0, 1, 2]]),
        FILE,
      ),
    );
    expect(allDegenerate.code).toBe("DAT_MESH");
    const noFaces = capture(() =>
      buildOctree(meshOf([vec(1, 1, 1), vec(2, 2, 2)], []), FILE),
    );
    expect(noFaces.code).toBe("DAT_MESH");
  });
});

describe("octreeVolume (Octree.m:634-681)", () => {
  const coriolis = loadMesh("oolite_coriolis.dat");

  it("defaults to five levels whatever the build depth", () => {
    const octree = buildOctree(coriolis, "oolite_coriolis.dat");
    expect(octree.depth).toBe(6);
    expect(octreeVolume(octree)).toBe(octreeVolume(octree, VOLUME_DEPTH_LIMIT));
    expect(octreeVolume(octree, 6)).toBeLessThan(octreeVolume(octree));
  });
});

describe("vendored meshes, bit for bit", () => {
  it("builds the Viper at depth 5 and weighs 34,040.6796875", () => {
    const file = "third_party/oolite/Models/oolite_viper.dat";
    const mesh = loadMesh("oolite_viper.dat");
    const octree = buildOctree(mesh, file);
    expect(octree.depth).toBe(5);
    expect(octree.radius).toBe(35.534400939941406);
    expect(hullMass(mesh, 1, file)).toBe(34040.6796875);
  });

  it("builds the Cobra Mk III at depth 5 and weighs 214,737.6875", () => {
    const file = "third_party/oolite/Models/oolite_cobra3.dat";
    const mesh = loadMesh("oolite_cobra3.dat");
    const octree = buildOctree(mesh, file);
    expect(octree.depth).toBe(5);
    expect(octree.radius).toBe(65.5);
    expect(hullMass(mesh, 1, file)).toBe(214737.6875);
  });

  it("builds the Coriolis hull at depth 6 and weighs 228,650,880", () => {
    const file = "third_party/oolite/Models/oolite_coriolis.dat";
    const mesh = loadMesh("oolite_coriolis.dat");
    const octree = buildOctree(mesh, file);
    expect(octree.depth).toBe(6);
    expect(octree.radius).toBe(500.5);
    expect(hullMass(mesh, 1, file)).toBe(228650880);
  });

  it("scales the mass by the density", () => {
    const file = "third_party/oolite/Models/oolite_viper.dat";
    expect(hullMass(loadMesh("oolite_viper.dat"), 2, file)).toBe(68081.359375);
  });

  it("rejects a mass that is not finite and positive as SCHEMA", () => {
    const mesh = triangleMesh(vec(0, 0, 0), vec(0.5, 0, 0), vec(0, 0.5, 0));
    for (const density of [0, -1, Number.NaN]) {
      const error = capture(() => hullMass(mesh, density, FILE));
      expect(error.code).toBe("SCHEMA");
    }
  });
});

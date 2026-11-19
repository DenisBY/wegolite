// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Self-test of the Phase 18 geometry oracle (plan 18-02).
 *
 * The oracle has to be right before the port exists, so this file checks it
 * against itself: every fixture parses with the strict schema, every expected
 * value is re-derived from the vendored meshes (`derive.ts`) and the
 * transliterated C, and hand-written anchors sit beside the generic
 * re-derivation so a mistake in `derive.ts` cannot hide behind the fixtures it
 * reproduced.
 *
 * Nothing here reads Wegolite code or the Oolite checkout: the Oolite facts
 * are transliterated into `derive.ts` and the lines are cited in each fixture.
 */

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { parseDat, type Triangle, type Vec3 } from "./dat.js";
import {
  DOCK_MESH_FILES,
  deriveDockMouth,
  dockClearance,
  dockTolerance,
  modelOctreeSize,
  modelTriangles,
  octreeDepthForSize,
  octreeModelAnswer,
  oolitePartRule,
  type DockInput,
  type DockMesh,
} from "./derive.js";
import {
  CHANGE_OCT,
  IDENTITY_IJK,
  bruteForceOverlap,
  doOctreesCollideReference,
  isHitByOctreeReference,
  offsetForOctant,
  resolveVectorInIJK,
  type Ijk,
  type OctNode,
  type OctreeData,
} from "./octree-collide.js";
import { rayMeshDistance } from "./ray-mesh.js";
import {
  DOCK_MOUTH_FIXTURE_FILE,
  DockMouthFileSchema,
  DockMouthFixtureSchema,
  OCTREE_COLLIDE_FIXTURE_FILE,
  OctreeCollideFileSchema,
  OctreeCollideFixtureSchema,
  wegoliteBasisOf,
  type DockMouthFixture,
  type OctreeCollideFixture,
  type OctreePairFixture,
} from "./schema.js";

const HERE = fileURLToPath(new URL("./", import.meta.url));
const ORACLE_ROOT = fileURLToPath(new URL("../../", import.meta.url));

function readJson(relative: string): unknown {
  return JSON.parse(readFileSync(`${HERE}${relative}`, "utf8"));
}

function inputOf(fixture: DockMouthFixture): DockInput {
  return {
    parts: fixture.parts.map((part) => ({
      name: part.name,
      mesh: part.mesh,
      position: part.position,
    })),
    ray: fixture.ray,
  };
}

// ---------------------------------------------------------------------------
// the .dat reader

describe("readDat (the vendored meshes)", () => {
  const declared: Readonly<Record<DockMesh, number>> = {
    // NFACES of each file; every face of these six models is a triangle.
    "oolite_coriolis.dat": 50,
    "oolite_coriolis_faceplate.dat": 1820,
    "oolite_coriolis_tris.dat": 26,
    "oolite_coriolis_dock.dat": 330,
    "oolite_buoy.dat": 896,
    "oolite_buoy_subents.dat": 1808,
  };

  it("returns one triangle per declared face for each of the six models", () => {
    for (const mesh of DOCK_MESH_FILES) {
      expect(modelTriangles(mesh).length, mesh).toBe(declared[mesh]);
    }
  });

  const good = [
    "// comment",
    "NVERTS 4",
    "NFACES 1",
    "",
    "VERTEX",
    "0, 0, 0",
    "1, 0, 0",
    "1, 1, 0",
    "0, 1, 0",
    "",
    "FACES",
    "1,0,0,\t0,0,1,\t4,\t0,1,2,3",
    "",
    "END",
  ];

  it("fans a quad into two triangles from its first vertex", () => {
    const mesh = parseDat(good.join("\n"), "quad");
    expect(mesh.faceCount).toBe(1);
    expect(mesh.triangles).toEqual([
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      [
        [0, 0, 0],
        [1, 1, 0],
        [0, 1, 0],
      ],
    ]);
  });

  it("fails loudly on a malformed file", () => {
    const variants: readonly (readonly string[])[] = [
      good.filter((line) => !line.startsWith("NVERTS")),
      good.filter((line) => line !== "0, 1, 0"),
      good.map((line) =>
        line.startsWith("1,0,0") ? "1,0,0,\t0,0,1,\t4,\t0,1,2,9" : line,
      ),
      good.map((line) =>
        line.startsWith("1,0,0") ? "1,0,0,\t0,0,1,\t4,\t0,1,2" : line,
      ),
      good.map((line) => (line === "1, 0, 0" ? "1, zero, 0" : line)),
      good.map((line) => (line === "NFACES 1" ? "NFACES 2" : line)),
    ];
    for (const variant of variants) {
      expect(() => parseDat(variant.join("\n"), "bad")).toThrow(/readDat/);
    }
  });
});

// ---------------------------------------------------------------------------
// exact geometry anchors

/** The cube [-1, 1]^3 as twelve triangles. */
function unitCube(): Triangle[] {
  const c = (x: number, y: number, z: number): Vec3 => [x, y, z];
  const faces: [Vec3, Vec3, Vec3, Vec3][] = [
    [c(-1, -1, 1), c(1, -1, 1), c(1, 1, 1), c(-1, 1, 1)],
    [c(-1, -1, -1), c(-1, 1, -1), c(1, 1, -1), c(1, -1, -1)],
    [c(1, -1, -1), c(1, 1, -1), c(1, 1, 1), c(1, -1, 1)],
    [c(-1, -1, -1), c(-1, -1, 1), c(-1, 1, 1), c(-1, 1, -1)],
    [c(-1, 1, -1), c(-1, 1, 1), c(1, 1, 1), c(1, 1, -1)],
    [c(-1, -1, -1), c(1, -1, -1), c(1, -1, 1), c(-1, -1, 1)],
  ];
  return faces.flatMap(([a, b, d, e]) => [
    [a, b, d] as Triangle,
    [a, d, e] as Triangle,
  ]);
}

describe("rayMeshDistance on a hand-built unit cube", () => {
  const cube = unitCube();

  it("returns the exact entry distance", () => {
    expect(
      rayMeshDistance(
        { start: [0.25, -0.5, 5], direction: [0, 0, -1] },
        cube,
        [0, 0, 0],
      ),
    ).toBe(4);
    expect(
      rayMeshDistance(
        { start: [-7, 0.5, 0.5], direction: [1, 0, 0] },
        cube,
        [0, 0, 0],
      ),
    ).toBe(6);
    // shifted by the part offset: the cube centred on (0, 0, 10)
    expect(
      rayMeshDistance(
        { start: [0, 0, 20], direction: [0, 0, -1] },
        cube,
        [0, 0, 10],
      ),
    ).toBe(9);
  });

  it("returns Infinity on a miss, and for a cube behind the start", () => {
    expect(
      rayMeshDistance(
        { start: [3, 0, 5], direction: [0, 0, -1] },
        cube,
        [0, 0, 0],
      ),
    ).toBe(Infinity);
    expect(
      rayMeshDistance(
        { start: [0, 0, 5], direction: [0, 0, 1] },
        cube,
        [0, 0, 0],
      ),
    ).toBe(Infinity);
  });
});

describe("the subentity rule (ShipEntity.m:1323-1357)", () => {
  it("lets the nearest non-zero distance win and keeps the hull on an exact tie", () => {
    expect(oolitePartRule([0, 0, 0])).toBe(-1);
    expect(oolitePartRule([10, 0, 0])).toBe(0);
    expect(oolitePartRule([0, 7, 5])).toBe(2);
    expect(oolitePartRule([5, 5, 0])).toBe(0); // `hit_distance > hitSub` is strict
    expect(oolitePartRule([6, 5, 5])).toBe(1); // the earlier subentity keeps a tie
    expect(oolitePartRule([4, 5, 3])).toBe(2);
  });
});

describe("octree size (OOMesh.m:590-623, OOMeshToOctreeConverter.m:260-305)", () => {
  it("picks the depth from the mean of the two largest dimensions", () => {
    expect(octreeDepthForSize([19.9, 19.9, 1])).toBe(4);
    expect(octreeDepthForSize([20, 20, 1])).toBe(5);
    expect(octreeDepthForSize([899, 899, 2000])).toBe(6); // the two largest: 2000, 899
    expect(octreeDepthForSize([899, 899, 1])).toBe(5);
    expect(octreeDepthForSize([900, 900, 1])).toBe(6);
    expect(octreeDepthForSize([1800, 1800, 1])).toBe(7);
    expect(octreeDepthForSize([9000, 9000, 9000])).toBe(7);
  });

  it("gives the depths and leaf sizes the tolerances assume", () => {
    const expected: Readonly<Record<DockMesh, readonly [number, number]>> = {
      "oolite_coriolis.dat": [6, 500.5],
      "oolite_coriolis_faceplate.dat": [6, 534.798],
      "oolite_coriolis_tris.dat": [6, 500.5],
      "oolite_coriolis_dock.dat": [5, 250.5],
      "oolite_buoy.dat": [5, 58.22786],
      "oolite_buoy_subents.dat": [5, 24.3478],
    };
    for (const mesh of DOCK_MESH_FILES) {
      const [depth, root] = expected[mesh];
      const size = modelOctreeSize(mesh);
      expect(size.depth, mesh).toBe(depth);
      expect(size.rootHalfWidth, mesh).toBeCloseTo(root, 9);
      expect(size.leafHalfWidth, mesh).toBeCloseTo(root / 2 ** depth, 9);
    }
  });
});

// ---------------------------------------------------------------------------
// the dock-mouth fixtures

const STATION: DockInput["parts"] = [
  { name: "hull", mesh: "oolite_coriolis.dat", position: [0, 0, 0] },
  {
    name: "faceplate",
    mesh: "oolite_coriolis_faceplate.dat",
    position: [0, 0, 0],
  },
  { name: "tris", mesh: "oolite_coriolis_tris.dat", position: [0, 0, 0] },
  {
    name: "dock",
    mesh: "oolite_coriolis_dock.dat",
    position: [0, 0, 500.2561],
  },
];

describe("hand anchors (exact geometry)", () => {
  it("a beam along -z through the slot centre from z = +3000 is won by the dock part", () => {
    const answer = deriveDockMouth({
      parts: STATION,
      ray: { start: [0, 0, 3000], direction: [0, 0, -1] },
    });
    expect(answer.winner).toBe("dock");
    // The back wall of the dock: authored z 500.2561 minus the model's 250 m depth.
    expect(answer.distance).toBeCloseTo(3000 - 250.2561, 9);
    expect(answer.runnerUp).toBe("hull"); // the hull's back face at z = -500
    expect(answer.runnerUpDistance).toBeCloseTo(3500, 9);
  });

  it("a beam along -z far outside the station's bounding sphere is none", () => {
    const answer = deriveDockMouth({
      parts: STATION,
      ray: { start: [2000, 1500, 3000], direction: [0, 0, -1] },
    });
    expect(answer.winner).toBe("none");
    expect(answer.runnerUp).toBeNull();
  });
});

/**
 * The intent of every dock-mouth fixture, written by hand beside the JSON:
 * id, winner and the edge flag. A fixture edited to agree with a changed
 * derivation fails here.
 */
const DOCK_INTENT: readonly (readonly [string, string, boolean])[] = [
  ["dock-slot-through-dock-back-wall", "dock", false],
  ["dock-slot-lower-left-dock-back-wall", "dock", false],
  ["dock-slot-edge-plus-x-dock", "dock", true],
  ["dock-slot-edge-minus-x-dock", "dock", true],
  ["dock-slot-edge-plus-y-dock", "dock", true],
  ["dock-slot-edge-minus-y-dock", "dock", true],
  ["dock-faceplate-edge-plus-x-beside-slot", "faceplate", true],
  ["dock-faceplate-edge-minus-x-beside-slot", "faceplate", true],
  ["dock-faceplate-edge-outer-diagonal", "faceplate", true],
  ["dock-faceplate-beside-slot-x", "faceplate", false],
  ["dock-faceplate-beside-slot-y", "faceplate", false],
  ["dock-tris-corner-oblique", "tris", false],
  ["dock-hull-alone-from-minus-x", "hull", false],
  ["dock-hull-alone-from-plus-y", "hull", false],
  ["dock-hull-back-face-before-dock", "hull", false],
  ["dock-near-miss-at-clearance", "none", false],
  ["dock-far-miss", "none", false],
  ["dock-buoy-hull-front-before-subentity", "hull", false],
  ["dock-buoy-hull-back-face", "hull", false],
  ["dock-buoy-hull-alone-from-minus-x", "hull", false],
];

describe("dock-mouth fixtures (dock-mouth.json)", () => {
  const fixtures = DockMouthFileSchema.parse(readJson(DOCK_MOUTH_FIXTURE_FILE));

  it("holds at least ten fixtures with unique dock- ids, the intent table one to one", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(10);
    expect(fixtures.map((f) => f.id)).toEqual(DOCK_INTENT.map(([id]) => id));
    for (const fixture of fixtures) {
      const intent = DOCK_INTENT.find(([id]) => id === fixture.id);
      expect(intent, fixture.id).toBeDefined();
      expect(fixture.expected.winner, fixture.id).toBe(intent?.[1]);
      expect(fixture.edge, fixture.id).toBe(intent?.[2]);
    }
  });

  it("covers the slot, beside the slot, the hull alone, a miss and the buoy", () => {
    const winners = (model: string): string[] =>
      fixtures.filter((f) => f.model === model).map((f) => f.expected.winner);
    expect(winners("coriolis")).toContain("dock");
    expect(winners("coriolis")).toContain("faceplate");
    expect(winners("coriolis")).toContain("none");
    expect(
      fixtures.some(
        (f) =>
          f.model === "coriolis" &&
          f.expected.winner === "hull" &&
          f.expected.runnerUp === null,
      ),
    ).toBe(true);
    expect(
      fixtures.filter((f) => f.model === "coriolis").length,
    ).toBeGreaterThanOrEqual(8);
    expect(
      winners("buoy").filter((w) => w === "hull").length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("keeps the edge floor: two slot-edge and two faceplate-edge beams", () => {
    const edge = fixtures.filter((f) => f.edge);
    expect(
      edge.filter((f) => f.expected.winner === "dock").length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      edge.filter((f) => f.expected.winner === "faceplate").length,
    ).toBeGreaterThanOrEqual(2);
    // one slot-edge beam either side of the slot
    const slotX = edge
      .filter((f) => f.expected.winner === "dock")
      .map((f) => Math.sign(f.ray.start[0]));
    expect(slotX).toContain(1);
    expect(slotX).toContain(-1);
  });

  it("names the authored subentity positions from shipdata", () => {
    for (const fixture of fixtures) {
      const dock = fixture.parts.find((part) => part.name === "dock");
      if (dock !== undefined) expect(dock.position).toEqual([0, 0, 500.2561]);
      for (const part of fixture.parts) {
        if (part.name !== "dock")
          expect(part.position, fixture.id).toEqual([0, 0, 0]);
      }
    }
  });

  it("re-derives every fixture exactly from the meshes and the C rule", () => {
    for (const fixture of fixtures) {
      expect(() => DockMouthFixtureSchema.parse(fixture)).not.toThrow();
      const answer = deriveDockMouth(inputOf(fixture));
      const e = fixture.expected;
      expect(answer.winner, fixture.id).toBe(e.winner);
      expect(answer.runnerUp, fixture.id).toBe(e.runnerUp);
      const close = (
        a: number | null,
        b: number | null,
        what: string,
      ): void => {
        if (a === null || b === null) {
          expect(a, `${fixture.id} ${what}`).toBe(b);
        } else {
          expect(Math.abs(a - b), `${fixture.id} ${what}`).toBeLessThanOrEqual(
            1e-9,
          );
        }
      };
      close(answer.distance, e.distance, "distance");
      close(answer.incidenceDeg, e.incidenceDeg, "incidenceDeg");
      close(answer.runnerUpDistance, e.runnerUpDistance, "runnerUpDistance");
      close(
        answer.runnerUpIncidenceDeg,
        e.runnerUpIncidenceDeg,
        "runnerUpIncidenceDeg",
      );

      // the tolerance, fixed up front from the leaf size and the incidence
      const leaf = (name: string | null): number =>
        answer.parts.find((part) => part.name === name)?.leafHalfWidth ?? 0;
      const tolerance = Math.max(
        e.incidenceDeg === null
          ? 0
          : dockTolerance(leaf(e.winner), e.incidenceDeg),
        e.runnerUpIncidenceDeg === null
          ? 0
          : dockTolerance(leaf(e.runnerUp), e.runnerUpIncidenceDeg),
      );
      close(tolerance, e.tolerance, "tolerance");
      if (e.distance !== null && e.runnerUpDistance !== null) {
        close(e.runnerUpDistance - e.distance, e.margin, "margin");
      }

      // the depth each tolerance assumes
      for (const part of fixture.parts) {
        const size = modelOctreeSize(part.mesh);
        expect(part.octreeDepth.depth, `${fixture.id} ${part.name}`).toBe(
          size.depth,
        );
        close(
          part.octreeDepth.rootHalfWidth,
          size.rootHalfWidth,
          `${part.name} root`,
        );
        close(
          part.octreeDepth.leafHalfWidth,
          size.leafHalfWidth,
          `${part.name} leaf`,
        );
      }

      // every missed part is listed with its clearance and one leaf diagonal
      const missed = answer.parts.filter(
        (part) => !Number.isFinite(part.distance),
      );
      expect(
        fixture.clearances.map((c) => c.part),
        fixture.id,
      ).toEqual(missed.map((p) => p.name));
      for (const [index, entry] of fixture.clearances.entries()) {
        const part = missed[index];
        close(
          entry.clearance,
          part?.clearance ?? null,
          `${entry.part} clearance`,
        );
        close(
          entry.required,
          dockClearance(part?.leafHalfWidth ?? 0),
          `${entry.part} required`,
        );
      }
    }
  });

  it("the octree model of the C agrees on the winner, within the tolerance", () => {
    for (const fixture of fixtures) {
      const model = octreeModelAnswer(inputOf(fixture));
      expect(model.winner, fixture.id).toBe(fixture.expected.winner);
      if (fixture.expected.distance !== null) {
        expect(model.distance, fixture.id).not.toBeNull();
        const error = Math.abs(
          (model.distance ?? 0) - fixture.expected.distance,
        );
        expect(error, fixture.id).toBeLessThanOrEqual(
          fixture.expected.tolerance,
        );
      }
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// cross-tree id uniqueness

function jsonFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = `${directory}${entry.name}`;
    if (entry.isDirectory()) found.push(...jsonFiles(`${path}/`));
    else if (entry.name.endsWith(".json")) found.push(path);
  }
  return found;
}

function idsIn(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown) =>
    typeof item === "object" &&
    item !== null &&
    typeof (item as { id?: unknown }).id === "string"
      ? [(item as { id: string }).id]
      : [],
  );
}

describe("fixture ids are unique across every oracle tree", () => {
  it("no geometry id appears in any other oracle file", () => {
    const geometry = new Set<string>();
    const elsewhere: string[] = [];
    for (const file of jsonFiles(ORACLE_ROOT)) {
      const ids = idsIn(JSON.parse(readFileSync(file, "utf8")));
      if (file.startsWith(HERE)) ids.forEach((id) => geometry.add(id));
      else elsewhere.push(...ids);
    }
    expect(geometry.size).toBeGreaterThan(0);
    expect(elsewhere.filter((id) => geometry.has(id))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// octree against octree (Task 2)

/** A seeded LCG so the property loop is reproducible. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    return state / 4294967296;
  };
}

/** Calls the reference with the trees swapped (the other made axial). */
function swappedCall(
  prime: OctreeData,
  other: OctreeData,
  origin: Vec3,
  ijk: Ijk,
): boolean {
  const back = resolveVectorInIJK([-origin[0], -origin[1], -origin[2]], ijk);
  const primeAxesInOther: Ijk = [
    resolveVectorInIJK([1, 0, 0], ijk),
    resolveVectorInIJK([0, 1, 0], ijk),
    resolveVectorInIJK([0, 0, 1], ijk),
  ];
  return isHitByOctreeReference(other, prime, back, primeAxesInOther);
}

/** Mutant: the larger tree is always axial (the superseded rule). */
function largerAlwaysAxial(
  prime: OctreeData,
  other: OctreeData,
  origin: Vec3,
  ijk: Ijk,
): boolean {
  return prime.radius < other.radius
    ? swappedCall(prime, other, origin, ijk)
    : isHitByOctreeReference(prime, other, origin, ijk);
}

/** Mutant: the smaller tree is always axial. */
function smallerAlwaysAxial(
  prime: OctreeData,
  other: OctreeData,
  origin: Vec3,
  ijk: Ijk,
): boolean {
  return prime.radius > other.radius
    ? swappedCall(prime, other, origin, ijk)
    : isHitByOctreeReference(prime, other, origin, ijk);
}

const cell = (radius: number): OctreeData => ({ radius, root: -1 });

describe("octree helpers (Octree.m:70, :158-161, OOTriangle.h:58-65)", () => {
  it("offsetForOctant is minus the child's centre, a set bit the positive half", () => {
    expect(offsetForOctant(0, 2)).toEqual([1, 1, 1]);
    expect(offsetForOctant(5, 2)).toEqual([-1, 1, -1]); // x and z set
    expect(offsetForOctant(7, 4)).toEqual([-2, -2, -2]);
  });

  it("change_oct visits the nearest octant, its three faces, three edges, the far corner", () => {
    expect([...CHANGE_OCT]).toEqual([0, 1, 2, 4, 3, 5, 6, 7]);
  });

  it("resolveVectorInIJK dots with each axis (B^T v for axes as columns)", () => {
    const ijk: Ijk = [
      [0, 1, 0],
      [-1, 0, 0],
      [0, 0, 1],
    ]; // the other's x axis is the prime's +y: a quarter turn about z
    expect(resolveVectorInIJK([0, 3, 0], ijk)).toEqual([3, 0, 0]);
  });
});

describe("isHitByOctreeReference on single cells (Octree.m:473-525)", () => {
  it("hits overlapping cubes, misses cubes one metre apart, hits cubes touching on a face", () => {
    expect(
      isHitByOctreeReference(cell(1), cell(1), [1, 0.5, 0], IDENTITY_IJK),
    ).toBe(true);
    expect(
      isHitByOctreeReference(cell(1), cell(1), [3, 0, 0], IDENTITY_IJK),
    ).toBe(false);
    // :504-512 rejects only on a strict compare: -2 + 1 < -1 is false
    expect(
      isHitByOctreeReference(cell(1), cell(1), [2, 0, 0], IDENTITY_IJK),
    ).toBe(true);
    // :497-503 likewise: 3 - 1 > 2 is false
    expect(
      isHitByOctreeReference(cell(2), cell(1), [3, 0, 0], IDENTITY_IJK),
    ).toBe(true);
    expect(
      isHitByOctreeReference(cell(2), cell(1), [3.5, 0, 0], IDENTITY_IJK),
    ).toBe(false);
  });

  it("never collides an empty root", () => {
    expect(
      isHitByOctreeReference(
        { radius: 2, root: 0 },
        cell(2),
        [0, 0, 0],
        IDENTITY_IJK,
      ),
    ).toBe(false);
    expect(
      isHitByOctreeReference(
        cell(2),
        { radius: 2, root: 0 },
        [0, 0, 0],
        IDENTITY_IJK,
      ),
    ).toBe(false);
  });
});

/**
 * The intent of every octree fixture, written by hand beside the JSON: id
 * and the expected answer (true/false for a pair, the result for a compose).
 */
const OCTREE_INTENT: readonly (readonly [string, boolean | string])[] = [
  ["octree-single-cells-overlap-hit", true],
  ["octree-single-cells-one-metre-apart-miss", false],
  ["octree-single-cells-face-touch-hit", true],
  ["octree-single-cells-face-touch-smaller-other-hit", true],
  ["octree-depth2-face-contact-hit", true],
  ["octree-depth2-gap-miss", false],
  ["octree-depth2-deep-overlap-hit", true],
  ["octree-depth2-clear-miss", false],
  ["octree-rotated-45-z", false],
  ["octree-rotated-oblique-axis", false],
  ["octree-rotated-decomposition-transposed", false],
  ["octree-pruned-corner", false],
  ["octree-prime-smaller-axial-prime", true],
  ["octree-prime-larger-axial-prime", true],
  ["octree-empty-prime-root-miss", false],
  ["octree-empty-other-root-miss", false],
  ["octree-compose-hull-hull-returns-other", "other"],
  ["octree-compose-prime-sub-other-hull-returns-other", "other"],
  ["octree-compose-prime-hull-other-sub-returns-subentity", "otherSubentity:1"],
  ["octree-sub-sub-returns-other", "other"],
  ["octree-compose-none", "none"],
  ["octree-compose-empty-roots-never-collide", "none"],
  ["octree-compose-rotated-prime-sub-offset", "other"],
];

function intentOf(fixture: OctreeCollideFixture): boolean | string {
  if (fixture.kind === "pair") return fixture.expected.hit;
  const result = fixture.expected.result;
  return typeof result === "string"
    ? result
    : `otherSubentity:${result.otherSubentity}`;
}

describe("octree fixtures (octree-collide.json)", () => {
  const fixtures = OctreeCollideFileSchema.parse(
    readJson(OCTREE_COLLIDE_FIXTURE_FILE),
  );
  const pairs = fixtures.filter(
    (f): f is OctreePairFixture => f.kind === "pair",
  );
  const byId = (id: string): OctreeCollideFixture => {
    const found = fixtures.find((f) => f.id === id);
    if (found === undefined) throw new Error(`no octree fixture ${id}`);
    return found;
  };
  const pairById = (id: string): OctreePairFixture => {
    const found = byId(id);
    if (found.kind !== "pair") throw new Error(`${id} is not a pair fixture`);
    return found;
  };

  it("holds at least fourteen fixtures, the intent table one to one", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(14);
    expect(fixtures.map((f) => f.id)).toEqual(OCTREE_INTENT.map(([id]) => id));
    for (const [id, intent] of OCTREE_INTENT)
      expect(intentOf(byId(id)), id).toBe(intent);
  });

  it("re-derives every fixture from the transliterated C", () => {
    for (const fixture of fixtures) {
      expect(() => OctreeCollideFixtureSchema.parse(fixture)).not.toThrow();
      if (fixture.kind === "pair") {
        const hit = isHitByOctreeReference(
          fixture.prime,
          fixture.other,
          fixture.origin,
          fixture.ijk,
        );
        expect(hit, fixture.id).toBe(fixture.expected.hit);
        const brute = bruteForceOverlap(
          fixture.prime,
          fixture.other,
          fixture.origin,
          fixture.ijk,
        );
        expect(brute.overlap, fixture.id).toBe(
          fixture.geometry.bruteForceOverlap,
        );
        if (fixture.geometry.depth === null) {
          expect(brute.depth, fixture.id).toBe(-Infinity);
        } else {
          expect(
            Math.abs(brute.depth - fixture.geometry.depth),
            fixture.id,
          ).toBeLessThanOrEqual(1e-9);
        }
      } else {
        expect(
          doOctreesCollideReference(fixture.prime, fixture.other),
          fixture.id,
        ).toEqual(fixture.expected.result);
      }
    }
  });

  it("pins the pruned corner: a reference miss that exact geometry overlaps", () => {
    const fixture = pairById("octree-pruned-corner");
    expect(fixture.prunedCorner).toBe(true);
    expect(
      isHitByOctreeReference(
        fixture.prime,
        fixture.other,
        fixture.origin,
        fixture.ijk,
      ),
    ).toBe(false);
    expect(
      bruteForceOverlap(
        fixture.prime,
        fixture.other,
        fixture.origin,
        fixture.ijk,
      ).overlap,
    ).toBe(true);
    // the overlap lies outside the other's inscribed sphere: its centre is
    // further than its radius from the axial cube along x (5.25 - 1 > 4)
    expect(fixture.origin[0] - fixture.other.radius).toBeGreaterThan(
      fixture.prime.radius,
    );
  });

  it("gives the C's answer for a rotated other, not the axis-aligned one", () => {
    for (const id of ["octree-rotated-45-z", "octree-rotated-oblique-axis"]) {
      const fixture = pairById(id);
      const aligned = isHitByOctreeReference(
        fixture.prime,
        fixture.other,
        fixture.origin,
        IDENTITY_IJK,
      );
      expect(aligned, id).not.toBe(fixture.expected.hit);
      expect(fixture.wegoliteBasis, id).toBeDefined();
    }
    // the oblique turn is about an axis with x, y and z components
    const [i, j, k] = pairById("octree-rotated-oblique-axis").ijk;
    const axis = [j[2] - k[1], k[0] - i[2], i[1] - j[0]];
    for (const component of axis)
      expect(Math.abs(component)).toBeGreaterThan(0.1);
  });

  it("carries every rotated basis in Wegolite axes (S B S)", () => {
    const rotated = fixtures
      .flatMap((f) =>
        f.kind === "pair"
          ? [{ ijk: f.ijk, basis: f.wegoliteBasis }]
          : [f.prime, f.other].map((h) => ({
              ijk: h.ijk,
              basis: h.wegoliteBasis,
            })),
      )
      .filter((entry) => entry.basis !== undefined);
    expect(rotated.length).toBeGreaterThanOrEqual(2);
    // Largest entry-wise difference; numeric, because JSON stores -0 as 0.
    const gap = (
      a: readonly (readonly number[])[],
      b: readonly (readonly number[])[],
    ): number =>
      Math.max(
        ...[0, 1, 2].flatMap((r) =>
          [0, 1, 2].map((c) =>
            Math.abs((a[r]?.[c] ?? NaN) - (b[r]?.[c] ?? NaN)),
          ),
        ),
      );
    for (const { ijk, basis } of rotated) {
      if (basis === undefined) throw new Error("filtered above");
      expect(gap(basis, wegoliteBasisOf(ijk))).toBeLessThanOrEqual(1e-12);
    }

    // The oblique turn defeats a port that maps the quaternion by negating
    // one component: B as a unit quaternion (w, x, y, z); S B S is the turn
    // (w, -x, -y, z); every single-component negation lands elsewhere.
    const oblique = pairById("octree-rotated-oblique-axis");
    const b = [0, 1, 2].map((r) =>
      [0, 1, 2].map((c) => oblique.ijk[c]?.[r] ?? 0),
    );
    const at = (r: number, c: number): number => b[r]?.[c] ?? NaN;
    const w = Math.sqrt(1 + at(0, 0) + at(1, 1) + at(2, 2)) / 2;
    const q = [
      w,
      (at(2, 1) - at(1, 2)) / (4 * w),
      (at(0, 2) - at(2, 0)) / (4 * w),
      (at(1, 0) - at(0, 1)) / (4 * w),
    ];
    const matrixOf = ([
      qw = 0,
      qx = 0,
      qy = 0,
      qz = 0,
    ]: number[]): number[][] => [
      [
        1 - 2 * (qy * qy + qz * qz),
        2 * (qx * qy - qz * qw),
        2 * (qx * qz + qy * qw),
      ],
      [
        2 * (qx * qy + qz * qw),
        1 - 2 * (qx * qx + qz * qz),
        2 * (qy * qz - qx * qw),
      ],
      [
        2 * (qx * qz - qy * qw),
        2 * (qy * qz + qx * qw),
        1 - 2 * (qx * qx + qy * qy),
      ],
    ];
    expect(gap(matrixOf(q), b)).toBeLessThanOrEqual(1e-12);
    const basis = oblique.wegoliteBasis ?? [];
    const [qw = 0, qx = 0, qy = 0, qz = 0] = q;
    expect(gap(matrixOf([qw, -qx, -qy, qz]), basis)).toBeLessThanOrEqual(1e-12);
    for (const negated of [0, 1, 2, 3]) {
      const mutant = q.map((value, index) =>
        index === negated ? -value : value,
      );
      expect(gap(matrixOf(mutant), basis), `negate ${negated}`).toBeGreaterThan(
        0.1,
      );
    }
  });

  it("keeps the C's transposed child placement (:552) where it disagrees with geometry", () => {
    const fixture = pairById("octree-rotated-decomposition-transposed");
    const brute = bruteForceOverlap(
      fixture.prime,
      fixture.other,
      fixture.origin,
      fixture.ijk,
    );
    expect(fixture.expected.hit).toBe(false);
    expect(brute.overlap).toBe(true);
    // deeper than any crude-prune slack: the prunes alone cannot explain it
    const slack =
      (Math.sqrt(3) - 1) * Math.max(fixture.prime.radius, fixture.other.radius);
    expect(brute.depth).toBeGreaterThan(slack);
  });

  it("keeps the prime axial: each prime-role fixture flips under its own mutant", () => {
    const smaller = pairById("octree-prime-smaller-axial-prime");
    expect(smaller.prime.radius).toBeLessThan(smaller.other.radius);
    expect(
      largerAlwaysAxial(
        smaller.prime,
        smaller.other,
        smaller.origin,
        smaller.ijk,
      ),
    ).not.toBe(smaller.expected.hit);
    const larger = pairById("octree-prime-larger-axial-prime");
    expect(larger.prime.radius).toBeGreaterThan(larger.other.radius);
    expect(
      smallerAlwaysAxial(larger.prime, larger.other, larger.origin, larger.ijk),
    ).not.toBe(larger.expected.hit);
  });

  it("returns the other for a subentity-against-subentity contact (stage 2 recursion)", () => {
    const fixture = byId("octree-sub-sub-returns-other");
    if (fixture.kind !== "compose") throw new Error("compose fixture expected");
    // the hulls alone do not touch, nor the prime hull and the other's subentity
    const bare = (hull: typeof fixture.prime) => ({ ...hull, subentities: [] });
    expect(
      doOctreesCollideReference(bare(fixture.prime), bare(fixture.other)),
    ).toBe("none");
    expect(doOctreesCollideReference(bare(fixture.prime), fixture.other)).toBe(
      "none",
    );
    expect(doOctreesCollideReference(fixture.prime, fixture.other)).toBe(
      "other",
    );
  });

  it("places boundary fixtures on float32-exact coordinates", () => {
    const boundary = pairs.filter((f) => f.boundary);
    expect(boundary.length).toBeGreaterThanOrEqual(3);
    for (const fixture of boundary) {
      for (const value of [
        ...fixture.origin,
        fixture.prime.radius,
        fixture.other.radius,
      ]) {
        expect(Math.fround(value), fixture.id).toBe(value);
      }
    }
  });
});

/**
 * The crude-prune slack. `isHitByOctree` compares the smaller node's
 * inscribed-sphere box (half-width r, `Octree.m:497-512`) with the larger
 * node's cube, while the smaller node's cube reaches sqrt(3) r from its
 * centre. So (a) a rejected pair can still have cells overlapping by less
 * than (sqrt(3) - 1) r along the larger node's face axis, and (b) a passed
 * solid pair can be up to (sqrt(3) - 1) r apart (the sphere box's corner
 * reaches further than the cube when the frames differ). r is at most the
 * larger root half-width, so `(sqrt(3) - 1) max(root radii)` bounds both.
 * The loop draws symmetric poses only (identity and half turns), where the
 * C's child placement at :552 (`B^T`) equals the geometric one (`B`); the
 * fixture `octree-rotated-decomposition-transposed` pins the asymmetric case.
 */
describe("soundness and completeness of the reference (seeded, depth-2 trees)", () => {
  const random = lcg(0x18_02);
  const radii = [1, 2, 3, 4, 6, 8];

  function randomTree(depth: number, inner: number): OctNode {
    const r = random();
    if (depth > 0 && r < inner) {
      return Array.from({ length: 8 }, () =>
        randomTree(depth - 1, inner * 0.6),
      );
    }
    return r < inner + 0.35 ? -1 : 0;
  }

  function halfTurn(): Ijk {
    let n: Vec3 = [0, 0, 0];
    while (Math.hypot(n[0], n[1], n[2]) < 0.2) {
      n = [random() * 2 - 1, random() * 2 - 1, random() * 2 - 1];
    }
    const l = Math.hypot(n[0], n[1], n[2]);
    const u: Vec3 = [n[0] / l, n[1] / l, n[2] / l];
    const b = (r: number, c: number): number =>
      2 * (u[r] ?? 0) * (u[c] ?? 0) - (r === c ? 1 : 0);
    return [
      [b(0, 0), b(1, 0), b(2, 0)],
      [b(0, 1), b(1, 1), b(2, 1)],
      [b(0, 2), b(1, 2), b(2, 2)],
    ];
  }

  it("never invents a contact and never over-prunes beyond the slack (1000 cases)", () => {
    let hits = 0;
    let deep = 0;
    let prunedWithinSlack = 0;
    for (let n = 0; n < 1000; n += 1) {
      const prime: OctreeData = {
        radius: radii[Math.floor(random() * radii.length)] ?? 1,
        root: randomTree(2, 0.5),
      };
      const other: OctreeData = {
        radius: radii[Math.floor(random() * radii.length)] ?? 1,
        root: randomTree(2, 0.5),
      };
      const identity = random() < 0.4;
      const ijk = identity ? IDENTITY_IJK : halfTurn();
      const spread = (prime.radius + other.radius) * 1.2;
      const origin: Vec3 = [
        (random() * 2 - 1) * spread,
        (random() * 2 - 1) * spread,
        (random() * 2 - 1) * spread,
      ];
      const hit = isHitByOctreeReference(prime, other, origin, ijk);
      const brute = bruteForceOverlap(prime, other, origin, ijk);
      const slack = (Math.sqrt(3) - 1) * Math.max(prime.radius, other.radius);
      const label = JSON.stringify({ prime, other, origin, ijk });
      // soundness: a reported hit has solid cells at most the slack apart
      if (hit) expect(brute.depth, label).toBeGreaterThanOrEqual(-slack);
      // completeness: cells overlapping deeper than the slack are a hit
      if (brute.depth > slack) expect(hit, label).toBe(true);
      // with identity axes every prune is exact: hit if and only if overlap
      if (identity) expect(hit, label).toBe(brute.overlap);
      if (hit) hits += 1;
      if (brute.depth > slack) deep += 1;
      if (!hit && brute.overlap) prunedWithinSlack += 1;
    }
    // non-vacuity: the loop reaches hits, deep overlaps and crude-prune misses
    expect(hits).toBeGreaterThan(50);
    expect(deep).toBeGreaterThan(20);
    expect(prunedWithinSlack).toBeGreaterThan(0);
  });
});

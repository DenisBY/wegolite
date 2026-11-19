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
import { rayMeshDistance } from "./ray-mesh.js";
import {
  DOCK_MOUTH_FIXTURE_FILE,
  DockMouthFileSchema,
  DockMouthFixtureSchema,
  type DockMouthFixture,
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

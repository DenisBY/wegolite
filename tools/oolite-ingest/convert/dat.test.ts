// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The mesh grammar against the real pinned models and five fixtures (DATA-03,
 * D-17, D-19, T-02-03, T-02-15).
 *
 * The five vendored files are the fidelity contract: exact vertex/face counts,
 * the two separator dialects, the Cobra's integer material keys plus `NAMES`,
 * and the Coriolis's PNG material keys. The fixtures pin what the real data
 * cannot: a four-vertex face (warn, use three), a two-vertex face and a
 * truncated section (hard `DAT_MESH`), an oversized `NVERTS` (refused before
 * allocation), and a non-finite coordinate (named section and line).
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import {
  MODEL_BOUNDS,
  assertBounds,
  boundingBox,
  materialName,
  parseDat,
  repairWinding,
  resolveCornerNormals,
  selectNormalMode,
} from "./dat.js";
import type { ParsedMesh, Vec2, Vec3 } from "./dat.js";

const MODELS_DIR = "third_party/oolite/Models";
const FIXTURES_DIR = "tests/fixtures/dat";

const CORIOLIS_MODELS = [
  `${MODELS_DIR}/oolite_coriolis.dat`,
  `${MODELS_DIR}/oolite_coriolis_faceplate.dat`,
  `${MODELS_DIR}/oolite_coriolis_tris.dat`,
  `${MODELS_DIR}/oolite_coriolis_dock.dat`,
] as const;

interface ModelFact {
  readonly file: string;
  readonly nverts: number;
  readonly nfaces: number;
}

/** Counts measured from the pinned snapshot (RESEARCH §P4.1). */
const MODELS: readonly ModelFact[] = [
  {
    file: `${MODELS_DIR}/oolite_cobra3.dat`,
    nverts: 1548,
    nfaces: 1076,
  },
  {
    file: `${MODELS_DIR}/oolite_coriolis.dat`,
    nverts: 48,
    nfaces: 50,
  },
  {
    file: `${MODELS_DIR}/oolite_coriolis_faceplate.dat`,
    nverts: 1140,
    nfaces: 1820,
  },
  {
    file: `${MODELS_DIR}/oolite_coriolis_tris.dat`,
    nverts: 42,
    nfaces: 26,
  },
  {
    file: `${MODELS_DIR}/oolite_coriolis_dock.dat`,
    nverts: 244,
    nfaces: 330,
  },
];

function readMesh(file: string): ParsedMesh {
  return parseDat(readFileSync(file, "utf8"), file);
}

function readFixture(name: string): ParsedMesh {
  return readMesh(`${FIXTURES_DIR}/${name}`);
}

/** Run `body`, require a located `DAT_MESH` failure, and return it. */
function datError(body: () => unknown): ContentError {
  try {
    body();
  } catch (error) {
    if (!isContentError(error)) throw error;
    expect(error.code).toBe("DAT_MESH");
    return error;
  }
  throw new Error("expected a DAT_MESH failure, but the call returned");
}

describe("the five pinned meshes", () => {
  it("parses every model to its exact vertex and face counts", () => {
    for (const model of MODELS) {
      const mesh = readMesh(model.file);
      expect(mesh.nverts, model.file).toBe(model.nverts);
      expect(mesh.nfaces, model.file).toBe(model.nfaces);
      expect(mesh.vertices.length, model.file).toBe(model.nverts);
      expect(mesh.faces.length, model.file).toBe(model.nfaces);
    }
  });

  it("uses the integer material keys and NAMES names for the Cobra", () => {
    const mesh = readMesh(`${MODELS_DIR}/oolite_cobra3.dat`);
    expect(mesh.materials.map((material) => material.key)).toEqual(["0", "1"]);
    expect(mesh.materials.map((material) => material.name)).toEqual([
      "Gun",
      "Hull",
    ]);
    expect(mesh.names).toEqual(["Gun", "Hull"]);
    expect(mesh.caseSensitiveNames).toBe(true);
    expect(mesh.normals?.length).toBe(1548);
  });

  it("uses the PNG filename as the material key for the Coriolis parts", () => {
    for (const model of MODELS.slice(1)) {
      const mesh = readMesh(model.file);
      const filename = model.file.slice(model.file.lastIndexOf("/") + 1);
      const expectedKey = filename.replace(/\.dat$/, "_diffuse.png");
      expect(mesh.materials, model.file).toHaveLength(1);
      expect(mesh.materials[0]?.key, model.file).toBe(expectedKey);
      expect(mesh.materials[0]?.name, model.file).toBe(expectedKey);
      expect(mesh.names, model.file).toBeNull();
      expect(mesh.normals, model.file).toBeNull();
    }
  });

  it("never produces a non-finite vertex, normal or UV component", () => {
    for (const model of MODELS) {
      const mesh = readMesh(model.file);
      for (const vertex of mesh.vertices) {
        expect(
          [vertex.x, vertex.y, vertex.z].every((value) =>
            Number.isFinite(value),
          ),
          model.file,
        ).toBe(true);
      }
      for (const face of mesh.faces) {
        const components = [
          face.normal.x,
          face.normal.y,
          face.normal.z,
          ...face.uv.flat(),
        ];
        expect(
          components.every((value) => Number.isFinite(value)),
          model.file,
        ).toBe(true);
      }
      for (const normal of mesh.normals ?? []) {
        expect(
          [normal.x, normal.y, normal.z].every((value) =>
            Number.isFinite(value),
          ),
          model.file,
        ).toBe(true);
      }
    }
  });
});

describe("the comma dialect and the four-vertex face", () => {
  it("truncates a four-vertex face to three and collects a warning", () => {
    const mesh = readFixture("quad-face.dat");
    expect(mesh.nfaces).toBe(1);
    expect(mesh.faces[0]?.vertices).toEqual([0, 1, 2]);
    expect(mesh.faces[0]?.uv).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
    ]);
    expect(mesh.warnings).toHaveLength(1);
    expect(mesh.warnings[0]).toContain("face 0");
    expect(mesh.warnings[0]).toContain("4");
    expect(mesh.warnings[0]).toContain("first three");
  });

  it("parses the comma variant to identical geometry", () => {
    const whitespace = readFixture("quad-face.dat");
    const commas = readFixture("quad-face-comma.dat");
    expect(commas.vertices).toEqual(whitespace.vertices);
    expect(commas.faces).toEqual(whitespace.faces);
    expect(commas.materials).toEqual(whitespace.materials);
    expect(commas.warnings).toEqual(whitespace.warnings);
  });
});

describe("malformed meshes fail with a located DAT_MESH", () => {
  it("rejects a face with fewer than three vertices and names the face", () => {
    const error = datError(() => readFixture("face-underflow.dat"));
    expect(error.file).toBe(`${FIXTURES_DIR}/face-underflow.dat`);
    expect(error.construct).toContain("face 0");
    expect(error.message).toContain("fewer than three");
  });

  it("rejects a file whose declared face count is not present", () => {
    const error = datError(() => readFixture("broken-truncated.dat"));
    expect(error.file).toBe(`${FIXTURES_DIR}/broken-truncated.dat`);
    expect(error.construct).toContain("FACES");
  });

  it("rejects an NVERTS above the cap before allocating", () => {
    const error = datError(() => readFixture("oversize-nverts.dat"));
    expect(error.file).toBe(`${FIXTURES_DIR}/oversize-nverts.dat`);
    expect(error.construct).toBe("NVERTS");
    expect(error.message).toContain("200000");
  });

  it("rejects a non-finite coordinate naming the section and line", () => {
    const source = [
      "NVERTS 3",
      "NFACES 1",
      "VERTEX",
      "0 0 0",
      "NaN 0 0",
      "0 1 0",
      "FACES",
      "0 0 0\t0 0 1\t3\t0 1 2",
      "TEXTURES",
      "nan.png\t1.0 1.0\t0.0 0.0\t1.0 0.0\t0.0 1.0",
      "END",
    ].join("\n");
    const error = datError(() => parseDat(source, "nan-fixture.dat"));
    expect(error.construct).toContain("VERTEX");
    expect(error.line).toBe(5);
    expect(error.message).toContain("not finite");
  });
});

interface SyntheticFace {
  readonly smoothGroup: number;
  readonly normal: Vec3;
  readonly vertices: [number, number, number];
  readonly uv: [Vec2, Vec2, Vec2];
}

function syntheticMesh(
  vertices: Vec3[],
  specs: readonly SyntheticFace[],
  normals: Vec3[] | null = null,
): ParsedMesh {
  return {
    nverts: vertices.length,
    nfaces: specs.length,
    vertices,
    faces: specs.map((spec) => ({ ...spec, materialIndex: 0 })),
    materials: [{ index: 0, key: "synthetic", name: "synthetic" }],
    normals,
    names: null,
    caseSensitiveNames: false,
    warnings: [],
  };
}

function basename(file: string): string {
  return file.slice(file.lastIndexOf("/") + 1);
}

describe("normal selection and winding repair", () => {
  it("selects explicit for the Cobra and per-face for every Coriolis part", () => {
    const cobra = readMesh(`${MODELS_DIR}/oolite_cobra3.dat`);
    expect(selectNormalMode(cobra, { smooth: false })).toBe("explicit");
    // The NORMALS block wins regardless of the shipdata smooth flag.
    expect(selectNormalMode(cobra, { smooth: true })).toBe("explicit");

    for (const file of CORIOLIS_MODELS) {
      const mesh = readMesh(file);
      expect(selectNormalMode(mesh, { smooth: false }), file).toBe("per-face");
      expect(selectNormalMode(mesh, { smooth: true }), file).toBe("smooth");
    }
  });

  it("exposes 1,548 explicit normals with 595 distinct values for the Cobra", () => {
    const mesh = readMesh(`${MODELS_DIR}/oolite_cobra3.dat`);
    expect(mesh.normals).not.toBeNull();
    expect(mesh.normals?.length).toBe(1548);
    const distinct = new Set(
      (mesh.normals ?? []).map(
        (normal) => `${normal.x},${normal.y},${normal.z}`,
      ),
    );
    expect(distinct.size).toBe(595);

    const corners = resolveCornerNormals(mesh, "explicit");
    const first = mesh.faces[0];
    expect(corners).toHaveLength(1076);
    for (let corner = 0; corner < 3; corner++) {
      const vertexIndex = first?.vertices[corner];
      const normal = mesh.normals?.[vertexIndex ?? -1];
      expect(corners[0]?.[corner]).toEqual(normal);
    }
  });

  it("maps a face to its NAMES material name", () => {
    const mesh = readMesh(`${MODELS_DIR}/oolite_cobra3.dat`);
    const first = mesh.faces[0];
    if (first === undefined) throw new Error("missing first face");
    expect(materialName(mesh, first)).toBe("Gun");
  });

  it("swaps no winding on any of the four Coriolis parts", () => {
    for (const file of CORIOLIS_MODELS) {
      const mesh = readMesh(file);
      expect(repairWinding(mesh, "per-face"), file).toBe(0);
    }
  });

  it("assigns the flipped calculated normal and swaps a zero-normal face", () => {
    const mesh = syntheticMesh(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      [
        {
          smoothGroup: 0,
          normal: { x: 0, y: 0, z: 0 },
          vertices: [0, 1, 2],
          uv: [
            [0, 0],
            [0.5, 0.25],
            [1, 1],
          ],
        },
      ],
    );
    expect(repairWinding(mesh, "per-face")).toBe(1);
    const face = mesh.faces[0];
    // +normalize(cross(v1-v0, v2-v0)) — the flip of normal_to_surface.
    expect(face?.normal).toEqual({ x: 0, y: 0, z: 1 });
    expect(face?.vertices).toEqual([2, 1, 0]);
  });

  it("swaps the corner indices and their UV pairs together on a disagreement", () => {
    const mesh = syntheticMesh(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      [
        {
          smoothGroup: 0,
          normal: { x: 0, y: 0, z: 1 },
          vertices: [0, 1, 2],
          uv: [
            [0, 0],
            [0.5, 0.25],
            [1, 1],
          ],
        },
      ],
    );
    expect(repairWinding(mesh, "per-face")).toBe(1);
    const face = mesh.faces[0];
    expect(face?.vertices).toEqual([2, 1, 0]);
    expect(face?.uv).toEqual([
      [1, 1],
      [0.5, 0.25],
      [0, 0],
    ]);
    // Never one without the other: corner 0 must be the old corner 2 in both.
    expect(face?.uv[0]).toEqual([1, 1]);
    expect(face?.vertices[0]).toBe(2);
  });

  it("repairs a smooth-mode face before the area-weighted average", () => {
    // Face A is a zero-normal, clockwise triangle with twice the area of B.
    // Repair must give it -Z and swap its corners *before* the average; an
    // un-repaired zero normal would leave the shared corners at +Z.
    const mesh = syntheticMesh(
      [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 2, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      [
        {
          smoothGroup: 0,
          normal: { x: 0, y: 0, z: 0 },
          vertices: [0, 2, 1],
          uv: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
        {
          smoothGroup: 0,
          normal: { x: 0, y: 0, z: 1 },
          vertices: [0, 3, 1],
          uv: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
      ],
    );
    expect(repairWinding(mesh, "smooth")).toBe(1);
    const first = mesh.faces[0];
    expect(first?.normal).toEqual({ x: 0, y: 0, z: -1 });
    expect(first?.vertices).toEqual([1, 2, 0]);

    const corners = resolveCornerNormals(mesh, "smooth");
    for (const corner of corners[0] ?? []) {
      expect(corner).toEqual({ x: 0, y: 0, z: -1 });
    }
  });

  it("returns the repaired face normal for per-face mode", () => {
    const mesh = syntheticMesh(
      [
        { x: 0, y: 0, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      [
        {
          smoothGroup: 0,
          normal: { x: 0, y: 0, z: 1 },
          vertices: [0, 1, 2],
          uv: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
      ],
    );
    repairWinding(mesh, "per-face");
    const corners = resolveCornerNormals(mesh, "per-face");
    expect(corners[0]).toEqual([
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
      { x: 0, y: 0, z: 1 },
    ]);
  });
});

describe("bounding boxes and texture coordinates", () => {
  it("matches the five recorded extents", () => {
    for (const model of MODELS) {
      const mesh = readMesh(model.file);
      const filename = basename(model.file);
      assertBounds(
        mesh,
        MODEL_BOUNDS[filename] ?? { x: 0, y: 0, z: 0 },
        model.file,
      );
      const bounds = boundingBox(mesh);
      expect(bounds.max.x - bounds.min.x, model.file).toBeCloseTo(
        MODEL_BOUNDS[filename]?.x ?? 0,
        3,
      );
      expect(bounds.max.y - bounds.min.y, model.file).toBeCloseTo(
        MODEL_BOUNDS[filename]?.y ?? 0,
        3,
      );
      expect(bounds.max.z - bounds.min.z, model.file).toBeCloseTo(
        MODEL_BOUNDS[filename]?.z ?? 0,
        3,
      );
    }
  });

  it("throws MESH_BOUNDS naming the file and the axis on a mismatch", () => {
    const mesh = syntheticMesh(
      [
        { x: 0, y: 0, z: 0 },
        { x: 2, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 },
      ],
      [
        {
          smoothGroup: 0,
          normal: { x: 0, y: 0, z: 1 },
          vertices: [0, 1, 2],
          uv: [
            [0, 0],
            [1, 0],
            [0, 1],
          ],
        },
      ],
    );
    try {
      assertBounds(mesh, { x: 3, y: 1, z: 0 }, "synthetic.dat");
      throw new Error("expected MESH_BOUNDS");
    } catch (error) {
      if (!isContentError(error)) throw error;
      expect(error.code).toBe("MESH_BOUNDS");
      expect(error.file).toBe("synthetic.dat");
      expect(error.construct).toContain("x");
      expect(error.construct).not.toContain("y");
    }
  });

  it("keeps every UV in [0,1] with the authored texture size of 1", () => {
    for (const model of MODELS) {
      const mesh = readMesh(model.file);
      for (const face of mesh.faces) {
        for (const [u, v] of face.uv) {
          expect(u, model.file).toBeGreaterThanOrEqual(0);
          expect(u, model.file).toBeLessThanOrEqual(1);
          expect(v, model.file).toBeGreaterThanOrEqual(0);
          expect(v, model.file).toBeLessThanOrEqual(1);
        }
      }

      // Every TEXTURES line declares max_x = max_y = 1, so no division by the
      // PNG's 512/1024 pixel size can have occurred.
      const lines = readFileSync(model.file, "utf8").split("\n");
      const start = lines.findIndex((line) => line.trim() === "TEXTURES");
      expect(start, model.file).toBeGreaterThanOrEqual(0);
      for (let index = start + 1; index <= start + mesh.nfaces; index++) {
        const tokens = (lines[index] ?? "").split(",").join(" ").split(/\s+/);
        expect(tokens[1], `${model.file}:${String(index)}`).toBe("1.0");
        expect(tokens[2], `${model.file}:${String(index)}`).toBe("1.0");
      }
    }
  });
});

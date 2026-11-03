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
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";

const MODELS_DIR = "third_party/oolite/Models";
const FIXTURES_DIR = "tests/fixtures/dat";

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
      expect(mesh.materials, model.file).toHaveLength(1);
      expect(mesh.materials[0]?.key, model.file).toBe(
        "oolite_coriolis_diffuse.png",
      );
      expect(mesh.materials[0]?.name, model.file).toBe(
        "oolite_coriolis_diffuse.png",
      );
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

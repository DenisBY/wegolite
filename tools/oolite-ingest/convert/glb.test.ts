// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The deterministic GLB writer (DATA-04, DATA-07, D-05, D-07, D-08, D-09, D-20).
 *
 * The writer is ours and this file is the only place the independent reader is
 * imported: `NodeIO.readBinary` must accept the bytes we produce, so the
 * validator cannot share a bug with the producer. Every geometric assertion is
 * made on the same doubles the writer serialises, and every byte-level
 * assertion is made on the committed output.
 */

import { readFileSync } from "node:fs";

import { NodeIO } from "@gltf-transform/core";
import type { Document, GLTF } from "@gltf-transform/core";
import { describe, expect, it } from "vitest";

import { sha256Hex } from "../canonical/hash.js";
import { parseOpenStep } from "../openstep/parser.js";
import { boundingBox, parseDat, selectNormalMode } from "./dat.js";
import type { ParsedMesh, Vec3 } from "./dat.js";
import { buildCobraGlb, convertMesh, materialFor, writeGlb } from "./glb.js";
import type { GlbPrimitive, GlbScene, ShipEntry } from "./glb.js";
import { compileShips } from "./ships.js";

const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";
const MODELS = "third_party/oolite/Models";

interface BoundsRecord {
  readonly min: readonly number[];
  readonly max: readonly number[];
}

interface ShipBoundsGolden {
  readonly version: number;
  readonly cobra3: {
    readonly source: string;
    readonly sourceBounds: BoundsRecord;
    readonly converted: BoundsRecord;
    readonly cornerNormalDots: readonly (readonly [number, number])[];
  };
}

const golden = JSON.parse(
  readFileSync(
    new URL("../../../tests/golden/content/ship-bounds.json", import.meta.url),
    "utf8",
  ),
) as ShipBoundsGolden;

function readRepo(relative: string): string {
  return readFileSync(new URL(`../../../${relative}`, import.meta.url), "utf8");
}

function loadMesh(filename: string): ParsedMesh {
  const file = `${MODELS}/${filename}`;
  return parseDat(readRepo(file), file);
}

function at<T>(list: readonly T[], index: number): T {
  const value = list[index];
  if (value === undefined) {
    throw new Error(
      `missing element ${String(index)} of ${String(list.length)}`,
    );
  }
  return value;
}

const catalogue = compileShips(
  parseOpenStep(readRepo(SHIPDATA), SHIPDATA),
  parseOpenStep(readRepo(OVERRIDES), OVERRIDES),
);

function shipEntry(key: string): ShipEntry {
  for (const entry of catalogue.entries) {
    if (entry.key === key) return { key: entry.key, shipDef: entry.shipDef };
  }
  throw new Error(`shipdata entry "${key}" is missing`);
}

interface GlbJson {
  asset: { version: string; generator: string };
  scene: number;
  scenes: { nodes: number[] }[];
  nodes: { name: string; translation?: number[]; mesh: number }[];
  meshes: {
    name: string;
    primitives: {
      attributes: { POSITION: number; NORMAL: number; TEXCOORD_0: number };
      indices: number;
      material: number;
      mode: number;
    }[];
  }[];
  materials: {
    name: string;
    pbrMetallicRoughness: {
      metallicFactor: number;
      roughnessFactor: number;
      baseColorTexture?: { index: number };
    };
    normalTexture?: { index: number };
    emissiveTexture?: { index: number };
    extensions?: {
      KHR_materials_specular?: { specularTexture?: { index: number } };
    };
    extras?: { oolite?: Record<string, unknown> };
    alphaMode?: string;
  }[];
  images: { uri: string }[];
  textures: { source: number }[];
  accessors: {
    componentType: number;
    count: number;
    type: string;
    min?: number[];
    max?: number[];
  }[];
  bufferViews: { byteOffset: number; byteLength: number }[];
  buffers: { byteLength: number }[];
  extensionsUsed?: string[];
}

interface GlbChunks {
  readonly json: GlbJson;
  /** The JSON chunk's length including its 4-byte padding. */
  readonly jsonChunkLength: number;
  readonly jsonPadding: number;
  /** The BIN chunk's length including its 4-byte padding. */
  readonly binChunkLength: number;
  readonly bin: Uint8Array;
}

const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;

function readChunks(bytes: Uint8Array): GlbChunks {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expect(view.getUint32(0, true)).toBe(0x46546c67);
  expect(view.getUint32(4, true)).toBe(2);
  expect(view.getUint32(8, true)).toBe(bytes.byteLength);

  const jsonChunkLength = view.getUint32(12, true);
  expect(view.getUint32(16, true)).toBe(JSON_CHUNK_TYPE);
  const jsonText = new TextDecoder().decode(
    bytes.subarray(20, 20 + jsonChunkLength),
  );
  const trimmed = jsonText.replace(/ +$/, "");

  const binStart = 20 + jsonChunkLength;
  const binChunkLength = view.getUint32(binStart, true);
  expect(view.getUint32(binStart + 4, true)).toBe(BIN_CHUNK_TYPE);
  const bin = bytes.subarray(binStart + 8, binStart + 8 + binChunkLength);

  return {
    json: JSON.parse(trimmed) as GlbJson,
    jsonChunkLength,
    jsonPadding: jsonText.length - trimmed.length,
    binChunkLength,
    bin,
  };
}

function imageUri(json: GlbJson, textureIndex: number | undefined): string {
  if (textureIndex === undefined) throw new Error("expected a texture index");
  const texture = at(json.textures, textureIndex);
  return at(json.images, texture.source).uri;
}

/**
 * Feed our own JSON and BIN chunks to the independent reader.
 *
 * `NodeIO.readBinary` cannot be used for these files: it refuses any GLB whose
 * images are external URIs by design ("Cannot resolve external images with
 * binaryToJSON()"), and D-20 deliberately keeps the textures as separate files
 * rather than embedding them. The reader therefore receives the same JSON and
 * the same BIN chunk the file carries — nothing is re-serialised by us — plus
 * an empty payload per image URI so the material graph binds; the committed
 * bytes still name the real files, and plan 07 vendors and byte-asserts them.
 * The material test also pins the `readBinary` refusal, so external references
 * cannot silently become embedded ones.
 */
async function readWithReader(bytes: Uint8Array): Promise<Document> {
  const chunks = readChunks(bytes);
  const json = structuredClone(chunks.json) as unknown as GLTF.IGLTF;
  const resources: { [uri: string]: Uint8Array<ArrayBuffer> } = {
    bin: new Uint8Array(chunks.bin),
  };
  json.buffers = (json.buffers ?? []).map((buffer) => ({
    ...buffer,
    uri: "bin",
  }));
  for (const image of json.images ?? []) {
    if (image.uri !== undefined) resources[image.uri] = new Uint8Array(0);
  }
  return new NodeIO().readJSON({ json, resources });
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.x - right.x,
    y: left.y - right.y,
    z: left.z - right.z,
  };
}

function cross(left: Vec3, right: Vec3): Vec3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function length(vector: Vec3): number {
  return Math.sqrt(
    vector.x * vector.x + vector.y * vector.y + vector.z * vector.z,
  );
}

function unit(vector: Vec3): Vec3 {
  const size = length(vector);
  return { x: vector.x / size, y: vector.y / size, z: vector.z / size };
}

function dot(left: Vec3, right: Vec3): number {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

/** `M * -normalize(cross(v1-v0, v2-v0))` with `M = diag(1, 1, -1)`. */
function convertedOoliteNormal(v0: Vec3, v1: Vec3, v2: Vec3): Vec3 {
  const surface = cross(subtract(v1, v0), subtract(v2, v0));
  const size = length(surface);
  return {
    x: -surface.x / size,
    y: -surface.y / size,
    z: surface.z / size,
  };
}

function positionAt(primitive: GlbPrimitive, index: number): Vec3 {
  return {
    x: primitive.positions[index * 3] ?? 0,
    y: primitive.positions[index * 3 + 1] ?? 0,
    z: primitive.positions[index * 3 + 2] ?? 0,
  };
}

function normalAt(primitive: GlbPrimitive, index: number): Vec3 {
  return {
    x: primitive.normals[index * 3] ?? 0,
    y: primitive.normals[index * 3 + 1] ?? 0,
    z: primitive.normals[index * 3 + 2] ?? 0,
  };
}

/**
 * `convertMesh` emits one primitive per material in `mesh.materials` order, so
 * a face's material index is also its primitive index and the per-material
 * cursor recovers the face's slot inside that primitive.
 */
function faceCorners(
  mesh: ParsedMesh,
  primitives: readonly GlbPrimitive[],
  faceIndex: number,
  cursors: number[],
): { positions: [Vec3, Vec3, Vec3]; normals: [Vec3, Vec3, Vec3] } {
  const face = at(mesh.faces, faceIndex);
  const primitive = at(primitives, face.materialIndex);
  const slot = cursors[face.materialIndex] ?? 0;
  cursors[face.materialIndex] = slot + 1;
  const base = slot * 3;
  return {
    positions: [
      positionAt(primitive, base),
      positionAt(primitive, base + 1),
      positionAt(primitive, base + 2),
    ],
    normals: [
      normalAt(primitive, base),
      normalAt(primitive, base + 1),
      normalAt(primitive, base + 2),
    ],
  };
}

const cobraEntry = shipEntry("cobra3-player");
const cobraMesh = loadMesh("oolite_cobra3.dat");
const cobraMode = selectNormalMode(cobraMesh, {
  smooth: cobraEntry.shipDef.smooth,
});

describe("GLB container", () => {
  it("writes the glTF header, the two 4-byte aligned chunks and their padding", () => {
    const primitive: GlbPrimitive = {
      materialName: "Test",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1]),
      indices: new Uint32Array([0, 1, 2]),
      min: [0, 0, 0],
      max: [1, 1, 0],
    };
    const scene: GlbScene = {
      nodes: [
        {
          name: "triangle",
          mesh: { name: "triangle", primitives: [primitive] },
        },
      ],
      materials: [
        {
          name: "Test",
          baseColorTexture: null,
          normalTexture: null,
          specularTexture: null,
          emissiveTexture: null,
          roughnessFactor: 1,
          extrasOolite: null,
        },
      ],
    };

    const bytes = writeGlb(scene);
    const chunks = readChunks(bytes);

    expect(chunks.json.asset.version).toBe("2.0");
    expect(chunks.json.asset.generator).toBe("wegolite-oolite-ingest/1");
    // The padding is what 4-byte alignment requires, and the JSON chunk pads
    // with spaces (0x20) — a NUL there would survive the trim and fail this.
    const rawLength = chunks.jsonChunkLength - chunks.jsonPadding;
    expect(chunks.jsonPadding).toBe((4 - (rawLength % 4)) % 4);
    expect(chunks.jsonChunkLength % 4).toBe(0);
    expect(chunks.binChunkLength % 4).toBe(0);
    expect(chunks.binChunkLength).toBeGreaterThanOrEqual(
      at(chunks.json.buffers, 0).byteLength,
    );
    // BIN padding is zero-filled.
    for (
      let index = at(chunks.json.buffers, 0).byteLength;
      index < chunks.binChunkLength;
      index++
    ) {
      expect(chunks.bin[index]).toBe(0);
    }
    // Nothing follows the BIN chunk: the declared length is the file's length.
    expect(20 + chunks.jsonChunkLength + 8 + chunks.binChunkLength).toBe(
      bytes.byteLength,
    );
  });

  it("emits the same bytes twice, and the same SHA-256", () => {
    const first = buildCobraGlb(cobraMesh, cobraEntry);
    const second = buildCobraGlb(cobraMesh, cobraEntry);

    expect(second).toEqual(first);
    expect(sha256Hex(second)).toBe(sha256Hex(first));
    expect(first.byteLength).toBeGreaterThan(0);

    // The golden pins both frames: the authored extents before the conversion,
    // and the extents of the doubles actually written.
    const source = boundingBox(cobraMesh);
    expect([
      source.min.x,
      source.min.y,
      source.min.z,
      source.max.x,
      source.max.y,
      source.max.z,
    ]).toEqual([
      ...golden.cobra3.sourceBounds.min,
      ...golden.cobra3.sourceBounds.max,
    ]);
    const converted = convertMesh(cobraMesh, cobraMode, "gltf");
    const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
    const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
    for (const primitive of converted) {
      for (let axis = 0; axis < 3; axis++) {
        min[axis] = Math.min(min[axis] ?? 0, primitive.min[axis] ?? 0);
        max[axis] = Math.max(max[axis] ?? 0, primitive.max[axis] ?? 0);
      }
    }
    expect([...min, ...max]).toEqual([
      ...golden.cobra3.converted.min,
      ...golden.cobra3.converted.max,
    ]);
  });

  it("round-trips through the independent reader with one mesh and two primitives", async () => {
    const bytes = buildCobraGlb(cobraMesh, cobraEntry);
    const document = await readWithReader(bytes);
    const meshes = document.getRoot().listMeshes();

    expect(meshes).toHaveLength(1);
    const mesh = at(meshes, 0);
    expect(mesh.getName()).toBe("oolite_cobra3");
    const primitives = mesh.listPrimitives();
    expect(primitives).toHaveLength(2);
    expect(
      primitives.map((primitive) => primitive.getMaterial()?.getName()),
    ).toEqual(["Gun", "Hull"]);

    const emitted = convertMesh(cobraMesh, cobraMode, "gltf");
    for (let index = 0; index < primitives.length; index++) {
      const primitive = at(primitives, index);
      const expected = at(emitted, index);
      const position = primitive.getAttribute("POSITION");
      expect(position, expected.materialName).not.toBeNull();
      if (position === null) continue;
      expect(position.getCount()).toBe(expected.indices.length);
      expect(position.getMin([])).toEqual([...expected.min]);
      expect(position.getMax([])).toEqual([...expected.max]);
    }
  });

  it("emits one vertex per face corner, with a sequential index buffer", () => {
    const emitted = convertMesh(cobraMesh, cobraMode, "gltf");
    const faceCounts = [0, 0];
    for (const face of cobraMesh.faces) {
      faceCounts[face.materialIndex] =
        (faceCounts[face.materialIndex] ?? 0) + 1;
    }

    expect(emitted.map((primitive) => primitive.materialName)).toEqual([
      "Gun",
      "Hull",
    ]);
    for (let index = 0; index < emitted.length; index++) {
      const primitive = at(emitted, index);
      const faces = at(faceCounts, index);
      expect(primitive.indices.length).toBe(faces * 3);
      expect(primitive.positions.length).toBe(faces * 3 * 3);
      expect(primitive.uvs.length).toBe(faces * 3 * 2);
      expect([...primitive.indices]).toEqual(
        Array.from({ length: faces * 3 }, (_unused, slot) => slot),
      );
    }
    expect(faceCounts.reduce((sum, count) => sum + count, 0)).toBe(1076);
  });

  it("keeps the authored corner order so every face fronts Oolite's converted normal", () => {
    expect(golden.version).toBe(1);
    expect(golden.cobra3.source).toBe(
      "third_party/oolite/Models/oolite_cobra3.dat",
    );
    const emitted = convertMesh(cobraMesh, cobraMode, "gltf");
    const cursors = [0, 0];
    const baseline = new Map<number, number>(
      golden.cobra3.cornerNormalDots.map(([face, value]) => [face, value]),
    );

    let worst = Number.POSITIVE_INFINITY;
    let positive = 0;
    for (let faceIndex = 0; faceIndex < cobraMesh.faces.length; faceIndex++) {
      const face = at(cobraMesh.faces, faceIndex);
      const corners = faceCorners(cobraMesh, emitted, faceIndex, cursors);
      const v0 = at(cobraMesh.vertices, face.vertices[0]);
      const v1 = at(cobraMesh.vertices, face.vertices[1]);
      const v2 = at(cobraMesh.vertices, face.vertices[2]);
      const oolite = convertedOoliteNormal(v0, v1, v2);
      const [p0, p1, p2] = corners.positions;
      const front = dot(
        unit(cross(subtract(p1, p0), subtract(p2, p0))),
        oolite,
      );

      // The reflection alone yields glTF counter-clockwise: reversing the
      // corners turns every one of these into -1.
      expect(front, `face ${String(faceIndex)} front-face dot`).toBeGreaterThan(
        0,
      );
      expect(front).toBeCloseTo(1, 6);
      worst = Math.min(worst, front);

      let minimum = Number.POSITIVE_INFINITY;
      for (const normal of corners.normals) {
        const size = length(normal);
        expect(
          size,
          `face ${String(faceIndex)} corner normal length`,
        ).toBeGreaterThan(0);
        expect(Math.abs(size - 1)).toBeLessThanOrEqual(1e-5);
        minimum = Math.min(minimum, dot(unit(normal), oolite));
      }

      // 1,064 faces are positive on every corner; the 12 recorded faces carry an
      // authored explicit normal that sits a little past perpendicular, so their
      // minimum corner dot is the committed negative baseline, not a tolerance.
      const recorded = baseline.get(faceIndex);
      if (recorded === undefined) {
        positive += 1;
        expect(
          minimum,
          `face ${String(faceIndex)} minimum corner dot`,
        ).toBeGreaterThan(0);
      } else {
        expect(
          Math.abs(minimum - recorded),
          `face ${String(faceIndex)} minimum corner dot ${String(minimum)} vs recorded ${String(recorded)}`,
        ).toBeLessThanOrEqual(1e-4);
      }
    }
    expect(worst).toBeCloseTo(1, 6);
    expect(positive).toBe(1064);
    expect(baseline.size).toBe(12);
  });

  it("resolves every Cobra material texture against the measured map names", async () => {
    const hull = materialFor("Hull", cobraEntry.shipDef, cobraEntry.key);
    const gun = materialFor("Gun", cobraEntry.shipDef, cobraEntry.key);

    expect(hull.baseColorTexture).toBe("oolite_cobra3_diffuse.png");
    expect(hull.normalTexture).toBe("oolite_cobra3_normal.png");
    expect(hull.specularTexture).toBe("oolite_cobra3_specular.png");
    // The baked greyscale alpha mask, never the RGBA diffuse.
    expect(hull.emissiveTexture).toBe("oolite_cobra3_diffuse_emissive.png");
    expect(gun.baseColorTexture).toBe("oolite_cobra3_subents.png");
    expect(gun.normalTexture).toBe("oolite_cobra3_subents_normal.png");
    expect(gun.specularTexture).toBeNull();
    expect(gun.emissiveTexture).toBeNull();

    expect(hull.roughnessFactor).toBeCloseTo(0.2, 9);
    expect(gun.roughnessFactor).toBeCloseTo(0.378, 9);
    expect(hull.extrasOolite?.materialKey).toBe("Hull");
    expect(hull.extrasOolite?.shipKey).toBe("cobra3-player");
    expect(hull.extrasOolite?.gloss).toBe(0.8);
    expect(hull.extrasOolite?.shininess).toBe(42);
    expect(hull.extrasOolite?.specular_color).toEqual([0.25, 0.25, 0.25]);

    const bytes = buildCobraGlb(cobraMesh, cobraEntry);
    const { json } = readChunks(bytes);
    const document = await readWithReader(bytes);
    const materials = document.getRoot().listMaterials();
    const hullMaterial = materials.find(
      (material) => material.getName() === "Hull",
    );
    const gunMaterial = materials.find(
      (material) => material.getName() === "Gun",
    );
    if (hullMaterial === undefined || gunMaterial === undefined) {
      throw new Error("the reader lost a Cobra material");
    }

    expect(hullMaterial.getBaseColorTexture()?.getURI()).toBe(
      "../textures/oolite_cobra3_diffuse.png",
    );
    expect(hullMaterial.getNormalTexture()?.getURI()).toBe(
      "../textures/oolite_cobra3_normal.png",
    );
    expect(hullMaterial.getEmissiveTexture()?.getURI()).toBe(
      "../textures/oolite_cobra3_diffuse_emissive.png",
    );
    expect(gunMaterial.getEmissiveTexture()).toBeNull();

    const hullJson = json.materials.find(
      (material) => material.name === "Hull",
    );
    const gunJson = json.materials.find((material) => material.name === "Gun");
    if (hullJson === undefined || gunJson === undefined) {
      throw new Error("the GLB JSON lost a Cobra material");
    }
    expect(hullJson.pbrMetallicRoughness.metallicFactor).toBe(0);
    expect(hullJson.pbrMetallicRoughness.roughnessFactor).toBeCloseTo(0.2, 9);
    expect(imageUri(json, hullJson.normalTexture?.index)).toBe(
      "../textures/oolite_cobra3_normal.png",
    );
    expect(
      imageUri(
        json,
        hullJson.extensions?.KHR_materials_specular?.specularTexture?.index,
      ),
    ).toBe("../textures/oolite_cobra3_specular.png");
    expect(gunJson.extensions?.KHR_materials_specular).toBeUndefined();
    expect(json.extensionsUsed).toEqual(["KHR_materials_specular"]);

    // D-20 keeps the textures out of the container. The reader refuses a GLB
    // with external images, which is exactly the proof that they stayed
    // external rather than being silently embedded.
    await expect(new NodeIO().readBinary(bytes)).rejects.toThrow(
      "Cannot resolve external images with binaryToJSON()",
    );
  });
});

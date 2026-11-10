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
import {
  boundingBox,
  parseDat,
  repairWinding,
  selectNormalMode,
} from "./dat.js";
import type { ParsedMesh, Vec3 } from "./dat.js";
import {
  buildCobraGlb,
  buildCoriolisGlb,
  convertMesh,
  encodedTextureFile,
  materialFor,
  writeGlb,
} from "./glb.js";
import type {
  CoriolisEntries,
  CoriolisMeshes,
  GlbPrimitive,
  GlbScene,
  ShipEntry,
} from "./glb.js";
import { compileShips } from "./ships.js";

const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";
const MODELS = "third_party/oolite/Models";

interface BoundsRecord {
  readonly min: readonly number[];
  readonly max: readonly number[];
}

interface UvSignsRecord {
  readonly positive: number;
  readonly negative: number;
  readonly zeroArea: number;
}

interface CoriolisNodeGolden {
  readonly source: string;
  readonly translation: readonly number[];
  readonly sourceBounds: BoundsRecord;
  readonly converted: BoundsRecord;
  readonly uvSigns?: UvSignsRecord;
  readonly mouthFaces?: number;
}

interface ShipBoundsGolden {
  readonly version: number;
  readonly uvBasis: string;
  readonly cobra3: {
    readonly source: string;
    readonly sourceBounds: BoundsRecord;
    readonly converted: BoundsRecord;
    readonly cornerNormalDots: readonly (readonly [number, number])[];
    readonly uvSigns: UvSignsRecord;
  };
  readonly coriolis: {
    readonly hull: CoriolisNodeGolden;
    readonly faceplate: CoriolisNodeGolden;
    readonly tris: CoriolisNodeGolden;
    readonly dock: CoriolisNodeGolden;
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
      KHR_materials_specular?: {
        specularTexture?: { index: number };
        specularColorFactor?: number[];
        specularColorTexture?: { index: number };
      };
    };
    extras?: { oolite?: Record<string, unknown> };
    alphaMode?: string;
  }[];
  images: { uri: string }[];
  textures: {
    source?: number;
    extensions?: { EXT_texture_webp?: { source: number } };
  }[];
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
  extensionsRequired?: string[];
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
  const source = texture.source ?? texture.extensions?.EXT_texture_webp?.source;
  if (source === undefined) throw new Error("the texture names no image");
  return at(json.images, source).uri;
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
 *
 * The files name their WebP images through `EXT_texture_webp` and list it as
 * required. The reader here is the core package, which has no implementation
 * of that extension and refuses a required one it does not know. The copy it
 * receives therefore has each extension source moved to the core `source` and
 * the extension dropped from both lists. That is a change to the reader's
 * input only; the WebP references themselves are asserted on the raw JSON.
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
  json.textures = (json.textures ?? []).map((texture) => {
    const webp = (
      texture.extensions as
        { EXT_texture_webp?: { source: number } } | undefined
    )?.EXT_texture_webp;
    return webp === undefined ? texture : { source: webp.source };
  });
  const withoutWebp = (names: string[] | undefined): string[] =>
    (names ?? []).filter((name) => name !== "EXT_texture_webp");
  json.extensionsUsed = withoutWebp(json.extensionsUsed);
  const required = withoutWebp(json.extensionsRequired);
  if (required.length > 0) json.extensionsRequired = required;
  else delete json.extensionsRequired;
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

function uvAt(
  primitive: GlbPrimitive,
  index: number,
): readonly [number, number] {
  return [primitive.uvs[index * 2] ?? 0, primitive.uvs[index * 2 + 1] ?? 0];
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
): {
  positions: [Vec3, Vec3, Vec3];
  normals: [Vec3, Vec3, Vec3];
  uvs: [
    readonly [number, number],
    readonly [number, number],
    readonly [number, number],
  ];
  faceNormalZ: number;
} {
  const face = at(mesh.faces, faceIndex);
  const primitive = at(primitives, face.materialIndex);
  const slot = cursors[face.materialIndex] ?? 0;
  cursors[face.materialIndex] = slot + 1;
  const base = slot * 3;
  const positions: [Vec3, Vec3, Vec3] = [
    positionAt(primitive, base),
    positionAt(primitive, base + 1),
    positionAt(primitive, base + 2),
  ];
  const [p0, p1, p2] = positions;
  return {
    positions,
    normals: [
      normalAt(primitive, base),
      normalAt(primitive, base + 1),
      normalAt(primitive, base + 2),
    ],
    uvs: [
      uvAt(primitive, base),
      uvAt(primitive, base + 1),
      uvAt(primitive, base + 2),
    ],
    // The converted normal's Z, taken from the emitted corners: it is
    // `M * -normalize(cross(v1-v0, v2-v0))`, and its sign is what identifies
    // the station's -Z-facing mouth faces.
    faceNormalZ: unit(cross(subtract(p1, p0), subtract(p2, p0))).z,
  };
}

const UV_AREA_EPSILON = 1e-6;

/** Shoelace double-area of one emitted face in the pinned UV basis. */
function uvSignedArea(uvs: readonly (readonly [number, number])[]): number {
  const [first, second, third] = [at(uvs, 0), at(uvs, 1), at(uvs, 2)];
  return (
    (second[0] - first[0]) * (third[1] - first[1]) -
    (third[0] - first[0]) * (second[1] - first[1])
  );
}

function countUvSigns(
  mesh: ParsedMesh,
  primitives: readonly GlbPrimitive[],
): UvSignsRecord {
  const cursors = mesh.materials.map(() => 0);
  let positive = 0;
  let negative = 0;
  let zeroArea = 0;
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex++) {
    const area = uvSignedArea(
      faceCorners(mesh, primitives, faceIndex, cursors).uvs,
    );
    if (Math.abs(area) <= UV_AREA_EPSILON) zeroArea += 1;
    else if (area > 0) positive += 1;
    else negative += 1;
  }
  return { positive, negative, zeroArea };
}

/** Faces whose emitted normal points down the station's -Z axis. */
function mouthFaceAreas(
  mesh: ParsedMesh,
  primitives: readonly GlbPrimitive[],
): number[] {
  const cursors = mesh.materials.map(() => 0);
  const areas: number[] = [];
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex++) {
    const corners = faceCorners(mesh, primitives, faceIndex, cursors);
    if (corners.faceNormalZ < -0.999) areas.push(uvSignedArea(corners.uvs));
  }
  return areas;
}

/**
 * The `max_x`/`max_y` each `TEXTURES` line declares. A value above 1 would mean
 * the converter divided by a pixel dimension instead of the declared scale.
 */
function textureScales(source: string): { maxX: string; maxY: string }[] {
  const lines = source.split("\n").map((line) => line.replace(/\/\/.*$/, ""));
  const start = lines.findIndex((line) => line.trim() === "TEXTURES");
  if (start === -1) throw new Error("no TEXTURES section");
  const scales: { maxX: string; maxY: string }[] = [];
  for (let index = start + 1; index < lines.length; index++) {
    const line = (lines[index] ?? "").trim();
    if (
      line === "" ||
      line === "END" ||
      line.startsWith("NAMES") ||
      line.startsWith("NORMALS") ||
      line.startsWith("TANGENTS")
    ) {
      break;
    }
    const tokens = line.split(/[,\s]+/).filter(Boolean);
    scales.push({ maxX: tokens[1] ?? "", maxY: tokens[2] ?? "" });
  }
  return scales;
}

const cobraEntry = shipEntry("cobra3-player");
const cobraMesh = loadMesh("oolite_cobra3.dat");
const cobraMode = selectNormalMode(cobraMesh, {
  smooth: cobraEntry.shipDef.smooth,
});

const CORIOLIS_FILES = {
  hull: "oolite_coriolis.dat",
  faceplate: "oolite_coriolis_faceplate.dat",
  tris: "oolite_coriolis_tris.dat",
  dock: "oolite_coriolis_dock.dat",
} as const;

function coriolisEntries(): CoriolisEntries {
  return {
    hull: shipEntry("coriolis-station"),
    faceplate: shipEntry("oolite_coriolis_faceplate"),
    tris: shipEntry("oolite_coriolis_tris"),
    dock: shipEntry("oolite_coriolis_dock"),
  };
}

function coriolisMeshes(): CoriolisMeshes {
  return {
    hull: loadMesh(CORIOLIS_FILES.hull),
    faceplate: loadMesh(CORIOLIS_FILES.faceplate),
    tris: loadMesh(CORIOLIS_FILES.tris),
    dock: loadMesh(CORIOLIS_FILES.dock),
  };
}

/** Every emitted triangle must front `M * -normalize(cross(v1-v0, v2-v0))`. */
function assertFrontFaces(mesh: ParsedMesh, smooth: boolean): number {
  const mode = selectNormalMode(mesh, { smooth });
  repairWinding(mesh, mode);
  const primitives = convertMesh(mesh, mode, "gltf");
  const cursors = mesh.materials.map(() => 0);

  let checked = 0;
  for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex++) {
    const face = at(mesh.faces, faceIndex);
    const corners = faceCorners(mesh, primitives, faceIndex, cursors);
    const oolite = convertedOoliteNormal(
      at(mesh.vertices, face.vertices[0]),
      at(mesh.vertices, face.vertices[1]),
      at(mesh.vertices, face.vertices[2]),
    );
    const [p0, p1, p2] = corners.positions;
    const front = dot(unit(cross(subtract(p1, p0), subtract(p2, p0))), oolite);
    expect(front, `face ${String(faceIndex)} front-face dot`).toBeGreaterThan(
      0,
    );
    checked += 1;
  }
  return checked;
}

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
    const min = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    const max = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];
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
      "../textures/oolite_cobra3_diffuse.webp",
    );
    expect(hullMaterial.getNormalTexture()?.getURI()).toBe(
      "../textures/oolite_cobra3_normal.webp",
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
      "../textures/oolite_cobra3_normal.webp",
    );
    expect(
      imageUri(
        json,
        hullJson.extensions?.KHR_materials_specular?.specularTexture?.index,
      ),
    ).toBe("../textures/oolite_cobra3_specular.webp");
    // The same image drives the specular colour (RGB) and strength (alpha).
    const hullSpecular = hullJson.extensions?.KHR_materials_specular;
    expect(hullSpecular?.specularColorTexture?.index).toBe(
      hullSpecular?.specularTexture?.index,
    );
    expect(hullSpecular?.specularColorFactor).toEqual([1, 1, 1]);
    expect(gunJson.extensions?.KHR_materials_specular).toBeUndefined();
    expect(json.extensionsUsed).toEqual([
      "KHR_materials_specular",
      "EXT_texture_webp",
    ]);
    // There is no PNG fallback, so a loader without WebP support must refuse
    // the file instead of drawing untextured.
    expect(json.extensionsRequired).toEqual(["EXT_texture_webp"]);
    for (const texture of json.textures) {
      const webp = texture.extensions?.EXT_texture_webp;
      const index = texture.source ?? webp?.source;
      if (index === undefined) throw new Error("a texture names no image");
      const uri = at(json.images, index).uri;
      if (uri.endsWith(".webp")) {
        // Core glTF images are PNG or JPEG: a WebP has no core `source`.
        expect(texture.source, uri).toBeUndefined();
        expect(webp, uri).toBeDefined();
      } else {
        expect(uri).toMatch(/_emissive\.png$/);
        expect(texture.source, uri).toBeDefined();
        expect(webp, uri).toBeUndefined();
      }
    }

    // D-20 keeps the textures out of the container. The reader refuses a GLB
    // with external images, which is exactly the proof that they stayed
    // external rather than being silently embedded.
    await expect(new NodeIO().readBinary(bytes)).rejects.toThrow(
      "Cannot resolve external images with binaryToJSON()",
    );
  });

  it("emits the four-part Coriolis composite with its own local transforms", async () => {
    const bytes = buildCoriolisGlb(coriolisMeshes(), coriolisEntries());
    const { json } = readChunks(bytes);
    const document = await readWithReader(bytes);

    expect(json.nodes.map((node) => node.name)).toEqual([
      "hull",
      "faceplate",
      "tris",
      "dock",
    ]);
    expect(json.meshes).toHaveLength(4);
    expect(json.materials).toHaveLength(4);
    expect(document.getRoot().listNodes()).toHaveLength(4);
    expect(document.getRoot().listMeshes()).toHaveLength(4);

    // The dock's authored +500.2561 is negated by the conversion, and the value
    // is copied from the resolved subentity exactly: no re-typing, no tidying.
    expect(json.nodes.map((node) => node.translation)).toEqual([
      golden.coriolis.hull.translation,
      golden.coriolis.faceplate.translation,
      golden.coriolis.tris.translation,
      golden.coriolis.dock.translation,
    ]);
    expect(at(json.nodes, 3).translation).toEqual([0, 0, -500.2561]);

    const hullPrimitive = at(json.meshes, 0).primitives[0];
    const hullPosition = at(
      json.accessors,
      hullPrimitive?.attributes.POSITION ?? 0,
    );
    // Source z was [-500, 495.918]; the reflection swaps and negates it.
    expect(hullPosition.min?.[2]).toBeCloseTo(-495.918, 3);
    expect(hullPosition.max?.[2]).toBeCloseTo(500, 3);

    const dockPrimitive = at(json.meshes, 3).primitives[0];
    const dockPosition = at(
      json.accessors,
      dockPrimitive?.attributes.POSITION ?? 0,
    );
    // Source z was [-250, 0], so the converted local range is [0, 250].
    expect(dockPosition.min?.[2]).toBe(0);
    expect(dockPosition.max?.[2]).toBe(250);
  });

  it("pins every Coriolis node's converted bounds against the golden", async () => {
    expect(golden.version).toBe(1);
    const bytes = buildCoriolisGlb(coriolisMeshes(), coriolisEntries());
    const document = await readWithReader(bytes);

    const expected: readonly (readonly [string, CoriolisNodeGolden])[] = [
      ["hull", golden.coriolis.hull],
      ["faceplate", golden.coriolis.faceplate],
      ["tris", golden.coriolis.tris],
      ["dock", golden.coriolis.dock],
    ];

    for (const [name, record] of expected) {
      const node = document
        .getRoot()
        .listNodes()
        .find((candidate) => candidate.getName() === name);
      if (node === undefined) throw new Error(`the reader lost node "${name}"`);
      expect(node.getTranslation()).toEqual([...record.translation]);

      const mesh = node.getMesh();
      if (mesh === null) throw new Error(`node "${name}" has no mesh`);
      const primitives = mesh.listPrimitives();
      expect(primitives, name).toHaveLength(1);
      const position = at(primitives, 0).getAttribute("POSITION");
      if (position === null) throw new Error(`node "${name}" has no POSITION`);
      expect(position.getMin([]), `${name} min`).toEqual([
        ...record.converted.min,
      ]);
      expect(position.getMax([]), `${name} max`).toEqual([
        ...record.converted.max,
      ]);
    }
  });

  it("fronts Oolite's converted normal on all 2,226 Coriolis faces", () => {
    const meshes = coriolisMeshes();
    let total = 0;
    for (const name of ["hull", "faceplate", "tris", "dock"] as const) {
      total += assertFrontFaces(meshes[name], false);
    }
    expect(total).toBe(2226);
  });

  it("draws each Coriolis part's material set from its own owning entry", async () => {
    const entries = coriolisEntries();
    const bytes = buildCoriolisGlb(coriolisMeshes(), entries);
    const { json } = readChunks(bytes);
    const document = await readWithReader(bytes);

    const expected: readonly (readonly [string, readonly string[]])[] = [
      [
        "hull",
        [
          "oolite_coriolis_diffuse.png",
          "oolite_coriolis_normal.png",
          "oolite_coriolis_specular.png",
          "oolite_coriolis_diffuse_emissive.png",
        ],
      ],
      [
        "faceplate",
        [
          "oolite_coriolis_faceplate_diffuse.png",
          "oolite_coriolis_faceplate_normal.png",
          "oolite_coriolis_faceplate_specular.png",
          "oolite_coriolis_faceplate_diffuse_emissive.png",
        ],
      ],
      [
        "tris",
        [
          "oolite_coriolis_tris_diffuse.png",
          "oolite_coriolis_tris_normal.png",
          "oolite_coriolis_tris_specular.png",
          "oolite_coriolis_tris_diffuse_emissive.png",
        ],
      ],
      [
        "dock",
        [
          "oolite_coriolis_dock_diffuse.png",
          "oolite_coriolis_dock_normal.png",
          "oolite_coriolis_dock_diffuse_emissive.png",
        ],
      ],
    ];

    for (const [name, maps] of expected) {
      const jsonMaterial = json.materials.find(
        (candidate) => candidate.name === at(maps, 0),
      );
      if (jsonMaterial === undefined) {
        throw new Error(`no material for the "${name}" diffuse`);
      }
      expect(
        imageUri(
          json,
          jsonMaterial.pbrMetallicRoughness.baseColorTexture?.index,
        ),
      ).toBe(`../textures/${encodedTextureFile(at(maps, 0))}`);
      expect(imageUri(json, jsonMaterial.normalTexture?.index)).toBe(
        `../textures/${encodedTextureFile(at(maps, 1))}`,
      );
      if (maps.length === 4) {
        expect(imageUri(json, jsonMaterial.emissiveTexture?.index)).toBe(
          `../textures/${encodedTextureFile(at(maps, 3))}`,
        );
        expect(
          imageUri(
            json,
            jsonMaterial.extensions?.KHR_materials_specular?.specularTexture
              ?.index,
          ),
        ).toBe(`../textures/${encodedTextureFile(at(maps, 2))}`);
      } else {
        // The dock authors no specular map at all.
        expect(jsonMaterial.extensions?.KHR_materials_specular).toBeUndefined();
        expect(imageUri(json, jsonMaterial.emissiveTexture?.index)).toBe(
          `../textures/${encodedTextureFile(at(maps, 2))}`,
        );
      }
      // The alpha channel is an emission mask, never opacity.
      expect(jsonMaterial.alphaMode).toBeUndefined();
    }

    // A single shipDef for all four meshes would texture only the hull, so three
    // of these four base colours would vanish. Assert the distinct set instead.
    const baseColours = json.materials.map((material) =>
      imageUri(json, material.pbrMetallicRoughness.baseColorTexture?.index),
    );
    expect(baseColours).toEqual([
      "../textures/oolite_coriolis_diffuse.webp",
      "../textures/oolite_coriolis_faceplate_diffuse.webp",
      "../textures/oolite_coriolis_tris_diffuse.webp",
      "../textures/oolite_coriolis_dock_diffuse.webp",
    ]);

    const hullMaterial = document
      .getRoot()
      .listMaterials()
      .find(
        (candidate) => candidate.getName() === "oolite_coriolis_diffuse.png",
      );
    if (hullMaterial === undefined)
      throw new Error("the hull material is missing");
    expect(hullMaterial.getBaseColorTexture()?.getURI()).toBe(
      "../textures/oolite_coriolis_diffuse.webp",
    );

    const hull = json.materials.find(
      (candidate) => candidate.name === "oolite_coriolis_diffuse.png",
    );
    if (hull === undefined) throw new Error("the hull material is missing");
    expect(hull.pbrMetallicRoughness.metallicFactor).toBe(0);
    // gloss 1.0 clamps to the 0.04 floor.
    expect(hull.pbrMetallicRoughness.roughnessFactor).toBe(0.04);
    expect(hull.extras?.oolite?.emission_modulate_color).toEqual({
      red: 6750.952,
      green: 6780.963,
      blue: 3280.8824,
    });
    const normalized = hull.extras?.oolite?.emissionModulateColorNormalized as
      readonly number[] | undefined;
    if (normalized === undefined)
      throw new Error("no normalized emission colour");
    expect(normalized).toHaveLength(3);
    expect(at(normalized, 0)).toBeCloseTo(26.474, 3);
    expect(at(normalized, 1)).toBeCloseTo(26.592, 3);
    expect(at(normalized, 2)).toBeCloseTo(12.866, 3);
    expect(hull.extras?.oolite?.gloss).toBe(1);
    expect(hull.extras?.oolite?.shipKey).toBe("coriolis-station");
  });

  it("pins the emitted UV handedness in glTF texture space", () => {
    expect(golden.uvBasis).toContain("u right, v down");

    const cobraPrimitives = convertMesh(cobraMesh, cobraMode, "gltf");
    expect(countUvSigns(cobraMesh, cobraPrimitives)).toEqual(
      golden.cobra3.uvSigns,
    );

    const dockMesh = loadMesh(CORIOLIS_FILES.dock);
    const dockMode = selectNormalMode(dockMesh, { smooth: false });
    repairWinding(dockMesh, dockMode);
    const dockPrimitives = convertMesh(dockMesh, dockMode, "gltf");
    expect(countUvSigns(dockMesh, dockPrimitives)).toEqual(
      golden.coriolis.dock.uvSigns,
    );

    // The 14 faces that open down the station's -Z axis all share the recorded
    // sign, which is what the visual letterbox check confirms by eye.
    const mouth = mouthFaceAreas(dockMesh, dockPrimitives);
    expect(mouth).toHaveLength(golden.coriolis.dock.mouthFaces ?? 0);
    for (const area of mouth) expect(area).toBeLessThan(0);

    // The geometry signed area is taken against the converted face normal and
    // is positive by construction, so it is not compared with the UV sign.
    const dockFront = assertFrontFaces(loadMesh(CORIOLIS_FILES.dock), false);
    expect(dockFront).toBe(330);
  });

  it("keeps every UV inside the unit square and divides only by the declared scale", () => {
    const models: readonly (readonly [string, boolean])[] = [
      ["oolite_cobra3.dat", false],
      ["oolite_coriolis.dat", false],
      ["oolite_coriolis_faceplate.dat", false],
      ["oolite_coriolis_tris.dat", false],
      ["oolite_coriolis_dock.dat", false],
    ];

    for (const [filename, smooth] of models) {
      const mesh = loadMesh(filename);
      const source = readRepo(`${MODELS}/${filename}`);
      const scales = textureScales(source);
      expect(scales, filename).toHaveLength(mesh.nfaces);
      for (const scale of scales) {
        // All five vendored models declare 1.0 1.0, so no UV was divided by a
        // PNG's pixel size.
        expect(scale.maxX, filename).toBe("1.0");
        expect(scale.maxY, filename).toBe("1.0");
      }

      const mode = selectNormalMode(mesh, { smooth });
      repairWinding(mesh, mode);
      const primitives = convertMesh(mesh, mode, "gltf");
      const cursors = mesh.materials.map(() => 0);
      let emitted = 0;
      for (let faceIndex = 0; faceIndex < mesh.faces.length; faceIndex++) {
        const corners = faceCorners(mesh, primitives, faceIndex, cursors);
        const face = at(mesh.faces, faceIndex);
        for (let corner = 0; corner < 3; corner++) {
          const uv = at(corners.uvs, corner);
          expect(
            uv[0],
            `${filename} face ${String(faceIndex)} u`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            uv[0],
            `${filename} face ${String(faceIndex)} u`,
          ).toBeLessThanOrEqual(1);
          expect(
            uv[1],
            `${filename} face ${String(faceIndex)} v`,
          ).toBeGreaterThanOrEqual(0);
          expect(
            uv[1],
            `${filename} face ${String(faceIndex)} v`,
          ).toBeLessThanOrEqual(1);
          // Unchanged from ParsedMesh within float32 storage: the converter
          // applies no flip and no extra scale.
          const authored = at(face.uv, corner);
          expect(uv[0]).toBeCloseTo(authored[0], 6);
          expect(uv[1]).toBeCloseTo(authored[1], 6);
          emitted += 1;
        }
      }
      expect(emitted).toBe(mesh.faces.length * 3);
    }
  });
});

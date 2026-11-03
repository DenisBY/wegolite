// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Deterministic GLB writer for the Cobra Mk III and the Coriolis composite
 * (DATA-04, DATA-07, DATA-08, D-05, D-07, D-08, D-09, D-20, T-02-04, T-02-18).
 *
 * The container is ours. The writer builds `{ asset, scenes, nodes, meshes,
 * materials, textures, images, accessors, bufferViews, buffers }` in a fixed
 * insertion order, concatenates `header(12) | JSON chunk | BIN chunk`, pads the
 * JSON chunk with `0x20` and the BIN chunk with `0x00` to a 4-byte boundary,
 * and fixes `asset.generator` at `wegolite-oolite-ingest/1`. Nothing here reads
 * a clock, a locale, a random source or the host architecture, and no library
 * version string reaches the bytes: two runs over the same input are
 * byte-identical, which is what `assets:check` compares.
 *
 * Coordinate conversion (RESEARCH §P5.2), applied once, at the boundary:
 *
 *     position' = (x, y, -z)      normal' = (x, y, -z)      corners = c0, c1, c2
 *
 * Negating Z is a reflection (`det = -1`) and Oolite's stored normal is the
 * negation of the authored-order right-hand normal, so `cross(M(v1-v0),
 * M(v2-v0)) = M * ooliteFaceNormal`. The **authored** corner order is therefore
 * already glTF counter-clockwise; reversing it would make every face a back
 * face. The tests assert `dot > 0` on every emitted triangle, which is `+1` on
 * all 1,076 Cobra and all 2,226 Coriolis faces and would be `-1` if the corners
 * were reversed.
 *
 * Vertex layout mirrors Oolite's own `setUpVertexArrays`: materials first,
 * faces second, corners third, one vertex per corner and no deduplication, so
 * the index buffer is simply `0, 1, 2, …` and the draw order is Oolite's.
 *
 * The material model is approximate metallic-roughness (D-08): `metalness` is
 * fixed at 0, `roughness` is `clamp(1 - gloss, 0.04, 1)`, textures are separate
 * files referenced by the relative URI `../textures/<file>.png` (which resolves
 * from `public/models/<name>.glb` to `public/textures/<file>.png`), and every
 * authored Oolite value is preserved under `extras.oolite` so a later phase can
 * refine the look without re-extracting the snapshot. The Coriolis alpha
 * channel is an emission mask, not opacity: no `alphaMode` is ever emitted.
 *
 * Handedness handoff (plan 07): the emitted `(u, v)` pair is the authored one,
 * divided only by the declared `max_x`/`max_y` — on all five vendored models
 * that divisor is 1.0, and the PNG's pixel dimensions are never used. Whether
 * `v` needs `1 - v` is decided by plan 07's asymmetric-PNG pixel fixture; if it
 * is needed, the flip belongs in exactly one place, the UV copy in
 * `convertMesh`. This module cannot decide it, because it has no PNG decoder.
 */

import { contentError } from "../content-error.js";
import type { ContentErrorOptions } from "../content-error.js";
import {
  resolveCornerNormals,
  selectNormalMode,
  repairWinding,
} from "./dat.js";
import type { MeshBounds, NormalMode, ParsedMesh, Vec3 } from "./dat.js";
import type { ShipDef } from "../../../src/content/schemas/ship.js";

export type Coordinates = "oolite" | "gltf";

/** The fixed `asset.generator` string; changing it re-baselines every GLB. */
export const GLB_GENERATOR = "wegolite-oolite-ingest/1";

/** Where the emitted binaries live, relative to the repository root. */
export const EMITTED_MODELS_DIR = "public/models";

/** The single shipdata input every GLB's `extras.oolite` names. */
export const SHIPDATA_SOURCE_FILE = "third_party/oolite/Config/shipdata.plist";

/**
 * The one declaration of which shipdata entry owns each emitted mesh. Plan 07's
 * texture closure imports this constant rather than restating it, so a mesh can
 * never be retextured by an entry that does not own it.
 */
export const EMITTED_ENTRIES: Readonly<Record<string, readonly string[]>> = {
  "cobra3.glb": ["cobra3-player"],
  "coriolis.glb": [
    "coriolis-station",
    "oolite_coriolis_faceplate",
    "oolite_coriolis_tris",
    "oolite_coriolis_dock",
  ],
};

/** The vendored `.dat` files each emitted GLB is built from, in node order. */
export const MODEL_SOURCE_FILES: Readonly<Record<string, readonly string[]>> = {
  "cobra3.glb": ["oolite_cobra3.dat"],
  "coriolis.glb": [
    "oolite_coriolis.dat",
    "oolite_coriolis_faceplate.dat",
    "oolite_coriolis_tris.dat",
    "oolite_coriolis_dock.dat",
  ],
};

const GLB_MAGIC = 0x46546c67;
const GLB_VERSION = 2;
const JSON_CHUNK_TYPE = 0x4e4f534a;
const BIN_CHUNK_TYPE = 0x004e4942;
const JSON_CHUNK_FILL = 0x20;
const BIN_CHUNK_FILL = 0x00;

const COMPONENT_FLOAT = 5126;
const COMPONENT_UNSIGNED_INT = 5125;
const ARRAY_BUFFER = 34962;
const ELEMENT_ARRAY_BUFFER = 34963;
const TRIANGLES = 4;

const TEXTURE_URI_PREFIX = "../textures/";
const EMISSIVE_SUFFIX = "_emissive.png";

export interface GlbBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

export interface GlbPrimitive extends GlbBounds {
  /** The Oolite material key this primitive draws (first-appearance order). */
  readonly materialName: string;
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

export interface GlbMesh {
  readonly name: string;
  readonly primitives: readonly GlbPrimitive[];
}

export interface GlbNode {
  readonly name: string;
  readonly translation?: readonly [number, number, number];
  readonly mesh: GlbMesh;
}

export type EmissionModulateColor =
  readonly number[] | Readonly<Record<string, number>> | null;

export interface OoliteExtras {
  readonly sourceFile: string;
  readonly shipKey: string;
  readonly materialKey: string;
  readonly gloss: number;
  readonly shininess: number | null;
  readonly specular_color: readonly number[] | null;
  /** Exactly as authored: an array, or Oolite's `{red, green, blue}` dictionary. */
  readonly emission_modulate_color: EmissionModulateColor;
  /** The `/255` triple consumers should use (Oolite rescales above 1.0). */
  readonly emissionModulateColorNormalized: readonly [number, number, number];
  readonly emission_extract_channel: string | null;
  readonly diffuse_map: string | null;
  readonly normal_map: string | null;
  readonly specular_map: string | null;
  readonly emission_map: string | null;
}

export interface GlbMaterial {
  readonly name: string;
  readonly baseColorTexture: string | null;
  readonly normalTexture: string | null;
  readonly specularTexture: string | null;
  readonly emissiveTexture: string | null;
  readonly roughnessFactor: number;
  readonly extrasOolite: OoliteExtras | null;
}

export interface GlbScene {
  readonly nodes: readonly GlbNode[];
  readonly materials: readonly GlbMaterial[];
}

export interface ShipEntry {
  readonly key: string;
  readonly shipDef: ShipDef;
}

export interface CoriolisMeshes {
  readonly hull: ParsedMesh;
  readonly faceplate: ParsedMesh;
  readonly tris: ParsedMesh;
  readonly dock: ParsedMesh;
}

export interface CoriolisEntries {
  readonly hull: ShipEntry;
  readonly faceplate: ShipEntry;
  readonly tris: ShipEntry;
  readonly dock: ShipEntry;
}

export interface EmittedModel {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function glbFailure(construct: string, detail: string): never {
  const options: ContentErrorOptions = { excerpt: detail };
  throw contentError("SCHEMA", "glb", construct, options);
}

function align4(bytes: Uint8Array, fill: number): Uint8Array {
  const remainder = bytes.length % 4;
  if (remainder === 0) return bytes;
  const padded = new Uint8Array(bytes.length + (4 - remainder));
  padded.fill(fill);
  padded.set(bytes, 0);
  return padded;
}

function float32Bytes(values: Float32Array): Uint8Array {
  // Explicit little-endian writes. A `new Uint8Array(values.buffer)` view would
  // inherit the host's byte order, which is the one thing a committed binary
  // must not depend on.
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index++) {
    view.setFloat32(index * 4, values[index] ?? 0, true);
  }
  return bytes;
}

function uint32Bytes(values: Uint32Array): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index++) {
    view.setUint32(index * 4, values[index] ?? 0, true);
  }
  return bytes;
}

interface BufferViewJson {
  readonly buffer: number;
  readonly byteOffset: number;
  readonly byteLength: number;
  readonly target: number;
}

interface AccessorJson {
  readonly bufferView: number;
  readonly componentType: number;
  readonly count: number;
  readonly type: string;
  readonly min?: readonly number[];
  readonly max?: readonly number[];
}

interface PrimitiveJson {
  readonly attributes: {
    readonly POSITION: number;
    readonly NORMAL: number;
    readonly TEXCOORD_0: number;
  };
  readonly indices: number;
  readonly material: number;
  readonly mode: number;
}

interface MaterialJson {
  readonly name: string;
  readonly pbrMetallicRoughness: {
    readonly baseColorFactor: readonly number[];
    readonly metallicFactor: number;
    readonly roughnessFactor: number;
    readonly baseColorTexture?: { readonly index: number };
  };
  readonly normalTexture?: { readonly index: number };
  readonly emissiveTexture?: { readonly index: number };
  readonly emissiveFactor?: readonly number[];
  readonly extensions?: {
    readonly KHR_materials_specular: {
      readonly specularFactor: number;
      readonly specularTexture: { readonly index: number };
    };
  };
  readonly extras?: { readonly oolite: OoliteExtras };
}

/** Serialise a scene into GLB bytes. The one place the container is assembled. */
export function writeGlb(scene: GlbScene): Uint8Array {
  const bufferViews: BufferViewJson[] = [];
  const blocks: Uint8Array[] = [];
  let binLength = 0;

  const addView = (bytes: Uint8Array, target: number): number => {
    const padded = align4(bytes, BIN_CHUNK_FILL);
    bufferViews.push({
      buffer: 0,
      byteOffset: binLength,
      byteLength: padded.length,
      target,
    });
    blocks.push(padded);
    binLength += padded.length;
    return bufferViews.length - 1;
  };

  const accessors: AccessorJson[] = [];
  const addAccessor = (accessor: AccessorJson): number => {
    accessors.push(accessor);
    return accessors.length - 1;
  };

  const images: { readonly uri: string }[] = [];
  const textures: { readonly source: number }[] = [];
  const imageIndex = new Map<string, number>();
  const textureRef = (file: string): number => {
    const existing = imageIndex.get(file);
    if (existing !== undefined) return existing;
    const created = images.length;
    images.push({ uri: `${TEXTURE_URI_PREFIX}${file}` });
    textures.push({ source: created });
    imageIndex.set(file, created);
    return created;
  };

  const materialIndex = new Map<string, number>();
  scene.materials.forEach((material, index) => {
    if (materialIndex.has(material.name)) {
      glbFailure("materials", `duplicate material name "${material.name}"`);
    }
    materialIndex.set(material.name, index);
  });
  const materialIndexOrFail = (name: string): number => {
    const index = materialIndex.get(name);
    if (index === undefined) {
      glbFailure("materials", `primitive names unknown material "${name}"`);
    }
    return index;
  };

  let usesSpecularExtension = false;
  const materials: MaterialJson[] = scene.materials.map((material) => {
    const materialJson: MaterialJson = {
      name: material.name,
      pbrMetallicRoughness: {
        baseColorFactor: [1, 1, 1, 1],
        metallicFactor: 0,
        roughnessFactor: material.roughnessFactor,
        ...(material.baseColorTexture === null
          ? {}
          : {
              baseColorTexture: {
                index: textureRef(material.baseColorTexture),
              },
            }),
      },
      ...(material.normalTexture === null
        ? {}
        : { normalTexture: { index: textureRef(material.normalTexture) } }),
      ...(material.emissiveTexture === null
        ? {}
        : {
            emissiveTexture: { index: textureRef(material.emissiveTexture) },
            emissiveFactor: [1, 1, 1],
          }),
      ...(material.specularTexture === null
        ? {}
        : {
            // Core glTF has no specular slot; the standard extension carries it
            // and `extras.oolite.specular_map` keeps the authored name beside it.
            extensions: {
              KHR_materials_specular: {
                specularFactor: 1,
                specularTexture: {
                  index: textureRef(material.specularTexture),
                },
              },
            },
          }),
      ...(material.extrasOolite === null
        ? {}
        : { extras: { oolite: material.extrasOolite } }),
    };
    if (material.specularTexture !== null) usesSpecularExtension = true;
    return materialJson;
  });

  const meshes: { name: string; primitives: PrimitiveJson[] }[] = [];
  const nodes: {
    name: string;
    translation?: readonly [number, number, number];
    mesh: number;
  }[] = [];

  for (const node of scene.nodes) {
    const primitives: PrimitiveJson[] = node.mesh.primitives.map(
      (primitive) => {
        const position = addAccessor({
          bufferView: addView(float32Bytes(primitive.positions), ARRAY_BUFFER),
          componentType: COMPONENT_FLOAT,
          count: primitive.positions.length / 3,
          type: "VEC3",
          min: primitive.min,
          max: primitive.max,
        });
        const normal = addAccessor({
          bufferView: addView(float32Bytes(primitive.normals), ARRAY_BUFFER),
          componentType: COMPONENT_FLOAT,
          count: primitive.normals.length / 3,
          type: "VEC3",
        });
        const uv = addAccessor({
          bufferView: addView(float32Bytes(primitive.uvs), ARRAY_BUFFER),
          componentType: COMPONENT_FLOAT,
          count: primitive.uvs.length / 2,
          type: "VEC2",
        });
        const indices = addAccessor({
          bufferView: addView(
            uint32Bytes(primitive.indices),
            ELEMENT_ARRAY_BUFFER,
          ),
          componentType: COMPONENT_UNSIGNED_INT,
          count: primitive.indices.length,
          type: "SCALAR",
        });
        return {
          attributes: { POSITION: position, NORMAL: normal, TEXCOORD_0: uv },
          indices,
          material: materialIndexOrFail(primitive.materialName),
          mode: TRIANGLES,
        };
      },
    );

    meshes.push({ name: node.mesh.name, primitives });
    nodes.push({
      name: node.name,
      ...(node.translation === undefined
        ? {}
        : { translation: node.translation }),
      mesh: meshes.length - 1,
    });
  }

  const bin = new Uint8Array(binLength);
  let binOffset = 0;
  for (const block of blocks) {
    bin.set(block, binOffset);
    binOffset += block.length;
  }

  // A plain record in insertion order: the JSON key order is part of the
  // reviewed byte layout, so nothing here is sorted after the fact.
  const jsonDocument: Record<string, unknown> = {
    asset: { version: "2.0", generator: GLB_GENERATOR },
    scene: 0,
    scenes: [{ nodes: nodes.map((_node, index) => index) }],
    nodes,
    meshes,
    materials,
    ...(images.length > 0 ? { textures, images } : {}),
    ...(usesSpecularExtension
      ? { extensionsUsed: ["KHR_materials_specular"] }
      : {}),
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };

  const json = align4(
    new TextEncoder().encode(JSON.stringify(jsonDocument)),
    JSON_CHUNK_FILL,
  );
  const binChunk = align4(bin, BIN_CHUNK_FILL);

  const totalLength = 12 + 8 + json.length + 8 + binChunk.length;
  const bytes = new Uint8Array(totalLength);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, GLB_MAGIC >>> 0, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, totalLength, true);

  view.setUint32(12, json.length, true);
  view.setUint32(16, JSON_CHUNK_TYPE >>> 0, true);
  bytes.set(json, 20);

  const binStart = 20 + json.length;
  view.setUint32(binStart, binChunk.length, true);
  view.setUint32(binStart + 4, BIN_CHUNK_TYPE >>> 0, true);
  bytes.set(binChunk, binStart + 8);

  return bytes;
}

function convertPoint(point: Vec3, coordinates: Coordinates): Vec3 {
  return coordinates === "gltf"
    ? { x: point.x, y: point.y, z: -point.z }
    : { x: point.x, y: point.y, z: point.z };
}

function boundsOf(positions: Float32Array): GlbBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.length; index += 3) {
    const x = positions[index] ?? 0;
    const y = positions[index + 1] ?? 0;
    const z = positions[index + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    minZ = 0;
    maxX = 0;
    maxY = 0;
    maxZ = 0;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * One primitive per Oolite material, in the mesh's material order, then faces in
 * file order, then corners `0, 1, 2` in the **authored** order. No dedup, no
 * second winding repair: the repair belongs to the legacy normal modes and runs
 * before this function.
 *
 * `min`/`max` are read back from the float32 buffer that is written, so an
 * accessor bound is a property of the bytes rather than of a parallel
 * computation that could drift from them.
 */
export function convertMesh(
  mesh: ParsedMesh,
  mode: NormalMode,
  coordinates: Coordinates,
): GlbPrimitive[] {
  const cornerNormals = resolveCornerNormals(mesh, mode);
  const primitives: GlbPrimitive[] = [];

  for (const material of mesh.materials) {
    const faceIndexes: number[] = [];
    for (let index = 0; index < mesh.faces.length; index++) {
      const face = mesh.faces[index];
      if (face !== undefined && face.materialIndex === material.index) {
        faceIndexes.push(index);
      }
    }

    const vertexCount = faceIndexes.length * 3;
    const positions = new Float32Array(vertexCount * 3);
    const normals = new Float32Array(vertexCount * 3);
    const uvs = new Float32Array(vertexCount * 2);
    const indices = new Uint32Array(vertexCount);

    for (let slot = 0; slot < faceIndexes.length; slot++) {
      const faceIndex = faceIndexes[slot] ?? 0;
      const face = mesh.faces[faceIndex];
      if (face === undefined) continue;
      const corners = cornerNormals[faceIndex] ?? [];
      for (let corner = 0; corner < 3; corner++) {
        const vertexIndex = face.vertices[corner] ?? 0;
        const vertex = mesh.vertices[vertexIndex];
        if (vertex === undefined) {
          glbFailure(
            `${material.name} face ${String(faceIndex)}`,
            `vertex index ${String(vertexIndex)} is out of range`,
          );
        }
        const position = convertPoint(vertex, coordinates);
        const normal = convertPoint(
          corners[corner] ?? { x: 0, y: 0, z: 1 },
          coordinates,
        );
        const uv = face.uv[corner] ?? [0, 0];
        const out = (slot * 3 + corner) * 3;
        positions[out] = position.x;
        positions[out + 1] = position.y;
        positions[out + 2] = position.z;
        normals[out] = normal.x;
        normals[out + 1] = normal.y;
        normals[out + 2] = normal.z;
        uvs[(slot * 3 + corner) * 2] = uv[0];
        uvs[(slot * 3 + corner) * 2 + 1] = uv[1];
        indices[slot * 3 + corner] = slot * 3 + corner;
      }
    }

    const { min, max } = boundsOf(positions);
    primitives.push({
      materialName: material.name,
      positions,
      normals,
      uvs,
      indices,
      min,
      max,
    });
  }

  return primitives;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null;
  const out: number[] = [];
  for (const item of value) {
    const parsed = asNumber(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

function rawColour(value: unknown): EmissionModulateColor {
  const array = asNumberArray(value);
  if (array !== null) return array;
  if (typeof value !== "object" || value === null) return null;
  const out: { [channel: string]: number } = {};
  for (const [channel, component] of Object.entries(value)) {
    const parsed = asNumber(component);
    if (parsed === null) return null;
    out[channel] = parsed;
  }
  return out;
}

/**
 * Oolite divides the whole colour by 255 when any component exceeds 1.0, and
 * otherwise uses it unchanged. The triple consumers should read is this one.
 */
function normalizedColour(
  colour: EmissionModulateColor,
): readonly [number, number, number] {
  if (colour === null) return [1, 1, 1];
  let red: number;
  let green: number;
  let blue: number;
  if (Array.isArray(colour)) {
    const values = colour as readonly number[];
    red = values[0] ?? 0;
    green = values[1] ?? 0;
    blue = values[2] ?? 0;
  } else {
    const components = colour as Readonly<Record<string, number>>;
    red = components.red ?? 0;
    green = components.green ?? 0;
    blue = components.blue ?? 0;
  }
  const divisor = Math.max(red, green, blue) > 1 ? 255 : 1;
  return [red / divisor, green / divisor, blue / divisor];
}

function emissiveFile(name: string): string {
  return `${name.endsWith(".png") ? name.slice(0, -".png".length) : name}${EMISSIVE_SUFFIX}`;
}

function clampRoughness(value: number): number {
  if (value < 0.04) return 0.04;
  if (value > 1) return 1;
  return value;
}

/**
 * Project one Oolite material dictionary onto a glTF material.
 *
 * The diffuse falls back to the material key when it ends in `.png`: that is
 * Oolite's own convention, and the Coriolis hull and all three part materials
 * are authored that way. A key with neither `diffuse_map` nor a `.png` suffix is
 * a build error, never a silent stand-in texture (D-21).
 */
export function materialFor(
  materialKey: string,
  shipDef: ShipDef,
  shipKey: string,
): GlbMaterial {
  const config = Object.hasOwn(shipDef.materials, materialKey)
    ? shipDef.materials[materialKey]
    : undefined;
  if (config === undefined) {
    glbFailure(
      `materials.${materialKey}`,
      `ship "${shipKey}" has no material "${materialKey}"`,
    );
  }

  const authoredDiffuse = asString(config.diffuse_map);
  const baseColorTexture =
    authoredDiffuse ?? (materialKey.endsWith(".png") ? materialKey : null);
  if (baseColorTexture === null) {
    glbFailure(
      `materials.${materialKey}`,
      `ship "${shipKey}" declares neither diffuse_map nor a .png material key`,
    );
  }

  const emissionMap = config.emission_map;
  const emissionName =
    typeof emissionMap === "object" && emissionMap !== null
      ? asString((emissionMap as Record<string, unknown>).name)
      : null;
  const emissionChannel =
    typeof emissionMap === "object" && emissionMap !== null
      ? asString((emissionMap as Record<string, unknown>).extract_channel)
      : null;

  const gloss = asNumber(config.gloss) ?? 0;
  const emissionColour = rawColour(config.emission_modulate_color);

  return {
    name: materialKey,
    baseColorTexture,
    normalTexture: asString(config.normal_map),
    specularTexture: asString(config.specular_map),
    emissiveTexture: emissionName === null ? null : emissiveFile(emissionName),
    roughnessFactor: clampRoughness(1 - gloss),
    extrasOolite: {
      sourceFile: SHIPDATA_SOURCE_FILE,
      shipKey,
      materialKey,
      gloss,
      shininess: asNumber(config.shininess),
      specular_color: asNumberArray(config.specular_color),
      emission_modulate_color: emissionColour,
      emissionModulateColorNormalized: normalizedColour(emissionColour),
      emission_extract_channel: emissionChannel,
      diffuse_map: authoredDiffuse,
      normal_map: asString(config.normal_map),
      specular_map: asString(config.specular_map),
      emission_map: emissionName,
    },
  };
}

/** Bounds of the emitted buffer data for a whole mesh. */
function meshBounds(primitives: readonly GlbPrimitive[]): GlbBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const primitive of primitives) {
    if (primitive.min[0] < minX) minX = primitive.min[0];
    if (primitive.min[1] < minY) minY = primitive.min[1];
    if (primitive.min[2] < minZ) minZ = primitive.min[2];
    if (primitive.max[0] > maxX) maxX = primitive.max[0];
    if (primitive.max[1] > maxY) maxY = primitive.max[1];
    if (primitive.max[2] > maxZ) maxZ = primitive.max[2];
  }
  if (!Number.isFinite(minX)) return { min: [0, 0, 0], max: [0, 0, 0] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * Assert the emitted geometry survives the reflection: X and Y are unchanged and
 * Z is the negated range. A dropped vertex or a mis-mapped corner changes an
 * extent, which is a `MESH_BOUNDS` failure naming the file and the axis rather
 * than a silently distorted model (T-02-04).
 */
export function assertConvertedBounds(
  source: MeshBounds,
  converted: GlbBounds,
  file: string,
): void {
  const tolerance = 1e-4;
  const axes: readonly [string, number, number][] = [
    ["x", converted.min[0], source.min.x],
    ["x", converted.max[0], source.max.x],
    ["y", converted.min[1], source.min.y],
    ["y", converted.max[1], source.max.y],
    ["z", converted.min[2], -source.max.z],
    ["z", converted.max[2], -source.min.z],
  ];
  for (const [axis, actual, wanted] of axes) {
    const allowed = tolerance * Math.max(1, Math.abs(wanted));
    if (Math.abs(actual - wanted) > allowed) {
      const options: ContentErrorOptions = {
        excerpt: `expected ${String(wanted)}, emitted ${String(actual)}`,
      };
      throw contentError(
        "MESH_BOUNDS",
        file,
        `converted bounding box ${axis}`,
        options,
      );
    }
  }
}

function prepareMesh(mesh: ParsedMesh, shipDef: ShipDef): NormalMode {
  // Read → repair (legacy modes only) → negate Z → write. The repair never runs
  // again after the conversion; running it twice would double-flip a repaired
  // face (RESEARCH §P5.2).
  const mode = selectNormalMode(mesh, { smooth: shipDef.smooth });
  repairWinding(mesh, mode);
  return mode;
}

function sourceBounds(mesh: ParsedMesh): MeshBounds {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const vertex of mesh.vertices) {
    if (vertex.x < minX) minX = vertex.x;
    if (vertex.y < minY) minY = vertex.y;
    if (vertex.z < minZ) minZ = vertex.z;
    if (vertex.x > maxX) maxX = vertex.x;
    if (vertex.y > maxY) maxY = vertex.y;
    if (vertex.z > maxZ) maxZ = vertex.z;
  }
  if (!Number.isFinite(minX)) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };
}

function buildNodeMesh(
  meshName: string,
  mesh: ParsedMesh,
  entry: ShipEntry,
): GlbMesh {
  const mode = prepareMesh(mesh, entry.shipDef);
  const primitives = convertMesh(mesh, mode, "gltf");
  if (primitives.length === 0) {
    glbFailure(meshName, `mesh "${meshName}" has no material to emit`);
  }
  assertConvertedBounds(
    sourceBounds(mesh),
    meshBounds(primitives),
    entry.shipDef.model ?? meshName,
  );
  return { name: meshName, primitives };
}

/** The Cobra Mk III: one node, one mesh, one primitive per authored material. */
export function buildCobraGlb(mesh: ParsedMesh, entry: ShipEntry): Uint8Array {
  const built = buildNodeMesh("oolite_cobra3", mesh, entry);
  return writeGlb({
    nodes: [{ name: "cobra3", mesh: built }],
    materials: built.primitives.map((primitive) =>
      materialFor(primitive.materialName, entry.shipDef, entry.key),
    ),
  });
}

function subentityTranslation(
  hullEntry: ShipEntry,
  partKey: string,
  meshName: string,
): readonly [number, number, number] {
  for (const subentity of hullEntry.shipDef.subentities) {
    if (subentity.subentity_key !== partKey) continue;
    const position = subentity.position;
    return position === undefined
      ? [0, 0, 0]
      : [position[0], position[1], -position[2]];
  }
  glbFailure(
    `${SHIPDATA_SOURCE_FILE} subentities`,
    `"${hullEntry.key}" has no subentity "${partKey}" for node "${meshName}"`,
  );
}

/**
 * The Coriolis composite: four nodes, four meshes, each with its own local
 * transform and its **own** owning shipdata entry's materials. Three of the four
 * parts carry their material set on their own entry, so a single `shipDef` would
 * silently texture only the hull.
 */
export function buildCoriolisGlb(
  meshes: CoriolisMeshes,
  entries: CoriolisEntries,
): Uint8Array {
  const parts: readonly [string, ParsedMesh, ShipEntry, string][] = [
    ["hull", meshes.hull, entries.hull, "oolite_coriolis"],
    [
      "faceplate",
      meshes.faceplate,
      entries.faceplate,
      "oolite_coriolis_faceplate",
    ],
    ["tris", meshes.tris, entries.tris, "oolite_coriolis_tris"],
    ["dock", meshes.dock, entries.dock, "oolite_coriolis_dock"],
  ];

  const materials: GlbMaterial[] = [];
  const nodes: GlbNode[] = [];
  for (const [name, mesh, entry, meshName] of parts) {
    const built = buildNodeMesh(meshName, mesh, entry);
    for (const primitive of built.primitives) {
      materials.push(
        materialFor(primitive.materialName, entry.shipDef, entry.key),
      );
    }
    // The hull is the composite's root; the three parts keep the transforms
    // their subentity declares, converted and never tidied (D-07).
    const translation: readonly [number, number, number] =
      name === "hull"
        ? [0, 0, 0]
        : subentityTranslation(entries.hull, entry.key, meshName);
    nodes.push({ name, translation, mesh: built });
  }

  return writeGlb({ nodes, materials });
}

function requireModel(
  models: Readonly<Record<string, ParsedMesh>>,
  filename: string,
): ParsedMesh {
  const model = models[filename];
  if (model === undefined) {
    glbFailure("models", `no parsed mesh for "${filename}"`);
  }
  return model;
}

function requireEntry(
  entries: Readonly<Record<string, ShipEntry>>,
  key: string,
): ShipEntry {
  const entry = entries[key];
  if (entry === undefined) {
    glbFailure("entries", `no resolved shipdata entry "${key}"`);
  }
  return entry;
}

/**
 * Emit both binaries, driven by `EMITTED_ENTRIES` — the single declaration of
 * which shipdata entry owns each mesh, so plan 07's texture closure reads the
 * same constant instead of restating it.
 */
export function emitModels(
  models: Readonly<Record<string, ParsedMesh>>,
  entries: Readonly<Record<string, ShipEntry>>,
): EmittedModel[] {
  const emitted: EmittedModel[] = [];

  const cobraFiles = MODEL_SOURCE_FILES["cobra3.glb"] ?? [];
  const cobraOwners = EMITTED_ENTRIES["cobra3.glb"] ?? [];
  const cobraFile = cobraFiles[0];
  const cobraOwner = cobraOwners[0];
  if (cobraFile === undefined || cobraOwner === undefined) {
    glbFailure("cobra3.glb", "the Cobra needs one source mesh and one owner");
  }
  emitted.push({
    path: `${EMITTED_MODELS_DIR}/cobra3.glb`,
    bytes: buildCobraGlb(
      requireModel(models, cobraFile),
      requireEntry(entries, cobraOwner),
    ),
  });

  const coriolisFiles = MODEL_SOURCE_FILES["coriolis.glb"] ?? [];
  const coriolisOwners = EMITTED_ENTRIES["coriolis.glb"] ?? [];
  const [hullFile, faceplateFile, trisFile, dockFile] = coriolisFiles;
  const [hullOwner, faceplateOwner, trisOwner, dockOwner] = coriolisOwners;
  if (
    hullFile === undefined ||
    faceplateFile === undefined ||
    trisFile === undefined ||
    dockFile === undefined ||
    hullOwner === undefined ||
    faceplateOwner === undefined ||
    trisOwner === undefined ||
    dockOwner === undefined
  ) {
    glbFailure(
      "coriolis.glb",
      "the composite needs four source meshes and four owners",
    );
  }
  emitted.push({
    path: `${EMITTED_MODELS_DIR}/coriolis.glb`,
    bytes: buildCoriolisGlb(
      {
        hull: requireModel(models, hullFile),
        faceplate: requireModel(models, faceplateFile),
        tris: requireModel(models, trisFile),
        dock: requireModel(models, dockFile),
      },
      {
        hull: requireEntry(entries, hullOwner),
        faceplate: requireEntry(entries, faceplateOwner),
        tris: requireEntry(entries, trisOwner),
        dock: requireEntry(entries, dockOwner),
      },
    ),
  });

  return emitted;
}

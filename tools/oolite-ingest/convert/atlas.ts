// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-hull texture atlases and the build-time merge of an NPC hull's primitives
 * into one primitive with one material (DATA-18, QUAL-09 staged, D-05 fix (1),
 * D-07, D-08, T-21-39, T-21-40, T-21-41).
 *
 * Why a merge needs one material. three.js draws each geometry group of a
 * merged mesh separately, so joining the primitives of a hull saves a draw call
 * only when their materials become one. The materials of one Oolite hull differ
 * in their maps (hull and subentity textures) and in their values (gloss,
 * emission), so the merged material takes every texture slot from a per-hull
 * atlas: each primitive owns a square region, its UVs are remapped into that
 * region, and the authored per-material values are baked into the regions. The
 * converter writes the result; the client sees an ordinary one-primitive GLB.
 *
 * The layout. One layout serves every slot of a hull, on UV channel 0. A region
 * exists per distinct tuple of (diffuse, normal, specular and emission sources,
 * and the baked roughness when the hull needs a roughness map), in the order of
 * first appearance in the authored material order. Its side is the largest
 * native side among the maps of its tuple; a smaller map is upscaled by its
 * integer ratio with nearest-neighbour replication (every side is a power of
 * two), so nearest sampling stays texel-exact and a map is never shrunk. The
 * atlas is square, so every region has the same UV scale in u and v, which keeps
 * three.js's derivative tangent frame unchanged. Regions are placed on the grid
 * of the smallest region, each aligned to a multiple of its own side, largest
 * first, at the first free cell in row-major order, in the smallest atlas side
 * (a multiple of that cell) that holds them. The layout is a pure function of
 * the region sides and their order: never of a pixel, which is what lets the
 * texture-variant records of one model share merged geometry (plan 21-18).
 *
 * No gutter. The region offsets are multiples of the region side, so a mip
 * texel whose block is at most the region side never straddles two regions, and
 * the layout wastes no area; the half-texel a bilinear fetch reads across a
 * region edge replaces the blend the source map's own repeat wrap read across
 * its edge. A gutter would double the side of every hull whose map is 1024
 * texels, which is the memory cost this plan measures and keeps down.
 *
 * Exactness. For every corner of every source primitive and every slot, the
 * nearest texel of the atlas at the remapped UV equals the nearest texel of the
 * primitive's own map (or its constant fill) at the original UV. "Nearest" is
 * `floor(u * size)` clamped to the map, the convention of `sampleNearest`; in
 * the atlas the clamp is the region's, so the closed upper edge `u = 1` belongs
 * to the region's last texel exactly as it belongs to the source map's. The
 * remapped coordinates are rounded to float32 for the GLB and then settled by
 * single float32 steps until they select the intended texel, so a coordinate on
 * a texel boundary cannot round across it. The build verifies this per hull
 * (validity condition (e)); `atlas.test.ts` repeats it through the PNG decoder.
 *
 * Validity conditions, evaluated per hull, recorded and never assumed:
 *
 * - (a) every UV of every primitive lies in [0, 1] (a wrapped sample cannot be
 *   remapped into a region);
 * - (b) every region is square, so its UV scale is uniform (a non-square map
 *   would change the tangent frame);
 * - (c) the atlas side is at most `MAX_HULL_ATLAS_SIDE` texels;
 * - (d) the merged material needs one UV channel (every primitive has a
 *   complete channel 0 and the merged primitive writes only that one);
 * - (e) the texel-exactness check passes (a map whose side is not a power of
 *   two, or an emission image that is not a baked mask, cannot be remapped
 *   exactly either).
 *
 * A hull that fails one keeps its primitives and its GLB names the failing
 * condition under `extras.wegolite.mergeRefusal`. A hull of one primitive is
 * not an atlas candidate and is emitted as before.
 */

import { sha256Hex } from "../canonical/hash.js";
import type {
  GlbMaterial,
  GlbPrimitive,
  MergedOoliteExtras,
  OoliteExtras,
} from "./glb.js";

/** The largest atlas side, in texels, a hull may need (T-21-41). */
export const MAX_HULL_ATLAS_SIDE = 2048;

/** A decoded 8-bit RGBA image, rows top to bottom. */
export interface RgbaImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Resolves a vendored texture name (`oolite_anaconda_diffuse.png`) to pixels. */
export type TextureLookup = (name: string) => RgbaImage;

export type AtlasSlot =
  "diffuse" | "normal" | "specular" | "emissive" | "roughness";

export type MergeCondition = "a" | "b" | "c" | "d" | "e";

export interface MergeRefusal {
  readonly condition: MergeCondition;
  readonly detail: string;
}

/** One generated atlas image, before encoding. */
export interface AtlasImage {
  readonly slot: AtlasSlot;
  /** The PNG name before encoding, content-addressed; the GLB names this. */
  readonly name: string;
  readonly side: number;
  /** 4 for RGBA, 1 for the greyscale emissive mask. */
  readonly channels: 1 | 4;
  readonly data: Uint8Array;
  /** Vendored texture names this image is built from, code-unit sorted. */
  readonly inputTextures: readonly string[];
  /** Vendored config files whose authored values are baked into it. */
  readonly inputConfig: readonly string[];
  /** How many regions the atlas holds. */
  readonly regions: number;
}

export interface AtlasRegion {
  readonly x: number;
  readonly y: number;
  readonly side: number;
}

export interface AtlasLayout {
  readonly side: number;
  /** Index-aligned with the `sides` handed to `packHullAtlas`. */
  readonly regions: readonly AtlasRegion[];
}

export type MergeOutcome =
  | { readonly kind: "single" }
  | { readonly kind: "refused"; readonly refusal: MergeRefusal }
  | {
      readonly kind: "merged";
      readonly primitive: GlbPrimitive;
      readonly material: GlbMaterial;
      readonly images: readonly AtlasImage[];
      readonly layout: AtlasLayout;
    };

export interface MergeInput {
  /** The model name the atlas files carry: `anaconda` for `oolite_anaconda.dat`. */
  readonly model: string;
  readonly primitives: readonly GlbPrimitive[];
  /** One material per primitive, index-aligned. */
  readonly materials: readonly GlbMaterial[];
  readonly textures: TextureLookup;
}

/** The text a refusal is recorded as in logs and the SUMMARY. */
export function refusalText(refusal: MergeRefusal): string {
  return `(${refusal.condition}) ${refusal.detail}`;
}

function refuse(condition: MergeCondition, detail: string): MergeOutcome {
  return { kind: "refused", refusal: { condition, detail } };
}

function isPowerOfTwo(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && (value & (value - 1)) === 0;
}

/**
 * Place square regions of power-of-two sides on a square atlas.
 *
 * Deterministic and independent of any pixel: the regions are placed largest
 * first (ties in input order), each at the first free cell, scanning rows then
 * columns, whose offsets are multiples of the region's own side. The atlas side
 * is the smallest multiple of the smallest region side that holds them all,
 * searched upward from the area bound. The returned side may exceed
 * `MAX_HULL_ATLAS_SIDE`; the caller applies condition (c).
 */
export function packHullAtlas(sides: readonly number[]): AtlasLayout {
  if (sides.length === 0) throw new Error("packHullAtlas: no regions");
  for (const side of sides) {
    if (!isPowerOfTwo(side)) {
      throw new Error(
        `packHullAtlas: side ${String(side)} is not a power of 2`,
      );
    }
  }
  const unit = Math.min(...sides);
  const order = sides
    .map((side, index) => ({ side, index }))
    .sort((left, right) => right.side - left.side || left.index - right.index);
  const largest = Math.max(...sides);
  const area = sides.reduce((sum, side) => sum + side * side, 0);
  const lowerBound = Math.max(largest, Math.ceil(Math.sqrt(area)));
  const sum = sides.reduce((total, side) => total + side, 0);

  for (
    let side = Math.ceil(lowerBound / unit) * unit;
    side <= Math.max(sum, lowerBound);
    side += unit
  ) {
    const cells = side / unit;
    const taken = new Uint8Array(cells * cells);
    const placed: AtlasRegion[] = new Array<AtlasRegion>(sides.length);
    let fits = true;
    for (const { side: regionSide, index } of order) {
      const span = regionSide / unit;
      let found = false;
      for (let row = 0; row + span <= cells && !found; row += span) {
        for (let column = 0; column + span <= cells && !found; column += span) {
          let free = true;
          for (let dy = 0; dy < span && free; dy++) {
            for (let dx = 0; dx < span; dx++) {
              if (taken[(row + dy) * cells + column + dx] !== 0) {
                free = false;
                break;
              }
            }
          }
          if (!free) continue;
          for (let dy = 0; dy < span; dy++) {
            taken.fill(
              1,
              (row + dy) * cells + column,
              (row + dy) * cells + column + span,
            );
          }
          placed[index] = {
            x: column * unit,
            y: row * unit,
            side: regionSide,
          };
          found = true;
        }
      }
      if (!found) {
        fits = false;
        break;
      }
    }
    if (fits) return { side, regions: placed };
  }
  // Unreachable: a row of the regions always fits an atlas of side `sum`.
  throw new Error("packHullAtlas: no layout found");
}

const F32 = new Float32Array(1);
const U32 = new Uint32Array(F32.buffer);

/** One float32 step of a non-negative value, up or down. */
function stepFloat32(value: number, direction: 1 | -1): number {
  F32[0] = value;
  if (direction < 0 && (U32[0] ?? 0) === 0) return 0;
  U32[0] = (U32[0] ?? 0) + direction;
  return F32[0] ?? 0;
}

/**
 * Round an atlas coordinate to float32 so that `floor(value * side)` selects
 * `target`, moving by single float32 steps when the rounded value lands on the
 * other side of a texel boundary. Returns `null` when no neighbour does.
 */
function settleCoordinate(
  exact: number,
  side: number,
  target: number,
): number | null {
  let value = Math.fround(exact);
  for (let attempt = 0; attempt < 8; attempt++) {
    const index = Math.floor(value * side);
    if (index === target) return value;
    value = stepFloat32(value, index < target ? 1 : -1);
  }
  return null;
}

interface Tuple {
  readonly diffuse: string | null;
  readonly normal: string | null;
  readonly specular: string | null;
  readonly emission: string | null;
  readonly roughness: number | null;
}

const DIFFUSE_FILL = [255, 255, 255, 255] as const;
const NORMAL_FILL = [128, 128, 255, 255] as const;
const SPECULAR_FILL = [255, 255, 255, 255] as const;
const ROUGHNESS_UNUSED = [0, 255, 0, 255] as const;
const EMISSIVE_BAKE_SUFFIX = "_emissive.png";

function isMergedExtras(
  extras: OoliteExtras | MergedOoliteExtras | null,
): extras is MergedOoliteExtras {
  return extras !== null && "merged" in extras;
}

/** The nearest-texel index of a coordinate on a map of `size` texels. */
function nearestIndex(coordinate: number, size: number): number {
  const index = Math.floor(coordinate * size);
  return index < 0 ? 0 : index > size - 1 ? size - 1 : index;
}

function texelOf(
  image: RgbaImage,
  u: number,
  v: number,
): readonly [number, number, number, number] {
  const x = nearestIndex(u, image.width);
  const y = nearestIndex(v, image.height);
  const offset = (y * image.width + x) * 4;
  return [
    image.data[offset] ?? 0,
    image.data[offset + 1] ?? 0,
    image.data[offset + 2] ?? 0,
    image.data[offset + 3] ?? 0,
  ];
}

function hashPixels(side: number, channels: number, data: Uint8Array): string {
  const header = new TextEncoder().encode(
    `${String(side)}x${String(channels)}:`,
  );
  const joined = new Uint8Array(header.length + data.length);
  joined.set(header, 0);
  joined.set(data, header.length);
  return sha256Hex(joined).slice(0, 12);
}

function sortedUnique(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

type PaintMode = "rgb" | "rgba" | "alpha";

/** Copy `source` into a region of `side` texels, replicating by the ratio. */
function paintRegion(
  target: Uint8Array,
  atlasSide: number,
  region: AtlasRegion,
  source: RgbaImage,
  mode: PaintMode,
): void {
  const ratio = region.side / source.width;
  const channels = mode === "alpha" ? 1 : 4;
  for (let y = 0; y < region.side; y++) {
    const sourceRow = Math.floor(y / ratio);
    for (let x = 0; x < region.side; x++) {
      const at = (sourceRow * source.width + Math.floor(x / ratio)) * 4;
      const out = ((region.y + y) * atlasSide + region.x + x) * channels;
      if (mode === "alpha") {
        target[out] = source.data[at + 3] ?? 0;
        continue;
      }
      target[out] = source.data[at] ?? 0;
      target[out + 1] = source.data[at + 1] ?? 0;
      target[out + 2] = source.data[at + 2] ?? 0;
      target[out + 3] = mode === "rgb" ? 255 : (source.data[at + 3] ?? 0);
    }
  }
}

function fillRegion(
  target: Uint8Array,
  atlasSide: number,
  region: AtlasRegion,
  values: readonly number[],
  channels: number,
): void {
  for (let y = 0; y < region.side; y++) {
    for (let x = 0; x < region.side; x++) {
      const out = ((region.y + y) * atlasSide + region.x + x) * channels;
      for (let channel = 0; channel < channels; channel++) {
        target[out + channel] = values[channel] ?? 0;
      }
    }
  }
}

function newImage(
  side: number,
  channels: 1 | 4,
  fill: readonly number[],
): Uint8Array {
  const data = new Uint8Array(side * side * channels);
  for (let index = 0; index < data.length; index += channels) {
    for (let channel = 0; channel < channels; channel++) {
      data[index + channel] = fill[channel] ?? 0;
    }
  }
  return data;
}

/**
 * Merge the primitives of one hull into one primitive and one material through
 * a per-hull atlas, or say why not (see the module doc for the conditions).
 */
export function mergeHullPrimitives(input: MergeInput): MergeOutcome {
  const { primitives, materials, textures } = input;
  if (primitives.length !== materials.length) {
    throw new Error("mergeHullPrimitives: one material per primitive");
  }
  if (primitives.length <= 1) return { kind: "single" };

  // (a) every UV inside the unit square.
  for (const [index, primitive] of primitives.entries()) {
    for (let at = 0; at < primitive.uvs.length; at++) {
      const value = primitive.uvs[at] ?? Number.NaN;
      if (!(value >= 0 && value <= 1)) {
        return refuse(
          "a",
          `primitive ${String(index)} (${primitive.materialName}) has UV ${String(value)} outside [0, 1]`,
        );
      }
    }
  }

  // (d) one complete UV channel per primitive.
  for (const [index, primitive] of primitives.entries()) {
    if (
      primitive.uvs.length === 0 ||
      primitive.uvs.length / 2 !== primitive.positions.length / 3
    ) {
      return refuse(
        "d",
        `primitive ${String(index)} (${primitive.materialName}) has no complete UV channel 0`,
      );
    }
  }

  // The per-primitive tuples.
  const roughnessSlot = !materials.every(
    (material) => material.roughnessFactor === materials[0]?.roughnessFactor,
  );
  const tuples: Tuple[] = [];
  const tupleOf: number[] = [];
  const keyIndex = new Map<string, number>();
  const configInputs = new Set<string>();
  for (const [index, material] of materials.entries()) {
    const extras = material.extrasOolite;
    if (extras === null || isMergedExtras(extras)) {
      return refuse("e", `material ${String(index)} has no authored values`);
    }
    configInputs.add(extras.sourceFile);
    let emission: string | null = null;
    if (material.emissiveTexture !== null) {
      if (
        !material.emissiveTexture.endsWith(EMISSIVE_BAKE_SUFFIX) ||
        extras.emission_map === null
      ) {
        return refuse(
          "e",
          `material ${material.name} emits an RGB image, which no greyscale mask slot can hold`,
        );
      }
      emission = extras.emission_map;
    }
    const tuple: Tuple = {
      diffuse: material.baseColorTexture,
      normal: material.normalTexture,
      specular: material.specularTexture,
      emission,
      roughness: roughnessSlot
        ? Math.round(material.roughnessFactor * 255)
        : null,
    };
    const key = JSON.stringify(tuple);
    let slot = keyIndex.get(key);
    if (slot === undefined) {
      slot = tuples.length;
      keyIndex.set(key, slot);
      tuples.push(tuple);
    }
    tupleOf.push(slot);
  }

  // (b) square regions, and the region sides.
  const sides: number[] = [];
  for (const tuple of tuples) {
    let side = 1;
    for (const name of [
      tuple.diffuse,
      tuple.normal,
      tuple.specular,
      tuple.emission,
    ]) {
      if (name === null) continue;
      const image = textures(name);
      if (image.width !== image.height) {
        return refuse(
          "b",
          `${name} is ${String(image.width)}x${String(image.height)}, not square`,
        );
      }
      if (!isPowerOfTwo(image.width)) {
        return refuse(
          "e",
          `${name} is ${String(image.width)} texels, not a power of two`,
        );
      }
      side = Math.max(side, image.width);
    }
    sides.push(side);
  }

  // (c) the atlas side.
  const layout = packHullAtlas(sides);
  if (layout.side > MAX_HULL_ATLAS_SIDE) {
    return refuse(
      "c",
      `the layout needs ${String(layout.side)} texels per side, over ${String(MAX_HULL_ATLAS_SIDE)}`,
    );
  }
  const atlasSide = layout.side;

  // The slot images.
  const present = {
    diffuse: tuples.some((tuple) => tuple.diffuse !== null),
    normal: tuples.some((tuple) => tuple.normal !== null),
    specular: tuples.some((tuple) => tuple.specular !== null),
    emissive: tuples.some((tuple) => tuple.emission !== null),
    roughness: roughnessSlot,
  };
  const rasters: Partial<Record<AtlasSlot, Uint8Array>> = {};
  const rgba = (name: string): RgbaImage => textures(name);

  if (present.diffuse) rasters.diffuse = newImage(atlasSide, 4, DIFFUSE_FILL);
  if (present.normal) rasters.normal = newImage(atlasSide, 4, NORMAL_FILL);
  if (present.specular)
    rasters.specular = newImage(atlasSide, 4, SPECULAR_FILL);
  if (present.emissive) rasters.emissive = newImage(atlasSide, 1, [0]);
  if (present.roughness)
    rasters.roughness = newImage(atlasSide, 4, ROUGHNESS_UNUSED);

  for (const [t, tuple] of tuples.entries()) {
    const region = layout.regions[t];
    if (region === undefined) continue;
    const diffuse = rasters.diffuse;
    if (diffuse !== undefined) {
      if (tuple.diffuse === null) {
        fillRegion(diffuse, atlasSide, region, DIFFUSE_FILL, 4);
      } else {
        const source = rgba(tuple.diffuse);
        paintRegion(diffuse, atlasSide, region, source, "rgb");
      }
    }
    const normal = rasters.normal;
    if (normal !== undefined) {
      if (tuple.normal === null) {
        fillRegion(normal, atlasSide, region, NORMAL_FILL, 4);
      } else {
        const source = rgba(tuple.normal);
        paintRegion(normal, atlasSide, region, source, "rgb");
      }
    }
    const specular = rasters.specular;
    if (specular !== undefined) {
      if (tuple.specular === null) {
        fillRegion(specular, atlasSide, region, SPECULAR_FILL, 4);
      } else {
        const source = rgba(tuple.specular);
        paintRegion(specular, atlasSide, region, source, "rgba");
      }
    }
    const emissive = rasters.emissive;
    if (emissive !== undefined) {
      if (tuple.emission === null) {
        fillRegion(emissive, atlasSide, region, [0], 1);
      } else {
        const source = rgba(tuple.emission);
        paintRegion(emissive, atlasSide, region, source, "alpha");
      }
    }
    const roughness = rasters.roughness;
    if (roughness !== undefined) {
      fillRegion(
        roughness,
        atlasSide,
        region,
        [0, tuple.roughness ?? 0, 0, 255],
        4,
      );
    }
  }

  // The merged geometry: the primitives in authored order, UVs remapped.
  let vertexCount = 0;
  for (const primitive of primitives)
    vertexCount += primitive.positions.length / 3;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(vertexCount);
  let cursor = 0;
  for (const [index, primitive] of primitives.entries()) {
    const region = layout.regions[tupleOf[index] ?? 0];
    if (region === undefined) continue;
    const count = primitive.positions.length / 3;
    positions.set(primitive.positions, cursor * 3);
    normals.set(primitive.normals, cursor * 3);
    for (let corner = 0; corner < count; corner++) {
      const u = primitive.uvs[corner * 2] ?? 0;
      const v = primitive.uvs[corner * 2 + 1] ?? 0;
      const targetX = region.x + nearestIndex(u, region.side);
      const targetY = region.y + nearestIndex(v, region.side);
      const settledU = settleCoordinate(
        (region.x + u * region.side) / atlasSide,
        atlasSide,
        targetX,
      );
      const settledV = settleCoordinate(
        (region.y + v * region.side) / atlasSide,
        atlasSide,
        targetY,
      );
      if (settledU === null || settledV === null) {
        return refuse(
          "e",
          `primitive ${String(index)} corner ${String(corner)} has no float32 UV that selects texel (${String(targetX)}, ${String(targetY)})`,
        );
      }
      uvs[(cursor + corner) * 2] = settledU;
      uvs[(cursor + corner) * 2 + 1] = settledV;
      indices[cursor + corner] = cursor + corner;
    }
    cursor += count;
  }

  // (e) texel exactness, for every corner and every slot.
  cursor = 0;
  for (const [index, primitive] of primitives.entries()) {
    const tuple = tuples[tupleOf[index] ?? 0];
    const region = layout.regions[tupleOf[index] ?? 0];
    if (tuple === undefined || region === undefined) continue;
    const count = primitive.positions.length / 3;
    for (let corner = 0; corner < count; corner++) {
      const u = primitive.uvs[corner * 2] ?? 0;
      const v = primitive.uvs[corner * 2 + 1] ?? 0;
      const mergedU = uvs[(cursor + corner) * 2] ?? 0;
      const mergedV = uvs[(cursor + corner) * 2 + 1] ?? 0;
      const ax = Math.min(
        Math.max(Math.floor(mergedU * atlasSide), region.x),
        region.x + region.side - 1,
      );
      const ay = Math.min(
        Math.max(Math.floor(mergedV * atlasSide), region.y),
        region.y + region.side - 1,
      );
      const atlasAt = (raster: Uint8Array, channels: number): number[] => {
        const offset = (ay * atlasSide + ax) * channels;
        return Array.from(raster.subarray(offset, offset + channels));
      };
      const checks: [AtlasSlot, readonly number[], readonly number[]][] = [];
      const diffuse = rasters.diffuse;
      if (diffuse !== undefined) {
        const expected =
          tuple.diffuse === null
            ? DIFFUSE_FILL
            : texelOf(rgba(tuple.diffuse), u, v);
        checks.push([
          "diffuse",
          atlasAt(diffuse, 4),
          [expected[0] ?? 0, expected[1] ?? 0, expected[2] ?? 0, 255],
        ]);
      }
      const normal = rasters.normal;
      if (normal !== undefined) {
        const expected =
          tuple.normal === null
            ? NORMAL_FILL
            : texelOf(rgba(tuple.normal), u, v);
        checks.push([
          "normal",
          atlasAt(normal, 4),
          [expected[0] ?? 0, expected[1] ?? 0, expected[2] ?? 0, 255],
        ]);
      }
      const specular = rasters.specular;
      if (specular !== undefined) {
        const expected =
          tuple.specular === null
            ? SPECULAR_FILL
            : texelOf(rgba(tuple.specular), u, v);
        checks.push(["specular", atlasAt(specular, 4), [...expected]]);
      }
      const emissive = rasters.emissive;
      if (emissive !== undefined) {
        const expected =
          tuple.emission === null
            ? 0
            : (texelOf(rgba(tuple.emission), u, v)[3] ?? 0);
        checks.push(["emissive", atlasAt(emissive, 1), [expected]]);
      }
      const roughness = rasters.roughness;
      if (roughness !== undefined) {
        checks.push([
          "roughness",
          atlasAt(roughness, 4),
          [0, tuple.roughness ?? 0, 0, 255],
        ]);
      }
      for (const [slot, actual, expected] of checks) {
        if (actual.some((value, at) => value !== expected[at])) {
          return refuse(
            "e",
            `primitive ${String(index)} corner ${String(corner)}: the ${slot} atlas texel ${JSON.stringify(actual)} differs from ${JSON.stringify(expected)}`,
          );
        }
      }
    }
    cursor += count;
  }

  // The images, content-addressed.
  const images: AtlasImage[] = [];
  const slots: [AtlasSlot, 1 | 4, (tuple: Tuple) => string | null][] = [
    ["diffuse", 4, (tuple) => tuple.diffuse],
    ["normal", 4, (tuple) => tuple.normal],
    ["specular", 4, (tuple) => tuple.specular],
    ["emissive", 1, (tuple) => tuple.emission],
    ["roughness", 4, () => null],
  ];
  const names: Partial<Record<AtlasSlot, string>> = {};
  for (const [slot, channels, pick] of slots) {
    const data = rasters[slot];
    if (data === undefined) continue;
    const hash = hashPixels(atlasSide, channels, data);
    const name = `oolite_${input.model}_${slot}_atlas_${hash}.png`;
    names[slot] = name;
    images.push({
      slot,
      name,
      side: atlasSide,
      channels,
      data,
      inputTextures: sortedUnique(
        tuples.flatMap((tuple) => {
          const picked = pick(tuple);
          return picked === null ? [] : [picked];
        }),
      ),
      inputConfig: slot === "roughness" ? sortedUnique(configInputs) : [],
      regions: tuples.length,
    });
  }

  const authored: OoliteExtras[] = [];
  for (const material of materials) {
    if (
      material.extrasOolite !== null &&
      !isMergedExtras(material.extrasOolite)
    ) {
      authored.push(material.extrasOolite);
    }
  }
  const material: GlbMaterial = {
    name: `${input.model}-atlas`,
    baseColorTexture: names.diffuse ?? null,
    normalTexture: names.normal ?? null,
    specularTexture: names.specular ?? null,
    emissiveTexture: names.emissive ?? null,
    metallicRoughnessTexture: names.roughness ?? null,
    roughnessFactor: roughnessSlot ? 1 : (materials[0]?.roughnessFactor ?? 1),
    extrasOolite: { merged: authored },
  };

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  for (const primitive of primitives) {
    minX = Math.min(minX, primitive.min[0]);
    minY = Math.min(minY, primitive.min[1]);
    minZ = Math.min(minZ, primitive.min[2]);
    maxX = Math.max(maxX, primitive.max[0]);
    maxY = Math.max(maxY, primitive.max[1]);
    maxZ = Math.max(maxZ, primitive.max[2]);
  }
  const primitive: GlbPrimitive = {
    materialName: material.name,
    positions,
    normals,
    uvs,
    indices,
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
  return { kind: "merged", primitive, material, images, layout };
}

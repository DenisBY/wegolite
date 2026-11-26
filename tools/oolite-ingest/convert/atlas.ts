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
 * three.js's derivative tangent frame unchanged. Every region keeps a gutter
 * of `ATLAS_GUTTER` texels on each side. The padded regions are placed on a
 * grid of `ATLAS_GUTTER` texels, largest first (ties in input order), at the
 * first free cell in row-major order, in the smallest atlas side (a multiple of
 * the gutter) that holds them. The layout is a pure function of the region
 * sides and their order: never of a pixel, which is what lets the
 * texture-variant records of one model share merged geometry (plan 21-18).
 *
 * The gutter (TOOLS-WR-01). Oolite samples a ship map with CLAMP_TO_EDGE
 * (`OOConcreteTexture.m:432-434`; ship materials never set `repeat_s`), so a
 * fetch at a map's edge reads that level's edge texel, at every mip level. In
 * an atlas the texel past a region's edge belongs to something else: at mip
 * level k a bilinear fetch at the edge reads the level-k texel across it, a
 * block of 2^k base texels, and trilinear filtering reads levels floor(lambda)
 * and floor(lambda) + 1. So each region's gutter holds the region's own edge
 * mirrored (the texel at distance d past the edge is the region texel at
 * distance d - 1 inside it): with the region offsets and the atlas side on the
 * 2^5 = 32 texel grid, the level-k block past an edge is the mirror of the last
 * level-k block inside it, so it averages to exactly the edge texel
 * CLAMP_TO_EDGE reads at that level. The atlas therefore samples exactly like
 * the separate clamped maps up to level 5, that is while lambda < 5 (every
 * region of the roster is 128 texels or more). On the roster's maps (7 to 24
 * texels per metre on the hull maps, up to 35 on the Python's gun map) at
 * Oolite's 57.2 degree flight field of view across 1 920 pixels, lambda reaches
 * 5 at about 2 to 8 km for a hull map and 1.6 km for the densest map, where the
 * ship is about 15 to 50 pixels long. Past the gutter, the free atlas area
 * holds the nearest region's outermost gutter texel, extruded, never a neutral
 * fill, so beyond level 5 an edge facing free space still blends only with its
 * own content; an edge facing another region's gutter, or the opposite atlas
 * edge through the GLB's default REPEAT wrap, blends with that neighbour over
 * less than one screen pixel. A gutter of 2^5 costs 17 to 27 percent more texels
 * per atlas than an unpadded layout (the Anaconda's side grows from 1 536 to
 * 1 664).
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

/**
 * The gutter every region keeps on each side, in texels: 2^5, so the atlas
 * samples like the separate clamped maps up to mip level 5 (TOOLS-WR-01, see
 * the module doc for the viewing distances this covers).
 */
export const ATLAS_GUTTER = 32;

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
 * Place square regions of power-of-two sides on a square atlas, each with a
 * gutter of `gutter` texels (a power of two) on every side.
 *
 * Deterministic and independent of any pixel. A region's footprint is its side
 * rounded up to a multiple of the gutter, plus the gutter on both sides. The
 * footprints are placed largest first (ties in input order), each at the first
 * free cell of the gutter grid, scanning rows then columns, without overlap.
 * The atlas side is the smallest multiple of the gutter that holds them all,
 * searched upward from the area bound. The returned regions are the inner
 * squares (the maps), so every offset is a multiple of the gutter and at least
 * one gutter from the atlas edge and two from another region. The returned side
 * may exceed `MAX_HULL_ATLAS_SIDE`; the caller applies condition (c).
 */
export function packHullAtlas(
  sides: readonly number[],
  gutter: number = ATLAS_GUTTER,
): AtlasLayout {
  if (sides.length === 0) throw new Error("packHullAtlas: no regions");
  if (!isPowerOfTwo(gutter)) {
    throw new Error(
      `packHullAtlas: gutter ${String(gutter)} is not a power of 2`,
    );
  }
  for (const side of sides) {
    if (!isPowerOfTwo(side)) {
      throw new Error(
        `packHullAtlas: side ${String(side)} is not a power of 2`,
      );
    }
  }
  const footprintOf = (side: number): number =>
    Math.ceil(side / gutter) * gutter + 2 * gutter;
  const order = sides
    .map((side, index) => ({ side, index, footprint: footprintOf(side) }))
    .sort((left, right) => right.side - left.side || left.index - right.index);
  const largest = Math.max(...order.map((entry) => entry.footprint));
  const area = order.reduce(
    (sum, entry) => sum + entry.footprint * entry.footprint,
    0,
  );
  const lowerBound = Math.max(largest, Math.ceil(Math.sqrt(area)));
  const sum = order.reduce((total, entry) => total + entry.footprint, 0);

  interface Placed {
    readonly x: number;
    readonly y: number;
    readonly size: number;
  }
  for (
    let side = Math.ceil(lowerBound / gutter) * gutter;
    side <= Math.max(sum, lowerBound);
    side += gutter
  ) {
    const footprints: Placed[] = [];
    const placed: AtlasRegion[] = new Array<AtlasRegion>(sides.length);
    let fits = true;
    for (const { side: regionSide, index, footprint } of order) {
      let found = false;
      for (let y = 0; y + footprint <= side && !found; y += gutter) {
        for (let x = 0; x + footprint <= side && !found; x += gutter) {
          const overlaps = footprints.some(
            (other) =>
              x < other.x + other.size &&
              other.x < x + footprint &&
              y < other.y + other.size &&
              other.y < y + footprint,
          );
          if (overlaps) continue;
          footprints.push({ x, y, size: footprint });
          placed[index] = { x: x + gutter, y: y + gutter, side: regionSide };
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
  // Unreachable: a row of the footprints always fits an atlas of side `sum`.
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
const EMISSIVE_BAKE_SUFFIX = "_emissive.png";

function isMergedExtras(
  extras: OoliteExtras | MergedOoliteExtras | null,
): extras is MergedOoliteExtras {
  return extras !== null && "merged" in extras;
}

/**
 * The element `at` of a list that is index-aligned with another by
 * construction (the tuples, `tupleOf` and `layout.regions`). A miss is a broken
 * invariant and fails the build: skipping it would misalign the vertex cursor
 * of every later primitive (TOOLS-IN-02).
 */
function alignedAt<T>(list: readonly T[], at: number, what: string): T {
  const value = list[at];
  if (value === undefined) {
    throw new Error(
      `mergeHullPrimitives: no ${what} at index ${String(at)} of ${String(list.length)}`,
    );
  }
  return value;
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

/**
 * The symmetric reflection of an offset `t` from a region's first texel into
 * `[0, side)`: `-1` is `0`, `side` is `side - 1`, periodic past twice the side.
 */
export function reflectOffset(t: number, side: number): number {
  const period = 2 * side;
  const folded = ((t % period) + period) % period;
  return folded < side ? folded : period - 1 - folded;
}

/**
 * For every atlas texel, the texel it holds: itself inside a region, else a
 * texel of the nearest region (Chebyshev distance, then squared Euclidean
 * distance, then region order), its offset from the region clamped to the
 * gutter and reflected into the region. Within a region's gutter that region is
 * always the nearest, because another region is at least two gutters away, so
 * the gutter holds the region's edge mirrored, and past the gutter the free
 * area holds the outermost gutter texel (TOOLS-WR-01).
 */
export function gutterSources(
  side: number,
  regions: readonly AtlasRegion[],
  gutter: number = ATLAS_GUTTER,
): Int32Array {
  const sources = new Int32Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      let bestChebyshev = Number.POSITIVE_INFINITY;
      let bestSquared = Number.POSITIVE_INFINITY;
      let sourceX = x;
      let sourceY = y;
      for (const region of regions) {
        const last = region.side - 1;
        const dx = Math.max(region.x - x, 0, x - (region.x + last));
        const dy = Math.max(region.y - y, 0, y - (region.y + last));
        const chebyshev = Math.max(dx, dy);
        const squared = dx * dx + dy * dy;
        if (
          chebyshev < bestChebyshev ||
          (chebyshev === bestChebyshev && squared < bestSquared)
        ) {
          bestChebyshev = chebyshev;
          bestSquared = squared;
          const offsetX = Math.min(
            Math.max(x - region.x, -gutter),
            last + gutter,
          );
          const offsetY = Math.min(
            Math.max(y - region.y, -gutter),
            last + gutter,
          );
          sourceX = region.x + reflectOffset(offsetX, region.side);
          sourceY = region.y + reflectOffset(offsetY, region.side);
        }
      }
      sources[y * side + x] = sourceY * side + sourceX;
    }
  }
  return sources;
}

/** Copy every texel outside the regions from its gutter source. */
function fillOutside(
  target: Uint8Array,
  channels: number,
  sources: Int32Array,
): void {
  for (let index = 0; index < sources.length; index++) {
    const source = sources[index] ?? index;
    if (source === index) continue;
    for (let channel = 0; channel < channels; channel++) {
      target[index * channels + channel] =
        target[source * channels + channel] ?? 0;
    }
  }
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

  // Every texel is written: the regions are painted below, then every texel
  // outside them is filled from the nearest region (`gutterSources`).
  const texels = atlasSide * atlasSide;
  if (present.diffuse) rasters.diffuse = new Uint8Array(texels * 4);
  if (present.normal) rasters.normal = new Uint8Array(texels * 4);
  if (present.specular) rasters.specular = new Uint8Array(texels * 4);
  if (present.emissive) rasters.emissive = new Uint8Array(texels);
  if (present.roughness) rasters.roughness = new Uint8Array(texels * 4);

  for (const [t, tuple] of tuples.entries()) {
    const region = alignedAt(layout.regions, t, "region");
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

  // The gutters (each region's edge mirrored) and the free area.
  const sources = gutterSources(atlasSide, layout.regions);
  for (const [slot, raster] of Object.entries(rasters)) {
    fillOutside(raster, slot === "emissive" ? 1 : 4, sources);
  }

  // The merged geometry: the primitives in authored order, UVs remapped.
  // Each source index buffer is honoured, offset by the primitive's first
  // vertex, so a deduplicated or reordered primitive keeps its triangles
  // (TOOLS-IN-01); an index outside its own primitive fails the build.
  let vertexCount = 0;
  let indexCount = 0;
  for (const primitive of primitives) {
    vertexCount += primitive.positions.length / 3;
    indexCount += primitive.indices.length;
  }
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint32Array(indexCount);
  let cursor = 0;
  let written = 0;
  for (const [index, primitive] of primitives.entries()) {
    const region = alignedAt(
      layout.regions,
      alignedAt(tupleOf, index, "tuple index"),
      "region",
    );
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
    }
    for (const sourceIndex of primitive.indices) {
      if (sourceIndex >= count) {
        throw new Error(
          `mergeHullPrimitives: primitive ${primitive.materialName} index ${String(sourceIndex)} is outside its ${String(count)} vertices`,
        );
      }
      indices[written] = cursor + sourceIndex;
      written += 1;
    }
    cursor += count;
  }

  // (e) texel exactness, for every corner and every slot.
  cursor = 0;
  for (const [index, primitive] of primitives.entries()) {
    const tupleIndex = alignedAt(tupleOf, index, "tuple index");
    const tuple = alignedAt(tuples, tupleIndex, "tuple");
    const region = alignedAt(layout.regions, tupleIndex, "region");
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

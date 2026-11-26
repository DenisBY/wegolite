// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-hull texture atlases and the primitive merge (DATA-18, D-05 fix (1),
 * T-21-39, T-21-41).
 *
 * The synthetic cases pin the layout rule, the five validity conditions and
 * their boundaries; the vendored cases run the real maps of the anaconda (three
 * primitives, two of them sharing a diffuse map with different gloss and
 * emission) and of every NPC hull the converter merges. Texel exactness is
 * checked through the PNG encoder and decoder (`encodeAtlasPng`, `decodePng`,
 * `sampleNearest`), a path independent of the builder's own verification.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { parseOpenStep } from "../openstep/parser.js";
import {
  ATLAS_GUTTER,
  MAX_HULL_ATLAS_SIDE,
  mergeHullPrimitives,
  packHullAtlas,
  refusalText,
} from "./atlas.js";
import type {
  AtlasImage,
  AtlasRegion,
  MergeOutcome,
  RgbaImage,
} from "./atlas.js";
import { parseDat, repairWinding, selectNormalMode } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import {
  MERGED_NPC_GLBS,
  MODEL_SOURCE_FILES,
  EMITTED_ENTRIES,
  atlasImagesOf,
  convertMesh,
  encodedTextureFile,
  hullTextureNames,
  materialFor,
  planHullMerges,
} from "./glb.js";
import type { GlbMaterial, GlbPrimitive, ShipEntry } from "./glb.js";
import { compileShips } from "./ships.js";
import {
  decodePng,
  encodeAtlasPng,
  encodeRgbaPng,
  loadTextureImages,
  sampleNearest,
} from "./textures.js";

const REPO_ROOT = process.cwd();

/** A deterministic, position-dependent image: no two corners share a value. */
function pattern(side: number, seed: number): RgbaImage {
  const data = new Uint8Array(side * side * 4);
  for (let index = 0; index < side * side; index++) {
    const x = index % side;
    const y = Math.floor(index / side);
    data[index * 4] = (x * 7 + seed * 31) & 255;
    data[index * 4 + 1] = (y * 11 + seed * 17) & 255;
    data[index * 4 + 2] = ((x ^ y) * 5 + seed) & 255;
    data[index * 4 + 3] = (x * 3 + y * 13 + seed * 29) & 255;
  }
  return { width: side, height: side, data };
}

function extras(materialKey: string, gloss = 1): GlbMaterial["extrasOolite"] {
  return {
    sourceFile: "third_party/oolite/Config/shipdata.plist",
    shipKey: "synthetic",
    materialKey,
    gloss,
    shininess: null,
    specular_color: null,
    emission_modulate_color: null,
    emissionModulateColorNormalized: [1, 1, 1],
    emission_extract_channel: null,
    diffuse_map: null,
    normal_map: null,
    specular_map: null,
    emission_map: null,
  };
}

function material(
  name: string,
  fields: Partial<GlbMaterial> & { emission?: string },
): GlbMaterial {
  const emission = fields.emission ?? null;
  const base = extras(name);
  return {
    name,
    baseColorTexture: null,
    normalTexture: null,
    specularTexture: null,
    emissiveTexture:
      emission === null ? null : emission.replace(".png", "_emissive.png"),
    roughnessFactor: 0.5,
    ...fields,
    extrasOolite:
      base === null || "merged" in base
        ? base
        : { ...base, emission_map: emission },
  };
}

/** One triangle per primitive, with the given UVs at its three corners. */
function triangle(
  name: string,
  uvs: readonly [number, number][],
): GlbPrimitive {
  const flat = new Float32Array(uvs.flatMap(([u, v]) => [u, v]));
  return {
    materialName: name,
    positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    uvs: flat,
    indices: new Uint32Array([0, 1, 2]),
    min: [0, 0, 0],
    max: [1, 1, 0],
  };
}

function lookupOf(images: Record<string, RgbaImage>) {
  return (name: string): RgbaImage => {
    const image = images[name];
    if (image === undefined) throw new Error(`no synthetic image ${name}`);
    return image;
  };
}

function mergedOf(outcome: MergeOutcome) {
  if (outcome.kind !== "merged") {
    throw new Error(`expected a merge, got ${JSON.stringify(outcome)}`);
  }
  return outcome;
}

/**
 * Every texel outside the regions must hold a texel of a nearest region
 * (Chebyshev distance): within the gutter its edge mirrored (the texel at
 * distance d past the edge is the one at distance d - 1 inside), past the
 * gutter the outermost mirrored texel. A neutral fill or a far region fails.
 * Computed here by brute force, independently of `gutterSources`.
 */
function outsideMismatches(
  data: Uint8Array,
  side: number,
  channels: number,
  regions: readonly AtlasRegion[],
): { mismatches: number; gutter: number; outside: number } {
  let mismatches = 0;
  let gutter = 0;
  let outside = 0;
  const clamp = (value: number, low: number, high: number): number =>
    Math.min(Math.max(value, low), high);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const nearest: number[] = [];
      let best = Number.POSITIVE_INFINITY;
      for (const region of regions) {
        const distance = Math.max(
          Math.abs(x - clamp(x, region.x, region.x + region.side - 1)),
          Math.abs(y - clamp(y, region.y, region.y + region.side - 1)),
        );
        if (distance < best) {
          best = distance;
          nearest.length = 0;
        }
        if (distance === best) {
          const mirror = (at: number, start: number, size: number): number => {
            const t = clamp(at - start, -ATLAS_GUTTER, size - 1 + ATLAS_GUTTER);
            if (t < 0) return start + reflectInside(-1 - t, size);
            if (t >= size) return start + reflectInside(2 * size - 1 - t, size);
            return start + t;
          };
          const sx = mirror(x, region.x, region.side);
          const sy = mirror(y, region.y, region.side);
          nearest.push(sy * side + sx);
        }
      }
      if (best === 0) continue;
      outside += 1;
      if (best <= ATLAS_GUTTER) gutter += 1;
      const at = (y * side + x) * channels;
      const matches = nearest.some((source) => {
        for (let channel = 0; channel < channels; channel++) {
          if (data[at + channel] !== data[source * channels + channel]) {
            return false;
          }
        }
        return true;
      });
      if (!matches) mismatches += 1;
    }
  }
  return { mismatches, gutter, outside };
}

/** A mirrored offset folded back into `[0, size)` for a map under the gutter. */
function reflectInside(t: number, size: number): number {
  let value = t;
  while (value < 0 || value >= size) {
    value = value < 0 ? -1 - value : 2 * size - 1 - value;
  }
  return value;
}

/** Box-filtered mip levels 0..levels of a square image (every side even). */
function boxChain(
  data: Uint8Array,
  side: number,
  channels: number,
  levels: number,
): Float32Array[] {
  const chain: Float32Array[] = [Float32Array.from(data)];
  let size = side;
  for (let level = 1; level <= levels; level++) {
    const previous = chain[level - 1] ?? new Float32Array(0);
    if (size % 2 !== 0) throw new Error(`side ${String(size)} is odd`);
    const half = size / 2;
    const next = new Float32Array(half * half * channels);
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        for (let channel = 0; channel < channels; channel++) {
          const read = (dx: number, dy: number): number =>
            previous[((2 * y + dy) * size + 2 * x + dx) * channels + channel] ??
            0;
          next[(y * half + x) * channels + channel] =
            (read(0, 0) + read(1, 0) + read(0, 1) + read(1, 1)) / 4;
        }
      }
    }
    chain.push(next);
    size = half;
  }
  return chain;
}

/** A bilinear fetch at (u, v) from one mip level, CLAMP_TO_EDGE addressing. */
function bilinear(
  level: Float32Array,
  size: number,
  channels: number,
  u: number,
  v: number,
): number[] {
  const fx = u * size - 0.5;
  const fy = v * size - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const wx = fx - x0;
  const wy = fy - y0;
  const clamp = (value: number): number =>
    Math.min(Math.max(value, 0), size - 1);
  const out: number[] = [];
  for (let channel = 0; channel < channels; channel++) {
    const read = (x: number, y: number): number =>
      level[(clamp(y) * size + clamp(x)) * channels + channel] ?? 0;
    out.push(
      (1 - wy) * ((1 - wx) * read(x0, y0) + wx * read(x0 + 1, y0)) +
        wy * ((1 - wx) * read(x0, y0 + 1) + wx * read(x0 + 1, y0 + 1)),
    );
  }
  return out;
}

/** The texels of one region, as its own square image. */
function regionImage(
  data: Uint8Array,
  side: number,
  channels: number,
  region: AtlasRegion,
): Uint8Array {
  const out = new Uint8Array(region.side * region.side * channels);
  for (let y = 0; y < region.side; y++) {
    out.set(
      data.subarray(
        ((region.y + y) * side + region.x) * channels,
        ((region.y + y) * side + region.x + region.side) * channels,
      ),
      y * region.side * channels,
    );
  }
  return out;
}

describe("packHullAtlas", () => {
  it("lays the anaconda's three regions (1024, 512, 512) on one square atlas, each in a 32-texel gutter", () => {
    expect(ATLAS_GUTTER).toBe(32);
    const layout = packHullAtlas([1024, 512, 512]);
    expect(layout.side).toBe(1664);
    expect(layout.side).toBeLessThanOrEqual(MAX_HULL_ATLAS_SIDE);
    expect(layout.regions).toEqual([
      { x: 32, y: 32, side: 1024 },
      { x: 1120, y: 32, side: 512 },
      { x: 1120, y: 608, side: 512 },
    ]);
  });

  it("keeps every region on the gutter grid, a gutter from the atlas edge and two gutters from any other region (TOOLS-WR-01)", () => {
    const gutter = ATLAS_GUTTER;
    for (const sides of [
      [256, 1024, 512, 256],
      [128, 128, 512, 1024, 256],
      [512, 512, 512, 512, 512],
      [128, 1024],
    ]) {
      const layout = packHullAtlas(sides);
      expect(layout.side % gutter).toBe(0);
      layout.regions.forEach((region, index) => {
        expect(region.side).toBe(sides[index]);
        expect(region.x % gutter).toBe(0);
        expect(region.y % gutter).toBe(0);
        expect(region.x).toBeGreaterThanOrEqual(gutter);
        expect(region.y).toBeGreaterThanOrEqual(gutter);
        expect(region.x + region.side + gutter).toBeLessThanOrEqual(
          layout.side,
        );
        expect(region.y + region.side + gutter).toBeLessThanOrEqual(
          layout.side,
        );
      });
      for (const [i, a] of layout.regions.entries()) {
        for (const b of layout.regions.slice(i + 1)) {
          const gapX = Math.max(b.x - (a.x + a.side), a.x - (b.x + b.side));
          const gapY = Math.max(b.y - (a.y + a.side), a.y - (b.y + b.side));
          expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(2 * gutter);
        }
      }
    }
  });

  it("is a pure function of the sides and their order", () => {
    expect(packHullAtlas([1024, 256])).toEqual(packHullAtlas([1024, 256]));
    expect(packHullAtlas([1024, 256]).side).toBe(1408);
    expect(packHullAtlas([1024, 128]).side).toBe(1280);
    expect(packHullAtlas([512, 512]).side).toBe(1152);
  });

  it("pads a region by the gutter on every side, a small region rounded up to the gutter grid", () => {
    expect(packHullAtlas([8], 4)).toEqual({
      side: 16,
      regions: [{ x: 4, y: 4, side: 8 }],
    });
    expect(packHullAtlas([2], 4)).toEqual({
      side: 12,
      regions: [{ x: 4, y: 4, side: 2 }],
    });
    expect(packHullAtlas([1024]).side).toBe(1024 + 2 * ATLAS_GUTTER);
  });

  it("holds exactly 2048 texels per side, and two 1024 maps need more (condition (c))", () => {
    expect(packHullAtlas([1024], 512).side).toBe(MAX_HULL_ATLAS_SIDE);
    expect(packHullAtlas([2048], 1).side).toBe(MAX_HULL_ATLAS_SIDE + 2);
    expect(packHullAtlas([1024, 1024]).side).toBe(2176);
  });

  it("refuses a side or a gutter that is not a power of two, and an empty hull", () => {
    expect(() => packHullAtlas([300])).toThrow("side 300 is not a power of 2");
    expect(() => packHullAtlas([256], 3)).toThrow(
      "gutter 3 is not a power of 2",
    );
    expect(() => packHullAtlas([])).toThrow("no regions");
  });
});

describe("mergeHullPrimitives: validity conditions", () => {
  const maps = {
    "a.png": pattern(8, 1),
    "b.png": pattern(4, 2),
  };
  const materials = [
    material("A", { baseColorTexture: "a.png" }),
    material("B", { baseColorTexture: "b.png" }),
  ];

  it("leaves a hull of one primitive alone", () => {
    const outcome = mergeHullPrimitives({
      model: "x",
      primitives: [
        triangle("A", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
      ],
      materials: [material("A", { baseColorTexture: "a.png" })],
      textures: lookupOf(maps),
    });
    expect(outcome.kind).toBe("single");
  });

  it("merges a hull whose UVs reach exactly 0 and 1", () => {
    const outcome = mergeHullPrimitives({
      model: "x",
      primitives: [
        triangle("A", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
        triangle("B", [
          [1, 1],
          [0, 1],
          [1, 0],
        ]),
      ],
      materials,
      textures: lookupOf(maps),
    });
    const merged = mergedOf(outcome);
    expect(merged.primitive.positions).toHaveLength(18);
    expect(merged.primitive.indices).toEqual(
      new Uint32Array([0, 1, 2, 3, 4, 5]),
    );
  });

  it("honours each source index buffer, offset by the primitive's first vertex (TOOLS-IN-01)", () => {
    // A quad of four shared vertices, two triangles: not an identity buffer.
    const quad: GlbPrimitive = {
      materialName: "B",
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0]),
      normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
      indices: new Uint32Array([0, 1, 2, 2, 1, 3]),
      min: [0, 0, 0],
      max: [1, 1, 0],
    };
    const first = triangle("A", [
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    const merged = mergedOf(
      mergeHullPrimitives({
        model: "x",
        primitives: [first, quad],
        materials,
        textures: lookupOf(maps),
      }),
    );
    expect(merged.primitive.positions).toHaveLength(21);
    expect(merged.primitive.indices).toEqual(
      new Uint32Array([0, 1, 2, 3, 4, 5, 5, 4, 6]),
    );

    const broken: GlbPrimitive = {
      ...quad,
      indices: new Uint32Array([0, 1, 4]),
    };
    expect(() =>
      mergeHullPrimitives({
        model: "x",
        primitives: [first, broken],
        materials,
        textures: lookupOf(maps),
      }),
    ).toThrow("outside its 4 vertices");
  });

  it.each([1.0001, -0.0001, Number.NaN])(
    "refuses a UV of %s with condition (a)",
    (value) => {
      const outcome = mergeHullPrimitives({
        model: "x",
        primitives: [
          triangle("A", [
            [0, 0],
            [1, 0],
            [0, 1],
          ]),
          triangle("B", [
            [value, 0],
            [0, 1],
            [1, 0],
          ]),
        ],
        materials,
        textures: lookupOf(maps),
      });
      expect(outcome.kind).toBe("refused");
      if (outcome.kind === "refused") {
        expect(outcome.refusal.condition).toBe("a");
        expect(refusalText(outcome.refusal)).toContain("outside [0, 1]");
      }
    },
  );

  it("refuses a non-square map with condition (b)", () => {
    const outcome = mergeHullPrimitives({
      model: "x",
      primitives: [
        triangle("A", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
        triangle("B", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
      ],
      materials,
      textures: lookupOf({
        ...maps,
        "b.png": { width: 8, height: 4, data: new Uint8Array(8 * 4 * 4) },
      }),
    });
    expect(outcome).toMatchObject({
      kind: "refused",
      refusal: { condition: "b" },
    });
  });

  it("refuses a layout over 2048 texels with condition (c)", () => {
    const outcome = mergeHullPrimitives({
      model: "x",
      primitives: [
        triangle("A", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
        triangle("B", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
      ],
      materials,
      // The refusal comes from the sides alone; no pixel is read.
      textures: lookupOf({
        "a.png": { width: 2048, height: 2048, data: new Uint8Array(0) },
        "b.png": { width: 1024, height: 1024, data: new Uint8Array(0) },
      }),
    });
    expect(outcome).toMatchObject({
      kind: "refused",
      refusal: { condition: "c" },
    });
  });

  it("refuses a primitive without a complete UV channel with condition (d)", () => {
    const broken = triangle("B", [
      [0, 0],
      [1, 0],
      [0, 1],
    ]);
    const outcome = mergeHullPrimitives({
      model: "x",
      primitives: [
        triangle("A", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
        { ...broken, uvs: new Float32Array([0, 0, 1, 0]) },
      ],
      materials,
      textures: lookupOf(maps),
    });
    expect(outcome).toMatchObject({
      kind: "refused",
      refusal: { condition: "d" },
    });
  });

  it("refuses a map whose side is not a power of two with condition (e)", () => {
    const outcome = mergeHullPrimitives({
      model: "x",
      primitives: [
        triangle("A", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
        triangle("B", [
          [0, 0],
          [1, 0],
          [0, 1],
        ]),
      ],
      materials,
      textures: lookupOf({ ...maps, "b.png": pattern(6, 3) }),
    });
    expect(outcome).toMatchObject({
      kind: "refused",
      refusal: { condition: "e" },
    });
  });
});

/** The texel at the remapped UV of a corner, region-clamped, from a decoded atlas. */
function atlasTexel(
  decoded: { width: number; data: Uint8Array },
  channels: number,
  u: number,
  v: number,
  region: { x: number; y: number; side: number },
): number[] {
  const clamp = (value: number, low: number, high: number): number =>
    Math.min(Math.max(value, low), high);
  const x = clamp(
    Math.floor(u * decoded.width),
    region.x,
    region.x + region.side - 1,
  );
  const y = clamp(
    Math.floor(v * decoded.width),
    region.y,
    region.y + region.side - 1,
  );
  const offset = (y * decoded.width + x) * channels;
  return Array.from(decoded.data.subarray(offset, offset + channels));
}

describe("mergeHullPrimitives: texel exactness through the PNG path", () => {
  const maps = {
    "hull.png": pattern(16, 1),
    "hull_n.png": pattern(16, 2),
    "hull_s.png": pattern(16, 3),
    "sub.png": pattern(8, 4),
    "sub_n.png": pattern(4, 5),
  };
  const materials = [
    material("Hull", {
      baseColorTexture: "hull.png",
      normalTexture: "hull_n.png",
      specularTexture: "hull_s.png",
      emission: "hull.png",
      roughnessFactor: 0.04,
    }),
    // Same diffuse as Engine, different gloss and no emission: its own region.
    material("Gun", {
      baseColorTexture: "sub.png",
      roughnessFactor: 0.378,
    }),
    material("Engine", {
      baseColorTexture: "sub.png",
      normalTexture: "sub_n.png",
      emission: "sub.png",
      roughnessFactor: 0.04,
    }),
  ];
  const corners: readonly [number, number][][] = [
    [
      [0, 0],
      [1, 0],
      [0, 1],
    ],
    [
      [0.25, 0.75],
      [0.5, 0.5],
      [0.999, 0.001],
    ],
    [
      [1, 1],
      [0.0625, 0.9375],
      [0.3, 0.7],
    ],
  ];
  const primitives = materials.map((entry, index) =>
    triangle(entry.name, corners[index] ?? []),
  );
  const outcome = mergedOf(
    mergeHullPrimitives({
      model: "synthetic",
      primitives,
      materials,
      textures: lookupOf(maps),
    }),
  );

  it("builds one square region per distinct tuple, even for a shared diffuse map", () => {
    expect(outcome.layout.regions.map((region) => region.side)).toEqual([
      16, 8, 8,
    ]);
    // Three footprints of 32 + 2 x 32 texels (the maps rounded up to the
    // gutter grid, then the gutter on both sides).
    expect(outcome.layout.side).toBe(192);
    expect(outcome.images.map((image) => image.slot).sort()).toEqual([
      "diffuse",
      "emissive",
      "normal",
      "roughness",
      "specular",
    ]);
    expect(outcome.material.roughnessFactor).toBe(1);
    expect(outcome.primitive.uvs).toHaveLength(18);
  });

  it("returns the atlas texel of every corner equal to the source texel", () => {
    const byslot = (slot: AtlasImage["slot"]): AtlasImage => {
      const image = outcome.images.find((candidate) => candidate.slot === slot);
      if (image === undefined) throw new Error(`no ${slot} atlas`);
      return image;
    };
    const decode = (image: AtlasImage) => {
      const png = encodeAtlasPng(image);
      return image.channels === 1
        ? {
            width: image.side,
            data: image.data,
            png,
          }
        : { ...decodePng(png), png };
    };
    const diffuse = decode(byslot("diffuse"));
    const normal = decode(byslot("normal"));
    const specular = decode(byslot("specular"));
    const emissive = decode(byslot("emissive"));
    const roughness = decode(byslot("roughness"));

    primitives.forEach((primitive, index) => {
      const entry = materials[index];
      const region = outcome.layout.regions[index];
      if (entry === undefined || region === undefined) throw new Error("row");
      for (let corner = 0; corner < 3; corner++) {
        const u = primitive.uvs[corner * 2] ?? 0;
        const v = primitive.uvs[corner * 2 + 1] ?? 0;
        const at = (index * 3 + corner) * 2;
        const mu = outcome.primitive.uvs[at] ?? 0;
        const mv = outcome.primitive.uvs[at + 1] ?? 0;
        const source = (name: string | null) =>
          name === null
            ? null
            : sampleNearest(
                encodeRgbaPng(
                  (maps as Record<string, RgbaImage>)[name]?.data ??
                    new Uint8Array(0),
                  (maps as Record<string, RgbaImage>)[name]?.width ?? 1,
                  (maps as Record<string, RgbaImage>)[name]?.width ?? 1,
                ),
                u,
                v,
              );

        const diffuseSource = source(entry.baseColorTexture);
        expect(atlasTexel(diffuse, 4, mu, mv, region).slice(0, 3)).toEqual(
          (diffuseSource ?? [255, 255, 255]).slice(0, 3),
        );
        const normalSource = source(entry.normalTexture);
        expect(atlasTexel(normal, 4, mu, mv, region).slice(0, 3)).toEqual(
          (normalSource ?? [128, 128, 255]).slice(0, 3),
        );
        const specularSource = source(entry.specularTexture);
        expect(atlasTexel(specular, 4, mu, mv, region)).toEqual([
          ...(specularSource ?? [255, 255, 255, 255]),
        ]);
        const emissionName =
          entry.extrasOolite !== null && "emission_map" in entry.extrasOolite
            ? entry.extrasOolite.emission_map
            : null;
        const emissionSource = source(emissionName);
        expect(atlasTexel(emissive, 1, mu, mv, region)).toEqual([
          emissionSource === null ? 0 : (emissionSource[3] ?? 0),
        ]);
        expect(atlasTexel(roughness, 4, mu, mv, region)).toEqual([
          0,
          Math.round(entry.roughnessFactor * 255),
          0,
          255,
        ]);
      }
    });
  });

  it("fills every texel outside the regions from the nearest region's mirrored edge, through the PNG path (TOOLS-WR-01)", () => {
    for (const image of outcome.images) {
      const data =
        image.channels === 1
          ? image.data
          : decodePng(encodeAtlasPng(image)).data;
      const result = outsideMismatches(
        data,
        image.side,
        image.channels,
        outcome.layout.regions,
      );
      expect(result.gutter, image.slot).toBeGreaterThan(0);
      expect(result.mismatches, image.slot).toBe(0);
    }
  });

  it("takes an interior corner through sampleNearest on the atlas itself", () => {
    const image = outcome.images.find(
      (candidate) => candidate.slot === "diffuse",
    );
    if (image === undefined) throw new Error("no diffuse atlas");
    const png = encodeAtlasPng(image);
    // The Gun is primitive 1; its first corner (0.25, 0.75) is interior to its
    // 8-texel region, so the plain nearest sample of the atlas is the source's.
    const mu = outcome.primitive.uvs[6] ?? 0;
    const mv = outcome.primitive.uvs[7] ?? 0;
    expect(sampleNearest(png, mu, mv).slice(0, 3)).toEqual(
      sampleNearest(
        encodeRgbaPng(maps["sub.png"].data, 8, 8),
        0.25,
        0.75,
      ).slice(0, 3),
    );
  });

  it("keeps every authored value under extras.oolite.merged, in order", () => {
    const extrasOolite = outcome.material.extrasOolite;
    expect(extrasOolite !== null && "merged" in extrasOolite).toBe(true);
    if (extrasOolite !== null && "merged" in extrasOolite) {
      expect(extrasOolite.merged.map((entry) => entry.materialKey)).toEqual([
        "Hull",
        "Gun",
        "Engine",
      ]);
    }
  });

  it("names the images by content and keeps the layout when only pixels change", () => {
    const changed = mergedOf(
      mergeHullPrimitives({
        model: "synthetic",
        primitives,
        materials,
        textures: lookupOf({ ...maps, "hull.png": pattern(16, 9) }),
      }),
    );
    expect(changed.layout).toEqual(outcome.layout);
    expect(changed.primitive.uvs).toEqual(outcome.primitive.uvs);
    const nameOf = (merged: typeof outcome, slot: string) =>
      merged.images.find((image) => image.slot === slot)?.name;
    expect(nameOf(changed, "diffuse")).not.toBe(nameOf(outcome, "diffuse"));
    // The normal atlas holds none of the changed map: the same file.
    expect(nameOf(changed, "normal")).toBe(nameOf(outcome, "normal"));
    for (const image of outcome.images) {
      expect(image.name).toMatch(
        new RegExp(`^oolite_synthetic_${image.slot}_atlas_[0-9a-f]{12}\\.png$`),
      );
    }
  });

  it("keeps a shared roughness as the factor, with no roughness atlas", () => {
    const same = mergedOf(
      mergeHullPrimitives({
        model: "synthetic",
        primitives,
        materials: materials.map((entry) => ({
          ...entry,
          roughnessFactor: 0.25,
        })),
        textures: lookupOf(maps),
      }),
    );
    expect(same.material.roughnessFactor).toBe(0.25);
    expect(same.material.metallicRoughnessTexture).toBeNull();
    expect(same.images.map((image) => image.slot)).not.toContain("roughness");
  });
});

describe("atlasImagesOf (TOOLS-IN-03)", () => {
  function image(fields: Partial<AtlasImage>): AtlasImage {
    return {
      slot: "emissive",
      name: "oolite_x_emissive_atlas_000000000000.png",
      side: 2,
      channels: 1,
      data: new Uint8Array([1, 2, 3, 4]),
      inputTextures: ["a.png"],
      inputConfig: [],
      regions: 1,
      ...fields,
    };
  }
  function plan(...images: AtlasImage[][]): Map<string, MergeOutcome> {
    return new Map(
      images.map((list, index): [string, MergeOutcome] => [
        `hull-${String(index)}.glb`,
        {
          kind: "merged",
          primitive: triangle("A", [
            [0, 0],
            [1, 0],
            [0, 1],
          ]),
          material: material("A", {}),
          images: list,
          layout: { side: 2, regions: [] },
        },
      ]),
    );
  }

  it("keeps one image per name and names the union of its producers' inputs", () => {
    const merged = atlasImagesOf(
      plan(
        [image({ inputTextures: ["b.png"], inputConfig: ["y.plist"] })],
        [
          image({
            inputTextures: ["a.png", "b.png"],
            inputConfig: ["x.plist"],
          }),
        ],
      ),
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.inputTextures).toEqual(["a.png", "b.png"]);
    expect(merged[0]?.inputConfig).toEqual(["x.plist", "y.plist"]);
  });

  it("fails loudly on one name with different content", () => {
    for (const other of [
      image({ data: new Uint8Array([1, 2, 3, 5]) }),
      image({ side: 4, data: new Uint8Array(16) }),
      image({ slot: "diffuse" }),
      image({ channels: 4, data: new Uint8Array(16) }),
    ]) {
      expect(() => atlasImagesOf(plan([image({})], [other]))).toThrow(
        "produced twice with different content",
      );
    }
  });
});

describe("the vendored hulls", () => {
  const ENTRY_KEYS = ["anaconda", "anaconda-pirate"];

  function load(): {
    models: Record<string, ParsedMesh>;
    entries: Record<string, ShipEntry>;
  } {
    const read = (relative: string): string =>
      readFileSync(join(REPO_ROOT, relative), "utf8");
    const catalogue = compileShips(
      parseOpenStep(
        read("third_party/oolite/Config/shipdata.plist"),
        "shipdata.plist",
      ),
      parseOpenStep(
        read("third_party/oolite/Config/shipdata-overrides.plist"),
        "shipdata-overrides.plist",
      ),
    );
    const entries: Record<string, ShipEntry> = {};
    for (const entry of catalogue.entries) {
      entries[entry.key] = { key: entry.key, shipDef: entry.shipDef };
    }
    const models: Record<string, ParsedMesh> = {};
    for (const files of Object.values(MODEL_SOURCE_FILES)) {
      for (const file of files) {
        const path = `third_party/oolite/Models/${file}`;
        models[file] ??= parseDat(read(path), path);
      }
    }
    return { models, entries };
  }

  it("merges the anaconda's Hull, Engine and Gun into one primitive and one material", async () => {
    expect(ENTRY_KEYS.map((key) => EMITTED_ENTRIES[`${key}.glb`])).toEqual([
      ["anaconda"],
      ["anaconda-pirate"],
    ]);
    const { models, entries } = load();
    const outcomes = planHullMerges(
      models,
      entries,
      await loadTextureImages(
        REPO_ROOT,
        hullTextureNames(models, entries, [
          "anaconda.glb",
          "anaconda-pirate.glb",
        ]),
      ),
      ["anaconda.glb", "anaconda-pirate.glb"],
    );
    const merged = mergedOf(outcomes.get("anaconda.glb") as MergeOutcome);
    // Engine, Gun and Hull, in the authored material order.
    expect(merged.layout.regions.map((region) => region.side)).toEqual([
      512, 512, 1024,
    ]);
    expect(merged.layout.regions).toEqual([
      { x: 1120, y: 32, side: 512 },
      { x: 1120, y: 608, side: 512 },
      { x: 32, y: 32, side: 1024 },
    ]);
    expect(merged.layout.side).toBe(1664);
    const sourceVertices =
      (models["oolite_anaconda.dat"]?.faces.length ?? 0) * 3;
    expect(merged.primitive.positions.length / 3).toBe(sourceVertices);
    expect(merged.images.map((image) => image.slot).sort()).toEqual([
      "diffuse",
      "emissive",
      "normal",
      "roughness",
      "specular",
    ]);
    // The pirate shares the model and the materials: the same atlas files.
    const pirate = mergedOf(
      outcomes.get("anaconda-pirate.glb") as MergeOutcome,
    );
    expect(pirate.images.map((image) => image.name)).toEqual(
      merged.images.map((image) => image.name),
    );
  }, 120_000);

  /** The generator's merge plan over every NPC hull, run once. */
  let planned:
    | Promise<{
        outcomes: Map<string, MergeOutcome>;
        models: Record<string, ParsedMesh>;
        entries: Record<string, ShipEntry>;
        textures: (name: string) => RgbaImage;
      }>
    | undefined;
  function planAll() {
    planned ??= (async () => {
      const { models, entries } = load();
      const textures = await loadTextureImages(
        REPO_ROOT,
        hullTextureNames(models, entries, MERGED_NPC_GLBS),
      );
      return {
        outcomes: planHullMerges(models, entries, textures, MERGED_NPC_GLBS),
        models,
        entries,
        textures,
      };
    })();
    return planned;
  }

  it("derives each NPC hull's expectation from the converter's own conditions", async () => {
    const { models, outcomes } = await planAll();
    expect([...outcomes.keys()].sort()).toEqual([...MERGED_NPC_GLBS].sort());
    for (const [file, outcome] of outcomes) {
      const primitives =
        models[MODEL_SOURCE_FILES[file]?.[0] ?? ""]?.materials.length ?? 0;
      if (primitives <= 1) {
        expect(outcome.kind, file).toBe("single");
      } else if (outcome.kind === "refused") {
        expect(["a", "b", "c", "d", "e"], file).toContain(
          outcome.refusal.condition,
        );
      } else {
        expect(outcome.kind, file).toBe("merged");
      }
      if (outcome.kind === "merged") {
        expect(outcome.layout.side, file).toBeLessThanOrEqual(
          MAX_HULL_ATLAS_SIDE,
        );
        expect(outcome.primitive.positions.length / 3, file).toBe(
          (models[MODEL_SOURCE_FILES[file]?.[0] ?? ""]?.faces.length ?? 0) * 3,
        );
      }
    }
  }, 300_000);

  it.each([...MERGED_NPC_GLBS])(
    "%s: every corner of every source primitive reads the same texel through the atlas",
    async (file) => {
      const { outcomes, models, entries, textures } = await planAll();
      const outcome = outcomes.get(file);
      if (outcome?.kind !== "merged") return;
      const source = MODEL_SOURCE_FILES[file]?.[0] ?? "";
      const owner = EMITTED_ENTRIES[file]?.[0] ?? "";
      const entry = entries[owner];
      // A fresh parse of the vendored file, repaired exactly once here: the
      // expectation never depends on what the merge plan did to its own copy
      // (TOOLS-WR-02). The plan must leave its input untouched as well.
      const path = `third_party/oolite/Models/${source}`;
      const mesh = parseDat(readFileSync(join(REPO_ROOT, path), "utf8"), path);
      if (entry === undefined) throw new Error(file);
      expect(models[source], `${file} parsed mesh`).toEqual(mesh);
      const mode = selectNormalMode(mesh, { smooth: entry.shipDef.smooth });
      repairWinding(mesh, mode);
      const primitives = convertMesh(mesh, mode, "gltf");
      const image = (slot: string): AtlasImage | undefined =>
        outcome.images.find((candidate) => candidate.slot === slot);
      const side = outcome.layout.side;
      const nearest = (value: number, size: number): number =>
        Math.min(Math.max(Math.floor(value * size), 0), size - 1);
      let checked = 0;
      let cursor = 0;
      for (const primitive of primitives) {
        const authored = materialFor(
          primitive.materialName,
          entry.shipDef,
          entry.key,
        );
        const extras = authored.extrasOolite;
        const count = primitive.positions.length / 3;
        for (let corner = 0; corner < count; corner++) {
          const u = primitive.uvs[corner * 2] ?? 0;
          const v = primitive.uvs[corner * 2 + 1] ?? 0;
          const x = Math.floor(
            (outcome.primitive.uvs[(cursor + corner) * 2] ?? 0) * side,
          );
          const y = Math.floor(
            (outcome.primitive.uvs[(cursor + corner) * 2 + 1] ?? 0) * side,
          );
          const read = (slot: string, channels: number): number[] => {
            const raster = image(slot);
            if (raster === undefined) return [];
            const at = (y * side + x) * channels;
            return Array.from(raster.data.subarray(at, at + channels));
          };
          const texel = (name: string | null, fill: number[]): number[] => {
            if (name === null) return fill;
            const map = textures(name);
            const at =
              (nearest(v, map.height) * map.width + nearest(u, map.width)) * 4;
            return Array.from(map.data.subarray(at, at + 4));
          };
          const diffuse = texel(
            authored.baseColorTexture,
            [255, 255, 255, 255],
          );
          expect(read("diffuse", 4), `${file} diffuse`).toEqual([
            ...diffuse.slice(0, 3),
            255,
          ]);
          if (image("normal") !== undefined) {
            const normal = texel(authored.normalTexture, [128, 128, 255, 255]);
            expect(read("normal", 4), `${file} normal`).toEqual([
              ...normal.slice(0, 3),
              255,
            ]);
          }
          if (image("specular") !== undefined) {
            expect(read("specular", 4), `${file} specular`).toEqual(
              texel(authored.specularTexture, [255, 255, 255, 255]),
            );
          }
          if (image("emissive") !== undefined) {
            const emission =
              extras !== null && "emission_map" in extras
                ? extras.emission_map
                : null;
            const mask = texel(
              authored.emissiveTexture === null ? null : emission,
              [0, 0, 0, 0],
            );
            expect(read("emissive", 1), `${file} emissive`).toEqual([
              mask[3] ?? 0,
            ]);
          }
          if (image("roughness") !== undefined) {
            expect(read("roughness", 4), `${file} roughness`).toEqual([
              0,
              Math.round(authored.roughnessFactor * 255),
              0,
              255,
            ]);
          }
          checked += 1;
        }
        cursor += count;
      }
      expect(checked, file).toBe(outcome.primitive.positions.length / 3);
    },
    300_000,
  );

  it("names every producer's inputs in each atlas file's ASSETS.md row (TOOLS-IN-03)", async () => {
    const { outcomes } = await planAll();
    const assets = readFileSync(join(REPO_ROOT, "ASSETS.md"), "utf8").split(
      "\n",
    );
    const images = atlasImagesOf(outcomes);
    let shared = 0;
    for (const image of images) {
      const path = `public/textures/${encodedTextureFile(image.name)}`;
      const row = assets.find((line) => line.startsWith(`| ${path} `));
      expect(row, path).toBeDefined();
      const producers = [...outcomes.values()].flatMap((outcome) =>
        outcome.kind === "merged"
          ? outcome.images.filter((candidate) => candidate.name === image.name)
          : [],
      );
      for (const producer of producers) {
        for (const input of producer.inputTextures) {
          expect(image.inputTextures, `${image.name} ${input}`).toContain(
            input,
          );
        }
      }
      if (new Set(producers.map((p) => p.inputTextures.join())).size > 1) {
        shared += 1;
      }
      for (const input of image.inputTextures) {
        expect(row, `${path} names ${input}`).toContain(input);
      }
    }
    // The Cobra Mk III variants' shared emissive mask has three producers.
    const cobra = images.find(
      (candidate) =>
        candidate.slot === "emissive" &&
        candidate.name.startsWith("oolite_cobra3_"),
    );
    expect(cobra?.inputTextures).toEqual([
      "oolite_cobra3_diffuse.png",
      "oolite_cobra3_diffuse_alt.png",
      "oolite_cobra3_diffuse_pirate.png",
    ]);
    // Five emissive masks are shared by variants with different inputs: the
    // Cobra Mk III, Mamba, Moray, Python and Viper families.
    expect(shared).toBe(5);
  }, 300_000);

  it("mirrors every merged hull's region edges into its gutters and fills the free area from them, in every slot (TOOLS-WR-01)", async () => {
    const { outcomes } = await planAll();
    const checked = new Set<string>();
    for (const [file, outcome] of outcomes) {
      if (outcome.kind !== "merged") continue;
      for (const image of outcome.images) {
        if (checked.has(image.name)) continue;
        checked.add(image.name);
        const result = outsideMismatches(
          image.data,
          image.side,
          image.channels,
          outcome.layout.regions,
        );
        expect(result.gutter, `${file} ${image.slot}`).toBeGreaterThan(0);
        expect(result.mismatches, `${file} ${image.slot}`).toBe(0);
      }
    }
    expect(checked.size).toBeGreaterThan(0);
  }, 300_000);

  it.each([...MERGED_NPC_GLBS])(
    "%s: samples like the separate clamped maps at every corner up to mip level 5 (TOOLS-WR-01)",
    async (file) => {
      const { outcomes, models, entries } = await planAll();
      const outcome = outcomes.get(file);
      if (outcome?.kind !== "merged") return;
      const source = MODEL_SOURCE_FILES[file]?.[0] ?? "";
      const entry = entries[EMITTED_ENTRIES[file]?.[0] ?? ""];
      if (entry === undefined || models[source] === undefined) {
        throw new Error(file);
      }
      const path = `third_party/oolite/Models/${source}`;
      const mesh = parseDat(readFileSync(join(REPO_ROOT, path), "utf8"), path);
      const mode = selectNormalMode(mesh, { smooth: entry.shipDef.smooth });
      repairWinding(mesh, mode);
      const primitives = convertMesh(mesh, mode, "gltf");
      const levels = 5;
      const side = outcome.layout.side;
      // Every region of the roster is at least 2^5 texels, so the claim holds
      // for every level checked here.
      for (const region of outcome.layout.regions) {
        expect(region.side % 2 ** levels, file).toBe(0);
      }
      let compared = 0;
      for (const image of outcome.images) {
        const channels = image.channels;
        const atlas = boxChain(image.data, side, channels, levels);
        const isolated = outcome.layout.regions.map((region) =>
          boxChain(
            regionImage(image.data, side, channels, region),
            region.side,
            channels,
            levels,
          ),
        );
        let cursor = 0;
        let worst = 0;
        for (const primitive of primitives) {
          const count = primitive.positions.length / 3;
          for (let corner = 0; corner < count; corner++) {
            const u = primitive.uvs[corner * 2] ?? 0;
            const v = primitive.uvs[corner * 2 + 1] ?? 0;
            const mu = outcome.primitive.uvs[(cursor + corner) * 2] ?? 0;
            const mv = outcome.primitive.uvs[(cursor + corner) * 2 + 1] ?? 0;
            const tx = Math.min(Math.floor(mu * side), side - 1);
            const ty = Math.min(Math.floor(mv * side), side - 1);
            const index = outcome.layout.regions.findIndex(
              (region) =>
                tx >= region.x &&
                tx < region.x + region.side &&
                ty >= region.y &&
                ty < region.y + region.side,
            );
            const region = outcome.layout.regions[index];
            const own = isolated[index];
            if (region === undefined || own === undefined) {
              throw new Error(`${file}: corner outside every region`);
            }
            for (let level = 1; level <= levels; level++) {
              const scale = 2 ** level;
              const merged = bilinear(
                atlas[level] ?? new Float32Array(0),
                side / scale,
                channels,
                mu,
                mv,
              );
              const alone = bilinear(
                own[level] ?? new Float32Array(0),
                region.side / scale,
                channels,
                u,
                v,
              );
              for (let channel = 0; channel < channels; channel++) {
                worst = Math.max(
                  worst,
                  Math.abs((merged[channel] ?? 0) - (alone[channel] ?? 0)),
                );
              }
              compared += 1;
            }
          }
          cursor += count;
        }
        // Only the float32 rounding of the remapped UV moves a weight.
        expect(worst, `${file} ${image.slot}`).toBeLessThan(0.05);
      }
      expect(compared, file).toBeGreaterThan(0);
    },
    300_000,
  );

  it("gives the variant records of one model the same layout and merged geometry", async () => {
    const { outcomes } = await planAll();
    const families = new Map<string, string[]>();
    for (const file of MERGED_NPC_GLBS) {
      const source = MODEL_SOURCE_FILES[file]?.[0] ?? "";
      families.set(source, [...(families.get(source) ?? []), file]);
    }
    let compared = 0;
    for (const files of families.values()) {
      const merged = files.flatMap((file) => {
        const outcome = outcomes.get(file);
        return outcome?.kind === "merged" ? [outcome] : [];
      });
      const [first, ...rest] = merged;
      if (first === undefined) continue;
      for (const other of rest) {
        expect(other.layout).toEqual(first.layout);
        expect(other.primitive.positions).toEqual(first.primitive.positions);
        expect(other.primitive.normals).toEqual(first.primitive.normals);
        expect(other.primitive.uvs).toEqual(first.primitive.uvs);
        expect(other.primitive.indices).toEqual(first.primitive.indices);
        compared += 1;
      }
    }
    // The nine variant families of plan 21-08 give at least nine pairs.
    expect(compared).toBeGreaterThanOrEqual(9);
  }, 300_000);

  it("shares every atlas file two records share a map in, and only those", async () => {
    const { outcomes } = await planAll();
    const names = (file: string): Record<string, string> => {
      const outcome = outcomes.get(file);
      if (outcome?.kind !== "merged") throw new Error(`${file} is not merged`);
      return Object.fromEntries(
        outcome.images.map((image) => [image.slot, image.name]),
      );
    };
    // Equal maps and values: the same files.
    for (const [a, b] of [
      ["anaconda.glb", "anaconda-pirate.glb"],
      ["boa.glb", "boa-pirate.glb"],
      ["boa-mk2.glb", "boa-mk2-pirate.glb"],
    ] as const) {
      expect(names(a), `${a} ${b}`).toEqual(names(b));
    }
    // The Cobra Mk III variants differ in the hull's diffuse map only.
    const trader = names("cobra3-trader.glb");
    const alternate = names("cobra3-alternate.glb");
    const pirate = names("cobra3-pirate.glb");
    for (const slot of ["normal", "specular", "roughness"]) {
      expect(alternate[slot], slot).toBe(trader[slot]);
      expect(pirate[slot], slot).toBe(trader[slot]);
    }
    expect(
      new Set([trader.diffuse, alternate.diffuse, pirate.diffuse]).size,
    ).toBe(3);
    // The three variants recolour the hull but keep its alpha mask, so the
    // emissive atlas is the one file: content addressing shares it.
    expect(alternate.emissive).toBe(trader.emissive);
    expect(pirate.emissive).toBe(trader.emissive);
  }, 300_000);
});

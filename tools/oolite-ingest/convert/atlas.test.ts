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
  MAX_HULL_ATLAS_SIDE,
  mergeHullPrimitives,
  packHullAtlas,
  refusalText,
} from "./atlas.js";
import type { AtlasImage, MergeOutcome, RgbaImage } from "./atlas.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import {
  MERGED_NPC_GLBS,
  MODEL_SOURCE_FILES,
  EMITTED_ENTRIES,
  hullTextureNames,
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

describe("packHullAtlas", () => {
  it("lays the anaconda's three regions (1024, 512, 512) on one square atlas", () => {
    const layout = packHullAtlas([1024, 512, 512]);
    expect(layout.side).toBe(1536);
    expect(layout.side).toBeLessThanOrEqual(MAX_HULL_ATLAS_SIDE);
    expect(layout.regions).toEqual([
      { x: 0, y: 0, side: 1024 },
      { x: 1024, y: 0, side: 512 },
      { x: 1024, y: 512, side: 512 },
    ]);
  });

  it("aligns every region to a multiple of its own side, without overlap", () => {
    for (const sides of [
      [256, 1024, 512, 256],
      [128, 128, 512, 1024, 256],
      [512, 512, 512, 512, 512],
    ]) {
      const layout = packHullAtlas(sides);
      layout.regions.forEach((region, index) => {
        expect(region.side).toBe(sides[index]);
        expect(region.x % region.side).toBe(0);
        expect(region.y % region.side).toBe(0);
        expect(region.x + region.side).toBeLessThanOrEqual(layout.side);
        expect(region.y + region.side).toBeLessThanOrEqual(layout.side);
      });
      for (const [i, a] of layout.regions.entries()) {
        for (const b of layout.regions.slice(i + 1)) {
          const apart =
            a.x + a.side <= b.x ||
            b.x + b.side <= a.x ||
            a.y + a.side <= b.y ||
            b.y + b.side <= a.y;
          expect(apart).toBe(true);
        }
      }
    }
  });

  it("is a pure function of the sides and their order", () => {
    expect(packHullAtlas([1024, 256])).toEqual(packHullAtlas([1024, 256]));
    expect(packHullAtlas([1024, 256]).side).toBe(1280);
    expect(packHullAtlas([512, 512]).side).toBe(1024);
  });

  it("holds exactly 2048 texels per side and needs 2049 for a 2048 region plus a texel", () => {
    expect(packHullAtlas([2048]).side).toBe(MAX_HULL_ATLAS_SIDE);
    expect(packHullAtlas([1024, 1024, 1024]).side).toBe(MAX_HULL_ATLAS_SIDE);
    expect(packHullAtlas([2048, 1]).side).toBe(MAX_HULL_ATLAS_SIDE + 1);
  });

  it("refuses a side that is not a power of two, and an empty hull", () => {
    expect(() => packHullAtlas([300])).toThrow("not a power of 2");
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
    expect(outcome.layout.side).toBe(24);
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
    expect(merged.layout.side).toBe(1536);
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

  it("derives each NPC hull's expectation from the converter's own conditions", async () => {
    const { models, entries } = load();
    const outcomes = planHullMerges(
      models,
      entries,
      await loadTextureImages(
        REPO_ROOT,
        hullTextureNames(models, entries, MERGED_NPC_GLBS),
      ),
      MERGED_NPC_GLBS,
    );
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
      }
    }
  }, 300_000);
});

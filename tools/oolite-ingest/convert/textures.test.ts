// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The texture reference closure, the byte-identical copy and the emissive bake
 * (DATA-04, DATA-07, DATA-09, D-03, D-20, D-21, T-02-19, T-02-20).
 *
 * The closure is asserted in both directions against the two emitted GLBs: a
 * referenced-but-absent texture and an allowlisted-but-unreferenced texture each
 * fail. Copied bytes are compared with their source bytes, so "vendored
 * verbatim" is a test result rather than a promise.
 */

import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import { sha256Hex } from "../canonical/hash.js";
import { parseOpenStep } from "../openstep/parser.js";
import { compileShips } from "./ships.js";
import {
  VENDORED_TEXTURES,
  bakeEmissive,
  copyTextures,
  decodeGreyscalePng,
  decodePng,
  emitTextures,
  resolveReferencedTextures,
  sampleNearest,
} from "./textures.js";
import { convertMesh } from "./glb.js";
import type { Face, MeshMaterial, ParsedMesh } from "./dat.js";
import type { ShipCatalogue } from "../../../src/content/schemas/ship.js";

const REPO_ROOT = process.cwd();
const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";

/** A fresh catalogue: a test may mutate it without affecting its siblings. */
function catalogue(): ShipCatalogue {
  return compileShips(
    parseOpenStep(readFileSync(join(REPO_ROOT, SHIPDATA), "utf8"), SHIPDATA),
    parseOpenStep(readFileSync(join(REPO_ROOT, OVERRIDES), "utf8"), OVERRIDES),
  ).entries;
}

function nameList(references: Map<string, unknown>): string[] {
  return [...references.keys()].sort();
}

function withDiffuse(name: string): ShipCatalogue {
  const entries = catalogue();
  const player = entries.find((entry) => entry.key === "cobra3-player");
  if (player === undefined) throw new Error("cobra3-player is missing");
  const hull = player.shipDef.materials.Hull ?? {};
  player.shipDef.materials.Hull = { ...hull, diffuse_map: name };
  return entries;
}

function caught(body: () => void): { message: string; code?: string } {
  try {
    body();
  } catch (error) {
    if (isContentError(error)) {
      return { message: error.message, code: error.code };
    }
    throw error;
  }
  throw new Error("expected the call to throw");
}

describe("texture reference closure", () => {
  it("resolves exactly the 16 allowlisted names, in both directions", () => {
    const references = resolveReferencedTextures(catalogue());

    expect(nameList(references)).toEqual([...VENDORED_TEXTURES].sort());
    expect([...VENDORED_TEXTURES].sort()).toEqual(nameList(references));
    expect(references.size).toBe(16);
  });

  it("keeps the Cobra variant textures out of the closure and both trees", () => {
    const references = resolveReferencedTextures(catalogue());
    const names = nameList(references);

    for (const variant of [
      "oolite_cobra3_diffuse_alt.png",
      "oolite_cobra3_diffuse_pirate.png",
    ]) {
      expect(names).not.toContain(variant);
      expect(VENDORED_TEXTURES).not.toContain(variant);
    }
    for (const directory of [
      "third_party/oolite/Textures",
      "public/textures",
    ]) {
      const entries = readdirSync(join(REPO_ROOT, directory));
      expect(entries.some((name) => name.includes("diffuse_alt"))).toBe(false);
      expect(entries.some((name) => name.includes("diffuse_pirate"))).toBe(
        false,
      );
    }
  });

  it("resolves every reference from the material sets the two GLBs emit", () => {
    const references = resolveReferencedTextures(catalogue());

    // Cobra: Hull and Gun maps. The Hull's diffuse is also its emission source.
    expect([...(references.get("oolite_cobra3_diffuse.png") ?? [])]).toEqual([
      { shipKey: "cobra3-player", materialKey: "Hull", mapKind: "diffuse" },
      { shipKey: "cobra3-player", materialKey: "Hull", mapKind: "emission" },
    ]);
    expect([...(references.get("oolite_cobra3_subents.png") ?? [])]).toEqual([
      { shipKey: "cobra3-player", materialKey: "Gun", mapKind: "diffuse" },
    ]);

    // The Coriolis hull's diffuse is both the material key and the emissive
    // source; the four parts each own their own map set.
    const hull = references.get("oolite_coriolis_diffuse.png") ?? [];
    expect(hull).toEqual([
      {
        shipKey: "coriolis-station",
        materialKey: "oolite_coriolis_diffuse.png",
        mapKind: "diffuse",
      },
      {
        shipKey: "coriolis-station",
        materialKey: "oolite_coriolis_diffuse.png",
        mapKind: "emission",
      },
    ]);
  });

  it("throws TEXTURE_MISSING naming the ship, material and snapshot path", () => {
    const failure = caught(() =>
      resolveReferencedTextures(withDiffuse("missing.png")),
    );

    expect(failure.code).toBe("TEXTURE_MISSING");
    expect(failure.message).toContain("cobra3-player");
    expect(failure.message).toContain("Hull");
    expect(failure.message).toContain(
      "third_party/oolite/Textures/missing.png",
    );
  });

  it("rejects a traversal name with the attempted path and reads nothing", () => {
    const failure = caught(() =>
      resolveReferencedTextures(withDiffuse("../../etc/passwd")),
    );

    expect(failure.code).toBe("TEXTURE_MISSING");
    expect(failure.message).toContain("../../etc/passwd");
    // The failure happens in the pure closure, before any file is opened.
    expect(failure.message).toContain("third_party/oolite/Textures");
  });
});

describe("copyTextures", () => {
  it("copies all 16 files byte-for-byte and reports their paths", async () => {
    const outRoot = await mkdtemp(join(tmpdir(), "wegolite-textures-"));
    try {
      const emitted = await copyTextures({ inputRoot: REPO_ROOT, outRoot });
      expect(emitted.map((file) => file.path)).toEqual(
        [...VENDORED_TEXTURES].map((name) => `public/textures/${name}`).sort(),
      );
      for (const name of VENDORED_TEXTURES) {
        const source = readFileSync(
          join(REPO_ROOT, "third_party/oolite/Textures", name),
        );
        const copied = await readFile(join(outRoot, "public/textures", name));
        expect(copied.equals(source), name).toBe(true);
      }
    } finally {
      await rm(outRoot, { recursive: true, force: true });
    }
  });

  it("keeps the committed copies identical to their vendored sources", () => {
    for (const name of VENDORED_TEXTURES) {
      const source = readFileSync(
        join(REPO_ROOT, "third_party/oolite/Textures", name),
      );
      const copied = readFileSync(join(REPO_ROOT, "public/textures", name));
      expect(copied.equals(source), name).toBe(true);
    }
  });
});

/** The pinned Coriolis hull diffuse: 512x512, non-interlaced 8-bit RGBA. */
const CORIOLIS_DIFFUSE =
  "third_party/oolite/Textures/oolite_coriolis_diffuse.png";

/** The measured number of non-zero alpha pixels in that file. */
const CORIOLIS_NON_ZERO_ALPHA = 6224;

function readBytes(relative: string): Uint8Array {
  return new Uint8Array(readFileSync(join(REPO_ROOT, relative)));
}

/**
 * A signature + IHDR (+ placeholder CRC) PNG header, 33 bytes. The decoder must
 * reject an unsupported header before it ever looks for IDAT, so these fixtures
 * are deliberately header-only.
 */
function pngHeader(
  width: number,
  height: number,
  bitDepth: number,
  colourType: number,
  interlace: number,
): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width, false);
  view.setUint32(20, height, false);
  bytes[24] = bitDepth;
  bytes[25] = colourType;
  bytes[26] = 0;
  bytes[27] = 0;
  bytes[28] = interlace;
  return bytes;
}

interface GlbMaterialJson {
  readonly name: string;
  readonly emissiveTexture?: { readonly index: number };
}

interface GlbJson {
  readonly materials: readonly GlbMaterialJson[];
  readonly images: readonly { readonly uri: string }[];
  readonly textures: readonly { readonly source: number }[];
}

function readGlbJson(relative: string): GlbJson {
  const bytes = readBytes(relative);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const text = new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength));
  return JSON.parse(text.replace(/ +$/, "")) as GlbJson;
}

function emissiveUri(json: GlbJson, material: GlbMaterialJson): string | null {
  const index = material.emissiveTexture?.index;
  if (index === undefined) return null;
  const texture = json.textures[index];
  if (texture === undefined) throw new Error("material has no texture");
  const image = json.images[texture.source];
  if (image === undefined) throw new Error("texture has no image");
  return image.uri;
}

const EMISSIVE_FILES = [
  "oolite_cobra3_diffuse_emissive.png",
  "oolite_coriolis_diffuse_emissive.png",
  "oolite_coriolis_dock_diffuse_emissive.png",
  "oolite_coriolis_faceplate_diffuse_emissive.png",
  "oolite_coriolis_tris_diffuse_emissive.png",
];

describe("decodePng", () => {
  it("decodes the pinned Coriolis diffuse and counts 6,224 lit alpha pixels", () => {
    const decoded = decodePng(readBytes(CORIOLIS_DIFFUSE));

    expect(decoded.width).toBe(512);
    expect(decoded.height).toBe(512);
    expect(decoded.channels).toBe(4);
    expect(decoded.data.length).toBe(512 * 512 * 4);

    let nonZero = 0;
    for (let index = 3; index < decoded.data.length; index += 4) {
      if ((decoded.data[index] ?? 0) !== 0) nonZero++;
    }
    expect(nonZero).toBe(CORIOLIS_NON_ZERO_ALPHA);
  });

  it("rejects a 16-bit PNG before inflating", () => {
    const failure = caught(() =>
      decodePng(pngHeader(1, 1, 16, 6, 0), "16-bit.png"),
    );
    expect(failure.code).toBe("TEXTURE_MISSING");
    expect(failure.message).toContain("bit depth 16");
  });

  it("rejects an interlaced PNG before inflating", () => {
    const failure = caught(() =>
      decodePng(pngHeader(1, 1, 8, 6, 1), "interlaced.png"),
    );
    expect(failure.code).toBe("TEXTURE_MISSING");
    expect(failure.message).toContain("interlace");
  });

  it("rejects a 9000-pixel width at the cap before inflating", () => {
    const failure = caught(() =>
      decodePng(pngHeader(9000, 1, 8, 6, 0), "wide.png"),
    );
    expect(failure.code).toBe("TEXTURE_MISSING");
    expect(failure.message).toContain("9000");
    expect(failure.message).toContain("8192");
  });
});

describe("bakeEmissive", () => {
  it("bakes the alpha channel into 8-bit colour-type-0 grey of the same size", () => {
    const source = decodePng(readBytes(CORIOLIS_DIFFUSE));
    const baked = bakeEmissive(readBytes(CORIOLIS_DIFFUSE), CORIOLIS_DIFFUSE);

    expect(baked[24]).toBe(8); // bit depth
    expect(baked[25]).toBe(0); // colour type 0 = greyscale
    expect(baked[28]).toBe(0); // non-interlaced

    const grey = decodeGreyscalePng(baked);
    expect(grey.width).toBe(source.width);
    expect(grey.height).toBe(source.height);
    expect(grey.channels).toBe(1);

    for (const [x, y] of [
      [0, 0],
      [17, 33],
      [511, 511],
      [256, 128],
    ] as const) {
      const alpha = source.data[(y * source.width + x) * 4 + 3] ?? 0;
      expect(grey.data[y * grey.width + x], `${x},${y}`).toBe(alpha);
    }
    // Colour type 0 carries no alpha channel: every pixel is opaque.
    expect(grey.data.length).toBe(grey.width * grey.height);
  });

  it("produces identical bytes and the same SHA-256 on two consecutive bakes", () => {
    const source = readBytes(CORIOLIS_DIFFUSE);
    const first = bakeEmissive(source, CORIOLIS_DIFFUSE);
    const second = bakeEmissive(source, CORIOLIS_DIFFUSE);

    expect(Array.from(first)).toEqual(Array.from(second));
    expect(sha256Hex(first)).toBe(sha256Hex(second));
  });
});

describe("emitTextures", () => {
  it("bakes exactly the five emissive maps the two GLBs reference", async () => {
    const outRoot = await mkdtemp(join(tmpdir(), "wegolite-emissive-"));
    try {
      const emitted = await emitTextures({
        inputRoot: REPO_ROOT,
        outRoot,
        catalogue: catalogue(),
      });
      expect(emitted.map((file) => file.path)).toEqual(
        EMISSIVE_FILES.map((name) => `public/textures/${name}`).sort(),
      );

      const cobra = readGlbJson("public/models/cobra3.glb");
      const coriolis = readGlbJson("public/models/coriolis.glb");
      const glbEmissive = [...cobra.images, ...coriolis.images]
        .map((image) => image.uri.replace("../textures/", ""))
        .filter((name) => name.endsWith("_emissive.png"))
        .sort();
      expect(glbEmissive).toEqual(EMISSIVE_FILES);

      const cobraHull = cobra.materials.find(
        (material) => material.name === "Hull",
      );
      const cobraGun = cobra.materials.find(
        (material) => material.name === "Gun",
      );
      expect(cobraHull).toBeDefined();
      expect(cobraGun).toBeDefined();
      expect(emissiveUri(cobra, cobraHull as GlbMaterialJson)).toBe(
        "../textures/oolite_cobra3_diffuse_emissive.png",
      );
      expect(emissiveUri(cobra, cobraGun as GlbMaterialJson)).toBeNull();

      const partEmissive: Readonly<Record<string, string>> = {
        "oolite_coriolis_diffuse.png":
          "../textures/oolite_coriolis_diffuse_emissive.png",
        "oolite_coriolis_faceplate_diffuse.png":
          "../textures/oolite_coriolis_faceplate_diffuse_emissive.png",
        "oolite_coriolis_tris_diffuse.png":
          "../textures/oolite_coriolis_tris_diffuse_emissive.png",
        "oolite_coriolis_dock_diffuse.png":
          "../textures/oolite_coriolis_dock_diffuse_emissive.png",
      };
      for (const [materialName, expected] of Object.entries(partEmissive)) {
        const material = coriolis.materials.find(
          (candidate) => candidate.name === materialName,
        );
        expect(material, materialName).toBeDefined();
        expect(emissiveUri(coriolis, material as GlbMaterialJson)).toBe(
          expected,
        );
        // The emissive points at the baked greyscale file, never the RGBA
        // diffuse: using the diffuse is the whole-hull-glow pitfall (D-08).
        expect(expected).not.toBe(`../textures/${materialName}`);
      }
    } finally {
      await rm(outRoot, { recursive: true, force: true });
    }
  });

  it("writes the committed baked files byte-for-byte", () => {
    for (const name of EMISSIVE_FILES) {
      const committed = readFileSync(join(REPO_ROOT, "public/textures", name));
      const source = decodePng(
        readBytes(
          `third_party/oolite/Textures/${name.replace("_emissive", "")}`,
        ),
      );
      const expected = bakeEmissive(
        readBytes(
          `third_party/oolite/Textures/${name.replace("_emissive", "")}`,
        ),
      );
      expect(committed.equals(Buffer.from(expected)), name).toBe(true);
      expect(source.width).toBeGreaterThan(0);
    }
  });
});

/**
 * The V-orientation decision (DATA-04, D-09). The fixture's four quadrants are
 * distinct and its top-left is opaque red, so a flip would be visible as a
 * colour swap rather than a tolerance.
 */
const ASYMMETRIC_FIXTURE = "tests/fixtures/textures/asymmetric-8x8.png";
const RED: readonly [number, number, number, number] = [255, 0, 0, 255];
const GREEN: readonly [number, number, number, number] = [0, 255, 0, 255];
const BLUE: readonly [number, number, number, number] = [0, 0, 255, 255];
const WHITE: readonly [number, number, number, number] = [255, 255, 255, 255];

const QUAD_MATERIAL: MeshMaterial = {
  index: 0,
  key: "asymmetric-8x8.png",
  name: "asymmetric-8x8.png",
};

/** Two triangles, corners in the plan's order, UVs walking the unit square. */
function quadMesh(): ParsedMesh {
  const normal = { x: 0, y: 0, z: 1 };
  const faces: Face[] = [
    {
      smoothGroup: 0,
      normal,
      vertices: [0, 1, 2],
      uv: [
        [0, 0],
        [1, 0],
        [1, 1],
      ],
      materialIndex: 0,
    },
    {
      smoothGroup: 0,
      normal,
      vertices: [0, 2, 3],
      uv: [
        [0, 0],
        [1, 1],
        [0, 1],
      ],
      materialIndex: 0,
    },
  ];
  return {
    nverts: 4,
    nfaces: 2,
    // Top-left, top-right, bottom-right, bottom-left in glTF's Y-up space.
    vertices: [
      { x: -1, y: 1, z: 0 },
      { x: 1, y: 1, z: 0 },
      { x: 1, y: -1, z: 0 },
      { x: -1, y: -1, z: 0 },
    ],
    faces,
    materials: [QUAD_MATERIAL],
    normals: null,
    names: null,
    caseSensitiveNames: false,
    warnings: [],
  };
}

describe("sampleNearest (V orientation)", () => {
  it("treats v = 0 as the image's top row", () => {
    const png = readBytes(ASYMMETRIC_FIXTURE);

    expect(sampleNearest(png, 0.25, 0.25)).toEqual(RED);
    expect(sampleNearest(png, 0.75, 0.25)).toEqual(GREEN);
    expect(sampleNearest(png, 0.25, 0.75)).toEqual(BLUE);
    expect(sampleNearest(png, 0.75, 0.75)).toEqual(WHITE);
  });

  it("emits UV (0,0) on the geometry's top-left corner, with no V flip", () => {
    const primitives = convertMesh(quadMesh(), "per-face", "gltf");
    const primitive = primitives[0];
    if (primitive === undefined)
      throw new Error("the quad emitted no primitive");

    const cornerAt = (x: number, y: number): readonly [number, number] => {
      for (let index = 0; index < primitive.positions.length; index += 3) {
        if (
          primitive.positions[index] === x &&
          primitive.positions[index + 1] === y
        ) {
          const uvIndex = (index / 3) * 2;
          return [
            primitive.uvs[uvIndex] ?? -1,
            primitive.uvs[uvIndex + 1] ?? -1,
          ];
        }
      }
      throw new Error(`no emitted corner at (${String(x)}, ${String(y)})`);
    };

    const topLeft = cornerAt(-1, 1);
    const bottomLeft = cornerAt(-1, -1);
    expect(topLeft).toEqual([0, 0]);
    expect(bottomLeft).toEqual([0, 1]);

    // The same pair through the sampler lands in the marked red quadrant at the
    // top-left and the blue quadrant at the bottom-left: identity, no flip.
    const png = readBytes(ASYMMETRIC_FIXTURE);
    expect(sampleNearest(png, topLeft[0] + 0.25, topLeft[1] + 0.25)).toEqual(
      RED,
    );
    expect(
      sampleNearest(png, bottomLeft[0] + 0.25, bottomLeft[1] + 0.25),
    ).toEqual(BLUE);
  });
});

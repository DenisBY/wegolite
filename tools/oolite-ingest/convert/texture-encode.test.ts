// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The WebP re-encode of the vendored textures (PROJECT.md Key Decisions,
 * revising Phase 2 D-20).
 *
 * Three things are proved against the committed files, by decoding them with
 * `dwebp` from the project image:
 *
 * - a normal map decodes to within `NEAR_LOSSLESS_MAX_ERROR` levels of the
 *   source on every channel of every pixel;
 * - a specular map decodes to exactly the source alpha;
 * - a lossy colour plane stays within a small mean error of its source, which
 *   is a guard against a wrong or damaged file, not a quality claim.
 *
 * The record is checked row by row against the sources and the outputs, and
 * the re-use rule is exercised with an injected encoder.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ShipCatalogue } from "../../../src/content/schemas/ship.js";
import { sha256Hex } from "../canonical/hash.js";
import { isContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import {
  MERGED_NPC_GLBS,
  atlasImagesOf,
  encodedTextureFile,
  hullTextureNames,
  planHullMerges,
} from "./glb.js";
import type { AtlasImage } from "./atlas.js";
import { parseDat } from "./dat.js";
import type { ParsedMesh } from "./dat.js";
import { MODEL_SOURCE_FILES } from "./glb.js";
import type { ShipEntry } from "./glb.js";
import { compileShips } from "./ships.js";
import {
  NEAR_LOSSLESS_MAX_ERROR,
  TEXTURE_ENCODINGS_PATH,
  cwebpEncoder,
  encodeTextures,
  encoderArgs,
  parseTextureEncodings,
  profileFor,
  readPngSize,
  readWebpInfo,
} from "./texture-encode.js";
import type { TextureEncoder } from "./texture-encode.js";
import {
  VENDORED_TEXTURES,
  decodePng,
  loadTextureImages,
  resolveReferencedTextures,
} from "./textures.js";

const REPO_ROOT = process.cwd();
const SHIPDATA = "third_party/oolite/Config/shipdata.plist";
const OVERRIDES = "third_party/oolite/Config/shipdata-overrides.plist";
const SOURCE_DIR = "third_party/oolite/Textures";
const OUT_DIR = "public/textures";

/** Mean absolute error allowed on a lossy colour plane, in 8-bit levels. */
const LOSSY_MEAN_ERROR_CEILING = 3;

function catalogue(): ShipCatalogue {
  return compileShips(
    parseOpenStep(readFileSync(join(REPO_ROOT, SHIPDATA), "utf8"), SHIPDATA),
    parseOpenStep(readFileSync(join(REPO_ROOT, OVERRIDES), "utf8"), OVERRIDES),
  ).entries;
}

const references = resolveReferencedTextures(catalogue());

/**
 * The served file names every committed GLB references. Plan 21-17: a merged
 * NPC hull names its atlas images, so only the vendored textures a GLB still
 * names are encoded and committed one by one.
 */
function committedGlbFiles(): Set<string> {
  const files = new Set<string>();
  for (const file of readdirSync(join(REPO_ROOT, "public/models"))) {
    if (!file.endsWith(".glb")) continue;
    const bytes = readFileSync(join(REPO_ROOT, "public/models", file));
    const json = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString("utf8"),
    ) as { images?: { uri: string }[] };
    for (const image of json.images ?? []) {
      files.add(image.uri.replace("../textures/", ""));
    }
  }
  return files;
}

const REFERENCED = committedGlbFiles();

/** The vendored textures the committed GLBs still reference one by one. */
const EMITTED_VENDORED = VENDORED_TEXTURES.filter((name) =>
  REFERENCED.has(encodedTextureFile(name)),
);

/** The per-hull atlas images the generator builds for the committed GLBs. */
let atlasesOnce: Promise<readonly AtlasImage[]> | undefined;

function builtAtlases(): Promise<readonly AtlasImage[]> {
  atlasesOnce ??= buildAtlases();
  return atlasesOnce;
}

async function buildAtlases(): Promise<readonly AtlasImage[]> {
  const { models, entries } = await loadHullInputs();
  return atlasImagesOf(
    planHullMerges(
      models,
      entries,
      await loadTextureImages(
        REPO_ROOT,
        hullTextureNames(models, entries, MERGED_NPC_GLBS),
      ),
      MERGED_NPC_GLBS,
    ),
  );
}

async function loadHullInputs(): Promise<{
  models: Record<string, ParsedMesh>;
  entries: Record<string, ShipEntry>;
}> {
  const entries: Record<string, ShipEntry> = {};
  for (const entry of catalogue()) {
    entries[entry.key] = { key: entry.key, shipDef: entry.shipDef };
  }
  const models: Record<string, ParsedMesh> = {};
  for (const files of Object.values(MODEL_SOURCE_FILES)) {
    for (const file of files) {
      if (Object.hasOwn(models, file)) continue;
      const relative = `third_party/oolite/Models/${file}`;
      models[file] = parseDat(
        await readFile(join(REPO_ROOT, relative), "utf8"),
        relative,
      );
    }
  }
  return { models, entries };
}

function profileOf(name: string): ReturnType<typeof profileFor> {
  return profileFor(
    (references.get(name) ?? []).map((reference) => reference.mapKind),
  );
}

function committed(name: string): Uint8Array {
  return new Uint8Array(
    readFileSync(join(REPO_ROOT, OUT_DIR, encodedTextureFile(name))),
  );
}

function source(name: string): Uint8Array {
  return new Uint8Array(readFileSync(join(REPO_ROOT, SOURCE_DIR, name)));
}

interface Rgba {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/**
 * Decode a WebP file to RGBA with `dwebp -pam`. The PAM output is always
 * four-channel, so an opaque file decodes with alpha 255.
 */
function decodePam(path: string, name: string): Rgba {
  const pam = execFileSync("dwebp", ["-quiet", "-pam", path, "-o", "-"], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const marker = "ENDHDR\n";
  const end = pam.indexOf(marker);
  if (end < 0) throw new Error(`${name}: dwebp wrote no PAM header`);
  const header = pam.subarray(0, end).toString("latin1");
  const field = (key: string): number => {
    const match = new RegExp(`^${key} (\\d+)$`, "m").exec(header);
    if (match?.[1] === undefined) throw new Error(`${name}: no ${key}`);
    return Number(match[1]);
  };
  expect(field("DEPTH")).toBe(4);
  expect(field("MAXVAL")).toBe(255);
  return {
    width: field("WIDTH"),
    height: field("HEIGHT"),
    data: new Uint8Array(pam.subarray(end + marker.length)),
  };
}

/** Decode a committed WebP to RGBA. */
function decodeWebp(name: string): Rgba {
  return decodePam(join(REPO_ROOT, OUT_DIR, encodedTextureFile(name)), name);
}

/**
 * The source's RGBA pixels. `decodePng` reads only 8-bit RGBA, so an RGB or
 * palette source falls back to a lossless WebP round trip: `cwebp -lossless
 * -exact` stores every pixel and `dwebp` returns it unchanged.
 */
function sourcePixels(name: string): Rgba {
  try {
    return decodePng(source(name), name);
  } catch {
    const dir = mkdtempSync(join(tmpdir(), "wegolite-source-"));
    try {
      const webp = join(dir, "source.webp");
      execFileSync("cwebp", [
        "-quiet",
        "-lossless",
        "-exact",
        join(REPO_ROOT, SOURCE_DIR, name),
        "-o",
        webp,
      ]);
      return decodePam(webp, name);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}

/** A recording encoder that serves the committed bytes for each source. */
function fakeEncoder(
  transform: (bytes: Uint8Array) => Uint8Array = (bytes) => bytes,
): TextureEncoder & { calls: { source: string; args: readonly string[] }[] } {
  const calls: { source: string; args: readonly string[] }[] = [];
  return {
    calls,
    version: () => Promise.resolve("fake 0"),
    encode(sourcePath, args) {
      calls.push({ source: sourcePath, args });
      const name = sourcePath.split("/").pop() ?? "";
      return Promise.resolve(transform(committed(name)));
    },
  };
}

async function withTemp<T>(body: (root: string) => Promise<T>): Promise<T> {
  const root = await mkdtemp(join(tmpdir(), "wegolite-encode-"));
  try {
    return await body(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function failure(body: () => Promise<unknown>): Promise<{
  code?: string;
  message: string;
}> {
  try {
    await body();
  } catch (error) {
    if (isContentError(error)) {
      return { code: error.code, message: error.message };
    }
    throw error;
  }
  throw new Error("expected the call to throw");
}

describe("profiles and encoder arguments", () => {
  it("keeps normals lossless, specular alpha, and nothing extra for diffuse", () => {
    expect(profileFor(["normal"])).toEqual({ lossless: true, alpha: false });
    expect(profileFor(["specular"])).toEqual({ lossless: false, alpha: true });
    expect(profileFor(["diffuse"])).toEqual({ lossless: false, alpha: false });
    // The emission reference names the diffuse file; its mask is baked apart.
    expect(profileFor(["diffuse", "emission"])).toEqual({
      lossless: false,
      alpha: false,
    });
    expect(profileFor(["normal", "specular"])).toEqual({
      lossless: true,
      alpha: true,
    });
    // A baked roughness is data: constants per region, kept exact.
    expect(profileFor(["roughness"])).toEqual({ lossless: true, alpha: false });
  });

  it("maps each profile to fixed cwebp arguments with no threading", () => {
    expect(encoderArgs({ lossless: false, alpha: false })).toEqual([
      "-q",
      "90",
      "-m",
      "6",
      "-sharp_yuv",
      "-noalpha",
      "-quiet",
    ]);
    expect(encoderArgs({ lossless: true, alpha: false })).toEqual([
      "-near_lossless",
      "60",
      "-z",
      "9",
      "-noalpha",
      "-quiet",
    ]);
    expect(encoderArgs({ lossless: false, alpha: true })).toEqual([
      "-q",
      "90",
      "-m",
      "6",
      "-sharp_yuv",
      "-exact",
      "-alpha_q",
      "100",
      "-quiet",
    ]);
    for (const lossless of [true, false]) {
      for (const alpha of [true, false]) {
        expect(encoderArgs({ lossless, alpha })).not.toContain("-mt");
      }
    }
  });

  it("classifies every vendored texture by its material slots", () => {
    const lossless = VENDORED_TEXTURES.filter(
      (name) => profileOf(name).lossless,
    );
    const alpha = VENDORED_TEXTURES.filter((name) => profileOf(name).alpha);
    expect(lossless).toEqual(
      VENDORED_TEXTURES.filter((name) => name.includes("normal")),
    );
    expect(alpha).toEqual(
      VENDORED_TEXTURES.filter((name) => name.includes("specular")),
    );
    // The Dodecahedron and Icosahedron stations add six normal and four
    // specular maps (Phase 22.1 plan 10).
    expect(lossless).toHaveLength(41);
    expect(alpha).toHaveLength(32);
  });
});

describe("the committed encoded textures", () => {
  it.each([...EMITTED_VENDORED])(
    "%s has its source's size and its profile's layout",
    (name) => {
      const info = readWebpInfo(committed(name), name);
      expect({ width: info.width, height: info.height }).toEqual(
        readPngSize(source(name), name),
      );
      const profile = profileOf(name);
      expect(info.format === "lossless").toBe(profile.lossless);
      // An opaque palette source (oolite_buoy_specular.png) is written without
      // an alpha channel, so alpha may be absent when the profile keeps it. The
      // exact-alpha test below still compares every alpha value.
      if (!profile.alpha) expect(info.alpha).toBe(false);
    },
  );

  it("is smaller than its source for every file", () => {
    for (const name of EMITTED_VENDORED) {
      expect(committed(name).length, name).toBeLessThan(source(name).length);
    }
  });

  it.each(EMITTED_VENDORED.filter((name) => profileOf(name).lossless))(
    "%s decodes to within the near-lossless bound on every channel",
    (name) => {
      const original = sourcePixels(name);
      const decoded = decodeWebp(name);
      expect(decoded.width).toBe(original.width);
      expect(decoded.height).toBe(original.height);
      let worst = 0;
      for (let index = 0; index < original.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          const error = Math.abs(
            (decoded.data[index + channel] ?? 0) -
              (original.data[index + channel] ?? 0),
          );
          if (error > worst) worst = error;
        }
      }
      expect(worst).toBeLessThanOrEqual(NEAR_LOSSLESS_MAX_ERROR);
    },
    60_000,
  );

  it.each(EMITTED_VENDORED.filter((name) => profileOf(name).alpha))(
    "%s decodes to exactly the source alpha",
    (name) => {
      const original = sourcePixels(name);
      const decoded = decodeWebp(name);
      let different = 0;
      for (let index = 3; index < original.data.length; index += 4) {
        if (decoded.data[index] !== original.data[index]) different += 1;
      }
      expect(different).toBe(0);
    },
    60_000,
  );

  it.each(EMITTED_VENDORED.filter((name) => !profileOf(name).lossless))(
    "%s keeps its colour within the lossy error ceiling",
    (name) => {
      const original = sourcePixels(name);
      const decoded = decodeWebp(name);
      let total = 0;
      for (let index = 0; index < original.data.length; index += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          total += Math.abs(
            (decoded.data[index + channel] ?? 0) -
              (original.data[index + channel] ?? 0),
          );
        }
      }
      const mean = total / ((original.data.length / 4) * 3);
      expect(mean).toBeLessThan(LOSSY_MEAN_ERROR_CEILING);
    },
    60_000,
  );
});

describe("the committed record", () => {
  const rows = parseTextureEncodings(
    readFileSync(join(REPO_ROOT, TEXTURE_ENCODINGS_PATH), "utf8"),
  );

  it("has one row per encoded texture, sorted by path", () => {
    // The vendored textures a GLB still names, and every WebP atlas image (the
    // emissive atlas masks stay PNG and carry no row).
    const atlasFiles = [...REFERENCED].filter((name) =>
      /_atlas_[0-9a-f]{12}\.webp$/.test(name),
    );
    expect(rows.map((row) => row.path)).toEqual(
      [
        ...EMITTED_VENDORED.map((name) => encodedTextureFile(name)),
        ...atlasFiles,
      ]
        .map((name) => `${OUT_DIR}/${name}`)
        .sort(),
    );
  });

  it("lists every vendored input of each atlas row, and none of a single-source row", () => {
    for (const row of rows) {
      if (row.source.startsWith("atlas:")) {
        expect(row.inputs?.length, row.path).toBeGreaterThan(0);
        for (const input of row.inputs ?? []) {
          expect(
            input.startsWith("third_party/oolite/"),
            `${row.path}: ${input}`,
          ).toBe(true);
          expect(
            readFileSync(join(REPO_ROOT, input)).length,
            input,
          ).toBeGreaterThan(0);
        }
        expect(row.inputs, row.path).toEqual([...(row.inputs ?? [])].sort());
      } else {
        expect(row.inputs, row.path).toBeUndefined();
      }
    }
  });

  it("matches every source, argument list and output", () => {
    for (const name of EMITTED_VENDORED) {
      const row = rows.find(
        (candidate) =>
          candidate.path === `${OUT_DIR}/${encodedTextureFile(name)}`,
      );
      if (row === undefined) throw new Error(`no row for ${name}`);
      expect(row.source).toBe(`${SOURCE_DIR}/${name}`);
      expect(row.sourceSha256).toBe(sha256Hex(source(name)));
      expect(row.args).toEqual(encoderArgs(profileOf(name)));
      expect(row.sha256).toBe(sha256Hex(committed(name)));
      expect(row.bytes).toBe(committed(name).length);
      expect(row.encoder).toMatch(/^cwebp \d+\.\d+\.\d+/);
    }
  });

  it("reads a damaged record as empty, never as an error", () => {
    expect(parseTextureEncodings("not json")).toEqual([]);
    expect(parseTextureEncodings("[]")).toEqual([]);
    expect(parseTextureEncodings('{"files":[{"path":1}]}')).toEqual([]);
  });
});

describe("encodeTextures", () => {
  it("re-uses every committed output without calling the encoder", async () => {
    await withTemp(async (outRoot) => {
      const encoder = fakeEncoder();
      const atlases = await builtAtlases();
      const emitted = await encodeTextures({
        inputRoot: REPO_ROOT,
        outRoot,
        reuseRoot: REPO_ROOT,
        catalogue: catalogue(),
        encoder,
        referenced: REFERENCED,
        atlases,
      });
      expect(encoder.calls).toEqual([]);
      expect(emitted.map((file) => file.path)).toEqual([
        ...[
          ...EMITTED_VENDORED.map((name) => encodedTextureFile(name)),
          ...atlases
            .filter((image) => image.slot !== "emissive")
            .map((image) => encodedTextureFile(image.name)),
        ]
          .map((name) => `${OUT_DIR}/${name}`)
          .sort(),
        TEXTURE_ENCODINGS_PATH,
      ]);
      for (const file of emitted) {
        const written = await readFile(join(outRoot, file.path));
        const reference = readFileSync(join(REPO_ROOT, file.path));
        expect(written.equals(reference), file.path).toBe(true);
      }
    });
  }, 300_000);

  it("encodes everything, with each profile's arguments, without a re-use tree", async () => {
    await withTemp(async (outRoot) => {
      const encoder = fakeEncoder();
      const atlases = await builtAtlases();
      await encodeTextures({
        inputRoot: REPO_ROOT,
        outRoot,
        catalogue: catalogue(),
        encoder,
        referenced: REFERENCED,
        atlases,
      });
      const names = encoder.calls.map((call) => call.source.split("/").pop());
      const atlasNames = atlases
        .filter((image) => image.slot !== "emissive")
        .map((image) => image.name);
      expect(names).toEqual([...EMITTED_VENDORED, ...atlasNames]);
      for (const call of encoder.calls) {
        const name = call.source.split("/").pop() ?? "";
        const atlas = atlases.find((image) => image.name === name);
        expect(call.args).toEqual(
          atlas === undefined
            ? encoderArgs(profileOf(name))
            : encoderArgs(
                profileFor([
                  atlas.slot === "emissive" ? "emission" : atlas.slot,
                ]),
              ),
        );
      }
      const rows = parseTextureEncodings(
        await readFile(join(outRoot, TEXTURE_ENCODINGS_PATH), "utf8"),
      );
      expect(new Set(rows.map((row) => row.encoder))).toEqual(
        new Set(["fake 0"]),
      );
    });
  }, 300_000);

  it("encodes again only the file whose source hash, arguments or output changed", async () => {
    const atlases = await builtAtlases();
    await withTemp(async (reuseRoot) => {
      await cp(join(REPO_ROOT, OUT_DIR), join(reuseRoot, OUT_DIR), {
        recursive: true,
      });
      const recordPath = join(reuseRoot, TEXTURE_ENCODINGS_PATH);
      await cp(join(REPO_ROOT, TEXTURE_ENCODINGS_PATH), recordPath);
      const record = JSON.parse(await readFile(recordPath, "utf8")) as {
        files: { path: string; sourceSha256: string; args: string[] }[];
      };
      const [first, second] = record.files;
      if (first === undefined || second === undefined) {
        throw new Error("the record is too short");
      }
      first.sourceSha256 = "0".repeat(64);
      second.args = [...second.args, "-changed"];
      await writeFile(recordPath, JSON.stringify(record));
      // A third file is damaged on disk while its row is left alone.
      const third = record.files[2];
      if (third === undefined) throw new Error("the record is too short");
      await writeFile(join(reuseRoot, third.path), new Uint8Array([1, 2, 3]));

      await withTemp(async (outRoot) => {
        const encoder = fakeEncoder();
        await encodeTextures({
          inputRoot: REPO_ROOT,
          outRoot,
          reuseRoot,
          catalogue: catalogue(),
          encoder,
          referenced: REFERENCED,
          atlases,
        });
        const encoded = encoder.calls
          .map((call) => encodedTextureFile(call.source.split("/").pop() ?? ""))
          .map((name) => `${OUT_DIR}/${name}`)
          .sort();
        expect(encoded).toEqual([first.path, second.path, third.path].sort());
      });
    });
  }, 300_000);

  it("fails TEXTURE_ENCODE when the output is not the source's size", async () => {
    await withTemp(async (outRoot) => {
      // Serve the 256x256 turret diffuse for every source.
      const small = committed("oolite_cobra3_subents.png");
      const thrown = await failure(() =>
        encodeTextures({
          inputRoot: REPO_ROOT,
          outRoot,
          catalogue: catalogue(),
          encoder: fakeEncoder(() => small),
          referenced: REFERENCED,
        }),
      );
      expect(thrown.code).toBe("TEXTURE_ENCODE");
      expect(thrown.message).toContain("differs from the source");
    });
  });

  it("fails TEXTURE_ENCODE when a normal map comes back lossy", async () => {
    await withTemp(async (outRoot) => {
      const lossy = committed("oolite_cobra3_subents.png");
      const thrown = await failure(() =>
        encodeTextures({
          inputRoot: REPO_ROOT,
          outRoot,
          catalogue: catalogue(),
          referenced: REFERENCED,
          encoder: {
            version: () => Promise.resolve("fake 0"),
            encode(sourcePath) {
              const name = sourcePath.split("/").pop() ?? "";
              return Promise.resolve(
                name === "oolite_cobra3_subents_normal.png"
                  ? lossy
                  : committed(name),
              );
            },
          },
        }),
      );
      expect(thrown.code).toBe("TEXTURE_ENCODE");
      expect(thrown.message).toContain("expected a lossless file");
    });
  });

  it("fails TEXTURE_ENCODE, naming the image, when cwebp is missing", async () => {
    const thrown = await failure(() =>
      cwebpEncoder("wegolite-no-such-cwebp").version(),
    );
    expect(thrown.code).toBe("TEXTURE_ENCODE");
    expect(thrown.message).toContain("not installed");
  });
});

describe("the real encoder", () => {
  it("reports a version and produces a decodable file of the source's size", async () => {
    const encoder = cwebpEncoder();
    expect(await encoder.version()).toMatch(/^cwebp \d+\.\d+\.\d+/);
    const name = "oolite_cobra3_subents_normal.png";
    const bytes = await encoder.encode(
      join(REPO_ROOT, SOURCE_DIR, name),
      encoderArgs(profileOf(name)),
    );
    const info = readWebpInfo(bytes, name);
    expect(info.format).toBe("lossless");
    expect({ width: info.width, height: info.height }).toEqual(
      readPngSize(source(name), name),
    );
  });
});

describe("header readers", () => {
  it("rejects bytes that are not WebP or PNG", () => {
    expect(() => readWebpInfo(new Uint8Array(64))).toThrow("not a WebP file");
    expect(() => readPngSize(new Uint8Array(64))).toThrow("not a PNG file");
  });
});

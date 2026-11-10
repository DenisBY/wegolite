// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Re-encode the vendored ship and station textures as WebP for the client
 * (PROJECT.md Key Decisions, revising Phase 2 D-20).
 *
 * Phase 2 copied the sixteen PNGs byte-for-byte. They are 19 MiB, almost the
 * whole cold start. This step encodes each one with `cwebp` and the client
 * loads the result through the glTF `EXT_texture_webp` extension. The vendored
 * PNGs under `third_party/oolite/Textures` stay the licence-audited source and
 * are untouched; the emissive bakes and the sky textures stay PNG.
 *
 * What each file keeps is decided by how the emitted materials use it:
 *
 * - a normal map is data, so it uses the lossless coder in its near-lossless
 *   mode: every channel of every pixel stays within `NEAR_LOSSLESS_MAX_ERROR`
 *   levels of the source, and smooth areas are left exact. The lossy coder is
 *   not used for it, because it subsamples chroma, which would blur the X and
 *   Y components of the normals. Exact lossless was measured at 4.6 MB for the
 *   six normal maps against 2.9 MB for this mode;
 * - a specular map keeps its alpha channel, because glTF
 *   `KHR_materials_specular.specularTexture` reads the strength from alpha;
 * - every other file (the diffuse maps) is lossy and drops alpha. Oolite's
 *   diffuse alpha is an emission mask, which the client reads from the baked
 *   `_emissive.png` and never from the diffuse map.
 *
 * Reproducibility. A lossy encoder is not guaranteed to produce the same bytes
 * on another CPU architecture or after a library update, so the committed files
 * are the reference, not the encoder. `texture-encodings.json` records, for
 * each output, the SHA-256 of its source, the encoder arguments and the SHA-256
 * of the output. A run re-uses a committed output when all three still match
 * and encodes only when a source, the arguments or an output changed. The drift
 * gate therefore proves "this source and these arguments produced this file",
 * and a change to any of them shows up as a reviewable diff of the record.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type { ShipCatalogue } from "../../../src/content/schemas/ship.js";
import { sha256Hex } from "../canonical/hash.js";
import { canonicalJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { encodedTextureFile } from "./glb.js";
import {
  EMITTED_TEXTURES_DIR,
  TEXTURES_DIR,
  VENDORED_TEXTURES,
  resolveReferencedTextures,
} from "./textures.js";
import type { EmittedTextureFile, TextureMapKind } from "./textures.js";

/** The committed record of how each encoded texture was produced. */
export const TEXTURE_ENCODINGS_PATH =
  "src/content/generated/texture-encodings.json";

/**
 * The largest per-channel difference the near-lossless mode at level 60 may
 * introduce, in 8-bit levels. Level 60 rounds a value to a multiple of four in
 * areas that are not smooth; the tests assert this bound on every pixel of the
 * committed normal maps.
 */
export const NEAR_LOSSLESS_MAX_ERROR = 3;

/** What an encoded texture has to keep. */
export interface TextureProfile {
  /** The file is data, not colour: the lossless coder is used (normal maps). */
  readonly lossless: boolean;
  /** The alpha channel is kept (specular strength). */
  readonly alpha: boolean;
}

/** Decide the profile of one file from the material slots that name it. */
export function profileFor(kinds: readonly TextureMapKind[]): TextureProfile {
  return {
    lossless: kinds.includes("normal"),
    alpha: kinds.includes("specular"),
  };
}

/**
 * The `cwebp` arguments for a profile, without the input and output paths.
 *
 * - `-q 90 -m 6 -sharp_yuv`: lossy at quality 90 with the slowest, best method
 *   and the sharper RGB-to-YUV conversion, which keeps thin coloured panel
 *   lines from smearing.
 * - `-near_lossless 60 -z 9`: the lossless coder at the strongest compression
 *   preset, after a pre-pass that may move a channel by at most
 *   `NEAR_LOSSLESS_MAX_ERROR` levels outside smooth areas.
 * - `-noalpha`: drop the alpha channel; RGB is encoded as stored.
 * - `-exact -alpha_q 100`: keep alpha losslessly and keep the RGB under
 *   transparent pixels, which is still data in a specular map.
 *
 * No `-mt`: a single thread keeps the output independent of the core count.
 */
export function encoderArgs(profile: TextureProfile): string[] {
  const quality = profile.lossless
    ? ["-near_lossless", "60", "-z", "9"]
    : ["-q", "90", "-m", "6", "-sharp_yuv"];
  const alpha = profile.alpha ? ["-exact", "-alpha_q", "100"] : ["-noalpha"];
  return [...quality, ...alpha, "-quiet"];
}

/** The one seam the tests inject; production runs the `cwebp` binary. */
export interface TextureEncoder {
  /** A stable identity, for example `cwebp 1.2.4`. */
  version(): Promise<string>;
  encode(sourcePath: string, args: readonly string[]): Promise<Uint8Array>;
}

const run = promisify(execFile);

function encodeFailure(file: string, detail: string): never {
  throw contentError("TEXTURE_ENCODE", file, "cwebp", { excerpt: detail });
}

function describeFailure(cause: unknown): string {
  if ((cause as NodeJS.ErrnoException).code === "ENOENT") {
    return "the cwebp binary is not installed; run the content build in the project image (docker compose run --rm assets)";
  }
  return cause instanceof Error ? cause.message : String(cause);
}

/** The production encoder: the `cwebp` binary baked into the project image. */
export function cwebpEncoder(binary = "cwebp"): TextureEncoder {
  return {
    async version(): Promise<string> {
      try {
        const { stdout } = await run(binary, ["-version"]);
        const first = stdout.split("\n")[0]?.trim() ?? "";
        if (first.length === 0) {
          encodeFailure(TEXTURES_DIR, "cwebp -version printed nothing");
        }
        return `cwebp ${first}`;
      } catch (cause) {
        encodeFailure(TEXTURES_DIR, describeFailure(cause));
      }
    },
    async encode(sourcePath, args): Promise<Uint8Array> {
      const scratch = await mkdtemp(join(tmpdir(), "wegolite-webp-"));
      try {
        const target = join(scratch, "out.webp");
        await run(binary, [...args, sourcePath, "-o", target]);
        return new Uint8Array(await readFile(target));
      } catch (cause) {
        encodeFailure(sourcePath, describeFailure(cause));
      } finally {
        await rm(scratch, { recursive: true, force: true });
      }
    },
  };
}

/** The container layout of a WebP file. */
export type WebpFormat = "lossy" | "lossless" | "extended";

export interface WebpInfo {
  readonly format: WebpFormat;
  readonly width: number;
  readonly height: number;
  readonly alpha: boolean;
}

function fourcc(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset] ?? 0,
    bytes[offset + 1] ?? 0,
    bytes[offset + 2] ?? 0,
    bytes[offset + 3] ?? 0,
  );
}

/**
 * Read the dimensions and layout from a WebP header.
 *
 * Only the first chunk is read: `VP8 ` (lossy, no alpha), `VP8L` (lossless) or
 * `VP8X` (extended, which is what a lossy image with an alpha plane uses).
 *
 * @throws {Error} when the bytes are not a WebP file with one of those chunks.
 */
export function readWebpInfo(bytes: Uint8Array, name = "texture"): WebpInfo {
  if (
    bytes.length < 30 ||
    fourcc(bytes, 0) !== "RIFF" ||
    fourcc(bytes, 8) !== "WEBP"
  ) {
    throw new Error(`${name}: not a WebP file`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const chunk = fourcc(bytes, 12);
  // The chunk payload starts after the 4-byte tag and the 4-byte size.
  const data = 20;
  if (chunk === "VP8 ") {
    if (
      bytes[data + 3] !== 0x9d ||
      bytes[data + 4] !== 0x01 ||
      bytes[data + 5] !== 0x2a
    ) {
      throw new Error(`${name}: malformed lossy WebP frame header`);
    }
    return {
      format: "lossy",
      width: view.getUint16(data + 6, true) & 0x3fff,
      height: view.getUint16(data + 8, true) & 0x3fff,
      alpha: false,
    };
  }
  if (chunk === "VP8L") {
    if (bytes[data] !== 0x2f) {
      throw new Error(`${name}: malformed lossless WebP signature`);
    }
    const packed = view.getUint32(data + 1, true);
    return {
      format: "lossless",
      width: (packed & 0x3fff) + 1,
      height: ((packed >>> 14) & 0x3fff) + 1,
      alpha: ((packed >>> 28) & 1) === 1,
    };
  }
  if (chunk === "VP8X") {
    const flags = bytes[data] ?? 0;
    const read24 = (offset: number): number =>
      (bytes[offset] ?? 0) |
      ((bytes[offset + 1] ?? 0) << 8) |
      ((bytes[offset + 2] ?? 0) << 16);
    return {
      format: "extended",
      width: read24(data + 4) + 1,
      height: read24(data + 7) + 1,
      alpha: (flags & 0x10) !== 0,
    };
  }
  throw new Error(`${name}: unsupported WebP chunk "${chunk}"`);
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Read the pixel dimensions from a PNG's IHDR, without decoding it. */
export function readPngSize(
  bytes: Uint8Array,
  name = "texture.png",
): { readonly width: number; readonly height: number } {
  if (
    bytes.length < 24 ||
    PNG_SIGNATURE.some((value, index) => bytes[index] !== value) ||
    fourcc(bytes, 12) !== "IHDR"
  ) {
    throw new Error(`${name}: not a PNG file`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  };
}

/** One row of `texture-encodings.json`. */
export interface TextureEncodingRow {
  readonly path: string;
  readonly source: string;
  readonly sourceSha256: string;
  readonly args: readonly string[];
  readonly encoder: string;
  readonly bytes: number;
  readonly sha256: string;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

/** Parse the record leniently: an unreadable row is simply not re-used. */
export function parseTextureEncodings(text: string): TextureEncodingRow[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return [];
  }
  if (typeof parsed !== "object" || parsed === null) return [];
  const files = (parsed as Record<string, unknown>)["files"];
  if (!Array.isArray(files)) return [];
  const rows: TextureEncodingRow[] = [];
  for (const item of files) {
    if (typeof item !== "object" || item === null) continue;
    const row = item as Record<string, unknown>;
    const { path, source, sourceSha256, args, encoder, bytes, sha256 } = row;
    if (
      typeof path === "string" &&
      typeof source === "string" &&
      typeof sourceSha256 === "string" &&
      isStringArray(args) &&
      typeof encoder === "string" &&
      typeof bytes === "number" &&
      typeof sha256 === "string"
    ) {
      rows.push({ path, source, sourceSha256, args, encoder, bytes, sha256 });
    }
  }
  return rows;
}

function sameArgs(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function resolveUnder(base: string, name: string): string {
  const target = resolve(base, name);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    encodeFailure(name, `texture path escapes ${base}`);
  }
  return target;
}

export interface EncodeTexturesOptions {
  readonly inputRoot: string;
  readonly outRoot: string;
  /**
   * The tree whose committed outputs may be re-used: the repository root. Omit
   * it to encode everything.
   */
  readonly reuseRoot?: string;
  readonly catalogue: ShipCatalogue;
  readonly encoder?: TextureEncoder;
}

/**
 * Encode every allowlisted texture to `public/textures/<name>.webp` and emit
 * the record beside the generated JSON.
 *
 * @throws {ContentError} `TEXTURE_ENCODE` when the encoder is missing or fails,
 *   or when an output's dimensions or layout do not match its source and
 *   profile. `TEXTURE_MISSING` when a source cannot be read.
 */
export async function encodeTextures({
  inputRoot,
  outRoot,
  reuseRoot,
  catalogue,
  encoder = cwebpEncoder(),
}: EncodeTexturesOptions): Promise<EmittedTextureFile[]> {
  const references = resolveReferencedTextures(catalogue);
  const sourceBase = resolve(inputRoot, TEXTURES_DIR);
  const targetBase = resolve(outRoot, EMITTED_TEXTURES_DIR);
  await mkdir(targetBase, { recursive: true });

  let recorded: TextureEncodingRow[] = [];
  if (reuseRoot !== undefined) {
    try {
      recorded = parseTextureEncodings(
        await readFile(resolve(reuseRoot, TEXTURE_ENCODINGS_PATH), "utf8"),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }

  let encoderVersion: string | undefined;
  const emitted: EmittedTextureFile[] = [];
  const rows: TextureEncodingRow[] = [];

  for (const name of VENDORED_TEXTURES) {
    const sourcePath = resolveUnder(sourceBase, name);
    const sourceFile = `${TEXTURES_DIR}/${name}`;
    let source: Uint8Array;
    try {
      source = new Uint8Array(await readFile(sourcePath));
    } catch (cause) {
      throw contentError("TEXTURE_MISSING", sourceFile, name, {
        excerpt: `texture source cannot be read${
          cause instanceof Error ? `: ${cause.message}` : ""
        }`,
      });
    }
    const sourceSha256 = sha256Hex(source);
    const kinds = (references.get(name) ?? []).map(
      (reference) => reference.mapKind,
    );
    const profile = profileFor(kinds);
    const args = encoderArgs(profile);
    const outName = encodedTextureFile(name);
    const path = `${EMITTED_TEXTURES_DIR}/${outName}`;

    let bytes: Uint8Array | undefined;
    let usedEncoder: string | undefined;
    const previous = recorded.find((row) => row.path === path);
    if (
      reuseRoot !== undefined &&
      previous !== undefined &&
      previous.source === sourceFile &&
      previous.sourceSha256 === sourceSha256 &&
      sameArgs(previous.args, args)
    ) {
      try {
        const committed = new Uint8Array(
          await readFile(resolve(reuseRoot, path)),
        );
        if (sha256Hex(committed) === previous.sha256) {
          bytes = committed;
          usedEncoder = previous.encoder;
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    if (bytes === undefined) {
      encoderVersion ??= await encoder.version();
      bytes = await encoder.encode(sourcePath, args);
      usedEncoder = encoderVersion;
    }

    // Whether fresh or re-used, the output must describe the same image.
    let info: WebpInfo;
    let size: { readonly width: number; readonly height: number };
    try {
      info = readWebpInfo(bytes, path);
      size = readPngSize(source, sourceFile);
    } catch (cause) {
      encodeFailure(
        path,
        cause instanceof Error ? cause.message : "unreadable",
      );
    }
    if (info.width !== size.width || info.height !== size.height) {
      encodeFailure(
        path,
        `encoded size ${String(info.width)}x${String(info.height)} differs from the source ${String(size.width)}x${String(size.height)}`,
      );
    }
    if (profile.lossless !== (info.format === "lossless")) {
      encodeFailure(
        path,
        `expected a ${profile.lossless ? "lossless" : "lossy"} file, found ${info.format}`,
      );
    }
    if (!profile.alpha && info.alpha) {
      encodeFailure(path, "the alpha channel was meant to be dropped");
    }

    await writeFile(resolveUnder(targetBase, outName), bytes);
    emitted.push({ path, bytes });
    rows.push({
      path,
      source: sourceFile,
      sourceSha256,
      args,
      encoder: usedEncoder ?? "",
      bytes: bytes.length,
      sha256: sha256Hex(bytes),
    });
  }

  rows.sort((left, right) => compareCodeUnits(left.path, right.path));
  const record = new TextEncoder().encode(
    canonicalJson({
      files: rows.map((row) => ({
        args: [...row.args],
        bytes: row.bytes,
        encoder: row.encoder,
        path: row.path,
        sha256: row.sha256,
        source: row.source,
        sourceSha256: row.sourceSha256,
      })),
    }),
  );
  const recordTarget = resolve(outRoot, TEXTURE_ENCODINGS_PATH);
  await mkdir(resolve(recordTarget, ".."), { recursive: true });
  await writeFile(recordTarget, record);

  return [
    ...emitted.sort((left, right) => compareCodeUnits(left.path, right.path)),
    { path: TEXTURE_ENCODINGS_PATH, bytes: record },
  ];
}

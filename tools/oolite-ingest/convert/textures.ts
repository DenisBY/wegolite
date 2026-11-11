// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Vendored textures: the reference closure, the byte-identical copy of the sky
 * textures, and (below) the greyscale emissive bake (DATA-04, DATA-07, DATA-08,
 * DATA-09, D-03, D-20, D-21, T-02-20).
 *
 * The sixteen ship and station textures are no longer copied: they are
 * re-encoded to WebP by `convert/texture-encode.ts`, which revises D-20 (see
 * PROJECT.md Key Decisions). This module still owns their allowlist and the
 * reference closure, which the encoder reads.
 *
 * The set is driven by `EMITTED_ENTRIES` from `convert/glb.ts`, never restated
 * here: the files this module copies are exactly the files the two emitted GLBs
 * reference, in both directions. A reference outside `VENDORED_TEXTURES` is a
 * build failure (`TEXTURE_MISSING`) naming the ship, the material and the
 * snapshot path the allowlist is missing — never a reason to drop a reference.
 * An allowlisted file that no emitted material references is a failure too, so
 * a stale entry cannot ship silently.
 *
 * Copying (the sky textures) is literal: bytes in, the same bytes out, verified
 * by SHA-256. The derived `_emissive.png` is built from the source alpha
 * channel with `node:zlib` rather than an image dependency.
 *
 * The closure is scoped to the material sets the two GLBs emit, not every
 * `modelVendored` entry. `cobra3-alternate` and `cobra3-pirate` reference
 * `oolite_cobra3_diffuse_alt.png` / `_pirate.png`, which are deliberately absent
 * because no GLB is built from those entries.
 *
 * UV orientation (DATA-04, D-09) is settled by the committed 8x8 asymmetric
 * fixture: `sampleNearest(fixture, 0.25, 0.25)` returns its uniquely marked
 * top-left quadrant and `(0.25, 0.75)` its bottom-left, which proves `v = 0` is
 * the image's top row. Combined with the emitted quad corner whose geometry is
 * top-left carrying UV `(0, 0)`, the mapping is the identity: `convertMesh`
 * keeps the authored pair and this pipeline applies no V flip. If a future
 * fixture disagrees, the flip belongs in exactly one place — the UV copy in
 * `convertMesh`.
 */

import { constants, deflateSync, inflateSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { ShipCatalogue } from "../../../src/content/schemas/ship.js";
import { sha256Hex } from "../canonical/hash.js";
import { contentError } from "../content-error.js";
import { EMITTED_ENTRIES, SHIPDATA_SOURCE_FILE, emissiveFile } from "./glb.js";

/** The vendored snapshot's texture directory, repository-relative. */
export const TEXTURES_DIR = "third_party/oolite/Textures";

/** Where the copied and baked textures are written, repository-relative. */
export const EMITTED_TEXTURES_DIR = "public/textures";

/**
 * The 16 source files the two emitted GLBs reference, sorted by code unit.
 * Explicit by design: a texture becomes vendorable by being added here **and**
 * referenced by an emitted material, and both directions are asserted. These
 * are the vendored names; the client is served the re-encoded `.webp` of each.
 */
export const VENDORED_TEXTURES: readonly string[] = [
  "oolite_buoy_diffuse.png",
  "oolite_buoy_illumination.png",
  "oolite_buoy_normal.png",
  "oolite_buoy_specular.png",
  "oolite_buoy_subents.png",
  "oolite_cobra3_diffuse.png",
  "oolite_cobra3_normal.png",
  "oolite_cobra3_specular.png",
  "oolite_cobra3_subents.png",
  "oolite_cobra3_subents_normal.png",
  "oolite_coriolis_diffuse.png",
  "oolite_coriolis_dock_diffuse.png",
  "oolite_coriolis_dock_normal.png",
  "oolite_coriolis_faceplate_diffuse.png",
  "oolite_coriolis_faceplate_normal.png",
  "oolite_coriolis_faceplate_specular.png",
  "oolite_coriolis_normal.png",
  "oolite_coriolis_specular.png",
  "oolite_coriolis_tris_diffuse.png",
  "oolite_coriolis_tris_normal.png",
  "oolite_coriolis_tris_specular.png",
];

/** Which authored material slot produced a reference. */
export type TextureMapKind =
  | "diffuse"
  | "normal"
  | "specular"
  /** The alpha channel of the named file is an emission mask (baked apart). */
  | "emission"
  /** The named file is itself an RGB emission image. */
  | "illumination";

/** One material slot that names a texture file. */
export interface TextureReference {
  readonly shipKey: string;
  readonly materialKey: string;
  readonly mapKind: TextureMapKind;
}

export interface CopyTexturesOptions {
  readonly inputRoot: string;
  readonly outRoot: string;
}

/** A generated file: repository-relative path plus the bytes that belong there. */
export interface EmittedTextureFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function expectedPath(name: string): string {
  return `${TEXTURES_DIR}/${name}`;
}

function textureFailure(
  name: string,
  construct: string,
  detail: string,
): never {
  throw contentError("TEXTURE_MISSING", expectedPath(name), construct, {
    excerpt: detail,
  });
}

function pushReference(
  references: Map<string, TextureReference[]>,
  name: string,
  reference: TextureReference,
): void {
  const existing = references.get(name);
  if (existing === undefined) references.set(name, [reference]);
  else existing.push(reference);
}

/**
 * Resolve the texture closure of the two emitted GLBs.
 *
 * For every entry named by `EMITTED_ENTRIES`, collect each material's
 * `diffuse_map`, `normal_map`, `specular_map` and `emission_map.name`, plus the
 * material key itself when it ends in `.png` and no `diffuse_map` is declared
 * (the Coriolis hull and its three parts are authored that way). The result is
 * `Map<fileName, TextureReference[]>`.
 *
 * Both directions are fatal: a reference outside the allowlist and an
 * allowlisted file with no reference each throw `TEXTURE_MISSING`.
 */
export function resolveReferencedTextures(
  catalogue: ShipCatalogue,
): Map<string, TextureReference[]> {
  const entries = new Map(catalogue.map((entry) => [entry.key, entry]));
  const references = new Map<string, TextureReference[]>();

  for (const shipKeys of Object.values(EMITTED_ENTRIES)) {
    for (const shipKey of shipKeys) {
      const entry = entries.get(shipKey);
      if (entry === undefined) {
        throw contentError("SCHEMA", SHIPDATA_SOURCE_FILE, shipKey, {
          excerpt: "emitted GLB names a shipdata entry that is not resolved",
        });
      }

      const materials = entry.shipDef.materials;
      for (const materialKey of Object.keys(materials)) {
        const config = materials[materialKey];
        if (config === undefined) continue;
        const base = { shipKey, materialKey };

        const authoredDiffuse = asString(config.diffuse_map);
        const diffuse =
          authoredDiffuse ??
          (materialKey.endsWith(".png") ? materialKey : null);
        if (diffuse !== null) {
          pushReference(references, diffuse, { ...base, mapKind: "diffuse" });
        }

        const normal = asString(config.normal_map);
        if (normal !== null) {
          pushReference(references, normal, { ...base, mapKind: "normal" });
        }

        const specular = asString(config.specular_map);
        if (specular !== null) {
          pushReference(references, specular, {
            ...base,
            mapKind: "specular",
          });
        }

        const emissionMap = config.emission_map;
        const emission =
          typeof emissionMap === "object" && emissionMap !== null
            ? asString((emissionMap as Record<string, unknown>).name)
            : null;
        if (emission !== null) {
          pushReference(references, emission, {
            ...base,
            mapKind: "emission",
          });
        }
        // A bare file name is an RGB illumination map, served as it is.
        const illumination = asString(emissionMap);
        if (illumination !== null) {
          pushReference(references, illumination, {
            ...base,
            mapKind: "illumination",
          });
        }
      }
    }
  }

  const allowlist = new Set(VENDORED_TEXTURES);
  for (const [name, referencing] of references) {
    if (allowlist.has(name)) continue;
    const first = referencing[0];
    const detail =
      first === undefined
        ? `texture "${name}" has no referencing material`
        : `texture "${name}" referenced by ship "${first.shipKey}" material "${first.materialKey}" (${first.mapKind}); expected snapshot path ${expectedPath(name)}`;
    textureFailure(name, first?.materialKey ?? "VENDORED_TEXTURES", detail);
  }

  const referenced = new Set(references.keys());
  for (const name of VENDORED_TEXTURES) {
    if (referenced.has(name)) continue;
    textureFailure(
      name,
      "VENDORED_TEXTURES",
      `allowlisted texture "${name}" is not referenced by any emitted material (${expectedPath(name)})`,
    );
  }

  return references;
}

/**
 * Resolve a texture path beneath `base`, refusing anything that escapes it. The
 * caller has already rejected `..` names by the reference closure; this is the
 * second lock on the same door (T-02-20).
 */
function resolveUnder(base: string, name: string, construct: string): string {
  const target = resolve(base, name);
  if (target !== base && !target.startsWith(`${base}${sep}`)) {
    textureFailure(name, construct, `texture path escapes ${base}`);
  }
  return target;
}

/**
 * The sky textures the High graphics quality draws its nebulae with.
 *
 * They are listed in `Config/nebulatextures.plist` and are not referenced by a
 * ship material, so they sit outside `VENDORED_TEXTURES` and its "referenced by
 * an emitted GLB" rule. They are small greyscale masks, so they are copied
 * byte-for-byte: the source and the written file are both hashed and the
 * digests compared, so a partial write fails the build.
 */
export const SKY_TEXTURES: readonly string[] = [
  "oolite-nebula-1.png",
  "oolite-nebula-2.png",
  "oolite-nebula-3.png",
  "oolite-nebula-4.png",
];

/** Copy the sky textures byte-for-byte into `public/textures/`. */
export async function copySkyTextures({
  inputRoot,
  outRoot,
}: CopyTexturesOptions): Promise<EmittedTextureFile[]> {
  return copyNamedTextures(SKY_TEXTURES, { inputRoot, outRoot });
}

async function copyNamedTextures(
  names: readonly string[],
  { inputRoot, outRoot }: CopyTexturesOptions,
): Promise<EmittedTextureFile[]> {
  const sourceBase = resolve(inputRoot, TEXTURES_DIR);
  const targetBase = resolve(outRoot, EMITTED_TEXTURES_DIR);
  await mkdir(targetBase, { recursive: true });

  const emitted: EmittedTextureFile[] = [];
  for (const name of names) {
    const source = resolveUnder(sourceBase, name, name);
    let bytes: Buffer;
    try {
      bytes = await readFile(source);
    } catch (cause) {
      textureFailure(
        name,
        name,
        `referenced texture cannot be read from ${expectedPath(name)}${
          cause instanceof Error ? `: ${cause.message}` : ""
        }`,
      );
    }

    const target = resolveUnder(targetBase, name, name);
    const copied = new Uint8Array(bytes);
    await writeFile(target, copied);

    const written = await readFile(target);
    if (sha256Hex(copied) !== sha256Hex(written)) {
      textureFailure(
        name,
        name,
        `copied texture is not byte-identical to ${expectedPath(name)}`,
      );
    }

    emitted.push({
      path: `${EMITTED_TEXTURES_DIR}/${name}`,
      bytes: copied,
    });
  }

  return emitted.sort((left, right) => compareCodeUnits(left.path, right.path));
}

export interface DecodedPng {
  readonly width: number;
  readonly height: number;
  readonly channels: 4;
  readonly data: Uint8Array;
}

export interface DecodedGreyscalePng {
  readonly width: number;
  readonly height: number;
  readonly channels: 1;
  readonly data: Uint8Array;
}

export interface EmitTexturesOptions {
  readonly inputRoot: string;
  readonly outRoot: string;
  readonly catalogue: ShipCatalogue;
}

/** The largest dimension `decodePng` accepts, checked before any inflate. */
export const MAX_TEXTURE_DIMENSION = 8192;

const PNG_SIGNATURE: readonly number[] = [
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
];

interface PngHeader {
  readonly width: number;
  readonly height: number;
  readonly bitDepth: number;
  readonly colourType: number;
  readonly interlace: number;
}

function pngFailure(name: string, construct: string, detail: string): never {
  throw contentError("TEXTURE_MISSING", expectedPath(name), construct, {
    excerpt: detail,
  });
}

/**
 * Read the `IHDR` chunk only. Nothing is inflated here, so a 16-bit,
 * interlaced or oversized image fails before zlib can allocate (T-02-19).
 */
function readHeader(bytes: Uint8Array, name: string): PngHeader {
  if (bytes.length < 33) {
    pngFailure(name, "PNG signature", "not a PNG: header is truncated");
  }
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      pngFailure(name, "PNG signature", "not a PNG: signature mismatch");
    }
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const length = view.getUint32(8, false);
  const type = String.fromCharCode(
    bytes[12] ?? 0,
    bytes[13] ?? 0,
    bytes[14] ?? 0,
    bytes[15] ?? 0,
  );
  if (type !== "IHDR" || length !== 13) {
    pngFailure(name, "IHDR", "the first chunk must be a 13-byte IHDR");
  }
  return {
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
    bitDepth: bytes[24] ?? 0,
    colourType: bytes[25] ?? 0,
    interlace: bytes[28] ?? 0,
  };
}

function validateHeader(
  header: PngHeader,
  name: string,
  bitDepth: number,
  colourType: number,
  label: string,
): void {
  if (
    header.width < 1 ||
    header.height < 1 ||
    header.width > MAX_TEXTURE_DIMENSION ||
    header.height > MAX_TEXTURE_DIMENSION
  ) {
    pngFailure(
      name,
      "IHDR dimensions",
      `image dimensions ${String(header.width)}x${String(header.height)} exceed the ${String(MAX_TEXTURE_DIMENSION)}-pixel cap`,
    );
  }
  if (header.bitDepth !== bitDepth) {
    pngFailure(
      name,
      "IHDR bit depth",
      `unsupported bit depth ${String(header.bitDepth)} (only ${String(bitDepth)} is supported)`,
    );
  }
  if (header.colourType !== colourType) {
    pngFailure(
      name,
      "IHDR colour type",
      `unsupported colour type ${String(header.colourType)} (only ${String(colourType)}/${label} is supported)`,
    );
  }
  if (header.interlace !== 0) {
    pngFailure(
      name,
      "IHDR interlace",
      `interlaced PNGs are unsupported (interlace ${String(header.interlace)})`,
    );
  }
}

/** Concatenate every `IDAT` payload from the chunk stream after `IHDR`. */
function collectIdat(bytes: Uint8Array, name: string): Uint8Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const parts: Uint8Array[] = [];
  let total = 0;
  let offset = 8;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(
      bytes[offset + 4] ?? 0,
      bytes[offset + 5] ?? 0,
      bytes[offset + 6] ?? 0,
      bytes[offset + 7] ?? 0,
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      pngFailure(name, type, `truncated ${type} chunk`);
    }
    if (type === "IDAT") {
      parts.push(bytes.subarray(dataStart, dataEnd));
      total += length;
    }
    if (type === "IEND") {
      sawEnd = true;
      break;
    }
    offset = dataEnd + 4;
  }
  if (!sawEnd) pngFailure(name, "IEND", "the PNG has no IEND chunk");
  const joined = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    joined.set(part, cursor);
    cursor += part.length;
  }
  return joined;
}

function inflate(compressed: Uint8Array, name: string): Uint8Array {
  try {
    return new Uint8Array(inflateSync(compressed));
  } catch (cause) {
    pngFailure(
      name,
      "IDAT",
      `cannot inflate PNG image data${
        cause instanceof Error ? `: ${cause.message}` : ""
      }`,
    );
  }
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

/** Unfilter the inflated scanlines for PNG filter types 0-4, exactly per spec. */
function unfilter(
  raw: Uint8Array,
  width: number,
  height: number,
  bytesPerPixel: number,
  name: string,
): Uint8Array {
  const stride = width * bytesPerPixel;
  const expected = height * (stride + 1);
  if (raw.length < expected) {
    pngFailure(
      name,
      "IDAT",
      `PNG image data is truncated (${String(raw.length)} of ${String(expected)} bytes)`,
    );
  }

  const out = new Uint8Array(height * stride);
  let previous = new Uint8Array(stride);
  for (let row = 0; row < height; row++) {
    const rowStart = row * (stride + 1);
    const filter = raw[rowStart] ?? 0;
    const outputStart = row * stride;
    for (let column = 0; column < stride; column++) {
      const value = raw[rowStart + 1 + column] ?? 0;
      const left =
        column >= bytesPerPixel
          ? (out[outputStart + column - bytesPerPixel] ?? 0)
          : 0;
      const up = previous[column] ?? 0;
      const upLeft =
        column >= bytesPerPixel ? (previous[column - bytesPerPixel] ?? 0) : 0;
      let restored: number;
      switch (filter) {
        case 0:
          restored = value;
          break;
        case 1:
          restored = value + left;
          break;
        case 2:
          restored = value + up;
          break;
        case 3:
          restored = value + ((left + up) >> 1);
          break;
        case 4:
          restored = value + paeth(left, up, upLeft);
          break;
        default:
          pngFailure(
            name,
            "IDAT filter",
            `unsupported scanline filter type ${String(filter)}`,
          );
      }
      out[outputStart + column] = restored & 0xff;
    }
    previous = out.slice(outputStart, outputStart + stride);
  }
  return out;
}

/**
 * Decode a non-interlaced 8-bit colour-type-6 PNG (DATA-07, T-02-19).
 *
 * Only this shape is accepted: the four sampled textures are RGBA, and the
 * emissive bake needs only the alpha channel. Any other header fails with
 * `TEXTURE_MISSING` naming the unsupported property, before `inflateSync` runs.
 */
export function decodePng(bytes: Uint8Array, name = "texture.png"): DecodedPng {
  const header = readHeader(bytes, name);
  validateHeader(header, name, 8, 6, "RGBA");
  const raw = inflate(collectIdat(bytes, name), name);
  return {
    width: header.width,
    height: header.height,
    channels: 4,
    data: unfilter(raw, header.width, header.height, 4, name),
  };
}

/** Decode an 8-bit colour-type-0 PNG: the shape `encodeGreyscalePng` emits. */
export function decodeGreyscalePng(
  bytes: Uint8Array,
  name = "texture.png",
): DecodedGreyscalePng {
  const header = readHeader(bytes, name);
  validateHeader(header, name, 8, 0, "greyscale");
  const raw = inflate(collectIdat(bytes, name), name);
  return {
    width: header.width,
    height: header.height,
    channels: 1,
    data: unfilter(raw, header.width, header.height, 1, name),
  };
}

/**
 * Nearest-neighbour sample with glTF's texture-space convention: `v = 0` is the
 * image's **top** row, so `row = floor(v * height)` and no flip is applied.
 * This is the pixel-level half of the orientation decision; `convertMesh` is the
 * geometry half.
 */
export function sampleNearest(
  pngBytes: Uint8Array,
  u: number,
  v: number,
  name = "texture.png",
): readonly [number, number, number, number] {
  const decoded = decodePng(pngBytes, name);
  const clamp = (value: number, maximum: number): number => {
    if (value < 0) return 0;
    if (value > maximum) return maximum;
    return value;
  };
  const column = clamp(Math.floor(u * decoded.width), decoded.width - 1);
  const row = clamp(Math.floor(v * decoded.height), decoded.height - 1);
  const offset = (row * decoded.width + column) * 4;
  return [
    decoded.data[offset] ?? 0,
    decoded.data[offset + 1] ?? 0,
    decoded.data[offset + 2] ?? 0,
    decoded.data[offset + 3] ?? 0,
  ];
}

/** CRC-32 (IEEE) for PNG chunks; an integer-only table. */
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index++) {
    let value = index;
    for (let bit = 0; bit < 8; bit++) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  for (let index = 0; index < 4; index++) {
    chunk[4 + index] = type.charCodeAt(index);
  }
  chunk.set(data, 8);
  view.setUint32(
    8 + data.length,
    crc32(chunk.subarray(4, 8 + data.length)),
    false,
  );
  return chunk;
}

/**
 * Encode an 8-bit colour-type-0 greyscale PNG (D-08, T-02-19).
 *
 * Determinism is the point: every scanline uses filter type 0, the deflate
 * parameters are explicit (`level: 9`, `Z_FIXED`, `memLevel: 9`, `windowBits:
 * 15`), and no chunk carries a timestamp, a text note or a resolution hint.
 */
export function encodeGreyscalePng(
  grey: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (width < 1 || height < 1 || grey.length !== width * height) {
    throw new Error(
      `encodeGreyscalePng: ${String(grey.length)} samples do not fill ${String(width)}x${String(height)}`,
    );
  }

  const raw = new Uint8Array(height * (width + 1));
  for (let row = 0; row < height; row++) {
    const start = row * (width + 1);
    raw[start] = 0; // filter type 0 on every scanline
    raw.set(grey.subarray(row * width, (row + 1) * width), start + 1);
  }

  const compressed = new Uint8Array(
    deflateSync(raw, {
      level: 9,
      strategy: constants.Z_FIXED,
      memLevel: 9,
      windowBits: 15,
    }),
  );

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width, false);
  headerView.setUint32(4, height, false);
  header[8] = 8; // bit depth
  header[9] = 0; // colour type: greyscale
  header[10] = 0; // compression
  header[11] = 0; // filter
  header[12] = 0; // interlace

  const chunks = [
    new Uint8Array(PNG_SIGNATURE),
    pngChunk("IHDR", header),
    pngChunk("IDAT", compressed),
    pngChunk("IEND", new Uint8Array(0)),
  ];
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

/**
 * Bake the source alpha channel into a single greyscale channel: `grey = alpha`,
 * RGB = grey and the emitted colour type (0) is opaque. The RGBA diffuse is
 * never emitted as an emissive map — that is the whole-hull-glow pitfall (D-08).
 */
export function bakeEmissive(
  pngBytes: Uint8Array,
  name = "texture.png",
): Uint8Array {
  const decoded = decodePng(pngBytes, name);
  const grey = new Uint8Array(decoded.width * decoded.height);
  for (let index = 0; index < grey.length; index++) {
    grey[index] = decoded.data[index * 4 + 3] ?? 0;
  }
  return encodeGreyscalePng(grey, decoded.width, decoded.height);
}

/**
 * Bake one emissive map per distinct `emission_map` across the emitted material
 * sets and write them as `public/textures/<source-basename>_emissive.png`.
 *
 * The names come from `emissiveFile`, the same function `materialFor` uses, so a
 * baked file and an emitted `emissiveTexture` URI cannot drift apart. The test
 * asserts the set against the committed GLBs' `images[].uri` values.
 */
export async function emitTextures({
  inputRoot,
  outRoot,
  catalogue,
}: EmitTexturesOptions): Promise<EmittedTextureFile[]> {
  const references = resolveReferencedTextures(catalogue);
  const sources: string[] = [];
  for (const [name, referencing] of references) {
    if (referencing.some((reference) => reference.mapKind === "emission")) {
      sources.push(name);
    }
  }
  sources.sort(compareCodeUnits);

  const sourceBase = resolve(inputRoot, TEXTURES_DIR);
  const targetBase = resolve(outRoot, EMITTED_TEXTURES_DIR);
  await mkdir(targetBase, { recursive: true });

  const emitted: EmittedTextureFile[] = [];
  for (const name of sources) {
    const source = resolveUnder(sourceBase, name, name);
    let bytes: Buffer;
    try {
      bytes = await readFile(source);
    } catch (cause) {
      textureFailure(
        name,
        name,
        `emission source cannot be read from ${expectedPath(name)}${
          cause instanceof Error ? `: ${cause.message}` : ""
        }`,
      );
    }

    const fileName = emissiveFile(name);
    const baked = bakeEmissive(new Uint8Array(bytes), name);
    await writeFile(resolveUnder(targetBase, fileName, fileName), baked);
    emitted.push({ path: `${EMITTED_TEXTURES_DIR}/${fileName}`, bytes: baked });
  }

  return emitted.sort((left, right) => compareCodeUnits(left.path, right.path));
}

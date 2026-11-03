// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Vendored textures: the reference closure, the byte-identical copy, and (below)
 * the greyscale emissive bake (DATA-04, DATA-07, DATA-08, DATA-09, D-03, D-20,
 * D-21, T-02-20).
 *
 * The set is driven by `EMITTED_ENTRIES` from `convert/glb.ts`, never restated
 * here: the files this module copies are exactly the files the two emitted GLBs
 * reference, in both directions. A reference outside `VENDORED_TEXTURES` is a
 * build failure (`TEXTURE_MISSING`) naming the ship, the material and the
 * snapshot path the allowlist is missing — never a reason to drop a reference.
 * An allowlisted file that no emitted material references is a failure too, so
 * a stale entry cannot ship silently.
 *
 * Copying is literal: bytes in, the same bytes out, verified by SHA-256. No
 * decode, no resize, no colour conversion — only the derived `_emissive.png` is
 * generated, and it is built from the source alpha channel with `node:zlib`
 * rather than an image dependency.
 *
 * The closure is scoped to the material sets the two GLBs emit, not every
 * `modelVendored` entry. `cobra3-alternate` and `cobra3-pirate` reference
 * `oolite_cobra3_diffuse_alt.png` / `_pirate.png`, which are deliberately absent
 * because no GLB is built from those entries.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import type { ShipCatalogue } from "../../../src/content/schemas/ship.js";
import { sha256Hex } from "../canonical/hash.js";
import { contentError } from "../content-error.js";
import { EMITTED_ENTRIES, SHIPDATA_SOURCE_FILE } from "./glb.js";

/** The vendored snapshot's texture directory, repository-relative. */
export const TEXTURES_DIR = "third_party/oolite/Textures";

/** Where the copied and baked textures are written, repository-relative. */
export const EMITTED_TEXTURES_DIR = "public/textures";

/**
 * The 16 files the two emitted GLBs reference, sorted by code unit. Explicit by
 * design: a texture becomes vendorable by being added here **and** referenced by
 * an emitted material, and both directions are asserted.
 */
export const VENDORED_TEXTURES: readonly string[] = [
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
export type TextureMapKind = "diffuse" | "normal" | "specular" | "emission";

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
 * Copy every allowlisted texture byte-for-byte into `public/textures/`.
 *
 * The source and the written file are both hashed and the digests compared, so
 * a partial write or a transform on the copy path fails the build instead of
 * shipping a subtly different image (D-20).
 */
export async function copyTextures({
  inputRoot,
  outRoot,
}: CopyTexturesOptions): Promise<EmittedTextureFile[]> {
  const sourceBase = resolve(inputRoot, TEXTURES_DIR);
  const targetBase = resolve(outRoot, EMITTED_TEXTURES_DIR);
  await mkdir(targetBase, { recursive: true });

  const emitted: EmittedTextureFile[] = [];
  for (const name of VENDORED_TEXTURES) {
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

function notImplemented(name: string): never {
  throw new Error(`${name}: not implemented`);
}

export function decodePng(
  _bytes: Uint8Array,
  _name = "texture.png",
): DecodedPng {
  return notImplemented("decodePng");
}

export function decodeGreyscalePng(
  _bytes: Uint8Array,
  _name = "texture.png",
): DecodedGreyscalePng {
  return notImplemented("decodeGreyscalePng");
}

export function encodeGreyscalePng(
  _grey: Uint8Array,
  _width: number,
  _height: number,
): Uint8Array {
  return notImplemented("encodeGreyscalePng");
}

export function bakeEmissive(
  _pngBytes: Uint8Array,
  _name = "texture.png",
): Uint8Array {
  return notImplemented("bakeEmissive");
}

export async function emitTextures(
  _options: EmitTexturesOptions,
): Promise<EmittedTextureFile[]> {
  return notImplemented("emitTextures");
}

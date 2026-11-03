// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The content manifest: identity, format version, and one hashed row per emitted
 * artefact (D-04, D-05, DATA-04).
 *
 * `files[]` is sorted by `path` in code-unit order, so the manifest is itself
 * canonical. It excludes itself — a manifest cannot contain its own hash — and
 * carries no timestamp and no host path: `oolite.retrieved` is a date a human
 * wrote down, which makes a snapshot bump a reviewable diff.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { canonicalJson } from "./canonical/json.js";
import type { PlistJson } from "./canonical/json.js";
import { sha256Hex } from "./canonical/hash.js";

export const MANIFEST_FORMAT = "wegolite-content-manifest";
export const MANIFEST_SCHEMA_VERSION = 1;
export const MANIFEST_GENERATOR = "oolite-ingest/1";
export const MANIFEST_PATH = "src/content/generated/manifest.json";

/** The pinned Oolite release identity, read from `third_party/oolite/pin.json`. */
export interface OolitePin {
  readonly release: string;
  readonly commit: string;
  readonly retrieved: string;
}

export interface ManifestFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface ContentManifest {
  readonly format: string;
  readonly schemaVersion: number;
  readonly generator: string;
  readonly oolite: OolitePin;
  readonly files: ManifestFile[];
}

/** Structural input: anything the generator emitted, path plus bytes. */
export interface ManifestSourceFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildManifest(
  emitted: readonly ManifestSourceFile[],
  pin: OolitePin,
): ContentManifest {
  const files = emitted
    .map((file) => ({
      path: file.path,
      bytes: file.bytes.length,
      sha256: sha256Hex(file.bytes),
    }))
    .sort((a, b) => compareCodeUnits(a.path, b.path));

  return {
    format: MANIFEST_FORMAT,
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    generator: MANIFEST_GENERATOR,
    oolite: {
      release: pin.release,
      commit: pin.commit,
      retrieved: pin.retrieved,
    },
    files,
  };
}

export function manifestJson(manifest: ContentManifest): PlistJson {
  return {
    format: manifest.format,
    schemaVersion: manifest.schemaVersion,
    generator: manifest.generator,
    oolite: {
      release: manifest.oolite.release,
      commit: manifest.oolite.commit,
      retrieved: manifest.oolite.retrieved,
    },
    files: manifest.files.map((file) => ({
      path: file.path,
      bytes: file.bytes,
      sha256: file.sha256,
    })),
  };
}

export function serializeManifest(manifest: ContentManifest): string {
  return canonicalJson(manifestJson(manifest));
}

/** Write `src/content/generated/manifest.json` under `outRoot`. */
export async function writeManifest(
  outRoot: string,
  manifest: ContentManifest,
): Promise<void> {
  const target = join(outRoot, MANIFEST_PATH);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, serializeManifest(manifest), "utf8");
}

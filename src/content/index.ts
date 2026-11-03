// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The app-side content boundary (D-15, D-16).
 *
 * RED stub: the shape is pinned by `index.test.ts`; the validation lands with
 * the GREEN implementation.
 */

export interface ManifestFileEntry {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ContentManifest {
  format: string;
  schemaVersion: number;
  generator: string;
  oolite: { release: string; commit: string; retrieved: string };
  files: ManifestFileEntry[];
}

/** A manifest that does not match this build's declared content contract. */
export class ContentBoundaryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContentBoundaryError";
  }
}

/** Validate the one content artefact the app trusts at runtime. */
export function assertContentManifest(_raw: unknown): ContentManifest {
  throw new ContentBoundaryError(
    "assertContentManifest is not implemented yet.",
  );
}

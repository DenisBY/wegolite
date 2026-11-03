// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The app-side content boundary (D-15, D-16, T-02-23).
 *
 * Every record was validated by the build-time schemas, so the app validates
 * exactly one small thing: the manifest that declares what it loaded. A
 * mismatch throws `ContentBoundaryError` naming the failing path and the
 * expected value, before the renderer exists — never a warning, a default, or
 * a plausible-looking blank game.
 *
 * This module deliberately imports nothing from `tools/`: the compiler is a
 * build-time dependency, not a runtime one.
 */

import { ContentManifestSchema } from "./schemas/manifest.js";
import type { ContentManifest } from "./schemas/manifest.js";

/** The manifest version this build understands. */
export const CONTENT_MANIFEST_SCHEMA_VERSION = 1;

/** A manifest that does not match this build's declared content contract. */
export class ContentBoundaryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ContentBoundaryError";
  }
}

/**
 * Render one zod issue as `path: expected <value>`. The path is the important
 * half: `files[3].sha256` tells a reader which emitted artefact is wrong.
 */
function describeIssue(issue: {
  path: PropertyKey[];
  message: string;
  expected?: unknown;
}): string {
  const path = issue.path.reduce<string>((accumulator, segment) => {
    if (typeof segment === "number")
      return `${accumulator}[${String(segment)}]`;
    return accumulator === ""
      ? String(segment)
      : `${accumulator}.${String(segment)}`;
  }, "");
  const expected =
    issue.expected === undefined
      ? issue.message
      : String(JSON.stringify(issue.expected));
  return `${path === "" ? "(root)" : path}: expected ${expected}`;
}

/**
 * Validate the manifest at boot and return it typed.
 *
 * @throws {ContentBoundaryError} when the manifest is missing a field, names a
 * different format, or declares a schema version this build does not own.
 */
export function assertContentManifest(raw: unknown): ContentManifest {
  const result = ContentManifestSchema.safeParse(raw);
  if (result.success) return result.data;

  const details = result.error.issues.map((issue) =>
    describeIssue({
      path: issue.path,
      message: issue.message,
      ...("expected" in issue ? { expected: issue.expected } : {}),
    }),
  );

  throw new ContentBoundaryError(
    `Wegolite content manifest is invalid — ${details.join("; ")}.`,
    { cause: result.error },
  );
}

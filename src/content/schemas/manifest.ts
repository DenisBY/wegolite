// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The content manifest schema (D-15, D-16, T-02-23).
 *
 * This is the one content artefact the app validates at runtime. It is
 * **strict** because it describes our own output, never a raw Oolite
 * dictionary: a leaked or missing field is a bug that must stop the boot.
 *
 * `schemaVersion` is a literal because the app and the generated content must
 * agree exactly. `format` is a literal for the same reason: a file that is not
 * a Wegolite manifest is not something to guess about.
 *
 * `files[]` is sorted by `path` in code-unit order by the generator, so the
 * manifest is itself canonical; the schema does not re-sort because a
 * reordered manifest is a drift bug, not something to repair at read time.
 */

import { z } from "zod";

export const ManifestFileEntrySchema = z.strictObject({
  path: z.string(),
  bytes: z.number().int().nonnegative(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});

export const ContentManifestSchema = z.strictObject({
  format: z.literal("wegolite-content-manifest"),
  schemaVersion: z.literal(1),
  oolite: z.strictObject({
    release: z.string(),
    commit: z.string(),
    retrieved: z.string(),
  }),
  generator: z.string(),
  files: z.array(ManifestFileEntrySchema),
});

export type ManifestFileEntry = z.infer<typeof ManifestFileEntrySchema>;
export type ContentManifest = z.infer<typeof ContentManifestSchema>;

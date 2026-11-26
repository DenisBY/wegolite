// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The role-to-AI table (DATA-17).
 *
 * `autoAImap.plist` names the AI file Oolite gives a ship that is added by
 * role (`Universe.m:3638-3643`): when a populated ship has `auto_AI` and its
 * requested role is in the table, the table's AI replaces the record's own
 * `ai_type`. Phases 22 and 23 read this table; nothing imports it in Phase 21.
 *
 * The compiled file is an entry array in code-unit order of `role`, one entry
 * per plist key, never an object keyed by role: a role named `__proto__`
 * could not reach a prototype (T-21-15) and an integer-like role could not be
 * reordered by the engine. A role is a lower-case token with hyphens, as the
 * stock set is (`pirate-light-fighter`); an AI file is a script or plist
 * name with no directory part (`oolite-pirateAI.js`, `dumbAI.plist`). Both
 * patterns are anchored and bounded.
 */

import { z } from "zod";

/** The most entries a table may hold; the stock plist has 27. */
export const MAX_AUTO_AI_ENTRIES = 64;

/** The longest role or AI file name accepted. */
export const MAX_AUTO_AI_NAME_LENGTH = 64;

/** A role: lower-case letters, digits and hyphens, starting with a letter. */
export const AUTO_AI_ROLE_PATTERN = /^[a-z][a-z0-9-]*$/;

/** An AI file: a script or plist name, no directory part. */
export const AUTO_AI_FILE_PATTERN = /^[A-Za-z][A-Za-z0-9_-]*\.(js|plist)$/;

export const AutoAiEntrySchema = z.strictObject({
  role: z.string().max(MAX_AUTO_AI_NAME_LENGTH).regex(AUTO_AI_ROLE_PATTERN),
  ai: z.string().max(MAX_AUTO_AI_NAME_LENGTH).regex(AUTO_AI_FILE_PATTERN),
});

export const AutoAiMapSchema = z
  .array(AutoAiEntrySchema)
  .min(1)
  .max(MAX_AUTO_AI_ENTRIES)
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.role)).size === entries.length,
    { message: "auto-AI roles must be unique" },
  )
  .refine(
    (entries) =>
      entries.every(
        (entry, index) =>
          index === 0 || (entries[index - 1]?.role ?? "") < entry.role,
      ),
    { message: "auto-AI entries must be in code-unit order of role" },
  );

export type AutoAiEntry = z.infer<typeof AutoAiEntrySchema>;
export type AutoAiMap = z.infer<typeof AutoAiMapSchema>;

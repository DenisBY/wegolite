// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The comms strings (DATA-17).
 *
 * The minimum of `descriptions.plist` the in-scope roles speak: the ten
 * `oolite-comms-*` message templates of the priority AI and every description
 * key they reach through `[name]` references (`beg-for-mercy`,
 * `distress-call`, `police-attack-warning`, `describe-pirate`, ...). Oolite's
 * text is kept verbatim, a string or the authored list of alternatives.
 * Expansion (choosing an alternative, substituting a variable) happens in the
 * UI and never in the sim, and never draws from a sim stream (PITFALLS C4
 * point 6). `variables` lists the bracketed names (`[oolite_entityName]`) and
 * percent codes (`%H`, `%R`) that are not description keys: they are runtime
 * values the UI supplies and are never followed. Phases 22 and 23 read this
 * table; nothing imports it in Phase 21.
 *
 * The compiled file is `{ entries, variables }`. `entries` is an array of
 * `{ key, value }` in code-unit order of `key`, never an object keyed by
 * description key (T-21-15). Every pattern is anchored and every list and
 * string is bounded.
 */

import { z } from "zod";

/** The most entries the subset may hold; the stock closure has 15. */
export const MAX_COMMS_ENTRIES = 64;

/** The most alternatives one entry may list; the stock maximum is 8. */
export const MAX_COMMS_ALTERNATIVES = 32;

/** The longest key accepted. */
export const MAX_COMMS_KEY_LENGTH = 96;

/** The longest string accepted. */
export const MAX_COMMS_TEXT_LENGTH = 512;

/** The most variables the subset may list. */
export const MAX_COMMS_VARIABLES = 64;

/** A description key: letters, digits, `_` and `-`, starting alphanumeric. */
export const COMMS_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

/** A variable: a bracketed name (no nested brackets) or a `%` code letter. */
export const COMMS_VARIABLE_PATTERN = /^(?:\[[^[\]]{1,64}\]|%[A-Za-z])$/;

const CommsTextSchema = z.string().min(1).max(MAX_COMMS_TEXT_LENGTH);

export const CommsEntrySchema = z.strictObject({
  key: z.string().max(MAX_COMMS_KEY_LENGTH).regex(COMMS_KEY_PATTERN),
  value: z.union([
    CommsTextSchema,
    z.array(CommsTextSchema).min(1).max(MAX_COMMS_ALTERNATIVES),
  ]),
});

export const CommsStringsSchema = z.strictObject({
  entries: z
    .array(CommsEntrySchema)
    .min(1)
    .max(MAX_COMMS_ENTRIES)
    .refine(
      (entries) =>
        new Set(entries.map((entry) => entry.key)).size === entries.length,
      { message: "comms keys must be unique" },
    )
    .refine(
      (entries) =>
        entries.every(
          (entry, index) =>
            index === 0 || (entries[index - 1]?.key ?? "") < entry.key,
        ),
      { message: "comms entries must be in code-unit order of key" },
    ),
  variables: z
    .array(z.string().regex(COMMS_VARIABLE_PATTERN))
    .max(MAX_COMMS_VARIABLES)
    .refine((variables) => new Set(variables).size === variables.length, {
      message: "comms variables must be unique",
    })
    .refine(
      (variables) =>
        variables.every(
          (variable, index) =>
            index === 0 || (variables[index - 1] ?? "") < variable,
        ),
      { message: "comms variables must be in code-unit order" },
    ),
});

export type CommsEntry = z.infer<typeof CommsEntrySchema>;
export type CommsStrings = z.infer<typeof CommsStringsSchema>;

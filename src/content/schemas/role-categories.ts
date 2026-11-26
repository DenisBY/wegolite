// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The role categories (DATA-17).
 *
 * `role-categories.plist` groups roles ("roles used by pirates", "roles
 * pirates think have tasty cargo") so an AI tests a role through a category
 * instead of listing roles (pitfall C9). A role may be in several categories.
 * Phases 22 and 23 read this table; nothing imports it in Phase 21.
 *
 * The compiled file is an entry array, one `{ category, roles }` entry per
 * plist key in code-unit order of `category`, with each role list in authored
 * order, never an object keyed by category (T-21-15). A role is kept exactly
 * as authored, so `trader-courier+` and `EQ_THARGON` survive: the pattern
 * allows upper case, digits, `_`, `-` and a `+` suffix, and nothing else. A
 * category is a lower-case token with hyphens. Patterns are anchored and every
 * list and name is bounded. A category with an empty role list is valid.
 */

import { z } from "zod";

/** The most categories a table may hold; the stock plist has 16. */
export const MAX_ROLE_CATEGORIES = 64;

/** The most roles one category may list; the longest stock list has 21. */
export const MAX_ROLES_PER_CATEGORY = 128;

/** The longest category or role name accepted. */
export const MAX_ROLE_NAME_LENGTH = 64;

/** A category: lower-case letters, digits and hyphens, starting with a letter. */
export const ROLE_CATEGORY_PATTERN = /^[a-z][a-z0-9-]*$/;

/** A role as authored: letters, digits, `_` and `-`, with an optional `+`. */
export const ROLE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*\+?$/;

export const RoleCategorySchema = z.strictObject({
  category: z.string().max(MAX_ROLE_NAME_LENGTH).regex(ROLE_CATEGORY_PATTERN),
  roles: z
    .array(z.string().max(MAX_ROLE_NAME_LENGTH).regex(ROLE_PATTERN))
    .max(MAX_ROLES_PER_CATEGORY),
});

export const RoleCategoriesSchema = z
  .array(RoleCategorySchema)
  .min(1)
  .max(MAX_ROLE_CATEGORIES)
  .refine(
    (entries) =>
      new Set(entries.map((entry) => entry.category)).size === entries.length,
    { message: "role categories must be unique" },
  )
  .refine(
    (entries) =>
      entries.every(
        (entry, index) =>
          index === 0 || (entries[index - 1]?.category ?? "") < entry.category,
      ),
    { message: "role categories must be in code-unit order of category" },
  );

export type RoleCategory = z.infer<typeof RoleCategorySchema>;
export type RoleCategories = z.infer<typeof RoleCategoriesSchema>;

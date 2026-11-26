// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `role-categories.plist` → the role category lists (DATA-17).
 *
 * Oolite's AIs test a ship's role through a category ("roles used by pirates",
 * "roles pirates think have tasty cargo") instead of naming roles one by one
 * (pitfall C9). The whole plist is compiled, every named category with its
 * role list, as an entry array in code-unit order of `category`. The roles
 * stay in authored order and verbatim, so `trader-courier+` and `EQ_THARGON`
 * survive; a category with an empty list compiles to an empty array. Nothing
 * reads the table at run time in Phase 21; Phases 22 and 23 consume it.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import type { PlistValue } from "../openstep/plist-value.js";
import {
  RoleCategoriesSchema,
  type RoleCategories,
} from "../../../src/content/schemas/role-categories.js";

/** Where the categories are written, repository-relative. */
export const ROLE_CATEGORIES_PATH =
  "src/content/generated/role-categories.json";

/** The vendored source, repository-relative, named by every failure. */
export const ROLE_CATEGORIES_SOURCE_FILE =
  "third_party/oolite/Config/role-categories.plist";

function fail(
  construct: string,
  detail: string,
  at?: { readonly line: number; readonly column: number },
): never {
  throw contentError("SCHEMA", ROLE_CATEGORIES_SOURCE_FILE, construct, {
    excerpt: detail,
    ...(at === undefined ? {} : { line: at.line, column: at.column }),
  });
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compile the categories: one `{ category, roles }` entry per plist key,
 * code-unit sorted, roles in authored order.
 *
 * @throws {ContentError} SCHEMA naming the category (or `category.index`) when
 * the plist is not a dictionary, a value is not an array of strings, a
 * category is repeated, or the table fails `RoleCategoriesSchema`.
 */
export function compileRoleCategories(plist: PlistValue): RoleCategories {
  if (plist.kind !== "dict") {
    return fail("role-categories", "the top level is not a dictionary", plist);
  }

  const seen = new Set<string>();
  const entries: { category: string; roles: string[] }[] = [];
  for (const entry of plist.entries) {
    if (seen.has(entry.key)) {
      return fail(entry.key, "the category appears twice", {
        line: entry.keyLine,
        column: entry.keyColumn,
      });
    }
    seen.add(entry.key);
    if (entry.value.kind !== "array") {
      return fail(entry.key, "the role list is not an array", entry.value);
    }
    const roles = entry.value.values.map((role, index) => {
      if (role.kind !== "string") {
        return fail(
          `${entry.key}.${String(index)}`,
          "the role is not a string",
          role,
        );
      }
      return role.value;
    });
    entries.push({ category: entry.key, roles });
  }
  entries.sort((left, right) =>
    compareCodeUnits(left.category, right.category),
  );

  const parsed = RoleCategoriesSchema.safeParse(entries);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = issue?.path[0];
    const category =
      typeof index === "number" ? entries[index]?.category : undefined;
    const at = issue?.path[2];
    return fail(
      category === undefined
        ? "role-categories"
        : typeof at === "number"
          ? `${category}.${String(at)}`
          : category,
      issue === undefined ? "invalid role categories" : issue.message,
    );
  }
  return parsed.data;
}

/** Serialise the categories as canonical JSON. */
export function emitRoleCategories(plist: PlistValue): {
  readonly path: string;
  readonly bytes: Uint8Array;
} {
  const entries: PlistJson[] = compileRoleCategories(plist).map((entry) => ({
    category: entry.category,
    roles: [...entry.roles],
  }));
  return {
    path: ROLE_CATEGORIES_PATH,
    bytes: Buffer.from(canonicalJson(entries), "utf8"),
  };
}

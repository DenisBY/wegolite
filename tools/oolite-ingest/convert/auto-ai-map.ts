// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `autoAImap.plist` → the role-to-AI table (DATA-17).
 *
 * Oolite chooses a populated ship's AI by the role it was requested with, not
 * by the record's own `ai_type` (`Universe.m:3638-3643`): a ship with
 * `auto_AI` whose requested role is a key of this plist gets the plist's AI.
 * The whole plist is compiled, every role to its AI file (27 entries at the
 * pin), as an entry array in code-unit order of `role`. Nothing reads it at
 * run time in Phase 21; the populator and the priority AI of Phases 22 and 23
 * consume it.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import type { PlistValue } from "../openstep/plist-value.js";
import {
  AutoAiMapSchema,
  type AutoAiMap,
} from "../../../src/content/schemas/auto-ai-map.js";

/** Where the table is written, repository-relative. */
export const AUTO_AI_MAP_PATH = "src/content/generated/auto-ai-map.json";

/** The vendored source, repository-relative, named by every failure. */
export const AUTO_AI_MAP_SOURCE_FILE =
  "third_party/oolite/Config/autoAImap.plist";

function fail(
  construct: string,
  detail: string,
  at?: { readonly line: number; readonly column: number },
): never {
  throw contentError("SCHEMA", AUTO_AI_MAP_SOURCE_FILE, construct, {
    excerpt: detail,
    ...(at === undefined ? {} : { line: at.line, column: at.column }),
  });
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compile the table: one `{ role, ai }` entry per plist key, code-unit sorted.
 *
 * @throws {ContentError} SCHEMA naming the role when the plist is not a
 * dictionary, a value is not a string, a role is repeated, or the table fails
 * `AutoAiMapSchema`.
 */
export function compileAutoAiMap(plist: PlistValue): AutoAiMap {
  if (plist.kind !== "dict") {
    return fail("autoAImap", "the top level is not a dictionary", plist);
  }

  const seen = new Set<string>();
  const entries: { role: string; ai: string }[] = [];
  for (const entry of plist.entries) {
    if (seen.has(entry.key)) {
      return fail(entry.key, "the role appears twice", {
        line: entry.keyLine,
        column: entry.keyColumn,
      });
    }
    seen.add(entry.key);
    if (entry.value.kind !== "string") {
      return fail(entry.key, "the AI file is not a string", entry.value);
    }
    entries.push({ role: entry.key, ai: entry.value.value });
  }
  entries.sort((left, right) => compareCodeUnits(left.role, right.role));

  const parsed = AutoAiMapSchema.safeParse(entries);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const index = issue?.path[0];
    const role = typeof index === "number" ? entries[index]?.role : undefined;
    return fail(
      role ?? "autoAImap",
      issue === undefined ? "invalid auto-AI table" : issue.message,
    );
  }
  return parsed.data;
}

/** Serialise the table as canonical JSON. */
export function emitAutoAiMap(plist: PlistValue): {
  readonly path: string;
  readonly bytes: Uint8Array;
} {
  const entries: PlistJson[] = compileAutoAiMap(plist).map((entry) => ({
    role: entry.role,
    ai: entry.ai,
  }));
  return {
    path: AUTO_AI_MAP_PATH,
    bytes: Buffer.from(canonicalJson(entries), "utf8"),
  };
}

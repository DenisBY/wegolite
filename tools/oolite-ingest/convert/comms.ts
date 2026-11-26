// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `descriptions.plist` → the comms strings the in-scope roles speak
 * (DATA-17, CONTEXT's discretion on the subset size).
 *
 * The subset is the minimum: the ten `oolite-comms-*` templates of the
 * priority AI (`COMMS_ROOT_KEYS`) plus every description key they reach
 * through `[name]` references, computed as a transitive closure (iterative,
 * with a visited set, so a reference cycle is followed once and never loops).
 * A bracketed name made only of digits (`[7]`) is not a description key and
 * not a variable: Oolite dispatches it to `ExpandDigitKey`
 * (`OOStringExpander.m`), which picks a string from row 7 of
 * `system_description`. It is listed in `descriptionIndexes` as a number, and
 * the row resolves through `labels.json` `systemDescription` (TOOLS-WR-03). The
 * digit test comes before the key lookup, as in Oolite. Every other bracketed
 * name (`[oolite_entityName]`) and every percent code (`%H`, `%R`) is a runtime
 * variable: it is listed in `variables` and never followed, even when it
 * happens to look like a key.
 *
 * Oolite's text is kept verbatim (a string, or the authored list of
 * alternatives). Expansion (the random choice among alternatives, variable
 * substitution) happens in the UI and never in the sim, and never draws from a
 * sim stream (PITFALLS C4 point 6). The wiring from a role to its comms key
 * lives in `oolite-priorityai.js` `_setCommunications`, a script that is never
 * vendored; it is ported as code with Phase 23's AI, not compiled here.
 *
 * The strings are read from the vendored, pinned `descriptions.plist`, never
 * from the Oolite checkout, whose copy is ahead of the pin.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { dictToMap } from "../openstep/plist-value.js";
import type { PlistValue } from "../openstep/plist-value.js";
import {
  CommsStringsSchema,
  type CommsStrings,
} from "../../../src/content/schemas/comms.js";

/** Where the comms strings are written, repository-relative. */
export const COMMS_PATH = "src/content/generated/comms.json";

/** The vendored source, repository-relative, named by every failure. */
export const COMMS_SOURCE_FILE = "third_party/oolite/Config/descriptions.plist";

/**
 * The ten message templates of the priority AI, in the plist's order
 * (`descriptions.plist` lines 652-673).
 */
export const COMMS_ROOT_KEYS: readonly string[] = [
  "oolite-comms-contractAttack",
  "oolite-comms-makePirateDemand",
  "oolite-comms-acceptPirateDemand",
  "oolite-comms-surrender",
  "oolite-comms-makeDistressCall",
  "oolite-comms-markForFines",
  "oolite-comms-distressResponseAggressor",
  "oolite-comms-offenceDetected",
  "oolite-comms-thanksForHelp",
  "oolite-comms-police-thanksForHelp",
];

/** A `[name]` token: the name has no brackets and is not empty. */
const BRACKET_TOKEN = /\[([^[\]]+)\]/g;

/** A digit-only key (`[7]`): an index into `system_description`. */
const DIGIT_KEY = /^[0-9]+$/;

/** A digit key with an operator (`[7|...]`), which this subset does not carry. */
const DIGIT_KEY_WITH_OPERATOR = /^[0-9]+\|/;

/** The array whose rows the digit keys index (`descriptions.plist`). */
const SYSTEM_DESCRIPTION_KEY = "system_description";

/** A `%H`-style code: a percent sign and one letter. */
const PERCENT_TOKEN = /%[A-Za-z]/g;

function fail(
  construct: string,
  detail: string,
  at?: { readonly line: number; readonly column: number },
): never {
  throw contentError("SCHEMA", COMMS_SOURCE_FILE, construct, {
    excerpt: detail,
    ...(at === undefined ? {} : { line: at.line, column: at.column }),
  });
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Compile the comms subset.
 *
 * @throws {ContentError} SCHEMA naming the key when the plist is not a
 * dictionary, a root key is missing, a reached value is not a string or a list
 * of strings, a digit key names no `system_description` row or carries an
 * operator, or the subset fails `CommsStringsSchema`.
 */
export function compileComms(plist: PlistValue): CommsStrings {
  if (plist.kind !== "dict") {
    return fail("descriptions", "the top level is not a dictionary", plist);
  }
  const dictionary = dictToMap(plist);

  const visited = new Set<string>();
  const queue = [...COMMS_ROOT_KEYS];
  const entries: { key: string; value: string | string[] }[] = [];
  const variables = new Set<string>();
  const descriptionIndexes = new Set<number>();
  const systemDescription = dictionary.get(SYSTEM_DESCRIPTION_KEY);

  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const key = next;
    if (visited.has(key)) continue;
    visited.add(key);

    const found = dictionary.get(key);
    if (found === undefined) {
      return fail(key, `descriptions.plist has no "${key}" entry`);
    }

    let value: string | string[];
    let texts: string[];
    if (found.kind === "string") {
      value = found.value;
      texts = [found.value];
    } else if (found.kind === "array") {
      const list = found.values.map((item, index) => {
        if (item.kind !== "string") {
          return fail(
            `${key}.${String(index)}`,
            "the value is not a string",
            item,
          );
        }
        return item.value;
      });
      value = list;
      texts = list;
    } else {
      return fail(key, "the value is not a string or a list of strings", found);
    }
    entries.push({ key, value });

    for (const text of texts) {
      for (const match of text.matchAll(BRACKET_TOKEN)) {
        const name = match[1] ?? "";
        if (DIGIT_KEY_WITH_OPERATOR.test(name)) {
          return fail(key, `the digit key ${match[0]} carries an operator`);
        }
        if (DIGIT_KEY.test(name)) {
          const index = Number.parseInt(name, 10);
          if (
            systemDescription?.kind !== "array" ||
            index >= systemDescription.values.length
          ) {
            return fail(
              key,
              `the digit key ${match[0]} names no ${SYSTEM_DESCRIPTION_KEY} row`,
            );
          }
          descriptionIndexes.add(index);
        } else if (dictionary.has(name)) {
          if (!visited.has(name)) queue.push(name);
        } else {
          variables.add(match[0]);
        }
      }
      for (const match of text.matchAll(PERCENT_TOKEN)) variables.add(match[0]);
    }
  }

  entries.sort((left, right) => compareCodeUnits(left.key, right.key));
  const candidate = {
    descriptionIndexes: [...descriptionIndexes].sort((a, b) => a - b),
    entries,
    variables: [...variables].sort(compareCodeUnits),
  };

  const parsed = CommsStringsSchema.safeParse(candidate);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path[0];
    const index = issue?.path[1];
    const key =
      where === "entries" && typeof index === "number"
        ? entries[index]?.key
        : undefined;
    return fail(
      key ?? (typeof where === "string" ? where : "comms"),
      issue === undefined ? "invalid comms strings" : issue.message,
    );
  }
  return parsed.data;
}

/** Serialise the comms subset as canonical JSON. */
export function emitComms(plist: PlistValue): {
  readonly path: string;
  readonly bytes: Uint8Array;
} {
  const comms = compileComms(plist);
  const json: PlistJson = {
    descriptionIndexes: [...comms.descriptionIndexes],
    entries: comms.entries.map((entry) => ({
      key: entry.key,
      value: typeof entry.value === "string" ? entry.value : [...entry.value],
    })),
    variables: [...comms.variables],
  };
  return {
    path: COMMS_PATH,
    bytes: Buffer.from(canonicalJson(json), "utf8"),
  };
}

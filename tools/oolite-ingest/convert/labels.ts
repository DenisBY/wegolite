// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `third_party/oolite/Config/descriptions.plist` → typed label content
 * (DATA-07, D-23, D-25, T-02-14).
 *
 * `descriptions.plist` has 1,144 top-level keys and exactly six label arrays.
 * This converter compiles those six plus every string-valued `sysdata-*` format
 * template and nothing else.
 *
 * There is **no** tech-level label array in the pinned snapshot. The tech-level
 * display is the `sysdata-tl-value` template (`"[techLevel]"`) plus the raw + 1
 * rule applied at render time. Inventing a table here would bake a presentation
 * decision into content, so the absence is deliberate.
 *
 * Every value is a template — `%@`, `%R`, `[n]`, `[techLevel]`, `☆` — and is
 * emitted verbatim. Expansion belongs to Phase 5/7.
 */

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { getEntry } from "../openstep/plist-value.js";
import type {
  PlistDict,
  PlistEntry,
  PlistValue,
} from "../openstep/plist-value.js";
import { LabelsSchema } from "../../../src/content/schemas/labels.js";
import type { Labels } from "../../../src/content/schemas/labels.js";

export const LABELS_PATH = "src/content/generated/labels.json";

const FILE = "third_party/oolite/Config/descriptions.plist";

const FORMAT_TEMPLATE_PREFIX = "sysdata-";

export interface EmittedLabels {
  readonly path: string;
  readonly bytes: Uint8Array;
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function requireDict(value: PlistValue, construct: string): PlistDict {
  if (value.kind !== "dict") {
    throw contentError("SCHEMA", FILE, construct, {
      excerpt: "expected a dictionary",
    });
  }
  return value;
}

function requireEntry(dict: PlistDict, key: string): PlistEntry {
  const entry = getEntry(dict, key);
  if (entry === undefined) {
    throw contentError("SCHEMA", FILE, key, {
      excerpt: `missing key "${key}"`,
    });
  }
  return entry;
}

function stringArray(dict: PlistDict, key: string): string[] {
  const entry = requireEntry(dict, key);
  if (entry.value.kind !== "array") {
    throw contentError("SCHEMA", FILE, key, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be an array`,
    });
  }
  return entry.value.values.map((item, index) => {
    if (item.kind !== "string") {
      throw contentError("SCHEMA", FILE, `${key}.${String(index)}`, {
        line: item.line,
        column: item.column,
        excerpt: `"${key}" entries must be strings`,
      });
    }
    return item.value;
  });
}

function nestedStringArray(dict: PlistDict, key: string): string[][] {
  const entry = requireEntry(dict, key);
  if (entry.value.kind !== "array") {
    throw contentError("SCHEMA", FILE, key, {
      line: entry.keyLine,
      column: entry.keyColumn,
      excerpt: `"${key}" must be an array of arrays`,
    });
  }
  return entry.value.values.map((item, index) => {
    if (item.kind !== "array") {
      throw contentError("SCHEMA", FILE, `${key}.${String(index)}`, {
        line: item.line,
        column: item.column,
        excerpt: `"${key}" entries must be arrays of strings`,
      });
    }
    return item.values.map((value, inner) => {
      if (value.kind !== "string") {
        throw contentError(
          "SCHEMA",
          FILE,
          `${key}.${String(index)}.${String(inner)}`,
          {
            line: value.line,
            column: value.column,
            excerpt: `"${key}" entries must be strings`,
          },
        );
      }
      return value.value;
    });
  });
}

/**
 * Every top-level `sysdata-*` key whose value is a string, sorted by key. A
 * template that stops being a string is dropped by this filter rather than
 * failing the build; the count is pinned by `labels.test.ts`.
 */
function formatTemplates(root: PlistDict): Record<string, string> {
  const map = new Map<string, string>();
  for (const entry of root.entries) {
    if (!entry.key.startsWith(FORMAT_TEMPLATE_PREFIX)) continue;
    if (entry.value.kind !== "string") continue;
    map.set(entry.key, entry.value.value);
  }

  const templates: { [key: string]: string } = {};
  for (const key of [...map.keys()].sort(compareCodeUnits)) {
    const value = map.get(key);
    if (value !== undefined) templates[key] = value;
  }
  return templates;
}

/** Project the six label arrays and the format templates. */
export function compileLabels(parsed: PlistValue): Labels {
  const root = requireDict(parsed, "root");
  const candidate = {
    economy: stringArray(root, "economy"),
    government: stringArray(root, "government"),
    legalStatus: stringArray(root, "legal_status"),
    rating: stringArray(root, "rating"),
    inhabitants: nestedStringArray(root, "inhabitants"),
    systemDescription: nestedStringArray(root, "system_description"),
    formatTemplates: formatTemplates(root),
  };

  const result = LabelsSchema.safeParse(candidate);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw contentError(
      "SCHEMA",
      FILE,
      issue === undefined ? "labels" : issue.path.join("."),
      {
        excerpt: issue === undefined ? "invalid label content" : issue.message,
      },
    );
  }
  return result.data;
}

function labelsJson(labels: Labels): PlistJson {
  return {
    economy: [...labels.economy],
    government: [...labels.government],
    legalStatus: [...labels.legalStatus],
    rating: [...labels.rating],
    inhabitants: labels.inhabitants.map((pool) => [...pool]),
    systemDescription: labels.systemDescription.map((pool) => [...pool]),
    formatTemplates: { ...labels.formatTemplates },
  };
}

/** Canonical JSON bytes for the compiled labels. */
export function emitLabels(parsed: PlistValue): EmittedLabels {
  return {
    path: LABELS_PATH,
    bytes: Buffer.from(
      canonicalJson(labelsJson(compileLabels(parsed))),
      "utf8",
    ),
  };
}

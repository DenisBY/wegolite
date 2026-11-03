// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Canonical JSON: the one serialiser for generated content and the manifest
 * (D-05, RESEARCH §P6.1).
 *
 * Rules, each of which exists to keep `assets:check` byte-comparable across
 * machines and architectures:
 *
 * - object keys sorted by **code-unit** comparison (`a < b ? -1 : …`), never an
 *   ICU-dependent locale comparison — ICU version differences would change the
 *   order.
 * - numbers through ECMAScript's shortest round-trip `String(n)`; never
 *   fixed-precision formatting, and `-0` normalises to `"0"`.
 * - two-space indent, `\n` line endings, one final newline.
 * - UTF-8 with literal non-ASCII (no `\u` escaping), so `☆` and `–` stay
 *   reviewable in a diff.
 * - never an object keyed by an integer-like string: JavaScript would reorder
 *   `"0"`, `"7"` numerically regardless of insertion. Emit an array of records.
 *
 * `JSON.stringify` is never used on data-bearing structures. (It is still fine
 * for individual scalar strings, which is how literals are escaped here.)
 */

export type PlistJson =
  | null
  | boolean
  | number
  | string
  | PlistJson[]
  | { readonly [key: string]: PlistJson };

export function canonicalNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`non-finite number in generated content: ${String(value)}`);
  }
  if (Object.is(value, -0)) return "0";
  return String(value);
}

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function serialize(value: PlistJson, depth: number): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return canonicalNumber(value);
    case "string":
      return JSON.stringify(value);
    case "object":
      break;
    default:
      throw new Error(`unsupported JSON value: ${String(value)}`);
  }

  const indent = "  ".repeat(depth);
  const childIndent = "  ".repeat(depth + 1);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const body = value
      .map((item) => `${childIndent}${serialize(item, depth + 1)}`)
      .join(",\n");
    return `[\n${body}\n${indent}]`;
  }

  const keys = Object.keys(value).sort(compareCodeUnits);
  if (keys.length === 0) return "{}";
  const body = keys
    .map((key) => {
      const item = value[key];
      if (item === undefined) {
        throw new Error(`canonicalJson: missing value for key "${key}"`);
      }
      return `${childIndent}${JSON.stringify(key)}: ${serialize(item, depth + 1)}`;
    })
    .join(",\n");
  return `{\n${body}\n${indent}}`;
}

export function canonicalJson(value: PlistJson): string {
  return `${serialize(value, 0)}\n`;
}

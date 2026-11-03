// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The parsed OpenStep value model.
 *
 * A dictionary is an **entry array**, never an object keyed by plist key: an
 * entry array cannot be reached through `__proto__`, and an integer-like key
 * (`"0"`, `"7"`) cannot be reordered by the JavaScript engine. Lookup goes
 * through `dictToMap`/`getEntry`, which reproduce GNUstep's last-wins
 * `NSMutableDictionary` semantics.
 *
 * Every node carries the 1-based `line` and `column` of the token that produced
 * it, so a later schema failure can point at the authored byte (D-17).
 */

import type { PlistJson } from "../canonical/json.js";

interface PlistLocation {
  readonly line: number;
  readonly column: number;
}

export interface PlistDict extends PlistLocation {
  readonly kind: "dict";
  readonly entries: PlistEntry[];
}

export interface PlistEntry {
  readonly key: string;
  readonly keyLine: number;
  readonly keyColumn: number;
  readonly value: PlistValue;
}

export interface PlistArray extends PlistLocation {
  readonly kind: "array";
  readonly values: PlistValue[];
}

export interface PlistString extends PlistLocation {
  readonly kind: "string";
  readonly value: string;
}

export interface PlistInteger extends PlistLocation {
  readonly kind: "integer";
  readonly value: number;
}

export interface PlistReal extends PlistLocation {
  readonly kind: "real";
  readonly value: number;
}

export interface PlistBool extends PlistLocation {
  readonly kind: "bool";
  readonly value: boolean;
}

export type PlistValue =
  PlistDict | PlistArray | PlistString | PlistInteger | PlistReal | PlistBool;

/** Last write wins, exactly like `NSMutableDictionary`. */
export function dictToMap(dict: PlistDict): Map<string, PlistValue> {
  const map = new Map<string, PlistValue>();
  for (const entry of dict.entries) map.set(entry.key, entry.value);
  return map;
}

/** The last entry for `key`, matching `dictToMap`'s last-wins rule. */
export function getEntry(dict: PlistDict, key: string): PlistEntry | undefined {
  for (let index = dict.entries.length - 1; index >= 0; index--) {
    const entry = dict.entries[index];
    if (entry !== undefined && entry.key === key) return entry;
  }
  return undefined;
}

export function getString(dict: PlistDict, key: string): string | undefined {
  const entry = getEntry(dict, key);
  return entry !== undefined && entry.value.kind === "string"
    ? entry.value.value
    : undefined;
}

export function plistToJson(value: PlistValue): PlistJson {
  switch (value.kind) {
    case "dict": {
      // A null-prototype object has no `__proto__` setter, so a dictionary key
      // named `__proto__` becomes an ordinary own property instead of reaching
      // Object.prototype (T-02-11).
      const object = Object.create(null) as { [key: string]: PlistJson };
      for (const entry of value.entries) {
        object[entry.key] = plistToJson(entry.value);
      }
      return object;
    }
    case "array":
      return value.values.map((item) => plistToJson(item));
    case "string":
      return value.value;
    case "integer":
    case "real":
      return value.value;
    case "bool":
      return value.value;
  }
}

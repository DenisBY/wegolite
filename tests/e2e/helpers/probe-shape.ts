// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The probe-shape encoder and comparator (D-13, FOUND-10).
 *
 * `window.__wegolite` is the contract 25 browser specs read, so its key set and
 * leaf types are frozen from before the Phase 8 session split until the split is
 * complete. `probeShapeOf` reduces a live probe to a value-free shape; the
 * comparator reports every way two shapes differ. Both are plain data, so the
 * recorded fixture is reviewable JSON.
 *
 * Encoding (the three cases the review named, Round 1 10b4108 L41 and Round 2
 * 820a435 L369):
 *
 * - `null` is the string "null"; a function is the string "function"; a number,
 *   string or boolean is its `typeof`. A key whose value is `null` is therefore
 *   present with shape "null", which differs from a missing key. A function
 *   leaf (every `probe.test` method) encodes as "function", so a method
 *   replaced by a value is a type change.
 * - A plain object is an object with its keys sorted by code unit and each
 *   value encoded recursively.
 * - An array is `{ "[]": [...] }` holding the sorted set of its distinct
 *   element shapes (sorted by JSON text). Element order and count never matter
 *   among non-empty arrays; an empty array (`{ "[]": [] }`) is not the same as a
 *   non-empty one, and a new or vanished element type is reported.
 * - An object found at a dotted path listed in `recordPaths` is a data-keyed
 *   map, not a schema: it becomes `{ "record": [...] }` holding the sorted set
 *   of its distinct value shapes, so two maps with different keys but equal
 *   value shapes are equal.
 */

/**
 * Keys whose presence depends on timing, not on the sampled state.
 *
 * `hint`: the hint controller decides when to publish the first message-line
 * hint, so a sample cannot pin whether it exists yet. Any key added here needs
 * its reason in this comment and in the Phase 8 SUMMARY (a `--repeat-each=3`
 * failure that motivated it).
 */
export const PROBE_SHAPE_OPTIONAL_KEYS: readonly string[] = ["hint"];

/**
 * Dotted paths whose objects are data-keyed maps rather than schema keys:
 * `economy.cargo` is keyed by commodity, `hud.bounds` by HUD element id.
 */
export const PROBE_SHAPE_RECORD_PATHS: readonly string[] = [
  "economy.cargo",
  "hud.bounds",
];

/**
 * Dotted array paths that may be empty on one side and non-empty on the other.
 * Starts empty: an empty array matches an empty array only. A path may be added
 * only when `--repeat-each=3` proves it timing-volatile; each entry carries a
 * comment naming why (Round 2 review 820a435 L369).
 */
export const PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS: readonly string[] = [];

/**
 * Reduce a value to its shape. Self-contained on purpose: Playwright serialises
 * the function source into the page (`probeShapeOf.toString()`), so it must not
 * reference an import, a module constant or anything outside its own body.
 */
export function probeShapeOf(
  value: unknown,
  recordPaths: readonly string[],
): unknown {
  const compare = (a: string, b: string): number =>
    a < b ? -1 : a > b ? 1 : 0;
  const unique = (shapes: unknown[]): unknown[] => {
    const byText = new Map<string, unknown>();
    for (const shape of shapes) byText.set(JSON.stringify(shape), shape);
    return [...byText.entries()]
      .sort((left, right) => compare(left[0], right[0]))
      .map((entry) => entry[1]);
  };
  const encode = (node: unknown, path: string): unknown => {
    if (node === null) return "null";
    if (typeof node === "function") return "function";
    if (typeof node !== "object") return typeof node;
    if (Array.isArray(node)) {
      return { "[]": unique(node.map((item) => encode(item, path + "[]"))) };
    }
    const entries = Object.entries(node as Record<string, unknown>);
    if (recordPaths.includes(path)) {
      return {
        record: unique(entries.map((entry) => encode(entry[1], path + ".*"))),
      };
    }
    entries.sort((left, right) => compare(left[0], right[0]));
    const out: Record<string, unknown> = {};
    for (const [key, child] of entries) {
      out[key] = encode(child, path === "" ? key : path + "." + key);
    }
    return out;
  };
  return encode(value, "");
}

const SET_KEYS: readonly string[] = ["[]", "record"];

function isObjectShape(shape: unknown): shape is { [key: string]: unknown } {
  return typeof shape === "object" && shape !== null && !Array.isArray(shape);
}

function codeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The shape with every optional key removed at every depth. */
function withoutOptional(
  shape: unknown,
  optionalKeys: readonly string[],
): unknown {
  if (Array.isArray(shape)) {
    return shape.map((item) => withoutOptional(item, optionalKeys));
  }
  if (!isObjectShape(shape)) return shape;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(shape)) {
    if (optionalKeys.includes(key)) continue;
    out[key] = withoutOptional(shape[key], optionalKeys);
  }
  return out;
}

function show(shape: unknown): string {
  return JSON.stringify(shape);
}

/**
 * Compare two shapes. Returns one human-readable line per difference with its
 * dotted path; an empty list means the shapes are equal.
 *
 * An empty element set matches an empty element set only: there is no wildcard
 * (Round 2 review 820a435 L369), so a dropped or invented array element is
 * reported. `volatileEmptyArrayPaths` names the exact dotted paths allowed to be
 * empty on one side and populated on the other. A key in `optionalKeys` may be
 * present on one side only; when present on both its shapes must match.
 */
export function compareProbeShapes(
  actual: unknown,
  expected: unknown,
  optionalKeys: readonly string[],
  volatileEmptyArrayPaths: readonly string[] = PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS,
): string[] {
  const differences: string[] = [];
  const at = (path: string): string => (path === "" ? "<root>" : path);

  const compareSets = (
    actualSet: unknown,
    expectedSet: unknown,
    path: string,
  ): void => {
    if (!Array.isArray(actualSet) || !Array.isArray(expectedSet)) {
      differences.push(
        `${at(path)}: element set is not a list (expected ${show(expectedSet)}, actual ${show(actualSet)})`,
      );
      return;
    }
    const expectedTexts = expectedSet.map((item) =>
      show(withoutOptional(item, optionalKeys)),
    );
    const actualTexts = actualSet.map((item) =>
      show(withoutOptional(item, optionalKeys)),
    );
    if (expectedTexts.length === 0 && actualTexts.length === 0) return;
    if (expectedTexts.length === 0 || actualTexts.length === 0) {
      if (volatileEmptyArrayPaths.includes(path)) return;
      differences.push(
        `${at(path)}: ${expectedTexts.length === 0 ? "expected empty, actual non-empty" : "expected non-empty, actual empty"} (expected ${show(expectedTexts)}, actual ${show(actualTexts)})`,
      );
      return;
    }
    for (const text of actualTexts) {
      if (!expectedTexts.includes(text)) {
        differences.push(`${at(path)}: new element shape ${text}`);
      }
    }
    for (const text of expectedTexts) {
      if (!actualTexts.includes(text)) {
        differences.push(`${at(path)}: missing element shape ${text}`);
      }
    }
  };

  const walk = (a: unknown, e: unknown, path: string): void => {
    if (!isObjectShape(a) || !isObjectShape(e)) {
      if (a !== e) {
        differences.push(`${at(path)}: expected ${show(e)}, actual ${show(a)}`);
      }
      return;
    }
    const keys = [...new Set([...Object.keys(a), ...Object.keys(e)])].sort(
      codeUnit,
    );
    for (const key of keys) {
      const child = path === "" ? key : `${path}.${key}`;
      const inActual = key in a;
      const inExpected = key in e;
      if (inActual && inExpected) {
        if (SET_KEYS.includes(key)) {
          // The set container sits at the array's own path, not below it.
          compareSets(a[key], e[key], path);
        } else {
          walk(a[key], e[key], child);
        }
        continue;
      }
      if (optionalKeys.includes(key)) continue;
      if (inActual) {
        differences.push(`${child}: unexpected key (shape ${show(a[key])})`);
      } else {
        differences.push(`${child}: missing key (expected ${show(e[key])})`);
      }
    }
  };

  walk(actual, expected, "");
  return differences;
}

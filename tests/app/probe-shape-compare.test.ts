// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The probe-shape comparator is the instrument that freezes `window.__wegolite`
 * for the Phase 8 split (D-13, FOUND-10), so it is proven here to catch every
 * drift the plan names and to stay quiet on the documented exceptions.
 */

import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import {
  compareProbeShapes,
  PROBE_SHAPE_OPTIONAL_KEYS,
  PROBE_SHAPE_RECORD_PATHS,
  PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS,
  probeShapeOf,
} from "../e2e/helpers/probe-shape.js";

const NONE: readonly string[] = [];

function shape(value: unknown, recordPaths: readonly string[] = NONE): unknown {
  return probeShapeOf(value, recordPaths);
}

function diff(
  actual: unknown,
  expected: unknown,
  optional: readonly string[] = PROBE_SHAPE_OPTIONAL_KEYS,
  volatile: readonly string[] = PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS,
): string[] {
  return compareProbeShapes(shape(actual), shape(expected), optional, volatile);
}

describe("probeShapeOf", () => {
  it("encodes leaves, nulls, functions, sorted objects and element sets", () => {
    expect(
      shape({
        b: 1,
        a: "x",
        c: null,
        d: () => 1,
        e: true,
        list: [2, 1, "s", 3],
        none: [],
      }),
    ).toEqual({
      a: "string",
      b: "number",
      c: "null",
      d: "function",
      e: "boolean",
      list: { "[]": ["number", "string"] },
      none: { "[]": [] },
    });
  });

  it("sorts keys by code unit", () => {
    const encoded = shape({ b: 1, a: 1, B: 1 }) as Record<string, unknown>;
    expect(Object.keys(encoded)).toEqual(["B", "a", "b"]);
  });

  it("collapses a record path to the set of its value shapes", () => {
    const withRecord = (cargo: Record<string, number>): unknown =>
      shape({ economy: { cargo } }, ["economy.cargo"]);
    expect(withRecord({ food: 1, gold: 2 })).toEqual({
      economy: { cargo: { record: ["number"] } },
    });
    expect(withRecord({})).toEqual({ economy: { cargo: { record: [] } } });
  });

  it("is self-contained so Playwright can serialise it into the page", () => {
    const source = probeShapeOf.toString();
    // A fresh context sees only the function source, like the page does.
    const rebuilt = runInNewContext(`(${source})`) as typeof probeShapeOf;
    const encoded = rebuilt({ a: [1, "x"], f: () => 0 }, []);
    expect(JSON.stringify(encoded)).toBe(
      JSON.stringify({ a: { "[]": ["number", "string"] }, f: "function" }),
    );
  });
});

describe("compareProbeShapes", () => {
  it("reports an added key, a removed key and a renamed key with their path", () => {
    expect(diff({ a: 1, extra: 1 }, { a: 1 })).toEqual([
      'extra: unexpected key (shape "number")',
    ]);
    expect(diff({ a: 1 }, { a: 1, gone: 1 })).toEqual([
      'gone: missing key (expected "number")',
    ]);
    expect(diff({ renamed: 1 }, { name: 1 })).toEqual([
      'name: missing key (expected "number")',
      'renamed: unexpected key (shape "number")',
    ]);
    expect(
      diff({ outer: { inner: 1, extra: 2 } }, { outer: { inner: 1 } }),
    ).toEqual(['outer.extra: unexpected key (shape "number")']);
  });

  it("reports a changed leaf type with its path", () => {
    expect(diff({ speed: "fast" }, { speed: 1 })).toEqual([
      'speed: expected "number", actual "string"',
    ]);
  });

  it("reports null versus object", () => {
    expect(diff({ pending: null }, { pending: { kind: "fit" } })).toEqual([
      'pending: expected {"kind":"string"}, actual "null"',
    ]);
    expect(diff({ pending: { kind: "fit" } }, { pending: null })).toEqual([
      'pending: expected "null", actual {"kind":"string"}',
    ]);
  });

  it("reports a function leaf replaced by a value", () => {
    expect(
      diff({ test: { swapSystem: "x" } }, { test: { swapSystem: () => 1 } }),
    ).toEqual(['test.swapSystem: expected "function", actual "string"']);
  });

  it("treats a key that is null on one side and missing on the other as a difference", () => {
    expect(diff({ a: 1, lastJump: null }, { a: 1 })).toEqual([
      'lastJump: unexpected key (shape "null")',
    ]);
    expect(diff({ a: 1 }, { a: 1, lastJump: null })).toEqual([
      'lastJump: missing key (expected "null")',
    ]);
  });

  it("reports an array whose element shapes gain or lose a type", () => {
    expect(diff({ list: ["a", 1] }, { list: ["a"] })).toEqual([
      'list: new element shape "number"',
    ]);
    expect(diff({ list: ["a"] }, { list: ["a", 1] })).toEqual([
      'list: missing element shape "number"',
    ]);
  });

  it("reports an empty array versus a non-empty array in both directions", () => {
    expect(diff({ list: [] }, { list: ["a"] })).toHaveLength(1);
    expect(diff({ list: [] }, { list: ["a"] })[0]).toContain(
      "list: expected non-empty, actual empty",
    );
    expect(diff({ list: ["a"] }, { list: [] })).toHaveLength(1);
    expect(diff({ list: ["a"] }, { list: [] })[0]).toContain(
      "list: expected empty, actual non-empty",
    );
  });

  it("allows a path in the explicit volatile list to be empty on one side only", () => {
    expect(diff({ list: [] }, { list: ["a"] }, NONE, ["list"])).toEqual([]);
    expect(diff({ list: ["a"] }, { list: [] }, NONE, ["list"])).toEqual([]);
    // The allowance is the exact path: a sibling array is still strict.
    expect(
      diff({ list: [], other: [] }, { list: ["a"], other: ["a"] }, NONE, [
        "list",
      ]),
    ).toHaveLength(1);
    // And it is empty-versus-populated only: a populated mismatch still reports.
    expect(diff({ list: [1] }, { list: ["a"] }, NONE, ["list"])).toHaveLength(
      2,
    );
  });

  it("starts with no volatile empty-array path", () => {
    expect(PROBE_SHAPE_VOLATILE_EMPTY_ARRAY_PATHS).toEqual([]);
  });

  it("reports nothing for identical shapes, including two empty arrays", () => {
    expect(
      diff(
        { a: 1, list: [], nested: { b: [] } },
        { a: 9, list: [], nested: { b: [] } },
      ),
    ).toEqual([]);
  });

  it("lets only the documented timing key be present on one side", () => {
    expect(PROBE_SHAPE_OPTIONAL_KEYS).toEqual(["hint"]);
    expect(diff({ a: 1, hint: "x" }, { a: 1 })).toEqual([]);
    expect(diff({ a: 1 }, { a: 1, hint: "x" })).toEqual([]);
    expect(diff({ a: 1, hint: 4 }, { a: 1, hint: "x" })).toEqual([
      'hint: expected "string", actual "number"',
    ]);
    expect(diff({ a: 1, other: "x" }, { a: 1 })).toHaveLength(1);
  });

  it("ignores element order and count among non-empty arrays", () => {
    expect(diff({ list: ["a", "b", "c"] }, { list: ["z"] })).toEqual([]);
    expect(diff({ list: [1, "a", 2] }, { list: ["a", 1] })).toEqual([]);
  });

  it("treats two record maps with different keys but equal value shapes as equal", () => {
    const left = probeShapeOf({ cargo: { food: 1 } }, ["cargo"]);
    const right = probeShapeOf({ cargo: { gold: 5, slaves: 2 } }, ["cargo"]);
    expect(compareProbeShapes(left, right, NONE, NONE)).toEqual([]);
    const other = probeShapeOf({ cargo: { gold: "x" } }, ["cargo"]);
    expect(compareProbeShapes(left, other, NONE, NONE)).toHaveLength(2);
  });

  it("pins the documented record paths", () => {
    expect(PROBE_SHAPE_RECORD_PATHS).toEqual(["economy.cargo", "hud.bounds"]);
  });
});

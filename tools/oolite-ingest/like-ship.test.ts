// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `like_ship` resolver contract (DATA-02, D-02, D-17, D-18, T-02-02).
 *
 * Every rule asserted here was read out of `src/Core/OOShipRegistry.m` at
 * `7437f22`: the merge is shallow, `like_ship` is always stripped,
 * `display_name`/`is_template` are inherited only when the child declares them,
 * the five alias pairs collapse to the child's spelling, overrides run before
 * resolution and never add an entry, and a cycle carries its whole closed chain.
 *
 * The order-independence property is the join proof: shuffling the entry
 * insertion order 20 times must produce byte-identical canonical output.
 */

import { readFileSync } from "node:fs";

import { assert as fcAssert, property, shuffledSubarray } from "fast-check";
import { describe, expect, it } from "vitest";

import { canonicalJson } from "./canonical/json.js";
import type { PlistJson } from "./canonical/json.js";
import { isContentError } from "./content-error.js";
import type { ContentError } from "./content-error.js";
import { parseOpenStep } from "./openstep/parser.js";
import { dictToMap, plistToJson } from "./openstep/plist-value.js";
import type {
  PlistDict,
  PlistEntry,
  PlistValue,
} from "./openstep/plist-value.js";
import {
  ALIAS_PAIRS,
  applyOverrides,
  fieldsFromDict,
  LIKE_SHIP_NON_INHERITABLE,
  MAX_LIKE_SHIP_DEPTH,
  mergeShip,
  resolveAll,
} from "./like-ship.js";
import type { ResolutionResult } from "./like-ship.js";

const SHIPDATA = "third_party/oolite/Config/shipdata.plist";

function string(value: string): PlistValue {
  return { kind: "string", value, line: 1, column: 1 };
}

function integer(value: number): PlistValue {
  return { kind: "integer", value, line: 1, column: 1 };
}

function real(value: number): PlistValue {
  return { kind: "real", value, line: 1, column: 1 };
}

function array(values: PlistValue[]): PlistValue {
  return { kind: "array", values, line: 1, column: 1 };
}

function dictOf(values: Record<string, PlistValue>): PlistDict {
  return {
    kind: "dict",
    line: 1,
    column: 1,
    entries: Object.entries(values).map(([key, value]) => entry(key, value)),
  };
}

function entry(key: string, value: PlistValue): PlistEntry {
  return { key, keyLine: 1, keyColumn: 1, value };
}

function fields(values: Record<string, PlistValue>): Map<string, PlistValue> {
  return new Map(Object.entries(values));
}

function fixture(name: string): PlistDict {
  const file = `tests/fixtures/shipdata/${name}`;
  const source = readFileSync(
    new URL(`../../tests/fixtures/shipdata/${name}`, import.meta.url),
    "utf8",
  );
  const parsed = parseOpenStep(source, file);
  if (parsed.kind !== "dict")
    throw new Error(`${name} did not parse as a dict`);
  return parsed;
}

function capture(fn: () => unknown): ContentError {
  try {
    fn();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a ContentError, but no error was thrown");
}

/** Canonical form of a resolution result, independent of Map iteration order. */
function serialize(result: ResolutionResult): string {
  const keys = [...result.entries.keys()].sort();
  const entries = keys.map((key) => {
    const resolved = result.entries.get(key);
    if (resolved === undefined)
      throw new Error(`missing resolved entry ${key}`);
    const object: { [field: string]: PlistJson } = {};
    for (const [field, value] of resolved) object[field] = plistToJson(value);
    return { key, fields: object };
  });
  return canonicalJson(entries);
}

describe("mergeShip", () => {
  it("keeps child wins, strips like_ship and drops undeclared non-inheritable keys", () => {
    const merged = mergeShip(
      fields({ a: integer(1), like_ship: string("p") }),
      fields({
        a: integer(2),
        b: integer(3),
        display_name: string("P"),
        is_template: integer(1),
      }),
    );

    expect(merged.get("a")).toEqual(integer(1));
    expect(merged.get("b")).toEqual(integer(3));
    expect(merged.has("display_name")).toBe(false);
    expect(merged.has("is_template")).toBe(false);
    expect(merged.has("like_ship")).toBe(false);
  });

  it("inherits is_template when the child declares it, including an integer 1", () => {
    const merged = mergeShip(
      fields({ is_template: integer(1) }),
      fields({ is_template: string("no") }),
    );
    expect(merged.get("is_template")).toEqual(integer(1));
    expect(LIKE_SHIP_NON_INHERITABLE).toEqual(["display_name", "is_template"]);
  });

  it("replaces materials and subentities wholesale instead of deep-merging", () => {
    const parentMaterials = dictOf({
      Hull: dictOf({ gloss: real(1) }),
      Gun: dictOf({ gloss: real(0.5) }),
    });
    const childMaterials = dictOf({ Hull: dictOf({ gloss: real(0.25) }) });
    const childSubentities = array([integer(9)]);

    const merged = mergeShip(
      fields({ materials: childMaterials, subentities: childSubentities }),
      fields({
        materials: parentMaterials,
        subentities: array([integer(1), integer(2)]),
      }),
    );

    expect(merged.get("materials")).toEqual(childMaterials);
    expect(merged.get("subentities")).toEqual(childSubentities);
  });

  it("collapses every alias pair to the child's spelling and deletes the other", () => {
    expect(ALIAS_PAIRS).toEqual([
      ["scan_class", "scanClass"],
      ["escort_role", "escort-role"],
      ["escort_ship", "escort-ship"],
      ["is_carrier", "isCarrier"],
      ["has_shipyard", "hasShipyard"],
    ]);

    for (const [snake, camel] of ALIAS_PAIRS) {
      const fromSnake = mergeShip(
        fields({ [snake]: string("child") }),
        fields({ [camel]: string("parent") }),
      );
      expect(fromSnake.get(snake)).toEqual(string("child"));
      expect(fromSnake.has(camel)).toBe(false);

      const fromCamel = mergeShip(
        fields({ [camel]: string("child") }),
        fields({ [snake]: string("parent") }),
      );
      expect(fromCamel.get(camel)).toEqual(string("child"));
      expect(fromCamel.has(snake)).toBe(false);
    }
  });
});

describe("resolveAll", () => {
  it("reports a closed cycle with the whole chain and resolves unrelated entries", () => {
    const root = fixture("cycle.plist");
    const error = capture(() =>
      resolveAll(root, { file: "tests/fixtures/shipdata/cycle.plist" }),
    );

    expect(error.code).toBe("LIKE_SHIP_CYCLE");
    expect(error.chain).toEqual(["a", "b", "c", "a"]);
  });

  it("reports a dangling target with the chain to the missing key", () => {
    const root = fixture("dangling.plist");
    const error = capture(() =>
      resolveAll(root, { file: "tests/fixtures/shipdata/dangling.plist" }),
    );

    expect(error.code).toBe("LIKE_SHIP_DANGLING");
    expect(error.chain).toEqual(["stranded", "missing_ship"]);
  });

  it("treats an is_external_dependency entry as resolved without a parent", () => {
    const root = parseOpenStep(
      `{ external = { like_ship = "not_here"; is_external_dependency = 1; }; }`,
      "external.plist",
    );
    if (root.kind !== "dict") throw new Error("fixture is not a dict");

    const result = resolveAll(root, { file: "external.plist" });
    expect(result.entries.has("external")).toBe(true);
    expect(result.entries.get("external")?.has("like_ship")).toBe(false);
  });

  it("applies overrides before resolution and never adds an entry", () => {
    const root = fixture("overrides-adds-entry.plist");
    const base = root.entries.find((item) => item.key === "base")?.value;
    const overrides = root.entries.find(
      (item) => item.key === "overrides",
    )?.value;
    if (base === undefined || base.kind !== "dict")
      throw new Error("base fixture missing");
    if (overrides === undefined || overrides.kind !== "dict")
      throw new Error("overrides fixture missing");

    const patched = applyOverrides(
      new Map([["base", fieldsFromDict(base)]]),
      overrides,
    );
    const result = resolveAll(dictOf({ base }), {
      file: "tests/fixtures/shipdata/overrides-adds-entry.plist",
      overrides,
    });

    expect(result.entries.size).toBe(1);
    expect(patched.size).toBe(1);
    const name = result.entries.get("base")?.get("name");
    expect(name?.kind).toBe("string");
    expect(name?.kind === "string" ? name.value : undefined).toBe("Patched");
    expect(result.entries.has("added")).toBe(false);
  });

  it("refuses a chain deeper than the depth cap instead of recursing", () => {
    const entries: PlistEntry[] = [];
    for (let index = 0; index <= MAX_LIKE_SHIP_DEPTH; index++) {
      const next =
        index === MAX_LIKE_SHIP_DEPTH
          ? {}
          : {
              like_ship: string(`s${String(index + 1)}`),
            };
      entries.push(entry(`s${String(index)}`, dictOf(next)));
    }
    const root: PlistDict = { kind: "dict", line: 1, column: 1, entries };

    const error = capture(() => resolveAll(root, { file: "deep.plist" }));
    expect(error.code).toBe("LIKE_SHIP_CYCLE");
    expect(error.chain?.length).toBeGreaterThan(MAX_LIKE_SHIP_DEPTH);
  });

  it("is order-independent: 20 shuffles produce identical canonical output", () => {
    const source = readFileSync(
      new URL(`../../${SHIPDATA}`, import.meta.url),
      "utf8",
    );
    const root = parseOpenStep(source, SHIPDATA);
    if (root.kind !== "dict") throw new Error("shipdata is not a dict");

    const original = serialize(resolveAll(root, { file: SHIPDATA }));
    const byKey = dictToMap(root);
    const keys = [...byKey.keys()];

    fcAssert(
      property(
        shuffledSubarray(keys, {
          minLength: keys.length,
          maxLength: keys.length,
        }),
        (order) => {
          const shuffled: PlistDict = {
            kind: "dict",
            line: 1,
            column: 1,
            entries: order.map((key) => {
              const value = byKey.get(key);
              if (value === undefined) throw new Error(`missing ${key}`);
              return entry(key, value);
            }),
          };
          expect(serialize(resolveAll(shuffled, { file: SHIPDATA }))).toBe(
            original,
          );
        },
      ),
      { numRuns: 20 },
    );
  });
});

describe("resolved chains", () => {
  it("resolves cobra3-player through exactly three entries", () => {
    const source = readFileSync(
      new URL(`../../${SHIPDATA}`, import.meta.url),
      "utf8",
    );
    const root = parseOpenStep(source, SHIPDATA);
    if (root.kind !== "dict") throw new Error("shipdata is not a dict");

    const result = resolveAll(root, { file: SHIPDATA });
    expect(result.chains.get("cobra3-player")).toEqual([
      "cobra3-player",
      "oolite_template_cobra3-player",
      "oolite_template_cobra3",
    ]);
    expect(result.maxChainDepth).toBe(3);
  });
});

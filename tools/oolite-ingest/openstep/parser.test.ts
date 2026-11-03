// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * OpenStep parser grammar coverage (DATA-01, T-02-11, T-02-12).
 *
 * The fixtures under `tests/fixtures/plist/` are hand-written, deliberately
 * tiny, and encode the parts of the grammar the pinned corpus exercises but a
 * happy-path test would miss: octal escapes (`\007` in missiontext.plist and
 * `\030` in oolite-font.plist), duplicate keys (111 occurrences across five
 * files), empty containers, quoted keys containing spaces, and the escape
 * doubling that makes the gpu-settings regexes survive.
 *
 * These assert the AST, not a downstream projection: a parser bug that is
 * silently repaired by a converter is exactly what this file is here to catch.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { assert as fcAssert, property, string } from "fast-check";
import { describe, expect, it } from "vitest";

import { canonicalJson } from "../canonical/json.js";
import type { PlistJson } from "../canonical/json.js";
import { formatContentError, isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "./parser.js";
import type { PlistDict, PlistValue } from "./plist-value.js";
import { dictToMap, getEntry, plistToJson } from "./plist-value.js";

const FIXTURES = join(process.cwd(), "tests", "fixtures", "plist");
const CONFIG_DIR = join(process.cwd(), "third_party", "oolite", "Config");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function asDict(value: PlistValue, context: string): PlistDict {
  if (value.kind !== "dict") {
    throw new Error(`${context}: expected a dict, got ${value.kind}`);
  }
  return value;
}

function valueOf(dict: PlistDict, key: string): PlistValue {
  const entry = getEntry(dict, key);
  if (entry === undefined) throw new Error(`missing key "${key}"`);
  return entry.value;
}

function asString(value: PlistValue, context: string): string {
  if (value.kind !== "string") {
    throw new Error(`${context}: expected a string, got ${value.kind}`);
  }
  return value.value;
}

/** Parse and require the throw to be a located `PLIST_PARSE` ContentError. */
function parseError(source: string, file = "inline:fixture"): ContentError {
  try {
    parseOpenStep(source, file);
  } catch (error) {
    if (isContentError(error) && error.code === "PLIST_PARSE") return error;
    throw error;
  }
  throw new Error("expected a PLIST_PARSE ContentError, but parsing succeeded");
}

describe("escape decoding", () => {
  it("decodes octal, C escapes and doubled backslashes exactly", () => {
    const dict = asDict(
      parseOpenStep(
        readFixture("octal-escapes.plist"),
        "tests/fixtures/plist/octal-escapes.plist",
      ),
      "octal-escapes",
    );

    expect(asString(valueOf(dict, "corporate"), "corporate")).toBe(
      "\u0007 - Corporate State",
    );
    expect(asString(valueOf(dict, "index"), "index")).toBe("\u0018");
    expect(asString(valueOf(dict, "backspace"), "backspace")).toBe("\b");
    expect(asString(valueOf(dict, "del"), "del")).toBe("\u007f");
    // `\\b5` is backslash + "b" + "5": a doubled backslash never becomes a
    // backspace, or the pinned GeForce regex would change meaning.
    expect(asString(valueOf(dict, "regex"), "regex")).toBe(
      "GeForce.*\\b5\\d{3}",
    );
  });

  it("treats an unknown escape as the literal character instead of throwing", () => {
    const dict = asDict(parseOpenStep('{ x = "\\q"; }', "inline:escape"), "x");
    expect(asString(valueOf(dict, "x"), "x")).toBe("q");
  });
});

describe("duplicate keys", () => {
  it("retains every entry in source order and resolves last-wins at lookup", () => {
    const dict = asDict(
      parseOpenStep(
        readFixture("duplicate-keys.plist"),
        "tests/fixtures/plist/duplicate-keys.plist",
      ),
      "duplicate-keys",
    );

    expect(dict.entries).toHaveLength(3);
    expect(dict.entries.map((entry) => entry.key)).toEqual([
      "same",
      "same",
      "same",
    ]);
    expect(
      dict.entries.map((entry) => asString(entry.value, "duplicate entry")),
    ).toEqual(["first", "second", "third"]);

    const map = dictToMap(dict);
    expect(map.size).toBe(1);
    const mapped = map.get("same");
    if (mapped === undefined) throw new Error("map lost the duplicate key");
    expect(asString(mapped, "map")).toBe("third");

    const resolved = getEntry(dict, "same");
    expect(resolved).toBe(dict.entries[2]);
    if (resolved === undefined) throw new Error("getEntry lost the duplicate");
    expect(asString(resolved.value, "entry")).toBe("third");
  });
});

describe("empty containers", () => {
  it("parses a comment-only array to an explicit empty array", () => {
    const root = parseOpenStep(
      readFixture("comment-only-array.plist"),
      "tests/fixtures/plist/comment-only-array.plist",
    );
    expect(root.kind).toBe("array");
    if (root.kind !== "array") return;
    expect(root.values).toEqual([]);
  });

  it("parses an empty dict to an explicit empty dictionary", () => {
    const root = parseOpenStep(
      readFixture("empty-dict.plist"),
      "tests/fixtures/plist/empty-dict.plist",
    );
    expect(root.kind).toBe("dict");
    if (root.kind !== "dict") return;
    expect(root.entries).toEqual([]);
  });

  it("parses an empty or fully commented-out file to an empty dictionary", () => {
    for (const source of ["", "// nothing here\n/* nor here */\n"]) {
      const root = parseOpenStep(source, "inline:empty");
      expect(root.kind).toBe("dict");
      if (root.kind !== "dict") continue;
      expect(root.entries).toEqual([]);
    }
  });
});

describe("quoted keys", () => {
  it("accepts a quoted key containing a space and finds it by key", () => {
    const dict = asDict(
      parseOpenStep(
        readFixture("quoted-key-with-space.plist"),
        "tests/fixtures/plist/quoted-key-with-space.plist",
      ),
      "quoted-key",
    );

    expect(getEntry(dict, "0 7")?.key).toBe("0 7");
    expect(getEntry(dict, "market_monitored")?.key).toBe("market_monitored");

    const nested = asDict(valueOf(dict, "0 7"), "0 7");
    expect(asString(valueOf(nested, "name"), "name")).toBe("Lave");

    const monitored = valueOf(dict, "market_monitored");
    expect(monitored.kind).toBe("bool");
    if (monitored.kind === "bool") expect(monitored.value).toBe(true);
  });
});

describe("bare-token classification", () => {
  it("resolves atoms, booleans, integers and reals in the documented order", () => {
    const dict = asDict(
      parseOpenStep(
        `{
          type = flasher;
          smooth = yes;
          hard = no;
          fifty = 50;
          exact = 50.0;
          negative = -3;
          dotLead = .5;
          plus = +5;
          exponent = 1e5;
        }`,
        "inline:bare",
      ),
      "bare",
    );

    expect(valueOf(dict, "type")).toMatchObject({
      kind: "string",
      value: "flasher",
    });
    expect(valueOf(dict, "smooth")).toMatchObject({
      kind: "bool",
      value: true,
    });
    expect(valueOf(dict, "hard")).toMatchObject({ kind: "bool", value: false });
    expect(valueOf(dict, "fifty")).toMatchObject({
      kind: "integer",
      value: 50,
    });
    expect(valueOf(dict, "exact")).toMatchObject({ kind: "real", value: 50 });
    expect(valueOf(dict, "negative")).toMatchObject({
      kind: "integer",
      value: -3,
    });
    // No `+` prefix, no exponent, no bare `.5`: each stays a string rather
    // than being coerced into a number the author did not write.
    expect(valueOf(dict, "dotLead")).toMatchObject({
      kind: "string",
      value: ".5",
    });
    expect(valueOf(dict, "plus")).toMatchObject({
      kind: "string",
      value: "+5",
    });
    expect(valueOf(dict, "exponent")).toMatchObject({
      kind: "string",
      value: "1e5",
    });
  });
});

describe("prototype safety", () => {
  it("keeps a __proto__ key as data and never touches a prototype", () => {
    const dict = asDict(
      parseOpenStep(
        '{ "__proto__" = "polluted"; constructor = "not-a-function"; }',
        "inline:proto",
      ),
      "proto",
    );

    expect(getEntry(dict, "__proto__")?.key).toBe("__proto__");
    expect(dictToMap(dict).get("__proto__")).toMatchObject({
      kind: "string",
      value: "polluted",
    });

    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
    expect(
      (Object.prototype as Record<string, unknown>)["polluted"],
    ).toBeUndefined();

    const json = plistToJson(dict);
    if (json === null || typeof json !== "object" || Array.isArray(json)) {
      throw new Error("expected an object projection");
    }
    expect(Object.keys(json)).toContain("__proto__");
    expect(Object.getPrototypeOf({})).toBe(Object.prototype);
  });
});

describe("structural failures", () => {
  it("rejects a raw newline inside a quoted string at the opening quote", () => {
    const error = parseError('{ name = "unterminated\n"; }', "inline:newline");
    expect(error.construct).toBe("string");
    expect(error.line).toBe(1);
    expect(error.column).toBe(10);
  });

  it("rejects two array values with no comma between them", () => {
    const error = parseError("( 1 2 )", "inline:array");
    expect(error.construct).toBe("array");
    expect(error.line).toBe(1);
    expect(error.column).toBe(5);
  });

  it("tolerates a trailing comma in an array", () => {
    const root = parseOpenStep("( 1, )", "inline:trailing");
    expect(root.kind).toBe("array");
    if (root.kind !== "array") return;
    expect(root.values).toHaveLength(1);
    expect(root.values[0]).toMatchObject({ kind: "integer", value: 1 });
  });

  it("reports a missing dictionary semicolon at the next key", () => {
    const error = parseError("{ a = 1 b = 2; }", "inline:semicolon");
    expect(error.construct).toBe('dict entry "a"');
    expect(error.line).toBe(1);
    expect(error.column).toBe(9);
  });

  it("caps nesting at 64 levels instead of overflowing the stack", () => {
    const deeplyNested = `${"(".repeat(65)}1${")".repeat(65)}`;
    const error = parseError(deeplyNested, "inline:deep");
    expect(error.construct).toBe("value");
  });
});

describe("vendored corpus", () => {
  it("parses all 40 Config plists with one parser, 31 dict roots and 9 array roots", () => {
    const files = readdirSync(CONFIG_DIR)
      .filter((name) => name.endsWith(".plist"))
      .sort();

    // Vacuity guard: a broken walk must fail rather than pass on a short list.
    expect(files).toHaveLength(40);

    const roots = new Map<string, PlistValue>();
    for (const name of files) {
      const source = readFileSync(join(CONFIG_DIR, name), "utf8");
      const relative = `third_party/oolite/Config/${name}`;
      try {
        roots.set(name, parseOpenStep(source, relative));
      } catch (error) {
        if (isContentError(error)) {
          // The per-file name is the whole value of a parse-all test: a
          // failure must say which vendored file broke, not just that one did.
          throw new Error(`${relative}: ${formatContentError(error)}`, {
            cause: error,
          });
        }
        throw error;
      }
    }

    const dicts = [...roots.values()].filter((root) => root.kind === "dict");
    const arrays = [...roots.values()].filter((root) => root.kind === "array");
    expect(dicts).toHaveLength(31);
    expect(arrays).toHaveLength(9);

    const gui = roots.get("gui-settings.plist");
    expect(gui?.kind).toBe("dict");
    if (gui?.kind === "dict") expect(gui.entries).toHaveLength(0);
  });
});

describe("total-function property", () => {
  it("returns a value or a located PLIST_PARSE error for arbitrary input", () => {
    fcAssert(
      property(string(), (source) => {
        try {
          parseOpenStep(source, "fixture:arbitrary");
          return true;
        } catch (error) {
          // A TypeError or RangeError escaping here is the failure mode this
          // property exists to catch: arbitrary bytes must never become a
          // crash the CLI cannot present as a content error.
          return isContentError(error) && error.code === "PLIST_PARSE";
        }
      }),
      { numRuns: 100 },
    );
  });
});

describe("canonical round-trip", () => {
  it("re-canonicalises every vendored plist to the same bytes", () => {
    const files = readdirSync(CONFIG_DIR)
      .filter((name) => name.endsWith(".plist"))
      .sort();
    expect(files).toHaveLength(40);

    for (const name of files) {
      const relative = `third_party/oolite/Config/${name}`;
      const source = readFileSync(join(CONFIG_DIR, name), "utf8");
      const first = canonicalJson(plistToJson(parseOpenStep(source, relative)));
      const reparsed = JSON.parse(first) as PlistJson;
      expect(canonicalJson(reparsed), relative).toBe(first);
    }
  });
});

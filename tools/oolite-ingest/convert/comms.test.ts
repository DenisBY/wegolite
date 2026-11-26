// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The comms strings compiler (DATA-17).
 *
 * The vendored `descriptions.plist` is parsed here with the existing OpenStep
 * reader. The closure over `[...]` references is recomputed in this file by a
 * second, deliberately different method (a recursive walk over the plist
 * text), so the converter's iterative closure is checked against an
 * independent one, and the committed generated file is compared with the
 * emitted bytes. The cycle, missing-key and refusal cases use synthetic
 * plists.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import type { PlistValue } from "../openstep/plist-value.js";
import { dictToMap } from "../openstep/plist-value.js";
import {
  COMMS_PATH,
  COMMS_ROOT_KEYS,
  COMMS_SOURCE_FILE,
  compileComms,
  emitComms,
} from "./comms.js";

const REPO = new URL("../../../", import.meta.url);

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

const vendored = parseOpenStep(readText(COMMS_SOURCE_FILE), COMMS_SOURCE_FILE);

function caught(run: () => unknown): ContentError {
  try {
    run();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a content error");
}

function synthetic(entries: string): PlistValue {
  const roots = COMMS_ROOT_KEYS.map((key) => `"${key}" = "x";`).join(" ");
  return parseOpenStep(`{ ${roots} ${entries} }`, "test.plist");
}

/** The authored text(s) of a plist value, or undefined for another kind. */
function textsOf(value: PlistValue | undefined): string[] | undefined {
  if (value?.kind === "string") return [value.value];
  if (value?.kind === "array") {
    return value.values.flatMap((item) =>
      item.kind === "string" ? [item.value] : [],
    );
  }
  return undefined;
}

/** The independent closure: a recursive walk, not the converter's queue. */
function closureKeys(plist: PlistValue): Set<string> {
  if (plist.kind !== "dict") throw new Error("not a dictionary");
  const dictionary = dictToMap(plist);
  const reached = new Set<string>();
  const walk = (key: string): void => {
    if (reached.has(key)) return;
    reached.add(key);
    for (const text of textsOf(dictionary.get(key)) ?? []) {
      for (const name of text.match(/\[[^[\]]+\]/g) ?? []) {
        const inner = name.slice(1, -1);
        // A digit-only key indexes system_description, never a description key.
        if (/^[0-9]+$/.test(inner)) continue;
        if (dictionary.has(inner)) walk(inner);
      }
    }
  };
  for (const root of COMMS_ROOT_KEYS) walk(root);
  return reached;
}

describe("COMMS_ROOT_KEYS", () => {
  it("lists the ten oolite-comms keys in the plist's order", () => {
    expect(COMMS_ROOT_KEYS).toHaveLength(10);
    expect(new Set(COMMS_ROOT_KEYS).size).toBe(10);
    if (vendored.kind !== "dict") throw new Error("not a dictionary");
    const inPlist = vendored.entries
      .map((entry) => entry.key)
      .filter((key) => key.startsWith("oolite-comms-"));
    expect(inPlist).toEqual([...COMMS_ROOT_KEYS]);
  });
});

describe("compileComms", () => {
  it("holds the ten roots and every key they reach, and nothing else", () => {
    const comms = compileComms(vendored);
    const keys = comms.entries.map((entry) => entry.key);

    expect(new Set(keys)).toEqual(closureKeys(vendored));
    for (const key of COMMS_ROOT_KEYS) expect(keys, key).toContain(key);
    for (const key of [
      "beg-for-mercy",
      "distress-call",
      "police-attack-warning",
      "describe-pirate",
      "describe-Pirate",
    ]) {
      expect(keys, key).toContain(key);
    }
    expect(keys).toHaveLength(15);
    expect(keys).toEqual([...keys].sort());
  });

  it("keeps every value verbatim, a string or the authored list", () => {
    if (vendored.kind !== "dict") throw new Error("not a dictionary");
    const dictionary = dictToMap(vendored);
    for (const entry of compileComms(vendored).entries) {
      const authored = textsOf(dictionary.get(entry.key));
      expect(authored, entry.key).toBeDefined();
      if (typeof entry.value === "string") {
        expect([entry.value], entry.key).toEqual(authored);
        expect(dictionary.get(entry.key)?.kind, entry.key).toBe("string");
      } else {
        expect(entry.value, entry.key).toEqual(authored);
        expect(dictionary.get(entry.key)?.kind, entry.key).toBe("array");
      }
    }
  });

  it("leaves no reachable key missing: every token is an entry, an index or a variable", () => {
    if (vendored.kind !== "dict") throw new Error("not a dictionary");
    const dictionary = dictToMap(vendored);
    const comms = compileComms(vendored);
    const keys = new Set(comms.entries.map((entry) => entry.key));
    const variables = new Set(comms.variables);
    const indexes = new Set(comms.descriptionIndexes);

    for (const entry of comms.entries) {
      const texts =
        typeof entry.value === "string" ? [entry.value] : entry.value;
      for (const text of texts) {
        for (const token of text.match(/\[[^[\]]+\]/g) ?? []) {
          const name = token.slice(1, -1);
          if (/^[0-9]+$/.test(name)) {
            expect(indexes.has(Number(name)), `${entry.key}: ${token}`).toBe(
              true,
            );
            expect(variables.has(token), `${entry.key}: ${token}`).toBe(false);
          } else if (dictionary.has(name)) {
            expect(keys.has(name), `${entry.key}: ${token}`).toBe(true);
          } else {
            expect(variables.has(token), `${entry.key}: ${token}`).toBe(true);
          }
        }
        for (const token of text.match(/%[A-Za-z]/g) ?? []) {
          expect(variables.has(token), `${entry.key}: ${token}`).toBe(true);
        }
      }
    }
  });

  it("lists the runtime variables and never follows them", () => {
    const comms = compileComms(vendored);
    expect(comms.variables).toEqual([
      "%H",
      "%R",
      "[oolite_demandSize]",
      "[oolite_entityName]",
    ]);
    const keys = comms.entries.map((entry) => entry.key);
    expect(keys).not.toContain("oolite_entityName");
    expect(keys).not.toContain("7");
  });

  it("lists the digit key [7] as a system_description index, not a variable (TOOLS-WR-03)", () => {
    const comms = compileComms(vendored);
    // distress-call: "We are [7] by [describe-pirate]s! Please help!"
    expect(comms.descriptionIndexes).toEqual([7]);
    expect(comms.variables).not.toContain("[7]");
    if (vendored.kind !== "dict") throw new Error("not a dictionary");
    const rows = dictToMap(vendored).get("system_description");
    if (rows?.kind !== "array") throw new Error("no system_description");
    expect(textsOf(rows.values[7])).toEqual([
      "beset",
      "plagued",
      "ravaged",
      "cursed",
      "scourged",
    ]);
  });

  it("classifies a digit key before the key lookup, as Oolite's ExpandKey does", () => {
    const comms = compileComms(
      synthetic(
        '"system_description" = ( ( "a" ), ( "b" ) ); "1" = "trap"; ' +
          '"oolite-comms-contractAttack" = "x [1] [01] [0]";',
      ),
    );
    expect(comms.descriptionIndexes).toEqual([0, 1]);
    expect(comms.variables).toEqual([]);
    expect(comms.entries.map((entry) => entry.key)).not.toContain("1");
  });

  it("refuses a digit key that names no system_description row", () => {
    const outOfRange = caught(() =>
      compileComms(
        synthetic(
          '"system_description" = ( ( "a" ) ); ' +
            '"oolite-comms-contractAttack" = "x [1]";',
        ),
      ),
    );
    expect(outOfRange.code).toBe("SCHEMA");
    expect(outOfRange.construct).toBe("oolite-comms-contractAttack");

    const noTable = caught(() =>
      compileComms(synthetic('"oolite-comms-contractAttack" = "x [0]";')),
    );
    expect(noTable.construct).toBe("oolite-comms-contractAttack");
  });

  it("refuses a digit key with an operator, which the subset cannot carry", () => {
    const error = caught(() =>
      compileComms(
        synthetic(
          '"system_description" = ( ( "a" ) ); ' +
            '"oolite-comms-contractAttack" = "x [0|capitalize]";',
        ),
      ),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("oolite-comms-contractAttack");
  });

  it("follows a two-key reference cycle once each without looping", () => {
    const comms = compileComms(
      synthetic(
        '"a" = "see [b]"; "b" = ( "see [a]", "and [%H] %H" ); ' +
          '"oolite-comms-contractAttack" = "[a]";',
      ),
    );
    const keys = comms.entries.map((entry) => entry.key);
    expect(keys.filter((key) => key === "a")).toHaveLength(1);
    expect(keys.filter((key) => key === "b")).toHaveLength(1);
    expect(comms.variables).toEqual(["%H", "[%H]"]);
  });

  it("follows a key that refers to itself once", () => {
    const comms = compileComms(
      synthetic('"s" = "again [s]"; "oolite-comms-contractAttack" = "[s]";'),
    );
    expect(comms.entries.map((entry) => entry.key)).toContain("s");
  });

  it("lists a referenced token that is not a plist key as a variable", () => {
    const comms = compileComms(
      synthetic('"oolite-comms-contractAttack" = "hello [nobody]";'),
    );
    expect(comms.entries.map((entry) => entry.key)).not.toContain("nobody");
    expect(comms.variables).toEqual(["[nobody]"]);
  });

  it("refuses a missing root key, naming it", () => {
    const error = caught(() =>
      compileComms(parseOpenStep('{ "x" = "y"; }', "t")),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe(COMMS_ROOT_KEYS[0]);
  });

  it("refuses a reached value that is not a string or a list of strings", () => {
    const dict = caught(() =>
      compileComms(
        synthetic('"d" = { a = "b"; }; "oolite-comms-contractAttack" = "[d]";'),
      ),
    );
    expect(dict.code).toBe("SCHEMA");
    expect(dict.construct).toBe("d");

    const mixed = caught(() =>
      compileComms(
        synthetic('"m" = ( "a", 3 ); "oolite-comms-contractAttack" = "[m]";'),
      ),
    );
    expect(mixed.code).toBe("SCHEMA");
    expect(mixed.construct).toBe("m.1");

    const number = caught(() =>
      compileComms(synthetic('"oolite-comms-contractAttack" = 3;')),
    );
    expect(number.construct).toBe("oolite-comms-contractAttack");
  });

  it("does not compile a key no root reaches", () => {
    const comms = compileComms(synthetic('"orphan" = "text";'));
    expect(comms.entries.map((entry) => entry.key)).not.toContain("orphan");
  });

  it("refuses an over-long string through the schema", () => {
    const error = caught(() =>
      compileComms(
        synthetic(`"oolite-comms-contractAttack" = "${"x".repeat(513)}";`),
      ),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("oolite-comms-contractAttack");
  });
});

describe("emitComms", () => {
  it("emits the committed generated file byte for byte", () => {
    const emitted = emitComms(vendored);
    expect(emitted.path).toBe(COMMS_PATH);
    expect(Buffer.from(emitted.bytes).toString("utf8")).toBe(
      readText(COMMS_PATH),
    );
  });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The role category compiler (DATA-17).
 *
 * The vendored plist is parsed here with the existing OpenStep reader and
 * compared, category by category, with the compiled table and with the
 * committed generated file. The refusal cases use hand-written plists.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import {
  ROLE_CATEGORIES_PATH,
  ROLE_CATEGORIES_SOURCE_FILE,
  compileRoleCategories,
  emitRoleCategories,
} from "./role-categories.js";

const REPO = new URL("../../../", import.meta.url);

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

const vendored = parseOpenStep(
  readText(ROLE_CATEGORIES_SOURCE_FILE),
  ROLE_CATEGORIES_SOURCE_FILE,
);

function caught(run: () => unknown): ContentError {
  try {
    run();
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error("expected a content error");
}

function compile(source: string): ReturnType<typeof compileRoleCategories> {
  return compileRoleCategories(parseOpenStep(source, "test.plist"));
}

describe("compileRoleCategories", () => {
  it("compiles every category of the vendored plist, roles in authored order", () => {
    if (vendored.kind !== "dict") throw new Error("not a dictionary");
    const table = compileRoleCategories(vendored);
    expect(table).toHaveLength(vendored.entries.length);
    expect(table).toHaveLength(16);

    for (const entry of vendored.entries) {
      if (entry.value.kind !== "array") throw new Error("not an array");
      const roles = entry.value.values.map((role) => {
        if (role.kind !== "string") throw new Error("not a string");
        return role.value;
      });
      expect(
        table.find((candidate) => candidate.category === entry.key)?.roles,
        entry.key,
      ).toEqual(roles);
    }
  });

  it("orders the categories by code unit", () => {
    const categories = compileRoleCategories(vendored).map(
      (entry) => entry.category,
    );
    expect(categories).toEqual([...categories].sort());
  });

  it("lists the roles pirates hunt, and keeps `+` and upper-case roles verbatim", () => {
    const table = new Map(
      compileRoleCategories(vendored).map((entry) => [
        entry.category,
        entry.roles,
      ]),
    );
    const victims = table.get("oolite-pirate-victim") ?? [];
    for (const role of [
      "player-unknown",
      "trader",
      "trader-smuggler",
      "shuttle",
    ]) {
      expect(victims, role).toContain(role);
    }
    expect(table.get("oolite-trader")).toContain("trader-courier+");
    expect(table.get("oolite-escort")).toContain("EQ_THARGON");
  });

  it("compiles a category with an empty role list to an empty array", () => {
    expect(compile('{ "empty" = ( ); "full" = ( "a" ); }')).toEqual([
      { category: "empty", roles: [] },
      { category: "full", roles: ["a"] },
    ]);
  });

  it("accepts a trailing comma in a role list, as the vendored plist has", () => {
    expect(compile('{ "c" = ( "a", "b", ); }')).toEqual([
      { category: "c", roles: ["a", "b"] },
    ]);
  });

  it("refuses a value that is not an array, naming the category", () => {
    const error = caught(() => compile('{ "c" = "a"; }'));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("c");
  });

  it("refuses a role that is not a string, naming category and index", () => {
    const error = caught(() => compile('{ "c" = ( "a", 3 ); }'));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("c.1");
  });

  it("refuses a repeated category", () => {
    const error = caught(() => compile('{ "c" = ( ); "c" = ( "a" ); }'));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("c");
  });

  it("refuses a role outside the documented pattern", () => {
    for (const role of ["", "a b", "+a", "a++", "a/b", "__proto__x\\n"]) {
      const error = caught(() => compile(`{ "c" = ( "${role}" ); }`));
      expect(error.code, role).toBe("SCHEMA");
      expect(error.construct, role).toBe("c.0");
    }
  });

  it("refuses a prototype-named category", () => {
    const error = caught(() => compile('{ "__proto__" = ( "a" ); }'));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("__proto__");
  });

  it("refuses a top level that is not a dictionary", () => {
    expect(caught(() => compile('( "a" )')).code).toBe("SCHEMA");
  });
});

describe("emitRoleCategories", () => {
  it("emits the committed generated file byte for byte", () => {
    const emitted = emitRoleCategories(vendored);
    expect(emitted.path).toBe(ROLE_CATEGORIES_PATH);
    expect(Buffer.from(emitted.bytes).toString("utf8")).toBe(
      readText(ROLE_CATEGORIES_PATH),
    );
  });
});

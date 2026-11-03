// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The failure contract, asserted per class (D-17, D-18, D-19, T-02-13).
 *
 * A malformed file must become one structured `ContentError` with a stable
 * `code`, a repository-relative `file`, the offending `construct`, and — for
 * textual failures — the 1-based line and column. The excerpt is bounded to 120
 * characters, whitespace-collapsed to a single line, and never carries the
 * container or host path.
 *
 * `SCHEMA` is the second class that exists at this point in the phase: a strict
 * `CommoditySchema` rejection becomes a dotted construct path and deliberately
 * has no line or column, because the record is not authored text.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { ZodIssue } from "zod";

import { CommoditySchema } from "../../src/content/schemas/commodity.js";
import {
  contentError,
  formatContentError,
  isContentError,
} from "./content-error.js";
import type { ContentError } from "./content-error.js";
import { parseOpenStep } from "./openstep/parser.js";

interface InvalidRecord {
  readonly key: string;
  readonly [field: string]: unknown;
}

interface InvalidFixture {
  readonly commodities: readonly InvalidRecord[];
}

const PLIST_DIR = join(process.cwd(), "tests", "fixtures", "plist");
const SCHEMA_FIXTURE = "tests/fixtures/schemas/commodity-invalid.json";

function readFixture(name: string): string {
  return readFileSync(join(PLIST_DIR, name), "utf8");
}

function captureParseError(source: string, file: string): ContentError {
  try {
    parseOpenStep(source, file);
  } catch (error) {
    if (isContentError(error)) return error;
    throw error;
  }
  throw new Error(
    `expected a ContentError from ${file}, but parsing succeeded`,
  );
}

function expectSafeExcerpt(excerpt: string): void {
  expect(excerpt.length).toBeLessThanOrEqual(120);
  expect(excerpt).not.toMatch(/[\r\n]/);
  expect(excerpt).not.toContain("/home/");
  expect(excerpt).not.toContain("/app/");
}

const invalidFixture = JSON.parse(
  readFileSync(join(process.cwd(), SCHEMA_FIXTURE), "utf8"),
) as InvalidFixture;

function firstIssue(key: string): ZodIssue {
  const record = invalidFixture.commodities.find((item) => item.key === key);
  if (record === undefined)
    throw new Error(`fixture record "${key}" is missing`);

  const result = CommoditySchema.safeParse(record);
  if (result.success) {
    throw new Error(`fixture record "${key}" unexpectedly passed the schema`);
  }
  const issue = result.error.issues[0];
  if (issue === undefined)
    throw new Error("the schema failure carried no issue");
  return issue;
}

function schemaErrorFor(key: string): ContentError {
  const issue = firstIssue(key);
  const field =
    issue.code === "unrecognized_keys"
      ? issue.keys[0]
      : issue.path.map(String).join(".");
  if (field === undefined || field === "") {
    throw new Error(`schema issue for "${key}" has no field path`);
  }
  return contentError("SCHEMA", SCHEMA_FIXTURE, `commodities.${key}.${field}`);
}

describe("PLIST_PARSE", () => {
  it("reports an unterminated string at the opening quote", () => {
    const file = "tests/fixtures/plist/malformed-unterminated.plist";
    const error = captureParseError(
      readFixture("malformed-unterminated.plist"),
      file,
    );

    expect(error.code).toBe("PLIST_PARSE");
    expect(error.file).toBe(file);
    expect(error.construct).toBe("string");
    expect(error.line).toBe(2);
    expect(error.column).toBe(10);
    expectSafeExcerpt(error.excerpt);
  });

  it("reports a missing dictionary semicolon at the next key", () => {
    const file = "tests/fixtures/plist/malformed-missing-semicolon.plist";
    const error = captureParseError(
      readFixture("malformed-missing-semicolon.plist"),
      file,
    );

    expect(error.code).toBe("PLIST_PARSE");
    expect(error.file).toBe(file);
    expect(error.construct).toBe('dict entry "a"');
    expect(error.line).toBe(1);
    expect(error.column).toBe(9);
    expectSafeExcerpt(error.excerpt);
  });

  it("renders CODE file:line:column construct — excerpt", () => {
    const file = "tests/fixtures/plist/malformed-unterminated.plist";
    const error = captureParseError(
      readFixture("malformed-unterminated.plist"),
      file,
    );

    expect(formatContentError(error)).toMatch(
      /^PLIST_PARSE tests\/fixtures\/plist\/malformed-unterminated\.plist:2:10 string — /,
    );
  });
});

describe("SCHEMA", () => {
  it("rejects an unknown field with a dotted construct path and no position", () => {
    const error = schemaErrorFor("bad_field");

    expect(error.code).toBe("SCHEMA");
    expect(error.file).toBe(SCHEMA_FIXTURE);
    expect(error.construct).toBe("commodities.bad_field.unexpectedField");
    expect(error.construct).toMatch(/^commodities\.[a-z_]+\.[A-Za-z]+$/);
    expect(error.line).toBeUndefined();
    expect(error.column).toBeUndefined();
    // Absent means the property does not exist, not that it holds `undefined`.
    expect(Object.hasOwn(error, "line")).toBe(false);
    expect(Object.hasOwn(error, "column")).toBe(false);
    expectSafeExcerpt(error.excerpt);
  });

  it("rejects a string priceAverage and names the field", () => {
    const error = schemaErrorFor("bad_price");

    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("commodities.bad_price.priceAverage");
    expect(error.line).toBeUndefined();
    expect(error.column).toBeUndefined();
    expect(formatContentError(error)).toMatch(
      /^SCHEMA tests\/fixtures\/schemas\/commodity-invalid\.json commodities\.bad_price\.priceAverage — /,
    );
    expect(formatContentError(error)).not.toMatch(/commodity-invalid\.json:\d/);
  });
});

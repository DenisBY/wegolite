// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The role-to-AI table compiler (DATA-17).
 *
 * The vendored plist is parsed here with the existing OpenStep reader and
 * compared, entry by entry, with the compiled table and with the committed
 * generated file, so a drift in either fails. The refusal cases use
 * hand-written plists.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isContentError } from "../content-error.js";
import type { ContentError } from "../content-error.js";
import { parseOpenStep } from "../openstep/parser.js";
import {
  AUTO_AI_MAP_PATH,
  AUTO_AI_MAP_SOURCE_FILE,
  compileAutoAiMap,
  emitAutoAiMap,
} from "./auto-ai-map.js";

const REPO = new URL("../../../", import.meta.url);

function readText(relative: string): string {
  return readFileSync(new URL(relative, REPO), "utf8");
}

const vendored = parseOpenStep(
  readText(AUTO_AI_MAP_SOURCE_FILE),
  AUTO_AI_MAP_SOURCE_FILE,
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

function compile(source: string): ReturnType<typeof compileAutoAiMap> {
  return compileAutoAiMap(parseOpenStep(source, "test.plist"));
}

describe("compileAutoAiMap", () => {
  it("compiles every role of the vendored plist, 27 at the pin", () => {
    const expected: { role: string; ai: string }[] = [];
    if (vendored.kind !== "dict") throw new Error("not a dictionary");
    for (const entry of vendored.entries) {
      if (entry.value.kind !== "string") throw new Error("not a string");
      expected.push({ role: entry.key, ai: entry.value.value });
    }
    expected.sort((left, right) =>
      left.role < right.role ? -1 : left.role > right.role ? 1 : 0,
    );

    const table = compileAutoAiMap(vendored);
    expect(table).toHaveLength(27);
    expect(table).toEqual(expected);
  });

  it("maps the roles the populator relies on to Oolite's AI files", () => {
    const table = new Map(
      compileAutoAiMap(vendored).map((entry) => [entry.role, entry.ai]),
    );
    expect(table.get("pirate")).toBe("oolite-pirateAI.js");
    expect(table.get("trader")).toBe("oolite-traderAI.js");
    expect(table.get("police")).toBe("oolite-policeAI.js");
    expect(table.get("interceptor")).toBe("oolite-policeAI.js");
    expect(table.get("wingman")).toBe("oolite-policeAI.js");
    expect(table.get("hunter-medium")).toBe("oolite-bountyHunterLeaderAI.js");
    expect(table.get("asteroid")).toBe("dumbAI.plist");
  });

  it("orders the entries by code unit, not by authored order", () => {
    // The plist lists "scavenger" after "trader-smuggler".
    const roles = compileAutoAiMap(vendored).map((entry) => entry.role);
    expect(roles).toEqual([...roles].sort());
    expect(roles.indexOf("scavenger")).toBeLessThan(roles.indexOf("trader"));
  });

  it("refuses a value that is not a string, naming the role", () => {
    const error = caught(() => compile('{ "pirate" = 7; }'));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("pirate");
  });

  it("refuses a repeated role", () => {
    const error = caught(() =>
      compile('{ "pirate" = "a.js"; "pirate" = "b.js"; }'),
    );
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("pirate");
  });

  it("refuses a top level that is not a dictionary", () => {
    expect(caught(() => compile('( "pirate" )')).code).toBe("SCHEMA");
  });

  it("refuses a role or an AI file outside the documented patterns", () => {
    expect(caught(() => compile('{ "Pirate" = "a.js"; }')).construct).toBe(
      "Pirate",
    );
    expect(caught(() => compile('{ "pirate" = "../a.js"; }')).construct).toBe(
      "pirate",
    );
    expect(caught(() => compile('{ "pirate" = "a.txt"; }')).code).toBe(
      "SCHEMA",
    );
  });

  it("refuses a prototype-named role instead of keying an object by it", () => {
    // T-21-15: the pattern refuses `__proto__`, and the table is an entry
    // array, so the name could not reach a prototype in any case.
    const error = caught(() => compile('{ "__proto__" = "a.js"; }'));
    expect(error.code).toBe("SCHEMA");
    expect(error.construct).toBe("__proto__");
  });
});

describe("emitAutoAiMap", () => {
  it("emits the committed generated file byte for byte", () => {
    const emitted = emitAutoAiMap(vendored);
    expect(emitted.path).toBe(AUTO_AI_MAP_PATH);
    expect(Buffer.from(emitted.bytes).toString("utf8")).toBe(
      readText(AUTO_AI_MAP_PATH),
    );
  });
});

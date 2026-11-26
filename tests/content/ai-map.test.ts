// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The compiled Oolite role tables (DATA-17): the role-to-AI map.
 *
 * Each generated file is validated with its strict schema and compared with a
 * golden and, entry by entry, with the vendored plist parsed independently by
 * the OpenStep reader. Nothing at run time imports these files in Phase 21
 * (the populator and the priority AI of Phases 22 and 23 are their first
 * consumers), so a guard below fails if a source file starts to.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  AUTO_AI_FILE_PATTERN,
  AUTO_AI_ROLE_PATTERN,
  AutoAiMapSchema,
  MAX_AUTO_AI_ENTRIES,
} from "../../src/content/schemas/auto-ai-map.js";
import { parseOpenStep } from "../../tools/oolite-ingest/openstep/parser.js";

const REPO_ROOT = process.cwd();

function readText(relative: string): string {
  return readFileSync(join(REPO_ROOT, relative), "utf8");
}

function sourceFiles(directory: string, found: string[] = []): string[] {
  for (const entry of readdirSync(join(REPO_ROOT, directory), {
    withFileTypes: true,
  })) {
    // Skip the guard probes tests/guards/ writes into src/sim while it runs.
    if (entry.name.startsWith("__purity_")) continue;
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      if (relative === "src/content/generated") continue;
      sourceFiles(relative, found);
    } else if (/\.tsx?$/.test(entry.name)) {
      found.push(relative);
    }
  }
  return found;
}

describe("the compiled role tables are content only", () => {
  it("are not imported by any source file in this phase", () => {
    const importers = sourceFiles("src").filter((file) =>
      /generated\/(auto-ai-map|role-categories|comms)\.json/.test(
        readText(file),
      ),
    );
    expect(importers).toEqual([]);
  });
});

describe("auto-ai-map.json", () => {
  const GENERATED = "src/content/generated/auto-ai-map.json";
  const GOLDEN = "tests/golden/content/auto-ai-map.json";
  const SOURCE = "third_party/oolite/Config/autoAImap.plist";

  const generated: unknown = JSON.parse(readText(GENERATED));
  const entries = generated as { role: string; ai: string }[];

  it("passes the strict schema", () => {
    expect(AutoAiMapSchema.safeParse(generated).success).toBe(true);
  });

  it("equals the golden", () => {
    expect(generated).toEqual(JSON.parse(readText(GOLDEN)));
  });

  it("equals the vendored plist, entry by entry", () => {
    const plist = parseOpenStep(readText(SOURCE), SOURCE);
    if (plist.kind !== "dict") throw new Error("not a dictionary");
    expect(entries).toHaveLength(plist.entries.length);
    for (const entry of plist.entries) {
      if (entry.value.kind !== "string") throw new Error("not a string");
      expect(
        entries.find((candidate) => candidate.role === entry.key)?.ai,
        entry.key,
      ).toBe(entry.value.value);
    }
  });

  it("holds 27 entries at the pin", () => {
    expect(entries).toHaveLength(27);
  });

  it("holds the roles the AI files of Phase 23 are chosen by", () => {
    const find = (role: string): string | undefined =>
      entries.find((entry) => entry.role === role)?.ai;
    expect(find("pirate")).toBe("oolite-pirateAI.js");
    expect(find("trader")).toBe("oolite-traderAI.js");
    expect(find("police")).toBe("oolite-policeAI.js");
    expect(find("hunter-medium")).toBe("oolite-bountyHunterLeaderAI.js");
  });
});

describe("AutoAiMapSchema", () => {
  const base = [
    { role: "pirate", ai: "oolite-pirateAI.js" },
    { role: "trader", ai: "oolite-traderAI.js" },
  ];
  const accepts = (value: unknown): boolean =>
    AutoAiMapSchema.safeParse(value).success;

  it("accepts a small well-formed table", () => {
    expect(accepts(base)).toBe(true);
  });

  it("refuses an extra key in an entry", () => {
    expect(accepts([{ ...base[0], weight: 1 }])).toBe(false);
  });

  it("refuses a duplicate role", () => {
    expect(accepts([base[0], base[0]])).toBe(false);
  });

  it("refuses entries out of code-unit order", () => {
    expect(accepts([base[1], base[0]])).toBe(false);
  });

  it("refuses an empty role and a role outside the pattern", () => {
    for (const role of ["", "Pirate", "pirate_x", "__proto__", "-a", "a b"]) {
      expect(accepts([{ role, ai: "a.js" }]), role).toBe(false);
      expect(AUTO_AI_ROLE_PATTERN.test(role), role).toBe(false);
    }
  });

  it("refuses an AI file with a directory part or another extension", () => {
    for (const ai of ["../a.js", "a/b.js", "a.txt", "a", ".js", ""]) {
      expect(accepts([{ role: "pirate", ai }]), ai).toBe(false);
      expect(AUTO_AI_FILE_PATTERN.test(ai), ai).toBe(false);
    }
  });

  it("refuses an empty table and one above the bound", () => {
    expect(accepts([])).toBe(false);
    const many = Array.from(
      { length: MAX_AUTO_AI_ENTRIES + 1 },
      (_, index) => ({
        role: `r${String(index).padStart(3, "0")}`,
        ai: "a.js",
      }),
    );
    expect(accepts(many)).toBe(false);
  });
});

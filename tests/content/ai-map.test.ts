// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The compiled Oolite role tables (DATA-17): the role-to-AI map, the role
 * categories and the comms strings.
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
import {
  COMMS_KEY_PATTERN,
  COMMS_VARIABLE_PATTERN,
  CommsStringsSchema,
  MAX_COMMS_TEXT_LENGTH,
} from "../../src/content/schemas/comms.js";
import {
  MAX_ROLES_PER_CATEGORY,
  ROLE_CATEGORY_PATTERN,
  ROLE_PATTERN,
  RoleCategoriesSchema,
} from "../../src/content/schemas/role-categories.js";
import { COMMS_ROOT_KEYS } from "../../tools/oolite-ingest/convert/comms.js";
import { dictToMap } from "../../tools/oolite-ingest/openstep/plist-value.js";
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

describe("role-categories.json", () => {
  const GENERATED = "src/content/generated/role-categories.json";
  const GOLDEN = "tests/golden/content/role-categories.json";
  const SOURCE = "third_party/oolite/Config/role-categories.plist";

  const generated: unknown = JSON.parse(readText(GENERATED));
  const entries = generated as { category: string; roles: string[] }[];

  it("passes the strict schema", () => {
    expect(RoleCategoriesSchema.safeParse(generated).success).toBe(true);
  });

  it("equals the golden", () => {
    expect(generated).toEqual(JSON.parse(readText(GOLDEN)));
  });

  it("equals the vendored plist, category by category, in authored order", () => {
    const plist = parseOpenStep(readText(SOURCE), SOURCE);
    if (plist.kind !== "dict") throw new Error("not a dictionary");
    expect(entries).toHaveLength(plist.entries.length);
    for (const entry of plist.entries) {
      if (entry.value.kind !== "array") throw new Error("not an array");
      const roles = entry.value.values.map((role) => {
        if (role.kind !== "string") throw new Error("not a string");
        return role.value;
      });
      expect(
        entries.find((candidate) => candidate.category === entry.key)?.roles,
        entry.key,
      ).toEqual(roles);
    }
  });

  it("holds 16 categories at the pin", () => {
    expect(entries).toHaveLength(16);
  });

  it("holds the pirate-victim roles and keeps `+` and upper-case roles verbatim", () => {
    const find = (category: string): string[] | undefined =>
      entries.find((entry) => entry.category === category)?.roles;
    for (const role of [
      "player-unknown",
      "trader",
      "trader-smuggler",
      "shuttle",
    ]) {
      expect(find("oolite-pirate-victim"), role).toContain(role);
    }
    expect(find("oolite-courier")).toContain("trader-courier+");
    expect(find("oolite-escort")).toContain("EQ_THARGON");
  });
});

describe("RoleCategoriesSchema", () => {
  const base = [
    { category: "a-list", roles: ["trader", "trader-courier+"] },
    { category: "b-list", roles: [] },
  ];
  const accepts = (value: unknown): boolean =>
    RoleCategoriesSchema.safeParse(value).success;

  it("accepts a small table, an empty role list and an authored `+` or upper case", () => {
    expect(accepts(base)).toBe(true);
    expect(accepts([{ category: "c", roles: ["EQ_THARGON"] }])).toBe(true);
  });

  it("refuses an extra key", () => {
    expect(accepts([{ ...base[0], note: "x" }])).toBe(false);
  });

  it("refuses a duplicate category and out-of-order categories", () => {
    expect(accepts([base[0], base[0]])).toBe(false);
    expect(accepts([base[1], base[0]])).toBe(false);
  });

  it("refuses a category outside the pattern", () => {
    for (const category of ["", "A", "a_b", "__proto__", "-a", "a b"]) {
      expect(accepts([{ category, roles: [] }]), category).toBe(false);
      expect(ROLE_CATEGORY_PATTERN.test(category), category).toBe(false);
    }
  });

  it("refuses a role outside the pattern", () => {
    for (const role of ["", "+a", "a++", "a b", "a/b", "_a", "a+b"]) {
      expect(accepts([{ category: "c", roles: [role] }]), role).toBe(false);
      expect(ROLE_PATTERN.test(role), role).toBe(false);
    }
  });

  it("refuses an empty table, a non-array role list and an over-long list", () => {
    expect(accepts([])).toBe(false);
    expect(accepts([{ category: "c", roles: "trader" }])).toBe(false);
    const many = Array.from({ length: MAX_ROLES_PER_CATEGORY + 1 }, () => "a");
    expect(accepts([{ category: "c", roles: many }])).toBe(false);
  });
});

describe("comms.json", () => {
  const GENERATED = "src/content/generated/comms.json";
  const GOLDEN = "tests/golden/content/comms.json";
  const SOURCE = "third_party/oolite/Config/descriptions.plist";

  const generated: unknown = JSON.parse(readText(GENERATED));
  const comms = generated as {
    entries: { key: string; value: string | string[] }[];
    variables: string[];
  };

  it("passes the strict schema", () => {
    expect(CommsStringsSchema.safeParse(generated).success).toBe(true);
  });

  it("equals the golden", () => {
    expect(generated).toEqual(JSON.parse(readText(GOLDEN)));
  });

  it("holds the ten oolite-comms keys, each verbatim from the vendored plist", () => {
    const plist = parseOpenStep(readText(SOURCE), SOURCE);
    if (plist.kind !== "dict") throw new Error("not a dictionary");
    const dictionary = dictToMap(plist);
    for (const key of COMMS_ROOT_KEYS) {
      const entry = comms.entries.find((candidate) => candidate.key === key);
      const authored = dictionary.get(key);
      expect(entry, key).toBeDefined();
      if (authored?.kind === "string") {
        expect(entry?.value, key).toBe(authored.value);
      } else if (authored?.kind === "array") {
        expect(entry?.value, key).toEqual(
          authored.values.map((item) =>
            item.kind === "string" ? item.value : undefined,
          ),
        );
      } else {
        throw new Error(`${key} is neither a string nor a list`);
      }
    }
  });

  it("holds every key the ten reach, and a referenced plist key is never missing", () => {
    const plist = parseOpenStep(readText(SOURCE), SOURCE);
    if (plist.kind !== "dict") throw new Error("not a dictionary");
    const dictionary = dictToMap(plist);
    const keys = new Set(comms.entries.map((entry) => entry.key));
    for (const key of [
      "beg-for-mercy",
      "distress-call",
      "police-attack-warning",
      "describe-pirate",
      "describe-Pirate",
    ]) {
      expect(keys.has(key), key).toBe(true);
    }
    for (const entry of comms.entries) {
      const texts =
        typeof entry.value === "string" ? [entry.value] : entry.value;
      for (const token of texts.flatMap(
        (text) => text.match(/\[[^[\]]+\]/g) ?? [],
      )) {
        const name = token.slice(1, -1);
        if (dictionary.has(name)) {
          expect(keys.has(name), `${entry.key}: ${token}`).toBe(true);
        } else {
          expect(comms.variables, `${entry.key}: ${token}`).toContain(token);
        }
      }
    }
  });

  it("lists the runtime variables, not description keys", () => {
    expect(comms.variables).toEqual([
      "%H",
      "%R",
      "[7]",
      "[oolite_demandSize]",
      "[oolite_entityName]",
    ]);
  });
});

describe("CommsStringsSchema", () => {
  const base = {
    entries: [
      { key: "a", value: "hello [b]" },
      { key: "b", value: ["x", "y"] },
    ],
    variables: ["%H", "[who]"],
  };
  const accepts = (value: unknown): boolean =>
    CommsStringsSchema.safeParse(value).success;

  it("accepts a small subset", () => {
    expect(accepts(base)).toBe(true);
  });

  it("refuses an extra key at the top and in an entry", () => {
    expect(accepts({ ...base, note: 1 })).toBe(false);
    expect(
      accepts({ ...base, entries: [{ key: "a", value: "x", extra: 1 }] }),
    ).toBe(false);
  });

  it("refuses duplicate and out-of-order keys", () => {
    const [first, second] = base.entries;
    expect(accepts({ ...base, entries: [first, first] })).toBe(false);
    expect(accepts({ ...base, entries: [second, first] })).toBe(false);
  });

  it("refuses duplicate and out-of-order variables", () => {
    expect(accepts({ ...base, variables: ["%H", "%H"] })).toBe(false);
    expect(accepts({ ...base, variables: ["[who]", "%H"] })).toBe(false);
  });

  it("refuses a key outside the pattern", () => {
    for (const key of ["", "a b", "-a", "a/b", "__proto__ "]) {
      expect(accepts({ ...base, entries: [{ key, value: "x" }] }), key).toBe(
        false,
      );
      expect(COMMS_KEY_PATTERN.test(key), key).toBe(false);
    }
  });

  it("refuses a variable outside the pattern", () => {
    for (const variable of ["", "H", "%", "%HR", "[]", "[a[b]]", "name"]) {
      expect(accepts({ ...base, variables: [variable] }), variable).toBe(false);
      expect(COMMS_VARIABLE_PATTERN.test(variable), variable).toBe(false);
    }
  });

  it("refuses a value that is not a string or a list of strings, and an over-long one", () => {
    for (const value of [3, null, {}, [], [1], [""], ""]) {
      expect(accepts({ ...base, entries: [{ key: "a", value }] })).toBe(false);
    }
    const long = "x".repeat(MAX_COMMS_TEXT_LENGTH + 1);
    expect(accepts({ ...base, entries: [{ key: "a", value: long }] })).toBe(
      false,
    );
  });

  it("refuses an empty entry list", () => {
    expect(accepts({ ...base, entries: [] })).toBe(false);
  });
});

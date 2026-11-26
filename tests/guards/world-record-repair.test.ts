// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The v5 world records `World.station`, `World.groups` and `World.populator`
 * join `repairWorldFields` when the first production path writes them (plan
 * 21-06 deviation 2; todo `2026-11-26-world-records-join-repair`).
 *
 * Today only `hashWorld` repairs the three records (`src/sim/world/serialize.ts`),
 * and no simulation code writes them outside their sanitizers. Phase 22, 25 or
 * 26 will write them during a step. From then on a corrupted record must be
 * repaired before the step, as the older world fields are. The scan is
 * comment-stripped `src/sim/**`. Any write outside the allow-list (an
 * assignment to a record or one of its fields, or a mutation of `groups` or
 * `marks`) fails unless `repairWorldFields` in `src/sim/world/step.ts` calls
 * all three sanitizers. It is a tripwire, not a proof: it cannot see a write
 * through an alias.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lineOf, listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

/** Files allowed to write the records: their sanitizers. */
const WRITER_ALLOW_LIST: readonly string[] = ["src/sim/world/sanitize.ts"];

const WRITE_PATTERN =
  /\.(station|groups|populator)\b(\.\w+)*\s*(=(?!=)|\+=|-=|\+\+|--)|\.(groups|marks)\.(push|splice|unshift|pop|shift|sort|reverse|fill|copyWithin)\(|\.(groups|marks)\.length\s*=(?!=)/g;

const SANITIZERS = ["sanitizeStation", "sanitizeGroups", "sanitizePopulator"];

/** `<path>:<line>` of each record write in `files` outside the allow-list. */
function recordWrites(
  files: readonly { path: string; source: string }[],
): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    if (WRITER_ALLOW_LIST.includes(path)) continue;
    const cleaned = withoutComments(source);
    for (const match of cleaned.matchAll(WRITE_PATTERN)) {
      found.push(`${path}:${lineOf(cleaned, match.index)}`);
    }
  }
  return found;
}

/** The body of `repairWorldFields` in the step source, comments stripped. */
function repairBody(stepSource: string): string {
  const cleaned = withoutComments(stepSource);
  const start = cleaned.indexOf("function repairWorldFields(");
  if (start < 0) return "";
  const end = cleaned.indexOf("\n}\n", start);
  return cleaned.slice(start, end < 0 ? undefined : end);
}

function missingSanitizers(body: string): string[] {
  return SANITIZERS.filter((name) => !new RegExp(`\\b${name}\\(`).test(body));
}

describe("the v5 world records join repairWorldFields with their first writer", () => {
  it("finds no unrepaired write of station, groups or populator in src/sim", () => {
    const files = listSrcFiles()
      .filter((p) => p.startsWith("src/sim/"))
      .map((path) => ({
        path,
        source: readFileSync(join(REPO_ROOT, path), "utf8"),
      }));
    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(50);
    expect(files.map((f) => f.path)).toContain("src/sim/world/step.ts");

    const body = repairBody(
      readFileSync(join(REPO_ROOT, "src/sim/world/step.ts"), "utf8"),
    );
    expect(body).not.toBe("");

    const writes = recordWrites(files);
    const missing = missingSanitizers(body);
    if (writes.length > 0 && missing.length > 0) {
      expect.fail(
        `world records are written (${writes.join(", ")}) but repairWorldFields does not call ${missing.join(", ")}: add them in the same commit (todo 2026-11-26-world-records-join-repair)`,
      );
    }
  });

  it("detects a write and accepts it once repairWorldFields calls all three", () => {
    const writer = [
      {
        path: "src/sim/world/populator.ts",
        source: "world.populator.rolls += 1;",
      },
      {
        path: "src/sim/x.ts",
        source: "w.groups.push({ id: 101, leader: 101 });",
      },
      { path: "src/sim/y.ts", source: "world.station.marks.push(100);" },
      { path: "src/sim/z.ts", source: "world.station.alert = 3;" },
    ];
    expect(recordWrites(writer)).toHaveLength(4);
    expect(
      recordWrites([
        {
          path: "src/sim/r.ts",
          source: "if (world.station.marks.length === 0) {}",
        },
        {
          path: "src/sim/c.ts",
          source: "// world.station.alert = 3;\nconst a = world.groups;",
        },
        { path: "src/sim/world/sanitize.ts", source: "world.groups = [];" },
      ]),
    ).toEqual([]);

    const unwired =
      "function repairWorldFields(world) {\n  sanitizeBuoyStates(world);\n}\n";
    expect(missingSanitizers(repairBody(unwired))).toEqual(SANITIZERS);
    const wired =
      "function repairWorldFields(world) {\n  sanitizeStation(world);\n  sanitizeGroups(world);\n  sanitizePopulator(world);\n}\n";
    expect(missingSanitizers(repairBody(wired))).toEqual([]);
  });
});

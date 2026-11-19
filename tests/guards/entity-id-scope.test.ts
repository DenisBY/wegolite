// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-world entity id scope guard (FOUND-11, plan 08-03 Task 3, RESEARCH A8).
 *
 * The rule's source is CONTEXT D-06 as amended by its owner on 2026-11-12: no
 * entity id outlives the world that issued it, so nothing outside the world
 * (saves, the window probe, the HUD, logs, mission state, targeting across a
 * jump) stores or transports one. This test makes that mechanical: no `.ts`
 * file under `src` outside `src/sim` may import `src/sim/world/ids` or name the
 * `EntityId` type.
 *
 * It is a source scan rather than an ESLint ban because the scan also catches
 * the type name, not only the import, and because it needs no new config block
 * for non-sim code, whose rule keys a later block would silently replace
 * (RESEARCH Pattern 8).
 *
 * What it cannot see: an id carried as an untyped number. Plan 08-15's
 * world-lifecycle identity test and review cover that.
 *
 * Rule for later phases: a phase that must hold an id outside `src/sim` (for
 * example a Phase 12 render map keyed by id) changes this guard in the same
 * commit as a Key Decisions row that states how the holder is cleared or
 * re-keyed at every world boundary (RESEARCH "Per-world id scope" holder
 * table).
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, posix } from "node:path";
import { describe, expect, it } from "vitest";

import { lineOf, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();
const SRC_DIR = join(REPO_ROOT, "src");

/** Repo-relative posix path of the id module, without extension. */
const IDS_MODULE = "src/sim/world/ids";

const IMPORT_RULE =
  "imports src/sim/world/ids: no entity id outlives its world (CONTEXT D-06, amended 2026-11-12)";
const NAME_RULE =
  "names EntityId: no entity id outlives its world (CONTEXT D-06, amended 2026-11-12)";

/** Static import, `export ... from`, side-effect import and dynamic `import(`. */
const SPECIFIER_PATTERNS = [
  /\bfrom\s+["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s+["']([^"']+)["']/g,
];

/** Whether `specifier`, written in the file at `path`, resolves to the id module. */
function resolvesToIds(path: string, specifier: string): boolean {
  const bare = specifier.replace(/\.(?:js|ts)$/, "");
  if (specifier.startsWith(".")) {
    return (
      posix.normalize(posix.join(posix.dirname(path), bare)) === IDS_MODULE
    );
  }
  // A non-relative alias or package-style path to the same module.
  return bare === IDS_MODULE || bare.endsWith("/sim/world/ids");
}

/**
 * Findings for one file: `<path>:<line>: <rule>`. `path` is repo-relative and
 * posix (`src/app/x.ts`); `text` is the file's source. Comments never count; the
 * token rule is the whole word `EntityId`.
 */
function findEntityIdLeaks(path: string, text: string): string[] {
  const cleaned = withoutComments(text);
  const found: { line: number; rule: string }[] = [];

  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of cleaned.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier === undefined || !resolvesToIds(path, specifier)) continue;
      // Report at the specifier's own line, not the start of the statement.
      const offset = match.index + match[0].lastIndexOf(specifier);
      found.push({ line: lineOf(cleaned, offset), rule: IMPORT_RULE });
    }
  }
  for (const match of cleaned.matchAll(/\bEntityId\b/g)) {
    found.push({ line: lineOf(cleaned, match.index), rule: NAME_RULE });
  }

  // Import findings before name findings on a shared line; otherwise by line.
  found.sort(
    (a, b) =>
      a.line - b.line ||
      (a.rule === b.rule ? 0 : a.rule === IMPORT_RULE ? -1 : 1),
  );
  return found.map((entry) => `${path}:${entry.line}: ${entry.rule}`);
}

/** Every `.ts` file under `src` outside `src/sim`, repo-relative, code-unit ordered. */
function listOutOfWorldFiles(): string[] {
  const found: string[] = [];
  const walk = (directory: string, relative: string): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      if (entry.name.startsWith("__purity_")) continue;
      const rel = `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        if (rel === "src/sim") continue;
        walk(join(directory, entry.name), rel);
      } else if (entry.isFile() && entry.name.endsWith(".ts")) {
        found.push(rel);
      }
    }
  };
  walk(SRC_DIR, "src");
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

describe("entity ids stay inside src/sim", () => {
  const APP = "src/app/session/x.ts";

  it("reports a type import of EntityId from world/ids (import and name)", () => {
    const found = findEntityIdLeaks(
      APP,
      'import type { EntityId } from "../../sim/world/ids.js";\n',
    );

    expect(found).toEqual([
      `${APP}:1: ${IMPORT_RULE}`,
      `${APP}:1: ${NAME_RULE}`,
    ]);
  });

  it("reports a re-export from world/ids", () => {
    const found = findEntityIdLeaks(
      APP,
      'export { PLAYER_ID } from "../../sim/world/ids.js";\n',
    );

    expect(found).toEqual([`${APP}:1: ${IMPORT_RULE}`]);
  });

  it("reports a dynamic import of world/ids", () => {
    const found = findEntityIdLeaks(
      APP,
      'const ids = await import("../../sim/world/ids.js");\n',
    );

    expect(found).toEqual([`${APP}:1: ${IMPORT_RULE}`]);
  });

  it("reports an annotation that names EntityId", () => {
    const found = findEntityIdLeaks(APP, "let target: EntityId = 0;\n");

    expect(found).toEqual([`${APP}:1: ${NAME_RULE}`]);
  });

  it("reports a multi-line import at the specifier's line", () => {
    const found = findEntityIdLeaks(
      APP,
      ["import {", "  NO_ENTITY,", '} from "../../sim/world/ids.js";', ""].join(
        "\n",
      ),
    );

    expect(found).toEqual([`${APP}:3: ${IMPORT_RULE}`]);
  });

  it("reports a persistence file that imports world/ids", () => {
    const path = "src/persistence/x.ts";
    const found = findEntityIdLeaks(
      path,
      'import { NO_ENTITY } from "../sim/world/ids.js";\n',
    );

    expect(found).toEqual([`${path}:1: ${IMPORT_RULE}`]);
  });

  it("ignores EntityId in line and block comments", () => {
    const text = [
      "// EntityId",
      "/* EntityId from world/ids */",
      "/**",
      ' * import { EntityId } from "../../sim/world/ids.js";',
      " */",
      "export const ok = 1;",
      "",
    ].join("\n");

    expect(findEntityIdLeaks(APP, text)).toEqual([]);
  });

  it("allows the other world modules", () => {
    const text = [
      'import { createWorld } from "../../sim/world/world.js";',
      'import { hashWorld } from "../../sim/world/serialize.js";',
      "",
    ].join("\n");

    expect(findEntityIdLeaks(APP, text)).toEqual([]);
  });

  it("matches the whole word EntityId only", () => {
    const text = [
      "export const EntityIds = 1;",
      "export const entityIdCount = 2;",
      "",
    ].join("\n");

    expect(findEntityIdLeaks(APP, text)).toEqual([]);
  });

  it("finds no leak anywhere in src outside src/sim", () => {
    const files = listOutOfWorldFiles();

    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(files.length).toBeGreaterThanOrEqual(50);
    expect(files).toContain("src/app/game-session.ts");
    expect(files).toContain("src/persistence/save.ts");
    expect(files.some((file) => file.startsWith("src/sim/"))).toBe(false);

    const leaks = files.flatMap((file) =>
      findEntityIdLeaks(file, readFileSync(join(REPO_ROOT, file), "utf8")),
    );
    expect(leaks, leaks.join("\n")).toEqual([]);
  });
});

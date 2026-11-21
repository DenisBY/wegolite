// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the read-mode tolerance of the Phase 4 equipment aliases (Phase 19,
 * plan 19-06, T-19-28; the project's deferred-work rule: a deferred fix is a
 * todo plus a guard that fails on its first consumer).
 *
 * `LEGACY_BERTH_ALIAS` and `LEGACY_MISSILE_ALIAS` came from Phase 4 saves, which
 * are `corrupt` since D-11. The writer gate refuses an alias and no writer emits
 * one, so the read-mode branch of `validateSaveSemantics` and the fold in
 * `profileFromSave` accept only a hand-edited blob: dead leniency. Retiring it
 * is deferred to the pending todo, and this guard fails, naming that todo, when
 *
 * - (a) a non-comment `LEGACY_BERTH_ALIAS` or `LEGACY_MISSILE_ALIAS` token
 *   appears in a `src/**\/*.ts` file other than `src/persistence/save.ts` and
 *   `src/persistence/autosave.ts` (a second read site, or a writer), or either
 *   file's per-constant line count differs from its pin (2 and 2 in each: the
 *   declaration and the `validateSaveSemantics` check; the import and the
 *   `profileFromSave` fold);
 * - (b) the writer gate (`isEncodedSaveValid`, write mode) accepts a blob that
 *   carries either alias, or the reader (`parseSave`, read mode) no longer
 *   accepts it, which means the tolerance was removed: that commit deletes this
 *   guard and moves the todo to `completed/`.
 *
 * It is a tripwire, not a proof: a consumer that spells the catalogue keys
 * (`EQ_PASSENGER_BERTH`, `EQ_MISSILE`), which F3 legitimately uses across `src`,
 * is not seen, which is why the scan keys on the two constants.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  LEGACY_BERTH_ALIAS,
  LEGACY_MISSILE_ALIAS,
  encodeSave,
  isEncodedSaveValid,
  parseSave,
} from "../../src/persistence/save.js";
import { saveAllowLists, saveInputs } from "../helpers/save-builders.js";
import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const TODO =
  ".planning/todos/pending/2026-11-21-retire-legacy-equipment-alias-read-tolerance.md";

const SAVE = "src/persistence/save.ts";
const AUTOSAVE = "src/persistence/autosave.ts";

const CONSTANTS = ["LEGACY_BERTH_ALIAS", "LEGACY_MISSILE_ALIAS"] as const;
type AliasConstant = (typeof CONSTANTS)[number];

/**
 * The pinned non-comment line count of each constant per file, measured at
 * 0d922a2: `save.ts` has the declaration and the `validateSaveSemantics` check,
 * `autosave.ts` the import and the `profileFromSave` fold.
 */
const PINS: ReadonlyMap<
  string,
  Readonly<Record<AliasConstant, number>>
> = new Map([
  [SAVE, { LEGACY_BERTH_ALIAS: 2, LEGACY_MISSILE_ALIAS: 2 }],
  [AUTOSAVE, { LEGACY_BERTH_ALIAS: 2, LEGACY_MISSILE_ALIAS: 2 }],
]);

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** The non-comment lines of `source` that name `constant` as a whole word. */
function codeLines(source: string, constant: AliasConstant): number[] {
  const word = new RegExp(`\\b${constant}\\b`, "u");
  const lines: number[] = [];
  withoutComments(source)
    .split("\n")
    .forEach((line, index) => {
      if (word.test(line)) lines.push(index + 1);
    });
  return lines;
}

/**
 * The violations over `files` (repo-relative posix paths and their text):
 * `<path>[:<line>]: <rule>`, every one naming the todo.
 */
function aliasViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  const seen = new Set<string>();

  for (const { path, source } of files) {
    seen.add(path);
    const pin = PINS.get(path);
    if (pin === undefined) {
      for (const constant of CONSTANTS) {
        for (const line of codeLines(source, constant)) {
          found.push(
            `${path}:${String(line)}: ${constant} is named outside ${SAVE} and ${AUTOSAVE}: a new consumer of the dead alias tolerance; retire the tolerance instead (see ${TODO})`,
          );
        }
      }
      continue;
    }
    const counts = CONSTANTS.map((constant) => [
      constant,
      codeLines(source, constant).length,
    ]) as ReadonlyArray<readonly [AliasConstant, number]>;
    if (counts.every(([, count]) => count === 0)) {
      found.push(
        `${path}: neither alias constant is named any more: the tolerance is gone, so delete this guard and close the todo in that commit (see ${TODO})`,
      );
      continue;
    }
    for (const [constant, count] of counts) {
      if (count !== pin[constant]) {
        found.push(
          `${path}: ${constant} is on ${String(count)} non-comment lines, pinned at ${String(pin[constant])}: a new use of the dead alias tolerance; retire the tolerance instead (see ${TODO})`,
        );
      }
    }
  }

  for (const path of PINS.keys()) {
    if (!seen.has(path)) {
      found.push(
        `${path}: the file is gone: the tolerance is gone, so delete this guard and close the todo in that commit (see ${TODO})`,
      );
    }
  }
  return found;
}

/** Every `.ts` file under `src`, read from the working tree. */
function srcTree(): SourceFile[] {
  return listSrcFiles().map((path) => ({
    path,
    source: readFileSync(join(REPO_ROOT, path), "utf8"),
  }));
}

/** The tree with `path` replaced by (or added with) `source`. */
function withFile(
  tree: readonly SourceFile[],
  path: string,
  source: string,
): SourceFile[] {
  return [...tree.filter((file) => file.path !== path), { path, source }];
}

function sourceOf(tree: readonly SourceFile[], path: string): string {
  const file = tree.find((entry) => entry.path === path);
  if (file === undefined) throw new Error(`no ${path} in the tree`);
  return file.source;
}

describe("the read-mode alias tolerance has no new consumer (tripwire)", () => {
  const tree = srcTree();

  it("passes on the current tree, and the tree holds what the guard reads", () => {
    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(tree.length).toBeGreaterThanOrEqual(100);
    for (const path of PINS.keys()) {
      expect(tree.map((file) => file.path)).toContain(path);
      for (const constant of CONSTANTS) {
        expect(codeLines(sourceOf(tree, path), constant)).toHaveLength(2);
      }
    }
    const found = aliasViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("fails on a third src file that names LEGACY_MISSILE_ALIAS in code", () => {
    const found = aliasViolations(
      withFile(
        tree,
        "src/sim/economy/second-reader.ts",
        'import { LEGACY_MISSILE_ALIAS } from "../../persistence/save.js";\nexport const x = LEGACY_MISSILE_ALIAS;\n',
      ),
    );
    expect(found).toHaveLength(2);
    expect(found[0]).toMatch(/^src\/sim\/economy\/second-reader\.ts:1: /);
    expect(found.join("\n")).toContain(TODO);
  });

  it("fails on a third src file that names LEGACY_BERTH_ALIAS in code", () => {
    const found = aliasViolations(
      withFile(
        tree,
        "src/app/second-writer.ts",
        "export const alias = LEGACY_BERTH_ALIAS;\n",
      ),
    );
    expect(found).toEqual([
      `src/app/second-writer.ts:1: LEGACY_BERTH_ALIAS is named outside ${SAVE} and ${AUTOSAVE}: a new consumer of the dead alias tolerance; retire the tolerance instead (see ${TODO})`,
    ]);
  });

  it("passes when the token appears only inside a comment", () => {
    const found = aliasViolations(
      withFile(
        tree,
        "src/sim/economy/note.ts",
        "// LEGACY_MISSILE_ALIAS is retired in a later phase.\n/* LEGACY_BERTH_ALIAS too */\nexport const x = 1;\n",
      ),
    );
    expect(found).toEqual([]);
  });

  it("fails on save.ts with one more use of LEGACY_BERTH_ALIAS", () => {
    const save = sourceOf(tree, SAVE);
    const found = aliasViolations(
      withFile(
        tree,
        SAVE,
        `${save}\nexport const again = (key: string): boolean => key === LEGACY_BERTH_ALIAS;\n`,
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(
      `${SAVE}: LEGACY_BERTH_ALIAS is on 3 non-comment lines, pinned at 2`,
    );
    expect(found[0]).toContain(TODO);
  });

  it("fails on autosave.ts with one more use of LEGACY_MISSILE_ALIAS", () => {
    const autosave = sourceOf(tree, AUTOSAVE);
    const found = aliasViolations(
      withFile(
        tree,
        AUTOSAVE,
        `${autosave}\nexport const again = (key: string): boolean => key === LEGACY_MISSILE_ALIAS;\n`,
      ),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(
      `${AUTOSAVE}: LEGACY_MISSILE_ALIAS is on 3 non-comment lines, pinned at 2`,
    );
  });

  it("fails, saying the tolerance is gone, when save.ts names neither constant", () => {
    const found = aliasViolations(
      withFile(tree, SAVE, "export const x = 1;\n"),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(
      `${SAVE}: neither alias constant is named any more: the tolerance is gone, so delete this guard and close the todo in that commit`,
    );
    expect(found[0]).toContain(TODO);
  });

  it("fails, saying the tolerance is gone, when a pinned file no longer exists", () => {
    const found = aliasViolations(
      tree.filter((file) => file.path !== AUTOSAVE),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(`${AUTOSAVE}: the file is gone`);
    expect(found[0]).toContain(TODO);
  });
});

describe("the writer refuses an alias and the reader still tolerates it (tripwire)", () => {
  const allow = saveAllowLists();

  for (const [name, alias] of [
    ["LEGACY_BERTH_ALIAS", LEGACY_BERTH_ALIAS],
    ["LEGACY_MISSILE_ALIAS", LEGACY_MISSILE_ALIAS],
  ] as const) {
    const blob = encodeSave(saveInputs({ equipment: [alias] }));

    it(`${name}: the writer gate (write mode) refuses a blob carrying it`, () => {
      expect(
        isEncodedSaveValid(blob, allow),
        `the writer accepts ${name}: a writer may now emit an alias (see ${TODO})`,
      ).toBe(false);
    });

    it(`${name}: the reader (read mode) still accepts it, the dead tolerance the todo retires`, () => {
      expect(
        parseSave(blob, allow).ok,
        `the reader no longer accepts ${name}: the tolerance is gone, so delete this guard and close the todo in that commit (see ${TODO})`,
      ).toBe(true);
    });
  }
});

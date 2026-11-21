// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the deferred hull wear (CBT-08, Phase 19 plan 19-02, D-05; owner
 * decision 2026-11-21).
 *
 * Oolite's `ship_trade_in_factor` wears with damage and jumps, `EQ_RENOVATION`
 * raises it, and the fuel price follows it. Phase 19 keeps the factor as the
 * constant `SHIP_TRADE_IN_FACTOR = 95` in `src/sim/combat/internal-damage.ts`,
 * never persisted, with no cosmetic branch. That is exact for a new ship and
 * wrong for a worn one, so the first consumer of any of the three pieces must
 * settle all of them. While the constant stays as declared, this guard fails,
 * naming the todo, on any of
 *
 * - (a) a non-comment `EQ_RENOVATION` token in any `.ts` file under `src`: a
 *   repair or fit door for the item that restores the factor;
 * - (b) a non-comment `SHIP_TRADE_IN_FACTOR`, `shipTradeInFactor`,
 *   `tradeInFactor` or `ship_trade_in_factor` token in a `src` file other than
 *   `src/sim/combat/internal-damage.ts`: a second reader of the factor (a fuel
 *   price, a trade-in value);
 * - (c) `src/sim/combat/internal-damage.ts` no longer declaring exactly
 *   `export const SHIP_TRADE_IN_FACTOR = 95;`: the factor became a variable or
 *   changed value.
 *
 * It keys on tokens, so it is green on the current tree and each trigger has a
 * synthetic input that fails. It is a tripwire, not a proof: a consumer spelled
 * without the tokens is not seen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const TODO =
  ".planning/todos/pending/2026-11-21-hull-wear-renovation-and-fuel-price.md";

const DAMAGE_MODULE = "src/sim/combat/internal-damage.ts";

const DECLARATION = "export const SHIP_TRADE_IN_FACTOR = 95;";

const RENOVATION_RULE = `EQ_RENOVATION is consumed: port the hull wear, the factor and the fuel-price effect together first (see ${TODO})`;
const FACTOR_RULE = `the trade-in factor has a second reader: port the hull wear, EQ_RENOVATION and the fuel-price effect together first (see ${TODO})`;
const DECLARATION_RULE = `${DAMAGE_MODULE} no longer declares exactly \`${DECLARATION}\`: the factor changed, so port the hull wear first (see ${TODO})`;

const FACTOR_TOKEN =
  /\b(?:SHIP_TRADE_IN_FACTOR|shipTradeInFactor|tradeInFactor|ship_trade_in_factor)\b/;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** The violations over `files`: `<path>:<line>: <rule>`, or `<path>: <rule>`. */
function hullWearViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    const lines = withoutComments(source).split("\n");
    lines.forEach((line, index) => {
      const at = `${path}:${String(index + 1)}`;
      if (/\bEQ_RENOVATION\b/.test(line)) {
        found.push(`${at}: ${RENOVATION_RULE}`);
      }
      if (path !== DAMAGE_MODULE && FACTOR_TOKEN.test(line)) {
        found.push(`${at}: ${FACTOR_RULE}`);
      }
    });
  }
  const damage = files.find((file) => file.path === DAMAGE_MODULE);
  if (
    damage === undefined ||
    withoutComments(damage.source)
      .split("\n")
      .filter((line) => line.trim() === DECLARATION).length !== 1
  ) {
    found.push(`${DAMAGE_MODULE}: ${DECLARATION_RULE}`);
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

/** The tree with `path` replaced by (or extended with) `source`. */
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

describe("hull wear waits for its three pieces together (tripwire)", () => {
  const tree = srcTree();

  it("passes on the current tree, and the tree holds what the guard reads", () => {
    // Vacuity floor: a broken walk must fail rather than pass on an empty list.
    expect(tree.length).toBeGreaterThanOrEqual(100);
    expect(tree.map((file) => file.path)).toContain(DAMAGE_MODULE);
    expect(withoutComments(sourceOf(tree, DAMAGE_MODULE))).toContain(
      DECLARATION,
    );
    const found = hullWearViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("names the todo and the todo exists", () => {
    expect(RENOVATION_RULE).toContain(TODO);
    expect(FACTOR_RULE).toContain(TODO);
    expect(DECLARATION_RULE).toContain(TODO);
    expect(() => readFileSync(join(REPO_ROOT, TODO), "utf8")).not.toThrow();
  });

  it("fails on a non-comment EQ_RENOVATION token (a repair door for it)", () => {
    const found = hullWearViolations(
      withFile(
        tree,
        "src/sim/player/renovation.ts",
        'export const RENOVATION_KEY = "EQ_RENOVATION";\n',
      ),
    );
    expect(found).toEqual([
      `src/sim/player/renovation.ts:1: ${RENOVATION_RULE}`,
    ]);
    expect(found[0]).toContain(TODO);
  });

  it("fails on a second reader of the factor outside the damage module", () => {
    for (const token of [
      "SHIP_TRADE_IN_FACTOR",
      "shipTradeInFactor",
      "tradeInFactor",
      "ship_trade_in_factor",
    ]) {
      const found = hullWearViolations(
        withFile(
          tree,
          "src/sim/economy/fuel.ts",
          `export const fuelRate = (rate: number): number => rate * ${token};\n`,
        ),
      );
      expect(found, token).toEqual([
        `src/sim/economy/fuel.ts:1: ${FACTOR_RULE}`,
      ]);
      expect(found[0]).toContain(TODO);
    }
  });

  it("fails when the declaration is no longer exactly the constant 95", () => {
    const damage = sourceOf(tree, DAMAGE_MODULE);
    for (const changed of [
      "export const SHIP_TRADE_IN_FACTOR = 100;",
      "export let SHIP_TRADE_IN_FACTOR = 95;",
      "const SHIP_TRADE_IN_FACTOR = 95;",
    ]) {
      const found = hullWearViolations(
        withFile(tree, DAMAGE_MODULE, damage.replace(DECLARATION, changed)),
      );
      expect(found, changed).toEqual([`${DAMAGE_MODULE}: ${DECLARATION_RULE}`]);
      expect(found[0]).toContain(TODO);
    }
  });

  it("fails when the declaration appears twice or the module is gone", () => {
    const damage = sourceOf(tree, DAMAGE_MODULE);
    expect(
      hullWearViolations(
        withFile(tree, DAMAGE_MODULE, `${damage}\n${DECLARATION}\n`),
      ),
    ).toEqual([`${DAMAGE_MODULE}: ${DECLARATION_RULE}`]);
    expect(
      hullWearViolations(tree.filter((file) => file.path !== DAMAGE_MODULE)),
    ).toEqual([`${DAMAGE_MODULE}: ${DECLARATION_RULE}`]);
  });

  it("allows a doc comment naming the tokens anywhere", () => {
    const found = hullWearViolations(
      withFile(
        tree,
        "src/sim/economy/fuel.ts",
        [
          "// EQ_RENOVATION and ship_trade_in_factor are discussed in the todo.",
          "/** SHIP_TRADE_IN_FACTOR is read by internal-damage.ts only. */",
          "export const NOTHING = 0;",
          "",
        ].join("\n"),
      ),
    );
    expect(found).toEqual([]);
  });
});

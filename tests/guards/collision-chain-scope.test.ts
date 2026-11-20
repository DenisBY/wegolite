// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: the collision-chain prefilter covers buoy pairs only (Phase 18
 * PD-08, owner decision 2026-11-20, plan 18-21).
 *
 * `src/sim/npc/collision-chain.ts` ports Oolite's `filterSortedLists`, and the
 * proximity pass gates a pair with it only when the pair includes a buoy. The
 * faithful all-pairs version is deferred to the todo named below, because it
 * may move the QUAL-11 totals and needs its own owner rule. This guard makes a
 * scope change mechanical: it fails, naming the todo, when
 *
 * - (a) the non-comment text of `src/sim/npc/proximity.ts` does not hold
 *   exactly one `chainsPair(` call, written `chainsPair(chains, buoy.id,
 *   entity.id)`: a second call gates another pair kind, none removes the buoy
 *   gate, other arguments gate something else;
 * - (b) any other file under `src/` imports `collision-chain`.
 *
 * It is a tripwire, not a proof: a prefilter reimplemented without the module
 * is not seen.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const TODO =
  ".planning/todos/pending/2026-11-20-collision-chain-prefilter-all-pairs.md";

const PROXIMITY = "src/sim/npc/proximity.ts";
const CHAIN = "src/sim/npc/collision-chain.ts";
const BUOY_GATE = "chainsPair(chains, buoy.id, entity.id)";

const RULE = `the collision-chain prefilter's scope changed (PD-08 covers buoy pairs only): settle it under ${TODO}`;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

function scopeViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    if (path === CHAIN) continue;
    const code = withoutComments(source);
    if (path === PROXIMITY) {
      const calls = code.match(/\bchainsPair\s*\([^)]*\)/g) ?? [];
      const normalised = calls.map((call) => call.replace(/\s+/g, " "));
      if (normalised.length !== 1 || normalised[0] !== BUOY_GATE) {
        found.push(`${PROXIMITY}: ${RULE}`);
      }
      continue;
    }
    if (/["'][^"']*collision-chain(?:\.js)?["']/.test(code)) {
      found.push(`${path}: ${RULE}`);
    }
  }
  return found;
}

function srcTree(): SourceFile[] {
  return listSrcFiles().map((path) => ({
    path,
    source: readFileSync(join(REPO_ROOT, path), "utf8"),
  }));
}

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

describe("the collision-chain prefilter covers buoy pairs only (tripwire)", () => {
  const tree = srcTree();

  it("passes on the current tree, and the tree holds what the guard reads", () => {
    expect(tree.length).toBeGreaterThanOrEqual(100);
    expect(tree.map((file) => file.path)).toContain(PROXIMITY);
    expect(tree.map((file) => file.path)).toContain(CHAIN);
    expect(withoutComments(sourceOf(tree, PROXIMITY))).toContain(BUOY_GATE);
    const found = scopeViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("fails, naming the todo, when the station pair is gated too", () => {
    const proximity = sourceOf(tree, PROXIMITY);
    const mutated = proximity.replace(
      "testPair(pass, stationBody, undefined, entity, entity);",
      "if (chains !== undefined && chainsPair(chains, stationBody.id, entity.id))\n        testPair(pass, stationBody, undefined, entity, entity);",
    );
    expect(mutated).not.toBe(proximity);
    const found = scopeViolations(withFile(tree, PROXIMITY, mutated));
    expect(found).toEqual([`${PROXIMITY}: ${RULE}`]);
    expect(found[0]).toContain(TODO);
  });

  it("fails when the buoy gate is removed", () => {
    const proximity = sourceOf(tree, PROXIMITY);
    const mutated = proximity.replace(
      `chains !== undefined && ${BUOY_GATE}`,
      "true",
    );
    expect(mutated).not.toBe(proximity);
    expect(scopeViolations(withFile(tree, PROXIMITY, mutated))).toEqual([
      `${PROXIMITY}: ${RULE}`,
    ]);
  });

  it("fails when the one call gates another pair", () => {
    const proximity = sourceOf(tree, PROXIMITY);
    const mutated = proximity.replace(
      BUOY_GATE,
      "chainsPair(chains, first.id, second.id)",
    );
    expect(scopeViolations(withFile(tree, PROXIMITY, mutated))).toEqual([
      `${PROXIMITY}: ${RULE}`,
    ]);
  });

  it("fails when another module imports the prefilter", () => {
    const found = scopeViolations(
      withFile(
        tree,
        "src/sim/combat/collide-prefilter.ts",
        'import { chainsPair } from "../npc/collision-chain.js";\nexport const gate = chainsPair;\n',
      ),
    );
    expect(found).toEqual([`src/sim/combat/collide-prefilter.ts: ${RULE}`]);
  });

  it("a comment naming the module or the call does not trip it", () => {
    const proximity = sourceOf(tree, PROXIMITY);
    const found = scopeViolations(
      withFile(
        withFile(
          tree,
          PROXIMITY,
          `${proximity}\n// chainsPair(chains, stationBody.id, entity.id) is deferred\n`,
        ),
        "src/sim/npc/notes.ts",
        '// see "./collision-chain.js"\nexport const NOTE = 1;\n',
      ),
    );
    expect(found).toEqual([]);
  });
});

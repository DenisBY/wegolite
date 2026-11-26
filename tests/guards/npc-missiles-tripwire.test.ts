// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Tripwire: every NPC spawns with zero missiles in v2.4 (DATA-17, Phase 21 plan
 * 21-05; owner scope 2026-11-25; FIDELITY E-194).
 *
 * The NPC catalogue compiles Oolite's `missiles` and `max_missiles` as data
 * (`missiles` and `maxMissiles` on every record of `src/content/schemas/
 * ship-npc.ts`), but no entity or `SpawnInit` member holds a missile count and
 * no spawn path reads the record's. The first consumer must port missiles and
 * ECM together (CBT-19, Phase 23), which extends this guard to the AI side in
 * its own commit. While nothing consumes the counts, this guard fails, naming
 * the todo, on any of
 *
 * - (a) a non-comment read of a `missiles` or `maxMissiles` property (a member
 *   access, a bracket access or a destructuring) in a `.ts` file under
 *   `src/sim/` outside `src/sim/player/` (the player's pylons are a separate,
 *   shipped feature), or in `src/app/session/traffic.ts` (the record bridge);
 * - (b) `src/sim/world/entity.ts` declaring a `missiles` or `maxMissiles`
 *   member.
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

const TODO = ".planning/todos/pending/2026-11-25-missiles-and-ecm.md";

const ENTITY_MODULE = "src/sim/world/entity.ts";
const RECORD_BRIDGE = "src/app/session/traffic.ts";
const PLAYER_PREFIX = "src/sim/player/";

const RULE =
  `every NPC spawns with zero missiles in v2.4: the compiled missiles and maxMissiles are data only; ` +
  `port missiles and ECM together first (CBT-19 in Phase 23, which extends this guard to the AI side; see ${TODO})`;
const MEMBER_RULE = `an entity member holds a missile count: ${RULE}`;

/** A property read of either name: `x.missiles`, `x["maxMissiles"]`, `{ missiles } = x`. */
const READ_TOKENS = [
  /\.\s*(?:missiles|maxMissiles)\b/,
  /\[\s*["'`](?:missiles|maxMissiles)["'`]\s*\]/,
  /\{[^{}]*\b(?:missiles|maxMissiles)\b[^{}]*\}\s*=[^=>]/,
];

/** A declared member: `missiles: number;`, `readonly maxMissiles?: number`. */
const MEMBER_DECLARATION =
  /^\s*(?:readonly\s+)?(?:missiles|maxMissiles)\??\s*:/;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** Whether the guard watches `path`: the sim outside the player's, and the record bridge. */
function inScope(path: string): boolean {
  if (path === RECORD_BRIDGE) return true;
  return path.startsWith("src/sim/") && !path.startsWith(PLAYER_PREFIX);
}

/** The violations over `files`: `<path>:<line>: <rule>`. */
function missileViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    if (!inScope(path)) continue;
    const lines = withoutComments(source).split("\n");
    lines.forEach((line, index) => {
      const at = `${path}:${String(index + 1)}`;
      if (READ_TOKENS.some((token) => token.test(line))) {
        found.push(`${at}: ${RULE}`);
      }
      if (path === ENTITY_MODULE && MEMBER_DECLARATION.test(line)) {
        found.push(`${at}: ${MEMBER_RULE}`);
      }
    });
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

describe("NPCs carry no missiles in v2.4 (tripwire, CBT-19)", () => {
  const tree = srcTree();

  it("passes on the current tree, and the scope holds the files the guard reads", () => {
    // Vacuity floor: a broken walk or scope must fail rather than pass on an
    // empty list.
    const scoped = tree.filter((file) => inScope(file.path));
    expect(scoped.length).toBeGreaterThanOrEqual(100);
    expect(scoped.map((file) => file.path)).toContain(RECORD_BRIDGE);
    expect(scoped.map((file) => file.path)).toContain(ENTITY_MODULE);
    expect(scoped.map((file) => file.path)).toContain(
      "src/sim/world/populate.ts",
    );
    const found = missileViolations(tree);
    expect(found, found.join("\n")).toEqual([]);
  });

  it("keeps the player's pylons out of the scope", () => {
    expect(inScope("src/sim/player/outfitting.ts")).toBe(false);
    expect(inScope("src/sim/player/profile.ts")).toBe(false);
    expect(inScope("src/persistence/save.ts")).toBe(false);
    expect(inScope("src/sim/world/populate.ts")).toBe(true);
    expect(inScope(RECORD_BRIDGE)).toBe(true);
  });

  it("fails on a read of the record's missiles in the populator, naming the todo and CBT-19", () => {
    const populate = "src/sim/world/populate.ts";
    const tripped = withFile(
      tree,
      populate,
      `${sourceOf(tree, populate)}\nconst n = record.missiles;\n`,
    );
    const found = missileViolations(tripped);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(populate);
    expect(found[0]).toMatch(/:\d+: /);
    expect(found[0]).toContain("2026-11-25-missiles-and-ecm");
    expect(found[0]).toContain("CBT-19");
  });

  it("fails on a read of maxMissiles in the record bridge", () => {
    const tripped = withFile(
      tree,
      RECORD_BRIDGE,
      `${sourceOf(tree, RECORD_BRIDGE)}\nconst cap = ship.maxMissiles;\n`,
    );
    const found = missileViolations(tripped);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(RECORD_BRIDGE);
    expect(found[0]).toContain("2026-11-25-missiles-and-ecm");
  });

  it("fails on a bracket access and on a destructuring", () => {
    const populate = "src/sim/world/populate.ts";
    for (const line of [
      `const n = record["missiles"];`,
      `const { missiles } = record;`,
      `const { key, maxMissiles: cap } = record;`,
    ]) {
      const tripped = withFile(
        tree,
        populate,
        `${sourceOf(tree, populate)}\n${line}\n`,
      );
      expect(missileViolations(tripped), line).toHaveLength(1);
    }
  });

  it("fails on a missiles member declared in the entity", () => {
    const tripped = withFile(
      tree,
      ENTITY_MODULE,
      `${sourceOf(tree, ENTITY_MODULE)}\ninterface Probe {\n  missiles: number;\n}\n`,
    );
    const found = missileViolations(tripped);
    expect(found).toHaveLength(1);
    expect(found[0]).toContain(ENTITY_MODULE);
    expect(found[0]).toContain("CBT-19");
  });

  it("passes on a comment that names either property, and outside the scope", () => {
    const populate = "src/sim/world/populate.ts";
    const commented = withFile(
      tree,
      populate,
      `${sourceOf(tree, populate)}\n// the record's missiles stay data; see maxMissiles\n/* ship.missiles */\n`,
    );
    expect(missileViolations(commented)).toEqual([]);
    const player = withFile(
      tree,
      "src/sim/player/outfitting.ts",
      `${sourceOf(tree, "src/sim/player/outfitting.ts")}\nconst n = profile.missiles;\n`,
    );
    expect(missileViolations(player)).toEqual([]);
  });
});

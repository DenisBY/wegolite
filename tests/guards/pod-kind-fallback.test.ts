// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Pod-kind fallback tripwire (plan 21-14, orchestrator decision 3, T-21-37).
 *
 * A destroyed ship's pods are drawn with a cargo kind resolved AT RELEASE
 * (`resolvePodCargoKind`, `src/sim/world/debris.ts`): the stored `cargoKind`
 * when set, otherwise the role family, otherwise `scarce` legal goods. That
 * fallback exists for exactly one caller, the frozen inert path
 * (`src/sim/world/populate.ts`), whose ships may not store a kind because a
 * stored kind would print a `ck:` segment and move the epoch 1-20 pin. Any
 * other spawn site that gives a ship `cargo` must name its `cargoKind` too, or
 * Phase 22's live populator would silently draw every pod from the fallback.
 *
 * The guard scans comment-stripped `src/sim/**`: every `spawnEntity(...)` call
 * and every `SpawnInit` object literal that has a `cargo` member must also name
 * `cargoKind`, unless its file is the allow-listed inert path. It is a
 * tripwire, not a proof: it cannot see an init assembled out of sight of both
 * markers. The deferred runtime check (no ship Phase 22's populator places has
 * cargo above 0 with kind 0) is the todo `PHASE_22_TODO`.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lineOf, listSrcFiles, withoutComments } from "./source-scan.js";

const REPO_ROOT = process.cwd();

const PHASE_22_TODO =
  ".planning/todos/completed/2026-11-25-pod-kind-live-populator.md";

/** The one spawn path allowed to leave a ship with cargo and no kind (frozen). */
const INERT_PATH_FILES: readonly string[] = ["src/sim/world/populate.ts"];

const RULE = `a spawn init with cargo must set cargoKind: the live populator must not rely on the scarce-legal pod fallback (orchestrator decision 3, plan 21-14); the inert path is allow-listed, see ${PHASE_22_TODO}`;

interface SourceFile {
  readonly path: string;
  readonly source: string;
}

/** A `cargo` object member: `cargo:`, `cargo,` or `cargo }` (not `cargo ===`). */
const CARGO_MEMBER = /(?<![\w.])cargo\s*[:,}]/;

/** The `cargoKind` word. */
const CARGO_KIND = /\bcargoKind\b/;

/**
 * The text from `open` (an opening bracket) to its match, skipping string and
 * template literals; to the end of `text` when it never closes.
 */
function balanced(text: string, open: number): string {
  const opener = text[open] as string;
  const closer = opener === "(" ? ")" : "}";
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text[index] as string;
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < text.length && text[index] !== char) {
        if (text[index] === "\\") index += 1;
        index += 1;
      }
    } else if (char === opener) {
      depth += 1;
    } else if (char === closer) {
      depth -= 1;
      if (depth === 0) return text.slice(open, index + 1);
    }
    index += 1;
  }
  return text.slice(open);
}

interface SpawnSite {
  readonly offset: number;
  readonly text: string;
}

/** Every `spawnEntity(...)` call and `SpawnInit = {...}` literal of `cleaned`. */
function spawnSites(cleaned: string): SpawnSite[] {
  const sites: SpawnSite[] = [];
  for (const match of cleaned.matchAll(/\bspawnEntity\s*\(/g)) {
    const open = match.index + match[0].length - 1;
    sites.push({ offset: match.index, text: balanced(cleaned, open) });
  }
  for (const match of cleaned.matchAll(/\bSpawnInit\s*=\s*\{/g)) {
    const open = match.index + match[0].length - 1;
    sites.push({ offset: match.index, text: balanced(cleaned, open) });
  }
  return sites;
}

/** The sites of `source` that give a ship `cargo`. */
function cargoSites(source: string): SpawnSite[] {
  return spawnSites(withoutComments(source)).filter((site) =>
    CARGO_MEMBER.test(site.text),
  );
}

/** Violations over `files`: `<path>:<line>: <rule>`; comments never count. */
function podKindViolations(files: readonly SourceFile[]): string[] {
  const found: string[] = [];
  for (const { path, source } of files) {
    if (!path.startsWith("src/sim/") || INERT_PATH_FILES.includes(path)) {
      continue;
    }
    const cleaned = withoutComments(source);
    for (const site of cargoSites(source)) {
      if (CARGO_KIND.test(site.text)) continue;
      found.push(`${path}:${lineOf(cleaned, site.offset)}: ${RULE}`);
    }
  }
  return found;
}

function readTree(): SourceFile[] {
  return listSrcFiles().map((path) => ({
    path,
    source: readFileSync(join(REPO_ROOT, path), "utf8"),
  }));
}

describe("pod-kind fallback tripwire (T-21-37)", () => {
  it("holds on the tree: no spawn site but the inert path leaves cargo without a kind", () => {
    expect(podKindViolations(readTree())).toEqual([]);
  });

  it("is not vacuous: the inert path and the hook both spawn with cargo", () => {
    const tree = readTree();
    const withCargo = tree
      .filter(({ path }) => path.startsWith("src/sim/"))
      .filter(({ source }) => cargoSites(source).length > 0)
      .map(({ path }) => path);
    for (const inert of INERT_PATH_FILES) expect(withCargo).toContain(inert);
    expect(withCargo).toContain("src/sim/ai/test-spawn.ts");
    // The allow-list names a file that exists and still spawns with cargo.
    for (const inert of INERT_PATH_FILES) {
      expect(tree.map(({ path }) => path)).toContain(inert);
    }
  });

  it("names the Phase 22 todo that carries the runtime check", () => {
    const todo = readFileSync(join(REPO_ROOT, PHASE_22_TODO), "utf8");
    expect(todo).toContain("resolves_phase: 22");
  });

  describe("on synthetic inputs", () => {
    const call = (init: string): string =>
      `export function f(world: World): void {\n  spawnEntity(world, ${init}, 0);\n}\n`;

    it("fails for a new populator that spawns with cargo and no kind", () => {
      const violations = podKindViolations([
        {
          path: "src/sim/world/populate-system.ts",
          source: call('{ kind: "ship", specKey: "x", cargo: 5 }'),
        },
      ]);
      expect(violations).toHaveLength(1);
      expect(violations[0]).toContain("src/sim/world/populate-system.ts:2:");
    });

    it("fails for a shorthand member and for a typed init literal", () => {
      expect(
        podKindViolations([
          {
            path: "src/sim/ai/a.ts",
            source: call('{ kind: "ship", cargo }'),
          },
          {
            path: "src/sim/ai/b.ts",
            source:
              'const init: SpawnInit = { kind: "ship", cargo: n };\nspawnEntity(world, init, 0);\n',
          },
        ]),
      ).toHaveLength(2);
    });

    it("passes for the allow-listed inert path", () => {
      expect(
        podKindViolations([
          {
            path: "src/sim/world/populate.ts",
            source: call('{ kind: "ship", cargo: 5 }'),
          },
        ]),
      ).toEqual([]);
    });

    it("passes for a spawn that names both, as the hook does", () => {
      expect(
        podKindViolations([
          {
            path: "src/sim/ai/test-spawn.ts",
            source: call(
              '{ kind: "ship", ...(cargo === 0 ? { cargo } : { cargo, cargoKind: TEST_SHOOTER_CARGO_KIND }) }',
            ),
          },
        ]),
      ).toEqual([]);
    });

    it("passes for a spawn without cargo, a comparison and prose", () => {
      expect(
        podKindViolations([
          {
            path: "src/sim/ai/c.ts",
            source: `${call('{ kind: "ship", speed: 0 }')}// spawnEntity(world, { cargo: 5 }, 0)\nconst x = cargo === 1;\n`,
          },
        ]),
      ).toEqual([]);
    });

    it("ignores files outside src/sim", () => {
      expect(
        podKindViolations([
          {
            path: "src/app/session/hook.ts",
            source: call('{ kind: "ship", cargo: 5 }'),
          },
        ]),
      ).toEqual([]);
    });
  });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Purity proof for the Phase 5 economy and player modules (ECON-01, ECON-08,
 * T-05-28).
 *
 * The clean-tree ESLint zone and `tsconfig.sim.json` already cover `src/sim/**`,
 * but a source scan is still needed for two things the type system cannot see:
 * the global/random/wall-clock surface, and the exact shape of a content import
 * (a runtime import and a type-only import have the same declaration syntax).
 *
 * ESLint's `no-restricted-properties` is the **primary control** for
 * `Math.random`, `Date.now` and `performance.now`; this scan is a second,
 * explicit proof over the files this phase added. It does NOT prove against a
 * computed or aliased lookup such as `globalThis["Math"]["random"]`, and it
 * makes no such claim: it checks the literal forms a reviewer can read.
 *
 * The content door is resolved by **module path**, not by an exact import
 * string. `src/sim/economy/**` reaches the types with `../../content/types.js`
 * and a top-level `src/sim/*.ts` reaches them with `../content/types.js`; both
 * must pass, and only an `import type` may pass at all. Any other `src/content`
 * module is a violation whether the import is runtime or type-only.
 */

import { readdirSync, readFileSync } from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SIM_DIR = path.join(REPO_ROOT, "src", "sim");
const ECONOMY_DIR = path.join(SIM_DIR, "economy");
const CONTENT_DIR = path.join(REPO_ROOT, "src", "content");
const TYPES_FILE = path.join(CONTENT_DIR, "types.ts");

/** The Phase 5 economy modules; a new file must be added to this list. */
const EXPECTED_ECONOMY_FILES = [
  "cargo.ts",
  "market.ts",
  "ranrot.ts",
  "trade.ts",
] as const;

/** Player modules this phase changed; both are pure sim code. */
const PLAYER_FILES = [
  path.join(SIM_DIR, "player", "profile.ts"),
  path.join(SIM_DIR, "player", "outfitting.ts"),
] as const;

interface Violation {
  readonly file: string;
  readonly line: number;
  readonly message: string;
}

/** Remove `//` comments while preserving line numbers. */
function withoutLineComments(source: string): string {
  return source
    .split("\n")
    .map((line) => {
      const index = line.indexOf("//");
      return index === -1 ? line : line.slice(0, index);
    })
    .join("\n");
}

/** The 1-based line containing `index`. */
function lineAt(source: string, index: number): number {
  let line = 1;
  for (let cursor = 0; cursor < index; cursor += 1) {
    if (source[cursor] === "\n") line += 1;
  }
  return line;
}

interface ImportStatement {
  readonly specifier: string;
  readonly typeOnly: boolean;
  readonly index: number;
}

/**
 * Every static/dynamic import specifier, with its `import type` flag.
 *
 * The scan is intentionally simple: the sim modules use plain imports, and a
 * false negative here is caught by the matching ESLint rule and `tsc`.
 */
function importsOf(source: string): ImportStatement[] {
  const cleaned = withoutLineComments(source);
  const statements: ImportStatement[] = [];
  const patterns: ReadonlyArray<{
    readonly regex: RegExp;
    readonly typeOnly: (match: RegExpMatchArray) => boolean;
  }> = [
    {
      regex: /\bimport\s+(type\s+)?(?:[^"';]*?\s+from\s+)?["']([^"']+)["']/g,
      typeOnly: (match) => match[1] !== undefined,
    },
    {
      regex: /\bexport\s+(type\s+)?[^"';]*?\s+from\s+["']([^"']+)["']/g,
      typeOnly: (match) => match[1] !== undefined,
    },
    {
      regex: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
      typeOnly: () => false,
    },
  ];

  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern.regex)) {
      const specifier = match[2] ?? match[1];
      if (specifier === undefined) continue;
      statements.push({
        specifier,
        typeOnly: pattern.typeOnly(match),
        index: match.index ?? 0,
      });
    }
  }
  return statements;
}

/** Resolve a relative `.js` specifier to the TypeScript file it names. */
function resolveSpecifier(importer: string, specifier: string): string | null {
  if (!specifier.startsWith(".")) return null;
  const absolute = path.resolve(path.dirname(importer), specifier);
  return absolute.endsWith(".js") ? `${absolute.slice(0, -3)}.ts` : absolute;
}

/** Scan one source string as if it lived at `file`. */
function scanSource(file: string, source: string): Violation[] {
  const cleaned = withoutLineComments(source);
  const violations: Violation[] = [];

  const add = (pattern: RegExp, message: string): void => {
    for (const match of cleaned.matchAll(pattern)) {
      violations.push({
        file,
        line: lineAt(cleaned, match.index ?? 0),
        message,
      });
    }
  };

  add(/\bMath\s*\.\s*random\b/g, "uses the global random source");
  add(/\bDate\s*\.\s*now\b/g, "uses the wall clock");
  add(/\bnew\s+Date\b/g, "uses the wall clock");
  add(/\bperformance\s*\.\s*now\b/g, "uses the wall clock");
  add(/\bdocument\b/g, "touches the DOM");
  add(/\bwindow\b/g, "touches the DOM");

  for (const statement of importsOf(source)) {
    if (
      statement.specifier === "three" ||
      statement.specifier.startsWith("three/")
    ) {
      violations.push({
        file,
        line: lineAt(cleaned, statement.index),
        message: "imports Three.js",
      });
      continue;
    }

    const resolved = resolveSpecifier(file, statement.specifier);
    if (resolved === null || !resolved.startsWith(`${CONTENT_DIR}/`)) continue;

    // The one content door: `src/content/types.ts`, type-only. The `.js`
    // specifier is resolved above, so both nesting depths are handled by path.
    if (resolved === TYPES_FILE && statement.typeOnly) continue;
    violations.push({
      file,
      line: lineAt(cleaned, statement.index),
      message: `imports content at runtime or outside content/types: ${statement.specifier}`,
    });
  }

  return violations;
}

/** Every `.ts` file under `directory`, recursively. */
function listTsFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listTsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".ts")) files.push(full);
  }
  return files;
}

function economyFiles(): string[] {
  return listTsFiles(ECONOMY_DIR);
}

function assertedFiles(): string[] {
  return [...economyFiles(), ...PLAYER_FILES];
}

/** Extract one `case "name":` arm up to the next `case` label. */
function switchCaseBody(source: string, name: string): string {
  const start = source.search(new RegExp(`case\\s+"${name}"\\s*:`));
  if (start < 0) throw new Error(`Wegolite: no ${name} case in the session.`);
  const remainder = source.slice(start + 1);
  const next = remainder.search(/\n\s*case\s+["']/);
  return next < 0 ? source.slice(start) : source.slice(start, start + 1 + next);
}

/**
 * A two-field profile literal (`{ credits, equipment }`) loses cargo/fuel/
 * missiles/berths. A spread (`{ ...profile, credits, equipment }`) is the
 * correct shape and is deliberately allowed.
 */
const TWO_FIELD_PROFILE_LITERAL =
  /\{\s*(?:credits\s*(?::[^,}]*)?\s*,\s*equipment\s*(?::[^,}]*)?|equipment\s*(?::[^,}]*)?\s*,\s*credits\s*(?::[^,}]*)?)\s*\}/;

describe("the economy files are pure and deterministic", () => {
  it("scans every Phase 5 economy file and both player modules", () => {
    const economy = economyFiles();
    expect(economy.map((file) => path.basename(file)).sort()).toEqual(
      [...EXPECTED_ECONOMY_FILES].sort(),
    );
    // The count is asserted so a new economy file cannot be skipped silently.
    expect(assertedFiles()).toHaveLength(
      EXPECTED_ECONOMY_FILES.length + PLAYER_FILES.length,
    );
    expect(assertedFiles().some((file) => file.endsWith("profile.ts"))).toBe(
      true,
    );
  });

  it("finds no banned global, random, clock, DOM or content import", () => {
    for (const file of assertedFiles()) {
      expect(scanSource(file, readFileSync(file, "utf8")), file).toEqual([]);
    }
  });

  it("accepts content/types at both nesting depths, type-only", () => {
    expect(
      scanSource(
        path.join(SIM_DIR, "economy", "probe.ts"),
        'import type { Commodity } from "../../content/types.js";\n',
      ),
    ).toEqual([]);
    expect(
      scanSource(
        path.join(SIM_DIR, "probe.ts"),
        'import type { System } from "../content/types.js";\n',
      ),
    ).toEqual([]);
  });

  it("rejects a runtime content import in either direction", () => {
    const nested = scanSource(
      path.join(SIM_DIR, "economy", "probe.ts"),
      'import { loadEquipment } from "../../content/equipment.js";\n',
    );
    expect(nested).toHaveLength(1);
    expect(nested[0]?.message).toContain("content");

    const valueImportOfTypes = scanSource(
      path.join(SIM_DIR, "probe.ts"),
      'import { System } from "../content/types.js";\n',
    );
    expect(valueImportOfTypes).toHaveLength(1);
  });

  it("detects every banned API and a Three import", () => {
    const cases: ReadonlyArray<[string, string]> = [
      ["global random", "export const value = Math.random();\n"],
      ["wall clock", "export const value = Date.now();\n"],
      ["performance clock", "export const value = performance.now();\n"],
      ["Date construction", "export const value = new Date();\n"],
      ["document", "export const value = document.body;\n"],
      ["window", "export const value = window.innerWidth;\n"],
      ["three", 'import * as THREE from "three";\n'],
    ];
    for (const [name, source] of cases) {
      const violations = scanSource(
        path.join(SIM_DIR, "economy", "__purity_probe.ts"),
        source,
      );
      expect(violations, name).not.toEqual([]);
    }
  });
});

describe("the shell and session stay text-only and seed-bound", () => {
  it("never writes station markup as HTML", () => {
    const shell = path.join(REPO_ROOT, "src", "ui", "station.ts");
    const cleaned = withoutLineComments(readFileSync(shell, "utf8"));
    expect(cleaned).not.toMatch(/\.innerHTML\b/);
    expect(cleaned).not.toMatch(/insertAdjacentHTML/);
    expect(cleaned).not.toMatch(/\.outerHTML\b/);
  });

  it("never rebuilds a profile from a two-field credits/equipment literal", () => {
    // Positive/negative control for the scan itself.
    expect(TWO_FIELD_PROFILE_LITERAL.test("{ credits, equipment }")).toBe(true);
    expect(
      TWO_FIELD_PROFILE_LITERAL.test(
        "{ ...profile, credits: 10, equipment: ['EQ_FUEL'] }",
      ),
    ).toBe(false);
    expect(
      TWO_FIELD_PROFILE_LITERAL.test(
        "{ credits: 10, equipment: ['EQ_FUEL'], cargo: {} }",
      ),
    ).toBe(false);

    for (const file of [
      path.join(REPO_ROOT, "src", "app", "game-session.ts"),
      path.join(SIM_DIR, "player", "profile.ts"),
    ]) {
      const cleaned = withoutLineComments(readFileSync(file, "utf8"));
      expect(cleaned, file).not.toMatch(TWO_FIELD_PROFILE_LITERAL);
    }
  });

  it("generates the market only from a persisted or chained seed and never on dock", () => {
    const session = readFileSync(
      path.join(REPO_ROOT, "src", "app", "game-session.ts"),
      "utf8",
    );
    expect(session).not.toMatch(/\bDate\.now\b/);
    expect(session).not.toMatch(/\bperformance\.now\b/);

    // Exactly two producers: the boot system (resolved seed) and the arrival
    // system (the seed chained from the market actually installed, D-10).
    expect(session.match(/\bgenerateMarket\s*\(/g) ?? []).toHaveLength(2);
    expect(session).toMatch(/\bgenerateMarket\s*\([^)]*\bmarketSeed\b[^)]*\)/);
    expect(session).toMatch(
      /nextSeed\s*=\s*arrivalMarketSeed\s*\(\s*destination\.id\s*,\s*previousSeed\s*\)/,
    );
    expect(session).toMatch(
      /generateMarket\s*\(\s*destination\s*,\s*catalogue\s*,\s*nextSeed\s*\)/,
    );
    // A missing Phase 4 seed falls back to the deterministic system seed.
    expect(session).toMatch(
      /restoredMarketSeed\s*\?\?\s*marketSeedForSystem\s*\(\s*system\.id\s*\)/,
    );

    // The docked arm reuses the in-memory market: no generation, no re-seed.
    const docked = switchCaseBody(session, "docked");
    expect(docked).not.toMatch(/generateMarket/);
    expect(docked).not.toMatch(/marketSeedForSystem/);
    expect(docked).not.toMatch(/\bmarketSeed\s*=/);
  });
});

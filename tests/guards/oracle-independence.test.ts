// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independence guard for the NPC oracle tree (Phase 14, plan 14-01, T-14-02).
 *
 * The oracle exists so the port cannot validate itself (ROADMAP Phase 14
 * criterion 1). It therefore may not read Wegolite code, directly or through a
 * helper that does. This is a pure scan of `tests/oracles/**`, mechanical on
 * purpose: no text grep stands in for it.
 *
 * Rules, enforced on every `.ts` file under `tests/oracles`:
 *
 * - every static `import` / `export ... from` specifier, every `import type`,
 *   every dynamic `import()` and every `require()` must be a `node:` built-in,
 *   a bare package from {@link ALLOWED_PACKAGES}, or a relative specifier whose
 *   resolved path stays inside `tests/oracles` (this refuses `tests/helpers/*`,
 *   which import `src/`, and `tools/`);
 * - a dynamic import whose specifier is not a literal is refused;
 * - a string literal that is an argument of a file-system or path call and
 *   names a `src` path segment is refused (`readFileSync(new URL("../src/..."))`).
 *
 * The scanner is exercised on synthetic sources too, so a rule that silently
 * stopped matching would fail here (non-vacuity). What a scan cannot see, such
 * as a path assembled at run time, is a process rule recorded in the plan.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const ORACLE_ROOT = join(REPO_ROOT, "tests", "oracles");

/** Bare packages an oracle file may import. */
const ALLOWED_PACKAGES: readonly string[] = ["zod", "vitest"];

/** Calls whose string-literal arguments are file-system or path inputs. */
const PATH_CALLS = new Set([
  "readFileSync",
  "readFile",
  "readdirSync",
  "readdir",
  "existsSync",
  "statSync",
  "createReadStream",
  "URL",
  "join",
  "resolve",
]);

const SRC_SEGMENT = /(^|[\\/])src([\\/]|$)/;

function insideOracleRoot(path: string): boolean {
  return path === ORACLE_ROOT || path.startsWith(`${ORACLE_ROOT}${sep}`);
}

function specifierProblem(specifier: string, file: string): string | null {
  if (specifier.startsWith("node:")) return null;
  if (specifier.startsWith(".")) {
    const target = resolve(dirname(file), specifier);
    return insideOracleRoot(target)
      ? null
      : `relative import ${specifier} leaves tests/oracles`;
  }
  const isAllowed = ALLOWED_PACKAGES.some(
    (name) => specifier === name || specifier.startsWith(`${name}/`),
  );
  return isAllowed ? null : `import of ${specifier} is not allowed`;
}

function calleeName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return null;
}

function literalText(node: ts.Node): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

/** Every violation of the independence rules in one source file. */
export function scanSource(source: string, file: string): string[] {
  const problems: string[] = [];
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const checkSpecifier = (expression: ts.Node | undefined): void => {
    const text = expression === undefined ? null : literalText(expression);
    if (text === null) {
      problems.push("a module specifier is not a string literal");
      return;
    }
    const problem = specifierProblem(text, file);
    if (problem !== null) problems.push(problem);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      checkSpecifier(node.moduleSpecifier);
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined
    ) {
      checkSpecifier(node.moduleSpecifier);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      checkSpecifier(node.moduleReference.expression);
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      checkSpecifier(
        ts.isLiteralTypeNode(argument) ? argument.literal : undefined,
      );
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && callee.text === "require";
      if (isDynamicImport || isRequire) {
        checkSpecifier(node.arguments[0]);
      }
    }

    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const name = calleeName(node.expression);
      if (name !== null && PATH_CALLS.has(name)) {
        for (const argument of node.arguments ?? []) {
          const text = literalText(argument);
          if (text !== null && SRC_SEGMENT.test(text)) {
            problems.push(`${name}(...) names a src path: ${text}`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return problems;
}

function oracleFiles(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) found.push(...oracleFiles(path));
    else if (/\.(?:ts|tsx|mts|cts)$/.test(entry.name)) found.push(path);
  }
  return found.sort();
}

describe("oracle independence guard (T-14-02)", () => {
  it("finds the oracle files it is meant to scan", () => {
    const files = oracleFiles(ORACLE_ROOT);
    expect(files).toContain(join(ORACLE_ROOT, "npc", "schema.ts"));
    expect(files.length).toBeGreaterThanOrEqual(4);
  });

  it("finds no import of Wegolite code and no src file read under tests/oracles", () => {
    const violations: string[] = [];
    for (const file of oracleFiles(ORACLE_ROOT)) {
      for (const problem of scanSource(readFileSync(file, "utf8"), file)) {
        violations.push(`${file.slice(REPO_ROOT.length + 1)}: ${problem}`);
      }
    }
    expect(violations).toEqual([]);
  });

  describe("non-vacuity: the scanner refuses what it must", () => {
    const probe = join(ORACLE_ROOT, "npc", "probe.ts");

    it("accepts a clean source", () => {
      const clean = [
        'import { z } from "zod";',
        'import { readFileSync } from "node:fs";',
        'import { vec } from "./reference/vec.js";',
        'const data = readFileSync(new URL("./fixtures/a.json", import.meta.url), "utf8");',
        "export const x = z.string().parse(data);",
        "export { vec };",
      ].join("\n");
      expect(scanSource(clean, probe)).toEqual([]);
    });

    it("refuses a relative import that resolves into src/sim", () => {
      const source =
        'import { add } from "../../../src/sim/math.js";\nvoid add;\n';
      expect(scanSource(source, probe)).toHaveLength(1);
    });

    it("refuses an import of tests/helpers (they import src/)", () => {
      const source =
        'import { realHullTable } from "../../helpers/hull-table.js";\nvoid realHullTable;\n';
      expect(scanSource(source, probe)).toHaveLength(1);
    });

    it("refuses a bare package outside the allow-list", () => {
      const source = 'import * as THREE from "three";\nvoid THREE;\n';
      expect(scanSource(source, probe)).toHaveLength(1);
    });

    it("refuses a file read through a URL literal under src/", () => {
      const source = [
        'import { readFileSync } from "node:fs";',
        'export const hulls = readFileSync(new URL("../../../src/content/generated/ships-hulls.json", import.meta.url), "utf8");',
      ].join("\n");
      expect(scanSource(source, probe)).toHaveLength(1);
    });

    it("refuses a dynamic import, a require and a type import into src/", () => {
      expect(
        scanSource(
          'const m = await import("../../../src/sim/math.js");\nvoid m;\n',
          probe,
        ),
      ).toHaveLength(1);
      expect(
        scanSource(
          'const m = require("../../../src/sim/math.js");\nvoid m;\n',
          probe,
        ),
      ).toHaveLength(1);
      expect(
        scanSource(
          'export type T = import("../../../src/sim/math.js").Vec3;\n',
          probe,
        ),
      ).toHaveLength(1);
    });

    it("refuses a dynamic import whose specifier is not a literal", () => {
      const source =
        "const name = './x.js';\nconst m = await import(name);\nvoid m;\n";
      expect(scanSource(source, probe)).toHaveLength(1);
    });

    it("refuses join() naming the src directory", () => {
      const source = [
        'import { join } from "node:path";',
        'export const dir = join(process.cwd(), "src", "sim");',
      ].join("\n");
      expect(scanSource(source, probe)).toHaveLength(1);
    });
  });
});

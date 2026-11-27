// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The AI-11 harness stays out of the shipped app (T-14-09).
 *
 * `tools/ai-harness` runs Oolite's original JavaScript in `node:vm`; running
 * that JavaScript at runtime is rejected (REQUIREMENTS, Out of Scope) and its
 * licence story is different from the app's. The harness is therefore dev-only,
 * and this guard keeps the dependency one-way:
 *
 * - no file under `src/`, `public/`, nor `index.html`, nor any root
 *   `vite*.config.ts` imports a specifier that resolves into `tools/ai-harness`;
 * - none of those files contains the value of `AI_HARNESS_SENTINEL` (the string
 *   the harness puts on every vm global, which a bundle that included the
 *   harness would carry).
 *
 * The `__purity_*` probes the purity guards write under `src/` are skipped.
 *
 * A later plan adds the same check on the built `dist/`. The scanner has a
 * non-vacuity case: a synthetic source that imports the harness must be refused.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, posix } from "node:path";
import { describe, expect, it } from "vitest";

import { AI_HARNESS_SENTINEL } from "../../tools/ai-harness/host.js";
import { listFilesUnder } from "./source-scan.js";

const REPO_ROOT = process.cwd();

/** The root Vite configs the build uses; a rename or removal must be noticed. */
const KNOWN_VITE_CONFIGS = [
  "vite.config.ts",
  "vite.e2e.config.ts",
  "vite.seams.config.ts",
];

/** Files whose text can carry an import specifier. */
const SOURCE_EXTENSIONS = /\.(?:[cm]?[jt]sx?|html)$/;

interface Source {
  /** Repository-relative POSIX path. */
  readonly path: string;
  readonly bytes: Buffer;
}

interface Violation {
  readonly path: string;
  readonly reason: string;
}

function rootViteConfigs(): string[] {
  return readdirSync(REPO_ROOT)
    .filter((name) => /^vite.*\.config\.ts$/.test(name))
    .sort();
}

function shippedSources(): Source[] {
  const paths = [
    ...listFilesUnder("src"),
    ...listFilesUnder("public"),
    "index.html",
    ...rootViteConfigs(),
  ];
  return paths.map((path) => ({
    path,
    bytes: readFileSync(join(REPO_ROOT, path)),
  }));
}

/** Import specifiers in `from "x"`, `import "x"`, `import("x")`, `require("x")` and `src="x"` forms. */
function specifiersOf(text: string): string[] {
  const found: string[] = [];
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bsrc\s*=\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) {
        found.push(specifier);
      }
    }
  }
  return found;
}

/** Does `specifier`, written in `file`, resolve into `tools/ai-harness`? */
function reachesHarness(file: string, specifier: string): boolean {
  const resolved = specifier.startsWith(".")
    ? posix.normalize(posix.join(dirname(file), specifier))
    : posix.normalize(specifier);
  return /(?:^|\/)tools\/ai-harness(?:\/|$)/.test(resolved);
}

function findViolations(
  sources: readonly Source[],
  sentinel: string,
): Violation[] {
  const violations: Violation[] = [];
  const needle = Buffer.from(sentinel);
  for (const source of sources) {
    if (source.bytes.includes(needle)) {
      violations.push({
        path: source.path,
        reason: "contains the harness sentinel",
      });
    }
    if (SOURCE_EXTENSIONS.test(source.path)) {
      for (const specifier of specifiersOf(source.bytes.toString("utf8"))) {
        if (reachesHarness(source.path, specifier)) {
          violations.push({
            path: source.path,
            reason: `imports ${specifier}`,
          });
        }
      }
    }
  }
  return violations;
}

describe("harness isolation (T-14-09)", () => {
  it("the sentinel is a non-trivial constant", () => {
    expect(AI_HARNESS_SENTINEL.length).toBeGreaterThan(20);
  });

  it("walks every root Vite config, the seams config included", () => {
    expect(rootViteConfigs()).toEqual(
      expect.arrayContaining(KNOWN_VITE_CONFIGS),
    );
    const walked = shippedSources().map((source) => source.path);
    for (const name of KNOWN_VITE_CONFIGS) {
      expect(walked).toContain(name);
    }
    expect(walked).toContain("index.html");
    expect(walked.some((path) => path.startsWith("src/"))).toBe(true);
    expect(walked.some((path) => path.startsWith("public/"))).toBe(true);
  });

  it("nothing shipped imports the harness or carries its sentinel", () => {
    expect(findViolations(shippedSources(), AI_HARNESS_SENTINEL)).toEqual([]);
  });

  it("refuses a synthetic import of the harness (non-vacuity)", () => {
    const probe: Source = {
      path: "src/app/probe.ts",
      bytes: Buffer.from(
        'import { createStubHost } from "../../tools/ai-harness/host.js";\n',
      ),
    };
    expect(findViolations([probe], AI_HARNESS_SENTINEL)).toEqual([
      {
        path: "src/app/probe.ts",
        reason: "imports ../../tools/ai-harness/host.js",
      },
    ]);
  });

  it("refuses the other import forms and a vite config that reaches the harness", () => {
    const sources: Source[] = [
      {
        path: "src/app/a.ts",
        bytes: Buffer.from(
          'const m = await import("../../tools/ai-harness/load.js");',
        ),
      },
      {
        path: "src/app/b.ts",
        bytes: Buffer.from('import "../../tools/ai-harness/host.js";'),
      },
      {
        path: "vite.seams.config.ts",
        bytes: Buffer.from('import h from "./tools/ai-harness/host.ts";'),
      },
      {
        path: "index.html",
        bytes: Buffer.from(
          '<script type="module" src="/tools/ai-harness/host.ts"></script>',
        ),
      },
    ];
    expect(
      findViolations(sources, AI_HARNESS_SENTINEL).map((v) => v.path),
    ).toEqual([
      "src/app/a.ts",
      "src/app/b.ts",
      "vite.seams.config.ts",
      "index.html",
    ]);
  });

  it("refuses the sentinel in any file, text or binary", () => {
    const text: Source = {
      path: "src/app/leak.ts",
      bytes: Buffer.from(`const s = "${AI_HARNESS_SENTINEL}";`),
    };
    const binary: Source = {
      path: "public/models/leak.glb",
      bytes: Buffer.concat([
        Buffer.from([0, 1, 2, 255]),
        Buffer.from(AI_HARNESS_SENTINEL),
        Buffer.from([0]),
      ]),
    };
    expect(findViolations([text, binary], AI_HARNESS_SENTINEL)).toEqual([
      { path: "src/app/leak.ts", reason: "contains the harness sentinel" },
      {
        path: "public/models/leak.glb",
        reason: "contains the harness sentinel",
      },
    ]);
  });

  it("accepts an ordinary import (the scanner does not refuse everything)", () => {
    const fine: Source = {
      path: "src/app/ok.ts",
      bytes: Buffer.from(
        'import { thing } from "../sim/thing.js";\nimport "three";\n',
      ),
    };
    expect(findViolations([fine], AI_HARNESS_SENTINEL)).toEqual([]);
  });
});

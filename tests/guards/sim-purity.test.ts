// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative proof for FOUND-05 and the single input-frame seam (FLGT-08,
 * T-3-27).
 *
 * A clean-tree `verify` proves the gates are green on this tree; it cannot prove
 * they would notice a violation. Each case here writes a probe into `src/sim/`
 * at test time, runs the real gate against it, asserts the specific diagnostic,
 * and removes the probe again in a `finally` block.
 *
 * The probes are generated rather than committed on purpose: a committed file
 * importing Three inside the zone would fail the clean-tree `lint` run.
 *
 * The single-frame half is a source scan, not a configuration claim: the sim
 * owns exactly one `InputFrame` (`src/sim/state.ts`), `src/input/**` and
 * `src/app/**` declare no frame type of their own, and no `src/sim/**` file
 * imports the input layer. A duplicate frame would be a second device→step
 * seam, which is the thing FLGT-08 exists to prevent.
 */

import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { withProbeLock } from "./probe-lock.js";

const REPO_ROOT = process.cwd();
const SIM_DIR = join(REPO_ROOT, "src", "sim");
const SRC_DIR = join(REPO_ROOT, "src");

interface GateRun {
  status: number | null;
  output: string;
}

/** Run a gate in the repo root and return its exit status and combined output. */
function runGate(command: string, args: readonly string[]): GateRun {
  const result = spawnSync(command, [...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 180_000,
  });
  return {
    status: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

/**
 * Write a probe under `src/sim/` (the name may contain subdirectories) and make
 * sure it is never left behind.
 */
function withProbe(
  name: string,
  source: string,
  body: (file: string) => void,
): void {
  // `tsconfig.sim.json` globs `src/sim/**`, so a probe written by a parallel
  // guard file can be globbed and then deleted mid-run (TS6053). Serialise.
  withProbeLock(() => {
    const file = join("src", "sim", name);
    const absolute = join(REPO_ROOT, file);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, source);
    try {
      body(file);
    } finally {
      // Remove the file only: `src/sim/` and its real subdirectories must stay.
      rmSync(absolute, { force: true });
    }
  });
}

/** Every `.ts` file below `directory`, recursively. */
function listTsFiles(directory: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

/** Drop `//` comment lines so prose cannot satisfy or falsify a source scan. */
function withoutLineComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

const FRAME_DECLARATION =
  /^\s*(?:export\s+)?(?:interface|type)\s+([A-Za-z0-9_]*Frame[A-Za-z0-9_]*)\b/;

/**
 * Names of interface/type declarations that look like a device frame: the
 * declaration name contains `Frame` and its body lists both `pitch` and `roll`.
 */
function declaredFrameTypes(source: string): string[] {
  const lines = withoutLineComments(source).split("\n");
  const names: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = FRAME_DECLARATION.exec(line);
    if (match === null) continue;
    const name = match[1];
    if (name === undefined) continue;
    const body = lines.slice(index, index + 24).join("\n");
    if (/\bpitch\b/.test(body) && /\broll\b/.test(body)) names.push(name);
  }
  return names;
}

/** Module specifiers named by `import`/`export … from`/dynamic `import()`. */
function importSpecifiers(source: string): string[] {
  const cleaned = withoutLineComments(source);
  const patterns = [
    /\bfrom\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  const specifiers: string[] = [];
  for (const pattern of patterns) {
    for (const match of cleaned.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier !== undefined) specifiers.push(specifier);
    }
  }
  return specifiers;
}

describe("sim purity gates", () => {
  // Each case spawns the real gate, which builds a type-aware ESLint program;
  // that is several seconds on a loaded container, well past Vitest's 5s default.
  it("Three import fails lint", () => {
    const source = [
      'import * as THREE from "three";',
      "",
      "export const probe = new THREE.Vector3(1, 2, 3);",
      "",
    ].join("\n");

    withProbe("__purity_three_probe.ts", source, (file) => {
      const lint = runGate("npx", ["eslint", file]);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-imports/);
      expect(lint.output).toMatch(/renderer-free/);
    });
  }, 120_000);

  it("DOM identifier fails typecheck", () => {
    const source = [
      "// A DOM identifier in the sim zone: TS2584 against tsconfig.sim.json,",
      "// and no-restricted-globals against the ESLint zone.",
      'export const el = document.createElement("div");',
      "",
    ].join("\n");

    withProbe("__purity_dom_probe.ts", source, (file) => {
      const typecheck = runGate("npx", [
        "tsc",
        "-p",
        "tsconfig.sim.json",
        "--noEmit",
      ]);

      expect(typecheck.status).not.toBe(0);
      expect(typecheck.output).toMatch(/TS2584/);
      expect(typecheck.output).toMatch(/document/);

      // The compiler gate alone is not the whole story: ESLint must also name
      // the rule, so a future `lib` addition cannot quietly unenforce the zone.
      const lint = runGate("npx", ["eslint", file]);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-globals/);
    });
  }, 120_000);
});

describe("sim purity covers the flight and world modules", () => {
  // Plan 01 put real modules in `src/sim/flight/**` and `src/sim/world/**`.
  // The zone globs already cover them, but a probe inside each directory proves
  // the coverage is live rather than assumed.
  for (const directory of ["flight", "world"] as const) {
    it(`${directory}/ Three import fails lint`, () => {
      const source = [
        'import * as THREE from "three";',
        "",
        "export const probe = new THREE.Vector3(1, 2, 3);",
        "",
      ].join("\n");

      withProbe(join(directory, "__purity_three_probe.ts"), source, (file) => {
        const lint = runGate("npx", ["eslint", file]);

        expect(lint.status, lint.output).not.toBe(0);
        expect(lint.output).toMatch(/no-restricted-imports/);
        expect(lint.output).toMatch(/renderer-free/);
      });
    }, 120_000);

    it(`${directory}/ DOM identifier fails typecheck`, () => {
      const source = [
        'export const el = document.createElement("div");',
        "",
      ].join("\n");

      withProbe(join(directory, "__purity_dom_probe.ts"), source, (file) => {
        const typecheck = runGate("npx", [
          "tsc",
          "-p",
          "tsconfig.sim.json",
          "--noEmit",
        ]);

        expect(typecheck.status, typecheck.output).not.toBe(0);
        expect(typecheck.output).toMatch(/TS2584/);
        expect(typecheck.output).toMatch(/document/);

        const lint = runGate("npx", ["eslint", file]);
        expect(lint.status, lint.output).not.toBe(0);
        expect(lint.output).toMatch(/no-restricted-globals/);
      });
    }, 120_000);
  }
});

describe("the single sim-owned input frame", () => {
  it("declares InputFrame only in src/sim/state.ts", () => {
    const statePath = join(SIM_DIR, "state.ts");
    expect(declaredFrameTypes(readFileSync(statePath, "utf8"))).toEqual([
      "InputFrame",
    ]);

    const others = listTsFiles(SIM_DIR).filter((file) => file !== statePath);
    expect(others.length).toBeGreaterThan(0);
    for (const file of others) {
      expect(declaredFrameTypes(readFileSync(file, "utf8")), file).toEqual([]);
    }
  });

  it("declares no second frame type in src/input or src/app", () => {
    for (const directory of [join(SRC_DIR, "input"), join(SRC_DIR, "app")]) {
      const files = listTsFiles(directory);
      // Vacuity guard: a broken walk must fail rather than pass on an empty
      // list.
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(declaredFrameTypes(readFileSync(file, "utf8")), file).toEqual(
          [],
        );
      }
    }
  });

  it("never imports the input layer from src/sim", () => {
    const files = listTsFiles(SIM_DIR);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const offending = importSpecifiers(readFileSync(file, "utf8")).filter(
        (specifier) => specifier.includes("input"),
      );
      expect(offending, `${file} imports the input layer`).toEqual([]);
    }
  });
});

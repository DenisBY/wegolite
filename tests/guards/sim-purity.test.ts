// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative proof for FOUND-05 and the single input-frame seam (FLGT-08,
 * T-3-27).
 *
 * A clean-tree `verify` proves the gates are green on this tree; it cannot prove
 * they would notice a violation. Each case here writes a probe into `src/sim/`
 * at test time, runs the real gate (the shared ESLint Node API) against it,
 * asserts the specific diagnostic, and removes the probe again in a `finally`
 * block.
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
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lintProbe } from "./eslint-gate.js";
import { withSimProbe } from "./sim-probe.js";
import { withoutComments } from "./source-scan.js";

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
 * sure it is never left behind. The shared helper takes the probe lock,
 * normalises the basename to `__purity_*`, prepends the SPDX header and removes
 * every file and directory it created.
 */
const withProbe = withSimProbe;

/**
 * Every `.ts` file below `directory`, recursively. `__purity_*` entries are
 * skipped (another guard file may be writing a probe right now), and an entry
 * that vanishes between the listing and the read is ignored rather than thrown.
 */
function listTsFiles(directory: string): string[] {
  const files: string[] = [];
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return files;
    throw error;
  }
  for (const entry of entries) {
    if (entry.name.startsWith("__purity_")) continue;
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      files.push(full);
    }
  }
  return files;
}

const FRAME_DECLARATION =
  /^[ \t]*(?:export\s+)?(?:interface|type)\s+([A-Za-z0-9_]*Frame[A-Za-z0-9_]*)\b/gm;

/**
 * The full text of a declaration that starts at `from`: up to the brace that
 * closes its body (an `interface` or object-literal `type`), or up to the
 * terminating `;` (a single-expression `type`), whichever opens first.
 */
function declarationBody(source: string, from: number): string {
  let depth = 0;
  for (let index = from; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(from, index + 1);
    } else if (char === ";" && depth === 0) {
      return source.slice(from, index + 1);
    }
  }
  return source.slice(from);
}

/**
 * Names of interface/type declarations that look like a device frame: the
 * declaration name contains `Frame` and its whole body (to the matching closing
 * brace, however long) lists both `pitch` and `roll`. Comments never count.
 */
function declaredFrameTypes(source: string): string[] {
  const cleaned = withoutComments(source);
  const names: string[] = [];
  for (const match of cleaned.matchAll(FRAME_DECLARATION)) {
    const name = match[1];
    if (name === undefined) continue;
    const body = declarationBody(cleaned, match.index + match[0].length);
    if (/\bpitch\b/.test(body) && /\broll\b/.test(body)) names.push(name);
  }
  return names;
}

/** Module specifiers named by `import`/`export … from`/dynamic `import()`. */
function importSpecifiers(source: string): string[] {
  const cleaned = withoutComments(source);
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
  // The first lint builds the type-aware ESLint program (~3.5 s); the shared
  // instance then reuses it, so the per-test timeout covers only a cold, loaded
  // container plus the `tsc` spawn.
  it("Three import fails lint", async () => {
    const source = [
      'import * as THREE from "three";',
      "",
      "export const probe = new THREE.Vector3(1, 2, 3);",
      "",
    ].join("\n");

    await withProbe("__purity_three_probe.ts", source, async (file) => {
      const lint = await lintProbe(file);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-imports/);
      expect(lint.output).toMatch(/renderer-free/);
    });
  }, 120_000);

  it("DOM identifier fails typecheck", async () => {
    const source = [
      "// A DOM identifier in the sim zone: TS2584 against tsconfig.sim.json,",
      "// and no-restricted-globals against the ESLint zone.",
      'export const el = document.createElement("div");',
      "",
    ].join("\n");

    await withProbe("__purity_dom_probe.ts", source, async (file) => {
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
      const lint = await lintProbe(file);

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
    it(`${directory}/ Three import fails lint`, async () => {
      const source = [
        'import * as THREE from "three";',
        "",
        "export const probe = new THREE.Vector3(1, 2, 3);",
        "",
      ].join("\n");

      await withProbe(
        join(directory, "__purity_three_probe.ts"),
        source,
        async (file) => {
          const lint = await lintProbe(file);

          expect(lint.status, lint.output).not.toBe(0);
          expect(lint.output).toMatch(/no-restricted-imports/);
          expect(lint.output).toMatch(/renderer-free/);
        },
      );
    }, 120_000);

    it(`${directory}/ DOM identifier fails typecheck`, async () => {
      const source = [
        'export const el = document.createElement("div");',
        "",
      ].join("\n");

      await withProbe(
        join(directory, "__purity_dom_probe.ts"),
        source,
        async (file) => {
          const typecheck = runGate("npx", [
            "tsc",
            "-p",
            "tsconfig.sim.json",
            "--noEmit",
          ]);

          expect(typecheck.status, typecheck.output).not.toBe(0);
          expect(typecheck.output).toMatch(/TS2584/);
          expect(typecheck.output).toMatch(/document/);

          const lint = await lintProbe(file);
          expect(lint.status, lint.output).not.toBe(0);
          expect(lint.output).toMatch(/no-restricted-globals/);
        },
      );
    }, 120_000);
  }
});

describe("frame declaration scanning", () => {
  const filler = Array.from({ length: 40 }, (_, i) => `  field${i}: number;`);

  it("detects pitch and roll past the old 24-line window", () => {
    const source = [
      "export interface DeviceFrame {",
      ...filler,
      "  pitch: number;",
      "  roll: number;",
      "}",
    ].join("\n");

    expect(declaredFrameTypes(source)).toEqual(["DeviceFrame"]);
  });

  it("detects a frame declared after a block comment", () => {
    const source = [
      "/**",
      " * Not a frame: interface FakeFrame { pitch: number; roll: number }",
      " */",
      "export type StickFrame = {",
      ...filler,
      "  pitch: number;",
      "  roll: number;",
      "};",
    ].join("\n");

    expect(declaredFrameTypes(source)).toEqual(["StickFrame"]);
  });

  it("detects a single-expression type up to its semicolon", () => {
    const source =
      'export type AxisFrame = Readonly<Pick<Axes, "pitch" | "roll">>;\n';

    expect(declaredFrameTypes(source)).toEqual(["AxisFrame"]);
  });

  it("ignores pitch and roll that only appear in comments", () => {
    const source = [
      "export interface QuietFrame {",
      "  /* pitch: number; roll: number; */",
      "  // pitch roll",
      "  yaw: number;",
      "}",
    ].join("\n");

    expect(declaredFrameTypes(source)).toEqual([]);
  });

  it("does not let one declaration's body satisfy the next", () => {
    const source = [
      "export interface OneFrame {",
      "  pitch: number;",
      "}",
      "export interface TwoFrame {",
      "  roll: number;",
      "}",
    ].join("\n");

    expect(declaredFrameTypes(source)).toEqual([]);
  });

  it("keeps string literals that contain comment markers", () => {
    const source = 'import x from "http://example.test/a";\n';

    expect(importSpecifiers(source)).toEqual(["http://example.test/a"]);
  });
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

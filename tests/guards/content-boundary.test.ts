// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative and positive proof of the `src/content` boundary (D-16, S-5).
 *
 * A clean-tree `lint` proves the sim zone is green; it cannot prove the zone
 * would notice a runtime content import. Each case writes a probe into
 * `src/sim/` at test time, runs the real gate against it, asserts the specific
 * diagnostic, and removes the probe in `finally`.
 *
 * The positive case matters as much as the negatives: the boundary must keep
 * the type-only door open. If the zone denied `content/types` too, a future
 * author would widen the rule to make a legitimate import compile instead of
 * using the door — and widen it for runtime content as well.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const SIM_DIR = join(REPO_ROOT, "src", "sim");

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

/** Write a probe under src/sim/ and make sure it is never left behind. */
function withProbe(
  name: string,
  source: string,
  body: (file: string) => void,
): void {
  mkdirSync(SIM_DIR, { recursive: true });
  const file = join("src", "sim", name);
  writeFileSync(join(REPO_ROOT, file), source);
  try {
    body(file);
  } finally {
    // Remove the file only: `src/sim/` is a real source directory and must stay.
    rmSync(join(REPO_ROOT, file), { force: true });
  }
}

describe("src/content boundary", () => {
  it("fails lint when the sim imports the runtime content index", () => {
    const source = [
      'import { assertContentManifest } from "../content/index.js";',
      "",
      "export const probe = assertContentManifest;",
      "",
    ].join("\n");

    withProbe("__purity_content_probe.ts", source, (file) => {
      const lint = runGate("npx", ["eslint", file]);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-imports/);
      expect(lint.output).toContain("content/types");
    });
  }, 60_000);

  it("fails lint when the sim imports a schema module", () => {
    const source = [
      'import { SystemSchema } from "../content/schemas/system.js";',
      "",
      "export const probe = SystemSchema;",
      "",
    ].join("\n");

    withProbe("__purity_schema_probe.ts", source, (file) => {
      const lint = runGate("npx", ["eslint", file]);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-imports/);
      expect(lint.output).toContain("content/types");
    });
  }, 60_000);

  it("allows the type-only door through both ESLint and the sim typecheck", () => {
    const source = [
      'import type { System } from "../content/types.js";',
      "",
      "export type Probe = System;",
      "",
    ].join("\n");

    withProbe("__purity_type_probe.ts", source, (file) => {
      const lint = runGate("npx", ["eslint", file]);
      expect(lint.status, lint.output).toBe(0);

      const typecheck = runGate("npx", [
        "tsc",
        "-p",
        "tsconfig.sim.json",
        "--noEmit",
      ]);
      expect(typecheck.status, typecheck.output).toBe(0);
    });
  }, 180_000);
});

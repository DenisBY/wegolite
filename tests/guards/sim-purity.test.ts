// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative proof for FOUND-05: the two sim-purity gates CAN fail.
 *
 * A clean-tree `verify` proves the gates are green on this tree; it cannot prove
 * they would notice a violation. Each case here writes a probe into `src/sim/`
 * at test time, runs the real gate against it, asserts the specific diagnostic,
 * and removes the probe again in a `finally` block.
 *
 * The probes are generated rather than committed on purpose: a committed file
 * importing Three inside the zone would fail the clean-tree `lint` run.
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

describe("sim purity gates", () => {
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
  });

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
  });
});

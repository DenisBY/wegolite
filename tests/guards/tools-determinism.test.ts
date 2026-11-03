// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative proof for DATA-08: the generator's determinism zone CAN fail.
 *
 * A clean-tree `lint` proves the zone is green on this tree; it cannot prove it
 * would notice a banned API. Each case here writes a probe under
 * `tools/oolite-ingest/` at test time, runs the real ESLint gate against it,
 * asserts the specific diagnostic, and removes the probe again in a `finally`
 * block. One positive case proves the zone does not over-reach: the safe Math
 * surface (`sqrt`, `min`, `imul`, `fround`) still passes.
 *
 * The probes are generated rather than committed on purpose: a committed file
 * calling `Math.sin` inside the zone would fail the clean-tree `lint` run.
 * They carry the `__purity_` prefix so `tests/compliance.test.ts` skips them
 * while the suite is mid-run.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const TOOLS_DIR = join(REPO_ROOT, "tools", "oolite-ingest");

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

/** Write a probe under tools/oolite-ingest/ and make sure it is never left behind. */
function withProbe(
  name: string,
  source: string,
  body: (file: string) => void,
): void {
  mkdirSync(TOOLS_DIR, { recursive: true });
  const file = join("tools", "oolite-ingest", name);
  writeFileSync(join(REPO_ROOT, file), source);
  try {
    body(file);
  } finally {
    // Remove the file only: `tools/oolite-ingest/` is a real source directory.
    rmSync(join(REPO_ROOT, file), { force: true });
  }
}

/** Lint one probe through the real root config, zone included. */
function lintProbe(file: string): GateRun {
  return runGate("npx", ["eslint", file]);
}

describe("tools determinism zone", () => {
  // Each case spawns the real gate, which builds a type-aware ESLint program;
  // that is several seconds on a loaded container, past Vitest's 5s default.
  it("Math.sin fails lint with the determinism reason", () => {
    const source = ["export const value = Math.sin(1);", ""].join("\n");

    withProbe("__purity_math_probe.ts", source, (file) => {
      const lint = lintProbe(file);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-properties/);
      expect(lint.output).toMatch(/Math\.sin|determinism|architecture/i);
    });
  }, 30_000);

  it("toFixed fails lint", () => {
    const source = ["export const value = (1.5).toFixed(2);", ""].join("\n");

    withProbe("__purity_tofixed_probe.ts", source, (file) => {
      const lint = lintProbe(file);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-syntax/);
      expect(lint.output).toMatch(/toFixed/);
    });
  }, 30_000);

  it("new Date() fails lint", () => {
    const source = ["export const value = new Date();", ""].join("\n");

    withProbe("__purity_date_probe.ts", source, (file) => {
      const lint = lintProbe(file);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-syntax/);
      expect(lint.output).toMatch(/Date/);
    });
  }, 30_000);

  it("Intl.NumberFormat fails lint via no-restricted-globals", () => {
    const source = [
      'export const format = new Intl.NumberFormat("en");',
      "",
    ].join("\n");

    withProbe("__purity_intl_probe.ts", source, (file) => {
      const lint = lintProbe(file);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-globals/);
      expect(lint.output).toMatch(/Intl/);
    });
  }, 30_000);

  it("the safe Math surface passes lint", () => {
    const source = [
      "export const root = Math.sqrt(2);",
      "export const min = Math.min(1, 2);",
      "export const max = Math.max(1, 2);",
      "export const abs = Math.abs(-1);",
      "export const floor = Math.floor(1.5);",
      "export const round = Math.round(1.5);",
      "export const ceil = Math.ceil(1.5);",
      "export const imul = Math.imul(1, 2);",
      "export const fround = Math.fround(1.5);",
      "",
    ].join("\n");

    withProbe("__purity_safe_math_probe.ts", source, (file) => {
      const lint = lintProbe(file);

      expect(lint.output).not.toMatch(/no-restricted-properties/);
      expect(lint.output).not.toMatch(/no-restricted-syntax/);
      expect(lint.status).toBe(0);
    });
  }, 30_000);
});

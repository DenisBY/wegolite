// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative and positive proof of the `src/content` boundary (D-16, S-5), plus
 * the Phase 3 settings and ship-catalogue denials (FLGT-03, FLGT-06, T-3-26).
 *
 * A clean-tree `lint` proves the sim zone is green; it cannot prove the zone
 * would notice a runtime content import. Each case writes a probe into
 * `src/sim/` at test time, lints it with the real root config through the shared
 * ESLint Node API, asserts the specific diagnostic, and removes the probe in
 * `finally`.
 *
 * The positive case matters as much as the negatives: the boundary must keep
 * the type-only door open. If the zone denied `content/types` too, a future
 * author would widen the rule to make a legitimate import compile instead of
 * using the door — and widen it for runtime content as well.
 *
 * The settings denial is proved by a *pair* of probes with the same import
 * line: one under `src/sim/` must fail ESLint with the configured
 * `no-restricted-imports` message, and one under `src/app/` must pass. Since
 * `src/settings/` exists (plan 06), a module-resolution failure cannot
 * masquerade as the layer rule, and the passing control makes the failing half
 * attributable to the zone rather than to a broken import.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { lintProbe, type GateMessage } from "./eslint-gate.js";
import { withProbeLock } from "./probe-lock.js";

const REPO_ROOT = process.cwd();
const SIM_DIR = join(REPO_ROOT, "src", "sim");

const SHIPS_MESSAGE = "src/sim must not import the ship catalogue";
const SETTINGS_MESSAGE = "src/sim must not import the settings layer";

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
 * The `no-restricted-imports` diagnostic carrying `expectedMessage` as its
 * configured message. ESLint prefixes the custom message with the matched
 * specifier (`'…' import is restricted from being used by a pattern. <message>`),
 * so the configured text is the exact suffix.
 */
function findRestriction(
  messages: readonly GateMessage[],
  expectedMessage: string,
): GateMessage | undefined {
  return messages.find(
    (message) =>
      message.ruleId === "no-restricted-imports" &&
      message.message.endsWith(expectedMessage),
  );
}

/** Write a probe under `directory` (relative to the repo root) and clean it up. */
function withProbeAt(
  directory: string,
  name: string,
  source: string,
  body: (file: string) => Promise<void> | void,
): Promise<void> {
  // `tsconfig.sim.json` globs `src/sim/**`, so a probe written by a parallel
  // guard file can be globbed and then deleted mid-run (TS6053). Serialise.
  return withProbeLock(async () => {
    mkdirSync(join(REPO_ROOT, directory), { recursive: true });
    const file = join(directory, name);
    writeFileSync(join(REPO_ROOT, file), source);
    try {
      await body(file);
    } finally {
      // Remove the file only: the source directory must stay.
      rmSync(join(REPO_ROOT, file), { force: true });
    }
  });
}

/** Write a probe under src/sim/ and make sure it is never left behind. */
function withProbe(
  name: string,
  source: string,
  body: (file: string) => Promise<void> | void,
): Promise<void> {
  return withProbeAt(join("src", "sim"), name, source, body);
}

describe("src/content boundary", () => {
  it("fails lint when the sim imports the runtime content index", async () => {
    const source = [
      'import { assertContentManifest } from "../content/index.js";',
      "",
      "export const probe = assertContentManifest;",
      "",
    ].join("\n");

    await withProbe("__purity_content_probe.ts", source, async (file) => {
      const lint = await lintProbe(file);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-imports/);
      expect(lint.output).toContain("content/types");
    });
  }, 180_000);

  it("fails lint when the sim imports a schema module", async () => {
    const source = [
      'import { SystemSchema } from "../content/schemas/system.js";',
      "",
      "export const probe = SystemSchema;",
      "",
    ].join("\n");

    await withProbe("__purity_schema_probe.ts", source, async (file) => {
      const lint = await lintProbe(file);

      expect(lint.status).not.toBe(0);
      expect(lint.output).toMatch(/no-restricted-imports/);
      expect(lint.output).toContain("content/types");
    });
  }, 180_000);

  it("allows the type-only door through both ESLint and the sim typecheck", async () => {
    const source = [
      'import type { System } from "../content/types.js";',
      "",
      "export type Probe = System;",
      "",
    ].join("\n");

    await withProbe("__purity_type_probe.ts", source, async (file) => {
      const lint = await lintProbe(file);
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

describe("the Phase 3 layer denials", () => {
  it("denies the ship catalogue by rule message and a real tsc failure", async () => {
    const source = [
      'import { loadShipCatalogue } from "../content/ships.js";',
      "",
      "export const probe = loadShipCatalogue;",
      "",
    ].join("\n");

    await withProbe("__purity_ships_probe.ts", source, async (file) => {
      const lint = await lintProbe(file);
      expect(lint.status, lint.output).not.toBe(0);

      const diagnostic = findRestriction(lint.messages, SHIPS_MESSAGE);
      expect(diagnostic, lint.output).toBeDefined();
      expect(diagnostic?.message).toContain("../content/ships.js");
      expect(diagnostic?.messageId).toBe("patternWithCustomMessage");

      // `src/content/ships.ts` exists, so the compiler half is non-vacuous:
      // the probe must fail `tsc`, and not because the module is missing.
      const typecheck = runGate("npx", [
        "tsc",
        "-p",
        "tsconfig.sim.json",
        "--noEmit",
      ]);
      expect(typecheck.status).not.toBe(0);
      expect(typecheck.output).not.toMatch(/TS2307/);
      expect(typecheck.output).toMatch(/ships\.ts/);
    });

    // The probe is removed in `finally`, even though the gate ran above.
    expect(existsSync(join(SIM_DIR, "__purity_ships_probe.ts"))).toBe(false);
  }, 180_000);

  it("denies the settings layer under src/sim but allows the same import under src/app", async () => {
    // The same import line in both probes: one failing and one passing is what
    // makes the result attributable to the *zone*, not to a missing module.
    // `src/settings/` exists (plan 06), so a module-resolution failure cannot
    // masquerade as the layer rule.
    const source = [
      'import { validateSettings } from "../settings/schema.js";',
      "",
      "export const probe = validateSettings;",
      "",
    ].join("\n");

    await withProbeAt(
      join("src", "sim"),
      "__purity_settings_sim_probe.ts",
      source,
      async (file) => {
        const lint = await lintProbe(file);
        expect(lint.status, lint.output).not.toBe(0);

        const diagnostic = findRestriction(lint.messages, SETTINGS_MESSAGE);
        expect(diagnostic, lint.output).toBeDefined();
        expect(diagnostic?.message).toContain("../settings/schema.js");
        expect(diagnostic?.messageId).toBe("patternWithCustomMessage");
        expect(diagnostic?.ruleId).toBe("no-restricted-imports");
      },
    );

    await withProbeAt(
      join("src", "app"),
      "__purity_settings_app_probe.ts",
      source,
      async (file) => {
        const lint = await lintProbe(file);
        // The control: the app layer may import the settings module, so the sim
        // denial above is the zone rule and not a broken import.
        expect(lint.status, lint.output).toBe(0);
        expect(lint.messages).toEqual([]);
      },
    );

    expect(existsSync(join(SIM_DIR, "__purity_settings_sim_probe.ts"))).toBe(
      false,
    );
    expect(
      existsSync(
        join(REPO_ROOT, "src", "app", "__purity_settings_app_probe.ts"),
      ),
    ).toBe(false);
  }, 180_000);

  it("removes the probe even when the body throws", async () => {
    const name = "__purity_cleanup_probe.ts";
    await expect(
      withProbe(name, "export const probe = 1;\n", () => {
        throw new Error("expected cleanup test failure");
      }),
    ).rejects.toThrow("expected cleanup test failure");
    expect(existsSync(join(SIM_DIR, name))).toBe(false);
  }, 180_000);
});

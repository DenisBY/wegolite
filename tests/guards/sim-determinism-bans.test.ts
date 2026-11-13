// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Negative proof for the src/sim determinism bans (FOUND-12, plan 08-03).
 *
 * A clean-tree `lint` proves the tree is green; it cannot prove the rules would
 * notice a violation. Each case writes a probe under `src/sim/` (through
 * `withSimProbe`: probe lock, `__purity_` name, SPDX header, full cleanup), lints
 * it through the real root config, and asserts the rule id and a fragment of the
 * configured message. Each ban has a positive control that lints clean.
 */

import { describe, expect, it } from "vitest";

import { lintProbe } from "./eslint-gate.js";
import { withSimProbe } from "./sim-probe.js";

const TIMEOUT = 120_000;

describe("src/sim determinism bans: for..in", () => {
  it(
    "for..in over an object fails lint",
    async () => {
      const source = [
        "export function keysOf(o: Record<string, number>): string[] {",
        "  const out: string[] = [];",
        "  for (const k in o) out.push(k);",
        "  return out;",
        "}",
        "",
      ].join("\n");

      await withSimProbe("__ban_for_in.ts", source, async (file) => {
        const lint = await lintProbe(file);

        expect(lint.status, lint.output).toBe(1);
        expect(lint.messages.map((m) => m.ruleId)).toContain(
          "no-restricted-syntax",
        );
        expect(lint.output).toContain("for..in");
      });
    },
    TIMEOUT,
  );

  it(
    "positive control: for..of over an array lints clean",
    async () => {
      const source = [
        "export function total(xs: readonly number[]): number {",
        "  let sum = 0;",
        "  for (const x of xs) sum += x;",
        "  return sum;",
        "}",
        "",
      ].join("\n");

      await withSimProbe("__purity_ok_for_of.ts", source, async (file) => {
        const lint = await lintProbe(file);

        expect(lint.status, lint.output).toBe(0);
      });
    },
    TIMEOUT,
  );
});

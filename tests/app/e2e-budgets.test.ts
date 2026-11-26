// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The inclusive boundary of the shared browser budgets (plan 21-19, DATA-18).
 *
 * This file lives under `tests/app/`, not `tests/e2e/`: Playwright's `testDir`
 * is `tests/e2e` and its default `testMatch` collects `*.test.ts` there too, so
 * a Vitest file beside the specs would be run by Playwright. It imports the e2e
 * helper the way `tests/app/probe-shape-compare.test.ts` does.
 */

import { describe, expect, it } from "vitest";

import {
  DRAW_CALL_BUDGET,
  FIRST_LOAD_BYTES_CEILING,
  TRIANGLE_BUDGET,
  withinBudget,
} from "../e2e/helpers/budgets.js";

describe("the shared browser budgets", () => {
  it("hold the recorded values", () => {
    expect(DRAW_CALL_BUDGET).toBe(50);
    expect(TRIANGLE_BUDGET).toBe(250_000);
    expect(FIRST_LOAD_BYTES_CEILING).toBe(9_437_184);
  });

  for (const [name, budget] of [
    ["DRAW_CALL_BUDGET", DRAW_CALL_BUDGET],
    ["TRIANGLE_BUDGET", TRIANGLE_BUDGET],
  ] as const) {
    describe(`withinBudget against ${name}`, () => {
      it("passes a count equal to the budget (inclusive)", () => {
        expect(withinBudget(budget, budget)).toBe(true);
      });

      it("passes one and a count just below the budget", () => {
        expect(withinBudget(1, budget)).toBe(true);
        expect(withinBudget(budget - 1, budget)).toBe(true);
      });

      it("fails one above the budget", () => {
        expect(withinBudget(budget + 1, budget)).toBe(false);
      });

      it("fails zero, so a blank frame cannot pass", () => {
        expect(withinBudget(0, budget)).toBe(false);
      });

      it("fails a negative or non-finite count (a probe that never reported)", () => {
        expect(withinBudget(-1, budget)).toBe(false);
        expect(withinBudget(Number.NaN, budget)).toBe(false);
        expect(withinBudget(Number.POSITIVE_INFINITY, budget)).toBe(false);
      });
    });
  }
});

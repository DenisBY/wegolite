// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `?test=1` flag table (Phase 8, D-09, D-10, threats T-08-26 and T-08-31).
 *
 * Expected values are written out from the decision text: only exactly
 * `test=1` enables anything, `clock=manual` and `traffic=1` are inert without
 * it, and `traffic` is the effective setting (true in production, `traffic=1`
 * under the hook).
 */

import { describe, expect, it } from "vitest";

import { parseTestFlags } from "../../../src/app/session/test-flags.js";
import type { TestFlags } from "../../../src/app/session/test-flags.js";

const table: readonly (readonly [string, TestFlags])[] = [
  ["", { hook: false, manualClock: false, traffic: true }],
  ["?test=1", { hook: true, manualClock: false, traffic: false }],
  ["?test=1&traffic=1", { hook: true, manualClock: false, traffic: true }],
  ["?test=1&clock=manual", { hook: true, manualClock: true, traffic: false }],
  [
    "?test=1&clock=manual&traffic=1",
    { hook: true, manualClock: true, traffic: true },
  ],
  // The flags are inert without the hook.
  [
    "?clock=manual&traffic=0",
    { hook: false, manualClock: false, traffic: true },
  ],
  ["?test=2&traffic=1", { hook: false, manualClock: false, traffic: true }],
  // Exact comparisons only.
  ["?test=1&traffic=true", { hook: true, manualClock: false, traffic: false }],
  ["?test=1&clock=MANUAL", { hook: true, manualClock: false, traffic: false }],
  // URLSearchParams.get returns the first value of a repeated key.
  ["?test=1&test=2", { hook: true, manualClock: false, traffic: false }],
];

describe("parseTestFlags", () => {
  it.each(table)("parses %j exactly", (search, expected) => {
    expect(parseTestFlags(search)).toEqual(expected);
  });

  it("is pure: the same input gives an equal result each time", () => {
    expect(parseTestFlags("?test=1&clock=manual")).toEqual(
      parseTestFlags("?test=1&clock=manual"),
    );
  });
});

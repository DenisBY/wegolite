// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The AI time base (D-11). Expected values come from Oolite: AI_THINK_INTERVAL
 * is 0.125 s (src/Core/AI.h) and the fixed step is 1/120 s.
 */

import { describe, expect, it } from "vitest";

import {
  THINK_INTERVAL_TICKS,
  TICKS_PER_SECOND,
  ticks,
} from "../../../src/sim/ai/time.js";
import { DT } from "../../../src/sim/step.js";

describe("the AI time base", () => {
  it("TICKS_PER_SECOND * DT is exactly one second", () => {
    expect(TICKS_PER_SECOND * DT).toBe(1);
  });

  it("the think interval is Oolite's 0.125 s", () => {
    expect(THINK_INTERVAL_TICKS).toBe(15);
    expect(ticks(0.125)).toBe(THINK_INTERVAL_TICKS);
  });

  it("converts seconds to whole ticks, at least one", () => {
    expect(ticks(1)).toBe(120);
    expect(ticks(0.1)).toBe(12);
    expect(ticks(0)).toBe(1);
    expect(ticks(0.001)).toBe(1);
    expect(Number.isSafeInteger(ticks(1.6))).toBe(true);
  });

  it("throws RangeError for a negative or non-finite argument", () => {
    expect(() => ticks(-1)).toThrow(RangeError);
    expect(() => ticks(Number.NaN)).toThrow(RangeError);
    expect(() => ticks(Number.POSITIVE_INFINITY)).toThrow(RangeError);
    expect(() => ticks(Number.NEGATIVE_INFINITY)).toThrow(RangeError);
  });
});

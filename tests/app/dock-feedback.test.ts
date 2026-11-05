// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Deterministic docking feedback (D-08, A3, T-04-17).
 *
 * The probe publishes the envelope *strength*, so the assertion that it is
 * strictly positive immediately after the trigger is the one that matters: a
 * sinusoid would be zero at the trigger instant and this test would catch it.
 */

import { describe, expect, it } from "vitest";

import {
  createDockFeedback,
  FLASH_SECONDS,
  SHAKE_SECONDS,
} from "../../src/app/dock-feedback.js";
import { length } from "../../src/sim/math.js";

describe("dock feedback envelopes", () => {
  it("is at full strength at the trigger instant, not zero", () => {
    const feedback = createDockFeedback();
    feedback.trigger("bounce", 10);

    expect(feedback.shakeStrength(10)).toBe(1);
    expect(feedback.flashAlpha(10)).toBe(1);
    expect(length(feedback.shakeOffset(10))).toBeGreaterThan(0);
  });

  it("decays linearly and expires inside D-08's 0.3-0.5 s window", () => {
    const feedback = createDockFeedback();
    feedback.trigger("bounce", 10);

    expect(feedback.shakeStrength(10 + SHAKE_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(feedback.flashAlpha(10 + FLASH_SECONDS / 2)).toBeCloseTo(0.5, 9);
    expect(feedback.shakeStrength(10 + SHAKE_SECONDS)).toBe(0);
    expect(feedback.flashAlpha(10 + FLASH_SECONDS)).toBe(0);
    expect(feedback.shakeOffset(10 + SHAKE_SECONDS)).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });

    expect(SHAKE_SECONDS).toBeGreaterThanOrEqual(0.3);
    expect(FLASH_SECONDS).toBeLessThanOrEqual(0.5);
  });

  it("does not restart an active envelope, then restarts once idle", () => {
    const feedback = createDockFeedback();
    feedback.trigger("bounce", 10);
    feedback.trigger("bounce", 10.2);

    // Restarting at 10.2 would read 1; the running envelope reads 10.2 - 10.
    expect(feedback.shakeStrength(10.2)).toBeCloseTo(
      1 - 0.2 / SHAKE_SECONDS,
      9,
    );

    feedback.trigger("bounce", 10 + SHAKE_SECONDS + 0.01);
    expect(feedback.shakeStrength(10 + SHAKE_SECONDS + 0.01)).toBe(1);
  });

  it("returns zero and no offset for a non-finite or pre-trigger clock", () => {
    const feedback = createDockFeedback();
    expect(feedback.shakeStrength(Number.NaN)).toBe(0);
    expect(feedback.flashAlpha(Number.NaN)).toBe(0);
    expect(feedback.shakeOffset(Number.NaN)).toEqual({ x: 0, y: 0, z: 0 });

    feedback.trigger("bounce", 10);
    expect(feedback.shakeStrength(9)).toBe(0);
  });

  it("gives a scrape the red flash without a camera shake", () => {
    const feedback = createDockFeedback();
    feedback.trigger("scrape", 20);

    expect(feedback.flashAlpha(20)).toBe(1);
    expect(feedback.shakeStrength(20)).toBe(0);
    expect(feedback.shakeOffset(20)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("is deterministic: two instances produce identical offsets", () => {
    const first = createDockFeedback();
    const second = createDockFeedback();
    first.trigger("bounce", 1.25);
    second.trigger("bounce", 1.25);

    for (const time of [1.25, 1.3, 1.4, 1.5]) {
      expect(first.shakeOffset(time)).toEqual(second.shakeOffset(time));
    }
  });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Two blind spots of the determinism harness, closed together.
 *
 * - The flight hash left out `compassMode`, so two states that would answer
 *   the next compass key differently hashed equal.
 * - The replay loop capped a frame delta from above only, so a negative or
 *   non-finite delta in a frame log corrupted the accumulator.
 *
 * Neither changed what a player sees: the HUD reads the mode directly and the
 * live loop already clamps. They are about what the tests can be trusted to
 * notice.
 */

import { describe, expect, it } from "vitest";

import {
  hashFlight,
  initFlightState,
  serializeFlight,
} from "../../src/sim/flight/state.js";
import { clampFrameDelta, runToSteps } from "../../src/sim/loop.js";
import { initState } from "../../src/sim/state.js";
import { DT, MAX_FRAME_DELTA } from "../../src/sim/time.js";
import { laveFixture } from "../helpers/lave.js";

const { layout } = laveFixture();

describe("the flight hash", () => {
  it("tells apart two states that differ only in the compass mode", () => {
    // Automatic tracking that happens to point at a target, against the
    // player having locked the compass to that same target.
    const auto = initFlightState(layout);
    const manual = initFlightState(layout);
    expect(auto.compassMode).toBe("auto");
    manual.compassMode = manual.compassTarget;

    expect(manual.compassTarget).toBe(auto.compassTarget);
    expect(serializeFlight(manual)).not.toBe(serializeFlight(auto));
    expect(hashFlight(manual)).not.toBe(hashFlight(auto));
  });

  it("names the mode in the serialised form", () => {
    expect(serializeFlight(initFlightState(layout))).toContain(
      "\ncompassMode=auto\n",
    );
  });
});

describe("clampFrameDelta", () => {
  it("passes a delta inside the range through", () => {
    expect(clampFrameDelta(0)).toBe(0);
    expect(clampFrameDelta(DT)).toBe(DT);
    expect(clampFrameDelta(MAX_FRAME_DELTA)).toBe(MAX_FRAME_DELTA);
  });

  it("holds a delta to the range from both sides", () => {
    expect(clampFrameDelta(-1)).toBe(0);
    expect(clampFrameDelta(-DT)).toBe(0);
    expect(clampFrameDelta(MAX_FRAME_DELTA * 10)).toBe(MAX_FRAME_DELTA);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects %s",
    (delta) => {
      expect(() => clampFrameDelta(delta)).toThrow(RangeError);
    },
  );
});

describe("runToSteps", () => {
  const idle = () => ({ pitch: 0, roll: 0, speed: 0, precision: false });

  it("does not let a negative frame take time back", () => {
    // Two frames of half a step complete one step. With a negative frame
    // between them the old loop was left half a step short.
    const frames = [DT / 2, -DT, DT / 2, DT];
    const clean = runToSteps(initState(), [DT / 2, DT / 2, DT], idle, 1);
    const withNegative = runToSteps(initState(), frames, idle, 1);

    expect(withNegative.steps).toBe(1);
    expect(withNegative.frames).toBe(clean.frames + 1);
  });

  it("rejects a non-finite frame instead of replaying past it", () => {
    expect(() => runToSteps(initState(), [Number.NaN, DT], idle, 1)).toThrow(
      RangeError,
    );
  });
});

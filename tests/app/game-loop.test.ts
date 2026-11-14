// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The real-time accumulator (FOUND-07) and its reset-inside-a-step guard
 * (WORLD-11, T-12-31).
 *
 * A terminal sim event dispatched inside a step (a dock or an arrival that
 * completes behind the galactic chart) closes the chart, and `closeChart`
 * calls `reset()` on the loop it is running inside. The accumulator must then
 * be left at zero, never at minus one step, and the stepping must stop.
 */

import { describe, expect, it } from "vitest";

import { createGameLoop } from "../../src/app/game-loop.js";
import type { Command } from "../../src/sim/commands.js";
import {
  DT,
  MAX_FRAME_DELTA,
  MAX_STEPS_PER_FRAME,
} from "../../src/sim/time.js";

const NO_COMMANDS: readonly Command[] = [];
const COMMAND = { kind: "setThrottle", value: 1 } as unknown as Command;

describe("accumulation and the catch-up cap", () => {
  it("runs one step for one DT and leaves a zero alpha", () => {
    const loop = createGameLoop();
    let steps = 0;
    const alpha = loop.advance(DT, NO_COMMANDS, () => {
      steps += 1;
    });
    expect(steps).toBe(1);
    expect(alpha).toBeCloseTo(0, 6);
  });

  it("runs no step for less than one DT and carries the remainder as alpha", () => {
    const loop = createGameLoop();
    let steps = 0;
    const alpha = loop.advance(DT / 2, NO_COMMANDS, () => {
      steps += 1;
    });
    expect(steps).toBe(0);
    expect(alpha).toBeCloseTo(0.5, 6);
  });

  it("caps a stalled frame at MAX_STEPS_PER_FRAME and drops the backlog", () => {
    const loop = createGameLoop();
    let steps = 0;
    const alpha = loop.advance(10 * DT, NO_COMMANDS, () => {
      steps += 1;
    });
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
    expect(alpha).toBe(0);
    // The backlog is gone: the next frame starts from zero.
    steps = 0;
    loop.advance(DT, NO_COMMANDS, () => {
      steps += 1;
    });
    expect(steps).toBe(1);
  });

  it("clamps the frame delta to MAX_FRAME_DELTA and ignores a negative delta", () => {
    const loop = createGameLoop();
    let steps = 0;
    loop.advance(100, NO_COMMANDS, () => {
      steps += 1;
    });
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
    expect(MAX_FRAME_DELTA / DT).toBeGreaterThan(MAX_STEPS_PER_FRAME);
    steps = 0;
    const alpha = loop.advance(-1, NO_COMMANDS, () => {
      steps += 1;
    });
    expect(alpha).toBe(0);
    expect(steps).toBe(0);
  });

  it("hands the commands to the first step of the frame only", () => {
    const loop = createGameLoop();
    const seen: number[] = [];
    loop.advance(3 * DT, [COMMAND], (commands) => {
      seen.push(commands.length);
    });
    expect(seen).toEqual([1, 0, 0]);
  });
});

describe("reset", () => {
  it("drops the backlog and the undrained commands", () => {
    const loop = createGameLoop();
    // Half a step of backlog and one command that no step drained.
    loop.advance(DT / 2, [COMMAND], () => undefined);
    loop.reset();
    const seen: number[] = [];
    // Without the reset the half step would complete here and the command
    // would ride the step; after it, half a step is still not a step.
    loop.advance(DT / 2, NO_COMMANDS, (commands) => {
      seen.push(commands.length);
    });
    expect(seen).toEqual([]);
  });
});

describe("reset called from inside a step (WORLD-11, T-12-31)", () => {
  it("stops stepping after that step, returns alpha 0 and leaves the accumulator at zero", () => {
    const loop = createGameLoop();
    let steps = 0;
    const alpha = loop.advance(3 * DT, NO_COMMANDS, () => {
      steps += 1;
      if (steps === 1) loop.reset();
    });
    expect(steps).toBe(1);
    expect(alpha).toBe(0);

    // The accumulator is exactly zero, never negative: the next frame of one
    // DT runs exactly one step. A negative accumulator (minus one DT) would
    // run none.
    let next = 0;
    const nextAlpha = loop.advance(DT, NO_COMMANDS, () => {
      next += 1;
    });
    expect(next).toBe(1);
    expect(nextAlpha).toBeCloseTo(0, 6);
  });

  it("drops pending commands, including those given to the frame that reset", () => {
    const loop = createGameLoop();
    const seen: number[] = [];
    loop.advance(2 * DT, [COMMAND], (commands) => {
      seen.push(commands.length);
      loop.reset();
    });
    // The first step drained the command; the reset stopped the second step.
    expect(seen).toEqual([1]);
    loop.advance(DT, NO_COMMANDS, (commands) => {
      seen.push(commands.length);
    });
    expect(seen).toEqual([1, 0]);
  });

  it("stops after a reset on a later step of the frame as well", () => {
    const loop = createGameLoop();
    let steps = 0;
    const alpha = loop.advance(5 * DT, NO_COMMANDS, () => {
      steps += 1;
      if (steps === 3) loop.reset();
    });
    expect(steps).toBe(3);
    expect(alpha).toBe(0);
    let next = 0;
    loop.advance(DT, NO_COMMANDS, () => {
      next += 1;
    });
    expect(next).toBe(1);
  });

  it("a reset inside the step that also hits the cap still leaves zero", () => {
    const loop = createGameLoop();
    let steps = 0;
    loop.advance(10 * DT, NO_COMMANDS, () => {
      steps += 1;
      if (steps === MAX_STEPS_PER_FRAME) loop.reset();
    });
    expect(steps).toBe(MAX_STEPS_PER_FRAME);
    let next = 0;
    loop.advance(DT, NO_COMMANDS, () => {
      next += 1;
    });
    expect(next).toBe(1);
  });

  it("a frame without a reset is unchanged by the guard", () => {
    const loop = createGameLoop();
    let steps = 0;
    const alpha = loop.advance(2.5 * DT, NO_COMMANDS, () => {
      steps += 1;
    });
    expect(steps).toBe(2);
    expect(alpha).toBeCloseTo(0.5, 6);
  });
});

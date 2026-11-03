// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The real-time accumulator (Pattern 2, FOUND-07).
 *
 * Same contract as `src/sim/loop.ts` — clamp the frame delta, run whole 1/120 s
 * steps, cap catch-up at five steps and drop the backlog — but this sibling
 * samples devices once per frame and carries commands to the first step only,
 * so a click applied on a frame that ran three steps is still applied once.
 *
 * The replay harness in `loop.ts` is untouched: its tests pin its
 * stop-on-step-count semantics.
 */

import type { Command } from "../sim/commands.js";
import { DT, MAX_FRAME_DELTA, MAX_STEPS_PER_FRAME } from "../sim/time.js";

export interface GameLoop {
  /**
   * Advance by `delta` seconds, invoking `step` once per fixed step with the
   * commands that step owns (only the first step of a frame gets any).
   *
   * @returns the interpolation alpha in [0, 1).
   */
  advance(
    delta: number,
    commands: readonly Command[],
    step: (commands: readonly Command[]) => void,
  ): number;
  /** Drop any backlog and undrained commands (pause, focus loss). */
  reset(): void;
}

export function createGameLoop(): GameLoop {
  let accumulator = 0;
  let pending: Command[] = [];

  return {
    advance(delta, commands, step): number {
      pending = pending.concat(commands);
      accumulator += Math.min(Math.max(delta, 0), MAX_FRAME_DELTA);

      let steps = 0;
      while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
        const drained = pending;
        pending = [];
        step(drained);
        accumulator -= DT;
        steps += 1;
      }

      // A stalled frame (tab switch, debugger) must not replay hidden time.
      if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;

      return accumulator / DT;
    },
    reset(): void {
      accumulator = 0;
      pending = [];
    },
  };
}

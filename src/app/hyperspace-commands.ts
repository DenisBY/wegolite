// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Same-frame hyperspace edge mapping (D-06, G-6).
 *
 * Every H press drains into one command array per rendered frame. The
 * simulation treats a `beginHyperspace` while a countdown runs as a no-op, so
 * the app must turn the second press of a pair into `cancelHyperspace`. Deciding
 * from the frame-start countdown alone misses two presses drained into the same
 * array (the first starts the countdown, the second is then silently ignored).
 *
 * This module walks the drained array in input order and tracks countdown
 * liveness across it. It is pure: no DOM, no Three.js, no clock, and the input
 * array is never mutated.
 */

import type { Command } from "../sim/commands.js";

/**
 * Maps a drained command array so that each `beginHyperspace` lands on the
 * correct side of the countdown lifecycle.
 *
 * - A `beginHyperspace` while a countdown is live becomes `cancelHyperspace`.
 * - A `beginHyperspace` while no countdown is live is copied and marks the
 *   countdown live for the rest of the array.
 * - A `cancelHyperspace` clears liveness and is copied unchanged.
 * - Every other command is copied unchanged, in order.
 *
 * Note: a `beginHyperspace` is treated as live even when the simulation later
 * refuses it (for example, docked or insufficient fuel). That only matters for a
 * second begin in the same array, which the simulation would also refuse, so the
 * observable outcome is unchanged.
 */
export function mapHyperspaceBeginEdges(
  commands: readonly Command[],
  countdownLive: boolean,
): Command[] {
  let live = countdownLive;
  const mapped: Command[] = [];
  for (const command of commands) {
    if (command.kind === "cancelHyperspace") {
      live = false;
      mapped.push(command);
    } else if (command.kind === "beginHyperspace") {
      if (live) {
        mapped.push({ kind: "cancelHyperspace" });
        live = false;
      } else {
        mapped.push(command);
        live = true;
      }
    } else {
      mapped.push(command);
    }
  }
  return mapped;
}

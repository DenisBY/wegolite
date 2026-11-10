// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Decides whether a loop frame has to reach the GPU.
 *
 * While the session is docked or paused the fixed step does not run, so the
 * station angle, the flight clock and the pose all hold and every frame would
 * repeat the previous image. The gate lets such a frame be drawn a few times
 * and then skipped until something changes. The browser keeps showing the last
 * presented frame in the meantime, so the player sees no difference; the GPU
 * simply stops shading the planet behind the station screen or the pause menu.
 *
 * The gate is pure: it owns no renderer and no DOM, only the count.
 */

/**
 * Draws made after the scene stops changing, before the loop goes quiet.
 *
 * One would do. The second covers a frame the browser drops between a state
 * change and its presentation, at the cost of one extra draw per transition.
 */
export const IDLE_SETTLE_DRAWS = 2;

export interface RedrawGate {
  /**
   * Decide one loop frame.
   *
   * @param idle True when nothing is being simulated (docked or paused).
   * @param keys What the image depends on besides the simulation, compared by
   *   identity with the keys of the last frame actually drawn: the flight state
   *   object, the scene, a texture revision.
   * @returns True when the frame must be drawn.
   */
  next(idle: boolean, keys: readonly unknown[]): boolean;
  /** Record the keys of a frame that was drawn, by the loop or directly. */
  drawn(keys: readonly unknown[]): void;
  /** The canvas no longer shows the live scene: draw the next frames again. */
  request(): void;
}

function sameKeys(a: readonly unknown[], b: readonly unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    if (!Object.is(a[index], b[index])) return false;
  }
  return true;
}

/**
 * @param settle Draws made once the scene stops changing. A value below one, or
 *   a non-integer, would let the gate skip a frame that was never drawn, so it
 *   is rejected.
 * @throws {RangeError} when `settle` is not a positive integer.
 */
export function createRedrawGate(settle = IDLE_SETTLE_DRAWS): RedrawGate {
  if (!Number.isInteger(settle) || settle < 1) {
    throw new RangeError(
      `Wegolite: the redraw gate needs a positive integer settle count (received ${String(settle)}).`,
    );
  }

  let owed = settle;
  let seen: readonly unknown[] | undefined;

  return {
    next(idle, keys) {
      if (!idle || seen === undefined || !sameKeys(keys, seen)) owed = settle;
      if (owed === 0) return false;
      if (idle) owed -= 1;
      return true;
    },
    drawn(keys) {
      seen = keys;
    },
    request() {
      owed = settle;
    },
  };
}

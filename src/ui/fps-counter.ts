// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Settings "Show FPS counter" readout (quick task 261117-fpp).
 *
 * It counts animation frames, one per pass of the session frame loop, and
 * reports their rate over 500 ms windows. This is the method of Oolite's own
 * counter (`PlayerEntity.m`, a frames-done window of `MINIMUM_GAME_TICK`),
 * widened from 0.25 s for a steadier reading and fewer DOM writes. Docked
 * frames count too: the redraw gate skips their GPU draw, but the page still
 * presents at the loop rate.
 *
 * Time comes only from the `now` arguments the frame loop passes in; the module
 * reads no clock of its own. The readout is a DOM text node written through
 * `textContent`, at most once per window and only when the rounded value
 * changes, so it adds no draw call and no per-frame DOM write.
 */

/** The length of one measuring window. */
export const FPS_WINDOW_MS = 500;

/** A longer gap between two frames (a hidden tab, say) restarts the window. */
export const FPS_MAX_GAP_MS = 1000;

/** The text shown between enabling the counter and its first readout. */
export const FPS_PLACEHOLDER = "FPS: --";

export interface FpsMeter {
  /** Count one frame at `now`; return the rate when a window closes, else null. */
  tick(now: number): number | null;
  /** Forget the running window, so the next tick starts a fresh one. */
  reset(): void;
}

/** A pure frame-rate window over caller-supplied timestamps. */
export function createFpsMeter(
  windowMs: number = FPS_WINDOW_MS,
  maxGapMs: number = FPS_MAX_GAP_MS,
): FpsMeter {
  let started = false;
  let windowStart = 0;
  let frames = 0;
  let last = 0;

  return {
    tick(now: number): number | null {
      if (!started || now < last || now - last > maxGapMs) {
        started = true;
        windowStart = now;
        frames = 0;
        last = now;
        return null;
      }
      frames += 1;
      last = now;
      const elapsed = now - windowStart;
      if (elapsed < windowMs) return null;
      const fps = (frames * 1000) / elapsed;
      windowStart = now;
      frames = 0;
      return fps;
    },
    reset(): void {
      started = false;
      frames = 0;
    },
  };
}

/** The readout text, following Oolite's "FPS: %3d" without the padding. */
export function formatFps(fps: number): string {
  return `FPS: ${String(Math.round(fps))}`;
}

/** The two element properties the counter touches. */
export type FpsElement = Pick<HTMLElement, "hidden" | "textContent">;

export interface FpsCounter {
  /** Show (restarting the window) or hide the readout. Idempotent. */
  setEnabled(enabled: boolean): void;
  isEnabled(): boolean;
  /** Count one animation frame at the frame loop's `now`. */
  frame(now: number): void;
  /** Hide, clear and silence the readout for good. */
  dispose(): void;
}

/** The readout over `element`. It starts hidden and disabled. */
export function createFpsCounter(
  element: FpsElement,
  meter: FpsMeter = createFpsMeter(),
): FpsCounter {
  let enabled = false;
  let shown = "";
  element.hidden = true;

  function write(text: string): void {
    if (text === shown) return;
    shown = text;
    element.textContent = text;
  }

  return {
    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      if (next) {
        meter.reset();
        write(FPS_PLACEHOLDER);
        element.hidden = false;
      } else {
        element.hidden = true;
      }
    },
    isEnabled(): boolean {
      return enabled;
    },
    frame(now: number): void {
      if (!enabled) return;
      const fps = meter.tick(now);
      if (fps === null) return;
      write(formatFps(fps));
    },
    dispose(): void {
      enabled = false;
      element.hidden = true;
      shown = "";
      element.textContent = "";
    },
  };
}

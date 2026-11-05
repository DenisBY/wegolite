// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Deterministic docking feedback envelopes (D-08, T-04-17).
 *
 * The simulation emits `bounce`/`scrape` events; this module turns them into
 * short, app-owned envelopes on the **simulation** `flightTime` clock, so a
 * pause freezes them exactly as it freezes the message line. It is pure and
 * deterministic: no `Math.random`, no wall clock, no DOM.
 *
 * The published value is the envelope **strength** (1 at the trigger instant,
 * linearly down to 0), never a sinusoid: a sinusoid can legitimately read zero
 * at the trigger instant and make the probe assertion flaky. The camera offset
 * is derived from the strength with a deterministic phase chosen so its
 * vertical component is non-zero at the trigger instant.
 */

import { vec } from "../sim/math.js";
import type { Vec3 } from "../sim/math.js";

export type DockFeedbackKind = "bounce" | "scrape";

/** D-08's range is 0.3-0.5 s; A3 chooses the lower and upper ends. */
export const SHAKE_SECONDS = 0.35;
export const FLASH_SECONDS = 0.4;

/** A3's camera-shake amplitude, in metres. */
export const SHAKE_AMPLITUDE = 0.6;

/** Deterministic shake frequency (Hz), about 18 cycles per second. */
const SHAKE_HZ = 18;
const SHAKE_ANGULAR = Math.PI * 2 * SHAKE_HZ;

export interface DockFeedback {
  /** Start the envelopes for `kind` at `flightTime`; only when idle. */
  trigger(kind: DockFeedbackKind, flightTime: number): void;
  /** 0..1 envelope strength, 1 at the trigger instant. */
  shakeStrength(flightTime: number): number;
  /** The world-space camera offset, zero when the envelope expired. */
  shakeOffset(flightTime: number): Vec3;
  /** 0..1 red-frame alpha, 1 at the trigger instant. */
  flashAlpha(flightTime: number): number;
}

function envelope(
  start: number | null,
  flightTime: number,
  duration: number,
): number {
  if (start === null || !Number.isFinite(flightTime)) return 0;
  const elapsed = flightTime - start;
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0;
  // The nominal end must read exactly zero: `10 + 0.35 - 10` is one ULP short
  // of 0.35 in float64, so compare with a nanosecond-scale tolerance.
  if (elapsed >= duration - 1e-9) return 0;
  return 1 - elapsed / duration;
}

export function createDockFeedback(): DockFeedback {
  let shakeStart: number | null = null;
  let flashStart: number | null = null;

  return {
    trigger(kind: DockFeedbackKind, flightTime: number): void {
      if (!Number.isFinite(flightTime)) return;
      // A bounce is the full three-channel response; a scrape is the lighter
      // red flash. Restart only when idle, so a 120 Hz contact stream cannot
      // extend the envelope forever (Pitfall 8).
      if (kind === "bounce") {
        if (envelope(shakeStart, flightTime, SHAKE_SECONDS) === 0) {
          shakeStart = flightTime;
        }
        if (envelope(flashStart, flightTime, FLASH_SECONDS) === 0) {
          flashStart = flightTime;
        }
        return;
      }
      if (envelope(flashStart, flightTime, FLASH_SECONDS) === 0) {
        flashStart = flightTime;
      }
    },

    shakeStrength(flightTime: number): number {
      return envelope(shakeStart, flightTime, SHAKE_SECONDS);
    },

    shakeOffset(flightTime: number): Vec3 {
      const strength = envelope(shakeStart, flightTime, SHAKE_SECONDS);
      const start = shakeStart;
      if (strength === 0 || start === null) return vec(0, 0, 0);
      const elapsed = flightTime - start;
      // cos(0) = 1, so the offset is non-zero at the trigger instant.
      return vec(
        SHAKE_AMPLITUDE * strength * Math.cos(elapsed * SHAKE_ANGULAR),
        SHAKE_AMPLITUDE * strength * Math.sin(elapsed * SHAKE_ANGULAR * 1.37),
        0,
      );
    },

    flashAlpha(flightTime: number): number {
      return envelope(flashStart, flightTime, FLASH_SECONDS);
    },
  };
}

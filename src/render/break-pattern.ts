// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The launch break pattern (D-10, research step 8, Pitfall 10).
 *
 * A Canvas2D full-screen overlay: 0-0.2 s white flash and radial streaks,
 * 0.2-1.6 s a tunnel of radial lines and rings scaling outward around a dark
 * centre, 1.6-2.0 s a fade. It covers the cut from the external cinematic to
 * the cockpit.
 *
 * Determinism: the line table is seeded from `launchCount` through
 * `createSeededRandom`, never `Math.random`, and precomputed once per count.
 * Timing is an argument (`elapsed`), never a wall clock.
 *
 * Transform safety (Pitfall 10): the overlay draws in *device pixels* with a
 * reset transform and `restore()`s the HUD design transform, so the HUD's
 * letterbox maths is untouched.
 */

import { createSeededRandom } from "../sim/math.js";

/** End of the flash/streak phase. */
export const BREAK_FLASH_END = 0.2;
/** End of the tunnel phase; the rest fades. */
export const BREAK_TUNNEL_END = 1.6;
/** The full overlay duration; matches the scripted launch. */
export const BREAK_DURATION = 2;
/** Radial lines in the tunnel (research: 32-48). */
export const BREAK_LINE_COUNT = 40;
/** Concentric rings drawn in the tunnel. */
export const BREAK_RING_COUNT = 4;

export type BreakPatternPhase = "flash" | "tunnel" | "fade" | "done";

/** One precomputed radial line: angle, start radius and length in design units. */
export interface BreakLine {
  readonly angle: number;
  readonly radius: number;
  readonly length: number;
  readonly ring: number;
}

/** The phase for an elapsed time in seconds. */
export function breakPatternPhase(elapsed: number): BreakPatternPhase {
  if (!Number.isFinite(elapsed) || elapsed < 0) return "flash";
  if (elapsed < BREAK_FLASH_END) return "flash";
  if (elapsed < BREAK_TUNNEL_END) return "tunnel";
  if (elapsed < BREAK_DURATION - 1e-9) return "fade";
  return "done";
}

/**
 * The deterministic line table for one launch. The same `launchCount` always
 * yields the same table; a different count yields a different one.
 */
export function breakPatternLines(launchCount: number): readonly BreakLine[] {
  const count = Math.max(0, Math.trunc(launchCount));
  const random = createSeededRandom(
    (Math.imul(count, 2_654_435_761) + 1) >>> 0,
  );
  const lines: BreakLine[] = [];
  for (let index = 0; index < BREAK_LINE_COUNT; index += 1) {
    lines.push({
      angle: (index / BREAK_LINE_COUNT) * Math.PI * 2 + random() * 0.06,
      radius: 0.08 + random() * 0.18,
      length: 0.2 + random() * 0.5,
      ring: index % BREAK_RING_COUNT,
    });
  }
  return lines;
}

export interface BreakPattern {
  /** Draw the overlay for `elapsed` seconds of a given launch. */
  draw(elapsed: number, launchCount: number): void;
  readonly active: boolean;
  dispose(): void;
}

function requireContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (context === null) {
    throw new Error(
      "Wegolite: the HUD canvas has no 2D rendering context; the break pattern cannot be drawn.",
    );
  }
  return context;
}

export function createBreakPattern(canvas: HTMLCanvasElement): BreakPattern {
  const context = requireContext2d(canvas);
  const tables = new Map<number, readonly BreakLine[]>();
  let active = false;

  function linesFor(launchCount: number): readonly BreakLine[] {
    const key = Math.max(0, Math.trunc(launchCount));
    let table = tables.get(key);
    if (table === undefined) {
      table = breakPatternLines(key);
      tables.set(key, table);
    }
    return table;
  }

  function drawTunnel(
    lines: readonly BreakLine[],
    progress: number,
    radius: number,
    centreX: number,
    centreY: number,
    alpha: number,
  ): void {
    // A dark centre so the lines read as a tunnel, not a starburst.
    context.fillStyle = `rgba(0, 0, 0, ${String(0.85 * alpha)})`;
    context.beginPath();
    context.arc(
      centreX,
      centreY,
      radius * 0.1 * (1 - progress * 0.5),
      0,
      Math.PI * 2,
    );
    context.fill();

    context.strokeStyle = `rgba(120, 255, 170, ${String(0.75 * alpha)})`;
    context.lineWidth = Math.max(1, radius * 0.006);
    context.beginPath();
    for (const line of lines) {
      const scale = 0.15 + progress * 1.6;
      const inner = radius * scale * (1 + line.radius);
      const outer = inner + radius * line.length * (0.4 + progress);
      const cos = Math.cos(line.angle);
      const sin = Math.sin(line.angle);
      context.moveTo(centreX + cos * inner, centreY + sin * inner);
      context.lineTo(centreX + cos * outer, centreY + sin * outer);
    }
    context.stroke();

    // Rings: one per index, each phase-shifted, scaling outward.
    context.strokeStyle = `rgba(200, 255, 220, ${String(0.4 * alpha)})`;
    context.beginPath();
    for (let ring = 0; ring < BREAK_RING_COUNT; ring += 1) {
      const phase = (progress + ring / BREAK_RING_COUNT) % 1;
      context.moveTo(centreX + radius * (0.15 + phase * 1.3), centreY);
      context.arc(
        centreX,
        centreY,
        radius * (0.15 + phase * 1.3),
        0,
        Math.PI * 2,
      );
    }
    context.stroke();
  }

  function draw(elapsed: number, launchCount: number): void {
    if (canvas.width === 0 || canvas.height === 0) return;
    const phase = breakPatternPhase(elapsed);
    active = phase !== "done";
    if (phase === "done") {
      // Handover: clear the overlay so the HUD's own clear starts from black.
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
      return;
    }

    const width = canvas.width;
    const height = canvas.height;
    const centreX = width / 2;
    const centreY = height / 2;
    const radius = Math.min(width, height) * 0.5;
    const lines = linesFor(launchCount);

    context.save();
    // Device pixels, no letterbox: the overlay is full-screen (Pitfall 10).
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);

    if (phase === "flash") {
      const fade = 1 - elapsed / BREAK_FLASH_END;
      context.fillStyle = `rgba(255, 255, 255, ${String(0.9 * fade)})`;
      context.fillRect(0, 0, width, height);
      drawTunnel(lines, 0, radius, centreX, centreY, 0.6 + 0.4 * fade);
    } else if (phase === "tunnel") {
      const progress =
        (elapsed - BREAK_FLASH_END) / (BREAK_TUNNEL_END - BREAK_FLASH_END);
      drawTunnel(lines, progress, radius, centreX, centreY, 1);
    } else {
      const fade =
        1 - (elapsed - BREAK_TUNNEL_END) / (BREAK_DURATION - BREAK_TUNNEL_END);
      drawTunnel(lines, 1, radius, centreX, centreY, fade);
      context.fillStyle = `rgba(0, 0, 0, ${String(1 - fade)})`;
      context.fillRect(0, 0, width, height);
    }

    // Restore the HUD design transform the caller left in place.
    context.restore();
  }

  return {
    draw,
    get active() {
      return active;
    },
    dispose(): void {
      active = false;
      context.save();
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.restore();
    },
  };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * HUD text formatting (FLGT-05, D-06).
 *
 * Pure functions with explicit widths and no locale formatting: the HUD is drawn
 * on a canvas, so the same state must produce the same string on every machine.
 * `clock` follows Oolite's `%07d:%02d:%02d:%02d`; speed is displayed in LS
 * (1 LS = 1,000 game units/s) and fuel in tenths of a light year.
 */

const SECONDS_PER_DAY = 86_400;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_MINUTE = 60;

function pad(value: number, width: number): string {
  return String(value).padStart(width, "0");
}

/** `2084004:05:59:59` — the Oolite ship clock. */
export function formatClock(clockSeconds: number): string {
  const total = Math.max(0, Math.floor(clockSeconds));
  const days = Math.floor(total / SECONDS_PER_DAY);
  const remainder = total - days * SECONDS_PER_DAY;
  const hours = Math.floor(remainder / SECONDS_PER_HOUR);
  const minutes = Math.floor(
    (remainder % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
  );
  const seconds = remainder % SECONDS_PER_MINUTE;
  return `${pad(days, 7)}:${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)}`;
}

/** `0.350 LS` for the Cobra's 350 u/s top speed. */
export function formatSpeed(speed: number): string {
  return `${(speed / 1_000).toFixed(3)} LS`;
}

/** `7.0 LY` for the Cobra's 70 tenths of a light year. */
export function formatFuel(fuelTenths: number): string {
  return `${(fuelTenths / 10).toFixed(1)} LY`;
}

/**
 * One message row's character budget. The rows are drawn at 23.2 design px of
 * a font advancing 0.6 em (`HUD_MESSAGE_FONT_PX` and `NOMINAL_ADVANCE` in
 * `draw.ts`), 13.92 design px per glyph, centred on x = 1248 without clipping:
 * 60 glyphs are 835.2 px wide and span x 830.4 to 1665.6 of the 1920 px design
 * width. In the message band (y 517.5 to 832.5, lifted with the gauges) the
 * only other element in that span is the crosshair (x 888 to 1032), which the
 * rows covered at 55 already; the gauges start below the band, at y 852.75.
 * Oolite never truncates a message; `printLongText` word-wraps it into extra
 * rows (`Universe.m:6403`, `GuiDisplayGen.m:736-794`). Until that wrap is
 * ported (todo 2026-11-20-hud-message-word-wrap-like-oolite), every message
 * Wegolite writes stays within this budget, which
 * `tests/guards/hud-message-length.test.ts` enforces (owner decisions
 * 2026-11-20: raised from 54 to 55 so the witchpoint-beacon line fits, then to
 * 60 so the two docking bounce lines and the default pitch/roll hint fit whole).
 */
export const MAX_MESSAGE_CHARS = 60;

/**
 * Clamp a message to one line with an ellipsis on overflow.
 *
 * The sim never produces UI copy; the app owns the string, so this is the last
 * point before it is drawn. `maxChars` counts the ellipsis as one character.
 */
export function clampMessage(text: string, maxChars: number): string {
  if (maxChars <= 0) return "";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}…`;
}

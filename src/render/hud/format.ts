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

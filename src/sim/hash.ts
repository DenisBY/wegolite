// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Canonical state text and the in-repo integrity checksum (D-11).
 *
 * This is an integrity checksum for golden tests, not a security control.
 * `node:crypto` is deliberately not used: a checked-in fixture must replay the
 * same way in every container without depending on an algorithm registry.
 */

/** 32-bit FNV-1a over the low byte of each UTF-16 code unit. */
export function fnv1a32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i) & 0xff;
    // Math.imul, never `*`: a double multiply loses the low bits.
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Canonical fixed-precision number text: no `-0`, finite only.
 * Throws instead of formatting a non-finite value, because `NaN.toFixed(6)` is
 * the stable string "NaN" — a diverged sim would otherwise hash consistently
 * and pass a golden test while broken (T-01-07).
 */
export function canon(n: number, digits = 6): string {
  if (!Number.isFinite(n)) {
    throw new Error(`non-finite value in state: ${String(n)}`);
  }
  const r = Number(n.toFixed(digits));
  return (r === 0 ? 0 : r).toFixed(digits);
}

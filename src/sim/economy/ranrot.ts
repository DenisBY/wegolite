// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's 32-bit RANROT generator (ECON-01, D-18).
 *
 * This is a faithful port of `legacy_random.c:87-145`. RANROT is a 32-bit
 * wrapping generator: every add and shift is truncated to 32 bits, and the
 * returned value masks off the sign bit. `randf()` is deliberately 16-bit
 * granular — `(Ranrot() & 0xffff) / 65536` — because Oolite's economy fixtures
 * depend on that exact stream.
 *
 * The seed is a bounded uint32 supplied by the caller (the persisted
 * `marketSeed`). The global random source and any wall clock must never appear
 * in `src/sim`; the deterministic stream is the only source of variation.
 */

/** The random source the market generator consumes. */
export interface Ranrot {
  /** A uniformly distributed float in `[0, 1)` with 16-bit granularity. */
  randf(): number;
}

/** Mix one 32-bit pair exactly as `RanrotWithSeed` does. */
function mix(high: number, low: number): readonly [number, number] {
  let nextHigh = high;
  let nextLow = low;
  // `high << 16` is int32 in JavaScript; `>>> 0` reproduces the C wrap, and
  // `high >>> 16` is the logical right shift of a `uint32_t`.
  nextHigh = ((((nextHigh << 16) >>> 0) + (nextHigh >>> 16)) >>> 0) >>> 0;
  nextHigh = (nextHigh + nextLow) >>> 0;
  nextLow = (nextLow + nextHigh) >>> 0;
  return [nextHigh, nextLow];
}

/**
 * Create a RANROT stream from a 32-bit seed.
 *
 * `MakeRanrotSeed` initialises `low = seed`, `high = ~seed`, then mixes three
 * times before the first draw. Each draw rotates `high` by 16, adds `low` to
 * `high`, adds the new `high` to `low`, and returns `high & 0x7fffffff`.
 */
export function createRanrot(seed: number): Ranrot {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new Error(
      `Wegolite: RANROT seed must be a uint32, received ${String(seed)}.`,
    );
  }

  let low = seed >>> 0;
  let high = ~seed >>> 0;
  for (let round = 0; round < 3; round += 1) {
    [high, low] = mix(high, low);
  }

  return {
    randf(): number {
      [high, low] = mix(high, low);
      return (high & 0xffff) / 65536;
    },
  };
}

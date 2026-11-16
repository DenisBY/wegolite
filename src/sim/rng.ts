// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The serialisable simulation stream and the world-seed derivation (FOUND-12,
 * D-02, D-04).
 *
 * `RngState` is plain data (one unsigned 32-bit integer), so a world that holds
 * streams can be hashed and snapshotted, and a state that goes through
 * `JSON.stringify` and `JSON.parse` mid-sequence continues identically. The
 * draw is mulberry32 with the exact arithmetic `createSeededRandom` has always
 * used; `createSeededRandom` in `./math.ts` now wraps a `RngState`.
 *
 * `fmix32`, `mix32`, `worldSeedFor` and `forkSeed` are the one-way world-seed
 * contract (D-02): once Phase 11 persists the world epoch, changing one bit of
 * their arithmetic re-rolls every saved world and needs a save migration. They
 * are pinned by literal vectors in tests/sim/rng.test.ts. The module has no
 * imports and no DOM, clock or platform-randomness access.
 */

/** One mulberry32 stream. Plain data: an unsigned 32-bit integer. */
export interface RngState {
  s: number;
}

/** A fresh stream from `seed` (coerced to an unsigned 32-bit integer). */
export function createRngState(seed: number): RngState {
  return { s: seed >>> 0 };
}

/**
 * Advance `state` one draw and return a value in [0, 1). The arithmetic is the
 * mulberry32 closure `createSeededRandom` shipped with, unchanged: the arrival
 * goldens and the pinned vectors depend on every bit of it.
 */
export function rngNext(state: RngState): number {
  state.s = (state.s + 0x6d2b79f5) >>> 0;
  let t = state.s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}

/**
 * The 32-bit MurmurHash3 finaliser (public domain, Austin Appleby). A bijection
 * on the unsigned 32-bit integers. Part of the one-way world-seed contract
 * (D-02): do not change a constant or a shift.
 */
export function fmix32(h: number): number {
  let x = h >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return x >>> 0;
}

/**
 * `mix32(a, b) = fmix32(a ^ fmix32(b + 0x9e3779b9))` over unsigned 32-bit
 * integers. A bijection in each argument: for a fixed `a` two `b` never collide,
 * and for a fixed `b` two `a` never collide. Part of the one-way world-seed
 * contract (D-02): do not change it.
 */
export function mix32(a: number, b: number): number {
  return fmix32(((a >>> 0) ^ fmix32((b + 0x9e3779b9) >>> 0)) >>> 0);
}

/**
 * What a stream is for. "world" is the world-level stream (entity id 0). "cargo"
 * is a stateless purpose (plan 15-03, code 4): the populator forks it per spawn
 * to draw one cargo count and discards it, so it is never stored on an entity.
 */
export type RngPurpose = "world" | "ai" | "combat" | "cargo";

/**
 * The per-entity purposes whose streams are stored; "world" is forked with
 * entity id 0. "cargo" is not listed: it is forked per spawn and never stored.
 */
export const ENTITY_RNG_PURPOSES = ["ai", "combat"] as const;

/**
 * Fixed integer purpose codes (D-04). Looked up by key, never iterated and
 * never derived from array order, so adding a purpose cannot renumber another.
 * Part of the one-way contract: do not change an existing code.
 */
export const RNG_PURPOSE_CODES: Readonly<Record<RngPurpose, number>> =
  Object.freeze({ world: 1, ai: 2, combat: 3, cargo: 4 });

const MAX_UINT32 = 0xffffffff;

function requireFiniteSeed(name: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number, got ${value}`);
  }
}

function requireUint32Integer(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError(
      `${name} must be an integer in [0, ${MAX_UINT32}], got ${value}`,
    );
  }
}

/**
 * The world seed of one world: `mix32(marketSeed, epoch)` (D-02). `epoch` must
 * be an integer in [0, 0xffffffff] and `marketSeed` a finite number (coerced to
 * unsigned 32 bits); anything else is a programming error at a module boundary
 * and throws a RangeError naming the argument. Fixed-step callers
 * (`worldLifecycle.begin` in plan 08-15) guard `epoch < 0xffffffff` before
 * calling, so the RangeError is unreachable in the frame loop.
 */
export function worldSeedFor(marketSeed: number, epoch: number): number {
  requireFiniteSeed("marketSeed", marketSeed);
  requireUint32Integer("epoch", epoch);
  return mix32(marketSeed, epoch);
}

/**
 * The seed of one entity stream forked from a world:
 * `mix32(mix32(worldSeed, entityId), RNG_PURPOSE_CODES[purpose])` (D-04).
 * `entityId` must be an integer in [0, 0xffffffff], `worldSeed` a finite number
 * and `purpose` one of the own keys of RNG_PURPOSE_CODES; anything else throws a
 * RangeError naming the argument (an inherited key such as "constructor" would
 * otherwise read a function and fork a silent degenerate seed). Fixed-step
 * callers (`store.allocate` and `spawnEntity` in plan 08-05) guard
 * `nextId <= 0xffffffff` before calling, so the RangeError is unreachable in the
 * frame loop.
 */
export function forkSeed(
  worldSeed: number,
  entityId: number,
  purpose: RngPurpose,
): number {
  requireFiniteSeed("worldSeed", worldSeed);
  requireUint32Integer("entityId", entityId);
  if (!Object.hasOwn(RNG_PURPOSE_CODES, purpose)) {
    throw new RangeError(`purpose must be a known RngPurpose, got ${purpose}`);
  }
  return mix32(mix32(worldSeed, entityId), RNG_PURPOSE_CODES[purpose]);
}

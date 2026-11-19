// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Independent transliteration of Oolite's collision response (Phase 18, plan
 * 18-03). RED stub: the shape only, every value zero.
 */

import type { CollideFixture } from "./schema.js";

type Vec3 = readonly [number, number, number];

/** The inputs of one collision: a fixture without its expectation. */
export type CollideInput = Pick<CollideFixture, "dt" | "self" | "other">;

/** What `collideWithShip:` does to both parties. */
export type CollideResult = CollideFixture["expected"];

const ZERO: Vec3 = [0, 0, 0];

/** RED stub. */
export function collideWithShipReference(input: CollideInput): CollideResult {
  const isSub = input.other.isSubentityOf !== null;
  return {
    outcome: "collided",
    loc: [...ZERO],
    v2b: 0,
    v1a: 0,
    dam1: 0,
    dam2: 0,
    antiConjoin: false,
    applied1: false,
    applied2: false,
    dam2Receiver: null,
    selfDestroyed: false,
    otherDestroyed: false,
    dv1: [...ZERO],
    dvOtherBody: [...ZERO],
    dvOtherSubentity: isSub ? [...ZERO] : null,
    nudged: false,
    dp1: [...ZERO],
    dpOther: [...ZERO],
    dpOtherSubentity: isSub ? [...ZERO] : null,
  };
}

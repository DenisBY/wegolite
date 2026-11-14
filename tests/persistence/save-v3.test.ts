// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The save schema v3 contract (Phase 11, SAVE-07, CONTEXT D-01 to D-08).
 *
 * Plan 11-01 pins the D-07 cross-check vector here before any v3 save exists:
 * once the epoch is persisted, the mix32 world-seed derivation is one-way, so
 * its drift has to be caught from literals that are independent of the code.
 * Plans 11-02 and 11-03 add the round trip, the bounds and the worst case.
 * Expected values come from the decisions and the PROJECT.md Key Decisions row,
 * never from running the code twice.
 */

import { describe, expect, it } from "vitest";

import { createWorldLifecycle } from "../../src/app/session/world-lifecycle.js";
import { marketSeedForSystem } from "../../src/sim/economy/market.js";
import { worldSeedFor } from "../../src/sim/rng.js";

describe("world-seed cross-check vector (D-07), pinned before the first v3 write", () => {
  it("marketSeedForSystem(g0-s7) is 3545325333", () => {
    expect(marketSeedForSystem("g0-s7")).toBe(3545325333);
  });

  it("worldSeedFor(3545325333, 1) is 0x2b4e037c", () => {
    expect(worldSeedFor(3545325333, 1)).toBe(0x2b4e037c);
    expect(worldSeedFor(marketSeedForSystem("g0-s7"), 1)).toBe(0x2b4e037c);
  });

  it("the session's first launch from Lave builds the world with seed 0x2b4e037c", () => {
    const lifecycle = createWorldLifecycle({ traffic: false });
    lifecycle.begin(marketSeedForSystem("g0-s7"));
    expect(lifecycle.epoch).toBe(1);
    expect(lifecycle.world?.worldSeed).toBe(0x2b4e037c);
    expect(lifecycle.anchorNextEntityId).toBe(101);
  });
});

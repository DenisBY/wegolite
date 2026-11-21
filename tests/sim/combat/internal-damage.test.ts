// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's internal-damage roll (CBT-08, Phase 19 plan 19-02), against
 * Oolite's `PlayerEntity.m` gate loop (`:5690-5697`) and `takeInternalDamage`
 * (`:6097-6185`).
 *
 * Every case drives the roll with a scripted draw source that throws when its
 * queue is empty and asserts the consumed count, so each case also proves the
 * draw order. Expected draw sequences are derived on paper from the C lines,
 * never from a run.
 */

import { describe, expect, it } from "vitest";

import {
  consideredCount,
  internalDamageSeed,
  internalDamageWork,
  MAX_INTERNAL_DAMAGE_ROLLS,
  PLAYER_INTERNAL_DAMAGE_FACTOR,
  PLAYER_MASS_DAMAGE_TERM,
  rollInternalDamage,
  SHIP_TRADE_IN_FACTOR,
} from "../../../src/sim/combat/internal-damage.js";
import type {
  InternalDamageFacts,
  InternalDamageItem,
  InternalDamagePod,
} from "../../../src/sim/combat/internal-damage.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { marketSeedForSystem } from "../../../src/sim/economy/market.js";
import { forkSeed, mix32, worldSeedFor } from "../../../src/sim/rng.js";
import { PLAYER_ID } from "../../../src/sim/world/ids.js";

interface Scripted {
  readonly draw: () => number;
  /** How many draws were consumed. */
  readonly consumed: () => number;
}

/** A draw source that replays `queue` and throws when it runs dry. */
function scripted(queue: readonly number[]): Scripted {
  let index = 0;
  return {
    draw: () => {
      if (index >= queue.length) {
        throw new Error(
          `draw ${index + 1} requested, only ${queue.length} scripted`,
        );
      }
      const value = queue[index];
      index += 1;
      return value as number;
    },
    consumed: () => index,
  };
}

function item(key: string, damageProbability = 1): InternalDamageItem {
  return { key, damageProbability };
}

function facts(
  items: readonly InternalDamageItem[],
  pods: readonly InternalDamagePod[] = [],
  capacityPods = 20,
): InternalDamageFacts {
  return { items, capacityPods, pods };
}

const LAVE_MARKET_SEED = marketSeedForSystem("g0-s7");

describe("the tracer: one 32-point bank hit damages the docking computer", () => {
  it("consumes the gate, the die and the pick draws and emits equipmentDamaged", () => {
    const work = internalDamageWork(facts([item("EQ_DOCK_COMP")]));
    const events: SimEvent[] = [];
    // Gate: floor(0 * 32) = 0 < 32 passes. Die: floor(37.5 / 38 * 38) = 37, so
    // the reversed die is 38 - 38 = 0 < 1 damageable. Pick: target 0.5 * 1.
    const source = scripted([0, 37.5 / 38, 0.5]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(3);
    expect(events).toEqual([{ kind: "equipmentDamaged", key: "EQ_DOCK_COMP" }]);
    expect(work.items).toEqual([]);
  });

  it("derives the considered count: 38 for the 20 t hold, 53 with the cargo bay", () => {
    expect(consideredCount(20)).toBe(38);
    expect(consideredCount(35)).toBe(53);
  });

  it("pins the constants", () => {
    expect(PLAYER_INTERNAL_DAMAGE_FACTOR).toBe(31);
    expect(SHIP_TRADE_IN_FACTOR).toBe(95);
    expect(PLAYER_MASS_DAMAGE_TERM).toBe(21);
    expect(MAX_INTERNAL_DAMAGE_ROLLS).toBe(256);
  });
});

describe("internalDamageSeed (the stateless per-tick stream)", () => {
  it("is mix32(forkSeed(worldSeed, PLAYER_ID, 'damage'), tick >>> 0)", () => {
    const world = worldSeedFor(LAVE_MARKET_SEED, 1);
    for (const tick of [0, 1, 7, 60, 123456, 2 ** 32 + 5, -1]) {
      expect(internalDamageSeed(world, tick)).toBe(
        mix32(forkSeed(world, PLAYER_ID, "damage"), tick >>> 0),
      );
    }
  });

  it("separates ticks and does not collide with the combat stream", () => {
    const world = worldSeedFor(LAVE_MARKET_SEED, 1);
    expect(internalDamageSeed(world, 1)).not.toBe(internalDamageSeed(world, 2));
    expect(internalDamageSeed(world, 0)).not.toBe(
      forkSeed(world, PLAYER_ID, "combat"),
    );
  });

  it("pins one vector: Lave market seed, epoch 1, ticks 0 and 1", () => {
    // Derivation: world = worldSeedFor(marketSeedForSystem("g0-s7"), 1) =
    // 0x2b4e037c (tests/sim/rng.test.ts), base = forkSeed(world, 100,
    // "damage") = mix32(mix32(world, 100), 5), seed = mix32(base, tick).
    // Measured once in Docker: 0xf0bc27aa, then ticks 0 and 1 below.
    const world = worldSeedFor(LAVE_MARKET_SEED, 1);
    expect(world).toBe(0x2b4e037c);
    expect(forkSeed(world, PLAYER_ID, "damage")).toBe(0xf0bc27aa);
    expect(internalDamageSeed(world, 0)).toBe(0x1b13a557);
    expect(internalDamageSeed(world, 1)).toBe(0xb1739741);
  });
});

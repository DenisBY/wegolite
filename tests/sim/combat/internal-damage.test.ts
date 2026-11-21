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
  resolveInternalDamage,
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

// --- Task 2: every branch, boundary and draw-order case ----------------------

/** The `u` whose `floor(u * 32)` gate is `k`. */
function gateDraw(k: number): number {
  return (k + 0.5) / 32;
}

/** The `u` whose `floor(u * n)` die is `k`. */
function dieDraw(k: number, n: number): number {
  return (k + 0.5) / n;
}

function pod(commodity: string, amount: number): InternalDamagePod {
  return { commodity, amount };
}

/** A draw source that always returns `value` and counts its draws. */
function constant(value: number): Scripted {
  let count = 0;
  return {
    draw: () => {
      count += 1;
      return value;
    },
    consumed: () => count,
  };
}

describe("the gate loop (PlayerEntity.m:5690-5697)", () => {
  it("amount 1 fails on draw 1/32 after exactly one draw", () => {
    const work = internalDamageWork(facts([item("EQ_DOCK_COMP")]));
    const events: SimEvent[] = [];
    const source = scripted([1 / 32]);
    rollInternalDamage(1, work, source.draw, events);
    expect(source.consumed()).toBe(1);
    expect(events).toEqual([]);
  });

  it("amount 1 passes on draw 0 and then rolls the die", () => {
    const work = internalDamageWork(facts([]));
    const events: SimEvent[] = [];
    const source = scripted([0, 0.5]);
    rollInternalDamage(1, work, source.draw, events);
    expect(source.consumed()).toBe(2);
    expect(events).toEqual([]);
  });

  it("keeps the fractional amount: 5.5 admits draws 0 to 5 and refuses 6", () => {
    for (let k = 0; k <= 5; k += 1) {
      const source = scripted([gateDraw(k), 0.5]);
      rollInternalDamage(5.5, internalDamageWork(facts([])), source.draw, []);
      expect(source.consumed()).toBe(2);
    }
    const refused = scripted([gateDraw(6)]);
    rollInternalDamage(5.5, internalDamageWork(facts([])), refused.draw, []);
    expect(refused.consumed()).toBe(1);
  });

  it("amount exactly 32 always rolls once and stops", () => {
    const work = internalDamageWork(facts([item("EQ_DOCK_COMP")]));
    const events: SimEvent[] = [];
    // The gate at 31 still passes (31 < 32); the loop then ends at amount 0,
    // so a fourth draw would throw.
    const source = scripted([gateDraw(31), dieDraw(37, 38), 0.5]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(3);
    expect(events).toEqual([{ kind: "equipmentDamaged", key: "EQ_DOCK_COMP" }]);
  });

  it("32.5 iterates twice: the second gate passes only on draw 0", () => {
    const passes = scripted([gateDraw(31), 0.5, 0, 0.5]);
    rollInternalDamage(32.5, internalDamageWork(facts([])), passes.draw, []);
    expect(passes.consumed()).toBe(4);
    const fails = scripted([gateDraw(31), 0.5, 1 / 32]);
    rollInternalDamage(32.5, internalDamageWork(facts([])), fails.draw, []);
    expect(fails.consumed()).toBe(3);
  });

  it("makes no draw for 0, a negative, NaN or an infinity", () => {
    for (const applied of [0, -1, -0, Number.NaN, Infinity, -Infinity]) {
      const work = internalDamageWork(facts([item("EQ_DOCK_COMP")]));
      const source = scripted([]);
      const events: SimEvent[] = [];
      rollInternalDamage(applied, work, source.draw, events);
      expect(source.consumed()).toBe(0);
      expect(events).toEqual([]);
      expect(work.items).toHaveLength(1);
    }
  });

  it("a finite 1e9 makes at most 256 gate draws", () => {
    const source = constant(0.5);
    rollInternalDamage(1e9, internalDamageWork(facts([])), source.draw, []);
    // Empty work: each iteration draws the gate and the die, nothing else.
    expect(source.consumed()).toBe(2 * MAX_INTERNAL_DAMAGE_ROLLS);
  });
});

describe("the cargo branch (PlayerEntity.m:6105-6113)", () => {
  it("destroys the pod the die names and draws no pick", () => {
    const work = internalDamageWork(
      facts([item("EQ_DOCK_COMP")], [pod("food", 1), pod("gold", 1000)]),
    );
    const events: SimEvent[] = [];
    const source = scripted([0, dieDraw(1, 38)]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(2);
    expect(events).toEqual([
      { kind: "cargoDestroyed", commodity: "gold", amount: 1000 },
    ]);
    expect(work.pods).toEqual([pod("food", 1)]);
    expect(work.items).toHaveLength(1);
  });

  it("destroys pod 0 on die 0", () => {
    const work = internalDamageWork(
      facts([], [pod("food", 1), pod("gold", 2)]),
    );
    const events: SimEvent[] = [];
    rollInternalDamage(32, work, scripted([0, dieDraw(0, 38)]).draw, events);
    expect(events).toEqual([
      { kind: "cargoDestroyed", commodity: "food", amount: 1 },
    ]);
  });

  it("die == pods.length is not the cargo branch", () => {
    const work = internalDamageWork(
      facts([item("EQ_DOCK_COMP")], [pod("food", 1), pod("gold", 1000)]),
    );
    const events: SimEvent[] = [];
    // Die 2: reversed = 38 - 3 = 35, not below the one damageable item.
    const source = scripted([0, dieDraw(2, 38)]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(2);
    expect(events).toEqual([]);
    expect(work.pods).toHaveLength(2);
    expect(work.items).toHaveLength(1);
  });

  it("a destroyed pod damages no equipment on that roll", () => {
    const work = internalDamageWork(
      facts([item("EQ_DOCK_COMP")], [pod("food", 1)]),
    );
    const events: SimEvent[] = [];
    rollInternalDamage(32, work, scripted([0, dieDraw(0, 38)]).draw, events);
    expect(events.map((event) => event.kind)).toEqual(["cargoDestroyed"]);
    expect(work.items).toHaveLength(1);
  });
});

describe("the reversed die (PlayerEntity.m:6115, 6131)", () => {
  const four = [item("EQ_A"), item("EQ_B"), item("EQ_C"), item("EQ_D")];

  it("die 34 gives reversed 3 and damages", () => {
    const work = internalDamageWork(facts(four));
    const events: SimEvent[] = [];
    // Pick u 0.3: target 1.2 over odds 4; the running sum first exceeds it at B.
    const source = scripted([0, dieDraw(34, 38), 0.3]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(3);
    expect(events).toEqual([{ kind: "equipmentDamaged", key: "EQ_B" }]);
    expect(work.items.map((entry) => entry.key)).toEqual([
      "EQ_A",
      "EQ_C",
      "EQ_D",
    ]);
  });

  it("die 33 gives reversed 4, which is not below four: nothing, no pick draw", () => {
    const work = internalDamageWork(facts(four));
    const events: SimEvent[] = [];
    const source = scripted([0, dieDraw(33, 38)]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(2);
    expect(events).toEqual([]);
    expect(work.items).toHaveLength(4);
  });

  it("die 37 gives reversed 0 and damages", () => {
    const work = internalDamageWork(facts(four));
    const events: SimEvent[] = [];
    rollInternalDamage(
      32,
      work,
      scripted([0, dieDraw(37, 38), 0]).draw,
      events,
    );
    expect(events).toEqual([{ kind: "equipmentDamaged", key: "EQ_A" }]);
  });

  it("considered 0 with no pods draws no die and the reversed die wraps: nothing", () => {
    const work = internalDamageWork(facts([item("EQ_DOCK_COMP")], [], 0));
    const events: SimEvent[] = [];
    const source = scripted([]);
    resolveInternalDamage(work, 0, source.draw, events);
    expect(source.consumed()).toBe(0);
    expect(events).toEqual([]);
    expect(work.items).toHaveLength(1);
  });

  it("considered 0 with a pod draws no die and destroys pod 0 (d = 0, :6102)", () => {
    const work = internalDamageWork(
      facts([item("EQ_DOCK_COMP")], [pod("food", 1), pod("gold", 2)], 0),
    );
    const events: SimEvent[] = [];
    const source = scripted([]);
    resolveInternalDamage(work, 0, source.draw, events);
    expect(source.consumed()).toBe(0);
    expect(events).toEqual([
      { kind: "cargoDestroyed", commodity: "food", amount: 1 },
    ]);
  });
});

describe("the weighted pick (PlayerEntity.m:6132-6142)", () => {
  const profile = [
    item("EQ_CARGO_BAY", 0),
    item("EQ_DOCK_COMP", 1),
    item("EQ_GAL_DRIVE", 1),
  ];

  function pick(
    u: number,
    items: readonly InternalDamageItem[] = profile,
  ): SimEvent[] {
    const work = internalDamageWork(facts(items));
    const events: SimEvent[] = [];
    // Die 37: reversed 0, below every damageable count used here.
    const source = scripted([0, dieDraw(37, 38), u]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(3);
    return events;
  }

  it("u 0.49 (target 0.98) picks EQ_DOCK_COMP", () => {
    expect(pick(0.49)).toEqual([
      { kind: "equipmentDamaged", key: "EQ_DOCK_COMP" },
    ]);
  });

  it("u 0.5 (target 1.0) picks EQ_GAL_DRIVE: the comparison is strict", () => {
    expect(pick(0.5)).toEqual([
      { kind: "equipmentDamaged", key: "EQ_GAL_DRIVE" },
    ]);
  });

  it("a zero-probability item counts toward the slots but is never picked", () => {
    expect(pick(0)).toEqual([
      { kind: "equipmentDamaged", key: "EQ_DOCK_COMP" },
    ]);
  });

  it("a probability of NaN, -1 or Infinity counts as 0", () => {
    const events = pick(0.99, [
      item("EQ_A", Number.NaN),
      item("EQ_B", -1),
      item("EQ_C", Infinity),
      item("EQ_D", 1),
    ]);
    expect(events).toEqual([{ kind: "equipmentDamaged", key: "EQ_D" }]);
  });

  it("a duplicate key counts once", () => {
    // Two distinct items remain: odds 2, target 1.0 at u 0.5 picks the second.
    const events = pick(0.5, [
      item("EQ_DOCK_COMP"),
      item("EQ_DOCK_COMP"),
      item("EQ_GAL_DRIVE"),
    ]);
    expect(events).toEqual([{ kind: "equipmentDamaged", key: "EQ_GAL_DRIVE" }]);
  });

  it("odds of 0 still draw the pick and damage nothing", () => {
    const work = internalDamageWork(facts([item("EQ_A", 0)]));
    const events: SimEvent[] = [];
    const source = scripted([0, dieDraw(37, 38), 0]);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(3);
    expect(events).toEqual([]);
    expect(work.items).toHaveLength(1);
  });
});

describe("one work copy across two rolls (Pitfall 6)", () => {
  it("cannot damage the only item twice", () => {
    const work = internalDamageWork(facts([item("EQ_DOCK_COMP")]));
    const events: SimEvent[] = [];
    const source = scripted([0, dieDraw(37, 38), 0.5, 0, dieDraw(37, 38)]);
    rollInternalDamage(32, work, source.draw, events);
    rollInternalDamage(32, work, source.draw, events);
    expect(source.consumed()).toBe(5);
    expect(events).toEqual([{ kind: "equipmentDamaged", key: "EQ_DOCK_COMP" }]);
  });
});

describe("the 256-iteration cap (recorded divergence E-167)", () => {
  // An empty work copy and capacity 20: each iteration draws the gate and the
  // die (2 draws) and changes nothing.
  function emptyWork() {
    return internalDamageWork(facts([]));
  }

  it("8192 makes exactly 256 iterations, Oolite's count", () => {
    const source = constant(0.5);
    rollInternalDamage(8192, emptyWork(), source.draw, []);
    expect(source.consumed()).toBe(512);
  });

  it("8224 consumes 512 draws where Oolite's loop would consume 514", () => {
    // Oolite: amounts 8224, 8192, ..., 32 are 257 iterations, each gate certain
    // at 32 or more, so 257 * 2 = 514 draws.
    const source = constant(0.5);
    rollInternalDamage(8224, emptyWork(), source.draw, []);
    expect(source.consumed()).toBe(512);
  });

  it("8192.5 consumes 512 where Oolite's 257th iteration (amount 0.5) draws again", () => {
    const source = constant(0.5);
    rollInternalDamage(8192.5, emptyWork(), source.draw, []);
    expect(source.consumed()).toBe(512);
  });

  it("the next same-tick record starts at draw 513, 2 draws earlier than Oolite's", () => {
    const work = emptyWork();
    const source = constant(0.5);
    rollInternalDamage(8224, work, source.draw, []);
    expect(source.consumed()).toBe(512);
    // 64 -> 32: two iterations of two draws, from draw 513.
    rollInternalDamage(64, work, source.draw, []);
    expect(source.consumed()).toBe(516);
  });
});

describe("consideredCount", () => {
  it("is (capacity + 21) * 95 / 100 in integer arithmetic", () => {
    expect(consideredCount(20)).toBe(38);
    expect(consideredCount(35)).toBe(53);
    expect(consideredCount(15)).toBe(34);
    expect(consideredCount(0)).toBe(19);
    expect(consideredCount(-5)).toBe(19);
    expect(consideredCount(Number.NaN)).toBe(19);
    expect(consideredCount(Infinity)).toBe(19);
  });

  it("truncates a fractional capacity like the C's unsigned integer", () => {
    expect(consideredCount(20.9)).toBe(38);
  });
});

describe("internalDamageWork", () => {
  it("copies, keeps the first occurrence of a key and sanitises probabilities", () => {
    const input = facts(
      [
        item("EQ_A", 1),
        item("EQ_A", 0),
        item("EQ_B", Number.NaN),
        item("EQ_C", -3),
      ],
      [pod("food", 2)],
    );
    const before = JSON.stringify(input);
    const work = internalDamageWork(input);
    expect(work.items).toEqual([
      item("EQ_A", 1),
      item("EQ_B", 0),
      item("EQ_C", 0),
    ]);
    work.items.length = 0;
    work.pods.length = 0;
    expect(JSON.stringify(input)).toBe(before);
  });
});

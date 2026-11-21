// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Totality of the player's internal-damage roll (CBT-08, Phase 19 plan 19-02,
 * threats T-19-02 and T-19-03).
 *
 * For any facts (arbitrary keys, probabilities including NaN, negative and
 * Infinity, capacities including negative and NaN, pods) and any applied amount
 * (including NaN, Infinity, 1e18 and 1e308), driven by a stream from any uint32
 * seed: `rollInternalDamage` never throws, never mutates its input facts, never
 * damages one item twice through one work copy, never destroys more pods than
 * exist and never passes the gate more than 256 times.
 *
 * The property covers `rollInternalDamage` only. `internalDamageSeed` calls
 * `forkSeed`, which throws a `RangeError` on a non-finite world seed that
 * `createWorld` already rejects, so no totality claim is made about the seed.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  internalDamageWork,
  MAX_INTERNAL_DAMAGE_ROLLS,
  rollInternalDamage,
} from "../../../src/sim/combat/internal-damage.js";
import type { InternalDamageFacts } from "../../../src/sim/combat/internal-damage.js";
import type { SimEvent } from "../../../src/sim/events.js";
import { createRngState, rngNext } from "../../../src/sim/rng.js";

// A small key pool makes duplicates likely.
const keyArb = fc.constantFrom("EQ_A", "EQ_B", "EQ_C", "EQ_D", "EQ_E", "EQ_F");

const probabilityArb = fc.oneof(
  fc.constantFrom(0, 1, -1, Number.NaN, Infinity, -Infinity),
  fc.double({ min: -2, max: 5, noNaN: false }),
);

const capacityArb = fc.oneof(
  fc.constantFrom(20, 35, 0, -5, Number.NaN, Infinity, -Infinity, 1e308),
  fc.double({ min: -100, max: 200, noNaN: false }),
);

const appliedArb = fc.oneof(
  fc.constantFrom(
    0,
    -0,
    1,
    32,
    32.5,
    8192,
    8224,
    1e9,
    1e18,
    1e308,
    Number.MAX_VALUE,
    Number.NaN,
    Infinity,
    -Infinity,
    -1,
  ),
  fc.double({ min: -50, max: 400, noNaN: false }),
);

const factsArb: fc.Arbitrary<InternalDamageFacts> = fc.record({
  items: fc.array(
    fc.record({ key: keyArb, damageProbability: probabilityArb }),
    { maxLength: 10 },
  ),
  capacityPods: capacityArb,
  pods: fc.array(
    fc.record({
      commodity: fc.constantFrom("food", "gold", "radioactives"),
      amount: fc.integer({ min: 1, max: 35 }),
    }),
    { maxLength: 8 },
  ),
});

/** A JSON snapshot that keeps NaN and the infinities distinct from null. */
function snapshot(facts: InternalDamageFacts): string {
  return JSON.stringify(facts, (_key, value: unknown) =>
    typeof value === "number" && !Number.isFinite(value)
      ? `n:${String(value)}`
      : value,
  );
}

describe("rollInternalDamage totality", () => {
  it("never throws, never mutates the facts, never damages an item twice", () => {
    fc.assert(
      fc.property(
        factsArb,
        fc.array(appliedArb, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (facts, hits, seed) => {
          const before = snapshot(facts);
          const work = internalDamageWork(facts);
          const sanitised = new Map(
            work.items.map((entry) => [entry.key, entry.damageProbability]),
          );
          const podCount = facts.pods.length;
          const stream = createRngState(seed);
          let draws = 0;
          const draw = (): number => {
            draws += 1;
            return rngNext(stream);
          };
          const events: SimEvent[] = [];
          for (const applied of hits) {
            rollInternalDamage(applied, work, draw, events);
          }

          // The facts are untouched.
          expect(snapshot(facts)).toBe(before);

          // Each damaged key is distinct and was an item with a positive,
          // sanitised probability.
          const keys: string[] = [];
          let cargoEvents = 0;
          for (const event of events) {
            if (event.kind === "equipmentDamaged") {
              keys.push(event.key);
              expect(sanitised.get(event.key) ?? 0).toBeGreaterThan(0);
            } else if (event.kind === "cargoDestroyed") {
              cargoEvents += 1;
            } else {
              throw new Error(`unexpected event ${event.kind}`);
            }
          }
          expect(new Set(keys).size).toBe(keys.length);
          expect(work.items).toHaveLength(sanitised.size - keys.length);
          expect(cargoEvents).toBeLessThanOrEqual(podCount);
          expect(work.pods).toHaveLength(podCount - cargoEvents);

          // At most 256 iterations per hit, each at most three draws (gate,
          // die, pick): the loop is bounded.
          expect(draws).toBeLessThanOrEqual(
            hits.length * MAX_INTERNAL_DAMAGE_ROLLS * 3,
          );
        },
      ),
      { seed: 20261921, numRuns: 400 },
    );
  });

  it("a zero-probability item changes neither the events nor the draws (CR-01)", () => {
    // Oolite's damageableCounter and damageableOdds count only `canBeDamaged`
    // items (PlayerEntity.m:6119-6126), so dropping every sanitised
    // zero-probability item from the work copy must leave the roll unchanged.
    let withZeroItems = 0;
    let withZeroItemsAndDamage = 0;
    fc.assert(
      fc.property(
        factsArb,
        fc.array(appliedArb, { minLength: 1, maxLength: 3 }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (facts, hits, seed) => {
          const run = (dropZero: boolean) => {
            const work = internalDamageWork(facts);
            if (dropZero) {
              work.items = work.items.filter(
                (entry) => entry.damageProbability > 0,
              );
            }
            const stream = createRngState(seed);
            let draws = 0;
            const draw = (): number => {
              draws += 1;
              return rngNext(stream);
            };
            const events: SimEvent[] = [];
            for (const applied of hits) {
              rollInternalDamage(applied, work, draw, events);
            }
            return { events, draws, items: work.items.length };
          };
          const full = run(false);
          const dropped = run(true);
          expect(dropped.events).toEqual(full.events);
          expect(dropped.draws).toBe(full.draws);
          if (full.items !== dropped.items) {
            withZeroItems += 1;
            if (full.events.some((e) => e.kind === "equipmentDamaged")) {
              withZeroItemsAndDamage += 1;
            }
          }
        },
      ),
      { seed: 20261923, numRuns: 400 },
    );
    // Non-vacuous: the zero-probability items were present, and damage was
    // dealt among them, in a meaningful share of the runs.
    expect(withZeroItems).toBeGreaterThan(50);
    expect(withZeroItemsAndDamage).toBeGreaterThan(5);
  });

  it("makes at most 256 gate passes for any amount", () => {
    fc.assert(
      fc.property(
        appliedArb,
        fc.integer({ min: 0, max: 0xffffffff }),
        (applied, seed) => {
          // An empty work copy: each iteration draws the gate and the die, so
          // the draw count is twice the iteration count.
          const stream = createRngState(seed);
          let draws = 0;
          rollInternalDamage(
            applied,
            internalDamageWork({ items: [], capacityPods: 20, pods: [] }),
            () => {
              draws += 1;
              return rngNext(stream);
            },
            [],
          );
          expect(draws).toBeLessThanOrEqual(2 * MAX_INTERNAL_DAMAGE_ROLLS);
        },
      ),
      { seed: 20261922, numRuns: 200 },
    );
  });
});

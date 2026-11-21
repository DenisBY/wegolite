// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's internal damage (CBT-08, Phase 19): when a hit reaches the
 * energy bank, a gate loop decides whether the hit also breaks something, and
 * one `takeInternalDamage` die roll picks a cargo pod or an installed item.
 * A pure, total port of Oolite's `PlayerEntity.m`: the gate loop at
 * `:5690-5697` (and the laser twin at `:5744-5753`), `takeInternalDamage` at
 * `:6097-6185`, with `PLAYER_INTERNAL_DAMAGE_FACTOR 31` (`PlayerEntity.h:331`).
 *
 * The module only reports: it pushes `equipmentDamaged` and `cargoDestroyed`
 * events and edits the caller's work copy. The profile update, the wording and
 * the draw source belong to the callers (`./ledger.ts` in plan 19-04, the app
 * in plan 19-10).
 *
 * Draw mapping (the `../world/debris.ts` convention): Oolite's
 * `ranrot_rand() & 31` is `floor(u * 32)`, `ranrot_rand() % n` is
 * `floor(u * n)` and `randf()` is `u`. The `u` is a float64, finer than
 * Oolite's 16-bit `randf` (`legacy_random.c:142-144`); this is unobservable
 * while every compiled damage probability is 0 or 1. The comparisons keep the
 * C's types: the gate compares an integer with the (possibly fractional)
 * amount, `n_considered` is integer arithmetic, and the pick comparison is
 * strict.
 *
 * The stream is stateless per tick (`internalDamageSeed`): the caller forks one
 * `createRngState(internalDamageSeed(worldSeed, tick))` per ledger call and
 * passes `() => rngNext(state)` as `draw`; nothing is stored, hashed or saved,
 * so no existing twin or golden moves (Key Decisions, Phase 19 plan 19-02).
 * This module never creates a stream itself.
 *
 * Two early returns of the C have no reachable counterpart here:
 * `if (!cargo_desc) return NO` (`PlayerEntity.m:6108-6109`), because every pod
 * the caller lists names a tradeable good; and the nil pick at `:6143-6146`,
 * because the strict pick over a positive probability sum always finds an item.
 * The cosmetic branch (`:6179-6182`, the trade-in factor falling by one) is not
 * ported (D-05; see the todo `.planning/todos/pending/
 * 2026-11-21-hull-wear-renovation-and-fuel-price.md` and its tripwire).
 */

import { forkSeed, mix32 } from "../rng.js";
import type { SimEvent } from "../events.js";
import { PLAYER_ID } from "../world/ids.js";
import { PLAYER_MASS_KG } from "./constants.js";

/** `PLAYER_INTERNAL_DAMAGE_FACTOR` (`PlayerEntity.h:331`): the gate mask. */
export const PLAYER_INTERNAL_DAMAGE_FACTOR = 31;

/**
 * Oolite's `ship_trade_in_factor` of a new ship (`PlayerEntity.m:1739`, load
 * default `:1063`). A constant here and never persisted: the cosmetic branch
 * that lowers it is not ported, and `EQ_RENOVATION` (which raises it) and the
 * fuel-price effect are deferred together (D-05; Key Decisions, plan 19-02;
 * the todo and tripwire named in the file header).
 */
export const SHIP_TRADE_IN_FACTOR = 95;

/**
 * The C's `unsigned n_mass = [self mass] / 10000` for the player Cobra Mk III
 * (21): integer division, so the floor.
 */
export const PLAYER_MASS_DAMAGE_TERM = Math.floor(PLAYER_MASS_KG / 10_000);

/**
 * A recorded divergence from Oolite (D-01, D-12; FIDELITY E-167 in plan 19-14):
 * Oolite's two gate loops are uncapped (`PlayerEntity.m:5691-5697`,
 * `5746-5752`). The cap keeps the roll total: in float64 a finite amount of
 * 1e18 or more has `amount - 32 === amount`, so an uncapped loop would never
 * end, and a hostile `capacityPods` makes the die miss every pod and item, so
 * running until nothing is left is no bound either. Oolite's iteration count is
 * exact up to 8,192 points past the shield (8,192 makes exactly 256 iterations;
 * 8,192.5 and 8,224 make 256 where Oolite makes 257). A laser roll needs energy
 * above 0 after the hit, so its amount is below the 256-point bank (at most 8
 * iterations); the cap binds only on a scrape above 8,192 points, which
 * destroys Oolite's player (bank at most 256) in the same call, so it is
 * observable only through the Phase 20 gap (Wegolite's player survives at
 * energy 0).
 */
export const MAX_INTERNAL_DAMAGE_ROLLS = 256;

/** One installed item the roll may damage, in `profile.equipment` order. */
export interface InternalDamageItem {
  readonly key: string;
  /** `Equipment.damageProbability` (0 or 1 for every compiled record). */
  readonly damageProbability: number;
}

/** One cargo pod, in hold order. */
export interface InternalDamagePod {
  readonly commodity: string;
  readonly amount: number;
}

/** What the roll reads about the player's ship (never mutated). */
export interface InternalDamageFacts {
  readonly items: readonly InternalDamageItem[];
  /** `maxAvailableCargoSpace`: the hold capacity in pods, 20 for a new Cobra. */
  readonly capacityPods: number;
  readonly pods: readonly InternalDamagePod[];
}

/** The mutable copy a roll edits: a damaged item or a lost pod leaves it. */
export interface InternalDamageWork {
  items: InternalDamageItem[];
  capacityPods: number;
  pods: InternalDamagePod[];
}

/**
 * A work copy of `facts`: arrays and records are copied (the facts are never
 * mutated), only the first occurrence of a key is kept, and a non-finite or
 * negative probability counts as 0.
 */
export function internalDamageWork(
  facts: InternalDamageFacts,
): InternalDamageWork {
  const seen = new Set<string>();
  const items: InternalDamageItem[] = [];
  for (const item of facts.items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    const p = item.damageProbability;
    items.push({
      key: item.key,
      damageProbability: Number.isFinite(p) && p > 0 ? p : 0,
    });
  }
  return {
    items,
    capacityPods: facts.capacityPods,
    pods: facts.pods.map((pod) => ({
      commodity: pod.commodity,
      amount: pod.amount,
    })),
  };
}

/**
 * The seed of one tick's damage stream:
 * `mix32(forkSeed(worldSeed, PLAYER_ID, "damage"), tick >>> 0)`. `"damage"` is
 * not an entity purpose, so no stored stream moves. Throws a `RangeError` on a
 * non-finite world seed, as `forkSeed` does (`createWorld` already rejects one).
 */
export function internalDamageSeed(worldSeed: number, tick: number): number {
  return mix32(forkSeed(worldSeed, PLAYER_ID, "damage"), tick >>> 0);
}

/**
 * `n_considered = (n_cargo + n_mass) * ship_trade_in_factor / 100` in unsigned
 * integer arithmetic (`PlayerEntity.m:6099-6101`): 38 for the 20 t hold, 53
 * with the cargo bay. A negative or non-finite capacity counts as 0.
 */
export function consideredCount(capacityPods: number): number {
  const cargo = Number.isFinite(capacityPods)
    ? Math.max(0, Math.floor(capacityPods))
    : 0;
  return Math.floor(
    ((cargo + PLAYER_MASS_DAMAGE_TERM) * SHIP_TRADE_IN_FACTOR) / 100,
  );
}

/**
 * One `takeInternalDamage` (`PlayerEntity.m:6097-6185`): a die over
 * `considered`, then in order the cargo branch (the die names a pod), the
 * equipment branch (the die reversed names a damageable slot, then one
 * weighted pick) and, in Oolite, a cosmetic branch that is not ported (D-05).
 * `considered` is passed in so a hand test can drive any value.
 */
export function resolveInternalDamage(
  work: InternalDamageWork,
  considered: number,
  draw: () => number,
  events: SimEvent[],
): void {
  // `n_considered ? ranrot_rand() % n_considered : 0` (`:6102`).
  const die = considered > 0 ? Math.floor(draw() * considered) : 0;

  // Cargo damage (`:6105-6113`).
  if (die < work.pods.length) {
    const [pod] = work.pods.splice(die, 1);
    if (pod !== undefined) {
      events.push({
        kind: "cargoDestroyed",
        commodity: pod.commodity,
        amount: pod.amount,
      });
    }
    return;
  }

  // Reverse the die (`:6115`). The C's unsigned `n_considered - (damage_to + 1)`
  // wraps a negative value to a huge one, which fails `< damageableCounter`, so
  // the `>= 0` is written out: a plain `-1 < 4` would damage an item where
  // Oolite damages none.
  const reversed = considered - (die + 1);
  // `damageableCounter` and `damageableOdds` (`:6119-6126`) count only an item
  // that `canBeDamaged` (`OOEquipmentType.m:512-520`: probability above 0; a
  // missile or mine never reaches `profile.equipment`), so a zero-probability
  // item such as `EQ_CARGO_BAY` adds neither a slot nor odds. The pick loop
  // below still walks every item, as the C's does, and a 0 adds nothing to it.
  let damageable = 0;
  let odds = 0;
  for (const item of work.items) {
    if (item.damageProbability > 0) {
      damageable += 1;
      odds += item.damageProbability;
    }
  }
  if (reversed >= 0 && reversed < damageable) {
    const target = draw() * odds;
    let accumulator = 0;
    for (let i = 0; i < work.items.length; i += 1) {
      const item = work.items[i];
      if (item === undefined) continue;
      accumulator += item.damageProbability;
      if (accumulator > target) {
        work.items.splice(i, 1);
        events.push({ kind: "equipmentDamaged", key: item.key });
        return;
      }
    }
  }
  // The cosmetic branch (`:6179-6182`) is not ported (D-05).
}

/**
 * The gate loop (`PlayerEntity.m:5691-5697`): for `amount = applied; amount > 0;
 * amount -= 32`, one gate draw, and `floor(u * 32) < amount` passes into one
 * `takeInternalDamage`. `applied` is what reached the energy bank after the
 * shield. A non-finite or non-positive `applied` makes no draw. At most
 * `MAX_INTERNAL_DAMAGE_ROLLS` iterations (a recorded divergence, see the
 * constant). Edits `work` and pushes events; never throws.
 */
export function rollInternalDamage(
  applied: number,
  work: InternalDamageWork,
  draw: () => number,
  events: SimEvent[],
): void {
  if (!Number.isFinite(applied) || !(applied > 0)) return;
  let amount = applied;
  for (let i = 0; i < MAX_INTERNAL_DAMAGE_ROLLS && amount > 0; i += 1) {
    const gate = Math.floor(draw() * (PLAYER_INTERNAL_DAMAGE_FACTOR + 1));
    if (gate < amount) {
      resolveInternalDamage(
        work,
        consideredCount(work.capacityPods),
        draw,
        events,
      );
    }
    amount -= PLAYER_INTERNAL_DAMAGE_FACTOR + 1;
  }
}

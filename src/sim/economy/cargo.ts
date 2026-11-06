// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Cargo, pods and hold accounting (ECON-03, D-07).
 *
 * Oolite measures hold usage in **pods**, not physical mass. A tonne is one
 * pod; gold and platinum (kg) and gem-stones (g) ride in a pod that has a
 * "safe" half-unit, so 499 kg / 499,999 g fit without consuming a new pod.
 * The boundaries are Oolite's own (`PlayerEntity.h:1294-1297`):
 *
 *   KILOGRAMS_PER_POD = 1000, MAX_KILOGRAMS_IN_SAFE = 499
 *   GRAMS_PER_POD = 1_000_000, MAX_GRAMS_IN_SAFE = 499_999
 *
 * Every function is pure, takes plain data and never mutates its input. The
 * capacity function is deliberately unclamped so a saved over-capacity hold
 * stays visible to the save validator instead of being silently fixed.
 */

import type { CommodityUnit } from "../../content/types.js";

export const KILOGRAMS_PER_POD = 1000;
export const MAX_KILOGRAMS_IN_SAFE = 499;
export const GRAMS_PER_POD = 1_000_000;
export const MAX_GRAMS_IN_SAFE = 499_999;

/** The Cobra Mk III's base hold. */
export const BASE_CAPACITY_PODS = 20;
/** The Large Cargo Bay's extra hold (`extra_cargo = 15`). */
export const CARGO_BAY_PODS = 15;
/** A passenger berth consumes five tonnes of total capacity. */
export const PASSENGER_BERTH_PODS = 5;

export const CARGO_BAY_KEY = "EQ_CARGO_BAY";

/** A null-prototype cargo map keyed by commodity identity. */
export type Cargo = Readonly<Record<string, number>>;

/** The pod size and safe allowance for a unit, or `undefined` for tonnes. */
function podRule(
  unit: CommodityUnit,
): { readonly podSize: number; readonly safe: number } | undefined {
  if (unit === "kg") {
    return { podSize: KILOGRAMS_PER_POD, safe: MAX_KILOGRAMS_IN_SAFE };
  }
  if (unit === "g") {
    return { podSize: GRAMS_PER_POD, safe: MAX_GRAMS_IN_SAFE };
  }
  return undefined;
}

/**
 * Pods consumed by `quantity` units of a commodity.
 *
 * A bulk commodity (`t`) counts one pod per unit. A kg/g quantity uses Oolite's
 * integer rule `floor((podSize - safe - 1 + quantity) / podSize)`, which is
 * `floor((500 + qty) / 1000)` for kg and `floor((500000 + qty) / 1000000)` for
 * grams.
 */
export function podsFor(unit: CommodityUnit, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0) {
    return Number.NaN;
  }
  const rule = podRule(unit);
  if (rule === undefined) return quantity;
  return Math.floor((rule.podSize - rule.safe - 1 + quantity) / rule.podSize);
}

/**
 * Sum the pods of every cargo entry, optionally skipping one key.
 *
 * An unknown commodity is conservatively counted as a tonne per unit: the save
 * allow-list rejects it first, and an unknown must never be free space.
 */
function sumPods(
  cargo: Cargo,
  units: ReadonlyMap<string, CommodityUnit>,
  exceptKey?: string,
): number {
  let pods = 0;
  for (const [key, quantity] of Object.entries(cargo)) {
    if (key === exceptKey) continue;
    const unit = units.get(key) ?? "t";
    const used = podsFor(unit, quantity);
    if (!Number.isSafeInteger(used)) return Number.NaN;
    pods += used;
  }
  return pods;
}

/** Pods used by a whole cargo map. */
export function holdPodsUsed(
  cargo: Cargo,
  units: ReadonlyMap<string, CommodityUnit>,
): number {
  return sumPods(cargo, units);
}

/**
 * Pods used by every cargo entry **except** `exceptKey`.
 *
 * The kg/g buy limit needs the space taken by the other goods only: the pod
 * already occupied by the good being bought is part of the feasible room
 * (`maxAdditional` counts it), so subtracting it twice would under-allow.
 */
export function otherPodsFor(
  cargo: Cargo,
  units: ReadonlyMap<string, CommodityUnit>,
  exceptKey: string,
): number {
  return sumPods(cargo, units, exceptKey);
}

/**
 * The hold's capacity in pods: 20 t, plus 15 t for a Large Cargo Bay, minus
 * five tonnes per passenger berth. Deliberately **unclamped** — a negative
 * capacity is corrupt state, not something to hide at zero.
 */
export function capacityPodsFor(
  equipment: readonly string[],
  passengerBerths: number,
): number {
  const cargoBay = equipment.includes(CARGO_BAY_KEY) ? CARGO_BAY_PODS : 0;
  return BASE_CAPACITY_PODS + cargoBay - PASSENGER_BERTH_PODS * passengerBerths;
}

/** Free pods in the profile's hold (may be negative for corrupt data). */
export function availablePods(
  profile: {
    readonly cargo: Cargo;
    readonly equipment: readonly string[];
    readonly passengerBerths: number;
  },
  units: ReadonlyMap<string, CommodityUnit>,
): number {
  return (
    capacityPodsFor(profile.equipment, profile.passengerBerths) -
    holdPodsUsed(profile.cargo, units)
  );
}

/**
 * The largest additional kg/g quantity that fits the remaining hold.
 *
 * `podsFor` uses the safe half-unit, so `n` pods hold `n * podSize + safe`
 * units and the *additional* room is
 *
 *   `max(0, (capacityPods - otherPods + 1) * podSize - (podSize - safe - 1)
 *         - alreadyHeld - 1)`
 *
 * The `+1` pod is the one the held good already occupies: when the hold is full
 * of other cargo, 499 kg / 499,999 g still fit in that pod's safe. Subtracting
 * `alreadyHeld` from `availablePods * podSize` instead would under-allow by a
 * whole pod. Never negative.
 */
export function maxAdditional(
  unit: CommodityUnit,
  alreadyHeld: number,
  otherPods: number,
  capacityPods: number,
): number {
  const rule = podRule(unit);
  if (rule === undefined) {
    return Math.max(0, capacityPods - otherPods);
  }
  const raw =
    (capacityPods - otherPods + 1) * rule.podSize -
    (rule.podSize - rule.safe - 1) -
    alreadyHeld -
    1;
  return Math.max(0, raw);
}

/** An empty null-prototype cargo map. */
export function emptyCargo(): Cargo {
  return Object.create(null) as Cargo;
}

/**
 * Set one commodity's quantity, omitting zero entries. Returns a new
 * null-prototype map; the input is never mutated.
 */
export function setCargo(cargo: Cargo, key: string, quantity: number): Cargo {
  const next = Object.create(null) as Record<string, number>;
  for (const [entryKey, held] of Object.entries(cargo)) {
    if (entryKey !== key && held !== 0) next[entryKey] = held;
  }
  if (quantity !== 0) next[key] = quantity;
  return next;
}

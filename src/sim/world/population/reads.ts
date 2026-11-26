// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Total reads of untrusted facts, shared by the planner (`plan.ts`) and the
 * builders (`kit.ts` and the files that import it). Each helper accepts any
 * value and never throws, so a malformed fact reads as an absent field, NaN or
 * an empty list instead of crashing the arrival's install block (T-22-09).
 *
 * The module is pure and imports nothing.
 */

/** A member of an untrusted value, or undefined. */
export function readField(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;
}

/** A number field; anything else reads as NaN. */
export function numberOf(value: unknown): number {
  return typeof value === "number" ? value : Number.NaN;
}

/** A list field; anything else reads as an empty list. */
export function listOf(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? (value as readonly unknown[]) : [];
}

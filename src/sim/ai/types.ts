// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The AI component's data shape (FOUND-11). Types plus one closed vocabulary;
 * the AI zone grows around these records in later plans.
 */

/** The registered AI keys. The AI registry (plan 08-09) keys on the same list. */
export const AI_KEYS = ["test-pilot"] as const;
export type AiKey = (typeof AI_KEYS)[number];

/**
 * One AI param value. This is the domain the three validators share
 * (`spawnEntity`, `sanitizeEntity` and the snapshot parser):
 *
 * - `null` and `boolean` are legal scalars and survive a JSON round trip
 *   unchanged;
 * - a `number` is legal only when finite with magnitude at most
 *   `MAX_ENTITY_MAGNITUDE`, so a non-finite number is never a legal param:
 *   `spawnEntity` refuses it, `sanitizeEntity` repairs it to 0, and
 *   `snapshotWorld` refuses to emit it, because JSON would turn it into a
 *   legal `null`;
 * - a `string` is at most `MAX_SNAPSHOT_STRING_LENGTH` code units;
 * - an array holds finite numbers (same bound) or strings only, never `null`,
 *   a boolean, an array or an object, and at most `MAX_SNAPSHOT_PARAM_LENGTH`
 *   elements.
 *
 * A nested plain object is never legal.
 */
export type ParamValue =
  null | boolean | number | string | readonly (number | string)[];

/** The AI state of one entity. Integer ticks; `wakeTick` 0 means none. */
export interface AiComponent {
  aiKey: AiKey;
  params: Record<string, ParamValue>;
  wakeTick: number;
  nextThinkTick: number;
}

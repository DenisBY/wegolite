// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The boundary table of the v5 entity fields (FOUND-20, plan 21-03), shared by
 * the spawn, snapshot and sanitize tests so one definition of "at the bound,
 * one step outside it, and the wrong type" serves all three boundaries.
 *
 * Expected values come from the rules in the plan (the bounds named in
 * `src/sim/world/limits.ts`), never from running the code under test.
 */

import type { Entity } from "../../src/sim/world/entity.js";

/** One scalar v5 field, flat on the entity, the snapshot and `SpawnInit`. */
export interface V5Scalar {
  /** The entity, snapshot and `SpawnInit` key. */
  readonly key: keyof Entity;
  /** The value of a pristine entity. */
  readonly pristine: unknown;
  /** Values the field must accept: the bounds and a typical value. */
  readonly accepted: readonly unknown[];
  /** Right type, outside the bound (one step outside, non-integer, NaN). */
  readonly outOfBound: readonly unknown[];
  /** The wrong JS type: refused `malformed` by spawn. */
  readonly wrongType: readonly unknown[];
}

const NUMBER_WRONG_TYPE: readonly unknown[] = ["3", null, true, {}];
const STRING_WRONG_TYPE: readonly unknown[] = [3, null, true, ["a"]];

/** The scalar fields in the fixed segment order (`bty, role, grp, ck, pod, fuel, sys`). */
export const V5_SCALARS: readonly V5Scalar[] = [
  {
    key: "bounty",
    pristine: 0,
    accepted: [0, 1, 65535],
    outOfBound: [65536, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY],
    wrongType: NUMBER_WRONG_TYPE,
  },
  {
    key: "role",
    pristine: "",
    accepted: ["", "trader", "police-witchpoint-patrol", "a-9", "x".repeat(32)],
    outOfBound: ["x".repeat(33), "Trader", "a b", "a_b", "__proto__", "café"],
    wrongType: STRING_WRONG_TYPE,
  },
  {
    key: "groupId",
    pristine: 0,
    accepted: [0, 101, 4294967295],
    outOfBound: [
      -1,
      1.5,
      1,
      100,
      2 ** 32,
      Number.NaN,
      Number.POSITIVE_INFINITY,
    ],
    wrongType: NUMBER_WRONG_TYPE,
  },
  {
    key: "cargoKind",
    pristine: 0,
    accepted: [0, 3, 6],
    outOfBound: [7, -1, 1.5, Number.NaN],
    wrongType: NUMBER_WRONG_TYPE,
  },
  {
    key: "podCommodity",
    pristine: "",
    accepted: ["", "food", "gem_stones", "x9_", "a".repeat(64)],
    outOfBound: ["a".repeat(65), "Food", "gem stones", "a-b", "__proto__xé"],
    wrongType: STRING_WRONG_TYPE,
  },
  {
    key: "podAmount",
    pristine: 0,
    accepted: [0, 34, 255],
    outOfBound: [256, -1, 1.5, Number.NaN],
    wrongType: NUMBER_WRONG_TYPE,
  },
  {
    key: "fuel",
    pristine: 0,
    accepted: [0, 7, 65535],
    outOfBound: [65536, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY],
    wrongType: NUMBER_WRONG_TYPE,
  },
  {
    key: "homeSystem",
    pristine: -1,
    accepted: [-1, 0, 7, 255],
    outOfBound: [-2, 256, 1.5, Number.NaN],
    wrongType: NUMBER_WRONG_TYPE,
  },
  {
    key: "destinationSystem",
    pristine: -1,
    accepted: [-1, 0, 7, 255],
    outOfBound: [-2, 256, 1.5, Number.NaN],
    wrongType: NUMBER_WRONG_TYPE,
  },
];

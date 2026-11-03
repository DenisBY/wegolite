// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `like_ship` resolution, verbatim from Oolite's `OOShipRegistry.m` at
 * `7437f22` (DATA-02, D-02, D-17, D-18, T-02-02).
 *
 * The rules are small and easy to get subtly wrong, so they are restated here:
 *
 * - **The merge is shallow.** `{ ...parent, ...child }` and nothing more, so
 *   `materials` and `subentities` are replaced wholesale, never merged key by
 *   key. A deep merge would blend a pirate variant's texture into the player's
 *   Cobra.
 * - **`like_ship` is always stripped** from the resolved entry.
 * - **`display_name` and `is_template` are inherited only when the child
 *   declares them.** The presence test is `value !== undefined && value !==
 *   null`, not `typeof value === "string"`: the pinned Cobra template declares
 *   `is_template = 1`, an integer, and a string-type test would reclassify 173
 *   entries as templates instead of 81.
 * - **Five alias pairs collapse to the child's spelling**: `scan_class`/
 *   `scanClass`, `escort_role`/`escort-role`, `escort_ship`/`escort-ship`,
 *   `is_carrier`/`isCarrier`, `has_shipyard`/`hasShipyard`.
 * - **`shipdata-overrides.plist` runs on the raw entries before resolution**
 *   and never adds an entry that `shipdata.plist` does not declare.
 * - **Cycles and dangling targets fail loudly.** A cycle carries the whole
 *   closed chain (`a -> b -> c -> a`); a missing target is `LIKE_SHIP_DANGLING`
 *   unless the entry declares `is_external_dependency`, which Oolite treats as
 *   intentional. A chain deeper than 64 fails rather than recursing forever.
 *
 * Dictionary storage is `Map`, never a plain object keyed by a plist key: a
 * `__proto__` ship key must stay ordinary data and integer-like keys must not be
 * reordered (T-02-11). Nothing here evaluates a value.
 */

import { contentError } from "./content-error.js";
import { dictToMap } from "./openstep/plist-value.js";
import type { PlistDict, PlistValue } from "./openstep/plist-value.js";

/** A resolved ship's fields. The outer catalogue key is separate. */
export type ShipFields = Map<string, PlistValue>;

/** Keys Oolite refuses to inherit from a parent. */
export const LIKE_SHIP_NON_INHERITABLE = [
  "display_name",
  "is_template",
] as const;

/** The five spellings Oolite collapses, snake_case first. */
export const ALIAS_PAIRS: readonly (readonly [string, string])[] = [
  ["scan_class", "scanClass"],
  ["escort_role", "escort-role"],
  ["escort_ship", "escort-ship"],
  ["is_carrier", "isCarrier"],
  ["has_shipyard", "hasShipyard"],
];

/** Defensive cap; the pinned data's longest chain is three entries. */
export const MAX_LIKE_SHIP_DEPTH = 64;

export interface ResolveOptions {
  /** Repository-relative plist path, used verbatim in every error. */
  readonly file: string;
  /** `shipdata-overrides.plist`'s root dictionary, applied before resolution. */
  readonly overrides?: PlistDict;
}

export interface ResolutionResult {
  readonly entries: Map<string, ShipFields>;
  /** Longest `key -> ... -> root` chain, counted in `like_ship` hops. */
  readonly maxChainDepth: number;
  /** Keys in the order their resolution completed (insertion-order dependent). */
  readonly order: readonly string[];
  /** The chain from each entry to its root, for diagnostics and assertions. */
  readonly chains: ReadonlyMap<string, readonly string[]>;
}

/** Convert one raw dictionary to fields with `NSMutableDictionary` last-wins. */
export function fieldsFromDict(dict: PlistDict): ShipFields {
  return dictToMap(dict);
}

function declares(child: ShipFields, key: string): boolean {
  const value = child.get(key);
  return value !== undefined && value !== null;
}

/**
 * Merge a child over its parent using Oolite's exact rules.
 *
 * Returns a new `Map`; neither argument is mutated.
 */
export function mergeShip(child: ShipFields, parent: ShipFields): ShipFields {
  const result = new Map(parent);
  for (const [key, value] of child) result.set(key, value);
  result.delete("like_ship");

  for (const key of LIKE_SHIP_NON_INHERITABLE) {
    if (!declares(child, key)) result.delete(key);
  }

  for (const [snake, camel] of ALIAS_PAIRS) {
    const snakeDeclared = declares(child, snake);
    const camelDeclared = declares(child, camel);
    if (snakeDeclared && !camelDeclared) result.delete(camel);
    else if (camelDeclared && !snakeDeclared) result.delete(snake);
  }

  return result;
}

/**
 * Patch raw entries with `shipdata-overrides.plist`.
 *
 * An override entry whose key is absent from the base dictionary is ignored —
 * overrides cannot add an entry. An override may still add a *field* to an
 * existing entry, exactly like `addEntriesFromDictionary:`.
 */
export function applyOverrides(
  base: ReadonlyMap<string, ShipFields>,
  overrides: PlistDict,
): Map<string, ShipFields> {
  const patched = new Map<string, ShipFields>();
  for (const [key, fields] of base) patched.set(key, new Map(fields));

  for (const [key, value] of dictToMap(overrides)) {
    if (value.kind !== "dict") continue;
    const current = patched.get(key);
    if (current === undefined) continue;
    for (const [field, fieldValue] of dictToMap(value)) {
      current.set(field, fieldValue);
    }
  }

  return patched;
}

/** Oolite's `oo_boolForKey` predicate, used only for `is_external_dependency`. */
function isTruthy(value: PlistValue | undefined): boolean {
  if (value === undefined) return false;
  switch (value.kind) {
    case "bool":
      return value.value;
    case "integer":
    case "real":
      return value.value !== 0;
    case "string": {
      const text = value.value.trim().toLowerCase();
      if (text === "yes" || text === "true" || text === "on") return true;
      if (text === "no" || text === "false" || text === "off" || text === "") {
        return false;
      }
      return Number.parseFloat(text) !== 0;
    }
    default:
      return false;
  }
}

/**
 * Resolve every dictionary entry, memoising results.
 *
 * The visiting stack is passed explicitly so a cycle can be reported with its
 * whole closed chain instead of a bare "cannot be resolved" message. Traversal
 * order affects only the `order` report; because resolution is a join, the
 * resolved entries are independent of insertion order.
 */
export function resolveAll(
  root: PlistDict,
  options: ResolveOptions,
): ResolutionResult {
  const { file } = options;

  const base = new Map<string, ShipFields>();
  for (const item of root.entries) {
    // Stage 2 of Oolite's loader: a non-dictionary top-level entry is dropped.
    if (item.value.kind !== "dict") continue;
    base.set(item.key, fieldsFromDict(item.value));
  }

  const entries =
    options.overrides === undefined
      ? base
      : applyOverrides(base, options.overrides);

  const resolved = new Map<string, ShipFields>();
  const chains = new Map<string, readonly string[]>();
  const order: string[] = [];
  let maxChainDepth = 0;

  const visit = (key: string, stack: readonly string[]): ShipFields => {
    const memo = resolved.get(key);
    if (memo !== undefined) return memo;

    const cycleAt = stack.indexOf(key);
    if (cycleAt !== -1) {
      const chain = [...stack.slice(cycleAt), key];
      throw contentError("LIKE_SHIP_CYCLE", file, key, {
        chain,
        excerpt: `cycle ${chain.join(" -> ")}`,
      });
    }

    if (stack.length >= MAX_LIKE_SHIP_DEPTH) {
      const chain = [...stack, key];
      throw contentError("LIKE_SHIP_CYCLE", file, key, {
        chain,
        excerpt: `like_ship chain exceeds ${String(MAX_LIKE_SHIP_DEPTH)} entries`,
      });
    }

    const fields = entries.get(key);
    if (fields === undefined) {
      const chain = [...stack, key];
      throw contentError("LIKE_SHIP_DANGLING", file, key, {
        chain,
        excerpt: `like_ship target "${key}" is not defined`,
      });
    }

    const likeShip = fields.get("like_ship");
    let result: ShipFields;
    let parentChain: readonly string[] = [];

    if (likeShip === undefined || likeShip === null) {
      result = new Map(fields);
      result.delete("like_ship");
    } else if (likeShip.kind !== "string") {
      throw contentError("SCHEMA", file, key, {
        excerpt: "like_ship must be a string",
      });
    } else if (
      !entries.has(likeShip.value) &&
      isTruthy(fields.get("is_external_dependency"))
    ) {
      // Oolite treats a missing external dependency as intentional.
      result = new Map(fields);
      result.delete("like_ship");
    } else {
      const parent = visit(likeShip.value, [...stack, key]);
      parentChain = chains.get(likeShip.value) ?? [];
      result = mergeShip(fields, parent);
    }

    resolved.set(key, result);
    const chain = [key, ...parentChain];
    chains.set(key, chain);
    order.push(key);
    // Depth counts `like_ship` hops, so a chain of N entries has depth N - 1:
    // the pinned data's longest chain is four entries (three hops).
    const depth = chain.length - 1;
    if (depth > maxChainDepth) maxChainDepth = depth;
    return result;
  };

  for (const key of entries.keys()) visit(key, []);

  return { entries: resolved, maxChainDepth, order, chains };
}

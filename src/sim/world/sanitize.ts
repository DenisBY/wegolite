// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Per-entity repair (FOUND-11, FOUND-12, T-08-21, T-08-44).
 *
 * `stepWorld` calls `sanitizeEntity` on every live entity once per tick before
 * the commit. It is field-complete across every value that `serializeEntity`
 * (`canon`) and `snapshotWorld` / `parseWorldSnapshot` read, so `canon` never
 * throws inside the frame loop and every sanitized world snapshots to JSON the
 * parser accepts. Every bound is imported from `./limits.js`; this module
 * declares and exports no constant.
 *
 * The energy bank (CBT-07) is repaired in the same pass: a non-finite or
 * out-of-domain `maxEnergy` or `energyRechargeRate` becomes the Oolite default,
 * and `energy` is held inside `0..maxEnergy` (a non-finite energy becomes a full
 * bank).
 *
 * Counting. `repairs` grows by one per call that repaired anything, however
 * many fields it repaired, saturating at `MAX_UINT32`. Normalisations never
 * count: `-0` becomes `0`, and an orientation outside `QUAT_UNIT_TOLERANCE`
 * that renormalises back inside it is not a repair. The return value is true
 * exactly when `repairs` grew.
 *
 * Idempotent: a second call right after the first returns false and changes no
 * bit (per numeric leaf, compared with `Object.is`), and a clean entity is left
 * bit-identical. An unknown `kind` marks the entity dead once (`kind` is
 * readonly and identity-bearing, so it is never rewritten; the tick's commit
 * removes the entity); an already-dead entity with an unknown kind is left
 * alone, which keeps the second call a no-op.
 *
 * `ai.params` keys are enumerated with `Object.keys` (own enumerable keys
 * only, so an inherited name never appears; an own `__proto__` made by
 * `JSON.parse` is refused by name) in code-unit order.
 */

import type { AiComponent, ParamValue } from "../ai/types.js";
import { AI_KEYS } from "../ai/types.js";
import { identity, normalize, quat, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { Entity } from "./entity.js";
import { BEHAVIOUR_IDS, ENTITY_KINDS, SCAN_CLASSES } from "./ids.js";
import {
  MAX_AI_PARAMS_KEYS,
  MAX_ENERGY_RECHARGE_RATE,
  MAX_ENTITY_ENERGY,
  MAX_ENTITY_MAGNITUDE,
  MAX_SNAPSHOT_PARAM_LENGTH,
  MAX_SNAPSHOT_STRING_LENGTH,
  MAX_UINT32,
  MIN_QUAT_NORM_SQ,
  NPC_DEFAULT_ENERGY_RECHARGE_RATE,
  NPC_DEFAULT_MAX_ENERGY,
  QUAT_UNIT_TOLERANCE,
} from "./limits.js";

const FORBIDDEN_PARAM_KEYS: readonly string[] = [
  "__proto__",
  "constructor",
  "prototype",
];

const compareCodeUnits = (a: string, b: string): number =>
  a < b ? -1 : a > b ? 1 : 0;

/** `-0` as `0`; every other value unchanged. */
const noNegativeZero = (v: number): number => (v === 0 ? 0 : v);

const isUint32 = (v: number): boolean =>
  Number.isSafeInteger(v) && v >= 0 && v <= MAX_UINT32;

const isBounded = (v: number): boolean =>
  Number.isFinite(v) && Math.abs(v) <= MAX_ENTITY_MAGNITUDE;

/** The outcome of cleaning one value: the clean value and whether it was a repair. */
interface Cleaned<T> {
  value: T;
  repaired: boolean;
}

/** A bounded finite number, else 0 (a repair); `-0` becomes 0 (not a repair). */
function cleanBounded(v: number): Cleaned<number> {
  return isBounded(v)
    ? { value: noNegativeZero(v), repaired: false }
    : { value: 0, repaired: true };
}

/** A bounded non-negative number, else 0 (a repair). */
function cleanNonNegative(v: number): Cleaned<number> {
  return isBounded(v) && v >= 0
    ? { value: noNegativeZero(v), repaired: false }
    : { value: 0, repaired: true };
}

/**
 * A finite number in `0..limit`, else `fallback` (a repair); `-0` becomes 0
 * (not a repair).
 */
function cleanRange(
  v: number,
  limit: number,
  fallback: number,
): Cleaned<number> {
  return Number.isFinite(v) && v >= 0 && v <= limit
    ? { value: noNegativeZero(v), repaired: false }
    : { value: fallback, repaired: true };
}

/**
 * `energy` held inside `0..maxEnergy`: negative becomes 0, above the bank
 * becomes `maxEnergy`, non-finite becomes `maxEnergy` (each a repair); `-0`
 * becomes 0 (not a repair).
 */
function cleanEnergy(energy: number, maxEnergy: number): Cleaned<number> {
  if (!Number.isFinite(energy)) return { value: maxEnergy, repaired: true };
  if (energy < 0) return { value: 0, repaired: true };
  if (energy > maxEnergy) return { value: maxEnergy, repaired: true };
  return { value: noNegativeZero(energy), repaired: false };
}

/** A uint32 integer, else 0 (a repair). */
function cleanUint32(v: number): Cleaned<number> {
  return isUint32(v)
    ? { value: noNegativeZero(v), repaired: false }
    : { value: 0, repaired: true };
}

/** A string of at most `MAX_SNAPSHOT_STRING_LENGTH` units, truncated otherwise. */
function cleanString(s: string): Cleaned<string> {
  return s.length > MAX_SNAPSHOT_STRING_LENGTH
    ? { value: s.slice(0, MAX_SNAPSHOT_STRING_LENGTH), repaired: true }
    : { value: s, repaired: false };
}

/** Clean one array element; undefined drops it (a repair). */
function cleanElement(el: unknown): Cleaned<number | string> | undefined {
  if (typeof el === "number") return cleanBounded(el);
  if (typeof el === "string") return cleanString(el);
  return undefined;
}

/** The outcome for one param value: the clean value, or undefined to strip. */
interface CleanedParam {
  value: ParamValue | undefined;
  /** A repair that counts. */
  repaired: boolean;
  /** Whether the value differs from the original in any bit. */
  changed: boolean;
}

function cleanParam(value: unknown): CleanedParam {
  if (value === null || typeof value === "boolean") {
    return { value, repaired: false, changed: false };
  }
  if (typeof value === "number") {
    const cleaned = cleanBounded(value);
    return {
      value: cleaned.value,
      repaired: cleaned.repaired,
      changed: !Object.is(cleaned.value, value),
    };
  }
  if (typeof value === "string") {
    const cleaned = cleanString(value);
    return {
      value: cleaned.value,
      repaired: cleaned.repaired,
      changed: cleaned.repaired,
    };
  }
  if (!Array.isArray(value)) {
    return { value: undefined, repaired: true, changed: true };
  }
  const source = value as readonly unknown[];
  const kept: (number | string)[] = [];
  let repaired = source.length > MAX_SNAPSHOT_PARAM_LENGTH;
  let changed = repaired;
  for (const el of source.slice(0, MAX_SNAPSHOT_PARAM_LENGTH)) {
    const cleaned = cleanElement(el);
    if (cleaned === undefined) {
      repaired = true;
      changed = true;
      continue;
    }
    if (cleaned.repaired) repaired = true;
    if (!Object.is(cleaned.value, el)) changed = true;
    kept.push(cleaned.value);
  }
  return { value: changed ? kept : (value as ParamValue), repaired, changed };
}

/**
 * Clean `ai.params`. `value` is a fresh null-prototype dictionary only when
 * something changed (a repair or a `-0` normalisation); undefined means the
 * original is already clean. `repaired` is true for a counted change.
 */
function cleanParams(params: unknown): {
  value: Record<string, ParamValue> | undefined;
  repaired: boolean;
} {
  if (typeof params !== "object" || params === null) {
    return {
      value: Object.create(null) as Record<string, ParamValue>,
      repaired: true,
    };
  }
  const source = params as Record<string, unknown>;
  const keys = Object.keys(source).sort(compareCodeUnits);
  const kept: [string, ParamValue][] = [];
  let repaired = false;
  let changed = false;
  for (const key of keys) {
    if (
      key.length === 0 ||
      key.length > MAX_SNAPSHOT_STRING_LENGTH ||
      FORBIDDEN_PARAM_KEYS.includes(key)
    ) {
      repaired = true;
      changed = true;
      continue;
    }
    const cleaned = cleanParam(source[key]);
    if (cleaned.value === undefined) {
      repaired = true;
      changed = true;
      continue;
    }
    if (cleaned.repaired) repaired = true;
    if (cleaned.changed) changed = true;
    kept.push([key, cleaned.value]);
  }
  if (kept.length > MAX_AI_PARAMS_KEYS) {
    kept.length = MAX_AI_PARAMS_KEYS;
    repaired = true;
    changed = true;
  }
  if (!changed) return { value: undefined, repaired };
  const dictionary = Object.create(null) as Record<string, ParamValue>;
  for (const [key, value] of kept) dictionary[key] = value;
  return { value: dictionary, repaired };
}

/**
 * The cleaned vector: `value` is `v` itself when no component changed, else a
 * fresh vector (`Vec3` components are readonly). `repaired` is true for a
 * counted repair.
 */
function cleanVec(v: Vec3): Cleaned<Vec3> {
  const x = cleanBounded(v.x);
  const y = cleanBounded(v.y);
  const z = cleanBounded(v.z);
  const unchanged =
    Object.is(x.value, v.x) &&
    Object.is(y.value, v.y) &&
    Object.is(z.value, v.z);
  return {
    value: unchanged ? v : vec(x.value, y.value, z.value),
    repaired: x.repaired || y.repaired || z.repaired,
  };
}

const squaredNorm = (q: Quat): number =>
  q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;

/** `q` with `-0` components as `0`; `q` itself when it has none. */
function withoutNegativeZero(q: Quat): Quat {
  const w = noNegativeZero(q.w);
  const x = noNegativeZero(q.x);
  const y = noNegativeZero(q.y);
  const z = noNegativeZero(q.z);
  return Object.is(w, q.w) &&
    Object.is(x, q.x) &&
    Object.is(y, q.y) &&
    Object.is(z, q.z)
    ? q
    : quat(w, x, y, z);
}

/**
 * The cleaned orientation: `value` is `q` itself when nothing changed.
 * `repaired` is true for a degenerate orientation (identity) and false for a
 * normalisation (`-0`, or a renormalisation that lands inside the tolerance).
 */
function cleanOrientation(q: Quat): Cleaned<Quat> {
  const normSq = squaredNorm(q);
  const finite =
    Number.isFinite(q.w) &&
    Number.isFinite(q.x) &&
    Number.isFinite(q.y) &&
    Number.isFinite(q.z);
  if (!finite || !Number.isFinite(normSq) || normSq < MIN_QUAT_NORM_SQ) {
    return { value: identity(), repaired: true };
  }
  if (Math.abs(normSq - 1) > QUAT_UNIT_TOLERANCE) {
    const unit = normalize(q);
    // Renormalising a tiny norm can still land outside the tolerance.
    if (Math.abs(squaredNorm(unit) - 1) > QUAT_UNIT_TOLERANCE) {
      return { value: identity(), repaired: true };
    }
    return { value: withoutNegativeZero(unit), repaired: false };
  }
  return { value: withoutNegativeZero(q), repaired: false };
}

/**
 * Repair the AI component in place; an unknown `aiKey` drops the component
 * (`entity.ai = null`). True when a repair counted.
 */
function cleanAi(entity: Entity, ai: AiComponent): boolean {
  if (!(AI_KEYS as readonly string[]).includes(ai.aiKey)) {
    entity.ai = null;
    return true;
  }
  const wake = cleanUint32(ai.wakeTick);
  const next = cleanUint32(ai.nextThinkTick);
  ai.wakeTick = wake.value;
  ai.nextThinkTick = next.value;
  const params = cleanParams(ai.params);
  if (params.value !== undefined) ai.params = params.value;
  return wake.repaired || next.repaired || params.repaired;
}

/**
 * Repair `entity` in place. Returns true exactly when at least one field was
 * repaired, in which case `repairs` grew by one (saturating at `MAX_UINT32`).
 * Never throws for any field value.
 */
export function sanitizeEntity(entity: Entity): boolean {
  let repaired = false;
  const mark = (flag: boolean): void => {
    if (flag) repaired = true;
  };

  const position = cleanVec(entity.position);
  entity.position = position.value;
  mark(position.repaired);
  const orientation = cleanOrientation(entity.orientation);
  entity.orientation = orientation.value;
  mark(orientation.repaired);

  const speed = cleanNonNegative(entity.speed);
  entity.speed = speed.value;
  mark(speed.repaired);
  const desiredSpeed = cleanNonNegative(entity.nav.desiredSpeed);
  entity.nav.desiredSpeed = desiredSpeed.value;
  mark(desiredSpeed.repaired);
  const desiredRange = cleanNonNegative(entity.nav.desiredRange);
  entity.nav.desiredRange = desiredRange.value;
  mark(desiredRange.repaired);
  const destination = cleanVec(entity.nav.destination);
  entity.nav.destination = destination.value;
  mark(destination.repaired);

  if (
    !Number.isFinite(entity.radius) ||
    !(entity.radius > 0) ||
    entity.radius > MAX_ENTITY_MAGNITUDE
  ) {
    entity.radius = 1;
    repaired = true;
  }
  if (typeof entity.specKey !== "string" || entity.specKey.length === 0) {
    entity.specKey = "unknown";
    repaired = true;
  } else {
    const specKey = cleanString(entity.specKey);
    entity.specKey = specKey.value;
    mark(specKey.repaired);
  }

  const ownerId = cleanUint32(entity.ownerId);
  entity.ownerId = ownerId.value;
  mark(ownerId.repaired);
  const spawnTick = cleanUint32(entity.spawnTick);
  entity.spawnTick = spawnTick.value;
  mark(spawnTick.repaired);
  const targetId = cleanUint32(entity.nav.targetId);
  entity.nav.targetId = targetId.value;
  mark(targetId.repaired);
  const rngAi = cleanUint32(entity.rng.ai);
  entity.rng.ai = rngAi.value;
  mark(rngAi.repaired);
  const rngCombat = cleanUint32(entity.rng.combat);
  entity.rng.combat = rngCombat.value;
  mark(rngCombat.repaired);

  // Closed vocabularies: membership by `includes`, never `in` or indexing.
  if (
    !(ENTITY_KINDS as readonly string[]).includes(entity.kind) &&
    !entity.dead
  ) {
    entity.dead = true;
    repaired = true;
  }
  if (!(SCAN_CLASSES as readonly string[]).includes(entity.scanClass)) {
    entity.scanClass = "CLASS_NOT_SET";
    repaired = true;
  }
  if (!(BEHAVIOUR_IDS as readonly string[]).includes(entity.nav.behaviour)) {
    entity.nav.behaviour = "IDLE";
    repaired = true;
  }
  if (entity.ai !== null) mark(cleanAi(entity, entity.ai));

  // The energy bank: a bad bound falls back to Oolite's default, and energy is
  // clamped into 0..maxEnergy (a non-finite energy becomes a full bank).
  const maxEnergy = cleanRange(
    entity.maxEnergy,
    MAX_ENTITY_ENERGY,
    NPC_DEFAULT_MAX_ENERGY,
  );
  entity.maxEnergy = maxEnergy.value;
  mark(maxEnergy.repaired);
  const rate = cleanRange(
    entity.energyRechargeRate,
    MAX_ENERGY_RECHARGE_RATE,
    NPC_DEFAULT_ENERGY_RECHARGE_RATE,
  );
  entity.energyRechargeRate = rate.value;
  mark(rate.repaired);
  const energy = cleanEnergy(entity.energy, entity.maxEnergy);
  entity.energy = energy.value;
  mark(energy.repaired);

  let base = entity.repairs;
  if (!isUint32(base)) {
    base = 0;
    repaired = true;
  }
  entity.repairs = repaired
    ? Math.min(MAX_UINT32, base + 1)
    : noNegativeZero(base);
  return repaired;
}

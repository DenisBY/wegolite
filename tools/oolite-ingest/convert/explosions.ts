// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `explosions.plist` → the render's explosion settings (DATA-16, D16-08,
 * D16-22).
 *
 * Each compiled entry carries the keys `OOExplosionCloudEntity.m` reads
 * (lines 41-49), with its defaults for absent keys (lines 34-38, 70-88):
 * `alpha` 0.85, `brightness` 1.0 (and floored at 1.0), `color_order` "rgb",
 * `count` 25, `duration` 0.9, `growth_rate` 1.5, `size` 2.5, `spread` 1.0 and
 * `texture` "oolite-particle-cloud2.png". The values keep Oolite's types:
 * `alpha`, `brightness`, `growth_rate`, `size` and `spread` are read with
 * `oo_floatForKey` and are stored as float32; `duration` is read with
 * `oo_doubleForKey` and is stored as authored; `count` is an unsigned integer.
 * The render applies the detail-level cap on `count` (D16-08, plan 16-07); the
 * record keeps the authored value.
 */

import { canonicalJson } from "../canonical/json.js";
import { contentError } from "../content-error.js";
import { getEntry } from "../openstep/plist-value.js";
import type { PlistDict, PlistValue } from "../openstep/plist-value.js";
import {
  ExplosionRecordSchema,
  type ExplosionRecord,
} from "../../../src/content/schemas/explosion.js";
import { PARTICLE_TEXTURES } from "./textures.js";

/** Where the explosion settings are written, repository-relative. */
export const EXPLOSIONS_PATH = "src/content/generated/explosions.json";

/** The vendored source, repository-relative, named by every failure. */
export const EXPLOSIONS_SOURCE_FILE =
  "third_party/oolite/Config/explosions.plist";

/**
 * The compiled entries (D16-22). Only the default ship explosion: all nine
 * compiled hulls leave `explosion_type` unset, so `becomeExplosion` draws the
 * default cloud plus the flash (ShipEntity.m:7956-7963). The wreckage,
 * fragment and spark entries are not compiled because nothing draws them (no
 * burn-out cloud, no fragment sprites, D16-08), and their textures are not
 * vendored. The flash has no plist entry (`OOFlashEffectEntity.m`, plan 16-07).
 */
export const EXPLOSION_KEYS: readonly string[] = [
  "oolite-default-ship-explosion",
];

// OOExplosionCloudEntity.m:34-38, 70, 86, 88, 108.
const DEFAULT_ALPHA = 0.85;
const DEFAULT_BRIGHTNESS = 1.0;
const DEFAULT_COLOR_ORDER = "rgb";
const DEFAULT_COUNT = 25;
const DEFAULT_DURATION = 0.9;
const DEFAULT_GROWTH_RATE = 1.5;
const DEFAULT_SIZE = 2.5;
const DEFAULT_SPREAD = 1.0;
const DEFAULT_TEXTURE = "oolite-particle-cloud2.png";

/** Plist key → record field. */
const FIELD_OF: Readonly<Record<string, keyof ExplosionRecord>> = {
  alpha: "alpha",
  brightness: "brightness",
  color_order: "colorOrder",
  count: "count",
  duration: "duration",
  growth_rate: "growthRate",
  size: "size",
  spread: "spread",
  texture: "texture",
};

function fail(
  construct: string,
  detail: string,
  at?: { readonly line: number; readonly column: number },
): never {
  throw contentError("SCHEMA", EXPLOSIONS_SOURCE_FILE, construct, {
    excerpt: detail,
    ...(at === undefined ? {} : { line: at.line, column: at.column }),
  });
}

/** A number value, or the default when the key is absent. */
function numberField(
  key: string,
  entry: PlistDict,
  field: string,
  fallback: number,
): number {
  const found = getEntry(entry, field);
  if (found === undefined) return fallback;
  const value = found.value;
  if (
    (value.kind !== "integer" && value.kind !== "real") ||
    !Number.isFinite(value.value)
  ) {
    return fail(`${key}.${field}`, "is not a finite number", value);
  }
  return value.value;
}

/** A string value, or the default when the key is absent. */
function stringField(
  key: string,
  entry: PlistDict,
  field: string,
  fallback: string,
): string {
  const found = getEntry(entry, field);
  if (found === undefined) return fallback;
  if (found.value.kind !== "string") {
    return fail(`${key}.${field}`, "is not a string", found.value);
  }
  return found.value.value;
}

/** The plist key that produced a record field, for a schema failure. */
function plistKeyOf(field: string): string {
  for (const [plistKey, recordField] of Object.entries(FIELD_OF)) {
    if (recordField === field) return plistKey;
  }
  return field;
}

/**
 * Compile the explosion records, in `EXPLOSION_KEYS` order.
 *
 * @throws {ContentError} SCHEMA naming the key when the plist is not a
 * dictionary, an entry is missing or is not a dictionary, a value has the wrong
 * type, the record fails `ExplosionRecordSchema` (naming `<key>.<plist key>`),
 * or its texture is not in `PARTICLE_TEXTURES`.
 */
export function compileExplosions(plist: PlistValue): ExplosionRecord[] {
  if (plist.kind !== "dict") {
    return fail("explosions", "the top level is not a dictionary", plist);
  }

  return EXPLOSION_KEYS.map((key) => {
    const found = getEntry(plist, key);
    if (found === undefined) {
      return fail(key, `explosions.plist has no "${key}" entry`);
    }
    const entry = found.value;
    if (entry.kind !== "dict") {
      return fail(key, "the entry is not a dictionary", entry);
    }

    const brightness = Math.fround(
      numberField(key, entry, "brightness", DEFAULT_BRIGHTNESS),
    );
    const candidate = {
      key,
      alpha: Math.fround(numberField(key, entry, "alpha", DEFAULT_ALPHA)),
      colorOrder: stringField(key, entry, "color_order", DEFAULT_COLOR_ORDER),
      count: numberField(key, entry, "count", DEFAULT_COUNT),
      duration: numberField(key, entry, "duration", DEFAULT_DURATION),
      growthRate: Math.fround(
        numberField(key, entry, "growth_rate", DEFAULT_GROWTH_RATE),
      ),
      size: Math.fround(numberField(key, entry, "size", DEFAULT_SIZE)),
      spread: Math.fround(numberField(key, entry, "spread", DEFAULT_SPREAD)),
      // OOExplosionCloudEntity.m:82-83: a brightness below 1 becomes 1.
      brightness: brightness < 1 ? 1 : brightness,
      texture: stringField(key, entry, "texture", DEFAULT_TEXTURE),
    };

    const parsed = ExplosionRecordSchema.safeParse(candidate);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0];
      return fail(
        typeof field === "string" ? `${key}.${plistKeyOf(field)}` : key,
        issue === undefined ? "invalid explosion record" : issue.message,
        entry,
      );
    }
    if (!PARTICLE_TEXTURES.includes(parsed.data.texture)) {
      return fail(
        `${key}.texture`,
        `${parsed.data.texture} is not a shipped particle texture ` +
          `(${PARTICLE_TEXTURES.join(", ")})`,
        entry,
      );
    }
    return parsed.data;
  });
}

/** Serialise the explosion records as canonical JSON, in `EXPLOSION_KEYS` order. */
export function emitExplosions(plist: PlistValue): {
  readonly path: string;
  readonly bytes: Uint8Array;
} {
  return {
    path: EXPLOSIONS_PATH,
    bytes: Buffer.from(canonicalJson(compileExplosions(plist)), "utf8"),
  };
}

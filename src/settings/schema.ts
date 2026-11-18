// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The versioned settings schema (D-12, D-13, T-3-13, Pitfall 16).
 *
 * `localStorage` is attacker-controlled in a browser. This module is the one
 * validator: it accepts exactly seven top-level keys (`version`, `bindings`,
 * `hintsSeen`, `launchSeen` and the optional `pauseOnFocusLoss`, `quality` and
 * `showFps`), exactly the allowlisted action and hint IDs, capped arrays and non-empty strings, and it builds fresh
 * null-prototype maps rather than merging parsed JSON into an object.
 *
 * `HintId` is owned here — plan 07's hint controller and this schema must share
 * one list, so a hint added in the HUD cannot become an unvalidated settings
 * value.
 */

import { ACTION_IDS, isActionId } from "../input/actions.js";
import type { ActionId } from "../input/actions.js";
import {
  MAX_CODE_LENGTH,
  capCodes,
  contextsOverlap,
  createBindingMap,
} from "../input/bindings.js";

/** The one key a version-1 blob is stored under. */
export const SETTINGS_KEY = "wegolite.settings";

/** The schema version this build writes and accepts. */
export const SETTINGS_VERSION = 1;

/** The best-effort backup key for a blob that failed validation. */
export const SETTINGS_CORRUPT_KEY = `${SETTINGS_KEY}.corrupt`;

/** The most hint IDs a blob may carry. */
export const MAX_HINTS_SEEN = 16;

export type HintId =
  | "launch"
  | "torus"
  | "torusDisengage"
  | "speed"
  | "pitchRoll"
  | "aegis"
  | "laserTemp"
  | "shields"
  | "energy"
  | "cabinTemp"
  | "fuel";

/**
 * Every hint id, in the order the controller offers them. "aegis" is the
 * Wegolite-only safe-zone hint (quick task 261118-cyn, D-07). The gauge hints
 * that follow it (quick task 261118-ioj) are additive in the same way, so a
 * stored blob without them stays valid.
 */
export const HINT_IDS: readonly HintId[] = [
  "launch",
  "torus",
  "torusDisengage",
  "speed",
  "pitchRoll",
  "aegis",
  "laserTemp",
  "shields",
  "energy",
  "cabinTemp",
  "fuel",
];

const HINT_ID_SET: ReadonlySet<string> = new Set(HINT_IDS);

/**
 * The graphics quality levels.
 *
 * `standard` is the original render path and the default. `high` adds planet
 * detail and an atmosphere shell (PROJECT.md Key Decisions, revising Phase 3
 * D-02 for this level only).
 */
export type GraphicsQuality = "standard" | "high";

export const GRAPHICS_QUALITIES: readonly GraphicsQuality[] = [
  "standard",
  "high",
];

/** Narrow an untrusted value to the quality allowlist. */
export function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return (
    typeof value === "string" &&
    (GRAPHICS_QUALITIES as readonly string[]).includes(value)
  );
}

export interface SettingsV1 {
  version: typeof SETTINGS_VERSION;
  bindings: Partial<Record<ActionId, string[]>>;
  hintsSeen: HintId[];
  launchSeen: boolean;
  /**
   * D-15 focus-loss pause. Absent in blobs written before this field existed,
   * where it reads as `true`; a stored value must be a boolean.
   */
  pauseOnFocusLoss: boolean;
  /**
   * Graphics quality. Absent in blobs written before this field existed and in
   * every blob written at `standard`, where it reads as `standard`; a stored
   * value must be one of `GRAPHICS_QUALITIES`.
   */
  quality: GraphicsQuality;
  /**
   * Settings > Show FPS counter. Absent in blobs written before this field
   * existed and in every blob written with the counter off, where it reads as
   * `false`; a stored value must be a boolean.
   */
  showFps: boolean;
}

type ParseResult =
  { ok: true; settings: SettingsV1 } | { ok: false; error: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fail(error: string): ParseResult {
  return { ok: false, error };
}

/**
 * Parse and validate an untrusted value. The returned settings object is fresh:
 * its binding map has a null prototype and contains only allowlisted actions.
 */
function parseSettings(value: unknown): ParseResult {
  if (!isRecord(value)) return fail("settings: expected a JSON object");

  const allowedTopLevel = new Set([
    "version",
    "bindings",
    "hintsSeen",
    "launchSeen",
    "pauseOnFocusLoss",
    "quality",
    "showFps",
  ]);
  for (const key of Object.keys(value)) {
    if (!allowedTopLevel.has(key)) {
      return fail(`settings.${key}: unknown top-level key`);
    }
  }

  if (value.version !== SETTINGS_VERSION) {
    return fail(
      `settings.version: expected ${String(SETTINGS_VERSION)}, got ${String(value.version)}`,
    );
  }

  if (!isRecord(value.bindings)) {
    return fail("settings.bindings: expected an object");
  }

  const bindings = Object.create(null) as unknown as Partial<
    Record<ActionId, string[]>
  >;
  for (const [key, rawCodes] of Object.entries(value.bindings)) {
    // A tampered blob may carry an own `__proto__` property; JSON.parse does
    // not set the prototype, but copying it into a normal object could. Ignore
    // the key outright — it is never a valid action.
    if (key === "__proto__") continue;
    if (!isActionId(key)) {
      return fail(`settings.bindings.${key}: unknown action`);
    }
    if (!Array.isArray(rawCodes)) {
      return fail(
        `settings.bindings.${key}: expected an array of KeyboardEvent.code strings`,
      );
    }
    const codes: string[] = [];
    for (const [index, code] of rawCodes.entries()) {
      if (
        typeof code !== "string" ||
        code.length === 0 ||
        code.length > MAX_CODE_LENGTH
      ) {
        return fail(
          `settings.bindings.${key}[${String(index)}]: expected a non-empty string of at most ${String(MAX_CODE_LENGTH)} characters`,
        );
      }
      codes.push(code);
    }
    // The four-code cap is a resource bound: drop the excess rather than
    // rejecting every other binding in the blob.
    bindings[key] = capCodes(codes);
  }

  if (!Array.isArray(value.hintsSeen)) {
    return fail("settings.hintsSeen: expected an array");
  }
  if (value.hintsSeen.length > MAX_HINTS_SEEN) {
    return fail(
      `settings.hintsSeen: at most ${String(MAX_HINTS_SEEN)} entries are allowed`,
    );
  }
  const hintsSeen: HintId[] = [];
  for (const [index, hint] of value.hintsSeen.entries()) {
    if (typeof hint !== "string" || !HINT_ID_SET.has(hint)) {
      return fail(
        `settings.hintsSeen[${String(index)}]: unknown hint "${String(hint)}"`,
      );
    }
    const known = hint as HintId;
    if (!hintsSeen.includes(known)) hintsSeen.push(known);
  }

  if (typeof value.launchSeen !== "boolean") {
    return fail("settings.launchSeen: expected a boolean");
  }

  // A blob that predates the field has no key: the toggle defaults to on. The
  // strict `=== undefined` test rejects a stored null the same way launchSeen
  // rejects one.
  let pauseOnFocusLoss = true;
  if (value.pauseOnFocusLoss !== undefined) {
    if (typeof value.pauseOnFocusLoss !== "boolean") {
      return fail("settings.pauseOnFocusLoss: expected a boolean");
    }
    pauseOnFocusLoss = value.pauseOnFocusLoss;
  }

  // The same rule as pauseOnFocusLoss: an absent key is the default, and a
  // stored value outside the allowlist rejects the blob.
  let quality: GraphicsQuality = "standard";
  if (value.quality !== undefined) {
    if (!isGraphicsQuality(value.quality)) {
      return fail(
        `settings.quality: expected one of ${GRAPHICS_QUALITIES.join(", ")}`,
      );
    }
    quality = value.quality;
  }

  // The same strict-optional rule again: absent is off, and anything but a
  // boolean (a stored null included) rejects the blob.
  let showFps = false;
  if (value.showFps !== undefined) {
    if (typeof value.showFps !== "boolean") {
      return fail("settings.showFps: expected a boolean");
    }
    showFps = value.showFps;
  }

  return {
    ok: true,
    settings: {
      version: SETTINGS_VERSION,
      bindings,
      hintsSeen,
      launchSeen: value.launchSeen,
      pauseOnFocusLoss,
      quality,
      showFps,
    },
  };
}

/** Strictly validate an untrusted value; `null` means "use defaults". */
export function validateSettings(value: unknown): SettingsV1 | null {
  const result = parseSettings(value);
  return result.ok ? result.settings : null;
}

/**
 * The validation failure as a message naming the field or action. Exposed so a
 * test (and a future diagnostics screen) can assert the reason without parsing
 * a thrown error.
 */
export function settingsProblem(value: unknown): string | null {
  const result = parseSettings(value);
  return result.ok ? null : result.error;
}

/** A fresh default settings object. */
export function defaults(): SettingsV1 {
  return {
    version: SETTINGS_VERSION,
    bindings: createBindingMap(),
    hintsSeen: [],
    launchSeen: false,
    pauseOnFocusLoss: true,
    quality: "standard",
    showFps: false,
  };
}

function sameCodes(codes: readonly string[] | undefined, expected: string[]) {
  return (
    codes !== undefined &&
    codes.length === expected.length &&
    codes.every((code, index) => code === expected[index])
  );
}

/**
 * Move a stored binding table off the pre-INPUT-01 defaults (Phase 13).
 *
 * A stored map is authoritative (`store.ts` persists the whole table and
 * `createBindingMap` only fills missing actions), so an existing player's saved
 * defaults would otherwise keep Escape on pause and R on the station target
 * while the new ident and eject actions lost their keys. Only the exact legacy
 * values are rewritten, and only for a blob that predates the new actions (it
 * has no `eject` / `ident` entry; a blob this build wrote always does, so a key
 * the player chose later is never moved):
 *
 * - `pause` equal to `["KeyP", "Escape"]` becomes `["KeyP"]`;
 * - `targetStation` equal to `["KeyR"]` becomes `["KeyQ"]`, or `[]` (unbound,
 *   visible in the controls panel) when another stored action that can fire in
 *   the same mode already holds `KeyQ`.
 *
 * Every other entry is copied unchanged, so a customised binding survives and
 * the new action simply stays unbound where its default key is taken. The
 * result is a fresh null-prototype map; the input is never mutated. There is
 * deliberately no settings version bump: a bump would make older builds ignore
 * the blob.
 */
export function migrateLegacyBindings(
  bindings: Partial<Record<ActionId, readonly string[]>>,
): Partial<Record<ActionId, string[]>> {
  const migrated = Object.create(null) as unknown as Partial<
    Record<ActionId, string[]>
  >;
  for (const action of ACTION_IDS) {
    const codes = bindings[action];
    if (codes !== undefined) migrated[action] = [...codes];
  }

  if (
    bindings.eject === undefined &&
    sameCodes(bindings.pause, ["KeyP", "Escape"])
  ) {
    migrated.pause = ["KeyP"];
  }

  if (
    bindings.ident === undefined &&
    sameCodes(bindings.targetStation, ["KeyR"])
  ) {
    const keyQTaken = ACTION_IDS.some(
      (other) =>
        other !== "targetStation" &&
        (bindings[other] ?? []).includes("KeyQ") &&
        contextsOverlap(other, "targetStation"),
    );
    migrated.targetStation = keyQTaken ? [] : ["KeyQ"];
  }

  return migrated;
}

/**
 * Fill missing actions from the defaults and rebuild every array, so the result
 * never shares an array with the parsed blob. An explicit empty array survives.
 * A blob at the pre-INPUT-01 defaults is migrated first
 * (`migrateLegacyBindings`).
 */
export function mergeDefaults(settings: SettingsV1): SettingsV1 {
  return {
    version: SETTINGS_VERSION,
    bindings: createBindingMap(migrateLegacyBindings(settings.bindings)),
    hintsSeen: [...settings.hintsSeen],
    launchSeen: settings.launchSeen,
    pauseOnFocusLoss: settings.pauseOnFocusLoss,
    quality: settings.quality,
    showFps: settings.showFps,
  };
}

/** True when a parsed blob declares a version this build must not downgrade. */
export function isNewerSettingsVersion(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.version === "number" &&
    value.version > SETTINGS_VERSION
  );
}

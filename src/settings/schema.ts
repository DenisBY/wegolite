// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The versioned settings schema (D-12, D-13, T-3-13, Pitfall 16).
 *
 * `localStorage` is attacker-controlled in a browser. This module is the one
 * validator: it accepts exactly four top-level keys, exactly the allowlisted
 * action and hint IDs, capped arrays and non-empty strings, and it builds fresh
 * null-prototype maps rather than merging parsed JSON into an object.
 *
 * `HintId` is owned here — plan 07's hint controller and this schema must share
 * one list, so a hint added in the HUD cannot become an unvalidated settings
 * value.
 */

import { isActionId } from "../input/actions.js";
import type { ActionId } from "../input/actions.js";
import {
  MAX_CODE_LENGTH,
  capCodes,
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
  "launch" | "torus" | "torusDisengage" | "speed" | "pitchRoll";

export const HINT_IDS: readonly HintId[] = [
  "launch",
  "torus",
  "torusDisengage",
  "speed",
  "pitchRoll",
];

const HINT_ID_SET: ReadonlySet<string> = new Set(HINT_IDS);

export interface SettingsV1 {
  version: typeof SETTINGS_VERSION;
  bindings: Partial<Record<ActionId, string[]>>;
  hintsSeen: HintId[];
  launchSeen: boolean;
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

  return {
    ok: true,
    settings: {
      version: SETTINGS_VERSION,
      bindings,
      hintsSeen,
      launchSeen: value.launchSeen,
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
  };
}

/**
 * Fill missing actions from the defaults and rebuild every array, so the result
 * never shares an array with the parsed blob. An explicit empty array survives.
 */
export function mergeDefaults(settings: SettingsV1): SettingsV1 {
  return {
    version: SETTINGS_VERSION,
    bindings: createBindingMap(settings.bindings),
    hintsSeen: [...settings.hintsSeen],
    launchSeen: settings.launchSeen,
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

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `localStorage` settings store (D-13, T-3-13, Pitfall 16).
 *
 * One versioned JSON blob under exactly `wegolite.settings`. `localStorage` is
 * the only settings store; IndexedDB stays reserved for game saves. `Storage`
 * is injected so Node tests never need a browser, and every read/write failure
 * is caught: a quota or security exception must never prevent boot.
 *
 * A blob that is corrupt or has the wrong shape is copied to
 * `wegolite.settings.corrupt` (best-effort) and replaced in memory by defaults.
 * A newer version is left untouched and never silently downgraded.
 */

import {
  SETTINGS_CORRUPT_KEY,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  defaults,
  isNewerSettingsVersion,
  mergeDefaults,
  validateSettings,
} from "./schema.js";
import type { SettingsV1 } from "./schema.js";

function backupCorrupt(storage: Storage, raw: string): void {
  try {
    storage.setItem(SETTINGS_CORRUPT_KEY, raw);
  } catch {
    // Quota or security denial: the backup is best-effort, never fatal.
  }
}

/**
 * Load settings from `storage`. Never throws: absent, corrupt, wrong-shape,
 * newer-version and throwing-storage cases all resolve to a valid settings
 * object (defaults where the stored value cannot be trusted).
 */
export function loadSettings(storage: Storage = localStorage): SettingsV1 {
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_KEY);
  } catch {
    return defaults();
  }
  if (raw === null) return defaults();

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    backupCorrupt(storage, raw);
    return defaults();
  }

  if (isNewerSettingsVersion(parsed)) {
    // A newer build wrote this. Use defaults but leave the blob in place: a
    // downgrade would destroy settings this build does not understand.
    console.warn(
      `Wegolite: settings version is newer than ${String(SETTINGS_VERSION)}; using defaults without overwriting it.`,
    );
    return defaults();
  }

  const settings = validateSettings(parsed);
  if (settings === null) {
    backupCorrupt(storage, raw);
    return defaults();
  }
  return mergeDefaults(settings);
}

/**
 * Write exactly one JSON blob with `version: 1`, no timestamps and no host
 * data. This is the only writer of `wegolite.settings`. A storage exception is
 * swallowed: a full quota must not break the running game.
 */
export function saveSettings(
  settings: SettingsV1,
  storage: Storage = localStorage,
): void {
  const normalized = mergeDefaults(settings);
  const blob = {
    version: SETTINGS_VERSION,
    bindings: normalized.bindings,
    hintsSeen: normalized.hintsSeen,
    launchSeen: normalized.launchSeen,
    pauseOnFocusLoss: normalized.pauseOnFocusLoss,
  };
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(blob));
  } catch {
    // Quota or security denial: the in-memory settings still work.
  }
}

/** Remove the stored blob and return fresh defaults. */
export function resetSettings(storage: Storage = localStorage): SettingsV1 {
  try {
    storage.removeItem(SETTINGS_KEY);
  } catch {
    // Removing is best-effort; defaults are still returned.
  }
  return defaults();
}

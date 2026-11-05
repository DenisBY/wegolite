// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The versioned settings schema and store (D-12/D-13, T-3-13, Pitfall 16).
 *
 * `localStorage` is attacker-controlled, so every rejection here is a security
 * assertion, not a formatting preference: unknown keys, unknown actions, an
 * oversized hint list, a non-boolean flag and a newer version must never become
 * live settings, and a `__proto__` key must never reach a prototype.
 */

import { describe, expect, it, vi } from "vitest";

import { DEFAULT_BINDINGS } from "../../src/input/actions.js";
import { bindAction, createBindingMap } from "../../src/input/bindings.js";
import {
  HINT_IDS,
  SETTINGS_CORRUPT_KEY,
  SETTINGS_KEY,
  SETTINGS_VERSION,
  defaults,
  mergeDefaults,
  settingsProblem,
  validateSettings,
} from "../../src/settings/schema.js";
import {
  loadSettings,
  resetSettings,
  saveSettings,
} from "../../src/settings/store.js";

class FakeStorage implements Storage {
  private readonly data = new Map<string, string>();
  failGet = false;
  failSet = false;
  failRemove = false;

  get length(): number {
    return this.data.size;
  }

  clear(): void {
    this.data.clear();
  }

  getItem(key: string): string | null {
    if (this.failGet) throw new Error("SecurityError");
    return this.data.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.data.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    if (this.failRemove) throw new Error("SecurityError");
    this.data.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failSet) throw new Error("QuotaExceededError");
    this.data.set(key, value);
  }
}

function validBlob(): Record<string, unknown> {
  return {
    version: SETTINGS_VERSION,
    bindings: { rollRight: ["KeyL"] },
    hintsSeen: ["launch"],
    launchSeen: true,
  };
}

describe("defaults", () => {
  it("returns a fresh version-1 object with the researched default table", () => {
    const settings = defaults();

    expect(settings.version).toBe(1);
    expect(settings.hintsSeen).toEqual([]);
    expect(settings.launchSeen).toBe(false);
    expect(settings.bindings.rollRight).toEqual(["ArrowRight"]);
    expect(settings.bindings.pause).toEqual(["KeyP", "Escape"]);
    for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) {
      expect(
        settings.bindings[action as keyof typeof DEFAULT_BINDINGS],
      ).toEqual([...codes]);
    }
  });

  it("creates a null-prototype binding map", () => {
    expect(Object.getPrototypeOf(defaults().bindings)).toBeNull();
  });
});

describe("validateSettings", () => {
  it("accepts the allowlisted version-1 shape", () => {
    const settings = validateSettings(validBlob());

    expect(settings).not.toBeNull();
    if (settings === null) throw new Error("expected valid settings");
    expect(settings.version).toBe(1);
    expect(settings.bindings.rollRight).toEqual(["KeyL"]);
    expect(settings.hintsSeen).toEqual(["launch"]);
    expect(settings.launchSeen).toBe(true);
    expect(Object.getPrototypeOf(settings.bindings)).toBeNull();
  });

  it("rejects an unknown action and names the field", () => {
    const blob = validBlob();
    blob.bindings = { notAnAction: ["KeyA"] };

    expect(validateSettings(blob)).toBeNull();
    expect(settingsProblem(blob)).toContain("settings.bindings.notAnAction");
    expect(settingsProblem(blob)).toContain("unknown action");
  });

  it("rejects an unknown top-level key", () => {
    const blob = validBlob();
    blob.extra = true;

    expect(settingsProblem(blob)).toContain("settings.extra");
    expect(settingsProblem(blob)).toContain("unknown top-level key");
  });

  it("rejects a non-array binding value", () => {
    const blob = validBlob();
    blob.bindings = { rollRight: "KeyL" };

    expect(settingsProblem(blob)).toContain("settings.bindings.rollRight");
    expect(settingsProblem(blob)).toContain("expected an array");
  });

  it("rejects a non-string code", () => {
    const blob = validBlob();
    blob.bindings = { rollRight: ["KeyL", 42] };

    expect(settingsProblem(blob)).toContain("settings.bindings.rollRight[1]");
    expect(settingsProblem(blob)).toContain("non-empty string");
  });

  it("truncates a five-code array to the four-code cap", () => {
    const blob = validBlob();
    blob.bindings = {
      rollRight: ["KeyA", "KeyB", "KeyC", "KeyD", "KeyE"],
    };

    const settings = validateSettings(blob);
    expect(settings).not.toBeNull();
    expect(settings?.bindings.rollRight).toEqual([
      "KeyA",
      "KeyB",
      "KeyC",
      "KeyD",
    ]);
  });

  it("ignores a __proto__ binding key without touching a prototype", () => {
    const storage = new FakeStorage();
    storage.setItem(
      SETTINGS_KEY,
      '{"version":1,"bindings":{"__proto__":["KeyA"],"rollRight":["KeyL"]},"hintsSeen":[],"launchSeen":false}',
    );

    const settings = loadSettings(storage);

    expect(settings.bindings.rollRight).toEqual(["KeyL"]);
    expect(Object.getPrototypeOf(settings.bindings)).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects an unknown hint ID and names the index", () => {
    const blob = validBlob();
    blob.hintsSeen = ["notAHint"];

    expect(settingsProblem(blob)).toContain("settings.hintsSeen[0]");
    expect(settingsProblem(blob)).toContain("unknown hint");
  });

  it("accepts every allowlisted hint ID", () => {
    const blob = validBlob();
    blob.hintsSeen = [...HINT_IDS];

    expect(validateSettings(blob)?.hintsSeen).toEqual([...HINT_IDS]);
  });

  it("rejects more than sixteen hint IDs", () => {
    const blob = validBlob();
    blob.hintsSeen = Array.from({ length: 17 }, () => "launch");

    expect(settingsProblem(blob)).toContain("settings.hintsSeen");
    expect(settingsProblem(blob)).toContain("at most 16");
  });

  it("rejects a non-boolean launchSeen", () => {
    const blob = validBlob();
    blob.launchSeen = "yes";

    expect(settingsProblem(blob)).toContain("settings.launchSeen");
    expect(settingsProblem(blob)).toContain("boolean");
  });

  it("rejects a version other than 1 and names the expected value", () => {
    const blob = validBlob();
    blob.version = 2;

    expect(settingsProblem(blob)).toContain("settings.version");
    expect(settingsProblem(blob)).toContain("expected 1");
  });
});

describe("mergeDefaults", () => {
  it("fills missing actions and keeps an explicit empty array", () => {
    const merged = mergeDefaults({
      version: 1,
      bindings: { rollRight: [], speedUp: ["KeyI"] },
      hintsSeen: ["speed"],
      launchSeen: false,
    });

    expect(merged.bindings.rollRight).toEqual([]);
    expect(merged.bindings.speedUp).toEqual(["KeyI"]);
    expect(merged.bindings.rollLeft).toEqual(["ArrowLeft"]);
    // A blob written before plan 04-04 has no dockingComputer key; the merge
    // supplies the default so Shift+C works without a settings reset.
    expect(merged.bindings.dockingComputer).toEqual(["KeyC"]);
    expect(merged.hintsSeen).toEqual(["speed"]);
  });
});

describe("loadSettings", () => {
  it("returns defaults when the key is absent", () => {
    const settings = loadSettings(new FakeStorage());

    expect(settings.version).toBe(1);
    expect(settings.bindings.rollRight).toEqual(["ArrowRight"]);
  });

  it("returns defaults and backs up malformed JSON", () => {
    const storage = new FakeStorage();
    storage.setItem(SETTINGS_KEY, "not json");

    const settings = loadSettings(storage);

    expect(settings.bindings.rollRight).toEqual(["ArrowRight"]);
    expect(storage.getItem(SETTINGS_CORRUPT_KEY)).toBe("not json");
  });

  it("returns defaults and backs up a shape-invalid blob", () => {
    const storage = new FakeStorage();
    const raw =
      '{"version":1,"bindings":{"notAnAction":["KeyA"]},"hintsSeen":[],"launchSeen":false}';
    storage.setItem(SETTINGS_KEY, raw);

    const settings = loadSettings(storage);

    expect(settings.bindings.rollRight).toEqual(["ArrowRight"]);
    expect(storage.getItem(SETTINGS_CORRUPT_KEY)).toBe(raw);
  });

  it("uses defaults for a newer version without downgrading the blob", () => {
    const storage = new FakeStorage();
    const raw =
      '{"version":2,"bindings":{"rollRight":["KeyL"]},"hintsSeen":[],"launchSeen":false}';
    storage.setItem(SETTINGS_KEY, raw);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const settings = loadSettings(storage);

    expect(settings.bindings.rollRight).toEqual(["ArrowRight"]);
    expect(storage.getItem(SETTINGS_KEY)).toBe(raw);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("returns defaults when getItem throws", () => {
    const storage = new FakeStorage();
    storage.failGet = true;

    expect(() => loadSettings(storage)).not.toThrow();
    expect(loadSettings(storage).version).toBe(1);
  });

  it("returns defaults when the corrupt backup also throws", () => {
    const storage = new FakeStorage();
    storage.setItem(SETTINGS_KEY, "not json");
    storage.failSet = true;

    expect(() => loadSettings(storage)).not.toThrow();
    expect(loadSettings(storage).bindings.rollRight).toEqual(["ArrowRight"]);
  });
});

describe("saveSettings and resetSettings", () => {
  it("writes exactly one version-1 blob with no extra keys", () => {
    const storage = new FakeStorage();
    saveSettings(defaults(), storage);

    const raw = storage.getItem(SETTINGS_KEY);
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "bindings",
      "hintsSeen",
      "launchSeen",
      "version",
    ]);
    expect(parsed.version).toBe(1);
  });

  it("does not throw when setItem is denied", () => {
    const storage = new FakeStorage();
    storage.failSet = true;

    expect(() => saveSettings(defaults(), storage)).not.toThrow();
  });

  it("resetSettings removes the blob and returns defaults", () => {
    const storage = new FakeStorage();
    saveSettings(defaults(), storage);

    const settings = resetSettings(storage);

    expect(storage.getItem(SETTINGS_KEY)).toBeNull();
    expect(settings.bindings.rollRight).toEqual(["ArrowRight"]);
  });

  it("resetSettings does not throw when removeItem is denied", () => {
    const storage = new FakeStorage();
    storage.failRemove = true;

    expect(() => resetSettings(storage)).not.toThrow();
  });
});

describe("binding conflict and reset", () => {
  it("rejects a code already bound to another action and names it", () => {
    const map = createBindingMap();

    const result = bindAction(map, "rollLeft", "ArrowRight");

    expect(result).toEqual({ ok: false, conflict: "rollRight" });
    expect(map.rollRight).toEqual(["ArrowRight"]);
    expect(map.rollLeft).toEqual(["ArrowLeft"]);
  });

  it("rebinding replaces the action's old code", () => {
    const map = createBindingMap();

    expect(bindAction(map, "rollRight", "KeyL")).toEqual({ ok: true });
    expect(map.rollRight).toEqual(["KeyL"]);
  });
});

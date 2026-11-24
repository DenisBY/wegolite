// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Live station-footer hint strings (quick task 261110-fnh).
 *
 * These are the pinned default strings for all seven surfaces plus the rebind
 * paths the browser also drives. Every label comes from the live binding map,
 * so `ArrowUp` renders as `Up` and a rebound action immediately follows.
 */

import { describe, expect, it } from "vitest";

import {
  bindAction,
  createBindingMap,
  unbindAction,
} from "../../src/input/bindings.js";
import {
  chartHints,
  dockedHints,
  saveLoadHints,
} from "../../src/ui/station-hints.js";
import type { StationScreen } from "../../src/ui/station.js";

const DOCKED_SCREENS: readonly StationScreen[] = [
  "home",
  "market",
  "outfitting",
  "status",
  "interfaces",
];

function defaults() {
  return createBindingMap();
}

describe("default hint strings", () => {
  it("pins all five docked screens", () => {
    const bindings = defaults();
    expect(dockedHints(bindings, "home")).toBe("1 launch · P pause");
    expect(dockedHints(bindings, "market")).toBe(
      "Up/Down select · Right buys +1 · Left sells +1 · Shift max · Enter/Y confirm · N cancel · Esc back · P pause",
    );
    expect(dockedHints(bindings, "outfitting")).toBe(
      "Up/Down select · Enter/Y confirm · N cancel · Esc back · P pause",
    );
    expect(dockedHints(bindings, "status")).toBe(
      "Tab/PageDown next page · PageUp previous · F5 manifest · Esc back · P pause",
    );
    expect(dockedHints(bindings, "interfaces")).toBe("Esc back · P pause");
  });

  it("names the next F5 press on each Status page (owner decision 2026-11-24)", () => {
    const bindings = defaults();
    expect(dockedHints(bindings, "status", 1)).toBe(
      "Tab/PageDown next page · PageUp previous · F5 manifest · Esc back · P pause",
    );
    expect(dockedHints(bindings, "status", 2)).toBe(
      "Tab/PageDown next page · PageUp previous · F5 status · Esc back · P pause",
    );
    // The market line is the 0.8.0 string on every page: it has no F8 part.
    const market =
      "Up/Down select · Right buys +1 · Left sells +1 · Shift max · Enter/Y confirm · N cancel · Esc back · P pause";
    expect(dockedHints(bindings, "market")).toBe(market);
    expect(dockedHints(bindings, "market", 1)).toBe(market);
    expect(dockedHints(bindings, "market", 2)).toBe(market);
  });

  it("leaves home, outfitting and interfaces unchanged for any page", () => {
    const bindings = defaults();
    for (const screen of [
      "home",
      "market",
      "outfitting",
      "interfaces",
    ] as const) {
      expect(dockedHints(bindings, screen, 2)).toBe(
        dockedHints(bindings, screen, 1),
      );
      expect(dockedHints(bindings, screen, 1)).toBe(
        dockedHints(bindings, screen),
      );
    }
  });

  it("pins the chart and Save/Load screens", () => {
    const bindings = defaults();
    expect(chartHints(bindings)).toBe(
      "Click: select · Up/Down/Left/Right: next · Tab: preset · /: find · Enter: commit · Esc: close",
    );
    expect(saveLoadHints(bindings)).toBe(
      "Up/Down select · Enter activate · Y confirm · N cancel · S save · L load · Esc return",
    );
  });

  it("renders display labels, never raw code names", () => {
    const bindings = defaults();
    const all = [
      ...DOCKED_SCREENS.map((screen) => dockedHints(bindings, screen)),
      chartHints(bindings),
      saveLoadHints(bindings),
    ].join(" | ");
    expect(all).not.toContain("ArrowUp");
    expect(all).not.toContain("ArrowDown");
    expect(all).not.toContain("Escape");
    expect(all).not.toContain("Key");
    expect(all).toContain("Up/Down");
    expect(all).toContain("Esc back");
    // PageDown's display label is its code name, so it is asserted positively.
    expect(all).toContain("Tab/PageDown next page");
  });
});

describe("rebound hint strings", () => {
  it("follows every rebound action the browser drives", () => {
    const map = defaults();
    expect(bindAction(map, "stationUp", "KeyW")).toEqual({ ok: true });
    expect(dockedHints(map, "market")).toContain("W/Down select");

    expect(bindAction(map, "stationConfirm", "KeyK")).toEqual({ ok: true });
    expect(dockedHints(map, "market")).toContain("K confirm");
    expect(dockedHints(map, "market")).not.toContain("Enter/Y confirm");

    expect(bindAction(map, "pause", "KeyO")).toEqual({ ok: true });
    expect(dockedHints(map, "market")).toContain("O pause");

    expect(bindAction(map, "chartRange", "KeyG")).toEqual({ ok: true });
    expect(chartHints(map)).toContain("G: preset");
    expect(chartHints(map)).not.toContain("Tab: preset");

    expect(bindAction(map, "saveScreenSave", "KeyK")).toEqual({ ok: true });
    expect(saveLoadHints(map)).toContain("K save");
  });

  it("follows a rebind of the F5 key in the second-press hint", () => {
    const map = defaults();
    expect(bindAction(map, "stationStatus", "KeyV")).toEqual({ ok: true });
    expect(dockedHints(map, "status", 1)).toContain("V manifest");
    expect(dockedHints(map, "status", 2)).toContain("V status");
    expect(dockedHints(map, "status", 1)).not.toContain("F5");

    expect(bindAction(map, "stationMarket", "KeyM")).toEqual({ ok: true });
    expect(dockedHints(map, "market", 1)).toBe(
      dockedHints(defaults(), "market", 1),
    );

    expect(unbindAction(map, "stationStatus")).toBe(true);
    expect(dockedHints(map, "status", 1)).toContain("(unbound) manifest");
  });

  it("renders (unbound) when an action has no code", () => {
    const map = defaults();
    expect(unbindAction(map, "pause")).toBe(true);
    expect(dockedHints(map, "home")).toBe("1 launch · (unbound) pause");

    expect(unbindAction(map, "stationConfirm")).toBe(true);
    expect(dockedHints(map, "market")).toContain("(unbound) confirm");
  });
});

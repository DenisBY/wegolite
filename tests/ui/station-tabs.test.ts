// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station tab registry: order, drift against the input layer, availability,
 * active-tab precedence and the key text derived from the live bindings.
 */

import { describe, expect, it } from "vitest";

import {
  ACTION_CONTEXTS,
  DEFAULT_BINDINGS,
  STATION_SCREEN_ACTIONS,
} from "../../src/input/actions.js";
import type { ActionId } from "../../src/input/actions.js";
import {
  STATION_TAB_REGISTRY,
  STATUS_SUBTABS,
  activeTabId,
  isTabEnabled,
  liveStationTabs,
  screenSwitchHints,
  tabById,
  tabKeyLabel,
  tabText,
} from "../../src/ui/station-tabs.js";
import type {
  StationNavState,
  StationTabId,
} from "../../src/ui/station-tabs.js";
import type { StationScreen } from "../../src/ui/station.js";

const LIVE_ORDER: readonly StationTabId[] = [
  "home",
  "launch",
  "saveLoad",
  "outfitting",
  "interfaces",
  "status",
  "chart",
  "market",
];

const SECTIONS: readonly StationScreen[] = [
  "market",
  "outfitting",
  "status",
  "interfaces",
];

function nav(overrides: Partial<StationNavState> = {}): StationNavState {
  return {
    mode: "docked",
    paused: false,
    overlay: "none",
    screen: "home",
    page: 1,
    ...overrides,
  };
}

function enabledSet(state: StationNavState): StationTabId[] {
  return LIVE_ORDER.filter((id) => isTabEnabled(id, state));
}

function tab(id: StationTabId) {
  const found = tabById(id);
  if (found === undefined) throw new Error(`no tab ${id}`);
  return found;
}

describe("registry order", () => {
  it("lists eight live tabs in F-key order", () => {
    expect(liveStationTabs().map((entry) => entry.id)).toEqual(LIVE_ORDER);
  });

  it("holds two hidden slots that are never live or enabled", () => {
    const hidden = STATION_TAB_REGISTRY.filter(
      (entry) => entry.status === "hidden",
    );
    expect(hidden.map((entry) => entry.id)).toEqual(["shipyard", "marketInfo"]);
    expect(hidden.map((entry) => entry.parent)).toEqual([
      "outfitting",
      "market",
    ]);
    const live = liveStationTabs().map((entry) => entry.id as string);
    expect(live).not.toContain("shipyard");
    expect(live).not.toContain("marketInfo");
    expect(isTabEnabled("shipyard", nav())).toBe(false);
    expect(isTabEnabled("marketInfo", nav())).toBe(false);
    expect(isTabEnabled("nonsense", nav())).toBe(false);
  });
});

describe("drift against the input layer", () => {
  it("binds an F-key to every live tab but Home, rising strictly in order", () => {
    const numbers: number[] = [];
    for (const entry of liveStationTabs()) {
      if (entry.id === "home") continue;
      if (entry.action === null) throw new Error(`${entry.id} has no action`);
      const codes = DEFAULT_BINDINGS[entry.action];
      const fKey = codes.find((code) => /^F\d{1,2}$/.test(code));
      expect(fKey, entry.id).toBeDefined();
      numbers.push(Number((fKey ?? "").slice(1)));
    }
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 8]);
  });

  it("gives every screen, chart, save and launch action exactly one tab", () => {
    const expected: ActionId[] = [
      ...STATION_SCREEN_ACTIONS,
      "chart",
      "saveLoad",
      "launch",
    ];
    const actions = liveStationTabs()
      .map((entry) => entry.action)
      .filter((action): action is ActionId => action !== null);
    for (const action of expected) {
      expect(actions.filter((candidate) => candidate === action)).toHaveLength(
        1,
      );
    }
    expect(actions).toHaveLength(expected.length);
  });

  it("keeps labels unique and every action known to ACTION_CONTEXTS", () => {
    const labels = liveStationTabs().map((entry) => entry.label);
    expect(new Set(labels).size).toBe(labels.length);
    for (const entry of liveStationTabs()) {
      if (entry.action !== null) {
        expect(ACTION_CONTEXTS[entry.action]).toBeDefined();
      }
    }
  });
});

describe("availability", () => {
  it("enables all eight tabs on Home with no overlay", () => {
    expect(enabledSet(nav())).toEqual(LIVE_ORDER);
  });

  it("disables only Launch on every section", () => {
    for (const screen of SECTIONS) {
      expect(enabledSet(nav({ screen }))).toEqual(
        LIVE_ORDER.filter((id) => id !== "launch"),
      );
    }
  });

  it("disables Launch and enables the rest with the chart open", () => {
    for (const screen of ["home", "market"] as const) {
      expect(enabledSet(nav({ overlay: "chart", screen }))).toEqual(
        LIVE_ORDER.filter((id) => id !== "launch"),
      );
    }
  });

  it("disables Launch and enables the rest with the save screen open", () => {
    for (const screen of ["home", "status"] as const) {
      expect(enabledSet(nav({ overlay: "saveScreen", screen }))).toEqual(
        LIVE_ORDER.filter((id) => id !== "launch"),
      );
    }
  });

  it("disables everything when not docked or paused", () => {
    expect(enabledSet(nav({ mode: "inFlight" }))).toEqual([]);
    expect(enabledSet(nav({ mode: "launching" }))).toEqual([]);
    expect(enabledSet(nav({ paused: true }))).toEqual([]);
  });
});

describe("activeTabId", () => {
  it("prefers the save screen over the chart flag", () => {
    expect(activeTabId(nav({ overlay: "saveScreen" }))).toBe("saveLoad");
  });

  it("reports the chart for the chart overlay", () => {
    expect(activeTabId(nav({ overlay: "chart", screen: "market" }))).toBe(
      "chart",
    );
  });

  it("reports the station screen with no overlay", () => {
    expect(activeTabId(nav())).toBe("home");
    expect(activeTabId(nav({ screen: "market" }))).toBe("market");
    expect(activeTabId(nav({ screen: "interfaces" }))).toBe("interfaces");
    expect(activeTabId(nav({ screen: "outfitting" }))).toBe("outfitting");
    expect(activeTabId(nav({ screen: "status" }))).toBe("status");
  });
});

describe("tabText", () => {
  it("renders the default strip texts", () => {
    expect(
      liveStationTabs().map((entry) => tabText(entry, DEFAULT_BINDINGS)),
    ).toEqual([
      "Home",
      "F1 Launch",
      "F2 Save/Load",
      "F3 Outfitting",
      "F4 Interfaces",
      "F5 Status",
      "F6 Chart",
      "F8 Market",
    ]);
  });

  it("follows a rebind and prefers an F-key over an earlier Digit", () => {
    expect(
      tabText(tab("launch"), { ...DEFAULT_BINDINGS, launch: ["Digit1"] }),
    ).toBe("1 Launch");
    expect(
      tabText(tab("market"), { ...DEFAULT_BINDINGS, stationMarket: ["KeyM"] }),
    ).toBe("M Market");
    expect(
      tabKeyLabel({ ...DEFAULT_BINDINGS, launch: ["Digit1", "F1"] }, "launch"),
    ).toBe("F1");
  });

  it("falls back to the bare label for an unbound action", () => {
    expect(
      tabText(tab("market"), { ...DEFAULT_BINDINGS, stationMarket: [] }),
    ).toBe("Market");
  });
});

describe("screenSwitchHints", () => {
  it("lists the other screens for market", () => {
    expect(screenSwitchHints("market", DEFAULT_BINDINGS)).toBe(
      "F3 outfitting · F4 interfaces · F5 status",
    );
  });

  it("lists all four sections for home", () => {
    const hints = screenSwitchHints("home", DEFAULT_BINDINGS);
    expect(hints.split(" · ")).toHaveLength(4);
    expect(hints.endsWith("F8 market")).toBe(true);
  });

  it("shows a rebound key", () => {
    expect(
      screenSwitchHints("home", {
        ...DEFAULT_BINDINGS,
        stationMarket: ["KeyM"],
      }),
    ).toContain("M market");
  });
});

describe("sub-tab data", () => {
  it("names the real Oolite sub-pages", () => {
    expect(STATUS_SUBTABS).toEqual([
      { page: 1, label: "Status" },
      { page: 2, label: "Manifest" },
    ]);
  });
});

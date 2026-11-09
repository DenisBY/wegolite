// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station computer tab registry (pure data and helpers).
 *
 * One tab per Oolite F-key, in key order, plus Wegolite's own Home screen. A
 * tab stores the `ActionId` it stands for; the key shown on the tab is read from
 * the live bindings, so there is no second F-key list. Availability derives from
 * `ACTION_CONTEXTS` evaluated against a *base* context (never the live input
 * context, which is `chart` or `saveScreen` while an overlay is open and then
 * excludes every station action).
 *
 * The tab strip and the Home screen are deliberate Wegolite additions: Oolite
 * has neither. Launch is enabled only on Home (Phase 5 D-03).
 *
 * No DOM and no Three.js: Vitest drives this module directly.
 */

import { ACTION_CONTEXTS } from "../input/actions.js";
import type { ActionId, InputContext } from "../input/actions.js";
import { codeLabel } from "../input/bindings.js";
import type { FlightMode } from "../sim/flight/state.js";
import type { StationScreen } from "./station.js";

export type StationTabId =
  | "home"
  | "launch"
  | "saveLoad"
  | "outfitting"
  | "interfaces"
  | "status"
  | "chart"
  | "systemData"
  | "market";

/** Reserved registry slots that are never rendered (sub-pages of a live tab). */
export type HiddenSlotId = "shipyard" | "marketInfo";

export type StationTabKind =
  "home" | "launch" | "saveLoad" | "chart" | "screen";

export interface StationTab {
  readonly id: StationTabId | HiddenSlotId;
  readonly kind: StationTabKind;
  /** The registry's short display text. */
  readonly label: string;
  /** The action the tab stands for; null for Home, which has no key. */
  readonly action: ActionId | null;
  /** The station screen the tab opens; null for non-screen tabs. */
  readonly screen: StationScreen | null;
  readonly status: "live" | "hidden";
  /** The live tab a hidden slot is a sub-page of. */
  readonly parent?: StationTabId | undefined;
}

function liveTab(
  id: StationTabId,
  kind: StationTabKind,
  label: string,
  action: ActionId | null,
  screen: StationScreen | null,
): StationTab {
  return { id, kind, label, action, screen, status: "live" };
}

/** Every entry in F-key order; hidden slots sit beside their parent. */
export const STATION_TAB_REGISTRY: readonly StationTab[] = Object.freeze([
  liveTab("home", "home", "Home", null, "home"),
  liveTab("launch", "launch", "Launch", "launch", null),
  liveTab("saveLoad", "saveLoad", "Save/Load", "saveLoad", null),
  liveTab(
    "outfitting",
    "screen",
    "Outfitting",
    "stationOutfitting",
    "outfitting",
  ),
  {
    id: "shipyard",
    kind: "screen",
    label: "Shipyard",
    action: null,
    screen: null,
    status: "hidden",
    parent: "outfitting",
  },
  liveTab(
    "interfaces",
    "screen",
    "Interfaces",
    "stationInterfaces",
    "interfaces",
  ),
  liveTab("status", "screen", "Status", "stationStatus", "status"),
  liveTab("chart", "chart", "Chart", "chart", null),
  liveTab(
    "systemData",
    "screen",
    "System data",
    "stationSystemData",
    "systemData",
  ),
  liveTab("market", "screen", "Market", "stationMarket", "market"),
  {
    id: "marketInfo",
    kind: "screen",
    label: "Market info",
    action: null,
    screen: null,
    status: "hidden",
    parent: "market",
  },
]);

/** A registry entry the strip renders. */
export type LiveStationTab = StationTab & { readonly id: StationTabId };

function isLive(tab: StationTab): tab is LiveStationTab {
  return tab.status === "live";
}

const LIVE_TABS: readonly LiveStationTab[] = Object.freeze(
  STATION_TAB_REGISTRY.filter(isLive),
);

/** The tabs the strip renders, in order. */
export function liveStationTabs(): readonly LiveStationTab[] {
  return LIVE_TABS;
}

/** Look a registry entry up by id (live or hidden). */
export function tabById(id: string): StationTab | undefined {
  return STATION_TAB_REGISTRY.find((tab) => tab.id === id);
}

/** The overlay that currently covers the station screen. */
export type StationOverlay = "none" | "chart" | "saveScreen";

/** Everything availability and the active tab are derived from. */
export interface StationNavState {
  readonly mode: FlightMode;
  readonly paused: boolean;
  readonly overlay: StationOverlay;
  readonly screen: StationScreen;
  readonly page: 1 | 2;
}

/** The input context the station would have with no overlay open. */
function baseContext(nav: StationNavState): InputContext {
  return nav.screen === "home" ? "dockHome" : "dockScreen";
}

/**
 * Whether a tab can be activated. Evaluated against the base context, never the
 * live one. Launch additionally needs the Home screen with no overlay (D-03).
 */
export function isTabEnabled(id: string, nav: StationNavState): boolean {
  if (nav.mode !== "docked" || nav.paused) return false;
  const tab = tabById(id);
  if (tab === undefined || tab.status !== "live") return false;
  if (tab.id === "home") return true;
  if (tab.action === null) return false;
  const base = baseContext(nav);
  if (tab.id === "launch") {
    return (
      nav.overlay === "none" &&
      base === "dockHome" &&
      ACTION_CONTEXTS.launch.includes(base)
    );
  }
  return ACTION_CONTEXTS[tab.action].includes(base);
}

/** The tab to mark current: save screen, then chart, then the station screen. */
export function activeTabId(nav: StationNavState): StationTabId {
  if (nav.overlay === "saveScreen") return "saveLoad";
  if (nav.overlay === "chart") return "chart";
  for (const tab of LIVE_TABS) {
    if (tab.screen === nav.screen) return tab.id;
  }
  return "home";
}

export type BindingLookup = Readonly<Record<ActionId, readonly string[]>>;

const F_KEY_PATTERN = /^F\d{1,2}$/;

/**
 * The key to advertise for an action: the first bound F-key code, otherwise the
 * first bound code. Undefined when the action is unbound.
 */
export function tabKeyLabel(
  bindings: BindingLookup,
  action: ActionId,
): string | undefined {
  const codes = bindings[action];
  const code =
    codes.find((candidate) => F_KEY_PATTERN.test(candidate)) ?? codes[0];
  return code === undefined ? undefined : codeLabel(code);
}

/** The first bound code of an action, rendered; undefined when unbound. */
export function primaryKeyLabel(
  bindings: BindingLookup,
  action: ActionId,
): string | undefined {
  const code = bindings[action][0];
  return code === undefined ? undefined : codeLabel(code);
}

/** The strip text of a tab: key label, a space and the label (Home has no key). */
export function tabText(tab: StationTab, bindings: BindingLookup): string {
  if (tab.action === null) return tab.label;
  const key = tabKeyLabel(bindings, tab.action);
  return key === undefined ? tab.label : `${key} ${tab.label}`;
}

/**
 * The footer list of the other station screens and the keys that reach them,
 * for example `F3 outfitting · F4 interfaces`. The current screen is excluded.
 */
export function screenSwitchHints(
  current: StationScreen,
  bindings: BindingLookup,
): string {
  const parts: string[] = [];
  for (const tab of LIVE_TABS) {
    if (tab.kind !== "screen" || tab.screen === current) continue;
    if (tab.action === null) continue;
    const key = tabKeyLabel(bindings, tab.action);
    const label = tab.label.toLowerCase();
    parts.push(key === undefined ? label : `${key} ${label}`);
  }
  return parts.join(" · ");
}

/** The two real Oolite sub-pages of F5 (stationPage 1 and 2). */
export const STATUS_SUBTABS: readonly {
  readonly page: 1 | 2;
  readonly label: string;
}[] = Object.freeze([
  { page: 1, label: "Status" },
  { page: 2, label: "Manifest" },
]);

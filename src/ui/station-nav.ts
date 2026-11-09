// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station tab strip hydrator.
 *
 * The same registry-driven strip is filled into the station shell, the chart
 * and the Save/Load screen. The buttons are created once; `sync` then mutates
 * attributes in place, so the delegated listeners never need re-attaching.
 *
 * Tab buttons carry `tabindex="-1"` and their host swallows `mousedown`, so a
 * click never moves keyboard focus and native Enter/Space can never activate a
 * strip button behind the semantic action layer (T-05-25). The strip does not
 * use `role="tablist"`: arrow keys must never switch tabs. Every string is
 * written with `textContent`.
 */

import type { ChartRange } from "./chart-model.js";
import {
  CHART_SUBTABS,
  STATUS_SUBTABS,
  activeTabId,
  isTabEnabled,
  liveStationTabs,
  tabText,
} from "./station-tabs.js";
import type {
  BindingLookup,
  StationNavState,
  StationTabId,
} from "./station-tabs.js";

export interface StationNavHandlers {
  onNavigate(id: StationTabId): void;
  onStatusPage(page: 1 | 2): void;
  onChartRange(range: ChartRange): void;
}

export interface StationNav {
  sync(state: StationNavState, bindings: BindingLookup): void;
  dispose(): void;
}

const NAV_HOSTS = ["docked", "chart", "saveLoad"] as const;
const SUBNAV_HOSTS = ["status", "chart"] as const;

function requireHost(root: ParentNode, selector: string): HTMLElement {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the station nav is missing "${selector}".`);
  }
  return element;
}

function makeButton(): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.tabIndex = -1;
  return button;
}

function setAttribute(element: HTMLElement, name: string, value: string): void {
  if (element.getAttribute(name) !== value) element.setAttribute(name, value);
}

export function createStationNav(
  root: ParentNode,
  handlers: StationNavHandlers,
): StationNav {
  const navs = NAV_HOSTS.map((name) => ({
    name,
    element: requireHost(root, `[data-station-nav="${name}"]`),
  }));
  const subnavs = SUBNAV_HOSTS.map((name) => ({
    name,
    element: requireHost(root, `[data-station-subnav="${name}"]`),
  }));

  const controller = new AbortController();
  const { signal } = controller;
  const tabs = liveStationTabs();
  const tabButtons: {
    readonly host: string;
    readonly id: StationTabId;
    readonly button: HTMLButtonElement;
  }[] = [];
  const subButtons: {
    readonly host: string;
    readonly value: string;
    readonly button: HTMLButtonElement;
  }[] = [];

  for (const { name, element } of navs) {
    const buttons = tabs.map((tab) => {
      const button = makeButton();
      button.dataset.stationTab = tab.id;
      button.textContent = tab.label;
      tabButtons.push({ host: name, id: tab.id, button });
      return button;
    });
    element.replaceChildren(...buttons);
  }

  for (const { name, element } of subnavs) {
    const entries: readonly { value: string; label: string }[] =
      name === "status"
        ? STATUS_SUBTABS.map((entry) => ({
            value: String(entry.page),
            label: entry.label,
          }))
        : CHART_SUBTABS.map((entry) => ({
            value: entry.range,
            label: entry.label,
          }));
    const buttons = entries.map((entry) => {
      const button = makeButton();
      button.dataset.stationSubtab = entry.value;
      button.textContent = entry.label;
      button.setAttribute("aria-pressed", "false");
      subButtons.push({ host: name, value: entry.value, button });
      return button;
    });
    element.replaceChildren(...buttons);
  }

  for (const { element } of [...navs, ...subnavs]) {
    // A pointer press must never move keyboard focus off the screen section.
    element.addEventListener("mousedown", (event) => event.preventDefault(), {
      signal,
    });
  }

  for (const { element } of navs) {
    element.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest<HTMLButtonElement>("[data-station-tab]");
        if (button === null || !element.contains(button) || button.disabled) {
          return;
        }
        const tab = tabs.find(
          (entry) => entry.id === button.dataset.stationTab,
        );
        if (tab !== undefined) handlers.onNavigate(tab.id);
      },
      { signal },
    );
  }

  for (const { name, element } of subnavs) {
    element.addEventListener(
      "click",
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const button = target.closest<HTMLButtonElement>(
          "[data-station-subtab]",
        );
        if (button === null || !element.contains(button)) return;
        const value = button.dataset.stationSubtab;
        if (name === "status") {
          if (value === "1") handlers.onStatusPage(1);
          else if (value === "2") handlers.onStatusPage(2);
        } else if (value === "short" || value === "long") {
          handlers.onChartRange(value);
        }
      },
      { signal },
    );
  }

  let cachedKey = "";

  return {
    sync(state: StationNavState, bindings: BindingLookup): void {
      const active = activeTabId(state);
      const keyParts = [
        state.mode,
        state.paused,
        state.overlay,
        state.screen,
        state.page,
        state.range,
        ...tabs.map((tab) =>
          tab.action === null ? "" : (bindings[tab.action] ?? []).join(","),
        ),
      ];
      const key = keyParts.join("|");
      if (key === cachedKey) return;
      cachedKey = key;

      for (const { id, button } of tabButtons) {
        const tab = tabs.find((entry) => entry.id === id);
        if (tab === undefined) continue;
        const text = tabText(tab, bindings);
        if (button.textContent !== text) button.textContent = text;
        const enabled = isTabEnabled(id, state);
        if (button.disabled === enabled) button.disabled = !enabled;
        if (id === active) setAttribute(button, "aria-current", "page");
        else if (button.hasAttribute("aria-current")) {
          button.removeAttribute("aria-current");
        }
      }

      const chartNav = navs.find((entry) => entry.name === "chart");
      if (chartNav !== undefined) {
        chartNav.element.hidden = state.mode !== "docked";
      }

      for (const { host, value, button } of subButtons) {
        const pressed =
          host === "status"
            ? value === String(state.page)
            : value === state.range;
        setAttribute(button, "aria-pressed", pressed ? "true" : "false");
      }
    },
    dispose(): void {
      controller.abort();
    },
  };
}

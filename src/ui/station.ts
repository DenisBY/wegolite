// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station computer shell (D-01, D-02, D-03, ECON-09).
 *
 * One persistent header (system + credits), one swappable section and one
 * persistent footer. The footer is a `<div class="station-footer">`, never a
 * second `<footer>`: the global document disclaimer stays the only `<footer>`
 * element, so strict locators and the global CSS keep resolving to it.
 *
 * The four footer fields are independent writers — keys, confirmation, notice,
 * save state — so a failed autosave can never clear a pending `[Y/N]` line.
 * Every dynamic string goes through `textContent`; rows are non-focusable
 * `tr`/`div` elements, never buttons or anchors.
 *
 * The reduced Phase 4 panel is composed as the home renderer: this module never
 * owns a second home path.
 */

import type { DockedPanel } from "./docked.js";
import type { MarketModel } from "./station-model.js";

export type StationScreen =
  "home" | "market" | "outfitting" | "status" | "systemData";

export interface StationView {
  readonly screen: StationScreen;
  readonly systemName: string;
  readonly creditsText: string;
  readonly fuelText: string;
  readonly message: string;
  readonly keysText: string;
  readonly confirmText: string;
  readonly noticeText: string;
  readonly saveText: string;
  readonly market?: MarketModel;
}

export interface StationShell {
  show(systemName: string): void;
  hide(): void;
  setMessage(text: string): void;
  setCredits(text: string): void;
  setFuel(text: string): void;
  onLaunch(handler: () => void): void;
  setScreen(screen: StationScreen): void;
  render(view: StationView): void;
  dispose(): void;
}

function requireElement<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  description: string,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the station shell is missing ${description}.`);
  }
  return element as T;
}

function cell(text: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = text;
  return element;
}

export function createStationShell(
  root: HTMLElement,
  home: DockedPanel,
): StationShell {
  const section = requireElement<HTMLElement>(
    root,
    "#station-screen",
    'the "#station-screen" section',
  );
  const homePanel = requireElement<HTMLElement>(
    root,
    '[data-station-panel="home"]',
    "the home panel",
  );
  const marketPanel = requireElement<HTMLElement>(
    root,
    '[data-station-panel="market"]',
    "the market panel",
  );
  const marketBody = requireElement<HTMLElement>(
    root,
    "[data-market-rows]",
    "the market row body",
  );
  const marketCash = requireElement<HTMLElement>(
    root,
    '[data-field="market-cash"]',
    "the market cash line",
  );
  const marketLoad = requireElement<HTMLElement>(
    root,
    '[data-field="market-load"]',
    "the market load line",
  );
  const keysField = requireElement<HTMLElement>(
    root,
    '[data-field="station-keys"]',
    "the station key hints",
  );
  const confirmField = requireElement<HTMLElement>(
    root,
    '[data-field="station-confirm"]',
    "the station confirmation line",
  );
  const noticeField = requireElement<HTMLElement>(
    root,
    '[data-field="station-notice"]',
    "the station notice line",
  );
  const saveField = requireElement<HTMLElement>(
    root,
    '[data-field="station-save"]',
    "the station save line",
  );

  const controller = new AbortController();
  let previousScreen: StationScreen = "home";

  function renderMarketRows(model: MarketModel): void {
    marketBody.replaceChildren();
    for (const row of model.rows) {
      const tr = document.createElement("tr");
      tr.dataset.key = row.key;
      if (row.key === model.selectedKey) tr.classList.add("selected");
      if (row.dimmed) tr.classList.add("dimmed");
      tr.append(
        cell(row.name),
        cell(row.unit),
        cell(row.priceText),
        cell(row.stockText),
        cell(row.heldText),
        cell(row.exText),
      );
      marketBody.append(tr);
    }
    marketCash.textContent = model.cashText;
    marketLoad.textContent = model.loadText;
  }

  function applyScreen(screen: StationScreen): void {
    section.dataset.screen = screen;
    homePanel.hidden = screen !== "home";
    marketPanel.hidden = screen !== "market";
    if (screen !== previousScreen) {
      previousScreen = screen;
      section.focus({ preventScroll: true });
    }
  }

  return {
    show(systemName: string): void {
      home.show(systemName);
    },
    hide(): void {
      home.hide();
    },
    setMessage(text: string): void {
      home.setMessage(text);
    },
    setCredits(text: string): void {
      home.setCredits(text);
    },
    setFuel(text: string): void {
      home.setFuel(text);
    },
    onLaunch(handler: () => void): void {
      home.onLaunch(handler);
    },
    setScreen(screen: StationScreen): void {
      applyScreen(screen);
    },
    render(view: StationView): void {
      home.setCredits(view.creditsText);
      home.setFuel(view.fuelText);
      home.setMessage(view.message);
      applyScreen(view.screen);
      if (view.screen === "market" && view.market !== undefined) {
        renderMarketRows(view.market);
      }
      // One writer per field. A save failure writes only `station-save`.
      keysField.textContent = view.keysText;
      confirmField.textContent = view.confirmText;
      noticeField.textContent = view.noticeText;
      saveField.textContent = view.saveText;
    },
    dispose(): void {
      controller.abort();
      home.dispose();
    },
  };
}

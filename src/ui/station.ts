// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The station computer shell (D-01, D-02, D-03, ECON-05..ECON-09).
 *
 * One persistent header (system + credits), one swappable section and one
 * persistent footer. The footer is a `<div class="station-footer">`, never a
 * second `<footer>`: the global document disclaimer stays the only `<footer>`
 * element, so strict locators and the global CSS keep resolving to it.
 *
 * The four footer fields are independent writers — keys, confirmation, notice,
 * save state — so a failed autosave can never clear a pending `[Y/N]` line.
 * Every dynamic string goes through `textContent`; section rows are
 * non-focusable `tr`/`div` elements, never buttons or anchors, so native
 * Enter/Space cannot bypass the semantic action layer (T-05-25).
 *
 * The reduced Phase 4 panel is composed as the home renderer: this module never
 * owns a second home path.
 */

import type { DockedPanel } from "./docked.js";
import type {
  LabelledField,
  MarketModel,
  OutfittingModel,
  StatusModel,
  SystemDataModel,
} from "./station-model.js";

export type StationScreen =
  "home" | "market" | "outfitting" | "status" | "systemData" | "interfaces";

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
  readonly market?: MarketModel | undefined;
  readonly outfitting?: OutfittingModel | undefined;
  readonly status?: StatusModel | undefined;
  readonly systemData?: SystemDataModel | undefined;
}

export interface StationShell {
  show(systemName: string): void;
  hide(): void;
  setMessage(text: string): void;
  setCredits(text: string): void;
  setFuel(text: string): void;
  onLaunch(handler: () => void): void;
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

function span(text: string, className?: string): HTMLSpanElement {
  const element = document.createElement("span");
  if (className !== undefined) element.className = className;
  element.textContent = text;
  return element;
}

/** Append one label/value pair to a definition list. */
function appendField(list: HTMLElement, field: LabelledField): void {
  const term = document.createElement("dt");
  term.textContent = field.label;
  const value = document.createElement("dd");
  value.textContent = field.value;
  list.append(term, value);
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
  const outfittingPanel = requireElement<HTMLElement>(
    root,
    '[data-station-panel="outfitting"]',
    "the outfitting panel",
  );
  const statusPanel = requireElement<HTMLElement>(
    root,
    '[data-station-panel="status"]',
    "the status panel",
  );
  const systemDataPanel = requireElement<HTMLElement>(
    root,
    '[data-station-panel="systemData"]',
    "the system-data panel",
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
  const outfittingRows = requireElement<HTMLElement>(
    root,
    "[data-outfitting-rows]",
    "the outfitting row list",
  );
  const outfittingTitle = requireElement<HTMLElement>(
    root,
    '[data-field="outfitting-title"]',
    "the outfitting detail title",
  );
  const outfittingDescription = requireElement<HTMLElement>(
    root,
    '[data-field="outfitting-description"]',
    "the outfitting detail description",
  );
  const outfittingPrice = requireElement<HTMLElement>(
    root,
    '[data-field="outfitting-price"]',
    "the outfitting detail price",
  );
  const statusPage = requireElement<HTMLElement>(
    root,
    '[data-field="status-page"]',
    "the status page indicator",
  );
  const statusPageOne = requireElement<HTMLElement>(
    root,
    '[data-status-page="1"]',
    "the status page-1 block",
  );
  const statusPageTwo = requireElement<HTMLElement>(
    root,
    '[data-status-page="2"]',
    "the status page-2 block",
  );
  const statusFields = requireElement<HTMLElement>(
    root,
    "[data-status-fields]",
    "the status field list",
  );
  const statusEquipment = requireElement<HTMLElement>(
    root,
    "[data-status-equipment]",
    "the status equipment list",
  );
  const manifestBody = requireElement<HTMLElement>(
    root,
    "[data-manifest-rows]",
    "the manifest row body",
  );
  const statusLoad = requireElement<HTMLElement>(
    root,
    '[data-field="status-load"]',
    "the status load line",
  );
  const systemDataTitle = requireElement<HTMLElement>(
    root,
    '[data-field="system-data-title"]',
    "the system-data title",
  );
  const systemDataFields = requireElement<HTMLElement>(
    root,
    "[data-system-data-fields]",
    "the system-data field list",
  );
  const systemDataDescription = requireElement<HTMLElement>(
    root,
    '[data-field="system-data-description"]',
    "the system-data description",
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

  function renderOutfitting(model: OutfittingModel): void {
    outfittingRows.replaceChildren();
    for (const row of model.rows) {
      const element = document.createElement("div");
      element.className = "station-row";
      element.dataset.equipmentKey = row.key;
      if (row.key === model.selectedKey) element.classList.add("selected");
      if (row.dimmed) element.classList.add("dimmed");
      element.append(
        span(row.label),
        span(row.priceText),
        span(row.reason, "station-row-reason"),
      );
      outfittingRows.append(element);
    }
    const detail = model.detail;
    outfittingTitle.textContent = detail?.title ?? "";
    outfittingDescription.textContent = detail?.description ?? "";
    outfittingPrice.textContent = detail?.priceText ?? "";
  }

  function renderStatus(model: StatusModel): void {
    statusPage.textContent = model.pageText;
    statusFields.replaceChildren();
    for (const field of model.fields) appendField(statusFields, field);
    statusEquipment.replaceChildren();
    for (const name of model.equipment) {
      const item = document.createElement("li");
      item.textContent = name;
      statusEquipment.append(item);
    }
    manifestBody.replaceChildren();
    for (const row of model.manifest) {
      const tr = document.createElement("tr");
      tr.dataset.key = row.key;
      tr.append(cell(row.name), cell(row.unit), cell(row.heldText));
      manifestBody.append(tr);
    }
    statusLoad.textContent = model.loadText;
    statusPageOne.hidden = model.page !== 1;
    statusPageTwo.hidden = model.page !== 2;
  }

  function renderSystemData(model: SystemDataModel): void {
    systemDataTitle.textContent = model.title;
    systemDataFields.replaceChildren();
    for (const field of model.fields) appendField(systemDataFields, field);
    systemDataDescription.textContent = model.description;
  }

  function applyScreen(screen: StationScreen): void {
    section.dataset.screen = screen;
    homePanel.hidden = screen !== "home";
    marketPanel.hidden = screen !== "market";
    outfittingPanel.hidden = screen !== "outfitting";
    statusPanel.hidden = screen !== "status";
    systemDataPanel.hidden = screen !== "systemData";
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
    render(view: StationView): void {
      home.setCredits(view.creditsText);
      home.setFuel(view.fuelText);
      home.setMessage(view.message);
      applyScreen(view.screen);
      if (view.screen === "market" && view.market !== undefined) {
        renderMarketRows(view.market);
      }
      if (view.screen === "outfitting" && view.outfitting !== undefined) {
        renderOutfitting(view.outfitting);
      }
      if (view.screen === "status" && view.status !== undefined) {
        renderStatus(view.status);
      }
      if (view.screen === "systemData" && view.systemData !== undefined) {
        renderSystemData(view.systemData);
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

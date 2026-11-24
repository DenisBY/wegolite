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
 * The footer is the shared two-line component (`station-footer.ts`): a live
 * key-hint line above one status line. It has three independent status writers —
 * confirmation, notice, save state — rendered by priority
 * `confirm > notice > save > info`, so a failed autosave can never clear a
 * pending `[Y/N]` line. Every dynamic string goes through `textContent`;
 * section rows are non-focusable `tr`/`div` elements, never buttons or anchors,
 * so native Enter/Space cannot bypass the semantic action layer (T-05-25).
 *
 * The reduced Phase 4 panel is composed as the home renderer: this module never
 * owns a second home path.
 */

import { createStationFooter } from "./station-footer.js";
import type { DockedPanel } from "./docked.js";

import { isMarketSortColumn } from "./station-model.js";
import type {
  HomeModel,
  InterfacesModel,
  LabelledField,
  MarketModel,
  MarketSortColumn,
  OutfittingModel,
  StatusModel,
} from "./station-model.js";

export type StationScreen =
  "home" | "market" | "outfitting" | "status" | "interfaces";

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
  readonly home?: HomeModel | undefined;
  readonly market?: MarketModel | undefined;
  readonly outfitting?: OutfittingModel | undefined;
  readonly status?: StatusModel | undefined;
  readonly interfaces?: InterfacesModel | undefined;
}

export interface StationShell {
  show(systemName: string): void;
  hide(): void;
  setMessage(text: string): void;
  setCredits(text: string): void;
  setFuel(text: string): void;
  onLaunch(handler: () => void): void;
  onRefuel?(handler: () => void): void;
  /** A click on a sortable F8 column heading (quick task 261118-cyo). */
  onMarketSort?(handler: (column: MarketSortColumn) => void): void;
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
  const interfacesPanel = requireElement<HTMLElement>(
    root,
    '[data-station-panel="interfaces"]',
    "the interfaces panel",
  );
  const interfacesTitle = requireElement<HTMLElement>(
    root,
    '[data-field="interfaces-title"]',
    "the interfaces title",
  );
  const interfacesEmpty = requireElement<HTMLElement>(
    root,
    '[data-field="interfaces-empty"]',
    "the interfaces empty-state line",
  );
  const marketBody = requireElement<HTMLElement>(
    root,
    "[data-market-rows]",
    "the market row body",
  );
  const marketHead = requireElement<HTMLElement>(
    marketPanel,
    "thead",
    "the market column headings",
  );
  const marketTitle = requireElement<HTMLElement>(
    marketPanel,
    '[data-field="market-title"]',
    "the market heading",
  );
  const marketInfoComment = requireElement<HTMLElement>(
    root,
    '[data-field="market-info-comment"]',
    "the market info comment line",
  );
  const marketCashLoad = requireElement<HTMLElement>(
    root,
    '[data-field="market-cash-load"]',
    "the market cash-and-load line",
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
  // The facing selection's detail text carries Oolite's own line break
  // ("<name>\nPlease select where to install this weapon."); `pre-line` keeps
  // it while the text still goes in through `textContent`.
  outfittingDescription.style.whiteSpace = "pre-line";
  const outfittingPrice = requireElement<HTMLElement>(
    root,
    '[data-field="outfitting-price"]',
    "the outfitting detail price",
  );
  const outfittingEmpty = requireElement<HTMLElement>(
    root,
    '[data-field="outfitting-empty"]',
    "the outfitting empty-state line",
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
  const statusEquipmentHeading = requireElement<HTMLElement>(
    root,
    '[data-field="status-equipment-heading"]',
    "the status equipment heading",
  );
  const manifestCargo = requireElement<HTMLElement>(
    root,
    '[data-field="manifest-cargo"]',
    "the manifest cargo line",
  );
  const manifestCabins = requireElement<HTMLElement>(
    root,
    '[data-field="manifest-cabins"]',
    "the manifest cabins line",
  );
  const manifestRows = requireElement<HTMLElement>(
    root,
    "[data-manifest-rows]",
    "the manifest list",
  );
  const manifestEmpty = requireElement<HTMLElement>(
    root,
    '[data-field="manifest-empty"]',
    "the manifest empty line",
  );
  const footer = createStationFooter(root);

  const controller = new AbortController();
  let previousScreen: StationScreen = "home";

  /**
   * Write each heading from the model: the label, plus " ▲" or " ▼" on the
   * active sort column, and `aria-sort` on every sortable heading.
   */
  function renderMarketHeadings(model: MarketModel): void {
    for (const column of model.columns) {
      const heading = marketHead.querySelector(
        `th[data-column="${column.key}"]`,
      );
      if (!(heading instanceof HTMLElement)) continue;
      const arrow =
        column.sort === "ascending"
          ? " ▲"
          : column.sort === "descending"
            ? " ▼"
            : "";
      const text = `${column.label}${arrow}`;
      if (heading.textContent !== text) heading.textContent = text;
      if (column.sortable) {
        heading.setAttribute("aria-sort", column.sort ?? "none");
      } else {
        heading.removeAttribute("aria-sort");
      }
    }
  }

  function renderMarketRows(model: MarketModel): void {
    renderMarketHeadings(model);
    marketTitle.textContent = model.title;
    marketBody.replaceChildren();
    // Market Info shows only the selected commodity's row, with no selected
    // highlight (Oolite calls `setNoSelectedRow` before showing it,
    // `PlayerEntityControls.m:3963-3964`).
    const info = model.info;
    const shown = info === null ? model.rows : [info.row];
    for (const row of shown) {
      const tr = document.createElement("tr");
      tr.dataset.key = row.key;
      if (info === null && row.key === model.selectedKey) {
        tr.classList.add("selected");
      }
      if (row.dimmed) tr.classList.add("dimmed");
      tr.append(
        cell(row.name),
        cell(row.unit),
        cell(row.priceText),
        cell(row.stockText),
        cell(row.heldText),
        cell(row.legalText),
      );
      marketBody.append(tr);
    }
    marketInfoComment.textContent = info === null ? "" : info.comment;
    marketInfoComment.hidden = info === null;
    marketCashLoad.textContent = model.cashLoadText;
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
    outfittingEmpty.textContent = model.emptyText;
    outfittingEmpty.hidden = model.emptyText === "";
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
    // Oolite's "Equipment:" heading (`status-equipment`) heads a non-empty list.
    statusEquipmentHeading.hidden = model.equipment.length === 0;
    manifestCargo.textContent = model.cargoText;
    manifestCabins.textContent = model.cabinsText;
    manifestRows.replaceChildren();
    for (const row of model.manifest) {
      const item = document.createElement("li");
      item.dataset.key = row.key;
      item.textContent = row.text;
      manifestRows.append(item);
    }
    manifestEmpty.textContent = model.emptyText;
    statusPageOne.hidden = model.page !== 1;
    statusPageTwo.hidden = model.page !== 2;
  }

  function applyScreen(screen: StationScreen): void {
    section.dataset.screen = screen;
    homePanel.hidden = screen !== "home";
    marketPanel.hidden = screen !== "market";
    outfittingPanel.hidden = screen !== "outfitting";
    statusPanel.hidden = screen !== "status";
    interfacesPanel.hidden = screen !== "interfaces";
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
    onRefuel(handler: () => void): void {
      home.onRefuel?.(handler);
    },
    onMarketSort(handler: (column: MarketSortColumn) => void): void {
      // One delegated listener on the heading row; only an allow-listed
      // column key reaches the session, which repeats its own guards.
      marketHead.addEventListener(
        "click",
        (event) => {
          const target = event.target;
          if (!(target instanceof Element)) return;
          const heading = target.closest("th[data-column]");
          if (!(heading instanceof HTMLElement)) return;
          const column = heading.dataset.column;
          if (!isMarketSortColumn(column)) return;
          handler(column);
        },
        { signal: controller.signal },
      );
    },
    render(view: StationView): void {
      home.setCredits(view.creditsText);
      home.setFuel(view.fuelText);
      home.setMessage(view.message);
      if (view.home !== undefined) {
        home.setHome?.(view.home);
      }
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
      if (view.screen === "interfaces" && view.interfaces !== undefined) {
        interfacesTitle.textContent = view.interfaces.title;
        interfacesEmpty.textContent = view.interfaces.emptyText;
      }
      // One footer, two lines, independent parts. The component chooses which
      // status part is visible; passing all three every render clears a part
      // that the session cleared.
      footer.setHints(view.keysText);
      footer.setStatus({
        confirm: view.confirmText,
        notice: view.noticeText,
        save: view.saveText,
      });
    },
    dispose(): void {
      controller.abort();
      footer.dispose();
      home.dispose();
    },
  };
}

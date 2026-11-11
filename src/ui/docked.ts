// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The reduced docked home panel (D-02, D-03, ECON-09).
 *
 * Phase 4's single panel owned a docking-computer purchase line. Phase 5
 * replaces that line with the Outfitting screen, so this module is reduced to
 * the five retained fields (`system`, `credits`, `ship`, `fuel`, `message`) and
 * the single Launch control. `src/ui/station.ts` composes it as the home screen
 * of the station computer; it is not a second live path.
 *
 * Every dynamic string is written with `textContent` — never `innerHTML`
 * (Pitfall 16, T-04-23). The fuel value comes from the live profile now that
 * the constant Phase 4 fuel string is gone.
 */

import type { HomeModel } from "./station-model.js";

export const DOCKED_SHIP = "Cobra Mk III";

export interface DockedPanel {
  show(systemName: string): void;
  hide(): void;
  /** D-11: the home screen's message line, same monospace/green styling. */
  setMessage(text: string): void;
  /** The live profile balance, already formatted by `formatDecicredits`. */
  setCredits(text: string): void;
  /** The live tank (0..70 tenths), formatted by `formatFuel`. */
  setFuel(text: string): void;
  /** Populate the Variant 1B arrival report & ship berth dashboard fields. */
  setHome?(model: HomeModel): void;
  onLaunch(handler: () => void): void;
  onRefuel?(handler: () => void): void;
  dispose(): void;
}

/** Format tenths of a light year: `70` is `"7.0 LY"`. */
export function formatFuel(fuel: number): string {
  return `${(fuel / 10).toFixed(1)} LY`;
}

function requireField(root: HTMLElement, field: string): HTMLElement {
  const element = root.querySelector(`[data-field="${field}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the docked panel is missing "${field}".`);
  }
  return element;
}

function requireButton(root: HTMLElement, action: string): HTMLButtonElement {
  const element = root.querySelector(`[data-action="${action}"]`);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(
      `Wegolite: the docked panel is missing its ${action} control.`,
    );
  }
  return element;
}

function optionalField(root: HTMLElement, field: string): HTMLElement | null {
  const element = root.querySelector(`[data-field="${field}"]`);
  return element instanceof HTMLElement ? element : null;
}

export function createDockedPanel(root: HTMLElement): DockedPanel {
  const systemField = requireField(root, "system");
  const creditsField = requireField(root, "credits");
  const shipField = requireField(root, "ship");
  const fuelField = requireField(root, "fuel");
  const messageField = requireField(root, "message");
  const launch = requireButton(root, "launch");

  const refuelButton = root.querySelector('button[data-action="refuel"]');
  const fuelFill = optionalField(root, "home-fuel-fill");
  const jumpTarget = optionalField(root, "home-jump-target");
  const jumpDistance = optionalField(root, "home-jump-distance");
  const jumpStatus = optionalField(root, "home-jump-status");
  const jumpFill = optionalField(root, "home-jump-fill");
  const jumpMarker = optionalField(root, "home-jump-marker");
  const cargoSummary = optionalField(root, "home-cargo-summary");
  const cargoFill = optionalField(root, "home-cargo-fill");
  const cargoList = root.querySelector("[data-home-cargo-rows]");
  const systemTitle = optionalField(root, "home-system-title");
  const stationSubtitle = optionalField(root, "home-station-subtitle");
  const economyField = optionalField(root, "home-economy");
  const governmentField = optionalField(root, "home-government");
  const techLevelField = optionalField(root, "home-tech-level");
  const populationField = optionalField(root, "home-population");
  const productivityField = optionalField(root, "home-productivity");
  const radiusField = optionalField(root, "home-radius");
  const descriptionField = optionalField(root, "home-description");
  const marketHighlightsBody = root.querySelector(
    "[data-home-market-highlights]",
  );

  shipField.textContent = DOCKED_SHIP;

  const controller = new AbortController();

  return {
    show(systemName: string): void {
      systemField.textContent = systemName;
      if (systemTitle !== null) systemTitle.textContent = systemName;
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
    },
    setMessage(text: string): void {
      messageField.textContent = text;
    },
    setCredits(text: string): void {
      creditsField.textContent = text;
    },
    setFuel(text: string): void {
      fuelField.textContent = text;
    },
    setHome(model: HomeModel): void {
      if (fuelFill !== null) {
        fuelFill.style.width = `${String(model.fuelPercent)}%`;
      }
      if (refuelButton instanceof HTMLButtonElement) {
        refuelButton.disabled = !model.canRefuel;
        refuelButton.dataset.fuelState = model.fuelFull
          ? "full"
          : model.canRefuel
            ? "ready"
            : "disabled";
        const labelSpan = document.createElement("span");
        labelSpan.className = "home-btn-refuel-label";
        labelSpan.textContent = model.refuelButtonText;
        const costSpan = document.createElement("strong");
        costSpan.className = "home-btn-refuel-cost";
        costSpan.textContent = model.refuelCostText;
        refuelButton.replaceChildren(labelSpan, " ", costSpan);
      }
      if (jumpTarget !== null) jumpTarget.textContent = model.jumpTargetName;
      if (jumpDistance !== null) {
        jumpDistance.textContent = model.jumpDistanceText;
      }
      if (jumpStatus !== null) {
        jumpStatus.textContent = model.jumpStatusText;
        jumpStatus.dataset.jumpStatus = model.jumpStatusKind;
      }
      if (jumpFill !== null) {
        jumpFill.style.width = `${String(model.fuelPercent)}%`;
      }
      if (jumpMarker !== null) {
        jumpMarker.style.left = `${String(model.jumpRequiredPercent)}%`;
        jumpMarker.hidden = model.jumpStatusKind === "none";
      }
      if (cargoSummary !== null) {
        cargoSummary.textContent = model.cargoSummaryText;
      }
      if (cargoFill !== null) {
        cargoFill.style.width = `${String(model.cargoPercent)}%`;
      }
      if (cargoList instanceof HTMLElement) {
        cargoList.replaceChildren();
        if (model.cargoItems.length === 0) {
          const empty = document.createElement("p");
          empty.className = "home-cargo-empty";
          empty.textContent = "Cargo hold empty — 20 TC available";
          cargoList.append(empty);
        } else {
          for (const item of model.cargoItems.slice(0, 4)) {
            const row = document.createElement("div");
            row.className = "home-cargo-row";
            const name = document.createElement("span");
            name.className = "home-cargo-name";
            name.textContent = item.name;
            const meta = document.createElement("span");
            meta.className = "home-cargo-meta";
            const diff = document.createElement("span");
            diff.className = `home-cargo-diff ${item.diffKind}`;
            diff.textContent = item.diffText;
            const qty = document.createElement("strong");
            qty.textContent = item.quantityText;
            meta.append(diff, " ", qty);
            row.append(name, meta);
            cargoList.append(row);
          }
        }
      }
      if (systemTitle !== null) systemTitle.textContent = model.systemName;
      if (stationSubtitle !== null) {
        stationSubtitle.textContent = model.stationSubtitle;
      }
      if (economyField !== null) economyField.textContent = model.economy;
      if (governmentField !== null) {
        governmentField.textContent = model.government;
      }
      if (techLevelField !== null) techLevelField.textContent = model.techLevel;
      if (populationField !== null) {
        populationField.textContent = model.population;
      }
      if (productivityField !== null) {
        productivityField.textContent = model.productivity;
      }
      if (radiusField !== null) radiusField.textContent = model.radius;
      if (descriptionField !== null) {
        descriptionField.textContent = model.description;
      }
      if (marketHighlightsBody instanceof HTMLElement) {
        marketHighlightsBody.replaceChildren();
        for (const item of model.marketHighlights) {
          const tr = document.createElement("tr");
          const tdName = document.createElement("td");
          tdName.textContent = item.name;
          const tdPrice = document.createElement("td");
          tdPrice.textContent = item.priceText;
          const tdStock = document.createElement("td");
          tdStock.textContent = item.stockText;
          const tdBadge = document.createElement("td");
          const badge = document.createElement("span");
          badge.className = `home-market-tag ${item.badgeKind}`;
          badge.textContent = item.badgeText;
          tdBadge.append(badge);
          tr.append(tdName, tdPrice, tdStock, tdBadge);
          marketHighlightsBody.append(tr);
        }
      }
    },
    onLaunch(handler: () => void): void {
      launch.addEventListener(
        "click",
        () => {
          handler();
        },
        { signal: controller.signal },
      );
    },
    onRefuel(handler: () => void): void {
      if (!(refuelButton instanceof HTMLButtonElement)) return;
      refuelButton.addEventListener(
        "click",
        () => {
          handler();
        },
        { signal: controller.signal },
      );
    },
    dispose(): void {
      controller.abort();
    },
  };
}

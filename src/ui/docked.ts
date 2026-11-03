// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docked status panel (D-09, WORLD-01).
 *
 * Exactly one panel: system name, credits, ship and fuel, plus one Launch
 * control. No trade, outfitting, market, mission or status screen is reachable
 * in this phase, and every string is written with `textContent` — never
 * `innerHTML` (Pitfall 16).
 */

export const DOCKED_CREDITS = "100.0 Cr";
export const DOCKED_SHIP = "Cobra Mk III";
export const DOCKED_FUEL = "7.0 LY";

export interface DockedPanel {
  show(systemName: string): void;
  hide(): void;
  onLaunch(handler: () => void): void;
  dispose(): void;
}

function requireField(root: HTMLElement, field: string): HTMLElement {
  const element = root.querySelector(`[data-field="${field}"]`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the docked panel is missing "${field}".`);
  }
  return element;
}

export function createDockedPanel(root: HTMLElement): DockedPanel {
  const systemField = requireField(root, "system");
  const creditsField = requireField(root, "credits");
  const shipField = requireField(root, "ship");
  const fuelField = requireField(root, "fuel");

  const launch = root.querySelector('[data-action="launch"]');
  if (!(launch instanceof HTMLButtonElement)) {
    throw new Error(
      "Wegolite: the docked panel is missing its Launch control.",
    );
  }

  creditsField.textContent = DOCKED_CREDITS;
  shipField.textContent = DOCKED_SHIP;
  fuelField.textContent = DOCKED_FUEL;

  const controller = new AbortController();

  return {
    show(systemName: string): void {
      systemField.textContent = systemName;
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
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
    dispose(): void {
      controller.abort();
    },
  };
}

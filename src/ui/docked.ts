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
  onLaunch(handler: () => void): void;
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

export function createDockedPanel(root: HTMLElement): DockedPanel {
  const systemField = requireField(root, "system");
  const creditsField = requireField(root, "credits");
  const shipField = requireField(root, "ship");
  const fuelField = requireField(root, "fuel");
  const messageField = requireField(root, "message");
  const launch = requireButton(root, "launch");

  shipField.textContent = DOCKED_SHIP;

  const controller = new AbortController();

  return {
    show(systemName: string): void {
      systemField.textContent = systemName;
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

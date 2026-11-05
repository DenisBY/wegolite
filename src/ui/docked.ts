// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The docked status panel (D-09, D-10, WORLD-01).
 *
 * Exactly one panel: system name, real credits, ship and fuel, one docking
 * computer purchase line and one Launch control. Phase 4 replaces the Phase 3
 * constant `100.0 Cr` with the live profile balance and adds the single
 * D-10 line; Phase 5 will replace that line with the outfitting screen.
 *
 * Every dynamic string is written with `textContent` — never `innerHTML`
 * (Pitfall 16, T-04-23). The purchase reason is its own field so the launch
 * hint on the message line cannot hide it.
 */

export const DOCKED_SHIP = "Cobra Mk III";
export const DOCKED_FUEL = "7.0 LY";

/** The purchase line's view, computed by the session from the profile. */
export interface DockComputerView {
  /** e.g. "Docking Computers — 1500.0 Cr (TL 9)". */
  readonly line: string;
  readonly disabled: boolean;
  /** A short, fixed reason when disabled ("Requires TL 9", …). */
  readonly reason: string;
}

export interface DockedPanel {
  show(systemName: string): void;
  hide(): void;
  /** D-11: the docked panel's message line, same monospace/green styling. */
  setMessage(text: string): void;
  /** The live profile balance, already formatted by `formatCredits`. */
  setCredits(text: string): void;
  /** D-10: the one equipment line and its purchase control. */
  setDockComputer(view: DockComputerView): void;
  onLaunch(handler: () => void): void;
  onBuyDockComputer(handler: () => void): void;
  dispose(): void;
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
  const dockComputerField = requireField(root, "dockcomp");
  const dockComputerMessageField = requireField(root, "dockcomp-message");

  const launch = requireButton(root, "launch");
  const buyDockComputer = requireButton(root, "buy-dockcomp");

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
    setMessage(text: string): void {
      messageField.textContent = text;
    },
    setCredits(text: string): void {
      creditsField.textContent = text;
    },
    setDockComputer(view: DockComputerView): void {
      dockComputerField.textContent = view.line;
      dockComputerMessageField.textContent = view.reason;
      buyDockComputer.disabled = view.disabled;
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
    onBuyDockComputer(handler: () => void): void {
      buyDockComputer.addEventListener(
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

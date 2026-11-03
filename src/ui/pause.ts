// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pause overlay (D-14, D-15).
 *
 * One overlay, created once and toggled. It is the single home for Resume,
 * Controls and Settings, and it is reachable both docked and in flight. This
 * module owns only the overlay chrome and focus; the session owns the paused
 * flag, the simulation freeze and the input clear.
 *
 * Task 1 creates the minimal shell so the rebind tracer has a route to
 * Controls. Task 3 completes the focus trap and the settings panel.
 */

export interface PauseOverlayOptions {
  readonly root: HTMLElement;
  /** The element that receives focus when the overlay closes. */
  readonly gameRoot: HTMLElement;
  readonly onResume: () => void;
  readonly onControls: () => void;
  readonly onSettings: () => void;
}

export interface PauseOverlay {
  show(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

function requireButton(root: HTMLElement, action: string): HTMLButtonElement {
  const element = root.querySelector(`button[data-pause-action="${action}"]`);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(
      `Wegolite: the pause overlay is missing its "${action}" control.`,
    );
  }
  return element;
}

export function createPauseOverlay(options: PauseOverlayOptions): PauseOverlay {
  const { root, gameRoot, onResume, onControls, onSettings } = options;
  const resume = requireButton(root, "resume");
  const controls = requireButton(root, "controls");
  const settings = requireButton(root, "settings");
  const controller = new AbortController();

  resume.addEventListener("click", onResume, { signal: controller.signal });
  controls.addEventListener("click", onControls, { signal: controller.signal });
  settings.addEventListener("click", onSettings, { signal: controller.signal });

  return {
    show(): void {
      root.hidden = false;
      resume.focus();
    },
    hide(): void {
      root.hidden = true;
      gameRoot.focus();
    },
    isOpen(): boolean {
      return !root.hidden;
    },
    dispose(): void {
      controller.abort();
    },
  };
}

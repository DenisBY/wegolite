// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Settings panel (D-13, D-14, FLGT-06).
 *
 * A deliberately small panel inside the pause overlay. It explains that
 * settings are local, links to Controls rather than duplicating the rebinding
 * list, and owns the reset-all action. No unrequested preference is added:
 * Phase 3 has exactly the bindings blob.
 */

export interface SettingsPanelOptions {
  readonly root: HTMLElement;
  readonly onBack: () => void;
  readonly onControls: () => void;
  readonly onReset: () => void;
}

export interface SettingsPanel {
  show(): void;
  hide(): void;
  isOpen(): boolean;
  dispose(): void;
}

function requireButton(root: HTMLElement, action: string): HTMLButtonElement {
  const element = root.querySelector(
    `button[data-settings-action="${action}"]`,
  );
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(
      `Wegolite: the settings panel is missing its "${action}" control.`,
    );
  }
  return element;
}

export function createSettingsPanel(
  options: SettingsPanelOptions,
): SettingsPanel {
  const { root, onBack, onControls, onReset } = options;
  const controls = requireButton(root, "controls");
  const reset = requireButton(root, "reset");
  const back = requireButton(root, "back");
  const controller = new AbortController();

  controls.addEventListener("click", onControls, { signal: controller.signal });
  reset.addEventListener("click", onReset, { signal: controller.signal });
  back.addEventListener("click", onBack, { signal: controller.signal });

  return {
    show(): void {
      root.hidden = false;
      controls.focus();
    },
    hide(): void {
      root.hidden = true;
    },
    isOpen(): boolean {
      return !root.hidden;
    },
    dispose(): void {
      controller.abort();
    },
  };
}

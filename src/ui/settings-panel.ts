// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Settings panel (D-13, D-14, FLGT-06).
 *
 * A deliberately small panel inside the pause overlay. It explains that
 * settings are local, links to Controls rather than duplicating the rebinding
 * list, owns the reset-all action, and holds one requested toggle: whether
 * losing window or tab focus pauses the game (D-15, on by default).
 */

export interface SettingsPanelOptions {
  readonly root: HTMLElement;
  readonly onBack: () => void;
  readonly onControls: () => void;
  readonly onReset: () => void;
  readonly onPauseOnFocusLossChange: (enabled: boolean) => void;
}

export interface SettingsPanel {
  show(): void;
  hide(): void;
  isOpen(): boolean;
  /** Set the focus-loss checkbox to the stored value without firing a change. */
  setPauseOnFocusLoss(enabled: boolean): void;
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

function requirePauseOnFocusLossToggle(root: HTMLElement): HTMLInputElement {
  const element = root.querySelector(
    'input[type="checkbox"][data-settings-toggle="pauseOnFocusLoss"]',
  );
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(
      'Wegolite: the settings panel is missing its "pauseOnFocusLoss" toggle.',
    );
  }
  return element;
}

export function createSettingsPanel(
  options: SettingsPanelOptions,
): SettingsPanel {
  const { root, onBack, onControls, onReset, onPauseOnFocusLossChange } =
    options;
  const controls = requireButton(root, "controls");
  const reset = requireButton(root, "reset");
  const back = requireButton(root, "back");
  const pauseToggle = requirePauseOnFocusLossToggle(root);
  const controller = new AbortController();

  controls.addEventListener("click", onControls, { signal: controller.signal });
  reset.addEventListener("click", onReset, { signal: controller.signal });
  back.addEventListener("click", onBack, { signal: controller.signal });
  pauseToggle.addEventListener(
    "change",
    () => {
      onPauseOnFocusLossChange(pauseToggle.checked);
    },
    { signal: controller.signal },
  );

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
    setPauseOnFocusLoss(enabled: boolean): void {
      pauseToggle.checked = enabled;
    },
    dispose(): void {
      controller.abort();
    },
  };
}

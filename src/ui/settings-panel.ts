// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Settings panel (D-13, D-14, FLGT-06).
 *
 * A deliberately small panel inside the pause overlay. It explains that
 * settings are local, links to Controls rather than duplicating the rebinding
 * list, owns the reset-all action, and holds one requested toggle: whether
 * losing window or tab focus pauses the game (D-15, on by default). A second
 * toggle selects the High graphics quality (off by default).
 */

import type { GraphicsQuality } from "../settings/schema.js";

export interface SettingsPanelOptions {
  readonly root: HTMLElement;
  readonly onBack: () => void;
  readonly onControls: () => void;
  readonly onReset: () => void;
  readonly onPauseOnFocusLossChange: (enabled: boolean) => void;
  readonly onQualityChange: (quality: GraphicsQuality) => void;
}

export interface SettingsPanel {
  show(): void;
  hide(): void;
  isOpen(): boolean;
  /** Set the focus-loss checkbox to the stored value without firing a change. */
  setPauseOnFocusLoss(enabled: boolean): void;
  /** Reflect the stored graphics quality in the toggle without firing a change. */
  setQuality(quality: GraphicsQuality): void;
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

function requireToggle(root: HTMLElement, name: string): HTMLInputElement {
  const element = root.querySelector(
    `input[type="checkbox"][data-settings-toggle="${name}"]`,
  );
  if (!(element instanceof HTMLInputElement)) {
    throw new Error(
      `Wegolite: the settings panel is missing its "${name}" toggle.`,
    );
  }
  return element;
}

export function createSettingsPanel(
  options: SettingsPanelOptions,
): SettingsPanel {
  const {
    root,
    onBack,
    onControls,
    onReset,
    onPauseOnFocusLossChange,
    onQualityChange,
  } = options;
  const controls = requireButton(root, "controls");
  const reset = requireButton(root, "reset");
  const back = requireButton(root, "back");
  const pauseToggle = requireToggle(root, "pauseOnFocusLoss");
  const qualityToggle = requireToggle(root, "highQuality");
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
  qualityToggle.addEventListener(
    "change",
    () => {
      onQualityChange(qualityToggle.checked ? "high" : "standard");
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
    setQuality(quality: GraphicsQuality): void {
      qualityToggle.checked = quality === "high";
    },
    dispose(): void {
      controller.abort();
    },
  };
}

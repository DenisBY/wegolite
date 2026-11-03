// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The title screen (D-09).
 *
 * A minimal DOM start screen: one Start control and the product name. The
 * screen carries no Frontier/Oolite mark (the footer keeps the disclaimer). The
 * scene behind it is empty until plan 03 adds the title scene.
 */

export interface TitleScreen {
  show(): void;
  hide(): void;
  onStart(handler: () => void): void;
  dispose(): void;
}

function requireStartButton(root: HTMLElement): HTMLButtonElement {
  const element = root.querySelector("#title-start");
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error('Wegolite: the title screen is missing "#title-start".');
  }
  return element;
}

export function createTitleScreen(root: HTMLElement): TitleScreen {
  const start = requireStartButton(root);
  const controller = new AbortController();

  return {
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
    },
    onStart(handler: () => void): void {
      start.addEventListener(
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

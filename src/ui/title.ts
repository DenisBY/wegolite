// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The title screen (D-09, D-14).
 *
 * A minimal DOM start screen: New game, and Continue only when a validated save
 * exists. Every string is static markup; this module writes no text, so there is
 * no markup-injection surface. D-09 of Phase 3 (a start screen leading straight
 * to the dock) is extended, not replaced: `#title-start` keeps its id and means
 * New game.
 */

export interface TitleScreen {
  show(): void;
  hide(): void;
  onStart(handler: () => void): void;
  onContinue(handler: () => void): void;
  /** Show the Continue control only for a save this build validated. */
  setContinueVisible(visible: boolean): void;
  dispose(): void;
}

function requireButton(root: HTMLElement, id: string): HTMLButtonElement {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Wegolite: the title screen is missing "#${id}".`);
  }
  return element;
}

export function createTitleScreen(root: HTMLElement): TitleScreen {
  const start = requireButton(root, "title-start");
  const resume = requireButton(root, "title-continue");
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
    onContinue(handler: () => void): void {
      resume.addEventListener(
        "click",
        () => {
          handler();
        },
        { signal: controller.signal },
      );
    },
    setContinueVisible(visible: boolean): void {
      resume.hidden = !visible;
    },
    dispose(): void {
      controller.abort();
    },
  };
}

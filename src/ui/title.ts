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
 *
 * G-04-3: New game discards the only committed save, so a click asks first when
 * boot found a clearable blob. The confirmation is a static `alertdialog`
 * overlay owned by this module; the destructive path itself stays in
 * `session.start()`, which still awaits a committed clear.
 */

import type { SaveStatus } from "../persistence/store.js";

/**
 * Whether New game must ask before it deletes the committed save.
 *
 * Mirrors `GameSession.canClear`: a `corrupt` v1-shaped blob is eligible because
 * boot already copied it aside, while `future`, `unreadable` and `unavailable`
 * are never cleared — prompting for those would advertise a deletion that never
 * happens. `absent` has nothing to protect, so a fresh boot starts immediately.
 */
export function shouldConfirmNewGame(status: SaveStatus): boolean {
  return status === "valid" || status === "corrupt";
}

export interface TitleScreen {
  show(): void;
  hide(): void;
  onStart(handler: () => void): void;
  onContinue(handler: () => void): void;
  /** Show the Continue control only for a save this build validated. */
  setContinueVisible(visible: boolean): void;
  /** Gate New game behind the confirmation overlay for a clearable save. */
  setNewGameConfirmationRequired(required: boolean): void;
  dispose(): void;
}

function requireButton(root: HTMLElement, id: string): HTMLButtonElement {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(`Wegolite: the title screen is missing "#${id}".`);
  }
  return element;
}

function requireOverlay(root: HTMLElement, id: string): HTMLElement {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the title screen is missing "#${id}".`);
  }
  return element;
}

export function createTitleScreen(root: HTMLElement): TitleScreen {
  const start = requireButton(root, "title-start");
  const resume = requireButton(root, "title-continue");
  const confirm = requireOverlay(root, "title-confirm");
  const cancel = requireButton(confirm, "title-confirm-cancel");
  const accept = requireButton(confirm, "title-confirm-accept");
  const controller = new AbortController();
  let requiresConfirmation = false;
  let confirming = false;
  let startHandler: (() => void) | undefined;

  function focusables(): HTMLElement[] {
    return Array.from(
      confirm.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.closest("[hidden]") === null &&
        !element.hasAttribute("disabled"),
    );
  }

  function openConfirmation(): void {
    confirming = true;
    confirm.hidden = false;
    // The safe action takes focus, so a stray Enter cannot delete the save.
    cancel.focus();
  }

  function closeConfirmation(restoreFocus: boolean): void {
    if (!confirming) return;
    confirming = false;
    confirm.hidden = true;
    if (restoreFocus) start.focus();
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!confirming) return;
    if (event.code === "Escape") {
      event.preventDefault();
      closeConfirmation(true);
      return;
    }
    if (event.code !== "Tab") return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !confirm.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last || !confirm.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  window.addEventListener("keydown", onKeyDown, { signal: controller.signal });

  start.addEventListener(
    "click",
    () => {
      if (requiresConfirmation) {
        if (!confirming) openConfirmation();
        return;
      }
      startHandler?.();
    },
    { signal: controller.signal },
  );

  cancel.addEventListener(
    "click",
    () => {
      closeConfirmation(true);
    },
    { signal: controller.signal },
  );

  accept.addEventListener(
    "click",
    () => {
      confirming = false;
      confirm.hidden = true;
      startHandler?.();
    },
    { signal: controller.signal },
  );

  return {
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
    },
    onStart(handler: () => void): void {
      startHandler = handler;
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
    setNewGameConfirmationRequired(required: boolean): void {
      requiresConfirmation = required;
    },
    dispose(): void {
      controller.abort();
    },
  };
}

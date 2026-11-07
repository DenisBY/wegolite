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
  /**
   * Show one line of app-owned status text in the overlay (QUAL-05 recovery
   * notice). An empty string hides the line.
   */
  setNotice(text: string): void;
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
  let open = false;
  let noticeElement: HTMLParagraphElement | undefined;

  function notice(): HTMLParagraphElement {
    if (noticeElement !== undefined) return noticeElement;
    const element = document.createElement("p");
    element.setAttribute("data-pause-notice", "");
    element.setAttribute("role", "status");
    const host = root.querySelector("section.pause-menu") ?? root;
    host.appendChild(element);
    noticeElement = element;
    return element;
  }

  function focusables(): HTMLElement[] {
    return Array.from(
      root.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.closest("[hidden]") === null &&
        !element.hasAttribute("disabled"),
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!open || event.code !== "Tab") return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !root.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last || !root.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  window.addEventListener("keydown", onKeyDown, { signal: controller.signal });

  resume.addEventListener("click", onResume, { signal: controller.signal });
  controls.addEventListener("click", onControls, { signal: controller.signal });
  settings.addEventListener("click", onSettings, { signal: controller.signal });

  return {
    show(): void {
      open = true;
      root.hidden = false;
      resume.focus();
    },
    hide(): void {
      open = false;
      root.hidden = true;
      gameRoot.focus();
    },
    isOpen(): boolean {
      return !root.hidden;
    },
    setNotice(text: string): void {
      const element = notice();
      element.textContent = text;
      element.hidden = text === "";
    },
    dispose(): void {
      controller.abort();
      noticeElement?.remove();
      noticeElement = undefined;
    },
  };
}

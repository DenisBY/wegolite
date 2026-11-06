// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The Controls panel (D-12, FLGT-06, T-3-14).
 *
 * Every Phase 3 action is listed with its current codes and one Rebind control.
 * Capture mode listens on `window` in the capture phase and stops propagation,
 * so the game's own key listener never sees the key being assigned. Escape
 * cancels, Backspace/Delete clears, browser-reserved keys are rejected with a
 * message, and a conflicting code names the action that already owns it without
 * silently unbinding that action.
 *
 * All copy is written with `textContent`; no persisted or user-supplied string
 * is ever parsed as HTML.
 */

import {
  ACTION_IDS,
  ACTION_LABELS,
  DEFAULT_BINDINGS,
} from "../input/actions.js";
import type { ActionId } from "../input/actions.js";
import {
  bindAction,
  chordLabel,
  labelFor,
  resetBindings,
  unbindAction,
} from "../input/bindings.js";
import type { BindingMap } from "../input/bindings.js";

/** Keys the browser reserves; capturing them would break reload/fullscreen. */
const RESERVED_CODES: ReadonlySet<string> = new Set([
  "F3",
  "F5",
  "F7",
  "F8",
  "F11",
  "F12",
  "Tab",
]);

/**
 * Modifier-only keys cannot be a binding. Control is deliberately excluded
 * because it is the researched default for the `precision` action.
 */
const MODIFIER_ONLY_CODES: ReadonlySet<string> = new Set([
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "OSLeft",
  "OSRight",
  "CapsLock",
  "NumLock",
  "ScrollLock",
]);

export interface ControlsPanelOptions {
  readonly root: HTMLElement;
  readonly onChange: (bindings: BindingMap) => void;
  readonly onReset: () => void;
  readonly onBack: () => void;
}

export interface ControlsPanel {
  show(): void;
  hide(): void;
  isOpen(): boolean;
  isCapturing(): boolean;
  /** Re-render the rows after a settings-level reset changed the map. */
  refresh(): void;
  dispose(): void;
}

function requireElement<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  description: string,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(`Wegolite: the controls panel is missing ${description}.`);
  }
  return element as T;
}

export function createControlsPanel(
  bindings: BindingMap,
  options: ControlsPanelOptions,
): ControlsPanel {
  const { root, onChange, onReset, onBack } = options;
  const list = requireElement<HTMLElement>(
    root,
    "#controls-list",
    'the "#controls-list" element',
  );
  const status = requireElement<HTMLElement>(
    root,
    "#controls-status",
    'the "#controls-status" element',
  );
  const resetButton = requireElement<HTMLButtonElement>(
    root,
    '[data-controls-action="reset"]',
    "its Reset control",
  );
  const backButton = requireElement<HTMLButtonElement>(
    root,
    '[data-controls-action="back"]',
    "its Back control",
  );

  const controller = new AbortController();
  let capturing: ActionId | undefined;
  let captureController: AbortController | undefined;

  function setStatus(message: string): void {
    status.textContent = message;
  }

  function stopCapture(): void {
    captureController?.abort();
    captureController = undefined;
    capturing = undefined;
    delete document.body.dataset.capture;
  }

  function startCapture(action: ActionId): void {
    stopCapture();
    capturing = action;
    document.body.dataset.capture = action;
    setStatus(
      `Press a key for ${ACTION_LABELS[action]} — Esc cancels, Backspace clears.`,
    );
    const next = new AbortController();
    captureController = next;
    window.addEventListener("keydown", onCaptureKeyDown, {
      capture: true,
      signal: next.signal,
    });
  }

  function onCaptureKeyDown(event: KeyboardEvent): void {
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    const action = capturing;
    if (action === undefined) return;
    const code = event.code;

    if (code === "Escape") {
      setStatus("Rebind cancelled.");
      stopCapture();
      return;
    }
    if (code === "Backspace" || code === "Delete") {
      unbindAction(bindings, action);
      render();
      onChange(bindings);
      setStatus(`${ACTION_LABELS[action]} cleared.`);
      stopCapture();
      return;
    }
    if (MODIFIER_ONLY_CODES.has(code)) {
      setStatus("Modifier-only keys cannot be bound; press another key.");
      return;
    }
    if (RESERVED_CODES.has(code)) {
      setStatus(`${code} is reserved by the browser; choose another key.`);
      return;
    }

    const result = bindAction(bindings, action, code);
    if (!result.ok) {
      setStatus(
        `Already bound to ${ACTION_LABELS[result.conflict]}. Choose another key or clear that action first.`,
      );
      return;
    }
    render();
    onChange(bindings);
    setStatus(`${ACTION_LABELS[action]} bound to ${chordLabel(action, code)}.`);
    stopCapture();
  }

  function render(): void {
    list.replaceChildren();
    for (const action of ACTION_IDS) {
      // A station action with no current binding and no default (the shift
      // variants) is not a row: `(unbound)` would advertise a key that never
      // existed.
      if (
        (bindings[action] ?? []).length === 0 &&
        DEFAULT_BINDINGS[action].length === 0
      ) {
        continue;
      }
      const row = document.createElement("div");
      row.className = "controls-row";

      const label = document.createElement("span");
      label.className = "controls-label";
      label.textContent = ACTION_LABELS[action];

      const codes = document.createElement("span");
      codes.className = "controls-codes";
      codes.textContent = labelFor(bindings, action);

      const rebind = document.createElement("button");
      rebind.type = "button";
      rebind.dataset.rebind = action;
      rebind.textContent = "Rebind";

      row.append(label, codes, rebind);
      list.append(row);
    }
  }

  list.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest("button[data-rebind]");
      if (!(button instanceof HTMLButtonElement)) return;
      const action = button.dataset.rebind;
      if (action === undefined) return;
      if (!(ACTION_IDS as readonly string[]).includes(action)) return;
      startCapture(action as ActionId);
    },
    { signal: controller.signal },
  );

  resetButton.addEventListener(
    "click",
    () => {
      resetBindings(bindings);
      render();
      onReset();
      setStatus("Defaults restored.");
    },
    { signal: controller.signal },
  );

  backButton.addEventListener("click", onBack, { signal: controller.signal });

  render();

  return {
    show(): void {
      root.hidden = false;
      const first = list.querySelector("button");
      if (first instanceof HTMLButtonElement) first.focus();
    },
    hide(): void {
      stopCapture();
      root.hidden = true;
    },
    isOpen(): boolean {
      return !root.hidden;
    },
    isCapturing(): boolean {
      return capturing !== undefined;
    },
    refresh(): void {
      render();
    },
    dispose(): void {
      stopCapture();
      controller.abort();
    },
  };
}

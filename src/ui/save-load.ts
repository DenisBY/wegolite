// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The F2 Save/Load screen (D-20..D-23).
 *
 * A standalone full-screen sibling of `#docked`, never a station-computer
 * section and never the pause menu. It owns only the overlay chrome, the row
 * highlight and the overwrite confirmation; the session owns the save
 * semantics, the input context and the in-session load.
 *
 * Every dynamic string goes through `textContent`. The screen reuses the
 * station header/footer language but its footer is a `div`: the document keeps
 * exactly one `<footer>` element.
 *
 * The overwrite confirmation copies `title.ts`: a static `alertdialog`, the
 * safe action (`Cancel`) takes focus so a stray Enter cannot replace the only
 * save, Escape is handled by the session's `saveScreenReturn` action (it
 * cancels the dialog while it is open), and Tab is trapped inside the panel.
 */

/** The three rows of the screen, in display order. */
export type SaveRow = "save" | "load" | "return";

const ROWS: readonly SaveRow[] = ["save", "load", "return"];

export interface SaveLoadScreen {
  /** Show the overlay with the current slot line and focus its section. */
  show(slot: string): void;
  hide(): void;
  isOpen(): boolean;
  setSlot(text: string): void;
  setNotice(text: string): void;
  /** Move the highlighted row; wraps in display order. */
  moveSelection(delta: number): SaveRow;
  selection(): SaveRow;
  /** Activate the highlighted row, invoking its handler; returns the row. */
  activate(): SaveRow;
  /** Show the overwrite dialog and focus the safe action. */
  confirmOverwrite(): void;
  /** Hide the overwrite dialog without writing. */
  cancelOverwrite(): void;
  isConfirming(): boolean;
  onSave(handler: () => void): void;
  onLoad(handler: () => void): void;
  onReturn(handler: () => void): void;
  /** The overwrite dialog's accept action (Y/Enter while confirming). */
  onOverwriteConfirmed(handler: () => void): void;
  dispose(): void;
}

function requireElement<T extends HTMLElement>(
  root: HTMLElement,
  selector: string,
  description: string,
): T {
  const element = root.querySelector(selector);
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      `Wegolite: the save/load screen is missing ${description}.`,
    );
  }
  return element as T;
}

function requireButton(root: HTMLElement, id: string): HTMLButtonElement {
  const element = root.querySelector(`#${id}`);
  if (!(element instanceof HTMLButtonElement)) {
    throw new Error(
      `Wegolite: the save/load screen is missing its "#${id}" control.`,
    );
  }
  return element;
}

const KEY_HINTS =
  "Up/Down select · Enter/Y confirm · N cancel · S save · L load · Esc return";

export function createSaveLoadScreen(root: HTMLElement): SaveLoadScreen {
  const overlay = requireElement<HTMLElement>(
    root,
    "#save-load",
    'the "#save-load" overlay',
  );
  const section = requireElement<HTMLElement>(
    overlay,
    "#save-load-screen",
    'the "#save-load-screen" section',
  );
  const slotField = requireElement<HTMLElement>(
    overlay,
    '[data-field="save-load-slot"]',
    "the slot line",
  );
  const noticeField = requireElement<HTMLElement>(
    overlay,
    '[data-field="save-load-notice"]',
    "the notice line",
  );
  const keysField = requireElement<HTMLElement>(
    overlay,
    '[data-field="save-load-keys"]',
    "the key hints",
  );
  const confirmField = requireElement<HTMLElement>(
    overlay,
    '[data-field="save-load-confirm"]',
    "the confirmation line",
  );
  const dialog = requireElement<HTMLElement>(
    overlay,
    "#save-load-confirm",
    "the overwrite dialog",
  );
  const cancelButton = requireButton(overlay, "save-load-confirm-cancel");
  const acceptButton = requireButton(overlay, "save-load-confirm-accept");
  const rows = new Map<SaveRow, HTMLElement>();
  for (const row of ROWS) {
    rows.set(
      row,
      requireElement<HTMLElement>(
        overlay,
        `[data-save-action="${row}"]`,
        `the "${row}" row`,
      ),
    );
  }

  const controller = new AbortController();
  let open = false;
  let confirming = false;
  let selected: SaveRow = "save";
  let saveHandler: (() => void) | undefined;
  let loadHandler: (() => void) | undefined;
  let returnHandler: (() => void) | undefined;
  let overwriteHandler: (() => void) | undefined;

  keysField.textContent = KEY_HINTS;

  function applySelection(): void {
    for (const row of ROWS) {
      const element = rows.get(row);
      if (element !== undefined) {
        element.dataset["selected"] = String(row === selected);
      }
    }
  }

  function handlerFor(row: SaveRow): (() => void) | undefined {
    if (row === "save") return saveHandler;
    if (row === "load") return loadHandler;
    return returnHandler;
  }

  function activateRow(row: SaveRow): void {
    selected = row;
    applySelection();
    handlerFor(row)?.();
  }

  function focusables(): HTMLElement[] {
    return Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    ).filter(
      (element) =>
        element.closest("[hidden]") === null &&
        !element.hasAttribute("disabled"),
    );
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (!open || !confirming || event.code !== "Tab") return;
    const items = focusables();
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (event.shiftKey) {
      if (active === first || !dialog.contains(active)) {
        event.preventDefault();
        last.focus();
      }
      return;
    }
    if (active === last || !dialog.contains(active)) {
      event.preventDefault();
      first.focus();
    }
  }

  window.addEventListener("keydown", onKeyDown, { signal: controller.signal });

  overlay.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const row = target.closest<HTMLElement>("[data-save-action]");
      if (row === null) return;
      const action = row.dataset["saveAction"];
      if (action === "save" || action === "load" || action === "return") {
        activateRow(action);
      }
    },
    { signal: controller.signal },
  );

  cancelButton.addEventListener(
    "click",
    () => {
      // Deliberately does not invoke the session: Cancel is a pure close.
      confirming = false;
      dialog.hidden = true;
      section.focus({ preventScroll: true });
    },
    { signal: controller.signal },
  );

  acceptButton.addEventListener(
    "click",
    () => {
      confirming = false;
      dialog.hidden = true;
      overwriteHandler?.();
    },
    { signal: controller.signal },
  );

  function setConfirming(next: boolean): void {
    confirming = next;
    dialog.hidden = !next;
    confirmField.textContent = next ? "Overwrite the autosave? [Y/N]" : "";
  }

  return {
    show(slot: string): void {
      open = true;
      selected = "save";
      applySelection();
      slotField.textContent = slot;
      noticeField.textContent = "";
      setConfirming(false);
      overlay.hidden = false;
      section.focus({ preventScroll: true });
    },
    hide(): void {
      open = false;
      setConfirming(false);
      overlay.hidden = true;
    },
    isOpen(): boolean {
      return open;
    },
    setSlot(text: string): void {
      slotField.textContent = text;
    },
    setNotice(text: string): void {
      noticeField.textContent = text;
    },
    moveSelection(delta: number): SaveRow {
      const index = ROWS.indexOf(selected);
      const next = ROWS[(index + delta + ROWS.length) % ROWS.length];
      selected = next ?? "save";
      applySelection();
      return selected;
    },
    selection(): SaveRow {
      return selected;
    },
    activate(): SaveRow {
      activateRow(selected);
      return selected;
    },
    confirmOverwrite(): void {
      setConfirming(true);
      // The safe action takes focus, so a stray Enter cannot overwrite.
      cancelButton.focus();
    },
    cancelOverwrite(): void {
      if (!confirming) return;
      setConfirming(false);
      section.focus({ preventScroll: true });
    },
    isConfirming(): boolean {
      return confirming;
    },
    onSave(handler: () => void): void {
      saveHandler = handler;
    },
    onLoad(handler: () => void): void {
      loadHandler = handler;
    },
    onReturn(handler: () => void): void {
      returnHandler = handler;
    },
    onOverwriteConfirmed(handler: () => void): void {
      overwriteHandler = handler;
    },
    dispose(): void {
      controller.abort();
    },
  };
}

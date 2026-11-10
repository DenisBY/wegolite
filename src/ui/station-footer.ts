// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared two-line station footer (quick task 261110-fnh).
 *
 * One inert `<template id="station-footer-template">` in `index.html` is cloned
 * into each of `#docked`, `#chart` and `#save-load` by `createStationFooter`.
 * The footer always renders exactly two lines: a dim key-hint line first and a
 * single amber/status line second. Neither line is ever hidden, so the footer
 * reserves the same height whether the status is empty or carries a
 * confirmation, and showing a prompt can never reflow the screen above it.
 *
 * Status parts are independent and merged, never replaced wholesale: a failed
 * autosave writes only the `save` part, so a pending `[Y/N]` in `confirm` stays
 * visible until the player answers. The visible line is chosen by
 * `resolveFooterStatus` in the strict order `confirm > notice > save > info`.
 *
 * This module is import-safe in the Node-only Vitest environment: `document` is
 * touched inside `createStationFooter` only, never at module scope.
 */

/** The four independent status writers, highest priority first. */
export type FooterStatusTone = "confirm" | "notice" | "save" | "info";

/** Independent status parts; an omitted part is left untouched by `setStatus`. */
export type FooterStatusParts = Partial<Record<FooterStatusTone, string>>;

/** The strict render priority: the first non-empty part wins. */
export const FOOTER_STATUS_PRIORITY: readonly FooterStatusTone[] =
  Object.freeze(["confirm", "notice", "save", "info"]);

export interface FooterStatus {
  readonly text: string;
  readonly tone: FooterStatusTone | "";
}

/** One mounted footer: two lines, two writers, one disposer. */
export interface StationFooter {
  readonly element: HTMLElement;
  setHints(text: string): void;
  setStatus(parts: FooterStatusParts): void;
  dispose(): void;
}

/**
 * Resolve the visible status line. The first part with non-whitespace text
 * wins; its original text (untrimmed) is shown so `[Y/N]` prompts keep their
 * exact spacing. Empty or whitespace-only parts count as absent.
 */
export function resolveFooterStatus(parts: FooterStatusParts): FooterStatus {
  for (const tone of FOOTER_STATUS_PRIORITY) {
    const text = parts[tone];
    if (text !== undefined && text.trim().length > 0) {
      return { text, tone };
    }
  }
  return { text: "", tone: "" };
}

/**
 * Clone the shared footer template into `host` and return its API.
 *
 * The template is looked up inside the function, never at module scope, so the
 * pure resolver can be imported by the Node-only unit test. A missing or
 * malformed template is a boot error: every station surface must get the same
 * two-line footer.
 */
export function createStationFooter(host: HTMLElement): StationFooter {
  const template = document.getElementById("station-footer-template");
  if (!(template instanceof HTMLTemplateElement)) {
    throw new Error(
      "Wegolite: the station footer template is missing or malformed.",
    );
  }
  const fragment = template.content.cloneNode(true) as DocumentFragment;
  const element = fragment.querySelector<HTMLElement>("[data-station-footer]");
  const hints = element?.querySelector<HTMLElement>(
    '[data-footer-role="hints"]',
  );
  const status = element?.querySelector<HTMLElement>(
    '[data-footer-role="status"]',
  );
  if (element === null || hints == null || status == null) {
    throw new Error(
      "Wegolite: the station footer template is missing or malformed.",
    );
  }

  host.append(element);

  const parts: FooterStatusParts = {};
  let disposed = false;

  return {
    element,
    setHints(text: string): void {
      if (hints.textContent !== text) hints.textContent = text;
    },
    setStatus(next: FooterStatusParts): void {
      // Merge: a provided string (including "") replaces that part; an omitted
      // key leaves the previous part alone.
      for (const tone of FOOTER_STATUS_PRIORITY) {
        const value = next[tone];
        if (value !== undefined) parts[tone] = value;
      }
      const resolved = resolveFooterStatus(parts);
      if (status.textContent !== resolved.text) {
        status.textContent = resolved.text;
      }
      if ((status.dataset.statusTone ?? "") !== resolved.tone) {
        status.dataset.statusTone = resolved.tone;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      element.remove();
    },
  };
}

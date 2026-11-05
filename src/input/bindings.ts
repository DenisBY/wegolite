// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The mutable semantic action → `KeyboardEvent.code` map (D-12, FLGT-06/07).
 *
 * The map is the single place a key becomes an action. It stores `code` values,
 * never `key`, so a layout change cannot silently break a binding. Every map is
 * created with a null prototype: a `__proto__` key in a tampered settings blob
 * must never reach `Object.prototype`.
 *
 * `bindAction` **replaces** the action's table with the captured code. That is
 * the rebinding contract: the old key stops acting. The four-code cap is the
 * resource bound for a loaded table (`DEFAULT_BINDINGS` already uses two codes
 * for pause, launch and precision).
 */

import {
  ACTION_IDS,
  DEFAULT_BINDINGS,
  SHIFT_REQUIRED_ACTIONS,
} from "./actions.js";
import type { ActionId } from "./actions.js";

/** The most codes one action may hold (research § Step 7). */
export const MAX_CODES_PER_ACTION = 4;

/** The longest `KeyboardEvent.code` accepted from a persisted blob. */
export const MAX_CODE_LENGTH = 64;

/** A complete action table. Created with `Object.create(null)`. */
export type BindingMap = Record<ActionId, string[]>;

export type BindResult = { ok: true } | { ok: false; conflict: ActionId };

/** Copy at most four distinct non-empty codes, preserving order. */
export function capCodes(codes: readonly string[]): string[] {
  const capped: string[] = [];
  for (const code of codes) {
    if (typeof code !== "string") continue;
    if (code.length === 0 || code.length > MAX_CODE_LENGTH) continue;
    if (capped.includes(code)) continue;
    capped.push(code);
    if (capped.length === MAX_CODES_PER_ACTION) break;
  }
  return capped;
}

/**
 * Build a fresh null-prototype map. An action present in `source` keeps its
 * value — including an explicit empty array, which means "unbound" and must not
 * be refilled with the default. A missing action takes the default.
 */
export function createBindingMap(
  source?: Partial<Record<ActionId, readonly string[]>>,
): BindingMap {
  const map = Object.create(null) as unknown as BindingMap;
  for (const action of ACTION_IDS) {
    const codes = source?.[action];
    map[action] = capCodes(codes ?? DEFAULT_BINDINGS[action]);
  }
  return map;
}

/** The action already holding `code`, or `undefined` when it is free. */
export function detectConflict(
  map: BindingMap,
  action: ActionId,
  code: string,
): ActionId | undefined {
  for (const other of ACTION_IDS) {
    if (other === action) continue;
    if ((map[other] ?? []).includes(code)) return other;
  }
  return undefined;
}

/**
 * Bind `code` as the action's sole code. A code already bound to another action
 * is rejected with that action named; the other action is never silently
 * unbound. Invalid codes are a programmer error (the capture UI only passes a
 * `KeyboardEvent.code`) and leave the map unchanged.
 */
export function bindAction(
  map: BindingMap,
  action: ActionId,
  code: string,
): BindResult {
  if (code.length === 0 || code.length > MAX_CODE_LENGTH) return { ok: true };
  const conflict = detectConflict(map, action, code);
  if (conflict !== undefined) return { ok: false, conflict };
  map[action] = [code];
  return { ok: true };
}

/**
 * Remove one code from an action, or every code when `code` is omitted.
 * Returns whether the table changed.
 */
export function unbindAction(
  map: BindingMap,
  action: ActionId,
  code?: string,
): boolean {
  const codes = map[action] ?? [];
  if (code === undefined) {
    const hadCodes = codes.length > 0;
    map[action] = [];
    return hadCodes;
  }
  const index = codes.indexOf(code);
  if (index === -1) return false;
  map[action] = codes.filter((candidate) => candidate !== code);
  return true;
}

/** Restore every action to its researched default, in place. */
export function resetBindings(map: BindingMap): void {
  for (const action of ACTION_IDS) {
    map[action] = [...DEFAULT_BINDINGS[action]];
  }
}

const CODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  ArrowUp: "Up arrow",
  ArrowDown: "Down arrow",
  ArrowLeft: "Left arrow",
  ArrowRight: "Right arrow",
  Backslash: "\\",
  Escape: "Esc",
  Space: "Space",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  ControlLeft: "Left Ctrl",
  ControlRight: "Right Ctrl",
  ShiftLeft: "Left Shift",
  ShiftRight: "Right Shift",
  AltLeft: "Left Alt",
  AltRight: "Right Alt",
  MetaLeft: "Left Meta",
  MetaRight: "Right Meta",
  F1: "F1",
  F5: "F5",
  F11: "F11",
  F12: "F12",
});

/** A display label for one `KeyboardEvent.code`. */
export function codeLabel(code: string): string {
  if (code.startsWith("Key") && code.length === 4) return code.slice(3);
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  if (code.startsWith("Numpad") && code.length === 7) {
    return `Num ${code.slice(6)}`;
  }
  return CODE_LABELS[code] ?? code;
}

/**
 * A display label for one bound code, with the chord added when the action
 * requires Shift. The stored code stays plain; only this projection shows the
 * modifier, so a rebind to `KeyK` renders as `Shift+K`.
 */
export function chordLabel(action: ActionId, code: string): string {
  return SHIFT_REQUIRED_ACTIONS.has(action)
    ? `Shift+${codeLabel(code)}`
    : codeLabel(code);
}

/** The current codes for an action, e.g. `"Right arrow"` or `"P / Esc"`. */
export function labelFor(map: BindingMap, action: ActionId): string {
  const codes = map[action] ?? [];
  if (codes.length === 0) return "(unbound)";
  return codes.map((code) => chordLabel(action, code)).join(" / ");
}

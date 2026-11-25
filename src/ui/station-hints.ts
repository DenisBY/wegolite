// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Live key-hint text for the shared station footer (quick task 261110-fnh).
 *
 * Every key label is derived from the binding map at render time, so a rebind
 * changes the footer without a reload. There is no second key table here: the
 * single-code actions use `primaryKeyLabel`, and the two multi-code actions
 * (`stationConfirm`, `stationPageNext`) render every bound code joined with
 * `/`, which keeps the exact substring `Tab/PageDown next page`.
 *
 * The strings are compact on purpose: the footer line must fit 1280x720 and is
 * ellipsised rather than wrapped. `Shift max` stays literal because Shift is a
 * modifier, not a bindable action. An unbound action renders `(unbound)`.
 * The market line's mouse parts (`/Click select`, `Double-click sell all/buy
 * max`) are literal for the same reason: the mouse is not bindable. The
 * market line lists Left before Right, in the keys' left-to-right order
 * (owner request 2026-11-25). Oolite's market shows no legend at all (FIDELITY
 * row of quick 261125-ewd).
 *
 * No DOM and no Three.js: Vitest drives this module directly.
 */

import type { ActionId } from "../input/actions.js";
import { codeLabel } from "../input/bindings.js";
import type { StationScreen } from "./station.js";
import { primaryKeyLabel } from "./station-tabs.js";
import type { BindingLookup } from "./station-tabs.js";

/** `Up arrow` -> `Up`; other labels are unchanged. */
function compactCodeLabel(code: string): string {
  return codeLabel(code).replace(/ arrow$/, "");
}

/** The first bound code, compacted; `(unbound)` when the action has none. */
function primaryOrUnbound(bindings: BindingLookup, action: ActionId): string {
  const label = primaryKeyLabel(bindings, action);
  return label === undefined ? "(unbound)" : label.replace(/ arrow$/, "");
}

/** Every bound code, compacted and joined with `/`; `(unbound)` when empty. */
function allCodesLabel(bindings: BindingLookup, action: ActionId): string {
  const codes = bindings[action];
  if (codes.length === 0) return "(unbound)";
  return codes.map(compactCodeLabel).join("/");
}

function pairLabel(
  bindings: BindingLookup,
  first: ActionId,
  second: ActionId,
): string {
  return `${primaryOrUnbound(bindings, first)}/${primaryOrUnbound(bindings, second)}`;
}

/**
 * Hints for the five docked station screens.
 *
 * `page` is the Status page (Status 1, Manifest 2); it is ignored on every
 * other screen. The status line names what the next F5 press opens
 * (`F5 manifest`, `F5 status`), a Wegolite addition that Oolite does not have:
 * Oolite switches to the Manifest on the second press with no on-screen hint
 * (owner decision 2026-11-24, recorded in FIDELITY.md and PROJECT.md Key
 * Decisions).
 */
export function dockedHints(
  bindings: BindingLookup,
  screen: StationScreen,
  page: 1 | 2 = 1,
): string {
  const upDown = pairLabel(bindings, "stationUp", "stationDown");
  const pause = primaryOrUnbound(bindings, "pause");
  if (screen === "market") {
    return [
      `${upDown}/Click select`,
      "Double-click sell all/buy max",
      `${primaryOrUnbound(bindings, "stationLeft")} sells +1`,
      `${primaryOrUnbound(bindings, "stationRight")} buys +1`,
      "Shift max",
      `${allCodesLabel(bindings, "stationConfirm")} confirm`,
      `${primaryOrUnbound(bindings, "stationCancel")} cancel`,
      `${primaryOrUnbound(bindings, "stationBack")} back`,
      `${pause} pause`,
    ].join(" · ");
  }
  if (screen === "outfitting") {
    return [
      `${upDown} select`,
      `${allCodesLabel(bindings, "stationConfirm")} confirm`,
      `${primaryOrUnbound(bindings, "stationCancel")} cancel`,
      `${primaryOrUnbound(bindings, "stationBack")} back`,
      `${pause} pause`,
    ].join(" · ");
  }
  if (screen === "status") {
    return [
      `${allCodesLabel(bindings, "stationPageNext")} next page`,
      `${primaryOrUnbound(bindings, "stationPagePrevious")} previous`,
      `${primaryOrUnbound(bindings, "stationStatus")} ${page === 2 ? "status" : "manifest"}`,
      `${primaryOrUnbound(bindings, "stationBack")} back`,
      `${pause} pause`,
    ].join(" · ");
  }
  if (screen === "interfaces") {
    return [
      `${primaryOrUnbound(bindings, "stationBack")} back`,
      `${pause} pause`,
    ].join(" · ");
  }
  return [
    `${primaryOrUnbound(bindings, "launch")} launch`,
    `${pause} pause`,
  ].join(" · ");
}

/** Hints for the F6 galactic chart, where the footer is the only key legend. */
export function chartHints(bindings: BindingLookup): string {
  return [
    "Click: select",
    `${pairLabel(bindings, "chartUp", "chartDown")}/${primaryOrUnbound(bindings, "chartLeft")}/${primaryOrUnbound(bindings, "chartRight")}: next`,
    `${primaryOrUnbound(bindings, "chartRange")}: preset`,
    `${primaryOrUnbound(bindings, "chartFind")}: find`,
    `${primaryOrUnbound(bindings, "chartConfirm")}: commit`,
    `${primaryOrUnbound(bindings, "chartBack")}: close`,
  ].join(" · ");
}

/** Hints for the F2 Save/Load screen. */
export function saveLoadHints(bindings: BindingLookup): string {
  return [
    `${pairLabel(bindings, "saveScreenUp", "saveScreenDown")} select`,
    `${primaryOrUnbound(bindings, "saveScreenActivate")} activate`,
    `${primaryOrUnbound(bindings, "saveScreenConfirm")} confirm`,
    `${primaryOrUnbound(bindings, "saveScreenCancel")} cancel`,
    `${primaryOrUnbound(bindings, "saveScreenSave")} save`,
    `${primaryOrUnbound(bindings, "saveScreenLoad")} load`,
    `${primaryOrUnbound(bindings, "saveScreenReturn")} return`,
  ].join(" · ");
}

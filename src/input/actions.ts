// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The semantic action map (D-12, FLGT-07).
 *
 * Bindings store `KeyboardEvent.code` values, not `key`, so a layout change does
 * not silently break a binding. Plan 06 adds the mutable map, conflict detection
 * and the reset/capture UI; this module is the frozen default table both the
 * keyboard source and the rebinding screen read.
 */

export type ActionId =
  | "pitchForward"
  | "pitchBack"
  | "rollLeft"
  | "rollRight"
  | "speedUp"
  | "speedDown"
  | "torus"
  | "pause"
  | "launch"
  | "dockingComputer"
  | "targetStation"
  | "compassCycle"
  | "precision"
  | "stationMarket"
  | "stationOutfitting"
  | "stationStatus"
  | "stationSystemData"
  | "stationBack"
  | "stationUp"
  | "stationDown"
  | "stationLeft"
  | "stationRight"
  | "stationConfirm"
  | "stationCancel"
  | "stationPageNext"
  | "stationPagePrevious"
  | "stationSellMax"
  | "stationBuyMax"
  | "chart"
  | "hyperspace"
  | "chartUp"
  | "chartDown"
  | "chartLeft"
  | "chartRight"
  | "chartConfirm"
  | "chartRange"
  | "chartBack"
  | "saveLoad"
  | "saveScreenUp"
  | "saveScreenDown"
  | "saveScreenSave"
  | "saveScreenLoad"
  | "saveScreenReturn"
  | "saveScreenActivate"
  | "saveScreenConfirm"
  | "saveScreenCancel";

/** The input modes that decide which actions may fire (ECON-09, D-03). */
export type InputContext =
  "flight" | "dockHome" | "dockScreen" | "chart" | "saveScreen";

/**
 * The contexts whose Escape is a screen Back action rather than pause
 * (RESEARCH Pitfall 12). `dockHome` deliberately stays out: Escape there still
 * toggles pause, exactly as before the chart existed.
 */
export const ESCAPE_SCREEN_CONTEXTS: ReadonlySet<InputContext> =
  new Set<InputContext>(["dockScreen", "chart", "saveScreen"]);

/**
 * The actions those contexts bind to Escape. The binding table's exemption is
 * keyed on the action pair, so a later screen action joins this set instead of
 * changing the rule.
 */
export const ESCAPE_SCREEN_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  "stationBack",
  "chartBack",
  "saveScreenReturn",
]);

export const ACTION_IDS: readonly ActionId[] = [
  "pitchForward",
  "pitchBack",
  "rollLeft",
  "rollRight",
  "speedUp",
  "speedDown",
  "torus",
  "pause",
  "launch",
  "dockingComputer",
  "targetStation",
  "compassCycle",
  "precision",
  "stationMarket",
  "stationOutfitting",
  "stationStatus",
  "stationSystemData",
  "stationBack",
  "stationUp",
  "stationDown",
  "stationLeft",
  "stationRight",
  "stationConfirm",
  "stationCancel",
  "stationPageNext",
  "stationPagePrevious",
  "stationSellMax",
  "stationBuyMax",
  "chart",
  "hyperspace",
  "chartUp",
  "chartDown",
  "chartLeft",
  "chartRight",
  "chartConfirm",
  "chartRange",
  "chartBack",
  "saveLoad",
  "saveScreenUp",
  "saveScreenDown",
  "saveScreenSave",
  "saveScreenLoad",
  "saveScreenReturn",
  // Activate sits before Confirm on purpose: when persisted settings still
  // carry Enter on the old confirm binding, the later entry (Confirm) loses
  // Enter in createBindingMap, so Enter always follows the focused control.
  "saveScreenActivate",
  "saveScreenConfirm",
  "saveScreenCancel",
];

const ACTION_ID_SET: ReadonlySet<string> = new Set(ACTION_IDS);

/** Narrow a persisted or DOM string to the action allowlist. */
export function isActionId(value: string): value is ActionId {
  return ACTION_ID_SET.has(value);
}

/**
 * The Oolite keyboard defaults, projected onto semantic actions. Arrow-up noses
 * down (Oolite convention), W/S change speed, J toggles the torus.
 */
export const DEFAULT_BINDINGS: Readonly<Record<ActionId, readonly string[]>> =
  Object.freeze({
    pitchForward: Object.freeze(["ArrowUp"]),
    pitchBack: Object.freeze(["ArrowDown"]),
    rollLeft: Object.freeze(["ArrowLeft"]),
    rollRight: Object.freeze(["ArrowRight"]),
    speedUp: Object.freeze(["KeyW"]),
    speedDown: Object.freeze(["KeyS"]),
    torus: Object.freeze(["KeyJ"]),
    pause: Object.freeze(["KeyP", "Escape"]),
    launch: Object.freeze(["Digit1", "F1"]),
    dockingComputer: Object.freeze(["KeyC"]),
    targetStation: Object.freeze(["KeyR"]),
    compassCycle: Object.freeze(["Backslash"]),
    precision: Object.freeze(["ControlLeft", "ControlRight"]),
    stationMarket: Object.freeze(["F8", "Digit8"]),
    stationOutfitting: Object.freeze(["F3", "Digit3"]),
    stationStatus: Object.freeze(["F5", "Digit5"]),
    stationSystemData: Object.freeze(["F7", "Digit7"]),
    stationBack: Object.freeze(["Escape", "Backspace"]),
    stationUp: Object.freeze(["ArrowUp"]),
    stationDown: Object.freeze(["ArrowDown"]),
    stationLeft: Object.freeze(["ArrowLeft"]),
    stationRight: Object.freeze(["ArrowRight"]),
    stationConfirm: Object.freeze(["Enter", "KeyY"]),
    stationCancel: Object.freeze(["KeyN"]),
    stationPageNext: Object.freeze(["Tab", "PageDown"]),
    stationPagePrevious: Object.freeze(["PageUp"]),
    // Shift variants are actions, not extra codes: their bindings are empty
    // because Plain+Shift resolves to them through SHIFT_VARIANT_ACTIONS.
    stationSellMax: Object.freeze([]),
    stationBuyMax: Object.freeze([]),
    chart: Object.freeze(["F6"]),
    hyperspace: Object.freeze(["KeyH"]),
    chartUp: Object.freeze(["ArrowUp"]),
    chartDown: Object.freeze(["ArrowDown"]),
    chartLeft: Object.freeze(["ArrowLeft"]),
    chartRight: Object.freeze(["ArrowRight"]),
    chartConfirm: Object.freeze(["Enter"]),
    chartRange: Object.freeze(["Tab"]),
    chartBack: Object.freeze(["Escape"]),
    // F2 opens the standalone Save/Load screen; only while docked.
    saveLoad: Object.freeze(["F2"]),
    saveScreenUp: Object.freeze(["ArrowUp"]),
    saveScreenDown: Object.freeze(["ArrowDown"]),
    // Direct shortcuts beside the row navigation: S saves, L loads.
    saveScreenSave: Object.freeze(["KeyS"]),
    saveScreenLoad: Object.freeze(["KeyL"]),
    saveScreenReturn: Object.freeze(["Escape"]),
    // Enter activates the focused control (Cancel cancels, Accept confirms);
    // Y is the direct confirm and never depends on focus.
    saveScreenActivate: Object.freeze(["Enter"]),
    saveScreenConfirm: Object.freeze(["KeyY"]),
    saveScreenCancel: Object.freeze(["KeyN"]),
  });

export const ACTION_LABELS: Readonly<Record<ActionId, string>> = Object.freeze({
  pitchForward: "Pitch forward",
  pitchBack: "Pitch back",
  rollLeft: "Roll left",
  rollRight: "Roll right",
  speedUp: "Increase speed",
  speedDown: "Decrease speed",
  torus: "Torus drive",
  pause: "Pause",
  launch: "Launch",
  dockingComputer: "Docking computer",
  targetStation: "Target station",
  compassCycle: "Cycle compass",
  precision: "Precision",
  stationMarket: "Market",
  stationOutfitting: "Outfitting",
  stationStatus: "Status",
  stationSystemData: "System data",
  stationBack: "Back",
  stationUp: "Up",
  stationDown: "Down",
  stationLeft: "Left",
  stationRight: "Right",
  stationConfirm: "Confirm",
  stationCancel: "Cancel",
  stationPageNext: "Next page",
  stationPagePrevious: "Previous page",
  stationSellMax: "Sell maximum",
  stationBuyMax: "Buy maximum",
  chart: "Galactic chart",
  hyperspace: "Hyperspace",
  chartUp: "Chart up",
  chartDown: "Chart down",
  chartLeft: "Chart left",
  chartRight: "Chart right",
  chartConfirm: "Chart commit",
  chartRange: "Chart range",
  chartBack: "Chart close",
  saveLoad: "Save / load",
  saveScreenUp: "Save/load up",
  saveScreenDown: "Save/load down",
  saveScreenSave: "Save",
  saveScreenLoad: "Load",
  saveScreenReturn: "Return",
  saveScreenActivate: "Save/load activate",
  saveScreenConfirm: "Save/load confirm",
  saveScreenCancel: "Save/load cancel",
});

/**
 * The actions Oolite requires Shift for. `dockingComputer` is Oolite's fast
 * autopilot (`n_key_autodock`, `C`); plain `C` is the ordinary autopilot, which
 * this build does not have.
 *
 * This is action metadata, not keyboard state: the input resolver enforces it
 * and the display layer renders the chord from it. Bindings still store plain
 * `KeyboardEvent.code` values (D-11, T-04-18).
 */
export const SHIFT_REQUIRED_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  "dockingComputer",
]);

/**
 * The station actions whose Shift chord is a *different* action rather than a
 * modifier on the same one. Shift+Right plans the maximum buy; Shift+Left is
 * the (wave-2) maximum sell. Bindings stay plain codes; the resolver owns the
 * mapping.
 */
export const SHIFT_VARIANT_ACTIONS: Readonly<
  Partial<Record<ActionId, ActionId>>
> = Object.freeze({
  stationLeft: "stationSellMax",
  stationRight: "stationBuyMax",
});

/** F-keys the browser would otherwise reload or open on. */
export const RESERVED_F_KEYS: ReadonlySet<string> = new Set([
  "F2",
  "F3",
  "F5",
  "F6",
  "F7",
  "F8",
]);

/**
 * Which contexts each action may fire in (ECON-09, D-03).
 *
 * `pause` is universal; `launch` is live in flight (the sim gates it on the
 * docked mode) and on the home screen; every section action is `dockScreen`
 * only, so Enter on the home Launch button and a number key inside a section
 * can never launch the ship.
 */
function contexts(...values: InputContext[]): readonly InputContext[] {
  return Object.freeze(values);
}

export const ACTION_CONTEXTS: Readonly<
  Record<ActionId, readonly InputContext[]>
> = Object.freeze({
  pitchForward: contexts("flight"),
  pitchBack: contexts("flight"),
  rollLeft: contexts("flight"),
  rollRight: contexts("flight"),
  speedUp: contexts("flight"),
  speedDown: contexts("flight"),
  torus: contexts("flight"),
  pause: contexts("flight", "dockHome", "dockScreen", "chart", "saveScreen"),
  launch: contexts("flight", "dockHome"),
  dockingComputer: contexts("flight"),
  targetStation: contexts("flight"),
  compassCycle: contexts("flight"),
  precision: contexts("flight"),
  chart: contexts("flight", "dockHome", "dockScreen", "chart"),
  hyperspace: contexts("flight"),
  chartUp: contexts("chart"),
  chartDown: contexts("chart"),
  chartLeft: contexts("chart"),
  chartRight: contexts("chart"),
  chartConfirm: contexts("chart"),
  chartRange: contexts("chart"),
  chartBack: contexts("chart"),
  // F2 is docked-only: never in flight, never over the chart.
  saveLoad: contexts("dockHome", "dockScreen"),
  saveScreenUp: contexts("saveScreen"),
  saveScreenDown: contexts("saveScreen"),
  saveScreenSave: contexts("saveScreen"),
  saveScreenLoad: contexts("saveScreen"),
  saveScreenReturn: contexts("saveScreen"),
  saveScreenActivate: contexts("saveScreen"),
  saveScreenConfirm: contexts("saveScreen"),
  saveScreenCancel: contexts("saveScreen"),
  stationMarket: contexts("dockHome", "dockScreen"),
  stationOutfitting: contexts("dockHome", "dockScreen"),
  stationStatus: contexts("dockHome", "dockScreen"),
  stationSystemData: contexts("dockHome", "dockScreen"),
  stationBack: contexts("dockScreen"),
  stationUp: contexts("dockScreen"),
  stationDown: contexts("dockScreen"),
  stationLeft: contexts("dockScreen"),
  stationRight: contexts("dockScreen"),
  stationConfirm: contexts("dockScreen"),
  stationCancel: contexts("dockScreen"),
  stationPageNext: contexts("dockScreen"),
  stationPagePrevious: contexts("dockScreen"),
  stationSellMax: contexts("dockScreen"),
  stationBuyMax: contexts("dockScreen"),
});

/** The four actions that open a station section synchronously. */
export const STATION_SCREEN_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  "stationMarket",
  "stationOutfitting",
  "stationStatus",
  "stationSystemData",
]);

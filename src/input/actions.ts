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
  | "stationInterfaces"
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
  | "viewFore"
  | "viewAft"
  | "viewPort"
  | "viewStarboard"
  | "fire"
  | "ident"
  | "untarget"
  | "eject"
  | "chartUp"
  | "chartDown"
  | "chartLeft"
  | "chartRight"
  | "chartConfirm"
  | "chartRange"
  | "chartBack"
  | "chartFind"
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
  | "flight"
  | "dockHome"
  | "dockScreen"
  | "chart"
  | "saveScreen"
  // The game-over view (D-07): no action lists this context, so every binding
  // is inert and the browser-reserved F1 to F8 are swallowed (handled, nothing
  // fires, F5 included). Space and the click belong to the overlay itself.
  | "gameOver";

/**
 * The contexts whose Escape is a screen Back action rather than pause
 * (RESEARCH Pitfall 12). The default table no longer binds Escape to pause
 * (INPUT-01), so this rule now matters only for a stored blob that still does:
 * there Escape in these contexts stays Back. `dockHome` deliberately stays out
 * (it has no Back action).
 */
export const ESCAPE_SCREEN_CONTEXTS: ReadonlySet<InputContext> =
  new Set<InputContext>(["dockScreen", "chart", "saveScreen"]);

/**
 * The actions those contexts bind to Escape. The binding table's exemption is
 * keyed on the action pair (a stored pause-on-Escape blob against a screen
 * Back), so a later screen action joins this set instead of changing the rule.
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
  "stationInterfaces",
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
  // The combat and view keys sit directly after the existing flight actions,
  // so a stored custom binding of an older action wins a shared code in
  // createBindingMap (the later entry loses it).
  "viewFore",
  "viewAft",
  "viewPort",
  "viewStarboard",
  "fire",
  "ident",
  "untarget",
  "eject",
  "chartUp",
  "chartDown",
  "chartLeft",
  "chartRight",
  "chartConfirm",
  "chartRange",
  "chartBack",
  "chartFind",
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
    // INPUT-01: P alone pauses. Escape is Back in the screens and eject in flight.
    pause: Object.freeze(["KeyP"]),
    launch: Object.freeze(["Digit1", "F1"]),
    dockingComputer: Object.freeze(["KeyC"]),
    // R is ident now; the station target moved to Q, the one letter the Oolite
    // default block never binds.
    targetStation: Object.freeze(["KeyQ"]),
    compassCycle: Object.freeze(["Backslash"]),
    precision: Object.freeze(["ControlLeft", "ControlRight"]),
    stationMarket: Object.freeze(["F8", "Digit8"]),
    stationOutfitting: Object.freeze(["F3", "Digit3"]),
    stationStatus: Object.freeze(["F5", "Digit5"]),
    // Digit4 is Oolite's own alias for the interfaces screen.
    stationInterfaces: Object.freeze(["F4", "Digit4"]),
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
    // Digit6 is Oolite's alias for F6 (`key_gui_chart_screens`,
    // keyconfig2.plist:74-78); no flight action uses it, so it opens the chart
    // in flight too.
    chart: Object.freeze(["F6", "Digit6"]),
    hyperspace: Object.freeze(["KeyH"]),
    // Oolite's four view keys (key_forward_view .. key_starboard_view); in
    // flight only, so Digit1/F1 stay Launch on the docked home screen.
    viewFore: Object.freeze(["Digit1", "F1"]),
    viewAft: Object.freeze(["Digit2", "F2"]),
    viewPort: Object.freeze(["Digit3", "F3"]),
    viewStarboard: Object.freeze(["Digit4", "F4"]),
    fire: Object.freeze(["KeyA"]),
    ident: Object.freeze(["KeyR"]),
    untarget: Object.freeze(["KeyU"]),
    eject: Object.freeze(["Escape"]),
    chartUp: Object.freeze(["ArrowUp"]),
    chartDown: Object.freeze(["ArrowDown"]),
    chartLeft: Object.freeze(["ArrowLeft"]),
    chartRight: Object.freeze(["ArrowRight"]),
    chartConfirm: Object.freeze(["Enter"]),
    chartRange: Object.freeze(["Tab"]),
    chartBack: Object.freeze(["Escape"]),
    // Find planet (quick task 261118-cyo): `/` focuses the chart's search box.
    // Letters cannot start a search, because P pauses and others may be
    // rebound into the chart context.
    chartFind: Object.freeze(["Slash"]),
    // F2 opens the standalone Save/Load screen; only while docked. Digit2 is
    // Oolite's alias (`key_gui_screen_options`, keyconfig2.plist:52-56); in
    // flight Digit2 stays the aft view, because the contexts are disjoint.
    saveLoad: Object.freeze(["F2", "Digit2"]),
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
  stationInterfaces: "Interfaces",
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
  viewFore: "Fore view",
  viewAft: "Aft view",
  viewPort: "Port view",
  viewStarboard: "Starboard view",
  fire: "Fire laser",
  ident: "Ident",
  untarget: "Untarget",
  eject: "Eject (double press)",
  chartUp: "Chart up",
  chartDown: "Chart down",
  chartLeft: "Chart left",
  chartRight: "Chart right",
  chartConfirm: "Chart commit",
  chartRange: "Chart preset",
  chartBack: "Chart close",
  chartFind: "Find planet",
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

/**
 * F-keys the browser would otherwise reload or open on. F1 (the browser help
 * key) and F4 are included because the station tab strip advertises F1 Launch
 * and F4 Interfaces on every docked screen, so neither may ever act on the
 * browser while docked. No test exercises the real browser help-page behaviour;
 * only the cancellation of the (synthetic) event is proven.
 */
export const RESERVED_F_KEYS: ReadonlySet<string> = new Set([
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
]);

/**
 * Which contexts each action may fire in (ECON-09, D-03).
 *
 * `pause` is universal; `launch` is live on the home screen only (the number
 * keys are view keys in flight, and the in-flight launch skip is
 * `skipLaunch`, not `launch`); every section action is `dockScreen` only, so
 * Enter on the home Launch button and a number key inside a section can never
 * launch the ship.
 *
 * The docked screen keys (F2 Save/Load, F3 Outfitting, F4 Interfaces, F5
 * Status, F6 Chart, F8 Market) and their digit aliases 2, 3, 4, 5, 6 and 8
 * (keyconfig2.plist:52-88) are live on every docked screen, the chart and
 * the F2 screen included: Oolite polls them on every docked GUI screen
 * (`pollDockedControls` calls `pollGuiScreenControls`,
 * `PlayerEntityControls.m:4157-4165` at the pin 7437f22). F2 is the one
 * exception on its own screen, where Oolite ignores it (`gui_screen !=
 * GUI_SCREEN_OPTIONS`).
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
  launch: contexts("dockHome"),
  dockingComputer: contexts("flight"),
  targetStation: contexts("flight"),
  compassCycle: contexts("flight"),
  precision: contexts("flight"),
  chart: contexts("flight", "dockHome", "dockScreen", "chart", "saveScreen"),
  hyperspace: contexts("flight"),
  viewFore: contexts("flight"),
  viewAft: contexts("flight"),
  viewPort: contexts("flight"),
  viewStarboard: contexts("flight"),
  fire: contexts("flight"),
  ident: contexts("flight"),
  untarget: contexts("flight"),
  eject: contexts("flight"),
  chartUp: contexts("chart"),
  chartDown: contexts("chart"),
  chartLeft: contexts("chart"),
  chartRight: contexts("chart"),
  chartConfirm: contexts("chart"),
  chartRange: contexts("chart"),
  chartBack: contexts("chart"),
  chartFind: contexts("chart"),
  // F2 is docked-only: never in flight, and inert on its own screen. Over the
  // chart it is live; the session ignores it there in flight.
  saveLoad: contexts("dockHome", "dockScreen", "chart"),
  saveScreenUp: contexts("saveScreen"),
  saveScreenDown: contexts("saveScreen"),
  saveScreenSave: contexts("saveScreen"),
  saveScreenLoad: contexts("saveScreen"),
  saveScreenReturn: contexts("saveScreen"),
  saveScreenActivate: contexts("saveScreen"),
  saveScreenConfirm: contexts("saveScreen"),
  saveScreenCancel: contexts("saveScreen"),
  stationMarket: contexts("dockHome", "dockScreen", "chart", "saveScreen"),
  stationOutfitting: contexts("dockHome", "dockScreen", "chart", "saveScreen"),
  stationStatus: contexts("dockHome", "dockScreen", "chart", "saveScreen"),
  stationInterfaces: contexts("dockHome", "dockScreen", "chart", "saveScreen"),
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
  "stationInterfaces",
]);

/**
 * The six docked screen keys the tab strip advertises: the four section keys
 * plus F2 Save/Load and F6 Chart. Outside the flight context the input layer
 * hands each one to the session's synchronous sink, which closes an open
 * overlay and opens the target inside the key event, so presses apply in
 * order. In flight the chart key keeps its queued open path.
 */
export const STATION_NAV_ACTIONS: ReadonlySet<ActionId> = new Set<ActionId>([
  ...STATION_SCREEN_ACTIONS,
  "saveLoad",
  "chart",
]);

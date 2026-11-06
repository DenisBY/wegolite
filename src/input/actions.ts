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
  | "stationBuyMax";

/** The input modes that decide which actions may fire (ECON-09, D-03). */
export type InputContext = "flight" | "dockHome" | "dockScreen";

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
  "F3",
  "F5",
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
  pause: contexts("flight", "dockHome", "dockScreen"),
  launch: contexts("flight", "dockHome"),
  dockingComputer: contexts("flight"),
  targetStation: contexts("flight"),
  compassCycle: contexts("flight"),
  precision: contexts("flight"),
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

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
  | "targetStation"
  | "compassCycle"
  | "precision";

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
  "targetStation",
  "compassCycle",
  "precision",
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
    targetStation: Object.freeze(["KeyR"]),
    compassCycle: Object.freeze(["Backslash"]),
    precision: Object.freeze(["ControlLeft", "ControlRight"]),
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
  targetStation: "Target station",
  compassCycle: "Cycle compass",
  precision: "Precision",
});

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The command boundary (D-09, FLGT-07, Pattern 4).
 *
 * UI and input enqueue tagged values; the simulation applies them at a tick
 * boundary. No UI code mutates `FlightState`, and no sim code imports
 * `input/`, `render/` or `ui/` — the union is plain data so both sides can name
 * it without a class or a method.
 */

export type Command =
  | { kind: "launch" }
  | { kind: "skipLaunch" }
  | { kind: "toggleTorus" }
  | { kind: "setPaused"; paused: boolean }
  | { kind: "cycleCompass" }
  | { kind: "targetStation" }
  /**
   * D-11/D-12: Shift+C. Deliberately payload-free — equipment ownership travels
   * through `StepOptions.equipment`, so a shared command object can never carry
   * a forged `installed` flag (T-04-46).
   */
  | { kind: "dockingComputer" };

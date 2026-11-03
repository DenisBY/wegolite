// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * First-use hints on the message line only (D-11, FLGT-05).
 *
 * D-11 forbids a modal tutorial and a permanent controls overlay. The app maps
 * simulation state to one short message at a time; the HUD (or the docked
 * panel, while docked) prints it. Each hint is enqueued once, uses the *current*
 * binding label rather than a hard-coded key (D-12), and is marked seen only
 * after its action is first used — that is what dismisses it.
 *
 * `HintId` is owned by `src/settings/schema.ts`; this module imports the union
 * and never redeclares it.
 */

import { labelFor } from "../input/bindings.js";
import type { BindingMap } from "../input/bindings.js";
import { HINT_IDS } from "../settings/schema.js";
import type { HintId } from "../settings/schema.js";
import type { FlightMode } from "../sim/flight/state.js";

/** The state slice a hint decision may read. */
export interface HintContext {
  readonly mode: FlightMode;
  readonly massLocked: boolean;
  readonly torusEngaged: boolean;
  /** -1, 0 or 1 from this frame's speed axis. */
  readonly speedInput: number;
  /** Whether pitch or roll is held this frame. */
  readonly pitchRollInput: boolean;
}

export interface HintController {
  /**
   * Return the one message to show now, or `null`. Marks a hint announced so
   * the same hint is never enqueued twice, and marks a hint seen when its
   * action has been used.
   */
  maybeShow(context: HintContext): string | null;
  /** Mark a hint dismissed (its action was used). */
  markSeen(id: HintId): void;
  isSeen(id: HintId): boolean;
  readonly seen: readonly HintId[];
}

export interface HintOptions {
  readonly bindings: BindingMap;
  /** Hints already dismissed, from the persisted settings blob. */
  readonly seen?: readonly HintId[];
  /** Called once per newly dismissed hint so the session can persist it. */
  readonly onSeen?: (id: HintId) => void;
}

/** The message for one hint, using the live binding labels. */
export function hintText(id: HintId, bindings: BindingMap): string {
  switch (id) {
    case "launch":
      return `Press ${labelFor(bindings, "launch")} to launch`;
    case "torus":
      return `Torus drive: press ${labelFor(bindings, "torus")} to engage`;
    case "torusDisengage":
      return `Torus engaged — press ${labelFor(bindings, "torus")} or any control to disengage`;
    case "speed":
      return `Press ${labelFor(bindings, "speedUp")} / ${labelFor(bindings, "speedDown")} to change speed`;
    case "pitchRoll":
      return `${labelFor(bindings, "pitchForward")} / ${labelFor(bindings, "pitchBack")} pitch, ${labelFor(bindings, "rollLeft")} / ${labelFor(bindings, "rollRight")} roll`;
  }
}

export function createHintController(options: HintOptions): HintController {
  const { bindings, onSeen } = options;
  const seen = new Set<HintId>();
  for (const id of options.seen ?? []) {
    if (HINT_IDS.includes(id)) seen.add(id);
  }
  const announced = new Set<HintId>();
  let wasEngaged = false;

  function markSeen(id: HintId): void {
    if (seen.has(id)) return;
    seen.add(id);
    onSeen?.(id);
  }

  function take(id: HintId): string | null {
    if (seen.has(id) || announced.has(id)) return null;
    announced.add(id);
    return hintText(id, bindings);
  }

  return {
    maybeShow(context: HintContext): string | null {
      // First successful use dismisses the hint.
      if (context.mode !== "docked") markSeen("launch");
      if (context.mode === "inFlight") {
        if (context.speedInput !== 0) markSeen("speed");
        if (context.pitchRollInput) markSeen("pitchRoll");
        if (context.torusEngaged) markSeen("torus");
      }
      // Leaving torus after an engagement is the "disengage" use.
      if (wasEngaged && !context.torusEngaged) markSeen("torusDisengage");
      wasEngaged = context.torusEngaged;

      if (context.mode === "docked") return take("launch");
      if (context.mode !== "inFlight") return null;

      // Torus teaching only once the ship is clear of mass lock: a hint to
      // press `j` inside the station lock would be wrong.
      if (!context.massLocked) {
        const torus = take("torus");
        if (torus !== null) return torus;
      }
      if (context.torusEngaged) {
        const disengage = take("torusDisengage");
        if (disengage !== null) return disengage;
      }
      const speed = take("speed");
      if (speed !== null) return speed;
      return take("pitchRoll");
    },
    markSeen,
    isSeen(id: HintId): boolean {
      return seen.has(id);
    },
    get seen(): readonly HintId[] {
      return [...seen];
    },
  };
}

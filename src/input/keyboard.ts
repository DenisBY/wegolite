// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The keyboard input source (FLGT-07, D-12, D-15, Pitfall 9).
 *
 * Held codes become dimensionless axes; edge actions become tagged `Command`
 * values exactly once per non-repeat keydown. The frame type is the sim-owned
 * `InputFrame` — `src/input` imports it, `src/sim` never imports this module,
 * and no second frame shape exists.
 *
 * Focus loss is the classic stuck-key bug: browsers do not guarantee a `keyup`
 * after blur, so every held code is cleared on blur, visibility loss and
 * teardown. The app also pauses on the same events (D-15).
 */

import type { Command } from "../sim/commands.js";
import type { InputFrame } from "../sim/state.js";
import { DEFAULT_BINDINGS } from "./actions.js";
import type { ActionId } from "./actions.js";

export interface KeyboardInputSource {
  /** The current frame, sampled once per rendered frame. */
  frame(): InputFrame;
  /** Edge commands since the last drain (launch, torus, compass, targeting). */
  drainCommands(): Command[];
  /** `p`/`Esc` edge; the app owns the paused flag. */
  consumePauseToggle(): boolean;
  /** Release every held key (blur, visibility loss, pause, launch). */
  clearAll(): void;
  dispose(): void;
}

const EDGE_COMMANDS: Readonly<Partial<Record<ActionId, Command>>> = {
  torus: { kind: "toggleTorus" },
  launch: { kind: "launch" },
  compassCycle: { kind: "cycleCompass" },
  targetStation: { kind: "targetStation" },
};

function isTextTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function createKeyboardInputSource(): KeyboardInputSource {
  const held = new Set<string>();
  const pending: Command[] = [];
  let pauseToggle = false;

  const codeToActions = new Map<string, ActionId[]>();
  for (const [action, codes] of Object.entries(DEFAULT_BINDINGS) as [
    ActionId,
    readonly string[],
  ][]) {
    for (const code of codes) {
      const existing = codeToActions.get(code);
      if (existing === undefined) codeToActions.set(code, [action]);
      else existing.push(action);
    }
  }

  const controller = new AbortController();

  function pressed(action: ActionId): boolean {
    return DEFAULT_BINDINGS[action].some((code) => held.has(code));
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (isTextTarget(event.target)) return;
    const actions = codeToActions.get(event.code);
    if (actions === undefined) return;

    // Bound keys must not scroll the page or trigger the browser's own
    // shortcuts; F5/F11/F12 are not bound, so they stay untouched.
    event.preventDefault();

    if (event.repeat) return;
    held.add(event.code);
    for (const action of actions) {
      if (action === "pause") {
        pauseToggle = true;
        continue;
      }
      const command = EDGE_COMMANDS[action];
      if (command !== undefined) pending.push(command);
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    held.delete(event.code);
  }

  function clearAll(): void {
    held.clear();
    pending.length = 0;
    pauseToggle = false;
  }

  function onBlur(): void {
    clearAll();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") clearAll();
  }

  window.addEventListener("keydown", onKeyDown, { signal: controller.signal });
  window.addEventListener("keyup", onKeyUp, { signal: controller.signal });
  window.addEventListener("blur", onBlur, { signal: controller.signal });
  document.addEventListener("visibilitychange", onVisibilityChange, {
    signal: controller.signal,
  });

  return {
    frame(): InputFrame {
      return {
        pitch:
          (pressed("pitchBack") ? 1 : 0) - (pressed("pitchForward") ? 1 : 0),
        roll: (pressed("rollRight") ? 1 : 0) - (pressed("rollLeft") ? 1 : 0),
        speed: (pressed("speedUp") ? 1 : 0) - (pressed("speedDown") ? 1 : 0),
        precision: pressed("precision"),
        // `thrust` stays undefined: it is the Phase 1 probe axis, not flight.
      };
    },
    drainCommands(): Command[] {
      const drained = pending.slice();
      pending.length = 0;
      return drained;
    },
    consumePauseToggle(): boolean {
      const toggled = pauseToggle;
      pauseToggle = false;
      return toggled;
    },
    clearAll,
    dispose(): void {
      controller.abort();
      held.clear();
      pending.length = 0;
    },
  };
}

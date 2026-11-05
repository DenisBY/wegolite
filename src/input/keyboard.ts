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
 * The key→action table is mutable: `setBindings` replaces it after a rebind, so
 * a new key acts immediately and the old key stops. Focus loss is the classic
 * stuck-key bug: browsers do not guarantee a `keyup` after blur, so every held
 * code is cleared on blur, visibility loss, pointer-lock/fullscreen change and
 * teardown. The app also pauses on the same events (D-15).
 *
 * `createInputState` is the DOM-free core: Vitest drives keydown/keyup directly
 * without a browser, and `createKeyboardInputSource` is the thin listener layer.
 */

import type { Command } from "../sim/commands.js";
import type { InputFrame } from "../sim/state.js";
import { ACTION_IDS } from "./actions.js";
import type { ActionId } from "./actions.js";
import { createBindingMap } from "./bindings.js";
import type { BindingMap } from "./bindings.js";

const EDGE_COMMANDS: Readonly<Partial<Record<ActionId, Command>>> = {
  torus: { kind: "toggleTorus" },
  launch: { kind: "launch" },
  dockingComputer: { kind: "dockingComputer" },
  compassCycle: { kind: "cycleCompass" },
  targetStation: { kind: "targetStation" },
};

/**
 * The actions Oolite requires Shift for. `dockingComputer` is Oolite's fast
 * autopilot (`n_key_autodock`, `C`); plain `C` is the ordinary autopilot, which
 * this build does not have. The modifier lives in the keyboard layer only —
 * bindings stay plain `KeyboardEvent.code` values so the rebinding UI is
 * unchanged (D-11, T-04-18).
 */
const REQUIRES_SHIFT: ReadonlySet<ActionId> = new Set<ActionId>([
  "dockingComputer",
]);

/** The modifier state that decides a chord. */
export interface KeyModifiers {
  readonly shift: boolean;
}

function buildCodeToActions(map: BindingMap): Map<string, ActionId[]> {
  const result = new Map<string, ActionId[]>();
  for (const action of ACTION_IDS) {
    for (const code of map[action] ?? []) {
      const existing = result.get(code);
      if (existing === undefined) result.set(code, [action]);
      else existing.push(action);
    }
  }
  return result;
}

/** The DOM-free keyboard state. */
export interface InputState {
  /** Record a keydown; returns whether the code is bound to any action. */
  keyDown(code: string, repeat?: boolean, mods?: KeyModifiers): boolean;
  keyUp(code: string): void;
  frame(): InputFrame;
  drainCommands(): Command[];
  /** `p`/`Esc` edge; the app owns the paused flag. */
  consumePauseToggle(): boolean;
  /** Release every held key (blur, visibility loss, pause, launch). */
  clearAll(): void;
  /** Replace the action table after a rebind. */
  setBindings(bindings: BindingMap): void;
  /** Whether a code is currently bound to any action. */
  isBound(code: string): boolean;
}

export function createInputState(
  bindings: BindingMap = createBindingMap(),
): InputState {
  const held = new Set<string>();
  const pending: Command[] = [];
  let pauseToggle = false;
  let map = bindings;
  let codeToActions = buildCodeToActions(map);

  function pressed(action: ActionId): boolean {
    const codes = map[action] ?? [];
    return codes.some((code) => held.has(code));
  }

  return {
    keyDown(code, repeat = false, mods) {
      const actions = codeToActions.get(code);
      if (actions === undefined) return false;
      if (repeat) return true;

      // A chord is resolved explicitly: when Shift is held and the code owns a
      // shift-required action, only those fire. Otherwise only the ordinary
      // actions fire. A rebind that puts pause on KeyC therefore still gets
      // plain C for pause and Shift+C for docking, with no double queue
      // (T-04-18).
      const shiftRequired = actions.filter((action) =>
        REQUIRES_SHIFT.has(action),
      );
      const useShift = mods?.shift === true && shiftRequired.length > 0;
      const firing = useShift
        ? shiftRequired
        : actions.filter((action) => !REQUIRES_SHIFT.has(action));
      if (!useShift) held.add(code);

      for (const action of firing) {
        if (action === "pause") {
          pauseToggle = true;
          continue;
        }
        const command = EDGE_COMMANDS[action];
        // A fresh object per keydown: the module-level table is never mutated,
        // so a command can never carry state between activations (T-04-46).
        if (command !== undefined) pending.push({ ...command });
      }
      return true;
    },
    keyUp(code) {
      held.delete(code);
    },
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
    drainCommands() {
      const drained = pending.slice();
      pending.length = 0;
      return drained;
    },
    consumePauseToggle() {
      const toggled = pauseToggle;
      pauseToggle = false;
      return toggled;
    },
    clearAll() {
      held.clear();
      pending.length = 0;
      pauseToggle = false;
    },
    setBindings(next) {
      map = next;
      codeToActions = buildCodeToActions(next);
    },
    isBound(code) {
      return codeToActions.has(code);
    },
  };
}

export interface KeyboardInputSource extends InputState {
  /** Install the window/document listeners. Safe to call twice. */
  attach(target?: Window): void;
  /** Remove the listeners without clearing the input state. */
  detach(): void;
  dispose(): void;
}

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

/** A bound modifier code (precision) is allowed; other chords are browser UI. */
const MODIFIER_CODES: ReadonlySet<string> = new Set([
  "ControlLeft",
  "ControlRight",
]);

export function createKeyboardInputSource(
  bindings: BindingMap = createBindingMap(),
): KeyboardInputSource {
  const state = createInputState(bindings);
  let controller = new AbortController();
  let attached = false;

  function onKeyDown(event: KeyboardEvent): void {
    if (isTextTarget(event.target)) return;
    // Ctrl+R, Cmd+W, Alt+Tab and friends belong to the browser. A bound
    // Control key is still allowed on its own (precision), but a chord never
    // becomes game input and its default is never prevented.
    if (
      (event.ctrlKey || event.metaKey || event.altKey) &&
      !MODIFIER_CODES.has(event.code)
    ) {
      return;
    }
    if (state.keyDown(event.code, event.repeat, { shift: event.shiftKey })) {
      event.preventDefault();
    }
  }

  function onKeyUp(event: KeyboardEvent): void {
    state.keyUp(event.code);
  }

  function onBlur(): void {
    state.clearAll();
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === "hidden") state.clearAll();
  }

  function onFocusLoss(): void {
    state.clearAll();
  }

  return {
    ...state,
    attach(target: Window = window): void {
      if (attached) return;
      controller = new AbortController();
      const options: AddEventListenerOptions = { signal: controller.signal };
      target.addEventListener("keydown", onKeyDown, options);
      target.addEventListener("keyup", onKeyUp, options);
      target.addEventListener("blur", onBlur, options);
      document.addEventListener(
        "visibilitychange",
        onVisibilityChange,
        options,
      );
      document.addEventListener("pointerlockchange", onFocusLoss, options);
      document.addEventListener("fullscreenchange", onFocusLoss, options);
      attached = true;
    },
    detach(): void {
      if (!attached) return;
      controller.abort();
      attached = false;
    },
    dispose(): void {
      controller.abort();
      attached = false;
      state.clearAll();
    },
  };
}

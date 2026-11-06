// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The keyboard input source (FLGT-07, ECON-09, D-03, D-12).
 *
 * Held codes become dimensionless axes; edge actions become tagged `Command`
 * values exactly once per non-repeat keydown. The frame type is the sim-owned
 * `InputFrame` — `src/input` imports it, `src/sim` never imports this module,
 * and no second frame shape exists.
 *
 * The key→action table is mutable: `setBindings` replaces it after a rebind, so
 * a new key acts immediately and the old key stops. Every action carries the
 * `InputContext`s it may fire in, and a context change clears held codes and
 * every queue so a flight key cannot leak into the station computer.
 *
 * The action dispatcher stays on the **bubble** phase: the Controls panel's
 * rebind capture stops propagation, so the game listener must not fire first.
 * A separate narrow capture listener only calls `preventDefault()` for the four
 * browser-reserved F-keys; it never dispatches and never stops propagation.
 *
 * `createInputState` is the DOM-free core: Vitest drives keydown/keyup directly
 * without a browser, and `createKeyboardInputSource` is the thin listener layer.
 */

import type { Command } from "../sim/commands.js";
import type { InputFrame } from "../sim/state.js";
import {
  ACTION_CONTEXTS,
  ACTION_IDS,
  RESERVED_F_KEYS,
  SHIFT_REQUIRED_ACTIONS,
  SHIFT_VARIANT_ACTIONS,
  STATION_SCREEN_ACTIONS,
} from "./actions.js";
import type { ActionId, InputContext } from "./actions.js";
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
 * The modifier state that decides a chord.
 *
 * The Shift requirement is shared action metadata in `actions.ts`
 * (`SHIFT_REQUIRED_ACTIONS`), sourced from Oolite's fast autopilot
 * (`n_key_autodock`, `C`); plain `C` is the ordinary autopilot, which this
 * build does not have. Bindings still store plain `KeyboardEvent.code` values,
 * and only the display layer adds the chord through `bindings.chordLabel`
 * (D-11, T-04-18).
 */
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
  /** Station actions queued for the session's drain (ECON-09). */
  drainStationActions(): ActionId[];
  /** Release every held key (blur, visibility loss, pause, launch). */
  clearAll(): void;
  /** Replace the action table after a rebind. */
  setBindings(bindings: BindingMap): void;
  /** Whether a code is currently bound to any action. */
  isBound(code: string): boolean;
  /** Switch mode; clears held codes and both queues synchronously. */
  setContext(context: InputContext): void;
  getContext(): InputContext;
  /** While paused only `pause` resolves; every other code is ignored. */
  setPaused(paused: boolean): void;
  /**
   * Register the synchronous sink for the four screen-open actions. The session
   * opens the section and switches context inside the same key event, so a
   * following same-frame arrow resolves against `dockScreen`.
   */
  setStationScreenHandler(handler: (action: ActionId) => void): void;
}

export function createInputState(
  bindings: BindingMap = createBindingMap(),
): InputState {
  const held = new Set<string>();
  const pending: Command[] = [];
  const stationActions: ActionId[] = [];
  let pauseToggle = false;
  let map = bindings;
  let codeToActions = buildCodeToActions(map);
  let context: InputContext = "flight";
  let paused = false;
  let onStationScreen: ((action: ActionId) => void) | undefined;

  function pressed(action: ActionId): boolean {
    const codes = map[action] ?? [];
    return codes.some((code) => held.has(code));
  }

  function inContext(action: ActionId): boolean {
    return ACTION_CONTEXTS[action]?.includes(context) === true;
  }

  return {
    keyDown(code, repeat = false, mods) {
      const actions = codeToActions.get(code);
      if (actions === undefined) return false;

      // While paused only the pause action resolves. Everything else — Tab,
      // Enter, an arrow — must reach the pause overlay's own focus trap and
      // button activation, so it returns false without preventDefault.
      if (paused) {
        if (!actions.includes("pause")) return false;
        if (!repeat) pauseToggle = true;
        return true;
      }

      const contextual = actions.filter((action) => inContext(action));
      // A browser-reserved F-key is reported handled even when no action is
      // live in this context, so the narrow capture guard and this return agree.
      if (contextual.length === 0) return RESERVED_F_KEYS.has(code);
      if (repeat) return true;

      // A chord is resolved explicitly: when Shift is held and the code owns a
      // shift-required action, only those fire. Otherwise the plain actions
      // fire, or a station shift variant when the code defines one.
      const shiftRequired = contextual.filter((action) =>
        SHIFT_REQUIRED_ACTIONS.has(action),
      );
      const useShift = mods?.shift === true && shiftRequired.length > 0;

      let firing: ActionId[];
      if (useShift) {
        firing = shiftRequired;
      } else if (mods?.shift === true) {
        const variants = contextual
          .map((action) => SHIFT_VARIANT_ACTIONS[action])
          .filter((action): action is ActionId => action !== undefined);
        firing =
          variants.length > 0
            ? variants
            : contextual.filter(
                (action) => !SHIFT_REQUIRED_ACTIONS.has(action),
              );
      } else {
        firing = contextual.filter(
          (action) => !SHIFT_REQUIRED_ACTIONS.has(action),
        );
      }
      if (!useShift) held.add(code);

      for (const action of firing) {
        if (action === "pause") {
          // Escape in a section is Back; the paused branch above owns Escape
          // as Resume. KeyP remains the universal pause key.
          if (context === "dockScreen" && code === "Escape") continue;
          pauseToggle = true;
          continue;
        }
        if (STATION_SCREEN_ACTIONS.has(action)) {
          // Synchronous: the session switches context before this key event
          // returns, so the next same-frame key resolves against the section.
          onStationScreen?.(action);
          continue;
        }
        if (action.startsWith("station")) {
          stationActions.push(action);
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
      // A station screen has no flight axes; a held KeyW must not pitch the
      // ship behind the terminal.
      if (context !== "flight") {
        return { pitch: 0, roll: 0, speed: 0, precision: false };
      }
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
    drainStationActions() {
      const drained = stationActions.slice();
      stationActions.length = 0;
      return drained;
    },
    clearAll() {
      held.clear();
      pending.length = 0;
      stationActions.length = 0;
      pauseToggle = false;
    },
    setBindings(next) {
      map = next;
      codeToActions = buildCodeToActions(next);
    },
    isBound(code) {
      return codeToActions.has(code);
    },
    setContext(next) {
      if (next === context) return;
      context = next;
      // A held flight key or a queued station action must not survive the mode
      // change; the session revalidates each drained action as defence in depth.
      held.clear();
      pending.length = 0;
      stationActions.length = 0;
    },
    getContext() {
      return context;
    },
    setPaused(next) {
      paused = next;
      if (paused) {
        held.clear();
        pending.length = 0;
        stationActions.length = 0;
      }
    },
    setStationScreenHandler(handler) {
      onStationScreen = handler;
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

/**
 * A text field owns every key: rebinding and browser typing must not become
 * game input. The HTMLElement guard keeps the predicate usable in Node tests.
 */
function isTextTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === "undefined") return false;
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

/** The inputs the reserved-key guard reads; the event supplies them. */
export interface ReservedKeyState {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  /** True while the Controls panel is capturing (body.dataset.capture). */
  readonly capturing: boolean;
  readonly textTarget: boolean;
}

/**
 * Whether the capture-phase guard should cancel this key's browser default.
 *
 * Only the four reserved F-keys qualify. A Ctrl/Meta/Alt chord belongs to the
 * browser (Ctrl+F5 is a hard reload), a capture session is rebinding, and a
 * text field is typing; none may be intercepted.
 */
export function shouldCancelReservedKey(state: ReservedKeyState): boolean {
  if (!RESERVED_F_KEYS.has(state.code)) return false;
  if (state.capturing) return false;
  if (state.ctrlKey || state.metaKey || state.altKey) return false;
  if (state.textTarget) return false;
  return true;
}

/** The event shape `cancelReservedKey` needs; a real KeyboardEvent matches. */
export interface ReservedKeyEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly target: EventTarget | null;
  preventDefault(): void;
}

/** Cancel the browser default for a reserved F-key, never dispatching. */
export function cancelReservedKey(
  event: ReservedKeyEvent,
  capturing = false,
): void {
  if (
    shouldCancelReservedKey({
      code: event.code,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      capturing,
      textTarget: isTextTarget(event.target),
    })
  ) {
    event.preventDefault();
  }
}

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

  /**
   * The narrow capture guard. Its only job is the browser default for F3/F5/
   * F7/F8 so a station screen opens instead of reloading or find-on-page. It
   * never calls an action and never stops propagation.
   */
  function onReservedKeyDown(event: KeyboardEvent): void {
    const capturing =
      typeof document !== "undefined" &&
      document.body.dataset.capture !== undefined;
    cancelReservedKey(event, capturing);
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
      target.addEventListener("keydown", onReservedKeyDown, {
        capture: true,
        signal: controller.signal,
      });
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

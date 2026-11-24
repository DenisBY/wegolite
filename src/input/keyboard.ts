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
 * A separate narrow capture listener only calls `preventDefault()` for the eight
 * browser-reserved F-keys (F1, F2, F3, F4, F5, F6, F7, F8); it never dispatches
 * and never stops propagation. Those eight keys are never text input: a
 * focused text field (the chart's Find planet box) keeps every other key, but
 * a docked screen F-key still reaches the game, and no F-key reaches the
 * browser.
 *
 * The docked screen keys (`STATION_NAV_ACTIONS`) are synchronous outside
 * flight, so a following same-frame key resolves against the screen they open.
 * Every other screen key is a queued edge the frame applies later. To keep the
 * order the keys were pressed in, a screen key first asks the session to flush
 * the edges queued earlier in the same frame (`setQueuedEdgeFlush`, quick
 * 261124-pze): S then F3 on the Save/Load screen saves before Outfitting opens.
 * When that flush changes the context (Escape closed the chart), the same code
 * is resolved again against the new context, so Escape then F6 reopens the
 * chart and, on an in-flight chart, Escape then F4 is the starboard view. The
 * second pass cannot flush again: the flush drains every queue and
 * `setContext` clears them, so the recursion is at most one level deep.
 *
 * `createInputState` is the DOM-free core: Vitest drives keydown/keyup directly
 * without a browser, and `createKeyboardInputSource` is the thin listener layer.
 */

import type { Command } from "../sim/commands.js";
import type { InputFrame } from "../sim/state.js";
import {
  ACTION_CONTEXTS,
  ACTION_IDS,
  ESCAPE_SCREEN_CONTEXTS,
  RESERVED_F_KEYS,
  SHIFT_REQUIRED_ACTIONS,
  SHIFT_VARIANT_ACTIONS,
  STATION_NAV_ACTIONS,
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
  // D-06: one payload-free command. The session gives the key its second
  // meaning (abort an active countdown) before the sim sees it.
  hyperspace: { kind: "beginHyperspace" },
  ident: { kind: "ident" },
  untarget: { kind: "untarget" },
  viewFore: { kind: "setView", view: "fore" },
  viewAft: { kind: "setView", view: "aft" },
  viewPort: { kind: "setView", view: "port" },
  viewStarboard: { kind: "setView", view: "starboard" },
  // `fire` is a held frame field and `eject` has no command: Oolite guards the
  // Escape handler on `hasEscapePod` before any double-press tracking
  // (PlayerEntityControls.m, KEY_REPEAT_INTERVAL 0.20), and no escape pod can
  // be bought in this milestone, so a double press does nothing.
};

/**
 * The modifier and source state of a keydown.
 *
 * The Shift requirement is shared action metadata in `actions.ts`
 * (`SHIFT_REQUIRED_ACTIONS`), sourced from Oolite's fast autopilot
 * (`n_key_autodock`, `C`); plain `C` is the ordinary autopilot, which this
 * build does not have. Bindings still store plain `KeyboardEvent.code` values,
 * and only the display layer adds the chord through `bindings.chordLabel`
 * (D-11, T-04-18).
 *
 * `textField` is true when the key came from a focused text field (the
 * chart's Find planet box). Only the docked screen keys (`STATION_NAV_ACTIONS`)
 * may fire from there (quick 261124-pze F11), so a future text field does not
 * inherit any other F-key binding.
 */
export interface KeyModifiers {
  readonly shift: boolean;
  readonly textField?: boolean;
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
  /** Pause-key (P) edge; the app owns the paused flag. */
  consumePauseToggle(): boolean;
  /** Station actions queued for the session's drain (ECON-09). */
  drainStationActions(): ActionId[];
  /** Chart edges (open/close, selection, commit, range, back) for the drain. */
  drainChartActions(): ActionId[];
  /** Save/Load screen edges (open/close, rows, save, load) for the drain. */
  drainSaveScreenActions(): ActionId[];
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
   * Register the synchronous sink for the docked screen keys
   * (`STATION_NAV_ACTIONS`: F2, F3, F4, F5, F6 and F8) in every context but
   * `flight`. The session closes an open overlay, opens the target and
   * switches context inside the same key event, so a following same-frame key
   * resolves against the new screen.
   *
   * Before the sink runs, a registered `setQueuedEdgeFlush` applies the screen
   * edges queued earlier in the same frame. When that flush switched the
   * context, the key is resolved again against the new context instead of
   * reaching the sink (bounded: the flush drains every queue and `setContext`
   * clears them, so the second pass has nothing to flush).
   */
  setStationScreenHandler(handler: (action: ActionId) => void): void;
  /**
   * Register the session's flush of the queued screen edges (chart, Save/Load
   * and docked station edges, quick 261124-pze). It runs before a docked screen
   * key reaches the synchronous sink, and only when one of those queues holds
   * an edge, so an edge pressed earlier in the same frame applies against the
   * screen it was pressed on.
   */
  setQueuedEdgeFlush(flush: () => void): void;
}

export function createInputState(
  bindings: BindingMap = createBindingMap(),
): InputState {
  const held = new Set<string>();
  const pending: Command[] = [];
  const stationActions: ActionId[] = [];
  const chartActions: ActionId[] = [];
  const saveScreenActions: ActionId[] = [];
  let pauseToggle = false;
  let map = bindings;
  let codeToActions = buildCodeToActions(map);
  let context: InputContext = "flight";
  let paused = false;
  let onStationScreen: ((action: ActionId) => void) | undefined;
  let flushQueued: (() => void) | undefined;

  function pressed(action: ActionId): boolean {
    const codes = map[action] ?? [];
    return codes.some((code) => held.has(code));
  }

  function inContext(action: ActionId): boolean {
    return ACTION_CONTEXTS[action]?.includes(context) === true;
  }

  function hasQueuedEdges(): boolean {
    return (
      stationActions.length > 0 ||
      chartActions.length > 0 ||
      saveScreenActions.length > 0
    );
  }

  function keyDown(code: string, repeat = false, mods?: KeyModifiers): boolean {
    // D-07: on the game-over view no action fires. The browser-reserved
    // F1 to F8 are still reported handled (F7 has no binding, F5 and F8 are
    // the ones a reload or browser menu would otherwise take), nothing else.
    if (context === "gameOver") return RESERVED_F_KEYS.has(code);
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

    // From a focused text field only the docked screen keys may fire (quick
    // 261124-pze F11): the Find planet box keeps F2 to F6 and F8, and a future
    // text field does not inherit any other F-key binding.
    const contextual = actions.filter(
      (action) =>
        inContext(action) &&
        (mods?.textField !== true || STATION_NAV_ACTIONS.has(action)),
    );
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
          : contextual.filter((action) => !SHIFT_REQUIRED_ACTIONS.has(action));
    } else {
      firing = contextual.filter(
        (action) => !SHIFT_REQUIRED_ACTIONS.has(action),
      );
    }
    if (!useShift) held.add(code);

    for (const action of firing) {
      if (action === "pause") {
        // The default table no longer binds Escape to pause (INPUT-01). A
        // stored blob that still does keeps Escape as Back in a screen
        // context; the paused branch above owns it as Resume. KeyP remains
        // the universal pause key.
        if (ESCAPE_SCREEN_CONTEXTS.has(context) && code === "Escape") continue;
        pauseToggle = true;
        continue;
      }
      if (STATION_NAV_ACTIONS.has(action) && context !== "flight") {
        // Key order (quick 261124-pze): an edge queued earlier in this
        // frame applies first, against the screen it was pressed on. If
        // that flush switched the context, this key is resolved again
        // against the new one; the queues are empty then, so the second
        // pass never flushes again.
        if (flushQueued !== undefined && hasQueuedEdges()) {
          const before: InputContext = context;
          flushQueued();
          if (getContext() !== before) return keyDown(code, false, mods);
        }
        // Synchronous: the session switches context before this key event
        // returns, so the next same-frame key resolves against the new
        // screen. In flight the chart key keeps its queued open path.
        onStationScreen?.(action);
        continue;
      }
      if (action.startsWith("chart")) {
        chartActions.push(action);
        continue;
      }
      // F2 (`saveLoad`) never lands here: it is live only outside flight, so
      // it always takes the synchronous sink above (quick 261124-pze F3).
      if (action.startsWith("saveScreen")) {
        saveScreenActions.push(action);
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
  }

  function getContext(): InputContext {
    return context;
  }

  return {
    keyDown,
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
        fire: pressed("fire"),
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
    drainChartActions() {
      const drained = chartActions.slice();
      chartActions.length = 0;
      return drained;
    },
    drainSaveScreenActions() {
      const drained = saveScreenActions.slice();
      saveScreenActions.length = 0;
      return drained;
    },
    clearAll() {
      held.clear();
      pending.length = 0;
      stationActions.length = 0;
      chartActions.length = 0;
      saveScreenActions.length = 0;
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
      chartActions.length = 0;
      saveScreenActions.length = 0;
    },
    getContext,
    setPaused(next) {
      paused = next;
      if (paused) {
        held.clear();
        pending.length = 0;
        stationActions.length = 0;
        chartActions.length = 0;
        saveScreenActions.length = 0;
      }
    },
    setStationScreenHandler(handler) {
      onStationScreen = handler;
    },
    setQueuedEdgeFlush(flush) {
      flushQueued = flush;
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
 * A text field owns every key but the reserved F-keys: rebinding and browser
 * typing must not become game input. Of the F-keys, only the docked screen
 * keys (`STATION_NAV_ACTIONS`) may act from a text field (`KeyModifiers`
 * `textField`); any other F-key binding is reported handled and fires nothing
 * there. The HTMLElement guard keeps the predicate usable in Node tests.
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
}

/**
 * Whether the capture-phase guard should cancel this key's browser default.
 *
 * Only the eight reserved F-keys in `RESERVED_F_KEYS` (F1 to F8) qualify. A
 * Ctrl/Meta/Alt chord belongs to the browser (Ctrl+F5 is a hard reload) and a
 * capture session is rebinding; neither may be intercepted. A focused text
 * field does not exempt the key: an F-key types nothing, and from the chart's
 * Find planet box F5 must not reload the page.
 */
export function shouldCancelReservedKey(state: ReservedKeyState): boolean {
  if (!RESERVED_F_KEYS.has(state.code)) return false;
  if (state.capturing) return false;
  if (state.ctrlKey || state.metaKey || state.altKey) return false;
  return true;
}

/** The event shape `cancelReservedKey` needs; a real KeyboardEvent matches. */
export interface ReservedKeyEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
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
    })
  ) {
    event.preventDefault();
  }
}

/** The modifier flags `allowsChordKey` reads; a KeyboardEvent matches. */
export interface ChordKeyEvent {
  readonly code: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
}

/**
 * Whether a keydown may reach the action table.
 *
 * A plain key always may. Ctrl+R, Cmd+W, Alt+Tab and friends belong to the
 * browser, so a Meta or Alt chord never becomes game input. Ctrl is the
 * precision modifier, so in flight a bound key pressed while only Ctrl is held
 * (fire, ident, untarget, a view) still counts: the page owns the keyboard
 * there, and the caller prevents the browser default (Ctrl+A select all,
 * Ctrl+R reload). A bound Control key on its own is always allowed.
 */
export function allowsChordKey(
  event: ChordKeyEvent,
  boundInFlight: boolean,
): boolean {
  if (!event.ctrlKey && !event.metaKey && !event.altKey) return true;
  if (MODIFIER_CODES.has(event.code)) return true;
  return event.ctrlKey && !event.metaKey && !event.altKey && boundInFlight;
}

export function createKeyboardInputSource(
  bindings: BindingMap = createBindingMap(),
): KeyboardInputSource {
  const state = createInputState(bindings);
  let controller = new AbortController();
  let attached = false;

  function onKeyDown(event: KeyboardEvent): void {
    // An F-key types nothing, so a focused text field (the chart's Find planet
    // box) does not keep it from the game (Oolite has no text box there). Only
    // the docked screen keys act from a text field; `keyDown` filters the rest
    // through the `textField` flag (quick 261124-pze F11).
    const textField = isTextTarget(event.target);
    if (textField && !RESERVED_F_KEYS.has(event.code)) return;
    if (
      !allowsChordKey(
        event,
        state.getContext() === "flight" && state.isBound(event.code),
      )
    ) {
      return;
    }
    if (
      state.keyDown(event.code, event.repeat, {
        shift: event.shiftKey,
        textField,
      })
    ) {
      event.preventDefault();
    }
  }

  /**
   * The narrow capture guard. Its only job is the browser default for the
   * reserved F1 to F8 keys so a station screen opens instead of reloading,
   * opening help or find-on-page. It never calls an action and never stops
   * propagation.
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

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The binding map and the DOM-free input core (D-12, FLGT-07).
 *
 * These tests drive `createInputState` directly: no browser, no synthetic
 * `KeyboardEvent`. They pin the contract the app relies on — a rebind replaces
 * the old code, a conflict names the other action, an edge command fires once
 * per non-repeat keydown, and `clearAll` cannot be undone by a late keyup.
 */

import { describe, expect, it } from "vitest";

import {
  ACTION_CONTEXTS,
  ACTION_IDS,
  DEFAULT_BINDINGS,
  RESERVED_F_KEYS,
} from "../../src/input/actions.js";
import {
  MAX_CODES_PER_ACTION,
  bindAction,
  capCodes,
  chordLabel,
  codeLabel,
  createBindingMap,
  detectConflict,
  labelFor,
  resetBindings,
  unbindAction,
} from "../../src/input/bindings.js";
import { createInputState } from "../../src/input/keyboard.js";

describe("createBindingMap", () => {
  it("matches the researched default table", () => {
    const map = createBindingMap();

    for (const [action, codes] of Object.entries(DEFAULT_BINDINGS)) {
      expect(map[action as keyof typeof DEFAULT_BINDINGS]).toEqual([...codes]);
    }
    expect(map.pause).toEqual(["KeyP", "Escape"]);
    expect(map.launch).toEqual(["Digit1", "F1"]);
    expect(map.precision).toEqual(["ControlLeft", "ControlRight"]);
  });

  it("uses a null prototype", () => {
    expect(Object.getPrototypeOf(createBindingMap())).toBeNull();
  });

  it("keeps an explicit empty array instead of refilling the default", () => {
    const map = createBindingMap({ rollRight: [] });

    expect(map.rollRight).toEqual([]);
    expect(map.rollLeft).toEqual(["ArrowLeft"]);
  });
});

describe("bindAction", () => {
  it("replaces the action's old code so the old key stops acting", () => {
    const map = createBindingMap();

    expect(bindAction(map, "rollRight", "KeyL")).toEqual({ ok: true });
    expect(map.rollRight).toEqual(["KeyL"]);
    expect(detectConflict(map, "rollRight", "KeyL")).toBeUndefined();
  });

  it("rejects a code bound to another action and names that action", () => {
    const map = createBindingMap();

    expect(bindAction(map, "rollLeft", "ArrowRight")).toEqual({
      ok: false,
      conflict: "rollRight",
    });
    // The other action is never silently unbound.
    expect(map.rollRight).toEqual(["ArrowRight"]);
    expect(map.rollLeft).toEqual(["ArrowLeft"]);
  });

  it("allows rebinding an action to one of its own codes", () => {
    const map = createBindingMap();

    expect(bindAction(map, "pause", "KeyP")).toEqual({ ok: true });
    expect(map.pause).toEqual(["KeyP"]);
  });
});

describe("unbindAction and resetBindings", () => {
  it("removes one code and leaves the others", () => {
    const map = createBindingMap();

    expect(unbindAction(map, "pause", "Escape")).toBe(true);
    expect(map.pause).toEqual(["KeyP"]);
    expect(unbindAction(map, "pause", "KeyQ")).toBe(false);
  });

  it("clears every code when no code is given", () => {
    const map = createBindingMap();

    expect(unbindAction(map, "pause")).toBe(true);
    expect(map.pause).toEqual([]);
    expect(unbindAction(map, "pause")).toBe(false);
  });

  it("restores the default table", () => {
    const map = createBindingMap();
    bindAction(map, "rollRight", "KeyL");
    unbindAction(map, "torus");

    resetBindings(map);

    expect(map.rollRight).toEqual(["ArrowRight"]);
    expect(map.torus).toEqual(["KeyJ"]);
  });
});

describe("labels and the code cap", () => {
  it("labels codes for the UI and hint text", () => {
    expect(codeLabel("KeyW")).toBe("W");
    expect(codeLabel("Digit1")).toBe("1");
    expect(codeLabel("ArrowRight")).toBe("Right arrow");
    expect(codeLabel("Escape")).toBe("Esc");
    expect(codeLabel("ControlLeft")).toBe("Left Ctrl");
  });

  it("joins every code for an action and marks an unbound one", () => {
    const map = createBindingMap();

    expect(labelFor(map, "pause")).toBe("P / Esc");
    expect(labelFor(map, "rollRight")).toBe("Right arrow");

    unbindAction(map, "rollRight");
    expect(labelFor(map, "rollRight")).toBe("(unbound)");
  });

  it("renders the Shift chord for a shift-required action", () => {
    const map = createBindingMap();

    expect(labelFor(map, "dockingComputer")).toBe("Shift+C");
    // An ordinary action keeps its plain label.
    expect(labelFor(map, "rollRight")).toBe("Right arrow");

    // The chord follows the rebound code, not a fixed default.
    bindAction(map, "dockingComputer", "KeyK");
    expect(chordLabel("dockingComputer", "KeyK")).toBe("Shift+K");
    expect(labelFor(map, "dockingComputer")).toBe("Shift+K");
  });

  it("caps an array at four distinct valid codes", () => {
    const capped = capCodes([
      "KeyA",
      "KeyB",
      "KeyA",
      "",
      "KeyC",
      "KeyD",
      "KeyE",
    ]);

    expect(capped).toHaveLength(MAX_CODES_PER_ACTION);
    expect(capped).toEqual(["KeyA", "KeyB", "KeyC", "KeyD"]);
  });
});

describe("context-aware conflicts", () => {
  it("allows rebinding rollRight to ArrowRight because flight and dockScreen do not overlap", () => {
    const map = createBindingMap();
    // stationRight already owns ArrowRight in dockScreen; the flight action may
    // share the code because the two contexts never coexist.
    expect(bindAction(map, "rollRight", "ArrowRight")).toEqual({ ok: true });
    expect(map.rollRight).toEqual(["ArrowRight"]);
    expect(map.stationRight).toEqual(["ArrowRight"]);
  });

  it("drops a tampered duplicate whose contexts overlap", () => {
    const map = createBindingMap({ stationConfirm: ["ArrowRight"] });
    // stationRight comes first in ACTION_IDS and keeps the code; a confirm
    // bound to the same arrow could otherwise commit on one arrow press.
    expect(map.stationRight).toEqual(["ArrowRight"]);
    expect(map.stationConfirm).toEqual([]);
  });

  it("keeps the documented Escape pair for pause and Back", () => {
    const map = createBindingMap();
    expect(map.pause).toEqual(["KeyP", "Escape"]);
    expect(map.stationBack).toEqual(["Escape", "Backspace"]);
  });
});

describe("createInputState", () => {
  it("turns held codes into axes in [-1, 1]", () => {
    const state = createInputState();

    state.keyDown("ArrowRight");
    expect(state.frame().roll).toBe(1);
    state.keyDown("ArrowLeft");
    expect(state.frame().roll).toBe(0);
    state.keyUp("ArrowRight");
    expect(state.frame().roll).toBe(-1);
    state.keyUp("ArrowLeft");

    state.keyDown("ArrowUp");
    expect(state.frame().pitch).toBe(-1);
    state.keyDown("ArrowDown");
    expect(state.frame().pitch).toBe(0);
    state.keyUp("ArrowUp");
    state.keyUp("ArrowDown");

    state.keyDown("KeyW");
    expect(state.frame().speed).toBe(1);
    state.keyDown("KeyS");
    expect(state.frame().speed).toBe(0);

    state.keyDown("ControlLeft");
    expect(state.frame().precision).toBe(true);
  });

  it("enqueues an edge command once per non-repeat keydown", () => {
    const state = createInputState();

    expect(state.keyDown("KeyJ")).toBe(true);
    expect(state.keyDown("KeyJ", true)).toBe(true);
    expect(state.drainCommands()).toEqual([{ kind: "toggleTorus" }]);
    expect(state.drainCommands()).toEqual([]);

    state.keyDown("KeyJ");
    expect(state.drainCommands()).toEqual([{ kind: "toggleTorus" }]);
  });

  it("maps every edge action to its command", () => {
    const state = createInputState();

    state.keyDown("Digit1");
    state.keyDown("F1");
    state.keyDown("Backslash");
    state.keyDown("KeyR");

    expect(state.drainCommands()).toEqual([
      { kind: "launch" },
      { kind: "launch" },
      { kind: "cycleCompass" },
      { kind: "targetStation" },
    ]);
  });

  it("requires Shift for the docking computer and never fires on plain C", () => {
    const state = createInputState();

    // Plain C is bound but shift-required, so it queues nothing at all.
    expect(state.keyDown("KeyC")).toBe(true);
    expect(state.drainCommands()).toEqual([]);

    state.keyDown("KeyC", false, { shift: true });
    expect(state.drainCommands()).toEqual([{ kind: "dockingComputer" }]);

    // A repeat keydown never queues a second activation.
    state.keyDown("KeyC", true, { shift: true });
    expect(state.drainCommands()).toEqual([]);
  });

  it("queues a fresh command object for every Shift+C keydown", () => {
    const state = createInputState();

    state.keyDown("KeyC", false, { shift: true });
    const first = state.drainCommands();
    state.keyUp("KeyC");
    state.keyDown("KeyC", false, { shift: true });
    const second = state.drainCommands();

    expect(first).toEqual([{ kind: "dockingComputer" }]);
    expect(second).toEqual([{ kind: "dockingComputer" }]);
    // No shared EDGE_COMMANDS singleton is reused between activations.
    expect(second[0]).not.toBe(first[0]);
  });

  it("resolves a KeyC rebind chord-aware: Shift+C docks, plain C pauses", () => {
    // The rebinding UI rejects a duplicate code, so this is the defensive
    // case: both actions share the same code in the persisted table.
    const map = createBindingMap();
    map.pause = ["KeyC"];
    map.dockingComputer = ["KeyC"];
    const state = createInputState(map);

    state.keyDown("KeyC", false, { shift: true });
    expect(state.drainCommands()).toEqual([{ kind: "dockingComputer" }]);
    expect(state.consumePauseToggle()).toBe(false);

    state.keyUp("KeyC");
    state.keyDown("KeyC", false, { shift: false });
    expect(state.drainCommands()).toEqual([]);
    expect(state.consumePauseToggle()).toBe(true);
  });

  it("treats both pause codes as one pause edge", () => {
    const state = createInputState();

    state.keyDown("KeyP");
    expect(state.consumePauseToggle()).toBe(true);
    expect(state.consumePauseToggle()).toBe(false);

    state.keyDown("Escape");
    expect(state.consumePauseToggle()).toBe(true);
  });

  it("clears held codes and pending commands", () => {
    const state = createInputState();
    state.keyDown("ArrowRight");
    state.keyDown("KeyJ");

    state.clearAll();

    expect(state.frame().roll).toBe(0);
    expect(state.drainCommands()).toEqual([]);
    expect(state.consumePauseToggle()).toBe(false);
  });

  it("cannot restore a held key from a keyup that arrives after clearAll", () => {
    const state = createInputState();
    state.keyDown("ArrowRight");
    expect(state.frame().roll).toBe(1);

    state.clearAll();
    state.keyUp("ArrowRight");

    expect(state.frame().roll).toBe(0);
  });

  it("uses the replaced table after setBindings", () => {
    const map = createBindingMap();
    const state = createInputState(map);

    bindAction(map, "rollRight", "KeyL");
    state.setBindings(map);

    state.keyDown("ArrowRight");
    expect(state.frame().roll).toBe(0);
    state.keyUp("ArrowRight");

    state.keyDown("KeyL");
    expect(state.frame().roll).toBe(1);
  });

  it("reports whether a code is bound", () => {
    const state = createInputState();

    expect(state.isBound("KeyJ")).toBe(true);
    expect(state.isBound("KeyL")).toBe(false);
  });
});

describe("chart and hyperspace bindings", () => {
  it("registers every new action with its default code", () => {
    expect(ACTION_IDS).toContain("chart");
    expect(ACTION_IDS).toContain("hyperspace");
    expect(DEFAULT_BINDINGS.chart).toEqual(["F6"]);
    expect(DEFAULT_BINDINGS.hyperspace).toEqual(["KeyH"]);
    expect(DEFAULT_BINDINGS.chartConfirm).toEqual(["Enter"]);
    expect(DEFAULT_BINDINGS.chartRange).toEqual(["Tab"]);
    expect(DEFAULT_BINDINGS.chartBack).toEqual(["Escape"]);
    // The browser would otherwise reload or cycle panels on F6.
    expect(RESERVED_F_KEYS.has("F6")).toBe(true);
  });

  it("scopes every chart edge to the chart context only", () => {
    for (const action of [
      "chartUp",
      "chartDown",
      "chartLeft",
      "chartRight",
      "chartConfirm",
      "chartRange",
      "chartBack",
    ] as const) {
      expect(ACTION_CONTEXTS[action]).toEqual(["chart"]);
    }
    // The open/close toggle works in flight, docked and chart.
    expect(ACTION_CONTEXTS.chart).toEqual([
      "flight",
      "dockHome",
      "dockScreen",
      "chart",
    ]);
    // H is flight-scoped: inert while docked.
    expect(ACTION_CONTEXTS.hyperspace).toEqual(["flight"]);
  });

  it("keeps the arrow keys conflict-free across flight, dockScreen and chart", () => {
    const map = createBindingMap();
    expect(map.pitchForward).toEqual(["ArrowUp"]);
    expect(map.stationUp).toEqual(["ArrowUp"]);
    expect(map.chartUp).toEqual(["ArrowUp"]);
    expect(map.chartDown).toEqual(["ArrowDown"]);
    expect(map.chartLeft).toEqual(["ArrowLeft"]);
    expect(map.chartRight).toEqual(["ArrowRight"]);
  });

  it("queues chart edges and never drains them as sim commands", () => {
    const state = createInputState();
    state.setContext("chart");

    state.keyDown("ArrowUp");
    state.keyDown("Enter");
    state.keyDown("Tab");
    state.keyDown("KeyH");

    expect(state.drainChartActions()).toEqual([
      "chartUp",
      "chartConfirm",
      "chartRange",
    ]);
    expect(state.drainCommands()).toEqual([]);
  });

  it("Escape in the chart is Back and never pause; KeyP still pauses", () => {
    const state = createInputState();
    state.setContext("chart");

    expect(state.keyDown("Escape")).toBe(true);
    expect(state.consumePauseToggle()).toBe(false);
    expect(state.drainChartActions()).toEqual(["chartBack"]);

    state.keyDown("KeyP");
    expect(state.consumePauseToggle()).toBe(true);
  });

  it("Escape in dockHome still toggles pause", () => {
    const state = createInputState();
    state.setContext("dockHome");

    state.keyDown("Escape");
    expect(state.consumePauseToggle()).toBe(true);
    expect(state.drainChartActions()).toEqual([]);
  });

  it("F6 opens and closes in flight and dockHome", () => {
    const state = createInputState();
    state.keyDown("F6");
    expect(state.drainChartActions()).toEqual(["chart"]);

    state.setContext("chart");
    state.keyDown("F6");
    expect(state.drainChartActions()).toEqual(["chart"]);
  });
});

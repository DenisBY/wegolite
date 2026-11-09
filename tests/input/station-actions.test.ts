// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The mode-aware keyboard layer (ECON-09, D-03, D-06).
 *
 * The actions are driven directly, without synthetic DOM events except for the
 * reserved-F-key guard, which is a pure helper precisely so Node can prove the
 * `defaultPrevented` contract.
 */

import { describe, expect, it } from "vitest";

import { createBindingMap } from "../../src/input/bindings.js";
import {
  cancelReservedKey,
  createInputState,
  shouldCancelReservedKey,
} from "../../src/input/keyboard.js";
import type { InputState } from "../../src/input/keyboard.js";

function switchTo(state: InputState, context: "dockHome" | "dockScreen") {
  state.setContext(context);
}

describe("station contexts", () => {
  it("defaults to flight and keeps plain KeyC returning true", () => {
    const state = createInputState();
    expect(state.getContext()).toBe("flight");
    expect(state.keyDown("KeyC")).toBe(true);
    expect(state.drainCommands()).toEqual([]);
  });

  it("Esc in dockScreen is Back only, never pause", () => {
    const state = createInputState();
    switchTo(state, "dockScreen");
    expect(state.keyDown("Escape")).toBe(true);
    expect(state.drainStationActions()).toEqual(["stationBack"]);
    expect(state.consumePauseToggle()).toBe(false);
  });

  it("Esc in dockHome toggles pause", () => {
    const state = createInputState();
    switchTo(state, "dockHome");
    expect(state.keyDown("Escape")).toBe(true);
    expect(state.drainStationActions()).toEqual([]);
    expect(state.consumePauseToggle()).toBe(true);
  });

  it("KeyP pauses in dockScreen", () => {
    const state = createInputState();
    switchTo(state, "dockScreen");
    expect(state.keyDown("KeyP")).toBe(true);
    expect(state.consumePauseToggle()).toBe(true);
    expect(state.drainStationActions()).toEqual([]);
  });

  it("Digit1 is inert inside a section and launches exactly once at home", () => {
    const state = createInputState();
    switchTo(state, "dockScreen");
    expect(state.keyDown("Digit1")).toBe(false);
    expect(state.drainCommands()).toEqual([]);

    state.setContext("dockHome");
    expect(state.keyDown("Digit1")).toBe(true);
    expect(state.drainCommands()).toEqual([{ kind: "launch" }]);
  });

  it("resolves plain and shift arrows to the four distinct actions", () => {
    const state = createInputState();
    switchTo(state, "dockScreen");

    state.keyDown("ArrowRight");
    expect(state.drainStationActions()).toEqual(["stationRight"]);

    state.keyDown("ArrowLeft");
    expect(state.drainStationActions()).toEqual(["stationLeft"]);

    state.keyDown("ArrowRight", false, { shift: true });
    expect(state.drainStationActions()).toEqual(["stationBuyMax"]);

    state.keyDown("ArrowLeft", false, { shift: true });
    expect(state.drainStationActions()).toEqual(["stationSellMax"]);
  });

  it("queues confirm, cancel and page actions", () => {
    const state = createInputState();
    switchTo(state, "dockScreen");

    state.keyDown("Enter");
    state.keyDown("KeyY");
    state.keyDown("KeyN");
    state.keyDown("Tab");
    state.keyDown("PageUp");
    expect(state.drainStationActions()).toEqual([
      "stationConfirm",
      "stationConfirm",
      "stationCancel",
      "stationPageNext",
      "stationPagePrevious",
    ]);
  });

  it("opens a screen synchronously through the sink", () => {
    let seen: string | undefined;
    const state = createInputState();
    state.setStationScreenHandler(() => {
      state.setContext("dockScreen");
      seen = state.getContext();
    });
    switchTo(state, "dockHome");
    expect(state.keyDown("Digit8")).toBe(true);
    // The callback observed the new context before keyDown returned.
    expect(seen).toBe("dockScreen");
    expect(state.getContext()).toBe("dockScreen");
    // Screen-open actions are not queued as station actions.
    expect(state.drainStationActions()).toEqual([]);
  });

  it("clears held keys and queued actions on a context change", () => {
    const state = createInputState();
    switchTo(state, "dockScreen");
    state.keyDown("ArrowRight");
    state.keyDown("Enter");
    expect(state.drainStationActions()).toHaveLength(2);

    state.keyDown("ArrowRight");
    state.keyDown("Enter");
    state.setContext("flight");

    expect(state.drainStationActions()).toEqual([]);
    expect(state.frame().roll).toBe(0);
  });
});

describe("paused station input", () => {
  it("resolves only pause and never prevents Tab/Enter", () => {
    const state = createInputState();
    switchTo(state, "dockScreen");
    state.setPaused(true);

    expect(state.keyDown("ArrowRight")).toBe(false);
    expect(state.keyDown("Enter")).toBe(false);
    expect(state.keyDown("Tab")).toBe(false);
    expect(state.drainStationActions()).toEqual([]);

    expect(state.keyDown("KeyP")).toBe(true);
    expect(state.consumePauseToggle()).toBe(true);
    expect(state.keyDown("Escape")).toBe(true);
    expect(state.consumePauseToggle()).toBe(true);
  });
});

describe("reserved F-key guard", () => {
  function event(
    code: string,
    overrides: Partial<{
      ctrlKey: boolean;
      metaKey: boolean;
      altKey: boolean;
    }> = {},
  ) {
    const target = {
      code,
      ctrlKey: overrides.ctrlKey ?? false,
      metaKey: overrides.metaKey ?? false,
      altKey: overrides.altKey ?? false,
      target: null as EventTarget | null,
      defaultPrevented: false,
      preventDefault() {
        this.defaultPrevented = true;
      },
    };
    return target;
  }

  it("cancels a plain reserved F-key but never dispatches", () => {
    for (const code of ["F1", "F3", "F4", "F5", "F7", "F8"]) {
      const sample = event(code);
      cancelReservedKey(sample);
      expect(sample.defaultPrevented).toBe(true);
    }
  });

  it("leaves browser chords and capture mode alone", () => {
    const ctrl = event("F5", { ctrlKey: true });
    cancelReservedKey(ctrl);
    expect(ctrl.defaultPrevented).toBe(false);

    const meta = event("F5", { metaKey: true });
    cancelReservedKey(meta);
    expect(meta.defaultPrevented).toBe(false);

    const alt = event("F5", { altKey: true });
    cancelReservedKey(alt);
    expect(alt.defaultPrevented).toBe(false);

    const capturing = event("F5");
    cancelReservedKey(capturing, true);
    expect(capturing.defaultPrevented).toBe(false);
  });

  it("does not cancel an ordinary key", () => {
    expect(
      shouldCancelReservedKey({
        code: "Digit8",
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        capturing: false,
        textTarget: false,
      }),
    ).toBe(false);
  });

  it("treats a reserved F-key as handled even outside its context", () => {
    const state = createInputState();
    state.setContext("flight");
    // F8's action is dockHome/dockScreen only, but the browser default must
    // still be ours to cancel so the capture guard and keyDown agree.
    expect(state.keyDown("F8")).toBe(true);
  });
});

describe("F1 outside the home screen", () => {
  it("is handled but fires nothing in dockScreen, chart and saveScreen", () => {
    for (const context of ["dockScreen", "chart", "saveScreen"] as const) {
      const state = createInputState();
      state.setContext(context);
      expect(state.keyDown("F1")).toBe(true);
      expect(state.drainCommands()).toEqual([]);
      expect(state.drainStationActions()).toEqual([]);
    }
  });

  it("still queues exactly one launch command at home", () => {
    const state = createInputState();
    state.setContext("dockHome");
    expect(state.keyDown("F1")).toBe(true);
    expect(state.drainCommands()).toEqual([{ kind: "launch" }]);
  });

  it("leaves a Ctrl+F1 chord and a capturing session alone", () => {
    const base = {
      code: "F1",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      capturing: false,
      textTarget: false,
    };
    expect(shouldCancelReservedKey(base)).toBe(false);
    expect(
      shouldCancelReservedKey({ ...base, ctrlKey: false, capturing: true }),
    ).toBe(false);
    expect(shouldCancelReservedKey({ ...base, ctrlKey: false })).toBe(true);
  });
});

describe("context conflicts", () => {
  it("allows rollRight and stationRight to share ArrowRight", () => {
    const map = createBindingMap();
    map.rollRight = ["ArrowRight"];
    map.stationRight = ["ArrowRight"];
    expect(map.rollRight).toEqual(["ArrowRight"]);
    expect(map.stationRight).toEqual(["ArrowRight"]);
  });
});

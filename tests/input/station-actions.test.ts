// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The mode-aware keyboard layer (ECON-09, D-03, D-06).
 *
 * The actions are driven directly, without synthetic DOM events except for the
 * reserved-F-key guard, which is a pure helper precisely so Node can prove the
 * `defaultPrevented` contract.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { ACTION_CONTEXTS } from "../../src/input/actions.js";
import { createBindingMap } from "../../src/input/bindings.js";
import {
  cancelReservedKey,
  createInputState,
  createKeyboardInputSource,
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

  it("Esc in dockHome is inert with the default table", () => {
    const state = createInputState();
    switchTo(state, "dockHome");
    expect(state.keyDown("Escape")).toBe(false);
    expect(state.drainStationActions()).toEqual([]);
    expect(state.consumePauseToggle()).toBe(false);
  });

  it("Esc in dockHome toggles pause for a stored pause-on-Escape blob", () => {
    const state = createInputState(
      createBindingMap({ pause: ["KeyP", "Escape"] }),
    );
    switchTo(state, "dockHome");
    expect(state.keyDown("Escape")).toBe(true);
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
    // Escape no longer resumes by default; P and the Resume button do.
    expect(state.keyDown("Escape")).toBe(false);
    expect(state.consumePauseToggle()).toBe(false);
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

describe("the gameOver context (D-07)", () => {
  it("fires no action: flight keys, pause, Escape and Space produce no command", () => {
    const state = createInputState();
    state.setContext("gameOver");
    for (const code of ["KeyP", "Escape", "KeyA", "KeyW", "Space"]) {
      state.keyDown(code);
    }
    expect(state.drainCommands()).toEqual([]);
    expect(state.drainStationActions()).toEqual([]);
    expect(state.drainChartActions()).toEqual([]);
    expect(state.drainSaveScreenActions()).toEqual([]);
    expect(state.consumePauseToggle()).toBe(false);
  });

  it("returns the zero input frame even with a flight key held", () => {
    const state = createInputState();
    state.keyDown("KeyW");
    state.keyDown("ArrowUp");
    state.setContext("gameOver");
    expect(state.frame()).toEqual({
      pitch: 0,
      roll: 0,
      speed: 0,
      precision: false,
    });
  });

  it("swallows F1 to F8: handled, nothing fires, F5 included", () => {
    for (const code of ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"]) {
      const state = createInputState();
      state.setContext("gameOver");
      expect(state.keyDown(code)).toBe(true);
      expect(state.drainCommands()).toEqual([]);
      expect(state.drainStationActions()).toEqual([]);
      expect(state.drainSaveScreenActions()).toEqual([]);
      expect(state.consumePauseToggle()).toBe(false);
    }
  });

  it("lists no action in the gameOver context", () => {
    for (const contextsOfAction of Object.values(ACTION_CONTEXTS)) {
      expect(contextsOfAction).not.toContain("gameOver");
    }
  });
});

describe("the docked screen keys on every docked screen (docked-f-keys)", () => {
  const KEYS = [
    ["F2", "saveLoad"],
    ["F3", "stationOutfitting"],
    ["F4", "stationInterfaces"],
    ["F5", "stationStatus"],
    ["F6", "chart"],
    ["F8", "stationMarket"],
  ] as const;

  it("hands each key to the synchronous sink from home, a section, the chart and the F2 screen", () => {
    for (const context of [
      "dockHome",
      "dockScreen",
      "chart",
      "saveScreen",
    ] as const) {
      for (const [code, action] of KEYS) {
        // Oolite ignores F2 on its own screen.
        const expected =
          context === "saveScreen" && code === "F2" ? [] : [action];
        const state = createInputState();
        const sunk: string[] = [];
        state.setStationScreenHandler((next) => sunk.push(next));
        state.setContext(context);
        expect(state.keyDown(code), `${code} in ${context}`).toBe(true);
        expect(sunk, `${code} in ${context}`).toEqual(expected);
        expect(state.drainStationActions()).toEqual([]);
        expect(state.drainChartActions()).toEqual([]);
        expect(state.drainSaveScreenActions()).toEqual([]);
      }
    }
  });

  it("keeps the flight meanings: views on F2 to F4, the queued chart on F6, nothing on F5 and F8", () => {
    const state = createInputState();
    const sunk: string[] = [];
    state.setStationScreenHandler((next) => sunk.push(next));
    for (const [code] of KEYS) expect(state.keyDown(code)).toBe(true);
    expect(sunk).toEqual([]);
    expect(state.drainCommands()).toEqual([
      { kind: "setView", view: "aft" },
      { kind: "setView", view: "port" },
      { kind: "setView", view: "starboard" },
    ]);
    expect(state.drainChartActions()).toEqual(["chart"]);
  });
});

describe("the digit aliases of the docked screen keys (quick 261125-gmc)", () => {
  // Oolite binds 2 to 6 and 8 beside F2 to F6 and F8 (keyconfig2.plist:52-88)
  // and polls them on every docked GUI screen, the Load/Save options screen
  // included (`pollGuiScreenControlsWithFKeyAlias:YES`).
  const DIGITS = [
    ["Digit2", "saveLoad"],
    ["Digit3", "stationOutfitting"],
    ["Digit4", "stationInterfaces"],
    ["Digit5", "stationStatus"],
    ["Digit6", "chart"],
    ["Digit8", "stationMarket"],
  ] as const;

  it("hands each digit to the synchronous sink from home, a section, the chart and the F2 screen", () => {
    for (const context of [
      "dockHome",
      "dockScreen",
      "chart",
      "saveScreen",
    ] as const) {
      for (const [code, action] of DIGITS) {
        // Like F2, the digit 2 does nothing on the Save/Load screen itself.
        const expected =
          context === "saveScreen" && code === "Digit2" ? [] : [action];
        const state = createInputState();
        const sunk: string[] = [];
        state.setStationScreenHandler((next) => sunk.push(next));
        state.setContext(context);
        state.keyDown(code);
        expect(sunk, `${code} in ${context}`).toEqual(expected);
        expect(state.drainStationActions()).toEqual([]);
        expect(state.drainChartActions()).toEqual([]);
        expect(state.drainSaveScreenActions()).toEqual([]);
        expect(state.drainCommands()).toEqual([]);
      }
    }
  });

  it("keeps Digit2 the aft view in flight and makes Digit6 queue the chart there", () => {
    const state = createInputState();
    const sunk: string[] = [];
    state.setStationScreenHandler((next) => sunk.push(next));
    expect(state.keyDown("Digit2")).toBe(true);
    expect(state.keyDown("Digit6")).toBe(true);
    expect(sunk).toEqual([]);
    expect(state.drainCommands()).toEqual([{ kind: "setView", view: "aft" }]);
    expect(state.drainChartActions()).toEqual(["chart"]);
    expect(state.drainSaveScreenActions()).toEqual([]);
  });
});

describe("digits typed into a focused text field (quick 261125-gmc)", () => {
  interface Listener {
    readonly type: string;
    readonly capture: boolean;
    readonly fn: (event: KeyboardEvent) => void;
  }

  class FakeElement {
    readonly tagName: string;
    readonly isContentEditable = false;
    constructor(tagName: string) {
      this.tagName = tagName;
    }
  }

  function attachWithFakeDom(): {
    readonly press: (code: string, target: unknown) => boolean;
    readonly sunk: string[];
    readonly setContext: (context: "chart" | "dockScreen") => void;
  } {
    vi.stubGlobal("HTMLElement", FakeElement);
    vi.stubGlobal("document", {
      addEventListener: () => undefined,
      body: { dataset: {} },
    });
    const listeners: Listener[] = [];
    const fakeWindow = {
      addEventListener(
        type: string,
        fn: (event: KeyboardEvent) => void,
        options?: AddEventListenerOptions,
      ) {
        listeners.push({ type, capture: options?.capture === true, fn });
      },
    } as unknown as Window;
    const source = createKeyboardInputSource();
    const sunk: string[] = [];
    source.setStationScreenHandler((action) => sunk.push(action));
    source.attach(fakeWindow);
    return {
      sunk,
      setContext: (context) => source.setContext(context),
      press(code, target) {
        let prevented = false;
        const event = {
          code,
          key: code.replace(/^Digit/, ""),
          repeat: false,
          shiftKey: false,
          ctrlKey: false,
          metaKey: false,
          altKey: false,
          target,
          get defaultPrevented() {
            return prevented;
          },
          preventDefault() {
            prevented = true;
          },
        } as unknown as KeyboardEvent;
        // Capture listeners first, as the browser dispatches them on window.
        for (const capture of [true, false]) {
          for (const listener of listeners) {
            if (listener.type === "keydown" && listener.capture === capture) {
              listener.fn(event);
            }
          }
        }
        return prevented;
      },
    };
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("types 2 and 6 in the chart's Find planet box instead of opening a screen", () => {
    const keyboard = attachWithFakeDom();
    keyboard.setContext("chart");
    const findBox = new FakeElement("INPUT");
    for (const code of ["Digit2", "Digit6", "Digit3", "Digit8"]) {
      expect(keyboard.press(code, findBox), code).toBe(false);
    }
    expect(keyboard.sunk).toEqual([]);

    // The F-keys still act from the box, and the digits act outside it.
    expect(keyboard.press("F2", findBox)).toBe(true);
    expect(keyboard.press("Digit2", new FakeElement("CANVAS"))).toBe(true);
    expect(keyboard.sunk).toEqual(["saveLoad", "saveLoad"]);
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

describe("same-frame key order across a docked screen key (quick 261124-pze F2)", () => {
  it("flushes a queued Save before F3 reaches the sink", () => {
    const state = createInputState();
    const log: string[] = [];
    state.setContext("saveScreen");
    state.setQueuedEdgeFlush(() => {
      for (const action of state.drainSaveScreenActions()) {
        log.push(`flush:${action}`);
      }
    });
    state.setStationScreenHandler((action) => log.push(`sink:${action}`));
    expect(state.keyDown("KeyS")).toBe(true);
    expect(state.keyDown("F3")).toBe(true);
    expect(log).toEqual(["flush:saveScreenSave", "sink:stationOutfitting"]);
  });

  it("resolves F6 again after a flushed Escape closed the docked chart", () => {
    const state = createInputState();
    const log: string[] = [];
    state.setContext("chart");
    state.setQueuedEdgeFlush(() => {
      for (const action of state.drainChartActions()) {
        log.push(`flush:${action}`);
        if (action === "chartBack") state.setContext("dockHome");
      }
    });
    state.setStationScreenHandler((action) => log.push(`sink:${action}`));
    state.keyDown("Escape");
    expect(state.keyDown("F6")).toBe(true);
    expect(log).toEqual(["flush:chartBack", "sink:chart"]);
    expect(state.getContext()).toBe("dockHome");
  });

  it("on an in-flight chart, Escape then F4 is the starboard view and Escape then F6 queues the chart", () => {
    const cases = [
      ["F4", [{ kind: "setView", view: "starboard" }], []],
      ["F6", [], ["chart"]],
    ] as const;
    for (const [code, expectCommands, expectChart] of cases) {
      const state = createInputState();
      const sunk: string[] = [];
      state.setContext("chart");
      state.setQueuedEdgeFlush(() => {
        for (const action of state.drainChartActions()) {
          if (action === "chartBack") state.setContext("flight");
        }
      });
      state.setStationScreenHandler((action) => sunk.push(action));
      state.keyDown("Escape");
      expect(state.keyDown(code), code).toBe(true);
      expect(sunk, code).toEqual([]);
      expect(state.getContext(), code).toBe("flight");
      expect(state.drainCommands(), code).toEqual(expectCommands);
      expect(state.drainChartActions(), code).toEqual(expectChart);
    }
  });

  it("never calls the flush when nothing is queued", () => {
    const state = createInputState();
    const log: string[] = [];
    state.setContext("dockScreen");
    state.setQueuedEdgeFlush(() => log.push("flush"));
    state.setStationScreenHandler((action) => log.push(`sink:${action}`));
    expect(state.keyDown("F3")).toBe(true);
    expect(log).toEqual(["sink:stationOutfitting"]);
  });

  it("keeps today's behaviour with no flush registered", () => {
    const state = createInputState();
    const sunk: string[] = [];
    state.setContext("saveScreen");
    state.setStationScreenHandler((action) => sunk.push(action));
    state.keyDown("KeyS");
    expect(state.keyDown("F3")).toBe(true);
    expect(sunk).toEqual(["stationOutfitting"]);
    // Without a flush the queued Save stays for the frame drain.
    expect(state.drainSaveScreenActions()).toEqual(["saveScreenSave"]);
  });
});

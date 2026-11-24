// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The flush of the queued screen edges (quick 261124-pze F2).
 *
 * Node only, no DOM: a real `SessionState`, a docked flight state and a real
 * `createInputState` as the session's input source, with recording doubles for
 * the three appliers. The flush mirrors the frame's routing (steps 2, 3 and 6
 * of `frame-loop.ts`), and the input layer runs it before a docked screen key
 * reaches its synchronous sink, so keys pressed in one frame apply in the order
 * they were pressed.
 */

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createQueuedEdgeFlush } from "../../../src/app/session/frame-loop.js";
import type { ActionId } from "../../../src/input/actions.js";
import { createInputState } from "../../../src/input/keyboard.js";
import type {
  InputState,
  KeyboardInputSource,
} from "../../../src/input/keyboard.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout } = laveFixture();

type FlushDeps = Parameters<typeof createQueuedEdgeFlush>[1];

interface Harness {
  readonly ctx: SessionState;
  readonly input: InputState;
  readonly log: string[];
  readonly flush: () => void;
}

/** A docked session with a real input state and recording appliers. */
function harness(overrides: Partial<FlushDeps> = {}): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  ctx.core.state = initFlightState(layout);
  const input = createInputState();
  ctx.runtime.input = input as unknown as KeyboardInputSource;
  const log: string[] = [];
  const deps: FlushDeps = {
    handleChartActions: (actions: readonly ActionId[]) => {
      for (const action of actions) log.push(`chart:${action}`);
    },
    handleSaveScreenActions: (actions: readonly ActionId[]) => {
      for (const action of actions) log.push(`save:${action}`);
    },
    applyStationAction: (action: ActionId) => {
      log.push(`station:${action}`);
    },
    ...overrides,
  };
  return { ctx, input, log, flush: createQueuedEdgeFlush(ctx, deps) };
}

describe("createQueuedEdgeFlush routing (quick 261124-pze F2)", () => {
  it("returns without an input source", () => {
    const h = harness();
    h.ctx.runtime.input = undefined;
    h.flush();
    expect(h.log).toEqual([]);
  });

  it("always hands the chart edges to the chart handler", () => {
    for (const setup of [
      (h: Harness) => {
        h.ctx.chart.chartOpen = true;
      },
      (h: Harness) => {
        h.ctx.save.saveScreenOpen = true;
      },
      (h: Harness) => {
        h.ctx.runtime.paused = true;
      },
    ]) {
      const h = harness();
      setup(h);
      h.input.setContext("chart");
      h.input.keyDown("Escape");
      h.flush();
      expect(h.log).toEqual(["chart:chartBack"]);
      expect(h.input.drainChartActions()).toEqual([]);
    }
  });

  it("hands the Save/Load edges over with the chart closed and discards them with it open", () => {
    const closed = harness();
    closed.ctx.save.saveScreenOpen = true;
    closed.input.setContext("saveScreen");
    closed.input.keyDown("KeyS");
    closed.flush();
    expect(closed.log).toEqual(["save:saveScreenSave"]);

    const open = harness();
    open.ctx.save.saveScreenOpen = true;
    open.input.setContext("saveScreen");
    open.input.keyDown("KeyS");
    open.ctx.chart.chartOpen = true;
    open.flush();
    expect(open.log).toEqual([]);
    expect(open.input.drainSaveScreenActions()).toEqual([]);
  });

  it("applies the station edges only docked, with no overlay open and not paused", () => {
    const docked = harness();
    docked.input.setContext("dockScreen");
    docked.input.keyDown("Escape");
    docked.flush();
    expect(docked.log).toEqual(["station:stationBack"]);

    for (const setup of [
      (h: Harness) => {
        h.ctx.chart.chartOpen = true;
      },
      (h: Harness) => {
        h.ctx.save.saveScreenOpen = true;
      },
      (h: Harness) => {
        h.ctx.runtime.paused = true;
      },
      (h: Harness) => {
        const state = initFlightState(layout);
        state.mode = "inFlight";
        h.ctx.core.state = state;
      },
    ]) {
      const h = harness();
      h.input.setContext("dockScreen");
      h.input.keyDown("Escape");
      setup(h);
      h.flush();
      expect(h.log).toEqual([]);
      expect(h.input.drainStationActions()).toEqual([]);
    }
  });

  it("drains everything and applies nothing in the game-over state", () => {
    const h = harness();
    h.input.setContext("chart");
    h.input.keyDown("Escape");
    h.ctx.runtime.gameOver = true;
    h.flush();
    expect(h.log).toEqual([]);
    expect(h.input.drainChartActions()).toEqual([]);
    expect(h.input.drainSaveScreenActions()).toEqual([]);
    expect(h.input.drainStationActions()).toEqual([]);
  });
});

describe("the finding sequences through the real input state (quick 261124-pze F2)", () => {
  it("S then F3 on the Save/Load screen saves before Outfitting opens", () => {
    const h = harness();
    h.ctx.save.saveScreenOpen = true;
    h.input.setContext("saveScreen");
    h.input.setQueuedEdgeFlush(h.flush);
    h.input.setStationScreenHandler((action) => {
      h.log.push(`sink:${action}`);
      h.ctx.save.saveScreenOpen = false;
      h.ctx.station.stationScreen = "outfitting";
      h.input.setContext("dockScreen");
    });
    h.input.keyDown("KeyS");
    h.input.keyDown("F3");
    expect(h.log).toEqual(["save:saveScreenSave", "sink:stationOutfitting"]);
    expect(h.ctx.station.stationScreen).toBe("outfitting");
  });

  it("Escape then F6 on the docked chart ends with the chart open", () => {
    const ref: { current?: Harness } = {};
    const live = harness({
      handleChartActions: (actions: readonly ActionId[]) => {
        const h = ref.current;
        if (h === undefined) return;
        for (const action of actions) {
          h.log.push(`chart:${action}`);
          if (action === "chartBack") {
            h.ctx.chart.chartOpen = false;
            h.input.setContext("dockHome");
          }
        }
      },
    });
    ref.current = live;
    live.ctx.chart.chartOpen = true;
    live.input.setContext("chart");
    live.input.setQueuedEdgeFlush(live.flush);
    live.input.setStationScreenHandler((action) => {
      live.log.push(`sink:${action}`);
      if (action === "chart") {
        live.ctx.chart.chartOpen = true;
        live.input.setContext("chart");
      }
    });
    live.input.keyDown("Escape");
    live.input.keyDown("F6");
    expect(live.log).toEqual(["chart:chartBack", "sink:chart"]);
    expect(live.ctx.chart.chartOpen).toBe(true);
    expect(live.input.getContext()).toBe("chart");
  });
});

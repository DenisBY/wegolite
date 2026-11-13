// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The chart controller against a fake session context (Phase 8, D-12 step 4,
 * G-8).
 *
 * Node only, no DOM: a real `SessionState` and recording doubles for the chart
 * overlay, the input source and the game loop. The controller registers no
 * listener, so constructing it needs no `window`.
 */

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createChartController } from "../../../src/app/session/chart-controller.js";
import type { ChartController } from "../../../src/app/session/chart-controller.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type { GameLoop } from "../../../src/app/game-loop.js";
import type { ChartOverlay } from "../../../src/ui/chart.js";
import { galaxyPreset, localPreset } from "../../../src/ui/chart-model.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout } = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly controller: ChartController;
  readonly calls: string[];
  readonly contexts: InputContext[];
}

function harness(): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const calls: string[] = [];
  const contexts: InputContext[] = [];
  ctx.core.state = initFlightState(layout);
  ctx.chart.chart = {
    show: () => calls.push("show"),
    hide: () => calls.push("hide"),
    view: () => calls.push("view"),
    viewport: () => ({ width: 800, height: 600 }),
  } as unknown as ChartOverlay;
  let current: InputContext = "dockHome";
  ctx.runtime.input = {
    getContext: () => current,
    setContext: (next: InputContext) => {
      current = next;
      contexts.push(next);
    },
  } as unknown as KeyboardInputSource;
  ctx.runtime.loop = {
    reset: () => calls.push("loop.reset"),
  } as unknown as GameLoop;
  const controller = createChartController(ctx, {
    galaxy: [system],
    galaxyById: new Map([[system.id, system]]),
    updateProbe: () => calls.push("updateProbe"),
    syncStationNav: () => calls.push("syncStationNav"),
  });
  return { ctx, controller, calls, contexts };
}

describe("toggleChartPreset", () => {
  it("flips between the local and galaxy presets with the matching camera", () => {
    const { ctx, controller, calls } = harness();
    ctx.chart.chartOpen = true;
    ctx.chart.chartPreset = "local";

    controller.toggleChartPreset();
    expect(ctx.chart.chartPreset).toBe("galaxy");
    expect(ctx.chart.chartCamera).toEqual(galaxyPreset());
    expect(calls).toEqual(["view", "updateProbe"]);

    controller.toggleChartPreset();
    expect(ctx.chart.chartPreset).toBe("local");
    expect(ctx.chart.chartCamera).toEqual(localPreset(system));
  });

  it.each(["disposed", "paused", "contextLost"] as const)(
    "is inert while %s",
    (flag) => {
      const { ctx, controller, calls } = harness();
      ctx.chart.chartOpen = true;
      ctx.runtime[flag] = true;
      controller.toggleChartPreset();
      expect(ctx.chart.chartPreset).toBe("local");
      expect(calls).toEqual([]);
    },
  );

  it("is inert while the chart is closed", () => {
    const { ctx, controller, calls } = harness();
    controller.toggleChartPreset();
    expect(ctx.chart.chartPreset).toBe("local");
    expect(calls).toEqual([]);
  });
});

describe("openChart and closeChart", () => {
  it("opens at the local preset and switches the input to the chart context", () => {
    const { ctx, controller, contexts, calls } = harness();
    ctx.chart.chartPreset = "galaxy";
    controller.openChart();
    expect(ctx.chart.chartOpen).toBe(true);
    expect(ctx.chart.chartPreset).toBe("local");
    expect(ctx.chart.chartCamera).toEqual(localPreset(system));
    expect(ctx.chart.contextBeforeChart).toBe("dockHome");
    expect(contexts).toEqual(["chart"]);
    expect(calls).toEqual(["syncStationNav", "show", "view", "updateProbe"]);
  });

  it("closing hides the overlay, restores the input context and resets the loop", () => {
    const { ctx, controller, contexts, calls } = harness();
    controller.openChart();
    calls.length = 0;

    controller.closeChart();

    expect(ctx.chart.chartOpen).toBe(false);
    expect(contexts).toEqual(["chart", "dockHome"]);
    expect(calls).toEqual([
      "hide",
      "loop.reset",
      "syncStationNav",
      "updateProbe",
    ]);
  });

  it("closing a chart that is not open does nothing", () => {
    const { controller, calls, contexts } = harness();
    controller.closeChart();
    expect(calls).toEqual([]);
    expect(contexts).toEqual([]);
  });

  it("does not open beneath the pause overlay", () => {
    const { ctx, controller } = harness();
    ctx.runtime.paused = true;
    controller.openChart();
    expect(ctx.chart.chartOpen).toBe(false);
  });
});

describe("applyChartAction", () => {
  it("the chart key opens a closed chart and closes an open one", () => {
    const { ctx, controller } = harness();
    controller.applyChartAction("chart");
    expect(ctx.chart.chartOpen).toBe(true);
    controller.applyChartAction("chart");
    expect(ctx.chart.chartOpen).toBe(false);
  });

  it("confirm commits the selected system as the hyperspace target", () => {
    const { ctx, controller } = harness();
    controller.openChart();
    controller.applyChartAction("chartConfirm");
    expect(ctx.core.hyperspaceTargetId).toBeUndefined();
    controller.selectChartSystem(system.id);
    controller.applyChartAction("chartConfirm");
    expect(ctx.core.hyperspaceTargetId).toBe(system.id);
  });
});

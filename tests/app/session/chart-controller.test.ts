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

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createSessionState } from "../../../src/app/session/context.js";
import type { SessionState } from "../../../src/app/session/context.js";
import { createChartController } from "../../../src/app/session/chart-controller.js";
import type { ChartController } from "../../../src/app/session/chart-controller.js";
import { createSettingsController } from "../../../src/app/session/settings-controller.js";
import type { SettingsV1 } from "../../../src/settings/schema.js";
import type { PauseOverlay } from "../../../src/ui/pause.js";
import type { InputContext } from "../../../src/input/actions.js";
import type { KeyboardInputSource } from "../../../src/input/keyboard.js";
import type { GameLoop } from "../../../src/app/game-loop.js";
import type { ChartOverlay } from "../../../src/ui/chart.js";
import type { System } from "../../../src/content/types.js";
import {
  buildChartView,
  findSystemsByPrefix,
  galaxyPreset,
  localPreset,
} from "../../../src/ui/chart-model.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { laveFixture } from "../../helpers/lave.js";

const { system, layout } = laveFixture();

interface Harness {
  readonly ctx: SessionState;
  readonly controller: ChartController;
  readonly calls: string[];
  readonly contexts: InputContext[];
  readonly titles: string[];
  readonly finds: string[];
}

function harness(galaxy: readonly System[] = [system]): Harness {
  const ctx = createSessionState({
    system,
    saveStatus: "absent",
    saveSkipReason: "",
  });
  const calls: string[] = [];
  const contexts: InputContext[] = [];
  const titles: string[] = [];
  const finds: string[] = [];
  ctx.core.state = initFlightState(layout);
  ctx.chart.chart = {
    show: () => calls.push("show"),
    hide: () => calls.push("hide"),
    view: () => calls.push("view"),
    viewport: () => ({ width: 800, height: 600 }),
    setTitle: (text: string) => titles.push(text),
    focusFind: () => finds.push("focus"),
    resetFind: () => finds.push("reset"),
    setFindResult: (text: string) => finds.push(`result:${text}`),
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
    galaxy,
    galaxyById: new Map(galaxy.map((entry) => [entry.id, entry])),
    updateProbe: () => calls.push("updateProbe"),
    syncStationNav: () => calls.push("syncStationNav"),
  });
  return { ctx, controller, calls, contexts, titles, finds };
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

  it.each(["disposed", "paused", "contextLost", "gameOver"] as const)(
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
  it("titles the chart with the galaxy number as Oolite does", () => {
    const { ctx, controller, titles } = harness();
    controller.openChart();
    expect(titles).toEqual(["Galactic Chart 1"]);
    controller.closeChart();
    ctx.core.system = { ...ctx.core.system, galaxy: 7 };
    controller.openChart();
    expect(titles).toEqual(["Galactic Chart 1", "Galactic Chart 8"]);
  });

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

  it("closing restores the flight context the chart was opened from (WORLD-11)", () => {
    const { ctx, controller, contexts } = harness();
    ctx.runtime.input?.setContext("flight");
    contexts.length = 0;
    controller.openChart();
    expect(ctx.chart.contextBeforeChart).toBe("flight");

    controller.closeChart();

    expect(ctx.chart.chartOpen).toBe(false);
    expect(contexts).toEqual(["chart", "flight"]);
  });

  it("closing twice restores the context once and resets the loop once", () => {
    const { controller, contexts, calls } = harness();
    controller.openChart();
    calls.length = 0;
    controller.closeChart();
    controller.closeChart();
    expect(contexts).toEqual(["chart", "dockHome"]);
    expect(calls.filter((call) => call === "loop.reset")).toHaveLength(1);
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

/**
 * A latched game over (plan 20-06, D-08): no chart opens over the game-over
 * view. The death flow closes a chart that was open at the death (20-04), so
 * the refusals below are belt and braces; an open chart is forced by hand to
 * prove each guard on its own.
 */
describe("while the session is latched game over", () => {
  function latched() {
    const h = harness();
    h.ctx.runtime.gameOver = true;
    return h;
  }

  it("openChart leaves the chart closed and touches nothing", () => {
    const { ctx, controller, calls, contexts, titles } = latched();
    controller.openChart();
    expect(ctx.chart.chartOpen).toBe(false);
    expect(calls).toEqual([]);
    expect(contexts).toEqual([]);
    expect(titles).toEqual([]);
  });

  it("the chart key does not open it either", () => {
    const { ctx, controller } = latched();
    controller.applyChartAction("chart");
    expect(ctx.chart.chartOpen).toBe(false);
  });

  it("setChartCamera changes no camera", () => {
    const { ctx, controller, calls } = latched();
    ctx.chart.chartOpen = true;
    const before = ctx.chart.chartCamera;
    controller.setChartCamera({ centre: { x: 1, y: 2 }, spanX: 40 });
    expect(ctx.chart.chartCamera).toBe(before);
    expect(calls).toEqual([]);
  });

  it("selectChartSystem selects nothing, even on a chart forced open", () => {
    const { ctx, controller, calls } = latched();
    ctx.chart.chartOpen = true;
    controller.selectChartSystem(system.id);
    expect(ctx.chart.chartSelectedId).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("one latched session runs every refusal route in turn and leaks nothing between them", () => {
    const { ctx, controller, calls, contexts } = latched();
    const overlay: string[] = [];
    const renders: number[] = [];
    let clears = 0;
    const input = ctx.runtime.input as unknown as Record<string, unknown>;
    ctx.runtime.input = {
      ...input,
      clearAll: () => {
        clears += 1;
      },
      setPaused: () => overlay.push("setPaused"),
    } as unknown as KeyboardInputSource;
    ctx.runtime.pauseOverlay = {
      show: () => overlay.push("show"),
      hide: () => overlay.push("hide"),
      setNotice: () => undefined,
    } as unknown as PauseOverlay;
    ctx.runtime.settings = {
      pauseOnFocusLoss: true,
    } as unknown as SettingsV1;
    const settings = createSettingsController(ctx, {
      scenes: { quality: () => "standard", setQuality: () => undefined },
      renderFrame: (alpha: number) => {
        renders.push(alpha);
      },
      syncStationNav: () => undefined,
      refreshStationChrome: () => undefined,
      performSwap: () => undefined,
    });

    settings.focusLost();
    settings.enterContextLoss();
    controller.openChart();
    settings.pause();
    settings.resume();
    settings.exitContextLoss();
    controller.selectChartSystem(system.id);

    expect(ctx.runtime.gameOver).toBe(true);
    expect(ctx.runtime.paused).toBe(false);
    expect(ctx.runtime.contextLost).toBe(false);
    expect(ctx.chart.chartOpen).toBe(false);
    expect(ctx.chart.chartSelectedId).toBeUndefined();
    expect(ctx.core.hyperspaceTargetId).toBeUndefined();
    expect(overlay).toEqual([]);
    expect(calls).toEqual([]);
    expect(contexts).toEqual([]);
    expect(renders).toEqual([0]);
    expect(clears).toBeGreaterThanOrEqual(3);
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

const GALAXY0 = JSON.parse(
  readFileSync(
    new URL("../../../src/content/generated/systems/g0.json", import.meta.url),
    "utf8",
  ),
) as System[];

/**
 * Find planet (quick task 261118-cyo): Oolite selects the first match in
 * system-index order (`Universe.m:7745-7771`), moves the chart to it and
 * steps through the matches with wrap (`GuiDisplayGen.m:2119-2160`).
 */
describe("handleFind", () => {
  function opened() {
    const h = harness(GALAXY0);
    h.ctx.core.system =
      GALAXY0.find((entry) => entry.id === system.id) ?? system;
    h.controller.openChart();
    h.calls.length = 0;
    h.finds.length = 0;
    return h;
  }
  const matches = findSystemsByPrefix(GALAXY0, "la");

  it("selects the first match, marks all of them and reads n of m", () => {
    const { ctx, controller, calls, finds } = opened();
    controller.handleFind({ kind: "query", text: "la" });
    expect(matches.length).toBeGreaterThan(1);
    expect(ctx.chart.chartFindQuery).toBe("la");
    expect(ctx.chart.chartFindMatches).toEqual(matches);
    expect(ctx.chart.chartFindIndex).toBe(0);
    expect(ctx.chart.chartSelectedId).toBe(matches[0]);
    expect(finds).toEqual([`result:1 of ${String(matches.length)}`]);
    expect(calls).toContain("view");
    expect(calls.at(-1)).toBe("updateProbe");
  });

  it("centres the camera on an off-view match and keeps the span", () => {
    const { ctx, controller } = opened();
    const before = ctx.chart.chartCamera;
    const far = GALAXY0.find((entry) => {
      const view = buildChartView(
        GALAXY0,
        ctx.core.system.id,
        undefined,
        before,
        70,
        { width: 800, height: 600 },
        undefined,
      );
      const marker = view.markers.find((item) => item.id === entry.id);
      return (
        marker !== undefined &&
        !marker.visible &&
        findSystemsByPrefix(GALAXY0, entry.name)[0] === entry.id
      );
    });
    if (far === undefined) throw new Error("no off-view system to find");
    controller.handleFind({ kind: "query", text: far.name });
    expect(ctx.chart.chartSelectedId).toBe(far.id);
    expect(ctx.chart.chartCamera.spanX).toBe(before.spanX);
    expect(ctx.chart.chartCamera.centre).toEqual({
      x: far.chartX,
      y: far.chartY,
    });
  });

  it("leaves the camera alone for a match already in view", () => {
    const { ctx, controller } = opened();
    const before = ctx.chart.chartCamera;
    controller.handleFind({ kind: "query", text: "lave" });
    expect(ctx.chart.chartSelectedId).toBe(system.id);
    expect(ctx.chart.chartCamera).toEqual(before);
  });

  it("steps through the matches with wrap in both directions", () => {
    const { ctx, controller } = opened();
    controller.handleFind({ kind: "query", text: "la" });
    controller.handleFind({ kind: "step", direction: 1 });
    expect(ctx.chart.chartFindIndex).toBe(1);
    expect(ctx.chart.chartSelectedId).toBe(matches[1]);
    controller.handleFind({ kind: "step", direction: -1 });
    controller.handleFind({ kind: "step", direction: -1 });
    expect(ctx.chart.chartFindIndex).toBe(matches.length - 1);
    expect(ctx.chart.chartSelectedId).toBe(matches.at(-1));
    controller.handleFind({ kind: "step", direction: 1 });
    expect(ctx.chart.chartSelectedId).toBe(matches[0]);
  });

  it("keeps the selection and the text on no match and says so", () => {
    const { ctx, controller, finds } = opened();
    controller.handleFind({ kind: "query", text: "la" });
    const selected = ctx.chart.chartSelectedId;
    controller.handleFind({ kind: "query", text: "laqq" });
    expect(ctx.chart.chartSelectedId).toBe(selected);
    expect(ctx.chart.chartFindQuery).toBe("laqq");
    expect(ctx.chart.chartFindMatches).toEqual([]);
    expect(finds.at(-1)).toBe("result:No match");
    controller.handleFind({ kind: "step", direction: 1 });
    expect(ctx.chart.chartSelectedId).toBe(selected);
  });

  it("commits the selection as the hyperspace target", () => {
    const { ctx, controller } = opened();
    controller.handleFind({ kind: "query", text: "la" });
    controller.handleFind({ kind: "commit" });
    expect(ctx.core.hyperspaceTargetId).toBe(matches[0]);
  });

  it("clears the search", () => {
    const { ctx, controller, finds } = opened();
    controller.handleFind({ kind: "query", text: "la" });
    controller.handleFind({ kind: "clear" });
    expect(ctx.chart.chartFindQuery).toBe("");
    expect(ctx.chart.chartFindMatches).toEqual([]);
    expect(ctx.chart.chartFindIndex).toBe(0);
    expect(finds.at(-1)).toBe("result:");
  });

  it.each(["disposed", "paused", "contextLost", "gameOver"] as const)(
    "ignores every kind while %s",
    (flag) => {
      const { ctx, controller, calls } = opened();
      ctx.runtime[flag] = true;
      controller.handleFind({ kind: "query", text: "la" });
      controller.handleFind({ kind: "step", direction: 1 });
      controller.handleFind({ kind: "commit" });
      controller.handleFind({ kind: "clear" });
      expect(ctx.chart.chartFindMatches).toEqual([]);
      expect(ctx.core.hyperspaceTargetId).toBeUndefined();
      expect(calls).toEqual([]);
    },
  );

  it("ignores every kind while the chart is closed", () => {
    const { ctx, controller, calls } = opened();
    controller.closeChart();
    calls.length = 0;
    controller.handleFind({ kind: "query", text: "la" });
    controller.handleFind({ kind: "commit" });
    expect(ctx.chart.chartFindMatches).toEqual([]);
    expect(ctx.core.hyperspaceTargetId).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it("starts every chart open with an empty search", () => {
    const { ctx, controller, finds } = opened();
    controller.handleFind({ kind: "query", text: "la" });
    controller.closeChart();
    finds.length = 0;
    controller.openChart();
    expect(ctx.chart.chartFindQuery).toBe("");
    expect(ctx.chart.chartFindMatches).toEqual([]);
    expect(finds).toContain("reset");
  });

  it("the chartFind action focuses the box on an open chart only", () => {
    const { controller, finds } = opened();
    controller.applyChartAction("chartFind");
    expect(finds).toEqual(["focus"]);
    controller.closeChart();
    finds.length = 0;
    controller.applyChartAction("chartFind");
    expect(finds).toEqual([]);
  });
});

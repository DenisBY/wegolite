// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The chart controller (Phase 8, D-12 step 4, ARCHITECTURE.md section 4.2).
 *
 * The galactic chart overlay's logic: opening and closing it, the camera and
 * the local and galaxy presets, the selection and the drained chart edges. The
 * bodies are the ones `createGameSession` carried before the split, reading
 * live fields through `ctx` at every call (G-8).
 *
 * The controller registers no listener on construction, so a Node unit test
 * never touches `window`. Entering a system and resolving the committed target
 * stay with the facade (split step 7 moves them); they reach the controller as
 * dependencies only where a body needs them.
 */

import type { System } from "../../content/types.js";
import type { ActionId } from "../../input/actions.js";
import {
  buildChartView,
  chartArrowVector,
  chartFindReadout,
  chartTitle,
  clampChartCamera,
  findSystemsByPrefix,
  galaxyPreset,
  localPreset,
  nearestInDirection,
  visibleSystemIds,
} from "../../ui/chart-model.js";
import type {
  ChartArrow,
  ChartCamera,
  ChartView,
} from "../../ui/chart-model.js";
import type { ChartFindEvent, ChartOverlay } from "../../ui/chart.js";
import type { SessionState } from "./context.js";

/** What the controller calls outside the session context. */
export interface ChartControllerDeps {
  readonly galaxy: readonly System[];
  readonly galaxyById: ReadonlyMap<string, System>;
  /** The probe publisher's per-frame publication. */
  readonly updateProbe: () => void;
  /** Re-derive the station nav's hidden state after a context change. */
  readonly syncStationNav: () => void;
}

export function createChartController(
  ctx: SessionState,
  deps: ChartControllerDeps,
) {
  const { galaxy, galaxyById, updateProbe, syncStationNav } = deps;

  /** Apply a wheel/drag camera from the chart shell (D-03/D-04/D-09). */
  function setChartCamera(camera: ChartCamera): void {
    if (
      ctx.runtime.disposed ||
      ctx.runtime.gameOver ||
      ctx.runtime.paused ||
      ctx.runtime.contextLost ||
      !ctx.chart.chartOpen
    )
      return;
    ctx.chart.chartCamera = clampChartCamera(camera);
    refreshChart();
    updateProbe();
  }

  /** Tab toggles the local preset and the whole-galaxy preset (D-06/D-07). */
  function toggleChartPreset(): void {
    if (
      ctx.runtime.disposed ||
      ctx.runtime.gameOver ||
      ctx.runtime.paused ||
      ctx.runtime.contextLost ||
      !ctx.chart.chartOpen
    )
      return;
    if (ctx.chart.chartPreset === "local") {
      ctx.chart.chartPreset = "galaxy";
      ctx.chart.chartCamera = galaxyPreset();
    } else {
      ctx.chart.chartPreset = "local";
      ctx.chart.chartCamera = localPreset(ctx.core.system);
    }
    refreshChart();
    updateProbe();
  }

  function currentChartView(overlay: ChartOverlay): ChartView {
    return buildChartView(
      galaxy,
      ctx.core.system.id,
      ctx.core.hyperspaceTargetId,
      ctx.chart.chartCamera,
      ctx.core.profile.fuel,
      overlay.viewport(),
      ctx.chart.chartSelectedId,
      ctx.chart.chartFindMatches,
    );
  }

  function refreshChart(): void {
    const overlay = ctx.chart.chart;
    if (overlay === undefined) return;
    overlay.view(currentChartView(overlay));
  }

  function openChart(): void {
    const currentState = ctx.core.state;
    const currentInput = ctx.runtime.input;
    const overlay = ctx.chart.chart;
    if (
      currentState === undefined ||
      currentInput === undefined ||
      overlay === undefined
    ) {
      return;
    }
    // Pitfall 13: F6 is inert while launching (mode `launching`, the launch
    // view from the dock slot), an open chart is not reopened, and an overlay
    // must never open beneath the pause overlay or over the game-over view
    // (D-08).
    if (
      ctx.runtime.gameOver ||
      ctx.runtime.paused ||
      ctx.chart.chartOpen ||
      currentState.mode === "launching"
    )
      return;
    ctx.chart.chartOpen = true;
    ctx.chart.contextBeforeChart = currentInput.getContext();
    currentInput.setContext("chart");
    // D-06: every open starts at the local preset around the current system.
    ctx.chart.chartCamera = localPreset(ctx.core.system);
    ctx.chart.chartPreset = "local";
    overlay.setTitle(chartTitle(ctx.core.system.galaxy));
    // Every open starts with an empty Find planet search.
    resetFind();
    overlay.resetFind();
    // The chart nav's hidden state must be final before the first paint
    // measures the canvas.
    syncStationNav();
    // The overlay is still `hidden` when the first view is built, so its
    // client size is zero. Show it, then rebuild against the real viewport.
    overlay.show(currentChartView(overlay));
    overlay.view(currentChartView(overlay));
    updateProbe();
  }

  function closeChart(): void {
    if (!ctx.chart.chartOpen) return;
    ctx.chart.chartOpen = false;
    ctx.chart.chart?.hide();
    ctx.runtime.input?.setContext(ctx.chart.contextBeforeChart);
    // Hidden time is never replayed; the accumulator starts at zero.
    ctx.runtime.loop?.reset();
    syncStationNav();
    updateProbe();
  }

  function resetFind(): void {
    ctx.chart.chartFindQuery = "";
    ctx.chart.chartFindMatches = [];
    ctx.chart.chartFindIndex = 0;
  }

  /**
   * Select the match at `chartFindIndex` and move the camera onto it when its
   * marker is off the viewport, keeping the span (Oolite moves the chart to
   * the found system, `PlayerEntityControls.m:1836-1849` at the pin 7437f22).
   */
  function selectFoundSystem(): void {
    const id = ctx.chart.chartFindMatches[ctx.chart.chartFindIndex];
    if (id === undefined) return;
    ctx.chart.chartSelectedId = id;
    const overlay = ctx.chart.chart;
    const system = galaxyById.get(id);
    if (overlay === undefined || system === undefined) return;
    const marker = currentChartView(overlay).markers.find(
      (entry) => entry.id === id,
    );
    if (marker !== undefined && !marker.visible) {
      ctx.chart.chartCamera = clampChartCamera({
        centre: { x: system.chartX, y: system.chartY },
        spanX: ctx.chart.chartCamera.spanX,
      });
    }
  }

  /**
   * The Find planet box (quick task 261118-cyo, owner decision 2026-11-18).
   *
   * A query marks every system whose name starts with the text and selects
   * the first in system-index order (`Universe.m:7745-7771`); a step moves
   * through the matches with wrap (`GuiDisplayGen.m:2119-2160`); commit makes
   * the selection the hyperspace target, as Enter does; clear empties the
   * search. A query with no match keeps the selection and the typed text. The
   * guards are `setChartCamera`'s.
   */
  function handleFind(event: ChartFindEvent): void {
    if (
      ctx.runtime.disposed ||
      ctx.runtime.gameOver ||
      ctx.runtime.paused ||
      ctx.runtime.contextLost ||
      !ctx.chart.chartOpen
    )
      return;
    switch (event.kind) {
      case "query": {
        ctx.chart.chartFindQuery = event.text;
        ctx.chart.chartFindMatches = findSystemsByPrefix(galaxy, event.text);
        ctx.chart.chartFindIndex = 0;
        selectFoundSystem();
        break;
      }
      case "step": {
        const count = ctx.chart.chartFindMatches.length;
        if (count === 0) return;
        const direction = event.direction < 0 ? -1 : 1;
        ctx.chart.chartFindIndex =
          (ctx.chart.chartFindIndex + direction + count) % count;
        selectFoundSystem();
        break;
      }
      case "commit": {
        if (ctx.chart.chartSelectedId === undefined) return;
        ctx.core.hyperspaceTargetId = ctx.chart.chartSelectedId;
        break;
      }
      case "clear": {
        resetFind();
        break;
      }
      default:
        return;
    }
    ctx.chart.chart?.setFindResult(
      chartFindReadout(
        ctx.chart.chartFindQuery,
        ctx.chart.chartFindMatches.length,
        ctx.chart.chartFindIndex,
      ),
    );
    refreshChart();
    updateProbe();
  }

  function selectChartSystem(id: string): void {
    // D-08: no selection over the game-over view (belt and braces: the death
    // flow closes an open chart and `openChart` refuses while latched).
    if (ctx.runtime.gameOver) return;
    if (!ctx.chart.chartOpen) return;
    ctx.chart.chartSelectedId = id;
    refreshChart();
  }

  function moveChartSelection(arrow: ChartArrow): void {
    const base =
      (ctx.chart.chartSelectedId === undefined
        ? undefined
        : galaxyById.get(ctx.chart.chartSelectedId)) ?? ctx.core.system;
    // G-5: arrows walk only the systems the window paints, so a press can
    // never land on an unpainted system. With no chart there is nothing to
    // paint, and the whole galaxy is the fallback.
    const overlay = ctx.chart.chart;
    const visibleIds =
      overlay === undefined
        ? undefined
        : visibleSystemIds(currentChartView(overlay));
    const candidates =
      visibleIds === undefined
        ? galaxy
        : galaxy.filter((candidate) => visibleIds.has(candidate.id));
    const { dirX, dirY } = chartArrowVector(arrow);
    const next = nearestInDirection(candidates, base, dirX, dirY);
    if (next !== undefined) ctx.chart.chartSelectedId = next.id;
    refreshChart();
  }

  /** Apply one drained chart edge; the live open flag is revalidated here. */
  function applyChartAction(action: ActionId): void {
    switch (action) {
      case "chart":
        if (ctx.chart.chartOpen) closeChart();
        else openChart();
        break;
      case "chartBack":
        closeChart();
        break;
      case "chartRange":
        toggleChartPreset();
        break;
      case "chartFind":
        // `/` focuses the Find planet box; the keydown was consumed, so no
        // "/" reaches it.
        if (ctx.chart.chartOpen) ctx.chart.chart?.focusFind();
        break;
      case "chartConfirm":
        // A click only selects (D-02): Enter is the commit.
        if (!ctx.chart.chartOpen || ctx.chart.chartSelectedId === undefined)
          return;
        ctx.core.hyperspaceTargetId = ctx.chart.chartSelectedId;
        refreshChart();
        break;
      case "chartUp":
        if (ctx.chart.chartOpen) moveChartSelection("up");
        break;
      case "chartDown":
        if (ctx.chart.chartOpen) moveChartSelection("down");
        break;
      case "chartLeft":
        if (ctx.chart.chartOpen) moveChartSelection("left");
        break;
      case "chartRight":
        if (ctx.chart.chartOpen) moveChartSelection("right");
        break;
      default:
        break;
    }
  }

  function handleChartActions(actions: readonly ActionId[]): void {
    for (const action of actions) applyChartAction(action);
  }

  return {
    setChartCamera,
    toggleChartPreset,
    currentChartView,
    refreshChart,
    openChart,
    closeChart,
    selectChartSystem,
    handleFind,
    moveChartSelection,
    applyChartAction,
    handleChartActions,
  };
}

/** The controller's shape, derived from the factory. */
export type ChartController = ReturnType<typeof createChartController>;

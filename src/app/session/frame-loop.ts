// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The frame shell (Phase 8, D-12 step 9, ARCHITECTURE.md sections 4.2 and 4.3).
 *
 * `frame(now)` is the body `createGameSession` carried before the split, moved
 * verbatim: it schedules the next animation frame, counts the frame, then runs
 * its phases in a fixed order that the frame-order test pins:
 *
 *   1. reschedule, count (`probe.frames`) and tick the FPS counter (a DOM text
 *      readout, so no redraw request), then the live guards and the delta;
 *   2. the pause toggle, then the game-over branch (a latched death: drain every
 *      queue, advance only the presentation clock `gameOverSeconds`, draw at
 *      alpha 1, publish the probe and return, no step and no timer, D-01 and
 *      D-06), then the docked message clock: while docked, not
 *      paused and not under the manual clock, the frame delta is added to
 *      `ctx.runtime.dockedMessageSeconds` (quick task 261117-u3m), chart and
 *      save screen included, as Oolite draws the message area on every screen;
 *   3. the chart drain, then the save-screen drain (the chart wins a tie);
 *   4. the chart-open branch: drain, empty `pending`, and in flight (not paused,
 *      not under the manual clock) step the simulation behind the chart with no
 *      commands and the zero frame (WORLD-11, as in Oolite; supersedes the v1
 *      freeze D-01); docked it stays frozen; return without drawing;
 *   5. the save-screen freeze branch: drain, empty `pending`, return;
 *   6. station actions, applied only when docked and not paused;
 *   7. the sim driver (drain, launch autosave, fixed steps) when not paused, or
 *      the paused drain, which empties `pending` and never steps; under the
 *      manual clock (`?test=1&clock=manual`, D-09) the not-paused branch skips
 *      the sim driver and draws at alpha 1;
 *   8. the single gated draw call.
 *
 * Everything else a frame does (the steps, the events, the render) lives in the
 * collaborators below, reached through `deps`. The loop reads every live field
 * through `ctx` at the moment it needs it (G-8).
 */

import type { Command } from "../../sim/commands.js";
import { clampFrameDelta } from "../../sim/loop.js";
import type { WegoliteProbe } from "../probe.js";
import type { RedrawGate } from "../redraw-gate.js";
import type { ChartController } from "./chart-controller.js";
import type { SessionState } from "./context.js";
import type { RenderDriver } from "./render-driver.js";
import type { SaveController } from "./save-controller.js";
import type { SimDriver } from "./sim-driver.js";
import type { StationController } from "./station-controller.js";

/** What the loop calls outside the session context. */
export interface LoopDeps {
  readonly probe: Pick<WegoliteProbe, "frames">;
  /** The queue the Launch button and the launch-skip key push onto. */
  readonly pending: Command[];
  readonly redrawGate: Pick<RedrawGate, "request">;
  readonly simDriver: Pick<SimDriver, "advanceFrame" | "advanceBehind">;
  /** The render driver's direct frame and its redraw-gate decision. */
  readonly renderFrame: RenderDriver["renderFrame"];
  readonly shouldDraw: RenderDriver["shouldDraw"];
  readonly pause: () => void;
  readonly resume: () => void;
  readonly handleChartActions: ChartController["handleChartActions"];
  readonly handleSaveScreenActions: SaveController["handleSaveScreenActions"];
  readonly applyStationAction: StationController["applyStationAction"];
  /** The probe publisher's per-frame publication. */
  readonly updateProbe: () => void;
}

export function createFrameLoop(
  ctx: SessionState,
  deps: LoopDeps,
): (now: number) => void {
  const {
    probe,
    pending,
    redrawGate,
    simDriver,
    renderFrame,
    shouldDraw,
    pause,
    resume,
    handleChartActions,
    handleSaveScreenActions,
    applyStationAction,
    updateProbe,
  } = deps;

  function frame(now: number): void {
    ctx.runtime.rafId = requestAnimationFrame(frame);
    probe.frames += 1;
    ctx.runtime.fpsCounter?.frame(now);

    const currentState = ctx.core.state;
    const currentLayout = ctx.core.layout;
    const currentConfig = ctx.core.config;
    const currentInput = ctx.runtime.input;
    const currentLoop = ctx.runtime.loop;
    if (
      currentState === undefined ||
      currentLayout === undefined ||
      currentConfig === undefined ||
      currentInput === undefined ||
      currentLoop === undefined
    ) {
      return;
    }

    const delta =
      ctx.runtime.lastMs === 0 ? 0 : (now - ctx.runtime.lastMs) / 1000;
    ctx.runtime.lastMs = now;

    if (currentInput.consumePauseToggle()) {
      if (ctx.runtime.paused) resume();
      else pause();
    }

    // D-01, D-06: once the player is dead the world is frozen and the session
    // stays on the game-over view. No fixed step runs, whatever the clock
    // (the sim driver is never called), every queue is drained so nothing
    // pressed repeats or fires later, and only the presentation clock moves:
    // the wall delta, also under the manual clock, because the fade and the
    // overlay run on wall time, not on the simulation clock. Nothing here
    // ends the branch: no timer, no frame count (Oolite's 30 s `kDeadResetTime`
    // is not ported).
    if (ctx.runtime.gameOver) {
      currentInput.drainCommands();
      currentInput.drainStationActions();
      currentInput.drainChartActions();
      currentInput.drainSaveScreenActions();
      pending.length = 0;
      ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
      if (Number.isFinite(delta) && delta > 0) {
        ctx.runtime.gameOverSeconds += clampFrameDelta(delta);
      }
      renderFrame(1, shouldDraw());
      updateProbe();
      return;
    }

    // The message rows count down on the docked screens too (Universe.m:4735-
    // 4736, 4810-4827; GuiDisplayGen.m:1308-1312, 1327-1336), while the flight
    // time stands still, so the docked wall delta feeds the rows' clock. Only a
    // finite, positive delta counts; a paused session and the manual clock
    // (D-09) freeze the rows.
    if (
      currentState.mode === "docked" &&
      !ctx.runtime.paused &&
      !ctx.runtime.testFlags.manualClock &&
      Number.isFinite(delta) &&
      delta > 0
    ) {
      ctx.runtime.dockedMessageSeconds += delta;
    }

    // D-01: consume the chart edges before the freeze branch, so F6 opens and
    // closes and a KeyP over the chart still reaches the pause handler above.
    handleChartActions(currentInput.drainChartActions());
    // D-20: the F2 screen is another opaque edge-driven overlay; its actions
    // are applied before the freeze so Save/Load can run and Return can close.
    if (ctx.chart.chartOpen) currentInput.drainSaveScreenActions();
    else handleSaveScreenActions(currentInput.drainSaveScreenActions());

    if (ctx.chart.chartOpen) {
      // The overlay is opaque: drain everything and paint nothing. In flight
      // the simulation keeps running behind it (WORLD-11, as in Oolite; the v1
      // freeze D-01 is superseded), with no commands and the zero input frame
      // so nothing pressed over the chart steers the ship. Docked it stays
      // frozen, and so does a paused session. Under the manual clock only
      // `advanceTicks` moves the simulation (D-09). A dock or an arrival behind
      // the chart closes it (plan 12-13).
      currentInput.drainCommands();
      currentInput.drainStationActions();
      pending.length = 0;
      ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
      if (
        currentState.mode === "inFlight" &&
        !ctx.runtime.paused &&
        !ctx.runtime.testFlags.manualClock
      ) {
        simDriver.advanceBehind(delta);
      }
      redrawGate.request();
      updateProbe();
      return;
    }

    if (ctx.save.saveScreenOpen) {
      // The save screen is opaque too: no fixed step runs behind it.
      currentInput.drainCommands();
      currentInput.drainStationActions();
      pending.length = 0;
      ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
      redrawGate.request();
      updateProbe();
      return;
    }

    // Station actions are discarded while paused or in flight; in the docked
    // mode each one is revalidated against the live screen and context.
    const stationActions = currentInput.drainStationActions();
    if (!ctx.runtime.paused && currentState.mode === "docked") {
      for (const action of stationActions) applyStationAction(action);
    }

    let alpha = 0;
    if (!ctx.runtime.paused) {
      // D-09: under `?test=1&clock=manual` the loop never self-steps (no
      // command drain, no loop advance) and draws the latest pose at alpha 1;
      // `advanceTicks` is the only thing that moves the simulation.
      alpha = ctx.runtime.testFlags.manualClock
        ? 1
        : simDriver.advanceFrame(delta);
    } else {
      // A key pressed while paused must not become a queued edge command that
      // fires on resume.
      currentInput.drainCommands();
      pending.length = 0;
      ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
    }

    renderFrame(alpha, shouldDraw());
  }

  return frame;
}

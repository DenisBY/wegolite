// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The settings controller (Phase 8, D-12 step 4, ARCHITECTURE.md section 4.2).
 *
 * Pause, resume, focus loss and WebGL context loss, the pause overlay's two
 * sub-panels (controls and settings) and graphics quality. The bodies are the
 * ones `createGameSession` carried before the split, reading live fields
 * through `ctx` at every call (G-8).
 *
 * The controller registers no listener on construction, so a Node unit test
 * never touches `window`. The `keydown` listener that routes Escape out of a
 * sub-panel stays with the facade, which takes `onSubpanelKeyDown` from here.
 */

import { ACTION_IDS } from "../../input/actions.js";
import { resetSettings, saveSettings } from "../../settings/store.js";
import type { GraphicsQuality } from "../../settings/schema.js";
import {
  CONTEXT_LOST_NOTICE,
  CONTEXT_RESTORED_NOTICE,
} from "../context-recovery.js";
import type { SceneManager } from "../scene-manager.js";
import type { RenderDriver } from "./render-driver.js";
import type { SessionState } from "./context.js";

/** What the controller calls outside the session context. */
export interface SettingsControllerDeps {
  readonly scenes: Pick<SceneManager, "quality" | "setQuality">;
  /** The render driver's direct (always drawing) frame. */
  readonly renderFrame: RenderDriver["renderFrame"];
  /** Re-derive the station nav's hidden state after a pause or resume. */
  readonly syncStationNav: () => void;
  /** Repaint the station chrome after Reset to defaults. */
  readonly refreshStationChrome: () => void;
  /** Re-enter the current system so a quality change takes effect. */
  readonly performSwap: () => void;
}

export function createSettingsController(
  ctx: SessionState,
  deps: SettingsControllerDeps,
) {
  const {
    scenes,
    renderFrame,
    syncStationNav,
    refreshStationChrome,
    performSwap,
  } = deps;

  function persistSettings(): void {
    if (
      ctx.runtime.settings === undefined ||
      ctx.runtime.bindings === undefined
    )
      return;
    ctx.runtime.settings.bindings = ctx.runtime.bindings;
    saveSettings(ctx.runtime.settings);
  }

  function pause(): void {
    const currentState = ctx.core.state;
    if (currentState === undefined) {
      // The title/menu has no simulation; focus loss only clears input.
      ctx.runtime.input?.clearAll();
      return;
    }
    if (ctx.runtime.gameOver) {
      // D-07: a dead session shows the game-over view and nothing else. Held
      // input is cleared, but no pause overlay opens over the view and the
      // session never reads as paused. This covers focus loss, the P toggle,
      // the public pause and the context-loss entry, which all land here.
      ctx.runtime.input?.clearAll();
      return;
    }
    if (ctx.runtime.paused) {
      // Repeated blur/visibility events are idempotent.
      ctx.runtime.input?.clearAll();
      return;
    }
    ctx.runtime.paused = true;
    ctx.runtime.input?.clearAll();
    ctx.runtime.input?.setPaused(true);
    ctx.runtime.loop?.reset();
    ctx.runtime.pauseOverlay?.show();
    syncStationNav();
  }

  /**
   * D-15 focus loss. Held input is always cleared. The pause step runs only
   * when the stored toggle is on (the default); with it off the simulation
   * keeps running. The game-loop frame-delta clamp bounds the catch-up after a
   * stalled hidden tab, so no loop reset is needed here.
   */
  function focusLost(): void {
    if (
      ctx.runtime.settings === undefined ||
      ctx.runtime.settings.pauseOnFocusLoss
    ) {
      pause();
      return;
    }
    ctx.runtime.input?.clearAll();
  }

  function resume(): void {
    // D-07, DEATH-06: nothing resumes a dead session.
    if (ctx.runtime.gameOver) return;
    if (!ctx.runtime.paused) return;
    // QUAL-05 (D-15): no resume without a context. P and the Resume button
    // reach this line (Escape no longer pauses or resumes by default, INPUT-01;
    // a stored blob that still binds it to pause does), so the refusal covers
    // every route.
    if (ctx.runtime.contextLost) return;
    ctx.runtime.paused = false;
    ctx.runtime.input?.clearAll();
    ctx.runtime.input?.setPaused(false);
    // Hidden time is never replayed: the accumulator starts at zero and the
    // next frame delta is one rendered frame, not the time spent paused.
    ctx.runtime.loop?.reset();
    ctx.runtime.pauseOverlay?.hide();
    ctx.runtime.pauseOverlay?.setNotice("");
    ctx.runtime.controlsPanel?.hide();
    ctx.runtime.settingsPanel?.hide();
    syncStationNav();
  }

  /** QUAL-05: the context went away; pause at once and say why. */
  function enterContextLoss(): void {
    ctx.runtime.contextLost = true;
    pause();
    ctx.runtime.pauseOverlay?.setNotice(CONTEXT_LOST_NOTICE);
  }

  /**
   * QUAL-05 (D-15): the context is back. The session stays paused until the
   * player resumes; the live scene is drawn once into the new context so every
   * GPU resource is uploaded before the probe is read.
   */
  function exitContextLoss(): void {
    ctx.runtime.contextLost = false;
    ctx.runtime.pauseOverlay?.setNotice(CONTEXT_RESTORED_NOTICE);
    if (ctx.core.state !== undefined) renderFrame(0);
  }

  function backToPause(): void {
    ctx.runtime.controlsPanel?.hide();
    ctx.runtime.settingsPanel?.hide();
    ctx.runtime.pauseOverlay?.show();
  }

  function openControls(): void {
    ctx.runtime.settingsPanel?.hide();
    ctx.runtime.controlsPanel?.show();
  }

  /** Push the stored focus-loss toggle into the checkbox; absent reads as on. */
  function syncPauseOnFocusLossToggle(): void {
    ctx.runtime.settingsPanel?.setPauseOnFocusLoss(
      ctx.runtime.settings?.pauseOnFocusLoss ?? true,
    );
  }

  /** Mirror the stored graphics quality into the Settings toggle. */
  function syncQualityToggle(): void {
    ctx.runtime.settingsPanel?.setQuality(
      ctx.runtime.settings?.quality ?? "standard",
    );
  }

  /** Mirror the stored FPS-counter choice into the Settings toggle; absent reads as off. */
  function syncShowFpsToggle(): void {
    ctx.runtime.settingsPanel?.setShowFps(
      ctx.runtime.settings?.showFps ?? false,
    );
  }

  /** Settings > Show FPS counter: store the choice and show or hide the readout. */
  function applyShowFps(enabled: boolean): void {
    const settings = ctx.runtime.settings;
    if (settings === undefined) return;
    settings.showFps = enabled;
    persistSettings();
    ctx.runtime.fpsCounter?.setEnabled(enabled);
  }

  /**
   * Apply a graphics quality to the running game.
   *
   * The quality is a property of the built scene (shader variant and the
   * atmosphere shell), so the current system is re-entered, exactly as the
   * `?test=1` swap does. Nothing in the simulation changes. A failed rebuild
   * leaves the previous scene installed (`enterSystem` commits last) and
   * restores the previous quality, so the toggle never lies.
   */
  function applyQuality(quality: GraphicsQuality): boolean {
    const previous = scenes.quality();
    if (quality === previous) return true;
    scenes.setQuality(quality);
    if (ctx.core.state === undefined || ctx.core.stationDef === undefined)
      return true;
    try {
      performSwap();
    } catch (error) {
      scenes.setQuality(previous);
      console.error("Wegolite: applying the graphics quality failed", error);
      return false;
    }
    renderFrame(0);
    return true;
  }

  function openSettings(): void {
    ctx.runtime.controlsPanel?.hide();
    syncPauseOnFocusLossToggle();
    syncQualityToggle();
    syncShowFpsToggle();
    ctx.runtime.settingsPanel?.show();
  }

  function resetAllSettings(): void {
    const fresh = resetSettings();
    if (ctx.runtime.bindings !== undefined) {
      for (const action of ACTION_IDS) {
        ctx.runtime.bindings[action] = [...(fresh.bindings[action] ?? [])];
      }
      ctx.runtime.settings = { ...fresh, bindings: ctx.runtime.bindings };
      ctx.runtime.input?.setBindings(ctx.runtime.bindings);
      ctx.runtime.controlsPanel?.refresh();
    } else {
      ctx.runtime.settings = fresh;
    }
    ctx.core.launchSeen = false;
    syncPauseOnFocusLossToggle();
    // Reset returns the quality to its default; rebuild the scene to match.
    applyQuality(fresh.quality);
    syncQualityToggle();
    // Reset turns the FPS counter off with the rest of the defaults.
    ctx.runtime.fpsCounter?.setEnabled(fresh.showFps);
    syncShowFpsToggle();
    refreshStationChrome();
  }

  function onSubpanelKeyDown(event: KeyboardEvent): void {
    if (event.code !== "Escape") return;
    if (ctx.runtime.controlsPanel?.isCapturing() === true) return;
    if (
      ctx.runtime.controlsPanel?.isOpen() !== true &&
      ctx.runtime.settingsPanel?.isOpen() !== true
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    backToPause();
  }

  return {
    persistSettings,
    pause,
    focusLost,
    resume,
    enterContextLoss,
    exitContextLoss,
    backToPause,
    openControls,
    syncPauseOnFocusLossToggle,
    syncQualityToggle,
    applyQuality,
    syncShowFpsToggle,
    applyShowFps,
    openSettings,
    resetAllSettings,
    onSubpanelKeyDown,
  };
}

/** The controller's shape, derived from the factory. */
export type SettingsController = ReturnType<typeof createSettingsController>;

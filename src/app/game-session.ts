// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composition root and public facade (Pattern 2, FLGT-07; Phase 8, D-12
 * step 9).
 *
 * This is the only module that wires the simulation, the scene, the HUD, the
 * input source and the UI together, and the only session module the rest of
 * the app imports. `createGameSession` builds the typed session context and
 * every module under `src/app/session` in dependency order (a module needed by
 * an earlier one is reached through a call-time wrapper), and returns the
 * `GameSession` the shell drives. The behaviour lives in those modules: the
 * frame shell in `frame-loop.ts` and start-up, resize, scene swap and teardown
 * in `start-session.ts`.
 *
 * Boot order matters (T-3-02): both GLBs are awaited before the first frame. On
 * a rejected load the session publishes a failure and returns without
 * scheduling a frame — never a live canvas over an empty scene.
 */

import type * as THREE from "three";
import { showBootFailure } from "./boot-failure.js";
import type { System } from "../content/types.js";
import { publishFailure } from "./probe.js";
import type { WegoliteProbe, WegoliteSaveProbe } from "./probe.js";
import type { SceneManager } from "./scene-manager.js";
import { createLaunchSequence } from "./launch-sequence.js";
import { createRedrawGate } from "./redraw-gate.js";
import { createSessionState } from "./session/context.js";
import { createFrameLoop } from "./session/frame-loop.js";
import { createProbePublisher } from "./session/probe-publisher.js";
import { createRenderDriver } from "./session/render-driver.js";
import type { RenderDriver } from "./session/render-driver.js";
import { createChartController } from "./session/chart-controller.js";
import { createSettingsController } from "./session/settings-controller.js";
import {
  canOverwrite,
  createSaveController,
  statusSkipReason,
} from "./session/save-controller.js";
import {
  createDockFeedbackFlow,
  createEventRouter,
  createHudMessages,
  createHyperspaceFlow,
  createStationFlow,
} from "./session/event-router.js";
import { createHyperspaceController } from "./session/hyperspace-controller.js";
import { createSimDriver } from "./session/sim-driver.js";
import { createSessionLifecycle } from "./session/start-session.js";
import { createStationController } from "./session/station-controller.js";
import type { SessionState } from "./session/context.js";
import type { LaunchSequence } from "./launch-sequence.js";
import type { AssetCache } from "../render/asset-cache.js";
import type { SaveAllowLists, SaveV2 } from "../persistence/save.js";
import type { SaveStore, SaveStatus } from "../persistence/store.js";
import { createMessageQueue } from "../render/hud/messages.js";
import type { Command } from "../sim/commands.js";
import {
  PlayerController,
  ScriptedLaunchController,
} from "../sim/flight/controller.js";
import type { PlayerProfile } from "../sim/player/profile.js";
import type { TradePlan } from "../sim/economy/trade.js";
import type { StationShell } from "../ui/station.js";
import type { TitleScreen } from "../ui/title.js";

/** A station transaction awaiting confirmation; plan 05-03 adds fit prompts. */
export type FitPrompt = { readonly kind: "fit"; readonly key: string };

export type StationPending = TradePlan | FitPrompt | null;

export interface GameSessionSave {
  /** The injected port; the session never imports IndexedDB directly. */
  readonly store: SaveStore;
  /** The status boot derived from the one read; `future`/`unreadable` stop all writes. */
  readonly status: SaveStatus;
  /** The validated save, present only when `status` is `valid`. */
  readonly save?: SaveV2;
  /** The boot allow-lists the writer's semantic check uses (T-05-19). */
  readonly allow: SaveAllowLists;
}

export interface StartOptions {
  /** New game is the default; a restore is Continue. */
  readonly fresh?: boolean;
  /** A validated blob to restore instead of starting at Lave. */
  readonly restore?: SaveV2;
}

/**
 * Test-only failure injection (Phase 6 WR-04, D-18). Nothing in this shape is
 * read from a URL: `src/main.ts` builds it from a page global, and only inside
 * the test-only build where `__WEGOLITE_TEST_SEAMS__` is compiled in.
 */
export interface SessionFaults {
  readonly failDestinationBuild?: boolean;
}

/** The message the injected destination-build fault throws (WR-04). */
export { DESTINATION_BUILD_FAULT_MESSAGE } from "./session/hyperspace-controller.js";

export interface GameSessionOptions {
  readonly renderer: THREE.WebGLRenderer;
  readonly assets: AssetCache;
  readonly scenes: SceneManager;
  readonly title: TitleScreen;
  readonly docked: StationShell;
  readonly hudCanvas: HTMLCanvasElement;
  readonly probe: WegoliteProbe;
  readonly system: System;
  /**
   * The validated galaxy catalogue (plan 06-04). Every target id resolves
   * through this map; the chart plots the same records. Defaults to the boot
   * system alone, which keeps a probe/unit harness working without content.
   */
  readonly galaxy?: readonly System[];
  readonly pauseRoot: HTMLElement;
  readonly controlsRoot: HTMLElement;
  readonly settingsRoot: HTMLElement;
  /** The canvas that receives focus when the pause overlay closes. */
  readonly gameRoot: HTMLElement;
  /** DOCK-07: the boot read and the store every autosave writes through. */
  readonly save: GameSessionSave;
  /**
   * Plan 04-05 attaches the purchase autosave here. Called after every accepted
   * profile change (purchase or dev-seam grant), so a reload cannot silently
   * undo it without re-opening the panel code.
   */
  readonly onProfileChanged?: (profile: PlayerProfile) => void;
  /**
   * Test-only fault injection (D-18). Consumed only inside the committed-arrival
   * build in `handleHyperspaceJumped`. Never read from a URL, and passed only by
   * the test-only build (`vite.seams.config.ts`), never by the shipped bundle.
   */
  readonly faults?: SessionFaults;
}

export interface GameSession {
  /**
   * Load the assets, build the Lave scene and start the render loop. A restore
   * resumes the validated docked save; the default starts a New game and clears
   * this build's save first.
   */
  start(options?: StartOptions): Promise<void>;
  /** The HUD needs the same resize as the WebGL canvas. */
  resize(): void;
  /** Freeze the simulation and show the pause overlay (D-14/D-15). */
  pause(): void;
  /** Resume from pause and discard any hidden time (D-14). */
  resume(): void;
  isPaused(): boolean;
  /**
   * QUAL-05: the WebGL context was lost. Pauses at once, shows the recovery
   * notice, and blocks resume and every save until `exitContextLoss`.
   */
  enterContextLoss(): void;
  /**
   * QUAL-05: the WebGL context was restored. Stays paused (D-15), redraws the
   * live scene into the new context, and shows the resume notice.
   */
  exitContextLoss(): void;
  /** Clear every held key without changing the paused flag (focus loss). */
  clearInput(): void;
  /**
   * D-15: the window lost focus or the tab was hidden. Held input is always
   * cleared. The game pauses only when the pause-on-focus-loss setting is on,
   * which is the default.
   */
  focusLost(): void;
  /**
   * The tab became visible again. A docked or paused session has stopped
   * drawing, and a browser may drop a hidden tab's canvas, so the next frames
   * are drawn again.
   */
  shown(): void;
  dispose(): void;
}

export function createGameSession(options: GameSessionOptions): GameSession {
  const {
    renderer,
    assets,
    scenes,
    title,
    docked,
    hudCanvas,
    probe,
    pauseRoot,
    controlsRoot,
    settingsRoot,
    gameRoot,
    save: saveBoot,
    onProfileChanged = () => undefined,
  } = options;

  // D-18: test-only failure injection, read once here and consumed only by the
  // committed-arrival build in handleHyperspaceJumped.
  const faults = options.faults;
  const galaxy = options.galaxy ?? [options.system];
  const galaxyById = new Map<string, System>();

  const player = new PlayerController();
  const scripted = new ScriptedLaunchController();
  const pending: Command[] = [];
  const uiController = new AbortController();

  // Every mutable field of the session lives here (D-12 step 1, G-8). A live
  // field is read and written through `ctx` at the moment it is needed; a block
  // may alias one for a single call but never keeps the alias beyond it.
  const ctx: SessionState = createSessionState({
    system: options.system,
    saveStatus: saveBoot.status,
    saveSkipReason: statusSkipReason(saveBoot.status),
  });

  const saveProbe: WegoliteSaveProbe = {
    status: ctx.save.saveStatus,
    attempts: 0,
    writes: 0,
    committed: 0,
    revision: 0,
    lastClock: null,
    continueVisible: false,
    skipReason: ctx.save.saveSkipReason,
    unavailable: ctx.save.saveUnavailable,
  };
  probe.save = saveProbe;

  // Skips the draw of a frame that would repeat the last one (docked, paused).
  const redrawGate = createRedrawGate();
  const messages = createMessageQueue(4);
  const launchSequence: LaunchSequence = createLaunchSequence();

  // D-12 step 7: the hyperspace arrival and the helpers it needs (entering a
  // system scene, the committed target, the refusal copy, the status overlay).
  // It is built before the station controller and the render driver because
  // they take `targetSystem`; the autosave and the economy probe, whose owners
  // are built later, are reached through call-time wrappers.
  const hyperspaceController = createHyperspaceController(ctx, {
    scenes,
    galaxyById,
    messages,
    faults,
    showBootFailure,
    publishFailure,
    autosave: () => {
      saveController.autosave();
    },
    syncEconomyProbe: () => {
      probePublisher.syncEconomyProbe();
    },
  });
  const {
    refusalCopy,
    handleHyperspaceJumped,
    enterSystemById,
    targetSystem,
    syncStatusOverlay,
  } = hyperspaceController;

  // D-12 step 5: the docked station computer (trade, fitting, selection, the
  // station render, the navigation tabs and the drained station actions). It is
  // built first because the probe publisher, the render driver and the
  // controllers below take its functions; the owners that are built later (the
  // probe publisher, the chart controller) reach it through call-time wrappers.
  const stationController = createStationController(ctx, {
    docked,
    pending,
    onProfileChanged,
    targetSystem,
    canOverwrite,
    syncEconomyProbe: () => {
      probePublisher.syncEconomyProbe();
    },
    autosave: () => {
      saveController.autosave();
    },
    openChart: () => {
      chartController.openChart();
    },
    closeChart: () => {
      chartController.closeChart();
    },
    openSaveScreen: () => {
      saveController.openSaveScreen();
    },
    closeSaveScreen: () => {
      saveController.closeSaveScreen();
    },
  });
  const {
    ensureSelection,
    equipmentSet,
    fitContext,
    syncStationNav,
    refreshStationChrome,
    renderStation,
    commitProfile,
    openStationScreen,
    navigateStation,
    setStationPage,
    applyStationAction,
  } = stationController;

  // D-12 step 2: everything the session publishes on the page's probe. The
  // lifecycle, built last, owns the scene swap and dispose the `?test=1` hook
  // drives, so they are reached through call-time wrappers.
  const probePublisher = createProbePublisher(ctx, {
    probe,
    renderer,
    scenes,
    saveProbe,
    redrawGate,
    messages,
    commitProfile,
    swapSystem: () => lifecycle.swapSystem(),
    disposeSystem: () => {
      lifecycle.disposeSystem();
    },
  });

  // D-12 step 3: the redraw gate's decision and the per-frame scene, HUD and
  // probe update. frame() keeps the one gated draw call.
  const renderDriver: RenderDriver = createRenderDriver(ctx, {
    renderer,
    hudCanvas,
    probe,
    redrawGate,
    messages,
    launchSequence,
    galaxyById,
    updateProbe: probePublisher.updateProbe,
    renderStation,
    targetSystem,
  });
  const { renderFrame, shouldDraw } = renderDriver;

  // D-12 step 6: autosave, manual save, in-session Load, the New-game clear and
  // the F2 Save/Load screen. The station controller built above reaches the
  // autosave and the two screen openers through call-time wrappers.
  const saveController = createSaveController(ctx, {
    saveBoot,
    galaxyById,
    docked,
    hudCanvas,
    probe,
    messages,
    enterSystemById,
    syncStatusOverlay,
    renderFrame,
    renderStation,
    syncStationNav,
    ensureSelection,
    updateProbe: probePublisher.updateProbe,
    syncSaveProbe: probePublisher.syncSaveProbe,
    syncEconomyProbe: probePublisher.syncEconomyProbe,
    bindTestHook: probePublisher.bindTestHook,
  });
  const {
    autosave,
    manualSave,
    writeManualSave,
    loadFromSave,
    clearSaveForNewGame,
    closeSaveScreen,
    handleSaveScreenActions,
  } = saveController;

  // D-12 step 4: the chart overlay's logic, and pause, focus loss, context loss,
  // the controls and settings panels and graphics quality. Neither factory
  // registers a listener: the window keydown registrations stay below until
  // split step 9 moves them into the session lifecycle.
  const chartController = createChartController(ctx, {
    galaxy,
    galaxyById,
    updateProbe: probePublisher.updateProbe,
    syncStationNav,
  });
  const settingsController = createSettingsController(ctx, {
    scenes,
    renderFrame,
    syncStationNav,
    refreshStationChrome,
    performSwap: () => {
      lifecycle.performSwap();
    },
  });
  const { setChartCamera, selectChartSystem, handleChartActions } =
    chartController;
  const {
    persistSettings,
    pause,
    focusLost,
    resume,
    enterContextLoss,
    exitContextLoss,
    backToPause,
    openControls,
    syncQualityToggle,
    applyQuality,
    openSettings,
    resetAllSettings,
    onSubpanelKeyDown,
  } = settingsController;

  // D-12 step 8: sim events go through the ordered router (the four gameplay
  // subscribers, in `EVENT_SUBSCRIBER_ORDER`), and the sim driver owns the
  // drain, the launch filter, the pre-launch autosave and the one flight-step
  // call site. Both are built after every function they call.
  const router = createEventRouter(ctx, {
    stationFlow: createStationFlow(ctx, {
      launchSequence,
      docked,
      hudCanvas,
      messages,
      syncStationNav,
      syncEconomyProbe: probePublisher.syncEconomyProbe,
      persistSettings,
      ensureSelection,
      renderStation,
      autosave,
    }),
    hudMessages: createHudMessages({ galaxyById, messages }),
    dockFeedback: createDockFeedbackFlow(ctx, { messages }),
    hyperspaceFlow: createHyperspaceFlow(ctx, {
      messages,
      refusalCopy,
      handleHyperspaceJumped,
    }),
  });
  const simDriver = createSimDriver(ctx, {
    pending,
    player,
    scripted,
    launchSequence,
    router,
    equipmentSet,
    targetSystem,
    autosave,
    // Late-bound so the construction order never matters (08-14).
    markHookMutation: () => {
      probePublisher.markHookMutation();
    },
  });

  // D-12 step 9: the frame shell, then the lifecycle (start-up, resize, the
  // scene swap and the teardown). The lifecycle registers the two window
  // keydown listeners as it is built, at this same point of the construction
  // order as before the split. The step-4 and probe-publisher wrappers above
  // reach its swap and dispose functions at call time.
  const frame = createFrameLoop(ctx, {
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
    updateProbe: probePublisher.updateProbe,
  });
  const lifecycle = createSessionLifecycle(ctx, {
    assets,
    scenes,
    title,
    docked,
    hudCanvas,
    probe,
    pauseRoot,
    controlsRoot,
    gameRoot,
    settingsRoot,
    saveBoot,
    galaxy,
    galaxyById,
    pending,
    launchSequence,
    uiController,
    redrawGate,
    frame,
    renderFrame,
    showBootFailure,
    publishFailure,
    probePublisher,
    syncStatusOverlay,
    ensureSelection,
    refreshStationChrome,
    renderStation,
    syncStationNav,
    fitContext,
    commitProfile,
    openStationScreen,
    navigateStation,
    setStationPage,
    clearSaveForNewGame,
    closeSaveScreen,
    manualSave,
    writeManualSave,
    loadFromSave,
    autosave,
    selectChartSystem,
    setChartCamera,
    persistSettings,
    resume,
    openControls,
    openSettings,
    backToPause,
    resetAllSettings,
    applyQuality,
    syncQualityToggle,
    onSubpanelKeyDown,
  });

  return {
    start: lifecycle.start,
    resize: lifecycle.resize,
    pause,
    resume,
    isPaused: () => ctx.runtime.paused,
    enterContextLoss,
    exitContextLoss,
    clearInput: () => {
      ctx.runtime.input?.clearAll();
    },
    focusLost,
    shown: () => {
      redrawGate.request();
    },
    dispose: lifecycle.dispose,
  };
}

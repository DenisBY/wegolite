// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The composition root (Pattern 2, FLGT-07).
 *
 * This is the only module that wires the simulation, the scene, the HUD, the
 * input source and the UI together. It owns the single `FlightState`, samples
 * input once per rendered frame, runs whole fixed steps, and reads the state
 * once per rendered frame for the HUD and the probe.
 *
 * Boot order matters (T-3-02): both GLBs are awaited before the first frame. On
 * a rejected load the session publishes a failure and returns without
 * scheduling a frame — never a live canvas over an empty scene.
 */

import * as THREE from "three";
import { showBootFailure } from "./boot-failure.js";
import {
  loadShipCatalogue,
  playerShip,
  stationShip,
} from "../content/ships.js";
import { loadDockPort } from "../content/dock-port.js";
import { loadEquipment } from "../content/equipment.js";
import { loadCommodities } from "../content/commodities.js";
import { loadLabels } from "../content/labels.js";
import type { System } from "../content/types.js";
import { shouldEmitScrapeMessage } from "./dock-feedback.js";
import { mapHyperspaceBeginEdges } from "./hyperspace-commands.js";
import { createGameLoop } from "./game-loop.js";
import { publishFailure } from "./probe.js";
import type { WegoliteProbe, WegoliteSaveProbe } from "./probe.js";
import type { SceneManager } from "./scene-manager.js";
import { createHintController } from "./hints.js";
import { createLaunchSequence } from "./launch-sequence.js";
import { createRedrawGate } from "./redraw-gate.js";
import { createSessionState } from "./session/context.js";
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
import { createHyperspaceController } from "./session/hyperspace-controller.js";
import { createStationController } from "./session/station-controller.js";
import type { SessionState } from "./session/context.js";
import type { LaunchSequence } from "./launch-sequence.js";
import type { AssetCache } from "../render/asset-cache.js";
import { profileFromSave, restoreFromSave } from "../persistence/autosave.js";
import type { SaveAllowLists, SaveV2 } from "../persistence/save.js";
import type { SaveStore, SaveStatus } from "../persistence/store.js";
import { createBreakPattern } from "../render/break-pattern.js";
import { createHud } from "../render/hud/hud.js";
import { createMessageQueue } from "../render/hud/messages.js";
import type { Command } from "../sim/commands.js";
import type { SimEvent } from "../sim/events.js";
import { createDockGeometry } from "../sim/dock/geometry.js";
import { deriveFlightConfig } from "../sim/flight/config.js";
import {
  PlayerController,
  ScriptedLaunchController,
  flightView,
} from "../sim/flight/controller.js";
import { initFlightState, poseOf } from "../sim/flight/state.js";
import type { FlightState } from "../sim/flight/state.js";
import { stepFlight } from "../sim/flight/step.js";
import type { StepOptions } from "../sim/flight/step.js";
import { newProfile } from "../sim/player/profile.js";
import type { PlayerProfile } from "../sim/player/profile.js";
import { generateMarket, marketSeedForSystem } from "../sim/economy/market.js";
import type { Market } from "../sim/economy/market.js";
import {
  countdownSecondsRemaining,
  witchspaceStationMass,
} from "../sim/hyperspace/countdown.js";
import type { TradePlan } from "../sim/economy/trade.js";
import { applyFit, checkFit } from "../sim/player/outfitting.js";
import { createChart } from "../ui/chart.js";
import { createSaveLoadScreen } from "../ui/save-load.js";
import { buildChartView } from "../ui/chart-model.js";
import { buildSystemDataModel } from "../ui/station-model.js";
import { createStationNav } from "../ui/station-nav.js";
import { DT } from "../sim/time.js";
import { createKeyboardInputSource } from "../input/keyboard.js";
import { createBindingMap } from "../input/bindings.js";
import { loadSettings } from "../settings/store.js";
import { createControlsPanel } from "../ui/controls.js";
import { createPauseOverlay } from "../ui/pause.js";
import { createSettingsPanel } from "../ui/settings-panel.js";
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
  // function declarations below are hoisted, so the dependencies exist now.
  const probePublisher = createProbePublisher(ctx, {
    probe,
    renderer,
    scenes,
    saveProbe,
    redrawGate,
    messages,
    commitProfile,
    swapSystem,
    disposeSystem,
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
    performSwap,
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

  /** D-08 copy is app-owned and fixed; the sim event carries facts only. */
  function bounceMessage(event: {
    cause: "hull" | "straddle";
    axis: "x" | "y" | "z";
  }): string {
    if (event.cause === "straddle") {
      return "Too wide for the slot - roll 90 degrees to match the opening";
    }
    if (event.axis === "x") {
      return "Hull contact - roll 90 degrees and line up with the slot";
    }
    return "Hull contact - pull away and line up with the slot";
  }

  window.addEventListener("keydown", onSubpanelKeyDown, {
    capture: true,
    signal: uiController.signal,
  });

  /**
   * D-10: after the first viewing, any key during `launching` skips to the
   * handover. Before `launchSeen` the key is ignored, so the first launch always
   * plays in full. The skip is a command, not a state mutation: the simulation
   * still applies the +600 s clock exactly once.
   */
  function onLaunchKeyDown(event: KeyboardEvent): void {
    const currentState = ctx.core.state;
    if (currentState === undefined || currentState.mode !== "launching") return;
    if (ctx.runtime.paused || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!launchSequence.canSkip(ctx.core.launchSeen)) return;
    pending.push({ kind: "skipLaunch" });
    event.preventDefault();
  }

  window.addEventListener("keydown", onLaunchKeyDown, {
    capture: true,
    signal: uiController.signal,
  });

  function handleEvent(event: SimEvent): void {
    switch (event.kind) {
      case "launched":
        launchSequence.reset();
        ctx.station.stationScreen = "home";
        ctx.station.stationPending = null;
        ctx.station.stationNotice = "";
        ctx.station.stationMessage = "";
        ctx.station.stationPage = 1;
        ctx.runtime.input?.setContext("flight");
        docked.hide();
        syncStationNav();
        hudCanvas.hidden = false;
        messages.enqueue("Launching — stand by");
        // D-17: no write here. The pre-launch anchor was taken in `frame()`
        // while the state was still docked.
        probePublisher.syncEconomyProbe();
        break;
      case "launchComplete":
        launchSequence.markSeen();
        ctx.core.launchSeen = true;
        if (
          ctx.runtime.settings !== undefined &&
          !ctx.runtime.settings.launchSeen
        ) {
          ctx.runtime.settings.launchSeen = true;
          persistSettings();
        }
        messages.enqueue("Arrows pitch and roll · W and S change speed");
        break;
      case "docked": {
        // D-12: the exact delta is the event's, never a wall/frame comparison.
        ctx.core.lastDockClockDelta = event.clockDelta;
        launchSequence.reset();
        ctx.station.stationScreen = "home";
        ctx.station.stationPending = null;
        ctx.station.stationNotice = "";
        ctx.station.stationMessage = "";
        ctx.station.stationPage = 1;
        ctx.runtime.input?.setContext("dockHome");
        docked.show(ctx.core.system.name);
        ensureSelection();
        renderStation();
        syncStationNav();
        if (event.via === "computer") {
          messages.enqueuePriority("Docking computers engaged");
          ctx.station.stationMessage = "Docking computers engaged";
          renderStation();
        }
        // D-09/D-15: stop any held input and collapse the interpolation window
        // onto the docked pose so the camera does not smear across the teleport.
        ctx.runtime.input?.clearAll();
        const currentState = ctx.core.state;
        if (currentState !== undefined) {
          const dockedPose = poseOf(currentState);
          ctx.core.previousPose = dockedPose;
          ctx.core.currentPose = dockedPose;
        }
        // D-17: both manual and computer docking anchor once, after the station
        // screen, selection and docked pose are ready. No other path writes on
        // docking.
        autosave();
        break;
      }
      case "dockDenied":
        // D-11: fixed app-owned copy; priority so it is visible immediately.
        messages.enqueuePriority(
          event.reason === "notInstalled"
            ? "No docking computer fitted"
            : "Too far from the station to engage docking computer",
        );
        break;
      case "torusEngaged":
        messages.enqueue(`Torus engaged at ${event.factor.toFixed(1)}×`);
        break;
      case "torusDisengaged":
        messages.enqueue("Torus disengaged");
        break;
      case "massLockChanged":
        if (event.locked) messages.enqueue("Mass locked");
        break;
      case "bounce":
        ctx.core.dockFeedback.trigger(
          "bounce",
          ctx.core.state?.flightTime ?? 0,
        );
        messages.enqueuePriority(bounceMessage(event));
        break;
      case "scrape": {
        // Pitfall 8: the sim emits one scrape per correcting tick (120 Hz);
        // the message line is throttled to one per simulated second.
        const now = ctx.core.state?.flightTime ?? 0;
        ctx.core.dockFeedback.trigger("scrape", now);
        if (shouldEmitScrapeMessage(ctx.core.lastScrapeMessageTime, now)) {
          messages.enqueuePriority(
            "Scrape - ease toward the centre of the slot",
          );
          ctx.core.lastScrapeMessageTime = now;
        }
        break;
      }
      case "compassTargetChanged":
        messages.enqueue(`Compass target: ${event.target}`);
        break;
      case "hyperspaceCountdownStarted": {
        const name = galaxyById.get(event.destinationId)?.name ?? "(Unknown)";
        messages.enqueue(
          `Hyperspace to ${name} in ${String(countdownSecondsRemaining(event.countdownSteps))} seconds`,
        );
        break;
      }
      case "hyperspaceCountdownCancelled":
        messages.enqueue("Hyperspace countdown cancelled");
        break;
      case "hyperspaceRefused":
        ctx.core.lastRefusal = { reason: event.reason };
        messages.enqueuePriority(refusalCopy(event.reason));
        break;
      case "hyperspaceJumped":
        handleHyperspaceJumped(event);
        break;
    }
  }

  function frame(now: number): void {
    ctx.runtime.rafId = requestAnimationFrame(frame);
    probe.frames += 1;

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

    // D-01: consume the chart edges before the freeze branch, so F6 opens and
    // closes and a KeyP over the chart still reaches the pause handler above.
    handleChartActions(currentInput.drainChartActions());
    // D-20: the F2 screen is another opaque edge-driven overlay; its actions
    // are applied before the freeze so Save/Load can run and Return can close.
    if (ctx.chart.chartOpen) currentInput.drainSaveScreenActions();
    else handleSaveScreenActions(currentInput.drainSaveScreenActions());

    if (ctx.chart.chartOpen) {
      // The overlay is opaque: drain everything, advance nothing, paint nothing.
      currentInput.drainCommands();
      currentInput.drainStationActions();
      pending.length = 0;
      ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
      redrawGate.request();
      probePublisher.updateProbe();
      return;
    }

    if (ctx.save.saveScreenOpen) {
      // The save screen is opaque too: no fixed step runs behind it.
      currentInput.drainCommands();
      currentInput.drainStationActions();
      pending.length = 0;
      ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
      redrawGate.request();
      probePublisher.updateProbe();
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
      const drained: Command[] = [
        ...currentInput.drainCommands(),
        ...pending,
      ].filter(
        (command) =>
          command.kind !== "launch" ||
          (currentState.mode === "docked" &&
            ctx.station.stationScreen === "home"),
      );
      pending.length = 0;
      // D-17: the pre-launch anchor is taken while the state is still docked,
      // before `beginLaunch` applies the +600 s transition.
      if (
        currentState.mode === "docked" &&
        ctx.station.stationScreen === "home" &&
        drained.some((command) => command.kind === "launch")
      ) {
        autosave();
      }
      // D-06: while a countdown runs, the same key aborts it at no cost. The
      // mapping walks the drained array in input order, so two presses drained
      // into one frame start then cancel (G-6), and no app timer or double
      // command exists.
      const commands = mapHyperspaceBeginEdges(
        drained,
        currentState.hyperspaceCountdown > 0,
      );
      // One immutable frame per rendered frame, shared by every fixed step.
      const frameInput = currentInput.frame();
      ctx.core.currentFrame = frameInput;

      alpha = currentLoop.advance(delta, commands, (stepCommands) => {
        // A jump can commit mid-frame; read the live session layout/system for
        // every step after the swap (never a frame-captured origin layout).
        const liveState = ctx.core.state;
        const liveLayout = ctx.core.layout;
        const liveConfig = ctx.core.config;
        if (
          liveState === undefined ||
          liveLayout === undefined ||
          liveConfig === undefined
        ) {
          return;
        }
        ctx.core.previousPose = ctx.core.currentPose;
        const modeBefore = liveState.mode;
        const controller = liveState.mode === "launching" ? scripted : player;
        const intent = controller.update(flightView(liveState), frameInput);
        // Ownership travels beside the command, never inside it: one read-only
        // set per frame, derived from the profile (T-04-19).
        const equipment = equipmentSet();
        const committedTarget = targetSystem();
        // The read-only station mass of the live system's station kind. Only a
        // Coriolis station has a recorded mass; the others omit the fact.
        const stationMass = witchspaceStationMass(ctx.core.system.station);
        const hyperspace = {
          fuel: ctx.core.profile.fuel,
          origin: {
            id: ctx.core.system.id,
            x: ctx.core.system.chartX,
            y: ctx.core.system.chartY,
          },
          ...(committedTarget === undefined
            ? {}
            : {
                target: {
                  id: committedTarget.id,
                  x: committedTarget.chartX,
                  y: committedTarget.chartY,
                },
              }),
          ...(stationMass === undefined ? {} : { stationMass }),
        };
        const stepOptions: StepOptions =
          ctx.core.dockGeometry === undefined
            ? { equipment, hyperspace }
            : { dock: ctx.core.dockGeometry, equipment, hyperspace };
        const events = stepFlight(
          liveState,
          liveLayout,
          liveConfig,
          intent,
          stepCommands,
          DT,
          stepOptions,
        );
        for (const event of events) handleEvent(event);
        // The view timeline advances on the same fixed steps as the simulation,
        // and only after the step that entered `launching` (which does not move
        // the ship either).
        if (modeBefore === "launching") {
          launchSequence.advance(DT, liveState.mode === "inFlight");
        }
        ctx.core.currentPose = poseOf(liveState);
      });
    } else {
      // A key pressed while paused must not become a queued edge command that
      // fires on resume.
      currentInput.drainCommands();
      pending.length = 0;
      ctx.core.currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
    }

    renderFrame(alpha, shouldDraw());
  }

  /**
   * Start the session. Never rejects: a step that throws outside its own
   * handler (the ship catalogue, the scene build, a restore) is shown on the
   * failure surface, exactly like a failed asset load. Without this the title
   * screen would stay up with both buttons dead, because `starting` is set.
   */
  async function start(options: StartOptions = {}): Promise<void> {
    try {
      await startSession(options);
    } catch (error) {
      if (ctx.runtime.disposed) return;
      const reason = error instanceof Error ? error.message : String(error);
      console.error("Wegolite: the session failed to start", error);
      showBootFailure(reason);
      publishFailure(reason);
    }
  }

  async function startSession(options: StartOptions): Promise<void> {
    // The guard is set synchronously: `state` is only assigned after two
    // awaits, so a second click during the load would otherwise start a second
    // frame loop (two RAF chains, two HUDs, two input sources) that `dispose()`
    // could never fully cancel.
    if (
      ctx.core.state !== undefined ||
      ctx.runtime.starting ||
      ctx.runtime.disposed
    )
      return;
    ctx.runtime.starting = true;

    // D-09/T-06-12: every target id is resolved through this validated map.
    galaxyById.clear();
    for (const entry of galaxy) galaxyById.set(entry.id, entry);
    if (!galaxyById.has(ctx.core.system.id))
      galaxyById.set(ctx.core.system.id, ctx.core.system);

    const restore = options.restore;
    const restoring = restore !== undefined && options.fresh !== true;

    try {
      await assets.preload();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // T-3-02: a failed model load must be visible, never a blank canvas, and
      // no frame may be scheduled after it.
      showBootFailure(reason);
      publishFailure(reason);
      return;
    }

    // A `pagehide` during the load disposes the session; resuming into a
    // disposed asset cache would reject unhandled.
    if (ctx.runtime.disposed) return;

    const catalogue = await loadShipCatalogue();

    if (ctx.runtime.disposed) return;

    // D-10/T-04-43: the equipment catalogue is the only source of a price and a
    // tech level. The commodity catalogue is the only source of the market
    // coefficients. A missing or malformed record fails the boot visibly,
    // exactly like the ship catalogue.
    try {
      const [equipment, loadedCommodities, loadedLabels] = await Promise.all([
        loadEquipment(),
        loadCommodities(),
        loadLabels(),
      ]);
      if (ctx.runtime.disposed) return;
      ctx.core.equipmentCatalogue = equipment;
      ctx.core.commodities = loadedCommodities;
      ctx.core.labels = loadedLabels;
      ctx.core.commodityUnits = new Map(
        loadedCommodities.map((commodity) => [commodity.key, commodity.unit]),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showBootFailure(reason);
      publishFailure(reason);
      return;
    }

    const playerDef = playerShip(catalogue).shipDef;
    const stationEntry = stationShip(catalogue);
    const station = stationEntry.shipDef;
    ctx.core.stationDef = station;
    ctx.core.stationKey = stationEntry.key;

    const flightConfig = deriveFlightConfig(playerDef);
    // SAVE-03/D-18: resolve the saved system before the first scene is built,
    // so a Continue never flashes Lave or builds the wrong layout.
    if (restoring && restore !== undefined) {
      const savedSystem = galaxyById.get(restore.system.id);
      if (savedSystem !== undefined) ctx.core.system = savedSystem;
    }
    // The graphics quality selects the planet's shader variant and the
    // atmosphere shell, so the settings are read before the first scene is
    // built; a Continue at High never flashes the Standard planet.
    const loaded = loadSettings();
    scenes.setQuality(loaded.quality);
    const nextScene = scenes.enterSystem(ctx.core.system, station);
    const systemLayout = scenes.layout();
    if (systemLayout === undefined) {
      throw new Error(
        "Wegolite: the scene manager entered a system without a layout.",
      );
    }

    // D-01/DOCK-01: the generated aperture is validated and converted into the
    // port frame once, here, and injected into every fixed step as plain data.
    try {
      const rawDockPort = await loadDockPort();
      if (ctx.runtime.disposed) return;
      ctx.core.dockGeometry = createDockGeometry(
        rawDockPort,
        systemLayout.dockOffset,
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      showBootFailure(reason);
      publishFailure(reason);
      return;
    }

    if (!restoring) {
      // New game: the clear must commit before this promise resolves, so a
      // reload after the click cannot resurrect the old blob. A future blob is
      // never touched (T-04-47). It runs only here, after every load that can
      // fail has succeeded: a new game that cannot start must not have
      // deleted the save it was going to replace.
      await clearSaveForNewGame();
      if (ctx.runtime.disposed) return;
    }

    let flightState: FlightState;
    let restoredProfile: PlayerProfile | undefined;
    let restoredMarket: Market | undefined;
    let restoredMarketSeed: number | undefined;
    if (restoring && restore !== undefined) {
      const restored = restoreFromSave(restore, systemLayout, profileFromSave);
      flightState = restored.state;
      restoredProfile = restored.profile;
      restoredMarket = restored.market;
      restoredMarketSeed = restored.market?.seed ?? restored.marketSeed;
    } else {
      flightState = initFlightState(systemLayout);
    }
    const restoredInFlight = flightState.mode === "inFlight";

    ctx.core.state = flightState;
    ctx.core.layout = systemLayout;
    ctx.core.config = flightConfig;
    ctx.core.scene = nextScene;
    ctx.core.profile = restoredProfile ?? newProfile();
    // SAV-03/D-18: the committed target travels with the save. Only an id the
    // validated catalogue knows is installed (T-06-12).
    if (restoring && restore !== undefined) {
      const savedTarget = restore.targetSystem;
      ctx.core.hyperspaceTargetId =
        savedTarget !== undefined && galaxyById.has(savedTarget)
          ? savedTarget
          : undefined;
    }
    syncStatusOverlay();

    // D-17/D-18/D-19: resolve the seed once and generate the market once. A
    // later `docked` event reuses this market; only Phase 6's system change re-seeds.
    const loadedCatalogue = ctx.core.commodities ?? [];
    // Block-local alias for the pinned seed expression; read once, never kept.
    const { system } = ctx.core;
    ctx.core.marketSeed =
      restoring && restore !== undefined
        ? (restoredMarketSeed ?? marketSeedForSystem(system.id))
        : marketSeedForSystem(system.id);
    // D-18/SAVE-06: a saved snapshot is used verbatim; only a v1 migration or a
    // fresh game regenerates from the seed. Plan 06-04 owns the system swap.
    ctx.core.market =
      restoredMarket ??
      generateMarket(ctx.core.system, loadedCatalogue, ctx.core.marketSeed);
    ensureSelection();
    ctx.runtime.hud = createHud(hudCanvas);
    ctx.runtime.hud.resize();
    ctx.runtime.breakPattern = createBreakPattern(hudCanvas);
    hudCanvas.hidden = true;
    ctx.chart.chart = createChart(document.body);
    ctx.chart.chart.setViewBuilder((viewport) =>
      buildChartView(
        galaxy,
        ctx.core.system.id,
        ctx.core.hyperspaceTargetId,
        ctx.chart.chartCamera,
        ctx.core.profile.fuel,
        viewport,
        ctx.chart.chartSelectedId,
      ),
    );
    ctx.chart.chart.setTooltipBuilder((id) => {
      const info = galaxyById.get(id);
      if (info === undefined || ctx.core.labels === undefined) return undefined;
      const model = buildSystemDataModel(
        info,
        ctx.core.system,
        ctx.core.labels,
      );
      return {
        title: info.name,
        fields: model.fields,
        description: model.description,
      };
    });
    ctx.chart.chart.onSelect((id) => {
      selectChartSystem(id);
    });
    ctx.chart.chart.onCamera((camera) => {
      setChartCamera(camera);
    });
    ctx.save.saveLoad = createSaveLoadScreen(document.body);
    ctx.save.saveLoad.onReturn(() => {
      closeSaveScreen();
    });
    ctx.save.saveLoad.onSave(() => {
      manualSave();
    });
    ctx.save.saveLoad.onLoad(() => {
      void loadFromSave();
    });
    ctx.save.saveLoad.onOverwriteConfirmed(() => {
      writeManualSave();
    });
    // A mouse Cancel closes the dialog on the screen alone; the session only
    // needs to publish the state the dialog now reports.
    ctx.save.saveLoad.onOverwriteCancelled(() => {
      probePublisher.updateProbe();
    });
    ctx.station.stationNav = createStationNav(document.body, {
      onNavigate: (id) => {
        navigateStation(id);
      },
      onStatusPage: (page) => {
        setStationPage(page);
      },
    });

    const bindingMap = createBindingMap(loaded.bindings);
    ctx.runtime.settings = { ...loaded, bindings: bindingMap };
    ctx.runtime.bindings = bindingMap;
    // Both overlay footers get their default hints before first open, and a
    // restored in-flight session (which never runs renderStation) still gets
    // the chart and Save/Load hint lines.
    refreshStationChrome();
    ctx.core.launchSeen = loaded.launchSeen;
    if (ctx.core.launchSeen) launchSequence.markSeen();
    ctx.runtime.hints = createHintController({
      bindings: bindingMap,
      seen: ctx.runtime.settings.hintsSeen,
      onSeen: (id) => {
        const currentSettings = ctx.runtime.settings;
        if (currentSettings === undefined) return;
        if (!currentSettings.hintsSeen.includes(id)) {
          currentSettings.hintsSeen.push(id);
        }
        persistSettings();
      },
    });

    ctx.runtime.input = createKeyboardInputSource(bindingMap);
    ctx.runtime.input.setStationScreenHandler((action) => {
      openStationScreen(action);
    });
    ctx.runtime.input.setContext(restoredInFlight ? "flight" : "dockHome");
    ctx.runtime.input.setPaused(false);
    ctx.runtime.input.attach();
    ctx.runtime.loop = createGameLoop();
    ctx.core.previousPose = poseOf(flightState);
    ctx.core.currentPose = ctx.core.previousPose;
    ctx.core.previousCameraWorld = undefined;

    ctx.runtime.pauseOverlay = createPauseOverlay({
      root: pauseRoot,
      gameRoot,
      onResume: () => {
        resume();
      },
      onControls: () => {
        openControls();
      },
      onSettings: () => {
        openSettings();
      },
    });
    ctx.runtime.controlsPanel = createControlsPanel(bindingMap, {
      root: controlsRoot,
      onChange: (next) => {
        ctx.runtime.input?.setBindings(next);
        persistSettings();
        refreshStationChrome();
      },
      onReset: () => {
        resetAllSettings();
      },
      onBack: () => {
        backToPause();
      },
    });
    ctx.runtime.settingsPanel = createSettingsPanel({
      root: settingsRoot,
      onBack: () => {
        backToPause();
      },
      onControls: () => {
        openControls();
      },
      onReset: () => {
        resetAllSettings();
      },
      onPauseOnFocusLossChange: (enabled) => {
        if (ctx.runtime.settings === undefined) return;
        ctx.runtime.settings.pauseOnFocusLoss = enabled;
        persistSettings();
      },
      onQualityChange: (quality) => {
        if (ctx.runtime.settings === undefined) return;
        // Persist only what was applied; on failure the toggle snaps back.
        if (applyQuality(quality)) {
          ctx.runtime.settings.quality = quality;
          persistSettings();
        }
        syncQualityToggle();
      },
    });

    // The hook exists only when explicitly asked for with exactly `?test=1`,
    // and only mutates the live state: no save, no arbitrary code (T-04-08).
    ctx.runtime.testHookEnabled =
      new URLSearchParams(window.location.search).get("test") === "1";
    if (ctx.runtime.testHookEnabled) probePublisher.bindTestHook(flightState);

    title.hide();
    if (restoredInFlight) {
      // The last visibility decision: the station overlay must never reappear
      // over an installed in-flight scene.
      docked.hide();
      hudCanvas.hidden = false;
      ctx.runtime.input.setContext("flight");
      // No station render runs on this path, so publish the live economy and
      // durable identities explicitly for the reload proof.
      probePublisher.syncEconomyProbe();
      // Written once, by the install block; updateProbe never touches it, so a
      // proof reads the pose the restore installed, not a resumed one.
      probe.restore = {
        mode: "inFlight",
        systemId: ctx.core.system.id,
        position: [
          flightState.position.x,
          flightState.position.y,
          flightState.position.z,
        ],
        orientation: [
          flightState.orientation.w,
          flightState.orientation.x,
          flightState.orientation.y,
          flightState.orientation.z,
        ],
        speed: flightState.speed,
        clock: flightState.clockSeconds,
      };
    } else {
      ctx.runtime.input.setContext("dockHome");
      docked.show(ctx.core.system.name);
      renderStation();
    }
    // The chart nav is hidden when the session boots in flight.
    syncStationNav();
    docked.onLaunch(() => {
      // D-03: the Launch button is only live on the home screen.
      if (
        ctx.core.state?.mode !== "docked" ||
        ctx.station.stationScreen !== "home"
      )
        return;
      pending.push({ kind: "launch" });
    });
    docked.onRefuel?.(() => {
      if (
        ctx.core.state?.mode !== "docked" ||
        ctx.station.stationScreen !== "home"
      )
        return;
      const catalogue = ctx.core.equipmentCatalogue;
      const fitCtx = fitContext();
      if (catalogue === undefined || fitCtx === undefined) return;
      const item = catalogue.find((entry) => entry.key === "EQ_FUEL");
      if (item === undefined) return;
      const check = checkFit(ctx.core.profile, item, fitCtx);
      if (!check.ok) return;
      const next = applyFit(ctx.core.profile, item, fitCtx);
      if (next === ctx.core.profile) return;
      ctx.station.stationPending = null;
      ctx.station.stationNotice = "Tanks topped up to 7.0 LY";
      ctx.station.lastTrade = { kind: "fit", key: "EQ_FUEL", amount: 1 };
      commitProfile(next);
      autosave();
      renderStation();
    });

    renderFrame(0);
    ctx.runtime.rafId = requestAnimationFrame(frame);
  }

  function resize(): void {
    ctx.runtime.hud?.resize();
    // A resize clears both canvases, and the caller redraws only the scene.
    redrawGate.request();
  }

  /**
   * WORLD-04 test surface: rebuild the active system scene through the manager.
   *
   * The flight state and layout stay put: a swap replaces the scene graph, not
   * the simulation, and only the render references move. That is exactly the
   * ownership boundary the disposal proof is about.
   */
  function performSwap(): void {
    const currentStationDef = ctx.core.stationDef;
    if (ctx.core.state === undefined || currentStationDef === undefined) return;
    ctx.core.scene = scenes.enterSystem(ctx.core.system, currentStationDef);
    ctx.core.layout = scenes.layout() ?? ctx.core.layout;
    // The new dust field has no camera history; a stale delta would smear it.
    ctx.core.previousCameraWorld = undefined;
  }

  function disposeSystem(): void {
    scenes.disposeSystem();
    ctx.core.scene = undefined;
    ctx.core.previousCameraWorld = undefined;
  }

  /**
   * Swap, then settle one real frame so the GPU counters the probe reports
   * describe the new scene rather than the frame before it.
   */
  async function swapSystem(): Promise<void> {
    if (ctx.core.state === undefined) return;
    performSwap();
    renderFrame(0);
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        resolve();
      });
    });
    renderFrame(0);
  }

  /**
   * Teardown (WORLD-04, T-3-22): stop the loop, release every listener, clear
   * the HUD, then free the scene and the shared cache in that order.
   *
   * Idempotent: `pagehide`, `webglcontextlost` and an explicit call may all
   * arrive for the same session. A second call must not double-free or throw.
   */
  function dispose(): void {
    if (ctx.runtime.disposed) return;
    ctx.runtime.disposed = true;

    if (ctx.runtime.rafId !== 0) cancelAnimationFrame(ctx.runtime.rafId);
    ctx.runtime.rafId = 0;

    // Every listener this session added hangs off `uiController`; aborting it
    // also releases the sub-panel controllers' listeners through their own
    // disposers below.
    uiController.abort();
    ctx.station.stationNav?.dispose();
    ctx.station.stationNav = undefined;
    ctx.runtime.input?.clearAll();
    ctx.runtime.input?.dispose();
    ctx.runtime.pauseOverlay?.dispose();
    ctx.runtime.controlsPanel?.dispose();
    ctx.runtime.settingsPanel?.dispose();

    // Scene first, then the cache that owns the shared GLBs it referenced.
    scenes.dispose();
    assets.dispose();

    ctx.runtime.breakPattern?.dispose();
    ctx.runtime.hud?.dispose();
    ctx.chart.chart?.dispose();
    ctx.chart.chart = undefined;
    ctx.chart.chartOpen = false;
    ctx.save.saveLoad?.dispose();
    ctx.save.saveLoad = undefined;
    ctx.save.saveScreenOpen = false;
    docked.dispose();
    title.dispose();

    // Drop the live references so a late callback cannot read a disposed
    // scene, and withdraw the test surface with the session.
    ctx.core.state = undefined;
    ctx.core.scene = undefined;
    ctx.core.layout = undefined;
    probePublisher.withdrawProbe();
    saveBoot.store.dispose();
  }

  return {
    start,
    resize,
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
    dispose,
  };
}

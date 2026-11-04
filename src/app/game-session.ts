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
import type { ShipDef, System } from "../content/types.js";
import { buildHudModel } from "./hud-model.js";
import { createGameLoop } from "./game-loop.js";
import type { GameLoop } from "./game-loop.js";
import { createTestHook, publishFailure, readMemory } from "./probe.js";
import type { WegoliteProbe } from "./probe.js";
import type { SceneManager } from "./scene-manager.js";
import { createHintController } from "./hints.js";
import type { HintContext, HintController } from "./hints.js";
import { createLaunchSequence } from "./launch-sequence.js";
import type { LaunchSequence } from "./launch-sequence.js";
import type { AssetCache } from "../render/asset-cache.js";
import { createBreakPattern } from "../render/break-pattern.js";
import type { BreakPattern } from "../render/break-pattern.js";
import { createHud } from "../render/hud/hud.js";
import type { Hud } from "../render/hud/hud.js";
import type { HudModel } from "../render/hud/draw.js";
import { createMessageQueue } from "../render/hud/messages.js";
import {
  computeCockpitCamera,
  computeLaunchCamera,
} from "../render/launch-camera.js";
import type { CameraPose } from "../render/launch-camera.js";
import {
  applyFrame,
  applyStationRoll,
  interpolatePose,
  maxRelativeMagnitude,
} from "../render/sync.js";
import type { SystemScene } from "../render/system-scene.js";
import type { Command } from "../sim/commands.js";
import type { SimEvent } from "../sim/events.js";
import { deriveFlightConfig } from "../sim/flight/config.js";
import type { FlightConfig } from "../sim/flight/config.js";
import {
  PlayerController,
  ScriptedLaunchController,
  flightView,
} from "../sim/flight/controller.js";
import { initFlightState, poseOf } from "../sim/flight/state.js";
import type { FlightPose, FlightState } from "../sim/flight/state.js";
import { stepFlight } from "../sim/flight/step.js";
import { identity, sub, vec } from "../sim/math.js";
import type { Vec3 } from "../sim/math.js";
import type { InputFrame } from "../sim/state.js";
import { DT } from "../sim/time.js";
import type { SystemLayout } from "../sim/world/layout.js";
import { createKeyboardInputSource } from "../input/keyboard.js";
import type { KeyboardInputSource } from "../input/keyboard.js";
import { ACTION_IDS } from "../input/actions.js";
import { createBindingMap } from "../input/bindings.js";
import type { BindingMap } from "../input/bindings.js";
import {
  loadSettings,
  resetSettings,
  saveSettings,
} from "../settings/store.js";
import type { SettingsV1 } from "../settings/schema.js";
import { createControlsPanel } from "../ui/controls.js";
import type { ControlsPanel } from "../ui/controls.js";
import { createPauseOverlay } from "../ui/pause.js";
import type { PauseOverlay } from "../ui/pause.js";
import { createSettingsPanel } from "../ui/settings-panel.js";
import type { SettingsPanel } from "../ui/settings-panel.js";
import type { DockedPanel } from "../ui/docked.js";
import type { TitleScreen } from "../ui/title.js";

export interface GameSessionOptions {
  readonly renderer: THREE.WebGLRenderer;
  readonly assets: AssetCache;
  readonly scenes: SceneManager;
  readonly title: TitleScreen;
  readonly docked: DockedPanel;
  readonly hudCanvas: HTMLCanvasElement;
  readonly probe: WegoliteProbe;
  readonly system: System;
  readonly pauseRoot: HTMLElement;
  readonly controlsRoot: HTMLElement;
  readonly settingsRoot: HTMLElement;
  /** The canvas that receives focus when the pause overlay closes. */
  readonly gameRoot: HTMLElement;
}

export interface GameSession {
  /** Load the assets, build the Lave scene and start the render loop. */
  start(): Promise<void>;
  /** The HUD needs the same resize as the WebGL canvas. */
  resize(): void;
  /** Freeze the simulation and show the pause overlay (D-14/D-15). */
  pause(): void;
  /** Resume from pause and discard any hidden time (D-14). */
  resume(): void;
  isPaused(): boolean;
  /** Clear every held key without changing the paused flag (focus loss). */
  clearInput(): void;
  dispose(): void;
}

function toTuple(position: Vec3): [number, number, number] {
  return [position.x, position.y, position.z];
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
    system,
    pauseRoot,
    controlsRoot,
    settingsRoot,
    gameRoot,
  } = options;

  const player = new PlayerController();
  const scripted = new ScriptedLaunchController();
  const pending: Command[] = [];
  const uiController = new AbortController();

  let state: FlightState | undefined;
  let layout: SystemLayout | undefined;
  let config: FlightConfig | undefined;
  let scene: SystemScene | undefined;
  let stationDef: ShipDef | undefined;
  let hud: Hud | undefined;
  let breakPattern: BreakPattern | undefined;
  let input: KeyboardInputSource | undefined;
  let loop: GameLoop | undefined;
  let settings: SettingsV1 | undefined;
  let bindings: BindingMap | undefined;
  let hints: HintController | undefined;
  let pauseOverlay: PauseOverlay | undefined;
  let controlsPanel: ControlsPanel | undefined;
  let settingsPanel: SettingsPanel | undefined;

  let previousPose: FlightPose = {
    position: vec(0, 0, 0),
    orientation: identity(),
  };
  let currentPose: FlightPose = previousPose;
  let previousCameraWorld: Vec3 | undefined;
  let currentFrame: InputFrame = {
    pitch: 0,
    roll: 0,
    speed: 0,
    precision: false,
  };
  let paused = false;
  let launchSeen = false;
  const messages = createMessageQueue(4);
  const launchSequence: LaunchSequence = createLaunchSequence();
  let lastModel: HudModel | undefined;
  let lastMs = 0;
  let rafId = 0;
  let disposed = false;
  // Set synchronously on the first `start()` call. `state` is only assigned
  // after two awaits, so it cannot guard re-entry on its own.
  let starting = false;

  function persistSettings(): void {
    if (settings === undefined || bindings === undefined) return;
    settings.bindings = bindings;
    saveSettings(settings);
  }

  function pause(): void {
    const currentState = state;
    if (currentState === undefined) {
      // The title/menu has no simulation; focus loss only clears input.
      input?.clearAll();
      return;
    }
    if (paused) {
      // Repeated blur/visibility events are idempotent.
      input?.clearAll();
      return;
    }
    paused = true;
    input?.clearAll();
    loop?.reset();
    pauseOverlay?.show();
  }

  function resume(): void {
    if (!paused) return;
    paused = false;
    input?.clearAll();
    // Hidden time is never replayed: the accumulator starts at zero and the
    // next frame delta is one rendered frame, not the time spent paused.
    loop?.reset();
    pauseOverlay?.hide();
    controlsPanel?.hide();
    settingsPanel?.hide();
  }

  function backToPause(): void {
    controlsPanel?.hide();
    settingsPanel?.hide();
    pauseOverlay?.show();
  }

  function openControls(): void {
    settingsPanel?.hide();
    controlsPanel?.show();
  }

  function openSettings(): void {
    controlsPanel?.hide();
    settingsPanel?.show();
  }

  function resetAllSettings(): void {
    const fresh = resetSettings();
    if (bindings !== undefined) {
      for (const action of ACTION_IDS) {
        bindings[action] = [...(fresh.bindings[action] ?? [])];
      }
      settings = { ...fresh, bindings };
      input?.setBindings(bindings);
      controlsPanel?.refresh();
    } else {
      settings = fresh;
    }
    launchSeen = false;
  }

  function onSubpanelKeyDown(event: KeyboardEvent): void {
    if (event.code !== "Escape") return;
    if (controlsPanel?.isCapturing() === true) return;
    if (controlsPanel?.isOpen() !== true && settingsPanel?.isOpen() !== true) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    backToPause();
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
    const currentState = state;
    if (currentState === undefined || currentState.mode !== "launching") return;
    if (paused || event.repeat) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!launchSequence.canSkip(launchSeen)) return;
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
        docked.hide();
        hudCanvas.hidden = false;
        messages.enqueue("Launching — stand by");
        break;
      case "launchComplete":
        launchSequence.markSeen();
        launchSeen = true;
        if (settings !== undefined && !settings.launchSeen) {
          settings.launchSeen = true;
          persistSettings();
        }
        messages.enqueue("Arrows pitch and roll · W and S change speed");
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
      case "compassTargetChanged":
        messages.enqueue(`Compass target: ${event.target}`);
        break;
    }
  }

  function updateProbe(): void {
    probe.calls = renderer.info.render.calls;
    probe.triangles = renderer.info.render.triangles;
    probe.renders = renderer.info.render.frame;
    probe.memory = readMemory(renderer);
    probe.paused = paused;

    const currentState = state;
    if (currentState !== undefined) {
      probe.mode = currentState.mode;
      probe.clock = currentState.clockSeconds;
      probe.flightTime = currentState.flightTime;
      probe.position = toTuple(currentState.position);
      probe.orientation = [
        currentState.orientation.w,
        currentState.orientation.x,
        currentState.orientation.y,
        currentState.orientation.z,
      ];
      probe.speed = currentState.speed;
      probe.angular = {
        pitch: currentState.pitchRate,
        roll: currentState.rollRate,
      };
      probe.torus = {
        engaged: currentState.torus.engaged,
        factor: currentState.torus.factor,
        massLocked: currentState.torus.massLocked,
      };
      probe.launch = {
        count: currentState.launchCount,
        elapsed: currentState.launchElapsed,
        seen: launchSeen,
      };
    }

    const currentLayout = layout;
    const currentScene = scene;
    if (currentLayout !== undefined && currentScene !== undefined) {
      probe.bodies = [
        currentScene.planet.mesh.name,
        currentScene.sun.sun.name,
        currentScene.starfield.name,
        currentScene.station.root.name,
        currentScene.ship.name,
        currentScene.navBuoy.name,
        currentScene.witchpoint.name,
      ];
      probe.shipVisible = currentScene.ship.visible;
      probe.dust = {
        active: currentScene.dust.active,
        count: currentScene.dust.count,
      };
      probe.world = {
        planet: toTuple(currentLayout.planet.position),
        sun: toTuple(currentLayout.sun.position),
        station: toTuple(currentLayout.station.position),
        navBuoy: toTuple(currentLayout.navBuoy.position),
        witchpoint: toTuple(currentLayout.witchpoint.position),
        maxRelativeMagnitude: maxRelativeMagnitude(currentScene),
      };
    }

    const currentHud = hud;
    if (currentHud !== undefined) {
      const model = lastModel;
      probe.hud = {
        drawn: currentHud.drawn,
        elements: [...currentHud.elements],
        designScale: currentHud.designScale,
        letterbox: [currentHud.letterbox[0], currentHud.letterbox[1]],
        contacts:
          model === undefined
            ? []
            : model.contacts
                .filter((contact) => contact.visible)
                .map((contact) => contact.id),
        compass:
          model === undefined
            ? { target: "planet", forward: false }
            : {
                target: model.compass.target,
                forward: model.compass.forward,
              },
        aegis: model === undefined ? "none" : model.aegis,
        message: model === undefined ? "" : model.message,
        bounds: currentHud.bounds,
      };
    }

    probe.hints = hints === undefined ? [] : [...hints.seen];
  }

  function renderFrame(alpha: number): void {
    const currentState = state;
    const currentLayout = layout;
    const currentConfig = config;
    const currentScene = scene;
    const currentHud = hud;
    if (
      currentState === undefined ||
      currentLayout === undefined ||
      currentConfig === undefined ||
      currentScene === undefined ||
      currentHud === undefined
    ) {
      return;
    }

    // WORLD-02: the live projection aspect, published from the one camera that
    // is actually rendered. `start()`, every frame and `swapSystem()` all pass
    // through here, so a rebuilt scene can never leave the field stale.
    probe.aspect = currentScene.camera.aspect;

    applyStationRoll(currentScene, currentState.stationAngle);
    // The launch cinematic and the cockpit handover supply a world pose; while
    // docked the first-person pose is derived from the interpolated ship pose.
    const pose = interpolatePose(previousPose, currentPose, alpha);
    let camera: CameraPose | null = null;
    if (currentState.mode === "launching") {
      camera = computeLaunchCamera(currentLayout, pose.position);
    } else if (currentState.mode === "inFlight") {
      camera = computeCockpitCamera(pose.position, pose.orientation);
    }
    const cameraWorld = applyFrame(
      currentScene,
      previousPose,
      currentPose,
      alpha,
      currentLayout,
      camera,
      currentState.flightTime,
    );
    // D-04: dust is camera-local. The world delta comes from the one transform
    // path; the field wraps inside its box, so it never drifts to the origin.
    const currentDust = currentScene.dust;
    currentDust.update(
      previousCameraWorld === undefined
        ? vec(0, 0, 0)
        : sub(cameraWorld, previousCameraWorld),
      currentState.speed,
      currentState.torus.factor,
    );
    previousCameraWorld = cameraWorld;
    // D-10: the Cobra is shown for the scripted exit and hidden in the cockpit;
    // it is toggled, never rebuilt.
    currentScene.ship.visible = currentState.mode === "launching";

    renderer.render(currentScene.scene, currentScene.camera);

    // The flight HUD is not drawn while docked (D-09 shows the status panel).
    const isDocked = currentState.mode === "docked";
    hudCanvas.hidden = isDocked;
    if (!isDocked) {
      const currentBreakPattern = breakPattern;
      if (
        currentState.mode === "launching" &&
        currentBreakPattern !== undefined
      ) {
        // D-10: the break pattern covers the cut to the cockpit, and is driven
        // by the same fixed-step timeline as the launch itself.
        currentBreakPattern.draw(
          launchSequence.elapsed,
          currentState.launchCount,
        );
      } else {
        const model = buildHudModel(
          currentState,
          currentLayout,
          currentConfig,
          messages.current(currentState.flightTime),
        );
        currentHud.draw(model);
        lastModel = model;
      }
    }
    showHint(currentState);
    updateProbe();
  }

  /** D-11: one message-line hint at a time, never a modal or overlay. */
  function showHint(currentState: FlightState): void {
    const currentHints = hints;
    if (currentHints === undefined) return;
    const context: HintContext = {
      mode: currentState.mode,
      massLocked: currentState.torus.massLocked,
      torusEngaged: currentState.torus.engaged,
      speedInput: currentFrame.speed,
      pitchRollInput: currentFrame.pitch !== 0 || currentFrame.roll !== 0,
    };
    const hint = currentHints.maybeShow(context);
    if (hint === null) return;
    probe.hint = hint;
    if (currentState.mode === "docked") docked.setMessage(hint);
    else messages.enqueue(hint);
  }

  function frame(now: number): void {
    rafId = requestAnimationFrame(frame);

    const currentState = state;
    const currentLayout = layout;
    const currentConfig = config;
    const currentInput = input;
    const currentLoop = loop;
    if (
      currentState === undefined ||
      currentLayout === undefined ||
      currentConfig === undefined ||
      currentInput === undefined ||
      currentLoop === undefined
    ) {
      return;
    }

    const delta = lastMs === 0 ? 0 : (now - lastMs) / 1000;
    lastMs = now;

    if (currentInput.consumePauseToggle()) {
      if (paused) resume();
      else pause();
    }

    let alpha = 0;
    if (!paused) {
      const commands: Command[] = [...currentInput.drainCommands(), ...pending];
      pending.length = 0;
      // One immutable frame per rendered frame, shared by every fixed step.
      const frameInput = currentInput.frame();
      currentFrame = frameInput;

      alpha = currentLoop.advance(delta, commands, (stepCommands) => {
        previousPose = currentPose;
        const modeBefore = currentState.mode;
        const controller =
          currentState.mode === "launching" ? scripted : player;
        const intent = controller.update(flightView(currentState), frameInput);
        const events = stepFlight(
          currentState,
          currentLayout,
          currentConfig,
          intent,
          stepCommands,
          DT,
        );
        for (const event of events) handleEvent(event);
        // The view timeline advances on the same fixed steps as the simulation,
        // and only after the step that entered `launching` (which does not move
        // the ship either).
        if (modeBefore === "launching") {
          launchSequence.advance(DT, currentState.mode === "inFlight");
        }
        currentPose = poseOf(currentState);
      });
    } else {
      // A key pressed while paused must not become a queued edge command that
      // fires on resume.
      currentInput.drainCommands();
      pending.length = 0;
      currentFrame = { pitch: 0, roll: 0, speed: 0, precision: false };
    }

    renderFrame(alpha);
  }

  async function start(): Promise<void> {
    // The guard is set synchronously: `state` is only assigned after two
    // awaits, so a second click during the load would otherwise start a second
    // frame loop (two RAF chains, two HUDs, two input sources) that `dispose()`
    // could never fully cancel.
    if (state !== undefined || starting || disposed) return;
    starting = true;

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
    if (disposed) return;

    const catalogue = await loadShipCatalogue();

    if (disposed) return;
    const playerDef = playerShip(catalogue).shipDef;
    const station = stationShip(catalogue).shipDef;
    stationDef = station;

    const flightConfig = deriveFlightConfig(playerDef);
    const nextScene = scenes.enterSystem(system, station);
    const systemLayout = scenes.layout();
    if (systemLayout === undefined) {
      throw new Error(
        "Wegolite: the scene manager entered a system without a layout.",
      );
    }
    const flightState = initFlightState(systemLayout);

    state = flightState;
    layout = systemLayout;
    config = flightConfig;
    scene = nextScene;
    hud = createHud(hudCanvas);
    hud.resize();
    breakPattern = createBreakPattern(hudCanvas);
    hudCanvas.hidden = true;

    const loaded = loadSettings();
    const bindingMap = createBindingMap(loaded.bindings);
    settings = { ...loaded, bindings: bindingMap };
    bindings = bindingMap;
    launchSeen = loaded.launchSeen;
    if (launchSeen) launchSequence.markSeen();
    hints = createHintController({
      bindings: bindingMap,
      seen: settings.hintsSeen,
      onSeen: (id) => {
        const currentSettings = settings;
        if (currentSettings === undefined) return;
        if (!currentSettings.hintsSeen.includes(id)) {
          currentSettings.hintsSeen.push(id);
        }
        persistSettings();
      },
    });

    input = createKeyboardInputSource(bindingMap);
    input.attach();
    loop = createGameLoop();
    previousPose = poseOf(flightState);
    currentPose = previousPose;
    previousCameraWorld = undefined;

    pauseOverlay = createPauseOverlay({
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
    controlsPanel = createControlsPanel(bindingMap, {
      root: controlsRoot,
      onChange: (next) => {
        input?.setBindings(next);
        persistSettings();
      },
      onReset: () => {
        resetAllSettings();
      },
      onBack: () => {
        backToPause();
      },
    });
    settingsPanel = createSettingsPanel({
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
    });

    // The hook exists only when explicitly asked for, and only mutates the live
    // state: no save, no arbitrary code (V5 / test-API abuse).
    if (new URLSearchParams(window.location.search).has("test")) {
      probe.test = createTestHook(flightState, { swapSystem, disposeSystem });
    }

    title.hide();
    docked.show(system.name);
    docked.onLaunch(() => {
      pending.push({ kind: "launch" });
    });

    renderFrame(0);
    rafId = requestAnimationFrame(frame);
  }

  function resize(): void {
    hud?.resize();
  }

  /**
   * WORLD-04 test surface: rebuild the active system scene through the manager.
   *
   * The flight state and layout stay put: a swap replaces the scene graph, not
   * the simulation, and only the render references move. That is exactly the
   * ownership boundary the disposal proof is about.
   */
  function performSwap(): void {
    const currentStationDef = stationDef;
    if (state === undefined || currentStationDef === undefined) return;
    scene = scenes.enterSystem(system, currentStationDef);
    layout = scenes.layout() ?? layout;
    // The new dust field has no camera history; a stale delta would smear it.
    previousCameraWorld = undefined;
  }

  function disposeSystem(): void {
    scenes.disposeSystem();
    scene = undefined;
    previousCameraWorld = undefined;
  }

  /**
   * Swap, then settle one real frame so the GPU counters the probe reports
   * describe the new scene rather than the frame before it.
   */
  async function swapSystem(): Promise<void> {
    if (state === undefined) return;
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
    if (disposed) return;
    disposed = true;

    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = 0;

    // Every listener this session added hangs off `uiController`; aborting it
    // also releases the sub-panel controllers' listeners through their own
    // disposers below.
    uiController.abort();
    input?.clearAll();
    input?.dispose();
    pauseOverlay?.dispose();
    controlsPanel?.dispose();
    settingsPanel?.dispose();

    // Scene first, then the cache that owns the shared GLBs it referenced.
    scenes.dispose();
    assets.dispose();

    breakPattern?.dispose();
    hud?.dispose();
    docked.dispose();
    title.dispose();

    // Drop the live references so a late callback cannot read a disposed
    // scene, and withdraw the test surface with the session.
    state = undefined;
    scene = undefined;
    layout = undefined;
    delete probe.test;
  }

  return {
    start,
    resize,
    pause,
    resume,
    isPaused: () => paused,
    clearInput: () => {
      input?.clearAll();
    },
    dispose,
  };
}

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
import type { System } from "../content/types.js";
import { buildHudModel } from "./hud-model.js";
import { createGameLoop } from "./game-loop.js";
import type { GameLoop } from "./game-loop.js";
import { createTestHook, publishFailure } from "./probe.js";
import type { WegoliteProbe } from "./probe.js";
import type { SceneManager } from "./scene-manager.js";
import type { AssetCache } from "../render/asset-cache.js";
import { createHud } from "../render/hud/hud.js";
import type { Hud } from "../render/hud/hud.js";
import {
  applyFrame,
  applyStationRoll,
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
import { identity, vec } from "../sim/math.js";
import type { Vec3 } from "../sim/math.js";
import { DT } from "../sim/time.js";
import type { SystemLayout } from "../sim/world/layout.js";
import { createKeyboardInputSource } from "../input/keyboard.js";
import type { KeyboardInputSource } from "../input/keyboard.js";
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
}

export interface GameSession {
  /** Load the assets, build the Lave scene and start the render loop. */
  start(): Promise<void>;
  /** The HUD needs the same resize as the WebGL canvas. */
  resize(): void;
  dispose(): void;
}

function toTuple(position: Vec3): [number, number, number] {
  return [position.x, position.y, position.z];
}

export function createGameSession(options: GameSessionOptions): GameSession {
  const { renderer, assets, scenes, title, docked, hudCanvas, probe, system } =
    options;

  const player = new PlayerController();
  const scripted = new ScriptedLaunchController();
  const pending: Command[] = [];

  let state: FlightState | undefined;
  let layout: SystemLayout | undefined;
  let config: FlightConfig | undefined;
  let scene: SystemScene | undefined;
  let hud: Hud | undefined;
  let input: KeyboardInputSource | undefined;
  let loop: GameLoop | undefined;

  let previousPose: FlightPose = {
    position: vec(0, 0, 0),
    orientation: identity(),
  };
  let currentPose: FlightPose = previousPose;
  let paused = false;
  let launchSeen = false;
  let message = "";
  let lastMs = 0;
  let rafId = 0;

  function handleEvent(event: SimEvent): void {
    switch (event.kind) {
      case "launched":
        docked.hide();
        hudCanvas.hidden = false;
        message = "Launching — stand by";
        break;
      case "launchComplete":
        launchSeen = true;
        message = "Arrows pitch and roll · W and S change speed";
        break;
      case "torusEngaged":
        message = `Torus engaged at ${event.factor.toFixed(1)}×`;
        break;
      case "torusDisengaged":
        message = "Torus disengaged";
        break;
      case "massLockChanged":
        message = event.locked ? "Mass locked" : "";
        break;
      case "compassTargetChanged":
        message = `Compass target: ${event.target}`;
        break;
    }
  }

  function updateProbe(): void {
    probe.calls = renderer.info.render.calls;
    probe.triangles = renderer.info.render.triangles;
    probe.renders = renderer.info.render.frame;
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
        currentScene.planet.name,
        currentScene.sun.name,
        currentScene.starfield.name,
        currentScene.station.name,
        currentScene.ship.name,
      ];
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
      probe.hud = {
        drawn: currentHud.drawn,
        elements: [...currentHud.elements],
        designScale: currentHud.designScale,
        letterbox: [currentHud.letterbox[0], currentHud.letterbox[1]],
      };
    }
  }

  function renderFrame(alpha: number): void {
    const currentState = state;
    const currentLayout = layout;
    const currentScene = scene;
    const currentHud = hud;
    if (
      currentState === undefined ||
      currentLayout === undefined ||
      currentScene === undefined ||
      currentHud === undefined
    ) {
      return;
    }

    applyStationRoll(currentScene, currentLayout, currentState.stationAngle);
    applyFrame(currentScene, previousPose, currentPose, alpha, currentLayout);
    // First-person flight: the hull would clip the camera, so it is hidden.
    // Plan 07 shows it again for the launch cinematic.
    currentScene.ship.visible = currentState.mode !== "inFlight";

    renderer.render(currentScene.scene, currentScene.camera);

    // The flight HUD is not drawn while docked (D-09 shows the status panel).
    const docked = currentState.mode === "docked";
    hudCanvas.hidden = docked;
    if (!docked) {
      currentHud.draw(buildHudModel(currentState, currentLayout, message));
    }
    updateProbe();
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
      paused = !paused;
      currentInput.clearAll();
      currentLoop.reset();
    }

    const commands: Command[] = [...currentInput.drainCommands(), ...pending];
    pending.length = 0;
    // One immutable frame per rendered frame, shared by every fixed step.
    const frameInput = currentInput.frame();

    let alpha = 0;
    if (!paused) {
      alpha = currentLoop.advance(delta, commands, (stepCommands) => {
        previousPose = currentPose;
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
        currentPose = poseOf(currentState);
      });
    }

    renderFrame(alpha);
  }

  async function start(): Promise<void> {
    if (state !== undefined) return;

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

    const catalogue = await loadShipCatalogue();
    const playerDef = playerShip(catalogue).shipDef;
    const stationDef = stationShip(catalogue).shipDef;

    const flightConfig = deriveFlightConfig(playerDef);
    const nextScene = scenes.enterSystem(system, stationDef);
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
    hudCanvas.hidden = true;
    input = createKeyboardInputSource();
    loop = createGameLoop();
    previousPose = poseOf(flightState);
    currentPose = previousPose;

    // The hook exists only when explicitly asked for, and only mutates the live
    // state: no save, no arbitrary code (V5 / test-API abuse).
    if (new URLSearchParams(window.location.search).has("test")) {
      probe.test = createTestHook(flightState);
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

  function dispose(): void {
    if (rafId !== 0) cancelAnimationFrame(rafId);
    rafId = 0;
    input?.dispose();
    scenes.dispose();
    assets.dispose();
    hud?.dispose();
    docked.dispose();
    title.dispose();
  }

  return { start, resize, dispose };
}

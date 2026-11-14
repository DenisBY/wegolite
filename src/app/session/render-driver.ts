// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The render driver (Phase 8, D-12 step 3, ARCHITECTURE.md section 4.2).
 *
 * Everything that brings the scene graph, the HUD and the probe up to date for
 * one loop frame, and the redraw gate's decision about whether that frame has
 * to reach the GPU. The bodies are the ones `createGameSession` carried before
 * the split. The driver is read-only on simulation state: it never advances the
 * flight state, it only draws it.
 *
 * Every live field is read through `ctx` inside the function that needs it and
 * is never copied to a factory-level variable (G-8): a Load replaces the flight
 * state, a jump or a quality change replaces the scene, and the nebula textures
 * arrive after the scene is built, so a held copy would make the redraw gate
 * compare against a dead object and skip a frame that has to be drawn.
 */

import type * as THREE from "three";
import type { System } from "../../content/types.js";
import type { FlightState } from "../../sim/flight/state.js";
import { countdownSecondsRemaining } from "../../sim/hyperspace/countdown.js";
import { sub, vec } from "../../sim/math.js";
import { npcContacts } from "../../sim/world/contacts.js";
import {
  computeCockpitCamera,
  computeLaunchCamera,
} from "../../render/launch-camera.js";
import type { CameraPose } from "../../render/launch-camera.js";
import type { MessageQueue } from "../../render/hud/messages.js";
import {
  applyFrame,
  applyStationRoll,
  interpolatePose,
} from "../../render/sync.js";
import { buildHudModel } from "../hud-model.js";
import type { HintContext } from "../hints.js";
import type { LaunchSequence } from "../launch-sequence.js";
import type { WegoliteProbe } from "../probe.js";
import type { RedrawGate } from "../redraw-gate.js";
import type { SessionState } from "./context.js";

/** What the driver calls outside the session context. */
export interface RenderDriverDeps {
  readonly renderer: THREE.WebGLRenderer;
  readonly hudCanvas: HTMLCanvasElement;
  readonly probe: WegoliteProbe;
  readonly redrawGate: RedrawGate;
  readonly messages: MessageQueue;
  readonly launchSequence: LaunchSequence;
  readonly galaxyById: ReadonlyMap<string, System>;
  /** The probe publisher's per-frame publication. */
  readonly updateProbe: () => void;
  /** Redraw the station shell (a hint shown while docked). */
  readonly renderStation: () => void;
  /** The committed hyperspace target, resolved at call time. */
  readonly targetSystem: () => System | undefined;
}

export function createRenderDriver(ctx: SessionState, deps: RenderDriverDeps) {
  const {
    renderer,
    hudCanvas,
    probe,
    redrawGate,
    messages,
    launchSequence,
    galaxyById,
    updateProbe,
    renderStation,
    targetSystem,
  } = deps;

  /**
   * What the drawn image depends on besides the simulation: the flight state
   * object (replaced by a Load), the scene (replaced by a jump, a quality
   * change or a test swap) and the nebula textures, which arrive after the
   * scene is built.
   */
  function drawKeys(): readonly unknown[] {
    // Read at this call, never kept: the keys compare the live objects by identity.
    const { state, scene } = ctx.core;
    return [state, scene, scene?.nebulae?.revision() ?? 0];
  }

  /**
   * Whether the loop's next frame has to reach the GPU (see `redraw-gate.ts`).
   * A docked or paused session simulates nothing, so its image cannot change.
   */
  function shouldDraw(): boolean {
    const { paused } = ctx.runtime;
    const { state } = ctx.core;
    return redrawGate.next(paused || state?.mode === "docked", drawKeys());
  }

  /**
   * Bring the scene graph, the HUD and the probe up to date, and draw them.
   *
   * @param draw False skips the WebGL draw and the HUD canvas draw; only the
   *   frame loop passes it, for a frame `shouldDraw` found unchanged. Every
   *   direct caller draws.
   */
  function renderFrame(alpha: number, draw = true): void {
    const currentState = ctx.core.state;
    const currentLayout = ctx.core.layout;
    const currentConfig = ctx.core.config;
    const currentScene = ctx.core.scene;
    const currentHud = ctx.runtime.hud;
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
    const pose = interpolatePose(
      ctx.core.previousPose,
      ctx.core.currentPose,
      alpha,
    );
    let camera: CameraPose | null = null;
    if (currentState.mode === "launching") {
      camera = computeLaunchCamera(currentLayout, pose.position);
    } else if (currentState.mode === "inFlight") {
      camera = computeCockpitCamera(
        pose.position,
        pose.orientation,
        ctx.core.dockFeedback.shakeOffset(currentState.flightTime),
      );
    }
    const cameraWorld = applyFrame(
      currentScene,
      ctx.core.previousPose,
      ctx.core.currentPose,
      alpha,
      currentLayout,
      camera,
      currentState.flightTime,
    );
    // D-04: dust is camera-local. The world delta comes from the one transform
    // path; the field wraps inside its box, so it never drifts to the origin.
    const currentDust = currentScene.dust;
    currentDust.update(
      ctx.core.previousCameraWorld === undefined
        ? vec(0, 0, 0)
        : sub(cameraWorld, ctx.core.previousCameraWorld),
      currentState.speed,
      currentState.torus.factor,
    );
    ctx.core.previousCameraWorld = cameraWorld;
    // D-10: the Cobra is shown for the scripted exit and hidden in the cockpit;
    // it is toggled, never rebuilt.
    currentScene.ship.visible = currentState.mode === "launching";

    if (draw) {
      renderer.render(currentScene.scene, currentScene.camera);
      redrawGate.drawn(drawKeys());
    }

    // The flight HUD is not drawn while docked (D-09 shows the status panel).
    const isDocked = currentState.mode === "docked";
    hudCanvas.hidden = isDocked;
    if (!isDocked && draw) {
      const currentBreakPattern = ctx.runtime.breakPattern;
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
        const snapshot = currentState.hyperspaceTarget;
        const message =
          currentState.hyperspaceCountdown > 0 && snapshot !== null
            ? `Hyperspace to ${galaxyById.get(snapshot.id)?.name ?? "(Unknown)"} in ${String(countdownSecondsRemaining(currentState.hyperspaceCountdown))} seconds`
            : messages.current(currentState.flightTime);
        const model = buildHudModel(
          currentState,
          currentLayout,
          currentConfig,
          message,
          ctx.core.profile.fuel,
          ctx.core.dockFeedback.flashAlpha(currentState.flightTime),
          targetSystem()?.name ?? "",
          // WORLD-15: id-free ship contacts from the live world, read at this
          // frame and not kept (G-8); no world (docked, traffic off) is empty.
          npcContacts(ctx.core.worldLifecycle?.world),
        );
        currentHud.draw(model);
        ctx.core.lastModel = model;
      }
    }
    showHint(currentState);
    updateProbe();
  }

  /** D-11: one message-line hint at a time, never a modal or overlay. */
  function showHint(currentState: FlightState): void {
    const currentHints = ctx.runtime.hints;
    if (currentHints === undefined) return;
    const context: HintContext = {
      mode: currentState.mode,
      massLocked: currentState.torus.massLocked,
      torusEngaged: currentState.torus.engaged,
      speedInput: ctx.core.currentFrame.speed,
      pitchRollInput:
        ctx.core.currentFrame.pitch !== 0 || ctx.core.currentFrame.roll !== 0,
    };
    const hint = currentHints.maybeShow(context);
    if (hint === null) return;
    probe.hint = hint;
    if (currentState.mode === "docked") {
      ctx.station.stationMessage = hint;
      renderStation();
    } else messages.enqueue(hint);
  }

  return { renderFrame, shouldDraw, drawKeys, showHint };
}

/** The driver's shape, derived so no interface spells renderFrame's parameters. */
export type RenderDriver = ReturnType<typeof createRenderDriver>;

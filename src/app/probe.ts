// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The `window.__wegolite` probe (D-08, Pattern H).
 *
 * The Phase 1/2 fields stay; the flight, HUD and world fields are additive. The
 * object is published **once** and then mutated by the session, so a reader
 * always sees the live frame rather than a stale snapshot.
 *
 * The three Phase 1 precision fields (`nearRelZ`, `farRelZ`, `farUlp`) are
 * retired: the numeric precision proof moves to `world.maxRelativeMagnitude`
 * (here) plus the float32 ULP assertion at the real sun distance in plan 04.
 * A retired field must not keep returning a plausible value.
 *
 * `test` is exposed only under `?test=1` and carries no save mutation and no
 * arbitrary code.
 */

import type * as THREE from "three";
import type { FlightMode } from "../sim/flight/state.js";
import type { CompassTarget, FlightState } from "../sim/flight/state.js";
import type { AegisStatus } from "../sim/world/aegis.js";
import { vec } from "../sim/math.js";
import type { HintId } from "../settings/schema.js";

export interface WegoliteWorldProbe {
  planet: [number, number, number];
  sun: [number, number, number];
  station: [number, number, number];
  navBuoy: [number, number, number];
  witchpoint: [number, number, number];
  maxRelativeMagnitude: number;
}

export interface WegoliteHudCompassProbe {
  target: CompassTarget;
  forward: boolean;
}

export interface WegoliteHudProbe {
  drawn: boolean;
  elements: string[];
  designScale: number;
  letterbox: [number, number];
  /** Visible scanner contacts, by body id (station/navBuoy/witchpoint). */
  contacts: string[];
  compass: WegoliteHudCompassProbe;
  aegis: AegisStatus;
  message: string;
  /** Design-space bounding boxes, so the proof is numeric, never a screenshot. */
  bounds: Record<string, readonly [number, number, number, number]>;
}

/**
 * The live GPU-resource counters (WORLD-04).
 *
 * `geometries` and `textures` are Three's own `renderer.info.memory` counts;
 * `programs` is the compiled-shader list length. A scene swap must leave all
 * three flat — a monotonic climb is the leak this phase must not ship.
 */
export interface WegoliteMemoryProbe {
  geometries: number;
  textures: number;
  programs: number;
}

/** The two scene-level operations the `?test=1` hook may drive. */
export interface WegoliteSceneTestHook {
  /** Re-enter the active system (build, swap, dispose) and settle one frame. */
  swapSystem(): Promise<void>;
  /** Dispose the active system scene and leave the app on the empty scene. */
  disposeSystem(): void;
}

export interface WegoliteTestHook extends WegoliteSceneTestHook {
  setPosition(x: number, y: number, z: number): void;
  setSpeed(speed: number): void;
}

export interface WegoliteProbe {
  ready: boolean;
  calls: number;
  triangles: number;
  logDepth: boolean;
  depthBits: number;
  webgl2: boolean;
  renders: number;
  homeSystems: number;
  codeSplitGalaxies: number;
  mode: "menu" | FlightMode;
  paused: boolean;
  clock: number;
  flightTime: number;
  position: [number, number, number];
  orientation: [number, number, number, number];
  speed: number;
  angular: { pitch: number; roll: number };
  torus: { engaged: boolean; factor: number; massLocked: boolean };
  hud: WegoliteHudProbe;
  launch: { count: number; elapsed: number; seen: boolean };
  /** WORLD-04: the live GPU counters a scene swap must not grow. */
  memory: WegoliteMemoryProbe;
  bodies: string[];
  /** D-10: the Cobra is shown for the launch cinematic, hidden in the cockpit. */
  shipVisible?: boolean;
  /** D-04: the camera-local dust field, once a system scene exists. */
  dust?: { active: boolean; count: number };
  /** D-11: hints already dismissed (persisted in settings). */
  hints?: HintId[];
  /** D-11: the last hint the controller decided to show (message-line proof). */
  hint?: string;
  /** Present once a system scene exists. */
  world?: WegoliteWorldProbe;
  /**
   * The live active-camera aspect (WORLD-02). The e2e proof reads this instead
   * of a screenshot. Absent on the failure surface, where no camera renders.
   */
  aspect?: number;
  /** Present only under `?test=1`. */
  test?: WegoliteTestHook;
  /** Present only on the failure surface. */
  error?: string;
}

declare global {
  interface Window {
    __wegolite?: WegoliteProbe;
  }
}

/** Publish the live probe object exactly once. */
export function publishProbe(probe: WegoliteProbe): void {
  window.__wegolite = probe;
}

/**
 * Read the live GPU-resource counters.
 *
 * `renderer.info.programs` is nullable in Three's types; the `?? 0` keeps the
 * probe numeric instead of leaking a null into a Playwright assertion.
 */
export function readMemory(renderer: THREE.WebGLRenderer): WegoliteMemoryProbe {
  return {
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    programs: renderer.info.programs?.length ?? 0,
  };
}

/**
 * The `?test=1` hook. It mutates only the live flight state and drives the
 * scene manager — no save, no arbitrary code — so a browser spec can teleport
 * to a mass-lock-free point, set a speed, or swap the scene to prove disposal.
 */
export function createTestHook(
  state: FlightState,
  scenes: WegoliteSceneTestHook,
): WegoliteTestHook {
  return {
    setPosition(x: number, y: number, z: number): void {
      state.position = vec(x, y, z);
    },
    setSpeed(speed: number): void {
      state.speed = speed;
    },
    swapSystem: () => scenes.swapSystem(),
    disposeSystem: () => {
      scenes.disposeSystem();
    },
  };
}

/**
 * Publish the failure surface instead of a ready probe.
 *
 * The shape is the same interface with `ready: false` and zeroed counters, so a
 * reader never has to narrow a union; `webgl2` is false because no renderer is
 * driving anything.
 */
export function publishFailure(reason: string): void {
  window.__wegolite = {
    ready: false,
    calls: 0,
    triangles: 0,
    logDepth: false,
    depthBits: 0,
    webgl2: false,
    renders: 0,
    homeSystems: 0,
    codeSplitGalaxies: 0,
    mode: "menu",
    paused: true,
    clock: 0,
    flightTime: 0,
    position: [0, 0, 0],
    orientation: [0, 0, 0, 1],
    speed: 0,
    angular: { pitch: 0, roll: 0 },
    torus: { engaged: false, factor: 1, massLocked: false },
    hud: {
      drawn: false,
      elements: [],
      designScale: 1,
      letterbox: [0, 0],
      contacts: [],
      compass: { target: "planet", forward: false },
      aegis: "none",
      message: "",
      bounds: {},
    },
    launch: { count: 0, elapsed: 0, seen: false },
    memory: { geometries: 0, textures: 0, programs: 0 },
    bodies: [],
    error: reason,
  };
}

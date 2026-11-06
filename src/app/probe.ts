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
import type { SaveStatus } from "../persistence/store.js";
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

/** The live docking counters plan 04-03 and 04-05 consume. */
export interface WegoliteDockProbe {
  dockCount: number;
  scrapeCount: number;
  /** One increment per emitted bounce event (DOCK-03). */
  bounceCount: number;
  /** The shake envelope strength, 1 at the trigger instant (D-08). */
  shake: number;
  /** The red-frame flash alpha, 1 at the trigger instant (D-08). */
  flash: number;
  outcome: "docked" | "inFlight";
  /** The clock delta the last `docked` event reported (D-12: 1200 on Shift+C). */
  lastClockDelta: number;
}

/** The profile mutations the `?test=1` hook may request. */
export interface WegoliteProfileTestHook {
  /** Replace the balance; returns false when the value is not a safe integer. */
  setCredits(credits: number): boolean;
  /** Grant a known catalogue key; returns false when unknown or already owned. */
  grantEquipment(key: string): boolean;
}

/** The confirmation the station footer is currently waiting on. */
export interface WegoliteStationPendingProbe {
  readonly kind: "fit" | "trade";
  readonly key: string;
}

/** The live station-computer state (ECON-04/ECON-05/ECON-06/ECON-07/ECON-09). */
export interface WegoliteStationProbe {
  open: boolean;
  screen: "home" | "market" | "outfitting" | "status" | "systemData";
  selectedKey: string;
  /** The active F5 page, always clamped to 1..2. */
  page: 1 | 2;
  /** The open `[Y/N]` confirmation, or null when no line is pending. */
  pending: WegoliteStationPendingProbe | null;
  /** The home screen's message line. */
  message: string;
}

/** The market row evidence the e2e reads; never rebuilt per frame. */
export interface WegoliteEconomyMarketRow {
  key: string;
  price: number;
  stock: number;
}

/** The last accepted profile change, for the keyboard-loop proof. */
export interface WegoliteLastTradeProbe {
  readonly kind: "buy" | "sell" | "fit" | "removal";
  readonly key: string;
  /** Units for a trade; 1 for a fit or a removal. */
  readonly amount: number;
}

/** The live economy state (ECON-01/ECON-02/ECON-03/ECON-05). */
export interface WegoliteEconomyProbe {
  credits: number;
  cargo: Record<string, number>;
  marketSeed: number;
  market: WegoliteEconomyMarketRow[];
  /** The tank in tenths of a light year (0..70). */
  fuel: number;
  missiles: number;
  passengerBerths: number;
  /** Pods the hold currently occupies. */
  holdPods: number;
  /** The hold's capacity in pods (20, or 35 with the cargo bay). */
  capacityPods: number;
  /** The last accepted buy/sell/fit/removal, or null before the first one. */
  lastTrade: WegoliteLastTradeProbe | null;
}

/**
 * The live autosave state (DOCK-07, D-13, D-14).
 *
 * `committed` counts writes whose transaction completed, not writes that were
 * merely requested; `lastClock` therefore only advances on a durable save. The
 * e2e reload proof waits on those two fields (T-04-48).
 */
export interface WegoliteSaveProbe {
  status: SaveStatus;
  /**
   * Every trigger attempt, incremented at the top of `autosave()` before any
   * status/taint skip. `writes` alone cannot distinguish "not a trigger" from
   * "a trigger that was skipped", so the docking proof reads this counter.
   */
  attempts: number;
  /** Write/clear attempts queued this session. */
  writes: number;
  /** Writes whose transaction completed. */
  committed: number;
  revision: number;
  /** The saved clock of the last committed write, if any. */
  lastClock: number | null;
  /** Whether the title is currently offering Continue. */
  continueVisible: boolean;
  /** Why the last autosave or clear was skipped ("future", "unreadable", "unavailable", "tainted"), or "". */
  skipReason: string;
  /** True when IndexedDB could not be opened for this session. */
  unavailable: boolean;
}

export interface WegoliteTestHook extends WegoliteSceneTestHook {
  setPosition(x: number, y: number, z: number): void;
  setSpeed(speed: number): void;
  /** Replace the ship orientation after normalising; a zero-length is ignored. */
  setOrientation(w: number, x: number, y: number, z: number): void;
  /** Set the station roll phase, reduced modulo 2*pi. */
  setStationAngle(radians: number): void;
  /**
   * D-10 test seam: a finite non-negative safe integer balance. Marks the
   * profile tainted; the hook never persists anything.
   */
  setCredits(credits: number): void;
  /** D-10 test seam: a known catalogue key only; marks the profile tainted. */
  grantEquipment(key: string): boolean;
  /** True once any live-state mutation was accepted. */
  tainted: boolean;
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
  /** Live docking counters; plan 04-03 extends this with bounce/shake/flash. */
  dock?: WegoliteDockProbe;
  /** Live autosave state; absent on the failure surface. */
  save?: WegoliteSaveProbe;
  /** The station computer's screen state (ECON-04/ECON-09). */
  station?: WegoliteStationProbe;
  /** The live market and hold (ECON-01/ECON-02). */
  economy?: WegoliteEconomyProbe;
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
  onMutate: () => void = () => {},
  profile?: WegoliteProfileTestHook,
): WegoliteTestHook {
  const hook: WegoliteTestHook = {
    tainted: false,
    setPosition(x: number, y: number, z: number): void {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return;
      }
      state.position = vec(x, y, z);
      hook.tainted = true;
      onMutate();
    },
    setSpeed(speed: number): void {
      if (!Number.isFinite(speed)) return;
      state.speed = speed;
      hook.tainted = true;
      onMutate();
    },
    setOrientation(w: number, x: number, y: number, z: number): void {
      if (
        !Number.isFinite(w) ||
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(z)
      ) {
        return;
      }
      const lengthSquared = w * w + x * x + y * y + z * z;
      if (!(lengthSquared > 0)) return;
      const length = Math.sqrt(lengthSquared);
      state.orientation = {
        w: w / length,
        x: x / length,
        y: y / length,
        z: z / length,
      };
      hook.tainted = true;
      onMutate();
    },
    setStationAngle(radians: number): void {
      if (!Number.isFinite(radians)) return;
      const twoPi = Math.PI * 2;
      // Normalise into [0, 2*pi) so a caller cannot inject an unbounded phase.
      state.stationAngle = ((radians % twoPi) + twoPi) % twoPi;
      hook.tainted = true;
      onMutate();
    },
    setCredits(credits: number): void {
      // `isSafeInteger` rejects NaN, infinities and fractions in one predicate.
      if (!Number.isSafeInteger(credits) || credits < 0) return;
      if (profile === undefined || !profile.setCredits(credits)) return;
      hook.tainted = true;
      onMutate();
    },
    grantEquipment(key: string): boolean {
      if (profile === undefined || !profile.grantEquipment(key)) return false;
      hook.tainted = true;
      onMutate();
      return true;
    },
    swapSystem: () => scenes.swapSystem(),
    disposeSystem: () => {
      scenes.disposeSystem();
    },
  };
  return hook;
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

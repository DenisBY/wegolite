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
 * arbitrary code. Besides the live-state mutators and the scene operations it
 * carries two read/step members (plan 08-16, D-13: the one deliberate additive
 * post-split probe change): `worldHash()` reads the world hash on demand and
 * `advanceTicks(n)` steps the manual clock (`?test=1&clock=manual` only).
 * Plan 13-14 adds `probe.combat` (the player's view, shields, energy, laser and
 * cabin temperature and whether an ident lock exists, values only) and the hook
 * member `spawnTestShooter()`, which puts a firing test pilot in the player's
 * sights.
 */

import type * as THREE from "three";
import type { SaveStatus } from "../persistence/store.js";
import type { Facing } from "../sim/combat/mounts.js";
import type { FlightMode } from "../sim/flight/state.js";
import type { CompassTarget, FlightState } from "../sim/flight/state.js";
import type { AegisStatus } from "../sim/world/aegis.js";
import { vec } from "../sim/math.js";
import type { GraphicsQuality, HintId } from "../settings/schema.js";

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
  /**
   * Whether the compass target blip is drawn: false while launching and in
   * the launch pre-roll, as Oolite skips the compass blip while launching
   * (`HeadUpDisplay.m:1494`, quick 261118-spu); the ring is drawn regardless.
   */
  blip: boolean;
}

export interface WegoliteHudProbe {
  drawn: boolean;
  elements: string[];
  designScale: number;
  letterbox: [number, number];
  /**
   * The HUD-ANCHOR lift in design units: how far the HUD block is drawn above
   * the plain `hud.plist` table so it rests on the document disclaimer
   * (option B, quick task 261118-cyn).
   */
  lift: number;
  /** Visible scanner contacts, by body id (station/navBuoy/witchpoint). */
  contacts: string[];
  compass: WegoliteHudCompassProbe;
  aegis: AegisStatus;
  /** The newest message still shown (the bottom live row). */
  message: string;
  /**
   * The drawn message rows' text, top to bottom, "" for a blank row (Oolite's
   * message rows, quick task 261117-pij); empty before a HUD frame.
   */
  messageRows: string[];
  /**
   * The tank as the last drawn HUD frame of the session printed it, e.g.
   * "3.4 LY"; "" only before the session's first HUD frame. Not reset when the
   * HUD is hidden (docked), on a Load or on New Game, so read it in flight
   * after a drawn frame.
   */
  fuelText: string;
  /**
   * The tank as the last drawn HUD frame's bar drew it: fuel tenths over 70,
   * in 0..1. Same staleness as `fuelText`.
   */
  fuel: number;
  /**
   * The forward shield bar as the last drawn HUD frame drew it: the forward
   * shield over its maximum, in 0..1; 0 only before the session's first HUD
   * frame (G-17-4). Not reset when the HUD is hidden (docked), on a Load or
   * on New Game; read it in flight after a drawn frame, or read `probe.combat`
   * for live values.
   */
  shieldFwd: number;
  /**
   * The aft shield bar as the last drawn HUD frame drew it, in 0..1. Same
   * staleness as `shieldFwd`.
   */
  shieldAft: number;
  /**
   * The energy banks E1 to E4 from the top as the last drawn HUD frame drew
   * them, each in 0..1; zeros only before the session's first HUD frame. Same
   * staleness as `shieldFwd`.
   */
  energyBanks: [number, number, number, number];
  /** The committed hyperspace target name, or "" when none (D-12). */
  hyperspaceTarget?: string;
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
  screen: "home" | "market" | "outfitting" | "status" | "interfaces";
  selectedKey: string;
  /**
   * The active F5 page, always clamped to 1..2: Status 1 / Manifest 2, 1 on
   * every other screen.
   */
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
  readonly kind: "buy" | "sell" | "fit" | "removal" | "repair";
  readonly key: string;
  /** Units for a trade; 1 for a fit, a removal or a repair (key `<key>@repair`). */
  readonly amount: number;
}

/** The live economy state (ECON-01/ECON-02/ECON-03/ECON-05). */
export interface WegoliteEconomyProbe {
  credits: number;
  cargo: Record<string, number>;
  marketSeed: number;
  /** The live market's own system id (NAV-05 reload proof). */
  marketSystemId?: string;
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
  /**
   * The damaged equipment keys in damage order (Phase 19, SAVE-09): a copy of
   * the profile's list, never an alias, so the page cannot mutate the profile.
   */
  damagedEquipment: string[];
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
  /** The last app-owned save notice shown on the F2 screen / station footer. */
  notice?: string;
}

/**
 * The live F2 Save/Load screen (D-20..D-23). A manual Save publishes only the
 * committed revision and clock through the save group; this group only proves
 * the overlay, its highlighted row and the overwrite dialog state.
 */
export interface WegoliteSaveScreenProbe {
  open: boolean;
  row: "save" | "load" | "return";
  confirming: boolean;
  notice: string;
}

/** The live chart state (NAV-01/NAV-02, D-01/D-02). */
export interface WegoliteChartProbe {
  open: boolean;
  /** The continuous camera the shell paints (D-10). */
  camera: {
    centre: { x: number; y: number };
    spanX: number;
    spanY: number;
  };
  /** The committed target id, when one is set. */
  targetId?: string;
  /** The highlighted system id, when one is selected. */
  selectedId?: string;
}

/** One completed jump, as the sim reported it (NAV-04/NAV-05). */
export interface WegoliteHyperspaceLastJump {
  destinationId: string;
  clockDeltaSeconds: number;
  fuelCost: number;
}

/** The live hyperspace state (NAV-03/NAV-04, D-06/D-11). */
export interface WegoliteHyperspaceProbe {
  /** The committed target id, when one is set. */
  targetId?: string;
  /** Integer fixed steps left; 0 when idle. */
  countdown: number;
  lastJump: WegoliteHyperspaceLastJump | null;
  lastRefusal: {
    reason: "no target" | "too far" | "insufficient fuel" | "blocked";
  } | null;
}

/**
 * The pose an in-flight Continue installed (SAV-03/D-18), written exactly once
 * by the restore block and never overwritten by a resumed loop.
 */
export interface WegoliteRestoreProbe {
  mode: "docked" | "inFlight";
  systemId: string;
  position: [number, number, number];
  orientation: [number, number, number, number];
  speed: number;
  clock: number;
}

/**
 * The simulation facts the session publishes as `probe.sim` (plan 08-16, D-13).
 * Every field is a primitive, so no property is a reference into the world.
 */
export interface WegoliteSimProbe {
  /** The simulation tick of the live flight state (`FlightState.tick`). */
  tick: number;
  /** The session-memory world epoch; 0 until the first launch or arrival. */
  epoch: number;
  /**
   * The count of live, non-dead dynamic entities of the current world only (ids
   * from 101). It never counts the five static entities or the player, and it is
   * 0 while no world exists (docked, or before the first launch).
   */
  entities: number;
  /** Whether a world currently exists (it does not while docked). */
  worldLive: boolean;
  /** The effective NPC-traffic setting (true without the hook; `traffic=1` under it). */
  traffic: boolean;
  /** `"manual"` only under `?test=1&clock=manual`, otherwise `"realtime"`. */
  clock: "realtime" | "manual";
}

/** The two sim members the `?test=1` hook gains (plan 08-16). */
export interface WegoliteSimTestHook {
  /**
   * The world hash (`hashWorld` of the live state and world), computed on
   * demand, never per frame. Returns `""`, a sentinel no real hash (eight hex
   * digits) can equal, when no session state exists or the session is disposed.
   */
  worldHash(): string;
  /**
   * Step exactly `n` fixed ticks and return the tick afterwards. Always present
   * on the hook, but it steps only under `?test=1&clock=manual`: outside the
   * manual clock, for an invalid `n`, while disposed, paused or behind an
   * overlay, or without a state, it returns the current tick (0 without a
   * state), steps nothing and does not taint.
   */
  advanceTicks(n: number): number;
  /**
   * Put one firing test pilot (a Viper) 1,500 m ahead of the player, facing it,
   * so shield and energy loss is observable (CBT-07). It works only in flight
   * with traffic content loaded; otherwise it returns false and changes nothing.
   * Marks the session tainted before it mutates the world, so no autosave can
   * make the ship durable.
   *
   * `cargo` (Phase 16, D16-09) is an optional cargo capsule count, an integer
   * 0 to 200 (`MAX_ENTITY_CARGO`), so destroying the shooter releases pods.
   * Absent, the ship spawns with cargo 0 exactly as before. Any other value
   * (a fraction, a negative or too large count, a non-number) still taints the
   * session, spawns nothing and returns false. It returns a boolean only and
   * exposes no entity id.
   */
  spawnTestShooter(cargo?: number): boolean;
  /**
   * Put three scripted flying NPCs 3,000 m from the player (WORLD-07): a Shuttle
   * flying to the station, a Viper intercepting the player and an Adder fleeing
   * it. It works only in flight with a live world and traffic content; otherwise
   * it returns false and changes nothing. It marks the session tainted before it
   * mutates the world, so no autosave can make the ships durable. If the sim
   * refuses a ship after an earlier one spawned, it returns false and the
   * session stays tainted with the earlier ship in the world (autosave refuses
   * it). It returns a boolean only and exposes no entity id.
   */
  spawnTestFlyers(): boolean;
  /**
   * Put one attacking NPC (a Viper) 3,000 m ahead of the player (Phase 17, D-02).
   * It flies Oolite's attack behaviours at the player and fires through the NPC
   * fire gate, so its hits drain the player's shields and then energy. For
   * manual checks and UAT only: no browser spec drives it. It works only in
   * flight with a live world and traffic content; otherwise it returns false
   * and changes nothing. It marks the session tainted before it mutates the
   * world, so no autosave can make the attacker durable. It returns a boolean
   * only and exposes no entity id.
   */
  spawnTestAttacker(): boolean;
  /**
   * Put one inert ship (no AI) of every record of the loaded NPC catalogue on a
   * ring ahead of the player (plan 21-16, QUAL-09 staged): the full-anarchy
   * draw-call spike. It works only in flight with a live world and traffic
   * content; otherwise it returns false and changes nothing. It is all or
   * nothing: with no room in the world for every ship it spawns none and returns
   * false. It marks the session tainted before it mutates the world, so no
   * autosave can make the ships durable. If the sim spawner refuses (no room,
   * no valid record), nothing is spawned, but the session stays tainted. It
   * returns a boolean only and exposes no entity id.
   */
  spawnTestAnarchy(): boolean;
}

export interface WegoliteTestHook
  extends WegoliteSceneTestHook, WegoliteSimTestHook {
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

/**
 * The player's combat state as the browser specs read it (CBT-04 to CBT-07):
 * values only. `identLocked` says whether a lock exists; the locked entity's id
 * never leaves the simulation (T-13-28).
 */
export interface WegoliteCombatProbe {
  /** The current cockpit view, which is also the weapon facing. */
  view: Facing;
  /** Forward and aft shield, `0..128`. */
  fwdShield: number;
  aftShield: number;
  /** Energy banks, `0..256`. */
  energy: number;
  /** The laser temperature of the current facing. */
  laserTemp: number;
  cabinTemp: number;
  /** Whether the ident system holds a live lock. */
  identLocked: boolean;
}

/** QUAL-05: the WebGL context-recovery state and its counters. */
export interface WegoliteRecoveryProbe {
  state: "live" | "lost" | "failed";
  losses: number;
  restores: number;
}

/**
 * Phase 20, DEATH-01: the game-over latch as the probe shows it. Published only
 * while the session is latched game over (`updateProbe`), so the browser specs
 * can wait for it. The culprit is a spec or ident key, never an entity id.
 */
export interface WegoliteDeathProbe {
  dead: true;
  cause: { damage: "laser" | "scrape"; culprit?: string };
}

export interface WegoliteProbe {
  ready: boolean;
  calls: number;
  triangles: number;
  logDepth: boolean;
  depthBits: number;
  webgl2: boolean;
  renders: number;
  /**
   * Animation frames the session loop has run, drawn or not.
   *
   * `renders` stops advancing while the session is docked or paused, because
   * an unchanging scene is drawn once and then left alone. A wait that only
   * needs time to pass in the loop reads this field instead.
   */
  frames: number;
  homeSystems: number;
  codeSplitGalaxies: number;
  /**
   * G-8: the HUD message-queue depth. Required, not optional, so a probe
   * literal that forgets to publish the queue state fails to typecheck.
   */
  messages: number;
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
  /**
   * `preRolling` and `preRollElapsed` are the app-side launch pre-roll (quick
   * 261118-os8): false and 0 when none runs; the sim stays docked during it.
   */
  launch: {
    count: number;
    elapsed: number;
    seen: boolean;
    preRolling: boolean;
    preRollElapsed: number;
  };
  /** WORLD-04: the live GPU counters a scene swap must not grow. */
  memory: WegoliteMemoryProbe;
  bodies: string[];
  /** Whether the Cobra is drawn: false in every mode, the launch included. */
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
  /** QUAL-05: the WebGL context-recovery state; absent on the failure surface. */
  recovery?: WegoliteRecoveryProbe;
  /** The station computer's screen state (ECON-04/ECON-09). */
  station?: WegoliteStationProbe;
  /** The live market and hold (ECON-01/ECON-02). */
  economy?: WegoliteEconomyProbe;
  /** The live chart state (NAV-01/NAV-02). */
  chart?: WegoliteChartProbe;
  /** The live hyperspace state (NAV-03/NAV-04). */
  hyperspace?: WegoliteHyperspaceProbe;
  /** The pose the in-flight Continue installed (SAV-03). */
  restore?: WegoliteRestoreProbe;
  /**
   * The death, present only while the session is latched game over (Phase 20,
   * DEATH-01) and removed otherwise; `mode` reads "dead" with it.
   */
  death?: WegoliteDeathProbe;
  /** The live F2 Save/Load overlay (D-20..D-23). */
  saveScreen?: WegoliteSaveScreenProbe;
  /** The live current system id; the durable identity a reload proof reads. */
  systemId?: string;
  /** The graphics quality the installed scene was built at. */
  quality?: GraphicsQuality;
  /** True when the installed scene carries the High-quality atmosphere shell. */
  atmosphere?: boolean;
  /** How many nebula quads the installed scene draws; 0 at Standard. */
  nebulae?: number;
  /**
   * The live active-camera aspect (WORLD-02). The e2e proof reads this instead
   * of a screenshot. Absent on the failure surface, where no camera renders.
   */
  aspect?: number;
  /**
   * The simulation facts (plan 08-16); published while a session state exists,
   * absent in `menu` mode, after `dispose()` and on the failure surface.
   */
  sim?: WegoliteSimProbe;
  /**
   * The player's combat state (plan 13-14); published while a combat state
   * exists, absent in `menu` mode, after `dispose()` and on the failure surface.
   */
  combat?: WegoliteCombatProbe;
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
  onMutate: (() => void) | undefined,
  profile: WegoliteProfileTestHook | undefined,
  sim: WegoliteSimTestHook,
): WegoliteTestHook {
  const mutated = onMutate ?? ((): void => undefined);
  const hook: WegoliteTestHook = {
    tainted: false,
    setPosition(x: number, y: number, z: number): void {
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
        return;
      }
      state.position = vec(x, y, z);
      hook.tainted = true;
      mutated();
    },
    setSpeed(speed: number): void {
      if (!Number.isFinite(speed)) return;
      state.speed = speed;
      hook.tainted = true;
      mutated();
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
      mutated();
    },
    setStationAngle(radians: number): void {
      if (!Number.isFinite(radians)) return;
      const twoPi = Math.PI * 2;
      // Normalise into [0, 2*pi) so a caller cannot inject an unbounded phase.
      state.stationAngle = ((radians % twoPi) + twoPi) % twoPi;
      hook.tainted = true;
      mutated();
    },
    setCredits(credits: number): void {
      // `isSafeInteger` rejects NaN, infinities and fractions in one predicate.
      if (!Number.isSafeInteger(credits) || credits < 0) return;
      if (profile === undefined || !profile.setCredits(credits)) return;
      hook.tainted = true;
      mutated();
    },
    grantEquipment(key: string): boolean {
      if (profile === undefined || !profile.grantEquipment(key)) return false;
      hook.tainted = true;
      mutated();
      return true;
    },
    swapSystem: () => scenes.swapSystem(),
    disposeSystem: () => {
      scenes.disposeSystem();
    },
    worldHash: () => sim.worldHash(),
    advanceTicks: (n: number) => sim.advanceTicks(n),
    spawnTestShooter: (cargo?: number) => {
      if (!sim.spawnTestShooter(cargo)) return false;
      hook.tainted = true;
      return true;
    },
    spawnTestFlyers: () => {
      if (!sim.spawnTestFlyers()) return false;
      hook.tainted = true;
      return true;
    },
    spawnTestAttacker: () => {
      if (!sim.spawnTestAttacker()) return false;
      hook.tainted = true;
      return true;
    },
    spawnTestAnarchy: () => {
      if (!sim.spawnTestAnarchy()) return false;
      hook.tainted = true;
      return true;
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
    frames: 0,
    homeSystems: 0,
    codeSplitGalaxies: 0,
    messages: 0,
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
      lift: 0,
      contacts: [],
      compass: { target: "planet", forward: false, blip: false },
      aegis: "none",
      message: "",
      messageRows: [],
      fuelText: "",
      fuel: 0,
      shieldFwd: 0,
      shieldAft: 0,
      energyBanks: [0, 0, 0, 0],
      bounds: {},
    },
    launch: {
      count: 0,
      elapsed: 0,
      seen: false,
      preRolling: false,
      preRollElapsed: 0,
    },
    memory: { geometries: 0, textures: 0, programs: 0 },
    bodies: [],
    error: reason,
  };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The authoritative flight state (FLGT-01..FLGT-03, D-10).
 *
 * A sibling of the Phase 1 probe state, not a mutation of it: the probe's
 * golden hash must keep replaying. Plain data only — no methods, no clock, no
 * DOM. `paused` deliberately lives in the app session: a UI flag inside the
 * hashed state would make a pause change the replay hash.
 */

import { canon, fnv1a32 } from "../hash.js";
import { add, scale, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { SystemLayout } from "../world/layout.js";

export type FlightMode = "docked" | "launching" | "inFlight";
export type CompassMode = "auto" | "planet" | "station" | "witchpoint";
export type CompassTarget = "planet" | "station" | "witchpoint";

export interface TorusState {
  engaged: boolean;
  factor: number;
  massLocked: boolean;
  lastFactor: number;
}

/** The target snapshotted when the 1800-step countdown started (D-06). */
export interface HyperspaceTargetSnapshot {
  readonly id: string;
  /** Integer chart units between the origin and the target. */
  readonly dist: number;
  /** Exact integer fuel cost in tenths of a light year. */
  readonly fuelCost: number;
}

export interface FlightState {
  tick: number;
  mode: FlightMode;
  /** Days * 86,400 + seconds; starts at Oolite's `PLAYER_SHIP_CLOCK_START`. */
  clockSeconds: number;
  /** Seconds since the new game began; drives station roll and planet spin. */
  flightTime: number;
  /** World metres, float64. Never uploaded to the GPU without subtraction. */
  position: Vec3;
  /** Local -Z is forward. */
  orientation: Quat;
  /** Scalar forward speed in game units per second (Aristotelian model). */
  speed: number;
  pitchRate: number;
  rollRate: number;
  torus: TorusState;
  /** Steps left on the fixed-step witchspace countdown; 0 = idle. */
  hyperspaceCountdown: number;
  /** The target snapshot taken at countdown start; `null` when idle. */
  hyperspaceTarget: HyperspaceTargetSnapshot | null;
  /** Radians the station has rolled about its local +Z. */
  stationAngle: number;
  launchElapsed: number;
  launchCount: number;
  /** Cleared by a launch; set once the ship is wholly clear of the contact proxy. */
  dockArmed: boolean;
  /** Successful manual/computer docks, shown in the probe and persisted later. */
  dockCount: number;
  /** Band-correction ticks; one increment per emitted scrape event. */
  scrapeTicks: number;
  /**
   * The transient contact velocity (world m/s) added on top of the scalar
   * forward speed. A bounce reflects into an impulse and decays; a flight
   * tick integrates it into the position (D-07).
   */
  impulse: Vec3;
  /** Contact responses emitted; one per bounce event (DOCK-03). */
  bounceCount: number;
  /** Ticks where `sanitizeFlightState` repaired the state (T-04-41). */
  repairCount: number;
  compassMode: CompassMode;
  compassTarget: CompassTarget;
}

/** The interpolatable part of the state, shared by the loop and the renderer. */
export interface FlightPose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

/** Oolite's `PLAYER_SHIP_CLOCK_START` (PlayerEntity.h). */
export const CLOCK_START = 2_084_004 * 86_400;

/** The docked pose: parked at the dock mouth, facing the planet. */
export function initFlightState(layout: SystemLayout): FlightState {
  return {
    tick: 0,
    mode: "docked",
    clockSeconds: CLOCK_START,
    flightTime: 0,
    position: add(
      layout.station.position,
      scale(layout.stationToPlanet, layout.dockOffset),
    ),
    orientation: layout.stationBaseQuat,
    speed: 0,
    pitchRate: 0,
    rollRate: 0,
    torus: { engaged: false, factor: 1, massLocked: false, lastFactor: 1 },
    hyperspaceCountdown: 0,
    hyperspaceTarget: null,
    stationAngle: 0,
    launchElapsed: 0,
    launchCount: 0,
    // A fresh game starts parked at the mouth: the corridor is already clear.
    dockArmed: true,
    dockCount: 0,
    scrapeTicks: 0,
    impulse: vec(0, 0, 0),
    bounceCount: 0,
    repairCount: 0,
    compassMode: "auto",
    compassTarget: "planet",
  };
}

/** A read-only snapshot for the controller and the renderer. */
export function poseOf(state: FlightState): FlightPose {
  return { position: state.position, orientation: state.orientation };
}

/**
 * Canonical labelled text (Pattern C). Fixed key order, every number through
 * `canon`, never `JSON.stringify`.
 */
export function serializeFlight(state: FlightState): string {
  return [
    `mode=${state.mode}`,
    `tick=${canon(state.tick, 0)}`,
    `clock=${canon(state.clockSeconds, 6)}`,
    `flightTime=${canon(state.flightTime, 6)}`,
    `p=${canon(state.position.x)},${canon(state.position.y)},${canon(state.position.z)}`,
    `q=${canon(state.orientation.w)},${canon(state.orientation.x)},${canon(state.orientation.y)},${canon(state.orientation.z)}`,
    `speed=${canon(state.speed, 6)}`,
    `pitchRate=${canon(state.pitchRate, 6)}`,
    `rollRate=${canon(state.rollRate, 6)}`,
    `torus=${String(state.torus.engaged)}:${canon(state.torus.factor, 6)}:${String(state.torus.massLocked)}:${canon(state.torus.lastFactor, 6)}`,
    `hyperspaceCountdown=${canon(state.hyperspaceCountdown, 0)}`,
    `hyperspaceTarget=${
      state.hyperspaceTarget === null
        ? "none"
        : `${state.hyperspaceTarget.id},${canon(state.hyperspaceTarget.dist, 0)},${canon(state.hyperspaceTarget.fuelCost, 0)}`
    }`,
    `stationAngle=${canon(state.stationAngle, 6)}`,
    `launchElapsed=${canon(state.launchElapsed, 6)}`,
    `launchCount=${canon(state.launchCount, 0)}`,
    `compass=${state.compassTarget}`,
    `dockArmed=${String(state.dockArmed)}`,
    `dockCount=${canon(state.dockCount, 0)}`,
    `scrapeTicks=${canon(state.scrapeTicks, 0)}`,
    `impulse=${canon(state.impulse.x)},${canon(state.impulse.y)},${canon(state.impulse.z)}`,
    `bounceCount=${canon(state.bounceCount, 0)}`,
    `repairCount=${canon(state.repairCount, 0)}`,
  ].join("\n");
}

export function hashFlight(state: FlightState): string {
  return fnv1a32(serializeFlight(state));
}

/** The docked/launch pose: the station centre plus the dock offset. */
export function dockMouthPosition(layout: SystemLayout): Vec3 {
  return add(
    layout.station.position,
    scale(layout.stationToPlanet, layout.dockOffset),
  );
}

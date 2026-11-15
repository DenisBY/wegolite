// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The native steering state of one world ship (AI-01, plan 14-08).
 *
 * `Entity.steer` is plain data (no class, closure or `Map`), so a world that
 * holds it can be hashed, snapshotted and sanitised like every other field. It
 * names exactly the state the in-scope Oolite behaviours read or write; the
 * Oolite source of each field is `ShipEntity.h:192-198, 327-364, 437`.
 * `flightSpeed` stays `Entity.speed`; the desired speed, desired range,
 * destination, behaviour and target stay in `Entity.nav`.
 *
 * The field set is FROZEN by plan 14-08: it is hashed (`serializeEntity`),
 * snapshotted (`WORLD_SNAPSHOT_VERSION` 3) and golden-pinned, so a later plan
 * that needs another field stops and reports it instead of moving the shape.
 *
 * Yaw is not modelled: every in-scope behaviour sets `stick_yaw` to 0 and yaw
 * starts at 0, so `flightYaw` is always 0 and has no field here.
 *
 * Domain (every bound is in `../world/limits.ts`, imported by the sanitiser and
 * the snapshot parser):
 *  - rates and sticks: finite, magnitude at most `MAX_STEER_RATE` (rad/s);
 *  - `accuracy`: `ACCURACY_UNRESOLVED` (-100, Oolite's out-of-range setup
 *    default at `ShipEntity.m:665-672`, "not drawn yet") or a resolved value in
 *    `MIN_ACCURACY..MAX_ACCURACY` (`setAccuracy:` clamps at 1126-1143);
 *  - `frustration`: `0..MAX_FRUSTRATION`;
 *  - `successFactor`: finite, magnitude at most `MAX_ENTITY_MAGNITUDE`;
 *  - `escortSlot`: integer `0..MAX_ESCORT_SLOT` (Oolite `MAX_ESCORTS` 16);
 *  - `trackingCount` 0 (no curve, which is also "start pending") or 4 (a
 *    started curve, as `startTrackingCurve` and `updateTrackingCurve` always
 *    keep four samples, `ShipEntity.m:5412-5489`). With count 4 the sample ticks
 *    are strictly decreasing (`ticks[0] > ticks[1] > ticks[2] > ticks[3]`), so
 *    `calculateTrackingCurve` never divides by zero (`ShipEntity.m:5477-5487`).
 *    Ticks are SIGNED integers (`|tick|` at most `MAX_UINT32`): a curve started
 *    early in a world stores samples up to the reaction time before the current
 *    tick, which is negative before tick 180. At count 0 the ticks and the
 *    positions are zero (the canonical form), whatever a previous curve left.
 */

import type { Vec3 } from "../math.js";
import type { BehaviourId, EntityId } from "../world/ids.js";

/**
 * The accuracy a ship holds until the steering draws it (Oolite's own
 * out-of-range setup default, `ShipEntity.m:665-672`). The draw is lazy (plan
 * 14-09), so the sentinel is a real, hashed state.
 */
export const ACCURACY_UNRESOLVED = -100;

/**
 * The condition `avoidCollision` stores before it steers away
 * (`ShipEntity.m:5904-5936`) and restores afterwards.
 */
export interface SavedCondition {
  behaviour: BehaviourId;
  targetId: EntityId;
  desiredRange: number;
  desiredSpeed: number;
  destination: Vec3;
}

/** Four tracking-curve sample ticks, newest first. */
export type TrackingTicks = [number, number, number, number];

/** Four tracking-curve sample positions, newest first. */
export type TrackingPositions = [Vec3, Vec3, Vec3, Vec3];

export interface SteerComponent {
  /** Current roll rate, rad/s (`flightRoll`). */
  flightRoll: number;
  /** Current pitch rate, rad/s (`flightPitch`). */
  flightPitch: number;
  /** Commanded roll rate, rad/s (`stick_roll`). */
  stickRoll: number;
  /** Commanded pitch rate, rad/s (`stick_pitch`). */
  stickPitch: number;
  /** `ACCURACY_UNRESOLVED` until drawn, then a value in `MIN_ACCURACY..MAX_ACCURACY`. */
  accuracy: number;
  /** Degree of dissatisfaction with the current behaviour (`frustration`). */
  frustration: number;
  /** The last tracking quality (`success_factor`). */
  successFactor: number;
  /** Whether the ship is mid pitch-over (`pitching_over`). */
  pitchingOver: boolean;
  /** Offset factors for a pursuing ship's position (`jink`). */
  jink: Vec3;
  /** The id of the body the ship is steering away from; 0 for none. */
  proximityAlert: EntityId;
  /** The escort's slot in its mother's formation, 0 to 15. */
  escortSlot: number;
  /** 0 (no curve or start pending) or 4 (a started curve). */
  trackingCount: number;
  trackingTicks: TrackingTicks;
  trackingPositions: TrackingPositions;
  /** The pre-avoidance condition, or null when none is saved. */
  saved: SavedCondition | null;
  /**
   * Set by `ShipControl.perform` when a `perform*` entry effect needs a draw,
   * the ship's stats or another body; cleared by the steering at the start of
   * the actor's next update when it completes that entry (plan 14-09).
   */
  entryPending: boolean;
}

/** A fresh default record for a ship in formation slot `escortSlot`. */
export function createSteerComponent(escortSlot: number): SteerComponent {
  return {
    flightRoll: 0,
    flightPitch: 0,
    stickRoll: 0,
    stickPitch: 0,
    accuracy: ACCURACY_UNRESOLVED,
    frustration: 0,
    successFactor: 0,
    pitchingOver: false,
    jink: { x: 0, y: 0, z: 0 },
    proximityAlert: 0,
    escortSlot,
    trackingCount: 0,
    trackingTicks: [0, 0, 0, 0],
    trackingPositions: [
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
      { x: 0, y: 0, z: 0 },
    ],
    saved: null,
    entryPending: false,
  };
}

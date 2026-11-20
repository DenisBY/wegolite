// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The static laser targets (CBT-17, Phase 18).
 *
 * The main station and the two buoys are static entities with fixed ids
 * (`./ids.ts`, D-06, D-07): they never enter the entity store, so the kill path
 * can never remove them. Oolite lists them among the ships a laser may hit
 * (`Universe.m:5575-5585`: every entity that `isShip` and `canCollide`, and the
 * station can collide). This table names, for each static target, the layout
 * body it sits on, the hull its octrees come from, its ident name key and its
 * `StaticHealth` field, in ascending id, so the shot resolution can list them
 * ahead of the player (id 100) and the store ships.
 *
 * A row is a candidate only when the caller's hull table holds its `hullKey`
 * (the traffic-on session merges the static hulls, plan 18-13); without them
 * nothing changes. Plan 18-05 appended the two buoys (250 energy in
 * `World.staticHealth`, destroyed at 0 for the life of their world, D-04); plan
 * 18-15 adds their frangible subentities (`BUOY_SUBENTITY_TARGETS`, PD-01). A
 * destroyed buoy (`isBuoyDestroyed`) is no
 * candidate; ident, blockage, compass, scanner and view read the same
 * predicate (D-05, plans 18-06 to 18-08).
 *
 * One pose per static, shared by the hit test, docking and the renderer
 * (PITFALLS 11, `staticPose`):
 *
 * - the station: its layout centre and `portQuaternion(layout, stationAngle)`;
 * - a buoy: its layout position plus its per-world offset (`buoyPosition`,
 *   PD-02) and the tumble of the flight clock (`buoyOrientation`). Oolite's
 *   buoy AI tumbles it at roll 0.10 and pitch 0.15 rad/s
 *   (`performBuoyTumble`, `ShipEntityAI.m:458-464`). Oolite integrates the two
 *   rates step by step in the body frame (`behaviour_tumble` and
 *   `applySticks`, `ShipEntity.m:3724-3727`); this is the closed form
 *   roll(+Z, 0.10 t) x pitch(+X, 0.15 t) the renderer drew since Phase 3, a
 *   different rotation for t > 0 and a recorded divergence (FIDELITY). It is
 *   deterministic and needs no state.
 */

import { portQuaternion } from "../dock/port-frame.js";
import { add, axisAngle, identity, mul } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { StaticHealth } from "./entity.js";
import {
  MAIN_STATION_ID,
  NAV_BUOY_SUBENTITY_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
  WITCHPOINT_BUOY_SUBENTITY_ID,
} from "./ids.js";
import type { EntityId } from "./ids.js";
import type { SystemLayout } from "./layout.js";
import type { World } from "./world.js";

/** The layout key of a buoy. */
export type BuoyKey = "witchpoint" | "navBuoy";

/**
 * Oolite's `performBuoyTumble` rates, radians per second
 * (`ShipEntityAI.m:458-464`: `stick_roll = 0.10`, `stick_pitch = 0.15`).
 */
export const BUOY_ROLL_RATE = 0.1;
export const BUOY_PITCH_RATE = 0.15;

/** One static entity a laser may hit. */
export interface StaticTarget {
  readonly id: EntityId;
  /** The layout body the target sits on. */
  readonly layoutKey: "station" | "witchpoint" | "navBuoy";
  /** The hull table key of its octrees. */
  readonly hullKey: string;
  /** The compiled ident name key (plan 18-06 reads it). */
  readonly identKey: string;
  /** Its energy field in `World.staticHealth`. */
  readonly healthKey: keyof StaticHealth;
}

/** The static laser targets in ascending id. */
export const STATIC_TARGETS: readonly StaticTarget[] = Object.freeze([
  Object.freeze({
    id: MAIN_STATION_ID,
    layoutKey: "station",
    hullKey: "coriolis-station",
    identKey: "coriolis-station",
    healthKey: "station",
  } as const),
  Object.freeze({
    id: WITCHPOINT_BUOY_ID,
    layoutKey: "witchpoint",
    hullKey: "buoy",
    identKey: "buoy-witchpoint",
    healthKey: "witchpoint",
  } as const),
  Object.freeze({
    id: STATION_NAV_BUOY_ID,
    layoutKey: "navBuoy",
    hullKey: "buoy",
    identKey: "buoy",
    healthKey: "navBuoy",
  } as const),
]);

/**
 * The share of a laser hit's damage a frangible parent takes when the hit is
 * routed to its subentity: Oolite's "1% bleed-through damage"
 * (`ShipEntity.m:10202-10209` for an NPC's shot, `10409-10416` for the
 * player's). The subentity takes the full damage.
 */
export const FRANGIBLE_BLEED_THROUGH = 0.01;

/**
 * A buoy's frangible subentity as a hit target (Phase 18, PD-01). It is no
 * body and no candidate of its own: the beam meets it as part `subentityIndex`
 * of its buoy's hull (`../combat/hit.ts`), and the shot resolution routes the
 * damage to this id. Its energy and Oolite's sticky routing flag live in
 * `World.buoys[buoyKey]` (`subentityEnergy`, `subentityTakingDamage`).
 */
export interface BuoySubentityTarget {
  readonly id: EntityId;
  readonly buoyKey: BuoyKey;
  /** The subentity's index in the buoy hull's `subentities`. */
  readonly subentityIndex: number;
}

const WITCHPOINT_BUOY_SUBENTITY: BuoySubentityTarget = Object.freeze({
  id: WITCHPOINT_BUOY_SUBENTITY_ID,
  buoyKey: "witchpoint",
  subentityIndex: 0,
});

const NAV_BUOY_SUBENTITY: BuoySubentityTarget = Object.freeze({
  id: NAV_BUOY_SUBENTITY_ID,
  buoyKey: "navBuoy",
  subentityIndex: 0,
});

/** The two buoy subentities in ascending id (witchpoint 6, nav buoy 7). */
export const BUOY_SUBENTITY_TARGETS: readonly BuoySubentityTarget[] =
  Object.freeze([WITCHPOINT_BUOY_SUBENTITY, NAV_BUOY_SUBENTITY]);

/** The buoy subentity target with `id`, or undefined for any other number. */
export function buoySubentityTargetById(
  id: EntityId,
): BuoySubentityTarget | undefined {
  for (const row of BUOY_SUBENTITY_TARGETS) {
    if (row.id === id) return row;
  }
  return undefined;
}

/** The subentity row of the buoy `key`. */
export function buoySubentityTargetOf(key: BuoyKey): BuoySubentityTarget {
  return key === "witchpoint" ? WITCHPOINT_BUOY_SUBENTITY : NAV_BUOY_SUBENTITY;
}

/**
 * True while the buoy `key`'s subentity is attached: its energy is above 0
 * (PD-01). At 0 it is detached for the life of its world: it is no beam part
 * (`HitTarget.detachedSubentities`), nothing recharges it, and only a new
 * world restores it.
 */
export function isBuoySubentityAttached(world: World, key: BuoyKey): boolean {
  return world.buoys[key].subentityEnergy > 0;
}

/** The static target with `id`, or undefined for any other number. */
export function staticTargetById(id: EntityId): StaticTarget | undefined {
  for (const row of STATIC_TARGETS) {
    if (row.id === id) return row;
  }
  return undefined;
}

/**
 * The main station's pose at `stationAngle`: its layout centre and the port
 * quaternion (`../dock/port-frame.ts`), the orientation docking and the
 * renderer use.
 */
export function stationPose(
  layout: SystemLayout,
  stationAngle: number,
): { readonly position: Vec3; readonly orientation: Quat } {
  return {
    position: layout.station.position,
    orientation: portQuaternion(layout, stationAngle),
  };
}

/**
 * A buoy's orientation at `flightTime` seconds of the flight clock: roll about
 * local +Z by `BUOY_ROLL_RATE * t`, then pitch about local +X by
 * `BUOY_PITCH_RATE * t`, as one product (see the module comment for the
 * divergence from Oolite's incremental tumble). The identity for a non-finite
 * time, so a corrupt clock never poisons a pose.
 */
export function buoyOrientation(flightTime: number): Quat {
  if (!Number.isFinite(flightTime)) return identity();
  return mul(
    axisAngle(0, 0, 1, flightTime * BUOY_ROLL_RATE),
    axisAngle(1, 0, 0, flightTime * BUOY_PITCH_RATE),
  );
}

/**
 * Where the buoy `key` is (PD-02): its layout position plus the world's offset.
 * Without a world, or while the offset is zero in every component (`-0`
 * included), it is the layout position itself, so every consumer sees the same
 * signed zeros bit for bit.
 */
export function buoyPosition(
  world: World | undefined,
  layout: SystemLayout,
  key: BuoyKey,
): Vec3 {
  const base = layout[key].position;
  if (world === undefined) return base;
  const offset = world.buoys[key].offset;
  if (offset.x === 0 && offset.y === 0 && offset.z === 0) return base;
  return add(base, offset);
}

/** The clock a static pose reads (the flight state carries both). */
export interface StaticPoseClock {
  readonly stationAngle: number;
  readonly flightTime: number;
}

/**
 * The pose of `target` now: `stationPose` for the station, `buoyPosition` and
 * `buoyOrientation` for a buoy. The one pose the hit test uses; the renderer
 * draws the buoy with the same `buoyOrientation` (PITFALLS 11).
 */
export function staticPose(
  target: StaticTarget,
  layout: SystemLayout,
  flight: StaticPoseClock,
  world: World | undefined,
): { readonly position: Vec3; readonly orientation: Quat } {
  if (target.layoutKey === "station") {
    return stationPose(layout, flight.stationAngle);
  }
  return {
    position: buoyPosition(world, layout, target.layoutKey),
    orientation: buoyOrientation(flight.flightTime),
  };
}

/**
 * True when the buoy `key` is destroyed: its health is not above 0 (D-04). A
 * destroyed buoy stays destroyed for the life of its world: nothing recharges
 * it, and only a new world restores it.
 */
export function isBuoyDestroyed(world: World, key: BuoyKey): boolean {
  return !(world.staticHealth[key] > 0);
}

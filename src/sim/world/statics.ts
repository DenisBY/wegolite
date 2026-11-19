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
 * nothing changes. Plan 18-05 appends the buoys and plan 18-15 their
 * subentities.
 *
 * The station's pose is the one docking and the renderer use (PITFALLS 11): the
 * station centre and `portQuaternion(layout, stationAngle)`.
 */

import { portQuaternion } from "../dock/port-frame.js";
import type { Quat, Vec3 } from "../math.js";
import type { StaticHealth } from "./entity.js";
import { MAIN_STATION_ID } from "./ids.js";
import type { EntityId } from "./ids.js";
import type { SystemLayout } from "./layout.js";

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
]);

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

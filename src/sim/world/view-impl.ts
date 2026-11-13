// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `createWorldView`: the read-only `WorldView` over a world, a layout and the
 * live player (FOUND-13, D-06, D-07).
 *
 * The world never holds the player: the `FlightState` comes in per call, so a
 * Load or an arrival cannot leave a view reading a replaced object (G-8). The
 * five static entities (ids 1-5) resolve through the world's stored records and
 * `layout[record.layoutKey]` at call time, so the layout stays the single
 * authority for their geometry (D-07). Every vector and quaternion that leaves
 * this module is made by `copyVec` and `copyQuat`, so no path hands out a live
 * reference (FOUND-13, Pitfall 19).
 *
 * Per-world id scope (CONTEXT D-06 as amended 2026-11-12): the view answers for
 * the ids of its own world only.
 */

import type { FlightState } from "../flight/state.js";
import { axisAngle, mul } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import type { Entity } from "./entity.js";
import { MAIN_STATION_ID, PLANET_ID, PLAYER_ID, SUN_ID } from "./ids.js";
import type { EntityId } from "./ids.js";
import type { SystemLayout } from "./layout.js";
import type { BodyView, ScanFilter, ShipView, WorldView } from "./view.js";
import { staticEntity } from "./world.js";
import type { World } from "./world.js";

function copyVec(v: Vec3): Vec3 {
  return { x: v.x, y: v.y, z: v.z };
}

function copyQuat(q: Quat): Quat {
  return { w: q.w, x: q.x, y: q.y, z: q.z };
}

function copyBody(body: BodyView): BodyView {
  return {
    id: body.id,
    kind: body.kind,
    scanClass: body.scanClass,
    position: copyVec(body.position),
    orientation: copyQuat(body.orientation),
    speed: body.speed,
  };
}

function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** A scan hit before ordering. */
interface ScanHit {
  readonly id: EntityId;
  readonly distanceSq: number;
}

/**
 * A view of `world` as seen by AI code. `player` is read on every call through
 * the object it was created with; create a new view after replacing the
 * `FlightState`. The returned view is read-only and hands out copies.
 */
export function createWorldView(
  world: World,
  player: FlightState,
  layout: SystemLayout,
): WorldView {
  /**
   * The body for `id` with live references inside it. Private: every public
   * return path copies the result through `copyBody` or `copyVec`/`copyQuat`.
   */
  function locate(id: EntityId): BodyView | undefined {
    if (id === PLAYER_ID) {
      return {
        id: PLAYER_ID,
        kind: "player",
        scanClass: "CLASS_PLAYER",
        position: player.position,
        orientation: player.orientation,
        speed: player.speed,
      };
    }
    const record = staticEntity(world, id);
    if (record !== undefined) {
      // The station's presentation roll lives in `stationAngle`; compose it
      // exactly as the renderer does (src/render/bodies/station.ts): the base
      // orientation first, then the roll about local +Z.
      const orientation: Quat =
        record.kind === "station"
          ? mul(layout.stationBaseQuat, axisAngle(0, 0, 1, player.stationAngle))
          : { w: 1, x: 0, y: 0, z: 0 };
      return {
        id: record.id,
        kind: record.kind,
        scanClass: record.scanClass,
        position: layout[record.layoutKey].position,
        orientation,
        speed: 0,
      };
    }
    const entity = world.store.get(id);
    if (entity === undefined) return undefined;
    return {
      id: entity.id,
      kind: entity.kind,
      scanClass: entity.scanClass,
      position: entity.position,
      orientation: entity.orientation,
      speed: entity.speed,
    };
  }

  function shipOf(entity: Entity): ShipView {
    return {
      id: entity.id,
      kind: entity.kind,
      scanClass: entity.scanClass,
      position: copyVec(entity.position),
      orientation: copyQuat(entity.orientation),
      speed: entity.speed,
      behaviour: entity.nav.behaviour,
      targetId: entity.nav.targetId,
      destination: copyVec(entity.nav.destination),
      desiredRange: entity.nav.desiredRange,
      desiredSpeed: entity.nav.desiredSpeed,
    };
  }

  /** Every id a scan may report, ascending within each group. */
  function candidateIds(): EntityId[] {
    const ids: EntityId[] = world.statics.map((record) => record.id);
    ids.push(PLAYER_ID);
    for (const entity of world.store.live) {
      if (!entity.dead) ids.push(entity.id);
    }
    return ids;
  }

  return {
    tick: player.tick,
    playerId: PLAYER_ID,
    isValid(id: EntityId): boolean {
      return locate(id) !== undefined;
    },
    body(id: EntityId): BodyView | undefined {
      const found = locate(id);
      return found === undefined ? undefined : copyBody(found);
    },
    ship(id: EntityId): ShipView | undefined {
      const entity = world.store.get(id);
      return entity === undefined ? undefined : shipOf(entity);
    },
    scan(
      self: EntityId,
      range: number,
      filter?: ScanFilter,
    ): readonly EntityId[] {
      if (!Number.isFinite(range) || range < 0) return [];
      const origin = locate(self);
      if (origin === undefined) return [];
      const rangeSq = range * range;
      const kinds = filter?.kinds;
      const hits: ScanHit[] = [];
      for (const id of candidateIds()) {
        if (id === self) continue;
        const body = locate(id);
        if (body === undefined) continue;
        if (kinds !== undefined && !kinds.includes(body.kind)) continue;
        const distanceSq = distanceSquared(origin.position, body.position);
        if (distanceSq <= rangeSq) hits.push({ id, distanceSq });
      }
      hits.sort((a, b) =>
        a.distanceSq < b.distanceSq
          ? -1
          : a.distanceSq > b.distanceSq
            ? 1
            : a.id - b.id,
      );
      return hits.map((hit) => hit.id);
    },
    mainStation(): EntityId {
      return MAIN_STATION_ID;
    },
    mainPlanet(): EntityId {
      return PLANET_ID;
    },
    sun(): EntityId {
      return SUN_ID;
    },
  };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `createShipControl`: the write-only `ShipControl` for one actor in one world
 * (FOUND-13, D-06; Pitfall 7 made structural).
 *
 * Every method is a no-op unless `id` is the actor and the actor is a live
 * dynamic entity of this world, so an AI can never write another entity (T-08-12).
 * Every argument is checked against the shared serialised domain of
 * `./limits.ts`, the same domain `spawnEntity`, `sanitizeEntity` and the
 * snapshot parser enforce, so a legitimate AI write is never turned into
 * hashed repair noise one tick later (T-08-51). Out-of-domain calls are
 * ignored, never clamped, because clamping would silently change what the AI
 * asked for, and never throw, because a malformed AI write must not crash the
 * frame loop.
 *
 * Per-world id scope (CONTEXT D-06 as amended 2026-11-12): the actor id and a
 * `setTarget` target are ids of `world` only.
 */

import type { Vec3 } from "../math.js";
import type { Entity } from "./entity.js";
import { BEHAVIOUR_IDS, MAX_ENTITIES } from "./ids.js";
import type { BehaviourId, EntityId } from "./ids.js";
import { MAX_ENTITY_MAGNITUDE, MAX_UINT32 } from "./limits.js";
import type { ShipControl } from "./control.js";
import type { World } from "./world.js";

function isUint32(n: number): boolean {
  return Number.isSafeInteger(n) && n >= 0 && n <= MAX_UINT32;
}

function isBounded(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= MAX_ENTITY_MAGNITUDE;
}

/** A finite value in `[0, MAX_ENTITY_MAGNITUDE]`. */
function isNonNegativeBounded(n: number): boolean {
  return isBounded(n) && n >= 0;
}

/**
 * The control `actorId` uses to steer itself in `world`. `tick` is the current
 * simulation tick, the base of `scheduleWake`.
 */
export function createShipControl(
  world: World,
  actorId: EntityId,
  tick: number,
): ShipControl {
  /** The actor when `id` names it and it is live; otherwise undefined. */
  function actor(id: EntityId): Entity | undefined {
    return id === actorId ? world.store.get(id) : undefined;
  }

  return {
    setTarget(id: EntityId, target: EntityId): void {
      const entity = actor(id);
      if (entity === undefined || !isUint32(target)) return;
      entity.nav.targetId = target;
    },
    setDestination(id: EntityId, destination: Vec3): void {
      const entity = actor(id);
      if (
        entity === undefined ||
        !isBounded(destination.x) ||
        !isBounded(destination.y) ||
        !isBounded(destination.z)
      ) {
        return;
      }
      entity.nav.destination = {
        x: destination.x,
        y: destination.y,
        z: destination.z,
      };
    },
    setDesiredRange(id: EntityId, range: number): void {
      const entity = actor(id);
      if (entity === undefined || !isNonNegativeBounded(range)) return;
      entity.nav.desiredRange = range;
    },
    setDesiredSpeed(id: EntityId, speed: number): void {
      const entity = actor(id);
      if (entity === undefined || !isNonNegativeBounded(speed)) return;
      entity.nav.desiredSpeed = speed;
    },
    perform(id: EntityId, behaviour: BehaviourId): void {
      const entity = actor(id);
      // Membership by includes, never `in` or indexing: "constructor" and the
      // other prototype names are not behaviours.
      if (
        entity === undefined ||
        !(BEHAVIOUR_IDS as readonly string[]).includes(behaviour)
      ) {
        return;
      }
      entity.nav.behaviour = behaviour;
    },
    scheduleWake(id: EntityId, ticks: number): void {
      const entity = actor(id);
      if (entity === undefined || entity.ai === null) return;
      if (!Number.isSafeInteger(ticks) || ticks < 1) return;
      const wake = tick + ticks;
      if (!isUint32(wake)) return;
      // Oolite's never-later rule: a pending wake is only ever brought forward.
      const pending = entity.ai.wakeTick;
      entity.ai.wakeTick = pending === 0 ? wake : Math.min(pending, wake);
    },
    fire(id: EntityId): void {
      const entity = actor(id);
      if (entity === undefined) return;
      // One shot per actor per tick (T-13-21); the queue is also bounded by
      // MAX_ENTITIES, the most live entities a world can hold.
      if (world.fireQueue.length >= MAX_ENTITIES) return;
      if (world.fireQueue.includes(id)) return;
      world.fireQueue.push(id);
    },
  };
}

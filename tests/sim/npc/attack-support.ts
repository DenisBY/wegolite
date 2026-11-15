// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Shared scaffolding of the hand-derived attack tests (plan 14-14): a steered
 * ship, a synthetic view and a context with scripted draws. The expected values
 * in the tests that use it are written from the cited `ShipEntity.m` lines.
 *
 * Frame: Wegolite's local forward is -Z, right +X, up +Y. The steered ship sits
 * at the origin facing -Z. A target at `z = -(d + 60)` with radius 50 against the
 * ship's radius 10 is `d` metres away (`rangeToPrimaryTarget` subtracts both
 * radii). Rotating a body by `theta` about Y turns its forward to
 * `(-sin theta, 0, -cos theta)`, so the approach aspect (the target's forward
 * dotted with the direction from it to the ship, `(0, 0, 1)`) is `-cos theta`.
 */

import { identity, quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import type { AiEventName } from "../../../src/sim/ai/types.js";
import type { SteerContext } from "../../../src/sim/npc/dispatch.js";
import type { NpcFlightStats } from "../../../src/sim/npc/stats.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import type { World } from "../../../src/sim/world/world.js";
import type { BehaviourId } from "../../../src/sim/world/ids.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import { createSyntheticView } from "./oracle-runner.js";
import type { RunnerBody } from "./oracle-runner.js";

export const DT = 1 / 120;
export const TARGET_ID = 200;
export const SELF_RADIUS = 10;
export const TARGET_RADIUS = 50;

/** The weapons of the stock records, by forward weapon key. */
export type Weapon = NpcFlightStats["forwardWeapon"];

export function statsWith(
  weapon: Weapon,
  overrides: Partial<NpcFlightStats> = {},
): NpcFlightStats {
  return {
    specKey: "t",
    maxFlightSpeed: 160,
    maxFlightRoll: 2,
    maxFlightPitch: 1,
    thrust: 15,
    mass: 0,
    forwardWeapon: weapon,
    ...overrides,
  };
}

/**
 * A steered ship at the origin facing -Z. `earlierSpawns` spawns that many ships
 * first, so the steered one gets id `101 + earlierSpawns`.
 */
export function ship(accuracy: number, earlierSpawns = 0): Entity {
  const world = createWorld(1);
  for (let i = 0; i < earlierSpawns; i += 1) {
    spawnEntity(
      world,
      {
        kind: "ship",
        specKey: "t",
        scanClass: "CLASS_NEUTRAL",
        position: vec(0, 0, 0),
        orientation: identity(),
        radius: 1,
      },
      0,
    );
  }
  const result = spawnEntity(
    world,
    {
      kind: "ship",
      specKey: "t",
      scanClass: "CLASS_NEUTRAL",
      position: vec(0, 0, 0),
      orientation: identity(),
      radius: SELF_RADIUS,
    },
    0,
  );
  if (!result.ok) throw new Error("spawn refused");
  result.entity.steer.accuracy = accuracy;
  result.entity.nav.targetId = TARGET_ID;
  WORLDS.set(result.entity, world);
  return result.entity;
}

const WORLDS = new WeakMap<Entity, World>();

/** The world `ship` created for `entity`. */
export function worldOf(entity: Entity): World {
  const world = WORLDS.get(entity);
  if (world === undefined) throw new Error("not a ship of this helper");
  return world;
}

/** A target body `range` metres away along -Z, turned by `theta` about Y. */
export function target(
  range: number,
  overrides: Partial<RunnerBody> = {},
): RunnerBody {
  return {
    id: TARGET_ID,
    kind: "ship",
    scanClass: "CLASS_NEUTRAL",
    radius: TARGET_RADIUS,
    mass: 0,
    position: vec(0, 0, -(range + SELF_RADIUS + TARGET_RADIUS)),
    orientation: identity(),
    speed: 0,
    behaviour: "IDLE",
    targetId: 0,
    ...overrides,
  };
}

/** A rotation about Y by `theta` radians. */
export function aboutY(theta: number): Quat {
  return quat(Math.cos(theta / 2), 0, Math.sin(theta / 2), 0);
}

/** A quarter turn about Y with equal w and y: the aspect is exactly 0. */
const ABEAM: Quat = quat(Math.SQRT1_2, 0, Math.SQRT1_2, 0);

/** The orientation that gives the target an approach aspect of `aspect` (see above). */
export function facingAspect(aspect: number): Quat {
  return aspect === 0 ? ABEAM : aboutY(Math.acos(-aspect));
}

/** A body with an arbitrary id, behind the view (for proximity alerts). */
export function other(id: number, position: Vec3, radius = 20): RunnerBody {
  return {
    id,
    kind: "ship",
    scanClass: "CLASS_NEUTRAL",
    radius,
    mass: 0,
    position,
    orientation: identity(),
    speed: 0,
    behaviour: "IDLE",
    targetId: 0,
  };
}

export interface Harness {
  readonly ctx: SteerContext;
  readonly events: { name: AiEventName; a?: number }[];
  readonly used: () => number;
}

/** A context whose draws are `values` in order; a draw past the end throws. */
export function harness(
  entity: Entity,
  bodies: readonly RunnerBody[],
  stats: NpcFlightStats,
  values: readonly number[] = [],
): Harness {
  const events: { name: AiEventName; a?: number }[] = [];
  let used = 0;
  return {
    events,
    used: () => used,
    ctx: {
      view: createSyntheticView(bodies, entity, 1),
      stats,
      dt: DT,
      draw: () => {
        const value = values[used];
        if (value === undefined) throw new Error("an unscripted draw");
        used += 1;
        return value;
      },
      emit: (event) => {
        events.push(event.a === undefined ? { name: event.name } : event);
      },
    },
  };
}

export type { BehaviourId };

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drift of NPC ships and buoys (CBT-18, D-02, PD-02).
 *
 * An Oolite ship carries a Newtonian `velocity` beside its scalar
 * `flightSpeed`: a collision rebound (plans 18-11, 18-18) or a blast (18-19)
 * writes it. Each update `applyThrust:` first brakes it, only when the ship's
 * `thrust` is non-zero, by `dt_thrust = SHIP_THRUST_FACTOR x thrust x dt`
 * (`ShipEntity.m:5808-5823`): the magnitude drops by `dt_thrust` and the vector
 * is scaled by `fmaxf((velmag - dt_thrust) / velmag, 0)`. `Entity` update then
 * moves the position by it (`applyVelocity:`, `Entity.m:878-881`).
 *
 * Wegolite runs the same two steps as one pass after the steering loop (the
 * steering already moved each ship by its flight speed, `moveForward:`), so the
 * order per ship is steer, brake, move. A ship with no AI is integrated too,
 * so a rebound never freezes an inert ship. Unlike Oolite, a later ship's
 * steering in the same tick reads an earlier ship's position before its drift
 * (the pass runs after the whole steering loop, not inside each ship's update);
 * the drift is a few metres at most and this is the plan's stage placement.
 *
 * A buoy is a ship whose record has thrust 100 (shipdata.plist `buoy`), so a
 * pushed buoy brakes at 500 m/s^2 (PD-02): 100 m/s of drift stops in about
 * 9.6 m. Its displacement is `World.buoys.<key>.offset` from the layout position
 * (plan 18-14); a destroyed buoy is never moved.
 *
 * The C's locals and the `velocity` vector are GLfloat, so the brake rounds
 * every step with `Math.fround` as the 18-03 oracle and the player's port
 * (`../flight/drift.ts`) do. A velocity whose float32 magnitude is 0 (a float64
 * value below the float range, reachable only from a restored or hook-written
 * state) brakes to exactly zero, so no velocity line lingers in the hash
 * (review L258); a non-finite input returns zero, never NaN. Every write is
 * clamped (velocity components at `MAX_ENTITY_VELOCITY`, positions at
 * `MAX_ENTITY_MAGNITUDE`, buoy offsets at `MAX_BUOY_OFFSET`), and a body at
 * rest is never written, so a world that pushes nothing hashes as before.
 */

import { vec } from "../math.js";
import type { Vec3 } from "../math.js";
import { statsFor } from "../npc/stats.js";
import type { NpcStepFacts } from "../npc/stats.js";
import type { BuoyState } from "./entity.js";
import {
  MAX_BUOY_OFFSET,
  MAX_ENTITY_MAGNITUDE,
  MAX_ENTITY_VELOCITY,
} from "./limits.js";
import type { World } from "./world.js";

const f = Math.fround;

/** Oolite's `SHIP_THRUST_FACTOR`, a float literal (`ShipEntity.h:46`). */
export const SHIP_DRIFT_THRUST_FACTOR = 5;

/**
 * The buoy's `thrust`: the compiled buoy record's value (`shipdata.plist`
 * `buoy`, `ships-client.json` `extras.thrust`). A literal because `src/sim` may
 * not import the catalogue; `tests/sim/world/drift.test.ts` pins it to the
 * compiled record.
 */
export const BUOY_THRUST = 100;

/** The order the buoy pass walks: the witchpoint first, then the nav buoy. */
const BUOY_KEYS = ["witchpoint", "navBuoy"] as const;

const isZero = (v: Vec3): boolean => v.x === 0 && v.y === 0 && v.z === 0;

/** `v` clamped to `±limit`, -0 as 0; a non-finite value stays (the caller checks). */
function clamp(v: number, limit: number): number {
  if (v > limit) return limit;
  if (v < -limit) return -limit;
  return v === 0 ? 0 : v;
}

/** A velocity inside the sanitiser's domain: non-finite components become 0. */
function clampVelocity(v: Vec3): Vec3 {
  const c = (n: number): number =>
    Number.isFinite(n) ? clamp(n, MAX_ENTITY_VELOCITY) : 0;
  return vec(c(v.x), c(v.y), c(v.z));
}

/**
 * `from + velocity x dt`, each component clamped to `±limit`; undefined when a
 * component is not finite, so nothing non-finite is written (the sanitiser
 * repairs the field).
 */
function advance(
  from: Vec3,
  velocity: Vec3,
  dt: number,
  limit: number,
): Vec3 | undefined {
  const x = from.x + velocity.x * dt;
  const y = from.y + velocity.y * dt;
  const z = from.z + velocity.z * dt;
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    return undefined;
  }
  return vec(clamp(x, limit), clamp(y, limit), clamp(z, limit));
}

/**
 * One tick of an NPC's drift brake (`ShipEntity.m:5816-5823`).
 *
 * @param thrust the kind's raw `thrust`; 0 never brakes (`if (thrust)`).
 * @returns the braked velocity in float32 components, the zero vector once the
 *   brake exceeds it, for a float32 magnitude of 0 or for a non-finite input;
 *   the input itself when `thrust` is 0.
 */
export function brakeShipDrift(
  velocity: Vec3,
  thrust: number,
  dt: number,
): Vec3 {
  if (
    !Number.isFinite(velocity.x) ||
    !Number.isFinite(velocity.y) ||
    !Number.isFinite(velocity.z)
  ) {
    return vec(0, 0, 0);
  }
  if (thrust === 0) return velocity;
  // `velocity` is a float Vector.
  const x = f(velocity.x);
  const y = f(velocity.y);
  const z = f(velocity.z);
  // magnitude(): the double sqrt of the float magnitude2, stored as GLfloat.
  const velmag = f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z))));
  if (!(velmag > 0) || !Number.isFinite(velmag)) return vec(0, 0, 0);
  // `SHIP_THRUST_FACTOR * thrust` is float, `* delta_t` double, stored as GLfloat.
  const dtThrust = f(f(SHIP_DRIFT_THRUST_FACTOR * f(thrust)) * dt);
  // fmaxf((velmag - dt_thrust) / velmag, 0.0f), all float.
  const vscale = Math.max(f(f(velmag - dtThrust) / velmag), 0);
  if (vscale === 0) return vec(0, 0, 0);
  // scale_vector: each component times the float factor.
  return vec(f(x * vscale), f(y * vscale), f(z * vscale));
}

/**
 * The ship drift pass: one ascending pass over a length snapshot of the live
 * store. Every live, non-dead `ship` with a non-zero velocity is braked with its
 * kind's thrust (`statsFor`, Oolite's default for a kind with no row) and then
 * moved by the braked velocity. A ship at rest is never written; cargo and
 * wreckage keep their own debris drift (`stepDebris`).
 */
export function stepShipDrift(
  world: World,
  dt: number,
  npc?: NpcStepFacts,
): void {
  const live = world.store.live;
  const n = live.length;
  for (let i = 0; i < n; i += 1) {
    const entity = live[i];
    if (entity === undefined || entity.dead || entity.kind !== "ship") continue;
    const v: unknown = entity.velocity;
    if (typeof v !== "object" || v === null) continue;
    if (isZero(entity.velocity)) continue;
    const thrust = statsFor(npc?.flight, entity.specKey).thrust;
    const next = clampVelocity(brakeShipDrift(entity.velocity, thrust, dt));
    entity.velocity = next;
    if (isZero(next)) continue;
    const moved = advance(entity.position, next, dt, MAX_ENTITY_MAGNITUDE);
    if (moved !== undefined) entity.position = moved;
  }
}

/** Brake and move one buoy; nothing for a buoy at rest. */
function driftBuoy(buoy: BuoyState, dt: number): void {
  if (isZero(buoy.velocity)) return;
  const next = clampVelocity(brakeShipDrift(buoy.velocity, BUOY_THRUST, dt));
  buoy.velocity = next;
  if (isZero(next)) return;
  const moved = advance(buoy.offset, next, dt, MAX_BUOY_OFFSET);
  if (moved !== undefined) buoy.offset = moved;
}

/**
 * The buoy drift pass (PD-02): the witchpoint buoy, then the nav buoy. A buoy
 * whose static health is 0 is destroyed and never moved. Each live buoy with a
 * non-zero velocity is braked with `BUOY_THRUST` and its offset advanced.
 */
export function stepBuoyDrift(world: World, dt: number): void {
  for (const key of BUOY_KEYS) {
    if (!(world.staticHealth[key] > 0)) continue;
    driftBuoy(world.buoys[key], dt);
  }
}

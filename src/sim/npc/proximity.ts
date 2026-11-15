// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The proximity pass (AI-01, plan 14-15): Oolite's collision region clears every
 * ship's proximity alert and then tests each pair (`CollisionRegion.m:269-312`),
 * and `setProximityAlert:` (`ShipEntity.m:6098-6146`) decides whether the other
 * body goes into the ship's alert slot.
 *
 * `proximityAlertFor` is the pair trigger plus `setProximityAlert:` for ONE
 * ship, shared by the world pass and the oracle runner's `afterUpdate` hook, so
 * both apply one rule. `runProximityPass` is the world's pass. It is one of the
 * step-level modules (with `escort.ts` and `tracking-curve.ts`) that walk the
 * world's live list; no steering module does.
 *
 * Participants (recorded in plan 14-15):
 *  - candidates are every live dynamic entity (steered or inert), the main
 *    station (its layout radius) and the player (the compiled
 *    `PLAYER_COLLISION_RADIUS_M`, never the lazily loaded hull table, so the
 *    pass does not depend on asset-load timing); planet, sun and buoys are not
 *    candidates;
 *  - an alert is written only on a steered ship (`ai` not null): an inert ship
 *    has no behaviour that reads it, and writing it would move every inert hash
 *    (a recorded divergence: in Oolite every ship holds an alert);
 *  - a candidate's mass is `massFor` (flight row, else the hyperspace mass, else
 *    0); the station and the player count as at or above `PROXIMITY_MIN_MASS`.
 *
 * Recorded divergences (plan 14-19): ascending-id pair order instead of
 * Oolite's collision-chain order; no collision-chain prefilter
 * (`Universe.m:6713-6760`, 7045-7073), which never affects a pair of equal radii
 * and is a no-op near the station, where the planet chains every entity; every
 * listed ship is treated as crewed (see `SHIPS_ARE_CREWED`); a station that is
 * launching or docking never occurs, because no NPC docks or launches in v2.2.
 *
 * The pass is bounded: it walks at most `MAX_ENTITIES` live entities plus two
 * bodies, with inline squared distances (T-14-25).
 */

import type { FlightState } from "../flight/state.js";
import { dot, rotate, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { Entity } from "../world/entity.js";
import type { EntityId } from "../world/ids.js";
import type { WorldView } from "../world/view.js";
import type { World } from "../world/world.js";
import {
  PROXIMITY_FORWARD_STRETCH,
  PROXIMITY_MIN_MASS,
  PROXIMITY_WARN_DISTANCE2,
  PROXIMITY_ZONE_SELF_FACTOR,
} from "./constants.js";
import { massFor, PLAYER_COLLISION_RADIUS_M, statsFor } from "./stats.js";
import type { NpcStepFacts } from "./stats.js";

/**
 * `setProximityAlert:` returns early for a ship with no crew (`ShipEntity.m:6116`,
 * "Ships without pilot (cargo, rocks, missiles, buoys etc) will not get
 * alarmed"). Spawned piloted ships always carry crew (`Universe.m:1992`, 2557)
 * and Wegolite has no crew concept, so every listed ship is treated as crewed:
 * a recorded divergence. The gate is kept as a named constant so it is a visible
 * decision and not a silent omission.
 */
export const SHIPS_ARE_CREWED = true;

/** What the pair trigger and `setProximityAlert:` read of a body. */
export interface ProximityBody {
  readonly id: EntityId;
  readonly position: Vec3;
  /** The collision radius, metres. */
  readonly radius: number;
}

/** The body an alert id names, or undefined when it is gone. */
export type AlertLookup = (id: EntityId) => ProximityBody | undefined;

const LOCAL_FORWARD = vec(0, 0, -1);
const LOCAL_UP = vec(0, 1, 0);
const LOCAL_RIGHT = vec(1, 0, 0);

/**
 * The pair trigger (`CollisionRegion.m:304-312`): the squared centre distance is
 * below `16 r^2` for either collision radius. The outer test of line 304
 * (`dist2 < 16 (r1 + r2)^2`) is implied by it.
 */
export function pairTriggers(dist2: number, r1: number, r2: number): boolean {
  const sum = r1 + r2;
  return (
    dist2 < PROXIMITY_WARN_DISTANCE2 * sum * sum &&
    (dist2 < PROXIMITY_WARN_DISTANCE2 * r2 * r2 ||
      dist2 < PROXIMITY_WARN_DISTANCE2 * r1 * r1)
  );
}

/**
 * `setProximityAlert:` (`ShipEntity.m:6098-6146`) for the steered `self` and the
 * body `other` of mass `otherMass`: a light body, a station as self and a ship
 * outside its zone leave the alert alone; a ship that is already avoiding keeps
 * the alert it has when that body subtends the larger angle. `lookup` finds the
 * body the current alert names (only read while avoiding).
 *
 * The zone is twice the ship's own radius plus the other's, in the ship's own
 * frame, with the forward component stretched by
 * `0.25 x maxFlightSpeed / flightSpeed` for a body ahead.
 */
export function proximityAlertFor(
  self: Entity,
  maxFlightSpeed: number,
  other: ProximityBody,
  otherMass: number,
  lookup: AlertLookup,
): void {
  if (otherMass < PROXIMITY_MIN_MASS) return; // we are not alerted by small objects
  if (self.kind === "station") return; // stations don't worry about colliding
  if (!SHIPS_ARE_CREWED) return; // ships without a pilot are not alarmed (6116)

  // the docking and launching exemptions (6112) never apply to an NPC in v2.2

  const diff = vec(
    other.position.x - self.position.x,
    other.position.y - self.position.y,
    other.position.z - self.position.z,
  );
  let dForward = dot(diff, rotate(self.orientation, LOCAL_FORWARD));
  const dUp = dot(diff, rotate(self.orientation, LOCAL_UP));
  const dRight = dot(diff, rotate(self.orientation, LOCAL_RIGHT));
  if (dForward > 0 && self.speed > 0) {
    // it's ahead of us and we're moving forward: extend the zone forward
    dForward *= (PROXIMITY_FORWARD_STRETCH * maxFlightSpeed) / self.speed;
  }
  const d2 = dForward * dForward + dUp * dUp + dRight * dRight;
  const zone = self.radius * PROXIMITY_ZONE_SELF_FACTOR + other.radius;
  if (d2 > zone * zone) return; // we're okay

  if (self.nav.behaviour === "AVOID_COLLISION") {
    // already avoiding something: keep the body that subtends the greater angle
    const alertId = self.steer.proximityAlert;
    const prox = alertId === 0 ? undefined : lookup(alertId);
    if (prox !== undefined && prox.id !== other.id) {
      const saProx =
        (prox.radius * prox.radius) /
        distanceSquared(self.position, prox.position);
      const saOther =
        (other.radius * other.radius) /
        distanceSquared(self.position, other.position);
      if (saProx < saOther) return;
    }
  }
  self.steer.proximityAlert = other.id;
}

function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

/** Everything one pair test of the pass reads. */
interface PassContext {
  readonly facts: NpcStepFacts | undefined;
  readonly lookup: AlertLookup;
}

/** The mass of a candidate: its table mass for a ship, the threshold for a static body. */
function candidateMass(pass: PassContext, entity: Entity | undefined): number {
  return entity === undefined
    ? PROXIMITY_MIN_MASS
    : massFor(pass.facts, entity.specKey);
}

/** A ship with an AI is steered; only such a ship holds an alert. */
function steeredOf(entity: Entity | undefined): Entity | undefined {
  return entity !== undefined && !entity.dead && entity.ai !== null
    ? entity
    : undefined;
}

/**
 * One pair of the pass (`CollisionRegion.m:304-312`): when the pair trigger
 * holds, each steered member gets `setProximityAlert:` with the other. `ea` and
 * `eb` are the world entities behind the bodies, or undefined for the station
 * and the player.
 */
function testPair(
  pass: PassContext,
  a: ProximityBody,
  ea: Entity | undefined,
  b: ProximityBody,
  eb: Entity | undefined,
): void {
  const sa = steeredOf(ea);
  const sb = steeredOf(eb);
  if (sa === undefined && sb === undefined) return;
  const dist2 = distanceSquared(a.position, b.position);
  if (!pairTriggers(dist2, a.radius, b.radius)) return;
  if (sa !== undefined) {
    proximityAlertFor(
      sa,
      statsFor(pass.facts?.flight, sa.specKey).maxFlightSpeed,
      b,
      candidateMass(pass, eb),
      pass.lookup,
    );
  }
  if (sb !== undefined) {
    proximityAlertFor(
      sb,
      statsFor(pass.facts?.flight, sb.specKey).maxFlightSpeed,
      a,
      candidateMass(pass, ea),
      pass.lookup,
    );
  }
}

/**
 * The world's proximity pass: clear the alert of every steered ship, then test
 * every pair of candidates once in ascending id (the main station, the player,
 * then the live entities), as `CollisionRegion.m:269-312` does. `getView` is
 * the step's lazy view builder. Run after the
 * think phase and before the sanitize loop, so an alert set at the end of tick
 * N is read by the update of tick N+1.
 */
export function runProximityPass(
  world: World,
  player: FlightState,
  getView: () => WorldView,
  facts: NpcStepFacts | undefined,
): void {
  const live = world.store.live;
  let steered = 0;
  for (let i = 0; i < live.length; i += 1) {
    const entity = live[i];
    if (entity === undefined || entity.dead || entity.ai === null) continue;
    entity.steer.proximityAlert = 0;
    steered += 1;
  }
  if (steered === 0) return;

  // The view is built lazily by the step, so a world with no steered ship
  // allocates none here.
  const view = getView();
  const station = view.body(view.mainStation());
  const stationBody: ProximityBody | undefined =
    station === undefined
      ? undefined
      : { id: station.id, position: station.position, radius: station.radius };
  const playerBody: ProximityBody = {
    id: view.playerId,
    position: player.position,
    radius: PLAYER_COLLISION_RADIUS_M,
  };
  const lookup: AlertLookup = (id) => {
    if (stationBody !== undefined && id === stationBody.id) return stationBody;
    if (id === playerBody.id) return playerBody;
    const found = world.store.get(id);
    return found === undefined || found.dead ? undefined : found;
  };
  const pass: PassContext = { facts, lookup };

  for (let i = 0; i < live.length; i += 1) {
    const entity = live[i];
    if (entity === undefined || entity.dead) continue;
    if (stationBody !== undefined) {
      testPair(pass, stationBody, undefined, entity, entity);
    }
    testPair(pass, playerBody, undefined, entity, entity);
  }
  for (let i = 0; i < live.length; i += 1) {
    const first = live[i];
    if (first === undefined || first.dead) continue;
    for (let j = i + 1; j < live.length; j += 1) {
      const second = live[j];
      if (second === undefined || second.dead) continue;
      testPair(pass, first, first, second, second);
    }
  }
}

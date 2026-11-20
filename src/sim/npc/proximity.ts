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
 * Participants (recorded in plan 14-15, amended by Phase 18 PD-06):
 *  - candidates are every live dynamic entity (steered or inert), the main
 *    station (its layout radius), the live navigation buoys (PD-06: the
 *    witchpoint beacon and the nav buoy at the pose and radius the world view
 *    reports, `CollisionRegion.m:308-311`; the 698,691 kg buoy is far above
 *    `PROXIMITY_MIN_MASS`, `ShipEntity.m:6107`; a destroyed buoy is absent from
 *    the view and so neither a candidate nor a body an alert resolves to) and
 *    the player (the compiled `PLAYER_COLLISION_RADIUS_M`, never the lazily
 *    loaded hull table, so the pass does not depend on asset-load timing); the
 *    planet and the sun are not candidates;
 *  - a buoy never holds an alert: it has no pilot (`ShipEntity.m:6116`) and the
 *    pass writes alerts only on steered ships;
 *  - an alert is written only on a steered ship (`ai` not null): an inert ship
 *    has no behaviour that reads it, and writing it would move every inert hash
 *    (a recorded divergence: in Oolite every ship holds an alert);
 *  - a candidate's mass is `massFor` (flight row, else the hyperspace mass, else
 *    0); the station and the player count as at or above `PROXIMITY_MIN_MASS`.
 *
 * The collision-chain prefilter (Phase 18, PD-08, corrected 2026-11-20 by owner
 * decision after code verification): a pair that includes a buoy is tested
 * only when Oolite's `filterSortedLists` (`Universe.m:6713-7144`) puts both
 * bodies in one z collision chain (`./collision-chain.ts`). Its downward walks
 * never run, so nothing collidable is eliminated and only the z axis gates a
 * pair: a ship approaching an isolated buoy along z is first tested at a z
 * separation of 2 x (r_ship + r_buoy) (218.66 m for a Krait at the witchpoint
 * beacon), off the z axis the unfiltered 236.6 m pair trigger decides, and
 * inside the planet's or the sun's z slab everything is chained together. The
 * prefilter covers buoy pairs only: applied to every pair it moves the Phase
 * 14 station case (c) of `proximity.test.ts`, so PD-08's condition keeps the
 * Phase 14 rule (no prefilter) for every other pair; the faithful all-pairs
 * version is the pending todo
 * `2026-11-20-collision-chain-prefilter-all-pairs.md`, guarded by
 * `tests/guards/collision-chain-scope.test.ts`. Phase 14's reason for omitting
 * it ("never affects a pair of equal radii; a no-op near the station, where
 * the planet chains every entity") holds only inside the planet's slab.
 *
 * Recorded divergences (plan 14-19): ascending-id pair order instead of
 * Oolite's collision-chain order; every listed ship is treated as crewed (see
 * `SHIPS_ARE_CREWED`); a station that is launching or docking never occurs,
 * because no NPC docks or launches in v2.2.
 *
 * The pass is bounded: it walks at most `MAX_ENTITIES` live entities plus four
 * bodies, with inline squared distances (T-14-25), and the prefilter sorts and
 * walks those bodies plus the planet and the sun five times (T-18-54).
 */

import type { FlightState } from "../flight/state.js";
import { dot, rotate, vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { Entity } from "../world/entity.js";
import {
  PLANET_ID,
  STATION_NAV_BUOY_ID,
  SUN_ID,
  WITCHPOINT_BUOY_ID,
} from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import type { WorldView } from "../world/view.js";
import type { World } from "../world/world.js";
import {
  PROXIMITY_FORWARD_STRETCH,
  PROXIMITY_MIN_MASS,
  PROXIMITY_WARN_DISTANCE2,
  PROXIMITY_ZONE_SELF_FACTOR,
} from "./constants.js";
import { chainsPair, collisionChains } from "./collision-chain.js";
import type { ChainBody, CollisionChains } from "./collision-chain.js";
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
  const buoyBodies: ProximityBody[] = [];
  for (const buoyId of [WITCHPOINT_BUOY_ID, STATION_NAV_BUOY_ID]) {
    const buoy = view.body(buoyId);
    if (buoy !== undefined) {
      buoyBodies.push({
        id: buoy.id,
        position: buoy.position,
        radius: buoy.radius,
      });
    }
  }
  const playerBody: ProximityBody = {
    id: view.playerId,
    position: player.position,
    radius: PLAYER_COLLISION_RADIUS_M,
  };
  const lookup: AlertLookup = (id) => {
    if (stationBody !== undefined && id === stationBody.id) return stationBody;
    for (const buoy of buoyBodies) if (id === buoy.id) return buoy;
    if (id === playerBody.id) return playerBody;
    const found = world.store.get(id);
    return found === undefined || found.dead ? undefined : found;
  };
  const pass: PassContext = { facts, lookup };
  // PD-08: a pair that includes a buoy is tested only when Oolite's
  // collision chain would test it; every other pair keeps the Phase 14 rule.
  const chains =
    buoyBodies.length > 0
      ? chainsOf(world, view, player, stationBody, buoyBodies, playerBody)
      : undefined;

  for (let i = 0; i < live.length; i += 1) {
    const entity = live[i];
    if (entity === undefined || entity.dead) continue;
    if (stationBody !== undefined) {
      testPair(pass, stationBody, undefined, entity, entity);
    }
    for (const buoy of buoyBodies) {
      if (chains !== undefined && chainsPair(chains, buoy.id, entity.id)) {
        testPair(pass, buoy, undefined, entity, entity);
      }
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

/**
 * The bodies of Oolite's sorted lists and their chains: the planet and the sun
 * (both collide, `Entity.m:825`, `OOSunEntity.m:221`, with their radius as the
 * collision radius, `OOPlanetEntity.m:120`), the station, the live buoys, the
 * player while it is out of the station, and every live entity (a wreck is
 * listed but cannot collide, `ShipEntity.m:1858-1868`).
 */
function chainsOf(
  world: World,
  view: WorldView,
  player: FlightState,
  stationBody: ProximityBody | undefined,
  buoyBodies: readonly ProximityBody[],
  playerBody: ProximityBody,
): CollisionChains {
  const bodies: ChainBody[] = [];
  for (const id of [PLANET_ID, SUN_ID]) {
    const body = view.body(id);
    if (body !== undefined) bodies.push({ ...body, canCollide: true });
  }
  if (stationBody !== undefined)
    bodies.push({ ...stationBody, canCollide: true });
  for (const buoy of buoyBodies) bodies.push({ ...buoy, canCollide: true });
  if (player.mode !== "docked")
    bodies.push({ ...playerBody, canCollide: true });
  for (const entity of world.store.live) {
    if (entity.dead) continue;
    bodies.push({
      id: entity.id,
      position: entity.position,
      radius: entity.radius,
      canCollide: entity.kind !== "wreckage",
    });
  }
  return collisionChains(bodies);
}

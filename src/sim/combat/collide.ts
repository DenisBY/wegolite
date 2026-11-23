// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Octree-against-octree contact over hulls and their subentities (CBT-18,
 * D-01, PD-01): a literal recursive port of Oolite's `doOctreesCollide`
 * (`ShipEntity.m:1878-1942`). It decides contact only; it applies nothing
 * (no damage, no push, no record). The collision stage at the end of this
 * file (`resolveCollisions`, plan 18-11; the buoys join in plan 18-18) calls
 * it once per pair whose bounding spheres overlap.
 *
 * D-01: contact is decided octree against octree with Oolite's own crude
 * prunes (`isHitByOctree`, `./octree.ts`), never by bounding spheres alone and
 * never by exact geometry. The caller does the sphere test first, as Oolite's
 * collision pass does; this function looks at the octrees only.
 *
 * The C, in order:
 *
 * 1. hull against hull (`:1895-1900`): the other's hull is hit, return it;
 * 2. each of the prime's subentities against the whole other, by calling
 *    itself with that subentity as prime (`:1902-1911`); any contact returns
 *    the other's hull;
 * 3. the prime against each of the other's subentities, again by calling
 *    itself (`:1913-1922`); a contact returns that subentity;
 * 4. the prime's subentities against the other's subentities
 *    (`:1924-1938`). Never reached with a result: stage 2's recursion already
 *    runs the prime's subentity against the other's subentities, so a
 *    subentity-against-subentity contact returns the other's hull there
 *    (18-02 fixture `octree-sub-sub-returns-other`; review L723@2e0bfb3). The
 *    stage is not ported.
 *
 * Detached subentities (PD-01) stand in for the C's `canCollide` check on a
 * subentity (`ShipEntity.m:1858-1876`): an index in `otherDetached` or
 * `primeDetached` takes no part. Stage 2 passes `otherDetached` through, so a
 * detached subentity of the other stays out of the recursion too.
 *
 * The frames (`ShipEntity.m:1884-1894`, `Entity.m:632-646`,
 * `ShipEntity.m:2008-2025`): the other's centre and axes are resolved into the
 * prime's Oolite model frame, x right, y up, z toward the nose. Wegolite's
 * local forward is -Z, so the model axes of a pose are `rotate(q, +X)`,
 * `rotate(q, +Y)` and `rotate(q, -Z)`, as `toOoliteModelSegment` has it. A
 * subentity's authored offset is in Oolite model axes; its absolute position
 * is the parent's position plus the parent's rotation of `(x, y, -z)`, and its
 * orientation is the parent's (every solid subentity Wegolite carries is
 * authored with the identity orientation).
 *
 * Total: a non-finite position or a non-unit orientation is no contact; the
 * octree test refuses everything else it cannot use. Pure TypeScript: no
 * Three.js, no DOM.
 *
 * The collision stage (`resolveCollisions`, `colliderRank`,
 * `runContactCalls`) is documented where it is defined below.
 */

import type { FlightState } from "../flight/state.js";
import type { StepOptions } from "../flight/step.js";
import {
  BUOY_SUBENTITY_MASS,
  NAV_BUOY_HULL_MASS,
  NAV_BUOY_MASS,
} from "../hyperspace/countdown.js";
import { add, dot, rotate, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import { massFor } from "../npc/stats.js";
import type { NpcStepFacts } from "../npc/stats.js";
import { debrisMassOf } from "../world/debris.js";
import type { Entity } from "../world/entity.js";
import { PLAYER_ID } from "../world/ids.js";
import type { EntityId } from "../world/ids.js";
import type { SystemLayout } from "../world/layout.js";
import {
  MAX_BUOY_OFFSET,
  MAX_ENTITY_MAGNITUDE,
  MAX_ENTITY_VELOCITY,
  QUAT_UNIT_TOLERANCE,
} from "../world/limits.js";
import { compareZOrder } from "../world/sorted-lists.js";
import {
  STATIC_TARGETS,
  buoyOrientation,
  buoyPosition,
  buoySubentityTargetOf,
  isBuoyDestroyed,
  isBuoySubentityAttached,
} from "../world/statics.js";
import type { BuoyKey } from "../world/statics.js";
import type { World } from "../world/world.js";
import { PLAYER_HULL_KEY } from "./aim.js";
import { PLAYER_MASS_KG } from "./constants.js";
import type { HullData, HullTable } from "./hit.js";
import type { HitRecord } from "./ledger.js";
import { collideWithShip } from "./response.js";
import type { PlayerCombatState } from "./state.js";
import { isHitByOctree } from "./octree.js";

/** Where a hull is and how it is turned, in Wegolite world axes. */
export interface HullPose {
  readonly position: Vec3;
  readonly orientation: Quat;
}

/**
 * The part of the other that was touched: its hull, or one of its
 * subentities by index into `HullData.subentities`.
 */
export type ContactPart =
  | { readonly kind: "hull" }
  | { readonly kind: "subentity"; readonly index: number };

/**
 * What the contact test reads of a hull. A `HullData` is one; so is a
 * `SubentityHull`, which has no subentities of its own, so stage 2 calls the
 * same function with a subentity as prime.
 */
export type ContactHull = Pick<HullData, "octree" | "subentities">;

const HULL: ContactPart = { kind: "hull" };

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function isUsablePose(pose: HullPose): boolean {
  const q = pose.orientation;
  if (
    !finiteVec(pose.position) ||
    !Number.isFinite(q.w) ||
    !Number.isFinite(q.x) ||
    !Number.isFinite(q.y) ||
    !Number.isFinite(q.z)
  ) {
    return false;
  }
  const normSq = q.w * q.w + q.x * q.x + q.y * q.y + q.z * q.z;
  return Math.abs(normSq - 1) <= QUAT_UNIT_TOLERANCE;
}

/**
 * `-absolutePositionForSubentity` for a subentity of `parent`
 * (`Entity.m:632-646`): the authored Oolite-axis offset taken to Wegolite
 * local `(x, y, -z)`, turned by the parent and added to its position.
 */
function subentityPose(parent: HullPose, offset: Vec3): HullPose {
  const turned = rotate(parent.orientation, vec(offset.x, offset.y, -offset.z));
  return {
    position: vec(
      parent.position.x + turned.x,
      parent.position.y + turned.y,
      parent.position.z + turned.z,
    ),
    orientation: parent.orientation,
  };
}

/**
 * `ShipEntity.m:1878-1942` `doOctreesCollide(prime, other)`: the other's part
 * the prime touches, or `null`. See the file header for the stages, the frames
 * and why the C's fourth stage is not ported.
 */
export function doOctreesCollide(
  prime: ContactHull,
  primePose: HullPose,
  other: ContactHull,
  otherPose: HullPose,
  otherDetached?: ReadonlySet<number>,
  primeDetached?: ReadonlySet<number>,
): ContactPart | null {
  if (!isUsablePose(primePose) || !isUsablePose(otherPose)) return null;

  // `:1884-1894`: the other's centre and axes in the prime's model frame.
  const q = primePose.orientation;
  const right = rotate(q, vec(1, 0, 0));
  const up = rotate(q, vec(0, 1, 0));
  const forward = rotate(q, vec(0, 0, -1));
  const toPrime = (v: Vec3): Vec3 =>
    vec(dot(v, right), dot(v, up), dot(v, forward));
  const origin = toPrime(
    vec(
      otherPose.position.x - primePose.position.x,
      otherPose.position.y - primePose.position.y,
      otherPose.position.z - primePose.position.z,
    ),
  );
  const o = otherPose.orientation;
  const ijk: readonly [Vec3, Vec3, Vec3] = [
    toPrime(rotate(o, vec(1, 0, 0))),
    toPrime(rotate(o, vec(0, 1, 0))),
    toPrime(rotate(o, vec(0, 0, -1))),
  ];

  // `:1895-1900`: hull against hull, the prime's tree axial.
  if (isHitByOctree(prime.octree, other.octree, origin, ijk)) return HULL;

  // `:1902-1911`: each of the prime's subentities against the whole other.
  const primeSubs = prime.subentities ?? [];
  for (let i = 0; i < primeSubs.length; i += 1) {
    const sub = primeSubs[i];
    if (sub === undefined || primeDetached?.has(i) === true) continue;
    const contact = doOctreesCollide(
      sub,
      subentityPose(primePose, sub.position),
      other,
      otherPose,
      otherDetached,
    );
    if (contact !== null) return HULL;
  }

  // `:1913-1922`: the prime against each of the other's subentities.
  const otherSubs = other.subentities ?? [];
  for (let i = 0; i < otherSubs.length; i += 1) {
    const sub = otherSubs[i];
    if (sub === undefined || otherDetached?.has(i) === true) continue;
    const contact = doOctreesCollide(
      prime,
      primePose,
      sub,
      subentityPose(otherPose, sub.position),
      undefined,
      primeDetached,
    );
    if (contact !== null) return { kind: "subentity", index: i };
  }

  // `:1924-1938` is not ported (see the header); `:1940-1941` no collision.
  return null;
}

// --- The collision stage (plan 18-11) ----------------------------------------

/** A body the update order ranks: its id and where it is. */
export interface RankedBody {
  readonly id: EntityId;
  readonly position: Vec3;
}

/**
 * One octree contact by rank: `self` was the prime of `doOctreesCollide`
 * (Oolite's `e1`, the body first in the z list, `compareZOrder`; either
 * rank); `part` is the part of `other` it touched.
 */
export interface RankedContact {
  readonly self: number;
  readonly other: number;
  readonly part: ContactPart;
}

/**
 * Non-finite keys after every finite key, then ascending id: a total order
 * for any doubles, NaN included (T-18-49).
 */
function compareKeys(
  keyA: number,
  idA: EntityId,
  keyB: number,
  idB: EntityId,
): number {
  const finiteA = Number.isFinite(keyA);
  const finiteB = Number.isFinite(keyB);
  if (finiteA !== finiteB) return finiteA ? -1 : 1;
  if (finiteA && keyA !== keyB) return keyA < keyB ? -1 : 1;
  return idA - idB;
}

/**
 * Oolite's update order, the ids in the order their `update:` runs
 * (`Universe.m:6439, 6534`): `sortedEntities`, the player first, then by
 * distance from the player, nearest first. Here the player (`PLAYER_ID`)
 * comes first, then every other body by ascending squared distance from
 * `playerPosition`, ties by ascending id, a non-finite distance after every
 * finite one. Oolite keeps the list incrementally sorted from frame to frame;
 * this is an exact sort of the positions the stage sees (a FIDELITY row).
 */
export function colliderRank(
  bodies: readonly RankedBody[],
  playerPosition: Vec3,
): EntityId[] {
  const keyed = bodies.map((body) => {
    const dx = body.position.x - playerPosition.x;
    const dy = body.position.y - playerPosition.y;
    const dz = body.position.z - playerPosition.z;
    return { id: body.id, key: dx * dx + dy * dy + dz * dz };
  });
  keyed.sort((a, b) => {
    if (a.id === PLAYER_ID || b.id === PLAYER_ID) {
      if (a.id === b.id) return 0;
      return a.id === PLAYER_ID ? -1 : 1;
    }
    return compareKeys(a.key, a.id, b.key, b.id);
  });
  return keyed.map((entry) => entry.id);
}

interface ListEntry {
  readonly other: number;
  readonly part: ContactPart;
  removed: boolean;
  reverse: ListEntry | undefined;
}

/**
 * Each body's own collision list, run as Oolite runs them
 * (`-[ShipEntity manageCollisions]`, `ShipEntity.m:10991-11017`): the bodies
 * in rank order (`count` of them, ranks `0..count-1`), each through its list
 * in the other's rank order, calling `call(self, other, part)` for every
 * entry still there. A contact puts each side in the other's list
 * (`CollisionRegion.m:345-358`): the prime's (`contact.self`) entry carries
 * the touched `part`, the other's entry the prime's hull (Oolite's `e2`
 * lists `e1` itself). Whichever of the two ranks first calls first, so a
 * non-prime of lower rank calls with the prime's hull. A call that returns
 * true (collided) removes `self` from the other's list
 * (`ShipEntity.m:11149-11150`), so the contact is resolved once; one that
 * returns false (separating, the C's `return NO` at 11080-11081) leaves it,
 * and the other calls in its own turn with the roles swapped. When a
 * subentity is involved the C's `removeObject:self` misses (the call's
 * `other` is the subentity, or the list holds the caller's subentity), so
 * Oolite may run the contact again from the other side; here it is resolved
 * once (a FIDELITY divergence, E-135).
 */
export function runContactCalls(
  count: number,
  contacts: readonly RankedContact[],
  call: (self: number, other: number, part: ContactPart) => boolean,
): void {
  const lists: ListEntry[][] = [];
  for (let i = 0; i < count; i += 1) lists.push([]);
  for (const contact of contacts) {
    const forward: ListEntry = {
      other: contact.other,
      part: contact.part,
      removed: false,
      reverse: undefined,
    };
    const backward: ListEntry = {
      other: contact.self,
      part: HULL,
      removed: false,
      reverse: forward,
    };
    forward.reverse = backward;
    lists[contact.self]?.push(forward);
    lists[contact.other]?.push(backward);
  }
  for (let self = 0; self < count; self += 1) {
    const list = lists[self] ?? [];
    list.sort((a, b) => a.other - b.other);
    for (const entry of list) {
      if (entry.removed) continue;
      entry.removed = true;
      if (call(self, entry.other, entry.part) && entry.reverse !== undefined) {
        entry.reverse.removed = true;
      }
    }
  }
}

/**
 * What one stage call did, for the cost guard (PITFALLS 17, plan 18-18):
 * `colliders` gathered, `sweptPairs` the sorted sweep looked at (their
 * x-intervals overlap), `narrowTests` the octree tests run (the pairs whose
 * bounding spheres overlap) and `contacts` the octree contacts found. Plain
 * counters, nothing allocated per pair.
 */
export interface CollisionStats {
  readonly colliders: number;
  readonly sweptPairs: number;
  readonly narrowTests: number;
  readonly contacts: number;
}

/**
 * One body of the stage: the player (`entity` and `buoy` undefined), a store
 * entity, or a live buoy (`buoy` its key, plan 18-18). `detached` holds the
 * indices of subentities that take no part (a buoy's dead subentity, PD-01).
 */
interface Collider {
  readonly id: EntityId;
  readonly hull: HullData;
  readonly mass: number;
  readonly destroyable: boolean;
  readonly entity: Entity | undefined;
  readonly buoy: BuoyKey | undefined;
  readonly detached: ReadonlySet<number> | undefined;
}

const LOCAL_FORWARD: Vec3 = vec(0, 0, -1);
const ZERO_VEC: Vec3 = vec(0, 0, 0);

/** `n` held to `±limit`, -0 written as 0. */
function bound(n: number, limit: number): number {
  if (n > limit) return limit;
  if (n < -limit) return -limit;
  return n === 0 ? 0 : n;
}

function boundVec(v: Vec3, limit: number): Vec3 {
  return vec(bound(v.x, limit), bound(v.y, limit), bound(v.z, limit));
}

function isZeroVec(v: Vec3): boolean {
  return v.x === 0 && v.y === 0 && v.z === 0;
}

/**
 * The colliders of this tick, unranked: the in-flight player (with a combat
 * state and its hull; never while launching, A3), every live store ship whose
 * spec key has a hull and a mass above 0 (`massFor`, 0 for an unknown kind),
 * every live pod and plate (kind `cargo`, D-07) whose spec key has a hull
 * and whose mass `debrisMassOf` gives (none without the debris content), and,
 * with a layout, each buoy that is not destroyed and whose hull is loaded
 * (PD-02, plan 18-18). Never the station (it is not in the store: touching
 * its hull stays the dock's damage-free contact, DOCK-09, and NPCs and pods
 * pass through it), never a wreck and never a destroyed buoy.
 *
 * A buoy's mass is `NAV_BUOY_MASS` while its subentity is attached and
 * `NAV_BUOY_HULL_MASS` once it is detached (`subEntityDied` subtracts the
 * subentity's mass, `ShipEntity.m:8194`, PD-01), and its detached subentity
 * takes no part in the contact test. Both buoys are Oolite's buoy template,
 * so both carry the nav buoy's mass.
 */
function gatherColliders(
  world: World,
  player: FlightState,
  combat: PlayerCombatState | undefined,
  options: StepOptions,
  hulls: HullTable,
  layout: SystemLayout | undefined,
): Collider[] {
  const colliders: Collider[] = [];
  const playerHull = hulls.get(PLAYER_HULL_KEY);
  if (
    combat !== undefined &&
    player.mode === "inFlight" &&
    playerHull !== undefined
  ) {
    colliders.push({
      id: PLAYER_ID,
      hull: playerHull,
      mass: PLAYER_MASS_KG,
      destroyable: true,
      entity: undefined,
      buoy: undefined,
      detached: undefined,
    });
  }
  if (layout !== undefined) {
    for (const row of STATIC_TARGETS) {
      if (row.layoutKey === "station") continue;
      const hull = hulls.get(row.hullKey);
      if (hull === undefined || isBuoyDestroyed(world, row.layoutKey)) continue;
      const attached = isBuoySubentityAttached(world, row.layoutKey);
      colliders.push({
        id: row.id,
        hull,
        mass: attached ? NAV_BUOY_MASS : NAV_BUOY_HULL_MASS,
        destroyable: true,
        entity: undefined,
        buoy: row.layoutKey,
        detached: attached
          ? undefined
          : new Set([buoySubentityTargetOf(row.layoutKey).subentityIndex]),
      });
    }
  }
  const flight = options.npcFlight;
  const masses = options.hyperspace?.shipMasses;
  const facts: NpcStepFacts = {
    ...(flight === undefined ? {} : { flight }),
    ...(masses === undefined ? {} : { masses }),
  };
  const debris = options.combat?.debris;
  for (const entity of world.store.live) {
    // Ships, pods and plates (D-07); a wreck never (`canCollide`,
    // `ShipEntity.m:1858-1868`).
    if (entity.dead) continue;
    if (entity.kind !== "ship" && entity.kind !== "cargo") continue;
    const hull = hulls.get(entity.specKey);
    if (hull === undefined) continue;
    const mass =
      entity.kind === "ship"
        ? massFor(facts, entity.specKey)
        : debris === undefined
          ? undefined
          : debrisMassOf(entity, debris);
    if (mass === undefined || !(mass > 0) || !Number.isFinite(mass)) continue;
    colliders.push({
      id: entity.id,
      hull,
      mass,
      destroyable: true,
      entity,
      buoy: undefined,
      detached: undefined,
    });
  }
  return colliders;
}

/**
 * The collision stage (CBT-18, D-01, PD-01, PD-02, PD-05): every octree
 * contact of this tick between the player, NPC ships, pods, plates and, with
 * a `layout`, the two buoys (plan 18-18), resolved by Oolite's
 * `collideWithShip` (`./response.ts`) in Oolite's update order. Runs inside
 * `resolveShots` (`./step.ts`) after the laser hits are queued and before
 * the ledger, only with `CombatOptions.collisions` (the app's opt-in).
 *
 * 1. Colliders: see `gatherColliders`. Each is ranked by `colliderRank`
 *    from the player's position.
 * 2. Broad phase: a sweep over the colliders sorted by `x - radius` (ties by
 *    id, a non-finite key last), then Oolite's sphere test
 *    `d^2 < (r1 + r2)^2` with the hull's collision radius
 *    (`CollisionRegion.m:292-297`, strict).
 * 3. Narrow phase: `doOctreesCollide(self, other)` with Oolite's prime as
 *    `self`: `e1` of the collision chain, the body first in Oolite's z list
 *    (`compareZOrder`, `../world/sorted-lists.ts`, the key the
 *    collision-chain prefilter sorts by: Oolite's z, Wegolite's `-z`, minus
 *    the collision radius, ascending, ties by id; `Entity.m:247`,
 *    `Universe.m:7044-7073`, `CollisionRegion.m:284-287, 341-343`). The octree test is not symmetric, so the prime moves the
 *    onset (owner decision 2026-11-20). The prime's list carries the part it
 *    touched, the other's the prime's hull; the call order stays the rank
 *    order. The station, Oolite's prime whenever it is in a pair
 *    (`CollisionRegion.m:327-340`), is never a collider here.
 * 4. Response: `runContactCalls` runs each body's list in rank order. Each
 *    call reads the live positions and total velocities (drift plus
 *    forward x speed, plus the player's decaying dock `impulse`), calls
 *    `collideWithShip`, and on a contact applies at once (A5) `dv1` and
 *    `dp1` to self and `dvOtherBody` and `dpOther` to the other (or its
 *    parent for a subentity contact; `dvOtherSubentity` and
 *    `dpOtherSubentity` are never applied, an attached subentity having no
 *    motion of its own). The player's share goes to `FlightState.drift` and
 *    `position`, an entity's to `velocity` and `position`, a buoy's to
 *    `World.buoys.<key>.velocity` and `.offset` (a buoy is a mover, PD-02;
 *    it then brakes by its own thrust, `../world/drift.ts`); velocities are
 *    held to `MAX_ENTITY_VELOCITY`, entity positions to
 *    `MAX_ENTITY_MAGNITUDE` and buoy offsets to `MAX_BUOY_OFFSET` at the
 *    write. A buoy's pose is `buoyPosition` and `buoyOrientation` of the
 *    flight clock, its velocity its drift (it has no engine speed), its
 *    energy its `World.staticHealth`. When the other's touched part is a
 *    buoy's attached subentity (PD-01), the other party is the subentity
 *    (`BUOY_SUBENTITY_MASS`, its `subentityEnergy`, the buoy's velocity as
 *    the parent's) and its dam2 record goes to the subentity's own id (6 or
 *    7); when the buoy is self, the contact is the buoy body's.
 * 5. Damage: one `"scrape"` record per applied side (`dam > 0.05`), self's
 *    first, each with a copy of the source's position at queue time, for the
 *    ledger to apply after the laser records. A ship brought to 0 then dies
 *    through the one kill path; the player's energy floors at 0.
 *
 * The destroyed flags read each body's energy as it stood before this
 * tick's ledger, so a body in two contacts of one tick decides its reversal
 * and nudge on the same energy for both (a FIDELITY divergence; Oolite
 * reads the energy after the earlier damage of the frame,
 * `ShipEntity.m:11111-11112`). No `shipCollided` event (RESEARCH A8); no
 * random draw (`takeScrapeDamage`'s roll only sets `being_mined`, asteroids,
 * `ShipEntity.m:11659-11667`); no scoop (PD-05).
 */
export function resolveCollisions(
  world: World,
  player: FlightState,
  combat: PlayerCombatState | undefined,
  options: StepOptions,
  layout?: SystemLayout,
): { records: HitRecord[]; stats: CollisionStats } {
  const records: HitRecord[] = [];
  let sweptPairs = 0;
  let narrowTests = 0;
  const hulls = options.combat?.hulls;
  if (hulls === undefined) {
    return {
      records,
      stats: { colliders: 0, sweptPairs, narrowTests, contacts: 0 },
    };
  }
  const unranked = gatherColliders(
    world,
    player,
    combat,
    options,
    hulls,
    layout,
  );
  const done = (
    contacts: number,
  ): { records: HitRecord[]; stats: CollisionStats } => ({
    records,
    stats: { colliders: unranked.length, sweptPairs, narrowTests, contacts },
  });
  if (unranked.length < 2) return done(0);

  // A buoy's pose is read live (`buoyPosition` adds the offset a call wrote).
  const buoyOrient = buoyOrientation(player.flightTime);
  const positionOf = (c: Collider): Vec3 => {
    if (c.buoy !== undefined && layout !== undefined) {
      return buoyPosition(world, layout, c.buoy);
    }
    return c.entity?.position ?? player.position;
  };
  const orientationOf = (c: Collider): Quat => {
    if (c.buoy !== undefined) return buoyOrient;
    return c.entity?.orientation ?? player.orientation;
  };
  const poseOf = (c: Collider): HullPose => ({
    position: positionOf(c),
    orientation: orientationOf(c),
  });
  const velocityOf = (c: Collider): Vec3 => {
    // A buoy has no engine speed: its total velocity is its drift.
    if (c.buoy !== undefined) return world.buoys[c.buoy].velocity;
    const forward = rotate(orientationOf(c), LOCAL_FORWARD);
    if (c.entity !== undefined) {
      const { velocity, speed } = c.entity;
      return vec(
        velocity.x + forward.x * speed,
        velocity.y + forward.y * speed,
        velocity.z + forward.z * speed,
      );
    }
    const { drift, impulse, speed } = player;
    return vec(
      drift.x + forward.x * speed + impulse.x,
      drift.y + forward.y * speed + impulse.y,
      drift.z + forward.z * speed + impulse.z,
    );
  };
  const energyOf = (c: Collider): number => {
    if (c.buoy !== undefined) return world.staticHealth[c.buoy];
    return c.entity?.energy ?? combat?.energy ?? 0;
  };
  const addVelocity = (c: Collider, dv: Vec3): void => {
    if (isZeroVec(dv)) return;
    if (c.buoy !== undefined) {
      const buoy = world.buoys[c.buoy];
      buoy.velocity = boundVec(add(buoy.velocity, dv), MAX_ENTITY_VELOCITY);
    } else if (c.entity !== undefined) {
      c.entity.velocity = boundVec(
        add(c.entity.velocity, dv),
        MAX_ENTITY_VELOCITY,
      );
    } else {
      player.drift = boundVec(add(player.drift, dv), MAX_ENTITY_VELOCITY);
    }
  };
  const addPosition = (c: Collider, dp: Vec3): void => {
    if (isZeroVec(dp)) return;
    if (c.buoy !== undefined) {
      const buoy = world.buoys[c.buoy];
      buoy.offset = boundVec(add(buoy.offset, dp), MAX_BUOY_OFFSET);
    } else if (c.entity !== undefined) {
      c.entity.position = boundVec(
        add(c.entity.position, dp),
        MAX_ENTITY_MAGNITUDE,
      );
    } else {
      player.position = add(player.position, dp);
    }
  };

  // 1. Rank.
  const order = colliderRank(
    unranked.map((c) => ({ id: c.id, position: positionOf(c) })),
    player.position,
  );
  const byId = new Map(unranked.map((c) => [c.id, c]));
  const ranked: Collider[] = [];
  for (const id of order) {
    const collider = byId.get(id);
    if (collider !== undefined) ranked.push(collider);
  }

  // 2. Broad phase: sweep on x.
  const minX = ranked.map((c) => positionOf(c).x - c.hull.collisionRadius);
  const sweep = ranked.map((_, i) => i);
  sweep.sort((a, b) =>
    compareKeys(
      minX[a] ?? NaN,
      ranked[a]?.id ?? 0,
      minX[b] ?? NaN,
      ranked[b]?.id ?? 0,
    ),
  );
  const contacts: RankedContact[] = [];
  for (let s = 0; s < sweep.length; s += 1) {
    const a = sweep[s] ?? 0;
    const ca = ranked[a];
    const keyA = minX[a] ?? NaN;
    if (ca === undefined || !Number.isFinite(keyA)) break;
    const pa = positionOf(ca);
    const ra = ca.hull.collisionRadius;
    const maxX = pa.x + ra;
    for (let t = s + 1; t < sweep.length; t += 1) {
      const b = sweep[t] ?? 0;
      const cb = ranked[b];
      // A later key at or past this body's reach, or a non-finite one, ends
      // this body's run: no later key can be nearer.
      if (cb === undefined || !((minX[b] ?? NaN) < maxX)) break;
      sweptPairs += 1;
      const pb = positionOf(cb);
      const reach = ra + cb.hull.collisionRadius;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const dz = pb.z - pa.z;
      if (!(dx * dx + dy * dy + dz * dz < reach * reach)) continue;
      // 3. Narrow phase, Oolite's prime (the body first in Oolite's z list)
      // as self; a detached subentity on either side takes no part (PD-01).
      const aFirst =
        compareZOrder(
          { id: ca.id, position: pa, radius: ra },
          { id: cb.id, position: pb, radius: cb.hull.collisionRadius },
        ) < 0;
      const self = aFirst ? a : b;
      const other = aFirst ? b : a;
      const cs = ranked[self];
      const co = ranked[other];
      if (cs === undefined || co === undefined) continue;
      narrowTests += 1;
      const part = doOctreesCollide(
        cs.hull,
        poseOf(cs),
        co.hull,
        poseOf(co),
        co.detached,
        cs.detached,
      );
      if (part !== null) contacts.push({ self, other, part });
    }
  }
  if (contacts.length === 0) return done(0);

  // 4. and 5. Each body's own list, in rank order.
  runContactCalls(ranked.length, contacts, (self, other, part) => {
    const cs = ranked[self];
    const co = ranked[other];
    if (cs === undefined || co === undefined) return false;
    const selfPosition = positionOf(cs);
    const otherPose = poseOf(co);
    const sub =
      part.kind === "subentity" ? co.hull.subentities?.[part.index] : undefined;
    if (part.kind === "subentity" && sub === undefined) return false;
    // A buoy's frangible subentity (PD-01): its own mass and energy, and its
    // own target id for dam2.
    const buoySub =
      sub !== undefined &&
      co.buoy !== undefined &&
      part.kind === "subentity" &&
      part.index === buoySubentityTargetOf(co.buoy).subentityIndex
        ? co.buoy
        : undefined;
    // A subentity contact: the subentity's absolute position and mass, its
    // parent's velocity (`ShipEntity.m:11032, 11057-11067`).
    const otherPosition =
      sub === undefined
        ? otherPose.position
        : subentityPose(otherPose, sub.position).position;
    const otherVelocity = velocityOf(co);
    const otherMass =
      sub === undefined
        ? co.mass
        : buoySub === undefined
          ? sub.mass
          : BUOY_SUBENTITY_MASS;
    const otherEnergy =
      buoySub === undefined
        ? energyOf(co)
        : world.buoys[buoySub].subentityEnergy;
    const response = collideWithShip({
      self: {
        position: selfPosition,
        velocity: velocityOf(cs),
        mass: cs.mass,
        energy: energyOf(cs),
        destroyable: cs.destroyable,
      },
      other: {
        position: otherPosition,
        velocity: sub === undefined ? otherVelocity : ZERO_VEC,
        mass: otherMass,
        energy: otherEnergy,
        destroyable: co.destroyable,
        ...(sub === undefined
          ? {}
          : {
              parentVelocity: otherVelocity,
              parentFrangible: co.hull.frangible ?? true,
            }),
      },
    });
    if (response.kind === "separating") return false;
    // Damage queued, self's first (`ShipEntity.m:11114-11128`). A buoy
    // subentity takes all of dam2 on its own id (6 or 7): a ram has no 1 %
    // bleed-through on the parent (`takeScrapeDamage`, 11639-11673; the
    // bleed is the laser rule). A non-frangible parent takes it in the
    // subentity's place (11124-11125); any other subentity's share goes to
    // its parent's id (no other collider has a subentity of its own).
    if (response.applied1) {
      records.push({
        kind: "scrape",
        target: cs.id,
        source: co.id,
        amount: response.dam1,
        sourcePosition: { ...otherPosition },
      });
    }
    if (response.applied2) {
      const target =
        buoySub !== undefined && response.dam2Receiver === "other"
          ? buoySubentityTargetOf(buoySub).id
          : co.id;
      records.push({
        kind: "scrape",
        target,
        source: cs.id,
        amount: response.dam2,
        sourcePosition: { ...selfPosition },
      });
    }
    // Motion at once: the other (or its parent) first, then self
    // (`ShipEntity.m:11102-11109`), then the positions (11083, 11136-11147).
    // For a subentity contact the parent keeps `dvOtherBody` (+vel2a) even
    // when the rammer dies; `dvOtherSubentity` and `dpOtherSubentity` (the
    // C's nudge of the subentity inside its parent, 11143-11146) are never
    // applied: the subentity stays at its authored offset (a FIDELITY
    // divergence).
    addVelocity(co, response.dvOtherBody);
    addVelocity(cs, response.dv1);
    addPosition(cs, response.dp1);
    addPosition(co, response.dpOther);
    return true;
  });
  return done(contacts.length);
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's collision-chain prefilter (Phase 18, PD-08): `filterSortedLists`
 * (`Universe.m:6713-7144`) and the chain walk of the collision region
 * (`CollisionRegion.m:243-248`, 284-365), transliterated for the proximity
 * pass (`./proximity.ts`).
 *
 * Every frame Oolite marks each entity that cannot collide with filter 3 and
 * every other one with 0, then walks its position-sorted lists. Each body has
 * the extent of its position plus or minus twice its collision radius
 * (`start = p - 2r`, `finish = start + 4r`). Walking a list upwards, a body
 * whose extent overlaps the running finish of the run before it continues
 * that run; a body that starts a run no later body overlaps is a singleton and
 * gets filter 1. Bodies with filter 3 are skipped as neighbours, except that
 * the list head is always visited. The upward walks run on z, y, x and y. The
 * last upward walk, on z again, also chains each run: every body links to the
 * next one, and the region tests a body that is not filtered out (filter not
 * 3) against every later body of its chain (`e2 = e2->collision_chain`). A
 * proximity pair is therefore tested only when both bodies are in one z chain.
 *
 * The C also has a downward walk after each upward one, meant to OR in filter
 * 2 so that a body that is a singleton both ways gets filter 3. Each downward
 * walk starts from the `e0` the upward walk left behind, and that walk only
 * stops once `e0` is nil, so no downward walk ever runs: no collidable body is
 * ever eliminated and filter 2 is never set. This port keeps what the C does,
 * not what its comments say: the downward walks are not transliterated,
 * `chainEliminated` is the set of bodies whose filter is still 3 (the bodies
 * that cannot collide, unless a singleton mark on the list head reset one to
 * 1), and `chainsPair` asks for one shared z chain.
 *
 * Oolite's coordinates are Wegolite's with z negated (`../world/layout.ts`), so
 * the walks sort on Oolite's z, `-z`: the upward walk is not symmetric, and a
 * body sorted before a large one is chained only if its own run reaches the
 * large body's start. The lists are sorted by lower edge, position minus one
 * collision radius (`Entity.m:247`, 462-467). Ties sort by ascending id
 * (Oolite's linked lists keep insertion order for ties). A body with a
 * non-finite coordinate is left out of every list and counts as eliminated.
 *
 * What this means for a buoy (corrected 2026-11-20 by owner decision after
 * code verification; the plan text of 18-21 and Phase 14's record assumed
 * eliminating downward walks): only the z axis gates a pair. Two isolated
 * bodies share a chain when the later one's lower 2r edge is below the earlier
 * one's upper 2r edge, so on a z-axis approach a ship and a buoy are first
 * tested at a z separation of 2 x (r_ship + r_buoy), 218.66 m for a Krait at
 * the witchpoint beacon; on an x- or y-axis approach their z extents always
 * overlap and the unfiltered pair trigger (236.6 m for any ship at the beacon)
 * decides. The planet (collision radius `radius_km` x 10, `OOPlanetEntity.m:120`)
 * and the sun (`OOSunEntity.m:221`, 671) are chain bodies too, so every body
 * whose extent falls inside their z slab is chained with everything else
 * there and the prefilter gates nothing for it: Phase 14's "the planet chains
 * every entity" holds only inside the planet's slab.
 *
 * Bounded (T-18-54): five sorts and five linear walks over at most
 * `MAX_ENTITIES` plus the static bodies and the player.
 */

import type { Vec3 } from "../math.js";
import type { EntityId } from "../world/ids.js";
import {
  OOLITE_X,
  OOLITE_Y,
  OOLITE_Z,
  compareOnAxis,
} from "../world/sorted-lists.js";
import type { ListAxis } from "../world/sorted-lists.js";

/** A body of the sorted lists. */
export interface ChainBody {
  readonly id: EntityId;
  readonly position: Vec3;
  /** The collision radius, metres. */
  readonly radius: number;
  /** `canCollide` (`Entity.m:825`; false for wreckage, `ShipEntity.m:1858-1868`). */
  readonly canCollide: boolean;
}

/** The outcome of one `filterSortedLists` over a set of bodies. */
export interface CollisionChains {
  /** Bodies left with filter 3: never tested by the region. */
  readonly eliminated: ReadonlySet<EntityId>;
  /** The z chain of each chained body; a body in no chain is absent. */
  readonly chainOf: ReadonlyMap<EntityId, number>;
}

/** Oolite's coordinate on one axis: x and y as they are, z negated. */
type Axis = ListAxis;
const AXIS_X: Axis = OOLITE_X;
const AXIS_Y: Axis = OOLITE_Y;
const AXIS_Z: Axis = OOLITE_Z;

const ELIMINATED = 3;
const SINGLETON_UP = 1;

interface Slot {
  readonly body: ChainBody;
  filter: number;
}

/**
 * A list sorted as Oolite keeps it: by the lower edge, position minus ONE
 * collision radius (`compareOnAxis`, `../world/sorted-lists.ts`; the key the
 * collision stage's prime shares), although the walks below use extents of
 * two radii. Ties by ascending id.
 */
function sortedOn(slots: readonly Slot[], axis: Axis): Slot[] {
  return [...slots].sort((a, b) => compareOnAxis(axis, a.body, b.body));
}

/** The index of the next slot after `i` whose filter is not 3, or -1. */
function nextLive(list: readonly Slot[], i: number): number {
  let j = i + 1;
  while (j < list.length && list[j]?.filter === ELIMINATED) j += 1;
  return j < list.length ? j : -1;
}

/**
 * One upward walk (`Universe.m:6738-6775` and its y and x copies). With
 * `chains`, the final z walk (7045-7085): each run of two or more bodies is
 * numbered and every member is recorded under that number.
 */
function walkUp(
  list: readonly Slot[],
  axis: Axis,
  chains?: Map<EntityId, number>,
): void {
  let run = 0;
  let i = list.length > 0 ? 0 : -1;
  while (i !== -1) {
    // here we are either at the start of the list or just past a gap
    const e0 = list[i] as Slot;
    const start = axis(e0.body.position) - 2 * e0.body.radius;
    let finish = start + 4 * e0.body.radius;
    let next = nextLive(list, i);
    if (next !== -1) {
      let nextSlot = list[next] as Slot;
      let nextStart = axis(nextSlot.body.position) - 2 * nextSlot.body.radius;
      if (nextStart < finish) {
        // e0 and next overlap: chain them and skip forward to the next gap
        run += 1;
        chains?.set(e0.body.id, run);
        while (next !== -1 && nextStart < finish) {
          chains?.set(nextSlot.body.id, run);
          const nextFinish = nextStart + 4 * nextSlot.body.radius;
          if (nextFinish > finish) finish = nextFinish;
          i = next;
          next = nextLive(list, i);
          if (next !== -1) {
            nextSlot = list[next] as Slot;
            nextStart = axis(nextSlot.body.position) - 2 * nextSlot.body.radius;
          }
        }
      } else {
        e0.filter = SINGLETON_UP; // e0 is a singleton
      }
    } else {
      e0.filter = SINGLETON_UP; // at the end of the list so e0 is a singleton
    }
    i = next;
  }
}

function isFiniteBody(body: ChainBody): boolean {
  const p = body.position;
  return (
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    Number.isFinite(p.z) &&
    Number.isFinite(body.radius)
  );
}

/**
 * `filterSortedLists` over `bodies` (`Universe.m:6713-7144`): the filters and
 * the z chains it leaves. The walks run in the C's order, z, y, x, y, then z
 * again building the chains; the downward walks never run (see the module
 * comment).
 */
export function collisionChains(bodies: readonly ChainBody[]): CollisionChains {
  const eliminated = new Set<EntityId>();
  const slots: Slot[] = [];
  for (const body of bodies) {
    if (!isFiniteBody(body)) {
      eliminated.add(body.id);
      continue;
    }
    slots.push({ body, filter: body.canCollide ? 0 : ELIMINATED });
  }
  const byZ = sortedOn(slots, AXIS_Z);
  const byY = sortedOn(slots, AXIS_Y);
  const byX = sortedOn(slots, AXIS_X);
  walkUp(byZ, AXIS_Z);
  walkUp(byY, AXIS_Y);
  walkUp(byX, AXIS_X);
  // repeat the y_list - so gaps from the x_list influence singletons
  walkUp(byY, AXIS_Y);
  // finally, repeat the z_list - this time building collision chains
  const chainOf = new Map<EntityId, number>();
  walkUp(byZ, AXIS_Z, chainOf);
  for (const slot of slots) {
    if (slot.filter === ELIMINATED) eliminated.add(slot.body.id);
  }
  return { eliminated, chainOf };
}

/** The bodies `filterSortedLists` leaves with filter 3 (`CollisionRegion.m:243-248`). */
export function chainEliminated(
  bodies: readonly ChainBody[],
): ReadonlySet<EntityId> {
  return collisionChains(bodies).eliminated;
}

/**
 * True when the region tests the pair (`CollisionRegion.m:284-287`, 365):
 * neither body is filtered out and both are in one z chain.
 */
export function chainsPair(
  chains: CollisionChains,
  a: EntityId,
  b: EntityId,
): boolean {
  if (chains.eliminated.has(a) || chains.eliminated.has(b)) return false;
  const chainA = chains.chainOf.get(a);
  return chainA !== undefined && chainA === chains.chainOf.get(b);
}

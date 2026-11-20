// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The navigation buoys in the NPC proximity pass (Phase 18, plan 18-21).
 *
 * PD-06 (owner, 2026-11-19): every live buoy is a candidate of the pass, as in
 * Oolite, where the collision region tests every chained pair
 * (`CollisionRegion.m:284-312`) and `setProximityAlert:` ignores only a body
 * under 2,000 kg (`ShipEntity.m:6107`).
 *
 * PD-08 (owner, 2026-11-19; corrected 2026-11-20 by owner decision after code
 * verification): a pair that includes a buoy is tested only when Oolite's
 * `filterSortedLists` (`Universe.m:6713-7144`) puts both bodies in one z
 * collision chain. Its downward walks never run, so nothing collidable is
 * eliminated and only the z axis (Oolite z = Wegolite -z) gates a pair; the
 * planet's and the sun's z slabs chain everything inside them. So:
 *  - a Krait approaching the isolated witchpoint beacon along z is first
 *    alerted at a centre distance in (218.66 m - one tick of travel, 218.66 m],
 *    2 x (50.197 + 59.136) m;
 *  - along x the z extents always overlap and the 236.54 m pair trigger
 *    (4 x 59.136 m) decides;
 *  - the Lave nav buoy lies inside the planet's slab, so a z approach to it is
 *    alerted at the pair trigger too.
 *
 * The measured values (alert tick, onsets, closest approach) are pinned as
 * regression values of this deterministic run (review IN-05), not as Oolite
 * claims: Oolite guarantees the alert and that avoidance engages, not a miss
 * distance (review L529, L301@2e0bfb3). The approach harness runs without the
 * collision stage, so a closest approach below the contact distance is a pass
 * through, not a modelled collision.
 */

import { describe, expect, it } from "vitest";

import { quat, vec } from "../../../src/sim/math.js";
import type { Quat, Vec3 } from "../../../src/sim/math.js";
import {
  chainEliminated,
  chainsPair,
  collisionChains,
} from "../../../src/sim/npc/collision-chain.js";
import type { ChainBody } from "../../../src/sim/npc/collision-chain.js";
import {
  pairTriggers,
  proximityAlertFor,
} from "../../../src/sim/npc/proximity.js";
import type { ProximityBody } from "../../../src/sim/npc/proximity.js";
import { DT } from "../../../src/sim/time.js";
import type { Entity } from "../../../src/sim/world/entity.js";
import {
  MAIN_STATION_ID,
  PLANET_ID,
  STATION_NAV_BUOY_ID,
  SUN_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import { createWorld } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { realNpcFlightTable } from "../../helpers/npc-flight.js";
import {
  flyTo,
  hullRadius,
  layout,
  playerAt,
  spawnShip,
  stepOnce,
} from "./world-support.js";

const FACTS = { flight: realNpcFlightTable() };
const KRAIT = hullRadius("krait");
const KRAIT_SPEED = 300; // maxFlightSpeed of the compiled Krait
const PER_TICK = KRAIT_SPEED * DT;
const BEACON = layout.witchpoint.radius;
/** The z-chain onset of a Krait and a buoy: 2 x (r_ship + r_buoy). */
const CHAIN_ONSET = 2 * (KRAIT + BEACON);
/** The unfiltered pair trigger: four of the larger radius (the buoy's). */
const PAIR_TRIGGER = 4 * BEACON;

/** A quarter turn about +Y: the ship faces -X. */
const FACING_MINUS_X: Quat = quat(Math.SQRT1_2, 0, Math.SQRT1_2, 0);

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function angleTo(ship: Entity, target: Vec3): number {
  // the ship's forward is its local -Z
  const q = ship.orientation;
  const fx = -(2 * (q.x * q.z + q.w * q.y));
  const fy = -(2 * (q.y * q.z - q.w * q.x));
  const fz = -(1 - 2 * (q.x * q.x + q.y * q.y));
  const d = vec(
    target.x - ship.position.x,
    target.y - ship.position.y,
    target.z - ship.position.z,
  );
  const len = Math.hypot(d.x, d.y, d.z);
  const cos = (fx * d.x + fy * d.y + fz * d.z) / len;
  return Math.acos(Math.min(1, Math.max(-1, cos)));
}

interface Frame {
  readonly alert: EntityId;
  readonly behaviour: Entity["nav"]["behaviour"];
  readonly distance: number;
  readonly angle: number;
}

interface Approach {
  readonly world: World;
  readonly ship: Entity;
  readonly frames: readonly Frame[];
}

/**
 * A steered Krait at maxFlightSpeed starting `start` metres from `centre` and
 * flying a destination course 30 km past it along `axis` (unit), nose on the
 * course, for `ticks` ticks; `prepare` adjusts the world before the first step.
 */
function approach(options: {
  readonly centre: Vec3;
  readonly axis: "z" | "x";
  readonly start?: number;
  readonly ticks: number;
  readonly prepare?: (world: World) => void;
}): Approach {
  const world = createWorld(1);
  options.prepare?.(world);
  const player = playerAt();
  const start = options.start ?? 1000;
  const c = options.centre;
  const from =
    options.axis === "z"
      ? vec(c.x, c.y, c.z + start)
      : vec(c.x + start, c.y, c.z);
  const to =
    options.axis === "z"
      ? vec(c.x, c.y, c.z - 30000)
      : vec(c.x - 30000, c.y, c.z);
  const ship = spawnShip(world, {
    specKey: "krait",
    position: from,
    ...(options.axis === "x" ? { orientation: FACING_MINUS_X } : {}),
    radius: KRAIT,
    speed: KRAIT_SPEED,
    steered: true,
  });
  flyTo(ship, to, KRAIT_SPEED);
  const frames: Frame[] = [];
  for (let t = 1; t <= options.ticks; t += 1) {
    stepOnce(world, player, FACTS);
    frames.push({
      alert: ship.steer.proximityAlert,
      behaviour: ship.nav.behaviour,
      distance: distance(ship.position, c),
      angle: angleTo(ship, c),
    });
  }
  return { world, ship, frames };
}

function firstAlert(frames: readonly Frame[], id: EntityId): number {
  return frames.findIndex((frame) => frame.alert === id);
}

/* ---------------------------------------------------------------------------
 * The prefilter itself (Universe.m:6713-7144)
 * ------------------------------------------------------------------------- */

function body(
  id: number,
  z: number,
  radius: number,
  extra: Partial<ChainBody> = {},
): ChainBody {
  return { id, position: vec(0, 0, -z), radius, canCollide: true, ...extra };
}

describe("collisionChains: Oolite's z collision chains (Universe.m:7045-7085)", () => {
  it("two bodies on the z axis share a chain closer than 2 x (r1 + r2), not at it", () => {
    const inside = collisionChains([body(1, 0, 10), body(2, 59.999, 20)]);
    expect(chainsPair(inside, 1, 2)).toBe(true);
    const at = collisionChains([body(1, 0, 10), body(2, 60, 20)]);
    expect(chainsPair(at, 1, 2)).toBe(false);
    // the same both ways round
    const below = collisionChains([body(1, 0, 10), body(2, -59.999, 20)]);
    expect(chainsPair(below, 1, 2)).toBe(true);
  });

  it("a separation on x or y never splits a chain: only z gates a pair", () => {
    const chains = collisionChains([
      { id: 1, position: vec(0, 0, 0), radius: 10, canCollide: true },
      { id: 2, position: vec(5000, -7000, 0), radius: 20, canCollide: true },
    ]);
    expect(chainsPair(chains, 1, 2)).toBe(true);
  });

  it("a body whose extent bridges two others chains all three (the merged run)", () => {
    // extents [-30, 30], [20, 80] and [70, 130]: 1 and 3 do not overlap
    const chains = collisionChains([
      body(1, 0, 15),
      body(2, 50, 15),
      body(3, 100, 15),
    ]);
    expect(chainsPair(chains, 1, 3)).toBe(true);
    const gap = collisionChains([body(1, 0, 15), body(3, 100, 15)]);
    expect(chainsPair(gap, 1, 3)).toBe(false);
  });

  it("sorts by the lower edge, position minus one radius (Entity.m:247, 462-467), not by centre", () => {
    // X (centre 0, r 1) sorts before Z (centre 20, r 12, edge 8) and Z before
    // Y (centre 10, r 1, edge 9): X's run reaches Z's 2r start (-4), so all
    // three chain. Sorted by centre, Y would come second and leave X alone.
    const chains = collisionChains([
      body(1, 0, 1),
      body(2, 10, 1),
      body(3, 20, 12),
    ]);
    expect(chainsPair(chains, 1, 3)).toBe(true);
    expect(chainsPair(chains, 1, 2)).toBe(true);
  });

  it("no collidable body is eliminated: the downward walks never run", () => {
    expect(
      chainEliminated([body(1, 0, 10), body(2, 1e6, 10), body(3, -1e6, 10)]),
    ).toEqual(new Set());
  });

  it("a body that cannot collide is eliminated and never a neighbour, except a singleton list head", () => {
    // 2 cannot collide and sits between 1 and 3, which are too far apart to
    // chain on their own: it is skipped, so it bridges nothing
    const chains = collisionChains([
      body(1, 0, 10),
      body(2, 30, 10, { canCollide: false }),
      body(3, 60, 10),
    ]);
    expect(chains.eliminated.has(2)).toBe(true);
    expect(chainsPair(chains, 1, 3)).toBe(false);
    // the list head is visited even with filter 3; a singleton head is reset
    // to 1 (Universe.m:6769, 6774) and so is no longer eliminated
    const head = collisionChains([
      body(1, -1000, 10, { canCollide: false }),
      body(2, 0, 10),
    ]);
    expect(head.eliminated.has(1)).toBe(false);
  });

  it("a body with a non-finite coordinate is left out and counts as eliminated", () => {
    const chains = collisionChains([
      body(1, 0, 10),
      { id: 2, position: vec(Number.NaN, 0, 0), radius: 10, canCollide: true },
    ]);
    expect(chains.eliminated.has(2)).toBe(true);
    expect(chainsPair(chains, 1, 2)).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * The Lave statics in the chains
 * ------------------------------------------------------------------------- */

function laveStatics(): ChainBody[] {
  return [
    { id: PLANET_ID, ...layout.planet, canCollide: true },
    { id: SUN_ID, ...layout.sun, canCollide: true },
    { id: MAIN_STATION_ID, ...layout.station, canCollide: true },
    { id: WITCHPOINT_BUOY_ID, ...layout.witchpoint, canCollide: true },
    { id: STATION_NAV_BUOY_ID, ...layout.navBuoy, canCollide: true },
  ];
}

describe("the Lave statics in the chains (computed, not assumed)", () => {
  const chains = collisionChains(laveStatics());

  it("the witchpoint beacon is outside the planet's and the sun's slabs", () => {
    expect(chainsPair(chains, WITCHPOINT_BUOY_ID, PLANET_ID)).toBe(false);
    expect(chainsPair(chains, WITCHPOINT_BUOY_ID, SUN_ID)).toBe(false);
  });

  it("the nav buoy is inside the planet's slab, chained with the planet and the station", () => {
    expect(chainsPair(chains, STATION_NAV_BUOY_ID, PLANET_ID)).toBe(true);
    expect(chainsPair(chains, STATION_NAV_BUOY_ID, MAIN_STATION_ID)).toBe(true);
  });
});

/* ---------------------------------------------------------------------------
 * The tracer: a Krait flying at the witchpoint beacon (PD-06)
 * ------------------------------------------------------------------------- */

describe("a Krait flying at the witchpoint beacon is alerted and turns away (tracer)", () => {
  const beacon = layout.witchpoint.position;
  const run = approach({ centre: beacon, axis: "z", ticks: 400 });
  const at = firstAlert(run.frames, WITCHPOINT_BUOY_ID);

  it("is alerted by the beacon before contact", () => {
    expect(at).toBeGreaterThan(0);
    const alertFrame = run.frames[at];
    expect(alertFrame).toBeDefined();
    expect(alertFrame?.distance ?? 0).toBeGreaterThan(KRAIT + BEACON);
    for (let t = 0; t < at; t += 1) expect(run.frames[t]?.alert).toBe(0);
  });

  it("is in AVOID_COLLISION within two ticks of the alert", () => {
    const window = run.frames.slice(at, at + 3).map((f) => f.behaviour);
    expect(window).toContain("AVOID_COLLISION");
  });

  it("30 ticks after the alert its nose points further from the beacon than at the alert", () => {
    const alertAngle = run.frames[at]?.angle ?? Number.NaN;
    const later = run.frames[at + 30]?.angle ?? Number.NaN;
    expect(later).toBeGreaterThan(alertAngle);
  });

  it("records the alert tick, the onset distance and the closest approach", () => {
    const closest = Math.min(...run.frames.map((f) => f.distance));
    // regression pins of the deterministic run (review IN-05)
    expect(at + 1).toBe(313);
    expect(run.frames[at]?.distance).toBe(217.5);
    expect(KRAIT + BEACON).toBeCloseTo(109.33213806152344, 9);
    // avoidance engages but does not clear the beacon: the Krait passes
    // 22.24 m from its centre, inside the 109.33 m contact distance
    expect(closest).toBeCloseTo(22.23525664591719, 6);
    expect(closest).toBeLessThan(KRAIT + BEACON);
  });

  it("with the beacon destroyed no alert names it and the course does not change", () => {
    const control = approach({
      centre: beacon,
      axis: "z",
      ticks: 400,
      prepare: (world) => {
        world.staticHealth.witchpoint = 0;
      },
    });
    for (const frame of control.frames) {
      expect(frame.alert).toBe(0);
      expect(frame.behaviour).toBe("FLY_TO_DESTINATION");
    }
    // without the alert the course runs straight through the beacon centre
    const closest = Math.min(...control.frames.map((f) => f.distance));
    expect(closest).toBe(0);
  });

  it("a beacon pushed to a non-zero offset alerts from its live centre", () => {
    const offset = vec(300, 0, 0);
    const live = vec(beacon.x + 300, beacon.y, beacon.z);
    const moved = approach({
      centre: live,
      axis: "z",
      ticks: 400,
      prepare: (world) => {
        world.buoys.witchpoint.offset = offset;
      },
    });
    const first = firstAlert(moved.frames, WITCHPOINT_BUOY_ID);
    expect(first).toBeGreaterThan(0);
    const onset = moved.frames[first]?.distance ?? 0;
    // measured from the live centre, inside the z-chain band
    expect(onset).toBeLessThan(CHAIN_ONSET);
    expect(onset).toBeGreaterThan(CHAIN_ONSET - PER_TICK - 1e-9);
    // the layout position is 300 m off the course: beyond the pair trigger
    expect(300).toBeGreaterThan(PAIR_TRIGGER);
  });

  it("a buoy never holds an alert, and an inert ship is never alerted by one", () => {
    const world = createWorld(1);
    const player = playerAt();
    const inert = spawnShip(world, {
      specKey: "krait",
      position: vec(0, 0, 150),
      radius: KRAIT,
    });
    for (let t = 0; t < 5; t += 1) stepOnce(world, player, FACTS);
    expect(inert.steer.proximityAlert).toBe(0);
    // the buoys are static records, never store entities with a steer slot
    expect(world.store.live.every((entity) => entity.kind === "ship")).toBe(
      true,
    );
    expect(world.store.get(WITCHPOINT_BUOY_ID)).toBeUndefined();
  });

  it("a steered ship nowhere near a buoy flies exactly as with both buoys destroyed", () => {
    function far(destroyed: boolean): string {
      const world = createWorld(1);
      if (destroyed) {
        world.staticHealth.witchpoint = 0;
        world.staticHealth.navBuoy = 0;
      }
      const player = playerAt();
      const ship = spawnShip(world, {
        specKey: "krait",
        position: vec(20000, 0, 0),
        orientation: FACING_MINUS_X,
        radius: KRAIT,
        speed: KRAIT_SPEED,
        steered: true,
      });
      flyTo(ship, vec(20000, 0, -30000), KRAIT_SPEED);
      for (let t = 0; t < 200; t += 1) stepOnce(world, player, FACTS);
      return JSON.stringify(world.store.live);
    }
    expect(far(false)).toBe(far(true));
  });
});

/* ---------------------------------------------------------------------------
 * The onset band (PD-08)
 * ------------------------------------------------------------------------- */

describe("the alert onset of a buoy (PD-08)", () => {
  it(`along z the isolated beacon first alerts a Krait in (218.66 m - one tick, 218.66 m]`, () => {
    expect(CHAIN_ONSET).toBeCloseTo(218.66, 2);
    const run = approach({
      centre: layout.witchpoint.position,
      axis: "z",
      ticks: 400,
    });
    const at = firstAlert(run.frames, WITCHPOINT_BUOY_ID);
    const onset = run.frames[at]?.distance ?? 0;
    expect(onset).toBe(217.5);
    expect(onset).toBeLessThanOrEqual(CHAIN_ONSET);
    expect(onset).toBeGreaterThan(CHAIN_ONSET - PER_TICK);
    // the tick before, the pair trigger already held: the chain decided
    const before = run.frames[at - 1]?.distance ?? 0;
    expect(before).toBeLessThan(PAIR_TRIGGER);
  });

  it("along x the z extents overlap and the 236.54 m pair trigger decides", () => {
    expect(PAIR_TRIGGER).toBeCloseTo(236.54, 2);
    const run = approach({
      centre: layout.witchpoint.position,
      axis: "x",
      ticks: 400,
    });
    const at = firstAlert(run.frames, WITCHPOINT_BUOY_ID);
    const onset = run.frames[at]?.distance ?? 0;
    expect(onset).toBe(235);
    expect(onset).toBeLessThan(PAIR_TRIGGER);
    expect(onset).toBeGreaterThan(PAIR_TRIGGER - PER_TICK);
  });

  it("the Lave nav buoy, inside the planet's slab, alerts at the pair trigger even along z", () => {
    const run = approach({
      centre: layout.navBuoy.position,
      axis: "z",
      ticks: 400,
    });
    const at = firstAlert(run.frames, STATION_NAV_BUOY_ID);
    const onset = run.frames[at]?.distance ?? 0;
    expect(onset).toBe(235);
    expect(onset).toBeLessThan(PAIR_TRIGGER);
    expect(onset).toBeGreaterThan(PAIR_TRIGGER - PER_TICK);
  });

  it("at 236 m along z there is no alert on that tick; the bypassed prefilter would alert", () => {
    const run = approach({
      centre: layout.witchpoint.position,
      axis: "z",
      start: 236,
      ticks: 1,
    });
    const frame = run.frames[0];
    expect(frame?.distance ?? 0).toBeGreaterThan(CHAIN_ONSET);
    expect(frame?.alert).toBe(0);
    // the same configuration without the prefilter: the pair trigger holds and
    // setProximityAlert: takes the beacon
    const ship = run.ship;
    const beacon: ProximityBody = {
      id: WITCHPOINT_BUOY_ID,
      position: layout.witchpoint.position,
      radius: BEACON,
    };
    const d = frame?.distance ?? 0;
    expect(pairTriggers(d * d, KRAIT, BEACON)).toBe(true);
    proximityAlertFor(ship, KRAIT_SPEED, beacon, 698691, () => undefined);
    expect(ship.steer.proximityAlert).toBe(WITCHPOINT_BUOY_ID);
  });
});

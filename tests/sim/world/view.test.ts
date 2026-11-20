// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The read side of the AI seam (FOUND-13, D-06, D-07; plan 08-07). Expected
 * values come from the layout, the player pose and the rules of the plan, never
 * from running the implementation.
 */

import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { Vec3 } from "../../../src/sim/math.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLANET_ID,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  SUN_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import type { EntityId } from "../../../src/sim/world/ids.js";
import type { SystemLayout } from "../../../src/sim/world/layout.js";
import type { WorldView } from "../../../src/sim/world/view.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import {
  commitWorld,
  createWorld,
  killEntity,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

/** The exhaustive member set of WorldView: adding or removing one fails typecheck. */
const VIEW_MEMBERS: Record<keyof WorldView, true> = {
  tick: true,
  playerId: true,
  isValid: true,
  body: true,
  ship: true,
  scan: true,
  mainStation: true,
  mainPlanet: true,
  sun: true,
};

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

/** Strip `readonly` so a test can try to corrupt a returned object. */
function mutable<T>(value: T): Mutable<T> {
  return value;
}

function inFlight(overrides: Partial<FlightState> = {}): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.tick = 42;
  state.position = vec(1000, 2000, -3000);
  state.speed = 123;
  return { ...state, ...overrides };
}

function shipInit(overrides: Partial<SpawnInit> = {}): SpawnInit {
  return {
    kind: "ship",
    specKey: "test-ship",
    scanClass: "CLASS_NEUTRAL",
    position: vec(1100, 2000, -3000),
    orientation: identity(),
    radius: 50,
    speed: 7,
    ai: { aiKey: "test-pilot", params: {}, wakeTick: 0, nextThinkTick: 0 },
    ...overrides,
  };
}

function spawnOk(world: World, overrides: Partial<SpawnInit> = {}) {
  const result = spawnEntity(world, shipInit(overrides), 0);
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  const entity = result.entity;
  return entity;
}

function distanceSquared(a: Vec3, b: Vec3): number {
  return (
    (a.x - b.x) * (a.x - b.x) +
    (a.y - b.y) * (a.y - b.y) +
    (a.z - b.z) * (a.z - b.z)
  );
}

describe("the seam end to end (tracer)", () => {
  it("body(1..5) reports the layout bodies and body(100) the player pose", () => {
    const world = createWorld(7);
    const player = inFlight();
    const view = createWorldView(world, player, layout);

    expect(view.tick).toBe(42);
    expect(view.playerId).toBe(PLAYER_ID);
    expect(view.body(PLANET_ID)?.position).toEqual(layout.planet.position);
    expect(view.body(SUN_ID)?.position).toEqual(layout.sun.position);
    expect(view.body(MAIN_STATION_ID)?.position).toEqual(
      layout.station.position,
    );
    expect(view.body(WITCHPOINT_BUOY_ID)?.position).toEqual(
      layout.witchpoint.position,
    );
    expect(view.body(STATION_NAV_BUOY_ID)?.position).toEqual(
      layout.navBuoy.position,
    );

    const self = view.body(PLAYER_ID);
    expect(self?.kind).toBe("player");
    expect(self?.scanClass).toBe("CLASS_PLAYER");
    expect(self?.position).toEqual(player.position);
    expect(self?.orientation).toEqual(player.orientation);
    expect(self?.speed).toBe(123);
    expect(view.mainStation()).toBe(MAIN_STATION_ID);
    expect(view.mainPlanet()).toBe(PLANET_ID);
    expect(view.sun()).toBe(SUN_ID);
  });

  it("scan from an entity returns the nearer entity before farther bodies", () => {
    const world = createWorld(7);
    const a = spawnOk(world, { position: vec(5000, 0, 0) });
    const b = spawnOk(world, { position: vec(5100, 0, 0) });
    const view = createWorldView(world, inFlight(), layout);

    // The player at (1000, 2000, -3000) is farther from A than B is.
    const hits = view.scan(a.id, 1e13);
    expect(hits[0]).toBe(b.id);
    expect(hits).not.toContain(a.id);
    expect(hits).toContain(PLAYER_ID);
    expect(hits).toContain(PLANET_ID);
  });

  it("an actor's ShipControl write is visible through ship(actor)", () => {
    const world = createWorld(7);
    const a = spawnOk(world);
    const view = createWorldView(world, inFlight(), layout);

    expect(view.ship(a.id)?.desiredSpeed).toBe(7);
    createShipControl(world, a.id, 42).setDesiredSpeed(a.id, 55);
    expect(view.ship(a.id)?.desiredSpeed).toBe(55);
  });
});

describe("the view's member set", () => {
  it("equals the pinned VIEW_MEMBERS exactly (Pitfall 19)", () => {
    const view = createWorldView(createWorld(1), inFlight(), layout);
    expect(Object.keys(view).sort()).toEqual(Object.keys(VIEW_MEMBERS).sort());
  });
});

describe("isValid, body and ship across id classes", () => {
  it("is undefined and invalid for reserved, missing, killed and malformed ids", () => {
    const world = createWorld(1);
    const live = spawnOk(world);
    const killed = spawnOk(world);
    killEntity(world, killed.id);
    const view = createWorldView(world, inFlight(), layout);

    const absent: EntityId[] = [
      6,
      50,
      99,
      NO_ENTITY,
      99999,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      killed.id,
    ];
    for (const id of absent) {
      expect(view.isValid(id), `isValid(${String(id)})`).toBe(false);
      expect(view.body(id), `body(${String(id)})`).toBeUndefined();
      expect(view.ship(id), `ship(${String(id)})`).toBeUndefined();
    }
    // A committed removal behaves the same as an uncommitted kill.
    commitWorld(world);
    expect(view.isValid(killed.id)).toBe(false);

    for (const id of [1, 2, 3, 4, 5, PLAYER_ID, live.id]) {
      expect(view.isValid(id), `isValid(${String(id)})`).toBe(true);
      expect(view.body(id)?.id).toBe(id);
    }
  });

  it("ship() answers for live dynamic entities only", () => {
    const world = createWorld(1);
    const a = spawnOk(world, {
      kind: "cargo",
      scanClass: "CLASS_CARGO",
      position: vec(10, 20, 30),
      speed: 3,
    });
    const view = createWorldView(world, inFlight(), layout);

    expect(view.ship(a.id)).toEqual({
      id: a.id,
      kind: "cargo",
      scanClass: "CLASS_CARGO",
      position: vec(10, 20, 30),
      orientation: identity(),
      speed: 3,
      radius: 50,
      behaviour: "IDLE",
      targetId: NO_ENTITY,
      destination: vec(10, 20, 30),
      desiredRange: 0,
      desiredSpeed: 3,
    });
    for (const id of [1, 2, 3, 4, 5, PLAYER_ID]) {
      expect(view.ship(id)).toBeUndefined();
    }
  });

  it("body(dynamic) carries the stored kind, scan class, pose and speed", () => {
    const world = createWorld(1);
    const a = spawnOk(world, {
      kind: "missile",
      scanClass: "CLASS_MISSILE",
      position: vec(1, 2, 3),
      speed: 9,
    });
    const view = createWorldView(world, inFlight(), layout);
    expect(view.body(a.id)).toEqual({
      id: a.id,
      kind: "missile",
      scanClass: "CLASS_MISSILE",
      position: vec(1, 2, 3),
      orientation: identity(),
      speed: 9,
      radius: 50,
    });
  });
});

describe("returned objects are copies (T-08-13)", () => {
  it("mutating a returned vector or quaternion changes nothing", () => {
    const world = createWorld(1);
    const a = spawnOk(world);
    const player = inFlight();
    const view = createWorldView(world, player, layout);

    const layoutBefore = structuredClone(layout);
    const playerBefore = structuredClone(player);
    const entityBefore = structuredClone(a);

    const planet = view.body(PLANET_ID);
    const station = view.body(MAIN_STATION_ID);
    const self = view.body(PLAYER_ID);
    const ship = view.ship(a.id);
    const body = view.body(a.id);
    if (
      planet === undefined ||
      station === undefined ||
      self === undefined ||
      ship === undefined ||
      body === undefined
    ) {
      throw new Error("expected bodies");
    }

    mutable(planet.position).x = 9e9;
    mutable(station.orientation).w = 9;
    mutable(self.position).y = 9e9;
    mutable(self.orientation).x = 9;
    mutable(ship.position).z = 9e9;
    mutable(ship.orientation).y = 9;
    mutable(ship.destination).x = 9e9;
    mutable(body.position).x = 9e9;
    mutable(body.orientation).z = 9;

    expect(layout).toEqual(layoutBefore);
    expect(player).toEqual(playerBefore);
    expect(a).toEqual(entityBefore);
    expect(view.body(PLANET_ID)?.position).toEqual(layout.planet.position);
    expect(view.ship(a.id)?.destination).toEqual(a.nav.destination);
  });

  it("two calls never return the same object", () => {
    const world = createWorld(1);
    const a = spawnOk(world);
    const view = createWorldView(world, inFlight(), layout);
    for (const id of [PLANET_ID, MAIN_STATION_ID, PLAYER_ID, a.id]) {
      const first = view.body(id);
      const second = view.body(id);
      expect(first).not.toBe(second);
      expect(first?.position).not.toBe(second?.position);
      expect(first?.orientation).not.toBe(second?.orientation);
    }
    expect(view.ship(a.id)?.destination).not.toBe(view.ship(a.id)?.destination);
  });

  it("pushing onto or sorting a returned scan array does not change the next scan", () => {
    const world = createWorld(1);
    const a = spawnOk(world, { position: vec(5000, 0, 0) });
    spawnOk(world, { position: vec(5100, 0, 0) });
    const view = createWorldView(world, inFlight(), layout);

    const first = view.scan(a.id, 1e13);
    const snapshot = [...first];
    const hits = first as EntityId[];
    hits.push(99999);
    hits.sort((x, y) => y - x);
    hits.length = 0;

    expect(view.scan(a.id, 1e13)).toEqual(snapshot);
  });
});

describe("BodyView.radius is the collision radius of every body kind", () => {
  it("a dynamic ship reports its entity radius through body() and ship()", () => {
    const world = createWorld(1);
    const a = spawnOk(world, { radius: 77.5 });
    const b = spawnOk(world, { kind: "cargo", radius: 3 });
    const view = createWorldView(world, inFlight(), layout);

    expect(a.radius).toBe(77.5);
    expect(view.body(a.id)?.radius).toBe(a.radius);
    expect(view.ship(a.id)?.radius).toBe(a.radius);
    expect(view.body(b.id)?.radius).toBe(b.radius);
    expect(view.ship(b.id)?.radius).toBe(3);
  });

  it("each static reports the radius of its layout body", () => {
    const view = createWorldView(createWorld(1), inFlight(), layout);
    const expected: [EntityId, number][] = [
      [MAIN_STATION_ID, layout.station.radius],
      [PLANET_ID, layout.planet.radius],
      [SUN_ID, layout.sun.radius],
      [STATION_NAV_BUOY_ID, layout.navBuoy.radius],
      [WITCHPOINT_BUOY_ID, layout.witchpoint.radius],
    ];
    for (const [id, radius] of expected) {
      expect(view.body(id)?.radius, `body(${String(id)})`).toBe(radius);
      expect(view.ship(id)).toBeUndefined();
    }
  });

  it("a static follows the layout of the view that reads it", () => {
    const moved: SystemLayout = {
      ...layout,
      station: { ...layout.station, radius: 1234 },
    };
    const world = createWorld(1);
    const player = inFlight();
    expect(
      createWorldView(world, player, moved).body(MAIN_STATION_ID)?.radius,
    ).toBe(1234);
    expect(
      createWorldView(world, player, layout).body(MAIN_STATION_ID)?.radius,
    ).toBe(layout.station.radius);
  });

  it("the player reports the playerRadius argument, and 0 when it is absent", () => {
    const world = createWorld(1);
    const player = inFlight();
    expect(
      createWorldView(world, player, layout, 42.25).body(PLAYER_ID)?.radius,
    ).toBe(42.25);
    expect(createWorldView(world, player, layout).body(PLAYER_ID)?.radius).toBe(
      0,
    );
  });

  it("writing to a returned radius changes no world, layout, player or later result", () => {
    const world = createWorld(1);
    const a = spawnOk(world, { radius: 50 });
    const player = inFlight();
    const view = createWorldView(world, player, layout, 30);

    const layoutBefore = structuredClone(layout);
    const playerBefore = structuredClone(player);
    const entityBefore = structuredClone(a);

    const ids = [a.id, PLAYER_ID, MAIN_STATION_ID, PLANET_ID, SUN_ID];
    for (const id of ids) {
      const body = view.body(id);
      if (body === undefined) throw new Error(`expected body ${String(id)}`);
      mutable(body).radius = 9e9;
    }
    const ship = view.ship(a.id);
    if (ship === undefined) throw new Error("expected ship");
    mutable(ship).radius = 9e9;

    expect(layout).toEqual(layoutBefore);
    expect(player).toEqual(playerBefore);
    expect(a).toEqual(entityBefore);
    expect(view.body(a.id)?.radius).toBe(50);
    expect(view.ship(a.id)?.radius).toBe(50);
    expect(view.body(PLAYER_ID)?.radius).toBe(30);
    expect(view.body(MAIN_STATION_ID)?.radius).toBe(layout.station.radius);
    expect(view.body(PLANET_ID)?.radius).toBe(layout.planet.radius);
    expect(view.body(SUN_ID)?.radius).toBe(layout.sun.radius);
  });
});

describe("static entities resolve through the layout (D-06, D-07)", () => {
  it("reports each static's id, kind, scan class and identity orientation", () => {
    const view = createWorldView(createWorld(1), inFlight(), layout);
    const expected: [EntityId, string, string][] = [
      [PLANET_ID, "planet", "CLASS_NO_DRAW"],
      [SUN_ID, "sun", "CLASS_NO_DRAW"],
      [MAIN_STATION_ID, "station", "CLASS_STATION"],
      [WITCHPOINT_BUOY_ID, "buoy", "CLASS_BUOY"],
      [STATION_NAV_BUOY_ID, "buoy", "CLASS_BUOY"],
    ];
    for (const [id, kind, scanClass] of expected) {
      const body = view.body(id);
      expect(body?.id).toBe(id);
      expect(body?.kind).toBe(kind);
      expect(body?.scanClass).toBe(scanClass);
      expect(body?.speed).toBe(0);
      if (id !== MAIN_STATION_ID) {
        expect(body?.orientation).toEqual(identity());
      }
    }
    expect(view.body(WITCHPOINT_BUOY_ID)?.position).toEqual(
      layout.witchpoint.position,
    );
    expect(view.body(STATION_NAV_BUOY_ID)?.position).toEqual(
      layout.navBuoy.position,
    );
  });

  it("a second layout passed to a new view moves the buoys; world.statics is untouched", () => {
    const world = createWorld(1);
    const staticsBefore = structuredClone(world.statics);
    const moved: SystemLayout = {
      ...layout,
      witchpoint: { ...layout.witchpoint, position: vec(5, 6, 7) },
      navBuoy: { ...layout.navBuoy, position: vec(8, 9, 10) },
    };
    const player = inFlight();
    const original = createWorldView(world, player, layout);
    const shifted = createWorldView(world, player, moved);

    expect(shifted.body(WITCHPOINT_BUOY_ID)?.position).toEqual(vec(5, 6, 7));
    expect(shifted.body(STATION_NAV_BUOY_ID)?.position).toEqual(vec(8, 9, 10));
    expect(original.body(WITCHPOINT_BUOY_ID)?.position).toEqual(
      layout.witchpoint.position,
    );
    expect(world.statics).toEqual(staticsBefore);
    expect(Object.isFrozen(world.statics)).toBe(true);
  });
});

describe("the station's roll equals the renderer's composition (review 10b4108 L184)", () => {
  const base = layout.stationBaseQuat;

  it("at stationAngle 0 the orientation is the base orientation", () => {
    const view = createWorldView(
      createWorld(1),
      inFlight({ stationAngle: 0 }),
      layout,
    );
    const q = view.body(MAIN_STATION_ID)?.orientation;
    // Numeric, not toEqual: the product may print +0 where the base holds -0.
    expect(q).toBeDefined();
    if (q === undefined) return;
    expect(Math.abs(q.w - base.w)).toBeLessThan(1e-12);
    expect(Math.abs(q.x - base.x)).toBeLessThan(1e-12);
    expect(Math.abs(q.y - base.y)).toBeLessThan(1e-12);
    expect(Math.abs(q.z - base.z)).toBeLessThan(1e-12);
  });

  it("changes with stationAngle", () => {
    const world = createWorld(1);
    const at = (angle: number) =>
      createWorldView(world, inFlight({ stationAngle: angle }), layout).body(
        MAIN_STATION_ID,
      )?.orientation;
    expect(at(0)).not.toEqual(at(0.5));
  });

  it.each([0, 0.5, Math.PI, -1.2])(
    "matches an independent three.js base-then-roll at angle %f within 1e-12",
    (angle) => {
      const view = createWorldView(
        createWorld(1),
        inFlight({ stationAngle: angle }),
        layout,
      );
      const actual = view.body(MAIN_STATION_ID)?.orientation;
      const expected = new THREE.Quaternion(base.x, base.y, base.z, base.w)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 0, 1),
            angle,
          ),
        )
        .normalize();
      expect(actual).toBeDefined();
      if (actual === undefined) return;
      expect(Math.abs(actual.w - expected.w)).toBeLessThan(1e-12);
      expect(Math.abs(actual.x - expected.x)).toBeLessThan(1e-12);
      expect(Math.abs(actual.y - expected.y)).toBeLessThan(1e-12);
      expect(Math.abs(actual.z - expected.z)).toBeLessThan(1e-12);
    },
  );
});

describe("scan ordering and bounds (FOUND-12/13 edge)", () => {
  // A player far from the entities, so the small ranges below see only them.
  const farPlayer = (): FlightState =>
    inFlight({ position: vec(4e8, 4e8, 4e8) });
  const origin = vec(1_000_000, 0, 0);

  function at(offset: Vec3): Vec3 {
    return vec(origin.x + offset.x, origin.y + offset.y, origin.z + offset.z);
  }

  it("orders by distance and then ascending id", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: origin });
    const far = spawnOk(world, { position: at(vec(300, 0, 0)) });
    const tieA = spawnOk(world, { position: at(vec(0, 100, 0)) });
    const tieB = spawnOk(world, { position: at(vec(100, 0, 0)) });
    const tieC = spawnOk(world, { position: at(vec(0, 0, -100)) });
    const view = createWorldView(world, farPlayer(), layout);

    expect(view.scan(self.id, 1000)).toEqual([
      tieA.id,
      tieB.id,
      tieC.id,
      far.id,
    ]);
  });

  it("breaks a tie between the player and an entity by id", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: origin });
    const e = spawnOk(world, { position: at(vec(100, 0, 0)) });
    const view = createWorldView(
      world,
      inFlight({ position: at(vec(0, 100, 0)) }),
      layout,
    );
    expect(view.scan(self.id, 1000)).toEqual([PLAYER_ID, e.id]);
  });

  it("includes an entity exactly at range and excludes one at range plus 1e-6", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: origin });
    const exact = spawnOk(world, { position: at(vec(100, 0, 0)) });
    spawnOk(world, { position: at(vec(0, 100.000001, 0)) });
    const view = createWorldView(world, farPlayer(), layout);
    expect(view.scan(self.id, 100)).toEqual([exact.id]);
  });

  it("range 0 returns only bodies at exactly self's position, never self", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: origin });
    spawnOk(world, { position: at(vec(1, 0, 0)) });
    const view = createWorldView(world, farPlayer(), layout);
    expect(view.scan(self.id, 0)).toEqual([]);

    const twin = spawnOk(world, { position: origin });
    expect(view.scan(self.id, 0)).toEqual([twin.id]);
  });

  it("returns [] for NaN, Infinity and negative ranges and for an invalid self", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: origin });
    spawnOk(world, { position: at(vec(10, 0, 0)) });
    const dead = spawnOk(world, { position: at(vec(20, 0, 0)) });
    killEntity(world, dead.id);
    const view = createWorldView(world, farPlayer(), layout);

    expect(view.scan(self.id, 1000).length).toBe(1);
    for (const range of [Number.NaN, Number.POSITIVE_INFINITY, -1]) {
      expect(view.scan(self.id, range), `range ${String(range)}`).toEqual([]);
    }
    for (const invalid of [NO_ENTITY, 6, 99999, dead.id, Number.NaN]) {
      expect(view.scan(invalid, 1e13), `self ${String(invalid)}`).toEqual([]);
    }
  });

  it("never contains self and never lists a killed entity", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: origin });
    const dead = spawnOk(world, { position: at(vec(10, 0, 0)) });
    const live = spawnOk(world, { position: at(vec(20, 0, 0)) });
    killEntity(world, dead.id);
    const view = createWorldView(world, farPlayer(), layout);
    const hits = view.scan(self.id, 1000);
    expect(hits).not.toContain(self.id);
    expect(hits).not.toContain(dead.id);
    expect(hits).toEqual([live.id]);
  });

  it("a kinds filter keeps only those kinds", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: origin });
    const cargo = spawnOk(world, {
      kind: "cargo",
      scanClass: "CLASS_CARGO",
      position: at(vec(10, 0, 0)),
    });
    const ship = spawnOk(world, { position: at(vec(20, 0, 0)) });
    const view = createWorldView(world, farPlayer(), layout);

    expect(view.scan(self.id, 1000, { kinds: ["cargo"] })).toEqual([cargo.id]);
    expect(view.scan(self.id, 1000, { kinds: ["ship"] })).toEqual([ship.id]);
    expect(view.scan(self.id, 1e13, { kinds: ["player"] })).toEqual([
      PLAYER_ID,
    ]);
    expect(view.scan(self.id, 1000, { kinds: [] })).toEqual([]);
    expect(view.scan(self.id, 1000, {})).toEqual([cargo.id, ship.id]);
  });

  it("a wide scan lists statics, the player and entities in an independently computed order", () => {
    const world = createWorld(1);
    const self = spawnOk(world, { position: vec(0, 0, -1000) });
    const e2 = spawnOk(world, { position: vec(3000, 0, -1000) });
    const player = inFlight({ position: vec(0, 500, -1000) });
    const view = createWorldView(world, player, layout);

    const origin3 = vec(0, 0, -1000);
    const candidates: { id: EntityId; position: Vec3 }[] = [
      { id: PLANET_ID, position: layout.planet.position },
      { id: SUN_ID, position: layout.sun.position },
      { id: MAIN_STATION_ID, position: layout.station.position },
      { id: WITCHPOINT_BUOY_ID, position: layout.witchpoint.position },
      { id: STATION_NAV_BUOY_ID, position: layout.navBuoy.position },
      { id: PLAYER_ID, position: player.position },
      { id: e2.id, position: e2.position },
    ];
    const expected = candidates
      .map((c) => ({ id: c.id, d: distanceSquared(origin3, c.position) }))
      .sort((a, b) => a.d - b.d || a.id - b.id)
      .map((c) => c.id);

    expect(view.scan(self.id, 1e13)).toEqual(expected);
    // The same scan seen from a static body or from the player works too.
    expect(view.scan(MAIN_STATION_ID, 1e13)).not.toContain(MAIN_STATION_ID);
    expect(view.scan(PLAYER_ID, 1e13)).not.toContain(PLAYER_ID);
    expect(view.scan(PLAYER_ID, 1e13)).toContain(self.id);
  });
});

describe("the world holds no player (G-8)", () => {
  it("a view keeps the object it was created with; a new view reads the replacement", () => {
    const world = createWorld(1);
    const first = inFlight({ tick: 10, position: vec(1, 2, 3), speed: 4 });
    const second = inFlight({ tick: 99, position: vec(7, 8, 9), speed: 5 });
    const before = createWorldView(world, first, layout);
    const after = createWorldView(world, second, layout);

    expect(before.tick).toBe(10);
    expect(before.body(PLAYER_ID)?.position).toEqual(vec(1, 2, 3));
    expect(before.body(PLAYER_ID)?.speed).toBe(4);
    expect(after.tick).toBe(99);
    expect(after.body(PLAYER_ID)?.position).toEqual(vec(7, 8, 9));
    expect(after.body(PLAYER_ID)?.speed).toBe(5);
  });

  it("a view reads the live player each call", () => {
    const world = createWorld(1);
    const player = inFlight({ position: vec(1, 2, 3) });
    const view = createWorldView(world, player, layout);
    player.position = vec(4, 5, 6);
    expect(view.body(PLAYER_ID)?.position).toEqual(vec(4, 5, 6));
  });
});

describe("per-world ids (CONTEXT D-06 as amended 2026-11-12)", () => {
  it("a fresh world does not see another world's id 101, and cannot be written through it", () => {
    const a = createWorld(1);
    const b = createWorld(1);
    const entity = spawnOk(a);
    expect(entity.id).toBe(101);
    const player = inFlight();
    const viewA = createWorldView(a, player, layout);
    const viewB = createWorldView(b, player, layout);

    expect(viewA.isValid(101)).toBe(true);
    expect(viewB.isValid(101)).toBe(false);
    expect(viewB.body(101)).toBeUndefined();
    expect(viewB.ship(101)).toBeUndefined();

    const before = structuredClone(entity);
    createShipControl(b, 101, 5).setDesiredSpeed(101, 50);
    expect(entity).toEqual(before);
    expect(viewA.ship(101)?.desiredSpeed).toBe(7);

    for (const view of [viewA, viewB]) {
      for (const id of [1, 2, 3, 4, 5, PLAYER_ID]) {
        expect(view.isValid(id)).toBe(true);
      }
    }
  });
});

describe("the buoys in the view (Phase 18, PD-06)", () => {
  it("a pristine nav buoy is the layout body, the same position numbers", () => {
    const world = createWorld(7);
    const view = createWorldView(world, inFlight(), layout);
    expect(view.body(STATION_NAV_BUOY_ID)?.position).toEqual(
      layout.navBuoy.position,
    );
    expect(view.body(STATION_NAV_BUOY_ID)?.radius).toBe(layout.navBuoy.radius);
  });

  it("an offset nav buoy is reported at the layout position plus its offset", () => {
    const world = createWorld(7);
    world.buoys.navBuoy.offset = vec(3, 0, 0);
    const view = createWorldView(world, inFlight(), layout);
    const base = layout.navBuoy.position;
    expect(view.body(STATION_NAV_BUOY_ID)?.position).toEqual(
      vec(base.x + 3, base.y, base.z),
    );
    // the witchpoint beacon and the station are not affected
    expect(view.body(WITCHPOINT_BUOY_ID)?.position).toEqual(
      layout.witchpoint.position,
    );
    expect(view.body(MAIN_STATION_ID)?.position).toEqual(
      layout.station.position,
    );
  });

  it("a destroyed nav buoy is gone: no body, not valid, not scanned", () => {
    const world = createWorld(7);
    const a = spawnOk(world, { position: layout.navBuoy.position });
    world.staticHealth.navBuoy = 0;
    const view = createWorldView(world, inFlight(), layout);
    expect(view.body(STATION_NAV_BUOY_ID)).toBeUndefined();
    expect(view.isValid(STATION_NAV_BUOY_ID)).toBe(false);
    expect(view.scan(a.id, 1e13)).not.toContain(STATION_NAV_BUOY_ID);
    expect(view.scan(STATION_NAV_BUOY_ID, 1e13)).toEqual([]);
    // the station and the witchpoint beacon stay
    expect(view.isValid(MAIN_STATION_ID)).toBe(true);
    expect(view.isValid(WITCHPOINT_BUOY_ID)).toBe(true);
    expect(view.scan(a.id, 1e13)).toContain(WITCHPOINT_BUOY_ID);
  });

  it("a destroyed witchpoint beacon is gone and the nav buoy stays", () => {
    const world = createWorld(7);
    world.staticHealth.witchpoint = 0;
    const view = createWorldView(world, inFlight(), layout);
    expect(view.body(WITCHPOINT_BUOY_ID)).toBeUndefined();
    expect(view.isValid(WITCHPOINT_BUOY_ID)).toBe(false);
    expect(view.body(STATION_NAV_BUOY_ID)?.position).toEqual(
      layout.navBuoy.position,
    );
  });
});

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The read side of the AI seam (FOUND-13, D-06, D-07; plan 08-07). Expected
 * values come from the layout, the player pose and the rules of the plan, never
 * from running the implementation.
 */

import { describe, expect, it } from "vitest";

import { initFlightState } from "../../../src/sim/flight/state.js";
import type { FlightState } from "../../../src/sim/flight/state.js";
import { identity, vec } from "../../../src/sim/math.js";
import type { SpawnInit } from "../../../src/sim/world/entity.js";
import { createShipControl } from "../../../src/sim/world/control-impl.js";
import {
  MAIN_STATION_ID,
  PLANET_ID,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  SUN_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { createWorldView } from "../../../src/sim/world/view-impl.js";
import { createWorld, spawnEntity } from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

function inFlight(): FlightState {
  const state = initFlightState(layout);
  state.mode = "inFlight";
  state.tick = 42;
  state.position = vec(1000, 2000, -3000);
  state.speed = 123;
  return state;
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
  const entity = spawnEntity(world, shipInit(overrides), 0);
  if (entity === undefined) throw new Error("spawn refused");
  return entity;
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

    // Player at (1000, 2000, -3000) is farther from A than B is (4000+ vs 100).
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

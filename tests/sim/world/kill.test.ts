// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * `killShip`, the one idempotent kill path (FOUND-19, D-02, D-04, D-13).
 *
 * In plan 15-04 `killShip` posts no AI event, so these cases need no drain;
 * plan 15-05 extends this file with the notification cases.
 */

import { describe, expect, it } from "vitest";

import type { SimEvent } from "../../../src/sim/events.js";
import { identity, vec } from "../../../src/sim/math.js";
import {
  MAIN_STATION_ID,
  NO_ENTITY,
  PLAYER_ID,
  STATION_NAV_BUOY_ID,
  WITCHPOINT_BUOY_ID,
} from "../../../src/sim/world/ids.js";
import { killShip } from "../../../src/sim/world/kill.js";
import { hashWorld } from "../../../src/sim/world/serialize.js";
import {
  commitWorld,
  createWorld,
  spawnEntity,
} from "../../../src/sim/world/world.js";
import type { World } from "../../../src/sim/world/world.js";
import { initFlightState } from "../../../src/sim/flight/state.js";
import { laveFixture } from "../../helpers/lave.js";

const { layout } = laveFixture();

function spawn(world: World, kind: "ship" | "cargo" | "wreckage"): number {
  const result = spawnEntity(
    world,
    {
      kind,
      specKey: kind === "ship" ? "adder" : "debris",
      scanClass: "CLASS_NEUTRAL",
      position: vec(100, 200, 300),
      orientation: identity(),
      radius: 30,
      maxEnergy: 85,
    },
    0,
  );
  if (!result.ok) throw new Error(`spawn refused: ${result.reason}`);
  return result.entity.id;
}

function destroyed(
  events: readonly SimEvent[],
): Extract<SimEvent, { kind: "shipDestroyed" }>[] {
  return events.filter(
    (event): event is Extract<SimEvent, { kind: "shipDestroyed" }> =>
      event.kind === "shipDestroyed",
  );
}

function worldHash(world: World): string {
  return hashWorld(initFlightState(layout), world);
}

describe("killShip", () => {
  it("returns true once and false on the second call, with one shipDestroyed and one entityRemoved", () => {
    const world = createWorld(1);
    const id = spawn(world, "ship");
    const events: SimEvent[] = [];
    expect(killShip(world, id, PLAYER_ID, events)).toBe(true);
    expect(killShip(world, id, PLAYER_ID, events)).toBe(false);
    expect(destroyed(events)).toEqual([
      {
        kind: "shipDestroyed",
        id,
        position: { x: 100, y: 200, z: 300 },
        radius: 30,
        specKey: "adder",
        killer: PLAYER_ID,
      },
    ]);
    expect(world.store.get(id)).toBeUndefined();
    expect(commitWorld(world)).toEqual([id]);
    expect(commitWorld(world)).toEqual([]);
  });

  it("copies the position, so the event does not alias the entity", () => {
    const world = createWorld(1);
    const id = spawn(world, "ship");
    const entity = world.store.get(id);
    const events: SimEvent[] = [];
    killShip(world, id, PLAYER_ID, events);
    const [event] = destroyed(events);
    expect(event?.position).not.toBe(entity?.position);
  });

  it("marks a cargo or wreckage entity dead with no shipDestroyed", () => {
    const world = createWorld(1);
    const cargo = spawn(world, "cargo");
    const wreck = spawn(world, "wreckage");
    const events: SimEvent[] = [];
    expect(killShip(world, cargo, PLAYER_ID, events)).toBe(true);
    expect(killShip(world, wreck, PLAYER_ID, events)).toBe(true);
    expect(events).toEqual([]);
    expect(commitWorld(world)).toEqual([cargo, wreck]);
  });

  it.each([
    ["a missing id", 9999],
    ["NaN", Number.NaN],
    ["1.5", 1.5],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["the station", MAIN_STATION_ID],
    ["the witchpoint buoy", WITCHPOINT_BUOY_ID],
    ["the station buoy", STATION_NAV_BUOY_ID],
    ["the player", PLAYER_ID],
    ["NO_ENTITY", NO_ENTITY],
    ["a negative id", -1],
  ])("returns false for %s and leaves the world hash unchanged", (_, id) => {
    const world = createWorld(1);
    spawn(world, "ship");
    const before = worldHash(world);
    const events: SimEvent[] = [];
    expect(killShip(world, id, PLAYER_ID, events)).toBe(false);
    expect(events).toEqual([]);
    expect(worldHash(world)).toBe(before);
  });

  describe("the killer payload (D-04)", () => {
    function killerOf(
      killer: (world: World, victim: number) => number,
    ): number {
      const world = createWorld(1);
      const victim = spawn(world, "ship");
      const events: SimEvent[] = [];
      killShip(world, victim, killer(world, victim), events);
      const [event] = destroyed(events);
      if (event === undefined) throw new Error("no shipDestroyed");
      return event.killer;
    }

    it("keeps PLAYER_ID", () => {
      expect(killerOf(() => PLAYER_ID)).toBe(PLAYER_ID);
    });

    it("keeps a live ship", () => {
      let live = -1;
      const killer = killerOf((world) => {
        live = spawn(world, "ship");
        return live;
      });
      expect(killer).toBe(live);
    });

    it("records NO_ENTITY for NO_ENTITY, a missing id, a dead ship, the victim itself and a non-integer", () => {
      expect(killerOf(() => NO_ENTITY)).toBe(NO_ENTITY);
      expect(killerOf(() => 9999)).toBe(NO_ENTITY);
      expect(
        killerOf((world) => {
          const dead = spawn(world, "ship");
          world.store.kill(dead);
          return dead;
        }),
      ).toBe(NO_ENTITY);
      expect(killerOf((_, victim) => victim)).toBe(NO_ENTITY);
      expect(killerOf(() => 1.5)).toBe(NO_ENTITY);
      expect(killerOf(() => Number.NaN)).toBe(NO_ENTITY);
      expect(killerOf(() => -3)).toBe(NO_ENTITY);
      expect(killerOf(() => 2 ** 40)).toBe(NO_ENTITY);
    });

    it("records NO_ENTITY for a non-ship killer", () => {
      expect(killerOf((world) => spawn(world, "cargo"))).toBe(NO_ENTITY);
    });
  });

  describe("a same-tick mutual kill", () => {
    function mutual(order: "lowFirst" | "highFirst"): {
      low: number;
      high: number;
      killers: Map<number, number>;
    } {
      const world = createWorld(1);
      const low = spawn(world, "ship");
      const high = spawn(world, "ship");
      expect(low).toBeLessThan(high);
      const events: SimEvent[] = [];
      if (order === "lowFirst") {
        killShip(world, low, high, events);
        killShip(world, high, low, events);
      } else {
        killShip(world, high, low, events);
        killShip(world, low, high, events);
      }
      const killers = new Map(destroyed(events).map((e) => [e.id, e.killer]));
      return { low, high, killers };
    }

    it("credits the lower-id victim to the other ship and the higher-id victim NO_ENTITY when resolved in ascending victim id", () => {
      const { low, high, killers } = mutual("lowFirst");
      expect(killers.get(low)).toBe(high);
      expect(killers.get(high)).toBe(NO_ENTITY);
    });

    it("mirrors when the calls are made in the opposite order: the rule is 'killer alive at the call'", () => {
      const { low, high, killers } = mutual("highFirst");
      expect(killers.get(high)).toBe(low);
      expect(killers.get(low)).toBe(NO_ENTITY);
    });
  });
});

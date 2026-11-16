// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The session's traffic content and populate closure (plan 12-08; WORLD-15,
 * D-01). Node only. Expected values come from the committed NPC records and the
 * decisions (twelve ships, ids 101 to 112, no draw and no id burned without
 * traffic), not from running the code under test twice.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  createInertPopulate,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import type { TrafficContent } from "../../../src/app/session/traffic.js";
import type { NpcShip } from "../../../src/content/types.js";
import { flightTableFrom } from "../../../src/sim/npc/stats.js";
import { liveEntityCount, createWorld } from "../../../src/sim/world/world.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();
const WORLD_SEED = 0x2b4e037c;

function catalogue(): NpcShip[] {
  return JSON.parse(
    readFileSync("src/content/generated/ships-npc.json", "utf8"),
  ) as NpcShip[];
}

describe("trafficContent", () => {
  it("maps the nine committed records to records and masses in catalogue order", () => {
    const source = catalogue();
    expect(source).toHaveLength(9);
    const content = trafficContent(source);
    expect(content.records).toHaveLength(9);
    expect(content.masses).toHaveLength(9);
    source.forEach((ship, index) => {
      expect(content.records[index]).toEqual({
        key: ship.key,
        roles: ship.roles,
        scanClass: ship.scanClass,
        radius: ship.radius,
        maxEnergy: ship.maxEnergy,
        energyRechargeRate: ship.energyRechargeRate,
        likelyCargo: ship.likelyCargo,
        maxCargo: ship.maxCargo,
      });
      expect(content.masses[index]).toEqual({
        specKey: ship.key,
        mass: ship.mass,
      });
    });
  });

  it("builds the flight table with flightTableFrom, one row per catalogue ship (plan 14-18)", () => {
    const source = catalogue();
    const content = trafficContent(source);
    expect(content.flight).toHaveLength(9);
    // One builder: the table equals the sim's own, not a second mapping.
    expect(content.flight).toEqual(flightTableFrom(source));
    source.forEach((ship, index) => {
      expect(content.flight[index]).toMatchObject({
        specKey: ship.key,
        maxFlightSpeed: ship.maxFlightSpeed,
        maxFlightRoll: ship.maxFlightRoll,
        maxFlightPitch: ship.maxFlightPitch,
        thrust: ship.thrust,
        mass: ship.mass,
      });
    });
    expect(Object.isFrozen(content.flight)).toBe(true);
  });

  it("copies the scan class as the catalogue's own string and freezes the arrays", () => {
    const content = trafficContent(catalogue());
    expect(content.records.map((record) => record.scanClass)).toEqual(
      catalogue().map((ship) => ship.scanClass),
    );
    expect(Object.isFrozen(content.catalogue)).toBe(true);
    expect(Object.isFrozen(content.records)).toBe(true);
    expect(Object.isFrozen(content.masses)).toBe(true);
  });
});

describe("createInertPopulate", () => {
  const content = trafficContent(catalogue());

  it("populates twelve inert ships at ids 101 to 112 with traffic on", () => {
    const world = createWorld(WORLD_SEED);
    createInertPopulate(
      () => content,
      () => lave.layout,
    )(world, { traffic: true });
    expect(liveEntityCount(world)).toBe(12);
    expect(world.store.nextId).toBe(113);
  });

  it("adds nothing, draws nothing and burns no id with traffic off", () => {
    const world = createWorld(WORLD_SEED);
    const before = world.rng.s;
    createInertPopulate(
      () => content,
      () => lave.layout,
    )(world, { traffic: false });
    expect(liveEntityCount(world)).toBe(0);
    expect(world.store.nextId).toBe(101);
    expect(world.rng.s).toBe(before);
  });

  it("adds nothing when the content or the layout is not there yet", () => {
    const noContent = createWorld(WORLD_SEED);
    const before = noContent.rng.s;
    createInertPopulate(
      () => undefined,
      () => lave.layout,
    )(noContent, { traffic: true });
    expect(liveEntityCount(noContent)).toBe(0);
    expect(noContent.rng.s).toBe(before);

    const noLayout = createWorld(WORLD_SEED);
    createInertPopulate(
      () => content,
      () => undefined,
    )(noLayout, { traffic: true });
    expect(liveEntityCount(noLayout)).toBe(0);
    expect(noLayout.rng.s).toBe(before);
  });

  it("reads both getters at call time", () => {
    const held: { current: TrafficContent | undefined } = {
      current: undefined,
    };
    const populate = createInertPopulate(
      () => held.current,
      () => lave.layout,
    );
    const early = createWorld(WORLD_SEED);
    populate(early, { traffic: true });
    expect(liveEntityCount(early)).toBe(0);
    held.current = content;
    const late = createWorld(WORLD_SEED);
    populate(late, { traffic: true });
    expect(liveEntityCount(late)).toBe(12);
  });

  it("drops a record with an unknown scan class and still populates the same twelve", () => {
    const bogus: NpcShip = {
      ...catalogue()[0]!,
      key: "bogus",
      scanClass: "CLASS_BOGUS",
    };
    const withBogus = trafficContent([...catalogue(), bogus]);
    const plain = createWorld(WORLD_SEED);
    createInertPopulate(
      () => content,
      () => lave.layout,
    )(plain, { traffic: true });
    const mixed = createWorld(WORLD_SEED);
    expect(() => {
      createInertPopulate(
        () => withBogus,
        () => lave.layout,
      )(mixed, { traffic: true });
    }).not.toThrow();
    expect(liveEntityCount(mixed)).toBe(12);
    expect(mixed.rng.s).toBe(plain.rng.s);
  });
});

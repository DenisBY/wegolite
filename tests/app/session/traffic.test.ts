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
  DEFAULT_SHIP_EXPLOSION_KEY,
  createInertPopulate,
  debrisContentFrom,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import type { TrafficContent } from "../../../src/app/session/traffic.js";
import {
  DEFAULT_EXPLOSION_KEY,
  ExplosionCatalogueSchema,
} from "../../../src/content/schemas/explosion.js";
import { DebrisCatalogueSchema } from "../../../src/content/schemas/ship-debris.js";
import type {
  DebrisRecord,
  ExplosionRecord,
  NpcShip,
} from "../../../src/content/types.js";
import { flightTableFrom } from "../../../src/sim/npc/stats.js";
import { liveEntityCount, createWorld } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
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

function debrisRecords(): DebrisRecord[] {
  return DebrisCatalogueSchema.parse(
    JSON.parse(readFileSync("src/content/generated/ships-debris.json", "utf8")),
  );
}

function explosionRecords(): ExplosionRecord[] {
  return ExplosionCatalogueSchema.parse(
    JSON.parse(readFileSync("src/content/generated/explosions.json", "utf8")),
  );
}

describe("debrisContentFrom (plan 16-06, WORLD-17)", () => {
  it("maps the nine hulls with their boxes, the pod, the plate and five wrecks in catalogue order", () => {
    const source = catalogue();
    const records = debrisRecords();
    const content = debrisContentFrom(source, records);
    if (content === undefined) throw new Error("no debris content");
    expect(content.hulls).toBeInstanceOf(Map);
    expect(content.hulls.size).toBe(9);
    for (const ship of source) {
      const [minX, minY, minZ] = ship.boundingBox.min;
      const [maxX, maxY, maxZ] = ship.boundingBox.max;
      expect(content.hulls.get(ship.key)).toEqual({
        mass: ship.mass,
        fragmentChance: ship.fragmentChance,
        boundingBox: {
          min: { x: minX, y: minY, z: minZ },
          max: { x: maxX, y: maxY, z: maxZ },
        },
      });
    }
    expect(content.pod.key).toBe("barrel");
    expect(content.plate.key).toBe("alloy");
    expect(content.wrecks.map((wreck) => wreck.key)).toEqual([
      "wreckage-component",
      "more-wreckage2",
      "more-wreckage3",
      "more-wreckage4",
      "more-wreckage5",
    ]);
    expect(content.wrecks.map((wreck) => wreck.key)).toEqual(
      records
        .filter((record) => record.role === "wreck")
        .map((record) => record.key),
    );
  });

  it("keeps the sim tests' fixture representative: masses and radii within 0.01", () => {
    const content = debrisContentFrom(catalogue(), debrisRecords());
    if (content === undefined) throw new Error("no debris content");
    const fixture = debrisFixture();
    const pairs = [
      [content.pod, fixture.pod],
      [content.plate, fixture.plate],
      ...content.wrecks.map((wreck, index) => [wreck, fixture.wrecks[index]]),
    ] as const;
    expect(content.wrecks).toHaveLength(fixture.wrecks.length);
    for (const [compiled, research] of pairs) {
      if (compiled === undefined || research === undefined) {
        throw new Error("fixture too short");
      }
      expect(compiled.key).toBe(research.key);
      expect(Math.abs(compiled.mass - research.mass)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(compiled.radius - research.radius)).toBeLessThanOrEqual(
        0.01,
      );
    }
  });

  it("returns undefined for a catalogue without a pod or without a plate", () => {
    const records = debrisRecords();
    expect(
      debrisContentFrom(
        catalogue(),
        records.filter((record) => record.role !== "pod"),
      ),
    ).toBeUndefined();
    expect(
      debrisContentFrom(
        catalogue(),
        records.filter((record) => record.role !== "plate"),
      ),
    ).toBeUndefined();
  });
});

describe("trafficContent with the debris and explosion catalogues (plan 16-06)", () => {
  it("adds debris, debrisModels and the default explosion, leaving every other field unchanged", () => {
    const source = catalogue();
    const records = debrisRecords();
    const explosions = explosionRecords();
    const plain = trafficContent(source);
    const full = trafficContent(source, { debris: records, explosions });
    expect(full.debris).toEqual(debrisContentFrom(source, records));
    expect(full.debrisModels).toEqual(records);
    expect(full.explosion?.key).toBe("oolite-default-ship-explosion");
    expect(full.records).toEqual(plain.records);
    expect(full.masses).toEqual(plain.masses);
    expect(full.flight).toEqual(plain.flight);
    expect(full.weapons).toEqual(plain.weapons);
    expect(Object.isFrozen(full)).toBe(true);
  });

  it("omits each key whose source is absent", () => {
    const plain = trafficContent(catalogue());
    expect("debris" in plain).toBe(false);
    expect("debrisModels" in plain).toBe(false);
    expect("explosion" in plain).toBe(false);
    const debrisOnly = trafficContent(catalogue(), { debris: debrisRecords() });
    expect(debrisOnly.debris).toBeDefined();
    expect("explosion" in debrisOnly).toBe(false);
    const explosionsOnly = trafficContent(catalogue(), {
      explosions: explosionRecords(),
    });
    expect("debris" in explosionsOnly).toBe(false);
    expect("debrisModels" in explosionsOnly).toBe(false);
    expect(explosionsOnly.explosion).toBeDefined();
  });

  it("restates the schema's default explosion key", () => {
    expect(DEFAULT_SHIP_EXPLOSION_KEY).toBe(DEFAULT_EXPLOSION_KEY);
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

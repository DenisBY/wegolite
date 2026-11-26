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
  hullTable,
  trafficContent,
} from "../../../src/app/session/traffic.js";
import type { TrafficContent } from "../../../src/app/session/traffic.js";
import {
  DEFAULT_EXPLOSION_KEY,
  ExplosionCatalogueSchema,
} from "../../../src/content/schemas/explosion.js";
import { DebrisCatalogueSchema } from "../../../src/content/schemas/ship-debris.js";
import type { StaticHullArtifact } from "../../../src/content/schemas/ship-static-hull.js";
import type {
  DebrisRecord,
  ExplosionRecord,
  NpcShip,
  ShipHullCatalogue,
} from "../../../src/content/types.js";
import { flightTableFrom } from "../../../src/sim/npc/stats.js";
import { liveEntityCount, createWorld } from "../../../src/sim/world/world.js";
import { debrisFixture } from "../../helpers/debris-fixture.js";
import { fullHullTable, realHullTable } from "../../helpers/hull-table.js";
import { commoditiesFixture } from "../../helpers/commodities.js";
import { laveFixture } from "../../helpers/lave.js";

const lave = laveFixture();
const WORLD_SEED = 0x2b4e037c;

function catalogue(): NpcShip[] {
  return JSON.parse(
    readFileSync("src/content/generated/ships-npc.json", "utf8"),
  ) as NpcShip[];
}

describe("trafficContent", () => {
  it("maps the authored laser colour by spec key: the three Viper variants only (quick 261119-i9g, plan 21-08)", () => {
    const content = trafficContent(catalogue());
    expect([...content.laserColors.entries()]).toEqual([
      ["viper", [1, 0, 1]],
      ["viper-interceptor", [1, 0, 1]],
      ["viper-pursuit", [1, 0, 1]],
    ]);
  });

  it("maps the 29 committed records to records and masses in catalogue order", () => {
    const source = catalogue();
    expect(source).toHaveLength(29);
    const content = trafficContent(source);
    expect(content.records).toHaveLength(29);
    expect(content.masses).toHaveLength(29);
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
    expect(content.flight).toHaveLength(29);
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

  it("builds the per-facing weapon map: fore always, aft only for the six aft-armed hulls, never port or starboard (plan 21-12)", () => {
    const source = catalogue();
    const content = trafficContent(source);
    expect(content.weapons.size).toBe(29);
    const aftArmed: string[] = [];
    for (const ship of source) {
      const weapons = content.weapons.get(ship.key);
      expect(weapons?.fore).toEqual({
        laser: ship.forwardWeapon,
        offset: {
          x: ship.forwardWeaponPosition[0],
          y: ship.forwardWeaponPosition[1],
          z: ship.forwardWeaponPosition[2],
        },
      });
      expect(weapons?.port).toBeUndefined();
      expect(weapons?.starboard).toBeUndefined();
      if (weapons?.aft !== undefined) {
        aftArmed.push(ship.key);
        expect(weapons.aft.laser).toBe(ship.aftWeapon);
        expect(weapons.aft.laser).not.toBe("EQ_WEAPON_NONE");
      } else {
        expect(ship.aftWeapon).toBe("EQ_WEAPON_NONE");
      }
    }
    expect(aftArmed.sort()).toEqual([
      "anaconda",
      "anaconda-pirate",
      "boa",
      "boa-mk2",
      "boa-mk2-pirate",
      "boa-pirate",
    ]);
    // The adder is forward-only.
    expect(Object.keys(content.weapons.get("adder") ?? {})).toEqual(["fore"]);
    expect(Object.keys(content.weapons.get("anaconda") ?? {})).toEqual([
      "fore",
      "aft",
    ]);
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
  it("maps the 29 hulls with their boxes, the pod, the plate and five wrecks in catalogue order", () => {
    const source = catalogue();
    const records = debrisRecords();
    const content = debrisContentFrom(source, records);
    if (content === undefined) throw new Error("no debris content");
    expect(content.hulls).toBeInstanceOf(Map);
    expect(content.hulls.size).toBe(29);
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

  it("sets goods to the commodity catalogue in catalogue order when it is given, and no goods key otherwise (plan 21-15, CBT-11 pod clause)", () => {
    const commodities = commoditiesFixture();
    const withGoods = debrisContentFrom(
      catalogue(),
      debrisRecords(),
      commodities,
    );
    if (withGoods === undefined) throw new Error("no debris content");
    expect(withGoods.goods).toEqual(commodities);
    expect(withGoods.goods?.map((good) => good.key)).toEqual(
      commodities.map((good) => good.key),
    );
    // The pod draw's market is the step builder's, never this one's.
    expect(withGoods).not.toHaveProperty("market");
    const plain = debrisContentFrom(catalogue(), debrisRecords());
    if (plain === undefined) throw new Error("no debris content");
    expect(plain).not.toHaveProperty("goods");
    expect({ ...withGoods, goods: undefined }).toEqual({
      ...plain,
      goods: undefined,
    });
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

  it("carries the commodity catalogue into the debris goods, and none without it (plan 21-15)", () => {
    const commodities = commoditiesFixture();
    const source = catalogue();
    const records = debrisRecords();
    const full = trafficContent(source, { debris: records, commodities });
    expect(full.debris?.goods).toEqual(commodities);
    expect(full.debris).toEqual(
      debrisContentFrom(source, records, commodities),
    );
    expect(
      trafficContent(source, { debris: records }).debris,
    ).not.toHaveProperty("goods");
    // Commodities without a debris catalogue add nothing.
    expect(trafficContent(source, { commodities }).debris).toBeUndefined();
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

/**
 * The merged hull table (plan 18-13, DATA-15): the ship hulls (plan 21-08: 19
 * entries, one per model, carrying 30 keys through their aliases) and, with
 * traffic on, the four static hulls of the separate artifact. Expected keys,
 * positions and masses are the committed artifact's (pinned against Oolite in
 * `tests/content/ships-static-hulls.test.ts`), written out here literally.
 */
describe("hullTable with the static hulls (plan 18-13)", () => {
  const ships = JSON.parse(
    readFileSync("src/content/generated/ships-hulls.json", "utf8"),
  ) as ShipHullCatalogue;
  const statics = JSON.parse(
    readFileSync("src/content/generated/ships-static-hulls.json", "utf8"),
  ) as StaticHullArtifact;
  // Entry order, each entry key followed by its aliases (DATA-18).
  const SHIP_KEYS = [
    "oolite_template_cobra3-player",
    "cobra3-alternate",
    "cobra3-pirate",
    "cobra3-trader",
    "adder",
    "anaconda",
    "anaconda-pirate",
    "asp",
    "boa",
    "boa-pirate",
    "boa-mk2",
    "boa-mk2-pirate",
    "cobramk1",
    "cobramk1-alt",
    "ferdelance",
    "gecko",
    "krait",
    "mamba",
    "mamba-escort",
    "moray",
    "morayMED",
    "python",
    "python-blackdog",
    "python-trader",
    "shuttle",
    "sidewinder",
    "sidewinder-escort",
    "viper",
    "viper-pursuit",
    "viper-interceptor",
  ];
  const STATIC_KEYS = ["coriolis-station", "buoy", "barrel", "alloy"];

  it("without statics holds the 30 ship keys on 19 hulls, none with a subentity or frangible key", () => {
    const table = hullTable(ships);
    expect([...table.keys()]).toEqual(SHIP_KEYS);
    expect(new Set(table.values()).size).toBe(19);
    for (const hull of table.values()) {
      expect(Object.keys(hull).sort()).toEqual(["collisionRadius", "octree"]);
    }
  });

  it("with statics holds 34 keys, the statics after the ship keys", () => {
    const table = hullTable(ships, statics.hulls);
    expect([...table.keys()]).toEqual([...SHIP_KEYS, ...STATIC_KEYS]);
    // The ship hulls are unchanged by the merge.
    for (const key of SHIP_KEYS) {
      expect(table.get(key)).toEqual(hullTable(ships).get(key));
    }
  });

  it("gives the station its three subentities at the authored Oolite-axis positions, not frangible", () => {
    const station = hullTable(ships, statics.hulls).get("coriolis-station");
    expect(station?.collisionRadius).toBe(779.3702392578125);
    expect(station?.frangible).toBe(false);
    expect(
      station?.subentities?.map((sub) => [sub.key, sub.position, sub.mass]),
    ).toEqual([
      ["oolite_coriolis_faceplate", { x: 0, y: 0, z: 0 }, 58255096],
      ["oolite_coriolis_tris", { x: 0, y: 0, z: 0 }, 220998576],
      // +z toward the nose in Oolite model axes: no axis conversion.
      ["oolite_coriolis_dock", { x: 0, y: 0, z: 500.2561 }, 7579321],
    ]);
    expect(station?.subentities?.[2]?.octree).toBe(
      statics.hulls[0]?.subentities[2]?.octree,
    );
  });

  it("gives the buoy its one subentity with its compiled mass, frangible", () => {
    const buoy = hullTable(ships, statics.hulls).get("buoy");
    expect(buoy?.frangible).toBe(true);
    expect(buoy?.subentities).toHaveLength(1);
    expect(buoy?.subentities?.[0]?.key).toBe("oolite_buoy_subentity");
    expect(buoy?.subentities?.[0]?.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(buoy?.subentities?.[0]?.mass).toBe(7646.7861328125);
  });

  it("gives the barrel and the plate no subentities, frangible", () => {
    const table = hullTable(ships, statics.hulls);
    for (const key of ["barrel", "alloy"]) {
      expect(table.get(key)?.subentities).toEqual([]);
      expect(table.get(key)?.frangible).toBe(true);
    }
  });

  it("refuses a static key that repeats a ship key, rather than overwrite the ship", () => {
    const [first] = statics.hulls;
    if (first === undefined) throw new Error("no static hull");
    expect(() => hullTable(ships, [{ ...first, key: "adder" }])).toThrow(
      /adder/,
    );
  });

  it("registers an alias with the same HullData object as its entry key (plan 21-04, DATA-18)", () => {
    const [first, second] = ships;
    if (first === undefined || second === undefined) throw new Error("hulls");
    const shared = [
      { ...first, aliases: ["first-alias", "second-alias"] },
      second,
    ];
    const table = hullTable(shared);
    expect(table.get("first-alias")).toBe(table.get(first.key));
    expect(table.get("second-alias")).toBe(table.get(first.key));
    expect(table.get(second.key)).not.toBe(table.get(first.key));
    expect([...table.keys()].slice(0, 4)).toEqual([
      first.key,
      "first-alias",
      "second-alias",
      second.key,
    ]);
  });

  it("refuses an alias that repeats a ship key or another alias, naming the key", () => {
    const [first, second] = ships;
    if (first === undefined || second === undefined) throw new Error("hulls");
    expect(() =>
      hullTable([{ ...first, aliases: [second.key] }, second]),
    ).toThrow(new RegExp(second.key));
    expect(() =>
      hullTable([
        { ...first, aliases: ["dup"] },
        { ...second, aliases: ["dup"] },
      ]),
    ).toThrow(/dup/);
    expect(() => hullTable([{ ...first, aliases: [first.key] }])).toThrow(
      new RegExp(first.key),
    );
  });

  it("refuses a static key that repeats an alias, rather than overwrite the ship", () => {
    const [first] = ships;
    const [staticFirst] = statics.hulls;
    if (first === undefined || staticFirst === undefined) throw new Error("x");
    expect(() =>
      hullTable(
        [{ ...first, aliases: ["shared-alias"] }],
        [{ ...staticFirst, key: "shared-alias" }],
      ),
    ).toThrow(/shared-alias/);
  });

  it("shares one hull object between an alias and its entry key (DATA-18)", () => {
    const table = hullTable(ships);
    const player = table.get("oolite_template_cobra3-player");
    expect(player).toBeDefined();
    for (const alias of [
      "cobra3-alternate",
      "cobra3-pirate",
      "cobra3-trader",
    ]) {
      expect(table.get(alias), alias).toBe(player);
    }
    expect(table.get("morayMED")).toBe(table.get("moray"));
    expect(table.get("viper-interceptor")).not.toBe(table.get("viper"));
  });

  it("is what fullHullTable() builds, entry for entry, and realHullTable() holds the ship keys", () => {
    const merged = hullTable(ships, statics.hulls);
    const full = fullHullTable();
    expect([...full.keys()]).toEqual([...merged.keys()]);
    for (const [key, hull] of merged) expect(full.get(key), key).toEqual(hull);
    expect([...realHullTable().keys()]).toEqual(SHIP_KEYS);
  });
});

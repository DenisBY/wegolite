// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Self-test of the population oracle (Phase 22, plan 22-01).
 *
 * The oracle must be correct before the port exists, so this file proves the
 * recorded fixtures against themselves: every fixture parses with the strict
 * schema, carries the pinned script hash, and satisfies the internal
 * invariants of what Oolite's own `oolite-populator.js` can produce (draw
 * accounting, escort slots, group links, registration and engine order). The
 * fixtures are recorded by `tools/ai-harness/populator-record.ts`, never
 * written by hand; nothing here reads Wegolite code or the Oolite tree.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  decodePopulationFixture,
  encodePopulationFixture,
  PopulationFixtureFileSchema,
  POPULATION_ENTRY_TABLE,
  POPULATION_STARTUP,
} from "./codec.js";
import {
  NeighbourhoodTableSchema,
  POPULATION_DRAW_TAGS,
  POPULATION_ENTRY_NAMES,
  POPULATION_EXACT_DRAW_TAGS,
  POPULATION_OOLITE_PIN,
  POPULATION_SCRIPT_FILE,
  POPULATION_SCRIPT_SHA256,
  POPULATION_UNCOMPARED_DRAW_TAGS,
  PopulationFixtureSchema,
  ShipFactsSchema,
  type NeighbourhoodTable,
  type PopulationFixture,
  type PopulationGroup,
} from "./schema.js";

const FIXTURE_DIR = fileURLToPath(new URL("./fixtures/", import.meta.url));
const TRACER_FILE = "g0-s7-seed1.json";

/** The entries the port cuts: their callbacks are never run (D-09, CONTEXT). */
const CUT_ENTRIES: readonly string[] = [
  "oolite-nav-buoy",
  "oolite-witch-buoy",
  "oolite-route1-asteroids",
  "oolite-route2-asteroids",
  "oolite-offlane-hermit",
  "oolite-hunters-medium-route1",
  "oolite-hunters-medium-route3",
  "oolite-hunters-heavy-route1",
  "oolite-hunters-heavy-route3",
  "oolite-assassins",
  "oolite-thargoid-scouts",
  "oolite-thargoid-strike",
];

function fixtureFiles(): string[] {
  if (!existsSync(FIXTURE_DIR)) {
    return [];
  }
  return readdirSync(FIXTURE_DIR)
    .filter((name) => /^g[0-7]-s\d+-seed\d+\.json$/.test(name))
    .sort();
}

function readJson(name: string): unknown {
  return JSON.parse(readFileSync(`${FIXTURE_DIR}${name}`, "utf8")) as unknown;
}

function load(name: string): PopulationFixture {
  return decodePopulationFixture(readJson(name));
}

/** True when a recorded ship fact names an authored accuracy. */
function anyAuthoredAccuracy(): boolean {
  const name = "ship-facts.json";
  if (!existsSync(`${FIXTURE_DIR}${name}`)) {
    return false;
  }
  return ShipFactsSchema.parse(readJson(name)).ships.some(
    (ship) => ship.accuracy !== null,
  );
}

const FILES = fixtureFiles();

/** The all-2,048 neighbourhood table, recorded with the fixtures. */
let tableCache: NeighbourhoodTable | undefined;
function table(): NeighbourhoodTable {
  tableCache ??= NeighbourhoodTableSchema.parse(
    readJson("neighbourhood-all.json"),
  );
  return tableCache;
}

describe("population oracle: the committed fixtures", () => {
  it("includes the neighbourhood table and the isolated anchor (plan 22-02)", () => {
    expect(existsSync(`${FIXTURE_DIR}neighbourhood-all.json`)).toBe(true);
    expect(FILES).toContain("g7-s162-seed1.json");
  });

  it("includes the tracer fixture: Lave, seed 1", () => {
    expect(FILES).toContain(TRACER_FILE);
  });

  it("parses every fixture with the strict schema", () => {
    expect(FILES.length).toBeGreaterThan(0);
    for (const name of FILES) {
      expect(() => load(name), name).not.toThrow();
    }
  });
});

describe("population oracle: schema strictness", () => {
  /** The raw file JSON of the tracer, deep-copied for mutation. */
  const raw = (): Record<string, unknown> =>
    JSON.parse(JSON.stringify(readJson(TRACER_FILE))) as Record<
      string,
      unknown
    >;
  const groupsOf = (file: Record<string, unknown>): unknown[][] =>
    file.groups as unknown[][];

  it("accepts the untouched tracer file (non-vacuity of the refusals below)", () => {
    expect(PopulationFixtureFileSchema.safeParse(raw()).success).toBe(true);
    expect(() => decodePopulationFixture(raw())).not.toThrow();
  });

  it("refuses an unknown top-level key", () => {
    expect(
      PopulationFixtureFileSchema.safeParse({ ...raw(), extra: 1 }).success,
    ).toBe(false);
  });

  it("refuses a ship, a call, a group and an inputs object with an extra member", () => {
    const withShip = raw();
    (groupsOf(withShip)[0]?.[5] as unknown[][])[0]?.push(0);
    expect(PopulationFixtureFileSchema.safeParse(withShip).success).toBe(false);

    const withCall = raw();
    (groupsOf(withCall)[0]?.[4] as unknown[][])[0]?.push(0);
    expect(PopulationFixtureFileSchema.safeParse(withCall).success).toBe(false);

    const withGroup = raw();
    groupsOf(withGroup)[0]?.push(0);
    expect(PopulationFixtureFileSchema.safeParse(withGroup).success).toBe(
      false,
    );

    const withInputs = raw();
    withInputs.inputs = {
      ...(withInputs.inputs as Record<string, unknown>),
      extra: 1,
    };
    expect(PopulationFixtureFileSchema.safeParse(withInputs).success).toBe(
      false,
    );
  });

  it("refuses a draw tag outside the closed list and a draw that is not a base-36 u32", () => {
    const badTag = raw();
    const draws = groupsOf(badTag)[0]?.[3] as Record<string, string>;
    draws.unknown = "0000001";
    expect(PopulationFixtureFileSchema.safeParse(badTag).success).toBe(false);

    const shortDraw = raw();
    (groupsOf(shortDraw)[0]?.[3] as Record<string, string>).body = "abc";
    expect(PopulationFixtureFileSchema.safeParse(shortDraw).success).toBe(
      false,
    );

    const tooBig = raw();
    (groupsOf(tooBig)[0]?.[3] as Record<string, string>).body = "zzzzzzz";
    expect(() => decodePopulationFixture(tooBig)).toThrow();
  });

  it("refuses a dictionary index outside the dictionary", () => {
    const file = raw();
    ((groupsOf(file)[0]?.[5] as unknown[][])[0] as unknown[])[0] = 999999;
    expect(() => decodePopulationFixture(file)).toThrow();
  });

  it("decodes the constants of the script and nothing the file does not hold", () => {
    const fixture = load(TRACER_FILE);
    expect(fixture.header).toEqual({
      oolitePin: POPULATION_OOLITE_PIN,
      scriptFile: POPULATION_SCRIPT_FILE,
      scriptSha256: POPULATION_SCRIPT_SHA256,
      system: "g0-s7",
      galaxy: 0,
      systemIndex: 7,
      seed: 1,
      startUp: POPULATION_STARTUP,
    });
    expect(fixture.entries.map((entry) => entry.name)).toEqual(
      POPULATION_ENTRY_TABLE.map((entry) => entry.name),
    );
  });

  it("encodes a decoded fixture back to the same file (the encoding is lossless)", () => {
    const fixture = load(TRACER_FILE);
    expect(encodePopulationFixture(fixture)).toEqual(raw());
  });

  it("refuses a logical fixture that breaks the schema", () => {
    const fixture = load(TRACER_FILE);
    expect(
      PopulationFixtureSchema.safeParse({ ...fixture, extra: 1 }).success,
    ).toBe(false);
    expect(
      PopulationFixtureSchema.safeParse({
        ...fixture,
        header: { ...fixture.header, scriptSha256: "0".repeat(64) },
      }).success,
    ).toBe(false);
    expect(
      PopulationFixtureSchema.safeParse({
        ...fixture,
        header: { ...fixture.header, oolitePin: "21978c3" },
      }).success,
    ).toBe(false);
  });
});

describe("population oracle: the draw vocabulary", () => {
  it("splits the closed tag list into compared and uncompared sites", () => {
    const compared: readonly string[] = POPULATION_EXACT_DRAW_TAGS;
    const uncompared: readonly string[] = POPULATION_UNCOMPARED_DRAW_TAGS;
    expect(new Set([...compared, ...uncompared]).size).toBe(
      compared.length + uncompared.length,
    );
    expect([...compared, ...uncompared].sort()).toEqual(
      [...POPULATION_DRAW_TAGS].sort(),
    );
  });

  it("lists the thirty-six entries the script registers, once each", () => {
    expect(POPULATION_ENTRY_NAMES.length).toBe(36);
    expect(new Set(POPULATION_ENTRY_NAMES).size).toBe(36);
  });
});

/** Group ships whose index appears in a recorded `addShips`/`addGroup` call. */
function called(group: PopulationGroup): Set<number> {
  const indices = new Set<number>();
  for (const call of group.calls) {
    for (const index of call.ships) {
      indices.add(index);
    }
  }
  return indices;
}

describe.each(FILES)("population oracle invariants: %s", (name) => {
  const fixture = load(name);

  it("carries the pin and the pinned script hash", () => {
    expect(fixture.header.oolitePin).toBe(POPULATION_OOLITE_PIN);
    expect(fixture.header.scriptSha256).toBe(POPULATION_SCRIPT_SHA256);
    expect(
      `${fixture.header.system}-seed${String(fixture.header.seed)}.json`,
    ).toBe(name);
  });

  it("lists the entries in registration order with their priorities", () => {
    expect(fixture.entries.map((entry) => entry.name)).toEqual([
      ...POPULATION_ENTRY_NAMES,
    ]);
    fixture.entries.forEach((entry, at) => {
      expect(entry.ordinal).toBe(at);
    });
    expect(
      fixture.entries.filter((entry) => entry.cut).map((entry) => entry.name),
    ).toEqual([...CUT_ENTRIES]);
  });

  it("runs the entries in a stable priority order (assumption A5)", () => {
    expect([...fixture.engineOrder].sort((a, b) => a - b)).toEqual(
      fixture.entries.map((entry) => entry.ordinal),
    );
    for (let i = 1; i < fixture.engineOrder.length; i += 1) {
      const before = fixture.entries[fixture.engineOrder[i - 1] ?? -1];
      const after = fixture.entries[fixture.engineOrder[i] ?? -1];
      expect(before).toBeDefined();
      expect(after).toBeDefined();
      if (before !== undefined && after !== undefined) {
        expect(before.priority).toBeLessThanOrEqual(after.priority);
        if (before.priority === after.priority) {
          expect(before.ordinal).toBeLessThan(after.ordinal);
        }
      }
    }
  });

  it("gives every counted entry exactly three count draws", () => {
    for (const entry of fixture.entries) {
      expect(entry.countDraws.length, entry.name).toBe(entry.counted ? 3 : 0);
      expect(entry.count, entry.name).toBe(entry.groupCount ?? 1);
    }
    const patrol = fixture.entries.find(
      (entry) => entry.name === "oolite-police-stationpatrol",
    );
    expect(patrol).toMatchObject({
      groupCount: null,
      count: 1,
      counted: false,
      cut: false,
      countDraws: [],
    });
  });

  it("keeps the interceptor entries like every other kept entry (D-09)", () => {
    for (const interceptor of [
      "oolite-interceptors-route1",
      "oolite-interceptors-witchpoint",
    ]) {
      const entry = fixture.entries.find(
        (candidate) => candidate.name === interceptor,
      );
      expect(entry, interceptor).toMatchObject({ cut: false, counted: true });
    }
  });

  it("takes the two assassin draws before the first counted entry, under setup", () => {
    const withSetup = fixture.entries.filter(
      (entry) => entry.setupDraws.length > 0,
    );
    expect(withSetup.map((entry) => entry.name)).toEqual(["oolite-freighters"]);
    expect(withSetup[0]?.setupDraws.length).toBe(2);
  });

  it("runs each kept entry `count` times and no cut entry", () => {
    for (const entry of fixture.entries) {
      const ran = fixture.groups.filter(
        (group) => group.entry === entry.ordinal,
      );
      expect(ran.length, entry.name).toBe(entry.cut ? 0 : entry.count);
      expect(
        ran.map((group) => group.index),
        entry.name,
      ).toEqual(ran.map((_group, at) => at));
      for (const group of ran) {
        expect(group.location).toBe(entry.location);
      }
    }
  });

  it("lists the groups in the engine's order", () => {
    const rank = new Map<number, number>();
    fixture.engineOrder.forEach((ordinal, at) => rank.set(ordinal, at));
    let previous = -1;
    for (const group of fixture.groups) {
      const at = rank.get(group.entry);
      expect(at).toBeDefined();
      expect(at ?? -1).toBeGreaterThanOrEqual(previous);
      previous = at ?? previous;
    }
  });

  it("takes only draws of the closed list, and no count or setup draw inside a group", () => {
    const tags: readonly string[] = POPULATION_DRAW_TAGS;
    for (const group of fixture.groups) {
      for (const tag of Object.keys(group.draws)) {
        expect(tags).toContain(tag);
        expect(["count", "setup"]).not.toContain(tag);
      }
    }
  });

  it("rolls one injector and one accuracy per ship the engine created", () => {
    const authored = anyAuthoredAccuracy();
    for (const group of fixture.groups) {
      expect(group.draws.injector?.length ?? 0).toBe(group.ships.length);
      if (!authored) {
        expect(group.draws.accuracy?.length ?? 0).toBe(group.ships.length);
      }
    }
  });

  it("lists the ships the calls produced plus their escorts, in creation order", () => {
    for (const group of fixture.groups) {
      group.ships.forEach((ship, at) => {
        expect(ship.index).toBe(at);
      });
      const produced = called(group);
      const escorts = new Set(
        group.ships
          .filter((ship) => ship.owner !== null)
          .map((ship) => ship.index),
      );
      for (const index of produced) {
        expect(escorts.has(index), `ship ${String(index)} is both`).toBe(false);
      }
      expect([...produced, ...escorts].sort((a, b) => a - b)).toEqual(
        group.ships.map((ship) => ship.index),
      );
    }
  });

  it("gives every escort a leader inside the group, a slot from 0 to 15 and the role escort", () => {
    for (const group of fixture.groups) {
      const slots = new Set<string>();
      const perOwner = new Map<number, number>();
      for (const ship of group.ships) {
        if (ship.owner === null) {
          expect(ship.escortSlot).toBeNull();
          continue;
        }
        expect(ship.owner).toBeLessThan(ship.index);
        expect(group.ships[ship.owner]).toBeDefined();
        expect(ship.escortSlot).not.toBeNull();
        expect(ship.escortSlot ?? -1).toBeGreaterThanOrEqual(0);
        expect(ship.escortSlot ?? 99).toBeLessThanOrEqual(15);
        expect(ship.primaryRole).toBe("escort");
        const key = `${String(ship.owner)}:${String(ship.escortSlot)}`;
        expect(slots.has(key), key).toBe(false);
        slots.add(key);
        perOwner.set(ship.owner, (perOwner.get(ship.owner) ?? 0) + 1);
        const escortGroup =
          typeof ship.group === "number"
            ? group.shipGroups[ship.group]
            : undefined;
        expect(escortGroup).toBeDefined();
        expect(escortGroup?.leader).toBe(ship.owner);
        expect(escortGroup?.members).toContain(ship.index);
        expect(escortGroup?.members).toContain(ship.owner);
      }
      for (const count of perOwner.values()) {
        expect(count).toBeLessThanOrEqual(16);
      }
    }
  });

  it("links every ship group to ships of the group", () => {
    for (const group of fixture.groups) {
      const size = group.ships.length;
      for (const shipGroup of group.shipGroups) {
        for (const member of shipGroup.members) {
          expect(member).toBeGreaterThanOrEqual(0);
          expect(member).toBeLessThan(size);
        }
        if (shipGroup.leader !== null) {
          expect(shipGroup.members).toContain(shipGroup.leader);
        }
      }
      for (const ship of group.ships) {
        if (typeof ship.group === "number") {
          const shipGroup = group.shipGroups[ship.group];
          expect(shipGroup).toBeDefined();
          expect(shipGroup?.members).toContain(ship.index);
          expect(ship.leader).toBe(shipGroup?.leader ?? null);
        } else {
          expect(ship.leader).toBeNull();
        }
      }
    }
  });

  it("stores ship values the way the engine stores them", () => {
    for (const group of fixture.groups) {
      for (const ship of group.ships) {
        expect(Math.fround(ship.accuracy)).toBe(ship.accuracy);
        expect(ship.accuracy).toBeGreaterThanOrEqual(-5);
        expect(ship.accuracy).toBeLessThanOrEqual(10);
        // The engine clamps a script write of `fuel` to 7 LY (70 tenths). The
        // police interceptor hull is authored with 16 LY and the script never
        // writes police fuel, so its authored value stands (found when the
        // sample widened past Lave).
        expect(ship.fuel).toBeLessThanOrEqual(
          ship.key === "viper-interceptor" ? 160 : 70,
        );
        if (ship.cargoKind === "unset") {
          expect(ship.cargoCount).toBe(0);
        }
        if (ship.equipment.includes("EQ_FUEL_INJECTION")) {
          expect(ship.injector).toBe(true);
        }
      }
    }
  });

  it("applies the remote pack tweak pos.z % 100000 and nothing else changes pos.z", () => {
    for (const group of fixture.groups) {
      const entry = fixture.entries[group.entry];
      const remote = entry?.name.endsWith("-remote") === true;
      expect(group.posOutZ).toBe(remote ? group.posInZ % 100000 : group.posInZ);
    }
  });

  it("records the opportunist effects as writes and its AI switch as a cut write (D-10)", () => {
    for (const group of fixture.groups) {
      for (const ship of group.ships) {
        const switched = ship.writes.find(
          (write) =>
            write.member === "switchAI" &&
            write.value === "oolite-traderOpportunistAI.js",
        );
        if (switched === undefined) {
          continue;
        }
        expect(switched.cut).toBe(true);
        expect(ship.cargoKind).toBe("pirate");
        expect(ship.bounty).toBeGreaterThan(0);
      }
    }
  });

  it("reads no host member the stub could not answer, except cut paths", () => {
    for (const member of fixture.inventory.missing) {
      expect(fixture.inventory.cutReads).toContain(member);
    }
  });

  it("describes the neighbourhood the script read", () => {
    const { inputs } = fixture;
    const ascending = (values: readonly number[]): boolean =>
      values.every((value, at) => at === 0 || value > (values[at - 1] ?? -1));
    const localIds = inputs.locals.map((neighbour) => neighbour.id);
    const veryIds = inputs.verylocals.map((neighbour) => neighbour.id);
    expect(ascending(localIds)).toBe(true);
    expect(ascending(veryIds)).toBe(true);
    for (const id of veryIds) {
      expect(localIds).toContain(id);
    }
    expect(inputs.within25Count).toBeGreaterThanOrEqual(localIds.length);
    expect(localIds).not.toContain(fixture.header.systemIndex);
    expect(inputs.laneLengths.l1).toBeGreaterThan(0);
    expect(inputs.laneLengths.l2).toBeGreaterThan(0);
    expect(inputs.laneLengths.l3).toBeGreaterThan(0);
  });

  it("equals this system's row of the all-2,048 neighbourhood table", () => {
    const row = table().galaxies[fixture.header.galaxy];
    const at = fixture.header.systemIndex;
    expect(row, "galaxy row").toBeDefined();
    expect(fixture.inputs.locals.map((neighbour) => neighbour.id)).toEqual(
      row?.locals[at],
    );
    expect(fixture.inputs.verylocals.map((neighbour) => neighbour.id)).toEqual(
      row?.verylocals[at],
    );
    expect(fixture.inputs.within25Count).toBe(row?.within25[at]);
    expect(fixture.inputs.bottleneck).toBe(
      row?.bottleneck.includes(at) === true,
    );
  });
});

describe("population oracle: the neighbourhood table", () => {
  it("holds 8 galaxies of 256 systems, recorded from the pinned script", () => {
    expect(table().header.oolitePin).toBe(POPULATION_OOLITE_PIN);
    expect(table().header.scriptSha256).toBe(POPULATION_SCRIPT_SHA256);
    expect(table().galaxies).toHaveLength(8);
    for (const galaxy of table().galaxies) {
      expect(galaxy.locals).toHaveLength(256);
      expect(galaxy.verylocals).toHaveLength(256);
      expect(galaxy.within25).toHaveLength(256);
    }
  });

  it("is symmetric: A is within 7 LY of B exactly when B is within 7 LY of A", () => {
    for (const galaxy of table().galaxies) {
      galaxy.locals.forEach((ids, at) => {
        for (const other of ids) {
          expect(
            galaxy.locals[other],
            `${String(at)} -> ${String(other)}`,
          ).toContain(at);
        }
      });
      galaxy.verylocals.forEach((ids, at) => {
        for (const other of ids) {
          expect(
            galaxy.verylocals[other],
            `${String(at)} -> ${String(other)}`,
          ).toContain(at);
        }
      });
    }
  });

  it("counts at least as many systems within 25 LY as within 7 LY", () => {
    for (const galaxy of table().galaxies) {
      galaxy.locals.forEach((ids, at) => {
        expect(galaxy.within25[at] ?? -1).toBeGreaterThanOrEqual(ids.length);
      });
    }
  });

  it("marks no isolated system a bottleneck, and some systems of the universe", () => {
    let total = 0;
    for (const galaxy of table().galaxies) {
      total += galaxy.bottleneck.length;
      for (const id of galaxy.bottleneck) {
        expect(galaxy.locals[id]?.length ?? 0).toBeGreaterThan(1);
      }
    }
    expect(total).toBeGreaterThan(0);
  });

  it("refuses an unknown key, a short galaxy and a descending id list", () => {
    expect(
      NeighbourhoodTableSchema.safeParse({ ...table(), extra: 1 }).success,
    ).toBe(false);
    const first = table().galaxies[0];
    expect(first).toBeDefined();
    const short = {
      ...table(),
      galaxies: [
        { ...first, locals: first?.locals.slice(1) },
        ...table().galaxies.slice(1),
      ],
    };
    expect(NeighbourhoodTableSchema.safeParse(short).success).toBe(false);
    const at = first?.locals.findIndex((ids) => ids.length > 1) ?? -1;
    expect(at).toBeGreaterThanOrEqual(0);
    const reversed = first?.locals.map((ids, index) =>
      index === at ? [...ids].reverse() : ids,
    );
    const descending = {
      ...table(),
      galaxies: [{ ...first, locals: reversed }, ...table().galaxies.slice(1)],
    };
    expect(NeighbourhoodTableSchema.safeParse(descending).success).toBe(false);
  });
});

describe("population oracle: the isolated anchor (g7-s162, Oresrati)", () => {
  const names = ["g7-s162-seed1.json", "g7-s162-seed2.json"];

  it("is recorded for seeds 1 and 2 (size rule: no third seed)", () => {
    for (const name of names) {
      expect(FILES, name).toContain(name);
    }
  });

  it("has no neighbour within 7 LY and is no bottleneck", () => {
    const row = table().galaxies[7];
    expect(row?.locals[162]).toEqual([]);
    expect(row?.verylocals[162]).toEqual([]);
    expect(row?.bottleneck).not.toContain(162);
  });

  it.each(names)(
    "%s records zero locals, zero counts for every trade, pirate and hunter entry, and only the station patrol",
    (name) => {
      const fixture = load(name);
      expect(fixture.inputs.locals).toEqual([]);
      expect(fixture.inputs.verylocals).toEqual([]);
      expect(fixture.inputs.bottleneck).toBe(false);
      for (const entry of fixture.entries) {
        if (
          /freighters|couriers|smugglers|hunters|pirate|police-route1|police-triangle/.test(
            entry.name,
          )
        ) {
          expect(entry.count, entry.name).toBe(0);
        }
      }
      const spawned = fixture.groups.map(
        (group) => fixture.entries[group.entry]?.name,
      );
      expect(spawned.length).toBeGreaterThan(0);
      expect(new Set(spawned)).toEqual(
        new Set(["oolite-police-stationpatrol"]),
      );
      expect(fixture.groups).toHaveLength(1);
      expect(fixture.groups[0]?.ships).toHaveLength(1);
    },
  );
});

/** One fixture's inputs by system, read from the fixtures alone (D-04). */
function sampleOf(): Map<
  string,
  { fixture: PopulationFixture; seeds: number[] }
> {
  const sample = new Map<
    string,
    { fixture: PopulationFixture; seeds: number[] }
  >();
  for (const name of FILES) {
    const fixture = load(name);
    const known = sample.get(fixture.header.system);
    if (known === undefined) {
      sample.set(fixture.header.system, {
        fixture,
        seeds: [fixture.header.seed],
      });
    } else {
      known.seeds.push(fixture.header.seed);
    }
  }
  return sample;
}

describe("population oracle: the stratified sample (D-04)", () => {
  const sample = sampleOf();
  const systems = [...sample.values()].map((entry) => entry.fixture);
  const has = (id: string): boolean => sample.has(id);

  it("holds 30 to 36 systems, each with seed 1 and at most seeds 1 to 3", () => {
    expect(sample.size).toBeGreaterThanOrEqual(30);
    expect(sample.size).toBeLessThanOrEqual(36);
    for (const [id, entry] of sample) {
      expect(entry.seeds.sort(), id).toContain(1);
      expect(
        entry.seeds.every((seed) => [1, 2, 3].includes(seed)),
        id,
      ).toBe(true);
    }
  });

  it("covers all 8 governments, both economy sides and low and high tech levels", () => {
    const governments = new Set(systems.map((f) => f.inputs.government));
    expect([...governments].sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(systems.some((f) => f.inputs.economy <= 3)).toBe(true);
    expect(systems.some((f) => f.inputs.economy >= 4)).toBe(true);
    expect(systems.some((f) => f.inputs.techLevel <= 4)).toBe(true);
    expect(systems.some((f) => f.inputs.techLevel >= 9)).toBe(true);
    expect(
      systems.some((f) => f.inputs.techLevel >= 9 && f.inputs.government >= 2),
    ).toBe(true);
    expect(systems.some((f) => f.inputs.techLevel === 14)).toBe(true);
  });

  it("covers an isolated system, a bottleneck system and both no-near-neighbour branches", () => {
    expect(has("g7-s162")).toBe(true);
    expect(sample.get("g7-s162")?.fixture.inputs.locals).toEqual([]);
    expect(systems.some((f) => f.inputs.bottleneck)).toBe(true);
    const noNear = systems.filter(
      (f) => f.inputs.verylocals.length === 0 && f.inputs.locals.length > 0,
    );
    expect(noNear.some((f) => f.inputs.government > 5)).toBe(true);
    expect(noNear.some((f) => f.inputs.government <= 5)).toBe(true);
  });

  it("covers the courier-bug peaks: bottleneck systems with 10 or more neighbours", () => {
    for (const id of ["g3-s239", "g0-s92"]) {
      const inputs = sample.get(id)?.fixture.inputs;
      expect(inputs, id).toBeDefined();
      expect(inputs?.bottleneck, id).toBe(true);
      expect(inputs?.locals.length ?? 0, id).toBeGreaterThanOrEqual(10);
    }
  });

  it("covers the anarchy tail: the largest anarchy of the universe and of galaxy 0", () => {
    // Chosen by the selector's proxy population (tools/ai-harness/population-systems.ts);
    // the OOLITE_SRC-gated rerun recomputes the selection and compares.
    for (const id of ["g3-s123", "g0-s219"]) {
      expect(sample.get(id)?.fixture.inputs.government, id).toBe(0);
    }
  });

  it("covers the largest feudal state, the start system and at least five galaxies", () => {
    expect(sample.get("g6-s57")?.fixture.inputs.government).toBe(1);
    expect(has("g0-s7")).toBe(true);
    const galaxies = new Set(systems.map((f) => f.header.galaxy));
    expect(galaxies.size).toBeGreaterThanOrEqual(5);
  });

  it("leaves every system fixture equal to its row of the neighbourhood table", () => {
    for (const fixture of systems) {
      const row = table().galaxies[fixture.header.galaxy];
      const at = fixture.header.systemIndex;
      expect(
        fixture.inputs.locals.map((n) => n.id),
        fixture.header.system,
      ).toEqual(row?.locals[at]);
    }
  });
});

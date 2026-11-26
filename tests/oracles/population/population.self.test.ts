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
  POPULATION_DRAW_TAGS,
  POPULATION_ENTRY_NAMES,
  POPULATION_EXACT_DRAW_TAGS,
  POPULATION_OOLITE_PIN,
  POPULATION_SCRIPT_SHA256,
  POPULATION_UNCOMPARED_DRAW_TAGS,
  PopulationFixtureSchema,
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
  return PopulationFixtureSchema.parse(readJson(name));
}

const FILES = fixtureFiles();

describe("population oracle: the committed fixtures", () => {
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
  const base = (): PopulationFixture => load(TRACER_FILE);

  it("refuses an unknown top-level key", () => {
    const fixture = { ...base(), extra: 1 };
    expect(PopulationFixtureSchema.safeParse(fixture).success).toBe(false);
  });

  it("refuses an unknown key inside an entry, a group and a ship", () => {
    const withEntry = base();
    const entry0 = withEntry.entries[0];
    expect(entry0).toBeDefined();
    const mutatedEntry = {
      ...withEntry,
      entries: [{ ...entry0, extra: 1 }, ...withEntry.entries.slice(1)],
    };
    expect(PopulationFixtureSchema.safeParse(mutatedEntry).success).toBe(false);

    const withShip = base();
    const group = withShip.groups[0];
    const ship = group?.ships[0];
    expect(group).toBeDefined();
    expect(ship).toBeDefined();
    const mutatedShip = {
      ...withShip,
      groups: [
        {
          ...group,
          ships: [{ ...ship, extra: 1 }, ...(group?.ships.slice(1) ?? [])],
        },
        ...withShip.groups.slice(1),
      ],
    };
    expect(PopulationFixtureSchema.safeParse(mutatedShip).success).toBe(false);

    const mutatedGroup = {
      ...withShip,
      groups: [{ ...group, extra: 1 }, ...withShip.groups.slice(1)],
    };
    expect(PopulationFixtureSchema.safeParse(mutatedGroup).success).toBe(false);
  });

  it("refuses a draw tag outside the closed list and a draw that is not a u32", () => {
    const fixture = base();
    const group = fixture.groups[0];
    expect(group).toBeDefined();
    const badTag = {
      ...fixture,
      groups: [
        { ...group, draws: { ...group?.draws, unknown: [1] } },
        ...fixture.groups.slice(1),
      ],
    };
    expect(PopulationFixtureSchema.safeParse(badTag).success).toBe(false);
    const badValue = {
      ...fixture,
      groups: [
        { ...group, draws: { ...group?.draws, body: [4294967296] } },
        ...fixture.groups.slice(1),
      ],
    };
    expect(PopulationFixtureSchema.safeParse(badValue).success).toBe(false);
    const fraction = {
      ...fixture,
      groups: [
        { ...group, draws: { ...group?.draws, body: [0.5] } },
        ...fixture.groups.slice(1),
      ],
    };
    expect(PopulationFixtureSchema.safeParse(fraction).success).toBe(false);
  });

  it("refuses a header that is not the pinned script", () => {
    const fixture = base();
    const wrongHash = {
      ...fixture,
      header: { ...fixture.header, scriptSha256: "0".repeat(64) },
    };
    expect(PopulationFixtureSchema.safeParse(wrongHash).success).toBe(false);
    const wrongPin = {
      ...fixture,
      header: { ...fixture.header, oolitePin: "21978c3" },
    };
    expect(PopulationFixtureSchema.safeParse(wrongPin).success).toBe(false);
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
    const authored = fixture.shipFacts.some((fact) => fact.accuracy !== null);
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
        expect(ship.fuel).toBeLessThanOrEqual(70);
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
        expect(
          ship.writes.some(
            (write) =>
              write.member === "setCargoType" && write.value === "PIRATE_GOODS",
          ),
        ).toBe(true);
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
    expect(ascending(inputs.within25)).toBe(true);
    for (const id of veryIds) {
      expect(localIds).toContain(id);
    }
    for (const id of localIds) {
      expect(inputs.within25).toContain(id);
    }
    for (const neighbour of [...inputs.locals, ...inputs.verylocals]) {
      expect(ascending(neighbour.seconds)).toBe(true);
      expect(neighbour.seconds).toContain(fixture.header.systemIndex);
      expect(neighbour.seconds).not.toContain(neighbour.id);
    }
    expect(inputs.laneLengths.l1).toBeGreaterThan(0);
    expect(inputs.laneLengths.l2).toBeGreaterThan(0);
    expect(inputs.laneLengths.l3).toBeGreaterThan(0);
  });
});

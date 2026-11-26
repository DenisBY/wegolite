// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The whole-system replay of the initial populator (Phase 22, plan 22-09,
 * WORLD-08 success criterion 1).
 *
 * The oracle is Oolite's own `oolite-populator.js` (pin 7437f22) run against a
 * stub host that models the engine pieces the script relies on. Every fixture
 * under `tests/oracles/population/fixtures/` records, for each group of each
 * kept entry, the draws it took per site and the ships it left behind. The port
 * is fed the recorded facts and the recorded draws (the entries' `count` draws
 * and every group's draws, through the interfaces it draws from) and
 * `planSystemGroups` must return, in engine order, exactly the recorded groups,
 * ship for ship, taking exactly the recorded number of draws at each compared
 * site. A mismatch is fixed in the port, never in a fixture.
 *
 * One recorded difference is a decision, not a mismatch (D-11, FIDELITY): the
 * police station patrol joins the main station's group in Oolite, and
 * Wegolite's station is a static with no entity id, so the port plans it with
 * no group record.
 */

import { describe, expect, it } from "vitest";

import {
  buildGroup,
  planSystemGroups,
} from "../../../../src/sim/world/population/groups.js";
import type {
  GroupPlan,
  PopulationRecord,
  SystemDraws,
} from "../../../../src/sim/world/population/groups.js";
import {
  PACK_COMPOSITION,
  nearbyDangerousSystem,
  remotePackZ,
} from "../../../../src/sim/world/population/pirates.js";
import type {
  PopulationDraws,
  PopulationTag,
} from "../../../../src/sim/world/population/streams.js";
import {
  POPULATOR_ENTRIES,
  entriesInEngineOrder,
} from "../../../../src/sim/world/population/table.js";
import type { PopulatorBuilderId } from "../../../../src/sim/world/population/table.js";
import { POPULATION_EXACT_DRAW_TAGS } from "../../../oracles/population/schema.js";
import type { PopulationGroup } from "../../../oracles/population/schema.js";
import {
  committedPopulationRecords,
  countDrawsFromFixture,
  describeShips,
  factsFromFixture,
  loadEdgeDraws,
  loadPopulationFixtures,
  recordedDraws,
  recordedShips,
} from "../../../helpers/population-fixtures.js";
import type { ShipProjection } from "../../../helpers/population-fixtures.js";

type Loaded = ReturnType<typeof loadPopulationFixtures>[number];

const RECORDS = committedPopulationRecords();
const FIXTURES = loadPopulationFixtures();

/** The tags whose draw count is compared: the exact sites, minus the counts. */
const COMPARED_TAGS = POPULATION_EXACT_DRAW_TAGS.filter(
  (tag) => tag !== "count",
);

/**
 * The builders this plan has not written yet. Task 1 (the tracer) implements
 * the light hunters; Task 2 empties the pirate builders, Task 3 the police
 * ones. A group of a pending builder is planned empty and is not compared.
 */
const PENDING_BUILDERS: ReadonlySet<PopulatorBuilderId> = new Set([
  "policePatrol",
  "stationPatrol",
  "interceptors",
]);

function builderOf(ordinal: number): PopulatorBuilderId | null {
  return POPULATOR_ENTRIES[ordinal]?.builder ?? null;
}

function isPending(ordinal: number): boolean {
  const builder = builderOf(ordinal);
  return builder !== null && PENDING_BUILDERS.has(builder);
}

/** Recorded draws that remember how many each tag took. */
function countingDraws(group: PopulationGroup): {
  readonly draws: PopulationDraws;
  readonly taken: ReadonlyMap<string, number>;
} {
  const inner = recordedDraws(group);
  const taken = new Map<string, number>();
  const note = (tag: PopulationTag): void => {
    taken.set(tag, (taken.get(tag) ?? 0) + 1);
  };
  return {
    taken,
    draws: {
      next: (tag) => {
        note(tag);
        return inner.next(tag);
      },
      nextU32: (tag) => {
        note(tag);
        return inner.nextU32(tag);
      },
    },
  };
}

interface Replayed {
  readonly plans: readonly GroupPlan[];
  readonly taken: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/**
 * `drawsFromFixture`: the entries' count draws and each group's draws, as the
 * recording holds them.
 */
function drawsFromFixture(
  loaded: Loaded,
  taken: Map<string, ReadonlyMap<string, number>>,
): SystemDraws {
  const byKey = new Map<string, PopulationGroup>();
  for (const group of loaded.fixture.groups) {
    byKey.set(`${String(group.entry)}/${String(group.index)}`, group);
  }
  return {
    counts: countDrawsFromFixture(loaded.fixture),
    group: (ordinal, groupIndex) => {
      const key = `${String(ordinal)}/${String(groupIndex)}`;
      const group = byKey.get(key);
      if (group === undefined) {
        throw new RangeError(`${loaded.id}: the recording has no group ${key}`);
      }
      const counting = countingDraws(group);
      taken.set(key, counting.taken);
      return counting.draws;
    },
  };
}

/** Plan one whole recorded system through `planSystemGroups`. */
function replaySystem(
  loaded: Loaded,
  records: readonly PopulationRecord[] = RECORDS,
): Replayed {
  const taken = new Map<string, ReadonlyMap<string, number>>();
  const plans = planSystemGroups(
    factsFromFixture(loaded.fixture),
    records,
    drawsFromFixture(loaded, taken),
  );
  return { plans, taken };
}

/**
 * The recorded groups in engine order: `groups` of a fixture already follow it
 * (`engineOrder`, assumption A5), and the port must produce the same sequence.
 */
function recordedOrder(loaded: Loaded): readonly string[] {
  return loaded.fixture.groups.map(
    (group) => `${String(group.entry)}/${String(group.index)}`,
  );
}

function plannedOrder(plans: readonly GroupPlan[]): readonly string[] {
  return plans.map(
    (plan) => `${String(plan.ordinal)}/${String(plan.groupIndex)}`,
  );
}

/**
 * The recorded ships of a group as the port projects them. The one decision:
 * a ship in the main station's group (the police station patrol, D-11) has no
 * group record in the port.
 */
function expectedShips(group: PopulationGroup): ShipProjection[] {
  return recordedShips(group).map((ship, at) =>
    group.ships[at]?.group === "station" ? { ...ship, inGroup: false } : ship,
  );
}

describe("planSystemGroups: tracer (light hunters, one whole system)", () => {
  const loaded = FIXTURES.find((candidate) => candidate.id === "g0-s7-seed1");

  it("has the Lave recording", () => {
    expect(loaded).toBeDefined();
  });

  it("plans the recorded groups of a whole system in engine order", () => {
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const { plans } = replaySystem(loaded);
    expect(plannedOrder(plans)).toEqual(recordedOrder(loaded));
    // The engine order is the stable priority sort of the kept entries.
    const engine = entriesInEngineOrder(POPULATOR_ENTRIES)
      .filter((entry) => entry.status === "kept")
      .map((entry) => entry.ordinal);
    const ordinals = plans.map((plan) => plan.ordinal);
    expect(
      [...ordinals].sort((a, b) => engine.indexOf(a) - engine.indexOf(b)),
    ).toEqual(ordinals);
  });

  it("reproduces every light-hunter group of the system ship for ship", () => {
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const { plans, taken } = replaySystem(loaded);
    const hunters = loaded.fixture.groups.filter(
      (group) => builderOf(group.entry) === "lightHunter",
    );
    expect(hunters.length).toBeGreaterThan(0);
    for (const group of hunters) {
      const key = `${String(group.entry)}/${String(group.index)}`;
      const plan = plans.find(
        (candidate) =>
          candidate.ordinal === group.entry &&
          candidate.groupIndex === group.index,
      );
      expect(plan, key).toBeDefined();
      if (plan === undefined) {
        continue;
      }
      expect({ key, ships: describeShips(plan) }).toEqual({
        key,
        ships: expectedShips(group),
      });
      for (const tag of COMPARED_TAGS) {
        expect(taken.get(key)?.get(tag) ?? 0, `${key} ${tag}`).toBe(
          group.draws[tag]?.length ?? 0,
        );
      }
    }
  });
});

describe("planSystemGroups: every recorded system", () => {
  it("plans the recorded groups of every fixture, in engine order", () => {
    for (const loaded of FIXTURES) {
      const { plans } = replaySystem(loaded);
      expect(plannedOrder(plans), loaded.id).toEqual(recordedOrder(loaded));
    }
  });

  it("reproduces every group of every implemented builder, draws included", () => {
    let compared = 0;
    for (const loaded of FIXTURES) {
      const { plans, taken } = replaySystem(loaded);
      for (const group of loaded.fixture.groups) {
        if (isPending(group.entry)) {
          continue;
        }
        const key = `${String(group.entry)}/${String(group.index)}`;
        const at = `${loaded.id} ${key}`;
        const plan = plans.find(
          (candidate) =>
            candidate.ordinal === group.entry &&
            candidate.groupIndex === group.index,
        );
        if (plan === undefined) {
          throw new Error(`${at}: no planned group`);
        }
        expect({ at, ships: describeShips(plan) }).toEqual({
          at,
          ships: expectedShips(group),
        });
        for (const tag of COMPARED_TAGS) {
          expect(taken.get(key)?.get(tag) ?? 0, `${at} ${tag}`).toBe(
            group.draws[tag]?.length ?? 0,
          );
        }
        compared += 1;
      }
    }
    expect(compared).toBeGreaterThan(800);
  });

  it("lists the builders that are still pending (Tasks 2 and 3 empty this list)", () => {
    const pending = [...PENDING_BUILDERS].sort();
    expect(pending).toEqual(["interceptors", "policePatrol", "stationPatrol"]);
  });
});

/** Every recorded group whose entry uses one of the builders, with its fixture. */
function recordedGroupsOf(
  ...builders: readonly PopulatorBuilderId[]
): readonly { readonly loaded: Loaded; readonly group: PopulationGroup }[] {
  return FIXTURES.flatMap((loaded) =>
    loaded.fixture.groups
      .filter((group) => {
        const builder = builderOf(group.entry);
        return builder !== null && builders.includes(builder);
      })
      .map((group) => ({ loaded, group })),
  );
}

const PACK_BUILDERS: readonly PopulatorBuilderId[] = [
  "lightPirateLocal",
  "lightPirateRemote",
  "mediumPirateLocal",
  "mediumPirateRemote",
  "heavyPirateLocal",
  "heavyPirateRemote",
];

/**
 * Crafted draws: every site takes `fixed`, except the listed `body` draws by
 * their index in the group; the number taken per tag is remembered.
 */
function scripted(
  fixed: number,
  body: ReadonlyMap<number, number> = new Map(),
): { readonly draws: PopulationDraws; readonly taken: Map<string, number> } {
  const taken = new Map<string, number>();
  const draw = (tag: PopulationTag): number => {
    const at = taken.get(tag) ?? 0;
    taken.set(tag, at + 1);
    return (tag === "body" ? body.get(at) : undefined) ?? fixed;
  };
  return {
    taken,
    draws: {
      next: (tag) => draw(tag),
      nextU32: (tag) => Math.floor(draw(tag) * 4_294_967_296),
    },
  };
}

function entryNamed(name: string): (typeof POPULATOR_ENTRIES)[number] {
  const entry = POPULATOR_ENTRIES.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    throw new Error(`no populator entry ${name}`);
  }
  return entry;
}

describe("independent pirates: every recorded group", () => {
  const INDEPENDENT = recordedGroupsOf("independentPirate");

  it("covers the three lanes and both weapon levels (the replay is not vacuous)", () => {
    expect(INDEPENDENT.length).toBeGreaterThan(100);
    expect(new Set(INDEPENDENT.map(({ group }) => group.entry))).toEqual(
      new Set([16, 17, 18]),
    );
    const keys = new Map(RECORDS.map((record) => [record.key, record]));
    const ships = INDEPENDENT.flatMap(({ group }) => group.ships);
    expect(
      ships.some((ship) => keys.get(ship.key)?.hyperspaceMotor === true),
    ).toBe(true);
    expect(
      ships.some((ship) => keys.get(ship.key)?.hyperspaceMotor === false),
    ).toBe(true);
  });

  it("plans pirate goods, a group record and no leader for every ship", () => {
    for (const { loaded, group } of INDEPENDENT) {
      const plan = replaySystem(loaded).plans.find(
        (candidate) =>
          candidate.ordinal === group.entry &&
          candidate.groupIndex === group.index,
      );
      expect(plan?.remotePack).toBe(false);
      for (const ship of plan?.ships ?? []) {
        expect(ship.cargoKind).toBe("pirate");
        expect(ship.groupRecord).toBe(true);
        expect(ship.leaderIndex).toBeNull();
        expect(ship.ownerIndex).toBeNull();
      }
    }
  });

  it("takes the missile-test draw `if (pos.z)`: only a z of exactly 0 skips it", () => {
    const first = INDEPENDENT[0];
    if (first === undefined) {
      throw new Error("no independent pirate group");
    }
    const { loaded, group } = first;
    const facts = factsFromFixture(loaded.fixture);
    const entry = POPULATOR_ENTRIES[group.entry];
    if (entry === undefined) {
      throw new Error("no entry");
    }
    expect(group.posInZ).not.toBe(0);
    const bodyOf = (posZ: number | undefined): number => {
      const { draws, taken } = countingDraws(group);
      buildGroup(entry, facts, RECORDS, draws, {
        groupIndex: group.index,
        posZ,
      });
      return taken.get("body") ?? 0;
    };
    const recorded = group.draws.body?.length ?? 0;
    expect(bodyOf(undefined)).toBe(recorded);
    expect(bodyOf(group.posInZ)).toBe(recorded);
    expect(bodyOf(0)).toBe(recorded - group.ships.length);
    expect(bodyOf(Number.NaN)).toBe(recorded - group.ships.length);
  });
});

describe("pirate packs: every recorded group", () => {
  const PACKS = recordedGroupsOf(...PACK_BUILDERS);

  it("covers eight of the nine pack entries, escorted leaders and the remote packs", () => {
    // The heavy remote pack (entry 27) needs a Feudal or Anarchy very local
    // neighbour of a safer system and a rate that rounds up: none of the 66
    // recordings has one. Its wrapper is covered by the unit case below.
    expect(new Set(PACKS.map(({ group }) => group.entry))).toEqual(
      new Set([19, 20, 21, 22, 23, 24, 25, 26]),
    );
    expect(
      PACKS.some(({ group }) =>
        group.ships.some((ship) => ship.owner !== null),
      ),
    ).toBe(true);
    expect(
      PACKS.some(({ group }) =>
        group.ships.some((ship) => ship.role === "pirate-interceptor"),
      ),
    ).toBe(true);
  });

  it("plans the leader first, then its escorts, then the assistants", () => {
    for (const { loaded, group } of PACKS) {
      const plan = replaySystem(loaded).plans.find(
        (candidate) =>
          candidate.ordinal === group.entry &&
          candidate.groupIndex === group.index,
      );
      const ships = plan?.ships ?? [];
      const leader = ships[0];
      const builder = builderOf(group.entry);
      const size = builder?.startsWith("light")
        ? "light"
        : builder?.startsWith("medium")
          ? "medium"
          : "heavy";
      expect(leader?.role, loaded.id).toBe(PACK_COMPOSITION[size].leader);
      expect(leader?.cargoKind).toBe("pirate");
      expect(leader?.groupRecord).toBe(true);
      expect(leader?.leaderIndex).toBe(0);
      expect(leader?.ownerIndex).toBeNull();
      const escorts = ships.filter((ship) => ship.ownerIndex === 0);
      // The escorts come right after the leader, in slot order.
      expect(ships.slice(1, 1 + escorts.length)).toEqual(escorts);
      escorts.forEach((escort, at) => {
        expect(escort.escortSlot).toBe(at);
        expect(escort.primaryRole).toBe("escort");
      });
      for (const assistant of ships.slice(1 + escorts.length)) {
        expect(assistant.ownerIndex).toBeNull();
        expect(assistant.escortSlot).toBeNull();
        if (assistant.role === "pirate-interceptor") {
          // an interceptor is not part of the pack's group (:1750-1768)
          expect(assistant.groupRecord).toBe(false);
          expect(assistant.leaderIndex).toBeNull();
          expect(assistant.injector).toBe(true);
        } else {
          expect(assistant.groupRecord).toBe(true);
          expect(assistant.leaderIndex).toBe(0);
        }
        // every assistant shares the leader's home and destination
        expect(assistant.homeSystem).toBe(leader?.homeSystem);
        expect(assistant.destinationSystem).toBe(leader?.destinationSystem);
      }
    }
  });

  it("takes the class draws of all four classes whatever the base count (Pitfall 3)", () => {
    // 1 leader bounty + 2 draws for each of the four classes + one draw for
    // every further ship (an assistant's bounty, an escort's offender bonus).
    for (const { loaded, group } of PACKS) {
      expect(
        group.draws.body?.length,
        `${loaded.id} ${String(group.entry)}`,
      ).toBe(9 + group.ships.length - 1);
    }
  });

  it("keeps the pack class counts the table calls 0: one ship in eight (a faithful row)", () => {
    const interceptorInLightPack = PACKS.some(
      ({ group }) =>
        builderOf(group.entry)?.startsWith("light") === true &&
        group.ships.some((ship) => ship.role === "pirate-interceptor"),
    );
    const heavyFighterInMediumPack = PACKS.some(
      ({ group }) =>
        builderOf(group.entry)?.startsWith("medium") === true &&
        group.ships.some((ship) => ship.role === "pirate-heavy-fighter"),
    );
    expect(interceptorInLightPack || heavyFighterInMediumPack).toBe(true);
  });

  it("plans a pirate interceptor in a light pack at r1 - r2 >= 0.5, and none below", () => {
    const loaded = FIXTURES.find((candidate) => candidate.id === "g0-s7-seed1");
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const entry = entryNamed("oolite-pirate-light-route1");
    const facts = factsFromFixture(loaded.fixture);
    // body: 0 leader bounty, 1-2 light r1 r2, 3-4 their bounties, 5-6 medium
    // r1 r2, 7 its bounty, 8-9 heavy r1 r2, 10-11 interceptor r1 r2.
    const roles = (r1: number, r2: number): number => {
      const { draws, taken } = scripted(
        0.5,
        new Map([
          [8, r1],
          [9, r2],
          [10, r1],
          [11, r2],
        ]),
      );
      const plan = buildGroup(entry, facts, RECORDS, draws, { groupIndex: 0 });
      // two draws per class were taken whatever the count
      expect(taken.get("body")).toBe(9 + plan.ships.length - 1);
      return plan.ships.filter((ship) => ship.role === "pirate-interceptor")
        .length;
    };
    // r1 - r2 = 0.5 exactly: floor(0 + (0.5 + 0.5)) = 1 ship
    expect(roles(0.75, 0.25)).toBe(1);
    // below 0.5: none
    expect(roles(0.74, 0.25)).toBe(0);
    expect(roles(0.5, 0.5)).toBe(0);
    // a light pack's heavy class is k = -1: no ship, whatever the draws
    const heavy = (r1: number, r2: number): number => {
      const { draws } = scripted(
        0.5,
        new Map([
          [8, r1],
          [9, r2],
        ]),
      );
      const plan = buildGroup(entry, facts, RECORDS, draws, { groupIndex: 0 });
      return plan.ships.filter((ship) => ship.role === "pirate-heavy-fighter")
        .length;
    };
    expect(heavy(0.9999999999999999, 0)).toBe(0);
    expect(heavy(0, 0.9999999999999999)).toBe(0);
  });

  it("plans a heavy fighter in a medium pack at r1 - r2 >= 0.5 (k = 0)", () => {
    const loaded = FIXTURES.find((candidate) => candidate.id === "g0-s7-seed1");
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const entry = entryNamed("oolite-pirate-medium-route1");
    const facts = factsFromFixture(loaded.fixture);
    // body: 0 leader, 1-2 light r1 r2 (3 ships), 3-5 bounties, 6-7 medium
    // r1 r2 (2 ships), 8-9 bounties, 10-11 heavy r1 r2.
    const heavy = (r1: number, r2: number): number => {
      const { draws } = scripted(
        0.5,
        new Map([
          [10, r1],
          [11, r2],
        ]),
      );
      const plan = buildGroup(entry, facts, RECORDS, draws, { groupIndex: 0 });
      return plan.ships.filter((ship) => ship.role === "pirate-heavy-fighter")
        .length;
    };
    expect(heavy(0.75, 0.25)).toBe(1);
    expect(heavy(0.74, 0.25)).toBe(0);
    expect(heavy(0.25, 0.75)).toBe(0);
  });

  const EDGES = loadEdgeDraws();

  it("gives Oolite's light-fighter counts at the class boundaries (edge-draws.json)", () => {
    const edge = EDGES.cases.find(
      (candidate) => candidate.id === "pirate-pack-class-count",
    );
    const entry = POPULATOR_ENTRIES.find(
      (candidate) => candidate.name === edge?.entry,
    );
    const loaded = FIXTURES.find(
      (candidate) =>
        edge !== undefined &&
        candidate.id === `${edge.system}-seed${String(edge.seed)}`,
    );
    if (edge === undefined || entry === undefined || loaded === undefined) {
      throw new Error(
        "the pack class edge case is not in the committed oracle",
      );
    }
    expect(edge.probes.length).toBeGreaterThanOrEqual(8);
    for (const probe of edge.probes) {
      // body 0 is the leader's bounty, so r1 and r2 of the light class are the
      // draws numbered 1 and 2: the slots' occurrences 0 and 1 of line 1813.
      const overrides = new Map<number, number>();
      edge.slots.forEach((slot, at) => {
        expect(slot.line).toBe(1813);
        const value = probe.draws[at];
        if (value === undefined) {
          throw new Error("a probe has fewer draws than slots");
        }
        overrides.set(1 + slot.occurrence, value);
      });
      const { draws } = scripted(edge.fixedDraw, overrides);
      const plan = buildGroup(
        entry,
        factsFromFixture(loaded.fixture),
        RECORDS,
        draws,
        { groupIndex: 0 },
      );
      const lights = plan.ships.filter(
        (ship) =>
          ship.role === "pirate-light-fighter" &&
          ship.primaryRole === "pirate-light-fighter",
      );
      expect(lights.length, JSON.stringify(probe.draws)).toBe(probe.result);
    }
  });
});

describe("remote packs: the z rule and the dangerous-system pick", () => {
  const ALL_GROUPS = FIXTURES.flatMap((loaded) =>
    loaded.fixture.groups.map((group) => ({ loaded, group })),
  );

  it("remotePackZ is JavaScript's z % 100000, and its own mirror", () => {
    expect(remotePackZ(372440.8010590076)).toBe(72440.80105900759);
    expect(remotePackZ(99999)).toBe(99999);
    expect(remotePackZ(100000)).toBe(0);
    expect(remotePackZ(-372440.8010590076)).toBe(-72440.80105900759);
    for (const z of [0, 1, 123456.5, 987654.25, 5e6]) {
      expect(remotePackZ(-z)).toBe(-remotePackZ(z));
    }
  });

  it("matches every recorded posIn.z and posOut.z, in Oolite's frame and in the mirror", () => {
    const remote = new Set(
      POPULATOR_ENTRIES.filter((entry) =>
        entry.builder?.endsWith("Remote"),
      ).map((entry) => entry.ordinal),
    );
    expect(remote).toEqual(new Set([21, 24, 27]));
    let moved = 0;
    for (const { loaded, group } of ALL_GROUPS) {
      const at = `${loaded.id} ${String(group.entry)}/${String(group.index)}`;
      if (remote.has(group.entry)) {
        expect(remotePackZ(group.posInZ), at).toBe(group.posOutZ);
        expect(remotePackZ(-group.posInZ), at).toBe(-group.posOutZ);
        if (group.posOutZ !== group.posInZ) {
          moved += 1;
        }
      } else {
        expect(group.posOutZ, at).toBe(group.posInZ);
      }
    }
    expect(moved).toBeGreaterThan(5);
  });

  it("flags exactly the three remote entries' groups for the spawner", () => {
    for (const loaded of FIXTURES) {
      for (const plan of replaySystem(loaded).plans) {
        expect(plan.remotePack, `${loaded.id} ${String(plan.ordinal)}`).toBe(
          [21, 24, 27].includes(plan.ordinal),
        );
      }
    }
  });

  it("sends a remote pack from a very local system the pick could reach", () => {
    const REMOTE = recordedGroupsOf(
      "lightPirateRemote",
      "mediumPirateRemote",
      "heavyPirateRemote",
    );
    expect(REMOTE.length).toBeGreaterThan(5);
    for (const { loaded, group } of REMOTE) {
      const leader = group.ships[0];
      const bounds: Readonly<Record<number, (government: number) => number>> = {
        21: (government) => government - 1,
        24: (government) => Math.min(government - 1, 3),
        27: (government) => Math.min(government - 1, 1),
      };
      const limit = bounds[group.entry]?.(loaded.fixture.inputs.government);
      const candidates = loaded.fixture.inputs.verylocals
        .filter((local) => local.government <= (limit ?? Number.NaN))
        .map((local) => local.id);
      // The pick takes one `system` draw per matching system and falls back to
      // this system when none matches.
      expect(group.draws.system?.length ?? 0).toBe(candidates.length);
      expect([...candidates, loaded.fixture.header.systemIndex]).toContain(
        leader?.homeSystem,
      );
      expect(leader?.destinationSystem).toBe(loaded.fixture.header.systemIndex);
    }
  });

  it("gives each remote wrapper its own danger limit (the heavy one has no recording)", () => {
    const loaded = FIXTURES.find((candidate) => candidate.id === "g0-s7-seed1");
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const base = factsFromFixture(loaded.fixture);
    // government 5 with very local systems of government 0 to 5: the limits
    // are light 4, medium min(4, 3) = 3 and heavy min(4, 1) = 1; every `system`
    // draw is 0.1, so the last matching system wins.
    const facts = {
      ...base,
      government: 5,
      neighbourhood: {
        ...base.neighbourhood,
        verylocals: [0, 1, 2, 3, 4, 5].map((government, at) => ({
          systemIndex: 100 + at,
          government,
          economy: 0,
          techLevelRaw: 0,
        })),
      },
    };
    const homeOf = (name: string): number | undefined => {
      const { draws } = scripted(0.1);
      const plan = buildGroup(entryNamed(name), facts, RECORDS, draws, {
        groupIndex: 0,
      });
      expect(plan.remotePack, name).toBe(true);
      expect(plan.ships[0]?.destinationSystem, name).toBe(base.systemIndex);
      return plan.ships[0]?.homeSystem;
    };
    expect(homeOf("oolite-pirate-light-remote")).toBe(104);
    expect(homeOf("oolite-pirate-medium-remote")).toBe(103);
    expect(homeOf("oolite-pirate-heavy-remote")).toBe(101);
  });

  describe("nearbyDangerousSystem", () => {
    const loaded = FIXTURES.find((candidate) => candidate.id === "g0-s7-seed1");
    if (loaded === undefined) {
      throw new Error("no g0-s7-seed1 fixture");
    }
    const base = factsFromFixture(loaded.fixture);
    const withVeryLocals = (governments: readonly number[]) => ({
      ...base,
      neighbourhood: {
        ...base.neighbourhood,
        verylocals: governments.map((government, at) => ({
          systemIndex: 100 + at,
          government,
          economy: 0,
          techLevelRaw: 0,
        })),
      },
    });

    it("is a reservoir pick: one draw per matching system, the nth replaces at 1/n", () => {
      const facts = withVeryLocals([3, 1, 5, 0, 2]);
      // matching at government <= 2: systems 101, 103, 104 (found 1, 2, 3)
      const pick = (draws: readonly number[]): number => {
        let at = 0;
        const next = (): number => draws[at++] ?? Number.NaN;
        return nearbyDangerousSystem(facts, 2, {
          next,
          nextU32: () => next() * 4_294_967_296,
        });
      };
      expect(pick([0.9, 0.9, 0.9])).toBe(101); // 0.9 < 1/1; 0.9 >= 1/2; 0.9 >= 1/3
      expect(pick([0.9, 0.4, 0.9])).toBe(103);
      expect(pick([0.9, 0.4, 0.2])).toBe(104);
      expect(pick([0.9, 0.5, 0.9])).toBe(101); // strict: 0.5 < 1/2 is false
    });

    it("takes one draw per matching system and none when no system matches", () => {
      const facts = withVeryLocals([3, 1, 5, 0, 2]);
      const matching = scripted(0.9);
      nearbyDangerousSystem(facts, 2, matching.draws);
      expect(matching.taken.get("system")).toBe(3);
      const none = scripted(0.9);
      expect(nearbyDangerousSystem(facts, -1, none.draws)).toBe(
        base.systemIndex,
      );
      expect(none.taken.get("system")).toBeUndefined();
    });

    it("gives this system when there are no very local systems, and never throws on a bad list", () => {
      const none = scripted(0.1);
      expect(nearbyDangerousSystem(withVeryLocals([]), 7, none.draws)).toBe(
        base.systemIndex,
      );
      const malformed = {
        ...base,
        neighbourhood: { ...base.neighbourhood, verylocals: "none" },
      } as unknown as typeof base;
      expect(nearbyDangerousSystem(malformed, 7, none.draws)).toBe(
        base.systemIndex,
      );
    });
  });
});

describe("planSystemGroups: g7-s162 (the empty system)", () => {
  it("plans exactly one group, the station patrol (its builder is pending until Task 3)", () => {
    for (const id of ["g7-s162-seed1", "g7-s162-seed2"]) {
      const loaded = FIXTURES.find((candidate) => candidate.id === id);
      if (loaded === undefined) {
        throw new Error(`no ${id} fixture`);
      }
      const { plans } = replaySystem(loaded);
      expect(plans, id).toHaveLength(1);
      expect(POPULATOR_ENTRIES[plans[0]?.ordinal ?? -1]?.builder, id).toBe(
        "stationPatrol",
      );
    }
  });
});

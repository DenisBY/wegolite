// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The ship kit of the initial populator (Phase 22, plan 22-07, WORLD-08): the
 * script helpers `_setWeapons`, `_setSkill`, `_setFuel` and the engine's
 * initial accuracy, at their boundaries. The recorded replay of whole groups is
 * `traders.oracle.test.ts`; these cases pin the arithmetic the replay does not
 * reach on its own.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { createRngState, rngNext } from "../../../../src/sim/rng.js";
import {
  MAX_BOUNTY,
  MAX_ESCORT_SLOT,
} from "../../../../src/sim/world/limits.js";
import { pickRecord } from "../../../../src/sim/world/populate.js";
import { setUpEscorts } from "../../../../src/sim/world/population/escorts.js";
import {
  buildGroup,
  pickPopulationRecord,
  type PopulationRecord,
} from "../../../../src/sim/world/population/groups.js";
import {
  SKILL_LEVEL_BIAS,
  SKILL_LEVEL_MAXIMUM,
  WEAPON_LEVEL_BIAS,
  clampAccuracy,
  createPlannedShip,
  fuelTenths,
  initialAccuracy,
  pickForRole,
  setFuel,
  setReturnFuel,
  setSkill,
  setWeapons,
  weightedNearbyTradeSystem,
  type WeaponMounts,
} from "../../../../src/sim/world/population/kit.js";
import type { PopulationDraws } from "../../../../src/sim/world/population/streams.js";
import { POPULATOR_ENTRIES } from "../../../../src/sim/world/population/table.js";
import {
  committedPopulationRecords,
  factsFromFixture,
  loadEdgeDraws,
  loadPopulationFixture,
} from "../../../helpers/population-fixtures.js";

const RECORDS = committedPopulationRecords();

/** A draw source that must not be called. */
const NO_DRAW = (): number => {
  throw new Error("no draw expected");
};

/** A draw source that returns `values` in turn and counts its calls. */
function draws(...values: number[]): {
  next: () => number;
  taken: () => number;
} {
  let at = 0;
  return {
    next: () => {
      const value = values[at];
      if (value === undefined) {
        throw new Error(`draw #${String(at)} is used up`);
      }
      at += 1;
      return value;
    },
    taken: () => at,
  };
}

function mounts(): WeaponMounts {
  return { fore: null, aft: null };
}

describe("setWeapons (_setWeapons, oolite-populator.js:2217-2273)", () => {
  it("keeps choice 2 at level 2.5 when the draw equals the fraction (strict >)", () => {
    const ship = mounts();
    expect(setWeapons(ship, 2.5, true, () => 0.5)).toBe(true);
    expect(ship).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_NONE",
    });
  });

  it("rounds level 2.5 up to choice 3 for a draw below the fraction", () => {
    const ship = mounts();
    setWeapons(ship, 2.5, true, () => 0.49);
    expect(ship).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
    });
  });

  it("takes one draw even for an integer level", () => {
    const source = draws(0.99);
    const ship = mounts();
    setWeapons(ship, 3, true, source.next);
    expect(source.taken()).toBe(1);
    expect(ship.fore).toBe("EQ_WEAPON_BEAM_LASER");
  });

  it("writes the table of levels 1 to 5", () => {
    const at = (level: number): WeaponMounts => {
      const ship = mounts();
      setWeapons(ship, level, true, () => 0);
      return ship;
    };
    expect(at(1)).toEqual({
      fore: "EQ_WEAPON_PULSE_LASER",
      aft: "EQ_WEAPON_NONE",
    });
    expect(at(2)).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_NONE",
    });
    expect(at(3)).toEqual({
      fore: "EQ_WEAPON_BEAM_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
    });
    expect(at(4)).toEqual({
      fore: "EQ_WEAPON_MILITARY_LASER",
      aft: "EQ_WEAPON_BEAM_LASER",
    });
    expect(at(5)).toEqual({
      fore: "EQ_WEAPON_MILITARY_LASER",
      aft: "EQ_WEAPON_MILITARY_LASER",
    });
    expect(at(0.2)).toEqual(at(1));
  });

  it("takes no draw and changes nothing without auto_weapons", () => {
    const ship: WeaponMounts = { fore: "EQ_WEAPON_BEAM_LASER", aft: null };
    expect(setWeapons(ship, 2.5, false, NO_DRAW)).toBe(false);
    expect(ship).toEqual({ fore: "EQ_WEAPON_BEAM_LASER", aft: null });
  });
});

describe("setSkill (_setSkill, oolite-populator.js:2276-2294)", () => {
  it("takes no draw at accuracy 5 or above, bias 0 or without auto_weapons", () => {
    expect(setSkill(5, 2, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(5);
    expect(setSkill(9.5, 2, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(9.5);
    expect(setSkill(1, 0, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(1);
    expect(setSkill(1, 2, false, "CLASS_NEUTRAL", NO_DRAW)).toBe(1);
  });

  it("moves toward 4.99 |bias| times by the draw's fraction of the distance", () => {
    const source = draws(0.5, 0.5);
    const result = setSkill(0, 2, true, "CLASS_NEUTRAL", source.next);
    expect(source.taken()).toBe(2);
    // 0 + (4.99 - 0) * 0.5 = 2.495, then 2.495 + (4.99 - 2.495) * 0.5.
    expect(result).toBe(Math.fround(2.495 + (4.99 - 2.495) * 0.5));
  });

  it("moves toward -5 for a negative bias", () => {
    const source = draws(0.5);
    expect(setSkill(1, -1, true, "CLASS_NEUTRAL", source.next)).toBe(
      Math.fround(1 + (-5 - 1) * 0.5),
    );
  });

  it("writes a float32 value inside the accuracy range", () => {
    const result = setSkill(-4.9, 64, true, "CLASS_NEUTRAL", () => 0.999);
    expect(result).toBe(Math.fround(result));
    expect(result).toBeGreaterThanOrEqual(-5);
    expect(result).toBeLessThanOrEqual(10);
  });

  it("ignores a non-finite bias instead of looping", () => {
    expect(setSkill(0, Infinity, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(0);
    expect(setSkill(0, Number.NaN, true, "CLASS_NEUTRAL", NO_DRAW)).toBe(0);
  });
});

describe("fuel (_setFuel, OOJSShip.m:1315-1320)", () => {
  it("is 2 tenths for a home 17 chart units away and 0 for 18", () => {
    expect(setFuel(5, 1, () => 0.4 * 17)).toBe(2);
    expect(setFuel(5, 1, () => 0.4 * 18)).toBe(0);
  });

  it("is 70 for a ship at home", () => {
    expect(
      setFuel(1, 1, () => {
        throw new Error("no distance needed at home");
      }),
    ).toBe(70);
  });

  it("holds nothing for an unknown or non-finite distance", () => {
    expect(setFuel(5, 1, () => undefined)).toBe(0);
    expect(fuelTenths(Number.NaN)).toBe(0);
    expect(fuelTenths(-3)).toBe(70 - 70);
    expect(fuelTenths(100)).toBe(70);
  });

  it("applies the same rule to the destination (_setReturnFuel)", () => {
    expect(setReturnFuel(5, 1, () => 0.4 * 17)).toBe(2);
    expect(setReturnFuel(1, 1, () => 0)).toBe(70);
  });
});

describe("initial accuracy (ShipEntity.m:658-676)", () => {
  it("is randf * 10 - 5 as a float32", () => {
    expect(initialAccuracy(0.25, "CLASS_NEUTRAL")).toBe(Math.fround(-2.5));
    expect(initialAccuracy(0.123456789, "CLASS_NEUTRAL")).toBe(
      Math.fround(0.123456789 * 10 - 5),
    );
  });

  it("is never negative for police and military pilots", () => {
    for (const draw of [0, 0.1, 0.25, 0.49999, 0.5, 0.9]) {
      expect(initialAccuracy(draw, "CLASS_POLICE")).toBeGreaterThanOrEqual(0);
      expect(initialAccuracy(draw, "CLASS_MILITARY")).toBeGreaterThanOrEqual(0);
    }
    expect(initialAccuracy(0, "CLASS_POLICE")).toBe(5);
  });

  it("clamps through setAccuracy (a missile never goes below 0)", () => {
    expect(clampAccuracy(-7, "CLASS_NEUTRAL")).toBe(-5);
    expect(clampAccuracy(12, "CLASS_NEUTRAL")).toBe(10);
    expect(clampAccuracy(-1, "CLASS_MISSILE")).toBe(0);
  });
});

describe("the script constants the fixtures record", () => {
  it("equal the start-up values of every fixture header", () => {
    const { startUp } = loadPopulationFixture("g0-s7-seed1").header;
    expect(startUp.weaponLevelBias).toBe(WEAPON_LEVEL_BIAS);
    expect(startUp.skillLevelBias).toBe(SKILL_LEVEL_BIAS);
    expect(startUp.skillLevelMaximum).toBe(SKILL_LEVEL_MAXIMUM);
  });
});

describe("_setWeapons at the recorded boundary (edge-draws.json)", () => {
  const edge = loadEdgeDraws().cases.find(
    (candidate) => candidate.id === "set-weapons-level-one-and-a-half",
  );

  it("is in the committed oracle", () => {
    expect(edge).toBeDefined();
    expect(edge?.site).toContain("oolite-populator.js:2242");
  });

  it("gives Oolite's mounts for level 1.5 at every recorded draw (equality at 0.5)", () => {
    // `_addLightHunter` calls `_setWeapons(ship, 1.5)` (`oolite-populator.js:
    // 1578-1590`); the case records the first ship's `forward/aft` weapons.
    expect(edge?.probes.length ?? 0).toBeGreaterThanOrEqual(4);
    for (const probe of edge?.probes ?? []) {
      const ship = mounts();
      setWeapons(ship, 1.5, true, () => probe.draws[0] ?? Number.NaN);
      expect(`${String(ship.fore)}/${String(ship.aft)}`).toBe(probe.result);
    }
  });
});

describe("the record pick", () => {
  const roleNames = [
    ...new Set(
      RECORDS.flatMap((record) =>
        record.roles.map((token) => token.replace(/\(.*$/, "")),
      ),
    ),
  ];

  /** The draws `pickForRole` takes for `role` over `records`. */
  function drawsTaken(
    records: readonly PopulationRecord[],
    role: string,
  ): number {
    let taken = 0;
    pickForRole(
      {
        next: () => {
          taken += 1;
          return 0.5;
        },
        nextU32: () => {
          taken += 1;
          return 1;
        },
      },
      records,
      role,
    );
    return taken;
  }

  it("takes no draw for a role with zero or one record and one draw otherwise", () => {
    expect(drawsTaken(RECORDS, "no-such-role")).toBe(0);
    expect(drawsTaken(RECORDS, "trader")).toBe(1);
    const single = RECORDS.filter((record) => record.key === "morayMED");
    expect(drawsTaken(single, "sunskim-trader")).toBe(0);
    expect(drawsTaken([], "trader")).toBe(0);
  });

  it("gives the frozen pickRecord's record for the same stream state (every role)", () => {
    expect(roleNames.length).toBeGreaterThan(10);
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.constantFrom(...roleNames),
        (seed, role) => {
          const state = createRngState(seed);
          const copy = createRngState(seed);
          const ours = pickPopulationRecord(rngNext(state), RECORDS, role);
          const frozen = pickRecord(copy, RECORDS, role);
          expect(ours?.key).toBe(frozen?.key);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("never picks a record without a positive weight for the role", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true }), (draw) => {
        const picked = pickPopulationRecord(draw, RECORDS, "escort-medium");
        expect(
          picked?.roles.some((token) => token.startsWith("escort-medium")),
        ).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

/** Draws that cycle through `values` (and the same values as integers). */
function cycling(values: readonly number[]): PopulationDraws {
  let at = 0;
  const take = (): number => {
    const value = values[at % values.length] ?? 0;
    at += 1;
    return value;
  };
  return {
    next: () => take(),
    nextU32: () => Math.floor(take() * 4_294_967_296),
  };
}

function record(overrides: Partial<PopulationRecord>): PopulationRecord {
  const base = RECORDS.find((candidate) => candidate.key === "boa");
  if (base === undefined) {
    throw new Error("no boa record");
  }
  return { ...base, ...overrides };
}

describe("escorts (ShipEntity.m:1532-1771, Universe.m:2657-2665)", () => {
  const lave = factsFromFixture(loadPopulationFixture("g0-s7-seed1"));
  const escortRecords = [
    record({ key: "e1", roles: ["escort"], escortRoles: null, bounty: 0 }),
    record({
      key: "e2",
      roles: ["escort-medium"],
      escortRoles: null,
      bounty: 0,
    }),
  ];
  /** A mother with `roles` as its `escort_roles`, plus two escort hulls. */
  const world = (
    roles: PopulationRecord["escortRoles"],
  ): readonly PopulationRecord[] => [
    record({ key: "mother", roles: ["trader"], escortRoles: roles }),
    ...escortRecords,
  ];
  const motherOf = (
    records: readonly PopulationRecord[],
  ): NonNullable<ReturnType<typeof createPlannedShip>> => {
    const mother = createPlannedShip(
      "trader",
      records,
      lave.systemIndex,
      cycling([0.1]),
    );
    if (mother === undefined) {
      throw new Error("no mother");
    }
    return mother;
  };

  it("removes the escorts of a role of exactly trader and no other", () => {
    const mine = world([{ min: 2, max: 2, role: "escort" }]);
    const trader = motherOf(mine);
    const courier = motherOf(mine);
    // `u % 7 < 7` always passes: government 7 removes every escort.
    expect(
      setUpEscorts(trader, mine, 7, cycling([0.3]), "trader", 0),
    ).toHaveLength(0);
    expect(trader.groupRecord).toBe(false);
    expect(
      setUpEscorts(courier, mine, 7, cycling([0.3]), "trader-courier", 0),
    ).toHaveLength(2);
    expect(courier.groupRecord).toBe(true);
  });

  it("takes min..max-1 rolls per entry and counts an empty role without a ship", () => {
    const mine = world([
      { min: 0, max: 3, role: "" },
      { min: 1, max: 2, role: "escort" },
    ]);
    const leader = motherOf(mine);
    let escortDraws = 0;
    const source: PopulationDraws = {
      next: () => 0.5,
      nextU32: (tag) => {
        if (tag === "escort") {
          escortDraws += 1;
        }
        // `% 11 < government + 2` never passes at government 0: u % 11 = 10.
        return 10;
      },
    };
    const escorts = setUpEscorts(leader, mine, 0, source, "trader-courier", 0);
    // Entry 1 rolls for i = 0, 1, 2 and holds three empty slots; entry 2 rolls
    // once (i = 1) and fills slots 3 and 4.
    expect(escortDraws).toBe(4);
    expect(escorts.map((escort) => escort.escortSlot)).toEqual([3, 4]);
  });

  it("stops at 16 escorts and gives slots 0 to 15", () => {
    const mine = world([
      { min: 16, max: 16, role: "escort" },
      { min: 8, max: 8, role: "escort-medium" },
    ]);
    const escorts = setUpEscorts(
      motherOf(mine),
      mine,
      0,
      cycling([0.4]),
      "x",
      0,
    );
    expect(escorts).toHaveLength(16);
    expect(escorts.map((escort) => escort.escortSlot)).toEqual(
      Array.from({ length: 16 }, (_, at) => at),
    );
    expect(Math.max(...escorts.map((escort) => escort.escortSlot ?? 0))).toBe(
      MAX_ESCORT_SLOT,
    );
  });

  it("ends an entry whose role has no record and goes on with the next", () => {
    const mine = world([
      { min: 3, max: 3, role: "no-such-role" },
      { min: 1, max: 1, role: "escort" },
    ]);
    const escorts = setUpEscorts(
      motherOf(mine),
      mine,
      0,
      cycling([0.4]),
      "x",
      0,
    );
    expect(escorts.map((escort) => escort.escortSlot)).toEqual([0]);
  });

  it("gives an offender mother's escorts 1 | (ranrot & 15) and a clean mother's none", () => {
    const mine = world([{ min: 2, max: 2, role: "escort" }]);
    const first = motherOf(mine);
    first.bounty = 40;
    // u32 = 0.5 * 2^32 has a low nibble of 0, so extra = 1 | 0 = 1.
    expect(
      setUpEscorts(first, mine, 0, cycling([0.5]), "x", 0).map(
        (escort) => escort.bounty,
      ),
    ).toEqual([1, 1]);
    // floor(0.7 * 2^32) = 3006477107: & 15 = 3, extra = 1 | 3 = 3.
    const second = motherOf(mine);
    second.bounty = 40;
    expect(
      setUpEscorts(second, mine, 0, cycling([0.7]), "x", 0).map(
        (escort) => escort.bounty,
      ),
    ).toEqual([3, 3]);
    expect(
      setUpEscorts(motherOf(mine), mine, 0, cycling([0.7]), "x", 0).map(
        (escort) => escort.bounty,
      ),
    ).toEqual([0, 0]);
  });
});

describe("buildGroup totality (fast-check)", () => {
  const lave = factsFromFixture(loadPopulationFixture("g0-s7-seed1"));
  const entry = POPULATOR_ENTRIES[5];
  if (entry === undefined) {
    throw new Error("no freighter entry");
  }

  const number = fc.oneof(
    fc.double(),
    fc.constantFrom(
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      0,
      -1,
      1e300,
      127,
      -128,
    ),
  );
  const word = fc.oneof(
    fc.constantFrom(
      "trader",
      "trader(0.5)",
      "trader(NaN)",
      "trader(-1)",
      "trader(Infinity)",
      "escort",
      "escort-medium(2)",
      "constructor",
      "__proto__",
      "toString",
      "",
      "[trader]",
      "(",
    ),
    fc.string(),
  );
  const arbitraryRecord = fc.record({
    key: word,
    name: fc.oneof(word, fc.constant("Medical Boat")),
    roles: fc.array(word, { maxLength: 6 }),
    scanClass: fc.constantFrom("CLASS_NEUTRAL", "CLASS_POLICE", "CLASS_X", ""),
    radius: number,
    maxEnergy: number,
    energyRechargeRate: number,
    likelyCargo: number,
    maxCargo: number,
    autoAi: number,
    autoWeapons: number,
    hasFuelInjection: number,
    hyperspaceMotor: fc.boolean(),
    escortRoles: fc.oneof(
      fc.constant(null),
      fc.array(fc.record({ min: number, max: number, role: word }), {
        maxLength: 20,
      }),
    ),
    forwardWeapon: word,
    aftWeapon: word,
    fuel: number,
    bounty: number,
  });
  const arbitraryDraws = fc
    .array(fc.double({ min: 0, max: 1, maxExcluded: true, noNaN: true }), {
      minLength: 1,
      maxLength: 12,
    })
    .map(cycling);

  it("never throws and keeps every planned field in range", () => {
    fc.assert(
      fc.property(
        fc.array(arbitraryRecord, { maxLength: 8 }),
        arbitraryDraws,
        number,
        number,
        fc.boolean(),
        (records, draws, government, economy, arriving) => {
          const plan = buildGroup(
            entry,
            { ...lave, government, economy },
            records,
            draws,
            { groupIndex: 0, arriving },
          );
          expect(plan.ships.length).toBeLessThanOrEqual(1 + 16);
          plan.ships.forEach((ship) => {
            if (ship.escortSlot !== null) {
              expect(ship.escortSlot).toBeGreaterThanOrEqual(0);
              expect(ship.escortSlot).toBeLessThanOrEqual(MAX_ESCORT_SLOT);
            }
            expect(Number.isInteger(ship.bounty)).toBe(true);
            expect(ship.bounty).toBeGreaterThanOrEqual(0);
            expect(ship.bounty).toBeLessThanOrEqual(MAX_BOUNTY);
            expect(Number.isInteger(ship.fuel)).toBe(true);
            expect(Number.isInteger(ship.homeSystem)).toBe(true);
            for (const index of [ship.leaderIndex, ship.ownerIndex]) {
              if (index !== null) {
                expect(index).toBeGreaterThanOrEqual(0);
                expect(index).toBeLessThan(plan.ships.length);
              }
            }
          });
        },
      ),
      { numRuns: 200 },
    );
  });

  it("plans an empty group, with no draw, for an empty catalogue", () => {
    const refuse: PopulationDraws = {
      next: () => {
        throw new Error("no draw expected");
      },
      nextU32: () => {
        throw new Error("no draw expected");
      },
    };
    expect(
      buildGroup(entry, lave, [], refuse, { groupIndex: 0 }).ships,
    ).toEqual([]);
  });

  it("takes a trade system from the locals for every draw", () => {
    fc.assert(
      fc.property(fc.double({ min: 0, max: 1, maxExcluded: true }), (draw) => {
        const id = weightedNearbyTradeSystem(lave, cycling([draw]));
        expect(
          lave.neighbourhood.locals.some((local) => local.systemIndex === id),
        ).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

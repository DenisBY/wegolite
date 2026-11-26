// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The compact file form of a population fixture (Phase 22, plan 22-02).
 *
 * A fixture holds everything the port is replayed against, for one (system,
 * seed): the draws of every site, the engine calls and every ship. Written out
 * field by field (plan 22-01) one fixture is 13 to 190 KB, and the 35-system
 * sample would be 8.9 MB against D-04's "hundreds of KB". The file form below
 * is lossless for everything `PopulationFixtureSchema` holds and is about
 * 16 times smaller:
 *
 * - the constants of the script (entry names, priorities, locations, the
 *   `startUp` values, the pin) are not repeated per file; `POPULATION_ENTRY_TABLE`
 *   and `POPULATION_STARTUP` carry them, and the recorder refuses to write a
 *   fixture whose recorded values differ from them;
 * - repeated strings (catalogue keys, roles, weapons, member names) are stored
 *   once per file in `dict` and referenced by index;
 * - a ship, a call, a ship group and a group are tuples, not objects;
 * - the draws of one site are one string of seven base-36 digits per draw;
 * - accuracy is the shortest decimal that rounds to the same float32.
 *
 * Use {@link decodePopulationFixture} to read a file and
 * {@link encodePopulationFixture} to write one; both are exact inverses, which
 * the recorder checks on every fixture it writes. This module imports `zod`
 * and relative files only (`tests/guards/oracle-independence.test.ts`).
 */

import { z } from "zod";

import {
  POPULATION_CARGO_KINDS,
  POPULATION_DRAW_TAGS,
  POPULATION_ENTRY_NAMES,
  POPULATION_OOLITE_PIN,
  POPULATION_SCRIPT_FILE,
  POPULATION_SCRIPT_SHA256,
  PopulationFixtureSchema,
  type PopulationDraws,
  type PopulationDrawTag,
  type PopulationEntry,
  type PopulationFixture,
  type PopulationGroup,
  type PopulationShip,
} from "./schema.js";

/** What every entry of the script registers besides its count. */
export interface PopulationEntryConstants {
  readonly name: (typeof POPULATION_ENTRY_NAMES)[number];
  readonly priority: number;
  readonly location: string;
  /** Whether the `groupCount` comes from `randomise` (three `count` draws). */
  readonly counted: boolean;
  /** A path the port does not model: its callbacks are not run. */
  readonly cut: boolean;
}

const ENTRY_ROWS: readonly (readonly [
  (typeof POPULATION_ENTRY_NAMES)[number],
  number,
  string,
  boolean,
  boolean,
])[] = [
  ["oolite-nav-buoy", 5, "COORDINATES", false, true],
  ["oolite-witch-buoy", 10, "COORDINATES", false, true],
  ["oolite-route1-asteroids", 20, "LANE_WP", false, true],
  ["oolite-route2-asteroids", 20, "LANE_PS", false, true],
  ["oolite-offlane-hermit", 99, "PLANET_ORBIT_HIGH", false, true],
  ["oolite-freighters", 40, "LANE_WP", true, false],
  ["oolite-freighters-docking", 40, "STATION_AEGIS", true, false],
  ["oolite-couriers-route1", 40, "LANE_WP", true, false],
  ["oolite-couriers-route3", 40, "LANE_WS", true, false],
  ["oolite-smugglers", 40, "LANE_WP", true, false],
  ["oolite-hunters-triangle", 40, "LANE_WPS", true, false],
  ["oolite-hunters-route1", 40, "LANE_WP", true, false],
  ["oolite-hunters-medium-route1", 40, "LANE_WP", true, true],
  ["oolite-hunters-medium-route3", 40, "LANE_WS", true, true],
  ["oolite-hunters-heavy-route1", 40, "LANE_WP", true, true],
  ["oolite-hunters-heavy-route3", 40, "LANE_WS", true, true],
  ["oolite-pirate-independent-route1", 40, "LANE_WP", true, false],
  ["oolite-pirate-independent-route2", 40, "LANE_PS", true, false],
  ["oolite-pirate-independent-route3", 40, "LANE_WS", true, false],
  ["oolite-pirate-light-route1", 40, "LANE_WP", true, false],
  ["oolite-pirate-light-triangle", 40, "LANE_WPS", true, false],
  ["oolite-pirate-light-remote", 40, "LANE_WP", true, false],
  ["oolite-pirate-medium-route1", 40, "LANE_WP", true, false],
  ["oolite-pirate-medium-triangle", 40, "LANE_WPS", true, false],
  ["oolite-pirate-medium-remote", 40, "LANE_WP", true, false],
  ["oolite-pirate-heavy-route1", 40, "LANE_WP", true, false],
  ["oolite-pirate-heavy-triangle", 40, "LANE_WPS", true, false],
  ["oolite-pirate-heavy-remote", 40, "LANE_WP", true, false],
  ["oolite-assassins", 40, "WITCHPOINT", true, true],
  ["oolite-police-route1", 40, "LANE_WP", true, false],
  ["oolite-police-triangle", 40, "LANE_WPS", true, false],
  ["oolite-police-stationpatrol", 40, "STATION_AEGIS", false, false],
  ["oolite-interceptors-route1", 40, "LANE_WP", true, false],
  ["oolite-interceptors-witchpoint", 40, "WITCHPOINT", true, false],
  ["oolite-thargoid-scouts", 40, "LANE_WPS", true, true],
  ["oolite-thargoid-strike", 40, "LANE_WPS", true, true],
];

/**
 * The script's registration constants per entry, in registration order
 * (`oolite-populator.js:111-986`). Read from the recorded fixtures of plan
 * 22-01; the recorder compares every recording against this table and stops on
 * a difference, so it cannot drift from the script.
 */
export const POPULATION_ENTRY_TABLE: readonly PopulationEntryConstants[] =
  ENTRY_ROWS.map(([name, priority, location, counted, cut]) => ({
    name,
    priority,
    location,
    counted,
    cut,
  }));

/** The values `startUp` leaves behind (`oolite-populator.js`, `startUp`). */
export const POPULATION_STARTUP = {
  medicalPattern: "medical",
  medicalFlags: "i",
  weaponLevelBias: 0,
  skillLevelBias: 0,
  skillLevelMaximum: 4.99,
} as const;

type WriteValue = string | number | boolean | null;

/** The seven-digit base-36 width of one draw (36^7 > 2^32). */
const DRAW_WIDTH = 7;

const FUNCTIONS = ["addShips", "addGroup"] as const;

const DrawString = z.string().regex(/^(?:[0-9a-z]{7})*$/);
const Index = z.number().int().min(0);
/** An optional integer: -1 is null, -2 is the station group. */
const Link = z.number().int().min(-2);

const ShipTuple = z.tuple([
  Index, // key (dict)
  Index, // role (dict)
  Index, // primaryRole (dict)
  Index, // bounty
  Index, // cargoKind (POPULATION_CARGO_KINDS)
  Index, // cargoCount
  Index, // forwardWeapon (dict)
  Index, // aftWeapon (dict)
  z.number(), // accuracy, shortest float32 decimal
  Index, // fuel
  Index, // homeSystem
  Index, // destinationSystem
  z.union([z.literal(0), z.literal(1)]), // injector
  Link, // group
  Link, // leader
  Link, // owner
  Link, // escortSlot
  z.array(Index), // equipment (dict)
  z.array(
    z.tuple([Index, z.union([z.string(), z.number(), z.boolean(), z.null()])]),
  ), // cut writes: member (dict), value
]);

const CallTuple = z.tuple([
  z.union([z.literal(0), z.literal(1)]), // fn
  Index, // role (dict)
  z.number().int().min(1).max(64), // count
  z.number(), // spread
  z.array(Index), // ships
]);

const ShipGroupTuple = z.tuple([
  Index, // name (dict)
  Link, // leader
  z.array(Index), // members
]);

const GroupTuple = z.tuple([
  Index, // entry
  z.number(), // posInZ
  z.number().nullable(), // posOutZ, null when it equals posInZ
  z.partialRecord(z.enum(POPULATION_DRAW_TAGS), DrawString),
  z.array(CallTuple),
  z.array(ShipTuple),
  z.array(ShipGroupTuple),
]);

const EntryTuple = z.tuple([
  Index.nullable(), // groupCount
  DrawString, // countDraws
  DrawString, // setupDraws
]);

/** The strict shape of a fixture file. */
export const PopulationFixtureFileSchema = z.strictObject({
  system: z.string().regex(/^g[0-7]-s\d+$/),
  seed: Index,
  dict: z.array(z.string()),
  inputs: PopulationFixtureSchema.shape.inputs,
  entries: z.array(EntryTuple).length(POPULATION_ENTRY_NAMES.length),
  groups: z.array(GroupTuple),
  inventory: PopulationFixtureSchema.shape.inventory,
});

export type PopulationFixtureFile = z.infer<typeof PopulationFixtureFileSchema>;

// ---------------------------------------------------------------------------

function encodeDraws(draws: readonly number[]): string {
  return draws
    .map((draw) => draw.toString(36).padStart(DRAW_WIDTH, "0"))
    .join("");
}

function decodeDraws(text: string): number[] {
  const draws: number[] = [];
  for (let at = 0; at < text.length; at += DRAW_WIDTH) {
    draws.push(Number.parseInt(text.slice(at, at + DRAW_WIDTH), 36));
  }
  return draws;
}

/** The shortest decimal that rounds to the same float32. */
function shortFloat32(value: number): number {
  for (let digits = 1; digits <= 9; digits += 1) {
    const candidate = Number(value.toPrecision(digits));
    if (Math.fround(candidate) === value) {
      return candidate;
    }
  }
  return value;
}

function engineOrder(): number[] {
  return POPULATION_ENTRY_TABLE.map((entry, ordinal) => ({
    ordinal,
    priority: entry.priority,
  }))
    .sort((a, b) => a.priority - b.priority || a.ordinal - b.ordinal)
    .map((entry) => entry.ordinal);
}

/** The first-use string table of one file. */
class Dictionary {
  public readonly strings: string[] = [];
  private readonly _index = new Map<string, number>();

  public add(text: string): number {
    let at = this._index.get(text);
    if (at === undefined) {
      at = this.strings.length;
      this.strings.push(text);
      this._index.set(text, at);
    }
    return at;
  }
}

const NONE = -1;
const STATION = -2;

function linkOf(value: number | "station" | null): number {
  return value === null ? NONE : value === "station" ? STATION : value;
}

function unlink(value: number): number | null {
  return value === NONE ? null : value;
}

/** Fixture to its file form. Throws when the fixture is not encodable. */
export function encodePopulationFixture(
  fixture: PopulationFixture,
): PopulationFixtureFile {
  const dict = new Dictionary();
  const entries = fixture.entries.map((entry) => {
    const constants = POPULATION_ENTRY_TABLE[entry.ordinal];
    if (
      constants === undefined ||
      constants.name !== entry.name ||
      constants.priority !== entry.priority ||
      constants.location !== entry.location ||
      constants.counted !== entry.counted ||
      constants.cut !== entry.cut
    ) {
      throw new Error(
        `entry ${String(entry.ordinal)} (${entry.name}) differs from POPULATION_ENTRY_TABLE`,
      );
    }
    return [
      entry.groupCount,
      encodeDraws(entry.countDraws),
      encodeDraws(entry.setupDraws),
    ] as [number | null, string, string];
  });
  const groups = fixture.groups.map((group) => {
    const draws: Record<string, string> = {};
    for (const tag of POPULATION_DRAW_TAGS) {
      const list = group.draws[tag];
      if (list !== undefined) {
        draws[tag] = encodeDraws(list);
      }
    }
    return [
      group.entry,
      group.posInZ,
      group.posOutZ === group.posInZ ? null : group.posOutZ,
      draws,
      group.calls.map((call) => [
        FUNCTIONS.indexOf(call.fn) as 0 | 1,
        dict.add(call.role),
        call.count,
        call.spread,
        [...call.ships],
      ]),
      group.ships.map((ship) => [
        dict.add(ship.key),
        dict.add(ship.role),
        dict.add(ship.primaryRole),
        ship.bounty,
        POPULATION_CARGO_KINDS.indexOf(ship.cargoKind),
        ship.cargoCount,
        dict.add(ship.forwardWeapon),
        dict.add(ship.aftWeapon),
        shortFloat32(ship.accuracy),
        ship.fuel,
        ship.homeSystem,
        ship.destinationSystem,
        ship.injector ? 1 : 0,
        linkOf(ship.group),
        linkOf(ship.leader),
        linkOf(ship.owner),
        linkOf(ship.escortSlot),
        ship.equipment.map((item) => dict.add(item)),
        ship.writes.map((write) => {
          if (write.cut !== true) {
            throw new Error(
              `ship ${String(ship.index)} keeps a non-cut write (${write.member}); only cut writes are stored`,
            );
          }
          return [dict.add(write.member), write.value] as [number, WriteValue];
        }),
      ]),
      group.shipGroups.map((shipGroup) => [
        dict.add(shipGroup.name),
        linkOf(shipGroup.leader),
        [...shipGroup.members],
      ]),
    ];
  });
  return PopulationFixtureFileSchema.parse({
    system: fixture.header.system,
    seed: fixture.header.seed,
    dict: dict.strings,
    inputs: fixture.inputs,
    entries,
    groups,
    inventory: fixture.inventory,
  });
}

/** A file (any parsed JSON) to the logical fixture; strict on both sides. */
export function decodePopulationFixture(json: unknown): PopulationFixture {
  const file = PopulationFixtureFileSchema.parse(json);
  const word = (at: number): string => {
    const text = file.dict[at];
    if (text === undefined) {
      throw new Error(`dictionary index ${String(at)} is out of range`);
    }
    return text;
  };
  const match = /^g([0-7])-s(\d+)$/.exec(file.system);
  const entries: PopulationEntry[] = file.entries.map((row, ordinal) => {
    const constants = POPULATION_ENTRY_TABLE[ordinal];
    if (constants === undefined) {
      throw new Error(`no entry ${String(ordinal)}`);
    }
    return {
      ordinal,
      name: constants.name,
      priority: constants.priority,
      location: constants.location,
      groupCount: row[0],
      count: row[0] ?? 1,
      counted: constants.counted,
      cut: constants.cut,
      countDraws: decodeDraws(row[1]),
      setupDraws: decodeDraws(row[2]),
    };
  });
  const perEntry = new Map<number, number>();
  const groups: PopulationGroup[] = file.groups.map((row) => {
    const [entry, posInZ, posOutZ, drawsFile, calls, ships, shipGroups] = row;
    const index = perEntry.get(entry) ?? 0;
    perEntry.set(entry, index + 1);
    const draws: PopulationDraws = {};
    for (const tag of POPULATION_DRAW_TAGS) {
      const text = drawsFile[tag];
      if (text !== undefined) {
        draws[tag as PopulationDrawTag] = decodeDraws(text);
      }
    }
    const constants = POPULATION_ENTRY_TABLE[entry];
    if (constants === undefined) {
      throw new Error(`group names entry ${String(entry)}`);
    }
    return {
      entry,
      index,
      location: constants.location,
      posInZ,
      posOutZ: posOutZ ?? posInZ,
      draws,
      calls: calls.map((call) => ({
        fn: FUNCTIONS[call[0]],
        role: word(call[1]),
        count: call[2],
        spread: call[3],
        ships: [...call[4]],
      })),
      ships: ships.map((ship, at): PopulationShip => ({
        index: at,
        key: word(ship[0]),
        role: word(ship[1]),
        primaryRole: word(ship[2]),
        bounty: ship[3],
        cargoKind: POPULATION_CARGO_KINDS[ship[4]] ?? "unset",
        cargoCount: ship[5],
        forwardWeapon: word(ship[6]),
        aftWeapon: word(ship[7]),
        accuracy: Math.fround(ship[8]),
        fuel: ship[9],
        homeSystem: ship[10],
        destinationSystem: ship[11],
        injector: ship[12] === 1,
        group: ship[13] === STATION ? "station" : unlink(ship[13]),
        leader: unlink(ship[14]),
        owner: unlink(ship[15]),
        escortSlot: unlink(ship[16]),
        equipment: ship[17].map(word),
        writes: ship[18].map((write) => ({
          member: word(write[0]),
          value: write[1],
          cut: true as const,
        })),
      })),
      shipGroups: shipGroups.map((shipGroup) => ({
        name: word(shipGroup[0]),
        leader: unlink(shipGroup[1]),
        members: [...shipGroup[2]],
      })),
    };
  });
  return PopulationFixtureSchema.parse({
    header: {
      oolitePin: POPULATION_OOLITE_PIN,
      scriptFile: POPULATION_SCRIPT_FILE,
      scriptSha256: POPULATION_SCRIPT_SHA256,
      system: file.system,
      galaxy: Number(match?.[1]),
      systemIndex: Number(match?.[2]),
      seed: file.seed,
      startUp: POPULATION_STARTUP,
    },
    inputs: file.inputs,
    entries,
    engineOrder: engineOrder(),
    groups,
    inventory: file.inventory,
  });
}

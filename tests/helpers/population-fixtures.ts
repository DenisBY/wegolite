// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared replay helper of the population tests (Phase 22, plans 22-06 to
 * 22-09): it loads the recorded fixtures of `tests/oracles/population/`, turns
 * a fixture's recorded inputs into the planner's {@link SystemFacts}, and
 * hands the recorded draws back through the same interfaces the port draws
 * from, so a replay test feeds Oolite's own draws to the port and compares
 * what comes out.
 *
 * The fixtures are Oolite's output (`tools/ai-harness/populator-record.ts`
 * runs the pinned `oolite-populator.js`), never edited to match the port.
 */

import { readFileSync, readdirSync } from "node:fs";

import type { System } from "../../src/content/types.js";
import {
  buildNeighbourhood,
  type Neighbour,
  type Neighbourhood,
} from "../../src/sim/world/neighbourhood.js";
import type {
  GroupPlan,
  PopulationRecord,
} from "../../src/sim/world/population/groups.js";
import type {
  CountDraws,
  SystemFacts,
} from "../../src/sim/world/population/plan.js";
import type { PopulationDraws } from "../../src/sim/world/population/streams.js";
import { decodePopulationFixture } from "../oracles/population/codec.js";
import {
  EdgeDrawsSchema,
  NeighbourhoodTableSchema,
  type EdgeDraws,
  type NeighbourhoodTable,
  type PopulationFixture,
  type PopulationFixtureNeighbour,
  type PopulationGroup,
} from "../oracles/population/schema.js";

const FIXTURE_DIR = new URL("../oracles/population/fixtures/", import.meta.url);
const SYSTEMS_DIR = new URL(
  "../../src/content/generated/systems/",
  import.meta.url,
);
const U32_RANGE = 4_294_967_296;

function readJson(url: URL): unknown {
  return JSON.parse(readFileSync(url, "utf8"));
}

/** A system fixture: its id (`g0-s7-seed1`) and the decoded logical fixture. */
export interface LoadedFixture {
  readonly id: string;
  readonly fixture: PopulationFixture;
}

let cachedFixtures: readonly LoadedFixture[] | undefined;

/**
 * Every committed system fixture, decoded, in code-unit order of the file name.
 * The one-line compact files are decoded by the oracle's own codec.
 */
export function loadPopulationFixtures(): readonly LoadedFixture[] {
  cachedFixtures ??= readdirSync(FIXTURE_DIR)
    .filter((name) => /^g[0-7]-s\d+-seed\d+\.json$/.test(name))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((name) => ({
      id: name.replace(/\.json$/, ""),
      fixture: decodePopulationFixture(readJson(new URL(name, FIXTURE_DIR))),
    }));
  return cachedFixtures;
}

/** One fixture by id (`g0-s7-seed1`); throws when it is not committed. */
export function loadPopulationFixture(id: string): PopulationFixture {
  const found = loadPopulationFixtures().find((loaded) => loaded.id === id);
  if (found === undefined) {
    throw new Error(`no committed population fixture "${id}"`);
  }
  return found.fixture;
}

let cachedTable: NeighbourhoodTable | undefined;

/** The recorded neighbourhood table of all 2,048 systems. */
export function loadNeighbourhoodTable(): NeighbourhoodTable {
  cachedTable ??= NeighbourhoodTableSchema.parse(
    readJson(new URL("neighbourhood-all.json", FIXTURE_DIR)),
  );
  return cachedTable;
}

/** The recorded boundary-draw cases. */
export function loadEdgeDraws(): EdgeDraws {
  return EdgeDrawsSchema.parse(
    readJson(new URL("edge-draws.json", FIXTURE_DIR)),
  );
}

const galaxies = new Map<number, readonly System[]>();

/** The content system list of one galaxy (the planner's real input). */
export function galaxySystems(galaxy: number): readonly System[] {
  let systems = galaxies.get(galaxy);
  if (systems === undefined) {
    systems = readJson(
      new URL(`g${String(galaxy)}.json`, SYSTEMS_DIR),
    ) as System[];
    galaxies.set(galaxy, systems);
  }
  return systems;
}

function neighbourOfFixture(neighbour: PopulationFixtureNeighbour): Neighbour {
  return {
    systemIndex: neighbour.id,
    government: neighbour.government,
    economy: neighbour.economy,
    techLevelRaw: neighbour.techLevel,
  };
}

/**
 * The recorded facts of a fixture as the planner's {@link SystemFacts}: the
 * locals and very locals, the government, economy, tech level, bottleneck flag
 * and lane lengths are what Oolite's script read; the neighbour lists of each
 * local come from the recorded table (`neighbourhood-all.json`), their
 * attributes from the content list. `inRange` and `distanceTo` come from the
 * chart, which no rate reads.
 */
export function factsFromFixture(fixture: PopulationFixture): SystemFacts {
  const { galaxy, systemIndex } = fixture.header;
  const content = galaxySystems(galaxy);
  const row = loadNeighbourhoodTable().galaxies[galaxy];
  if (row === undefined) {
    throw new Error(`the recorded table has no galaxy ${String(galaxy)}`);
  }
  const byIndex = (id: number): Neighbour => {
    const system = content.find((candidate) => candidate.systemIndex === id);
    if (system === undefined) {
      throw new Error(`galaxy ${String(galaxy)} has no system ${String(id)}`);
    }
    return {
      systemIndex: id,
      government: system.government,
      economy: system.economy,
      techLevelRaw: system.techLevelRaw,
    };
  };
  const listOf = (
    rows: readonly (readonly number[])[],
    id: number,
  ): readonly Neighbour[] => {
    const ids = rows[id];
    if (ids === undefined) {
      throw new Error(`the recorded table has no row ${String(id)}`);
    }
    return ids.map(byIndex);
  };
  const locals = fixture.inputs.locals.map(neighbourOfFixture);
  const verylocals = fixture.inputs.verylocals.map(neighbourOfFixture);
  const chart = buildNeighbourhood(content, systemIndex);
  const neighbourhood: Neighbourhood = {
    locals,
    seconds: locals.map((local) => listOf(row.locals, local.systemIndex)),
    verylocals,
    veryseconds: verylocals.map((local) =>
      listOf(row.verylocals, local.systemIndex),
    ),
    bottleneck: fixture.inputs.bottleneck,
    inRange: chart.inRange,
    distanceTo: chart.distanceTo,
  };
  return {
    galaxy,
    systemIndex,
    government: fixture.inputs.government,
    economy: fixture.inputs.economy,
    techlevel: fixture.inputs.techLevel,
    neighbourhood,
    laneLengths: fixture.inputs.laneLengths,
  };
}

/**
 * The recorded `count` draws of a fixture as the planner's count source: each
 * call for an ordinal returns that entry's next recorded draw
 * (`u / 2^32`). Asking for an entry with no draw left (a cut or uncounted
 * entry, or a fourth draw) throws, naming the entry.
 */
export function countDrawsFromFixture(fixture: PopulationFixture): CountDraws {
  const cursor = new Map<number, number>();
  return (ordinal) => {
    const entry = fixture.entries[ordinal];
    if (entry === undefined) {
      throw new RangeError(`the fixture has no entry ${String(ordinal)}`);
    }
    const at = cursor.get(ordinal) ?? 0;
    const draw = entry.countDraws[at];
    if (draw === undefined) {
      throw new RangeError(
        `entry ${String(ordinal)} ${entry.name} has no recorded count draw #${String(at)}`,
      );
    }
    cursor.set(ordinal, at + 1);
    return draw / U32_RANGE;
  };
}

/**
 * The recorded draws of one group, per tag, in the order taken. `next(tag)`
 * is the recorded `u / 2^32` and `nextU32(tag)` the recorded integer. A tag
 * with no recording, or one already used up, throws and names the tag.
 */
export function recordedDraws(group: PopulationGroup): PopulationDraws {
  const cursor = new Map<string, number>();
  const take = (tag: string): number => {
    const recorded = Object.hasOwn(group.draws, tag)
      ? (group.draws as Readonly<Record<string, readonly number[]>>)[tag]
      : undefined;
    if (recorded === undefined) {
      throw new RangeError(
        `group ${String(group.entry)}/${String(group.index)} has no recorded "${tag}" draws`,
      );
    }
    const at = cursor.get(tag) ?? 0;
    const draw = recorded[at];
    if (draw === undefined) {
      throw new RangeError(
        `group ${String(group.entry)}/${String(group.index)}: "${tag}" draws are used up after ${String(recorded.length)}`,
      );
    }
    cursor.set(tag, at + 1);
    return draw;
  };
  return {
    next: (tag) => take(tag) / U32_RANGE,
    nextU32: (tag) => take(tag),
  };
}

// --- Plan 22-07: the committed records and the planned-ship projection -------

let cachedRecords: readonly PopulationRecord[] | undefined;

/** One record of `src/content/generated/ships-npc.json`, the fields mapped. */
interface CommittedNpcRecord {
  readonly key: string;
  readonly name: string;
  readonly roles: readonly string[];
  readonly scanClass: string;
  readonly radius: number;
  readonly maxEnergy: number;
  readonly energyRechargeRate: number;
  readonly likelyCargo: number;
  readonly maxCargo: number;
  readonly autoAi: number;
  readonly autoWeapons: number;
  readonly hasFuelInjection: number;
  readonly hyperspaceMotor: boolean;
  readonly escortRoles: PopulationRecord["escortRoles"];
  readonly forwardWeapon: string;
  readonly aftWeapon: string;
  readonly fuel: number;
  readonly bounty: number;
}

/**
 * The committed NPC catalogue as the populator's {@link PopulationRecord}s, in
 * catalogue order (the order the weighted pick walks). The mapping lists the
 * fields by name and never reads a record's missile counts.
 */
export function committedPopulationRecords(): readonly PopulationRecord[] {
  cachedRecords ??= (
    readJson(
      new URL("../../src/content/generated/ships-npc.json", import.meta.url),
    ) as readonly CommittedNpcRecord[]
  ).map((record) => ({
    key: record.key,
    name: record.name,
    roles: record.roles,
    scanClass: record.scanClass,
    radius: record.radius,
    maxEnergy: record.maxEnergy,
    energyRechargeRate: record.energyRechargeRate,
    likelyCargo: record.likelyCargo,
    maxCargo: record.maxCargo,
    autoAi: record.autoAi,
    autoWeapons: record.autoWeapons,
    hasFuelInjection: record.hasFuelInjection,
    hyperspaceMotor: record.hyperspaceMotor,
    escortRoles: record.escortRoles,
    forwardWeapon: record.forwardWeapon,
    aftWeapon: record.aftWeapon,
    fuel: record.fuel,
    bounty: record.bounty,
  }));
  return cachedRecords;
}

/**
 * A ship as the fixtures record it, reduced to the fields the port plans (the
 * cargo count, the equipment list and the cut writes are not planned here).
 * `inGroup` is whether Oolite put the ship in a ship group.
 */
export interface ShipProjection {
  readonly key: string;
  readonly role: string;
  readonly primaryRole: string;
  readonly bounty: number;
  readonly cargoKind: string;
  readonly forwardWeapon: string;
  readonly aftWeapon: string;
  readonly accuracy: number;
  readonly fuel: number;
  readonly homeSystem: number;
  readonly destinationSystem: number;
  readonly injector: boolean;
  readonly inGroup: boolean;
  readonly leader: number | null;
  readonly owner: number | null;
  readonly escortSlot: number | null;
}

/** The projection of a recorded group's ships (the oracle side). */
export function recordedShips(group: PopulationGroup): ShipProjection[] {
  return group.ships.map((ship) => ({
    key: ship.key,
    role: ship.role,
    primaryRole: ship.primaryRole,
    bounty: ship.bounty,
    cargoKind: ship.cargoKind,
    forwardWeapon: ship.forwardWeapon,
    aftWeapon: ship.aftWeapon,
    accuracy: ship.accuracy,
    fuel: ship.fuel,
    homeSystem: ship.homeSystem,
    destinationSystem: ship.destinationSystem,
    injector: ship.injector,
    inGroup: ship.group !== null,
    leader: ship.leader,
    owner: ship.owner,
    escortSlot: ship.escortSlot,
  }));
}

/**
 * The projection of a planned group's ships (the port side): an untouched
 * weapon mount is the record's own type, as the fixtures record it.
 */
export function describeShips(
  plan: GroupPlan,
  records: readonly PopulationRecord[] = committedPopulationRecords(),
): ShipProjection[] {
  return plan.ships.map((ship) => {
    const record = records.find(
      (candidate) => candidate.key === ship.recordKey,
    );
    if (record === undefined) {
      throw new Error(`no catalogue record "${ship.recordKey}"`);
    }
    return {
      key: ship.recordKey,
      role: ship.role,
      primaryRole: ship.primaryRole,
      bounty: ship.bounty,
      cargoKind: ship.cargoKind,
      forwardWeapon: ship.weaponTypes.fore ?? record.forwardWeapon,
      aftWeapon: ship.weaponTypes.aft ?? record.aftWeapon,
      accuracy: ship.accuracy,
      fuel: ship.fuel,
      homeSystem: ship.homeSystem,
      destinationSystem: ship.destinationSystem,
      injector: ship.injector,
      inGroup: ship.groupRecord,
      leader: ship.leaderIndex,
      owner: ship.ownerIndex,
      escortSlot: ship.escortSlot,
    };
  });
}

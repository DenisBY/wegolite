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
  CountDraws,
  SystemFacts,
} from "../../src/sim/world/population/plan.js";
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

/** The draw interface the replay hands the port (matches `PopulationDraws`). */
export interface RecordedDraws {
  next(tag: string): number;
  nextU32(tag: string): number;
}

/**
 * The recorded draws of one group, per tag, in the order taken. `next(tag)`
 * is the recorded `u / 2^32` and `nextU32(tag)` the recorded integer. A tag
 * with no recording, or one already used up, throws and names the tag.
 */
export function recordedDraws(group: PopulationGroup): RecordedDraws {
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

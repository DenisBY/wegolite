// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The neighbourhood facts the initial populator reads (Phase 22, WORLD-08).
 *
 * Oolite's `oolite-populator.js` starts by asking the system record for its
 * neighbours (`oolite-populator.js:237-256`): `locals` (`systemsInRange()`,
 * 7 LY), each local's own 7 LY neighbours (`seconds`), `verylocals`
 * (`systemsInRange(3.5)`) with their 3.5 LY neighbours (`veryseconds`), and
 * the script's own `_systemIsBottleneck(locals, seconds)` (`:2542-2583`). Two
 * more reads happen later: the 25 LY query of the long courier (`:1512`,
 * `:1521`) and `distanceToSystem` for the fuel rules. This module computes all
 * of them outside the planner, from the galaxy list the session holds, so the
 * planner receives one frozen {@link Neighbourhood} and never touches a chart.
 *
 * `systemsInRange` is `oolite-global-prefix.js:80-91`: every other system of
 * the same galaxy with `distanceToSystem(other) <= range` (default 7), in
 * system-id order. `distanceToSystem` is `0.4 * dist` with `dist` the integer
 * chart distance of `legacy_random.h:154-160`, which `chartDistance` is. The
 * comparison is Oolite's own double comparison, kept as is: 17 x 0.4 is within
 * 7 LY and 18 x 0.4 is not, 8 within 3.5 LY and 9 not, 62 within 25 LY and 63
 * not.
 *
 * The module is pure and total. It imports no content module (a content
 * `System` satisfies {@link NeighbourSystem} structurally) and takes every
 * distance from `chartDistance`. A malformed record is dropped before any
 * distance is taken, so the `RangeError` of `chartDistance` is unreachable: the
 * populate step runs inside the arrival's synchronous install block, which must
 * not throw (T-22-04).
 */

import { CHART_LY_PER_UNIT, chartDistance } from "../hyperspace/jump.js";

/** `systemsInRange()` default (`oolite-global-prefix.js:84`, `:237`). */
export const NEIGHBOUR_RANGE_LY = 7;

/** `systemsInRange(3.5)` (`oolite-populator.js:245`). */
export const VERY_NEAR_RANGE_LY = 3.5;

/** `_nearbySystem(25)` of the long courier (`oolite-populator.js:1512`). */
export const LONG_COURIER_RANGE_LY = 25;

/** The highest system index of a galaxy (256 systems per galaxy). */
const MAX_SYSTEM_INDEX = 255;

/**
 * What the neighbourhood reads of a system record. A content `System`
 * satisfies it, so nothing here is imported from `src/content`.
 * `techLevelRaw` is the plist `techlevel` with no +1.
 */
export interface NeighbourSystem {
  readonly systemIndex: number;
  readonly chartX: number;
  readonly chartY: number;
  readonly government: number;
  readonly economy: number;
  readonly techLevelRaw: number;
}

/** What the populator's rates read of a neighbour (`local.government`, ...). */
export interface Neighbour {
  readonly systemIndex: number;
  readonly government: number;
  readonly economy: number;
  readonly techLevelRaw: number;
}

/**
 * The injected facts for one system. `locals[i]` pairs with `seconds[i]` and
 * `verylocals[i]` with `veryseconds[i]`, as the script's arrays do. The
 * `seconds` entries are lists, not counts: the bottleneck test reads the ids
 * and the very-local raid rate (`:414-428`) reads each second's `government`.
 */
export interface Neighbourhood {
  /** Systems within 7 LY, ascending system index. */
  readonly locals: readonly Neighbour[];
  /** For each local, the systems within 7 LY of it (the system itself included). */
  readonly seconds: readonly (readonly Neighbour[])[];
  /** Systems within 3.5 LY, ascending system index. */
  readonly verylocals: readonly Neighbour[];
  /** For each very local, the systems within 3.5 LY of it. */
  readonly veryseconds: readonly (readonly Neighbour[])[];
  /** `_systemIsBottleneck(locals, seconds)`. */
  readonly bottleneck: boolean;
  /** Ids of the other systems within `rangeLy`, ascending (any range). */
  readonly inRange: (rangeLy: number) => readonly number[];
  /** `0.4 * dist` to a system of this galaxy; `undefined` for an unknown one. */
  readonly distanceTo: (systemIndex: number) => number | undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A chart coordinate is one byte in Oolite (`legacy_random.h`), 0 to 255. */
const MAX_CHART_COORDINATE = 255;

/**
 * Bounded to the chart's byte range, not merely integral: an integer-valued
 * double of 9e15 or 1e300 would make `chartDistance` overflow to a non-safe
 * integer and throw, which the install block must never see (T-22-04).
 */
function isChartCoordinate(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CHART_COORDINATE
  );
}

/**
 * The well-formed records of a galaxy list, ascending system index, the first
 * of a duplicated index kept. A record that could make `chartDistance` throw
 * or that could put an out-of-range index in a result is dropped here.
 */
function sanitiseGalaxy(
  galaxy: readonly unknown[],
): readonly NeighbourSystem[] {
  const seen = new Set<number>();
  const kept: NeighbourSystem[] = [];
  for (const record of galaxy) {
    if (!isRecord(record)) {
      continue;
    }
    const { systemIndex, chartX, chartY } = record;
    if (
      typeof systemIndex !== "number" ||
      !Number.isInteger(systemIndex) ||
      systemIndex < 0 ||
      systemIndex > MAX_SYSTEM_INDEX ||
      !isChartCoordinate(chartX) ||
      !isChartCoordinate(chartY) ||
      seen.has(systemIndex)
    ) {
      continue;
    }
    seen.add(systemIndex);
    kept.push(record as unknown as NeighbourSystem);
  }
  return kept.sort((a, b) => a.systemIndex - b.systemIndex);
}

/** `distanceToSystem`: `0.4 * dist` of two well-formed records. */
function distanceLy(from: NeighbourSystem, to: NeighbourSystem): number {
  return (
    CHART_LY_PER_UNIT *
    chartDistance(
      { x: from.chartX, y: from.chartY },
      { x: to.chartX, y: to.chartY },
    )
  );
}

/** The other systems within `rangeLy` of `origin`, from a sanitised galaxy. */
function neighboursOf(
  sorted: readonly NeighbourSystem[],
  origin: NeighbourSystem,
  rangeLy: number,
): readonly NeighbourSystem[] {
  return sorted.filter(
    (other) =>
      other.systemIndex !== origin.systemIndex &&
      distanceLy(origin, other) <= rangeLy,
  );
}

function toNeighbour(system: NeighbourSystem): Neighbour {
  return Object.freeze({
    systemIndex: system.systemIndex,
    government: system.government,
    economy: system.economy,
    techLevelRaw: system.techLevelRaw,
  });
}

/**
 * Oolite's `systemsInRange(range)` (`oolite-global-prefix.js:80-91`): the ids
 * of every other system of the galaxy within `rangeLy`, ascending, whatever
 * order the galaxy is given in. Total: malformed records are dropped, an
 * unknown or out-of-range `from`, or a non-finite `rangeLy`, gives an empty
 * list.
 */
export function systemsInRange(
  galaxy: readonly unknown[],
  from: number,
  rangeLy: number,
): readonly number[] {
  const sorted = sanitiseGalaxy(galaxy);
  const origin = sorted.find((system) => system.systemIndex === from);
  if (origin === undefined) {
    return [];
  }
  return neighboursOf(sorted, origin, rangeLy).map(
    (system) => system.systemIndex,
  );
}

/**
 * The script's `_systemIsBottleneck(locals, seconds)` (`:2542-2583`), ported as
 * written. `locals` are the ids within 7 LY and `seconds[j]` the ids within
 * 7 LY of `locals[j]`. A connected set is seeded with `locals[0]` and grown
 * while it grows: a local not yet in the set joins when any id of its own
 * `seconds` entry is in the set (the loop order is the script's). The result
 * is `true` when the final set is smaller than `locals`; empty locals give
 * `false` ("Oresrati's bottleneck status is undefined").
 */
export function isBottleneck(
  locals: readonly number[],
  seconds: readonly (readonly number[])[],
): boolean {
  const first = locals[0];
  if (first === undefined) {
    return false;
  }
  const connectionSet: number[] = [first];
  let sofar: number;
  do {
    sofar = connectionSet.length;
    const rows = Math.min(seconds.length, locals.length);
    for (let j = 0; j < rows; j += 1) {
      const local = locals[j];
      const second = seconds[j];
      if (
        local === undefined ||
        second === undefined ||
        connectionSet.includes(local)
      ) {
        continue;
      }
      // The connected set contains a system connected to this local: add it.
      if (second.some((id) => connectionSet.includes(id))) {
        connectionSet.push(local);
      }
    }
  } while (connectionSet.length > sofar);
  // Some locals stayed disconnected: this is a bottleneck system.
  return connectionSet.length < locals.length;
}

const NO_NEIGHBOURS: readonly Neighbour[] = Object.freeze([]);
const NO_SECONDS: readonly (readonly Neighbour[])[] = Object.freeze([]);

/**
 * Build the frozen neighbourhood of `systemIndex` over `galaxy` (the current
 * galaxy's system list, in any order). Total: a malformed record is dropped, a
 * `systemIndex` that is not in the (cleaned) galaxy gives empty lists and
 * `bottleneck` false, never a throw.
 */
export function buildNeighbourhood(
  galaxy: readonly unknown[],
  systemIndex: number,
): Neighbourhood {
  const sorted = sanitiseGalaxy(galaxy);
  const byIndex = new Map<number, NeighbourSystem>(
    sorted.map((system) => [system.systemIndex, system]),
  );
  const origin = byIndex.get(systemIndex);

  const inRange = (rangeLy: number): readonly number[] =>
    origin === undefined
      ? []
      : neighboursOf(sorted, origin, rangeLy).map(
          (system) => system.systemIndex,
        );
  const distanceTo = (index: number): number | undefined => {
    const other = byIndex.get(index);
    return origin === undefined || other === undefined
      ? undefined
      : distanceLy(origin, other);
  };

  if (origin === undefined) {
    return Object.freeze({
      locals: NO_NEIGHBOURS,
      seconds: NO_SECONDS,
      verylocals: NO_NEIGHBOURS,
      veryseconds: NO_SECONDS,
      bottleneck: false,
      inRange,
      distanceTo,
    });
  }

  const localSystems = neighboursOf(sorted, origin, NEIGHBOUR_RANGE_LY);
  const secondSystems = localSystems.map((local) =>
    neighboursOf(sorted, local, NEIGHBOUR_RANGE_LY),
  );
  const veryLocalSystems = neighboursOf(sorted, origin, VERY_NEAR_RANGE_LY);
  const verySecondSystems = veryLocalSystems.map((local) =>
    neighboursOf(sorted, local, VERY_NEAR_RANGE_LY),
  );

  const ids = (systems: readonly NeighbourSystem[]): readonly number[] =>
    systems.map((system) => system.systemIndex);
  const bottleneck = isBottleneck(ids(localSystems), secondSystems.map(ids));

  const frozenList = (
    systems: readonly NeighbourSystem[],
  ): readonly Neighbour[] => Object.freeze(systems.map(toNeighbour));

  return Object.freeze({
    locals: frozenList(localSystems),
    seconds: Object.freeze(secondSystems.map(frozenList)),
    verylocals: frozenList(veryLocalSystems),
    veryseconds: Object.freeze(verySecondSystems.map(frozenList)),
    bottleneck,
    inRange,
    distanceTo,
  });
}

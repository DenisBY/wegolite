// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The stratified system sample of the population oracle (Phase 22, plan 22-02,
 * D-04): which (system, seed) fixtures `populator-record.ts --all` records.
 *
 * Dev-only, like the rest of `tools/ai-harness`: nothing under `src/` or
 * `public/` imports it. The list is committed as code and is not recomputed at
 * test time (the OOLITE_SRC-gated rerun of `populator-record.test.ts` does
 * recompute it from the pinned script and fails when the committed list
 * drifts). Every entry carries the reasons it is in.
 *
 * The selector, in order:
 *
 * 1. Every system gets a proxy population: the sum of the `groupCount` values
 *    the script registers when every draw is 0.5 (`proxyPopulation`).
 * 2. The 34 non-empty cells of (government, economy side 0-3 or 4-7, tech
 *    level band low <= 4, mid 5-8, high >= 9) each contribute their lower
 *    median member by proxy population (ties: galaxy, then system id).
 * 3. The anchors (RESEARCH "Concrete system list for the recorder (D-04)") are
 *    each a named system whose property is re-checked from the candidate data;
 *    a named system whose property does not hold is replaced by the best match
 *    of the property. An anchor replaces the median member of its cell; a second
 *    anchor in the same cell is added.
 */

/** One system of the sample and why it is there. */
export interface PopulationSystem {
  /** `g<galaxy>-s<index>`. */
  readonly id: string;
  readonly reasons: readonly string[];
  /** The seeds recorded for this system (a subset of `POPULATION_SEEDS`). */
  readonly seeds: readonly number[];
}

/** What the selector knows about one of the 2,048 systems. */
export interface PopulationCandidate {
  readonly id: string;
  readonly galaxy: number;
  readonly index: number;
  readonly name: string;
  readonly government: number;
  readonly economy: number;
  /** The plist `techlevel`, no +1. */
  readonly techLevel: number;
  /** `proxyPopulation` of `populator-record.ts`. */
  readonly proxy: number;
  /** Systems within 7 LY and within 3.5 LY. */
  readonly locals: number;
  readonly verylocals: number;
  readonly bottleneck: boolean;
}

/** The result of the selector: the sample and the anchors it had to replace. */
export interface PopulationSelection {
  readonly systems: readonly PopulationSystem[];
  /** Named anchors whose property did not hold, and what replaced them. */
  readonly replaced: readonly {
    readonly named: string;
    readonly chosen: string;
  }[];
}

/** The seeds D-04 asks for per system (three). */
export const POPULATION_SEEDS: readonly number[] = Object.freeze([1, 2, 3]);

/**
 * The size rule (plan 22-02, D-04 "hundreds of KB"; `du -sb` of the fixture
 * directory under 1,000,000 bytes). The compact file form of
 * `tests/oracles/population/codec.ts` makes a fixture 2 to 30 KB; the 35
 * systems at three seeds are still 1.41 MB, so the third seed is not recorded
 * for any system, and the second seed is dropped for the four largest systems
 * that are median members of a cell (no anchor loses a seed). Seed 1 of every
 * system is always recorded.
 */
export const POPULATION_SECOND_SEED_DROPPED: readonly string[] = Object.freeze([
  "g1-s219",
  "g5-s121",
  "g5-s183",
  "g6-s238",
]);

/** The seeds recorded for a system after the size rule. */
export function recordedSeeds(id: string): readonly number[] {
  return POPULATION_SECOND_SEED_DROPPED.includes(id) ? [1] : [1, 2];
}

/** The bounds D-04's "about 32" is held to. */
export const POPULATION_SAMPLE_MIN = 30;
export const POPULATION_SAMPLE_MAX = 36;

type Band = "low" | "mid" | "high";

function bandOf(techLevel: number): Band {
  return techLevel <= 4 ? "low" : techLevel >= 9 ? "high" : "mid";
}

function sideOf(economy: number): "ind" | "agr" {
  return economy <= 3 ? "ind" : "agr";
}

function cellOf(system: PopulationCandidate): string {
  return `gov ${String(system.government)}, ${sideOf(system.economy)}, ${bandOf(system.techLevel)}`;
}

/** Highest proxy first; ties by galaxy, then system id. */
function byProxyDescending(
  a: PopulationCandidate,
  b: PopulationCandidate,
): number {
  return b.proxy - a.proxy || a.galaxy - b.galaxy || a.index - b.index;
}

function byProxyAscending(
  a: PopulationCandidate,
  b: PopulationCandidate,
): number {
  return a.proxy - b.proxy || a.galaxy - b.galaxy || a.index - b.index;
}

/** One anchor: the named system, its property, and the best match fallback. */
interface Anchor {
  readonly named: string | null;
  readonly reason: string;
  readonly holds: (
    system: PopulationCandidate,
    all: readonly PopulationCandidate[],
  ) => boolean;
  readonly best: (
    all: readonly PopulationCandidate[],
  ) => PopulationCandidate | undefined;
}

function maxProxy(
  all: readonly PopulationCandidate[],
  keep: (system: PopulationCandidate) => boolean,
): PopulationCandidate | undefined {
  return all.filter(keep).sort(byProxyDescending)[0];
}

const ANCHORS: readonly Anchor[] = [
  {
    named: "g7-s162",
    reason:
      "isolated: no neighbour within 7 LY, so only the station patrol spawns and every neighbour term is empty",
    holds: (system) => system.locals === 0,
    best: (all) => all.find((system) => system.locals === 0),
  },
  {
    named: "g3-s239",
    reason:
      "bottleneck with 10 or more neighbours: the `couriers *= 1.5` accumulator of oolite-populator.js:311-314 compounds",
    holds: (system) => system.bottleneck && system.locals >= 10,
    best: (all) =>
      maxProxy(all, (system) => system.bottleneck && system.locals >= 10),
  },
  {
    named: "g0-s92",
    reason:
      "bottleneck with 10 or more neighbours: the `couriers *= 1.5` accumulator of oolite-populator.js:311-314 compounds",
    holds: (system) => system.bottleneck && system.locals >= 10,
    best: (all) =>
      maxProxy(all, (system) => system.bottleneck && system.locals >= 10),
  },
  {
    named: "g0-s219",
    reason:
      "the largest anarchy of galaxy 0 by proxy population (the `pindependents` halving loop and the `*= 1.2` terms); bootable in the browser spec",
    holds: (system, all) =>
      system.government === 0 &&
      system.galaxy === 0 &&
      system.id ===
        maxProxy(all, (other) => other.government === 0 && other.galaxy === 0)
          ?.id,
    best: (all) =>
      maxProxy(all, (other) => other.government === 0 && other.galaxy === 0),
  },
  {
    named: "g2-s179",
    reason:
      "the largest anarchy of the universe by proxy population (D-04 'the largest anarchy by expected population')",
    holds: (system, all) =>
      system.government === 0 &&
      system.id === maxProxy(all, (other) => other.government === 0)?.id,
    best: (all) => maxProxy(all, (other) => other.government === 0),
  },
  {
    named: "g6-s57",
    reason:
      "the largest feudal state by proxy population: government 1 folds police into hunters (oolite-populator.js:574)",
    holds: (system, all) =>
      system.government === 1 &&
      system.id === maxProxy(all, (other) => other.government === 1)?.id,
    best: (all) => maxProxy(all, (other) => other.government === 1),
  },
  {
    named: "g0-s7",
    reason: "the start system; continuity with every existing traffic-on test",
    holds: (system) => system.id === "g0-s7",
    best: (all) => all.find((system) => system.id === "g0-s7"),
  },
  {
    named: null,
    reason:
      "no neighbour within 3.5 LY and government above 5: no remote packs, the heavy hunter else-branch",
    holds: (system) =>
      system.verylocals === 0 && system.locals > 0 && system.government > 5,
    best: (all) =>
      maxProxy(
        all,
        (system) =>
          system.verylocals === 0 && system.locals > 0 && system.government > 5,
      ),
  },
  {
    named: null,
    reason:
      "no neighbour within 3.5 LY and government 5 or below: the other hmedium and hheavy else-branch, no remote packs",
    holds: (system) =>
      system.verylocals === 0 && system.locals > 0 && system.government <= 5,
    best: (all) =>
      maxProxy(
        all,
        (system) =>
          system.verylocals === 0 &&
          system.locals > 0 &&
          system.government <= 5,
      ),
  },
  {
    named: null,
    reason:
      "tech level 14: the `techlevel >= 14` branches (interceptor wings and police patrols; `_setMissiles(1)`, cut)",
    holds: (system) => system.techLevel === 14,
    best: (all) => maxProxy(all, (system) => system.techLevel === 14),
  },
];

/**
 * Choose the sample (see the module comment). The only input is the candidate
 * list, so the result is deterministic.
 *
 * @throws {RangeError} when the sample is outside 30 to 36 systems (D-04:
 * about 32); trim the cells whose formula branches another entry covers.
 */
export function selectPopulationSystems(
  all: readonly PopulationCandidate[],
): PopulationSelection {
  const cells = new Map<string, PopulationCandidate[]>();
  for (const system of all) {
    const key = cellOf(system);
    const members = cells.get(key);
    if (members === undefined) {
      cells.set(key, [system]);
    } else {
      members.push(system);
    }
  }

  const reasons = new Map<string, string[]>();
  const order: PopulationCandidate[] = [];
  const add = (system: PopulationCandidate, reason: string): void => {
    const known = reasons.get(system.id);
    if (known === undefined) {
      reasons.set(system.id, [reason]);
      order.push(system);
    } else if (!known.includes(reason)) {
      known.push(reason);
    }
  };

  const replaced: { named: string; chosen: string }[] = [];
  const anchored = new Set<string>();
  for (const anchor of ANCHORS) {
    const named =
      anchor.named === null
        ? undefined
        : all.find((system) => system.id === anchor.named);
    let chosen: PopulationCandidate | undefined;
    if (named !== undefined && anchor.holds(named, all)) {
      chosen = named;
    } else {
      chosen = anchor.best(all);
      if (chosen === undefined) {
        throw new RangeError(`no system matches the anchor: ${anchor.reason}`);
      }
      if (anchor.named !== null) {
        replaced.push({ named: anchor.named, chosen: chosen.id });
      }
    }
    anchored.add(cellOf(chosen));
    add(
      chosen,
      `${anchor.reason} (${cellOf(chosen)}, proxy ${String(chosen.proxy)})`,
    );
  }

  for (const [key, members] of [...cells].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    if (anchored.has(key)) {
      continue;
    }
    const sorted = [...members].sort(byProxyAscending);
    const median = sorted[Math.floor((sorted.length - 1) / 2)];
    if (median !== undefined) {
      add(
        median,
        `median by proxy population of the cell ${key} (${String(members.length)} systems, proxy ${String(median.proxy)})`,
      );
    }
  }

  const ordered = [...order].sort(
    (a, b) => a.galaxy - b.galaxy || a.index - b.index,
  );
  if (
    ordered.length < POPULATION_SAMPLE_MIN ||
    ordered.length > POPULATION_SAMPLE_MAX
  ) {
    throw new RangeError(
      `the selector chose ${String(ordered.length)} systems, outside ${String(POPULATION_SAMPLE_MIN)} to ${String(POPULATION_SAMPLE_MAX)}`,
    );
  }
  return {
    systems: ordered.map((system) => ({
      id: system.id,
      reasons: reasons.get(system.id) ?? [],
      seeds: POPULATION_SEEDS,
    })),
    replaced,
  };
}

function frozen(id: string, reasons: readonly string[]): PopulationSystem {
  return Object.freeze({
    id,
    reasons: Object.freeze([...reasons]),
    seeds: Object.freeze([...recordedSeeds(id)]),
  });
}

/** The sample, in galaxy then system order (`selectPopulationSystems`). */
export const POPULATION_SYSTEMS: readonly PopulationSystem[] = Object.freeze([
  frozen("g0-s4", [
    "median by proxy population of the cell gov 4, ind, mid (52 systems, proxy 22)",
  ]),
  frozen("g0-s7", [
    "the start system; continuity with every existing traffic-on test (gov 3, agr, low, proxy 21)",
  ]),
  frozen("g0-s29", [
    "median by proxy population of the cell gov 2, ind, mid (95 systems, proxy 20)",
  ]),
  frozen("g0-s92", [
    "bottleneck with 10 or more neighbours: the `couriers *= 1.5` accumulator of oolite-populator.js:311-314 compounds (gov 6, agr, mid, proxy 82)",
  ]),
  frozen("g0-s219", [
    "the largest anarchy of galaxy 0 by proxy population (the `pindependents` halving loop and the `*= 1.2` terms); bootable in the browser spec (gov 0, ind, mid, proxy 36)",
  ]),
  frozen("g1-s26", [
    "median by proxy population of the cell gov 3, ind, mid (45 systems, proxy 23)",
  ]),
  frozen("g1-s56", [
    "median by proxy population of the cell gov 6, agr, low (29 systems, proxy 25)",
  ]),
  frozen("g1-s185", [
    "median by proxy population of the cell gov 2, ind, high (61 systems, proxy 17)",
  ]),
  frozen("g1-s189", [
    "no neighbour within 3.5 LY and government 5 or below: the other hmedium and hheavy else-branch, no remote packs (gov 4, ind, high, proxy 40)",
  ]),
  frozen("g1-s219", [
    "median by proxy population of the cell gov 1, agr, mid (12 systems, proxy 25)",
  ]),
  frozen("g1-s227", [
    "median by proxy population of the cell gov 5, ind, mid (22 systems, proxy 24)",
  ]),
  frozen("g2-s35", [
    "median by proxy population of the cell gov 0, agr, low (140 systems, proxy 23)",
  ]),
  frozen("g2-s49", [
    "median by proxy population of the cell gov 5, agr, high (4 systems, proxy 25)",
  ]),
  frozen("g2-s60", [
    "median by proxy population of the cell gov 2, agr, low (84 systems, proxy 18)",
  ]),
  frozen("g2-s134", [
    "median by proxy population of the cell gov 5, agr, low (21 systems, proxy 22)",
  ]),
  frozen("g2-s138", [
    "median by proxy population of the cell gov 7, agr, mid (88 systems, proxy 27)",
  ]),
  frozen("g3-s13", [
    "median by proxy population of the cell gov 6, agr, high (7 systems, proxy 24)",
  ]),
  frozen("g3-s71", [
    "median by proxy population of the cell gov 4, agr, low (47 systems, proxy 24)",
  ]),
  frozen("g3-s123", [
    "the largest anarchy of the universe by proxy population (D-04 'the largest anarchy by expected population') (gov 0, ind, mid, proxy 44)",
  ]),
  frozen("g3-s173", [
    "median by proxy population of the cell gov 6, ind, high (130 systems, proxy 24)",
  ]),
  frozen("g3-s239", [
    "bottleneck with 10 or more neighbours: the `couriers *= 1.5` accumulator of oolite-populator.js:311-314 compounds (gov 4, agr, mid, proxy 72)",
  ]),
  frozen("g4-s18", [
    "no neighbour within 3.5 LY and government above 5: no remote packs, the heavy hunter else-branch (gov 6, ind, mid, proxy 38)",
  ]),
  frozen("g4-s20", [
    "median by proxy population of the cell gov 5, ind, high (89 systems, proxy 24)",
  ]),
  frozen("g4-s134", [
    "median by proxy population of the cell gov 7, agr, high (19 systems, proxy 30)",
  ]),
  frozen("g5-s121", [
    "median by proxy population of the cell gov 0, ind, low (18 systems, proxy 23)",
  ]),
  frozen("g5-s152", [
    "median by proxy population of the cell gov 3, ind, high (59 systems, proxy 23)",
  ]),
  frozen("g5-s183", [
    "median by proxy population of the cell gov 7, ind, mid (3 systems, proxy 38)",
  ]),
  frozen("g5-s197", [
    "median by proxy population of the cell gov 3, agr, mid (78 systems, proxy 20)",
  ]),
  frozen("g5-s239", [
    "median by proxy population of the cell gov 5, agr, mid (88 systems, proxy 26)",
  ]),
  frozen("g6-s53", [
    "tech level 14: the `techlevel >= 14` branches (interceptor wings and police patrols; `_setMissiles(1)`, cut) (gov 7, ind, high, proxy 40)",
  ]),
  frozen("g6-s57", [
    "the largest feudal state by proxy population: government 1 folds police into hunters (oolite-populator.js:574) (gov 1, ind, mid, proxy 46)",
  ]),
  frozen("g6-s238", [
    "median by proxy population of the cell gov 1, agr, low (98 systems, proxy 23)",
  ]),
  frozen("g7-s162", [
    "isolated: no neighbour within 7 LY, so only the station patrol spawns and every neighbour term is empty (gov 7, agr, low, proxy 7)",
  ]),
  frozen("g7-s202", [
    "median by proxy population of the cell gov 1, ind, high (17 systems, proxy 25)",
  ]),
  frozen("g7-s216", [
    "median by proxy population of the cell gov 2, agr, mid (48 systems, proxy 20)",
  ]),
]);

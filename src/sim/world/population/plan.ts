// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The planning half of Oolite's `systemWillPopulate` (Phase 22, WORLD-08): the
 * facts of a system, the rates of its entries, `randomise`, and the group count
 * of every kept entry.
 *
 * The arithmetic is `Resources/Scripts/oolite-populator.js:275-608` (the
 * rates), `:629-639` (the lane lengths), `:644-653` (`randomise`) and `:655-986`
 * (the `initial` of each entry), ported as written, upstream quirks included
 * and recorded as faithful (FIDELITY rows):
 *
 * - in a bottleneck system `couriers *= 1.5` multiplies the running sum, not
 *   the rate just computed (`:311-314`);
 * - `randomise` always takes three draws, the third even when
 *   `count - floor(count)` is 0 (`:644-653`);
 * - for government <= 1 the police rate folds into the light hunters and
 *   `police` becomes 0 (`:574-582`).
 *
 * Expressions keep the script's operator order (`hlight * 1/6 * ...` is
 * `((hlight * 1) / 6) * ...`) so that the doubles are the script's doubles.
 *
 * Only the rates a kept entry reads are computed: the repopulator frequencies
 * (`$repopulatorFrequency*`, Phase 26), the medium and heavy hunter rates, the
 * assassin rate and the Thargoid rates feed cut entries only.
 *
 * The module is pure and total (T-22-09): a malformed fact (a non-finite or
 * negative field, a missing neighbourhood list) never throws. A non-finite rate
 * counts 0 and every count is clamped to `MAX_ENTITIES` before any loop runs on
 * it. It imports no content module and has no clock, platform randomness,
 * `Math.hypot` or `for..in`.
 */

import { MAX_ENTITIES } from "../ids.js";
import type { Neighbourhood } from "../neighbourhood.js";
import { listOf, numberOf, readField } from "./reads.js";
import { POPULATOR_ENTRIES, entriesInEngineOrder } from "./table.js";

/**
 * What the planner reads of a system. `techlevel` is the plist `techlevel`
 * value the script reads (no +1). `laneLengths` are `|planet|`,
 * `|planet - sun|` and `|sun|` in metres.
 */
export interface SystemFacts {
  readonly galaxy: number;
  readonly systemIndex: number;
  readonly government: number;
  readonly economy: number;
  readonly techlevel: number;
  readonly neighbourhood: Neighbourhood;
  readonly laneLengths: {
    readonly l1: number;
    readonly l2: number;
    readonly l3: number;
  };
}

/** What `systemFactsFrom` reads of a system record (a content `System` fits). */
export interface SystemFactsSource {
  readonly galaxy: number;
  readonly systemIndex: number;
  readonly government: number;
  readonly economy: number;
  readonly techLevelRaw: number;
}

interface PositionedBody {
  readonly position: {
    readonly x: number;
    readonly y: number;
    readonly z: number;
  };
}

/** The two bodies the lane lengths come from (a `SystemLayout` fits). */
export interface LaneBodies {
  readonly planet: PositionedBody;
  readonly sun: PositionedBody;
}

function length3(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

/**
 * The facts of one system: its record, its neighbourhood and its three lane
 * lengths (`oolite-populator.js:629-639`). Wegolite negates Oolite's Z, which
 * leaves every length unchanged.
 */
export function systemFactsFrom(
  system: SystemFactsSource,
  neighbourhood: Neighbourhood,
  layout: LaneBodies,
): SystemFacts {
  const planet = layout.planet.position;
  const sun = layout.sun.position;
  return Object.freeze({
    galaxy: system.galaxy,
    systemIndex: system.systemIndex,
    government: system.government,
    economy: system.economy,
    techlevel: system.techLevelRaw,
    neighbourhood,
    laneLengths: Object.freeze({
      // route 1: witchpoint to planet
      l1: length3(planet.x, planet.y, planet.z),
      // route 2: sun to planet
      l2: length3(planet.x - sun.x, planet.y - sun.y, planet.z - sun.z),
      // route 3: witchpoint to sun
      l3: length3(sun.x, sun.y, sun.z),
    }),
  });
}

// --- Total reads of untrusted facts ----------------------------------------

function finiteOrZero(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

// --- The rates --------------------------------------------------------------

/** The registration ordinal of a table entry; absence is a programming error. */
function ordinalOf(name: string): number {
  const entry = POPULATOR_ENTRIES.find((candidate) => candidate.name === name);
  if (entry === undefined) {
    throw new RangeError(`no populator entry named ${name}`);
  }
  return entry.ordinal;
}

/**
 * The running sums the script builds before it registers anything, and the
 * `initial` value (the argument of `randomise`) of every kept counted entry.
 */
export interface EntryRates {
  /**
   * `initial` by ordinal; 0 for an entry that is cut or not counted. A
   * non-finite value is 0 here.
   */
  readonly initial: readonly number[];
  readonly freighters: number;
  readonly couriers: number;
  readonly smugglers: number;
  readonly traders: number;
  /** `pindependents + pflight + pfmedium + pfheavy`. */
  readonly pirates: number;
  /** Light hunters per hour (with the police share folded in for government <= 1). */
  readonly hlight: number;
  readonly police: number;
  readonly interceptors: number;
}

const FREIGHTERS = ordinalOf("oolite-freighters");
const FREIGHTERS_DOCKING = ordinalOf("oolite-freighters-docking");
const COURIERS_ROUTE1 = ordinalOf("oolite-couriers-route1");
const COURIERS_ROUTE3 = ordinalOf("oolite-couriers-route3");
const SMUGGLERS = ordinalOf("oolite-smugglers");
const HUNTERS_TRIANGLE = ordinalOf("oolite-hunters-triangle");
const HUNTERS_ROUTE1 = ordinalOf("oolite-hunters-route1");
const INDEPENDENT_ROUTE1 = ordinalOf("oolite-pirate-independent-route1");
const INDEPENDENT_ROUTE2 = ordinalOf("oolite-pirate-independent-route2");
const INDEPENDENT_ROUTE3 = ordinalOf("oolite-pirate-independent-route3");
const LIGHT_ROUTE1 = ordinalOf("oolite-pirate-light-route1");
const LIGHT_TRIANGLE = ordinalOf("oolite-pirate-light-triangle");
const LIGHT_REMOTE = ordinalOf("oolite-pirate-light-remote");
const MEDIUM_ROUTE1 = ordinalOf("oolite-pirate-medium-route1");
const MEDIUM_TRIANGLE = ordinalOf("oolite-pirate-medium-triangle");
const MEDIUM_REMOTE = ordinalOf("oolite-pirate-medium-remote");
const HEAVY_ROUTE1 = ordinalOf("oolite-pirate-heavy-route1");
const HEAVY_TRIANGLE = ordinalOf("oolite-pirate-heavy-triangle");
const HEAVY_REMOTE = ordinalOf("oolite-pirate-heavy-remote");
const POLICE_ROUTE1 = ordinalOf("oolite-police-route1");
const POLICE_TRIANGLE = ordinalOf("oolite-police-triangle");
const INTERCEPTORS_ROUTE1 = ordinalOf("oolite-interceptors-route1");
const INTERCEPTORS_WITCHPOINT = ordinalOf("oolite-interceptors-witchpoint");

/**
 * The rates of `oolite-populator.js:275-608` and the `initial` of every kept
 * counted entry (`:655-986`), ported as written. See the module header for the
 * upstream quirks that are kept.
 */
export function entryRates(facts: SystemFacts): EntryRates {
  const government = numberOf(readField(facts, "government"));
  const economy = numberOf(readField(facts, "economy"));
  const techlevel = numberOf(readField(facts, "techlevel"));
  const hood = readField(facts, "neighbourhood");
  const locals = listOf(readField(hood, "locals"));
  const seconds = listOf(readField(hood, "seconds"));
  const verylocals = listOf(readField(hood, "verylocals"));
  const veryseconds = listOf(readField(hood, "veryseconds"));
  const bottleneck = readField(hood, "bottleneck") === true;
  const lanes = readField(facts, "laneLengths");
  const l1length = numberOf(readField(lanes, "l1"));
  const l2length = numberOf(readField(lanes, "l2"));
  const l3length = numberOf(readField(lanes, "l3"));

  // Trader hourly rates first, as most other rates depend on them (:258-329).
  let freighters = 0;
  let couriers = 0;
  let smugglers = 0;
  for (let i = 0; i < locals.length; i += 1) {
    const local = locals[i];
    const localGovernment = numberOf(readField(local, "government"));
    const localEconomy = numberOf(readField(local, "economy"));
    const localTechlevel = numberOf(readField(local, "techLevelRaw"));
    // traffic is higher between systems on opposite side of economy
    const ecomatch = -(economy - 3.5) * (localEconomy - 3.5);
    let trdanger = 0;
    // if either local or remote end is more dangerous than Communist, reduce
    // trader frequency
    if (localGovernment < 4) {
      trdanger = (4 - localGovernment) * 2.5;
    }
    if (government < 4) {
      trdanger += (4 - government) * 2.5;
    }
    // good economic match: one every 30 minutes if safe; bad economic match:
    // one every 2 hours if safe
    freighters +=
      ecomatch > 0 ? 60 / (30 + trdanger) : 60 / (120 + trdanger * 2);

    const secondLength = listOf(seconds[i]).length;
    // couriers are non-mirrored
    const courierRate = 20 / (10 + (14 - localTechlevel) * 5) / secondLength;
    if (bottleneck) {
      // Upstream quirk, kept: this multiplies the running sum, not `rate`.
      couriers *= 1.5; // simulate long-range routes
    }
    couriers += courierRate;
    // smugglers are non-mirrored
    smugglers += 20 / (10 + localTechlevel * 5) / secondLength;
  }
  const traders = freighters + couriers + smugglers;

  // Pirate rates next, based partly on trader rates (:331-467).
  // local independent pirate packs
  let pindependents = (1 - government / 12) * traders;
  // organised pirate packs led by increasingly bigger freighters
  const lrate = 3 / 5;
  const mrate = 3 / 8;
  const hrate = 1 / 8;
  let pflight = 0;
  let pfmedium = 0;
  let pfheavy = 0;
  let pflightremote = 0;
  let pfmediumremote = 0;
  let pfheavyremote = 0;
  // rates of organised packs go up as government reduces
  if (government < 6) {
    pflight += lrate;
    if (government < 4) {
      pflight += lrate;
      pfmedium += mrate;
      if (government < 2) {
        // additional boost for independent packs in Feudal
        pindependents *= 1.2;
        pflight += lrate * 2;
        pfmedium += mrate;
        pfheavy += hrate;
        if (government < 1) {
          pindependents *= 1.2;
          pflight *= 1.5;
          pfmedium *= 1.5;
          pfheavy *= 2;
        }
      }
    }
  }
  // The script loops while `pindependents > 10`; an infinite rate would never
  // leave it, so a non-finite value is left to count 0 below (T-22-09).
  while (Number.isFinite(pindependents) && pindependents > 10) {
    pindependents *= 0.5;
  }
  if (verylocals.length > 0) {
    // we might also get packs coming from other nearby systems
    for (let i = 0; i < verylocals.length; i += 1) {
      const local = verylocals[i];
      const second = listOf(veryseconds[i]);
      const localGovernment = numberOf(readField(local, "government"));
      // pirate raids only against more ordered systems
      if (localGovernment < government) {
        let factor = 0;
        // split raids evenly between all systems in range of remote system
        for (let j = 0; j < second.length; j += 1) {
          if (localGovernment < numberOf(readField(second[j], "government"))) {
            factor += 1;
          }
        }
        // only half generated there go out to raid
        factor = 1 / (factor * 2);
        let rlight = 0;
        let rmedium = 0;
        let rheavy = 0;
        if (localGovernment < 6) {
          rlight += lrate * factor;
          if (localGovernment < 4) {
            rlight += lrate * factor;
            rmedium += mrate * factor;
            if (localGovernment < 2) {
              rlight += lrate * factor;
              rmedium += mrate * factor;
              rheavy += hrate * factor;
              if (localGovernment < 1) {
                rlight *= 1.5;
                rmedium *= 1.5;
                rheavy *= 2.0;
              }
            }
          }
        }
        // light groups much less likely to jump systems
        pflight += rlight / 3;
        pflightremote += rlight / 3;
        pfmedium += rmedium;
        pfmediumremote += rmedium;
        pfheavy += rheavy;
        pfheavyremote += rheavy;
      }
    }
  }
  const pirates = pindependents + pflight + pfmedium + pfheavy;

  // Now hunters. Total hunter rate dependent on pirate numbers (:469-562).
  // light fighters, mainly non-witchspace-capable; most common in
  // confed/communist systems.
  let hlight = 60 / (10 + 5 * (Math.abs(government - 4.5) - 0.5));
  if (hlight > pirates * 2) {
    hlight = pirates * 2;
  }
  hlight = hlight / 3;

  // Police patrols, also depend on trader+pirate numbers (:566-592).
  let police = 60 / (5 * (8 - government));
  if (police > traders + pirates) {
    police = traders + pirates;
  }
  police = police / 3;
  if (government <= 1) {
    // no police patrols away from the station - add more bounty hunters
    // instead
    hlight += police;
    police = 0;
  }
  // high-tech systems will send interceptor wings out specifically to deal
  // with incoming heavy pirate packs
  let interceptors = 0;
  if (techlevel >= 9) {
    interceptors += pflightremote / 2 + pfmediumremote + pfheavyremote * 2;
  }

  // The `initial` of each kept counted entry (:655-986).
  const initial: number[] = POPULATOR_ENTRIES.map(() => 0);
  const set = (ordinal: number, value: number): void => {
    initial[ordinal] = finiteOrZero(value);
  };

  // traders
  let tradeInitial = freighters * (l1length / 600000);
  if (government < 4) {
    tradeInitial *= 1 - 0.15 * (4 - government);
  }
  set(FREIGHTERS, tradeInitial);
  set(FREIGHTERS_DOCKING, tradeInitial / 10);
  set(COURIERS_ROUTE1, (couriers / 2) * (l1length / 600000));
  set(COURIERS_ROUTE3, (couriers / 2) * (l3length / 600000));
  set(SMUGGLERS, smugglers * (l1length / 600000));

  // hunters; 5/6 go route 1, and back
  const trilength = l1length + l2length + l3length;
  set(
    HUNTERS_TRIANGLE,
    ((hlight * 1) / 6) * (trilength / 900000) * (1.0 - 0.1 * (7 - government)),
  );
  set(
    HUNTERS_ROUTE1,
    ((hlight * 5) / 6) *
      ((l1length * 2) / 900000) *
      (1.0 - 0.1 * (7 - government)),
  );

  // pirates; 2/3 to lane 1 (with higher governmental attrition), 1/6 to each
  // of the other lanes
  set(
    INDEPENDENT_ROUTE1,
    (pindependents *
      ((l1length * 2) / 3 / 600000) *
      (1.0 - 0.05 * government) *
      5) /
      6,
  );
  set(
    INDEPENDENT_ROUTE2,
    (pindependents *
      ((l2length * 2) / 3 / 600000) *
      (1.0 - 0.05 * government)) /
      12,
  );
  set(
    INDEPENDENT_ROUTE3,
    (pindependents *
      ((l3length * 2) / 3 / 600000) *
      (1.0 - 0.05 * government)) /
      12,
  );

  // pirate packs
  const lightLocal = pflight - pflightremote; // domestic source
  set(LIGHT_ROUTE1, (lightLocal * 3) / 4);
  set(LIGHT_TRIANGLE, (lightLocal * 1) / 4);
  set(LIGHT_REMOTE, pflightremote); // other system
  const mediumLocal = pfmedium - pfmediumremote;
  set(MEDIUM_ROUTE1, (mediumLocal * 3) / 4);
  set(MEDIUM_TRIANGLE, (mediumLocal * 1) / 4);
  set(MEDIUM_REMOTE, pfmediumremote);
  const heavyLocal = pfheavy - pfheavyremote;
  set(HEAVY_ROUTE1, (heavyLocal * 3) / 4);
  set(HEAVY_TRIANGLE, (heavyLocal * 1) / 4);
  set(HEAVY_REMOTE, pfheavyremote);

  // police; 5/6 go route 1, and back
  set(
    POLICE_ROUTE1,
    ((police * 5) / 6) *
      ((l1length * 2) / 900000) *
      (1.0 - 0.1 * (7 - government)),
  );
  set(
    POLICE_TRIANGLE,
    ((police * 1) / 6) * (trilength / 900000) * (1.0 - 0.1 * (7 - government)),
  );

  // interceptors; half on the way or returning, half on station
  const interceptorsInitial = interceptors / 2;
  set(INTERCEPTORS_ROUTE1, interceptorsInitial);
  set(INTERCEPTORS_WITCHPOINT, interceptorsInitial);

  return Object.freeze({
    initial: Object.freeze(initial),
    freighters,
    couriers,
    smugglers,
    traders,
    pirates,
    hlight,
    police,
    interceptors,
  });
}

/**
 * `randomise(count)` of `oolite-populator.js:644-653`, with its three draws
 * passed in: the first two scale the count into `0.25 .. 1.75` times itself,
 * the third decides whether the fraction rounds up. The third draw is taken
 * even when the fraction is 0, and the comparison is strict, so a draw equal
 * to the fraction does not add one.
 */
export function randomise(
  count: number,
  draw1: number,
  draw2: number,
  draw3: number,
): number {
  const scaled = count * (0.25 + 0.75 * (draw1 + draw2));
  let r = Math.floor(scaled);
  if (draw3 < scaled - r) {
    r += 1;
  }
  return r;
}

/** An integer in `0 .. MAX_ENTITIES`: NaN and negatives are 0. */
function clampCount(value: number): number {
  if (!(value > 0)) {
    return 0;
  }
  return Math.min(Math.floor(value), MAX_ENTITIES);
}

/**
 * The next `count` draw of an entry: each call returns the next value of that
 * entry's own stream in `[0, 1)`. Production passes a forked stream per entry
 * (`countDrawSource` in `streams.ts`); the replay passes the recorded draws.
 */
export type CountDraws = (ordinal: number) => number;

/** The group count of one kept entry. */
export interface PlannedCount {
  readonly ordinal: number;
  readonly count: number;
}

/**
 * The group count of every kept entry, in engine order (a stable sort by
 * priority, equal priorities in insertion order). A counted entry takes three
 * draws from its own stream even when its rate is 0; the station patrol is not
 * counted and plans one group with no draw (`Universe.m:1727`). A non-finite
 * rate counts 0 and every count is clamped to `MAX_ENTITIES` before any loop
 * runs on it (T-22-09).
 */
export function planCounts(
  facts: SystemFacts,
  drawsForEntry: CountDraws,
): readonly PlannedCount[] {
  const rates = entryRates(facts);
  const planned: PlannedCount[] = [];
  for (const entry of entriesInEngineOrder(POPULATOR_ENTRIES)) {
    if (entry.status !== "kept") {
      continue;
    }
    if (!entry.counted) {
      planned.push({ ordinal: entry.ordinal, count: 1 });
      continue;
    }
    const draw1 = drawsForEntry(entry.ordinal);
    const draw2 = drawsForEntry(entry.ordinal);
    const draw3 = drawsForEntry(entry.ordinal);
    const rate = rates.initial[entry.ordinal] ?? 0;
    planned.push({
      ordinal: entry.ordinal,
      count: clampCount(randomise(rate, draw1, draw2, draw3)),
    });
  }
  return planned;
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The trade builders of the initial populator (Phase 22, WORLD-08): the
 * freighter (plan 22-07), the short and long couriers and the smuggler (plan
 * 22-08), each the port of one callback of `oolite-populator.js`.
 *
 * `buildFreighter` is `_addFreighter` (`Resources/Scripts/oolite-populator.js:
 * 1383-1452`) with the engine work `system.addShips("trader", 1, ...)` does
 * around it (`Universe.m:2608-2692`, the escorts of `escorts.ts`):
 *
 * - arriving (`pos` a coordinate, the only branch initial population takes,
 *   D-01): home system from `_weightedNearbyTradeSystem`, fuel from the chart
 *   distance (`_setFuel`), destination this system, scarce goods, and the
 *   `Math.random() * 8 > government` draw whose missile branch is cut (the draw
 *   is taken, so the `body` stream stays Oolite's);
 * - station launch (`pos.isStation`, kept for Phase 26): home this system,
 *   destination from `_weightedNearbyTradeSystem`, plentiful goods and fuel 7.
 *   Only the script's data is modelled; the engine launch path is not;
 * - a ship whose name matches the medical pattern gets `MEDICAL_GOODS` and
 *   bounty 0 (the folded pod-kind todo, builder half);
 * - otherwise 5 % of freighters are offenders: bounty `ceil(r * 20)`, and half
 *   of those whose record allows the auto AI are opportunists (D-10): the data
 *   effects stay (`PIRATE_GOODS`, `_setSkill(2)` and `_setWeapons(2.5)` when
 *   `auto_weapons` holds), only the `switchAI` is cut. An offender's escorts
 *   get `bounty |= 3 + floor(r * 12)`;
 * - the cargo kind is set last (`setCargoType`), then the escorts' weapons.
 *
 * Missiles are a cut (FIDELITY E-194): no missile is given, removed or read.
 *
 * Draw sites (the stub tags them, the port gives each its own stream):
 * `system` for the trade system, `body` for the script's own `Math.random()`,
 * `skill` and `weapons` for the helpers, and the engine's `pick`, `injector`,
 * `accuracy` and `escort` draws for the ships.
 */

import type { PlannedPopShip, PopulationRecord, ShipDraft } from "./groups.js";
import {
  MEDICAL_PATTERN,
  boundedBounty,
  chartDistance,
  createPlannedShip,
  finishShips,
  listOf,
  numberOf,
  readField,
  roleExists,
  setFuel,
  setSkill,
  setWeapons,
  systemIndexOf,
  weightedNearbyTradeSystem,
} from "./kit.js";
import {
  addOffenderEscortBounty,
  setEscortWeapons,
  setUpEscorts,
} from "./escorts.js";
import type { SystemFacts } from "./plan.js";
import type { PopulationDraws } from "./streams.js";
import type { CargoKindName } from "../entity.js";

/** The script's `setCargoType` argument of each goods name, as a cargo kind. */
const FREIGHTER_GOODS = {
  scarce: "scarce",
  plentiful: "plentiful",
  medical: "medical",
  pirate: "pirate",
} as const satisfies Record<string, CargoKindName>;

/** Fuel 7 LY in tenths: a ship launched from the station (`:1394`). */
const STATION_LAUNCH_FUEL = 70;

export interface FreighterOptions {
  /** The arriving branch; false is the station launch (Phase 26). */
  readonly arriving: boolean;
}

/**
 * `_addFreighter`. Returns the freighter and its escorts, the freighter first,
 * or no ship (and no further draw) when no record carries the role `trader`.
 */
export function buildFreighter(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
  options: FreighterOptions,
): readonly PlannedPopShip[] {
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const government = numberOf(facts.government);
  const mother = createPlannedShip("trader", records, systemIndex, draws);
  if (mother === undefined) {
    return [];
  }
  const escorts = setUpEscorts(
    mother,
    records,
    government,
    draws,
    "trader",
    systemIndex,
  );
  const ships: ShipDraft[] = [mother, ...escorts];

  let goods: CargoKindName;
  if (options.arriving) {
    mother.homeSystem = weightedNearbyTradeSystem(facts, draws);
    mother.fuel = setFuel(mother.homeSystem, systemIndex, chartDistance(facts));
    mother.destinationSystem = systemIndex;
    goods = FREIGHTER_GOODS.scarce;
    // `Math.random() * 8 > government` guards `_setMissiles(ship, -1)`, a cut:
    // the draw is taken, the missiles are not.
    draws.next("body");
  } else {
    mother.homeSystem = systemIndex;
    mother.destinationSystem = weightedNearbyTradeSystem(facts, draws);
    goods = FREIGHTER_GOODS.plentiful;
    mother.fuel = STATION_LAUNCH_FUEL;
  }

  if (MEDICAL_PATTERN.test(mother.record.name)) {
    goods = FREIGHTER_GOODS.medical;
    mother.bounty = 0;
  } else if (draws.next("body") < 0.05) {
    mother.bounty = boundedBounty(Math.ceil(draws.next("body") * 20));
    // The test draws first, whatever the record allows.
    if (draws.next("body") < 0.5 && numberOf(mother.record.autoAi) > 0) {
      // D-10: the data effects of the opportunist stay, `switchAI` is cut.
      if (numberOf(mother.record.autoWeapons) > 0) {
        mother.accuracy = setSkill(
          mother.accuracy,
          2,
          true,
          mother.record.scanClass,
          () => draws.next("skill"),
        );
        setWeapons(mother.weaponTypes, 2.5, true, () => draws.next("weapons"));
      }
      goods = FREIGHTER_GOODS.pirate;
    }
    addOffenderEscortBounty(escorts, draws);
  } else {
    mother.bounty = 0;
  }
  mother.cargoKind = goods;

  setEscortWeapons(escorts, draws);
  return finishShips(ships);
}

// --- Couriers (plan 22-08) ---------------------------------------------------

/** The `_nearbySystem` ranges of the courier and smuggler callbacks, in LY. */
const NEAR_RANGE_LY = 7;
const LONG_RANGE_LY = 25;

/**
 * `_nearbySystem(range)` (`oolite-populator.js:2477-2487`): a system chosen
 * uniformly from the other systems within `range` light years, one draw on the
 * `system` stream; this system, with no draw, when there is none.
 */
function nearbySystem(
  facts: SystemFacts,
  range: number,
  draws: PopulationDraws,
): number {
  const here = systemIndexOf(facts.systemIndex, 0);
  const inRange = readField(facts.neighbourhood, "inRange");
  const candidates =
    typeof inRange === "function"
      ? listOf(
          (inRange as (rangeLy: number) => unknown).call(
            facts.neighbourhood,
            range,
          ),
        )
      : [];
  if (candidates.length === 0) {
    return here;
  }
  const at = Math.floor(draws.next("system") * candidates.length);
  return systemIndexOf(candidates[at], here);
}

/** A trade ship and the escorts the engine gave it. */
interface TradeShip {
  readonly mother: ShipDraft;
  readonly escorts: readonly ShipDraft[];
}

/**
 * `_addShips(role, 1, pos, 0)` for a trade role that falls back to `trader`
 * when the catalogue has none (`:1457-1465`, `:1530-1538`). The fallback role
 * is exactly `trader`, so the engine's trader escort removal applies to it
 * (`Universe.m:2657-2665`) and to no other trade role.
 */
function addTradeShip(
  role: string,
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
): TradeShip | undefined {
  const asked = roleExists(records, role) ? role : "trader";
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const mother = createPlannedShip(asked, records, systemIndex, draws);
  if (mother === undefined) {
    return undefined;
  }
  const escorts = setUpEscorts(
    mother,
    records,
    numberOf(facts.government),
    draws,
    asked,
    systemIndex,
  );
  return { mother, escorts };
}

/**
 * `_addCourier` (`oolite-populator.js:1455-1479`): a `trader-courier` (else a
 * `trader`) with bounty 0. The script's `t.escortGroup` test reads a property of
 * the returned array, never of a ship, so its loop (bounty and heat insulation
 * on the escorts) never runs and the escorts keep the bounty the engine gave
 * them; `heatInsulation = 6` is a cut (`POPULATOR_CUTS`). Then
 * `_setEscortWeapons`. With no record for either role the script's
 * `t[0].bounty = 0` throws and nothing is planned.
 */
function addCourier(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
): TradeShip | undefined {
  const added = addTradeShip("trader-courier", facts, records, draws);
  if (added === undefined) {
    return undefined;
  }
  added.mother.bounty = 0;
  setEscortWeapons(added.escorts, draws);
  return added;
}

/**
 * `_addCourierShort` (`oolite-populator.js:1482-1502`): arriving, home from the
 * systems within 7 LY, fuel from the chart, destination this system, scarce
 * goods. A station launch (Phase 26): destination from the 7 LY list, home
 * here, plentiful goods.
 */
export function buildCourierShort(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
  options: FreighterOptions,
): readonly PlannedPopShip[] {
  const added = addCourier(facts, records, draws);
  if (added === undefined) {
    return [];
  }
  const { mother } = added;
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  if (options.arriving) {
    mother.homeSystem = nearbySystem(facts, NEAR_RANGE_LY, draws);
    mother.fuel = setFuel(mother.homeSystem, systemIndex, chartDistance(facts));
    mother.destinationSystem = systemIndex;
    mother.cargoKind = "scarce";
  } else {
    mother.destinationSystem = nearbySystem(facts, NEAR_RANGE_LY, draws);
    mother.homeSystem = systemIndex;
    mother.cargoKind = "plentiful";
  }
  return finishShips([mother, ...added.escorts]);
}

/**
 * `_addCourierLong` (`oolite-populator.js:1505-1525`): as the short courier,
 * with the destination drawn from the systems within 25 LY. Arriving, the home
 * system is drawn first (7 LY), then the destination.
 */
export function buildCourierLong(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
  options: FreighterOptions,
): readonly PlannedPopShip[] {
  const added = addCourier(facts, records, draws);
  if (added === undefined) {
    return [];
  }
  const { mother } = added;
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  if (options.arriving) {
    mother.homeSystem = nearbySystem(facts, NEAR_RANGE_LY, draws);
    mother.fuel = setFuel(mother.homeSystem, systemIndex, chartDistance(facts));
    mother.destinationSystem = nearbySystem(facts, LONG_RANGE_LY, draws);
    mother.cargoKind = "scarce";
  } else {
    mother.destinationSystem = nearbySystem(facts, LONG_RANGE_LY, draws);
    mother.homeSystem = systemIndex;
    mother.cargoKind = "plentiful";
  }
  return finishShips([mother, ...added.escorts]);
}

// --- Smugglers (plan 22-08) ---------------------------------------------------

/**
 * `_addSmuggler` (`oolite-populator.js:1528-1575`): a `trader-smuggler` (else a
 * `trader`) with bounty `min(ceil(r * 20), 2 * cargoSpaceCapacity)`, arriving
 * from a system within 7 LY with the chart fuel (a station launch: destination
 * within 7 LY, home here), contraband cargo, the fuel injector forced on for a
 * ship with `auto_weapons` (`EQ_FUEL_INJECTION`, `:1560`), `_setWeapons(1.2)`,
 * `_setEscortWeapons`, and `bounty |= 3 + floor(r * 12)` on every escort.
 */
export function buildSmuggler(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
  options: FreighterOptions,
): readonly PlannedPopShip[] {
  const added = addTradeShip("trader-smuggler", facts, records, draws);
  if (added === undefined) {
    return [];
  }
  const { mother, escorts } = added;
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const capacity = numberOf(mother.record.maxCargo);
  const rolled = Math.ceil(draws.next("body") * 20);
  mother.bounty = boundedBounty(rolled > capacity * 2 ? capacity * 2 : rolled);
  if (options.arriving) {
    mother.homeSystem = nearbySystem(facts, NEAR_RANGE_LY, draws);
    mother.fuel = setFuel(mother.homeSystem, systemIndex, chartDistance(facts));
    mother.destinationSystem = systemIndex;
  } else {
    mother.destinationSystem = nearbySystem(facts, NEAR_RANGE_LY, draws);
    mother.homeSystem = systemIndex;
  }
  mother.cargoKind = "contraband";
  const autoWeapons = numberOf(mother.record.autoWeapons) > 0;
  if (autoWeapons) {
    // Smugglers always have injectors (`:1558-1561`).
    mother.injector = true;
  }
  setWeapons(mother.weaponTypes, 1.2, autoWeapons, () => draws.next("weapons"));
  setEscortWeapons(escorts, draws);
  addOffenderEscortBounty(escorts, draws);
  return finishShips([mother, ...escorts]);
}

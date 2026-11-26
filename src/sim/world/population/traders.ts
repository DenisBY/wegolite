// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The trade builders of the initial populator (Phase 22, WORLD-08): the
 * freighter, in this plan; couriers and smugglers follow in plan 22-08.
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
  createPlannedShip,
  finishShips,
  numberOf,
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
    mother.fuel = setFuel(
      mother.homeSystem,
      systemIndex,
      facts.neighbourhood.distanceTo,
    );
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

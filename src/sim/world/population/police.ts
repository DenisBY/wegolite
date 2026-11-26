// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The hunter and police builders of the initial populator (Phase 22, plan
 * 22-09, WORLD-08, D-09): light hunters, police patrols, the station patrol and
 * interceptor wings, each the port of one callback of
 * `Resources/Scripts/oolite-populator.js`.
 *
 * Every `addGroup` callback here (`_addGroup`, `:2390-2415`) leaves one
 * `ShipGroup` without a leader, so each ship is a group-record holder with no
 * leader link (D-11). The size is clamped to `1..64` before any loop, as
 * `addGroup` accepts (`OOJSSystem.m`, Pitfall 8; T-22-13).
 *
 * Cut writes live only in `POPULATOR_CUTS`: the missile awards of tech level 14
 * and over, `AIScript.oolite_intership.initial_group` and `maxEscorts` are not
 * planned, and `PlannedPopShip` has no member for them (T-22-14).
 */

import type { PlannedPopShip, PopulationRecord } from "./groups.js";
import {
  addGroupShips,
  autoWeaponsOf,
  clampGroupSize,
  finishShips,
  setSkill,
  setWeapons,
  systemIndexOf,
} from "./kit.js";
import type { SystemFacts } from "./plan.js";
import type { PopulationDraws } from "./streams.js";

/** `_addLightHunter` (`oolite-populator.js:1578-1590`): the weapon level. */
const LIGHT_HUNTER_WEAPONS = 1.5;
/** `_addLightHunter`: `_setSkill(h.ships[i], -1)`. */
const LIGHT_HUNTER_SKILL = -1;

/**
 * `_addLightHunter` (`oolite-populator.js:1578-1590`): `floor(r * 2) +
 * floor(r * 2) + 2` hunters (two `body` draws) added as one group, each with
 * bounty 0, home and destination this system, `_setWeapons(1.5)` and
 * `_setSkill(-1)`. No ship, and no further draw, when no record carries the
 * role `hunter`.
 */
export function buildLightHunter(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
): readonly PlannedPopShip[] {
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const size =
    Math.floor(draws.next("body") * 2) + Math.floor(draws.next("body") * 2) + 2;
  const ships = addGroupShips(
    "hunter",
    clampGroupSize(size),
    records,
    systemIndex,
    draws,
  );
  if (ships === undefined) {
    return [];
  }
  for (const ship of ships) {
    const autoWeapons = autoWeaponsOf(ship.record);
    ship.bounty = 0;
    ship.homeSystem = systemIndex;
    ship.destinationSystem = systemIndex;
    setWeapons(ship.weaponTypes, LIGHT_HUNTER_WEAPONS, autoWeapons, () =>
      draws.next("weapons"),
    );
    ship.accuracy = setSkill(
      ship.accuracy,
      LIGHT_HUNTER_SKILL,
      autoWeapons,
      ship.record.scanClass,
      () => draws.next("skill"),
    );
  }
  return finishShips(ships);
}

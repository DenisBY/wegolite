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
  createPlannedShip,
  finishShips,
  numberOf,
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

// --- Police (plan 22-09, D-09) -------------------------------------------------

/** The primary role of the ship that patrols the station (`:2089`). */
export const STATION_PATROL_ROLE = "police-station-patrol";
/** The primary role of an interceptor of a witchpoint wing (`:2110`). */
export const WITCHPOINT_PATROL_ROLE = "police-witchpoint-patrol";

/** `_setSkill(h.ships[i], 1)` of an interceptor (`:2116`). */
const INTERCEPTOR_SKILL = 1;

/**
 * The role the police callbacks ask for (`:2054-2058`, `:2081-2085`):
 * `police`, or `interceptor` when `9 + Math.random() * 6 < techlevel` (one
 * `body` draw, strict). `techlevel` is the plist value (no +1).
 */
function policeRole(facts: SystemFacts, draws: PopulationDraws): string {
  return 9 + draws.next("body") * 6 < numberOf(facts.techlevel)
    ? "interceptor"
    : "police";
}

/**
 * `_addPolicePatrol` (`oolite-populator.js:2052-2076`): `floor(r * 2) +
 * floor(r * 2) + 2` police ships, or interceptors where the tech level allows
 * (`policeRole`), added as one group with bounty 0 and home and destination this
 * system. `AIScript.oolite_intership.initial_group` and the missiles of tech
 * level 14 and over are cuts.
 */
export function buildPolicePatrol(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
): readonly PlannedPopShip[] {
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const role = policeRole(facts, draws);
  const size =
    Math.floor(draws.next("body") * 2) + Math.floor(draws.next("body") * 2) + 2;
  const ships = addGroupShips(
    role,
    clampGroupSize(size),
    records,
    systemIndex,
    draws,
  );
  if (ships === undefined) {
    return [];
  }
  for (const ship of ships) {
    ship.bounty = 0;
    ship.homeSystem = systemIndex;
    ship.destinationSystem = systemIndex;
  }
  return finishShips(ships);
}

/**
 * `_addPoliceStationPatrol` (`oolite-populator.js:2079-2100`): one police ship
 * (or interceptor, `policeRole`) with the primary role `police-station-patrol`
 * and bounty 0, in every system (D-09). In Oolite it joins the main station's
 * group (`:2090-2091`); Wegolite's station is a static with no entity id, so the
 * patrol holds no group record (a FIDELITY divergence, D-11; Phase 25's station
 * responder revisits it). `maxEscorts` and the tech level 14 missiles are cuts.
 */
export function buildStationPatrol(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
): readonly PlannedPopShip[] {
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const role = policeRole(facts, draws);
  const patrol = createPlannedShip(role, records, systemIndex, draws);
  if (patrol === undefined) {
    return [];
  }
  patrol.primaryRole = STATION_PATROL_ROLE;
  patrol.bounty = 0;
  return finishShips([patrol]);
}

/**
 * `_addInterceptors` (`oolite-populator.js:2103-2123`): `floor(r * 2) +
 * floor(r * 2) + 1 + ceil(techlevel / 6)` interceptors, added as one group, each
 * with bounty 0, the primary role `police-witchpoint-patrol`, home and
 * destination this system and `_setSkill(1)`. `maxEscorts` and the missiles of
 * tech level 14 and over are cuts. The size is clamped to `1..64` before any
 * loop, so a huge tech level cannot make the wing long (T-22-13).
 */
export function buildInterceptors(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
): readonly PlannedPopShip[] {
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const size =
    Math.floor(draws.next("body") * 2) +
    Math.floor(draws.next("body") * 2) +
    1 +
    Math.ceil(numberOf(facts.techlevel) / 6);
  const ships = addGroupShips(
    "interceptor",
    clampGroupSize(size),
    records,
    systemIndex,
    draws,
  );
  if (ships === undefined) {
    return [];
  }
  for (const ship of ships) {
    ship.bounty = 0;
    ship.primaryRole = WITCHPOINT_PATROL_ROLE;
    ship.homeSystem = systemIndex;
    ship.destinationSystem = systemIndex;
    // only +1 as core already gives police ships better AI
    ship.accuracy = setSkill(
      ship.accuracy,
      INTERCEPTOR_SKILL,
      autoWeaponsOf(ship.record),
      ship.record.scanClass,
      () => draws.next("skill"),
    );
  }
  return finishShips(ships);
}

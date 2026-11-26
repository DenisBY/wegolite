// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The pirate builders of the initial populator (Phase 22, plan 22-09, WORLD-08):
 * independent pirates and the nine pirate pack entries, each the port of one
 * callback of `Resources/Scripts/oolite-populator.js`.
 *
 * - `buildIndependentPirate` is `_addIndependentPirate` (`:1696-1734`): a group
 *   of `floor(r * 3) + floor(r * 3) + 2` pirates, cut to `1 + floor(r * size)`
 *   where the size exceeds `8 - government`, each with bounty `20 + government +
 *   size + floor(r * 8)`, `PIRATE_GOODS`, weapons 1.75 for a hull with a
 *   hyperspace motor and 1.3 without, skill `4 - government`, and the
 *   `Math.random() * 16 < government` draw whose missile branch is cut. The
 *   script takes that draw `if (pos.z)`: only a z of exactly 0 skips it.
 * - `buildPiratePack` is `_addPiratePack` (`:1796-1873`) with the compositions
 *   and the local and remote wrappers of `:1875-1953` (`PACK_COMPOSITION`). Each
 *   assistant class has `floor(k + (0.5 + r1 - r2))` ships with two draws taken
 *   even when `k` is 0 or negative, so a light pack gets a pirate interceptor and
 *   a medium pack a heavy fighter one time in eight although the table says 0
 *   (Pitfall 3; FIDELITY). The pack leader is the freighter hull of its size, which
 *   the engine gives its own escorts (`setUpEscorts`, D-08).
 * - `remotePackZ` is the `pos.z = pos.z % 100000` of the remote wrappers and
 *   `nearbyDangerousSystem` the reservoir pick of `:2496-2518`.
 *
 * Cut writes live only in `POPULATOR_CUTS`: the missile awards and removals
 * (`_setMissiles`), the shield booster and ECM awards and the AI switches are
 * not planned, and `PlannedPopShip` has no member for them (T-22-14). No
 * function reads a record's missile counts.
 */

import type { PlannedPopShip, PopulationRecord, ShipDraft } from "./groups.js";
import {
  addGroupShips,
  autoWeaponsOf,
  boundedBounty,
  homeDistanceOf,
  clampGroupSize,
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
} from "./kit.js";
import {
  addOffenderEscortBounty,
  setEscortWeapons,
  setUpEscorts,
} from "./escorts.js";
import type { SystemFacts } from "./plan.js";
import type { PopulationDraws } from "./streams.js";

/** The size of a pirate pack: the freighter that leads it. */
export type PackSize = "light" | "medium" | "heavy";

/**
 * The composition `_addPiratePack` is called with (`:1875-1953`): the leader
 * role and `lf`, `mf`, `hf`, `thug`, the base counts of light, medium and heavy
 * fighters and of interceptors. Each count is only a base: the number of ships
 * of a class is `floor(k + (0.5 + r1 - r2))`.
 */
export const PACK_COMPOSITION = Object.freeze({
  light: Object.freeze({
    leader: "pirate-light-freighter",
    lf: 2,
    mf: 1,
    hf: -1,
    thug: 0,
  }),
  medium: Object.freeze({
    leader: "pirate-medium-freighter",
    lf: 3,
    mf: 2,
    hf: 0,
    thug: 1,
  }),
  heavy: Object.freeze({
    leader: "pirate-heavy-freighter",
    lf: 4,
    mf: 4,
    hf: 2,
    thug: 2,
  }),
} as const);

/** `pos.z % 100000` of the remote wrappers (`:1883`, `:1909`, `:1935`). */
const REMOTE_Z_PERIOD = 100000;

/**
 * `pos.z = pos.z % 100000` (`oolite-populator.js:1883`). JavaScript's `%` keeps
 * the dividend's sign, which in Wegolite's negated-Z frame is the mirror of
 * Oolite's: `remotePackZ(-z) === -remotePackZ(z)`, so the replay checks it
 * against every recorded `posIn.z` and `posOut.z` in either frame.
 */
export function remotePackZ(z: number): number {
  return z % REMOTE_Z_PERIOD;
}

/**
 * `_nearbyDangerousSystem(gov)` (`oolite-populator.js:2496-2516`): a reservoir
 * pick over the very local systems (within 3.5 LY) whose government is at most
 * `gov`, one `system` draw per matching system (`Math.random() < 1 / found`
 * replaces the pick); this system, with no draw, when none matches.
 */
export function nearbyDangerousSystem(
  facts: SystemFacts,
  government: number,
  draws: PopulationDraws,
): number {
  const here = systemIndexOf(facts.systemIndex, 0);
  let id = here;
  let found = 0;
  for (const local of listOf(readField(facts.neighbourhood, "verylocals"))) {
    if (numberOf(readField(local, "government")) <= government) {
      found += 1;
      if (draws.next("system") < 1 / found) {
        id = systemIndexOf(readField(local, "systemIndex"), id);
      }
    }
  }
  return id;
}

// --- Independent pirates -------------------------------------------------------

/** `_setWeapons` levels of an independent pirate (`:1716`, `:1720`). */
const INDEPENDENT_WEAPONS_MOTOR = 1.75;
const INDEPENDENT_WEAPONS_NO_MOTOR = 1.3;

export interface IndependentPirateOptions {
  /** The `pos.z` of the callback; see `BuildOptions.posZ`. */
  readonly posZ?: number | undefined;
}

/**
 * `_addIndependentPirate` (`oolite-populator.js:1696-1734`). No ship, and no
 * further draw, when no record carries the role `pirate`.
 */
export function buildIndependentPirate(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
  options: IndependentPirateOptions = {},
): readonly PlannedPopShip[] {
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const government = numberOf(facts.government);
  // a group < 3 in size is probably too small to actually attack anyone
  let size =
    Math.floor(draws.next("body") * 3) + Math.floor(draws.next("body") * 3) + 2;
  if (size > 8 - government) {
    // in the safer systems may have lost some ships already, though
    size = 1 + Math.floor(draws.next("body") * size);
  }
  const ships = addGroupShips(
    "pirate",
    clampGroupSize(size),
    records,
    systemIndex,
    draws,
  );
  if (ships === undefined) {
    return [];
  }
  // `if (pos.z)`: not if freshly launching; absent counts non-zero.
  const missileTest = options.posZ === undefined || Boolean(options.posZ);
  for (const ship of ships) {
    ship.bounty = boundedBounty(
      20 + government + size + Math.floor(draws.next("body") * 8),
    );
    ship.cargoKind = "pirate";
    const autoWeapons = autoWeaponsOf(ship.record);
    setWeapons(
      ship.weaponTypes,
      ship.record.hyperspaceMotor === true
        ? INDEPENDENT_WEAPONS_MOTOR
        : INDEPENDENT_WEAPONS_NO_MOTOR,
      autoWeapons,
      () => draws.next("weapons"),
    );
    // in the safer systems, rarely highly skilled (the skilled ones go
    // elsewhere)
    ship.accuracy = setSkill(
      ship.accuracy,
      4 - government,
      autoWeapons,
      ship.record.scanClass,
      () => draws.next("skill"),
    );
    if (missileTest) {
      // `Math.random() * 16 < government` guards `_setMissiles(ship, -1)`, a
      // cut: the draw is taken, the missiles are not.
      draws.next("body");
    }
  }
  return finishShips(ships);
}

// --- Pirate packs --------------------------------------------------------------

/** The `_setWeapons` level of each assistant role (`:1780-1791`). */
function assistantWeaponLevel(role: string): number | undefined {
  if (role === "pirate-light-fighter") {
    return 1.2;
  }
  if (role === "pirate-medium-fighter") {
    return 1.8;
  }
  if (role === "pirate-heavy-fighter") {
    return 2.05;
  }
  return undefined;
}

/** The leader's own weapon level and skill bias (`:1834-1835`). */
const LEADER_WEAPONS = 2.8;
const LEADER_SKILL = 3;
/** The assistant interceptor's weapon level (`:1763`). */
const INTERCEPTOR_WEAPONS = 2.3;

/**
 * `_addPirateAssistant` (`oolite-populator.js:1737-1793`): one more ship of
 * `role` (the generic `pirate` when the catalogue has none) with the leader's
 * home and destination. A pirate interceptor is no member of the pack's group
 * (bounty `50 + government + floor(r * 36)`, weapons 2.3, a fuel injector when
 * it has `auto_weapons`); every other assistant joins it (bounty `20 +
 * government + floor(r * 12)` and its role's weapon level).
 */
function addPirateAssistant(
  role: string,
  lead: ShipDraft,
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
): ShipDraft | undefined {
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const government = numberOf(facts.government);
  const asked = roleExists(records, role) ? role : "pirate";
  const asst = createPlannedShip(asked, records, systemIndex, draws);
  if (asst === undefined) {
    return undefined;
  }
  asst.homeSystem = lead.homeSystem;
  asst.destinationSystem = lead.destinationSystem;
  const autoWeapons = autoWeaponsOf(asst.record);
  if (role === "pirate-interceptor") {
    // `switchAI` is cut. Interceptors are not actually part of the group: they
    // just get the same destinations.
    asst.bounty = boundedBounty(
      50 + government + Math.floor(draws.next("body") * 36),
    );
    setWeapons(asst.weaponTypes, INTERCEPTOR_WEAPONS, autoWeapons, () =>
      draws.next("weapons"),
    );
    if (autoWeapons) {
      asst.injector = true; // interceptors always have injectors
    }
  } else {
    asst.groupRecord = true;
    asst.groupLeader = lead;
    asst.bounty = boundedBounty(
      20 + government + Math.floor(draws.next("body") * 12),
    );
    const level = assistantWeaponLevel(role);
    if (level !== undefined) {
      setWeapons(asst.weaponTypes, level, autoWeapons, () =>
        draws.next("weapons"),
      );
    }
  }
  return asst;
}

/** The most ships of one assistant class a group is given (the script's own is at most 5). */
const MAX_CLASS_COUNT = 16;

/**
 * The number of ships of one assistant class: `Math.floor(k + (0.5 + r1 -
 * r2))`, with both draws taken whatever `k` is (`oolite-populator.js:1813`). A
 * count at or below 0 adds no ship.
 */
function classCount(k: number, draws: PopulationDraws): number {
  const r1 = draws.next("body");
  const r2 = draws.next("body");
  const count = Math.floor(k + (0.5 + r1 - r2));
  return count > 0 ? Math.min(count, MAX_CLASS_COUNT) : 0;
}

/**
 * The government a remote pack's home system is picked at (`:1884`, `:1910`,
 * `:1936`): light `government - 1`, medium `min(government - 1, 3)`, heavy
 * `min(government - 1, 1)`.
 */
function remoteDangerLimit(pack: PackSize, government: number): number {
  switch (pack) {
    case "light":
      return government - 1;
    case "medium":
      return Math.min(government - 1, 3);
    case "heavy":
      return Math.min(government - 1, 1);
  }
}

/**
 * `_addPiratePack` through the local and remote wrappers (`oolite-populator.js:
 * 1796-1953`). A local pack's home and destination are this system; a remote
 * pack comes from `nearbyDangerousSystem(...)` to this system, and its centre's
 * z is `remotePackZ` (applied by the spawner, `GroupPlan.remotePack`).
 *
 * The leader is the freighter hull of the pack size (the generic `pirate` when
 * the catalogue has none), with the engine escorts of its `escort_roles`
 * (D-08), bounty `60 + government + floor(r * 8)` and its own group, the pack.
 * Ships are in creation order: the leader, its escorts, then the assistants
 * (light, medium and heavy fighters, then interceptors). `returning` is the
 * script's outbound branch for the repopulator (Phase 26) and is not taken.
 */
export function buildPiratePack(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
  pack: PackSize,
  remote: boolean,
): readonly PlannedPopShip[] {
  const composition = PACK_COMPOSITION[pack];
  const systemIndex = systemIndexOf(facts.systemIndex, 0);
  const government = numberOf(facts.government);
  // The wrapper's arguments are evaluated before the pack is built.
  const home = remote
    ? nearbyDangerousSystem(facts, remoteDangerLimit(pack, government), draws)
    : systemIndex;
  const destination = systemIndex;

  const asked = roleExists(records, composition.leader)
    ? composition.leader
    : "pirate";
  const lead = createPlannedShip(asked, records, systemIndex, draws);
  if (lead === undefined) {
    return [];
  }
  const escorts = setUpEscorts(
    lead,
    records,
    government,
    draws,
    asked,
    systemIndex,
  );
  lead.bounty = boundedBounty(
    60 + government + Math.floor(draws.next("body") * 8),
  );
  lead.homeSystem = home;
  lead.destinationSystem = destination;
  // `lead[0].group = new ShipGroup("pirate pack", lead[0])`
  lead.groupRecord = true;
  lead.groupLeader = lead;

  const assistants: ShipDraft[] = [];
  const classes: readonly (readonly [string, number])[] = [
    ["pirate-light-fighter", composition.lf],
    ["pirate-medium-fighter", composition.mf],
    ["pirate-heavy-fighter", composition.hf],
    ["pirate-interceptor", composition.thug],
  ];
  for (const [role, k] of classes) {
    for (let i = classCount(k, draws); i > 0; i -= 1) {
      const asst = addPirateAssistant(role, lead, facts, records, draws);
      if (asst !== undefined) {
        assistants.push(asst);
      }
    }
  }

  // `awardEquipment` of the shield booster and the ECM is cut.
  const autoWeapons = autoWeaponsOf(lead.record);
  setWeapons(lead.weaponTypes, LEADER_WEAPONS, autoWeapons, () =>
    draws.next("weapons"),
  ); // usually give aft laser
  lead.accuracy = setSkill(
    lead.accuracy,
    LEADER_SKILL,
    autoWeapons,
    lead.record.scanClass,
    () => draws.next("skill"),
  ); // likely to be good pilot
  // Not returning: `_setMissiles(lead, thug - 0.5)` is a cut, then `_setFuel`.
  lead.fuel = setFuel(lead.homeSystem, systemIndex, homeDistanceOf(facts));
  // ensure freighter escorts have a bounty
  addOffenderEscortBounty(escorts, draws);
  lead.cargoKind = "pirate";
  setEscortWeapons(escorts, draws);
  return finishShips([lead, ...escorts, ...assistants]);
}

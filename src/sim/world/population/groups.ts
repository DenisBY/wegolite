// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The group types of the initial populator and the builder dispatcher (Phase
 * 22, WORLD-08).
 *
 * A *group* is one run of one entry's callback in Oolite's `oolite-populator.js`
 * (`system.setPopulator(name, { callback })`, `Universe.m:1727`): the callback
 * adds one or more ships through `system.addShips` or `addGroup`, sets their
 * data and returns. {@link buildGroup} is the port of one such run: it takes the
 * entry, the injected {@link SystemFacts}, the catalogue records and the
 * group's {@link PopulationDraws}, and returns the {@link GroupPlan} of the
 * ships the callback would have left behind, in Oolite's creation order (a
 * leader first, then its escorts). It places nothing and spawns nothing: the
 * location and the entity come from plan 22-10.
 *
 * The builders (`traders.ts` in this plan, `pirates.ts` and `police.ts` in
 * plan 22-09) are pure functions of their inputs. The data they write is the
 * data the fixtures record (`tests/oracles/population`): record key, role,
 * primary role, bounty, cargo kind, fore and aft weapons, accuracy (float32),
 * fuel (tenths of a light year), home and destination system, fuel injector,
 * group links and escort slot. A builder that writes a path the port cuts
 * (missiles, AI switches, equipment other than the injector, heat insulation,
 * escort capacity: {@link POPULATOR_CUTS}) writes nothing for it and takes none
 * of its draws; `PopulationRecord` has no missile member, so no builder can
 * read a missile count (T-22-12).
 *
 * The record pick (`pickPopulationRecord`, in `kit.ts`) reads the role tokens
 * with `parseRoleToken` of the frozen inert module `populate.ts`, which is
 * imported and never edited.
 *
 * D-01: every builder takes its arriving branch. `options.arriving` is false
 * only for a station launch, which initial population never takes; the branch is
 * kept for Phase 26.
 */

import type { CargoKindName, WeaponTypes } from "../entity.js";
import type { PopulatorEntry } from "./table.js";
import type { SystemFacts } from "./plan.js";
import type { PopulationDraws } from "./streams.js";
import { buildFreighter } from "./traders.js";

export { pickPopulationRecord } from "./kit.js";

/** One `escort_roles` entry of a catalogue record (`ShipEntity.m:1619-1682`). */
export interface EscortRoleDefinition {
  readonly min: number;
  readonly max: number;
  /** A role token; empty counts toward the escort cap without a ship. */
  readonly role: string;
}

/**
 * The sim-side NPC record the builders read: the catalogue's own fields, with
 * no missile member. `autoAi`, `autoWeapons` and `hasFuelInjection` are the
 * compiled fuzzy booleans (probabilities); a builder tests `autoAi` and
 * `autoWeapons` as the script's booleans do (`> 0`) and rolls
 * `hasFuelInjection` against one `injector` draw. `fuel` is tenths of a light
 * year (the record's `fuel` times 10) and `bounty` the record's authored bounty.
 */
export interface PopulationRecord {
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
  readonly escortRoles: readonly EscortRoleDefinition[] | null;
  readonly forwardWeapon: string;
  readonly aftWeapon: string;
  readonly fuel: number;
  readonly bounty: number;
}

/**
 * One ship a group plans. `weaponTypes` follows `SpawnInit`: `null` is the
 * record's own type, `EQ_WEAPON_NONE` removes the mount. `accuracy` is the
 * float32 value, `fuel` tenths of a light year. `leaderIndex`, `ownerIndex`
 * index into the group's `ships`: a ship in an escort group names the group's
 * leader, an escort names its mother. `groupRecord` is whether Oolite created
 * an escort group for the ship (the leader of a set-up escort run, and every
 * escort in it).
 */
export interface PlannedPopShip {
  readonly recordKey: string;
  /** The role the ship was added with (`addShips`'s role, or the escort role). */
  readonly role: string;
  readonly primaryRole: string;
  readonly bounty: number;
  readonly cargoKind: CargoKindName;
  readonly weaponTypes: WeaponTypes;
  readonly accuracy: number;
  readonly fuel: number;
  readonly homeSystem: number;
  readonly destinationSystem: number;
  readonly injector: boolean;
  readonly leaderIndex: number | null;
  readonly ownerIndex: number | null;
  readonly escortSlot: number | null;
  readonly groupRecord: boolean;
}

/** The ships of one run of one entry's callback. */
export interface GroupPlan {
  /** The entry's registration ordinal (the stream key). */
  readonly ordinal: number;
  /** The group number within the entry. */
  readonly groupIndex: number;
  readonly location: PopulatorEntry["location"];
  readonly ships: readonly PlannedPopShip[];
}

/**
 * A ship while its group is being built: the planned fields, mutable, plus the
 * record it came from and the group links as references (resolved to indexes
 * by `finishShips`).
 */
export interface ShipDraft {
  readonly record: PopulationRecord;
  recordKey: string;
  role: string;
  primaryRole: string;
  bounty: number;
  cargoKind: CargoKindName;
  weaponTypes: WeaponTypes;
  accuracy: number;
  fuel: number;
  homeSystem: number;
  destinationSystem: number;
  injector: boolean;
  escortSlot: number | null;
  groupRecord: boolean;
  /** The escort's mother ship. */
  owner: ShipDraft | null;
  /** The leader of the ship's escort group. */
  groupLeader: ShipDraft | null;
}

export interface BuildOptions {
  /** The group number within the entry (the second part of the stream key). */
  readonly groupIndex: number;
  /** The arriving branch of the script; false is a station launch. Default true. */
  readonly arriving?: boolean;
}

/**
 * Port of one run of an entry's callback. An entry with no builder (a cut
 * entry) and a builder a later plan adds give an empty plan and take no draw.
 * A role no record carries gives an empty plan as well.
 */
export function buildGroup(
  entry: PopulatorEntry,
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: PopulationDraws,
  options: BuildOptions,
): GroupPlan {
  const arriving = options.arriving ?? true;
  let ships: readonly PlannedPopShip[] = [];
  switch (entry.builder) {
    case "freighter":
      ships = buildFreighter(facts, records, draws, { arriving });
      break;
    default:
      break;
  }
  return Object.freeze({
    ordinal: entry.ordinal,
    groupIndex: options.groupIndex,
    location: entry.location,
    ships,
  });
}

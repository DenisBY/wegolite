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
import { POPULATOR_ENTRIES } from "./table.js";
import type { PopulatorEntry } from "./table.js";
import { planCounts } from "./plan.js";
import type { CountDraws, SystemFacts } from "./plan.js";
import type { PopulationDraws } from "./streams.js";
import { buildLightHunter } from "./police.js";
import { buildIndependentPirate, buildPiratePack } from "./pirates.js";
import {
  buildCourierLong,
  buildCourierShort,
  buildFreighter,
  buildSmuggler,
} from "./traders.js";

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
  /**
   * Whether the group is a remote pirate pack: the script shifts the lane
   * position with `pos.z = pos.z % 100000` before the callback runs
   * (`oolite-populator.js:1881-1885`); the spawner applies `remotePackZ`
   * (`pirates.ts`) to the centre's z.
   */
  readonly remotePack: boolean;
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
  /**
   * The `pos.z` the callback was given, for the one test the script makes on it:
   * an independent pirate takes its missile-test draw `if (pos.z)`, so only a z
   * of exactly 0 (or NaN) skips the draw (`oolite-populator.js:1725`). Absent
   * counts non-zero, which is every planned position (placement happens after
   * planning, plan 22-10).
   */
  readonly posZ?: number | undefined;
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
    case "courierShort":
      ships = buildCourierShort(facts, records, draws, { arriving });
      break;
    case "courierLong":
      ships = buildCourierLong(facts, records, draws, { arriving });
      break;
    case "smuggler":
      ships = buildSmuggler(facts, records, draws, { arriving });
      break;
    case "lightHunter":
      ships = buildLightHunter(facts, records, draws);
      break;
    case "independentPirate":
      ships = buildIndependentPirate(facts, records, draws, {
        posZ: options.posZ,
      });
      break;
    case "lightPirateLocal":
      ships = buildPiratePack(facts, records, draws, "light", false);
      break;
    case "lightPirateRemote":
      ships = buildPiratePack(facts, records, draws, "light", true);
      break;
    case "mediumPirateLocal":
      ships = buildPiratePack(facts, records, draws, "medium", false);
      break;
    case "mediumPirateRemote":
      ships = buildPiratePack(facts, records, draws, "medium", true);
      break;
    case "heavyPirateLocal":
      ships = buildPiratePack(facts, records, draws, "heavy", false);
      break;
    case "heavyPirateRemote":
      ships = buildPiratePack(facts, records, draws, "heavy", true);
      break;
    default:
      break;
  }
  return Object.freeze({
    ordinal: entry.ordinal,
    groupIndex: options.groupIndex,
    location: entry.location,
    remotePack:
      entry.builder === "lightPirateRemote" ||
      entry.builder === "mediumPirateRemote" ||
      entry.builder === "heavyPirateRemote",
    ships,
  });
}

/**
 * Where a system's draws come from: the `count` draws of each counted entry and
 * the draws of one group. Production gives each its own forked stream
 * (`countDrawSource` and `populationDraws` of `streams.ts`); the replay gives
 * the recorded draws through the same interfaces.
 */
export interface SystemDraws {
  /** The next `count` draw of an entry (the three draws of its `randomise`). */
  readonly counts: CountDraws;
  /** The draws of group `groupIndex` of the entry `ordinal`. */
  readonly group: (ordinal: number, groupIndex: number) => PopulationDraws;
}

/**
 * The groups of a whole system: `planCounts` for the group count of every kept
 * entry, then `buildGroup` for each entry and group index, in engine order (a
 * stable sort by priority, equal priorities in registration order,
 * `Universe.m:9990-10001`). Within a group the ships are in creation order: the
 * leader, its engine escorts, then the script's own additions. A group whose
 * role no record carries is planned with no ships. Placement is not planned
 * here; a remote pack's group says so (`remotePack`) and the spawner applies
 * `remotePackZ`.
 *
 * Total (T-22-13): every group count is clamped to `MAX_ENTITIES` by
 * `planCounts` and every `addGroup` size to `1..64`, whatever the facts.
 */
export function planSystemGroups(
  facts: SystemFacts,
  records: readonly PopulationRecord[],
  draws: SystemDraws,
): readonly GroupPlan[] {
  const plans: GroupPlan[] = [];
  for (const planned of planCounts(facts, draws.counts)) {
    const entry = POPULATOR_ENTRIES[planned.ordinal];
    if (entry === undefined) {
      continue;
    }
    for (let groupIndex = 0; groupIndex < planned.count; groupIndex += 1) {
      plans.push(
        buildGroup(
          entry,
          facts,
          records,
          draws.group(planned.ordinal, groupIndex),
          { groupIndex },
        ),
      );
    }
  }
  return plans;
}

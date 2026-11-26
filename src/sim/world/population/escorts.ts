// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The engine escort model of the initial populator (Phase 22, D-08, WORLD-08).
 *
 * A ship whose record carries `escort_roles` sets its escorts up when it first
 * enters the world (`ShipEntity.m:1376-1378`, `setUpEscorts` then
 * `setUpMixedEscorts`, `:1619-1682`). The populator relies on it: the script
 * adds a freighter with `system.addShips("trader", ...)` and the engine adds
 * the escorts.
 *
 * - The mother's pending escort count starts at `MAX_ESCORTS` (16) for a record
 *   that authors `escort_roles` and no `escorts` (`ShipEntity.m:679-687`);
 *   every catalogue record is such a hull, so its `_maxEscortCount` is 0.
 * - For an `addShips` role of exactly `trader`, `Universe addShipAt:` removes
 *   the escorts when it feels safe (`Universe.m:2657-2665`): `Ranrot() % 7 <
 *   government`, then `nx = pending - 2 * (1 + (Ranrot() & 3))` and
 *   `setPendingEscortCount:` clamps to `_maxEscortCount` (`ShipEntity.m:6061-
 *   6064`). With `_maxEscortCount` 0 the clamp makes the pending count 0 whenever
 *   the test passes, so the trader gets no escorts at all (the recorded
 *   fixtures agree: in a government 7 system no trader has an escort). The
 *   removal does not apply to `trader-courier` or any other role.
 * - Per `escort_roles` entry, from `min` to `max - 1`, a `Ranrot() % 11 <
 *   government + 2` draw takes one escort off `max`; an entry with an empty
 *   role counts toward the cap of 16 without a ship; an entry whose role has
 *   no record ends that entry (`:1670-1672`).
 * - Each escort gets the primary role `escort`, the mother's owner link and
 *   the slot of its position (`:1684-1771`); an offender mother (bounty not
 *   0) gives it `1 | (Ranrot() & 15)` OR-ed into its bounty, a clean one
 *   forces 0. The script then OR-s `3 + floor(r * 12)` into the escorts of an
 *   offender trader (`oolite-populator.js:1433-1441`).
 * - `_setEscortWeapons` (`oolite-populator.js:2173-2205`) sets each escort's
 *   weapons from its primary role, last escort first.
 *
 * The stub that recorded the fixtures models exactly these pieces
 * (`tools/ai-harness/populator-host.ts`); the replay tests prove the port
 * against it. A police mother's `wingman` role and the escort ship positions
 * belong to plans 22-09 and 22-10. The escort position scatter draws are the
 * `scatter` stream of the spawn and are not taken here.
 *
 * The module is pure and total (T-22-11): `===` over arrays and strings only,
 * every loop bounded by the escort cap, the entry list and the `int8` range of
 * `min` and `max`.
 */

import type {
  EscortRoleDefinition,
  PopulationRecord,
  ShipDraft,
} from "./groups.js";
import {
  boundedBounty,
  createPlannedShip,
  numberOf,
  readField,
  setWeapons,
} from "./kit.js";
import type { PopulationDraws } from "./streams.js";

/** `MAX_ESCORTS` (`ShipEntity.h:76`). */
export const MAX_ESCORTS = 16;

/**
 * The most `escort_roles` entries read: the schema bound of the catalogue
 * (`MAX_ESCORT_ROLE_ENTRIES`, which the build enforces; the longest stock list
 * has 4). Oolite leaves the length unbounded; the port reads at most this many
 * so a tampered list cannot make the walk long.
 */
const MAX_ROLE_DEFINITIONS = 16;

/** An escort's primary role (`ShipEntity.m:1691`, `:1720`). */
export const ESCORT_PRIMARY_ROLE = "escort";

/** `int8_t` of a finite number, else `fallback` (`oo_intForKey` into `int8_t`). */
function int8Of(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return (Math.trunc(value) << 24) >> 24;
}

/** The `escort_roles` list of a record, or null when it authors none. */
function escortRolesOf(
  record: PopulationRecord,
): readonly EscortRoleDefinition[] | null {
  const roles = readField(record, "escortRoles");
  return Array.isArray(roles)
    ? (roles as readonly EscortRoleDefinition[])
    : null;
}

/**
 * `Universe.m:2657-2665` for a trader: whether the pending escorts are removed
 * (`Ranrot() % 7 < government`). Takes the second draw (`& 3`) only when the
 * first test passes. With `_maxEscortCount` 0 (an `escort_roles` hull without
 * `escorts`) the clamp of `setPendingEscortCount:` leaves 0 pending, so a
 * removal is the removal of every escort. The `nx` of the engine is computed
 * and clamped as the engine does.
 */
function pendingAfterRemoval(
  pending: number,
  maxEscortCount: number,
  government: number,
  draws: PopulationDraws,
): number {
  if (!(draws.nextU32("escort") % 7 < government)) {
    return pending;
  }
  const nx = pending - 2 * (1 + (draws.nextU32("escort") & 3));
  return Math.min(nx > 0 ? nx : 0, maxEscortCount);
}

/**
 * `setUpOneEscort:` (`ShipEntity.m:1684-1771`) without positions and AI:
 * primary role, group and owner links, slot and bounty.
 */
function setUpOneEscort(
  mother: ShipDraft,
  escort: ShipDraft,
  slot: number,
  draws: PopulationDraws,
): void {
  escort.primaryRole = ESCORT_PRIMARY_ROLE;
  escort.groupRecord = true;
  escort.groupLeader = mother;
  escort.owner = mother;
  escort.escortSlot = slot;
  if (mother.bounty !== 0) {
    // `1 | (ranrot_rand() & 15)`, then `markAsOffender:`: `bounty |= extra`.
    const extra = 1 | (draws.nextU32("escort") & 15);
    escort.bounty = boundedBounty((escort.bounty | extra) >>> 0);
  } else {
    escort.bounty = 0;
  }
}

/**
 * `setUpEscorts` of a ship that has just entered the world (`ShipEntity.m:
 * 1532-1682`), including the trader escort removal of `Universe.m:2657-2665`
 * when `addShipsRole` is exactly `"trader"`. Returns the escorts, in creation
 * order, and marks the leader and every escort as members of an escort group
 * (`groupRecord`, `groupLeader`, `owner`, `escortSlot`). A record without
 * `escort_roles`, or a removal, gives no escorts and takes no further draw; a
 * removed escort set-up leaves the leader without a group.
 *
 * Draws: the removal and per-entry rolls and the offender bonus on the
 * `escort` stream, each escort's pick, injector and accuracy on theirs.
 */
export function setUpEscorts(
  leader: ShipDraft,
  records: readonly PopulationRecord[],
  government: number,
  draws: PopulationDraws,
  addShipsRole: string,
  systemIndex: number,
): readonly ShipDraft[] {
  const roles = escortRolesOf(leader.record);
  if (roles === null) {
    return [];
  }
  // `escort_roles` without `escorts`: pending MAX_ESCORTS, `_maxEscortCount` 0.
  const maxEscortCount = 0;
  let pending = MAX_ESCORTS;
  if (addShipsRole === "trader") {
    pending = pendingAfterRemoval(pending, maxEscortCount, government, draws);
  }
  if (pending === 0) {
    return [];
  }

  // `setUpMixedEscorts`: the leader heads a fresh escort group.
  leader.groupRecord = true;
  leader.groupLeader = leader;
  const escorts: ShipDraft[] = [];
  let current = 0;
  for (const definition of roles.slice(0, MAX_ROLE_DEFINITIONS)) {
    if (current >= MAX_ESCORTS) {
      break;
    }
    const min = int8Of(readField(definition, "min"), 0);
    const max = int8Of(readField(definition, "max"), 2);
    const roleField = readField(definition, "role");
    const role = typeof roleField === "string" ? roleField : "escort";
    let desired = max;
    if (min < desired) {
      for (let i = min; i < max; i += 1) {
        if (draws.nextU32("escort") % 11 < government + 2) {
          desired -= 1;
        }
      }
    }
    for (let i = 0; i < desired; i += 1) {
      if (current >= MAX_ESCORTS) {
        break;
      }
      if (role !== "") {
        const escort = createPlannedShip(role, records, systemIndex, draws);
        if (escort === undefined) {
          break;
        }
        setUpOneEscort(leader, escort, current, draws);
        escorts.push(escort);
      }
      current += 1;
    }
  }
  return escorts;
}

/** The `_setWeapons` level of an escort's primary role, or undefined. */
function escortWeaponLevel(role: string): number | undefined {
  if (role === "escort" || role === "pirate-light-fighter") {
    return 1.3;
  }
  if (role === "escort-medium" || role === "pirate-medium-fighter") {
    return 1.8;
  }
  if (role === "escort-heavy" || role === "pirate-heavy-fighter") {
    return 2.05;
  }
  return undefined;
}

/**
 * `_setEscortWeapons` (`oolite-populator.js:2173-2205`): `_setWeapons` on every
 * escort of the mother, last first, by primary role: `escort` and
 * `pirate-light-fighter` 1.3, `escort-medium` and `pirate-medium-fighter` 1.8,
 * `escort-heavy` and `pirate-heavy-fighter` 2.05. A ship without `auto_weapons`
 * or with another role takes no draw. One draw per set escort, on the
 * `weapons` stream.
 */
export function setEscortWeapons(
  escorts: readonly ShipDraft[],
  draws: PopulationDraws,
): void {
  for (let i = escorts.length - 1; i >= 0; i -= 1) {
    const ship = escorts[i];
    if (ship === undefined || !(numberOf(ship.record.autoWeapons) > 0)) {
      continue;
    }
    const role = ship.primaryRole;
    const level = escortWeaponLevel(role);
    if (level === undefined) {
      continue;
    }
    setWeapons(ship.weaponTypes, level, true, () => draws.next("weapons"));
  }
}

/**
 * The offender bonus of the script (`oolite-populator.js:1433-1441`,
 * `:1564-1572`): every escort's bounty is OR-ed with `3 + floor(r * 12)`, one
 * `body` draw per escort, in group order.
 */
export function addOffenderEscortBounty(
  escorts: readonly ShipDraft[],
  draws: PopulationDraws,
): void {
  for (const escort of escorts) {
    const bonus = 3 + Math.floor(draws.next("body") * 12);
    escort.bounty = boundedBounty((escort.bounty | bonus) >>> 0);
  }
}

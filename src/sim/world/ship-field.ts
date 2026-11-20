// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The read-only ship field the flight step consults for mass lock and jump
 * blockage (WORLD-10).
 *
 * The flight step has no world: `stepSim` builds one `ShipField` per tick from
 * the world as it stood at the end of the previous tick and hands it to
 * `stepFlight` as a trailing parameter. Nothing here mutates the world, and the
 * field allocates nothing per ship (Pitfall 12): both queries are one linear
 * walk over `world.store.live` (at most `MAX_ENTITIES` entries) with the squared
 * distance computed inline.
 *
 * Mass lock follows Oolite. A ship locks the torus when its scan class is not in
 * the exempt list of `checkEntityForMassLock` (PlayerEntity.m lines 3044-3061)
 * and it lies strictly inside the scanner range: the outer test at line 2936 is
 * `zero_distance < SCANNER_MAX_RANGE2`, so a ship at exactly 25,600 m does not
 * lock. A station is a ship too (StationEntity.m:573), so the same strict gate
 * decides for it, and the station rule in `torus.ts` is `<` as well.
 *
 * Jump blockage follows `checkShipsInVicinityForWitchJumpExit` (ShipEntity.m
 * lines 12498-12531) through the station's own predicate, `isWitchspaceBlocked`
 * (`0.1 x mass > d^2` and `d^2 < scannerRange^2`, both strict). The loop tests
 * every ship, whatever its scan class. Masses come from the compiled NPC records
 * through the step options, and Oolite's loop names the first blocker in its own
 * sorted order while Wegolite reports only the kind.
 *
 * The two buoys are statics, not ships in the store, so the field answers for
 * them through `buoy(key)` (Phase 18, D-05, D-09, PD-01, PD-02): whether the
 * buoy is alive, its offset from its layout position and whether its
 * frangible subentity is still attached, as the previous tick left them. The
 * flight step blocks a completing jump with a live buoy at layout plus offset,
 * with the whole mass or, once the subentity is detached, the hull mass. A
 * destroyed buoy never blocks. Nothing about a buoy mass-locks (`CLASS_BUOY`,
 * PlayerEntity.m lines 3044-3061), and neither do pods and plates
 * (`CLASS_CARGO`); pods and plates have no entry in the NPC mass list, so
 * they never block a jump either (D-08, a recorded divergence: Oolite's loop
 * is class-free and would let them block at a few metres).
 */

import { isWitchspaceBlocked } from "../hyperspace/countdown.js";
import type { Vec3 } from "../math.js";
import type { ScanClass } from "./ids.js";
import {
  isBuoyDestroyed,
  isBuoySubentityAttached,
  type BuoyKey,
} from "./statics.js";
import type { World } from "./world.js";

/**
 * The scan classes that never mass-lock the player (PlayerEntity.m lines
 * 3044-3061). Every other class falls into Oolite's `default:` branch and locks.
 * Wegolite has no cloaking, so Oolite's cloaked-ship exception for
 * `CLASS_NO_DRAW` (line 3047) never applies and `CLASS_NO_DRAW` never locks.
 */
export const NON_LOCKING_SCAN_CLASSES: readonly ScanClass[] = [
  "CLASS_NO_DRAW",
  "CLASS_PLAYER",
  "CLASS_BUOY",
  "CLASS_ROCK",
  "CLASS_CARGO",
  "CLASS_MINE",
  "CLASS_VISUAL_EFFECT",
] as const;

/**
 * The compiled mass of one ship kind. Masses come from the compiled NPC records
 * through `StepOptions.hyperspace.shipMasses`, never from the entity: `Entity`
 * carries no mass field, so the world hash and the snapshot format stay as they
 * are.
 */
export interface ShipMass {
  readonly specKey: string;
  readonly mass: number;
}

/**
 * One buoy as the previous tick left it: alive (its health above 0), its
 * offset from the layout position (PD-02) and whether its subentity is
 * attached (PD-01).
 */
export interface BuoyField {
  readonly alive: boolean;
  readonly offset: Vec3;
  readonly subentityAttached: boolean;
}

/** The queries the flight step asks of the NPC ships and the buoys. */
export interface ShipField {
  /** True when a locking ship lies strictly inside `scannerRange` of `position`. */
  massLocked(position: Vec3, scannerRange: number): boolean;
  /**
   * True when a ship with a known mass blocks a jump completing at `position`
   * (`0.1 x mass > d^2` and `d^2 < scannerRange^2`).
   */
  blocks(position: Vec3, scannerRange: number): boolean;
  /** The liveness, offset and subentity attachment of the buoy `key`. */
  buoy(key: BuoyKey): BuoyField;
}

/**
 * Build the field for one tick. `masses` is the app-supplied list of compiled
 * masses; `undefined` means no ship blocks a jump.
 */
export function createShipField(
  world: World,
  masses: readonly ShipMass[] | undefined,
): ShipField {
  return {
    massLocked(position, scannerRange) {
      const live = world.store.live;
      const rangeSquared = scannerRange * scannerRange;
      for (let i = 0; i < live.length; i += 1) {
        const ship = live[i];
        if (ship === undefined || ship.dead) continue;
        const dx = ship.position.x - position.x;
        const dy = ship.position.y - position.y;
        const dz = ship.position.z - position.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        if (
          distanceSquared < rangeSquared &&
          !NON_LOCKING_SCAN_CLASSES.includes(ship.scanClass)
        ) {
          return true;
        }
      }
      return false;
    },
    blocks(position, scannerRange) {
      if (masses === undefined || masses.length === 0) return false;
      const live = world.store.live;
      for (let i = 0; i < live.length; i += 1) {
        const ship = live[i];
        if (ship === undefined || ship.dead) continue;
        const mass = massOf(masses, ship.specKey);
        if (mass === undefined) continue;
        const dx = ship.position.x - position.x;
        const dy = ship.position.y - position.y;
        const dz = ship.position.z - position.z;
        if (
          isWitchspaceBlocked(dx * dx + dy * dy + dz * dz, mass, scannerRange)
        ) {
          return true;
        }
      }
      return false;
    },
    buoy(key) {
      return {
        alive: !isBuoyDestroyed(world, key),
        offset: world.buoys[key].offset,
        subentityAttached: isBuoySubentityAttached(world, key),
      };
    },
  };
}

/**
 * The usable mass of `specKey`, or `undefined` when it has no entry or the
 * entry is not a finite positive number (T-12-10). A linear scan over a list of
 * at most nine kinds: no Map, no allocation.
 */
function massOf(
  masses: readonly ShipMass[],
  specKey: string,
): number | undefined {
  for (let i = 0; i < masses.length; i += 1) {
    const entry = masses[i];
    if (entry !== undefined && entry.specKey === specKey) {
      return Number.isFinite(entry.mass) && entry.mass > 0
        ? entry.mass
        : undefined;
    }
  }
  return undefined;
}

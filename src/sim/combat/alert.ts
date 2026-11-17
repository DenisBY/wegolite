// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's alert condition: the green, yellow and red light of the flight HUD
 * (FLGT-05, quick task 261117-pij).
 *
 * Oolite keeps a set of alert flags on the player (`PlayerEntity.h:223-229`)
 * and derives the condition from them (`PlayerEntity.m:5122-5144`): docked
 * gives "docked"; otherwise any flag gives yellow, and any flag above
 * `ALERT_FLAG_YELLOW_LIMIT` (0x03f) gives red. Mass lock (0x020) is the only
 * flag at or below the limit, so it alone is yellow; heat, altitude, energy and
 * hostiles each alone are red. `updateAlertConditionForNearbyEntities` sets the
 * flags in space (`PlayerEntity.m:2935-2993`) and clears every flag outside it
 * (`PlayerEntity.m:2894-2899`).
 *
 * Ported here, pure and deterministic: the flags, the in-space condition, the
 * altitude dial (`PlayerEntity.m:4330-4347`, `ShipEntity.m:6619-6631`) and the
 * hostiles scan (`PlayerEntity.m:2935-2950`, `ShipEntity.m:6398-6444`). Oolite's
 * hostiles clause also counts a cascade weapon (a Q-bomb blast); Wegolite has
 * no cascade weapon, so that clause has nothing to see and is not ported. The
 * docked condition is the F5 "Docked" string (`DOCKED_CONDITION` in
 * `src/ui/station-model.ts`); the HUD is hidden while docked, so it never
 * reaches this module.
 *
 * The module reads the world and never changes it.
 */

import { sub } from "../math.js";
import type { Vec3 } from "../math.js";
import { PLAYER_ID } from "../world/ids.js";
import type { BehaviourId } from "../world/ids.js";
import type { Entity } from "../world/entity.js";
import type { SystemLayout } from "../world/layout.js";
import type { World } from "../world/world.js";
import { SCANNER_MAX_RANGE } from "./constants.js";

/** `ALERT_FLAG_DOCKED` (`PlayerEntity.h:223`). */
export const ALERT_FLAG_DOCKED = 0x010;
/** `ALERT_FLAG_MASS_LOCK` (`PlayerEntity.h:224`). */
export const ALERT_FLAG_MASS_LOCK = 0x020;
/** `ALERT_FLAG_YELLOW_LIMIT` (`PlayerEntity.h:225`): flags above it are red. */
export const ALERT_FLAG_YELLOW_LIMIT = 0x03f;
/** `ALERT_FLAG_TEMP` (`PlayerEntity.h:226`). */
export const ALERT_FLAG_TEMP = 0x040;
/** `ALERT_FLAG_ALT` (`PlayerEntity.h:227`). */
export const ALERT_FLAG_ALT = 0x080;
/** `ALERT_FLAG_ENERGY` (`PlayerEntity.h:228`). */
export const ALERT_FLAG_ENERGY = 0x100;
/** `ALERT_FLAG_HOSTILES` (`PlayerEntity.h:229`). */
export const ALERT_FLAG_HOSTILES = 0x200;

/** `PLAYER_DIAL_MAX_ALTITUDE` (`PlayerEntity.h:287`), in metres. */
export const PLAYER_DIAL_MAX_ALTITUDE = 40_000;

/**
 * The behaviours Oolite's `IsBehaviourHostile` accepts (`ShipEntity.m:6398-6428`).
 * `ATTACK_MINING_TARGET` is commented out there, so it is not hostile.
 */
export const HOSTILE_BEHAVIOURS: readonly BehaviourId[] = [
  "ATTACK_TARGET",
  "ATTACK_FLY_TO_TARGET",
  "ATTACK_FLY_FROM_TARGET",
  "RUNNING_DEFENSE",
  "FLEE_TARGET",
  "ATTACK_BREAK_OFF_TARGET",
  "ATTACK_SLOW_DOGFIGHT",
  "EVASIVE_ACTION",
  "FLEE_EVASIVE_ACTION",
  "ATTACK_FLY_TO_TARGET_SIX",
  "ATTACK_FLY_TO_TARGET_TWELVE",
  "ATTACK_BROADSIDE",
  "ATTACK_BROADSIDE_LEFT",
  "ATTACK_BROADSIDE_RIGHT",
  "CLOSE_TO_BROADSIDE_RANGE",
  "CLOSE_WITH_TARGET",
  "ATTACK_SNIPER",
  "SCRIPTED_ATTACK_AI",
];

const HOSTILE_SET: ReadonlySet<BehaviourId> = new Set(HOSTILE_BEHAVIOURS);

/** Oolite's `IsBehaviourHostile` (`ShipEntity.m:6398-6428`). */
export function isBehaviourHostile(behaviour: BehaviourId): boolean {
  return HOSTILE_SET.has(behaviour);
}

/** What the flags are computed from, one frame at a time. */
export interface AlertInputs {
  /** The torus drive's mass lock. */
  readonly massLocked: boolean;
  /** The player's energy, Oolite's `energy`. */
  readonly energy: number;
  /** The player's maximum energy, Oolite's `maxEnergy`. */
  readonly maxEnergy: number;
  /** Oolite's `hullHeatLevel`: cabin temperature over 256, clamped to 0..1. */
  readonly heatLevel: number;
  /** Oolite's `dialAltitude`, 0..1 (see `dialAltitude`). */
  readonly altitudeDial: number;
  /** Whether a hostile is near the player (see `hostilesNearPlayer`). */
  readonly hostiles: boolean;
}

/**
 * The in-space alert flags (`PlayerEntity.m:2976-2993`). A non-finite energy,
 * heat level or altitude never sets its flag, so a bad number cannot turn the
 * light red.
 */
export function alertFlags(inputs: AlertInputs): number {
  let flags = 0;
  if (inputs.massLocked) flags |= ALERT_FLAG_MASS_LOCK;
  if (inputs.hostiles) flags |= ALERT_FLAG_HOSTILES;
  const { energy, maxEnergy } = inputs;
  if (
    Number.isFinite(energy) &&
    Number.isFinite(maxEnergy) &&
    energy < 64 &&
    energy < maxEnergy * 0.8
  ) {
    flags |= ALERT_FLAG_ENERGY;
  }
  if (Number.isFinite(inputs.heatLevel) && inputs.heatLevel > 0.9) {
    flags |= ALERT_FLAG_TEMP;
  }
  if (Number.isFinite(inputs.altitudeDial) && inputs.altitudeDial < 0.1) {
    flags |= ALERT_FLAG_ALT;
  }
  return flags;
}

/** The HUD light's colour in flight. */
export type FlightAlertCondition = "green" | "yellow" | "red";

/**
 * The in-space branch of Oolite's `alertCondition` (`PlayerEntity.m:5129-5137`):
 * no flag is green, any flag is yellow, a flag above the yellow limit is red.
 */
export function flightAlertCondition(flags: number): FlightAlertCondition {
  if (flags > ALERT_FLAG_YELLOW_LIMIT) return "red";
  if (flags !== 0) return "yellow";
  return "green";
}

/** A surface distance: centre distance minus radius. */
function surfaceDistance(position: Vec3, body: SystemLayout["planet"]): number {
  const d = sub(body.position, position);
  return Math.hypot(d.x, d.y, d.z) - body.radius;
}

/**
 * Oolite's `dialAltitude` (`PlayerEntity.m:4330-4347`): the surface distance to
 * the nearest stellar body, the planet or the sun, whichever surface is nearer
 * (`findNearestStellarBody`, `ShipEntity.m:6619-6631`), over 40,000 m and
 * clamped to 0..1. Inside a body it is 0.
 */
export function dialAltitude(position: Vec3, layout: SystemLayout): number {
  const planet = surfaceDistance(position, layout.planet);
  const sun = surfaceDistance(position, layout.sun);
  const nearest = sun < planet ? sun : planet;
  if (!Number.isFinite(nearest)) return 1;
  return Math.min(1, Math.max(0, nearest / PLAYER_DIAL_MAX_ALTITUDE));
}

/**
 * Oolite's `hasHostileTarget` (`ShipEntity.m:6430-6444`) for a target already
 * known to be the player: a missile always is; a ship avoiding a collision
 * uses the behaviour it saved before (`steer.saved`, Oolite's
 * `previousCondition`); any other entity uses its own behaviour.
 */
function hasHostileTarget(entity: Entity): boolean {
  if (entity.kind === "missile" || entity.scanClass === "CLASS_MISSILE") {
    return true;
  }
  if (entity.nav.behaviour === "AVOID_COLLISION") {
    const saved = entity.steer.saved;
    return saved !== null && isBehaviourHostile(saved.behaviour);
  }
  return isBehaviourHostile(entity.nav.behaviour);
}

const SCANNER_MAX_RANGE2 = SCANNER_MAX_RANGE * SCANNER_MAX_RANGE;

/**
 * The hostiles flag (`PlayerEntity.m:2935-2950`): a live entity within
 * scanner range, not `CLASS_NO_DRAW`, that is a Thargoid, or that has a
 * hostile target and targets the player. False with no world.
 */
export function hostilesNearPlayer(
  world: World | undefined,
  playerPosition: Vec3,
): boolean {
  if (world === undefined) return false;
  for (const entity of world.store.live) {
    if (entity.dead) continue;
    const d = sub(entity.position, playerPosition);
    const distance2 = d.x * d.x + d.y * d.y + d.z * d.z;
    if (!(distance2 < SCANNER_MAX_RANGE2)) continue;
    if (entity.scanClass === "CLASS_NO_DRAW") continue;
    if (entity.scanClass === "CLASS_THARGOID") return true;
    if (entity.nav.targetId === PLAYER_ID && hasHostileTarget(entity)) {
      return true;
    }
  }
  return false;
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The combat constants ledger (CBT-05, CBT-06, D-05, D-06, Pitfall 14).
 *
 * Every number the player combat core uses lives here, with the Oolite file and
 * line it comes from. A number that plays badly is a finding for the owner, not
 * a tweak: change it only after re-reading the Oolite source it cites.
 * `tests/sim/combat/constants.test.ts` pins the four lasers to
 * `equipment.json` `conditions.weapon_info` and the Cobra's energy, recharge,
 * weapon and view offsets to `ships-client.json`, so a drift between this ledger
 * and the compiled content fails a test.
 *
 * The module is pure data and one conversion function. It imports no content
 * and no renderer (`src/sim` rule); the content reaches the sim only as step
 * options, and the ledger is the sim's own copy of the Oolite numbers.
 *
 * Oolite line numbers refer to the pinned commit `7437f22`; the files cited
 * here are identical in the checkout.
 */

import { TICKS_PER_SECOND } from "../ai/time.js";
import type { LaserKind } from "../events.js";
import { vec } from "../math.js";
import type { Vec3 } from "../math.js";
import type { Facing, LaserKey } from "./mounts.js";

/** The colour names Oolite's `weapon_info` uses for the four player lasers. */
export type LaserColor =
  "redColor" | "yellowColor" | "blueColor" | "magentaColor";

/** One laser's numbers. */
export interface LaserStats {
  /** Reach in metres (`range`, `OOEquipmentType.m:655-678`). */
  readonly range: number;
  /** Energy spent per shot (`energy`, strict `<=` gate, `PlayerEntity.m:5478`). */
  readonly energy: number;
  /** Damage dealt to the target on a hit (`damage`, `ShipEntity.m:10362-10419`). */
  readonly damage: number;
  /** Seconds between shots (`recharge_rate`, gate `shot_time > rate`). */
  readonly rechargeRate: number;
  /**
   * `rechargeRate` in simulation ticks: `round(rechargeRate * 120)`. The gate
   * is strict (`shotTicks > rechargeTicks`), so the shot period is one tick
   * longer: 61 for the pulse laser, 13 for beam and military, 301 for mining.
   * This integer quantisation of Oolite's float-seconds compare is a recorded
   * divergence (RESEARCH W4).
   */
  readonly rechargeTicks: number;
  /** Heat added to the firing facing's temperature per shot. */
  readonly shotTemperature: number;
  /** The kind carried by the `laserFired` event (`src/sim/events.ts`). */
  readonly laserKind: LaserKind;
  /** The `weapon_info` colour name (`equipment.plist`). */
  readonly color: LaserColor;
}

function laserStats(stats: Omit<LaserStats, "rechargeTicks">): LaserStats {
  return Object.freeze({
    ...stats,
    rechargeTicks: Math.round(stats.rechargeRate * TICKS_PER_SECOND),
  });
}

/**
 * The four player lasers. Source: `Resources/Config/equipment.plist`
 * (vendored at `third_party/oolite/Config/equipment.plist`), `weapon_info` of
 * `EQ_WEAPON_PULSE_LASER` (lines 125-136), `EQ_WEAPON_BEAM_LASER` (143-154),
 * `EQ_WEAPON_MINING_LASER` (163-174) and `EQ_WEAPON_MILITARY_LASER` (184-195).
 */
export const LASER_STATS: Readonly<Record<LaserKey, LaserStats>> =
  Object.freeze({
    EQ_WEAPON_PULSE_LASER: laserStats({
      range: 12500,
      energy: 0.8,
      damage: 15,
      rechargeRate: 0.5,
      shotTemperature: 7,
      laserKind: "pulse",
      color: "redColor",
    }),
    EQ_WEAPON_BEAM_LASER: laserStats({
      range: 15000,
      energy: 0.5,
      damage: 6,
      rechargeRate: 0.1,
      shotTemperature: 3.2,
      laserKind: "beam",
      color: "yellowColor",
    }),
    EQ_WEAPON_MINING_LASER: laserStats({
      range: 12500,
      energy: 1.4,
      damage: 50,
      rechargeRate: 2.5,
      shotTemperature: 10,
      laserKind: "mining",
      color: "blueColor",
    }),
    EQ_WEAPON_MILITARY_LASER: laserStats({
      range: 30000,
      energy: 1.1,
      damage: 12,
      rechargeRate: 0.1,
      shotTemperature: 4.25,
      laserKind: "military",
      color: "magentaColor",
    }),
  });

/** How long a laser shot is drawn: `kLaserDuration`, `OOLaserShotEntity.m:36`. */
export const LASER_SHOT_DURATION = 0.09;

// --- Weapons: heat, cut-out and timers (RESEARCH W1-W8) ---------------------

/** Weapon heat lost per second, every facing: `ShipEntity.h:115`. */
export const WEAPON_COOLING_FACTOR = 6;

/** The player's weapon temperature scale: `PlayerEntity.h:277`. */
export const PLAYER_MAX_WEAPON_TEMP = 256;

/**
 * A facing at or above this fraction of `PLAYER_MAX_WEAPON_TEMP` refuses to
 * fire: `ShipEntity.h:117`, gate `PlayerEntity.m:5460`.
 */
export const WEAPON_COOLING_CUTOUT = 0.85;

/**
 * A shot timer's start value in seconds, so a first shot is never gated:
 * `INITIAL_SHOT_TIME`, `ShipEntity.h:102`, assigned at `PlayerEntity.m:1797-1800`.
 */
export const INITIAL_SHOT_TIME = 100;

/**
 * The shot timer's ceiling in ticks, which is also its start value. Oolite lets
 * the float keep growing; saturating at the start value keeps the timer a
 * bounded integer and lets a combat state with no recent shot stay pristine.
 */
export const SHOT_TIMER_SATURATION_TICKS = INITIAL_SHOT_TIME * TICKS_PER_SECOND;

// --- Shields and energy (RESEARCH S1-S10, N1) -------------------------------

/** Maximum shield with no boosters: `ShipEntity.h:101`. */
export const BASELINE_SHIELD_LEVEL = 128;

/** Shield recharge per second, each shield: `PlayerEntity.m:1536-1537`. */
export const SHIELD_RECHARGE_RATE = 2;

/**
 * The fraction of the energy banks kept back from shield recharge while both
 * shields are above a quarter: `PlayerEntity.m:2606`, default `0.25`. The
 * plist comment at `global-settings.plist:20-26` says 0.0 but the code
 * default decides (RESEARCH F9).
 */
export const SHIELD_CHARGE_ENERGYBANK_THRESHOLD = 0.25;

/** The Cobra Mk III's `max_energy`: `shipdata.plist:1333`. */
export const COBRA_MAX_ENERGY = 256;

/** The Cobra Mk III's `energy_recharge_rate` per second: `shipdata.plist:1296`. */
export const COBRA_ENERGY_RECHARGE_RATE = 4;

/**
 * The player Cobra Mk III's mass in kg (`ShipEntity.m:11053`, `mass`), the
 * compiled `mass` of `ships-client.json` `oolite_template_cobra3-player`
 * (Oolite derives it from the hull volume and `density`). A literal because
 * `src/sim` may not import the catalogue; `constants.test.ts` pins it. The
 * collision stage (`./collide.ts`, CBT-18) reads it as the player's `m1`.
 */
export const PLAYER_MASS_KG = 214_737.6875;

// --- Cabin temperature (RESEARCH C1-C5, D-05, D-06) -------------------------

/** Cabin cooling coefficient: `ShipEntity.h:63`. */
export const SHIP_COOLING_FACTOR = 0.1;

/** The cabin temperature cap: `ShipEntity.h:69`. */
export const SHIP_MAX_CABIN_TEMP = 256;

/** The cabin temperature floor and start value: `ShipEntity.h:70`, `PlayerEntity.m:1803`. */
export const SHIP_MIN_CABIN_TEMP = 60;

/** The player's heat insulation: `[self setHeatInsulation:1.0]`, `PlayerEntity.m:1531`. */
export const PLAYER_HEAT_INSULATION = 1;

/**
 * Cabin heat per point of energy damage: `SHIP_ENERGY_DAMAGE_TO_HEAT_FACTOR`,
 * `ShipEntity.h:67`, `(mass > 400000 ? 200000 / mass : 0.5)`. The Cobra's mass
 * is 214,737.6875, below the 400,000 threshold, so the factor is 0.5.
 */
export const ENERGY_DAMAGE_TO_HEAT_FACTOR = 0.5;

/**
 * The external temperature the cabin cools toward. D-05 keeps sun and
 * atmosphere heating out, so there is no external heat input: 0 (Oolite uses a
 * small positive value far from a sun). A recorded divergence.
 */
export const EXTERNAL_TEMPERATURE = 0;

// --- Ranges (RESEARCH "Also verified") --------------------------------------

/** The scanner's reach in metres: `Entity.h:49`. */
export const SCANNER_MAX_RANGE = 25600;

/**
 * The ident lock's search radius, 100 m inside the scanner range so a lock is
 * lost before the contact leaves the scanner: `Universe.m:5653`.
 */
export const IDENT_ACQUIRE_RANGE = SCANNER_MAX_RANGE - 100;

// --- The Cobra's mounts and views -------------------------------------------

function offsets(
  fore: Vec3,
  aft: Vec3,
  port: Vec3,
  starboard: Vec3,
): Readonly<Record<Facing, Vec3>> {
  return Object.freeze({
    fore: Object.freeze(fore),
    aft: Object.freeze(aft),
    port: Object.freeze(port),
    starboard: Object.freeze(starboard),
  });
}

/**
 * The Cobra Mk III's laser mount offsets in Oolite's model frame (x right,
 * y up, z toward the nose). Source: `shipdata.plist` cobra3-player
 * `weapon_position_forward/aft/port/starboard`
 * (`-0.0961 0.9367 43.4655`, `0 0 -33.5`, `-47.4 -2.3 0`, `47.4 -2.3 0`),
 * compiled into `ships-client.json` extras. Convert with `toWegoliteLocal`.
 */
export const COBRA_WEAPON_OFFSETS = offsets(
  vec(-0.0961, 0.9367, 43.4655),
  vec(0, 0, -33.5),
  vec(-47.4, -2.3, 0),
  vec(47.4, -2.3, 0),
);

/**
 * The Cobra Mk III's cockpit view offsets in Oolite's model frame. Source:
 * `shipdata.plist:1344-1347` `view_position_forward/aft/port/starboard`
 * (`0 7.25 31`, `0 6 -35.5`, `-35.5 7.5 0`, `35.5 7.5 0`).
 */
export const COBRA_VIEW_OFFSETS = offsets(
  vec(0, 7.25, 31),
  vec(0, 6, -35.5),
  vec(-35.5, 7.5, 0),
  vec(35.5, 7.5, 0),
);

/**
 * Convert an offset from Oolite's model frame to Wegolite's local frame, where
 * the ship's forward is -Z: `(x, y, -z)`. The content build maps Oolite to glTF
 * the same way (`glb.ts:247`), and `launch-camera.ts` `COCKPIT_OFFSET` is the
 * forward view offset already converted.
 */
export function toWegoliteLocal(v: Vec3): Vec3 {
  return vec(v.x, v.y, v.z === 0 ? 0 : -v.z);
}

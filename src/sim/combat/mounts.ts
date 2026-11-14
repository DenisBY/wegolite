// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The shared view and laser-mount vocabulary (CBT-04 views, CBT-05 mounts).
 *
 * Oolite fits a laser per weapon facing: fore, aft, port and starboard. The
 * cockpit views use the same four names, so one closed union serves both. Pure
 * data with no content imports: the sim validates any payload that names a
 * facing or a mount with the guards below, never with `in` (a tampered object
 * must not reach the prototype chain).
 */

/** Oolite's four weapon facings, which are also the four cockpit views. */
export const FACINGS = Object.freeze([
  "fore",
  "aft",
  "port",
  "starboard",
] as const);

export type Facing = (typeof FACINGS)[number];

/** Narrow an untrusted value to a facing by membership. */
export function isFacing(value: unknown): value is Facing {
  return FACINGS.some((facing) => facing === value);
}

/** The laser equipment keys that can occupy a mount (Oolite `EQ_WEAPON_*`). */
export const LASER_KEYS = Object.freeze([
  "EQ_WEAPON_PULSE_LASER",
  "EQ_WEAPON_BEAM_LASER",
  "EQ_WEAPON_MINING_LASER",
  "EQ_WEAPON_MILITARY_LASER",
] as const);

export type LaserKey = (typeof LASER_KEYS)[number];

/** An empty mount (Oolite's `EQ_WEAPON_NONE`). */
export const NO_LASER = "EQ_WEAPON_NONE" as const;

export type MountKey = LaserKey | typeof NO_LASER;

/** Narrow an untrusted value to a mount occupant: a laser key or none. */
export function isMountKey(value: unknown): value is MountKey {
  return value === NO_LASER || LASER_KEYS.some((key) => key === value);
}

/** One occupant per facing. */
export type LaserMounts = Readonly<Record<Facing, MountKey>>;

/**
 * The Cobra Mk III's stock fit: a pulse laser on the nose and nothing
 * elsewhere. Source: `shipdata.plist` cobra3-player
 * `forward_weapon_type = WEAPON_PULSE_LASER`, compiled into ships-client.json.
 */
export const DEFAULT_LASER_MOUNTS: LaserMounts = Object.freeze({
  fore: "EQ_WEAPON_PULSE_LASER",
  aft: NO_LASER,
  port: NO_LASER,
  starboard: NO_LASER,
});

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Flight constants derived from the player's catalogue entry (FLGT-02, FLGT-03,
 * T-3-01).
 *
 * The Phase 1 probe constants are explicitly placeholders ("nothing here may be
 * copied into the flight model"), so every number the flight step uses is
 * computed here from `oolite_template_cobra3-player`. A missing field throws a
 * named error naming it: defaulting a flight value to 0 would produce a ship
 * that cannot turn or move and would look like a physics bug.
 */

import type { ShipDef } from "../../content/types.js";

export interface FlightConfig {
  readonly maxSpeed: number;
  readonly thrustAccel: number;
  readonly maxPitch: number;
  readonly maxRoll: number;
  readonly pitchAccel: number;
  readonly rollAccel: number;
  readonly damping: number;
  readonly precisionFactor: number;
  readonly launchSpeed: number;
  readonly maxFuel: number;
  readonly maxCargo: number;
  readonly scannerRange: number;
  readonly torusMin: number;
  readonly torusMax: number;
}

/** Oolite's `SHIP_THRUST_FACTOR` (ShipEntity.h). */
const SHIP_THRUST_FACTOR = 5;
/** Oolite's keyboard ramp: `pitch_delta = 2 * max_flight_pitch` (PlayerEntity.m). */
const RATE_ACCEL_FACTOR = 2;
/** `PITCH_DAMPING_FACTOR` / `ROLL_DAMPING_FACTOR` (PlayerEntity.h). */
const DAMPING = 1;
/** `flight-arrow-key-precision-factor` default. */
const PRECISION_FACTOR = 0.5;
/** The dock imparts half the ship's top speed (DockEntity.m). */
const LAUNCH_SPEED_FACTOR = 0.5;
const SCANNER_RANGE = 25_600;
const TORUS_MIN = 32;
const TORUS_MAX = 1024;

/** A catalogue entry that cannot produce a usable flight model. */
export class FlightConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "FlightConfigError";
  }
}

function requireField(label: string, value: number | undefined): number {
  if (value === undefined) {
    throw new FlightConfigError(
      `Wegolite: the player catalogue entry is missing "${label}"; the flight config cannot be derived.`,
    );
  }
  if (!Number.isFinite(value)) {
    throw new FlightConfigError(
      `Wegolite: the player catalogue entry has a non-finite "${label}" (${String(value)}).`,
    );
  }
  return value;
}

/**
 * Derive every flight number from the player's `ShipDef`.
 *
 * @throws {FlightConfigError} naming the missing or non-finite field.
 */
export function deriveFlightConfig(shipDef: ShipDef): FlightConfig {
  const maxSpeed = requireField("maxFlightSpeed", shipDef.maxFlightSpeed);
  const thrust = requireField("thrust", shipDef.thrust);
  const maxPitch = requireField("maxFlightPitch", shipDef.maxFlightPitch);
  const maxRoll = requireField("maxFlightRoll", shipDef.maxFlightRoll);
  const maxFuel = requireField("fuel", shipDef.fuel);
  const maxCargo = requireField("maxCargo", shipDef.maxCargo);

  return {
    maxSpeed,
    thrustAccel: SHIP_THRUST_FACTOR * thrust,
    maxPitch,
    maxRoll,
    pitchAccel: RATE_ACCEL_FACTOR * maxPitch,
    rollAccel: RATE_ACCEL_FACTOR * maxRoll,
    damping: DAMPING,
    precisionFactor: PRECISION_FACTOR,
    launchSpeed: LAUNCH_SPEED_FACTOR * maxSpeed,
    maxFuel,
    maxCargo,
    scannerRange: SCANNER_RANGE,
    torusMin: TORUS_MIN,
    torusMax: TORUS_MAX,
  };
}

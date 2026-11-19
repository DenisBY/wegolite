// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The player's drift braking (CBT-18, D-02).
 *
 * Oolite's player carries a Newtonian `velocity` beside the scalar
 * `flightSpeed`. Every in-flight update first moves the position by it
 * (`applyVelocity:`, `Entity.m:878-881`, called at `PlayerEntity.m:3376`) and
 * then "power-brakes" it (`PlayerEntity.m:3378-3404`): the magnitude drops by
 * `dt x thrust x thrust_factor`, plus a cleanup term above 2,000 m/s, and the
 * drift becomes exactly zero once that would go negative.
 *
 * `thrust` is the raw catalogue value (32 for the Cobra), never the engine's
 * acceleration (`SHIP_THRUST_FACTOR x thrust`, 160): only NPCs brake with the
 * factor 5. `thrust_factor` is 1, or the torus factor while the speed is above
 * `maxSpeed` (injectors are not modelled). Oolite keeps `hyperspeedFactor` as
 * that factor for as long as the speed stays above `maxSpeed`, whereas
 * Wegolite resets `torus.factor` to 1 on a disengage (`torus.ts`) while the
 * speed is still ramping down from above `maxSpeed`; on those ticks the brake
 * uses factor 1. A small recorded edge (review L428), listed for the FIDELITY
 * walk.
 *
 * The C's locals and the `velocity` vector are GLfloat, so every step is
 * rounded with `Math.fround` exactly as the 18-03 oracle pins it: a double
 * port drifts away from Oolite's stop tick over the long cleanup runs. One
 * recorded representation difference: a drift whose float32 magnitude is 0
 * (its square underflows the float range) would never brake in Oolite, which
 * cannot hold such a vector for long anyway; here it becomes the zero vector,
 * so no `drift=` line lingers in the flight hash (review L174).
 */

import { vec } from "../math.js";
import type { Vec3 } from "../math.js";

const f = Math.fround;

/** `VELOCITY_CLEANUP_MIN`, the speed where power braking starts (`PlayerEntity.m:3346`). */
export const VELOCITY_CLEANUP_MIN = 2000;
/** `VELOCITY_CLEANUP_FULL`, the speed of the full cleanup rate (`PlayerEntity.m:3347`). */
export const VELOCITY_CLEANUP_FULL = 5000;
/** `VELOCITY_CLEANUP_RATE`, a float literal (`PlayerEntity.m:3348`). */
export const VELOCITY_CLEANUP_RATE = 0.001;

/** True when any component is non-zero. */
export function hasDrift(drift: Vec3): boolean {
  return drift.x !== 0 || drift.y !== 0 || drift.z !== 0;
}

/**
 * One tick of Oolite's power braking (`PlayerEntity.m:3387-3404`).
 *
 * @param thrust the raw catalogue thrust.
 * @param thrustFactor 1, or the torus factor while the speed exceeds `maxSpeed`.
 * @returns the braked drift; the zero vector once the brake exceeds it.
 */
export function brakePlayerDrift(
  drift: Vec3,
  dt: number,
  thrust: number,
  thrustFactor: number,
): Vec3 {
  // `velocity` is a float Vector.
  const x = f(drift.x);
  const y = f(drift.y);
  const z = f(drift.z);
  // magnitude(): the double sqrt of the float magnitude2, stored as GLfloat.
  const velmag = f(Math.sqrt(f(f(f(x * x) + f(y * y)) + f(z * z))));
  if (!(velmag > 0)) return vec(0, 0, 0);

  // `(float)delta_t * thrust * thrust_factor`, left to right in float.
  let velmag2 = f(velmag - f(f(f(dt) * f(thrust)) * f(thrustFactor)));
  if (velmag > VELOCITY_CLEANUP_MIN) {
    const rate =
      velmag > VELOCITY_CLEANUP_FULL
        ? f(VELOCITY_CLEANUP_RATE)
        : f(
            f(
              f(velmag - VELOCITY_CLEANUP_MIN) /
                f(VELOCITY_CLEANUP_FULL - VELOCITY_CLEANUP_MIN),
            ) * f(VELOCITY_CLEANUP_RATE),
          );
    velmag2 = f(velmag2 - f(velmag * rate));
  }
  if (velmag2 < 0) return vec(0, 0, 0);

  // vector_multiply_scalar(velocity, velmag2 / velmag), in float.
  const s = f(velmag2 / velmag);
  return vec(f(x * s), f(y * s), f(z * s));
}

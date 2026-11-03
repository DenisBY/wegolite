// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The torus drive and mass lock (FLGT-04, T-3-07, Pitfall 8).
 *
 * Oolite's hyperspeed factor is a pure function of the distance to the nearest
 * surface: `32 * sqrt(nearestSurface / (4 * SCANNER_MAX_RANGE))`, clamped to
 * `32..1024`. Mass lock is a separate, exact set of squared-distance predicates
 * for the station, planet and sun; a buoy is a nearest-surface candidate for the
 * factor but never mass-locks (Oolite's `CLASS_BUOY` branch is a no-op).
 *
 * Two rules keep the large factor safe (T-3-07):
 *
 * 1. Mass lock is evaluated **before** the speed/position integration every
 *    tick, so a ship that enters a lock is decelerated instead of teleporting
 *    through the station.
 * 2. The factor is clamped and finite, and the disengage deceleration uses the
 *    preserved `lastFactor`; speed is never snapped back to `maxSpeed`.
 *
 * This plan keeps FLGT-04's stricter "any pilot input disengages" rule rather
 * than Oolite's speed-only keyboard rule. That divergence is deliberate and is
 * recorded in the plan summary.
 */

import { clamp, length, lengthSquared, sub } from "../math.js";
import type { Vec3 } from "../math.js";
import type { SimEvent } from "../events.js";
import type { SystemLayout } from "../world/layout.js";
import type { FlightConfig } from "./config.js";
import type { ControlIntent } from "./controller.js";
import type { FlightState } from "./state.js";

/** Oolite's `SCANNER_MAX_RANGE` (Entity.h); also `config.scannerRange`. */
export const SCANNER_MAX_RANGE = 25_600;

/** Oolite's `MIN_HYPERSPEED_FACTOR` / `MAX_HYPERSPEED_FACTOR` (PlayerEntity.h). */
export const TORUS_MIN_FACTOR = 32;
export const TORUS_MAX_FACTOR = 1024;

/** Oolite's mass-lock surface margin: 25 km expressed in squared-distance form. */
const MASS_LOCK_SURFACE_MARGIN = 25_000;

/** The outcome of a `j` request, so the caller can report why it was refused. */
export interface TorusEngagement {
  readonly engaged: boolean;
  readonly factor: number;
  readonly massLocked: boolean;
}

/** The distance from `position` to the nearest body surface, never negative. */
export function nearestSurfaceDistance(
  position: Vec3,
  layout: SystemLayout,
): number {
  const bodies = [
    layout.station,
    layout.navBuoy,
    layout.witchpoint,
    layout.planet,
    layout.sun,
  ];
  let nearest = Infinity;
  for (const body of bodies) {
    const surface = Math.max(
      0,
      length(sub(position, body.position)) - body.radius,
    );
    nearest = Math.min(nearest, surface);
  }
  return nearest;
}

/**
 * The exact Oolite factor: `clamp(32 * sqrt(max(1, d / (4 * 25,600))), 32, 1024)`.
 * `max(1, …)` is Oolite's `if (factor < 1.0)` branch, not a rounding guard.
 */
export function torusFactor(
  nearestSurface: number,
  range = SCANNER_MAX_RANGE,
): number {
  const factor = nearestSurface / (4 * range);
  return clamp(
    TORUS_MIN_FACTOR * Math.sqrt(Math.max(1, factor)),
    TORUS_MIN_FACTOR,
    TORUS_MAX_FACTOR,
  );
}

/**
 * Oolite's mass-lock predicate (PlayerEntity.m `checkEntityForMassLock`).
 *
 * - Station: within 25,600 m of the centre (`<=`, so the boundary itself locks).
 * - Planet: `d^2 < 4r^2` (2 radii from the centre) or within 25 km of the surface.
 * - Sun: `d^2 < 2r^2` (sqrt(2) radii) or within 25 km of the surface.
 * - Buoys: never, regardless of distance.
 */
export function massLocked(position: Vec3, layout: SystemLayout): boolean {
  const stationDistanceSquared = lengthSquared(
    sub(position, layout.station.position),
  );
  if (stationDistanceSquared <= SCANNER_MAX_RANGE * SCANNER_MAX_RANGE) {
    return true;
  }

  const planetDistanceSquared = lengthSquared(
    sub(position, layout.planet.position),
  );
  const planetRadius = layout.planet.radius;
  if (planetDistanceSquared < 4 * planetRadius * planetRadius) return true;
  if (
    planetDistanceSquared <
    planetRadius * planetRadius +
      2 * MASS_LOCK_SURFACE_MARGIN * planetRadius +
      MASS_LOCK_SURFACE_MARGIN * MASS_LOCK_SURFACE_MARGIN
  ) {
    return true;
  }

  const sunDistanceSquared = lengthSquared(sub(position, layout.sun.position));
  const sunRadius = layout.sun.radius;
  if (sunDistanceSquared < 2 * sunRadius * sunRadius) return true;
  if (
    sunDistanceSquared <
    sunRadius * sunRadius +
      2 * MASS_LOCK_SURFACE_MARGIN * sunRadius +
      MASS_LOCK_SURFACE_MARGIN * MASS_LOCK_SURFACE_MARGIN
  ) {
    return true;
  }

  return false;
}

/**
 * Engage the torus drive, refusing while mass-locked.
 *
 * A refused request never sets `engaged`: the caller emits the mass-lock
 * feedback instead of pretending the drive started.
 */
export function engageTorus(
  state: FlightState,
  layout: SystemLayout,
): TorusEngagement {
  const locked = massLocked(state.position, layout);
  state.torus.massLocked = locked;
  if (locked) {
    return {
      engaged: false,
      factor: state.torus.factor,
      massLocked: true,
    };
  }

  state.torus.factor = torusFactor(
    nearestSurfaceDistance(state.position, layout),
  );
  state.torus.lastFactor = state.torus.factor;
  state.torus.engaged = true;
  return {
    engaged: true,
    factor: state.torus.factor,
    massLocked: false,
  };
}

/**
 * Disengage and preserve the factor the drive was running at.
 *
 * `lastFactor` is what makes the deceleration finite and gradual: it is the
 * multiplier the speed step uses until the ship is back at `maxSpeed`.
 */
export function disengageTorus(
  state: FlightState,
  reason: "input" | "massLock" | "toggle",
): void {
  if (!state.torus.engaged) return;
  // A mass-lock disengage must leave the flag set: the speed step reads it to
  // pick the x3 deceleration, even if the caller learned about the lock outside
  // the normal per-tick update.
  if (reason === "massLock") state.torus.massLocked = true;
  state.torus.lastFactor = state.torus.factor;
  state.torus.engaged = false;
  state.torus.factor = 1;
}

/**
 * Advance the torus/mass-lock state for one fixed step.
 *
 * Runs before `stepSpeed`, so a lock discovered here disengages before the
 * position integration uses the large speed (Pitfall 8). The returned events
 * carry numbers and reasons only; the app owns the wording.
 */
export function stepTorus(
  state: FlightState,
  layout: SystemLayout,
  config: FlightConfig,
  intent: ControlIntent,
  dt: number,
): SimEvent[] {
  const events: SimEvent[] = [];
  if (!Number.isFinite(dt) || dt <= 0) return events;

  const locked = massLocked(state.position, layout);
  if (locked !== state.torus.massLocked) {
    state.torus.massLocked = locked;
    events.push({ kind: "massLockChanged", locked });
  }

  if (intent.torusToggle) {
    if (state.torus.engaged) {
      disengageTorus(state, "toggle");
      events.push({ kind: "torusDisengaged", reason: "toggle" });
    } else {
      const engagement = engageTorus(state, layout);
      if (engagement.engaged) {
        events.push({ kind: "torusEngaged", factor: engagement.factor });
      } else {
        // "j while mass-locked" is refused and reports the mass lock, never a
        // silent no-op and never an `engaged: true` probe value.
        events.push({ kind: "torusDisengaged", reason: "massLock" });
      }
    }
  }

  if (!state.torus.engaged) return events;

  if (state.torus.massLocked) {
    disengageTorus(state, "massLock");
    events.push({ kind: "torusDisengaged", reason: "massLock" });
    return events;
  }

  // FLGT-04's stricter rule: pitch, roll or speed input all disengage.
  if (intent.pitch !== 0 || intent.roll !== 0 || intent.speed !== 0) {
    disengageTorus(state, "input");
    events.push({ kind: "torusDisengaged", reason: "input" });
    return events;
  }

  // Recomputed every tick: the factor rises as the ship leaves a body.
  state.torus.factor = torusFactor(
    nearestSurfaceDistance(state.position, layout),
    config.scannerRange,
  );
  state.torus.lastFactor = state.torus.factor;
  return events;
}

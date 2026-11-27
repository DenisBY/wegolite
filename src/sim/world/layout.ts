// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The system layout (WORLD-01, D-04, T-3-01).
 *
 * This module is the **only** definition of a system's body records for the
 * whole phase: every later plan reads `layout.planet`/`sun`/`station`/
 * `navBuoy`/`witchpoint` rather than re-deriving a position. It is pure: no
 * Three, no DOM, no clock, and no runtime content import — it takes the typed
 * `System` record and the station's `StationSpec` (the compiled radius, mass,
 * dock offset and roll of the system's main station) and returns plain numbers.
 *
 * Four fidelity rules are load-bearing and deliberately not "cleaned up":
 *
 * 1. `station_vector` and `sun_vector` are **not** unit vectors in the authored
 *    data. Oolite multiplies them as written, so Lave's station sits
 *    82,273.476 m from the planet, not 82,320 m. Use the raw vector for a
 *    position and normalise only for a direction.
 * 2. The Phase 2 converter negated Z, so the Coriolis dock/model-forward is
 *    local **-Z**. The base orientation is `quatFromUnitVectors((0,0,-1), …)`,
 *    never `Object3D.lookAt()` (which aims local +Z at the target).
 * 3. `station_roll` is authored in **right-angles per second**; Oolite's
 *    `setRoll:` multiplies by pi/2, so Lave's station turns at 0.1256637 rad/s.
 * 4. The witchpoint is the origin and the planet sits at `-planetDistance` on Z;
 *    the sun's safe-distance loop doubles `sunDistance` until the sun is at
 *    least six sun radii from the origin.
 */

import type { StationSpec, System } from "../../content/types.js";
import {
  add,
  lengthSquared,
  normalizeVec,
  quatFromUnitVectors,
  scale,
  sub,
  vec,
} from "../math.js";
import type { Quat, Vec3 } from "../math.js";

/** A body as the simulation and the scanner need it: a centre and a radius. */
export interface Body {
  readonly position: Vec3;
  readonly radius: number;
}

export interface SystemLayout {
  readonly planet: Body;
  readonly sun: Body;
  readonly station: Body;
  /** The kind of the main station (`system.station`); names its record. */
  readonly stationKind: StationSpec["kind"];
  /** The station's ship key; names its `ships-client.json` entry. */
  readonly stationKey: string;
  /** The station's compiled mass in kg, the witchspace blockage mass (plan 22.1-05). */
  readonly stationMass: number;
  readonly navBuoy: Body;
  readonly witchpoint: Body;
  /** Unit direction from the station toward the planet (the dock faces this). */
  readonly stationToPlanet: Vec3;
  /** Station orientation whose local -Z (the dock) points at the planet. */
  readonly stationBaseQuat: Quat;
  /** The station's world roll rate in rad/s, about its local +Z. */
  readonly stationRollRadPerSec: number;
  /** Metres from the station centre to the dock mouth. */
  readonly dockOffset: number;
  readonly scannerRange: number;
  readonly stationAegisRange: number;
  readonly planetAegisRange: number;
  /** Unit direction from the planet toward the sun; the scene's key light. */
  readonly sunDir: Vec3;
  /** Authored planet spin rate in rad/s (presentation only). */
  readonly rotationSpeed: number;
}

/**
 * Oolite's collision radii of the two buoys (hull plus solid subentities,
 * ShipEntity.m:2028-2044), compiled into ships-client.json by
 * tools/oolite-ingest/convert/ship-radius.ts, kept as literals because
 * src/sim may not import the content catalogue, and pinned by
 * tests/sim/layout.test.ts. The station's radius is not here: it arrives in
 * the `StationSpec`, compiled per station kind.
 */
const NAV_BUOY_RADIUS = 59.13554763793945;
const WITCHPOINT_RADIUS = 59.13554763793945;
const NAV_BUOY_OFFSET = 10_000;
const SCANNER_RANGE = 25_600;
const STATION_AEGIS_RANGE = 51_200;
const MIN_SUN_RADIUS = 1_000;

/** A layout record that cannot be derived from the committed content. */
export class LayoutError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LayoutError";
  }
}

/** Oolite's +Z forward becomes Wegolite's -Z forward; negate Z, keep X/Y. */
function toWegolite(vector: readonly [number, number, number]): Vec3 {
  return vec(vector[0], vector[1], -vector[2]);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) {
    throw new LayoutError(
      `Wegolite: the system layout derived a non-finite ${label} (${String(value)}).`,
    );
  }
}

function assertFiniteVec(label: string, value: Vec3): void {
  assertFinite(`${label}.x`, value.x);
  assertFinite(`${label}.y`, value.y);
  assertFinite(`${label}.z`, value.z);
}

function assertPositiveFinite(label: string, value: number): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new LayoutError(
      `Wegolite: the station spec has a non-positive or non-finite ${label} (${String(value)}); the layout cannot be derived.`,
    );
  }
}

/**
 * Derive every body, direction and range the phase needs from one `System`
 * record plus the spec of its main station (compiled radius, mass, dock offset
 * and roll; `stationSpecFor` builds it from the content catalogue).
 *
 * The spec must be the system's own station (Pitfall P2): a Coriolis spec over
 * an Icosahedron system would give a valid-looking layout with the wrong
 * radius, dock offset and mass, so a mismatch is a named error and every
 * caller passes the spec of `system.station`.
 *
 * @throws {LayoutError} when the spec is not the kind `system.station` names,
 * when a station number is not positive and finite or a derived number is not
 * finite — never a silently zeroed value (T-3-01).
 */
export function deriveSystemLayout(
  system: System,
  stationDef: StationSpec,
): SystemLayout {
  if (stationDef.kind !== system.station) {
    throw new LayoutError(
      `Wegolite: system ${system.id} has a ${system.station} station but the spec is the ${stationDef.kind} one; the layout cannot be derived.`,
    );
  }
  const planetRadius = system.radiusKm * 10;
  const planet = vec(0, 0, -system.planetDistance);

  // Positions use the authored vector verbatim; only directions are normalised.
  const stationVector = toWegolite(system.stationVector);
  const station = sub(planet, scale(stationVector, 2 * planetRadius));
  const stationToPlanet = normalizeVec(sub(planet, station));

  const sunVector = toWegolite(system.sunVector);
  let sunDistance = system.sunDistance;
  let sun = sub(planet, scale(sunVector, sunDistance));

  // Oolite keeps the sun at least six sun radii from the origin (Universe.m).
  const safeDistanceSquared = 36 * system.sunRadius * system.sunRadius;
  while (lengthSquared(sun) < safeDistanceSquared) {
    sunDistance *= 2;
    sun = sub(planet, scale(sunVector, sunDistance));
  }

  // Oolite clamps the collision radius after the safe-distance loop.
  const sunRadius = Math.min(
    Math.max(system.sunRadius, MIN_SUN_RADIUS),
    sunDistance / 2,
  );

  // T-3-01: the spec is data from the content build; a number the layout
  // cannot use is a named error, never a zeroed or Coriolis-shaped station.
  const { collisionRadius, dockOffset, mass, stationRoll } = stationDef;
  assertPositiveFinite("station collisionRadius", collisionRadius);
  assertPositiveFinite("station dockOffset", dockOffset);
  assertPositiveFinite("station mass", mass);
  assertFinite("station stationRoll", stationRoll);

  const layout: SystemLayout = {
    planet: { position: planet, radius: planetRadius },
    sun: { position: sun, radius: sunRadius },
    station: { position: station, radius: collisionRadius },
    stationKind: stationDef.kind,
    stationKey: stationDef.key,
    stationMass: mass,
    navBuoy: {
      position: add(station, scale(stationToPlanet, NAV_BUOY_OFFSET)),
      radius: NAV_BUOY_RADIUS,
    },
    witchpoint: { position: vec(0, 0, 0), radius: WITCHPOINT_RADIUS },
    stationToPlanet,
    stationBaseQuat: quatFromUnitVectors(vec(0, 0, -1), stationToPlanet),
    // `station_roll` is right-angles per second, not radians per second.
    stationRollRadPerSec: (stationRoll * Math.PI) / 2,
    dockOffset,
    scannerRange: SCANNER_RANGE,
    stationAegisRange: STATION_AEGIS_RANGE,
    planetAegisRange: 3 * planetRadius,
    sunDir: normalizeVec(sub(sun, planet)),
    rotationSpeed: system.rotation_speed,
  };

  assertFiniteVec("planet.position", layout.planet.position);
  assertFiniteVec("sun.position", layout.sun.position);
  assertFiniteVec("station.position", layout.station.position);
  assertFiniteVec("navBuoy.position", layout.navBuoy.position);
  assertFiniteVec("stationToPlanet", layout.stationToPlanet);
  assertFiniteVec("sunDir", layout.sunDir);
  assertFinite("stationRollRadPerSec", layout.stationRollRadPerSec);
  assertFinite("dockOffset", layout.dockOffset);
  assertFinite("planet.radius", layout.planet.radius);
  assertFinite("sun.radius", layout.sun.radius);

  return layout;
}

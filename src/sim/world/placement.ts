// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * Oolite's location samplers over the world stream (WORLD-15, WORLD-14).
 *
 * A port of the position helpers the populator callback uses to turn a
 * location code into a point: `OOHPVectorRandomSpatial`,
 * `OORandomPositionInCylinder` and `OORandomPositionInShell`
 * (OOHPVector.m lines 75-114), `Universe.m` `locationByCode` (lines 1783-1815)
 * and `quaternion_set_random` (OOQuaternion.m lines 41-48). `randf()` is
 * replaced by `rngNext` over the stream the caller passes (in production the
 * world stream `world.rng`), so a placement is a pure function of the stream
 * state and the layout.
 *
 * Oolite's `do ... while` loops are uncapped. Each loop here runs at most
 * `MAX_PLACEMENT_TRIES` candidates and accepts the last one after the cap,
 * returning `fallback: true`: a determinism and liveness device (T-12-16), not
 * a behaviour change for any committed system (the galaxy-0 sweep in
 * tests/sim/world/populate.test.ts asserts that no fallback is taken).
 *
 * Pure and trig-free: `+ - * /`, `Math.floor` and `Math.sqrt` only, so the
 * result is bit-identical across engines. No Three, no DOM, no clock.
 */

import { normalize, quat, vec } from "../math.js";
import type { Quat, Vec3 } from "../math.js";
import { rngNext } from "../rng.js";
import type { RngState } from "../rng.js";
import type { SystemLayout } from "./layout.js";

/** `LANE_WIDTH`, "currently twice scanner radius" (Universe.m line 112). */
export const LANE_WIDTH = 51_200;

/**
 * The most candidates a rejection loop tries before it accepts the last one.
 * Oolite's own loops are uncapped; this is the determinism and liveness cap.
 */
export const MAX_PLACEMENT_TRIES = 256;

/** The populator location codes this module samples. */
export type LocationCode =
  "LANE_WP" | "LANE_WS" | "LANE_PS" | "LANE_WPS" | "STATION_AEGIS";

/**
 * A sampled point. `fallback` is true when any rejection loop behind it
 * reached its cap and accepted its last candidate, so the point may lie
 * outside the region Oolite would have drawn from.
 */
export interface Sample {
  readonly position: Vec3;
  readonly fallback: boolean;
}

const ORIGIN: Vec3 = vec(0, 0, 0);

function distanceSquared(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dz = a.z - b.z;
  return dx * dx + dy * dy + dz * dz;
}

function distance(a: Vec3, b: Vec3): number {
  return Math.sqrt(distanceSquared(a, b));
}

/**
 * `OOHPVectorRandomSpatial` (OOHPVector.m lines 75-86): a point in the ball of
 * radius `maxLength`, from three draws `u - 0.5` per candidate, rejected while
 * the squared norm exceeds 0.25, scaled by `2 x maxLength`. `maxLength` 0
 * still consumes the draws of one accepted candidate.
 */
export function randomSpatial(
  rng: RngState,
  maxLength: number,
  maxTries: number = MAX_PLACEMENT_TRIES,
): Sample {
  let x = 0;
  let y = 0;
  let z = 0;
  let fallback = false;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    x = rngNext(rng) - 0.5;
    y = rngNext(rng) - 0.5;
    z = rngNext(rng) - 0.5;
    if (x * x + y * y + z * z <= 0.25) break;
    if (attempt === maxTries) fallback = true;
  }
  const factor = maxLength * 2;
  return { position: vec(x * factor, y * factor, z * factor), fallback };
}

/**
 * `OORandomPositionInCylinder` (OOHPVector.m lines 102-114): a point on the
 * segment `c1`-`c2` (one draw for the lerp parameter) plus a
 * `randomSpatial(radius)` offset, rejected while inside either exclusion
 * sphere. Oolite's "range too short" log line is not ported.
 */
export function positionInCylinder(
  rng: RngState,
  c1: Vec3,
  exclusion1: number,
  c2: Vec3,
  exclusion2: number,
  radius: number,
  maxTries: number = MAX_PLACEMENT_TRIES,
): Sample {
  const exclusion1Squared = exclusion1 * exclusion1;
  const exclusion2Squared = exclusion2 * exclusion2;
  let position = c1;
  let fallback = false;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const t = rngNext(rng);
    const offset = randomSpatial(rng, radius, maxTries);
    if (offset.fallback) fallback = true;
    position = vec(
      c1.x + (c2.x - c1.x) * t + offset.position.x,
      c1.y + (c2.y - c1.y) * t + offset.position.y,
      c1.z + (c2.z - c1.z) * t + offset.position.z,
    );
    if (
      distanceSquared(position, c1) >= exclusion1Squared &&
      distanceSquared(position, c2) >= exclusion2Squared
    ) {
      break;
    }
    if (attempt === maxTries) fallback = true;
  }
  return { position, fallback };
}

/**
 * `OORandomPositionInShell` (OOHPVector.m lines 116-124): `centre` plus a
 * `randomSpatial(outer)` offset, rejected while closer than `inner`.
 */
export function positionInShell(
  rng: RngState,
  centre: Vec3,
  inner: number,
  outer: number,
  maxTries: number = MAX_PLACEMENT_TRIES,
): Sample {
  const innerSquared = inner * inner;
  let position = centre;
  let fallback = false;
  for (let attempt = 1; attempt <= maxTries; attempt++) {
    const offset = randomSpatial(rng, outer, maxTries);
    if (offset.fallback) fallback = true;
    position = vec(
      centre.x + offset.position.x,
      centre.y + offset.position.y,
      centre.z + offset.position.z,
    );
    if (distanceSquared(position, centre) >= innerSquared) break;
    if (attempt === maxTries) fallback = true;
  }
  return { position, fallback };
}

/**
 * `locationByCode` (Universe.m lines 1783-1815) for the five codes the first
 * populator uses.
 *
 * - LANE_WP: the lane from the witchpoint (the origin, exclusion one scanner
 *   range) to the planet (exclusion 3 planet radii), `LANE_WIDTH` wide.
 * - LANE_WS and LANE_PS likewise for witchpoint-sun (sun exclusion 3 sun radii)
 *   and planet-sun.
 * - LANE_WPS: one draw against the lane lengths |planet|, |sun - planet| and
 *   |sun| picks WP, PS or WS; the chosen lane then samples as above.
 * - STATION_AEGIS: the shell between 1.2 station radii and two scanner ranges
 *   (51,200 m) around the station, repeated while the point lies within
 *   sqrt(1.5) planet radii of the planet centre.
 *
 * The sample's `fallback` is true if any loop behind it hit its cap.
 */
export function locationByCode(
  rng: RngState,
  code: LocationCode,
  layout: SystemLayout,
): Sample {
  const planet = layout.planet;
  const sun = layout.sun;
  switch (code) {
    case "LANE_WPS": {
      const l1 = distance(planet.position, ORIGIN);
      const l2 = distance(sun.position, planet.position);
      const l3 = distance(sun.position, ORIGIN);
      const total = l1 + l2 + l3;
      const choice = rngNext(rng);
      if (choice < l1 / total) return locationByCode(rng, "LANE_WP", layout);
      if (choice < (l1 + l2) / total) {
        return locationByCode(rng, "LANE_PS", layout);
      }
      return locationByCode(rng, "LANE_WS", layout);
    }
    case "LANE_WP":
      return positionInCylinder(
        rng,
        ORIGIN,
        layout.scannerRange,
        planet.position,
        planet.radius * 3,
        LANE_WIDTH,
      );
    case "LANE_WS":
      return positionInCylinder(
        rng,
        ORIGIN,
        layout.scannerRange,
        sun.position,
        sun.radius * 3,
        LANE_WIDTH,
      );
    case "LANE_PS":
      return positionInCylinder(
        rng,
        planet.position,
        planet.radius * 3,
        sun.position,
        sun.radius * 3,
        LANE_WIDTH,
      );
    case "STATION_AEGIS": {
      const planetLimit = planet.radius * planet.radius * 1.5;
      let sample: Sample = {
        position: layout.station.position,
        fallback: false,
      };
      let fallback = false;
      for (let attempt = 1; attempt <= MAX_PLACEMENT_TRIES; attempt++) {
        sample = positionInShell(
          rng,
          layout.station.position,
          layout.station.radius * 1.2,
          layout.scannerRange * 2,
        );
        if (sample.fallback) fallback = true;
        if (distanceSquared(sample.position, planet.position) >= planetLimit) {
          break;
        }
        if (attempt === MAX_PLACEMENT_TRIES) fallback = true;
      }
      return { position: sample.position, fallback };
    }
  }
}

/**
 * `quaternion_set_random` (OOQuaternion.m lines 41-48): four components
 * `floor(u * 1024) - 511.5` (Oolite's `Ranrot() % 1024 - 511.5`), then
 * normalised. Its distribution favours the corners of the hypercube, as
 * Oolite's own comment admits; ported as is.
 */
export function randomQuaternion(rng: RngState): Quat {
  const w = Math.floor(rngNext(rng) * 1024) - 511.5;
  const x = Math.floor(rngNext(rng) * 1024) - 511.5;
  const y = Math.floor(rngNext(rng) * 1024) - 511.5;
  const z = Math.floor(rngNext(rng) * 1024) - 511.5;
  return normalize(quat(w, x, y, z));
}

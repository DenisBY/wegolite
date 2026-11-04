// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * A CPU mirror of the planet's procedural field, plus the calibration that
 * turns an authored land/cloud/ice fraction into a level set.
 *
 * This exists because the field the fragment shader draws is not uniformly
 * distributed: the normalised octave sum clusters around its midpoint, so
 * cutting it at `1 - land_fraction` renders 87% land for an authored 65%
 * (debug report `lave-planet-washed-out`, Evidence 00:25). The fix is to
 * measure the field the shader actually evaluates and cut it at the matching
 * quantile. That measurement has to run somewhere, and it cannot run on the
 * GPU without a readback, so it runs here — deterministically, from the
 * compiled seed, with no `Math.random` and no wall clock.
 *
 * The shape of the module follows `src/render/camera-relative.ts`: a small,
 * typed, DOM-free render helper whose comment explains why it exists and which
 * is testable in Node.
 *
 * **Fidelity is distribution-level, not sample-level.** GLSL float32 and TS
 * float64 agree to about 1e-6 only while the `fract` arguments stay small; the
 * six-octave loop grows the sample point to about `3.1 * 2.03^5 = 107`, and
 * `hash31` then multiplies three `fract(p * 17)` factors, so the final product
 * reaches about `2.5e5` where a float32 ULP is about `0.016`. Every assertion
 * built on this mirror is therefore a quantile, a share or a band fraction with
 * a tolerance — never a per-sample equality between mirror and shader. The
 * mirror exists to measure, never to render.
 */

/** A direction or lattice point; structurally compatible with `THREE.Vector3`. */
export interface Vec3Like {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** The surface is six octaves; see the shader's `fbm` for the constants. */
export const SURFACE_SCALE = 3.1;
export const SURFACE_OCTAVES = 6;
export const CLOUD_SCALE = 5.3;
export const CLOUD_OCTAVES = 4;

/** Directions on the deterministic sample sphere (a Fibonacci lattice). */
export const SURFACE_SAMPLES = 4096;

/**
 * PlanetMix band widths, mirrored from `OOPlanetTextureGenerator.m`
 * (`PlanetMix`, `:636-690`): `COASTLINE_PORTION = 1/160`,
 * `SHALLOWS = 2/160`, `DEEPS = 40/160 = 0.25`.
 */
export const COASTLINE_PORTION = 1 / 160;
export const SHALLOWS = 2 / 160;
export const DEEPS = 0.25;

/** `Oolite`'s snowline rule: `mix_hi = 0.66667 * (land-range top)`. */
const SNOWLINE_FRACTION = 0.66667;

/** Oolite's ice ramp is `0.02` wide in `q` (`PlanetMix`, `:681-690`). */
export const ICE_RAMP = 0.02;

export interface SurfaceCalibration {
  readonly noiseLo: number;
  readonly noiseScale: number;
  readonly seaBias: number;
  readonly poleValue: number;
  readonly polarCap: number;
  readonly mixHi: number;
}

export interface CloudCalibration {
  readonly noiseLo: number;
  readonly noiseScale: number;
  readonly threshold: number;
}

/** The measured latitude span that carries ice, in degrees. */
export interface IceLatitudeRange {
  readonly minAbsLatitude: number;
  readonly maxAbsLatitude: number;
}

/** The measured range of the planet field `q` over the sample sphere. */
export interface QRange {
  readonly min: number;
  readonly max: number;
}

/**
 * The seven reachable PlanetMix classes plus `"snow"`.
 *
 * `"snow"` is the `q > 1` branch. Oolite keeps it because overrides can drive
 * `q` between -2 and +2 (`OOPlanetTextureGenerator.m:662`), but a base system
 * cannot reach it: the calibrated top is `1 + seaBias` (0.42871 for Lave),
 * which is below 1. The class stays in the union because the shader keeps the
 * branch; no base-system sample can produce it. Note that the calibrated top is
 * `1 + seaBias`, **not** `landFraction`: Oolite's equivalent top is
 * `landFraction` only because Oolite's field spans `[0, 1]` and sets
 * `seaBias = landFraction - 1` (`OOPlanetTextureGenerator.m:408`).
 */
export type TerrainClass =
  "deep" | "shelf" | "sea" | "coast" | "land" | "highland" | "snow" | "ice";

export interface ClassifiedSample {
  readonly q: number;
  readonly class: TerrainClass;
}

function fract(value: number): number {
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Linear interpolation, matching GLSL `mix(a, b, t)` for `t` in `[0, 1]`. */
function mix(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** GLSL `hash31`, line for line. */
export function hash31(p: Vec3Like): number {
  const x = fract(p.x * 0.3183099 + 0.71) * 17;
  const y = fract(p.y * 0.3183099 + 0.113) * 17;
  const z = fract(p.z * 0.3183099 + 0.419) * 17;
  return fract(x * y * z * (x + y + z));
}

/** GLSL `valueNoise`: trilinear interpolation of the eight lattice corners. */
export function valueNoise(p: Vec3Like): number {
  const cellX = Math.floor(p.x);
  const cellY = Math.floor(p.y);
  const cellZ = Math.floor(p.z);
  const fx = p.x - cellX;
  const fy = p.y - cellY;
  const fz = p.z - cellZ;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);

  const n000 = hash31({ x: cellX, y: cellY, z: cellZ });
  const n100 = hash31({ x: cellX + 1, y: cellY, z: cellZ });
  const n010 = hash31({ x: cellX, y: cellY + 1, z: cellZ });
  const n110 = hash31({ x: cellX + 1, y: cellY + 1, z: cellZ });
  const n001 = hash31({ x: cellX, y: cellY, z: cellZ + 1 });
  const n101 = hash31({ x: cellX + 1, y: cellY, z: cellZ + 1 });
  const n011 = hash31({ x: cellX, y: cellY + 1, z: cellZ + 1 });
  const n111 = hash31({ x: cellX + 1, y: cellY + 1, z: cellZ + 1 });

  return mix(
    mix(mix(n000, n100, ux), mix(n010, n110, ux), uy),
    mix(mix(n001, n101, ux), mix(n011, n111, ux), uy),
    uz,
  );
}

/**
 * GLSL `fbm`: the normalised octave sum.
 *
 * The shader caps the loop at six iterations and breaks at `octaves`; the
 * mirror does the same so a four-octave cloud field is the same function in
 * both places.
 */
export function fbm(p: Vec3Like, octaves: number): number {
  let total = 0;
  let amplitude = 0.5;
  let norm = 0;
  let x = p.x;
  let y = p.y;
  let z = p.z;

  for (let octave = 0; octave < 6; octave++) {
    if (octave >= octaves) break;
    total += valueNoise({ x, y, z }) * amplitude;
    norm += amplitude;
    x = x * 2.03 + 1.7;
    y = y * 2.03 + 9.2;
    z = z * 2.03 + 4.1;
    amplitude *= 0.5;
  }

  return total / Math.max(norm, 0.0001);
}

/**
 * A Fibonacci sphere of `count` unit directions.
 *
 * `y` is evenly spaced, so equal-`y` bins hold equal shares; equal-degree
 * latitude bins would not. The layout is fixed by `count` alone — no random
 * number generator is involved — which is what makes every measurement below
 * reproducible from the compiled record.
 */
export function fibonacciDirections(
  count: number = SURFACE_SAMPLES,
): Vec3Like[] {
  const directions: Vec3Like[] = [];
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < count; index++) {
    const y = 1 - (2 * (index + 0.5)) / count;
    const radius = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * index;
    directions.push({
      x: Math.cos(theta) * radius,
      y,
      z: Math.sin(theta) * radius,
    });
  }

  return directions;
}

/** The surface field the shader evaluates, on one direction. */
export function sampleSurface(dir: Vec3Like, seed: number): number {
  return fbm(
    {
      x: dir.x * SURFACE_SCALE + seed,
      y: dir.y * SURFACE_SCALE + seed,
      z: dir.z * SURFACE_SCALE + seed,
    },
    SURFACE_OCTAVES,
  );
}

/** The cloud field the shader evaluates (the shader adds a time drift). */
export function sampleCloud(dir: Vec3Like, seed: number): number {
  const offset = seed * 1.7 + 13;
  return fbm(
    {
      x: dir.x * CLOUD_SCALE + offset,
      y: dir.y * CLOUD_SCALE + offset,
      z: dir.z * CLOUD_SCALE + offset,
    },
    CLOUD_OCTAVES,
  );
}

/**
 * Linear-interpolated quantile (numpy's default), on an ascending array.
 *
 * Nearest-rank would work for the land share but shifts `mixHi` and the
 * highland share; the plan's pinned numbers use interpolation, so this does
 * too.
 */
function quantile(sorted: ArrayLike<number>, p: number): number {
  if (sorted.length === 0) {
    throw new Error("Wegolite: quantile of an empty sample");
  }
  const position = (sorted.length - 1) * clamp(p, 0, 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const t = position - lower;
  return (sorted[lower] as number) * (1 - t) + (sorted[upper] as number) * t;
}

function sortedAscending(values: ArrayLike<number>): number[] {
  return Array.from(values).sort((a, b) => a - b);
}

// The raw surface field per seed is the expensive part of calibration and every
// measurement helper needs it; memoising it keeps construction and the test
// suite fast without changing a single output. The cache is keyed by the seed
// alone, so it introduces no per-machine state.
const RAW_SURFACE_CACHE = new Map<number, Float64Array>();

function rawSurfaceSamples(seed: number): Float64Array {
  const cached = RAW_SURFACE_CACHE.get(seed);
  if (cached !== undefined) return cached;

  const directions = fibonacciDirections();
  const samples = new Float64Array(directions.length);
  for (let index = 0; index < directions.length; index++) {
    samples[index] = sampleSurface(directions[index] as Vec3Like, seed);
  }
  RAW_SURFACE_CACHE.set(seed, samples);
  return samples;
}

/**
 * Derive the shader's thresholds from the authored fractions.
 *
 * The shader computes
 * `q = mix(u + seaBias, poleValue, nearPole)` where `u = (raw - noiseLo) *
 * noiseScale` is the clamped normalisation and `nearPole = dir.y * dir.y`.
 * Because `mix(u + s, p, nP) = (1 - nP) * (u + s) + nP * p`, the value
 * `w = u + nP * p / (1 - nP)` is affine in `seaBias` and `q > 0` exactly when
 * `w + seaBias > 0`. Cutting at the `1 - landFraction` quantile of `w`
 * therefore makes the land set exactly `landFraction` of the sampled sphere —
 * it is exact by construction, not tuned.
 *
 * `mixHi` is Oolite's two-thirds rule applied to *this* field: Oolite writes
 * `mix_hi = 0.66667 * landFraction` because its field's land-range top is
 * `landFraction`; the calibrated field's top is `1 + seaBias` (0.42871 for
 * Lave), so the rule becomes `0.66667 * (1 + seaBias)` = 0.28581. Applying the
 * literal `0.66667 * landFraction` here would put the snowline above the
 * field's top and render nothing.
 *
 * @param seed `seedToUniform(random_seed)` — the same float the shader gets.
 * @param landFraction authored `land_fraction`, clamped to `[0, 1]`.
 * @param polarFraction authored `percent_ice / 100` (Oolite default 0.05).
 */
export function calibrateSurface(
  seed: number,
  landFraction: number,
  polarFraction: number,
): SurfaceCalibration {
  const land = clamp(landFraction, 0, 1);
  const ice = clamp(polarFraction, 0, 1);
  const directions = fibonacciDirections();
  const raw = rawSurfaceSamples(seed);

  const noiseLo = quantile(sortedAscending(raw), 0.001);
  const noiseHi = quantile(sortedAscending(raw), 0.999);
  const noiseScale = 1 / Math.max(noiseHi - noiseLo, 1e-6);

  const poleValue = land > 0.5 ? 0.5 * land : 0;
  const transformed = new Float64Array(directions.length);
  for (let index = 0; index < directions.length; index++) {
    const direction = directions[index] as Vec3Like;
    const nearPole = direction.y * direction.y;
    const u = clamp(((raw[index] as number) - noiseLo) * noiseScale, 0, 1);
    transformed[index] =
      u + (nearPole / Math.max(1 - nearPole, 1e-4)) * poleValue;
  }

  const seaBias = clamp(
    -quantile(sortedAscending(transformed), 1 - land),
    -0.98,
    0.02,
  );
  const polarCap = (1 - ice) * (0.28 + 0.24 * land);
  const mixHi = SNOWLINE_FRACTION * (1 + seaBias);

  return { noiseLo, noiseScale, seaBias, poleValue, polarCap, mixHi };
}

/**
 * Derive the cloud threshold from `cloud_fraction` with the same method.
 *
 * The shader normalises the cloud field exactly as it normalises the surface,
 * so the threshold is the `1 - cloudFraction` quantile of that normalised
 * field; coverage then equals the authored fraction instead of the pre-fix
 * ~2.7% speckle.
 */
export function calibrateClouds(
  seed: number,
  cloudFraction: number,
): CloudCalibration {
  const fraction = clamp(cloudFraction, 0, 1);
  const directions = fibonacciDirections();
  const raw = directions.map((direction) => sampleCloud(direction, seed));

  const noiseLo = quantile(sortedAscending(raw), 0.001);
  const noiseHi = quantile(sortedAscending(raw), 0.999);
  const noiseScale = 1 / Math.max(noiseHi - noiseLo, 1e-6);
  const normalised = raw.map((value) =>
    clamp((value - noiseLo) * noiseScale, 0, 1),
  );

  return {
    noiseLo,
    noiseScale,
    threshold: quantile(sortedAscending(normalised), 1 - fraction),
  };
}

/** The shader's `q` for one direction and calibration. */
function surfaceQ(
  dir: Vec3Like,
  seed: number,
  calibration: SurfaceCalibration,
): number {
  const raw = sampleSurface(dir, seed);
  const u = clamp((raw - calibration.noiseLo) * calibration.noiseScale, 0, 1);
  const nearPole = dir.y * dir.y;
  return mix(u + calibration.seaBias, calibration.poleValue, nearPole);
}

/** Fraction of the sampled sphere with `q > 0` — the measured land share. */
export function measuredLandFraction(
  calibration: SurfaceCalibration,
  seed: number,
): number {
  const directions = fibonacciDirections();
  let land = 0;
  for (const direction of directions) {
    if (surfaceQ(direction, seed, calibration) > 0) land++;
  }
  return land / directions.length;
}

function absLatitudeDegrees(dir: Vec3Like): number {
  return (Math.asin(clamp(Math.abs(dir.y), 0, 1)) * 180) / Math.PI;
}

/**
 * Fraction of the `[minAbsLatitude, maxAbsLatitude]` band that carries ice.
 *
 * **The denominator is the band, not the sphere.** `(…, 60, 90)` is the polar
 * cap, `(…, 0, 5)` is the equator and `(…, 45, 55)` is the transition; a
 * single-minimum reading would silently turn `(…, 0)` into a whole-sphere
 * measurement and no assertion would mean what it says.
 *
 * Ice uses Oolite's `phi = 2 * polarCap - nearPole` and `ice = q > phi`
 * (`OOPlanetTextureGenerator.m:678-690`); the shader's `ice` blend is the same
 * threshold with a 0.02 ramp.
 */
export function measuredIceFraction(
  calibration: SurfaceCalibration,
  seed: number,
  minAbsLatDegrees: number,
  maxAbsLatDegrees = 90,
): number {
  const directions = fibonacciDirections();
  let inBand = 0;
  let icy = 0;

  for (const direction of directions) {
    const latitude = absLatitudeDegrees(direction);
    if (latitude < minAbsLatDegrees || latitude > maxAbsLatDegrees) continue;
    inBand++;
    const nearPole = direction.y * direction.y;
    const phi = 2 * calibration.polarCap - nearPole;
    if (surfaceQ(direction, seed, calibration) > phi) icy++;
  }

  return inBand === 0 ? 0 : icy / inBand;
}

/** The latitude span that carries any ice, in absolute degrees. */
export function measuredIceLatitudeRange(
  calibration: SurfaceCalibration,
  seed: number,
): IceLatitudeRange {
  const directions = fibonacciDirections();
  let minAbsLatitude = Number.POSITIVE_INFINITY;
  let maxAbsLatitude = Number.NEGATIVE_INFINITY;

  for (const direction of directions) {
    const nearPole = direction.y * direction.y;
    const phi = 2 * calibration.polarCap - nearPole;
    if (surfaceQ(direction, seed, calibration) <= phi) continue;
    const latitude = absLatitudeDegrees(direction);
    minAbsLatitude = Math.min(minAbsLatitude, latitude);
    maxAbsLatitude = Math.max(maxAbsLatitude, latitude);
  }

  return { minAbsLatitude, maxAbsLatitude };
}

/** The measured `q` range; `max < 1` is what proves `"snow"` is unreachable. */
export function measuredQRange(
  calibration: SurfaceCalibration,
  seed: number,
): QRange {
  const directions = fibonacciDirections();
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (const direction of directions) {
    const q = surfaceQ(direction, seed, calibration);
    min = Math.min(min, q);
    max = Math.max(max, q);
  }

  return { min, max };
}

/**
 * Oolite's PlanetMix band for one direction, with the polar cap overriding.
 *
 * The bands are the shader's, and `tests/render/planet-surface.test.ts` uses
 * this function to prove the shader's constants and the mirror's have not
 * drifted apart.
 */
export function classifySurface(
  dir: Vec3Like,
  seed: number,
  calibration: SurfaceCalibration,
): ClassifiedSample {
  const q = surfaceQ(dir, seed, calibration);
  const nearPole = dir.y * dir.y;
  const phi = 2 * calibration.polarCap - nearPole;

  let terrain: TerrainClass;
  if (q > phi) {
    terrain = "ice";
  } else if (q <= -DEEPS) {
    terrain = "deep";
  } else if (q <= -SHALLOWS) {
    // Open sea between the shelf and the deep ocean.
    terrain = "sea";
  } else if (q <= 0) {
    // The thin coastal shelf, the band Oolite calls "coastal waters".
    terrain = "shelf";
  } else if (q < COASTLINE_PORTION) {
    terrain = "coast";
  } else if (q <= calibration.mixHi) {
    terrain = "land";
  } else if (q <= 1) {
    terrain = "highland";
  } else {
    terrain = "snow";
  }

  return { q, class: terrain };
}

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one exposure contract (WORLD-03, G-03-1 root cause 4).
 *
 * **Linear light in; `NoToneMapping`; one sRGB encode on output; exposure 1;
 * every body's radiance calibrated so its fully lit albedo lands on the
 * measured Oolite display value.** There is no second contract: the renderer's
 * tone mapping and colour space are written together by `applyOutputContract`,
 * and the scene has one sun intensity derived below. Two bodies can never be
 * lit under different energy scales, because there is only one scale.
 *
 * The contract is *calibrated LDR*, not ACES. ACES was measured against the
 * authored palette: enabling it and re-gaining the planet to keep its byte
 * would move Lave's land and sea by several 8-bit levels and compress the polar
 * whites by ~20. With `NoToneMapping` the planet's palette is already
 * display-linear after 03-10, so its gain is 1 by construction and the **only
 * free parameter is the station's light intensity** — derived from Oolite's own
 * constants rather than chosen by eye.
 *
 * ## The Oolite reference model
 *
 * Oolite's ship path multiplies the light source by `MULTIPLIER_LIGHTSRCRADIANCE`
 * 3.75 (`oolite-default-shader.fragment:33-37`), then by
 * `MULITPLIER_PREEXPOSURE` 2.484 (`:34,509`), tone-maps with ACES
 * (`oolite-final.fragment:187-215`) and gamma-encodes with `pow(x, 1/2.2)`
 * (`:817-848`). `acesReference` reproduces that path exactly as Three r187's
 * `ACESFilmicToneMapping` chunk defines it, including the `exposure / 0.6`
 * scale. `ooliteReferenceByte()` runs the measured mean Coriolis face
 * (authored albedo byte 87, `NdotL` 0.7) through it and lands near 208/255,
 * within 20 levels of the 190/255 the UAT asked for: the reference model exists
 * to prove the contract's target and Oolite's HDR path are the same brightness
 * band. The contract is calibrated to the reported target, not to the model.
 *
 * ## The scene-wide clipping bound
 *
 * `DISPLAY_SUN_INTENSITY` is a single scene light, so every body in the system
 * — the Coriolis, the player Cobra in the launch cinematic, the dust and the
 * beacons — is lit under the same gain. Any lit face whose authored albedo
 * exceeds `clippingAlbedoByteFor(ndotl)` saturates. The bound at the derived
 * intensity is albedo byte **101 at `NdotL` 1.0, 119 at 0.7 and 139 at 0.5**.
 * The Cobra's authored diffuse map is the only other body with albedo in that
 * range (measured mean 57, p90 101, p99 126, max 225), so roughly 10% of its
 * hull texels exceed the `NdotL`-1.0 byte and ~1% exceed the `NdotL`-0.7 byte.
 * That is the intended cinematic highlight, and it is **bounded** by the
 * exported function rather than assumed safe because only the station was
 * measured. At the sub-solar mean, no Coriolis texel clips.
 *
 * This is a small, typed, DOM-free render helper in the shape of
 * `src/render/camera-relative.ts`: one responsibility, imported directly by a
 * Node test. The transfer functions are 03-10's `src/render/color.ts`, so the
 * planet, the station and this model share one sRGB curve.
 */

import { NoToneMapping, SRGBColorSpace } from "three";
import type { ToneMapping } from "three";

import { linearToSrgb, srgbByteToLinear, srgbToLinear } from "./color.js";

/** `MULTIPLIER_LIGHTSRCRADIANCE` (`oolite-default-shader.fragment:33`). */
export const OOLITE_LIGHT_RADIANCE = 3.75;

/** `MULITPLIER_PREEXPOSURE` (`oolite-default-shader.fragment:34,509`). */
export const OOLITE_PREEXPOSURE = 2.484;

/** The UAT's measured Oolite lit Coriolis face, 8-bit sRGB. */
export const OOLITE_REFERENCE_LIT_BYTE = 190;

/** The measured mean Coriolis diffuse luminance, 8-bit sRGB. */
export const OOLITE_REFERENCE_ALBEDO_BYTE = 87;

/** The mean face's incidence cosine (`NdotL`). */
export const OOLITE_REFERENCE_NDOTL = 0.7;

/** Clamp to `[0, 1]`; non-finite input becomes 0 rather than NaN. */
function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Clamp to `[min, max]`; NaN becomes `min` so a corrupted value is neutral. */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  if (value <= min) return min;
  if (value >= max) return max;
  return value;
}

/**
 * Three r187's `ACESInputMat`, column-major exactly as the GLSL `mat3(...)`
 * constructor stores it (`tonemapping_pars_fragment.glsl.js`). Named here so
 * `acesReference` is Three's operator, not an approximation of it.
 */
const ACES_INPUT_MATRIX: readonly (readonly [number, number, number])[] = [
  [0.59719, 0.076, 0.0284],
  [0.35458, 0.90834, 0.13383],
  [0.04823, 0.01566, 0.83777],
];

/** Three r187's `ACESOutputMat`, column-major. */
const ACES_OUTPUT_MATRIX: readonly (readonly [number, number, number])[] = [
  [1.60475, -0.10208, -0.00327],
  [-0.53108, 1.10813, -0.07276],
  [-0.07367, -0.00605, 1.07602],
];

/** GLSL `mat3 * vec3` with column-major storage. */
function multiplyMatrix(
  matrix: readonly (readonly [number, number, number])[],
  vector: readonly [number, number, number],
): [number, number, number] {
  const x = vector[0];
  const y = vector[1];
  const z = vector[2];
  const c0 = matrix[0] ?? [0, 0, 0];
  const c1 = matrix[1] ?? [0, 0, 0];
  const c2 = matrix[2] ?? [0, 0, 0];
  return [
    c0[0] * x + c1[0] * y + c2[0] * z,
    c0[1] * x + c1[1] * y + c2[1] * z,
    c0[2] * x + c1[2] * y + c2[2] * z,
  ];
}

/** Three's `RRTAndODTFit`. */
function rrtAndOdtFit(v: number): number {
  const a = v * (v + 0.0245786) - 0.000090537;
  const b = v * (0.983729 * v + 0.432951) + 0.238081;
  return a / b;
}

/**
 * Three r187's `ACESFilmicToneMapping` for one linear channel, with
 * `toneMappingExposure = OOLITE_PREEXPOSURE`.
 *
 * The input and output matrices map equal channels to equal channels (each has
 * unit column sums), so feeding `(v, v, v)` and reading any channel is the same
 * scalar operation Three's shader performs on a grey pixel. The matrices are
 * kept in the code rather than folded away so this stays recognisably Three's
 * operator: if the chunk's fit changes, this function's source can be compared
 * against it line by line.
 */
export function acesReference(linearRgb: number): number {
  const exposed = linearRgb * (OOLITE_PREEXPOSURE / 0.6);
  const input = multiplyMatrix(ACES_INPUT_MATRIX, [exposed, exposed, exposed]);
  const fitted = multiplyMatrix(ACES_OUTPUT_MATRIX, [
    rrtAndOdtFit(input[0]),
    rrtAndOdtFit(input[1]),
    rrtAndOdtFit(input[2]),
  ]);
  return clamp01(fitted[0]);
}

/**
 * Oolite's own path for the reference face, as an 8-bit display byte.
 *
 * `srgbByteToLinear(87) * 3.75 * 0.7` is the HDR radiance Oolite lights the
 * face with; `acesReference` applies its pre-exposure and tone map; the result
 * is gamma-encoded. Lands near 208, i.e. in the same band as the 190 the UAT
 * reported (Oolite's measured path includes its own bloom and dither, which the
 * LDR contract does not attempt to reproduce).
 */
export function ooliteReferenceByte(): number {
  const albedo = srgbByteToLinear(OOLITE_REFERENCE_ALBEDO_BYTE);
  const lit = albedo * OOLITE_LIGHT_RADIANCE * OOLITE_REFERENCE_NDOTL;
  return Math.round(linearToSrgb(acesReference(lit)) * 255);
}

/**
 * The scene's one sun intensity, derived from the contract's target.
 *
 * Three's `MeshStandardMaterial` path is
 * `albedo * lightColour * intensity * NdotL / pi` (`BRDF_Lambert`), so the
 * intensity that makes the reference face display byte 190 is
 * `pi * srgbToLinear(190 / 255) / (srgbByteToLinear(87) * 0.7)` = 24.25.
 * The pre-fix value was 2.5, which is why the station read ~64/255.
 */
export const DISPLAY_SUN_INTENSITY =
  (Math.PI * srgbToLinear(OOLITE_REFERENCE_LIT_BYTE / 255)) /
  (srgbByteToLinear(OOLITE_REFERENCE_ALBEDO_BYTE) * OOLITE_REFERENCE_NDOTL);

/**
 * The ambient light intensity that reproduces Oolite's `AMBIENT_LIGHT *
 * ambientColor` term.
 *
 * Three's ambient contribution is `albedo * intensity` (the `BRDF_Lambert`
 * `1/pi` cancels against the irradiance convolution's `pi`), while Oolite adds
 * `ambientColor * ambient_level`. Setting the intensity to `pi * ambient_level`
 * makes the displayed ambient exactly `albedo * ambient_level`: Lave's 0.1
 * becomes 0.314159. Out-of-range or non-finite levels are clamped, so a
 * corrupted record cannot produce a NaN intensity (V5).
 */
export function ambientIntensityFor(ambientLevel: number): number {
  return Math.PI * clamp(ambientLevel, 0, 1);
}

/**
 * The 8-bit sRGB value a face displays under the contract.
 *
 * `albedoLinear` is linear light (decode an authored byte with
 * `srgbByteToLinear`), `ndotl` is the incidence cosine, and `sunIntensity`
 * defaults to the scene's derived constant. This is the numeric form of the
 * brightness truth the tests pin: `displayedByteFor(srgbByteToLinear(87), 0.7)`
 * is 190, and the pre-fix 2.5 gives ~64.
 */
export function displayedByteFor(
  albedoLinear: number,
  ndotl: number,
  sunIntensity: number = DISPLAY_SUN_INTENSITY,
): number {
  const radiance = (albedoLinear * sunIntensity * ndotl) / Math.PI;
  return Math.round(linearToSrgb(clamp01(radiance)) * 255);
}

/**
 * The largest authored albedo byte that still displays without saturating at a
 * given `NdotL`.
 *
 * Solve `albedo * intensity * ndotl / pi = 1` for the linear albedo and encode
 * it: `linearToSrgb(pi / (intensity * ndotl)) * 255`. At the derived intensity
 * this is **101** at `NdotL` 1.0, **119** at 0.7 and **139** at 0.5. A face at
 * or below the bound is reproduced exactly; a brighter face clips — which is
 * the visible highlight, not a contract break, and it is the same bound for the
 * Cobra and the Coriolis.
 *
 * `ndotl <= 0` (or non-finite input) has no finite bound: an unlit face does not
 * saturate, so 255 is returned.
 */
export function clippingAlbedoByteFor(
  ndotl: number,
  sunIntensity: number = DISPLAY_SUN_INTENSITY,
): number {
  if (!Number.isFinite(ndotl) || ndotl <= 0) return 255;
  if (!Number.isFinite(sunIntensity) || sunIntensity <= 0) return 255;
  const linear = Math.PI / (sunIntensity * ndotl);
  return Math.round(linearToSrgb(clamp01(linear)) * 255);
}

/**
 * The renderer fields the contract owns, kept structural so a Node test can
 * pass a plain object. `THREE.WebGLRenderer` satisfies it.
 */
export interface OutputContractTarget {
  outputColorSpace: string;
  toneMapping: ToneMapping;
  toneMappingExposure: number;
}

/**
 * Apply the one output contract: sRGB encode once, no tone map, exposure 1.
 *
 * Called from `src/app/boot.ts` and nowhere else. Two bodies must never be lit
 * under different exposure contracts, so the renderer's three output fields are
 * written together here rather than scattered across callers (T-3-33).
 */
export function applyOutputContract(target: OutputContractTarget): void {
  target.outputColorSpace = SRGBColorSpace;
  target.toneMapping = NoToneMapping;
  target.toneMappingExposure = 1;
}

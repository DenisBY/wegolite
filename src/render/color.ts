// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The one sRGB transfer used by the palette and the exposure model.
 *
 * Oolite's authored planet palette is **sRGB texture data**, not linear light:
 * `OOPlanetTextureGenerator.m:157-163` writes `255 * color` bytes into the
 * planet texture, and `oolite-default-planet.fragment:373-374` decodes them
 * with `pow(diffuseColor.rgb, vec3(2.2))` before lighting. Wegolite's shader
 * ends with Three's `<colorspace_fragment>`, which encodes linear light to
 * sRGB once on output. Feeding the authored triple to that shader raw is the
 * double encode this module exists to prevent: land would display as
 * `sRGB(0.36, 0.58882, 0.120234)` = `(162, 202, 97)` instead of Oolite's
 * authored byte `(92, 150, 31)`.
 *
 * This is a small, typed, DOM-free render helper in the shape of
 * `src/render/camera-relative.ts`: a Node test imports it directly, and it
 * imports nothing from Three. The renderer's `outputColorSpace` is
 * deliberately not consulted — the transfer is applied explicitly, so the
 * contract cannot change with renderer configuration.
 *
 * The curve is the IEC 61966-2-1 piecewise sRGB transfer, not a bare
 * `pow(x, 2.2)` approximation. The two branch cuts are exact images of each
 * other: `srgbToLinear(0.04045)` is `0.04045 / 12.92 =
 * 0.0031308049535603713`, which is **above** the published truncated constant
 * `0.0031308`. Cutting the inverse at the truncated constant would send that
 * exact sample down the power branch and make the pair non-invertible at its
 * own seam (2.96e-8 absolute error, ~30000x the 1e-12 round-trip tolerance the
 * tests assert). Cutting it at the exact image keeps the pair invertible with
 * no tolerance relaxation.
 */

/** The sRGB decode branch cut, exactly as published (IEC 61966-2-1). */
const DECODE_CUT = 0.04045;

/**
 * The encode branch cut: the exact image of `DECODE_CUT` under the linear
 * segment (`0.04045 / 12.92`), not the truncated `0.0031308`.
 */
const ENCODE_CUT = DECODE_CUT / 12.92;

/** Clamp to the closed display range so a bad uniform cannot extrapolate. */
function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

/** Decode one sRGB channel in `[0, 1]` to linear light. */
export function srgbToLinear(c: number): number {
  const value = clamp01(c);
  return value <= DECODE_CUT
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

/** Encode one linear-light channel in `[0, 1]` to sRGB. */
export function linearToSrgb(c: number): number {
  const value = clamp01(c);
  return value <= ENCODE_CUT
    ? value * 12.92
    : 1.055 * Math.pow(value, 1 / 2.4) - 0.055;
}

/**
 * Decode one authored 8-bit sRGB byte (the form Oolite's texture generator
 * writes) to linear light. `srgbByteToLinear(92)` is `0.107023`, a factor of
 * 3.4 below the raw `92 / 255 = 0.361` the pre-fix material fed the shader.
 */
export function srgbByteToLinear(byte: number): number {
  return srgbToLinear(byte / 255);
}

/**
 * Decode the first three components of an authored `planetinfo` colour to
 * linear light. The fourth component is alpha and is not transferred.
 */
export function decodeColor3(
  value: readonly [number, number, number, number],
): readonly [number, number, number] {
  return [
    srgbToLinear(value[0]),
    srgbToLinear(value[1]),
    srgbToLinear(value[2]),
  ];
}

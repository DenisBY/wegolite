// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High-quality atmosphere shell (PROJECT.md Key Decisions).
 *
 * A second sphere just above the planet, alpha-blended over it. It is the one
 * deliberate departure from Phase 3 D-02 ("one sphere, one material"), and it
 * exists only at `high` quality.
 *
 * The opacity and colour follow Oolite's own atmosphere shader,
 * `Resources/Shaders/oolite-default-atmosphere.fragment` (pinned 7437f22):
 *
 * - across the disc the haze is a Fresnel term, thin at the centre and dense
 *   toward the limb, which is what makes the planet read as a lit ball under
 *   air rather than a flat disc;
 * - past `cosThreshold` (the outermost ring of the shell) the opacity falls to
 *   zero and the colour turns to the authored air colour, which is the thin
 *   coloured rim;
 * - everything is scaled by the sun's angle on the shell, so the night side
 *   has no haze;
 * - the haze fades out as the camera comes within a few kilometres of the
 *   shell (`quant`), so it never pops when the camera crosses it.
 *
 * That shader is (c) 2009-2013 Jens Ayton and is distributed under the MIT
 * licence: "Permission is hereby granted, free of charge, to any person
 * obtaining a copy of this software and associated documentation files (the
 * "Software"), to deal in the Software without restriction, including without
 * limitation the rights to use, copy, modify, merge, publish, distribute,
 * sublicense, and/or sell copies of the Software, and to permit persons to
 * whom the Software is furnished to do so, subject to the following
 * conditions: The above copyright notice and this permission notice shall be
 * included in all copies or substantial portions of the Software. THE SOFTWARE
 * IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
 * WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR
 * IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE."
 *
 * Differences from Oolite: the light is a constant white (Wegolite has no
 * per-system light colour in this shader), and `uBrightness` replaces Oolite's
 * `dot(normalize(fresnel), vec3(NdotL))` gain of sqrt(3), because Wegolite
 * renders without tone mapping and that gain clips the lit limb to white.
 *
 * The Three log-depth chunks are load-bearing for the same reason as in the
 * planet shader: without them the shell would not depth-test correctly against
 * the station.
 */

export const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vNormalW;
varying vec3 vViewDirW;
varying float vCentreDistance;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  // The camera sits at the origin of camera-relative space.
  vViewDirW = normalize(-world.xyz);
  vCentreDistance = length(modelMatrix[3].xyz);
  gl_Position = projectionMatrix * viewMatrix * world;

  #include <logdepthbuf_vertex>
}
`;

export const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uAirColor;
uniform vec3 uSunDir;
uniform float uAirColorMixRatio;
uniform float uAirDensity;
uniform float uAmbient;
uniform float uShellRadius;
uniform float uCosThreshold;
uniform float uRimExponent;
uniform float uBrightness;

varying vec3 vNormalW;
varying vec3 vViewDirW;
varying float vCentreDistance;

// Oolite's constants ('oolite-default-atmosphere.fragment').
#define FRESNEL_EXPONENT 5.0
#define LIGHT_RADIANCE 1.035
#define NEAR_FADE_START 3500.0
#define NEAR_FADE_LENGTH 2000.0

void main() {
  vec3 normal = normalize(vNormalW);
  vec3 eye = normalize(vViewDirW);
  float NdotV = clamp(dot(normal, eye), 0.0, 1.0);
  float NdotL = max(0.0, dot(normal, normalize(uSunDir)));

  // Fade the haze out as the camera approaches the shell.
  float quant = clamp(
    (vCentreDistance - (uShellRadius + NEAR_FADE_START)) / NEAR_FADE_LENGTH,
    0.0,
    1.0
  );

  float fresnel = pow(1.0 - NdotV * (1.0 - uAirDensity), FRESNEL_EXPONENT);
  float shape = NdotV > uCosThreshold
    ? pow(fresnel * uCosThreshold / max(NdotV, 0.0001), 0.8)
    : min(1.0, uAirDensity * 2.0) * pow(NdotV / uCosThreshold, uRimExponent);
  float opacity = clamp(
    quant * pow(max(0.01, NdotL), 0.203333) * shape,
    0.0,
    1.0
  );

  vec3 light = vec3(0.85, 0.85, 1.0) * LIGHT_RADIANCE;
  vec3 color = light * mix(light, uAirColor, uAirColorMixRatio)
    * uBrightness * NdotL;
  if (NdotV < uCosThreshold) {
    color = mix(uAirColor * NdotL, color, opacity);
  }
  color += vec3(uAmbient) * NdotL;

  gl_FragColor = vec4(color, opacity);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <logdepthbuf_fragment>
}
`;

// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High-quality atmosphere shell (PROJECT.md Key Decisions).
 *
 * A second, slightly larger sphere drawn additively over the planet. It is the
 * one deliberate departure from Phase 3 D-02 ("one sphere, one material"), and
 * it exists only at `high` quality.
 *
 * The glow is analytic, not a Fresnel term on the shell's own normal: a Fresnel
 * rim is brightest at the shell's silhouette and stops dead there. Instead the
 * fragment reconstructs its view ray (the camera is the origin of
 * camera-relative space) and measures how close that ray passes to the planet
 * centre:
 *
 * - a ray that misses the planet fades from full strength at the planet's limb
 *   to zero at the shell's outer edge, so the halo has no hard border;
 * - a ray that hits the planet adds a haze that rises toward the limb and meets
 *   the outside value there, so the two branches are continuous.
 *
 * Lighting uses the planet's authored per-channel terminator thresholds, with
 * the lower edge moved below zero so the glow wraps a little past the
 * terminator, as scattered light does. The night side stays dark.
 *
 * The planet centre is read from the model matrix translation in the vertex
 * stage, so no per-frame uniform is needed. The Three log-depth chunks are
 * load-bearing for the same reason as in the planet shader: without them the
 * shell would not depth-test correctly against the station.
 */

export const ATMOSPHERE_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vWorld;
varying vec3 vCentre;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vCentre = modelMatrix[3].xyz;
  gl_Position = projectionMatrix * viewMatrix * world;

  #include <logdepthbuf_vertex>
}
`;

export const ATMOSPHERE_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform vec3 uAirColor;
uniform vec3 uSunDir;
uniform vec3 uTerminatorThreshold;
uniform float uPlanetRadius;
uniform float uShellRadius;
uniform float uStrength;

varying vec3 vWorld;
varying vec3 vCentre;

// How far past the geometric terminator the glow reaches, as a cosine.
#define TERMINATOR_WRAP 0.25
// Falloff exponents: outside the limb and across the planet's disc.
// The haze exponent is steep on purpose: at 8 it washed out the lit disc well
// inside the limb; at 24 it is under a tenth of full strength once the ray
// passes 10% of the radius inside the limb.
#define HALO_FALLOFF 2.5
#define HAZE_FALLOFF 24.0

void main() {
  vec3 dir = normalize(vWorld);
  float along = dot(vCentre, dir);
  // From the planet centre to the point of the view ray nearest to it.
  vec3 nearest = dir * along - vCentre;
  float miss = length(nearest);

  vec3 normal;
  float glow;
  if (miss >= uPlanetRadius) {
    float t = clamp(
      (miss - uPlanetRadius) / max(uShellRadius - uPlanetRadius, 0.0001),
      0.0,
      1.0
    );
    glow = pow(1.0 - t, HALO_FALLOFF);
    normal = nearest / max(miss, 0.0001);
  } else {
    float halfChord = sqrt(
      max(uPlanetRadius * uPlanetRadius - miss * miss, 0.0)
    );
    vec3 hit = dir * (along - halfChord) - vCentre;
    normal = hit / uPlanetRadius;
    glow = pow(miss / uPlanetRadius, HAZE_FALLOFF);
  }

  float ndotl = dot(normal, normalize(uSunDir));
  vec3 light = smoothstep(
    vec3(-TERMINATOR_WRAP),
    uTerminatorThreshold,
    vec3(ndotl)
  );

  gl_FragColor = vec4(uAirColor * light * glow * uStrength, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <logdepthbuf_fragment>
}
`;

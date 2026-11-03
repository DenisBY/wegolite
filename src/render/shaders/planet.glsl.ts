// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The procedural planet material (D-01, D-02, WORLD-03, Pitfall 3).
 *
 * One sphere, one `ShaderMaterial`: surface, clouds, polar blending, the thin
 * air rim and the day/night terminator are all computed here. There is no
 * second cloud or atmosphere shell and no baked texture — D-02 keeps the whole
 * planet to one draw call and avoids transparent-depth interactions with the
 * station.
 *
 * The Three chunks are load-bearing, not decoration:
 *
 * - `<logdepthbuf_pars_vertex>`/`<logdepthbuf_vertex>` and
 *   `<logdepthbuf_pars_fragment>`/`<logdepthbuf_fragment>` make a custom shader
 *   write the same logarithmic depth as the built-in materials. Without them the
 *   planet sorts against the station and the sun with conventional depth.
 * - `<tonemapping_fragment>` and `<colorspace_fragment>` apply the renderer's
 *   `NoToneMapping`/`SRGBColorSpace` contract; without the latter the planet is
 *   dark and oversaturated.
 *
 * The noise is sampled on the object-space unit normal, never on a world
 * position: at 452 km a float32 world coordinate has a ~3 cm ULP and the
 * terminator would crawl as the ship moves (Pitfall 13).
 */

export const PLANET_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDirW;

void main() {
  vLocal = normalize(position);
  vec4 world = modelMatrix * vec4(position, 1.0);
  vNormalW = normalize(mat3(modelMatrix) * normal);
  // The camera sits at the origin in camera-relative space, so the view vector
  // is simply the negated camera-relative world position.
  vViewDirW = normalize(-world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;

  #include <logdepthbuf_vertex>
}
`;

export const PLANET_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform float uSeed;
uniform vec3 uLandColor;
uniform vec3 uSeaColor;
uniform vec3 uPolarLandColor;
uniform vec3 uPolarSeaColor;
uniform vec3 uPolarCloudColor;
uniform vec3 uCloudColor;
uniform vec3 uAirColor;
uniform vec3 uSunDir;
uniform float uLandThreshold;
uniform float uLandFraction;
uniform float uCloudFraction;
uniform float uCloudAlpha;
uniform float uAirDensity;
uniform float uAmbient;
uniform float uTerminatorSoftness;
uniform float uTime;

varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDirW;

// Deterministic 3D value noise: a hash of the lattice corner plus trilinear
// interpolation. No texture lookups and no world-space coordinates.
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float valueNoise(vec3 p) {
  vec3 cell = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);

  float n000 = hash31(cell + vec3(0.0, 0.0, 0.0));
  float n100 = hash31(cell + vec3(1.0, 0.0, 0.0));
  float n010 = hash31(cell + vec3(0.0, 1.0, 0.0));
  float n110 = hash31(cell + vec3(1.0, 1.0, 0.0));
  float n001 = hash31(cell + vec3(0.0, 0.0, 1.0));
  float n101 = hash31(cell + vec3(1.0, 0.0, 1.0));
  float n011 = hash31(cell + vec3(0.0, 1.0, 1.0));
  float n111 = hash31(cell + vec3(1.0, 1.0, 1.0));

  return mix(
    mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
    mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
    u.z
  );
}

float fbm(vec3 p, float octaves) {
  float total = 0.0;
  float amplitude = 0.5;
  float norm = 0.0;

  for (int octave = 0; octave < 6; octave++) {
    if (float(octave) >= octaves) {
      break;
    }
    total += valueNoise(p) * amplitude;
    norm += amplitude;
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    amplitude *= 0.5;
  }

  return total / max(norm, 0.0001);
}

void main() {
  vec3 n = normalize(vLocal);
  vec3 normalW = normalize(vNormalW);

  // Surface: the octave sum is normalised to [0,1]; the CPU-calibrated
  // threshold turns land_fraction into a coastline instead of a coin flip.
  // Four octaves is the fidelity floor for a recognisable coastline; each
  // extra octave is another eight lattice hashes per pixel.
  float surface = fbm(n * 3.1 + vec3(uSeed), 4.0);
  float land = smoothstep(
    uLandThreshold - 0.02,
    uLandThreshold + 0.02,
    surface
  );
  vec3 ground = mix(uSeaColor, uLandColor, land);

  float polar = smoothstep(0.6, 0.95, abs(n.y));
  vec3 polarGround = mix(uPolarSeaColor, uPolarLandColor, land);
  ground = mix(ground, polarGround, polar);

  // Clouds are a second field in the same material: no shell, no second pass.
  // Three octaves is enough for the soft cloud shapes; the surface carries the
  // fine detail.
  float cloudField = fbm(
    n * 5.3 + vec3(uSeed * 1.7 + 13.0) + vec3(uTime * 0.002, 0.0, 0.0),
    3.0
  );
  float cloud = smoothstep(
    1.0 - uCloudFraction,
    1.0 - uCloudFraction + 0.05,
    cloudField
  ) * uCloudAlpha;
  vec3 cloudColor = mix(uCloudColor, uPolarCloudColor, polar);
  vec3 color = mix(ground, cloudColor, cloud);

  // Day/night terminator. uSunDir is the sun direction in object space, so
  // the terminator stays fixed in space while the surface turns.
  float day = smoothstep(
    -uTerminatorSoftness,
    uTerminatorSoftness,
    dot(normalW, uSunDir)
  );
  float light = uAmbient + (1.0 - uAmbient) * day;
  color *= light;

  // A thin air-colour rim, strongest at the limb and only on the lit side.
  float rim = pow(1.0 - max(dot(normalW, normalize(vViewDirW)), 0.0), 3.0);
  color += uAirColor * rim * uAirDensity * day;

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <logdepthbuf_fragment>
}
`;

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
 *
 * The surface is a port of Oolite's `PlanetMix`
 * (`OOPlanetTextureGenerator.m:636-690`): the field `q` is cut into deep sea,
 * open sea, coastal shelf, coastline, land and snowline bands, with a
 * noise-perturbed polar cap on top and a Lambert terrain shade flattened over
 * water. The band edges are not guesses: `src/render/planet-noise.ts` measures
 * the same field on the CPU and passes `uNoiseLo`, `uNoiseScale`, `uSeaBias`,
 * `uPoleValue`, `uPolarCap`, `uMixHi`, `uCloudNoiseLo`, `uCloudNoiseScale` and
 * `uCloudThreshold`, so the coastline is a level set of the authored
 * `land_fraction` rather than a midpoint.
 *
 * The day/night terminator is Oolite's per-channel threshold, not a symmetric
 * scalar band: each component of `uTerminatorThreshold` is the cosine of the
 * angle at which that channel reaches full light (`0.105, 0.18, 0.28` for
 * Lave), so red saturates before green and blue. That ordering produces the
 * warm edge, and the geometric terminator is 0% lit; the night side is the
 * authored ambient added outside the day factor through Oolite's
 * `(0.8, 0.8, 1.0)` tint.
 *
 * The per-pixel noise budget is 9 value-noise evaluations worst case: six for
 * the surface, one for each of the two sea-gated relief taps and one for the
 * cloud field. The relief taps run only on land (0.6499 of the sphere for
 * Lave), so the average is about 8.3. This is the pre-agreed slow-run step down
 * from ten evaluations: the ten-evaluation build measured a 160 s message test,
 * above the 133 s cadence gate. The software-rasterised end-to-end suite
 * measures the budget by wall duration: the fixed-step loop advances simulated
 * time at `fps x 5/120`, so a slower shader starves the message-expiry test's
 * fixed wait (T-3-31, T-3-36).
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

// Calibration, measured by src/render/planet-noise.ts from the compiled record.
uniform float uNoiseLo;
uniform float uNoiseScale;
uniform float uSeaBias;
uniform float uPoleValue;
uniform float uPolarCap;
// Two-thirds of the calibrated land-range top (1 + uSeaBias), i.e. Oolite's
// 'mix_hi = 0.66667 * landFraction' rule applied to a field whose top is
// '1 + uSeaBias' rather than 'landFraction'. The snowline band is therefore
// non-empty (measured highland share 0.0142, 0.28581 for Lave); the literal
// '0.66667 * landFraction' would sit above the field's top and render nothing.
uniform float uMixHi;
uniform float uCloudNoiseLo;
uniform float uCloudNoiseScale;
uniform float uCloudThreshold;
// Presentation tuning (documented where it is declared in planet.ts), not a
// calibration output. The measured one-octave height difference is close to
// the three-octave one, so the scale that maps the mean slope to a 0.85 shade
// is unchanged at 80 (see planet.ts for the measurement).
uniform float uReliefScale;

// Retained for the record; the calibration uniforms above carry the level set.
uniform float uLandFraction;
uniform float uCloudFraction;

uniform float uCloudAlpha;
uniform float uAirDensity;
uniform float uAmbient;
uniform vec3 uAmbientTint;
uniform vec3 uTerminatorThreshold;
uniform float uTime;

varying vec3 vLocal;
varying vec3 vNormalW;
varying vec3 vViewDirW;

// PlanetMix band widths, mirrored in src/render/planet-noise.ts:
// COASTLINE_PORTION = 1/160, SHALLOWS = 2/160, DEEPS = 40/160.
#define COASTLINE_PORTION 0.00625
#define SHALLOWS 0.0125
#define DEEPS 0.25

// Per-pixel noise-budget octave counts, mirrored in src/render/planet-noise.ts:
// SURFACE_OCTAVES = 6, RELIEF_OCTAVES = 1, CLOUD_OCTAVES = 1. The budget guard
// in tests/render/planet-budget.test.ts asserts each define equals its mirror.
#define SURFACE_OCTAVES 6
#define RELIEF_OCTAVES 1
#define CLOUD_OCTAVES 1

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

  for (int octave = 0; octave < SURFACE_OCTAVES; octave++) {
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

// Six-octave surface sum; 'lowPartial' receives the normalised
// RELIEF_OCTAVES-octave partial with no extra noise evaluation. The relief
// gradient reuses that partial as its base height, so the base and the two
// displaced taps always share an octave count — otherwise the finite difference
// would measure the octave mismatch rather than the slope.
float fbmSurface(vec3 p, out float lowPartial) {
  float total = 0.0;
  float amplitude = 0.5;
  float norm = 0.0;
  float low = 0.0;
  float lowNorm = 0.0;

  for (int octave = 0; octave < SURFACE_OCTAVES; octave++) {
    float noiseSample = valueNoise(p) * amplitude;
    total += noiseSample;
    norm += amplitude;
    if (octave < RELIEF_OCTAVES) {
      low += noiseSample;
      lowNorm += amplitude;
    }
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    amplitude *= 0.5;
  }

  lowPartial = low / max(lowNorm, 0.0001);
  return total / max(norm, 0.0001);
}

// Oolite's PlanetMix ('OOPlanetTextureGenerator.m:636-690'): deep sea, open
// sea, coastal shelf, coastline, land, snowline, then the polar cap overriding
// all of them. 'seaishness' is Oolite's alpha channel: 1 on water, 0 on land,
// used to flatten the Lambert relief over the sea.
void planetMix(float q, float nearPole, out vec3 ground, out float seaishness) {
  vec3 deepSeaColor = mix(uSeaColor, vec3(0.0), 0.85);
  vec3 paleSeaColor = mix(uPolarSeaColor, mix(uSeaColor, uLandColor, 0.7), 0.35);
  seaishness = 0.0;

  if (q <= 0.0) {
    // Below datum: sea.
    seaishness = 1.0;
    if (q > -SHALLOWS) {
      // Coastal waters: pale shelf just under the coast, then the sea colour.
      ground = mix(paleSeaColor, uSeaColor, clamp(-q * 80.0, 0.0, 1.0));
    } else if (q > -DEEPS) {
      // Open sea darkening into the deep ocean past the shelf.
      ground = mix(uSeaColor, deepSeaColor, clamp(-q * 4.0, 0.0, 1.0));
    } else {
      ground = deepSeaColor;
    }
  } else if (q < COASTLINE_PORTION) {
    // Coastline: pale sea into land across a 1/160 band.
    ground = mix(paleSeaColor, uLandColor, clamp(q * 160.0, 0.0, 1.0));
  } else if (q > 1.0) {
    // Snow-capped peaks. With overrides q can range between -2 and +2; a base
    // system cannot reach 1 (calibrated top is 1 + uSeaBias).
    ground = vec3(1.0);
  } else if (q > uMixHi) {
    // Snowline: pale land into white as q approaches the top.
    ground = mix(
      uPolarLandColor,
      vec3(1.0),
      clamp((q - uMixHi) / max(1.0 - uMixHi, 0.0001), 0.0, 1.0)
    );
  } else {
    // Normal land: the authored land colour fading to pale land at mix_hi.
    ground = mix(
      uPolarLandColor,
      uLandColor,
      clamp((uMixHi - q) / max(uMixHi, 0.0001), 0.0, 1.0)
    );
  }

  // Polar cap: phi = 2 * polarCap - nearPole, with a 0.02 ramp. The cap is a
  // threshold of the same field, so its edge is noise-broken rather than a
  // latitude wash.
  float phi = 2.0 * uPolarCap - nearPole;
  if (q > phi) {
    float ice = clamp((q - phi) / 0.02, 0.2, 1.0);
    ground = mix(ground, uPolarSeaColor, ice);
  }
}

void main() {
  vec3 n = normalize(vLocal);
  vec3 normalW = normalize(vNormalW);
  float nearPole = n.y * n.y;

  // Surface: the calibrated normalisation and level set. 'q' is Oolite's
  // QFactor: the octave sum biased so q > 0 is land, with a polar-Y smooth
  // that lifts the poles toward 'uPoleValue'.
  float h0;
  float raw = fbmSurface(n * 3.1 + vec3(uSeed), h0);
  float u = clamp((raw - uNoiseLo) * uNoiseScale, 0.0, 1.0);
  float q = mix(u + uSeaBias, uPoleValue, nearPole);

  vec3 ground;
  float seaishness;
  planetMix(q, nearPole, ground, seaishness);

  // Lambert terrain relief from two RELIEF_OCTAVES-octave height taps, with the
  // base height reused from the surface evaluation. Oolite shades with norm.z
  // ("lambertian lighting from straight above"); the sea is flattened by
  // seaishness, exactly as Oolite recycles its specular alpha. The taps are
  // gated on water: seaishness == 1.0 is exactly the q <= 0.0 branch, where the
  // shade is 1 regardless of the gradient, so the gate is bit-identical.
  float shade = 1.0;
  if (seaishness < 1.0) {
    vec3 reference = abs(n.y) > 0.99 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
    vec3 tangent = normalize(cross(reference, n));
    vec3 bitangent = cross(n, tangent);
    float hU = fbm(
      normalize(n + tangent * 0.006) * 3.1 + vec3(uSeed),
      float(RELIEF_OCTAVES)
    );
    float hV = fbm(
      normalize(n - bitangent * 0.006) * 3.1 + vec3(uSeed),
      float(RELIEF_OCTAVES)
    );
    float dU = hU - h0;
    float dV = h0 - hV;
    vec3 relief = normalize(vec3(-dU * uReliefScale, -dV * uReliefScale, 1.0));
    shade = mix(relief.z, 1.0, seaishness);
  }
  ground *= shade;

  // Clouds are a second field in the same material: no shell, no second pass.
  // The field is normalised and cut at the calibrated 'cloud_fraction'
  // quantile, so the authored fraction is what appears on the sphere.
  float cloudRaw = fbm(
    n * 5.3 + vec3(uSeed * 1.7 + 13.0) + vec3(uTime * 0.002, 0.0, 0.0),
    float(CLOUD_OCTAVES)
  );
  float cloudField = clamp(
    (cloudRaw - uCloudNoiseLo) * uCloudNoiseScale,
    0.0,
    1.0
  );
  float cloud = smoothstep(
    uCloudThreshold - 0.02,
    uCloudThreshold + 0.02,
    cloudField
  ) * uCloudAlpha;
  // Oolite's polar cloud boundary (CloudMix, POLAR_BOUNDARY 0.33 with a 0.2
  // ramp).
  vec3 cloudColor = mix(
    uCloudColor,
    uPolarCloudColor,
    smoothstep(0.33, 0.53, nearPole)
  );
  vec3 color = mix(ground, cloudColor, cloud);

  // Day/night terminator. uSunDir is the sun direction rotated into object
  // space by the CPU, so NdotL must pair it with the object-space surface
  // normal n; the world-space normal below is only for the view-dependent
  // rim. The threshold components are cosines of the angle at which each
  // channel reaches full light (Oolite's own comment): red saturates first at
  // 0.105, green at 0.18 and blue last at 0.28. That ordering is the warm rim,
  // not a colour constant, and the geometric edge is 0% lit rather than the
  // 50% a symmetric smoothstep gives. The night side is the authored ambient
  // added outside the day factor, through Oolite's (0.8, 0.8, 1.0) tint.
  float ndotl = dot(n, normalize(uSunDir));
  vec3 dayLight = smoothstep(vec3(0.0), uTerminatorThreshold, vec3(ndotl));
  color *= dayLight + uAmbientTint * uAmbient;

  // A thin air-colour rim, strongest at the limb and only on the lit side.
  float lit = max(dayLight.r, max(dayLight.g, dayLight.b));
  float rim = pow(1.0 - max(dot(normalW, normalize(vViewDirW)), 0.0), 3.0);
  color += uAirColor * rim * uAirDensity * lit;

  gl_FragColor = vec4(color, 1.0);

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <logdepthbuf_fragment>
}
`;

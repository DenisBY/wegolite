// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drawn laser shots (CBT-05, success criterion 3, quick 261117-han).
 *
 * Every `laserFired` event adds one shot, from the mount to the hit point or
 * the laser's full reach, drawn for `LASER_SHOT_DURATION` (0.09 s,
 * `kLaserDuration`, `OOLaserShotEntity.m:36`) of flight time in the laser's
 * Oolite colour.
 *
 * A shot is one camera-facing ribbon: a quad along the beam whose width vector
 * is perpendicular to both the beam and the view ray, recomputed every update,
 * so the quad is turned about the beam axis toward the camera. Oolite instead
 * draws two crossed textured quads per layer (`OOLaserShotEntity.m:169-253`).
 * Seen along the view axis, as from the cockpit, the crossed quads turn into a
 * wedge plus a line that read as two beams; the ribbon reads as one beam from
 * every angle.
 *
 * Kept from Oolite:
 * - the three layers and their half-widths in metres: the coloured halo
 *   `kLaserHalfWidth` 3.6, the coloured flare `kLaserFlareWidth` 1.8 and the
 *   white core `kLaserCoreWidth` 0.4 (`:44-51`, drawn at `:197-253`);
 * - their peaks, from Oolite's colour x alpha arithmetic: the colour is
 *   `kLaserBrightness * rgb / 3` (`:106-109`, `:134-140`), the halo alpha is
 *   `0.45 / kLaserBrightness` (`:46`), the core is `kLaserBrightness` white at
 *   alpha 0.9 (`:238`) and the flare is the colour at alpha 0.9 (`:243`);
 * - the colours of `LASER_SHOT_COLORS` and the 0.09 s life;
 * - additive blending, `GL_SRC_ALPHA, GL_ONE`
 *   (`OOOpenGLStateManager.m:577-578`), in display space with no colour
 *   management.
 *
 * Deviations, all inside the shader:
 * - a gaussian cross-profile per layer (sigma 0.4 x its half-width, matched
 *   by eye to `oolite-laser-blur2.png`) replaces Oolite's two blur textures,
 *   so no texture asset is added;
 * - a subtle two-octave shimmer along the beam, animated by a time uniform,
 *   stands in for Oolite's two counter-scrolling textures (`:215-219`);
 * - the shot fades out as `1 - (age / 0.09)^2` (`laserShotFade`);
 * - both ends taper softly over the halo half-width, so the beam does not
 *   start with a hard cut at the muzzle;
 * - the ribbon never narrows below a half extent of 2 device pixels, and its
 *   cross-profile is band-limited by the pixel footprint (`fwidth`), so a far
 *   beam dims instead of flickering or vanishing.
 * There is no muzzle flash and no impact glow.
 *
 * The whole layer is one `THREE.Mesh` over a fixed pool of 32 shots, with
 * preallocated vertex buffers and a static index: one draw call while any
 * shot is live, none otherwise (the mesh is hidden when empty), and nothing is
 * allocated per shot or per frame after creation. A 33rd simultaneous shot
 * overwrites the oldest.
 *
 * Camera-relative like every body (`sync.ts`, `npc-ships.ts`): the shot's world
 * ends are kept in float64 and the camera is subtracted in float64 before the
 * float32 buffer write, so a shot far from the origin keeps its precision. The
 * scene camera sits at the origin, so a camera-relative point is its view ray.
 *
 * The layer stores positions, a start time and a colour only. It never holds an
 * entity id (the shooter is not stored), so a jump or a Load cannot leave a
 * stale reference; the scene owns and disposes it like the NPC layer.
 */

import * as THREE from "three";
import { LASER_SHOT_DURATION } from "../../sim/combat/constants.js";
import type { LaserKind } from "../../sim/events.js";
import { add as addVec, rotate, rotateInverse, sub } from "../../sim/math.js";
import type { Quat, Vec3 } from "../../sim/math.js";

/** The player ship's world pose, the frame an anchored shot rides in. */
export interface ShotAnchor {
  readonly position: Vec3;
  readonly orientation: Quat;
}

/** Shots drawn at once; a further shot overwrites the oldest. */
export const LASER_SHOT_POOL = 32;

/**
 * Oolite's colour for each laser kind: `weapon_info` `color` of
 * `EQ_WEAPON_PULSE_LASER` (`redColor`), `_BEAM_` (`yellowColor`), `_MINING_`
 * (`blueColor`), `_MILITARY_` (`magentaColor`) and `_THARGOID_` (`greenColor`),
 * all in `equipment.plist`. Display values, each channel 0 or 1, written
 * without colour management, as Oolite blends them.
 */
export const LASER_SHOT_COLORS: Readonly<
  Record<LaserKind, readonly [number, number, number]>
> = Object.freeze({
  pulse: Object.freeze([1, 0, 0] as const),
  beam: Object.freeze([1, 1, 0] as const),
  mining: Object.freeze([0, 0, 1] as const),
  military: Object.freeze([1, 0, 1] as const),
  thargoid: Object.freeze([0, 1, 0] as const),
});

/** Halo half-width in metres: `kLaserHalfWidth`, `OOLaserShotEntity.m:51`. */
export const LASER_HALO_HALF_WIDTH = 3.6;
/** Flare half-width in metres: `kLaserFlareWidth`, `OOLaserShotEntity.m:50`. */
export const LASER_FLARE_HALF_WIDTH = 1.8;
/** White core half-width in metres: `kLaserCoreWidth`, `OOLaserShotEntity.m:49`. */
export const LASER_CORE_HALF_WIDTH = 0.4;
/** `kLaserBrightness`, `OOLaserShotEntity.m:43`. */
export const LASER_BRIGHTNESS = 5;
/** Halo peak: colour `B / 3` (`:136-138`) x alpha `0.45 / B` (`:46`) = 0.15. */
export const LASER_HALO_PEAK =
  (LASER_BRIGHTNESS / 3) * (0.45 / LASER_BRIGHTNESS);
/** Flare peak: colour `B / 3` (`:136-138`) x alpha 0.9 (`:243`) = 1.5. */
export const LASER_FLARE_PEAK = (LASER_BRIGHTNESS / 3) * 0.9;
/** Core peak: white `B` x alpha 0.9 (`:238`) = 4.5. */
export const LASER_CORE_PEAK = LASER_BRIGHTNESS * 0.9;
/** Each gaussian's sigma as a fraction of its half-width (`oolite-laser-blur2.png` by eye). */
export const LASER_PROFILE_SIGMA = 0.4;
/** The smallest half extent of the ribbon on screen, in device pixels. */
export const LASER_MIN_HALF_EXTENT_PX = 2;
/** Depth of the shimmer along the beam (Oolite's scrolling textures, `:215-219`). */
export const LASER_SHIMMER_DEPTH = 0.2;
/** The shimmer time uniform wraps after this many seconds, to keep float32 precision. */
export const LASER_TIME_WRAP = 100;

/**
 * The brightness of a shot `age` seconds old: `1 - (age / 0.09)^2`, clamped
 * to [0, 1]; 0 for a non-finite age.
 */
export function laserShotFade(age: number): number {
  if (!Number.isFinite(age)) return 0;
  const fade = 1 - (age / LASER_SHOT_DURATION) ** 2;
  return Math.min(1, Math.max(0, fade));
}

/** The shot layer of one system scene. */
export interface LaserShotLayer {
  /** The one ribbon mesh of every live shot; hidden whenever no shot is live. */
  readonly root: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  /**
   * Add a shot from `from` to `to` (world space), starting at `flightTime`. A
   * segment with a non-finite coordinate or time is skipped. With an `anchor`
   * (the player's pose at the moment of the shot) the shot is kept in the
   * ship's frame and rides with it, as Oolite's player shots do
   * (`OOLaserShotEntity.m:152-162`); without one it stays where it was fired.
   */
  add(
    from: Vec3,
    to: Vec3,
    laserKind: LaserKind,
    flightTime: number,
    anchor?: ShotAnchor,
  ): void;
  /**
   * Rewrite the live shots camera-relative, turn each ribbon toward the
   * camera and retire the expired ones. `flightTime` is the simulation clock
   * the shots were added with; `player` is the current player pose that the
   * anchored shots follow.
   */
  update(cameraWorld: Vec3, flightTime: number, player?: ShotAnchor): void;
  /** Free the geometry and the material. */
  dispose(): void;
}

/** Float64 world floats per slot: two ends of three components. */
const SLOT_WORLD_FLOATS = 6;
/** Vertices per ribbon quad. */
const QUAD_VERTICES = 4;
/** Indices per ribbon quad: two triangles. */
const QUAD_INDICES = 6;

/**
 * The ribbon's shaders.
 *
 * The vertex stage extrudes each centreline vertex sideways along `aSide` by
 * the halo half-width, or by the 2-pixel minimum when that is wider. The
 * fragment stage sums three gaussian bands across the ribbon, writes the
 * display value with no tone mapping or colour-space chunk (as Oolite and the
 * nebulae do) and keeps the logarithmic depth chunks.
 */
const LASER_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec3 aSide;
attribute vec3 aColor;
attribute vec4 aShape;

uniform float uHaloHalfWidth;
uniform float uMinHalfExtentPx;
uniform float uViewportHeight;

varying float vAcross;
varying float vHalfExtent;
varying float vAlong;
varying float vLength;
varying float vFade;
varying vec3 vColor;

void main() {
  float depth = max(-(modelViewMatrix * vec4(position, 1.0)).z, 1e-3);
  float metresPerPixel =
    2.0 * depth / (projectionMatrix[1][1] * max(uViewportHeight, 1.0));
  float halfExtent = max(uHaloHalfWidth, uMinHalfExtentPx * metresPerPixel);
  float across = aShape.x * halfExtent;
  vec3 extruded = position + aSide * across;

  vAcross = across;
  vHalfExtent = halfExtent;
  vAlong = aShape.y;
  vLength = aShape.z;
  vFade = aShape.w;
  vColor = aColor;

  gl_Position = projectionMatrix * modelViewMatrix * vec4(extruded, 1.0);

  #include <logdepthbuf_vertex>
}
`;

const LASER_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform float uHaloHalfWidth;
uniform float uFlareHalfWidth;
uniform float uCoreHalfWidth;
uniform float uHaloPeak;
uniform float uFlarePeak;
uniform float uCorePeak;
uniform float uProfileSigma;
uniform float uShimmerDepth;
uniform float uTime;

varying float vAcross;
varying float vHalfExtent;
varying float vAlong;
varying float vLength;
varying float vFade;
varying vec3 vColor;

// A gaussian band of the given half-width and peak, widened by the pixel
// footprint with its peak lowered to match, so its integrated light is kept
// and a band narrower than a pixel dims instead of flickering.
float laserBand(float halfWidth, float peak, float footprint) {
  float sigma = uProfileSigma * halfWidth;
  float sigmaEff = sqrt(sigma * sigma + 0.25 * footprint * footprint);
  return peak * (sigma / sigmaEff) *
    exp(-0.5 * vAcross * vAcross / (sigmaEff * sigmaEff));
}

float laserHash(float n) {
  return fract(sin(n) * 43758.5453123);
}

float laserNoise(float x) {
  float i = floor(x);
  float f = fract(x);
  float u = f * f * (3.0 - 2.0 * f);
  return mix(laserHash(i), laserHash(i + 1.0), u);
}

// One shimmer octave, scrolling at speed metres per second; it fades to the
// neutral 0.5 as the pixel footprint along the beam nears its wavelength.
float laserOctave(float wavelength, float speed, float seed, float footAlong) {
  float n = laserNoise((vAlong + speed * uTime) / wavelength + seed);
  float weight = 1.0 - smoothstep(0.25, 1.0, footAlong / wavelength);
  return mix(0.5, n, weight);
}

void main() {
  float footprint = max(fwidth(vAcross), 1e-6);
  float halo = laserBand(uHaloHalfWidth, uHaloPeak, footprint);
  float flare = laserBand(uFlareHalfWidth, uFlarePeak, footprint);
  float core = laserBand(uCoreHalfWidth, uCorePeak, footprint);

  float footAlong = fwidth(vAlong);
  float n = 0.6 * laserOctave(40.0, 300.0, 0.0, footAlong) +
    0.4 * laserOctave(9.0, -200.0, 17.0, footAlong);
  float shimmer = 1.0 + uShimmerDepth * (2.0 * n - 1.0);

  float taper = max(min(uHaloHalfWidth, 0.5 * vLength), 1e-3);
  float ends = smoothstep(0.0, taper, vAlong) *
    smoothstep(0.0, taper, vLength - vAlong);
  float window = 1.0 - smoothstep(0.8, 1.0, abs(vAcross / vHalfExtent));

  gl_FragColor = vec4(
    (vColor * (halo + flare) * shimmer + vec3(core)) * ends * window * vFade,
    1.0
  );

  #include <logdepthbuf_fragment>
}
`;

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function dynamicAttribute(
  itemSize: number,
): THREE.BufferAttribute & { array: Float32Array } {
  const attribute = new THREE.BufferAttribute(
    new Float32Array(LASER_SHOT_POOL * QUAD_VERTICES * itemSize),
    itemSize,
  );
  attribute.setUsage(THREE.DynamicDrawUsage);
  return attribute as THREE.BufferAttribute & { array: Float32Array };
}

export function createLaserShotLayer(): LaserShotLayer {
  // Float64 world ends per slot; the float32 buffers below are what is drawn
  // and are rewritten each update, compacted to the live shots.
  const world = new Float64Array(LASER_SHOT_POOL * SLOT_WORLD_FLOATS);
  const slotColor = new Float32Array(LASER_SHOT_POOL * 3);
  // NaN marks an empty slot.
  const startTime = new Float64Array(LASER_SHOT_POOL).fill(Number.NaN);
  // 1 when the slot holds ship-frame ends instead of world ends.
  const anchored = new Uint8Array(LASER_SHOT_POOL);
  let head = 0;
  let disposed = false;

  const positions = dynamicAttribute(3);
  const sides = dynamicAttribute(3);
  const colors = dynamicAttribute(3);
  const shapes = dynamicAttribute(4);
  const indices = new Uint16Array(LASER_SHOT_POOL * QUAD_INDICES);
  for (let j = 0; j < LASER_SHOT_POOL; j += 1) {
    const v = j * QUAD_VERTICES;
    indices.set([v, v + 1, v + 2, v, v + 2, v + 3], j * QUAD_INDICES);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", positions);
  geometry.setAttribute("aSide", sides);
  geometry.setAttribute("aColor", colors);
  geometry.setAttribute("aShape", shapes);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.setDrawRange(0, 0);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uHaloHalfWidth: { value: LASER_HALO_HALF_WIDTH },
      uFlareHalfWidth: { value: LASER_FLARE_HALF_WIDTH },
      uCoreHalfWidth: { value: LASER_CORE_HALF_WIDTH },
      uHaloPeak: { value: LASER_HALO_PEAK },
      uFlarePeak: { value: LASER_FLARE_PEAK },
      uCorePeak: { value: LASER_CORE_PEAK },
      uProfileSigma: { value: LASER_PROFILE_SIGMA },
      uMinHalfExtentPx: { value: LASER_MIN_HALF_EXTENT_PX },
      uShimmerDepth: { value: LASER_SHIMMER_DEPTH },
      uViewportHeight: { value: 1080 },
      uTime: { value: 0 },
    },
    vertexShader: LASER_VERTEX_SHADER,
    fragmentShader: LASER_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  const uniforms = material.uniforms as {
    uViewportHeight: THREE.IUniform<number>;
    uTime: THREE.IUniform<number>;
  };

  const root = new THREE.Mesh(geometry, material);
  root.name = "laserShots";
  // The bounding sphere is never current for a buffer that moves each frame.
  root.frustumCulled = false;
  root.visible = false;
  // The minimum on-screen width needs the drawing-buffer height in device
  // pixels; a hidden or minimised canvas reports 0 and keeps the last value.
  const bufferSize = new THREE.Vector2();
  root.onBeforeRender = (renderer): void => {
    renderer.getDrawingBufferSize(bufferSize);
    const height = bufferSize.y;
    if (Number.isFinite(height) && height > 0) {
      uniforms.uViewportHeight.value = height;
    }
  };

  function hide(): void {
    geometry.setDrawRange(0, 0);
    root.visible = false;
  }

  /**
   * Write quad `quad` for the camera-relative ends a and b: the side vector
   * is cross(b - a, a) normalised, perpendicular to the beam and, because the
   * camera is the origin, to the view ray at every point of the beam.
   */
  function writeQuad(
    quad: number,
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    slot: number,
    fade: number,
  ): void {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const beamLength = Math.hypot(dx, dy, dz);
    let sx = dy * az - dz * ay;
    let sy = dz * ax - dx * az;
    let sz = dx * ay - dy * ax;
    let sideLength = Math.hypot(sx, sy, sz);
    const reach = Math.max(Math.hypot(ax, ay, az), Math.hypot(bx, by, bz), 1);
    if (!(sideLength > 1e-9 * beamLength * reach)) {
      // The camera is on the beam's line, or the shot has no length: any
      // vector perpendicular to the beam will do. Cross the beam with the
      // world axis least aligned with it.
      if (beamLength > 0) {
        const ux = Math.abs(dx);
        const uy = Math.abs(dy);
        const uz = Math.abs(dz);
        if (ux <= uy && ux <= uz) {
          // d x (1, 0, 0)
          sx = 0;
          sy = dz;
          sz = -dy;
        } else if (uy <= uz) {
          // d x (0, 1, 0)
          sx = -dz;
          sy = 0;
          sz = dx;
        } else {
          // d x (0, 0, 1)
          sx = dy;
          sy = -dx;
          sz = 0;
        }
        sideLength = Math.hypot(sx, sy, sz);
      } else {
        sx = 1;
        sy = 0;
        sz = 0;
        sideLength = 1;
      }
    }
    sx /= sideLength;
    sy /= sideLength;
    sz /= sideLength;

    const red = slotColor[slot * 3] ?? 0;
    const green = slotColor[slot * 3 + 1] ?? 0;
    const blue = slotColor[slot * 3 + 2] ?? 0;
    const p = positions.array;
    const s = sides.array;
    const c = colors.array;
    const h = shapes.array;
    for (let v = 0; v < QUAD_VERTICES; v += 1) {
      const vertex = quad * QUAD_VERTICES + v;
      const atTo = v >= 2;
      const i3 = vertex * 3;
      p[i3] = atTo ? bx : ax;
      p[i3 + 1] = atTo ? by : ay;
      p[i3 + 2] = atTo ? bz : az;
      s[i3] = sx;
      s[i3 + 1] = sy;
      s[i3 + 2] = sz;
      c[i3] = red;
      c[i3 + 1] = green;
      c[i3 + 2] = blue;
      const i4 = vertex * 4;
      // Vertex order: 0 from end -1, 1 from end +1, 2 to end +1, 3 to end -1.
      h[i4] = v === 1 || v === 2 ? 1 : -1;
      h[i4 + 1] = atTo ? beamLength : 0;
      h[i4 + 2] = beamLength;
      h[i4 + 3] = fade;
    }
  }

  return {
    root,
    add(from, to, laserKind, flightTime, anchor): void {
      if (disposed) return;
      if (!finiteVec(from) || !finiteVec(to) || !Number.isFinite(flightTime)) {
        return;
      }
      const useAnchor =
        anchor !== undefined &&
        finiteVec(anchor.position) &&
        Number.isFinite(anchor.orientation.w);
      // An anchored shot stores its ends in the ship's frame.
      const a = useAnchor
        ? rotateInverse(anchor.orientation, sub(from, anchor.position))
        : from;
      const b = useAnchor
        ? rotateInverse(anchor.orientation, sub(to, anchor.position))
        : to;
      anchored[head] = useAnchor ? 1 : 0;
      const base = head * SLOT_WORLD_FLOATS;
      world[base] = a.x;
      world[base + 1] = a.y;
      world[base + 2] = a.z;
      world[base + 3] = b.x;
      world[base + 4] = b.y;
      world[base + 5] = b.z;
      const color = LASER_SHOT_COLORS[laserKind];
      slotColor[head * 3] = color[0];
      slotColor[head * 3 + 1] = color[1];
      slotColor[head * 3 + 2] = color[2];
      startTime[head] = flightTime;
      head = (head + 1) % LASER_SHOT_POOL;
    },
    update(cameraWorld, flightTime, player): void {
      if (disposed) return;
      if (!finiteVec(cameraWorld) || !Number.isFinite(flightTime)) {
        hide();
        return;
      }
      uniforms.uTime.value = flightTime % LASER_TIME_WRAP;
      let live = 0;
      for (let slot = 0; slot < LASER_SHOT_POOL; slot += 1) {
        const start = startTime[slot] ?? Number.NaN;
        if (Number.isNaN(start)) continue;
        const elapsed = flightTime - start;
        // Expired, or started in the future (a Load rewound the clock): the
        // slot is freed and never comes back.
        if (elapsed < 0 || elapsed >= LASER_SHOT_DURATION) {
          startTime[slot] = Number.NaN;
          continue;
        }
        const from = slot * SLOT_WORLD_FLOATS;
        let ax = world[from] ?? 0;
        let ay = world[from + 1] ?? 0;
        let az = world[from + 2] ?? 0;
        let bx = world[from + 3] ?? 0;
        let by = world[from + 4] ?? 0;
        let bz = world[from + 5] ?? 0;
        if (anchored[slot] === 1) {
          // Without a player pose (docked, jumped) the anchored shot is not
          // drawn: its world position is unknown.
          if (player === undefined) {
            startTime[slot] = Number.NaN;
            continue;
          }
          const wa = addVec(
            player.position,
            rotate(player.orientation, { x: ax, y: ay, z: az }),
          );
          const wb = addVec(
            player.position,
            rotate(player.orientation, { x: bx, y: by, z: bz }),
          );
          ax = wa.x;
          ay = wa.y;
          az = wa.z;
          bx = wb.x;
          by = wb.y;
          bz = wb.z;
        }
        // The float64 subtraction happens here, before any float32 write.
        writeQuad(
          live,
          ax - cameraWorld.x,
          ay - cameraWorld.y,
          az - cameraWorld.z,
          bx - cameraWorld.x,
          by - cameraWorld.y,
          bz - cameraWorld.z,
          slot,
          laserShotFade(elapsed),
        );
        live += 1;
      }
      if (live === 0) {
        hide();
        return;
      }
      positions.needsUpdate = true;
      sides.needsUpdate = true;
      colors.needsUpdate = true;
      shapes.needsUpdate = true;
      geometry.setDrawRange(0, live * QUAD_INDICES);
      root.visible = true;
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      hide();
      geometry.dispose();
      material.dispose();
    },
  };
}

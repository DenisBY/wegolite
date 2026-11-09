// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The High-quality sky nebulae (PROJECT.md Key Decisions).
 *
 * A port of Oolite's nebula quads (`OOSkyDrawable.m`,
 * `setUpNebulaeWithColor1:…`, pinned 7437f22): `sky_n_blurs` faint, additively
 * blended, textured quads on the sky, grouped into clusters. A cluster shares
 * one direction and one colour; each quad in it has its own size, rotation and
 * texture, and is pivoted on a corner rather than its centre, which is what
 * spreads a cluster into a cloud.
 *
 * What is the same as Oolite: the cluster loop (including its documented
 * off-by-one, which draws fewer quads than `sky_n_blurs`), the size and
 * brightness rules, the texture probabilities from `nebulatextures.plist`, the
 * colour rule (`SaturatedColorInRange`, with the hue quirk that gives the
 * purple and green skies) and the two sky colours from `planetinfo.plist`.
 *
 * What differs: the random stream. Oolite draws from its own generator seeded
 * by the system, so the exact layout of a given system's nebulae is not
 * Oolite's. Here the stream is `createSeededRandom(fnv1a32(seed))`, never
 * `Math.random`, so a system always shows the same sky.
 *
 * The quads sit on a shell just inside the starfield and stay at the camera
 * origin, like the starfield, so only the camera's rotation changes the view.
 * They depth-test and never write depth, so every body hides them.
 */

import * as THREE from "three";
import { fnv1a32 } from "../../sim/hash.js";
import {
  axisAngle,
  createSeededRandom,
  mul,
  normalize,
  quat,
  rotate,
  vec,
} from "../../sim/math.js";
import type { Quat, Vec3 } from "../../sim/math.js";

/** The nebula shell radius in metres; the starfield is at 1.5e6. */
export const NEBULA_SHELL_RADIUS = 1.4e6;

/** Oolite's `SKY_BASIS_BLOBS`; `sky_n_blurs` above this is clamped. */
export const NEBULA_MAX_QUADS = 1280;

/** Oolite's `SKY_clusterChance`, `SKY_alpha` and `SKY_scale` defaults. */
export const NEBULA_CLUSTER_CHANCE = 0.8;
export const NEBULA_ALPHA = 0.1;
export const NEBULA_SCALE = 10;

/**
 * Oolite sizes a quad as `scale * r1 * BILLBOARD_DEPTH / 500` at a distance of
 * `BILLBOARD_DEPTH`, so its angular size is `scale * r1 / 500` radians.
 */
const ELEMENT_ANGLE_DIVISOR = 500;

/**
 * Oolite's per-quad direction jitter: `NEBULA_SHUFFLE_FACTOR (0.005) /
 * (scale * SKY_ELEMENT_SCALE_FACTOR)`, with `SKY_ELEMENT_SCALE_FACTOR =
 * BILLBOARD_DEPTH (75000) / 500`.
 */
const SHUFFLE = 0.005 / (NEBULA_SCALE * (75_000 / 500));

/**
 * The universal `sky_color_1` and `sky_color_2`
 * (`third_party/oolite/Config/planetinfo.plist:15-16`). No system in the
 * pinned snapshot overrides them or sets `nebula_color_1`/`nebula_color_2`.
 */
export const SKY_COLOR_1: readonly [number, number, number] = [0.75, 0.8, 1];
export const SKY_COLOR_2: readonly [number, number, number] = [1, 0.85, 0.6];

/** `third_party/oolite/Config/nebulatextures.plist`: file and probability. */
export const NEBULA_TEXTURES: readonly {
  readonly file: string;
  readonly probability: number;
}[] = [
  { file: "oolite-nebula-1.png", probability: 1 },
  { file: "oolite-nebula-2.png", probability: 0.5 },
  { file: "oolite-nebula-3.png", probability: 0.1 },
  { file: "oolite-nebula-4.png", probability: 1 },
];

/**
 * Display gain over Oolite's `SKY_alpha`. Presentation tuning.
 *
 * At a gain of 1 the quads carry exactly Oolite's legacy values (at most 0.1
 * per quad, added in display space), which reads as almost nothing on a
 * modern display; Oolite 1.92 shows its nebulae through an HDR pipeline that
 * Wegolite does not have.
 */
export const NEBULA_DISPLAY_GAIN = 3;

/**
 * The nebula material's shaders.
 *
 * Oolite adds `texture * colour` to the frame buffer in display space, with no
 * colour management. The fragment stage therefore deliberately omits Three's
 * `<colorspace_fragment>`: the product is written as the displayed value. The
 * log-depth chunks keep the quads behind every body.
 */
const NEBULA_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_vertex>

attribute vec3 tint;

varying vec2 vUv;
varying vec3 vTint;

void main() {
  vUv = uv;
  vTint = tint;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);

  #include <logdepthbuf_vertex>
}
`;

const NEBULA_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <logdepthbuf_pars_fragment>

uniform sampler2D uMap;
uniform float uGain;

varying vec2 vUv;
varying vec3 vTint;

void main() {
  gl_FragColor = vec4(texture2D(uMap, vUv).rgb * vTint * uGain, 1.0);

  #include <logdepthbuf_fragment>
}
`;

/** One generated nebula quad on the unit sphere. */
export interface NebulaQuad {
  /** Four corners in order around the quad, at unit distance scale. */
  readonly corners: readonly [Vec3, Vec3, Vec3, Vec3];
  /** Display-space colour already scaled by the quad's brightness. */
  readonly color: readonly [number, number, number];
  /** Index into `NEBULA_TEXTURES`. */
  readonly texture: number;
}

export type TextureLoader = (url: string) => THREE.Texture;

/** The GPU-facing nebulae: one group, at most one mesh per texture. */
export interface NebulaBody {
  readonly object: THREE.Group;
  readonly quadCount: number;
  dispose(): void;
}

function clampCount(count: number): number {
  if (!Number.isFinite(count)) return 0;
  return Math.min(Math.max(Math.trunc(count), 0), NEBULA_MAX_QUADS);
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

/** Oolite's `getHue:saturation:brightness:`; the hue is in degrees. */
function toHsb(
  red: number,
  green: number,
  blue: number,
): readonly [number, number, number] {
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const delta = max - min + 0.0001;
  let hue: number;
  if (max === red && green >= blue) {
    hue = (60 * (green - blue)) / delta;
  } else if (max === red) {
    hue = (60 * (green - blue)) / delta + 360;
  } else if (max === green) {
    hue = (60 * (blue - red)) / delta + 120;
  } else {
    hue = (60 * (red - green)) / delta + 240;
  }
  return [hue, max === 0 ? 0 : 1 - min / max, max];
}

/** HSB to RGB with the hue in degrees. */
function fromHsb(
  hueDegrees: number,
  saturation: number,
  brightness: number,
): readonly [number, number, number] {
  const hue = (((hueDegrees % 360) + 360) % 360) / 60;
  const sector = Math.floor(hue);
  const fraction = hue - sector;
  const p = brightness * (1 - saturation);
  const q = brightness * (1 - saturation * fraction);
  const t = brightness * (1 - saturation * (1 - fraction));
  switch (sector) {
    case 0:
      return [brightness, t, p];
    case 1:
      return [q, brightness, p];
    case 2:
      return [p, brightness, t];
    case 3:
      return [p, q, brightness];
    case 4:
      return [t, p, brightness];
    default:
      return [brightness, p, q];
  }
}

/**
 * Oolite's `SaturatedColorInRange` without the hue fix.
 *
 * A random blend of the two sky colours, with the saturation moved halfway to
 * full. Oolite then passes the hue, which is in degrees, to a constructor that
 * expects a fraction and multiplies it by 360. The result is a hue that is
 * effectively scattered around the wheel; Oolite keeps the quirk on purpose
 * ("so the nebula hues are clearer") and so does this port.
 */
export function nebulaColor(
  fraction: number,
): readonly [number, number, number] {
  const f = clamp01(fraction);
  const [hue, saturation, brightness] = toHsb(
    SKY_COLOR_1[0] * (1 - f) + SKY_COLOR_2[0] * f,
    SKY_COLOR_1[1] * (1 - f) + SKY_COLOR_2[1] * f,
    SKY_COLOR_1[2] * (1 - f) + SKY_COLOR_2[2] * f,
  );
  return fromHsb(hue * 360, 0.5 * saturation + 0.5, brightness);
}

function randomQuaternion(random: () => number): Quat {
  return normalize(
    quat(
      Math.floor(random() * 1024) - 511.5,
      Math.floor(random() * 1024) - 511.5,
      Math.floor(random() * 1024) - 511.5,
      Math.floor(random() * 1024) - 511.5,
    ),
  );
}

function pickTexture(random: () => number): number {
  let total = 0;
  for (const texture of NEBULA_TEXTURES) total += texture.probability;
  let roll = random() * total;
  for (const [index, texture] of NEBULA_TEXTURES.entries()) {
    roll -= texture.probability;
    if (roll < 0) return index;
  }
  return NEBULA_TEXTURES.length - 1;
}

function add(a: Vec3, b: Vec3): Vec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function scaled(a: Vec3, factor: number): Vec3 {
  return vec(a.x * factor, a.y * factor, a.z * factor);
}

/**
 * Generate the nebula quads for one system.
 *
 * @param count The authored `sky_n_blurs`; clamped to `0..NEBULA_MAX_QUADS`.
 * @param seed The authored `random_seed` string.
 */
export function generateNebulaQuads(count: number, seed: string): NebulaQuad[] {
  const total = clampCount(count);
  const random = createSeededRandom(
    Number.parseInt(fnv1a32(`${seed}:nebulae`), 16) >>> 0,
  );
  const quads: NebulaQuad[] = [];

  // Oolite's loop: the outer `for` increments `i` as well as the inner
  // `while`, so fewer than `total` quads are produced. The comment in
  // OOSkyDrawable.m keeps that on purpose "to keep skies looking the same".
  for (let i = 0; i < total; i += 1) {
    const base = nebulaColor(random());
    let q = randomQuaternion(random);

    while (i < total && random() < NEBULA_CLUSTER_CHANCE) {
      const r1 = 1 + Math.floor(random() * 16);
      const size = (NEBULA_SCALE * r1) / ELEMENT_ANGLE_DIVISOR;

      const vk = rotate(q, vec(0, 0, 1));
      // The corner offset uses the basis from before this quad's rotation, so
      // the quad pivots on a corner, not on the cluster centre.
      const offset = scaled(
        add(rotate(q, vec(1, 0, 0)), rotate(q, vec(0, 1, 0))),
        0.5 * size,
      );

      // Smaller quads are dimmer.
      const brightness = NEBULA_ALPHA * (0.5 + r1 / 32);
      const color: [number, number, number] = [
        clamp01(base[0] * brightness),
        clamp01(base[1] * brightness),
        clamp01(base[2] * brightness),
      ];
      const texture = pickTexture(random);

      q = normalize(
        mul(axisAngle(vk.x, vk.y, vk.z, random() * Math.PI * 2), q),
      );
      const vi = scaled(rotate(q, vec(1, 0, 0)), size);
      const vj = scaled(rotate(q, vec(0, 1, 0)), size);

      const c0 = add(vk, scaled(offset, -1));
      const c1 = add(c0, vj);
      const c2 = add(c1, vi);
      const c3 = add(c0, vi);
      quads.push({ corners: [c0, c1, c2, c3], color, texture });

      // Shuffle the direction a little to spread the cluster.
      q = normalize(
        quat(
          q.w + SHUFFLE * (random() - 0.5),
          q.x + SHUFFLE * (random() - 0.5),
          q.y + SHUFFLE * (random() - 0.5),
          q.z + SHUFFLE * (random() - 0.5),
        ),
      );

      i += 1;
    }
  }

  return quads;
}

function defaultLoader(): TextureLoader {
  const loader = new THREE.TextureLoader();
  return (url) => loader.load(url);
}

type NebulaMesh = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

function buildMesh(
  quads: readonly NebulaQuad[],
  map: THREE.Texture,
): NebulaMesh {
  const positions = new Float32Array(quads.length * 12);
  const tints = new Float32Array(quads.length * 12);
  const uvs = new Float32Array(quads.length * 8);
  const indices: number[] = [];
  const cornerUvs = [0, 0, 0, 1, 1, 1, 1, 0];

  for (const [index, quad] of quads.entries()) {
    for (const [corner, point] of quad.corners.entries()) {
      const vertex = index * 4 + corner;
      positions[vertex * 3] = point.x * NEBULA_SHELL_RADIUS;
      positions[vertex * 3 + 1] = point.y * NEBULA_SHELL_RADIUS;
      positions[vertex * 3 + 2] = point.z * NEBULA_SHELL_RADIUS;
      tints[vertex * 3] = quad.color[0];
      tints[vertex * 3 + 1] = quad.color[1];
      tints[vertex * 3 + 2] = quad.color[2];
      uvs[vertex * 2] = cornerUvs[corner * 2] ?? 0;
      uvs[vertex * 2 + 1] = cornerUvs[corner * 2 + 1] ?? 0;
    }
    const first = index * 4;
    indices.push(first, first + 1, first + 2, first, first + 2, first + 3);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("tint", new THREE.BufferAttribute(tints, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: map },
      uGain: { value: NEBULA_DISPLAY_GAIN },
    },
    vertexShader: NEBULA_VERTEX_SHADER,
    fragmentShader: NEBULA_FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
  return new THREE.Mesh(geometry, material);
}

/**
 * Build the nebulae for one system.
 *
 * The textures are loaded through `loadTexture` and are owned by the returned
 * body: `dispose` frees them with the geometry and materials. Re-entering a
 * system loads them again from the browser cache.
 */
export function createNebulae(
  count: number,
  seed: string,
  baseUrl: string = import.meta.env.BASE_URL,
  loadTexture: TextureLoader = defaultLoader(),
): NebulaBody {
  const quads = generateNebulaQuads(count, seed);
  const object = new THREE.Group();
  object.name = "nebulae";

  const meshes: NebulaMesh[] = [];
  const textures: THREE.Texture[] = [];
  for (const [index, texture] of NEBULA_TEXTURES.entries()) {
    const own = quads.filter((quad) => quad.texture === index);
    if (own.length === 0) continue;
    const map = loadTexture(`${baseUrl}textures/${texture.file}`);
    // The shader reads the raw stored value (see NEBULA_FRAGMENT_SHADER).
    map.colorSpace = THREE.NoColorSpace;
    textures.push(map);
    const mesh = buildMesh(own, map);
    mesh.name = `nebulae-${String(index + 1)}`;
    meshes.push(mesh);
    object.add(mesh);
  }

  return {
    object,
    quadCount: quads.length,
    dispose(): void {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
      for (const texture of textures) texture.dispose();
      object.clear();
    },
  };
}

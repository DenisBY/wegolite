// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The drawn ship explosion (WORLD-17, success criterion 3; D16-08, D16-22).
 *
 * Every `shipDestroyed` event adds one explosion at the event's position:
 * Oolite's default ship explosion cloud (`oolite-default-ship-explosion`,
 * `OOExplosionCloudEntity.m:30-245` over `OOParticleSystem.m:40-150`) and its
 * white flash (`OOFlashEffectEntity.m:30-115`), the pair `ShipEntity.m:7957-
 * 7964` adds for a ship with no `explosion_type`. The whole layer is two
 * `THREE.InstancedMesh` objects sharing one unit quad, over a fixed pool of
 * `EXPLOSION_POOL` explosions: the cloud with `EXPLOSION_MAX_PARTICLES`
 * instances per explosion, the flash with one. That is two draw calls while
 * any explosion is live (one once every flash has expired), none otherwise,
 * however many ships die, and nothing is allocated by `add` or `update`. A
 * ninth simultaneous explosion overwrites the oldest.
 *
 * **The cloud, from Oolite.**
 * - Particle count: `min(count, 10)`, Oolite's cap at a detail level up to
 *   `DETAIL_LEVEL_SHADERS` (`OOExplosionCloudEntity.m:60, 70-73`; D16-08).
 * - `size = radius * settings.size` (`:76`), `growthRate = settings.growthRate
 *   * size` (`:79`), the brightness clamped to at least 1 (`:82-83`).
 * - Each particle flies along a uniform random unit vector at a speed of
 *   `min + 0.5 (u + u)(max - min)` between `size * 0.8 * spread` and
 *   `size * 1.2 * spread` (`:107`, `OOParticleSystem.m:67-68`); its size starts
 *   at that speed (`OOParticleSystem.m:77`) and grows by `growthRate` per
 *   second (`:219`).
 * - Colours: three draws ordered `c1 >= c2 >= c3` and assigned by
 *   `color_order` (`white`: one grey draw), times the brightness (`:108-157`).
 * - Alpha `alpha * (1 - t / duration)` (`:186`), and the sequential channel
 *   fade at `fadeRate = count * brightness / 25` (`:182`): the tertiary
 *   channel at half the rate, then the secondary at the rate, then the primary
 *   at twice the rate (`:218-240`).
 *
 * **The flash, from Oolite** (D16-22: no plist entry exists, so the C
 * constants of `OOFlashEffectEntity.m:34-38` are restated here). White, its
 * size starting at the ship's collision radius (`:76`, `:86`) and growing by
 * `max(150 * radius, 600)` per second (`:58`, `:89`, `:104`), its alpha
 * `0.5 * t / tf` for `t < tf = 0.667 * 0.4 s` and `0.5 * (0.4 - t) / (0.4 -
 * tf)` after (`:100-108`), removed after 0.4 s (`:111-112`). Oolite draws it
 * from `-size` to `+size` too (`OOLightParticleEntity.m:179-191`). The
 * distance attenuation by `no_draw_distance` (`:157-159`) is not reproduced.
 *
 * `update` evaluates every particle and flash as a closed function of
 * `t = flightTime - start` rather than integrating per frame, so a frame-rate
 * change does not change the cloud and a slot needs no per-frame state.
 *
 * **Drawing.** Oolite draws a particle as a quad from `-size` to `+size`
 * (`OOParticleSystem.m:124-134` `DrawQuadForView`), so the unit quad is scaled
 * by `2 * size`. Every quad takes the camera's orientation (Oolite's shared
 * billboard, `OOParticleSystem.m:176-193`). Blending is additive with source
 * alpha, Oolite's `glBlendFunc(GL_SRC_ALPHA, GL_ONE)` (`:148`); the particle
 * texture is an alpha mask (`kOOTextureAlphaMask`, `OOExplosionCloudEntity.m:
 * 90-94`), so it is bound as the material's `alphaMap`. Oolite's colours are
 * display values blended in display space: the instance colour carries
 * `clamp(c) * alpha` decoded to linear light (`srgbToLinear`), so the
 * renderer's sRGB output encode lands exactly on Oolite's display value.
 *
 * Camera-relative like every body (`sync.ts`, `npc-ships.ts`): the explosion's
 * world origin is kept in float64 and the camera is subtracted in float64
 * before the float32 matrix write.
 *
 * **Presentation only.** The particles' random values come from a PRNG seeded
 * with `fnv1a32` of the event's position and radius, never from a sim stream,
 * so the world hash cannot depend on this layer. The layer stores positions,
 * times and colours only: no entity id, no killer. The system scene owns and
 * disposes it, so a jump or a Load clears it. Oolite's cloud also drifts with
 * the dead ship's velocity (`OOExplosionCloudEntity.m:62, 102-105`); the event
 * carries none, so the cloud stays where the ship died.
 *
 * **Textures.** The cloud texture and `oolite-particle-flash.png` (Oolite's
 * flash texture, `OOFlashEffectEntity.m:125`) are requested on the first
 * `add` only, never on a cold start, and the cloud's only after its name
 * matches `oolite-particle-<name>.png`. One cloud texture per layer: the
 * compiled catalogue holds the one default setting, so a later setting naming
 * another file still draws with the first. `dispose` frees the shared quad,
 * both materials and every texture it loaded.
 */

import * as THREE from "three";
import { fnv1a32 } from "../../sim/hash.js";
import { createSeededRandom } from "../../sim/math.js";
import type { Vec3 } from "../../sim/math.js";
import { srgbToLinear } from "../color.js";

/**
 * One explosion setting: structurally the compiled `ExplosionRecord` minus its
 * key (`src/content/schemas/explosion.ts`). The render may not import the
 * content module itself, so the shape is restated here.
 */
export interface ExplosionSettings {
  readonly alpha: number;
  readonly colorOrder: string;
  readonly count: number;
  readonly duration: number;
  readonly growthRate: number;
  readonly size: number;
  readonly spread: number;
  readonly brightness: number;
  readonly texture: string;
}

/** Explosions drawn at once; a further explosion overwrites the oldest. */
export const EXPLOSION_POOL = 8;

/**
 * Cloud particles per explosion (D16-08): Oolite's count at a detail level up
 * to `DETAIL_LEVEL_SHADERS` (`OOExplosionCloudEntity.m:60`), not the authored
 * 25.
 */
export const EXPLOSION_MAX_PARTICLES = 10;

/** The flash's lifetime in seconds (`kExplosionFlashDuration`, `OOFlashEffectEntity.m:35`). */
export const FLASH_DURATION = 0.4;

/** The flash's peak alpha (`kExplosionFlashAlpha`, `OOFlashEffectEntity.m:38`). */
export const FLASH_ALPHA = 0.5;

/** Flash growth per metre of radius per second (`kGrowthRateFactor`, `OOFlashEffectEntity.m:36`). */
export const FLASH_GROWTH_FACTOR = 150;

/** The least flash growth per second (`kMinExplosionGrowth`, `OOFlashEffectEntity.m:37`). */
export const FLASH_MIN_GROWTH = 600;

/** The fraction of the flash's life spent fading in (`OOFlashEffectEntity.m:100`). */
const FLASH_FADE_IN = 0.667;

/** Oolite's flash texture (`OOFlashEffectEntity.m:125`). */
const FLASH_TEXTURE = "oolite-particle-flash.png";

/** The particle texture names this layer will build a URL from. */
const PARTICLE_TEXTURE = /^oolite-particle-[a-z0-9-]+\.png$/;

/** Load one texture by URL; tests inject a recording double. */
export type ExplosionTextureLoader = (url: string) => THREE.Texture;

/** The explosion layer of one system scene. */
export interface ExplosionLayer {
  /** The group holding the layer's instanced draw objects. */
  readonly root: THREE.Group;
  /**
   * Add an explosion at `position` (world space) for a ship of collision
   * radius `radius`, starting at `flightTime`. Non-finite input, a negative
   * radius or a texture name outside `oolite-particle-<name>.png` is skipped.
   */
  add(
    position: Vec3,
    radius: number,
    settings: ExplosionSettings,
    flightTime: number,
  ): void;
  /**
   * Rewrite the live particles camera-relative, facing the camera, and retire
   * the expired explosions. `flightTime` is the clock they were added with.
   */
  update(
    cameraWorld: Vec3,
    cameraQuaternion: THREE.Quaternion,
    flightTime: number,
  ): void;
  /** Free the shared quad, both materials and every loaded texture. */
  dispose(): void;
}

/** Channel indices for each `color_order` (`OOExplosionCloudEntity.m:189-213`). */
const CHANNEL_ORDER: Readonly<
  Record<string, readonly [number, number, number]>
> = {
  rgb: [0, 1, 2],
  rbg: [0, 2, 1],
  grb: [1, 0, 2],
  gbr: [1, 2, 0],
  brg: [2, 0, 1],
  bgr: [2, 1, 0],
};

/** Oolite's default for an unknown order (`:188`, `rgb`). */
const DEFAULT_ORDER: readonly [number, number, number] = [0, 1, 2];

const CLOUD_CAPACITY = EXPLOSION_POOL * EXPLOSION_MAX_PARTICLES;

function finiteVec(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function clamp01(value: number): number {
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function finiteSettings(s: ExplosionSettings): boolean {
  return (
    Number.isFinite(s.alpha) &&
    Number.isFinite(s.count) &&
    Number.isFinite(s.duration) &&
    s.duration > 0 &&
    Number.isFinite(s.growthRate) &&
    Number.isFinite(s.size) &&
    Number.isFinite(s.spread) &&
    Number.isFinite(s.brightness)
  );
}

function defaultLoader(): ExplosionTextureLoader {
  const loader = new THREE.TextureLoader();
  return (url) => loader.load(url);
}

/**
 * Oolite's sequential channel fade (`OOExplosionCloudEntity.m:218-240`) after
 * `t` seconds, as a closed form: the tertiary channel falls at half the rate
 * until it is zero, then the secondary at the rate, then the primary at twice
 * the rate. Writes the faded colour into `rgb` in place.
 */
function sequentialFade(
  rgb: Float64Array,
  primary: number,
  secondary: number,
  tertiary: number,
  rate: number,
  t: number,
): void {
  if (rate <= 0) return;
  let remaining = fadeOne(rgb, tertiary, 0.5 * rate, t);
  remaining = fadeOne(rgb, secondary, rate, remaining);
  fadeOne(rgb, primary, 2 * rate, remaining);
}

/**
 * Fade one channel for at most `remaining` seconds at `rate`; returns the
 * seconds left over once it reached zero (0 when it did not).
 */
function fadeOne(
  rgb: Float64Array,
  channel: number,
  rate: number,
  remaining: number,
): number {
  if (remaining <= 0) return 0;
  const value = rgb[channel] ?? 0;
  if (value <= 0) return remaining;
  const span = value / rate;
  if (remaining < span) {
    rgb[channel] = value - remaining * rate;
    return 0;
  }
  rgb[channel] = 0;
  return remaining - span;
}

export function createExplosionLayer(
  loadTexture: ExplosionTextureLoader = defaultLoader(),
  baseUrl: string = import.meta.env.BASE_URL,
): ExplosionLayer {
  // Per slot (float64 where it is a world value or a time).
  const origin = new Float64Array(EXPLOSION_POOL * 3);
  // NaN marks an empty slot.
  const startTime = new Float64Array(EXPLOSION_POOL).fill(Number.NaN);
  const particleCount = new Uint8Array(EXPLOSION_POOL);
  const growthRate = new Float64Array(EXPLOSION_POOL);
  const duration = new Float64Array(EXPLOSION_POOL);
  const cloudAlpha = new Float64Array(EXPLOSION_POOL);
  const fadeRate = new Float64Array(EXPLOSION_POOL);
  // The flash: its starting size (the radius) and its growth per second.
  const flashSize = new Float64Array(EXPLOSION_POOL);
  const flashGrowth = new Float64Array(EXPLOSION_POOL);
  // 1 for `color_order` "white": no channel fade.
  const white = new Uint8Array(EXPLOSION_POOL);
  // Primary, secondary, tertiary channel per slot.
  const order = new Uint8Array(EXPLOSION_POOL * 3);
  // Per particle: unit direction, speed and initial colour.
  const direction = new Float64Array(CLOUD_CAPACITY * 3);
  const speed = new Float64Array(CLOUD_CAPACITY);
  const color = new Float64Array(CLOUD_CAPACITY * 3);
  let head = 0;
  let disposed = false;

  // The one unit quad every instance of both meshes scales.
  const geometry = new THREE.PlaneGeometry(1, 1);
  const textures: THREE.Texture[] = [];
  let cloudTexture: THREE.Texture | undefined;

  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const cloud = new THREE.InstancedMesh(
    geometry,
    cloudMaterial,
    CLOUD_CAPACITY,
  );
  cloud.name = "explosionCloud";
  cloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  cloud.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(CLOUD_CAPACITY * 3),
    3,
  );
  cloud.instanceColor.setUsage(THREE.DynamicDrawUsage);
  // An InstancedMesh culls by its one source geometry's bounds: never cull.
  cloud.frustumCulled = false;
  cloud.count = 0;
  cloud.visible = false;

  const flashMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    fog: false,
  });
  const flash = new THREE.InstancedMesh(
    geometry,
    flashMaterial,
    EXPLOSION_POOL,
  );
  flash.name = "explosionFlash";
  flash.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  flash.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(EXPLOSION_POOL * 3),
    3,
  );
  flash.instanceColor.setUsage(THREE.DynamicDrawUsage);
  flash.frustumCulled = false;
  flash.count = 0;
  flash.visible = false;

  const root = new THREE.Group();
  root.name = "explosions";
  root.add(cloud, flash);

  // Reused for every instance: no allocation per particle.
  const place = new THREE.Vector3();
  const rgb = new Float64Array(3);
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();

  function loadOnce(file: string): THREE.Texture {
    const texture = loadTexture(`${baseUrl}textures/${file}`);
    // An alpha mask: the raw stored value, no colour-space decode.
    texture.colorSpace = THREE.NoColorSpace;
    textures.push(texture);
    return texture;
  }

  function hide(): void {
    cloud.count = 0;
    cloud.visible = false;
    flash.count = 0;
    flash.visible = false;
  }

  return {
    root,
    add(position, radius, settings, flightTime): void {
      if (disposed) return;
      if (
        !finiteVec(position) ||
        !Number.isFinite(radius) ||
        radius < 0 ||
        !Number.isFinite(flightTime) ||
        !finiteSettings(settings)
      ) {
        return;
      }
      // T-16-23: the name becomes a URL only when it is a particle file.
      if (!PARTICLE_TEXTURE.test(settings.texture)) return;
      if (cloudTexture === undefined) {
        // The first explosion: both textures, once each.
        cloudTexture = loadOnce(settings.texture);
        cloudMaterial.alphaMap = cloudTexture;
        cloudMaterial.needsUpdate = true;
        flashMaterial.alphaMap = loadOnce(FLASH_TEXTURE);
        flashMaterial.needsUpdate = true;
      }

      const slot = head;
      head = (head + 1) % EXPLOSION_POOL;
      const count = Math.min(
        Math.max(Math.trunc(settings.count), 0),
        EXPLOSION_MAX_PARTICLES,
      );
      const size = radius * settings.size;
      const brightness = Math.max(settings.brightness, 1);
      origin[slot * 3] = position.x;
      origin[slot * 3 + 1] = position.y;
      origin[slot * 3 + 2] = position.z;
      startTime[slot] = flightTime;
      particleCount[slot] = count;
      growthRate[slot] = settings.growthRate * size;
      duration[slot] = settings.duration;
      cloudAlpha[slot] = settings.alpha;
      fadeRate[slot] = (count * brightness) / 25;
      flashSize[slot] = radius;
      flashGrowth[slot] = Math.max(
        FLASH_GROWTH_FACTOR * radius,
        FLASH_MIN_GROWTH,
      );
      const isWhite = settings.colorOrder === "white";
      white[slot] = isWhite ? 1 : 0;
      const channels = CHANNEL_ORDER[settings.colorOrder] ?? DEFAULT_ORDER;
      order[slot * 3] = channels[0];
      order[slot * 3 + 1] = channels[1];
      order[slot * 3 + 2] = channels[2];

      // Render-only randomness (T-16-24): seeded from the event, not a stream.
      const random = createSeededRandom(
        Number.parseInt(
          fnv1a32(
            `${String(position.x)},${String(position.y)},${String(position.z)},${String(radius)}`,
          ),
          16,
        ),
      );
      const minSpeed = size * 0.8 * settings.spread;
      const maxSpeed = size * 1.2 * settings.spread;
      for (let i = 0; i < count; i += 1) {
        const p = slot * EXPLOSION_MAX_PARTICLES + i;
        speed[p] =
          minSpeed + 0.5 * (random() + random()) * (maxSpeed - minSpeed);
        // A uniform unit vector: z uniform in [-1, 1], longitude uniform.
        const z = 2 * random() - 1;
        const longitude = 2 * Math.PI * random();
        const ring = Math.sqrt(Math.max(0, 1 - z * z));
        direction[p * 3] = ring * Math.cos(longitude);
        direction[p * 3 + 1] = ring * Math.sin(longitude);
        direction[p * 3 + 2] = z;
        if (isWhite) {
          const grey = random() * brightness;
          color[p * 3] = grey;
          color[p * 3 + 1] = grey;
          color[p * 3 + 2] = grey;
        } else {
          const c1 = random();
          const c2 = Math.min(random(), c1);
          const c3 = Math.min(random(), c2);
          color[p * 3 + channels[0]] = c1 * brightness;
          color[p * 3 + channels[1]] = c2 * brightness;
          color[p * 3 + channels[2]] = c3 * brightness;
        }
      }
    },
    update(cameraWorld, cameraQuaternion, flightTime): void {
      if (disposed) return;
      if (!finiteVec(cameraWorld) || !Number.isFinite(flightTime)) {
        hide();
        return;
      }
      const colours = (cloud.instanceColor as THREE.InstancedBufferAttribute)
        .array as Float32Array;
      const flashColours = (
        flash.instanceColor as THREE.InstancedBufferAttribute
      ).array as Float32Array;
      const fadeIn = FLASH_FADE_IN * FLASH_DURATION;
      let live = 0;
      let flashLive = 0;
      for (let slot = 0; slot < EXPLOSION_POOL; slot += 1) {
        const start = startTime[slot] ?? Number.NaN;
        if (Number.isNaN(start)) continue;
        const t = flightTime - start;
        const life = duration[slot] ?? 0;
        const cloudOn = t >= 0 && t < life;
        const flashOn = t >= 0 && t <= FLASH_DURATION;
        // Expired, or started in the future (a Load rewound the clock): the
        // slot is freed and never comes back.
        if (!cloudOn && !flashOn) {
          startTime[slot] = Number.NaN;
          continue;
        }
        const ox = origin[slot * 3] ?? 0;
        const oy = origin[slot * 3 + 1] ?? 0;
        const oz = origin[slot * 3 + 2] ?? 0;

        if (flashOn) {
          // The float64 subtraction happens here, before any float32 write.
          place.set(ox - cameraWorld.x, oy - cameraWorld.y, oz - cameraWorld.z);
          const edge =
            2 * ((flashSize[slot] ?? 0) + (flashGrowth[slot] ?? 0) * t);
          scale.set(edge, edge, edge);
          matrix.compose(place, cameraQuaternion, scale);
          flash.setMatrixAt(flashLive, matrix);
          const flashAlpha =
            FLASH_ALPHA *
            (t < fadeIn
              ? t / fadeIn
              : (FLASH_DURATION - t) / (FLASH_DURATION - fadeIn));
          const white = srgbToLinear(clamp01(flashAlpha));
          flashColours[flashLive * 3] = white;
          flashColours[flashLive * 3 + 1] = white;
          flashColours[flashLive * 3 + 2] = white;
          flashLive += 1;
        }
        if (!cloudOn) continue;

        const alpha = (cloudAlpha[slot] ?? 0) * (1 - t / life);
        const growth = growthRate[slot] ?? 0;
        const rate = fadeRate[slot] ?? 0;
        const primary = order[slot * 3] ?? 0;
        const secondary = order[slot * 3 + 1] ?? 1;
        const tertiary = order[slot * 3 + 2] ?? 2;
        const count = particleCount[slot] ?? 0;
        for (let i = 0; i < count; i += 1) {
          const p = slot * EXPLOSION_MAX_PARTICLES + i;
          const v = speed[p] ?? 0;
          const travel = v * t;
          // The float64 subtraction happens here, before any float32 write.
          place.set(
            ox + (direction[p * 3] ?? 0) * travel - cameraWorld.x,
            oy + (direction[p * 3 + 1] ?? 0) * travel - cameraWorld.y,
            oz + (direction[p * 3 + 2] ?? 0) * travel - cameraWorld.z,
          );
          // Oolite's quad spans -size..+size.
          const edge = 2 * (v + growth * t);
          scale.set(edge, edge, edge);
          matrix.compose(place, cameraQuaternion, scale);
          cloud.setMatrixAt(live, matrix);

          rgb[0] = color[p * 3] ?? 0;
          rgb[1] = color[p * 3 + 1] ?? 0;
          rgb[2] = color[p * 3 + 2] ?? 0;
          if (white[slot] !== 1) {
            sequentialFade(rgb, primary, secondary, tertiary, rate, t);
          }
          colours[live * 3] = srgbToLinear(clamp01(rgb[0] ?? 0) * alpha);
          colours[live * 3 + 1] = srgbToLinear(clamp01(rgb[1] ?? 0) * alpha);
          colours[live * 3 + 2] = srgbToLinear(clamp01(rgb[2] ?? 0) * alpha);
          live += 1;
        }
      }
      cloud.count = live;
      cloud.visible = live > 0;
      if (live > 0) {
        cloud.instanceMatrix.needsUpdate = true;
        (cloud.instanceColor as THREE.InstancedBufferAttribute).needsUpdate =
          true;
      }
      flash.count = flashLive;
      flash.visible = flashLive > 0;
      if (flashLive > 0) {
        flash.instanceMatrix.needsUpdate = true;
        (flash.instanceColor as THREE.InstancedBufferAttribute).needsUpdate =
          true;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      hide();
      geometry.dispose();
      cloudMaterial.dispose();
      flashMaterial.dispose();
      for (const texture of textures) texture.dispose();
      textures.length = 0;
      root.clear();
    },
  };
}

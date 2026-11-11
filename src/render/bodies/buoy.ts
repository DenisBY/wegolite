// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The navigation buoys (PROJECT.md Key Decisions, revising Phase 3 D-04).
 *
 * Oolite puts one buoy 10 km in front of the main station's dock and one at
 * the witchpoint (`oolite-populator.js`). Both are the `oolite_buoy` model with
 * its `oolite_buoy_subents` core; they differ only in their flasher lights.
 * Phase 3 drew a procedural octahedron in their place.
 *
 * The model comes from the shared `buoy.glb`. As with the station, this scene
 * clones the model and owns only the clone's materials; geometries and textures
 * stay with the asset cache.
 *
 * The flashers are Oolite `flasher` subentities, resolved at build time into
 * the GLB scene's `extras` (`tools/oolite-ingest/convert/glb.ts`). Each is an
 * additive billboard whose brightness follows `OOFlasherEntity.m`:
 *
 *   wave = sin(2 * frequency * pi * (time + phase))
 *
 * mapped so the light rests at `brightFraction` and swings to 1 and to 0. A
 * flasher with several colours steps to the next one at the bottom of each
 * wave. Oolite keeps a running state for that step; here it is computed from
 * the time alone, so a paused, reloaded or replayed scene shows the same light.
 *
 * The buoy tumbles as Oolite's does (`performBuoyTumble`: roll 0.10 and pitch
 * 0.15 radians per second). Oolite integrates the two rates step by step; this
 * applies them as two fixed-axis angles of the elapsed time, which looks the
 * same and needs no state.
 *
 * Time is the flight clock, which does not advance while docked or paused, so
 * a quiet scene has nothing to redraw (`src/app/redraw-gate.ts`).
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { isMesh, meshMaterials } from "../mesh.js";
import {
  applyAuthoredEmissive,
  cloneMaterials,
  disposeClonedMaterials,
} from "./station.js";

/** The shipdata keys the build files the two light sets under. */
export type BuoyRole = "buoy" | "buoy-witchpoint";

/** Oolite's `performBuoyTumble` rates, radians per second. */
export const BUOY_ROLL_RATE = 0.1;
export const BUOY_PITCH_RATE = 0.15;

/** One flasher as the build wrote it (see `FlasherLight` in the ingest tool). */
export interface FlasherLight {
  readonly position: readonly [number, number, number];
  readonly size: number;
  readonly frequency: number;
  readonly phase: number;
  readonly brightFraction: number;
  readonly colors: readonly (readonly [number, number, number])[];
}

export interface BuoyBody {
  readonly root: THREE.Group;
  /** The number of flasher lights, for the tests. */
  readonly lightCount: number;
  update(elapsedSeconds: number): void;
  dispose(): void;
}

const NODE_NAMES = ["hull", "core"] as const;
const BLOB_SIZE = 32;

/**
 * Oolite's flasher brightness for one moment (`OOFlasherEntity.m` `update:`).
 *
 * A zero frequency is a steady light at full brightness.
 */
export function flasherBrightness(
  light: Pick<FlasherLight, "frequency" | "phase" | "brightFraction">,
  elapsedSeconds: number,
): number {
  if (light.frequency === 0) return 1;
  const wave = Math.sin(
    2 * light.frequency * Math.PI * (elapsedSeconds + light.phase),
  );
  const fraction = light.brightFraction;
  const threshold = Math.cos(fraction * Math.PI);
  if (wave > threshold) {
    return fraction + ((1 - fraction) / (1 - threshold)) * (wave - threshold);
  }
  if (wave < threshold) {
    return fraction + (fraction / (threshold + 1)) * (wave - threshold);
  }
  return fraction;
}

/**
 * Which colour of the cycle a flasher shows.
 *
 * Oolite steps to the next colour when the wave turns upward below zero, that
 * is at its minimum: once per period, at three quarters of the way through.
 */
export function flasherColourIndex(
  light: Pick<FlasherLight, "frequency" | "phase">,
  elapsedSeconds: number,
  count: number,
): number {
  if (count <= 1 || light.frequency === 0) return 0;
  // The wave's argument in half-turns; one period is 2, the minimum is at 1.5.
  const halfTurns = 2 * light.frequency * (elapsedSeconds + light.phase);
  const periods = Math.floor((halfTurns + 0.5) / 2);
  return ((periods % count) + count) % count;
}

function isTriple(value: unknown): value is readonly [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Read one role's flashers from the GLB scene `extras`.
 *
 * @throws {Error} when the list is missing or malformed: a buoy with no lights
 *   would be a silent asset change, like a station with no dock node.
 */
export function readFlashers(gltf: GLTF, role: BuoyRole): FlasherLight[] {
  const extras = (
    gltf.scene.userData as {
      oolite?: { flashers?: Record<string, unknown> };
    }
  ).oolite;
  const list = extras?.flashers?.[role];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(
      `Wegolite: the buoy model carries no flasher lights for "${role}".`,
    );
  }
  return (list as unknown[]).map((item, index) => {
    const record = (item ?? {}) as Record<string, unknown>;
    const { position, size, frequency, phase, brightFraction, colors } = record;
    if (
      !isTriple(position) ||
      !isFiniteNumber(size) ||
      size <= 0 ||
      !isFiniteNumber(frequency) ||
      !isFiniteNumber(phase) ||
      !isFiniteNumber(brightFraction) ||
      brightFraction <= 0 ||
      brightFraction >= 1 ||
      !Array.isArray(colors) ||
      colors.length === 0 ||
      !colors.every(isTriple)
    ) {
      throw new Error(
        `Wegolite: flasher ${String(index)} of "${role}" in the buoy model is malformed.`,
      );
    }
    return {
      position,
      size,
      frequency,
      phase,
      brightFraction,
      colors,
    };
  });
}

/** A soft round blob, standing in for Oolite's `oolite-particle-blur.png`. */
function createBlobTexture(): THREE.DataTexture {
  const data = new Uint8Array(BLOB_SIZE * BLOB_SIZE * 4);
  const centre = (BLOB_SIZE - 1) / 2;
  for (let y = 0; y < BLOB_SIZE; y += 1) {
    for (let x = 0; x < BLOB_SIZE; x += 1) {
      const distance = Math.hypot(x - centre, y - centre) / centre;
      const falloff = Math.max(0, 1 - distance);
      const value = Math.round(255 * falloff * falloff);
      const offset = (y * BLOB_SIZE + x) * 4;
      data[offset] = value;
      data[offset + 1] = value;
      data[offset + 2] = value;
      data[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, BLOB_SIZE, BLOB_SIZE);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Build one buoy from the shared model.
 *
 * @throws {Error} when the model lacks its `hull` or `core` node or the lights
 *   for `role`.
 */
export function createBuoy(gltf: GLTF, role: BuoyRole): BuoyBody {
  const root = new THREE.Group();
  const lights = readFlashers(gltf, role);

  const model = gltf.scene.clone(true);
  for (const name of NODE_NAMES) {
    if (model.getObjectByName(name) === undefined) {
      throw new Error(
        `Wegolite: the buoy model is missing its "${name}" node.`,
      );
    }
  }
  cloneMaterials(model);
  model.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of meshMaterials(object)) {
      if (material instanceof THREE.MeshStandardMaterial) {
        applyAuthoredEmissive(material);
      }
    }
  });

  // The lights ride on the tumbling body, as Oolite's subentities do.
  const body = new THREE.Group();
  body.name = "buoy-body";
  body.add(model);

  const blob = createBlobTexture();
  const sprites: THREE.Sprite[] = [];
  for (const [index, light] of lights.entries()) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: blob,
        color: 0x000000,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
        transparent: true,
        toneMapped: false,
      }),
    );
    sprite.name = `buoy-light-${String(index)}`;
    sprite.position.set(
      light.position[0],
      light.position[1],
      light.position[2],
    );
    // Oolite's quad runs from -size to +size on each axis.
    sprite.scale.set(light.size * 2, light.size * 2, 1);
    sprites.push(sprite);
    body.add(sprite);
  }
  root.add(body);

  const roll = new THREE.Quaternion();
  const pitch = new THREE.Quaternion();
  const FORWARD = new THREE.Vector3(0, 0, 1);
  const RIGHT = new THREE.Vector3(1, 0, 0);

  function update(elapsedSeconds: number): void {
    const time = Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0;
    roll.setFromAxisAngle(FORWARD, time * BUOY_ROLL_RATE);
    pitch.setFromAxisAngle(RIGHT, time * BUOY_PITCH_RATE);
    body.quaternion.copy(roll).multiply(pitch);

    for (const [index, light] of lights.entries()) {
      const sprite = sprites[index];
      if (sprite === undefined) continue;
      const colour =
        light.colors[flasherColourIndex(light, time, light.colors.length)];
      if (colour === undefined) continue;
      const brightness = Math.min(
        Math.max(flasherBrightness(light, time), 0),
        1,
      );
      // Additive blending: the colour scaled by brightness is the light added.
      sprite.material.color.setRGB(
        colour[0] * brightness,
        colour[1] * brightness,
        colour[2] * brightness,
        THREE.SRGBColorSpace,
      );
    }
  }

  update(0);

  return {
    root,
    lightCount: lights.length,
    update,
    dispose(): void {
      disposeClonedMaterials(model);
      for (const sprite of sprites) sprite.material.dispose();
      blob.dispose();
      root.clear();
    },
  };
}

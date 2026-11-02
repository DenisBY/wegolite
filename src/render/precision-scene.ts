// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

import * as THREE from "three";
import type { Point3 } from "./camera-relative.js";

/** Roughly 100 km: the near proof object. */
export const NEAR_M = 1e5;

/** 1.4e6 m: beyond the comfortable float32 range, the far proof object. */
export const FAR_M = 1.4e6;

/** Radius of the starfield shell. Inside the camera's 2.5e6 m far plane. */
const STARFIELD_RADIUS_M = 1.5e6;

/** Golden angle, so the spiral is deterministic and never calls Math.random(). */
const GOLDEN_ANGLE_RAD = Math.PI * (3 - Math.sqrt(5));

export const NEAR_WORLD: Point3 = { x: 0, y: 0, z: -NEAR_M };
export const FAR_WORLD: Point3 = { x: 0, y: 0, z: -FAR_M };

/**
 * A deterministic golden-angle spiral of unit-sphere directions scaled to a
 * fixed shell radius. No randomness: Math.random is banned and a deterministic
 * scene keeps the e2e assertions repeatable.
 *
 * Screen-space point size is deliberate. With `sizeAttenuation: true`, a
 * world-unit size at a 1.5e6 m radius projects to well under one pixel and the
 * starfield would be invisible; 2 px points make it a starfield a human can
 * actually see, and cost the precision assertions nothing.
 */
export function createStarfield(count = 1200): THREE.Points {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    // Evenly spaced latitudes on the unit sphere, one point per longitude step.
    const y = 1 - (2 * (i + 0.5)) / count;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = i * GOLDEN_ANGLE_RAD;
    const offset = i * 3;

    positions[offset] = Math.cos(theta) * ring * STARFIELD_RADIUS_M;
    positions[offset + 1] = y * STARFIELD_RADIUS_M;
    positions[offset + 2] = Math.sin(theta) * ring * STARFIELD_RADIUS_M;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    size: 2,
    sizeAttenuation: false,
    color: 0xffffff,
    depthWrite: false,
  });

  const starfield = new THREE.Points(geometry, material);
  starfield.name = "starfield";
  return starfield;
}

/**
 * The far marker is deliberately small (D-07). At 1.4e6 m one pixel spans
 * roughly 2,245 m at the fixed 1280x720 viewport — about 0.2 px of shape for a
 * 400 m cube — so it is sub-pixel by design. The human stability check looks at
 * the 500 m near box and the starfield, never at this cube; the marker's own
 * evidence is numeric (`farRelZ`, `farUlp`). The same observable is named in
 * `01-VALIDATION.md` Manual-Only row 3: do not enlarge this geometry to make the
 * marker visible instead.
 */
export function createFarMarker(): THREE.Mesh {
  const farMarker = new THREE.Mesh(
    new THREE.BoxGeometry(400, 400, 400),
    new THREE.MeshBasicMaterial({ color: 0xff3355, wireframe: true }),
  );
  farMarker.name = "far-marker";
  return farMarker;
}

export interface PrecisionScene {
  scene: THREE.Scene;
  nearBox: THREE.Mesh;
  farMarker: THREE.Mesh;
  starfield: THREE.Points;
}

/**
 * Placeholder geometry only (D-07): a starfield, a ~500 m box at ~100 km and a
 * small wireframe cube at 1.4e6 m. Positions are WORLD positions; `src/main.ts`
 * converts them through `cameraRelative` — this module never writes
 * `Object3D.position`.
 *
 * No ShaderMaterial: a custom shader would have to include the logarithmic
 * depth chunks by hand.
 */
export function createPrecisionScene(): PrecisionScene {
  const scene = new THREE.Scene();

  // The near box uses MeshStandardMaterial, which renders black without a
  // light — an unlit box on a black background is an invisible deliverable.
  scene.add(new THREE.AmbientLight(0xffffff, 1));

  const nearBox = new THREE.Mesh(
    new THREE.BoxGeometry(500, 500, 500),
    new THREE.MeshStandardMaterial({ color: 0x22ff88 }),
  );
  nearBox.name = "near-box";

  const farMarker = createFarMarker();
  const starfield = createStarfield();

  scene.add(nearBox, farMarker, starfield);

  return { scene, nearBox, farMarker, starfield };
}

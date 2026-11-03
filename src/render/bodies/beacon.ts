// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The nav buoy and witchpoint markers (D-04, WORLD-03).
 *
 * No Oolite buoy model is vendored, so the marker is procedural: a small
 * emissive octahedron for near viewing plus a single camera-facing point that
 * stays visible at scanner range. No new GLB, no new texture, no new asset
 * provenance obligation.
 *
 * The scene owns placement and naming (`navBuoy`, `witchpoint`); this factory
 * only builds the geometry and returns a plain `Group` at the origin.
 */

import * as THREE from "three";
import { clamp } from "../../sim/math.js";

/** Marker size range in metres; the layout radius is 10 m for both beacons. */
const MIN_MARKER_RADIUS = 8;
const MAX_MARKER_RADIUS = 20;

const MARKER_COLOR = 0x66ffcc;
const DOT_COLOR = 0xccffee;

/**
 * Build one beacon marker of the given collision radius.
 *
 * @param radius The layout radius in metres (10 for the nav buoy and the
 * witchpoint). Clamped into the visible 8-20 m band.
 */
export function createBeacon(radius: number): THREE.Group {
  const group = new THREE.Group();
  const size = clamp(radius, MIN_MARKER_RADIUS, MAX_MARKER_RADIUS);

  const marker = new THREE.Mesh(
    new THREE.OctahedronGeometry(size, 0),
    new THREE.MeshBasicMaterial({ color: MARKER_COLOR, toneMapped: false }),
  );
  marker.name = "beacon-marker";

  const dotGeometry = new THREE.BufferGeometry();
  dotGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([0, 0, 0]), 3),
  );
  const dot = new THREE.Points(
    dotGeometry,
    new THREE.PointsMaterial({
      color: DOT_COLOR,
      size: 3,
      sizeAttenuation: false,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    }),
  );
  dot.name = "beacon-dot";

  group.add(marker, dot);
  return group;
}

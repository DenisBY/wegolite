// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * A main station (WORLD-02, Pitfall 2, Fidelity correction 3; per-system
 * models: Phase 22.1, WORLD-20).
 *
 * Each station kind's GLB separates its coplanar layers into named nodes and
 * already carries the dock translation (the Coriolis dock at local `-500.2561`);
 * re-adding either would double the offset. The node list and the layer of each
 * node are data in the station record (`stationRecord(kind).nodes`), never
 * inferred from a name. This module assembles the clone without touching a node
 * transform:
 *
 * - the `body` node is pushed back with `polygonOffset` 1/1 and drawn first;
 *   the `detail` nodes get the next `renderOrder`s in record order and the
 *   `dock` node the one after, so the dock opening does not zipper at 500 m or
 *   at 100 km and a detail layer is drawn over the plain body;
 * - every opaque node keeps `depthWrite: true` and the dock keeps
 *   `depthTest: true` (never `depthTest: false` on the one node that must be
 *   visible through the slot);
 * - the baked textures are never modified; the only material tuning is the
 *   authored per-channel emissive read from the GLB extras (see
 *   `applyAuthoredEmissive`), which replaces the flat `emissiveIntensity 0.8`.
 *
 * **Late model.** A body built before its kind's GLB has loaded is meshless: it
 * has the pose and the roll and an empty dock node, and `attachModel` adds the
 * model exactly once when the load resolves (never another kind's model).
 *
 * Station flashers (Oolite draws 14 per station) are not drawn for any kind:
 * owner decision D-C of 2026-11-27, todo `2026-11-27-station-flashers`.
 *
 * Orientation: `layout.stationBaseQuat` maps the model's local -Z (the dock)
 * onto `stationToPlanet`, then `update(stationAngle)` rolls about local +Z.
 * `Object3D.lookAt()` is deliberately absent — it aims local +Z at the target
 * and would put the dock on the far side of the station.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import { stationRecord } from "../../content/stations.js";
import type { StationKind, StationNode } from "../../content/stations.js";
import { axisAngle, mul } from "../../sim/math.js";
import type { Quat } from "../../sim/math.js";
import type { SystemLayout } from "../../sim/world/layout.js";
import { isMesh, meshMaterials } from "../mesh.js";

/**
 * The render order of every node of one kind, from the layers in its record:
 * the body first, the detail nodes next in record order, the dock last.
 */
function renderOrderOf(
  nodes: readonly StationNode[],
): ReadonlyMap<string, number> {
  const order = new Map<string, number>();
  for (const layer of ["body", "detail", "dock"] as const) {
    for (const node of nodes) {
      if (node.layer === layer) order.set(node.name, order.size);
    }
  }
  return order;
}

/**
 * The GLB authoring contract for a Coriolis material.
 *
 * `emissionModulateColorNormalized` is the authored per-channel bloom factor:
 * hull/faceplate/tris carry `(26.474, 26.592, 12.866)` and the dock carries
 * `(0.952, 0.963, 0.882)` (`coriolis.glb` material extras, from
 * `shipdata.plist`'s `emission_modulate_color`). It crosses from a compiled
 * asset into shader uniforms, so it is validated before use (T-3-32): finite,
 * at least three components, a positive peak, each component clamped.
 */
const MAX_EMISSIVE_COMPONENT = 64;

interface OoliteMaterialExtras {
  readonly emissionModulateColorNormalized?: unknown;
}

/** The GPU-facing station: the root, the dock node and the roll step. */
export interface StationBody {
  readonly root: THREE.Group;
  /**
   * The dock node: the model's own once a model is attached, until then an empty
   * `THREE.Object3D` named `dock` at local (0, 0, -`layout.dockOffset`).
   */
  readonly dock: THREE.Object3D;
  /**
   * The kind whose GLB is attached to the body, `undefined` while it is
   * meshless. The render publishes what it draws through this.
   */
  readonly modelKind: StationKind | undefined;
  /**
   * Attach the model of this body's kind. Adds it exactly once; a second call
   * and a call after `dispose()` do nothing (nothing is cloned, no material is
   * allocated).
   * @throws when the GLB lacks a node of the kind's record.
   */
  attachModel(gltf: GLTF): void;
  update(stationAngle: number): void;
  dispose(): void;
}

/** Clone every material so this scene owns what it disposes. */
export function cloneMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
  });
}

/** Dispose only the cloned materials; geometries and textures stay cached. */
export function disposeClonedMaterials(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!isMesh(object)) return;
    for (const material of meshMaterials(object)) material.dispose();
  });
}

/** Clamp one authored component so a corrupted asset cannot reach Infinity. */
function clampEmissiveComponent(value: number): number {
  if (value <= 0) return 0;
  if (value >= MAX_EMISSIVE_COMPONENT) return MAX_EMISSIVE_COMPONENT;
  return value;
}

/**
 * The neutral emissive used when the GLB carries no usable triple.
 *
 * GLTFLoader gives every material `emissiveFactor (1, 1, 1)`, so intensity 1
 * leaves the baked emissive map at its authored-albedo level rather than
 * vanishing or turning the station into a white blob.
 */
function applyNeutralEmissive(material: THREE.MeshStandardMaterial): void {
  material.emissiveIntensity = 1;
}

/**
 * Apply a material's authored per-channel emissive exactly.
 *
 * Normalising by the peak keeps the product exact: `emissive.r *
 * emissiveIntensity` equals the authored red component for every channel, while
 * Three's `Color` stays in `[0, 1]` and the intensity carries the bloom gain
 * (26.59 for the hull layers, 0.963 for the dock, so the dock does not bloom).
 * The read happens after `cloneMaterials`: `Material.clone()` deep-copies
 * `userData`, and GLTFLoader copies the GLB `extras` object straight onto
 * `material.userData`, so production and the test fixture take one path.
 */
export function applyAuthoredEmissive(
  material: THREE.MeshStandardMaterial,
): void {
  const extras = (material.userData as { oolite?: OoliteMaterialExtras })
    .oolite;
  const triple = extras?.emissionModulateColorNormalized;
  if (!Array.isArray(triple)) {
    applyNeutralEmissive(material);
    return;
  }

  const [redValue, greenValue, blueValue] = triple as readonly unknown[];
  if (
    typeof redValue !== "number" ||
    !Number.isFinite(redValue) ||
    typeof greenValue !== "number" ||
    !Number.isFinite(greenValue) ||
    typeof blueValue !== "number" ||
    !Number.isFinite(blueValue)
  ) {
    // A NaN component would poison the whole material; treat it as absent.
    applyNeutralEmissive(material);
    return;
  }

  const red = clampEmissiveComponent(redValue);
  const green = clampEmissiveComponent(greenValue);
  const blue = clampEmissiveComponent(blueValue);
  const peak = Math.max(red, green, blue);
  if (peak <= 0) {
    applyNeutralEmissive(material);
    return;
  }

  material.emissive.setRGB(red / peak, green / peak, blue / peak);
  material.emissiveIntensity = peak;
}

function requireNode(
  model: THREE.Object3D,
  kind: StationKind,
  name: string,
): THREE.Object3D {
  const node = model.getObjectByName(name);
  if (node === undefined) {
    throw new Error(
      `Wegolite: the ${kind} station model is missing its "${name}" node; the dock contract cannot be honoured.`,
    );
  }
  return node;
}

/** One kind's cloned model with its render settings applied, and its dock. */
function assembleModel(
  kind: StationKind,
  gltf: GLTF,
): { readonly model: THREE.Object3D; readonly dock: THREE.Object3D } {
  const { nodes } = stationRecord(kind);
  const model = gltf.scene.clone(true);

  // Fail loudly on a silent asset change rather than moving the dock.
  for (const node of nodes) requireNode(model, kind, node.name);
  const dockNode = nodes.find((node) => node.layer === "dock");
  if (dockNode === undefined) {
    throw new Error(`Wegolite: the ${kind} station record has no dock node.`);
  }
  const dock = requireNode(model, kind, dockNode.name);

  const orders = renderOrderOf(nodes);
  const layers = new Map(nodes.map((node) => [node.name, node.layer]));

  // Clone first: every material tweak below must land on this scene's copy, not
  // on the cached GLB the menu scene still uses.
  cloneMaterials(model);

  model.traverse((object) => {
    if (!isMesh(object)) return;
    const order = orders.get(object.name);
    if (order !== undefined) object.renderOrder = order;
    const layer = layers.get(object.name);

    for (const material of meshMaterials(object)) {
      material.depthWrite = true;
      if (layer === "dock") material.depthTest = true;
      // Push the body back a hair; the dock sits only 0.2561 m outside it.
      if (layer === "body") {
        material.polygonOffset = true;
        material.polygonOffsetFactor = 1;
        material.polygonOffsetUnits = 1;
      }
      if (material instanceof THREE.MeshStandardMaterial) {
        applyAuthoredEmissive(material);
      }
    }
  });

  return { model, dock };
}

/**
 * Build a station body for the kind of `layout`. Without a `gltf` the body is
 * meshless (see `StationBody.attachModel`).
 */
export function createStation(layout: SystemLayout, gltf?: GLTF): StationBody {
  const kind = layout.stationKind;
  const root = new THREE.Group();
  root.name = "station";

  const base: Quat = layout.stationBaseQuat;
  root.quaternion.set(base.x, base.y, base.z, base.w);

  let dock: THREE.Object3D | undefined;
  let modelKind: StationKind | undefined;
  let disposed = false;

  // The empty stand-in for the model's dock, until the model replaces it.
  const placeholder = new THREE.Object3D();
  placeholder.name = "dock";
  placeholder.position.set(0, 0, -layout.dockOffset);

  function attachModel(next: GLTF): void {
    if (disposed || modelKind !== undefined) return;
    const assembled = assembleModel(kind, next);
    root.remove(placeholder);
    root.add(assembled.model);
    dock = assembled.dock;
    modelKind = kind;
  }

  if (gltf === undefined) root.add(placeholder);
  else attachModel(gltf);

  return {
    root,
    get dock(): THREE.Object3D {
      return dock ?? placeholder;
    },
    get modelKind(): StationKind | undefined {
      return modelKind;
    },
    attachModel,
    update(stationAngle: number): void {
      const rolled = mul(
        layout.stationBaseQuat,
        axisAngle(0, 0, 1, stationAngle),
      );
      root.quaternion.set(rolled.x, rolled.y, rolled.z, rolled.w);
    },
    dispose(): void {
      disposed = true;
      disposeClonedMaterials(root);
    },
  };
}

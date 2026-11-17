// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The debris a kill leaves, drawn (Phase 16, plan 16-08; WORLD-17, debris
 * half of success criterion 3).
 *
 * The layer follows the NPC layer's pattern (`npc-ships.ts`): one
 * `InstancedMesh` per (model, primitive), built the first time a contact of a
 * key has a loaded model, so however many pods, plates and wrecks exist the
 * layer adds at most one draw call per primitive of the debris models present.
 * The meshes **share the cached geometry and material** of the loaded model:
 * never cloned and never disposed here; `dispose()` frees only the instance
 * buffers (asset-cache ownership rule, `src/render/asset-cache.ts`).
 *
 * Camera-relative in float64 before the float32 matrix write, no frustum
 * culling (an InstancedMesh culls with its one source geometry's bounding
 * sphere), `DynamicDrawUsage`, a fixed capacity equal to the sim's entity cap.
 *
 * Each piece is scaled by its contact's radius over its model's radius: a pod
 * or a plate is drawn at 1, a wreck at the size the kill gave it (the wreck
 * scale of `releaseDebris`). A ratio that is not finite and positive skips the
 * piece, and a key with no model info is not drawn.
 *
 * Each piece tumbles (D-03 as reworded by D16-10, OC-2): `tumbleOrientation`
 * turns the contact's orientation at a constant body rate taken from the
 * model's Oolite tumble rates and the orientation itself, so the tumble is a
 * pure render function of data the contact already carries, never of an id.
 *
 * The layer is index-addressed: contacts are id-free snapshots rebuilt each
 * frame (`debrisContacts`, `src/sim/world/contacts.ts`), instance `i` is the
 * i-th contact of its key, and nothing here holds an entity id. The system
 * scene owns and disposes the layer, so a jump (a new scene) clears it.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { Quat, Vec3 } from "../../sim/math.js";
import type { DebrisContact } from "../../sim/world/contacts.js";
import { isMesh } from "../mesh.js";

/**
 * Instances allocated per primitive. Equals the sim's entity cap
 * (`MAX_ENTITIES`); the render layer may not import the id module, so
 * tests/render/debris-layer.test.ts pins the two equal. Contacts beyond it are
 * dropped in order.
 */
export const DEBRIS_INSTANCE_CAPACITY = 256;

/**
 * What the layer needs of a compiled debris record: the model's own radius
 * (the scale's denominator) and Oolite's tumble rates. Structurally a subset of
 * `DebrisRecord`, so the session hands the catalogue over as it is.
 */
export interface DebrisModelInfo {
  readonly key: string;
  readonly radius: number;
  readonly maxFlightRoll: number;
  readonly maxFlightPitch: number;
}

/** The debris layer of one system scene. */
export interface DebrisLayer {
  readonly root: THREE.Group;
  /**
   * Place every contact whose model is loaded and described. `models` maps a
   * debris key to its loaded GLB; `info` is the compiled debris catalogue;
   * `flightTime` drives the render-side tumble.
   */
  update(
    contacts: readonly DebrisContact[],
    cameraWorld: Vec3,
    models: ReadonlyMap<string, GLTF>,
    info: readonly DebrisModelInfo[],
    flightTime: number,
  ): void;
  /** Free the instance buffers; never the shared geometry or material. */
  dispose(): void;
}

/** A quaternion the tumble writes into: reused per contact in the layer. */
interface MutableQuat {
  w: number;
  x: number;
  y: number;
  z: number;
}

/**
 * Write the tumbled `orientation` into `out` (see `tumbleOrientation`); the
 * layer's allocation-free form.
 */
function tumbleInto(
  orientation: Quat,
  info: DebrisModelInfo,
  flightTime: number,
  out: MutableQuat,
): void {
  const { w, x, y, z } = orientation;
  // The constant body rate in the piece's own axes: pitch about local x, no
  // yaw, roll about the local z nose axis.
  const pitch = info.maxFlightPitch * y;
  const roll = info.maxFlightRoll * x;
  const rate = Math.hypot(pitch, roll);
  const angle = rate * flightTime;
  if (!Number.isFinite(angle) || angle === 0) {
    out.w = w;
    out.x = x;
    out.y = y;
    out.z = z;
    return;
  }
  // The delta rotation (cos(a/2), axis sin(a/2)) with axis = (pitch, 0, roll) / rate.
  const half = angle / 2;
  const s = Math.sin(half) / rate;
  const dw = Math.cos(half);
  const dx = pitch * s;
  const dz = roll * s;
  // The Hamilton product orientation x delta: the turn is in the body frame.
  const rw = w * dw - x * dx - z * dz;
  const rx = w * dx + x * dw + y * dz;
  const ry = y * dw - x * dz + z * dx;
  const rz = w * dz - y * dx + z * dw;
  const length = Math.hypot(rw, rx, ry, rz);
  if (!Number.isFinite(length) || length === 0) {
    out.w = w;
    out.x = x;
    out.y = y;
    out.z = z;
    return;
  }
  out.w = rw / length;
  out.x = rx / length;
  out.y = ry / length;
  out.z = rz / length;
}

/**
 * A debris piece's drawn orientation at `flightTime` (D-03, D16-10, OC-2).
 *
 * Oolite tumbles a released piece with constant body rates drawn uniformly in
 * `[-max_flight_roll, max_flight_roll]` and `[-max_flight_pitch,
 * max_flight_pitch]` (`performTumble`, `ShipEntityAI.m:473-479`, behaviour
 * `BEHAVIOUR_TUMBLE`). Here the draw is replaced by the contact's own
 * orientation, whose components lie in `[-1, 1]`: the body rate is
 * `w = (maxFlightPitch x q.y, 0, maxFlightRoll x q.x)` and the result is
 * `q x axisAngle(w / |w|, |w| x flightTime)`, normalised. Derived from the
 * orientation and not from the entity id, because no id may leave `src/sim`
 * (OC-2): two pieces with different orientations tumble differently, the same
 * piece tumbles the same way every run. A zero or non-finite rate or time
 * returns the orientation unchanged. Pure: it reads no sim state and returns a
 * new quaternion (the layer uses the allocation-free `tumbleInto`).
 */
export function tumbleOrientation(
  orientation: Quat,
  info: DebrisModelInfo,
  flightTime: number,
): Quat {
  const out: MutableQuat = { w: 1, x: 0, y: 0, z: 0 };
  tumbleInto(orientation, info, flightTime, out);
  return out;
}

/** One primitive of a model: its instanced mesh and its matrix in the model. */
interface Primitive {
  readonly mesh: THREE.InstancedMesh;
  readonly local: THREE.Matrix4;
}

/** A primitive's matrix relative to the model root (the root's own is excluded). */
function matrixInModel(mesh: THREE.Mesh, root: THREE.Object3D): THREE.Matrix4 {
  mesh.updateMatrix();
  const local = new THREE.Matrix4().copy(mesh.matrix);
  let parent = mesh.parent;
  while (parent !== null && parent !== root) {
    parent.updateMatrix();
    local.premultiply(parent.matrix);
    parent = parent.parent;
  }
  return local;
}

/** The record of `key`, by a linear scan of the short list (no allocation). */
function infoFor(
  info: readonly DebrisModelInfo[],
  key: string,
): DebrisModelInfo | undefined {
  for (const record of info) {
    if (record.key === key) return record;
  }
  return undefined;
}

export function createDebrisLayer(): DebrisLayer {
  const root = new THREE.Group();
  root.name = "debris";
  const byKey = new Map<string, readonly Primitive[]>();
  let disposed = false;

  // Reused for every instance: no allocation per piece.
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const tumbled: MutableQuat = { w: 1, x: 0, y: 0, z: 0 };
  const instance = new THREE.Matrix4();
  const composed = new THREE.Matrix4();

  function build(model: GLTF): readonly Primitive[] {
    const primitives: Primitive[] = [];
    model.scene.traverse((object) => {
      if (!isMesh(object)) return;
      // The geometry and material are the cache's: shared, never cloned.
      const mesh = new THREE.InstancedMesh(
        object.geometry,
        object.material,
        DEBRIS_INSTANCE_CAPACITY,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      mesh.visible = false;
      root.add(mesh);
      primitives.push({ mesh, local: matrixInModel(object, model.scene) });
    });
    return primitives;
  }

  return {
    root,
    update(contacts, cameraWorld, models, info, flightTime): void {
      if (disposed) return;
      // Build a key's meshes the first time a contact of it has a loaded,
      // described model.
      for (const contact of contacts) {
        if (byKey.has(contact.specKey)) continue;
        if (infoFor(info, contact.specKey) === undefined) continue;
        const model = models.get(contact.specKey);
        if (model !== undefined) byKey.set(contact.specKey, build(model));
      }
      for (const [key, primitives] of byKey) {
        const record = infoFor(info, key);
        let count = 0;
        if (record !== undefined) {
          for (const contact of contacts) {
            if (contact.specKey !== key) continue;
            if (count >= DEBRIS_INSTANCE_CAPACITY) break;
            const ratio = contact.radius / record.radius;
            if (!Number.isFinite(ratio) || ratio <= 0) continue;
            // The float64 subtraction happens here, before any float32 write.
            position.set(
              contact.position.x - cameraWorld.x,
              contact.position.y - cameraWorld.y,
              contact.position.z - cameraWorld.z,
            );
            // D16-10: the render-side tumble, from the orientation and time.
            tumbleInto(contact.orientation, record, flightTime, tumbled);
            rotation.set(tumbled.x, tumbled.y, tumbled.z, tumbled.w);
            scale.set(ratio, ratio, ratio);
            instance.compose(position, rotation, scale);
            for (const primitive of primitives) {
              composed.multiplyMatrices(instance, primitive.local);
              primitive.mesh.setMatrixAt(count, composed);
            }
            count += 1;
          }
        }
        for (const { mesh } of primitives) {
          mesh.count = count;
          mesh.visible = count > 0;
          mesh.instanceMatrix.needsUpdate = true;
        }
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      for (const primitives of byKey.values()) {
        for (const { mesh } of primitives) {
          root.remove(mesh);
          mesh.dispose();
        }
      }
      byKey.clear();
    },
  };
}

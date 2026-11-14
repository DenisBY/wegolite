// SPDX-License-Identifier: GPL-2.0-or-later
// Copyright (c) 2026 Wegolite contributors

/**
 * The inert NPC ships, drawn (Phase 12, plan 12-11; WORLD-15, drawing half).
 *
 * One `InstancedMesh` per (model, primitive): every ship of a type is one
 * instance of the type's meshes, so a populated scene adds at most one draw
 * call per primitive of the nine types (13 in all) however many ships there
 * are (Pitfall 12). The meshes **share the cached geometry and material** of the
 * model the asset cache loaded: they are never cloned here and never disposed
 * here. Only the instance buffers belong to this layer, and `dispose()` frees
 * only those (asset-cache ownership rule, `src/render/asset-cache.ts`).
 *
 * Camera-relative like every body (`sync.ts`): each instance's translation is
 * `cameraRelative(position, cameraWorld)` in float64, subtracted before the
 * float32 matrix write, so a ship far from the origin keeps its precision.
 *
 * There is no frustum culling: an InstancedMesh culls with
 * the bounding sphere of its one source geometry, which would hide every
 * instance whenever the origin instance is off screen. A present type therefore
 * always costs its calls, so the draw-call budget assertion of plan 12-12 is a
 * stable upper bound.
 *
 * The layer is index-addressed: contacts are id-free snapshots rebuilt each
 * frame (`src/sim/world/contacts.ts`), instance `i` is the i-th contact of its
 * key, and nothing here holds an entity id. The system scene owns and disposes
 * the layer, so a jump (a new scene) clears it by construction.
 */

import * as THREE from "three";
import type { GLTF } from "three/addons/loaders/GLTFLoader.js";
import type { Vec3 } from "../../sim/math.js";
import type { NpcContact } from "../../sim/world/contacts.js";
import { isMesh } from "../mesh.js";

/**
 * Instances allocated per primitive. Equals the sim's entity cap
 * (`MAX_ENTITIES`); the render layer may not import the id module, so
 * tests/render/npc-ships.test.ts pins the two equal. Contacts beyond it are
 * dropped in order.
 */
export const NPC_INSTANCE_CAPACITY = 256;

/** The NPC layer of one system scene. */
export interface NpcLayer {
  readonly root: THREE.Group;
  /**
   * Place every contact whose model is loaded. `models` maps a ship key to its
   * loaded GLB; a key with no model is not drawn (the scanner still shows it).
   */
  update(
    contacts: readonly NpcContact[],
    cameraWorld: Vec3,
    models: ReadonlyMap<string, GLTF>,
  ): void;
  /** Free the instance buffers; never the shared geometry or material. */
  dispose(): void;
}

/** One primitive of a model: its instanced mesh and its matrix in the model. */
interface Primitive {
  readonly mesh: THREE.InstancedMesh;
  readonly local: THREE.Matrix4;
}

const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

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

export function createNpcLayer(): NpcLayer {
  const root = new THREE.Group();
  root.name = "npcs";
  const byKey = new Map<string, readonly Primitive[]>();
  let disposed = false;

  // Reused for every instance: no allocation per ship.
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
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
        NPC_INSTANCE_CAPACITY,
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
    update(contacts, cameraWorld, models): void {
      if (disposed) return;
      // Build a key's meshes the first time a contact of it has a loaded model.
      for (const contact of contacts) {
        if (byKey.has(contact.specKey)) continue;
        const model = models.get(contact.specKey);
        if (model !== undefined) byKey.set(contact.specKey, build(model));
      }
      for (const [key, primitives] of byKey) {
        let count = 0;
        for (const contact of contacts) {
          if (contact.specKey !== key) continue;
          if (count >= NPC_INSTANCE_CAPACITY) break;
          // The float64 subtraction happens here, before any float32 write.
          position.set(
            contact.position.x - cameraWorld.x,
            contact.position.y - cameraWorld.y,
            contact.position.z - cameraWorld.z,
          );
          rotation.set(
            contact.orientation.x,
            contact.orientation.y,
            contact.orientation.z,
            contact.orientation.w,
          );
          instance.compose(position, rotation, UNIT_SCALE);
          for (const primitive of primitives) {
            composed.multiplyMatrices(instance, primitive.local);
            primitive.mesh.setMatrixAt(count, composed);
          }
          count += 1;
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

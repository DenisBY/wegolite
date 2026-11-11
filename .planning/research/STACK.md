# Stack Research: v2.0 Foundation & Combat (delta over v1)

**Domain:** Browser-based Oolite port, adding a multi-entity world, NPC AI, combat, collisions and sound
**Milestone:** v2.0 Foundation & Combat (subsequent milestone; v1 stack is validated and not re-researched)
**Researched:** 2026-11-11
**Overall confidence:** HIGH (the decisions rest on the Oolite source, the project's own constraints, npm registry versions, and one empirical decode test in the project's own Docker image)

## Verdict

**Add zero runtime dependencies. Add zero dev dependencies. Do not change the Docker image.**

Every new capability in v2.0 is covered by the existing stack plus platform APIs:

| New capability | Answer | New package |
|----------------|--------|-------------|
| Multi-entity world, stable ids, hash, save | Hand-rolled typed `EntityStore` in `src/sim/world/` | none |
| Collision broadphase | Hand-rolled sweep-and-prune over bounding spheres, plus sphere checks for planet and sun | none |
| Collision narrowphase (laser line, hull vs hull) | Port Oolite's `Octree.m` to TS; build octrees from the `.dat` meshes in `tools/oolite-ingest` | none |
| Sound and music | Raw Web Audio API in a new `src/audio/` module; `.ogg` shipped as-is | none |
| Lasers, explosions, sparks, flashes | `THREE.InstancedMesh` pools with stock `MeshBasicMaterial`, additive blending | none |
| Sim in a Web Worker | Not in v2.0; criteria and preconditions below | none |

The reasons matter more than the verdicts, because several of the rejected options look attractive. They are given per section.

## Recommended Stack

### Core Technologies (unchanged, with the integration each new feature needs)

| Technology | Version (in repo) | v2.0 role | Integration point |
|------------|-------------------|-----------|-------------------|
| TypeScript strict | 6.0.2 | All new sim, AI, audio code | `src/sim/**` stays under `tsconfig.sim.json` (`lib: ["ES2022"]`, `types: []`), so no DOM or Web Audio types leak into the sim |
| Three.js | 0.187.0 (npm latest, released 2026-10-30) | Effect pools, NPC ship meshes | Effects use `InstancedMesh`; `renderer.info.render.calls` stays the budget probe |
| zod | 4.6.7 (jitless) | Save schema v3 for the world; `sounds.json` and octree manifest validation | Same strict-schema, shared-semantic-validator pattern as the v2 save (Key Decisions: "Share one semantic save validator") |
| Vite | 8.3.5 | Serves `public/audio/*.ogg`; emits a module worker if the sim ever moves | No config change needed in v2.0 |
| Vitest + fast-check | 5.0.5 + 4.10.2 | Determinism goldens, broadphase-vs-brute-force property tests, octree-vs-mesh property tests | fast-check is already installed; use it for the new invariants (below) |
| Playwright | 1.64.1 | Audio unlock and effect-budget specs | Firefox suite (`e2e-cross`) is the only place the autoplay-suspended path is observable (see Audio) |

### New Modules (hand-written, no package)

| Module | Location | Purpose | Why hand-written |
|--------|----------|---------|------------------|
| `EntityStore` | `src/sim/world/entity-store.ts` | Generational-free monotonic ids, canonical iteration order, canonical text serialisation | See "Entity store" |
| `Broadphase` | `src/sim/world/broadphase.ts` | Sweep-and-prune pair generation, proximity-alert pairs | See "Collision" |
| `Octree` + builder | runtime: `src/sim/collision/octree.ts`; build: `tools/oolite-ingest/convert/octree.ts` | Laser-vs-hull line test, hull-vs-hull test | Faithfulness to `Octree.m` and `OOMeshToOctreeConverter.m` |
| `SoundEngine` | `src/audio/` (outside `src/sim`) | Context lifecycle, SFX voices, music streaming, volume | See "Audio" |
| `EffectPools` | `src/render/effects/` | Laser shots, explosion clouds, fragments, flashes | See "Effects" |

### Database

None. Saves stay in IndexedDB; the world snapshot is a new strict-schema section of the existing save (a `SAVE_VERSION` 3 with an ordered v2 to v3 migration).

### Infrastructure

No change. `cwebp` is already installed in the image for the texture step and is not involved in audio. No `ffmpeg`/`oggenc`/`sox` is needed because there is no transcoding step (see Audio).

## Decision 1: Entity store (ECS library vs hand-rolled vs none)

**Recommendation: hand-rolled typed `EntityStore`, about 150 lines, no library.**

### What the store must do (from the milestone requirements)

1. Stable ids that never dangle. Oolite AI code holds targets as weak references; a dead id must resolve to "gone", never to a different, newer ship.
2. Canonical iteration order that is identical after a save and reload, because the determinism hash and the AI/collision order depend on it.
3. Heterogeneous, object-shaped entities: AI state (priority lists, parameter bags, timers, behaviour enums), equipment lists, cargo, subentity links. These are not flat numeric columns.
4. Canonical text serialisation through the existing `canon()` plus `fnv1a32` path (`src/sim/hash.ts`), in float64, with a fixed key order, and into a zod-validated save.
5. A population in the tens, not thousands (Oolite's populator plus combat debris and pods; Oolite's own collision comment calls its all-pairs loop the hottest path, and that is with its full entity list).

### Candidates evaluated (versions from the npm registry, 2026-11-11)

| Library | Latest | Last release | Verdict | Disqualifying fact for this project |
|---------|--------|--------------|---------|-------------------------------------|
| bitecs | 0.4.0 | 2025-12-06 | Reject | Entity ids are **recycled immediately** after removal (its docs: `eid1 === eid3`). That is exactly the dangling-target bug class requirement 1 forbids. Its serializers are SoA typed-array/`f32` based; the sim's positions are float64 and are hashed at 6 decimals, and `f32` would lose bits at system scale (the project already records 0.125 m ULP at 1.4e6 m). Object-shaped AI state does not fit SoA columns. |
| miniplex | 2.0.0 | 2023-07-16 | Reject | Entities are plain objects (good) but it has **no ids at all** (identity by reference), no serialisation, and no release in over three years. Its value is reactive queries for React, which this project does not use. You would still write ids, ordering and serialisation yourself. |
| koota | 0.6.6 | 2026-04-09 (modified 2026-11-10) | Reject | Pre-1.0, React-centred. Entity handles pack a generation (good), but its docs describe plain queries as "a flat unordered list" (order not guaranteed), and I found no snapshot/serialisation API in its docs (confidence MEDIUM on that absence). Canonical order and the canonical text hash would be re-implemented on top. |
| (none, hand-rolled) | n/a | n/a | **Choose** | Satisfies all five requirements directly and keeps `src/sim` dependency-free and auditable. |

### Shape

```typescript
// src/sim/world/entity-store.ts (sketch)
export type EntityId = number; // positive safe integer, monotonic, never reused in a session

export interface EntityStore<E extends { id: EntityId }> {
  nextId: number;                // serialised: a reload never reissues an id
  readonly byId: Map<EntityId, E>; // JS Map iterates in insertion order
  spawn(make: (id: EntityId) => E): E;
  get(id: EntityId): E | undefined; // AI holds ids, resolves per use; undefined === dead
  remove(id: EntityId): void;       // deferred to end of tick (collect-then-remove)
}
```

- Ids are monotonic and never reused, so a stale `targetId` resolves to `undefined`, which is Oolite's weak-reference behaviour. Persist `nextId` in the save.
- Insertion order equals ascending id order, so `Map` iteration is canonical. On load, insert in ascending id order and the order is reproduced exactly. Never rely on a swap-remove dense array (order changes with removal history and differs after reload).
- Entities are a discriminated union on `kind` (`ship`, `station`, `missile`, `cargoPod`, `wreckage`, and so on), plain data with no methods, matching the `SimState` convention. Planet and sun stay as the existing static `world/layout` bodies, not store entities.
- **Render-only effects are not sim entities.** Sparks, explosion clouds, laser flashes and fragment bursts are spawned by the renderer from sim events and never enter the store, the hash or the save. Oolite creates them as entities; here they are presentation.
- Serialise with the same pattern as `serialize(state)`: one labelled line per entity, fixed key order, every number through `canon`. Never `JSON.stringify`. The in-save form is a zod-strict array sorted by id.
- Randomness: reuse `createSeededRandom` (`src/sim/math.ts`) and the existing `ranrot.ts`; persist the world PRNG state in the save. Do not add a PRNG package.
- Optional hardening: `fnv1a32` is 32-bit. With a world of many entities a golden mismatch is still detected (a collision is a 1 in 4.3e9 event), so no change is required; if a stronger hash is wanted later, fold two 32-bit passes with different offset bases. No package.

## Decision 2: Collision (broadphase and narrowphase)

**Recommendation: hand-rolled sweep-and-prune broadphase; port Oolite's octrees for narrowphase; add no physics or BVH library.**

### What Oolite actually does (read from `/home/opencode/git/oolite`)

- Broadphase (`CollisionRegion.m`, `Universe.m`): entities are kept in sorted axis lists (`x_next`/`z_next` chains); a candidate pair is then filtered by a **bounding-sphere test** `dist2 < (r1 + r2)^2`. The proximity-alert radius for AI avoidance is `PROXIMITY_WARN_DISTANCE` = 4 (`Universe.h:99`), i.e. `dist2 < 16 * (r1 + r2)^2`, and the same pass notifies station docking corridors. Subregions exist around planets and stations.
- Narrowphase (`Octree.m`, `ShipEntity.m` `doOctreesCollide`): `isHitByLine` (laser vs hull, returns hit distance) and `isHitByOctree` (hull vs hull). The octree is a flat `int` array where `0` is empty, `-1` is solid, and any other value is the offset of eight child entries (`Octree.m:347-400`). It is built from the `.dat` triangles by `OOMeshToOctreeConverter.m` at depth 5 (32x32x32), depth 4 for small models, deeper above a size threshold.
- Mass is derived from the octree volume (`ShipEntity.m:418`), so the octree is also needed for faithful ship mass, not only collision.

### Plan

1. **Broadphase, in `src/sim/world/broadphase.ts`.** Insertion-sort the entity array by `x - radius` each tick (nearly sorted tick to tick, so insertion sort is O(n)), sweep to emit pairs within the `4 * (r1 + r2)` proximity range, then **sort emitted pairs by `(idA, idB)` before resolving** so resolution order is canonical. Because the result set equals "all pairs within range", it is provably identical to Oolite's, and a fast-check property test compares it to an O(n^2) brute-force reference. At the expected populations (tens of entities) even brute force is cheap; start with the reference implementation behind the same interface and switch to sweep-and-prune only if a profile shows the need. Planet and sun are not in the broadphase: test every ship against them with one sphere check each (the collision-with-temperature requirement), which is O(n).
2. **Octrees at build time.** Port `OOMeshToOctreeConverter` into `tools/oolite-ingest` (Node, free of the sim's purity rules), emit a compact binary per model (an `Int32Array` plus radius), validate with zod, and cover it with the existing `assets:check` drift gate and the `.dat` parse tests in `tools/oolite-ingest/convert/dat.ts`. Load lazily by model, not in the entry chunk, because the client catalogue was deliberately trimmed to 15 KB. Size is not yet measured; do it in the first plan that emits them.
3. **Octree at runtime.** Port `isHitByLine`, `isHitByOctree` and the octant helpers to `src/sim/collision/octree.ts` (about 400 lines, pure functions over `Int32Array`, doubles instead of `GLfloat`). Property-test against a brute-force triangle test on the `.dat` mesh with tolerance of one leaf cell.

### Rejected

| Option | Why not |
|--------|---------|
| `three-mesh-bvh` 0.9.18 | Needs `THREE.BufferGeometry`; `src/sim` may not import Three (ESLint `no-restricted-imports` plus the purity design). It gives exact triangle hits, which would also differ from Oolite's voxel-approximate hits that the port is trying to reproduce. |
| `three/addons/math/Octree` | A static-world capsule/triangle structure from Three, not Oolite's solid-voxel octree; same Three-import problem. |
| Rapier (`@dimforge/rapier3d-compat` 0.21.0) / cannon-es | Full physics engines with their own integration and response, while Oolite's collision response is bespoke momentum and damage code. Rapier is WASM, and **WebAssembly compilation under the shipped CSP needs `'wasm-unsafe-eval'`**, which would loosen `script-src 'self'` (a recorded Key Decision). Also about 15 MB unpacked. |
| rbush / generic R-tree / kd-tree packages | Solve a different problem (many static rects). A sorted-axis sweep over tens of moving spheres is simpler and already faithful. |
| Octree rebuilt per frame | Never. The model octree is static per ship type and only transformed by the ship's orientation at query time, as in Oolite. |

## Decision 3: Audio

**Recommendation: raw Web Audio API in `src/audio/`; ship Oolite's `.ogg` files untouched; stream music through an `<audio>` element.**

### Empirical result (the key fact)

I decoded every vendored candidate file with `AudioContext.decodeAudioData` in the project's own `wegolite-cross` image: **Chromium 156.0.8078.4 and Firefox 157.0, all 28 files (26 sounds, 2 music tracks) decoded successfully in both** (mono 44.1 kHz SFX of 0.05 to 3.46 s; stereo 44.1 kHz music of 311.01 s and 226.06 s). Observed context state after creation: Chromium `running` (headless automation does not enforce the autoplay policy), Firefox `suspended` (policy enforced). **Confidence HIGH** (direct observation in the target environment). Safari is not claimed and was not tested; sources that report Safari lacking Ogg decode are old and I did not rely on them.

### Consequences

| Question | Answer |
|----------|--------|
| Does the sound need build-time transcoding? | **No.** Ogg Vorbis decodes natively in both claimed browsers. Re-encoding lossy-to-lossy adds artefacts and a tool dependency (`ffmpeg`/`oggenc`) for no benefit. Total SFX is 412 KB; copy as-is. A transcoding step is only warranted if Safari support is later claimed (it would need an AAC/MP3 sibling), and that is a content-pipeline task, not a stack change. |
| howler.js? | **Reject.** Latest is 2.2.4 (2023-09-19), no release in over three years. Its main value is HTML5-Audio fallback and codec negotiation, neither of which is needed (one codec, two known browsers, Web Audio only). Its `autoUnlock` listens for `touchend`, which is irrelevant on desktop. It hides the `AudioContext`, which the e2e probe needs to read. It adds a runtime dependency to replace roughly 200 lines. |
| Tone.js? | **Reject.** 15.1.22, 5.4 MB unpacked. It is a synthesis and music-scheduling framework; Oolite's audio is 26 recorded one-shots and two streamed tracks. |
| Positional sound? | **Not needed, and not faithful.** Vanilla Oolite calls `alDistanceModel(AL_NONE)` (`OOOpenALController.m:75`) and plays game sounds from the player's cockpit sound source; positioning is only exposed to OXP scripting via `OOJSSoundSource`. The sources I found in `Universe.m`/`PlayerEntitySound.m` are player-centred (MEDIUM confidence that no NPC-positioned vanilla sound exists). If a later milestone wants it, `PannerNode` is built in; verify `AudioListener.positionX` support in Firefox before using the AudioParam form. |
| Autoplay policy? | A context created before a user gesture starts `suspended` in Firefox (observed) and in a headed Chrome. Create the `AudioContext` lazily inside the first gesture handler (the New game / Continue click, and a one-shot `keydown` listener), call `resume()` there, and watch `statechange`. Both browsers accept a click; Firefox needs sticky user activation. Do not depend on `navigator.getAutoplayPolicy` (not available in every claimed browser). Playwright's Chromium reports `running`, so only the `e2e-cross` Firefox run exercises the suspended-then-resumed path; assert it there via a probe field. |
| CSP? | Compatible with no change. `fetch()` of `.ogg` is `connect-src 'self'`; an `<audio src>` falls under `default-src 'self'` (no `media-src` is set). No `blob:` or `data:` media is needed. Do not add `media-src` unless a later change requires it. |

### Design

- One `AudioContext`, one master `GainNode`, two child buses (SFX, music) wired to master. Volume settings are three optional fields added to the settings schema; mind the recorded caveat that an unknown key fails the whole settings blob in an older build.
- SFX: fetch plus `decodeAudioData`, cached as `AudioBuffer`. Total decoded size is about 5.2 MB (29.7 s of mono float32 at 44.1 kHz), so decoding everything is fine. Play with a fresh `AudioBufferSourceNode` per shot. Cap concurrent voices at 32, the same as Oolite's `kMixerGeneralChannels` (`OOALSoundMixer.h:37`).
- **Music must not be decoded to a buffer.** Decoded, the two tracks are about 190 MB of float32 PCM (537 s x 44.1 kHz x 2 channels x 4 bytes). Use `<audio loop>` plus `createMediaElementSource` into the music bus. Verify Range-request support under `vite preview` and under the chosen host (needed for seeking and some loop paths); add a Firefox spec that plays and loops.
- Sounds are driven by `SimEvent`s through the existing event channel (`src/sim/events.ts`), exactly as hints and HUD already are; the sim never sees audio. The mapping from event to sound key is a pure function, unit-testable in Vitest with no Web Audio. Put the engine behind an `AudioPort` interface with a fake for tests.
- Content pipeline: vendor the `.ogg` files into `third_party/oolite/Sounds` and `Music` (update `pin.json`, `SOURCE.md`, `CHECKSUMS.sha256`); `customsounds.plist` and `explosions.plist` are **already vendored** in `third_party/oolite/Config`. Resolve the alias chain at build time (`"[@beep]"` and `"[buy-ship]" = "[buy-commodity]"` style indirection, keys beginning `[@` are internal) into `generated/sounds.json` (key to file), as the commodity-name decision did. Ship the files from `public/audio/` with an ASSETS.md row each.
- Load SFX after the first in-flight frame, and music on demand, so the cold-start transfer budget is not charged: the transfer is 8.41 MiB against a 9 MiB ceiling, which the NPC ship models will force a re-baseline of regardless.

### Provenance flags (licensing is a non-negotiable constraint)

- Three laser sounds carry third-party licences recorded in Oolite's `LICENSE.md` lines 149-157: military laser (CC0, user "notyermom"), mining laser (CC BY 3.0, "bubaproducer"), beam laser (CC BY 3.0, "jobro"). The two CC BY files need attribution in NOTICE/ASSETS.md.
- `OoliteDocked.ogg` is referenced by `OOMusicController.m:130` but **does not exist** in the checkout (only `BlueDanube.ogg` and `OoliteTheme.ogg` ship). Do not plan docked music from it. Check `OOMusicController` for the fallback behaviour before wiring music events.
- I did not find per-file provenance for the music tracks in `LICENSE.md`; resolve before shipping them. Recorded-performance rights of a classical piece are not implied by the composition being old.

## Decision 4: Effects in Three.js within the 50 draw-call budget

**Recommendation: pooled `InstancedMesh` per texture, stock `MeshBasicMaterial`, additive blending. No custom shaders, no new Three addons.**

### What Oolite draws (read from source)

All combat visuals are additive-blended billboards: `OOLaserShotEntity` is a 0.09 s crossed-quad (8 vertices, three passes) in `OPENGL_STATE_ADDITIVE_BLENDING`; `OOParticleSystem` draws additive quads with `glBlendFunc(GL_SRC_ALPHA, GL_ONE)`; explosion clouds are capped at 25 particles (10 at low detail), with colours, counts, durations and textures in the already-vendored `explosions.plist`. **Oolite draws no shield bubble or shield-hit mesh** (I found none in `ShipEntity.m`/`PlayerEntity.m`); shield state is HUD bars, with a hit sound. Do not invent a shield effect. If hit feedback is wanted, use the existing Canvas-2D HUD layer.

### Technique

| Effect | Primitive | Draw calls | Notes |
|--------|-----------|------------|-------|
| Laser shots | One `InstancedMesh`, crossed-quad geometry, `oolite-laser-blur*.png` | 1 | Per-instance matrix gives origin, direction and length; per-instance colour for the weapon colour |
| Explosion clouds | One `InstancedMesh` of a camera-facing quad per texture (`oolite-particle-cloud2.png`) | 1 | 25 particles per cloud; pool of 256 to 512 instances is ample |
| Fragments / sparks | One `InstancedMesh`, `oolite-particle-fragments*.png` | 1 | |
| Flash | One `InstancedMesh`, `oolite-particle-flash.png` | 1 | |
| Cargo pods, rocks, repeated hulls (missiles, Vipers, asteroids) | One `InstancedMesh` per model and material | 1 to 2 per model type | Instance only repeated models; a model seen once costs the same as a `Mesh` |

Total for effects: about 4 to 5 draw calls regardless of how many shots and explosions are alive.

### Why `InstancedMesh` and not `Points` or `Sprite`

- `THREE.Sprite` is one draw call each (the buoy flashers already spend one per light). A dogfight with 30 live particles would blow the budget.
- `PointsMaterial.size` is one value per material, so per-particle size needs a custom shader; GL point size is also capped by the driver (hardware-dependent, commonly 64 to a few hundred pixels), which would clip large explosion billboards that Oolite sizes in hundreds of metres. A quad does not have the cap.
- A stock `MeshBasicMaterial` on an `InstancedMesh` participates in the **logarithmic depth buffer** the renderer already uses (`logarithmicDepthBuffer: true`) with no custom shader chunks. A hand-written `ShaderMaterial` would need the log-depth includes; avoiding it removes a class of z-fighting regressions. This also mirrors the existing `sun.ts` and `nebulae.ts` additive materials (`depthWrite: false`).
- Additive fade is multiplication of colour; `GL_SRC_ALPHA, GL_ONE` is colour times alpha, so per-instance `setColorAt` scaled by alpha reproduces the fade exactly.

### Integration rules

- Set `instanceMatrix.setUsage(THREE.DynamicDrawUsage)`; mark `instanceMatrix.needsUpdate` and `instanceColor.needsUpdate` each frame; set `mesh.count` to the live number. At 512 instances that is 32 KB of matrix data per frame.
- Set `frustumCulled = false` on the pooled meshes (or recompute the bounding sphere after changes); a stale instance bounding volume silently culls everything.
- Build instance matrices in **camera-relative float64 to float32** space using the same helper as the rest of the scene (`src/render/camera-relative.ts`); do not upload world coordinates.
- Camera-facing quads are oriented in JS from the camera quaternion once per frame (cheap at these counts). Laser beams use the crossed-quad geometry so they need no per-frame facing.
- Effect randomness is render-only and must never feed the sim; seed a separate `createSeededRandom` so effect tests are reproducible.
- **The real budget risk is NPC ships, not effects.** The Cobra GLB is 2 primitives and 2 materials; the Coriolis is 4. At roughly 2 draw calls per visible ship, about 12 visible NPC hulls plus the 10 to 13 calls already spent in flight put the 50-call gate within reach. Mitigations in order: frustum culling (Three does this by default), instancing repeated models, and a nearest-K policy that draws far ships as a pooled additive dot. Add a populated-traffic scene to `tests/e2e/budget.spec.ts` in the first rendering plan so the gate measures what players will see. Texture and model weight will also grow as the ship catalogue converter is extended beyond the three GLBs that exist today (`cobra3`, `coriolis`, `buoy`).

## Decision 5: Move the sim into a Web Worker?

**Recommendation: No, not in v2.0. Keep it possible; decide on a measurement.**

Why not now:

1. The workload is small (tens of entities at a fixed 1/120 s step, with at most 5 catch-up steps per frame, `MAX_STEPS_PER_FRAME`). Oolite's AI is timer-driven, not per-tick, so cost is spiky, not continuous.
2. A worker adds an async boundary for input, a snapshot copy per frame (or a `SharedArrayBuffer`, which needs cross-origin isolation headers and no host is chosen yet), and a second place to debug. The determinism goldens run in-process in Vitest today and keep working only if the sim stays directly callable.
3. A worker must be same-origin: module workers fall under `script-src 'self'` through `worker-src` fallback, but **a `blob:` worker (Vite's `?worker&inline`) would violate the CSP**. Use a separate emitted file if it is ever done.

Preconditions that keep the door open (all already true or cheap):

- `src/sim` stays DOM-free and Three-free (enforced by `tsconfig.sim.json` and ESLint).
- The sim boundary stays commands in, events and a plain-data `WorldView` snapshot out. Do not let the renderer or HUD reach into live sim objects. This is exactly the typed `ShipControl`/`WorldView` seam the milestone already plans.
- Stagger AI re-evaluation by `id % n` (deterministic) to flatten spikes before considering a worker.

Trigger to revisit: add a `sim.stepMs` probe and record it in `docs/PERFORMANCE.md`. Move to a worker only if the **sim's share of the frame exceeds about 4 ms at p95 on the reference desktop** with a representative populated system (at 60 Hz the sim runs about two steps per frame; render needs the rest of the 16.7 ms). Until then the existing p95 criterion (at most 17.5 ms) is the gate.

## Supporting Libraries

None added. Retain: `three` 0.187.0, `zod` 4.6.7, `fast-check` 4.10.2 (dev), `@gltf-transform/core` 4.5.1 (dev, build-time), `@vitest/coverage-v8` 5.0.5 (dev).

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Entity store | Hand-rolled `EntityStore` | bitecs 0.4.0 | Immediate id reuse, `f32` serialisers, SoA fits numeric columns not AI object state |
| Entity store | Hand-rolled `EntityStore` | miniplex 2.0.0 | No ids, no serialisation, unmaintained since 2023 |
| Entity store | Hand-rolled `EntityStore` | koota 0.6.6 | Pre-1.0, unordered queries, no found snapshot API |
| Broadphase | Sweep-and-prune (or brute force first) | Rapier, cannon-es | Bespoke Oolite response; WASM needs `'wasm-unsafe-eval'` in the CSP |
| Narrowphase | Ported Oolite octree | three-mesh-bvh 0.9.18 | Needs Three geometry in the sim; exact hits differ from Oolite's |
| Audio | Raw Web Audio | howler.js 2.2.4 | Stale (2023), hides the context, features not needed |
| Audio | Raw Web Audio | Tone.js 15.1.22 | 5.4 MB synthesis framework for recorded one-shots |
| Audio assets | Ship `.ogg` as-is | Transcode to MP3/AAC | Not needed for Chrome and Firefox; adds a tool and lossy re-encode |
| Effects | `InstancedMesh` pools | `Sprite` per particle | One draw call each |
| Effects | `InstancedMesh` pools | `Points` + `ShaderMaterial` | Point-size cap, per-point size needs a custom shader, log-depth chunks |
| Sim threading | Main thread | Web Worker | Not justified by measured cost; snapshot and CSP complexity |

## What NOT to Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| bitecs, miniplex, koota, or any ECS | Id reuse or no ids, float32 serialisation, unordered queries, no canonical hash | `EntityStore` with monotonic ids |
| Any WASM dependency (Rapier, Box2D builds, WASM Ogg or Vorbis decoders) | Needs `'wasm-unsafe-eval'` and loosens the recorded CSP decision | Native `decodeAudioData`; ported TS collision |
| Physics engines | Oolite's collision response is bespoke; an engine fights fidelity | Ported `ShipEntity` collision code |
| `three-mesh-bvh`, Three Octree addon | Three types inside the sim; different results from Oolite | Ported `Octree.m` |
| howler.js, Tone.js | Stale or oversized for the need | Raw Web Audio |
| `SharedArrayBuffer` | Needs COOP/COEP headers; no host chosen; not needed | Plain-data snapshot if a worker is ever used |
| Per-effect `Sprite` or per-particle `Mesh` | Draw-call budget | Pooled `InstancedMesh` |
| A shield-bubble or shield-flash mesh | Oolite has none | HUD bars and sound |
| Decoding the music tracks to `AudioBuffer` | About 190 MB of PCM | `<audio loop>` through `createMediaElementSource` |
| `?worker&inline`, `blob:` media or workers | Violates `script-src 'self'` / `default-src 'self'` | Emitted same-origin files |
| `Math.random` or `Date.now` in `src/sim` | Breaks determinism | `createSeededRandom`, persisted world PRNG state |
| A second hash or serialiser (`JSON.stringify`, `node:crypto`) | Order and format drift weaken goldens | `canon` plus `fnv1a32` pattern |

## Stack Patterns by Variant

**If a populated-traffic e2e scene exceeds 50 draw calls:**
- Instance repeated models and apply nearest-K full-mesh drawing; do not raise the budget or change antialiasing or resolution (recorded owner decision D-12, D-13).

**If the sim exceeds about 4 ms p95 per frame on the reference desktop:**
- First stagger AI by id; then profile collision pair counts; only then move the sim to an emitted module worker with a transferable snapshot.

**If Safari is later claimed:**
- Add an AAC or MP3 sibling for each sound at build time and select by `canPlayType`; the loader seam in `src/audio/` is the only change point.

## Installation

```bash
# Core: nothing to install. No runtime or dev dependency changes.
# Docker image: no change. Do not run npm on the host.

# After vendoring assets, regenerate content and run the gates (Docker only):
docker compose run --rm assets
docker compose run --rm assets npm run assets:check
docker compose run --rm verify
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| three 0.187.0 | @types/three 0.187.0 | Already pinned together; `InstancedMesh`, `MeshBasicMaterial`, `AdditiveBlending` and `DynamicDrawUsage` are stable core API (Context7 `/mrdoob/three.js` r184 docs checked; no 0.187-specific change found for these) |
| Chromium 156 / Firefox 157 (project images) | Ogg Vorbis `decodeAudioData` | Verified empirically, 28 of 28 files |
| zod 4.6.7 jitless | Strict CSP | No new schema needs `new Function`; keep `z.config({ jitless: true })` first |
| Vite 8.3.5 | Static `public/audio` | Served as-is; confirm `Content-Type: audio/ogg` and Range support in e2e |

## Open Items (for phase-level research)

- Octree binary size and load time for the NPC model set (not measured).
- Range-request behaviour of `vite preview` and the eventual host for looping music.
- Per-file provenance of `BlueDanube.ogg` and `OoliteTheme.ogg`.
- Whether vanilla Oolite plays any sound that is positioned relative to an NPC (current evidence says no).
- Cross-engine floating-point determinism: goldens are produced in Node (V8) only; if replays are ever compared across browsers, transcendental `Math` functions may differ. Not a v2.0 gate.

## Sources

- `/home/opencode/git/oolite/src/Core/CollisionRegion.m`, `Octree.m`, `OOMeshToOctreeConverter.m`, `ShipEntity.m` (lines 418, 1878-1993), `Universe.h:99` (PROXIMITY_WARN_DISTANCE), `OOOpenALController.m:75` (`AL_NONE`), `OOALSoundMixer.h:37` (32 channels), `OOSoundSource.m`, `OOMusicController.m:105-135`, `OOLaserShotEntity.m`, `OOParticleSystem.m`, `Resources/Config/customsounds.plist`, `explosions.plist`, `LICENSE.md` lines 149-157 — HIGH (primary source)
- Empirical decode test of all 28 `.ogg` files in `wegolite-cross` (Chromium 156.0.8078.4, Firefox 157.0), 2026-11-11 — HIGH (direct observation)
- npm registry (`registry.npmjs.org`), queried 2026-11-11: bitecs 0.4.0, miniplex 2.0.0, koota 0.6.6, howler 2.2.4, tone 15.1.22, three 0.187.0, three-mesh-bvh 0.9.18, `@dimforge/rapier3d-compat` 0.21.0 — HIGH
- Context7 `/natethegreatt/bitecs` (entity id recycling, serialisers), `/hmans/miniplex` (reverse iteration), `/pmndrs/koota` (entity ids, unordered queries), `/goldfire/howler.js` (codecs, autoUnlock), `/mrdoob/three.js` r184 (InstancedMesh, PointsMaterial, BufferAttribute usage) — MEDIUM per the confidence seam, raised to HIGH where cross-checked against the registry or source
- MDN Autoplay guide (Firefox `media.autoplay.block-webaudio`, sticky activation; fetched summary) and MDN `decodeAudioData` (Baseline, resampling) — MEDIUM; codec support not stated there, hence the empirical test
- Project files: `.planning/PROJECT.md`, `AGENTS.md`, `package.json`, `docs/PERFORMANCE.md`, `src/sim/hash.ts`, `src/sim/step.ts`, `src/sim/events.ts`, `eslint.config.js`, `index.html` CSP, `src/render/bodies/buoy.ts` — HIGH

---
*Stack research for: Wegolite v2.0 Foundation & Combat*
*Researched: 2026-11-11*

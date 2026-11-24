---
phase: 16-wreckage-cargo-and-the-entity-cap
reviewed: 2026-11-17T02:04:51Z
depth: deep
files_reviewed: 37
files_reviewed_list:
  - src/sim/world/debris.ts
  - src/sim/world/step.ts
  - src/sim/world/kill.ts
  - src/sim/world/contacts.ts
  - src/sim/combat/octree.ts
  - src/sim/combat/step.ts
  - src/sim/ai/pilots/test-pilot.ts
  - src/sim/ai/test-spawn.ts
  - src/app/session/traffic.ts
  - src/app/session/step-options.ts
  - src/app/session/sim-driver.ts
  - src/app/session/event-router.ts
  - src/app/session/render-driver.ts
  - src/app/session/start-session.ts
  - src/app/session/probe-publisher.ts
  - src/app/npc-models.ts
  - src/app/game-session.ts
  - src/app/probe.ts
  - src/render/bodies/debris.ts
  - src/render/bodies/explosions.ts
  - src/render/system-scene.ts
  - src/content/ships-debris.ts
  - src/content/explosions.ts
  - src/content/schemas/ship-debris.ts
  - src/content/schemas/explosion.ts
  - src/content/schemas/ship-npc.ts
  - src/content/types.ts
  - tools/oolite-ingest/convert/debris.ts
  - tools/oolite-ingest/convert/explosions.ts
  - tools/oolite-ingest/convert/glb.ts
  - tools/oolite-ingest/convert/textures.ts
  - tools/oolite-ingest/convert/dat.ts
  - tools/oolite-ingest/convert/npc-ships.ts
  - tools/oolite-ingest/generate.ts
  - scripts/vendor-oolite.sh
  - tests/helpers/tick-script.ts
  - tests/guards/entity-id-scope.test.ts
findings:
  critical: 0
  warning: 3
  info: 6
  total: 9
  necessity: 0
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-11-17T02:04:51Z
**Depth:** deep
**Files Reviewed:** 37
**Status:** issues_found

## Summary

Scope: `git diff aa2cde6..HEAD -- src tools scripts tests public`. I reviewed every changed source file. I checked the generated JSON (`ships-debris.json`, `explosions.json`) only against the strict schemas. I did not review GLB, PNG, WebP or golden bytes. `src/sim/world/kill.ts` and `src/sim/combat/step.ts` have no changes in this range (they changed before `aa2cde6`). I still reviewed them, because the debris path runs through them. Behaviour was checked against the Oolite checkout at `/home/opencode/git/oolite` (`ShipEntity.m` 7814-8143, `Universe.m` 5497-5526 and 5862-5867, `Octree.m` 683-719, `OOExplosionCloudEntity.m`, `OOParticleSystem.m`, `OOFlashEffectEntity.m`, `OOLightParticleEntity.m`). No tests were run; this is a read-only review.

Results of the checks you asked for:

- **Draw order and refusal neutrality:** holds. In `releaseDebris` (`src/sim/world/debris.ts:644-783`), each pod, wreck and plate takes all of its draws from the local copy of the victim's `combat` stream before `spawnCargoPiece`, `spawnWreck` or `spawnEntity` is called. No draw depends on a spawn's result. A refusal allocates no id, and `forkSeed` is keyed by id, not by the stream, so a refused spawn does not change later draws.
- **Cadence:** holds. The cap gates read `liveEntityCount` only, the wreck burn-down reads the hashed `spawnTick` and the fixed `dt`, and events are dispatched once per fixed step (`sim-driver.ts:173`).
- **Entity cap:** correct, with no off-by-one. `liveEntityCount < 0.95 * 256` (243.2) admits a pod or plate at 243 live entities or fewer, so debris alone can bring the count to 244 at most. `< 0.5 * 256` (128) admits a wreck at 127 or fewer. The pre-draw gate and the per-wreck gate differ from Oolite; both differences are recorded in D16-05.
- **`MAX_ENTITY_VELOCITY` clamp:** applied per component at every write: pod and plate scatter, wreck push, and blast. This matches `isLegalVelocity` and the sanitiser, which also check per component.
- **Totality:** `releaseDebris`, `randomOctreePoint` and `debrisMassOf` stay total on malformed content (not a Map, not an object, non-finite values). Each bad value either becomes a neutral value or makes `spawnEntity` refuse the spawn, which `isMalformedInit` and `domainRefusal` check.
- **Sim purity and id scope:** `debrisContacts` returns copied plain data with no id. The `shipDestroyed` arm of the event router reads only `position` and `radius`. Nothing under `src/sim` imports Three.js or touches the DOM.
- **Path validation before fetch:** debris GLB paths pass `NPC_GLB_PATH_PATTERN` in the strict schema. The explosion texture name is checked against `/^oolite-particle-[a-z0-9-]+\.png$/` in `add` before any URL is built, and the flash texture is a constant.
- **Lazy loading:** debris GLBs go through the per-session loader and its first-in-flight-frame latch. Particle textures load on the first explosion only.

Three warnings:

1. The explosion layer never disposes its two `InstancedMesh` objects, so their instance buffers stay on the GPU after every scene swap.
2. The wreck rescale calls `Math.cbrt` directly in `src/sim/world`. A recorded key decision forbids direct transcendental calls in that directory.
3. The new local route of the vendor script anchors byte integrity to a 7-hex commit prefix.

## Warnings

### WR-01: The explosion layer never disposes its two `InstancedMesh` objects, so their GPU instance buffers outlive every scene

**Status: FIXED in 17171a4** (`dispose()` now calls `cloud.dispose()` and `flash.dispose()`; the disposal test counts both meshes' dispose events).

**File:** `src/render/bodies/explosions.ts:551-561` (meshes created at `:293` and `:318`)
**Issue:** `dispose()` frees the shared quad, both materials and the loaded textures, then calls `root.clear()`. It never calls `cloud.dispose()` or `flash.dispose()`. In Three.js (`three` 0.187.0), the GPU buffers behind `InstancedMesh.instanceMatrix` and `instanceColor` belong to the mesh, not the geometry. `WebGLObjects` frees them only when the mesh dispatches its own `dispose` event (`onInstancedMeshDispose`). Each system scene builds a new explosion layer (`system-scene.ts:415`), so every jump or Load after a frame with an explosion on screen leaves four GL buffers behind:

| Mesh | Buffer | Size |
| --- | --- | --- |
| cloud | instance matrices | 80 × 64 B |
| cloud | instance colours | 80 × 12 B |
| flash | instance matrices | 8 × 64 B |
| flash | instance colours | 8 × 12 B |

This breaks the scene's disposal contract ("the scene owns and disposes the layer"). The debris layer (`debris.ts:280`) and the NPC layer do call `mesh.dispose()`. The disposal tests (`tests/render/explosion-layer.test.ts:593-618`, `tests/app/dispose.test.ts:420-431`) count only the geometry, the materials and the textures, so they do not catch the leak.
**Fix:**

```ts
dispose(): void {
  if (disposed) return;
  disposed = true;
  hide();
  cloud.dispose();   // frees instanceMatrix + instanceColor GL buffers
  flash.dispose();
  geometry.dispose();
  cloudMaterial.dispose();
  flashMaterial.dispose();
  for (const texture of textures) texture.dispose();
  textures.length = 0;
  root.clear();
},
```

Add `cloud` and `flash` to the disposal counters in both tests, as `dispose.test.ts` already does for `npcInstancedMesh*` and the debris children.

### WR-02: Wreck rescale calls `Math.cbrt` directly in `src/sim/world`, which a recorded decision forbids

**File:** `src/sim/world/debris.ts:728`
**Issue:** `radius = model.radius * Math.cbrt(expectedMass / model.mass)`. Key decision (f) in `.planning/PROJECT.md:246` says the world-core modules (`src/sim/world`, `src/sim/sim.ts`, `src/sim/rng.ts`, `src/sim/ai`) "call no `Math` transcendental directly, keeping trigonometry in `src/sim/math.ts` helpers where a later portable implementation replaces one module". The ECMAScript spec lets engines approximate `Math.cbrt`, as it does `sin` and `pow`. The result is the wreck's `radius`, which is hashed, and it feeds the push speed (`push * radius`). The value then reaches the hashed velocity and, through `debrisMassOf`, the blast's `dv`. So this one call puts an engine-dependent value into the world hash from a module the decision covers. It also escapes the single replacement point that the decision exists to keep. Today's claim (V8 only) is not broken, but the next phase that needs cross-engine replay would have to find this call by hand. The sim-determinism ban guard does not catch it.
**Fix:** Add a helper to `src/sim/math.ts` (for example `export function cbrt(x: number): number { return Math.cbrt(x); }`, documented under the same within-one-engine scope note), import it in `debris.ts`, and add a lint ban or a guard-test rule against direct `Math.(cbrt|pow|sin|cos|…)` calls under `src/sim/world` and `src/sim/ai`, so the decision is enforced. `src/sim/ai/test-spawn.ts:214-215` (`Math.cos`, `Math.sin`, older than this phase) breaks the same rule and should move with it.

### WR-03: The vendor script's local route anchors integrity to a 7-hex commit prefix, so newly vendored files have no independent check

**File:** `scripts/vendor-oolite.sh:47`, `:208`, `:294`
**Issue:** In local mode, the bytes and `pinned.sha256` come from the same `--export-pin` output. The SHA-256 comparison at `:294-326` therefore proves only that nothing changed between export and copy. The real trust anchor is the git commit. That commit is resolved from `COMMIT="7437f22"` (`git rev-parse --verify "${COMMIT}^{commit}"`, `:208`), and the import side accepts any 40-hex commit line that `startsWith` those 7 characters (`:294`).

A 7-hex prefix is 28 bits, so it is cheap to brute-force a local commit that `rev-parse` resolves under the short name when the real object is missing or the checkout has been tampered with. The other guard, "refuse any change to a committed digest", covers only files that already have a row in `CHECKSUMS.sha256`. The files added in this phase were vendored with no prior row, so nothing checked them independently:

- 5 wreck `.dat` files;
- barrel and alloy `.dat` files;
- 4 barrel and alloy textures;
- `wreck.png`;
- the 2 particle PNGs.

`pin.json` also records only the short SHA, so the provenance trail cannot show which upstream commit was used. The full SHA, `7437f22a543c442830774dea0f2cad4e59c04cbb`, resolves in the local checkout.
**Fix:**

- Pin the full 40-hex SHA in the script: `COMMIT=7437f22a543c442830774dea0f2cad4e59c04cbb`, with the short form derived for display only.
- Use `git -C "$checkout" cat-file -e "${COMMIT}^{commit}"` instead of short-name resolution.
- Compare `pinnedCommit === commit` exactly instead of `startsWith`.
- Write the full SHA to `pin.json`. This is a provenance change, so regenerate `CHECKSUMS.sha256` and the `ASSETS.md` cells through the script in the same commit.

## Info

### IN-01: Debris contacts allocate on every frame, despite the layer's "no allocation per piece" claim

**File:** `src/app/session/render-driver.ts:201-202`, `src/sim/world/contacts.ts:89-115`
**Issue:** Every render frame, `debrisContacts` allocates one array plus three objects per live piece: the contact, its position and its orientation. `debris.map(...)` allocates another array, and `?? []` allocates a new empty array each frame when traffic is off. Debris can reach 244 live pieces, so the frame loop can allocate about 730 short-lived objects per frame. The layers themselves (`debris.ts:200-206`, `explosions.ts:338-342`) are allocation-free, and their headers say so, but the feed into them is not. This copies the existing `npcContacts` pattern, and performance is out of scope for this review, so it is Info only.
**Fix:** If GC pressure shows up in the budget spec, have the sim expose a visitor (`forEachDebrisContact(world, fn)`) that hands out reused scratch values without ids, and request models once per key, for example by caching the key set.

### IN-02: The explosion layer's header overstates its fidelity and its allocation behaviour

**File:** `src/render/bodies/explosions.ts:16`, `:56-58`, `:413-420`
**Issue:** Line 16 says "nothing is allocated by `add` or `update`". In fact `add` builds a template string for the seed and a closure in `createSeededRandom`. Lines 56-58 say the instance colour "lands exactly on Oolite's display value". The colour written is `srgbToLinear(c * alpha)`, and the texture alpha `a` then scales it in linear space. The result is `encode(linear(c*alpha) * a)`, while Oolite blends `c*alpha*a` in display space. The two agree only where `a` is 0 or 1, which is not true at the soft edges of the cloud and flash masks.
**Fix:** Reword both claims: "no per-particle or per-frame allocation", and "exact for fully opaque mask texels; partially transparent texels are attenuated in linear light".

### IN-03: The `--export-pin` check against writing inside the repository compares path text only

**File:** `scripts/vendor-oolite.sh:195-207`
**Issue:** The script canonicalises `out_abs` only when the directory already exists. For a new directory, a path such as `/tmp/../home/opencode/git/wegolite/x` (or one under a symlinked parent) does not textually start with `"$repo"/`. It passes the `case` test, and `mkdir -p` then creates the export inside the work tree. The impact is small (the script is human-run, and the mistake shows up in `git status`), but the guard does not do what its message says.
**Fix:** Run `mkdir -p "$out_abs"` before resolving it, then canonicalise with `out_abs=$(cd "$out_abs" && pwd -P)` and run the `case` test on the canonical path.

### IN-04: The layering rationale in `kill.ts` no longer holds

**File:** `src/sim/world/kill.ts:7-9`; `src/sim/world/debris.ts:77-80`
**Issue:** The module doc says `killShip` lives in `src/sim/world/` "so that Phase 16's debris expiry inside `stepWorld` can call it without importing combat". `kill.ts` now imports `./debris.ts`, which imports `../combat/constants.js`, `../combat/octree.js` and a type from `../combat/hit.js`, so `stepWorld` depends on combat after all. There is no cycle, because none of those combat modules imports `world/`. The statement is stale, though, and the dependency direction it was protecting is gone.
**Fix:** Either update the doc to name the narrow combat imports (pure geometry: `toWegoliteLocal`, `randomOctreePoint`), or move `toWegoliteLocal` and the octree walk into a neutral module (for example `src/sim/geometry/`) that both `world/` and `combat/` import.

### IN-05: Nothing stops a debris key from colliding with an NPC ship key

**File:** `src/app/npc-models.ts:56-65`, `src/content/schemas/ship-debris.ts:44-63`, `src/sim/world/debris.ts:566-579`
**Issue:** The debris schema requires unique debris keys but does not check them against NPC keys. `trafficModelGlb` resolves the ship catalogue first, so a debris record that shares a key with an NPC ship would be drawn with the ship's GLB. In the sim, `debrisMassOf` matches by `specKey` alone, so a ship with the same key as a debris model would be given that model's mass if it were ever a blast candidate. The blast filters on kind today, so that path is unreachable. The current keys (`barrel`, `alloy`, `wreckage-component`, `more-wreckage2`..`5`) do not collide with the nine NPC keys.
**Fix:** Add a build-time check in `tools/oolite-ingest/generate.ts`, or a content test, that the debris keys and `NPC_SHIP_KEYS` are disjoint.

### IN-06: Debris and explosions are drawn at the stepped position while the camera is interpolated

**File:** `src/app/session/render-driver.ts:196-223`
**Issue:** The camera uses `interpolatePose(previousPose, currentPose, alpha)`, but the debris contacts are read at the current tick's position and are not interpolated. Debris now moves (blast kicks can reach `MAX_ENTITY_VELOCITY`), so at 144 Hz a fast pod can appear to judder against the smoothly moving camera. NPC ships already work the same way, which is why this is Info.
**Fix:** If it shows up in UAT, give contacts the previous tick's position (or the velocity) so the layer can lerp by `alpha`, without exposing any id.

---

_Reviewed: 2026-11-17T02:04:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_

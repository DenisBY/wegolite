---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 07
subsystem: render
tags: [render, explosions, instancing, event-router, presentation, world-17, d16-08, d16-21, d16-22]
status: complete

requires:
  - phase: 16-05
    provides: "explosions.json and the two particle textures under public/textures"
  - phase: 16-06
    provides: "TrafficContent.explosion: the compiled oolite-default-ship-explosion record in a traffic-on session"
provides:
  - "src/render/bodies/explosions.ts: createExplosionLayer, ExplosionLayer, ExplosionSettings, ExplosionTextureLoader, EXPLOSION_POOL (8), EXPLOSION_MAX_PARTICLES (10), FLASH_DURATION, FLASH_ALPHA, FLASH_GROWTH_FACTOR, FLASH_MIN_GROWTH"
  - "SystemScene.explosions, SystemSceneParts.explosions, SystemSceneFactories.explosions; built after shots, added to the scene and the disposer, freed on the half-built path"
  - "shipDestroyed is the 22nd routed kind, handled by dockFeedback (D16-21); the arm reads position and radius only"
  - "The render driver calls currentScene.explosions.update(cameraWorld, camera.quaternion, flightTime) each frame, after shots.update and before the render"
affects: [16-08, 16-09]

requirements-completed: []  # WORLD-17 is advanced, not closed: 16-08 draws the debris and 16-09 closes it with the browser draw-call and hash proof; REQUIREMENTS.md stays open, as in 16-02, 16-04 and 16-06

plan_head_before: e117a2b5a5ad6c340c498bef62f68bd2c6e72981
plan_head_after: f14039db724f5509d239179b1ee682ef82158e23
commits: 2

actuals:
  tokens: 16900
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A pooled InstancedMesh effect layer evaluated as a closed function of flight time: no per-frame state, nothing allocated by add or update"
    - "Display-space Oolite colours fed through srgbToLinear into instanceColor, the particle texture bound as alphaMap, so the sRGB output encode lands on Oolite's display value"
    - "Render-only randomness from createSeededRandom(fnv1a32(position and radius))"

key-files:
  created:
    - src/render/bodies/explosions.ts
    - tests/render/explosion-layer.test.ts
  modified:
    - src/render/system-scene.ts
    - src/app/session/event-router.ts
    - src/app/session/render-driver.ts
    - tests/app/session-order.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/app/dispose.test.ts
    - CHANGELOG.md

key-decisions:
  - "The quad edge is 2 x Oolite's particle size (and 2 x the flash's _diameter): Oolite draws both from -size to +size (OOParticleSystem.m:124-134, OOLightParticleEntity.m:179-191)"
  - "The particle textures are alpha masks (kOOTextureAlphaMask), bound as alphaMap with NoColorSpace; the instance colour is srgbToLinear(clamp(c) x alpha), which reproduces Oolite's GL_SRC_ALPHA, GL_ONE blend in display space under the renderer's sRGB output"
  - "The flash's distance attenuation by no_draw_distance and the cloud's drift with the dead ship's velocity are not reproduced (the event carries no velocity)"

metrics:
  duration: 21min
  completed: 2026-11-17
---

# Phase 16 Plan 07: The Explosion Layer Summary

**A destroyed ship now gets Oolite's default explosion in the render: a cloud of at most 10 particles and a white flash, drawn as two instanced meshes over a pool of 8 explosions. `shipDestroyed` reaches the layer through the dockFeedback subscriber, and the arm reads only the event's position and radius.**

## What was built

### Router widening (D16-21)
- `ROUTED_EVENT_KINDS` now has 22 kinds. `"shipDestroyed"` is the last one, and `EVENT_KIND_SUBSCRIBER.shipDestroyed` is `["dockFeedback"]`. `EVENT_SUBSCRIBER_ORDER` is unchanged. `entityRemoved` is still unrouted and passes through.
- The `createDockFeedbackFlow` arm reads `ctx.core.scene` and `ctx.core.npcTraffic?.explosion` when it runs. It calls `scene.explosions.add(event.position, event.radius, setting, flightTime)` only when both exist. It reads no other event field. The region-scoped grep finds no `event.(id|killer|specKey)`, and a test passes an event whose `id`, `killer` and `specKey` getters throw.
- Session-order pins: the table now has the `shipDestroyed` row, the count assertions read `toHaveLength(22)`, the test names say "22", and the comment says "Twenty kinds have one subscriber". The reserved-kinds pass-through test is still valid: the harness has no scene, so the arm does nothing. New arm cases: one add with the right arguments; no-ops with no scene, no setting or no traffic; the throwing getters; the world left untouched.

### The layer (`src/render/bodies/explosions.ts`)
- **Pool:** `EXPLOSION_POOL = 8` explosions in a ring, and a ninth overwrites the oldest. `EXPLOSION_MAX_PARTICLES = 10` (D16-08), so the cloud's `InstancedMesh` has 80 instances and the flash's has 8. Both share one unit `PlaneGeometry`. Both use `DynamicDrawUsage` with `frustumCulled = false`, and their `instanceColor` buffers are allocated in the constructor.
- **Cloud (from `OOExplosionCloudEntity.m`):** count `min(count, 10)`; `size = radius x settings.size`; growth `settings.growthRate x size`; brightness clamped to at least 1. Speeds are `min + 0.5(u+u)(max-min)` between `0.8` and `1.2 x size x spread`, along a uniform unit vector. A particle's size starts at its speed and grows by the growth rate. The colour draws are ordered `c1 >= c2 >= c3` and assigned by `color_order` (`white` uses one grey draw). Alpha is `alpha x (1 - t/duration)`. The channel fade is sequential, in closed form, with `fadeRate = count x brightness / 25`: the tertiary channel fades at 0.5x, then the secondary at 1x, then the primary at 2x.
- **Flash (from `OOFlashEffectEntity.m`, D16-22):** `FLASH_DURATION = 0.4`, `FLASH_ALPHA = 0.5`, `FLASH_GROWTH_FACTOR = 150`, `FLASH_MIN_GROWTH = 600`. The flash is white. Its size starts at the radius and grows by `max(150 x radius, 600)` per second. Alpha is `0.5 t/tf` for `t < tf = 0.667 x 0.4`, then `0.5 (0.4 - t)/(0.4 - tf)`. It is retired once `t > 0.4`.
- **Drawing:** positions are camera-relative, subtracted in float64 before the float32 matrix write. Every quad takes the camera quaternion. Blending is additive (Oolite's `GL_SRC_ALPHA, GL_ONE`) with `depthWrite`, `toneMapped` and `fog` all false. Two draw objects are visible while an explosion is live, one after its flash ends, and none once everything has expired. 8 or 50 explosions in one frame still make only two.
- **Retirement:** a slot is freed when neither its cloud nor its flash is live, or when the flight time has gone backwards (`t < 0`).
- **Textures:** both load on the first valid `add` and never on a cold start: the setting's cloud texture, then `oolite-particle-flash.png`, under `<baseUrl>textures/`. Before a URL is built, the cloud name is checked against `/^oolite-particle-[a-z0-9-]+\.png$/` (T-16-23). A name that fails the check skips the `add`.
- **Dispose** frees the shared quad, both materials and every loaded texture, once each. Calling `add` or `update` after dispose does nothing.
- **Determinism:** the particles come from `createSeededRandom(parseInt(fnv1a32("x,y,z,radius"), 16))`. No sim stream is read, and no entity id is stored.

### Scene and driver wiring
- `system-scene.ts`: `REAL_FACTORIES.explosions = () => createExplosionLayer()`. The layer is built right after `shots` with `built.add`, its root is added to the scene, and it is registered in the disposer.
- `render-driver.ts`: `currentScene.explosions.update(cameraWorld, currentScene.camera.quaternion, currentState.flightTime)` runs after `shots.update` and before `renderer.render`.

## Tasks and commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (tracer) | A destroyed ship shows the explosion cloud, event to scene to frame | 732ac73 | explosions.ts (new), system-scene.ts, event-router.ts, render-driver.ts, explosion-layer.test.ts (new), session-order.test.ts, render-driver.test.ts, dispose.test.ts |
| 2 | The flash, lazy textures and disposal, and the changelog | f14039d | explosions.ts, explosion-layer.test.ts, dispose.test.ts, CHANGELOG.md |

The tracer gate ran before Task 2 started. Task 1's `<verify>` passed: the four targeted test files (117 tests) and typecheck.

## Verification

- Targeted runs (Docker): `tests/render/explosion-layer.test.ts`, `tests/app/session-order.test.ts`, `tests/app/session/render-driver.test.ts` and `tests/guards/entity-id-scope.test.ts` passed. `tests/render` with `tests/app/dispose.test.ts` and `tests/app/session-order.test.ts` passed: 20 files, 338 tests.
- Full suite in Docker (`docker compose run --rm test`, with coverage): exit 0, 215 files, 5512 passed, 10 skipped.
- `docker compose run --rm lint`: exit 0. `docker compose run --rm typecheck`: exit 0.
- **Remote `verify`** (`/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify`) at committed HEAD **f14039d**: **exit 0** in **150 s**. It ran lint, typecheck, `assets:check` (no differences), the unit tests (215 files), the build, `check:dist` (123 files, no harness marker) and the e2e smoke subset (27 of 27 passed). The traffic-off cold start requests no particle texture, because nothing explodes.
- No browser draw-call or hash proof was run in this plan. That proof is plan 16-09.
- `src/sim` is unchanged. The NPC acceptance run is not required.
- Acceptance greps: `shipDestroyed` appears 4 times in event-router.ts; the arm region has 0 matches for `event.(id|killer|specKey)`; `toHaveLength(22)` appears once; `explosions` appears 13 times in system-scene.ts; `explosions.update` appears once in render-driver.ts; the `EXPLOSION_MAX_PARTICLES` and `FLASH_MIN_GROWTH` exports exist; `oolite-particle-flash.png` appears 2 times; `explosions` appears 8 times in dispose.test.ts; the Unreleased changelog contains "explodes" once and "no explosion" 0 times.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Scene doubles in two test files outside Task 1's file list**
- **Found during:** Task 1
- **Issue:** the new `currentScene.explosions.update` call failed 13 render-driver tests, because their scene double had no `explosions`. The new required `SystemSceneParts.explosions` also broke typecheck in `tests/app/dispose.test.ts`, which belongs to Task 2's file list.
- **Fix:** `flyableScene` in `tests/app/session/render-driver.test.ts` got an `explosions.update` double and a new test that pins the call's arguments and its order before the render. Task 1 added the explosion layer to `dispose.test.ts`'s `buildParts`, and Task 2 added the resource counting and the ownership test as planned.
- **Commit:** 732ac73

**2. [Rule 1 - Fidelity] Quad edge, alpha mask and colour space made explicit**
- **Found during:** Task 1, reading `OOParticleSystem.m` and `OOLightParticleEntity.m`
- **Issue:** the plan names the particle value a "diameter", but Oolite draws both quads from `-size` to `+size`. Taking the plan literally would draw everything at half Oolite's size. Oolite's colours are also display values, and its textures are alpha masks.
- **Fix:** the unit quad is scaled by `2 x size`. The texture is bound as `alphaMap` with `NoColorSpace`. The instance colour is `srgbToLinear(clamp(c) x alpha)`, so the renderer's sRGB output encode gives Oolite's display value under the same additive blend. The tests read back the display value with `linearToSrgb`.
- **Commit:** 732ac73, f14039d

**3. [Rule 2 - Correctness] A flash outlives a cloud setting shorter than 0.4 s**
- **Found during:** Task 2
- **Issue:** with one retirement rule per slot, a setting whose `duration` is under the flash's 0.4 s would have cut the flash short.
- **Fix:** the cloud and the flash each test their own lifetime, and the slot is freed only when both are done. A test covers it.
- **Commit:** f14039d

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or storage was added. The only new URL is built from the regex-checked particle file name under the app's own `textures/` directory (T-16-23), and `connect-src 'self'` is unchanged.

## Notes for later plans

- 16-08 (debris layer) adds the debris sentence to the Unreleased changelog entry, as the plan says. The closing "no explosion or wreckage yet" sentence was removed here.
- 16-09 should count the explosion layer as at most 2 draw calls in the browser draw-call budget, and the hash proof with the layers on should treat it as presentation only.
- `tests/guards/harness-isolation.test.ts` did not fail in any run of this plan.

## State updates

- ROADMAP: 7/9 plans and the 16-07 checkbox are ticked. STATE now points at plan 8 and records the metric row, three decisions and the session.
- `requirements.mark-complete WORLD-17` ticked the requirement. That change was reverted before the commit, because WORLD-17 stays open until 16-09, as 16-06 recorded.

## Self-Check: PASSED

- FOUND: src/render/bodies/explosions.ts
- FOUND: tests/render/explosion-layer.test.ts
- FOUND: 732ac73
- FOUND: f14039d

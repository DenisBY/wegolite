---
phase: 16-wreckage-cargo-and-the-entity-cap
plan: 08
subsystem: render
tags: [render, debris, instancing, contacts, tumble, lazy-load, world-17, d16-10, d16-26, oc-2]
status: complete

requires:
  - phase: 16-03
    provides: "the seven debris GLBs and ships-debris.json (one primitive each)"
  - phase: 16-06
    provides: "TrafficContent.debrisModels: the compiled debris records in a traffic-on session"
  - phase: 16-07
    provides: "the scene and driver layout the debris layer slots into (after npcs, before shots and explosions)"
provides:
  - "src/sim/world/contacts.ts: DebrisContact and debrisContacts(world): live cargo and wreckage as id-free copies in ascending id order"
  - "src/render/bodies/debris.ts: createDebrisLayer, DebrisLayer, DebrisModelInfo, DEBRIS_INSTANCE_CAPACITY (256), tumbleOrientation"
  - "SystemScene.debris, SystemSceneParts.debris, SystemSceneFactories.debris: built after npcs, added to the scene and the disposer, freed on the half-built path"
  - "src/app/npc-models.ts: trafficModelGlb(traffic, key), the loader's glbFor: ship catalogue first, then debrisModels"
  - "The render driver requests the debris keys through the same loader and calls currentScene.debris.update(contacts, cameraWorld, npcModels.loaded(), debrisModels ?? [], flightTime) each frame, after npcs.update"
affects: [16-09]

requirements-completed: []  # WORLD-17 is advanced, not closed: 16-09 closes it with the browser draw-call, cold-start and hash proof; REQUIREMENTS.md stays open

plan_head_before: cc1bee3a7bb5ec14cbc8cdfc69aad38d6a6cd4de
plan_head_after: 970783ff19bb28ec9cdff5ea9fa14296962cd38f
commits: 2

actuals:
  tokens: 14600
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "A second index-addressed instanced layer on the NPC layer's pattern, with a per-instance uniform scale (contact radius over model radius)"
    - "A render-side cosmetic derived from the contact's own orientation and the flight time, never from an entity id (OC-2)"
    - "An allocation-free in-place helper (tumbleInto) behind a pure exported function (tumbleOrientation), so the tests and the per-frame loop share one implementation"

key-files:
  created:
    - src/render/bodies/debris.ts
    - tests/render/debris-layer.test.ts
  modified:
    - src/sim/world/contacts.ts
    - src/render/system-scene.ts
    - src/app/session/render-driver.ts
    - src/app/game-session.ts
    - src/app/npc-models.ts
    - tests/sim/world/contacts.test.ts
    - tests/app/session/render-driver.test.ts
    - tests/app/npc-models.test.ts
    - tests/app/dispose.test.ts
    - CHANGELOG.md

key-decisions:
  - "Tumble (D16-10, OC-2): tumbleOrientation(q, info, t) = normalise(q x axisAngle(w/|w|, |w| t)) with the body rate w = (maxFlightPitch q.y, 0, maxFlightRoll q.x); a zero or non-finite rate or time returns q"
  - "The loader's glbFor moved into trafficModelGlb (src/app/npc-models.ts) so the ship-then-debris resolution is unit-tested; game-session.ts calls it"
  - "A key with no model info in the debris catalogue is never built, and a piece whose radius ratio is not finite and positive is skipped"

metrics:
  duration: 20min
  completed: 2026-11-17
---

# Phase 16 Plan 08: The Debris Layer Summary

**The pods, plates and wrecks a kill leaves are now drawn. They reach the render as id-free debris contacts and are drawn by one instanced mesh per model primitive, scaled to the wreck size. Each piece tumbles by a pure render rule built from its orientation and Oolite's tumble rates. The models load lazily through the existing per-session loader and its first-in-flight-frame latch.**

## What was built

### Contacts (`src/sim/world/contacts.ts`)
- `DebrisContact { position, orientation, radius, specKey }` and `debrisContacts(world)`. It lists every live, non-dead entity of kind `cargo` or `wreckage` in ascending id order. Positions and orientations are copied. A contact has no id and no `kind` field. Ships, dead entities and an undefined world give nothing.
- `npcContacts` is unchanged, so the scanner still shows ships only (D16-26). The doc comment records the gap.

### The layer (`src/render/bodies/debris.ts`)
- `DEBRIS_INSTANCE_CAPACITY = 256`. The test pins it equal to `MAX_ENTITIES`. Contacts beyond it are dropped in order.
- The layer follows `createNpcLayer`. A key gets one `InstancedMesh` per primitive the first time one of its contacts has both a loaded model and a catalogue record. The meshes share the cached geometry and material, use `DynamicDrawUsage`, set `frustumCulled = false`, and are placed camera-relative in float64 before the float32 write. `count` is written per key, and a key with no contacts is hidden.
- **Call count per model:** each stock debris GLB has one primitive (16-03), so each debris key present adds exactly one draw object. The seven debris models can add at most seven, however many pieces exist. The test with 200 pods and 3 wrecks of two keys gives 3 visible meshes with counts 200, 2 and 1.
- **Scale:** `contact.radius / info.radius`, found by a linear scan of the short catalogue with no allocation. Pods and plates are drawn at 1 and wrecks at their kill-time size. A ratio that is not finite and positive skips the piece.
- **Tumble (D16-10, OC-2):** `tumbleOrientation(q, info, t)` uses the constant body rate `w = (maxFlightPitch x q.y, 0, maxFlightRoll x q.x)`, with pitch about local x and roll about the local z nose axis. This stands in for `performTumble`'s uniform draws in `[-max, max]` (`ShipEntityAI.m:473-479`). The result is `q x axisAngle(w/|w|, |w| t)`, normalised. The layer uses the in-place `tumbleInto` with a reused quaternion, so nothing is allocated per piece.
- **Dispose** frees only the instance buffers, never the cached geometry or material. It is idempotent, and `update` after dispose does nothing.

### Wiring
- `system-scene.ts`: `REAL_FACTORIES.debris = () => createDebrisLayer()`. The layer is built after `npcs` with `built.add`, its root is added to the scene, and it is registered in the disposer ("only the instance buffers").
- `render-driver.ts`: after `npcs.update`, the driver builds `debrisContacts(ctx.core.worldLifecycle?.world)`, calls `npcModels.request(debris keys)`, then calls `currentScene.debris.update(debris, cameraWorld, npcModels.loaded(), ctx.core.npcTraffic?.debrisModels ?? [], currentState.flightTime)`. The request does nothing until the latch opens, so a cold start requests no debris GLB.
- `game-session.ts`: the loader's `glbFor` is `(key) => trafficModelGlb(ctx.core.npcTraffic, key)`. It looks in the ship catalogue first, then in `debrisModels`, and reads both at call time.

## Tasks and commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (tracer) | The pods a kill leaves are drawn, from sim contact to loaded model to frame | 5670236 | contacts.ts, debris.ts (new), system-scene.ts, render-driver.ts, game-session.ts, npc-models.ts, contacts.test.ts, debris-layer.test.ts (new), render-driver.test.ts, npc-models.test.ts, dispose.test.ts |
| 2 | The pieces tumble, the scene disposes the layer, and the changelog | 970783f | debris.ts, debris-layer.test.ts, dispose.test.ts, CHANGELOG.md |

The tracer gate ran before Task 2 started. Task 1's `<verify>` passed: the seven targeted files (95 tests), including `entity-id-scope`, and typecheck.

## Verification

- Targeted (Docker): `tests/render` with `tests/app/dispose.test.ts`, `tests/sim/world/contacts.test.ts`, `tests/app/session/render-driver.test.ts` and `tests/guards/entity-id-scope.test.ts`: 23 files, 345 tests passed.
- Full suite in Docker with coverage (`docker compose run --rm test`): exit 0, 216 files, 5545 passed, 10 skipped. `tests/guards/harness-isolation.test.ts` did not fail.
- `docker compose run --rm lint`: exit 0 (eslint clean, prettier clean). `docker compose run --rm typecheck`: exit 0.
- **Remote `verify`** (`wegolite-remote-run.sh run --rm verify`) at committed HEAD **970783f**: **exit 0** in **150 s**. It ran lint, typecheck, `assets:check` (no differences), 216 unit files (5545 passed, 10 skipped), the build, `check:dist` (123 files, no harness marker) and the e2e smoke subset (27 of 27 passed).
- **Remote acceptance run** (`wegolite-remote-run.sh run --rm test npm run test:acceptance`, QUAL-11, required because `src/sim/world/contacts.ts` changed) at **970783f**: **exit 0** in **78 s**, 21 of 21 tests passed. Every one of the 20 seeds reported stuck 0, frozen 0, hullCrossingEpisodes 0, hullCrossingsUnexcused 0, repairs 0, aiFaulted 0, aiDropped 0 and hashFailures 0. Detectors and thresholds are unchanged.
- No browser draw-call, cold-start or hash proof was run with the layers on. That proof is plan 16-09.
- Acceptance greps: `export function debrisContacts` 1; `export function createDebrisLayer` 1; `debris` in system-scene.ts 15 (at least 4 required); `debrisContacts` in render-driver.ts 2; `debrisModels` in game-session.ts 1, in the comment beside the `trafficModelGlb` call (see deviation 1); `export function tumbleOrientation` 1; `debris` in dispose.test.ts 25; `tumble` in the Unreleased changelog 1.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] The loader's glbFor resolver moved into a tested helper**
- **Found during:** Task 1
- **Issue:** the behaviour list requires a test that `glbFor` returns a debris record's `glb` for a debris key and the NPC record's for a ship key. An inline lambda in `createGameSession` cannot be tested without a WebGL session.
- **Fix:** `trafficModelGlb(traffic, key)` is exported from `src/app/npc-models.ts`, which the plan's verify set already covers through `tests/app/npc-models.test.ts`, and `game-session.ts` calls it. Three new tests cover a ship key, debris keys, and an unknown key, no traffic or no debris catalogue. `npc-models.ts` and its test are outside the plan's file list. The `debrisModels` grep on game-session.ts matches the comment beside the call.
- **Commit:** 5670236

**2. [Rule 3 - Blocking] dispose.test.ts touched in Task 1**
- **Found during:** Task 1
- **Issue:** the new required `SystemSceneParts.debris` broke typecheck in `tests/app/dispose.test.ts`, a Task 2 file.
- **Fix:** Task 1 added a bare `createDebrisLayer()` to `buildParts`. Task 2 replaced it with a layer drawn on a cached model, counted its instance buffers, checked that the cached geometry, material and texture are never freed, and added the ownership and half-built test.
- **Commits:** 5670236, 970783f

**3. [Rule 1 - Accuracy] Changelog wording on the burn-out time**
- **Found during:** Task 2
- **Issue:** the plan's wording says the wreckage "burns out within a second". 16-04's burn-down gives energies up to 1350 at roughly 1000 per second, so the longest wreck lasts a little over a second.
- **Fix:** the entry says "burns out after about a second".
- **Commit:** 970783f

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or storage was added. Debris GLB paths come only from the validated catalogue, and `loadNpcModel` re-checks `NPC_GLB_PATH_PATTERN` before any fetch (T-16-26). Contacts carry no id, and the id-scope guard passed (T-16-25). The draw objects are bounded by the debris model primitives at a fixed capacity of 256 (T-16-27).

## Notes for 16-09

- Budget: the debris layer adds at most one draw object per debris key present, so at most 7 with the stock catalogue. The explosion layer adds at most 2.
- Cold start: debris keys are requested only after `npcModels.open()`, the same latch as the ships. A traffic-off cold start has no world and therefore no debris contacts.
- D16-26 (debris not on the scanner) and OC-2 (tumble from the orientation) still need their Key Decisions rows, as the plan says.

## State updates

- ROADMAP: the 16-08 checkbox and 8/9 plans. STATE points at plan 9.
- WORLD-17 and DATA-16 stay open in REQUIREMENTS.md until 16-09.

## Self-Check: PASSED

- FOUND: src/render/bodies/debris.ts
- FOUND: tests/render/debris-layer.test.ts
- FOUND: 5670236
- FOUND: 970783f

---
phase: 03-flight-in-the-lave-system
plan: 03
subsystem: rendering / shaders / content
tags:
  - three.js
  - webgl2
  - glsl
  - shader-material
  - canvas-texture
  - deterministic-starfield
  - gltf
  - polygon-offset

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 01's SystemLayout, SystemScene/sync/asset cache and the baseline bodies
  - phase: 02-data-pipeline-content-compiler
    provides: the compiled g0-s7 Lave record and the coriolis.glb/cobra3.glb assets

provides:
  - src/render/shaders/planet.glsl.ts (PLANET_VERTEX_SHADER, PLANET_FRAGMENT_SHADER)
  - src/render/bodies/planet.ts (createPlanet, seedToUniform, landThresholdFor)
  - src/render/bodies/sun.ts (createSun with the 1.2282R corona)
  - src/render/bodies/starfield.ts (createSystemStarfield)
  - src/render/bodies/station.ts (createStation returning root/dock/update/dispose)
  - src/render/bodies/beacon.ts (createBeacon)
  - src/render/menu-scene.ts (createMenuScene, built but unwired)
  - src/render/mesh.ts isPoints predicate
  - tests/render/planet-shader.test.ts, starfield.test.ts, station.test.ts
affects:
  - 03-04 (torus/mass lock fly through the new bodies)
  - 03-05 (HUD scanner reads the station/nav buoy/witchpoint positions)
  - 03-07 (launch cinematic shows the Cobra against this station)
  - 03-09 (SceneManager.enterMenu installs createMenuScene; disposal covers the new bodies)

actuals:
  tokens: 18190
  tasks: 3
  commits: 3
  plan_head_before: 20acecab40afa87991d59da8dab015a56dda6bb0
  plan_head_after: 86f55fc

tech-stack:
  added: []
  patterns:
    - one procedural ShaderMaterial per planet, with explicit log-depth/tonemapping/colour-space chunks
    - object-space noise sampling so the surface never sees a float32 world position
    - content-driven uniforms hashed from the authored random_seed string with fnv1a32
    - deterministic golden-angle star shell with a seeded jitter, capped and preallocated
    - camera-facing CanvasTexture corona whose radius comes from corona_flare
    - GLB clone ownership: tweak the clone, never the cached material graph
    - explicit renderOrder + polygonOffset for coplanar GLB layers

key-files:
  created:
    - src/render/shaders/planet.glsl.ts
    - src/render/bodies/planet.ts
    - src/render/bodies/sun.ts
    - src/render/bodies/starfield.ts
    - src/render/bodies/beacon.ts
    - src/render/menu-scene.ts
    - tests/render/planet-shader.test.ts
    - tests/render/starfield.test.ts
    - tests/render/station.test.ts
  modified:
    - src/render/bodies/station.ts
    - src/render/system-scene.ts
    - src/render/sync.ts
    - src/render/mesh.ts
    - src/app/game-session.ts
    - src/app/scene-manager.ts
    - tests/e2e/scene.spec.ts
  deleted:
    - src/render/precision-scene.ts

key-decisions:
  - "The planet's land/sea threshold is 1 - land_fraction plus a sub-percent seeded jitter (0.35 for Lave), not a hardcoded 0.5, so 65% land actually renders as 65% land."
  - "The surface uses four noise octaves and the clouds three: nine octaves kept the procedural planet below ~8 fps on headless SwiftShader, where the fixed-step loop then advances slower than wall time."
  - "corona_flare sets the corona radius (1.2282R for Lave), corona_hues blends a white inner layer with a warm outer one, and corona_shimmer is the breathing speed — never brightness."
  - "The planet spin comes from the sim clock passed into applyFrame; FlightPose carries no clock, so game-session supplies state.flightTime explicitly."
  - "createMenuScene is built but deliberately unwired; plan 09's SceneManager.enterMenu is its single caller."
  - "The station factory clones materials before applying polygonOffset/emissiveIntensity, so the cached GLB materials the menu scene reuses are never mutated."

patterns-established:
  - "A custom shader is accepted only with <common>, both log-depth chunks, <tonemapping_fragment> and <colorspace_fragment>, asserted by a source-string test with a length guard."
  - "Noise is sampled on normalize(localPosition); the sun direction is inverse-rotated into object space on the CPU in float64."
  - "A content-driven GPU buffer is clamped and preallocated (star count), and its seed is the authored random_seed string hashed once."
  - "A GLB is cloned, its materials are cloned before any tweak, and its node contract is asserted both from the asset bytes and from a synthetic graph."

requirements-completed:
  - WORLD-02
  - WORLD-03

coverage:
  - id: D1
    description: "Lave's planet is one sphere with one procedural material carrying surface, clouds, polar caps, air rim and the day/night terminator, with the compiled palette/fractions/seed as uniforms"
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#carries the log-depth chunks in the vertex shader"
        status: pass
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#uses Lave's compiled palette and fractions"
        status: pass
      - kind: unit
        ref: "tests/render/planet-shader.test.ts#spins 0.4504 rad after 100 s and is the identity at 0 s"
        status: pass
      - kind: e2e
        ref: "tests/e2e/scene.spec.ts#boots to the title, starts docked at Lave, launches and flies"
        status: pass
    human_judgment: false
  - id: D2
    description: "The sun is an emissive sphere at 84,449.095459 m with an additive 1.2282R camera-facing corona built from the real corona_* semantics"
    requirement: WORLD-03
    verification:
      - kind: e2e
        ref: "tests/e2e/scene.spec.ts#boots to the title, starts docked at Lave, launches and flies (sun body present, no console/page error)"
        status: pass
    human_judgment: true
    rationale: "The corona is a CanvasTexture glow; whether it reads as a thin Oolite rim at 1080p is a visual judgement no probe can make."
  - id: D3
    description: "The starfield is exactly 8,887 deterministic points on the 1.5e6 m shell, seeded by random_seed and tinted by sun_color"
    requirement: WORLD-03
    verification:
      - kind: unit
        ref: "tests/render/starfield.test.ts#uses exactly Lave's authored sky_n_stars"
        status: pass
      - kind: unit
        ref: "tests/render/starfield.test.ts#is byte-identical for the same seed and differs for another"
        status: pass
      - kind: unit
        ref: "tests/render/starfield.test.ts#clamps the count at both ends without allocating unbounded memory"
        status: pass
    human_judgment: false
  - id: D4
    description: "The Coriolis keeps its four node names and dock translation, has polygonOffset 1/1 on the hull and renderOrder hull->faceplate->tris->dock"
    requirement: WORLD-02
    verification:
      - kind: unit
        ref: "tests/render/station.test.ts#leaves the dock transform alone and orders the coplanar layers"
        status: pass
      - kind: unit
        ref: "tests/render/station.test.ts#has a 500 m x/y half-extent"
        status: pass
      - kind: e2e
        ref: "tests/e2e/scene.spec.ts#boots to the title, starts docked at Lave, launches and flies (station body and position)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The dock opening does not zipper at 500 m or 100 km, and the station rolls about local Z facing the planet"
    requirement: WORLD-02
    verification:
      - kind: unit
        ref: "tests/render/station.test.ts#rolls about local +Z on top of the base orientation"
        status: pass
    human_judgment: true
    rationale: "Z-fighting and the dock's facing are final-raster judgements; the numeric probe proves the offsets and the orientation, not the absence of a visible zipper."
  - id: D6
    description: "The nav buoy (10,000 m from the station along stationToPlanet) and the witchpoint (origin) are visible procedural markers"
    requirement: WORLD-03
    verification:
      - kind: e2e
        ref: "tests/e2e/scene.spec.ts#boots to the title, starts docked at Lave, launches and flies (navBuoy distance/axis, witchpoint origin)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Manual visual acceptance: Lave reads as green/mauve with polar ice and a visible terminator, a thin white corona, and Oolite-like star density at 1080p"
    requirement: WORLD-03
    verification: []
    human_judgment: true
    rationale: "WORLD-03 fidelity is a visual judgement; pixel diffing is forbidden (D-08), and this pass has not been performed by the executor."
  - id: D8
    description: "src/render/precision-scene.ts is deleted and no import remains"
    requirement: WORLD-03
    verification:
      - kind: other
        ref: "rg -n precision-scene src tests tools (no matches)"
        status: pass
    human_judgment: false

duration: 13min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 3: Lave's Planet, Sun, Starfield and Coriolis Summary

**Lave now renders as Oolite: one procedural planet material with the compiled green/mauve palette, clouds, polar ice, air rim and a sim-clock terminator; a white sun disc with the real 1.2282R corona; 8,887 deterministic stars; and a Coriolis whose four coplanar layers are depth-ordered instead of z-fighting, flanked by procedural nav-buoy and witchpoint markers.**

## Performance

- **Duration:** ~13 min (Docker waits included)
- **Started:** 2026-11-03T17:21:31Z
- **Completed:** 2026-11-03T17:34:23Z
- **Tasks:** 3
- **Files modified:** 17 (1,505 insertions, 187 deletions; 1 file deleted)

## Accomplishments

- `src/render/shaders/planet.glsl.ts` is a single vertex/fragment pair with `<common>`, both log-depth chunk pairs, `<tonemapping_fragment>` and `<colorspace_fragment>`; the surface, clouds, polar blend, air rim and terminator are all in that one material (no cloud or atmosphere shell, no texture).
- The planet material takes every visual value from `g0-s7`: the seven palette colours, `land_fraction 0.65`, `cloud_fraction 0.26`, `cloud_alpha 0.75`, `air_density 0.75`, `ambient_level 0.1`, and a seed hashed from the authored `"56 173 156 20 29 21"` with `fnv1a32`. The land/sea threshold is `1 − land_fraction` with a sub-percent seeded jitter (0.35 for Lave).
- `update(elapsedSeconds)` spins the planet at `rotation_speed 0.004504 rad/s` about local +Y (0.4504 rad after 100 s) and inverse-rotates the sun direction into object space, so the terminator stays fixed while the surface turns. No wall clock is read.
- The sun is an unlit `toneMapped:false` sphere at 84,449.095459 m; its corona is a camera-facing additive plane at `R × (1 + 8 × 0.028528) = 1.2282R`, with `corona_hues` as a two-layer blend and `corona_shimmer` as animation speed.
- `createSystemStarfield` produces exactly `sky_n_stars` (8,887 for Lave) points on the 1.5e6 m shell, clamped to 20,000, seeded by `fnv1a32(random_seed)`, ~80% white / 20% `sun_color`.
- The Coriolis is assembled without touching the dock transform: hull polygonOffset 1/1, renderOrder 0/1/2/3, every node `depthWrite:true`, dock `depthTest:true`, `emissiveIntensity 0.8`, and `update(stationAngle)` rolls about local +Z on the base quaternion (no `lookAt`).
- The nav buoy and witchpoint are procedural octahedron+point markers at the layout positions; the probe now publishes all seven body names.
- `src/render/precision-scene.ts` is deleted and nothing imports it.
- `src/render/menu-scene.ts` exists (starfield + Cobra clone) but is intentionally unwired until plan 09.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "Lave's surface and terminator from compiled planetinfo to the GPU"** - `ec3d678` (feat)
2. **Task 2: Sun, corona and deterministic starfield at Oolite's real semantics** - `c78120a` (feat)
3. **Task 3: Assemble the Coriolis without z-fighting and place the procedural beacons** - `86f55fc` (feat)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `src/render/shaders/planet.glsl.ts` — the two shader sources with the mandatory Three chunks and object-space value-noise fbm.
- `src/render/bodies/planet.ts` — `createPlanet`, `seedToUniform`, `landThresholdFor`; uniforms from the compiled record; spin and object-space sun direction.
- `src/render/bodies/sun.ts` — `createSun`; disc, 1.2282R CanvasTexture corona, shimmer step, owned disposal.
- `src/render/bodies/starfield.ts` — `createSystemStarfield`; capped, seeded, tinted, preallocated.
- `src/render/bodies/station.ts` — `createStation` returning `{ root, dock, update, dispose }`; clone-before-tweak; node contract enforced.
- `src/render/bodies/beacon.ts` — `createBeacon`; octahedron + single-point dot, no new asset.
- `src/render/menu-scene.ts` — `createMenuScene(assets)`; built, not wired.
- `src/render/system-scene.ts` — assembles the new bodies, adds the corona and beacons, disposes each body's own resources.
- `src/render/sync.ts` — places `planet.mesh`, `sun.sun`/`sun.corona`, `station.root`, both beacons; runs the planet and sun updates from the sim clock.
- `src/render/mesh.ts` — added `isPoints` (the `Points` twin of `isMesh`).
- `src/app/game-session.ts` — passes `flightTime` to `applyFrame`, calls `applyStationRoll(scene, stationAngle)`, publishes seven body names.
- `src/app/scene-manager.ts` — passes the `System` record into `createSystemScene`.
- `tests/render/planet-shader.test.ts` — chunks, uniforms, seed, threshold, spin, radius validation.
- `tests/render/starfield.test.ts` — count, shell radius, determinism, clamps, tint, no `Math.random`.
- `tests/render/station.test.ts` — GLB JSON contract plus the synthetic assembly rules and roll.
- `tests/e2e/scene.spec.ts` — seven body names, nav-buoy distance/axis, a longer launch wait.
- `src/render/precision-scene.ts` — deleted.

## Decisions Made

- **Land threshold calibration:** `1 − land_fraction` with a seeded ±0.01 offset. Lave's 0.65 becomes 0.35; a 0.5 midpoint would render roughly half land.
- **Noise budget:** four surface octaves and three cloud octaves. Nine octaves per pixel kept the procedural planet at ~8 fps under headless SwiftShader, which makes the fixed-step loop lag wall time; on real GPUs this is trivial, but the e2e had to become a correctness wait rather than a frame-rate claim.
- **Corona semantics:** the CanvasTexture is drawn as two radial layers — the sun colour (white) and a warm amber — blended by `corona_hues`; `corona_shimmer` only drives a slow scale/opacity breath.
- **Clock plumbing:** `FlightPose` carries no clock, so `applyFrame` takes `elapsedSeconds` explicitly and `game-session` passes `state.flightTime`; the planet never reads a wall clock.
- **Station ownership:** clone materials before applying polygonOffset/emissiveIntensity; the cached GLB graph is never mutated, so the menu scene's Cobra/Coriolis clones stay intact.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `createSystemScene` needed the `System` record**
- **Found during:** Task 1 (planet uniforms)
- **Issue:** the plan's `createPlanet(system, …)`/`createSun(system, …)` signatures need the compiled palette, seed, star count and corona values, but `SystemScene` only received `layout` and `assets`; `SystemLayout` is sim-pure and carries none of those.
- **Fix:** added a third `system` parameter to `createSystemScene` and passed it from `SceneManager.enterSystem`. No swap/disposal policy changed.
- **Files modified:** `src/render/system-scene.ts`, `src/app/scene-manager.ts`
- **Verification:** typecheck + the scene e2e green.
- **Committed in:** `ec3d678`

**2. [Rule 3 - Blocking] The sim clock had to be threaded into `applyFrame`**
- **Found during:** Task 1 (planet spin)
- **Issue:** the plan says the interpolated pose "carries `flightTime` from plan 01's game loop"; `FlightPose` in `src/sim/flight/state.ts` is only `{ position, orientation }`.
- **Fix:** `applyFrame(..., elapsedSeconds)` and `applyStationRoll(scene, stationAngle)`; `game-session` supplies `state.flightTime` and `state.stationAngle`. The sim state shape and its hash are untouched.
- **Files modified:** `src/render/sync.ts`, `src/app/game-session.ts`
- **Verification:** `tests/render/planet-shader.test.ts` spin pin and the scene e2e green.
- **Committed in:** `ec3d678` (applyFrame) and `86f55fc` (applyStationRoll)

**3. [Rule 1 - Bug] A `Float32Array` cannot satisfy a 1e-6 shell-radius tolerance**
- **Found during:** Task 2 (starfield test)
- **Issue:** the plan asks every star to be at `1.5e6` within `1e-6`; a float32 coordinate at 1.5e6 m has a 0.125 m ULP, so the radius reads back within ~0.2 m at best.
- **Fix:** the test asserts `|radius − 1.5e6| < 0.5 m` (four ULPs) and documents why. A wrong shell or scale still fails by kilometres; determinism and count are exact.
- **Files modified:** `tests/render/starfield.test.ts`
- **Verification:** the focused suite passes; the assertion is non-vacuous by construction.
- **Committed in:** `c78120a`

**4. [Rule 3 - Blocking] The scene e2e launch wait was raised from 4 s to 30 s**
- **Found during:** Task 1 (browser proof)
- **Issue:** the procedural planet renders at ~8 fps on headless SwiftShader, and the fixed-step loop caps at five 1/120 s steps per frame, so two simulated launch seconds take ~8 s of wall time. The old 4 s bound timed out.
- **Fix:** a 30 s bound with a comment that this is a correctness wait, not a performance claim (Pitfall 15). Real-GPU performance is unchanged in kind; SwiftShader is the slow path.
- **Files modified:** `tests/e2e/scene.spec.ts`
- **Verification:** `scene.spec.ts` green, then the full `verify` chain green.
- **Committed in:** `ec3d678`

**5. [Rule 3 - Blocking] Added `isPoints` to `src/render/mesh.ts`**
- **Found during:** Task 3 (beacon disposal)
- **Issue:** `object instanceof THREE.Points` narrows to `Points<any, any>`, which the type-aware ESLint rules reject as unsafe — the same reason plan 01 added `isMesh`.
- **Fix:** a user-defined `isPoints` type predicate used by `disposeBeacon`.
- **Files modified:** `src/render/mesh.ts`, `src/render/system-scene.ts`
- **Verification:** `docker compose run --rm lint` green.
- **Committed in:** `86f55fc`

**6. [Rule 1 - Bug] Material tweaks ran before `cloneMaterials` in the station factory**
- **Found during:** Task 3 (self-caught while writing `createStation`)
- **Issue:** setting `depthWrite`/`emissiveIntensity`/`polygonOffset` before cloning would have mutated the cached GLB materials shared with the menu scene.
- **Fix:** `cloneMaterials(model)` now runs immediately after the clone, before any tweak.
- **Files modified:** `src/render/bodies/station.ts`
- **Verification:** `tests/render/station.test.ts` asserts the clone's properties; the menu Cobra/Coriolis path still uses the untouched cache.
- **Committed in:** `86f55fc`

**7. [Rule 1 - Bug] Comment text tripped the executable-source scans**
- **Found during:** Task 2/3 (starfield and station tests)
- **Issue:** the module docs mention `Math.random` and `Object3D.lookAt()`; a raw source scan reported them as code.
- **Fix:** the tests strip block/line comments before asserting the absence of the call, so the doc can explain the rule while the code is still proven clean.
- **Files modified:** `tests/render/starfield.test.ts`, `tests/render/station.test.ts`
- **Verification:** both focused suites green.
- **Committed in:** `c78120a` and `86f55fc`

---

**Total deviations:** 7 auto-fixed (5 blocking, 2 bugs)
**Impact on plan:** Every fix was required to keep typecheck/lint/browser gates green or to make an assertion honest about float32/software-rendering reality. No locked decision (D-01, D-02, D-03) was changed and no asset was modified.

## Issues Encountered

- The procedural planet is expensive on headless SwiftShader (~8 fps). The fixed-step loop therefore advances slower than wall time in the e2e; the browser spec now waits on the probe with a generous bound. This is the Pitfall 15 trade-off, not a real-GPU regression.
- The planet's cloud field drifts very slowly with `uTime` (0.002 per second) so the uniform is live; it is presentation-only and never feeds the simulation.

## Manual Acceptance (outstanding)

The plan's manual visual pass has **not** been performed by the executor and is not claimed:

- At 1080p, confirm Lave reads as green land / mauve sea with polar ice and a visible terminator — not an Earth-like blue marble.
- Confirm the sun is a bright white disc with a thin corona (not a wide halo) and the star density matches Oolite.
- Fly witchpoint → station and confirm the Coriolis dock opening does not zipper at 500 m or 100 km.

These are the `03-VALIDATION.md` manual-only rows for WORLD-02/WORLD-03; they remain for `/gsd-verify-work`.

## Known Stubs (intentional, owned by later plans)

- `src/render/menu-scene.ts` is built but has no caller yet; plan 09 wires `SceneManager.enterMenu()` to install it. An uncalled factory is acceptable only until the phase gate.
- The launch cinematic, dust and the full HUD remain plan 07/05 work; this plan deliberately leaves them untouched.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04 can fly through the new bodies; the probe's `world.*` positions and `maxRelativeMagnitude` are unchanged in shape.
- Plan 05's scanner can read `layout.navBuoy`/`layout.witchpoint` and the scene names `navBuoy`/`witchpoint`.
- Plan 09 must wire `createMenuScene(assets)` into `enterMenu()` and extend the dispose test to the new planet material, corona texture and beacon geometry/materials.
- The manual WORLD-02/WORLD-03 visual rows are still open.

## Self-Check: PASSED

- `src/render/shaders/planet.glsl.ts`, `src/render/bodies/planet.ts`, `sun.ts`, `starfield.ts`, `beacon.ts`, `station.ts`, `src/render/menu-scene.ts` and all three render tests exist on disk.
- `src/render/precision-scene.ts` is gone and `rg -n precision-scene src tests tools` returns no matches.
- Commits `ec3d678`, `c78120a` and `86f55fc` are ancestors of `HEAD`.
- `docker compose run --rm verify` is green (258 unit tests, 6 e2e tests).
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified by this executor.

---

*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*

---
phase: quick
plan: 261117-han
type: execute
wave: 1
depends_on: []
files_modified:
  - src/render/bodies/laser-shots.ts
  - tests/render/laser-shots.test.ts
  - CHANGELOG.md
  - tests/e2e/laser-shots.spec.ts
  - src/render/system-scene.ts
  - .planning/PROJECT.md
autonomous: true
requirements: []

estimate:
  tokens: 92000
  raw_tokens: 92000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Each live laser shot is drawn as one ribbon quad. Its width vector (`aSide`) is a unit vector perpendicular to both the beam axis and the view ray from the camera, which sits at the origin of the camera-relative scene. It is recomputed on every update, so a shot reads as one beam from every angle, including the cockpit fore view (OD-1)."
    - "The ribbon is shaded by a custom ShaderMaterial with no texture. It has a coloured halo (half-width 3.6 m, peak 0.15), a coloured flare (1.8 m, peak 1.5) and a white core (0.4 m, peak 4.5), each a gaussian with sigma 0.4 x its half-width. The colour is the laser's Oolite colour: pulse red, beam yellow, mining blue, military magenta, thargoid green. The material is additive with depthWrite false, toneMapped false and fog false. It writes display values without colour management and keeps the logarithmic depth chunks (OD-2 to OD-6)."
    - "A shot is drawn for 0.09 s of flight time and fades as 1 - (age / 0.09)^2. A subtle shimmer, animated by a time uniform, runs along the beam. There is no muzzle flash and no impact glow (OD-4, OD-7, OD-8, OD-9)."
    - "A distant beam never narrows below a 2-device-pixel half extent. Its cross-profile is band-limited by the pixel footprint, so it dims with distance instead of flickering or vanishing (OD-11)."
    - "The layer contract is unchanged. `createLaserShotLayer()` still returns root, add, update and dispose. The pool of 32 still overwrites the oldest shot. The camera is still subtracted in float64 before every float32 write. Anchored player shots still ride the ship. The root is hidden, with an empty draw range, when idle, and there is one draw call while any shot is live. No buffer is reallocated after creation, and no file under src/sim, src/content or src/app changes (OD-10)."
    - "In Chromium (WebGL2), a fired fore pulse laser adds exactly one draw call while the shot is live and none after it expires, with no console error, so the shader compiles and links."
    - "No asset is added: NOTICE, ASSETS.md, public/ and third_party/ are unchanged. `.planning/PROJECT.md` Key Decisions records the ribbon decision, and CHANGELOG `## [Unreleased]` -> `### Changed` tells players about the new laser look (OD-12)."
  artifacts:
    - path: "src/render/bodies/laser-shots.ts"
      provides: "The ribbon layer: preallocated quad buffers (position, aSide, aColor, aShape), a static index, the procedural ShaderMaterial, the Oolite width and peak constants, laserShotFade, and onBeforeRender for the viewport height"
      contains: "ShaderMaterial"
    - path: "tests/render/laser-shots.test.ts"
      provides: "Node tests (no WebGL) for lifetime, pool, compaction, camera-relative precision, camera-facing side vector, profile constants, fade, material flags, shader attribute contract, robustness and dispose"
      contains: "aSide"
    - path: "tests/e2e/laser-shots.spec.ts"
      provides: "Browser proof that one fired shot compiles, draws exactly one call while live and none after expiry, with no console error"
      contains: "__wegolite"
    - path: "src/render/system-scene.ts"
      provides: "The `shots` field doc comment describes the ribbon mesh"
      contains: "ribbon"
    - path: ".planning/PROJECT.md"
      provides: "Key Decisions row for the camera-facing ribbon"
      contains: "camera-facing ribbon"
    - path: "CHANGELOG.md"
      provides: "Unreleased -> Changed entry for the new laser look"
      contains: "Laser shots"
  key_links:
    - from: "src/app/session/event-router.ts"
      to: "src/render/bodies/laser-shots.ts"
      via: "laserFired -> ctx.core.scene?.shots.add(from, to, laserKind, flightTime, anchor), signature unchanged"
      pattern: "shots\\.add\\("
    - from: "src/app/session/render-driver.ts"
      to: "src/render/bodies/laser-shots.ts"
      via: "currentScene.shots.update(cameraWorld, flightTime, playerPose) every frame, signature unchanged"
      pattern: "shots\\.update\\("
    - from: "src/render/system-scene.ts"
      to: "src/render/bodies/laser-shots.ts"
      via: "parts.shots.root added to the scene; the scene disposes the layer"
      pattern: "shots\\.root"
    - from: "src/render/bodies/laser-shots.ts"
      to: "src/render/bodies/laser-shots.ts"
      via: "The geometry attributes aSide, aColor and aShape are the ones the vertex shader declares; a test pins the declarations"
      pattern: "aShape"
---

<objective>
Replace the 1-pixel laser line with a camera-facing glowing ribbon that keeps Oolite's widths, colours and lifetime. The owner approved this on 2026-11-17, and the decision is locked.

Today `src/render/bodies/laser-shots.ts` (255 lines) draws every shot as one segment of a 1-pixel line object. Oolite (`/home/opencode/git/oolite/src/Core/Entities/OOLaserShotEntity.m:169-253`) draws two crossed textured quads in three layers, all with additive `GL_SRC_ALPHA, GL_ONE` blending: a coloured halo scaled by `kLaserHalfWidth` 3.6, a white core by `kLaserCoreWidth` 0.4 and a coloured flare by `kLaserFlareWidth` 1.8. Seen along the view axis, as from the cockpit, the crossed quads turn into a wedge plus a line that read as two beams. A ribbon whose width vector is perpendicular to both the beam and the view ray reads as one beam from every angle.

Owner decision items (OD), each cited where it is implemented:
- OD-1: one camera-facing ribbon (a billboard quad turned about the beam axis toward the camera) replaces the line.
- OD-2: shading is a procedural custom ShaderMaterial. No new texture asset.
- OD-3: Oolite's widths in world metres: halo half-width 3.6, flare 1.8, white core 0.4.
- OD-4: the same colours (`LASER_SHOT_COLORS`) and the same 0.09 s lifetime (`LASER_SHOT_DURATION`).
- OD-5: additive blending, depthWrite false, toneMapped false, fog false.
- OD-6: a smooth, gaussian-like cross-profile with a white-hot core inside the coloured halo.
- OD-7: a subtle shimmer or noise along the beam, animated by a time uniform.
- OD-8: a fade-out over the shot's lifetime.
- OD-9: scope minimum. No muzzle flash and no impact glow.
- OD-10: the public API of `createLaserShotLayer` stays: add, update and dispose, the pool of 32, float64 camera-relative precision, anchored player shots, the root hidden when empty, and one draw call. Only the type of `root` changes, to a Mesh.
- OD-11 (the owner left this to the planner, and the planner chose it): a minimum on-screen width. Phase 17 adds NPC fire at the player, so beams seen from kilometres away become common. Without a minimum they fall below a pixel and flicker or vanish.
- OD-12: bookkeeping. Add a Key Decisions row to `.planning/PROJECT.md` and a `Changed` entry to `CHANGELOG.md`. Unit tests must not need WebGL.

Planner discretion, all inside the shader and documented in the file header:
- Each gaussian's sigma is 0.4 x its half-width. This matches the cross-profile of `oolite-laser-blur2.png` by eye.
- Peaks follow Oolite's colour x alpha arithmetic: 0.15, 1.5 and 4.5.
- The fade is `1 - (age / 0.09)^2`.
- Both ends taper softly over 3.6 m, so the beam does not start with a hard cut at the muzzle.
- The minimum half extent is 2 device pixels, and the profile is band-limited by `fwidth`, which conserves the light.

There is also one browser spec. No existing gate draws a laser in a browser: `verify`'s e2e subset fires nothing, and `combat.spec.ts` only renders a live shot by chance. A Node test cannot compile GLSL.

Purpose: laser fire that looks like one clean glowing beam, true to Oolite's numbers and visible at any range.
Output: a rewritten `src/render/bodies/laser-shots.ts` and `tests/render/laser-shots.test.ts`, a new `tests/e2e/laser-shots.spec.ts`, a CHANGELOG entry, a PROJECT.md Key Decisions row and a one-comment update in `src/render/system-scene.ts`.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@AGENTS.md
@src/render/bodies/laser-shots.ts
@tests/render/laser-shots.test.ts

Reviewer and subagent brief (from AGENTS.md):
- Tests and builds run in Docker only. Host Node, npm and Playwright are not authoritative, and a green host run is not evidence.
- Local commands: `docker compose run --rm test npx vitest run <file>`, `docker compose run --rm typecheck` and `docker compose run --rm lint`. Do NOT run `verify`, `verify-full`, `e2e` or any Playwright spec locally. Owner policy: browser tests and gates run only on the remote test machine, through `/home/opencode/.claude/scripts/wegolite-remote-run.sh <docker compose args>`. The script syncs the COMMITTED HEAD, so commit before every remote run.
- Scratch files live under /tmp and are mounted into the container (`-v /tmp/<dir>:/scratch`). Never add them to the repo.
- Use the codebase-memory MCP index (project `wegolite`) before grepping, and prefer `rg` over `grep`.
- Oolite reference: read behaviour from `/home/opencode/git/oolite` and never fetch Oolite over the network. The relevant files are `src/Core/Entities/OOLaserShotEntity.m` lines 36-51 (constants), 106-109 and 134-140 (colour = rgb x brightness / 3), 197-253 (draw) and `src/Core/OOOpenGLStateManager.m` lines 559-580 (additive blending is `GL_SRC_ALPHA, GL_ONE`). `Resources/Textures/oolite-laser-blur2.png` is a 512x512 grey cross-profile, for reference only. It is not vendored and must not be.

Interfaces the executor needs (verified in the source at HEAD f511bd4):
- `src/render/bodies/laser-shots.ts`: `ShotAnchor { position: Vec3; orientation: Quat }`, `LASER_SHOT_POOL = 32` and `LASER_SHOT_COLORS` (pulse [1,0,0], beam [1,1,0], mining [0,0,1], military [1,0,1], thargoid [0,1,0]). The layer interface is `LaserShotLayer { readonly root; add(from, to, laserKind, flightTime, anchor?): void; update(cameraWorld, flightTime, player?): void; dispose(): void }`. Lines 140-246 implement add (anchored shots are stored in the ship frame through `rotateInverse`) and update (expiry when `elapsed < 0 || elapsed >= LASER_SHOT_DURATION`, the anchor transform, compaction to `live`, and the float64 subtraction before the float32 write).
- Callers, none of which may change: `src/render/system-scene.ts:225` (factory), `:314` (adds `parts.shots.root` to the scene) and `:148-152` (the doc comment of the `shots` field); `src/app/session/event-router.ts:437-452` (`add`); `src/app/session/render-driver.ts:210-215` (`update`); `tests/app/dispose.test.ts:386, 413-414` (counts `root.geometry` and `root.material` disposals) and `:776-798` (a stub layer that reuses a real `root`).
- `src/sim/math.js` exports `vec`, `add`, `sub`, `scale`, `dot`, `cross`, `length`, `normalizeVec`, `rotate` and `rotateInverse`, and the types `Vec3` and `Quat`. `LASER_SHOT_DURATION = 0.09` is at `src/sim/combat/constants.ts:113`.
- Camera: the scene camera always sits at the origin and only rotates (`src/render/sync.ts:110`, `src/render/system-scene.ts:269`), so a camera-relative point IS the view ray. The vertical FOV is 57.2 degrees. `logarithmicDepthBuffer` is true (`src/app/boot.ts:56`). The pixel ratio is `min(devicePixelRatio, 2)` (`boot.ts:85`). The output is sRGB with `NoToneMapping` (`src/render/exposure.ts:260-261`). There is one `renderer.render` per flight frame (`src/app/session/render-driver.ts:226`).
- Shader pattern to copy: `src/render/bodies/nebulae.ts:95-137`. Its shaders include `<common>` and the `logdepthbuf_*` chunks, deliberately omit `<colorspace_fragment>` and `<tonemapping_fragment>`, and write the display value. Its material is at `:383-397`. Assertion pattern: `tests/render/nebulae.test.ts:157-170`, which reads uniforms as `material.uniforms["uX"]?.value`.
- e2e pattern: `tests/e2e/combat.spec.ts` lines 36-50 (imports, `SLOW`, `LAUNCH_TICKS = 300`), 135-142 (`waitForFrames`), 170-176 (`advance` through `window.__wegolite?.test?.advanceTicks`), 196-221 (new game, launch, park with `setSpeed(0)`) and 222-229 (hold `KeyA`, then read `window.__wegolite?.combat?.laserTemp`). `collectErrors` is at `tests/e2e/autosave.spec.ts:56-63`. `window.__wegolite.calls` is `renderer.info.render.calls` (`src/app/session/probe-publisher.ts:312`). `/?test=1&clock=manual` gives a manual clock with traffic off (`src/app/session/test-flags.ts:23-37`). D-08: no screenshots and no pixel reads in e2e.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Rewrite the shot layer as one camera-facing ribbon mesh with a procedural glow shader (OD-1 to OD-11)</name>
  <files>tests/render/laser-shots.test.ts, src/render/bodies/laser-shots.ts, CHANGELOG.md</files>
  <read_first>
    - src/render/bodies/laser-shots.ts (all 255 lines; keep add, the expiry, the anchoring and the compaction logic)
    - tests/render/laser-shots.test.ts (all 312 lines; every behaviour it pins must stay pinned against the new buffers)
    - src/render/bodies/nebulae.ts lines 95-137 and 383-397, and tests/render/nebulae.test.ts lines 157-170
    - /home/opencode/git/oolite/src/Core/Entities/OOLaserShotEntity.m lines 36-51, 106-109, 134-140, 197-253
    - src/sim/combat/constants.ts lines 112-113 and 220-245 (duration and `COBRA_WEAPON_OFFSETS`), src/render/sync.ts lines 30-34 (`VIEW_OFFSET`)
    - CHANGELOG.md lines 1-30
  </read_first>
  <behavior>
    - Lifetime, carried over from the current tests: invisible with draw count 0 before any shot. Visible from the add time for 0.09 s, then hidden with draw count 0. An expired shot is not revived when the clock is read again. A shot whose start is in the future is dropped. Two shots of different ages are independent, and after the first expires, the survivor's four vertices are compacted to slots 0-3 (its to-end z = -20 is at vertex 2). The draw count is the `geometry.drawRange.count` of an indexed geometry: 6 per live shot.
    - Colour: the `LASER_SHOT_COLORS` table and its agreement with `LASER_STATS` colour names stay as today. Each kind writes its colour to all 4 vertices of its quad in `aColor`.
    - Pool: there are 32 slots. `position`, `aSide` and `aColor` hold 32 x 4 x 3 floats, and `aShape` holds 32 x 4 x 4. The index holds 32 x 6 entries, and the quad for slot j is (4j, 4j+1, 4j+2, 4j, 4j+2, 4j+3). A 33rd simultaneous shot overwrites the oldest. The attribute objects, their arrays and the index object stay identical after 200 add/update cycles.
    - Camera-relative: for camera (1e9, -2e9, 3e9) and a shot from camera + (1,2,3) to camera + (4,5,6), `position` holds exactly [1,2,3, 1,2,3, 4,5,6, 4,5,6], so the subtraction happens in float64. Moving the camera by (4,0,0) between updates shifts every vertex by -4 without re-adding the shot.
    - Camera-facing side vector, read from `aSide`, which is identical on all 4 vertices: (a) The cockpit fore shot, camera at the origin, from A = (-0.0961, -6.3133, -12.4655) (Oolite weapon mount minus the cockpit eye, z flipped) to A + (0,0,-12500). `aSide` has length 1 +/- 1e-6, is perpendicular to the beam within 1e-6 and to the unit view rays to both ends within 1e-6, and |x| > 0.99, so the beam runs up the screen and spreads sideways. (b) A beam from (-100,0,-50) to (100,0,-50) seen from the origin gives `aSide` = +/-(0,1,0). (c) The same shot after the camera moves to world (0,50,-50) gives `aSide` = +/-(0,0,1) without re-adding. (d) Degenerate cases stay finite and unit length: the camera on the beam's line (camera at world (0,0,-50) for case b), where `aSide` is still perpendicular to the beam, and a zero-length shot (from equals to). No attribute holds NaN.
    - Shape: `aShape` per vertex is (across, along, length, fade) = (-1,0,L,f), (+1,0,L,f), (+1,L,L,f), (-1,L,L,f), with L = |to - from| (100 for a 100 m shot). `laserShotFade(0) = 1`, `laserShotFade(0.045) = 0.75`, `laserShotFade(0.09) = 0`, and it strictly decreases between them. The fade written for a shot is 1 at its add time and strictly between 0 and 1 at age 0.06.
    - Oolite numbers (OD-3, OD-6): `LASER_HALO_HALF_WIDTH` 3.6, `LASER_FLARE_HALF_WIDTH` 1.8, `LASER_CORE_HALF_WIDTH` 0.4, `LASER_HALO_PEAK` 0.15, `LASER_FLARE_PEAK` 1.5 and `LASER_CORE_PEAK` 4.5 (each toBeCloseTo, written as literals in the test), and the material uniforms `uHaloHalfWidth`, `uFlareHalfWidth`, `uCoreHalfWidth`, `uHaloPeak`, `uFlarePeak` and `uCorePeak` carry those values. `uMinHalfExtentPx` is 2.
    - Material (OD-2, OD-5): `root.type` is "Mesh", `root.frustumCulled` false, `root.name` "laserShots". The material is a ShaderMaterial with blending AdditiveBlending, transparent true, depthWrite false, depthTest true, toneMapped false and fog false. The fragment shader contains `logdepthbuf_fragment` and contains neither `colorspace_fragment` nor `tonemapping_fragment`. The vertex shader contains `logdepthbuf_vertex` and declares `attribute vec3 aSide`, `attribute vec3 aColor` and `attribute vec4 aShape`, which is the buffer-to-shader contract.
    - Time and viewport: after `update(ORIGIN, 123.25)` with a live shot, `uTime` is 23.25 (`flightTime % LASER_TIME_WRAP`, wrap 100). Calling `root.onBeforeRender` with a stub renderer whose `getDrawingBufferSize(target)` sets (1920, 1080) writes `uViewportHeight` = 1080. A later stub that reports height 0 leaves it at 1080.
    - Anchoring, robustness and dispose, carried over: an anchored shot rides the ship and turns with it (checked on the vertex positions). An anchored shot with no player pose is not drawn. Non-finite segments, non-finite times and a non-finite camera are skipped or hidden without writing NaN to any attribute. Dispose frees the geometry and the material exactly once, is idempotent, and makes add and update no-ops.
  </behavior>
  <action>
    RED. Rewrite `tests/render/laser-shots.test.ts` to pin every behaviour in the behavior block through the layer's public surface: `root`, its geometry attributes, index, draw range and material, plus the exported constants and `laserShotFade`. Keep the SPDX header and update the doc comment: the ribbon layer is decided in Node against its buffers, and building a Mesh with a ShaderMaterial needs no WebGL context. Read attributes with `layer.root.geometry.getAttribute("aSide")` and similar, and uniforms as `layer.root.material.uniforms["uX"]?.value`. Derive the expected values from the requirement as literals, not from a run of the code. For the onBeforeRender stub, build a minimal object with `getDrawingBufferSize(target)` and cast it through `unknown` to `THREE.WebGLRenderer`, as the other render tests do with GLTF stubs. Run `docker compose run --rm test npx vitest run tests/render/laser-shots.test.ts`. It must fail at HEAD, because the attributes, constants and Mesh do not exist yet. Commit: `test(quick-261117-han): pin the laser shot ribbon buffers, profile and material`.

    GREEN. Rewrite `src/render/bodies/laser-shots.ts` as follows (OD-10: same exports, same `add`/`update`/`dispose` signatures and semantics).
    1. Header doc comment: describe the ribbon (OD-1) and why it replaces Oolite's crossed quads (the cockpit wedge-plus-line problem), with Oolite citations: duration `:36`, constants `:44-51`, colour arithmetic `:106-109` and `:134-140`, the three layers and the scrolling textures `:197-253`, and additive `GL_SRC_ALPHA, GL_ONE` `OOOpenGLStateManager.m:577-578`. Explain the deviations (the gaussian profile instead of textures with no asset added, the shimmer, the fade, the soft ends, the minimum width) and the camera-relative float64 rule. Keep the existing paragraph saying the layer stores no entity id. Do not name the class of the old line object anywhere in the file, because a negative gate checks for it. Fix the `LASER_SHOT_COLORS` doc: the colours are display values written without colour management, as Oolite blends them, and not linear RGB.
    2. New exports, each with a one-line citation:
       - `LASER_HALO_HALF_WIDTH = 3.6`, `LASER_FLARE_HALF_WIDTH = 1.8` and `LASER_CORE_HALF_WIDTH = 0.4`, in metres (OD-3).
       - `LASER_BRIGHTNESS = 5`.
       - `LASER_HALO_PEAK = (LASER_BRIGHTNESS / 3) * (0.45 / LASER_BRIGHTNESS)`, `LASER_FLARE_PEAK = (LASER_BRIGHTNESS / 3) * 0.9` and `LASER_CORE_PEAK = LASER_BRIGHTNESS * 0.9`.
       - `LASER_PROFILE_SIGMA = 0.4`, `LASER_MIN_HALF_EXTENT_PX = 2`, `LASER_SHIMMER_DEPTH = 0.2` and `LASER_TIME_WRAP = 100` (seconds).
       - `laserShotFade(age: number): number`, equal to `1 - (age / LASER_SHOT_DURATION) ** 2` clamped to [0, 1]. It returns 0 for a non-finite age (OD-8).
    3. `LaserShotLayer.root` becomes `THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>`. Its doc says it is the one ribbon mesh, hidden whenever no shot is live.
    4. Geometry: 4 vertices and 6 indices per slot.
       - Preallocate Float32 attributes with `DynamicDrawUsage`: `position` (itemSize 3; the centreline end, camera-relative), `aSide` (3), `aColor` (3) and `aShape` (4: across sign, along metres from the `from` end, beam length in metres, fade).
       - Set a static Uint16 index once, at creation. For slot j it holds (4j, 4j+1, 4j+2, 4j, 4j+2, 4j+3).
       - Vertex order in a quad: 0 is the from end with across -1, 1 is the from end with +1, 2 is the to end with +1 and 3 is the to end with -1.
       - The draw range is `(0, live * 6)`. Keep `root.name = "laserShots"`, `frustumCulled = false` and `visible = false` at creation.
       - Never write NaN to any attribute. Three computes the geometry's bounding sphere once for transparent sorting and logs a console error on a NaN radius, which the browser specs fail on.
    5. `add`: unchanged.
    6. `update`: keep the guard, expiry, anchor transform and compaction. For each live shot:
       - Form the camera-relative ends a and b in float64 by subtracting the camera from the world ends first. Let d = b - a and L = |d|.
       - The side is s = cross(d, a) normalised. The camera is the scene origin, so cross(d, p) is the same vector for every point p on the beam's line, which makes s perpendicular to the beam and to the view ray all along it (OD-1).
       - Fallback: if |cross(d, a)| is not above a small relative tolerance (about 1e-9 x L x max(|a|, |b|, 1)), because the camera is on the beam's line or L is 0, use the unit vector of d crossed with the world axis least aligned with d. When L is 0, use (1, 0, 0).
       - Write the four vertices: positions a, a, b, b; s on all four; the slot colour on all four; and `aShape` (-1, 0, L, f), (+1, 0, L, f), (+1, L, L, f), (-1, L, L, f) with f = `laserShotFade(elapsed)`. Set `needsUpdate` on the four attributes.
       - When the time is finite, set `uTime` to `flightTime % LASER_TIME_WRAP`, computed in float64. On the non-finite path, hide without writing anything.
    7. Material (OD-2, OD-5): a `THREE.ShaderMaterial`.
       - Uniforms: `uHaloHalfWidth`, `uFlareHalfWidth`, `uCoreHalfWidth`, `uHaloPeak`, `uFlarePeak`, `uCorePeak`, `uProfileSigma` and `uMinHalfExtentPx` from the constants; `uShimmerDepth`; `uViewportHeight`, initially 1080; and `uTime`, initially 0.
       - Flags: transparent true, blending `THREE.AdditiveBlending`, depthWrite false, depthTest true, side `THREE.DoubleSide`, toneMapped false, fog false.
       - WebGL2 needs no extensions flag for `fwidth`.
    8. Vertex shader, following the nebulae pattern (`<common>`, `<logdepthbuf_pars_vertex>`, `<logdepthbuf_vertex>` after `gl_Position`):
       - Declare the three custom attributes.
       - Compute the centre's view depth as `max(-(modelViewMatrix * vec4(position, 1.0)).z, 1e-3)`, and metres per pixel as `2.0 * depth / (projectionMatrix[1][1] * max(uViewportHeight, 1.0))`.
       - Compute `halfExtent = max(uHaloHalfWidth, uMinHalfExtentPx * metresPerPixel)` (OD-11) and `across = aShape.x * halfExtent`.
       - Extrude in model space, `position + aSide * across`, then project with `projectionMatrix * modelViewMatrix`.
       - Pass varyings: `vAcross` (signed metres), `vHalfExtent`, `vAlong`, `vLength`, `vFade` and `vColor`. The quad is planar and both values are affine along it, so `vAcross` and `vHalfExtent` interpolate exactly, with no diagonal seam.
    9. Fragment shader (`<common>`, `<logdepthbuf_pars_fragment>`, and `<logdepthbuf_fragment>` last; no tonemapping or colorspace chunk, so the value written is the display value, as in Oolite and the nebulae) (OD-6, OD-7):
       - Let the footprint be `max(fwidth(vAcross), 1e-6)`.
       - Each band, for a half-width h and a peak k: sigma = `uProfileSigma * h`, sigmaEff = `sqrt(sigma^2 + 0.25 * footprint^2)`, value = `k * (sigma / sigmaEff) * exp(-0.5 * vAcross^2 / sigmaEff^2)`. The band limit keeps the integrated light, so a beam narrower than a pixel dims instead of flickering.
       - Halo, flare and core use their half-widths and peaks.
       - Shimmer: hash-based value noise with no texture, two octaves along `vAlong` with wavelengths of about 40 m and 9 m. They scroll in opposite directions at a few hundred metres per second of `uTime`, after Oolite's two counter-scrolling textures at `:215-219`. Fade each octave to 0 as `fwidth(vAlong)` approaches its wavelength, so the foreshortened far end does not sparkle. The modulation is `1 + uShimmerDepth * (2n - 1)`, applied to halo and flare only. The core stays steady.
       - Ends: t = `max(min(uHaloHalfWidth, 0.5 * vLength), 1e-3)`, and the end factor is `smoothstep(0.0, t, vAlong) * smoothstep(0.0, t, vLength - vAlong)`.
       - Edge window: `1.0 - smoothstep(0.8, 1.0, abs(vAcross / vHalfExtent))`. Never call smoothstep with edge0 >= edge1, because GLSL leaves that undefined.
       - Output: `gl_FragColor = vec4((vColor * (halo + flare) * shimmer + vec3(core)) * ends * window * vFade, 1.0)`. The core peak of 4.5 saturates to white inside the flare, which saturates to the laser colour.
    10. Allocate one `THREE.Vector2` scratch at creation and set `root.onBeforeRender = (renderer) => { ... }`. Read `renderer.getDrawingBufferSize(scratch)` and write `uViewportHeight` only when the height is finite and greater than 0.
    11. `dispose`: unchanged in behaviour (it hides, then disposes the geometry and material once).

    Add one player-facing bullet to `CHANGELOG.md` under `## [Unreleased]` -> `### Changed`, after the existing bullets, in the file's style (plain English, wrapped near 78 columns). It must begin "Laser shots" and say: laser shots are now drawn as glowing beams instead of a thin line; each has a white-hot core inside a soft halo in the laser's colour (red pulse, yellow beam, blue mining, magenta military) at Oolite's beam widths; a shot shimmers and fades over its brief life and looks like one beam from every angle; and a distant shot stays visible as a thin line. Run the targeted tests and typecheck, which must pass. Then commit `laser-shots.ts` and `CHANGELOG.md` together (AGENTS.md: a user-visible change and its changelog entry share a commit): `feat(quick-261117-han): draw laser shots as camera-facing glowing ribbons`.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/render/laser-shots.test.ts tests/app/dispose.test.ts</automated>
    <automated>docker compose run --rm typecheck</automated>
    <automated>! rg -q 'LineSegments' src/render/bodies/laser-shots.ts   # old line class gone [HEAD=3 EXPECT==0]</automated>
    <automated>rg -q 'ShaderMaterial' src/render/bodies/laser-shots.ts   # [HEAD=absent EXPECT==present]</automated>
    <automated>rg -q 'logdepthbuf_fragment' src/render/bodies/laser-shots.ts   # [HEAD=absent EXPECT==present]</automated>
    <automated>rg -q 'onBeforeRender' src/render/bodies/laser-shots.ts   # [HEAD=absent EXPECT==present]</automated>
    <automated>sed -n '/^## \[Unreleased\]/,/^## \[0/p' CHANGELOG.md | rg -q 'Laser shots'   # [HEAD=0 EXPECT>=1]</automated>
    <automated>git diff --quiet f511bd4 -- src/sim src/content src/app NOTICE ASSETS.md public third_party   # scope guard: an invariant that is clean before and after this change</automated>
  </verify>
  <done>
    The rewritten unit test failed at HEAD and passes after the rewrite, with no WebGL. `tests/app/dispose.test.ts` passes unchanged, and typecheck passes. The layer is one Mesh with a ShaderMaterial and four attributes. The index is static and the buffers are never reallocated. `aSide` is a unit vector perpendicular to the beam and to the view ray. The Oolite widths and peaks are exported and carried as uniforms. The fade, shimmer, soft ends and minimum half extent are implemented. Nothing under src/sim, src/content or src/app, and no asset file, changed. There are two commits: the test (RED), then the feature (GREEN) carrying `laser-shots.ts` and `CHANGELOG.md`.
  </done>
  <reversibility rating="reversible">Render-only, behind an unchanged API. Reverting the GREEN commit restores the line layer.</reversibility>
</task>

<task type="auto">
  <name>Task 2: Prove in Chromium that one fired shot compiles and draws exactly one call (remote run)</name>
  <files>tests/e2e/laser-shots.spec.ts</files>
  <read_first>
    - tests/e2e/combat.spec.ts lines 1-60 (header, imports, constants), 135-176 (`waitForFrames`, `advance`) and 178-232 (boot, new game, launch, park, fire, read `laserTemp`)
    - tests/e2e/autosave.spec.ts lines 56-63 (`collectErrors`)
    - src/app/session/test-flags.ts lines 1-40 (what `test=1&clock=manual` enables)
  </read_first>
  <action>
    Create `tests/e2e/laser-shots.spec.ts` with the SPDX and copyright header and a doc comment. The comment says this is the browser proof for quick 261117-han: the custom laser ShaderMaterial compiles and links in WebGL2, and a live shot costs exactly one draw call and none once expired. The evidence is `renderer.info` through the probe, with no screenshots and no pixel reads (D-08). The spec exists because Node tests cannot compile GLSL and no other spec renders a live shot deterministically.
    Use one `test` with these steps:
    1. Collect console errors and page errors, as `collectErrors` does.
    2. `page.goto("/?test=1&clock=manual")` (traffic off, so nothing else changes the draw calls), then `waitForReady` and `startNewGame`. Wait for docked mode and the sim hook, as in combat.spec. Click launch, advance 1 and then `LAUNCH_TICKS` (300) ticks, and wait for `inFlight`. Park with `window.__wegolite?.test?.setSpeed(0)`.
    3. Wait 2 frames and read `window.__wegolite.calls` as the baseline. Wait 2 more frames and read it again. Assert the two reads are equal and greater than 0. This vacuity and stability guard proves the parked scene draws a fixed number of calls.
    4. `keyboard.down("KeyA")`, advance 1 tick, `keyboard.up("KeyA")`, then wait 2 frames. Assert `window.__wegolite.combat.laserTemp` > 0, so a shot was fired, and `calls === baseline + 1`, so the shot is drawn in one call.
    5. Advance 15 more ticks (125 ms of flight time, past the 90 ms life) and wait 2 frames. Assert `calls === baseline`.
    6. Assert the collected errors equal `[]`. Three reports a shader compile or link failure as a console error.
    Copy the helpers you need (`SLOW`, `LAUNCH_TICKS`, `waitForFrames`, `advance`, `collectErrors`) locally, as the other specs do. Do not import from another spec file. Run `docker compose run --rm typecheck` and `docker compose run --rm lint` locally. Commit: `test(quick-261117-han): prove a laser shot draws one call in the browser`.
    Then run it on the remote machine (it syncs the committed HEAD): `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/laser-shots.spec.ts"`.
    - If it fails on a shader error, fix `src/render/bodies/laser-shots.ts`, rerun the Task 1 targeted tests locally and commit `fix(quick-261117-han): ...`.
    - If the spec itself is wrong, for example the baseline is not stable or the fire key needs another tick, fix the spec and record why in the SUMMARY. Do not weaken the one-call or no-error assertions.
    - Rerun remotely until it passes.
    - If the remote machine is unreachable, record the run as pending for the orchestrator in the SUMMARY, with the exact command.
  </action>
  <verify>
    <automated>docker compose run --rm typecheck && docker compose run --rm lint</automated>
    <automated>test -f tests/e2e/laser-shots.spec.ts && rg -q 'calls' tests/e2e/laser-shots.spec.ts   # [HEAD=absent EXPECT==present]</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/laser-shots.spec.ts"   # remote, after the commit</automated>
  </verify>
  <done>
    `tests/e2e/laser-shots.spec.ts` is committed. Typecheck and lint pass locally. The remote Chromium run passes, showing that the baseline is stable, one shot adds exactly one draw call, the call is gone after expiry, and there is no console error. The SUMMARY records the remote exit code, or the pending command if the remote could not be reached.
  </done>
</task>

<task type="auto">
  <name>Task 3: Record the decision, fix the scene doc comment, run the gates (OD-12)</name>
  <files>.planning/PROJECT.md, src/render/system-scene.ts</files>
  <read_first>
    - .planning/PROJECT.md lines 118-121 (table header) and 296-309 (the last rows; the table ends just before `## Evolution`)
    - src/render/system-scene.ts lines 140-160 (the `shots` field doc comment at 148-152)
  </read_first>
  <action>
    In `src/render/system-scene.ts`, reword only the doc comment of the `shots` field (lines 148-152). It still describes the old one-pixel line object. It should now say the drawn laser shots are one camera-facing ribbon mesh over a fixed pool, fed by `laserFired` events and updated each frame, and owned and disposed by this scene like `npcs`. Change no code.

    Append one row to the Key Decisions table in `.planning/PROJECT.md`, after the last row and before `## Evolution`, in the table's three-column style (Decision | Rationale | Outcome):
    - Decision: "Draw laser shots as one camera-facing ribbon per shot with a procedural shader, not Oolite's two crossed textured quads (owner decision 2026-11-17, quick 261117-han)".
    - Rationale: Oolite draws two crossed quads per layer (`OOLaserShotEntity.m:169-253`). Seen along the view axis, as from the cockpit, they turn into a wedge and a line that read as two beams. A ribbon whose width vector is perpendicular to the beam and to the view ray reads as one beam from every angle.
      - Kept from Oolite: the halo, flare and core half-widths of 3.6, 1.8 and 0.4 m (`:49-51`); the peaks of 0.15, 1.5 and 4.5 from `kLaserBrightness` 5 and Oolite's alphas (`:44-47`, `:136-139`, `:238`, `:243`); the weapon_info colours; the 0.09 s life (`:36`); and additive display-space blending.
      - Added over Oolite: a gaussian cross-profile (sigma 0.4 x half-width, matched to `oolite-laser-blur2.png`) in place of the two blur textures, so no texture asset is added and NOTICE and ASSETS.md are unchanged; a time-animated shimmer in place of the scrolling textures; a fade of 1 - (t/0.09)^2; soft 3.6 m ends; and a 2-device-pixel minimum half extent with a band-limited profile, so a far beam dims instead of vanishing (Phase 17 NPC fire).
      - Out of scope: muzzle flash and impact glow.
      - Reversible: render only, one file behind an unchanged layer API.
    - Outcome: "✓ quick 261117-han (`src/render/bodies/laser-shots.ts`, `tests/render/laser-shots.test.ts`, `tests/e2e/laser-shots.spec.ts`)".
    The row must contain the phrase "camera-facing ribbon".

    Run `docker compose run --rm lint`, `docker compose run --rm typecheck` and the Task 1 targeted tests locally. If prettier flags one of this plan's files, format only that file with `docker compose run --rm lint npx prettier --write <file>` and include it in this commit. Commit: `docs(quick-261117-han): record the laser ribbon decision`.

    Then run the browser-facing gate on the remote machine: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify`. AGENTS.md calls for `verify` on `src/render` changes. It also names `verify-full` for render changes, which additionally runs `combat.spec.ts` and the new spec. Record the exit code and elapsed time of each remote run in the SUMMARY, and leave the choice of `verify-full` to the orchestrator. Known flakes to rerun once before treating as real: `tools/oolite-ingest/convert/textures.test.ts`, `launch.spec.ts:129` and `save-load.spec.ts:634`. Never run `verify` or `verify-full` locally.
  </action>
  <verify>
    <automated>rg -qi 'camera-facing ribbon' .planning/PROJECT.md   # [HEAD=0 EXPECT>=1]</automated>
    <automated>! rg -q 'line-segment' src/render/system-scene.ts   # stale comment gone [HEAD=1 EXPECT==0]</automated>
    <automated>docker compose run --rm lint && docker compose run --rm typecheck && docker compose run --rm test npx vitest run tests/render/laser-shots.test.ts tests/app/dispose.test.ts</automated>
    <automated>/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify   # remote, after the commit</automated>
    <human-check>The owner checks the result in a real-GPU browser (`docker compose up app`, then fly out of the station):
      1. The fore pulse laser from the cockpit is one soft red beam with a white-hot centre. It rises from below the view centre to the crosshair, has no second line or wedge, and fades out quickly.
      2. A beam laser is the same in yellow.
      3. The shot looks like one beam from the external, aft and side views.
      4. A test shooter's beam about 1.5 km away (`?test=1&traffic=1` with the combat test pilot) is visible as a thin coloured line rather than vanishing or flickering.
      5. There is no muzzle flash or impact glow, by design (OD-9).
      6. There are no shader errors in the console.</human-check>
  </verify>
  <done>
    PROJECT.md has the ribbon Key Decisions row. The `shots` doc comment in system-scene.ts describes the ribbon, and no code there changed. Lint, typecheck and the targeted tests pass locally. The docs commit is in. The remote `verify` exit code (0) is recorded in the SUMMARY, or the run is listed as pending for the orchestrator with the exact command. The owner's visual check is listed in the SUMMARY as the end-of-phase human check.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sim events -> render layer | `laserFired` from, to, laserKind and the flight time enter `add`, and the camera and player pose enter `update`. Bad values come only from a sim bug or a corrupt load, not from a remote party. |
| renderer -> layer | `onBeforeRender` reads the drawing-buffer size, which can be 0 when the canvas is hidden or minimised. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-han-01 | Denial of service | `createLaserShotLayer` buffers and draw | low | mitigate | A fixed pool of 32 overwrites the oldest shot. The attributes and the Uint16 index are preallocated once, nothing is reallocated per shot or per frame, and there is one draw call of at most 64 triangles. A unit test pins buffer and index identity across 200 add/update cycles, and the browser spec pins exactly one call. |
| T-han-02 | Tampering (render integrity) | `add`, `update`, `onBeforeRender`, vertex shader | low | mitigate | Non-finite ends, times and cameras are skipped or hidden before any write. The degenerate side vector (camera on the line, or a zero-length shot) has a finite fallback. `uViewportHeight` is written only when finite and > 0, and the shader clamps the depth and the height. Unit tests assert no NaN in any attribute, which also keeps three's bounding-sphere computation free of the NaN console error. |
| T-han-03 | Information disclosure | layer state | low | accept | The layer still stores positions, colour, start time and an anchored flag only, never an entity id (per-world id scope, Key Decisions). The `add` signature is unchanged, and `tests/guards/entity-id-scope.test.ts` keeps covering `src/render`. |
| T-han-SC | Tampering | npm/pip/cargo installs | high | accept | This plan installs no package and adds no asset (`git diff --quiet f511bd4 -- NOTICE ASSETS.md public third_party` stays clean), so the package-legitimacy gate has nothing to check. |
</threat_model>

<verification>
- Local, Docker:
  - `docker compose run --rm test npx vitest run tests/render/laser-shots.test.ts tests/app/dispose.test.ts`, `docker compose run --rm typecheck` and `docker compose run --rm lint` all exit 0.
  - `git diff --quiet f511bd4 -- src/sim src/content src/app NOTICE ASSETS.md public third_party` exits 0. The only source changes are `src/render/bodies/laser-shots.ts` and one doc comment in `src/render/system-scene.ts`.
- Remote, after the commits, through `/home/opencode/.claude/scripts/wegolite-remote-run.sh`:
  - `run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/laser-shots.spec.ts"` (Task 2) and `run --rm verify` (Task 3) exit 0.
  - The orchestrator may additionally run `run --rm verify-full`. AGENTS.md names it for render changes, and it includes `combat.spec.ts` and the new spec.
- Owner visual check, as listed in the Task 3 human-check: one beam with a white-hot core, correct colours, visible at a distance, no shader errors.
</verification>

<success_criteria>
- A laser shot is drawn as one camera-facing ribbon with Oolite's 3.6, 1.8 and 0.4 m widths, its colour and its 0.09 s life, additive and untextured. It has a white-hot core, a soft halo, a shimmer, a fade and a minimum on-screen width. There is no muzzle flash and no impact glow.
- The `createLaserShotLayer` API and every caller are unchanged. The pool, compaction, expiry, anchoring, float64 camera-relative precision, idle hiding and single draw call are pinned by Node tests that need no WebGL.
- The browser spec proves that the shader compiles and that a shot costs exactly one draw call, which is gone after expiry.
- The PROJECT.md Key Decisions row and the CHANGELOG `Changed` entry are in. The CHANGELOG entry shares the GREEN feature commit.
- No asset, sim, content or app file changed.
</success_criteria>

<output>
Create `.planning/quick/261117-han-render-laser-shots-as-camera-facing-glow/261117-han-SUMMARY.md` when done
</output>

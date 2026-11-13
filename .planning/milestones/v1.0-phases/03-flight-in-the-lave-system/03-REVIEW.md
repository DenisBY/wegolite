---
phase: 03-flight-in-the-lave-system
reviewed: 2026-11-04T11:20:00Z
depth: standard
files_reviewed: 112
files_reviewed_list:
  - eslint.config.js
  - index.html
  - src/app/boot-failure.ts
  - src/app/boot.ts
  - src/app/fallback.ts
  - src/app/game-loop.ts
  - src/app/game-session.ts
  - src/app/hints.ts
  - src/app/hud-model.ts
  - src/app/launch-sequence.ts
  - src/app/mode.ts
  - src/app/probe.ts
  - src/app/scene-manager.ts
  - src/content/schemas/system.ts
  - src/content/ships.ts
  - src/content/types.ts
  - src/input/actions.ts
  - src/input/bindings.ts
  - src/input/keyboard.ts
  - src/main.ts
  - src/render/asset-cache.ts
  - src/render/bodies/beacon.ts
  - src/render/bodies/dust.ts
  - src/render/bodies/planet.ts
  - src/render/bodies/ship.ts
  - src/render/bodies/starfield.ts
  - src/render/bodies/station.ts
  - src/render/bodies/sun.ts
  - src/render/break-pattern.ts
  - src/render/color.ts
  - src/render/exposure.ts
  - src/render/hud/draw.ts
  - src/render/hud/format.ts
  - src/render/hud/hud.ts
  - src/render/hud/messages.ts
  - src/render/hud/projection.ts
  - src/render/launch-camera.ts
  - src/render/menu-scene.ts
  - src/render/mesh.ts
  - src/render/planet-noise.ts
  - src/render/shaders/planet.glsl.ts
  - src/render/sync.ts
  - src/render/system-scene.ts
  - src/render/viewport.ts
  - src/settings/schema.ts
  - src/settings/store.ts
  - src/sim/cadence.test.ts
  - src/sim/commands.ts
  - src/sim/events.ts
  - src/sim/flight/attitude.ts
  - src/sim/flight/config.ts
  - src/sim/flight/controller.ts
  - src/sim/flight/launch.ts
  - src/sim/flight/speed.ts
  - src/sim/flight/state.ts
  - src/sim/flight/step.ts
  - src/sim/flight/torus.ts
  - src/sim/math.ts
  - src/sim/state.ts
  - src/sim/step.ts
  - src/sim/time.ts
  - src/sim/world/aegis.ts
  - src/sim/world/layout.ts
  - src/ui/controls.ts
  - src/ui/docked.ts
  - src/ui/pause.ts
  - src/ui/settings-panel.ts
  - src/ui/title.ts
  - tests/app/boot.test.ts
  - tests/app/dispose.test.ts
  - tests/app/launch-sequence.test.ts
  - tests/app/tracer.test.ts
  - tests/content/player-ship.test.ts
  - tests/e2e/aspect.spec.ts
  - tests/e2e/dispose.spec.ts
  - tests/e2e/fallback.spec.ts
  - tests/e2e/flight.spec.ts
  - tests/e2e/helpers/probe.ts
  - tests/e2e/hud.spec.ts
  - tests/e2e/launch.spec.ts
  - tests/e2e/precision.spec.ts
  - tests/e2e/scene.spec.ts
  - tests/e2e/settings.spec.ts
  - tests/guards/content-boundary.test.ts
  - tests/guards/probe-lock.ts
  - tests/guards/sim-purity.test.ts
  - tests/helpers/lave.ts
  - tests/hud/format.test.ts
  - tests/hud/projection.test.ts
  - tests/input/bindings.test.ts
  - tests/render/color.test.ts
  - tests/render/dust.test.ts
  - tests/render/exposure.test.ts
  - tests/render/launch-camera.test.ts
  - tests/render/planet-noise.test.ts
  - tests/render/planet-shader.test.ts
  - tests/render/planet-surface.test.ts
  - tests/render/starfield.test.ts
  - tests/render/station.test.ts
  - tests/render/sync.test.ts
  - tests/render/viewport.test.ts
  - tests/settings/schema.test.ts
  - tests/sim/aegis.test.ts
  - tests/sim/flight-attitude.test.ts
  - tests/sim/flight-cadence.test.ts
  - tests/sim/flight-controller.test.ts
  - tests/sim/flight-speed.test.ts
  - tests/sim/launch.test.ts
  - tests/sim/layout.test.ts
  - tests/sim/mass-lock.test.ts
  - tests/sim/precision.test.ts
  - tests/sim/torus.test.ts
findings:
  critical: 1
  warning: 10
  info: 13
  total: 24
  necessity: 0
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-11-04T11:20:00Z
**Depth:** standard
**Files Reviewed:** 112
**Status:** issues_found

## Summary

Phase 3's 61 non-test files were read line by line; the 40 test files were
checked for reliability only (the reviewer contract excludes style findings in
tests). The scope is the union of the nine `03-0N-SUMMARY.md` `key-files`
entries plus the phase evaluation scope, after dropping planning artifacts and
non-existent paths. `docker compose run --rm verify` is green per the phase
hand-off, and the findings below are paths that suite does not exercise.

The implementation is generally careful: `src/sim/` is genuinely pure (no Three,
DOM, `Math.random`, `Date`, settings or catalogue imports), the command/event
seam is respected, the fixed-step loop and the camera-relative transform are
well isolated, settings are validated rather than merged, and teardown is an
explicit registry rather than a blind traversal.

One BLOCKER remains. The prior UI audit's `GameSession.start()` re-entrancy
claim was re-checked against the source and **confirmed** (CR-01). The most
notable defect the UI audit did not cover is a space-frame mismatch in the
planet shader that makes the day/night terminator rotate with the planet instead
of staying fixed (WR-01). The remaining warnings are lifecycle and error-path
gaps around `start()`/`pause()`/settings, plus one unreachable menu scene. The
info items are dead code and small robustness inconsistencies.

## Critical Issues

### CR-01: `GameSession.start()` is re-entrant while the GLBs load — duplicate loops, HUDs and listeners, and a permanent RAF after teardown

**File:** `src/app/game-session.ts:581-610` (guard at 582, awaits at 585 and 595, `state` assigned at 610, RAF at 697, cancel at 753)

**Issue:** The re-entrancy guard runs before both awaits:

```ts
async function start(): Promise<void> {
  if (state !== undefined || disposed) return;   // 582
  try {
    await assets.preload();                       // 585
  } catch (error) { /* only this await is guarded */ }
  const catalogue = await loadShipCatalogue();    // 595
  ...
  state = flightState;                            // 610
```

`state` is therefore `undefined` for the whole load. `src/main.ts:191-193`
calls `void session.start()` on every Start click and `title.hide()` is not
reached until `game-session.ts:690`, so the button stays enabled during the
load. A double-click (or a second click while the ~15 MB of GLBs load) runs the
whole setup twice:

- two `createHud()`/`createBreakPattern()` wrappers over the same canvas;
- two `createPauseOverlay()`, `createControlsPanel()`, `createSettingsPanel()`
  instances and two `docked.onLaunch()` handlers (two launch commands per
  click);
- two `createKeyboardInputSource().attach()` listener sets; the first input
  source is replaced by the second, so its `pending` command queue is never
  drained;
- two `createGameLoop()` instances and two `requestAnimationFrame(frame)`
  chains over one state (double rendering, and the two chains steal each
  other's delta);
- `rafId` is overwritten at 697, so `dispose()` at 753 cancels only the last
  chain. The surviving chain keeps calling `frame()`, which re-schedules
  itself at 514 before returning early on `state === undefined` — a permanent
  60 Hz RAF leak after `pagehide`/`webglcontextlost`.

This is reachable on a cold load, where the preload window is hundreds of
milliseconds and the Start button gives no feedback.

**Fix:** Set a lifecycle flag synchronously before the first await and check it
after each await; disable the Start control until the first frame is live.

```ts
let starting = false;
let started = false;

async function start(): Promise<void> {
  if (starting || started || disposed) return;
  starting = true;
  try {
    await assets.preload();
    if (disposed) return;
    ...
    started = true;
  } finally {
    starting = false;
  }
}
```

Also disable `#title-start` (and set `aria-busy="true"`) while `starting`, and
clear it when the first frame is rendered.

## Warnings

### WR-01: Planet terminator compares a world-space normal with an object-space sun direction

**File:** `src/render/shaders/planet.glsl.ts:159-163` (the `dot` at 162); `src/render/bodies/planet.ts:155-159`

**Issue:** `vNormalW` is built as `mat3(modelMatrix) * normal` (planet shader
line 39), so it is in world (camera-relative) space. `planet.ts` inverse-rotates
the world sun direction into the planet's object space on every update:

```ts
const objectSunDir = rotateInverse(planetQuat, sunDir); // 157
sunDirUniform.value.set(objectSunDir.x, objectSunDir.y, objectSunDir.z); // 158
```

The fragment shader then computes `dot(normalW, uSunDir)`. For spin quaternion
`q`, that is `dot(q·n, q⁻¹·s)`, which is not `dot(n, s)`: the terminator moves
at twice the planet's angular rate instead of staying fixed in space. Lave's
`rotation_speed` is `0.004504 rad/s`, so the day/night line sweeps about
0.5°/s — clearly visible over a minute of flight. The existing test
(`tests/render/planet-shader.test.ts:209-220`) only pins the uniform value, not
the space it is compared in, so it cannot catch this.

**Fix:** Use the object-space normal for the terminator (keep `normalW` for the
rim, which is correctly world-space):

```glsl
float day = smoothstep(
  -uTerminatorSoftness,
  uTerminatorSoftness,
  dot(n, uSunDir)          // n is the object-space normal
);
```

Alternatively, stop inverse-rotating in `planet.ts` and compare `normalW` with
the world `sunDir`. Add a test that evaluates the dot product at two different
spins and asserts the lit side is unchanged.

### WR-02: `start()` does not re-check `disposed` after its awaits

**File:** `src/app/game-session.ts:584-698`

**Issue:** `pagehide`/`webglcontextlost` can call `dispose()` while `start()` is
awaiting the preload. `dispose()` sets `disposed = true` and clears the asset
cache (`assets.dispose()` at 768 sets both cached models to `undefined`). The
resumed `start()` then calls `scenes.enterSystem()` → `createSystemScene()` →
`assets.coriolis()`, which throws `"requested before AssetCache.preload()
resolved"`. `main.ts:192` uses `void session.start()`, so the rejection is
unhandled, the session is left half-built, and no failure surface is shown.
Even on a path that does not throw, a HUD and a RAF chain are created after
teardown.

**Fix:** Re-check `if (disposed) return;` after every await and before the first
`scenes.enterSystem()` call. A generation token captured at entry is the robust
form if later awaits are added.

### WR-03: Only the GLB preload is inside a try — every later boot step rejects with no visible failure

**File:** `src/app/game-session.ts:584-698` (catalogue at 595, `deriveFlightConfig` at 600, `scenes.enterSystem` at 601, `createHud` at 614, `loadSettings` at 619, overlay factories at 645-682)

**Issue:** The `try` covers only `assets.preload()`. A missing catalogue key
(`findShip`), a `FlightConfigError`, a `LayoutError`, a missing 2D context
(`requireContext2d`), a malformed DOM (`requireField`/`requireButton`) or a
storage exception all escape `start()`. `main.ts:191-193` does not attach a
`.catch`, so the player sees the title screen forever and `#failure` is never
shown. T-3-02/WORLD-05's "never a blank canvas, always a visible explanation"
currently holds only for the WebGL2 and GLB paths.

**Fix:** Wrap the whole post-preload body in one `try`/`catch` and route the
failure through `showBootFailure(reason)` + `publishFailure(reason)`, exactly as
the preload branch does (or add the same `.catch` in `main.ts`). Keep the
existing `disposed` re-check from WR-02 inside the try.

### WR-04: Storage default parameter is evaluated outside the `try`, so a blocked-storage browser can throw out of `loadSettings()`

**File:** `src/settings/store.ts:41,80,99` (`storage: Storage = localStorage`)

**Issue:** The module contract is "never throws", but the default parameter is
evaluated before the function body. Browsers that deny storage (Chrome's
"block all cookies", a sandboxed iframe) throw `SecurityError` from the
`localStorage` getter, so the inner `try`/`catch` cannot help. `loadSettings()`
is called from `game-session.ts:619` outside any `try`, which turns this into
the WR-03 unhandled rejection; `saveSettings()` is called from the fixed-step
`launchComplete` handler (`game-session.ts:184-188`), where it would throw out
of the RAF callback.

**Fix:** Resolve storage inside the guarded body, e.g. take
`storage?: Storage` and use a helper:

```ts
function resolveStorage(storage?: Storage): Storage | null {
  if (storage !== undefined) return storage;
  try { return localStorage; } catch { return null; }
}
```

Then return `defaults()` / no-op when it is `null`.

### WR-05: The menu scene installed after the background preload is never rendered

**File:** `src/main.ts:82-88` (background preload installs `scenes.enterMenu()`), `src/main.ts:170-185` (the only pre-Start render is inside `resize()`), `index.html:49-60` (opaque title gradient)

**Issue:** `resize()` runs once at `main.ts:185`, before the preload promise
resolves. When the preload then installs the real menu scene (the starfield and
the Cobra), no frame is drawn; the only later render is `session.start()`'s
`renderFrame(0)`, which renders the system scene. So plan 03-09's "the title
screen has a real scene instead of the empty one" is never visible. The opaque
`radial-gradient` at `index.html:57` would hide it even if a frame were drawn.

**Fix:** Render once inside the preload `.then` after `scenes.enterMenu()`
(call `renderActiveScene()`), or give the menu its own RAF until Start; make the
title background translucent or remove it so the scene shows through.

### WR-06: Pausing renders the previous fixed-step pose, not the frozen one

**File:** `src/app/game-session.ts:539-578` (`let alpha = 0`; the paused branch never sets it), `src/app/game-session.ts:432` (`interpolatePose(previousPose, currentPose, alpha)`)

**Issue:** `previousPose` is assigned at the start of each fixed step and
`currentPose` after it. When paused, `alpha` stays `0`, so `renderFrame` draws
`previousPose` — one whole step behind the authoritative state. At the Cobra's
350 u/s that is a ~2.9 m backward pop; at torus 1024× it is ~2.99 km, and the
probe's `position` (read from `state`) disagrees with the rendered pose by the
same amount. Pausing during torus is a normal action, so this is observable.

**Fix:** Freeze the last interpolation value on pause (keep a `lastAlpha` and
pass it when `paused`), or render `currentPose` with `alpha = 1` while paused.

### WR-07: "Reset all settings" does not reset the live hint controller

**File:** `src/app/game-session.ts:236-249` (`resetAllSettings`); `src/app/hints.ts:71-78` (the controller copies `seen` into a private `Set` at construction)

**Issue:** `resetAllSettings()` replaces `settings` with `resetSettings()`
(`hintsSeen: []`, `launchSeen: false`) but never recreates or clears `hints`.
The controller's private `seen` set still contains every hint, so no hint is
re-announced in this session. The persisted blob (`hintsSeen: []`) and the live
controller disagree until reload, when the hints suddenly replay. `launchSeen`
is reset, so the launch does replay — the two halves of the reset behave
differently, and the Settings copy promises both.

**Fix:** Add a `reset()`/`clearSeen()` to `HintController` and call it from
`resetAllSettings()` (then re-seed from the fresh `settings.hintsSeen`), or
recreate the controller with the fresh settings.

## Info

### IN-01: `src/app/mode.ts` is dead code

**File:** `src/app/mode.ts:22,33`

**Issue:** `advanceMode` and `screenForMode` have no importers anywhere in
`src/` or `tests/`. The app uses `state.mode` directly (`game-session.ts`,
`hud-model.ts`), so this module duplicates the sim's mode table without a
caller. It is dead code, not a seam: nothing injects it.

**Fix:** Delete the module, or wire it into the panel/HUD predicates it was
written for.

### IN-02: `hideFallback` and `isFallbackVisible` are unused exports

**File:** `src/app/fallback.ts:41,46`

**Issue:** Only `showWebgl2Fallback` is imported (by `main.ts`). The other two
exports have no callers, including tests.

**Fix:** Remove them, or use `isFallbackVisible` in the fallback spec instead of
re-reading the DOM.

### IN-03: `slerp` is unused

**File:** `src/sim/math.ts:174`

**Issue:** `slerp` has no callers; the render path uses `nlerp`
(`src/render/sync.ts:53`). It is a general-purpose helper with no current
instantiation.

**Fix:** Delete it, or add the unit test that would justify keeping it.

### IN-04: `compassTargetChanged` is never emitted; its handler is unreachable

**File:** `src/sim/events.ts:21`; `src/app/game-session.ts:314-316`

**Issue:** No code pushes `{ kind: "compassTargetChanged" }`; `stepFlight`
resolves `state.compassTarget` directly. The `handleEvent` branch (and its
`Compass target: ${event.target}` message) can never run, and would print a raw
enum id if it did.

**Fix:** Remove the event variant and the branch, or emit the event from the
compass cycle with a display-ready target.

### IN-05: `Hud.resize()` clears the canvas but leaves `drawn` true

**File:** `src/render/hud/hud.ts:87-108`

**Issue:** `resize()` reallocates the backing store (which clears it) but does
not reset `drawn`. Between a resize and the next `draw()`, `probe.hud.drawn`
reports `true` for a blank canvas. The next frame corrects it, but the probe is
the phase's numeric evidence surface, so a stale `true` is misleading.

**Fix:** Set `drawn = false` at the end of `resize()`.

### IN-06: `bindAction` reports success for an invalid code without binding it

**File:** `src/input/bindings.ts:85`

**Issue:** An empty or over-long `code` returns `{ ok: true }` while leaving
the map unchanged. The capture UI only passes `KeyboardEvent.code`, so the
branch is currently unreachable, but the result type then lies about what
happened.

**Fix:** Return a distinct failure (`{ ok: false, conflict: action }` is
already the shape) or throw, since the doc calls it a programmer error.

### IN-07: A throwing disposer masks the original scene-construction error

**File:** `src/render/system-scene.ts:361-364`

**Issue:** In the catch, `built.dispose()` rethrows the first disposer error
(`createDisposer` at 85-104). If a body constructor throws and a previously
built body's disposer also throws, the construction error is replaced and
`scene.clear()` is skipped.

**Fix:** Capture the dispose error, clear the scene in a `finally`, and rethrow
the original construction error (attach the dispose error as `cause`).

## Gap-Closure Re-Review (03-10 – 03-13)

**Reviewed:** 2026-11-04T11:20:00Z
**Depth:** standard
**New files:** 11 (5 source, 6 tests) — total scope now 112.
**Verification observed:** `docker compose run --rm test npx vitest run tests/render tests/app` → 15 files, 146 tests passed. The findings below are the paths that suite does **not** exercise.

This incremental pass covers the four gap-closure plans (03-10 colour-space/terminator, 03-11 calibrated PlanetMix surface, 03-12 exposure/station, 03-13 viewport/aspect). Their headline claims hold: the palette is decoded exactly once and re-encodes to the authored bytes, the terminator now pairs the object-space normal with the object-space sun (closing WR-01), the `applyOutputContract` is the only writer of colour space/tone mapping/exposure, every `SceneManager` install applies the renderer's aspect, and the GLB extras path is validated with a finite fallback (GLTFLoader does copy `extras` to `material.userData`, and `Material.copy` deep-copies it — verified against `node_modules/three/examples/jsm/loaders/GLTFLoader.js:3819` and `src/materials/Material.js:1214`).

Two substantive defects remain in the Oolite port, plus a test-parity gap that lets the calibration drift silently.

### WR-08: Oolite's `deepSeaColor` and `paleSeaColor` are ported with the `Blend` arguments reversed

**File:** `src/render/shaders/planet.glsl.ts:206-207` (used at 215, 220, 224); `tests/render/planet-shader.test.ts:240-241`

**Issue:** Oolite defines `Blend(fraction, a, b) = Lerp(b, a, fraction) = mix(b, a, fraction)` (`OOPlanetTextureGenerator.m:576-583`), and derives `paleSeaColor = Blend(0.35, polarSea, Blend(0.7, sea, land))` (`:410`) and `deepSeaColor = Blend(0.85, sea, black)` (`:421`). Both shader expressions invert the weight:

```glsl
vec3 deepSeaColor = mix(uSeaColor, vec3(0.0), 0.85);                            // 0.15 x sea, not 0.85 x sea
vec3 paleSeaColor = mix(uPolarSeaColor, mix(uSeaColor, uLandColor, 0.7), 0.35); // 0.65 polar + 0.35 x (0.3 sea + 0.7 land)
```

For Lave's authored palette, Oolite's deep sea is ≈(139,93,136) and its pale sea ≈(188,181,184); the shader produces ≈(60,38,59) — nearly black — and ≈(217,221,214) — washed-out white. That is exactly the "washed-out" read G-03-1 set out to remove, just moved from the land to the shelf/deep bands. The test comment on line 240 ("Deep sea is 0.15x the sea colour (Blend(0.85, sea, black))") states the inversion as if it were Oolite's, so the suite locks the defect in.

**Fix:**

```glsl
vec3 deepSeaColor = mix(vec3(0.0), uSeaColor, 0.85);
vec3 paleSeaColor = mix(
  mix(uLandColor, uSeaColor, 0.7),
  uPolarSeaColor,
  0.35
);
```

Update the test's string/comment accordingly and add a pin on the derived colours (or move them through the CPU mirror) so the argument order is asserted, not just the string.

### WR-09: Polar cap, polar cloud boundary and the Q-factor pole lift use `sin²(latitude)`, not Oolite's `(latitude / 90°)²`

**File:** `src/render/shaders/planet.glsl.ts:258` (`nearPole = n.y * n.y`), 248-252 (`phi` and ice), 309 (polar cloud); `src/render/planet-noise.ts:321-324, 376-377, 423-425, 483-484`

**Issue:** Oolite's texture generator computes `nearPole = ((2*fy - height)/height)²` from the **texture row** (`OOPlanetTextureGenerator.m:438-439,452-453`) and feeds it to `QFactor` and `PlanetMix`. The planet sphere's texture coordinate is latitude-linear (`kOOPlanetTexCoords`, `OOPlanetDrawable.m:252`; e.g. row 3200 is latitude 54.2° at `v = 0.199`), so Oolite's `nearPole` is `(lat/90°)²`. The shader and mirror use `n.y² = sin²(lat)`. The two values differ substantially: 0.5 vs 0.25 at 45°, and 0.579 vs 0.304 at the measured 49.59°. Because `phi = 2*polarCap - nearPole`, the ice edge, the polar cloud tint (`smoothstep(0.33, 0.53, nearPole)`) and the `uPoleValue` lift of `q` all sit much closer to the equator than Oolite's formula for the same `polar_fraction` (the same threshold corresponds to ≈68° under Oolite's parameterisation). The tests cannot catch this because the mirror uses the same `sin²` definition. Secondary: the ice ramp is `clamp((q-phi)/0.02, 0.2, 1.0)`, while Oolite ramps `0.2 + 0.8*(q-phi)/0.02`; at the midpoint the shader paints 0.5 where Oolite paints 0.6.

**Fix:** If Oolite fidelity is intended, use the latitude parameterisation on both sides:

```glsl
float latitude = asin(clamp(n.y, -1.0, 1.0)) / (0.5 * PI);
float nearPole = latitude * latitude;
```

and mirror it in `planet-noise.ts` (`Math.asin(...) / (Math.PI / 2)`), then re-derive the pinned cap/cloud/highland numbers. If `sin²(lat)` is a deliberate reparameterisation, drop the "Oolite's `phi`" framing and the 49.59° "Oolite" claim from the plan/summary. Also use `ICE_RAMP` for the ramp so the mirror and shader share one number.

### WR-10: The mirror/shader parity suite pins only three band `#define`s; the noise constants and the ice ramp can drift silently

**File:** `tests/render/planet-surface.test.ts:125-131`; `src/render/planet-noise.ts:39-60,123-184,303-336`; `src/render/shaders/planet.glsl.ts:123-172,250,264,279-280,290-293`

**Issue:** `planet-noise.test.ts` proves the mirror's own invariants and `planet-surface.test.ts` compares `COASTLINE_PORTION`/`SHALLOWS`/`DEEPS` to the shader's `#define`s. Nothing compares the shader's `hash31` offsets (`0.71/0.113/0.419`), its `17.0` factor, the `2.03` step with `(1.7, 9.2, 4.1)`, the `0.5` amplitude, the 6-octave cap, `SURFACE_SCALE = 3.1`, `CLOUD_SCALE = 5.3`, the `seed * 1.7 + 13` offset, `CLOUD_OCTAVES = 4`, or the `0.02` ice ramp to the mirror. A change to any one of them changes every calibration number (`0.6499` land, `0.28581` mixHi, `0.4142` cap, `0.2595` cloud share) while the whole suite stays green. The summary claims "the contract test keeps the shader and the mirror from drifting apart"; it only keeps three band constants aligned. (`ICE_RAMP` is exported but has no reader at all.)

**Fix:** Add a source scan in the spirit of `vectorSpaceViolations` that asserts the fragment shader contains the exact constants/caps, and assert the shader's `0.02` equals `ICE_RAMP`; or generate the GLSL constants from the mirror.

### IN-08: `uLandFraction` and `uCloudFraction` are declared and supplied but never read

**File:** `src/render/shaders/planet.glsl.ts:106-108`; `src/render/bodies/planet.ts:158-159`; `tests/render/planet-shader.test.ts:285-293`

**Issue:** After the quantile calibration, neither uniform is referenced by the shader. They exist only so the "declared set equals supplied set" contract test passes; the plan's rationale ("so the material cannot accumulate dead wiring") is backwards. The test also pins their values, reinforcing the dead wiring.

**Fix:** Remove both uniforms and update the contract test, or actually consume them (e.g. as debug readouts), so the set-equality test keeps its meaning.

### IN-09: The neutral-emissive fallback does not set a neutral colour

**File:** `src/render/bodies/station.ts:95-104` (comment), 117-124 (fallback path); `tests/render/station.test.ts:303-315`

**Issue:** `applyNeutralEmissive` sets `emissiveIntensity = 1` and leaves `material.emissive` as GLTFLoader set it. The comment says "GLTFLoader gives every material `emissiveFactor (1,1,1)`", but the glTF default is `[0,0,0]`; only this asset authors `[1,1,1]`. On an asset with missing extras and a default emissive, the fallback that is meant to avoid "vanishing" produces a black emissive. The missing-extras test uses `new MeshStandardMaterial()` (black emissive) and only asserts finite values, so it cannot tell a neutral glow from black.

**Fix:** In the fallback, set `material.emissive.setRGB(1, 1, 1)` (or a documented neutral tint) before `emissiveIntensity = 1`, and assert a non-zero emissive product in the missing-extras case.

### IN-10: `color.ts`'s clamp passes `NaN` through while the exposure clamp maps non-finite to 0

**File:** `src/render/color.ts:43-48`; compare `src/render/exposure.ts:76-90`

**Issue:** `clamp01(NaN)` returns `NaN` (both comparisons are false), so `srgbToLinear(NaN)`/`linearToSrgb(NaN)` propagate `NaN`. The exposure module's own `clamp01` maps every non-finite value to 0. A malformed authored colour would upload a `NaN` palette uniform and produce undefined pixels rather than a safe black, contradicting the module's own "a bad uniform cannot extrapolate" contract.

**Fix:** `if (!Number.isFinite(value)) return 0;` before the range checks, matching `exposure.ts`.

### IN-11: The `?test=1` swap e2e can pass without performing a swap

**File:** `tests/e2e/aspect.spec.ts:122-126`

**Issue:** `await window.__wegolite?.test?.swapSystem()` silently does nothing when the hook or method is absent; the following `expectAspect` then reads the pre-swap aspect and passes. The spec claims to prove the swap path re-applies the viewport, but it only proves the aspect did not change.

**Fix:** Assert `typeof window.__wegolite?.test?.swapSystem === "function"` before calling it, and assert an observable swap effect (e.g. `probe.renders`/`probe.memory` changing, or a scene identity field) after it.

### IN-12: Three doc comments contradict the code

**File:** `src/render/shaders/planet.glsl.ts:101-104`; `src/render/exposure.ts:139-140`; `src/render/exposure.ts:218-231`

**Issue:** (a) "Eight times the plan's starting value" — `RELIEF_SCALE` 80 is 20× the plan's 4.0. (b) "each has unit column sums" — the ACES matrices have unit **row** sums, which is the property `multiplyMatrix` relies on for a grey pixel. (c) "the largest authored albedo byte that still displays without saturating" — `clippingAlbedoByteFor(1)` returns 101, whose display is already 255; 100 is the largest non-saturating byte.

**Fix:** Correct the comments (20×; row sums; "the first byte that clips").

### IN-13: `start()`'s `starting` flag is never cleared

**File:** `src/app/game-session.ts:185,594-595,597-606,610-716`

**Issue:** The CR-01 fix sets `starting = true` before the first await but never resets it. After a preload failure the opaque `#failure` surface covers the title, so the impact is small; but on a throw *after* the preload (the existing WR-03 path: `loadShipCatalogue`, `deriveFlightConfig`, `enterSystem`, `createHud`, `loadSettings`, the panel factories) the title stays visible and every later Start click returns at line 594 — the session can never be retried without a reload. The existing review's CR-01 fix snippet included `finally { starting = false; }`; the implementation omitted it. (This predates the gap-closure diff; it is recorded here because `game-session.ts` is in this scope.)

**Fix:** Wrap the whole post-guard body in `try { ... } finally { starting = false; }`, keeping `state !== undefined`/`disposed` as the terminal guards.

---

_Reviewed: 2026-11-04T11:20:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
_Scope: phase 03 full review + gap-closure re-review (03-10 – 03-13)_

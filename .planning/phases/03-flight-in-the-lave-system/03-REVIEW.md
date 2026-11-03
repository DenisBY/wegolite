---
phase: 03-flight-in-the-lave-system
reviewed: 2026-11-03T20:41:00Z
depth: standard
files_reviewed: 101
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
  - src/render/hud/draw.ts
  - src/render/hud/format.ts
  - src/render/hud/hud.ts
  - src/render/hud/messages.ts
  - src/render/hud/projection.ts
  - src/render/launch-camera.ts
  - src/render/menu-scene.ts
  - src/render/mesh.ts
  - src/render/shaders/planet.glsl.ts
  - src/render/sync.ts
  - src/render/system-scene.ts
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
  - tests/render/dust.test.ts
  - tests/render/launch-camera.test.ts
  - tests/render/planet-shader.test.ts
  - tests/render/starfield.test.ts
  - tests/render/station.test.ts
  - tests/render/sync.test.ts
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
  warning: 7
  info: 7
  total: 15
  necessity: 0
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-11-03T20:41:00Z
**Depth:** standard
**Files Reviewed:** 101
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

---

_Reviewed: 2026-11-03T20:41:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

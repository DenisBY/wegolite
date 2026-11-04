---
phase: 03-flight-in-the-lave-system
plan: 13
subsystem: render / viewport / projection
tags:
  - aspect-ratio
  - projection-matrix
  - viewport
  - camera
  - world-02
  - g-03-2
  - regression

requires:
  - phase: 03-flight-in-the-lave-system
    provides: SceneManager install paths, the three aspect-1 cameras, main.ts resize and the probe contract
  - phase: 03-flight-in-the-lave-system
    provides: the ?test=1 scene-swap hook and the probe-based e2e convention

provides:
  - src/render/viewport.ts — ViewportSize, aspectOf, applyViewport (the single writer of camera.aspect)
  - src/app/scene-manager.ts — viewport applied on construction and on every enterMenu/enterSystem install
  - src/app/probe.ts — aspect?: number (the live active-camera aspect)
  - tests/e2e/aspect.spec.ts — 2222x1000, 16:9 and swap aspect regression

affects:
  - WORLD-02 acceptance (the 3D projection now matches the canvas at every viewport shape)
  - plan 03-11/03-12 visual work (they render through the same corrected cameras)

actuals:
  tokens: 4578
  tasks: 2
  commits: 2
  plan_head_before: d02692156c9952ec46f01856f805883e75ecf954
  plan_head_after: 2cedd1471c86f8a32705513ab7017b865a4919fd

tech-stack:
  added: []
  patterns:
    - one render-layer helper is the only writer of camera.aspect, fed by the renderer's own CSS size
    - the uniform-projection invariant elements[0] * aspect == elements[5] is the numeric proof, not a screenshot
    - e2e sets the viewport before navigation so no resize can silently repair the camera

key-files:
  created:
    - src/render/viewport.ts
    - tests/render/viewport.test.ts
    - tests/e2e/aspect.spec.ts
  modified:
    - src/app/scene-manager.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/main.ts
    - tests/app/dispose.test.ts

key-decisions:
  - "The SceneManager owns the aspect, not the camera constructors: the pure render modules keep aspect = 1 and the manager applies the renderer's current size on every install, so there is exactly one writer."
  - "renderer.getSize() reports CSS pixels, so the device-pixel-ratio factor cancels; the manager needs no window access and the DPR cap cannot skew the aspect."
  - "A zero, negative or non-finite dimension returns false and leaves camera.aspect and the projection matrix byte-identical, so a hidden/minimised window cannot write an Infinity projection."
  - "The probe publishes the live active-camera aspect from renderFrame, the one path start(), every animation frame and swapSystem() share, so a rebuilt scene cannot leave the field stale."
  - "The browser regression sets the viewport before goto and never resizes after Start: a later resize would repair the camera and reproduce the blind spot in hud.spec.ts."

requirements-completed:
  - WORLD-02

coverage:
  - id: D1
    description: "Every camera the SceneManager installs — the empty pre-load scene, the real menu scene and the system scene on Start and on a second enterSystem — has the renderer's aspect with no window resize."
    requirement: WORLD-02
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#stays textured because only the cache owns the shared textures"
        status: pass
      - kind: browser
        ref: "tests/e2e/aspect.spec.ts#starts at 2222x1000 with a 2.222 projection and no resize"
        status: pass
    human_judgment: false
  - id: D2
    description: "The projection is uniform at 1:1, 16:9 and 2.222:1: projectionMatrix.elements[0] * aspect equals elements[5] within 1e-9, so a sphere stays a sphere."
    requirement: WORLD-02
    verification:
      - kind: unit
        ref: "tests/render/viewport.test.ts#sets a 2222x1000 viewport to 2.222 and stays uniform"
        status: pass
      - kind: unit
        ref: "tests/render/viewport.test.ts#leaves a 1:1 viewport with equal horizontal and vertical scale"
        status: pass
      - kind: unit
        ref: "tests/render/viewport.test.ts#stays uniform at 16:9, so the fix is not ultrawide-specific"
        status: pass
    human_judgment: false
  - id: D3
    description: "Zero, negative, NaN and infinite dimensions are rejected without touching camera.aspect or the projection matrix."
    requirement: WORLD-02
    verification:
      - kind: unit
        ref: "tests/render/viewport.test.ts#rejects a zero width viewport without touching the projection"
        status: pass
      - kind: unit
        ref: "tests/render/viewport.test.ts#rejects a NaN width viewport without touching the projection"
        status: pass
      - kind: unit
        ref: "tests/render/viewport.test.ts#rejects a negative width viewport without touching the projection"
        status: pass
    human_judgment: false
  - id: D4
    description: "A ?test=1 scene swap re-applies the viewport, so rebuilding the scene mid-session cannot reintroduce the stretch."
    requirement: WORLD-02
    verification:
      - kind: browser
        ref: "tests/e2e/aspect.spec.ts#a ?test=1 scene swap re-applies the viewport"
        status: pass
      - kind: unit
        ref: "tests/app/dispose.test.ts#stays textured because only the cache owns the shared textures (second enterSystem)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The probe publishes the live active-camera aspect and it matches innerWidth/innerHeight at 2222x1000 and at 1920x1080, so the proof is numeric rather than a screenshot."
    requirement: WORLD-02
    verification:
      - kind: browser
        ref: "tests/e2e/aspect.spec.ts#starts at 2222x1000 with a 2.222 projection and no resize"
        status: pass
      - kind: browser
        ref: "tests/e2e/aspect.spec.ts#a 16:9 start projects at 1.777, so the fix is not ultrawide-specific"
        status: pass
    human_judgment: false

duration: 6min
completed: 2026-11-04
status: complete
---

# Phase 3 Plan 13: Viewport aspect on every camera install Summary

**The 3D projection now matches the canvas at every viewport shape: one helper writes `camera.aspect` from the renderer's own size on every scene install, so starting at 2222x1000 yields a 2.222 projection with no resize and Lave's limb stays a circle.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-04T10:18:01Z
- **Completed:** 2026-11-04T10:24:00Z
- **Tasks:** 2
- **Files modified:** 8 (3 created, 5 modified)

## Accomplishments

- Added `src/render/viewport.ts` (`ViewportSize`, `aspectOf`, `applyViewport`) as the **only** writer of `camera.aspect`; it rejects zero, negative, NaN and infinite sizes so no Infinity projection can be written.
- `SceneManager` now applies the renderer's current CSS size to the empty camera at construction and to every camera it installs in `enterMenu()` and `enterSystem()` — the Start path and the `?test=1` swap path both go through `enterSystem`, so both are covered by construction.
- `main.ts`'s `resize()` delegates its aspect write to `applyViewport`, keeping the zero-dimension early return and `setSize(..., false)`.
- The probe publishes `aspect` (the live active-camera aspect) from `renderFrame`, the single path used by `start()`, every animation frame and `swapSystem()`, and from `main.ts` before a session exists.
- Node tests prove the uniform-projection invariant at 1:1, 16:9 and 2.222:1 and prove a degenerate viewport leaves `projectionMatrix` byte-identical.
- A new browser spec starts at 2222x1000 and 1920x1080 with the viewport set **before** `goto` and never resizes afterwards, and asserts `probe.aspect` against `innerWidth/innerHeight`; the `?test=1` swap case keeps the aspect.

## Task Commits

Each task was committed atomically:

1. **Task 1: One helper, every install** — `49220f5` (feat)
2. **Task 2: Publish the live aspect and lock the regression** — `2cedd14` (feat)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `src/render/viewport.ts` — `aspectOf`/`applyViewport`, type-only Three import, no `window`; the single writer of `camera.aspect`.
- `src/app/scene-manager.ts` — module-scoped `Vector2` scratch and `rendererSize()`; applies the viewport on construction and before each `retire()` in `enterMenu`/`enterSystem`.
- `src/main.ts` — `resize()` delegates to `applyViewport` and publishes `probe.aspect`.
- `src/app/game-session.ts` — `probe.aspect = currentScene.camera.aspect` after the renderFrame guard.
- `src/app/probe.ts` — optional `aspect?: number`; `publishFailure` unchanged.
- `tests/render/viewport.test.ts` — uniform-projection invariant, 1:1/16:9/2.222 and the degenerate-size guard.
- `tests/app/dispose.test.ts` — stub renderer gains `getSize()`; asserts 1.6 after the empty, menu, system and second-system installs.
- `tests/e2e/aspect.spec.ts` — 2222x1000 Start, 16:9 control and the `?test=1` swap, probe-only with no screenshots.

## Decisions Made

- **The manager, not the constructors, owns the aspect.** `src/render/system-scene.ts` and `src/render/menu-scene.ts` deliberately keep `aspect = 1`; adding a second writer there was the original failure mode, so the install path is the only correction point.
- **Renderer CSS size is the source of truth.** `getSize()` returns CSS pixels, so the DPR factor cancels and the helper needs no `window` access; the render modules stay DOM-free.
- **Reject rather than coerce a degenerate size.** `aspectOf` returns `undefined` for anything not finite and positive, and `applyViewport` leaves the projection untouched — the safety property the threat model asks for (T-3-34).
- **The e2e never resizes after Start.** `hud.spec.ts` resized after entering the system, which incidentally repaired the camera and hid the defect; the new spec sets the viewport before navigation.

## Deviations from Plan

None — plan executed as written.

## Issues Encountered

- Prettier reformatted `scene-manager.ts` and `aspect.spec.ts` on the first lint pass (formatting only).

## Verification

All commands were run in Docker (the container is the only authority):

- `docker compose run --rm test npx vitest run tests/render/viewport.test.ts tests/app/dispose.test.ts tests/compliance.test.ts` → 3 files, 28 tests passed.
- `docker compose run --rm test` → 50 files, 469 tests passed (full unit/integration suite).
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/aspect.spec.ts"` → 3 passed.
- `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/resize.spec.ts tests/e2e/hud.spec.ts"` → 4 passed (1.5 min).
- `docker compose run --rm typecheck` → clean.
- `docker compose run --rm lint` → ESLint and Prettier clean.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- G-03-2 is closed: the flight camera no longer renders at aspect 1, so the planet limb, Coriolis and rotation paths are uniform without a window resize.
- Any future camera install must go through `SceneManager`; a new direct `PerspectiveCamera` that renders outside the manager would reintroduce the defect, and `tests/app/dispose.test.ts` plus `tests/e2e/aspect.spec.ts` are the guards.
- The HUD Canvas2D scaling path was not touched; it was already correct and remains covered by `tests/e2e/hud.spec.ts`.

## Self-Check: PASSED

- `src/render/viewport.ts` — FOUND
- `tests/render/viewport.test.ts` — FOUND
- `tests/e2e/aspect.spec.ts` — FOUND
- `49220f5` — FOUND in history
- `2cedd14` — FOUND in history

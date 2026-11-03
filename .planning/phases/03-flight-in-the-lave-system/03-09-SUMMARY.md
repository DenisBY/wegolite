---
phase: 03-flight-in-the-lave-system
plan: 09
subsystem: app / scene-lifecycle / render / probe
tags:
  - world-04
  - scene-swap
  - gpu-memory
  - disposal
  - asset-cache
  - probe
  - pagehide
  - playwright

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plans 01-08 — the probe/session/RAF, plan 03's `createMenuScene`, the planet/sun/starfield/station/ship bodies, the settings layer and the fallback boot
  - phase: 02-data-pipeline-content-compiler
    provides: the shared Cobra/Coriolis GLBs and their baked textures

provides:
  - src/app/scene-manager.ts (enterMenu, enterSystem, disposeSystem, dispose, renderLists.dispose on every swap)
  - src/render/system-scene.ts (createDisposer, assembleSystemScene, injectable factories, idempotent dispose)
  - src/render/asset-cache.ts (loadCobra/loadCoriolis, loaded, single-owner dispose with dedupe)
  - src/render/menu-scene.ts (explicit registry, never disposes the cache)
  - src/render/mesh.ts (materialList)
  - src/app/probe.ts (memory counters; gated swapSystem/disposeSystem)
  - tests/app/dispose.test.ts and tests/e2e/dispose.spec.ts
  - reconciled 03-VALIDATION.md and two PROJECT.md Key Decisions rows

affects:
  - Phase 6 hyperspace (the swap path is system-agnostic and ready for a real second system)
  - Phase 7 QUAL-05 (context-loss recovery still deferred)

actuals:
  tokens: 24200
  tasks: 3
  commits: 3
  plan_head_before: a439a1c9a44eda6067a72b6542dbd9f078a1f8cf
  plan_head_after: f838a18

tech-stack:
  added: []
  patterns:
    - build -> swap -> dispose with renderer.renderLists.dispose() after every scene change
    - explicit scene-owned disposable registry instead of a blind traverse(dispose)
    - one AssetCache owner for shared GLBs; scenes own only clones and per-scene resources
    - idempotent teardown driven by one AbortController and one RAF id
    - probe counters (renderer.info.memory/programs) as the non-growth proof, never pixels
    - gated test hook with four fixed operations, withdrawn with the session

key-files:
  created:
    - tests/app/dispose.test.ts
    - tests/e2e/dispose.spec.ts
  modified:
    - src/app/scene-manager.ts
    - src/app/probe.ts
    - src/app/game-session.ts
    - src/main.ts
    - src/render/asset-cache.ts
    - src/render/system-scene.ts
    - src/render/menu-scene.ts
    - src/render/mesh.ts
    - tests/guards/content-boundary.test.ts
    - .planning/PROJECT.md
    - .planning/phases/03-flight-in-the-lave-system/03-VALIDATION.md

key-decisions:
  - "enterMenu() installs createMenuScene(assets) only once the cache reports loaded(); main.ts warms the cache in the background and re-enters the menu when the active scene is still the menu, so every load ends with a real title scene and a system entry never races a late menu build."
  - "Scene disposal is an explicit Disposable[] registry, not a traversal. The half-built path registers each body as it is constructed, so a throwing factory frees what exists and rethrows the named error."
  - "AssetCache dedupes by resource identity: the GLBs share one material across many meshes, so a set-based dispose is what makes 'freed once' true."
  - "The ?test=1 hook exposes swapSystem/disposeSystem/setPosition/setSpeed only; GameSession.dispose() deletes probe.test so the hook cannot outlive the session it drives."
  - "pagehide aborts every listener through one lifecycle AbortController, then the session releases RAF, input, HUD, scene and cache in that order; a bfcache restore therefore requires a reload (not tested in v1)."
  - "The settings denial is proved by two probes with the same import line: the src/sim probe must fail no-restricted-imports and the src/app probe must pass, which attributes the failure to the zone rather than a missing module."

patterns-established:
  - "A scene swap builds before it swaps: a throwing factory leaves the previous scene live."
  - "Shared GLB ownership is proved with recording dispose events on the cached material/texture, not with a comment."
  - "GPU non-growth is a Playwright assertion over renderer.info.memory and programs.length across three swaps."

requirements-completed: [WORLD-04]

coverage:
  - id: D1
    description: "enterSystem builds the next scene, swaps the active reference, disposes the previous scene and calls renderer.renderLists.dispose(); the shared AssetCache survives."
    requirement: WORLD-04
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#stays textured because only the cache owns the shared textures"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three consecutive swaps plus settle frames leave geometries, textures and programs at or below the first-swap baseline, with no console or page error."
    requirement: WORLD-04
    verification:
      - kind: e2e
        ref: "tests/e2e/dispose.spec.ts#three system swaps keep GPU memory at the first-swap baseline"
        status: pass
    human_judgment: false
  - id: D3
    description: "SystemScene.dispose() frees only scene-owned resources, is idempotent, and never disposes a cached GLB geometry/material/texture."
    requirement: WORLD-04
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#frees scene resources once and never a cached GLB resource"
        status: pass
      - kind: unit
        ref: "tests/app/dispose.test.ts#disposes only what was registered, and only once"
        status: pass
    human_judgment: false
  - id: D4
    description: "A half-built scene (a body constructor throws) disposes what it built and rethrows the named error."
    requirement: WORLD-04
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#disposes a half-built scene and rethrows the named error"
        status: pass
    human_judgment: false
  - id: D5
    description: "AssetCache is the single owner of the shared GLBs and frees each shared geometry, material and texture exactly once, even when one material is shared by four meshes."
    requirement: WORLD-04
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#frees each shared geometry, material and texture exactly once"
        status: pass
    human_judgment: false
  - id: D6
    description: "The menu Cobra is still textured after a system swap: the cached material keeps its map, AssetCache.dispose has not run, and a fresh createMenuScene resolves a textured clone."
    requirement: WORLD-04
    verification:
      - kind: unit
        ref: "tests/app/dispose.test.ts#stays textured because only the cache owns the shared textures"
        status: pass
    human_judgment: false
  - id: D7
    description: "pagehide tears the session down, withdraws the test hook, and a reload boots to the same GPU baseline; disposeSystem then swapSystem leaves the scene drawable."
    requirement: WORLD-04
    verification:
      - kind: e2e
        ref: "tests/e2e/dispose.spec.ts#pagehide tears the session down and a reload starts from the same baseline"
        status: pass
      - kind: e2e
        ref: "tests/e2e/dispose.spec.ts#disposing the system scene and re-entering leaves the scene drawable"
        status: pass
    human_judgment: false
  - id: D8
    description: "The ?test=1 hook is absent on a normal load and limited to swapSystem/disposeSystem/setPosition/setSpeed."
    requirement: WORLD-04
    verification:
      - kind: e2e
        ref: "tests/e2e/dispose.spec.ts#a normal load exposes no test hook"
        status: pass
    human_judgment: false
  - id: D9
    description: "The src/sim -> src/settings denial is proven by a failing src/sim probe and a passing src/app control probe with the same import line."
    requirement: FLGT-07
    verification:
      - kind: unit
        ref: "tests/guards/content-boundary.test.ts#denies the settings layer under src/sim but allows the same import under src/app"
        status: pass
    human_judgment: false
  - id: D10
    description: "03-VALIDATION.md is reconciled (complete/nyquist/wave-0, sign-off ticked, implementing tasks named) and PROJECT.md records the D-10 launch-roll and stricter FLGT-04 torus decisions."
    requirement: WORLD-04
    verification: []
    human_judgment: true
    rationale: "A documentation reconciliation: correctness is whether the rows match the plans that ran and the existing table was not disturbed, which the verifier checks by reading the diff rather than by a test."

# Metrics
duration: 20min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 9: Scene lifecycle, shared-asset ownership and teardown Summary

**A `SceneManager` that swaps Lave three times without growing GPU memory, an explicit scene-vs-cache ownership split proved with recording doubles, idempotent teardown on `pagehide`, and a `?test=1` swap hook that makes the non-growth measurable.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-11-03T20:00:00Z (approx.)
- **Completed:** 2026-11-03T20:20:00Z
- **Tasks:** 3
- **Files modified:** 13 (2 created, 11 modified, including the two planning artifacts)

## Accomplishments

- `SceneManager` now has one swap path: build the next scene, install it, dispose the previous scene and menu in a `try/finally`, then `renderer.renderLists.dispose()`. `enterSystem` is system-agnostic (Phase 6 can pass a second system unchanged) and the shared `AssetCache` is never disposed on a swap.
- `enterMenu()` is the single caller of plan 03's `createMenuScene(assets)`: the title screen is a real starfield-plus-Cobra scene, installed once the shared Cobra is available (plan 01's empty scene remains only as the pre-load fallback).
- `renderer.info.memory.geometries`, `memory.textures` and `programs.length` are published as `probe.memory`; three `swapSystem()` calls plus settle frames leave all three at or below the first-swap baseline in headless Chromium.
- `SystemScene` keeps an explicit `Disposable[]` registry (planet, sun, starfield, dust, beacons, cloned station/ship materials) and frees nothing else. `dispose()` is idempotent, and a body constructor that throws disposes the partial scene and rethrows the named error.
- `AssetCache` is the single owner of the shared GLBs. `loadCobra()`/`loadCoriolis()` are memoised, `loaded()` gates the menu build, and `dispose()` dedupes by identity so a material shared across four meshes is freed once.
- The menu Cobra stays textured after a system swap: the cached material keeps its `map`, `AssetCache.dispose()` has not run, and a fresh `createMenuScene` still resolves a clone textured from the cache.
- `GameSession.dispose()` aborts its controller, cancels the RAF, clears held input and the HUD canvas, disposes the scene then the cache, and is idempotent. `main.ts` releases every listener through one lifecycle controller on `pagehide`/`webglcontextlost`.
- The `?test=1` surface is four fixed operations (`swapSystem`, `disposeSystem`, `setPosition`, `setSpeed`), is absent on a normal load, and is withdrawn (`delete probe.test`) when the session is torn down.
- The deferred settings-layer denial is now non-vacuous: the same `../settings/schema.js` import fails `npx eslint` under `src/sim/` and passes under `src/app/`.
- `03-VALIDATION.md` is reconciled (frontmatter complete, sign-off ticked, implementing task/wave per requirement) and `PROJECT.md` records the D-10 launch-roll world-basis reconciliation and the deliberately stricter FLGT-04 torus rule.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "swap Lave three times and return GPU memory to baseline"** - `6563783` (feat)
2. **Task 2: Make the ownership split explicit and dispose idempotent** - `edfb23b` (fix)
3. **Task 3: Teardown listeners, RAF and HUD; close the phase with full verify** - `f838a18` (feat)

**Plan metadata:** committed after this file (docs).

## Files Created/Modified

- `src/app/scene-manager.ts` - `enterMenu`/`enterSystem`/`disposeSystem`/`dispose`, build-before-swap, menu disposal, `renderLists.dispose()`
- `src/app/probe.ts` - `WegoliteMemoryProbe`, `readMemory`, `WegoliteSceneTestHook`, extended `createTestHook`
- `src/app/game-session.ts` - swap/dispose hooks, memory publishing, idempotent full teardown, hook withdrawal
- `src/main.ts` - background preload with guarded menu re-entry, lifecycle `AbortController`, `pagehide`/context-loss teardown
- `src/render/system-scene.ts` - `createDisposer`, `assembleSystemScene`, `SystemSceneFactories`, per-body registration and half-built cleanup
- `src/render/asset-cache.ts` - memoised `loadCobra`/`loadCoriolis`, `loaded()`, identity-deduped single-owner dispose, injectable loader
- `src/render/menu-scene.ts` - explicit registry; frees only its starfield and cloned materials
- `src/render/mesh.ts` - `materialList()` (union narrowing without `any`)
- `tests/app/dispose.test.ts` - registry semantics, scene-vs-cache ownership, half-built cleanup, cache dedupe, menu-still-textured proof
- `tests/e2e/dispose.spec.ts` - three-swap non-growth, pagehide/reload baseline, dispose/re-enter, no-hook-on-normal-load
- `tests/guards/content-boundary.test.ts` - `withProbeAt` plus the failing-`src/sim`/passing-`src/app` settings pair
- `.planning/phases/03-flight-in-the-lave-system/03-VALIDATION.md` - reconciled validation contract
- `.planning/PROJECT.md` - two Key Decisions rows appended, existing rows untouched

## Decisions Made

- `enterMenu()` needs the shared Cobra, so it installs the real menu only when `AssetCache.loaded()`; `main.ts` warms the cache in the background and re-enters the menu only if no system has been entered. This keeps the boot `enterMenu()` call meaningful without turning a pre-load race into a throw.
- Disposal is an explicit registry with an injectable body-factory seam rather than a test-only mock layer: the same disposers serve production and the Node proof, so the test cannot drift from the code it validates.
- `AssetCache.dispose()` clears the models instead of setting a permanent flag, so idempotency comes from state rather than a boolean and a later `preload()` can legitimately reload.
- `GameSession.dispose()` withdraws `probe.test`; a test surface that outlives its session would let a spec drive a disposed scene.
- The settings control probe imports `validateSettings` (a real `schema.ts` export) rather than `loadSettings` (which lives in `store.ts`) so the passing control is lint-clean while the specifier stays `../settings/schema.js`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Added `AssetCache.loaded()` and a guarded background menu build**
- **Found during:** Task 1
- **Issue:** `main.ts` calls `scenes.enterMenu()` before `session.start()` awaits `assets.preload()`. Installing `createMenuScene(assets)` there would call `assets.cobra()` and throw, so the plan's "boot `enterMenu()` exercises the real menu scene" could not hold.
- **Fix:** `enterMenu()` installs the real menu when `loaded()` is true and the plan-01 empty scene otherwise; `main.ts` preloads in the background and re-enters the menu only while no system scene is active. The failure path is unchanged: `session.start()` still awaits the same memoised rejection and shows the fallback.
- **Files modified:** `src/render/asset-cache.ts`, `src/app/scene-manager.ts`, `src/main.ts`
- **Verification:** `tests/e2e/scene.spec.ts` and `fallback.spec.ts` remain green; `tests/app/dispose.test.ts` asserts the real menu scene is installed.
- **Committed in:** `6563783`

**2. [Rule 1 - Bug] `Array.isArray` narrowed to `any[]` and broke the type-aware lint**
- **Found during:** Task 2 (`docker compose run --rm lint`)
- **Issue:** handling `Material | Material[]` with `Array.isArray` made the true branch `any[]`, which `no-unsafe-argument`/`no-unsafe-call` reject; the same pattern failed in `system-scene.ts` and the new test.
- **Fix:** added `materialList()` in `src/render/mesh.ts`, which narrows with `instanceof THREE.Material` instead, and routed the starfield, beacon, dust and test paths through it.
- **Files modified:** `src/render/mesh.ts`, `src/render/system-scene.ts`, `tests/app/dispose.test.ts`
- **Verification:** lint and typecheck green; the disposal tests still pass.
- **Committed in:** `edfb23b`

**3. [Rule 3 - Blocking] `exactOptionalPropertyTypes` rejected `probe.test = undefined`**
- **Found during:** Task 3 (`docker compose run --rm typecheck`)
- **Issue:** `test?: WegoliteTestHook` cannot be assigned `undefined` under `exactOptionalPropertyTypes: true`, so teardown could not withdraw the hook.
- **Fix:** `delete probe.test`, which removes the property and is the correct expression of "the hook no longer exists".
- **Files modified:** `src/app/game-session.ts`
- **Verification:** typecheck green; the pagehide spec asserts the hook is `undefined` after teardown.
- **Committed in:** `f838a18`

**4. [Rule 2 - Missing critical] The control probe could not import `loadSettings` from `schema.ts`**
- **Found during:** Task 3
- **Issue:** the plan's probe pair shares the specifier `../settings/schema.js`, but `loadSettings` is exported by `src/settings/store.ts`; importing a non-existent symbol would make the passing `src/app` control fail for the wrong reason.
- **Fix:** both probes import `validateSettings`, a real `schema.ts` export. The sim probe still fails `no-restricted-imports` with the configured message; the app probe passes.
- **Files modified:** `tests/guards/content-boundary.test.ts`
- **Verification:** the pair passes in `tests/guards/content-boundary.test.ts`; both probe files are removed.
- **Committed in:** `f838a18`

---

**Total deviations:** 4 auto-fixed (2 missing-critical, 1 bug, 1 blocking)
**Impact on plan:** No scope change. The swap/dispose API, the ownership split and the teardown contract are exactly the plan's; the additions are the load-state guard the plan's own menu requirement needed and two type-level fixes.

## Issues Encountered

- A `pagehide` teardown followed by a bfcache restore would show a disposed app; v1 requires a reload. The plan's contract is `pagehide` teardown, and the e2e proof reloads, so this is recorded rather than worked around.
- No real-GPU browser is available in the container; the manual WORLD-02/WORLD-03/WORLD-05 rows from `03-VALIDATION.md` remain human checks.

## Known Stubs

None.

## Threat Flags

None — T-3-22 (explicit registry, idempotent dispose, `renderLists.dispose()`, three-swap non-growth), T-3-23 (four fixed gated operations, absent on a normal load, withdrawn on teardown) and T-3-24 (one cache owner, menu-still-textured and recording-double proofs) are implemented and covered.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 3 is complete: `docker compose run --rm verify` is green (lint, typecheck, assets:check, 449 unit tests, build, 26 e2e tests).
- Phase 6 can enter a second system through the same `SceneManager.enterSystem(system, stationDef)` path; Phase 7 owns full context-loss recovery.
- Manual rows from `03-VALIDATION.md` remain: Lave-at-a-glance fidelity, jitter/z-fighting, launch feel, HUD readability, torus/dust legibility and the real-GPU fallback check.
- `STATE.md` and `ROADMAP.md` were deliberately not modified by this executor; the orchestrator owns those writes.

---
*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*

## Self-Check: PASSED

- Every created file exists on disk: `tests/app/dispose.test.ts`, `tests/e2e/dispose.spec.ts`.
- Every task commit is an ancestor of HEAD (`6563783`, `edfb23b`, `f838a18`).
- `docker compose run --rm verify` is green: lint, typecheck, assets:check, 449 unit tests, build and 26 e2e tests.
- `STATE.md` and `ROADMAP.md` were not modified by this executor.

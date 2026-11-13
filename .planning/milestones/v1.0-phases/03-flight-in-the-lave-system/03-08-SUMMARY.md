---
phase: 03-flight-in-the-lave-system
plan: 08
subsystem: app / boot / fallback
tags:
  - webgl2
  - fallback
  - content-boundary
  - boot
  - accessibility
  - playwright
  - probe

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 01's `#failure` surface, `showBootFailure`, `publishFailure` and the session/RAF; plan 07's launch/camera work that the boot now guards
  - phase: 02-data-pipeline-content-compiler
    provides: the build-time `manifest.json` and the `ContentBoundaryError` contract

provides:
  - src/app/boot.ts (bootApp, BootResult, buildRenderer, RendererFactory)
  - src/app/fallback.ts (showWebgl2Fallback, hideFallback, isFallbackVisible)
  - src/main.ts boot guard and `webglcontextlost` stop
  - tests/app/boot.test.ts (injected-manifest distinctness proof)
  - tests/e2e/fallback.spec.ts (three failure modes plus a normal-path control)

affects:
  - 03-09 (scene disposal now runs behind `stopSession`, shared by pagehide and context loss)
  - Phase 7 QUAL-05 (full context-loss recovery remains deferred)

actuals:
  tokens: 7100
  tasks: 2
  commits: 2
  plan_head_before: ef857bd5bf1390b5e9446a53c48178576ae00bfc
  plan_head_after: 67beeca64dc6153b1dcde9fdcbce52528c3cc4d6

tech-stack:
  added: []
  patterns:
    - a boot function whose manifest assertion is deliberately outside the renderer try
    - one failure surface composed by the content, GLB and WebGL2 paths
    - failure taxonomy proved in Node with an injected renderer factory
    - capability-failure e2e via `addInitScript` prototype overrides

key-files:
  created:
    - src/app/boot.ts
    - src/app/fallback.ts
    - tests/app/boot.test.ts
    - tests/e2e/fallback.spec.ts
  modified:
    - src/main.ts
    - tests/e2e/precision.spec.ts

key-decisions:
  - "bootApp returns Promise<BootResult> but is not `async`: the manifest assertion must throw synchronously at module scope, exactly as the pre-extraction main.ts did, and the lint rule forbids an async function with no await."
  - "The WebGL2 fallback composes plan 01's single #failure root: showBootFailure owns the DOM and publishFailure owns the probe; both are called separately."
  - "Three.js logs its own console.error before rethrowing a constructor failure; the fallback spec asserts no pageerror (the plan's contract) and asserts console silence only on the normal path."
  - "Context loss shows a context-specific plain message, not the WebGL2 capability advice; Phase 7 owns full recovery."
  - "The content-manifest case has no browser test: manifest.json is a bundled import, so tests/app/boot.test.ts is the honest proof."

patterns-established:
  - "Boot validation that must outrank a fallback lives as the first statement, outside the fallback's try/catch."
  - "Capability failures converge on one { ok: false, reason } shape while named content errors propagate."
  - "A failure surface is shared by every boot path, never duplicated per cause."

requirements-completed: [WORLD-05]

coverage:
  - id: D1
    description: "A browser without WebGL2 sees the visible role=alert fallback, a hidden canvas/HUD, a visible footer, ready:false/webgl2:false and no pageerror."
    requirement: WORLD-05
    verification:
      - kind: e2e
        ref: "tests/e2e/fallback.spec.ts#getContext returning null for webgl2 shows the fallback"
        status: pass
    human_judgment: false
  - id: D2
    description: "Constructor throw, null context and an undefined WebGL2RenderingContext global all produce the same fallback and ready:false."
    requirement: WORLD-05
    verification:
      - kind: e2e
        ref: "tests/e2e/fallback.spec.ts#a throwing renderer constructor shows the fallback"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fallback.spec.ts#an undefined WebGL2RenderingContext global shows the fallback"
        status: pass
    human_judgment: false
  - id: D3
    description: "An invalid manifest remains a named ContentBoundaryError thrown before the renderer, with the injected factory never called; a valid manifest plus a throwing factory returns { ok: false } without throwing."
    requirement: WORLD-05
    verification:
      - kind: unit
        ref: "tests/app/boot.test.ts#bootApp failure taxonomy"
        status: pass
    human_judgment: false
  - id: D4
    description: "The normal path still boots ready:true/webgl2:true and keeps every surviving Phase 1/2 probe field plus the additive Phase 3 world/hud/mode fields."
    requirement: WORLD-05
    verification:
      - kind: e2e
        ref: "tests/e2e/precision.spec.ts#boots, starts Lave, renders the system scene, and reports no console errors"
        status: pass
      - kind: e2e
        ref: "tests/e2e/fallback.spec.ts#a normal browser still boots the game"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real-GPU check with hardware acceleration disabled shows the message, no blank canvas and no unhandled console error."
    requirement: WORLD-05
    verification: []
    human_judgment: true
    rationale: "The synthetic overrides prove the code path, not a real browser/GPU. This is the manual row in 03-VALIDATION.md; headless SwiftShader cannot stand in for it."

# Metrics
duration: 12min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 8: WebGL2 fallback and a guarded boot Summary

**A visible, accessible `#failure` fallback with `ready:false` for every WebGL2 failure mode, extracted behind a `bootApp` whose content-manifest assertion still throws a named `ContentBoundaryError` before any renderer exists.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-11-03T19:44:00Z (approx.)
- **Completed:** 2026-11-03T19:56:00Z (approx.)
- **Tasks:** 2
- **Files modified:** 6 (4 created, 2 modified)

## Accomplishments

- `bootApp({ manifest, canvas, rendererFactory? })` owns the boot order: `assertContentManifest` is the first statement and stays **outside** the renderer `try`, so a content bug can never be worded as "Wegolite needs WebGL2".
- `showWebgl2Fallback(reason)` composes plan 01's single `#failure` root — `showBootFailure` writes the plain-text message and hides the canvas/HUD, `publishFailure` sets `window.__wegolite = { ready:false, webgl2:false, error }`. No second root exists (`rg '#fallback'` is empty).
- All three failure modes converge: `getContext` returns null, the renderer constructor throws, and `WebGL2RenderingContext` is undefined each show the same fallback with `ready:false`, no HUD and no `pageerror`.
- `main.ts` returns before any scene, HUD or RAF construction on failure; the normal path still publishes `ready:true`/`webgl2:true` after the first render.
- `webglcontextlost` calls `preventDefault()`, stops the session once (`stopSession`) and shows a short plain message; full recovery remains Phase 7's QUAL-05.
- `tests/app/boot.test.ts` proves the two failure classes are distinct in both directions, including that the renderer factory is never called for a rejected manifest.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "a browser without WebGL2 sees an explanation, not a blank canvas"** - `1ce24c2` (feat)
2. **Task 2: Cover the boot failure taxonomy and keep the Phase 1/2 probe contract** - `67beeca` (test)

**Plan metadata:** committed after this file (docs).

## Files Created/Modified

- `src/app/boot.ts` - `bootApp`, `BootResult`, `buildRenderer`, `RendererFactory`; the manifest assert is the first statement and outside the renderer catch
- `src/app/fallback.ts` - `showWebgl2Fallback`, `hideFallback`, `isFallbackVisible` over the one `#failure` surface
- `src/main.ts` - boots through `bootApp`, returns before scene/HUD/RAF on failure, stops once on `webglcontextlost`
- `tests/app/boot.test.ts` - injected invalid manifest ⇒ named `ContentBoundaryError` with a never-called factory; valid manifest + throwing factory ⇒ `{ ok: false }`
- `tests/e2e/fallback.spec.ts` - null context, constructor throw, undefined global and a normal-path control
- `tests/e2e/precision.spec.ts` - pins the surviving Phase 1/2 fields and the additive `world`/`hud`/`mode` presence

## Decisions Made

- `bootApp` is a non-`async` function returning `Promise<BootResult>`: the manifest throw must stay synchronous at module scope (the pre-extraction behaviour), and an `async` function with no `await` fails `@typescript-eslint/require-await`.
- The fallback's two calls are separate by design: `showBootFailure` owns the DOM, `publishFailure` owns the probe. Calling one alone leaves either a blank canvas or no `ready:false` to read.
- Context loss gets a context-specific message rather than the WebGL2 capability advice; the plan explicitly leaves recovery to Phase 7.
- The content-manifest case has no browser `page.route` test because `manifest.json` is a build-time import bundled into the app chunk; the Node injection is the proof and the summary records the limitation.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Split `pageerror` from Three.js's expected constructor `console.error`**
- **Found during:** Task 1 (`tests/e2e/fallback.spec.ts` first run)
- **Issue:** Three.js logs `THREE.WebGLRenderer: Error creating WebGL context.` with `console.error` before rethrowing, so asserting an empty console on the forced-failure cases failed even though the visible fallback was correct and no `pageerror` was emitted.
- **Fix:** the spec now tracks `pageErrors` and `consoleErrors` separately. Failure cases assert an empty `pageErrors` (the plan's contract); the normal-path control asserts both are empty.
- **Files modified:** `tests/e2e/fallback.spec.ts`
- **Verification:** all four fallback tests pass; the full `docker compose run --rm verify` is green.
- **Committed in:** `1ce24c2`

**2. [Rule 3 - Blocking] Kept the manifest throw synchronous while satisfying `require-await`**
- **Found during:** Task 2 (`docker compose run --rm lint`)
- **Issue:** `bootApp` was declared `async` with no `await`, which ESLint rejects; wrapping the assertion in an async function would also have turned a synchronous module-level `ContentBoundaryError` into a rejected promise.
- **Fix:** `bootApp` is a plain function that throws synchronously from `assertContentManifest` and returns `Promise.resolve(...)` for the renderer result; `tests/app/boot.test.ts` captures the synchronous throw.
- **Files modified:** `src/app/boot.ts`, `tests/app/boot.test.ts`
- **Verification:** lint, typecheck and the two `boot.test.ts` cases pass.
- **Committed in:** `1ce24c2`, `67beeca`

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** No scope change. The tracer commit carries the full three-mode taxonomy because the renderer guard was written once; task 2's commit adds the Node distinctness proof and the precision regression.

## Issues Encountered

- Three.js's own constructor `console.error` is unavoidable on the null-context and throwing-constructor paths; the fallback is still visible, so this is not a silent or console-only failure. The specs assert no `pageerror` and keep the console-silence assertion for the normal path.
- No real-GPU browser is available in the container, so the manual hardware-acceleration check remains a human row (D5).

## Known Stubs

None.

## Threat Flags

None — T-3-19 (visible fallback, `ready:false`, no scene/HUD/RAF), T-3-20 (`textContent` plain text, no HTML/stack/host path) and T-3-21 (named `ContentBoundaryError` outside the renderer catch, proven in both directions) are implemented and covered.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 03-09: `stopSession` is the single teardown entry point shared by `pagehide` and `webglcontextlost`, and the fallback path never constructs a session.
- Manual rows from `03-VALIDATION.md` remain: the real-GPU fallback check (D5), plus plan 07's launch-feel and torus/dust legibility rows.

---
*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*

## Self-Check: PASSED

- Every created file exists on disk: `src/app/boot.ts`, `src/app/fallback.ts`, `tests/app/boot.test.ts`, `tests/e2e/fallback.spec.ts`.
- Every task commit is an ancestor of HEAD (`1ce24c2`, `67beeca`).
- `docker compose run --rm verify` is green: lint, typecheck, assets:check, 441 unit tests, build and 22 e2e tests.
- `STATE.md` and `ROADMAP.md` were not modified by this executor.

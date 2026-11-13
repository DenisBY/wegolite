---
phase: 01-foundation-containers-compliance
plan: 07
subsystem: render
tags: [resize, webgl, three, playwright, repaint, probe, gap-closure]

# Dependency graph
requires:
  - "01-01: the shell boot path, the one-shot render and the `window.__wegolite` probe"
  - "01-04: the probe/browser-test conventions and `tests/e2e/precision.spec.ts`"
provides:
  - "src/main.ts: `renderFrame()` repaint after every non-zero resize, a zero-size guard before the first size/aspect write, and an additive `renders` probe field read from `renderer.info.render.frame`"
  - "tests/e2e/resize.spec.ts: browser regression proving a counter advance and a correctly sized drawing buffer after resizing (900x600) and after restoring (1280x720)"
  - "01-REVIEW-DISPOSITION.md: CR-01 recorded as fixed with this plan as the source"
  - "01-VALIDATION.md: suite inventory refreshed to 35 unit + 2 e2e with FOUND-08 evidence covering both browser specs"
affects: [phase-verification, gsd-verify-work, phase-3-frame-loop]

# Actuals (#2632) — chars/4 over the realised diff (10,898 chars)
actuals:
  tokens: 2725
  tasks: 2
  commits: 2
  plan_head_before: 67a82f8cbf0d978479b1936570ca9709192218b6
  plan_head_after: 5a5925f0000bcbd85b58ddf93ea4ffa0e8b9e536

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A repaint after resize is a single synchronous `renderer.render()` call per event; no frame loop, timer or observer is introduced in Phase 1"
    - "The render count is read from three's own `renderer.info.render.frame`, which increments inside `WebGLRenderer.render()` and is NOT cleared by `WebGLInfo.reset()`; no hand-maintained counter can drift"
    - "A zero-size viewport guard sits between the dimension reads and the first `setSize`/`aspect` write, so a minimised window can never produce an `Infinity` aspect or a zero-sized drawing buffer"
    - "The probe is refreshed only when `window.__wegolite` already exists, keeping the boot render safe before publication"

key-files:
  created:
    - tests/e2e/resize.spec.ts
  modified:
    - src/main.ts
    - .planning/phases/01-foundation-containers-compliance/01-REVIEW-DISPOSITION.md
    - .planning/phases/01-foundation-containers-compliance/01-VALIDATION.md

key-decisions:
  - "The resize handler renders once per event rather than driving a frame loop: Phase 1 deliberately has no loop and Phase 3 owns it."
  - "`renders` comes from `renderer.info.render.frame` (three increments it before `projectObject()`; `info.reset()` only clears calls/triangles/points/lines), so the probe is bound to an actual render call."
  - "The standalone boot render was removed because the initial `resize()` now renders; this keeps exactly one render per resize event and no second boot frame."
  - "The resize spec reads the counter and the canvas dimensions in one `page.evaluate` per viewport so the counter and buffer describe the same frame."

requirements-completed: [FOUND-01, FOUND-08]

coverage:
  - id: D1
    description: "Resizing 1280x720 -> 900x600 repaints at the new size and restoring 1280x720 repaints again"
    requirement: FOUND-08
    verification:
      - kind: browser
        ref: "tests/e2e/resize.spec.ts in `docker compose run --rm e2e` -> 2 passed; counter advances past the boot and resized values, buffer equals viewport x min(devicePixelRatio, 2) floored"
        status: pass
    human_judgment: false
  - id: D2
    description: "A zero-size resize is ignored before any size/aspect write, so `camera.aspect` cannot become Infinity"
    requirement: FOUND-08
    verification:
      - kind: static
        ref: "`grep -q 'width === 0 || height === 0'` and the ordering `awk` gate both exit 0 (guard < first setSize < first camera.aspect)"
        status: pass
    human_judgment: false
    rationale: "Playwright cannot request a 0x0 viewport, so this path is proven statically by presence and ordering only."
  - id: D3
    description: "No requestAnimationFrame/setAnimationLoop/interval/timer/observer is introduced; each resize event renders exactly once"
    requirement: FOUND-08
    verification:
      - kind: static
        ref: "`! grep -rq 'requestAnimationFrame\\|setAnimationLoop' src/` exits 0; `renderer.render` appears only inside `renderFrame()`, called from `resize()`"
        status: pass
    human_judgment: false
  - id: D4
    description: "The documented validation inventory matches what `verify` runs and the FOUND-08 row names both browser specs"
    requirement: FOUND-08
    verification:
      - kind: integration
        ref: "`docker compose run --rm verify` -> lint, typecheck, 35 unit tests, build, 2 e2e; `grep '35 unit + 2 e2e'` and the FOUND-08/`resize.spec.ts` awk gate exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 6min
completed: 2026-11-02
status: complete
---

# Phase 01 Plan 07: Foundation, Containers & Compliance Summary

**Resizing now repaints: `renderFrame()` renders once per non-zero resize event behind a zero-size guard, the probe publishes three's own `renderer.info.render.frame` as `renders`, and a Playwright regression proves a counter advance plus a correctly resized drawing buffer on both the resize and restore paths.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-11-02T21:41:00Z
- **Completed:** 2026-11-02T21:47:00Z
- **Tasks:** 2
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- `src/main.ts` now calls `renderFrame()` as the last statement of `resize()`. `renderFrame()` renders `scene`/`camera` and, only when `window.__wegolite` already exists, refreshes `calls`, `triangles` and `renders` from `renderer.info.render`. `renders` is `renderer.info.render.frame`, which three increments inside `render()` (verified in `node_modules/three/src/renderers/WebGLRenderer.js:1710`) and `WebGLInfo.reset()` does not clear (verified in `node_modules/three/src/renderers/webgl/WebGLInfo.js`). No hand-maintained counter exists.
- The zero-size guard `if (width === 0 || height === 0) return;` sits between the two `window.innerWidth`/`innerHeight` reads and the first `renderer.setSize`/`camera.aspect` write, so a minimised window cannot compute an `Infinity` aspect or reallocate the buffer to nothing.
- The standalone boot `renderer.render(scene, camera)` was deleted; the initial `resize()` call performs the one boot render, so no second frame is drawn at boot and each resize event still produces exactly one render.
- `tests/e2e/resize.spec.ts` registers console/pageerror listeners before `page.goto("/")`, waits for `ready` with a 20 s deadline, asserts the boot `renders` value is greater than 0, resizes to 900x600, waits (5 s) for the counter to advance, and reads `canvas.width`, `canvas.height`, `renders` and `window.devicePixelRatio` in one `page.evaluate`. It then restores 1280x720, waits for a second advance, and repeats the read. Buffer dimensions are asserted as `Math.floor(viewport * Math.min(devicePixelRatio, 2))` on both paths, and the collected error array is asserted last. No pixel readback, screenshot or snapshot assertion is used (D-08).
- `01-REVIEW-DISPOSITION.md` records CR-01 as `fixed` with `01-07-PLAN.md` as the source and `open: 18` (total stays 19). `01-VALIDATION.md` documents `35 unit + 2 e2e`, names both browser specs in FOUND-08's evidence row, and its header records the 01-07 re-measurement without restating superseded counts.

## Task Commits

Each task was committed atomically:

1. **Task 1: Repaint after resize and expose a render counter** — `406d74c` (fix)
2. **Task 2: Add the resize regression and record CR-01 as fixed** — `5a5925f` (test)

**Plan metadata:** this SUMMARY and the STATE/ROADMAP tracking commit (docs).

## Files Created/Modified

- `src/main.ts` — `renders` on `WegoliteProbe`, `renderFrame()`, zero-size guard in `resize()`, boot render folded into the initial `resize()`, additive `renders` probe field.
- `tests/e2e/resize.spec.ts` — new Playwright regression covering resize (900x600) and restore (1280x720), with counter and drawing-buffer checks on both.
- `.planning/phases/01-foundation-containers-compliance/01-REVIEW-DISPOSITION.md` — CR-01 disposition `fixed`, source `01-07-PLAN.md`, `open: 18`.
- `.planning/phases/01-foundation-containers-compliance/01-VALIDATION.md` — inventory refreshed to `35 unit + 2 e2e`; FOUND-08 evidence extended to the resize spec; header note updated.

## Decisions Made

- Repaint once per event, never a loop: this satisfies the phase's deliberate no-loop constraint and leaves the frame loop to Phase 3.
- Read `renders` from three's `renderer.info.render.frame` rather than managing a local counter, so the field is bound to an actual `render()` call.
- Delete the standalone boot render so the boot path and every later resize share exactly one render site (`renderFrame()`).
- Remove the zero-size doubt by proving the guard statically (presence + ordering); the runtime regression covers the resize and restore paths the user reported.

## Deviations from Plan

None — the plan executed exactly as written.

## Prohibition Review (plan `prohibitions`, flagged for human judgment)

The plan forbids introducing an ongoing drive (frame loop, timer, observer) and requires one render per resize event. Checked:

- **No loop introduced.** `! grep -rq 'requestAnimationFrame\|setAnimationLoop' src/` exits 0; no `setInterval`, `setTimeout` loop or `ResizeObserver` was added.
- **One render per event.** `renderer.render` appears only inside `renderFrame()`, and `renderFrame()` is called only from `resize()`; the initial `resize()` supplies the boot render.
- **No pixel evidence.** The spec uses the render counter and drawing-buffer dimensions; the no-pixel grep gate exits 0.
- **Probe contract stable.** Every pre-existing `window.__wegolite` field keeps its name and meaning; `renders` is additive, and `tests/e2e/precision.spec.ts` passes unchanged.

## Issues Encountered

None. The Vite build still prints its pre-existing `>500 kB` chunk-size warning (533 kB); it is advisory, not a failure, and no dependency changed.

## Known Stubs

None.

## Threat Flags

None — no new endpoint, auth path, file-access boundary or schema change. T-01-20 is mitigated by the zero-size guard plus a single synchronous render per event; T-01-21 remains accepted (a render-derived integer on the existing probe); T-01-SC holds because this plan added no dependency or image.

## Next Phase Readiness

- G-01-4 / CR-01 is closed: a resize repaints the scene at the new size and restoring the size repaints again, proven in headless Chromium.
- The suite now has 2 browser tests and 35 unit tests; `docker compose run --rm verify` is green end to end, so `/gsd-verify-work` can reconcile G-01-4 from this plan's `gap_ids`.
- Phase 3 can replace the per-event repaint with its frame loop without undoing this fix; the zero-size guard and the `renders` probe remain valid.

---

*Phase: 01-foundation-containers-compliance*
*Completed: 2026-11-02*

## Self-Check: PASSED

- All four artefacts exist on disk: `src/main.ts`, `tests/e2e/resize.spec.ts`, `01-REVIEW-DISPOSITION.md`, `01-VALIDATION.md`.
- Both task commits (`406d74c`, `5a5925f`) are ancestors of `HEAD`.
- `docker compose run --rm e2e` -> 2 passed; targeted resize spec -> 1 passed; `docker compose run --rm verify` -> exit 0 (lint, typecheck, 35 unit, build, 2 e2e).
- All plan static gates (guard presence, guard ordering, `info.render.frame`, no loop, disposition, validation inventory, no pixel evidence) exit 0.

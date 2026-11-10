---
phase: quick-261110-a3k
plan: 261110-a3k
subsystem: app
tags: [performance, render-loop, power]
status: complete
---

# Quick task 261110-a3k: stop drawing unchanging frames

## What changed

- `src/app/redraw-gate.ts` (new): a pure gate. An idle frame is drawn
  `IDLE_SETTLE_DRAWS` (2) times and then skipped. A simulating frame, an
  explicit request, or a change of identity in the keys the image depends on
  refills the count.
- `src/app/game-session.ts`: the loop's `renderFrame` call asks the gate with
  `idle = paused || mode === "docked"` and the keys `[state, scene, nebula
  texture revision]`. A skipped frame omits `renderer.render` and the HUD
  canvas draw only; the scene graph sync, hints and the probe still run. Every
  direct `renderFrame(0)` call (start, Load, context restore, quality change,
  test swap) draws as before. A redraw is requested after the chart and
  save-screen branches, on `resize()`, when the tab becomes visible (`shown()`,
  wired in `src/main.ts`) and from the `?test=1` taint callback.
- `NebulaBody.revision()`: the nebula textures load after the scene is built,
  so a paused or docked High-quality scene needs one more draw when they
  arrive.
- `probe.frames`: loop frames, drawn or not. `probe.renders` still counts drawn
  frames and now stops while idle.

## Decision revised

Recorded in `.planning/PROJECT.md` Key Decisions. The Phase 7 engine smoke
(D-07, D-09) sampled its cadence docked. It now proves that the docked loop
runs without drawing and samples the cadence across the launch and the flight
after it. Cadence figures recorded before 2026-11-10 are not comparable.
`budget.spec.ts` and `hyperspace-failure.spec.ts` settle on `probe.frames`.

## Test races the change exposed

With the scene no longer drawn, a docked loop frame takes well under a
millisecond on the software rasteriser instead of hundreds, so the main thread
is idle between frames. Three browser tests had relied on it being busy:

- `save-load.spec.ts` (three sites) pressed F2 and S, or F2 and L, back to
  back. S and L mean Save and Load only once the screen is open, which happens
  on the next loop frame; the second key could now arrive first and be dropped.
  Each site waits for `#save-load` to be visible, as the other tests in the
  file already did.
- `station-tabs.spec.ts` read the market selection straight after ArrowDown and
  could see the row the screen opened on. It waits for the selection to move.

These are test races, not behaviour changes: at 60 frames a second on a real
GPU the same one-frame latency existed before. Other specs may hold the same
pattern at a lower failure rate; see "Not run" below.

## Verification

Run in Docker:

- `typecheck`, `lint`: passed.
- `docker compose run --rm test`: 100 files, 1303 tests passed, 1 skipped.
- Browser specs `aspect`, `budget`, `context-loss`, `dispose`, `engine`,
  `hyperspace-failure`, `resize`, `settings`, `throttle`: 25 passed.
- Browser specs `scene`, `docking`, `save-load`, `engine`, `station`,
  `station-tabs`, `launch`, `autosave`: 62 passed, 3 failed (the races above).
  After the fixes, `save-load`, `station-tabs` and `station` with
  `--repeat-each=2`: 60 passed.

Not run: `verify`, `verify-full` (owner's request), `e2e-cross` (Firefox), so
the rewritten engine smoke has not run on Firefox. Not run after this change:
`chart-gestures`, `compliance-shipped`, `core-loop`, `fallback`, `flight`,
`hud`, `hyperspace`, `models`, `precision`. No power or frame-time
measurement was taken; the saving is the skipped draw, not a measured figure.

## Not verified

That a browser keeps showing the last presented frame of an undrawn canvas is
standard behaviour and is what the pause and docked screens now rely on. It was
not checked by pixel comparison here (the suite has no screenshot tests, D-08).

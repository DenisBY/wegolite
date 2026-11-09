---
phase: quick-261109-lsz
plan: 261109-lsz
subsystem: ui
tags: [chart, canvas, pointer-events, wheel-zoom, camera, playwright, vitest]

# Dependency graph
requires:
  - phase: quick-261109-h8t
    provides: registry-driven station tab strip and the chart overlay shell
provides:
  - continuous ChartCamera (centre + spanX) with clamp/zoom/pan pure helpers
  - local and whole-galaxy presets toggled by Tab
  - cursor-anchored wheel zoom and left-button drag panning
  - zoom-aware label budget (nearest 12 at galaxy zoom)
  - probe camera for e2e screen-point computation
affects: [chart, navigation, e2e-helpers, docs]

actuals:
  tokens: 21000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Pure camera math in chart-model.ts; DOM gesture state in chart.ts; session owns the camera and presets"
    - "One requestAnimationFrame slot coalesces wheel/drag camera updates; open/selection/resize paint immediately"

key-files:
  created:
    - tests/e2e/chart-gestures.spec.ts
  modified:
    - src/ui/chart-model.ts
    - src/ui/chart.ts
    - src/ui/chart-draw.ts
    - src/ui/station-tabs.ts
    - src/ui/station-nav.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/input/actions.ts
    - index.html
    - README.md
    - tests/ui/chart-model.test.ts
    - tests/ui/chart-draw.test.ts
    - tests/ui/station-tabs.test.ts
    - tests/e2e/helpers/chart.ts
    - tests/e2e/{hyperspace,core-loop,autosave,station-tabs}.spec.ts

key-decisions:
  - "ChartCamera is centre + spanX; spanY = 2 * spanX because the 2:1 projection halves y"
  - "spanX clamps to 20..256 and the centre clamps so the view stays inside 0..256"
  - "Local preset spanX 80 around the current system (clamped); galaxy preset centre 128,128 spanX 256"
  - "Tab keeps the chartRange action id but toggles presets and is labelled Chart preset"
  - "At chartSpanX >= 128 labels are current/target/selected plus the nearest 12 visible systems"

patterns-established:
  - "Gesture camera candidate per event, flushed once per rAF through onCamera"
  - "Viewport-based marker visibility replaces fixed window filtering"

requirements-completed: []

duration: 38min
completed: 2026-11-09
status: complete
---

# Quick task 261109-lsz: Zoomable/pannable F6 chart Summary

**The F6 chart is now one continuous camera: wheel zoom anchored under the cursor (spanX 20..256), left-button drag panning, and Tab-toggled local/whole-galaxy presets with the Short/Long sub-tabs removed.**

## Performance

- **Duration:** ~38 min
- **Started:** 2026-11-09T15:20:00Z (approx.)
- **Completed:** 2026-11-09T16:23:00Z
- **Tasks:** 3
- **Files modified:** 20 (19 modified, 1 created)

## Accomplishments

- Added the pure `ChartCamera` model: `clampChartCamera`, `localPreset`, `galaxyPreset`, `zoomChartCamera` (cursor anchor preserved), `panChartCamera`, and `chartSpanY`.
- Replaced fixed-window visibility with viewport-based `visible`; off-screen current/target/selected still exist and paint but are excluded from hit-testing and arrow selection.
- Added the zoom-aware label policy: at `chartSpanX >= 128` only current/target/selected plus the nearest 12 visible systems are labelled.
- Wired wheel zoom, pointer-capture drag panning, a 3 px click threshold and post-drag click suppression into the chart shell, coalesced through one `requestAnimationFrame`.
- Session now owns `chartCamera`/`chartPreset`; the chart opens local, Tab toggles galaxy, and the probe publishes the camera.
- Removed `CHART_SUBTABS`, the chart nav handler and the sub-tab markup; added `grab`/`grabbing` cursors.
- Relabelled the `chartRange` action to "Chart preset" and documented the mouse gestures below the README controls table.
- Added 45 chart-model unit cases, 11 chart-draw cases and a six-test `chart-gestures.spec.ts` browser proof.

## Task Commits

1. **Task 1: Camera model, shell gestures, session/probe wiring and call-site updates** - `f2acc1f` (feat)
2. **Task 2: Behavioural proof (unit camera/label/repaint + browser gestures)** - `c176211` (test)
3. **Task 3: README mouse-gesture prose** - `153adac` (docs)

`.planning/REQUIREMENTS.md` and `.planning/PROJECT.md` edits are left uncommitted for the orchestrator's documentation commit, as instructed.

## Files Created/Modified

- `src/ui/chart-model.ts` — camera helpers, presets, viewport visibility, label budget; `ChartRange` removed.
- `src/ui/chart.ts` — wheel/pointer gestures, rAF coalescer, click suppression, `onCamera`.
- `src/ui/chart-draw.ts` — repaint compares camera centre/span.
- `src/ui/station-tabs.ts` / `src/ui/station-nav.ts` — chart sub-tabs removed.
- `src/app/game-session.ts` — camera/preset ownership, `setChartCamera`, `toggleChartPreset`, probe camera.
- `src/app/probe.ts` — `WegoliteChartProbe.camera`.
- `src/input/actions.ts` — "Chart preset" label.
- `index.html` — sub-nav removed, cursors added.
- `README.md` — row rename and gesture prose.
- `tests/ui/chart-model.test.ts`, `tests/ui/chart-draw.test.ts`, `tests/ui/station-tabs.test.ts` — camera API + behavioural coverage.
- `tests/e2e/helpers/chart.ts`, `tests/e2e/{hyperspace,core-loop,autosave,station-tabs}.spec.ts` — camera-based screen points and preset waits.
- `tests/e2e/chart-gestures.spec.ts` — new browser gesture proof.

## Decisions Made

- Followed the locked CONTEXT decisions D-01..D-11 without change.
- `clampChartCamera` replaces non-finite input with the galaxy preset and clamps span/centre, satisfying T-261109-01/-02.
- Wheel factor is `clamp(pow(1.15, deltaY/100), 0.5, 2)` with deltaMode normalisation; wheel-up zooms in.
- The camera resets to local on every open (the discretion choice recorded in CONTEXT).

## Deviations from Plan

### Ordering deviation

- **Task 2 station-tabs rewrite landed in Task 1.** The plan assigned the chart portion of `tests/e2e/station-tabs.spec.ts` to Task 2, but Task 1's `tsconfig` gate required a compiling call site, so it was updated and committed with Task 1. Task 2 then added the new gesture spec and unit coverage.
- **Task 3 `PROJECT.md` also updates the last-updated line** to name both quick tasks; no existing decision row was edited (the stale "F6 Short and Long" clause is superseded explicitly in the new row).

### Plan-text vs clamp consequence

- **`localPreset(lave)` is not exactly centred on Lave.** Lave's chart-x is 20, so the ±40 window clamps the centre to x=40 and Lave paints at screen x=300 in the 800x400 unit viewport, not 400. The unit test pins the true clamped value and explains why; this is D-05 behaviour, not a defect.

### Verification environment

- The plan's literal e2e command (`npx playwright test …`) also selects the Firefox project, which is not installed in the `e2e` service (that is the `e2e-cross` service). The authoritative Chromium gate (`npm run test:e2e` uses `--project=chromium`) was run instead: all 22 tests passed, including the four target specs. The Firefox core-loop copy failed only with "Executable doesn't exist at /ms-playwright/firefox-1555/firefox/firefox" before running, which is unrelated to this change.

## Issues Encountered

- First unit run failed on the old "Lave at x=400" expectation. Under the original whole-window clamp the centre moved to x=40; the assertion was temporarily corrected to 300. The manual UAT follow-up below changes the clamp and restores x=400.

## Manual UAT Follow-up (2026-11-09)

- Owner feedback: vertical panning stopped before the top/bottom edge could reach the middle of the screen, while horizontal panning showed empty margins.
- Cause: `clampChartCamera` clamped the whole visible window inside `0..256` (`centre ∈ [span/2, 256 - span/2]`), so the vertical range shrank with zoom and collapsed at some levels; the wide viewport letterboxes x, which kept x visibly moving.
- Fix: the centre now clamps to `0..256` on both axes and the view may overhang an edge, so an edge can be panned to the middle. The local preset now centres exactly on the current system (Lave `x=20`, not `40`).
- Also added `·` separators to the chart key hint so the footer commands do not run together.
- Unit and e2e expectations were updated. They were **not re-run** at the owner's request ("не запускай автоматические тесты"); manual re-check is pending.

## Known Stubs

None.

## Threat Flags

None — the gesture path adds no network, auth, file or schema surface; the T-261109-01/-02 mitigations (rAF coalescing, factor clamp, finite/range camera clamp) are implemented and covered by the unit suite.

## Next Phase Readiness

- The chart is a navigable map; the probe camera is the single source e2e helpers read.
- No dependency, server, database or `src/sim/` change.
- The orchestrator still needs to commit the `.planning/REQUIREMENTS.md` and `.planning/PROJECT.md` edits.

---

*Quick task: 261109-lsz*
*Completed: 2026-11-09*

## Self-Check: PASSED

All 19 declared source/test files and the SUMMARY exist; task commits `f2acc1f`, `c176211` and `153adac` are ancestors of HEAD.

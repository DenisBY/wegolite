---
phase: 03-flight-in-the-lave-system
plan: 07
subsystem: render / app / ui
tags:
  - launch-cinematic
  - camera-pose
  - break-pattern
  - canvas2d
  - dust
  - hints
  - message-line
  - deterministic-seed

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 01's SystemLayout/FlightState/session and sync; plan 02's resolved +stationRollRadPerSec sign; plan 03's station and ship bodies; plan 04's torus factor; plan 05's message queue and HUD; plan 06's HintId/hintsSeen/launchSeen settings
  - phase: 02-data-pipeline-content-compiler
    provides: the compiled Lave record and the Cobra/Coriolis GLBs

provides:
  - src/render/launch-camera.ts (computeLaunchCamera, computeCockpitCamera, launchCameraBasis)
  - src/app/launch-sequence.ts (createLaunchSequence, launchPhaseAt)
  - src/render/break-pattern.ts (createBreakPattern, breakPatternLines, breakPatternPhase)
  - src/render/bodies/dust.ts (createDust, wrapDustCoordinate)
  - src/app/hints.ts (createHintController, hintText)
  - src/render/sync.ts applyFrame(scene, prev, curr, alpha, layout, camera, elapsedSeconds): Vec3
  - src/ui/docked.ts setMessage (the docked message line)
  - probe fields shipVisible, dust, hints, hint
  - tests/render/launch-camera.test.ts, tests/render/sync.test.ts, tests/render/dust.test.ts, tests/app/launch-sequence.test.ts, tests/e2e/launch.spec.ts

affects:
  - 03-08 (WebGL2 fallback sits above the same session/HUD; no boot path changed)
  - 03-09 (scene disposal now covers dust, the break pattern and the hint controller's persistence)

actuals:
  tokens: 22036
  tasks: 3
  commits: 3
  plan_head_before: 42b996176f225d3d69457890dae1b9e2d72a2f36
  plan_head_after: 89c3b41a83ccc5a3096c6a423751558fb8e6f1b0

tech-stack:
  added: []
  patterns:
    - pure camera-pose maths, unit-tested in Node, consumed by one sync path
    - a presentation timeline advanced by the same fixed DT as the simulation
    - seeded Canvas2D overlay drawn in device pixels, then the HUD transform restored
    - camera-local wrapped dust with preallocated typed arrays
    - a hint controller over the settings-owned HintId allowlist
    - cross-file serialisation of temporary guard probes

key-files:
  created:
    - src/render/launch-camera.ts
    - src/app/launch-sequence.ts
    - src/render/break-pattern.ts
    - src/render/bodies/dust.ts
    - src/app/hints.ts
    - tests/render/launch-camera.test.ts
    - tests/render/sync.test.ts
    - tests/render/dust.test.ts
    - tests/app/launch-sequence.test.ts
    - tests/e2e/launch.spec.ts
    - tests/guards/probe-lock.ts
  modified:
    - src/render/sync.ts
    - src/render/system-scene.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/ui/docked.ts
    - index.html
    - tests/guards/sim-purity.test.ts
    - tests/guards/content-boundary.test.ts

key-decisions:
  - "The launch/cockpit camera pose is pure maths (no Three, no DOM) so tests/render/launch-camera.test.ts decides it; the browser only checks mode/timer/Cobra visibility."
  - "The camera is the 6th applyFrame parameter and elapsedSeconds moved to 7th: plan 03 added the elapsed-seconds parameter after this plan was written."
  - "launch-sequence is a presentation timeline over the same fixed DT; the simulation remains the owner of mode, launchElapsed and the +600 s clock."
  - "Dust is fed the camera world delta returned by applyFrame, so there is no second transform path and no world coordinate in the geometry."
  - "HintId is imported from src/settings/schema.ts; src/app/hints.ts does not redeclare it."
  - "The torus-hint browser proof reads the probe's hint decision (probe.hint) because the message line expires on the slow simulation clock under SwiftShader; the docked message line is asserted in the DOM."

patterns-established:
  - "Pose truth is decided by a Node test against an axis-aligned layout and the real Lave layout."
  - "A cinematic is a world pose supplied to the one camera-relative transform, never a second camera path."
  - "Presentation timelines advance on the simulation's fixed DT so pause freezes them."
  - "Camera-local particle fields wrap modulo a box and reuse one typed array per purpose."
  - "Hints are app-owned strings over a settings-owned ID allowlist, shown one at a time."

requirements-completed: [FLGT-01, FLGT-04, FLGT-05]

coverage:
  - id: D1
    description: "First launch plays the ~2 s cinematic (Cobra visible) and hands over to the cockpit; launchSeen is set at handover."
    requirement: FLGT-01
    verification:
      - kind: unit
        ref: "tests/app/launch-sequence.test.ts#launch view timeline"
        status: pass
      - kind: unit
        ref: "tests/render/launch-camera.test.ts#launch camera"
        status: pass
      - kind: e2e
        ref: "tests/e2e/launch.spec.ts#the first launch plays the full cinematic and hands over to the cockpit"
        status: pass
    human_judgment: false
  - id: D2
    description: "Any key after the first viewing skips to handover; skip is ignored on the first launch; the clock is +600 exactly once either way."
    requirement: FLGT-01
    verification:
      - kind: unit
        ref: "tests/app/launch-sequence.test.ts#launch clock"
        status: pass
      - kind: e2e
        ref: "tests/e2e/launch.spec.ts#a launch after the first viewing skips on any key"
        status: pass
    human_judgment: false
  - id: D3
    description: "The launch camera is decidable: the (110, 60, -220) offset, look-at direction, sqrt(64100) length, degenerate fallback and the cockpit (0, 7.25, -31) pose."
    requirement: FLGT-01
    verification:
      - kind: unit
        ref: "tests/render/launch-camera.test.ts#launch camera / cockpit camera / determinism"
        status: pass
    human_judgment: false
  - id: D4
    description: "sync.ts keeps exactly one cameraRelative() call site, a camera at (0,0,0) and the exported maxRelativeMagnitude while gaining the optional camera pose."
    requirement: FLGT-01
    verification:
      - kind: unit
        ref: "tests/render/sync.test.ts#sync.ts structure"
        status: pass
    human_judgment: false
  - id: D5
    description: "The break pattern follows the 0.2/1.6/2.0 timeline, is seeded per launch, draws in device pixels, and freezes with pause."
    requirement: FLGT-01
    verification:
      - kind: unit
        ref: "tests/app/launch-sequence.test.ts#break pattern"
        status: pass
      - kind: e2e
        ref: "tests/e2e/launch.spec.ts#the break pattern covers the launch and freezes with pause"
        status: pass
    human_judgment: false
  - id: D6
    description: "Dust is camera-local, wrapped, preallocated and reads as speed under torus."
    requirement: FLGT-04
    verification:
      - kind: unit
        ref: "tests/render/dust.test.ts#dust field"
        status: pass
      - kind: e2e
        ref: "tests/e2e/launch.spec.ts#hints stay on the message line, dismiss on first use and persist (dust.active)"
        status: pass
    human_judgment: false
  - id: D7
    description: "Hints are message-line only, use the live binding label, dismiss after first use and persist hintsSeen; no modal or permanent overlay."
    requirement: FLGT-05
    verification:
      - kind: e2e
        ref: "tests/e2e/launch.spec.ts#hints stay on the message line, dismiss on first use and persist"
        status: pass
    human_judgment: true
    rationale: "The e2e proves the docked message line, the torus hint decision, dismissal and persistence; whether the wording and pacing feel right is a manual row in 03-VALIDATION.md."
  - id: D8
    description: "Launch feel and torus/dust legibility at 1080p."
    requirement: FLGT-04
    verification: []
    human_judgment: true
    rationale: "Perceptual judgement: 'the Cobra slides out with the slot steady' and 'dust streaks read as speed' cannot be asserted without a pixel diff, which D-08 forbids."

# Metrics
duration: 51min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 7: Launch cinematic, break pattern, dust and first-use hints Summary

**A seeded 2 s launch cinematic (external camera, Cobra visible) with any-key skip after the first viewing, a device-pixel break-pattern tunnel, camera-local wrapped dust as the torus cue, and message-line-only first-use hints persisted in settings.**

## Performance

- **Duration:** 51 min
- **Started:** 2026-11-03T18:30:00Z (approx.)
- **Completed:** 2026-11-03T19:21:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 19 (11 created, 8 modified)

## Accomplishments

- The first launch plays the full cinematic: the camera sits at `dockPos + stationToPlanet*220 + stationRight*110 + stationUp*60`, looks at the Cobra, and the break pattern covers the cut to the cockpit. The Cobra is toggled, never rebuilt.
- Camera truth is decidable in Node: the axis-aligned offset `(110, 60, -220)`, the look direction, `sqrt(64100)`, the degenerate `∥ worldUp` basis and the cockpit `(0, 7.25, -31)` pose are pinned by unit tests.
- `applyFrame` gained the optional `camera: CameraPose | null` and returns the camera world pose; `tests/render/sync.test.ts` pins the single `cameraRelative()` path, the origin camera and `maxRelativeMagnitude`.
- Skip is a command: after `launchSeen`, any key during `launching` enqueues `skipLaunch`; the first viewing is never skippable; the +600 s clock is applied exactly once by the simulation.
- The break pattern is seeded from `launchCount` (no `Math.random`/`Date`), follows 0.2/1.6/2.0 s, draws in device pixels and restores the HUD transform.
- Dust is camera-local: 800 motes in a 500 m box, wrapped modulo the box, one preallocated typed array per purpose, streak length from speed, opacity lifted by the torus factor.
- Hints are message-line only: launch (docked panel), torus once clear of mass lock, disengage after the first engagement, speed and pitch/roll; each uses the live binding label, dismisses after first use and persists `hintsSeen`.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end cinematic, any-key skip, cockpit handover** - `5399fae` (feat)
2. **Task 2: Seed the break pattern and pin its timeline** - `4798257` (feat)
3. **Task 3: Camera-local dust and the one-time message-line hints** - `89c3b41` (feat)

**Plan metadata:** committed after this file (docs).

## Files Created/Modified

- `src/render/launch-camera.ts` - pure launch/cockpit world poses and the station-relative basis with a degenerate fallback
- `src/app/launch-sequence.ts` - the fixed-step presentation timeline and the skip gate
- `src/render/break-pattern.ts` - deterministic Canvas2D flash/tunnel/fade overlay
- `src/render/bodies/dust.ts` - camera-local wrapped line-segment dust
- `src/app/hints.ts` - HintController over the settings-owned HintId allowlist
- `src/render/sync.ts` - optional camera pose, camera world return, still one transform path
- `src/render/system-scene.ts` - owns the dust field and disposes it
- `src/app/game-session.ts` - cinematic/cockpit camera, Cobra toggle, break pattern, dust delta, hint wiring, skip listener
- `src/app/probe.ts` - additive `shipVisible`, `dust`, `hints`, `hint` fields
- `src/ui/docked.ts` - `setMessage` for the docked message line
- `index.html` - the docked message element and its monospace/green style
- `tests/render/launch-camera.test.ts` - pose truth
- `tests/render/sync.test.ts` - single transform path structure
- `tests/render/dust.test.ts` - wrap, delta, reseed, buffer reuse, cap
- `tests/app/launch-sequence.test.ts` - timeline, skip gating, exactly-once clock, break-pattern seed
- `tests/e2e/launch.spec.ts` - first/subsequent launch, break-pattern pause, hint lifecycle and dust
- `tests/guards/probe-lock.ts` - serialises the temporary guard probes
- `tests/guards/sim-purity.test.ts`, `tests/guards/content-boundary.test.ts` - use the probe lock

## Decisions Made

- The camera pose lives in a Three-free/DOM-free module so the numeric truth is a unit test; the browser asserts only mode/timer/Cobra visibility.
- `applyFrame` takes `camera` as the 6th parameter and `elapsedSeconds` as the 7th, because plan 03 added the elapsed-seconds parameter after this plan was authored. One caller (the session) was updated.
- `launch-sequence` is a *presentation* timeline advanced by the same fixed `DT` as the simulation; the simulation still owns `mode`, `launchElapsed` and the +600 s clock, so pause freezes both.
- Dust is updated from the camera world delta that `applyFrame` returns; `sync.ts` stays the only transform path and the dust geometry never holds a world coordinate.
- `HintId` stays owned by `src/settings/schema.ts`; the hint controller imports it.
- The torus-hint e2e reads `probe.hint` (the controller's decision) rather than the HUD message text, because message expiry runs on the simulation clock and SwiftShader makes that far slower than wall time. The docked message line is asserted in the DOM.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `applyFrame` parameter order adapted to the wave-2 file**
- **Found during:** Task 1
- **Issue:** Plan 03-03 added `elapsedSeconds` as `applyFrame`'s sixth parameter after this plan was written, so the plan's literal `applyFrame(..., layout, camera)` would have collided.
- **Fix:** `applyFrame(scene, prev, curr, alpha, layout, camera: CameraPose | null = null, elapsedSeconds = 0)`; the session passes both. The plan's must-have (`camera: CameraPose | null`) is satisfied.
- **Files modified:** `src/render/sync.ts`, `src/app/game-session.ts`
- **Verification:** `tests/render/sync.test.ts` asserts the camera parameter and the single transform path; typecheck and all camera tests pass.
- **Committed in:** `5399fae`

**2. [Rule 1 - Bug] Serialised the temporary guard probes to stop a TS6053 race**
- **Found during:** Task 3 (`docker compose run --rm verify`)
- **Issue:** `tests/guards/sim-purity.test.ts` and `tests/guards/content-boundary.test.ts` both write a probe under `src/sim/` and run `tsc -p tsconfig.sim.json`. Under parallel worker threads one file's `tsc` globbed the other's probe and then found it deleted (`TS6053: File … not found`), failing `verify` intermittently. Pre-existing, but it blocked the plan's "verify is green" criterion.
- **Fix:** added `tests/guards/probe-lock.ts` (atomic `mkdir` lock with a synchronous `Atomics.wait` backoff and stale-lock reclaim) and wrapped both `withProbe` helpers in it.
- **Files modified:** `tests/guards/probe-lock.ts` (new), `tests/guards/sim-purity.test.ts`, `tests/guards/content-boundary.test.ts`
- **Verification:** the full `docker compose run --rm verify` chain is green, including both guard files and all e2e specs.
- **Committed in:** `89c3b41`

**3. [Rule 2 - Missing Critical] Added the probe fields and the docked message element the e2e needs**
- **Found during:** Tasks 1 and 3
- **Issue:** The plan's e2e must observe Cobra visibility, dust activity, hint state and the docked message line, but the probe had no such fields and the docked panel had no message element.
- **Fix:** additive optional probe fields (`shipVisible`, `dust`, `hints`, `hint`), a `setMessage` API on `DockedPanel`, and one `<p data-field="message">` line in `index.html` with the same monospace/green styling. Optional fields keep `main.ts`/`publishFailure` untouched.
- **Files modified:** `src/app/probe.ts`, `src/app/game-session.ts`, `src/ui/docked.ts`, `index.html`
- **Verification:** `tests/e2e/launch.spec.ts` asserts the docked line and the probe values; `tests/e2e/scene.spec.ts`'s docked-panel facts still pass.
- **Committed in:** `5399fae`, `89c3b41`

---

**Total deviations:** 3 auto-fixed (1 blocking, 1 bug, 1 missing critical)
**Impact on plan:** The camera/skip/clock contract is unchanged; the parameter-order adaptation follows an earlier wave's real file. The guard lock fixes a pre-existing flake without changing any gate. The probe/docked additions are the observable evidence the plan's own browser proof requires.

## Issues Encountered

- The guard probe race (deviation 2) reproduced twice in full `verify` runs before the lock was added; `docker compose run --rm test` alone passed intermittently. It is now serialised.
- The message-line timing under SwiftShader made a HUD-text wait for the torus hint unreliable; the e2e now asserts the controller's decision via `probe.hint` and keeps the DOM assertion for the docked message line.

## Known Stubs

None.

## Threat Flags

None — the plan's T-3-16 (exactly-once clock/skip), T-3-17 (capped dust, precomputed break-pattern table, no per-frame allocation) and T-3-18 (allowlisted HintId, `textContent` strings, validated `hintsSeen`) mitigations are implemented and covered by the unit/e2e proofs.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Ready for 03-08 (WebGL2 fallback) and 03-09 (scene disposal/probe lifecycle): the session, HUD, break pattern, dust and hint controller all have explicit dispose paths or session-owned state.
- Manual rows from `03-VALIDATION.md` remain: launch feel/skip and torus/dust legibility at 1080p (D8 above).

---
*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*

## Self-Check: PASSED

- Every created file exists on disk (camera, launch sequence, break pattern, dust, hints, the four unit tests, the e2e spec and the probe lock).
- Every task commit is an ancestor of HEAD (`5399fae`, `4798257`, `89c3b41`).
- `docker compose run --rm verify` is green: lint, typecheck, assets:check, 439 unit tests, build and 18 e2e tests.

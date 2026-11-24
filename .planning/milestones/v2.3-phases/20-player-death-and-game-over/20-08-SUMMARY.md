---
phase: 20-player-death-and-game-over
plan: 08
subsystem: render
tags: [render-driver, game-over, explosion, debris, probe, css-filter]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-04 session latch and gameOverSeconds; 20-05 overlay setFilter; 20-06 frame-loop game-over branch; 20-07 CHANGELOG entry and overlay wiring; 20-11 burst lifetimes"
provides:
  - "The dead scene: Oolite's aft view set back 100 m, HUD hidden, effect clock, five-second black and white fade"
  - "NPC debris that keeps drifting and tumbling on screen while dead with no time limit, render-only (D-01c, D-01d)"
  - "The dead view's redraw bounded by visibility (isDebrisInDeadView, NO_DRAW_DISTANCE_FACTOR)"
  - "probe.death for the browser specs (WegoliteDeathProbe)"
affects: [20-09, 20-10]

actuals:
  tokens: 12100
  tasks: 3
  commits: 6
plan_head_before: 617fb031ff9c4b4e55e92cb156c63a6032e3dd9f
plan_head_after: fa58bafccdb91e6776e746d58ece3783481b2114

tech-stack:
  added: []
  patterns:
    - "Presentation clock: effectTime = flightTime + gameOverSeconds, passed to render layers only"
    - "Render-side extrapolation of copied contacts; nothing written back to the sim"
    - "Redraw gate idles on a visibility predicate computed in renderFrame on every frame, read by shouldDraw"

key-files:
  created: []
  modified:
    - src/app/session/render-driver.ts
    - src/sim/world/contacts.ts
    - src/app/probe.ts
    - src/app/session/probe-publisher.ts
    - CHANGELOG.md
    - tests/app/session/render-driver.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/sim/world/contacts.test.ts
    - tests/render/debris-layer.test.ts
    - tests/e2e/probe-shape.spec.ts
    - tests/app/redraw-gate.test.ts
    - tests/app/dispose.test.ts

key-decisions:
  - "The fade filter is written on every renderFrame (drawn or not) so the last grey value lands before the gate idles"
  - "The in-view flag is computed in renderFrame on the drawn poses and read one frame late by shouldDraw; a piece at rest never holds the redraw"
  - "Drift keys off the session latch (ctx.runtime.gameOver) and the camera branch off mode dead, so no negative mode comparison was added (dead-mode-gates guard unchanged)"

patterns-established:
  - "driftedContact: copies a contact with position + velocity x seconds, every other field kept"

requirements-completed: [DEATH-01]

coverage:
  - id: D1
    description: "Dead camera: Oolite's aft view set back 100 m along the ship's forward, hull hidden, HUD hidden with data-dead"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#renderFrame dead scene (D-01)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Effect clock for explosions and shots, saturate fade on the canvas and the overlay, dust zero delta on the first dead frame, settle rule for the redraw gate"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#renderFrame dead scene (D-01)"
        status: pass
    human_judgment: false
  - id: D3
    description: "NPC debris drifts and tumbles on screen while dead with no time limit; sim hash and every debris entity unchanged"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#renderFrame dead debris drift (D-01c, D-01d)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/contacts.test.ts#debrisContacts (WORLD-17, D16-26)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Redraw bounded by visibility: isDebrisInDeadView (four side planes, Oolite's no-draw distance) and the settled-view idle gate"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/render-driver.test.ts#isDebrisInDeadView (D-01d)"
        status: pass
    human_judgment: false
  - id: D5
    description: "probe.death published only while latched, absent otherwise; probe-shape fixture untouched"
    requirement: DEATH-01
    verification:
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#the death key (Phase 20, DEATH-01, D-01)"
        status: pass
      - kind: e2e
        ref: "playwright tests/e2e/probe-shape.spec.ts (remote verify smoke subset, 28 passed)"
        status: pass
    human_judgment: false
  - id: D6
    description: "How the dead scene looks in a real browser: the explosion, the single flash from 100 m, small bursts as sparks, the CSS fade on the WebGL canvas in Chromium and Firefox, debris drift"
    verification: []
    human_judgment: true
    rationale: "Visual judgment and cross-browser CSS filter behaviour on a WebGL canvas (Assumption A1) is not asserted by any test; end-of-phase UAT"

duration: 70min
completed: 2026-11-23
status: complete
---

# Phase 20 Plan 08: The dead scene Summary

**Dead view drawn from Oolite's aft camera 100 m back with a five-second black and white fade, a presentation clock for the explosion, render-only debris drift with no time limit whose redraw is bounded by visibility, and `probe.death` for the browser specs.**

## Performance

- **Duration:** about 70 min
- **Completed:** 2026-11-23
- **Tasks:** 3 (each RED then GREEN: 6 commits)
- **Files modified:** 12

## Accomplishments

- **Dead camera and HUD (D-01).** In `render-driver.ts`, `mode === "dead"` draws `computeViewCamera(position + forward * 100, orientation, "aft", zero shake)`, forward being the ship's local -Z (`DEAD_CAMERA_SETBACK_M = 100`). The hull stays hidden, the HUD canvas is hidden and gets `data-dead` (removed in every other mode).
- **Effect clock.** `effectTime = flightTime + ctx.runtime.gameOverSeconds` goes to the explosion, shot and debris layers (alive it equals the flight time exactly). Ships, buoys, station and dust stand still. The first dead frame clears `ctx.core.previousCameraWorld`, so the 100 m camera move gives the dust a zero delta.
- **Fade.** `GAME_OVER_FADE_SECONDS = 5`: the `#view` canvas and the game-over overlay (`setFilter`) get `saturate(s)` with `s = 1 - min(1, gameOverSeconds / 5)` (values `saturate(1)`, `(0.5)`, `(0)`, `(0)` at 0, 2.5, 5, 9 s). Written only when it changes; the driver's first frame always writes it (a reused canvas never keeps a stale filter); no filter in any other mode; no draw call added. It is written on every `renderFrame`, drawn or not, so the final grey lands before the gate idles.
- **Settle rule.** The dead view draws every frame until `max(GAME_OVER_FADE_SECONDS, SMALL_BURST_DURATION, BIG_BURST_DURATION)` = 5 s, then idles like a paused view unless a moving debris piece is in view. The `redraw-gate` source pin now reads `redrawGate.next(paused || frozenDocked || deadSettled, drawKeys())`.
- **Debris drift (D-01c, D-01d).** `DebrisContact.velocity` is a copied read-only field (`src/sim/world/contacts.ts`, the only `src/sim/world/**` file touched). While latched, each piece is drawn at `position + velocity * gameOverSeconds` (float64, before the layer's camera subtraction) and tumbles on `effectTime`, with no time limit and no Oolite timer cited. Vitest pins the drawn pose at 0, 2.5, 30 and 45 s, a piece at rest, a context-restore draw at 45 s, and that `hashWorld`, `hashFlight` and every debris entity's position and velocity are unchanged across dead frames.
- **Redraw bounded by visibility (D-01d).** `isDebrisInDeadView(relative, radius, cameraOrientation, fovY, aspect)` tests the bounding sphere against the four side planes of the frustum (inward unit normals `(+-x + halfWidth*depth)/sqrt(1+halfWidth^2)`, same for y; the sphere may cross a plane) and Oolite's no-draw distance `sqrt(2) x NO_DRAW_DISTANCE_FACTOR x radius` (`NO_DRAW_DISTANCE_FACTOR = 1024`, `Entity.h:45`; `ShipEntity.m:798, 815, 1443-1446, 5558-5561`). Near and far planes are not tested. `renderFrame` sets `movingDebrisInView` on every call (drawn or not) from the drawn poses of pieces with non-zero velocity, using the dead camera's quaternion and the live scene camera's `fov` and `aspect`; `shouldDraw` reads it. A piece at rest never holds the redraw; every moving piece's distance grows without bound so the redraw always ends. The Vitest cases cover: in view, leaves the side plane, moving straight away to its no-draw distance, outside and heading in (resumes), no world, only pieces at rest, and before-settle always draws.
- **Probe.** `WegoliteDeathProbe { dead: true; cause: { damage; culprit? } }` and the optional `death` key, published from `ctx.runtime.gameOverCause` only while `ctx.runtime.gameOver` (a copy, no `undefined` culprit), deleted otherwise. The probe-shape audit table gained the `death` row (comment only); `tests/fixtures/probe-shape.json` is unchanged.
- **CHANGELOG.** Task 1's commit extends 20-07's `### Added` game-over entry with "The view turns to look back at your ship as it explodes, the HUD disappears, and the picture fades to black and white over five seconds." No version bump, no released section touched.

## Task Commits

1. **Task 1: dead scene (tracer)** - RED `39b2e25` (test), GREEN `54bff41` (feat; `render-driver.ts` and `CHANGELOG.md` together)
2. **Task 2: debris drift and visibility-bounded redraw** - RED `c70f59b` (test), GREEN `5cf9a57` (feat)
3. **Task 3: probe death key** - RED `59aba10` (test), GREEN `fa58baf` (feat)

## TDD Gate Compliance

RED then GREEN for all three tasks. RED evidence (semantic assessment): Task 1: 8 of 9 new cases failed on assertions of the planned behaviour (filter strings, `data-dead`, effect time, dust delta, settle idle), the ninth (context-restore draw) and "alive gets the flight time" pass because they pin existing behaviour. Task 2: 14 failed; the pure `isDebrisInDeadView` cases failed with "isDebrisInDeadView is not a function" and `NO_DRAW_DISTANCE_FACTOR` undefined because the export did not exist yet (the planned missing symbol, not a syntax or fixture fault); the contact cases failed on the missing `velocity`; the gate cases failed on assertions (`expected false to be true`). Task 3: 3 failed on `expected undefined to deeply equal { dead: true, ... }`. No separate refactor commits. `gsd_run check tdd-red-evidence` was not run (no JUnit/TAP report was captured; the runs were Vitest's default reporter).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tests/app/redraw-gate.test.ts` source pin**
- **Found during:** Task 1 (the plan's own verify command runs this file)
- **Issue:** The test pins the source text `redrawGate.next(paused || frozenDocked, drawKeys())`, which the settle rule necessarily changes.
- **Fix:** Updated the expectation to `paused || frozenDocked || deadSettled` and the test name.
- **Files modified:** `tests/app/redraw-gate.test.ts` (not in the plan's `files_modified`; the orchestrator authorizes it at merge)
- **Committed in:** `54bff41`

**2. [Rule 3 - Blocking] `tests/app/dispose.test.ts` debris literal**
- **Found during:** Task 2 (typecheck)
- **Issue:** A `DebrisContact` literal passed to `debris.update` lacked the new required `velocity`.
- **Fix:** Added `velocity: { x: 0, y: 0, z: 0 }`.
- **Files modified:** `tests/app/dispose.test.ts` (not in the plan's `files_modified`)
- **Committed in:** `5cf9a57`

**Total deviations:** 2 auto-fixed (both Rule 3). **Impact:** two one-line test edits outside `files_modified`, no behaviour change. No deletions.

## Decisions Made

None beyond following the plan. The dead-mode-gates guard needed no re-pin: this plan added only positive `=== "dead"` comparisons in `render-driver.ts` (already pinned at 0 negatives) and none in `probe-publisher.ts`.

## Verification Record

- Targeted Vitest per task and `typecheck`: pass.
- Plan boundary, local Docker: `docker compose run --rm test` 287 files, 7545 passed, 10 skipped; `lint` pass (one transient `src/sim/__purity_three_probe.ts` lint error appeared only while `test` ran concurrently, from the sim-purity guard; rerun alone was clean and the tree has no such file).
- Remote `verify`: `snapshot=fa58baf`, `exit=0`, `elapsed=207s` (includes the Chromium smoke subset `scene`, `docking`, `save-load`, `probe-shape`: 28 passed, so `probe-shape.spec.ts` ran).
- 20-seed NPC acceptance run (`npm run test:acceptance`, run through the remote wrapper: `run --rm test npm run test:acceptance`): `snapshot=fa58baf`, `exit=0`, `elapsed=82s`, 21 tests passed. Thresholds and detectors untouched. (`src/sim/world/contacts.ts` changed; 20-10 covers the phase HEAD again.)
- Acceptance greps: all Task 1 to 3 criteria hold; `rg DEAD_DRIFT_LIMIT_SECONDS src tests` and `rg kDeadResetTime src/app/session/render-driver.ts` print nothing; `git diff --name-only 617fb03 -- src/sim/npc src/sim/world src/content/generated/ships-npc.json` prints only `src/sim/world/contacts.ts`; `src/render/bodies/debris.ts` and `tests/fixtures/probe-shape.json` unchanged.

## Known Stubs

None.

## Issues Encountered

None beyond the deviations above. The tracer feedback gate ran in auto mode (`workflow.auto_advance` is true): the tracer's targeted Vitest was re-run green before expansion.

## Human-judgment items for the end-of-phase UAT (not run)

Task 1's `<human-check>`: die in flight with traffic on in Chromium and Firefox; the view turns aft, the explosion grows, the picture and the four lines fade to grey over about five seconds, no HUD, version or system text remains. Owner observations to record (not values to tune): whether the one flash (about 73 m radius seen from 100 m, 10.9 km/s growth for 0.4 s, alpha 0.5) fills the view and hides the eight bursts; whether the small bursts read as sparks or puffs; that wreckage and pods keep drifting and tumbling while ships stand still; and whether the CSS saturate fade shows on the WebGL canvas in both browsers (Assumption A1; fallback named in the plan: a full-screen `backdrop-filter: saturate(s)` layer between `#view` and `#game-over`).

## Threat Flags

None. The probe `death` cause carries key strings only (T-20-23); the drift moves copied contacts and the hashes are pinned (T-20-24); the redraw ends once no moving piece is in view (T-20-25).

## Next Phase Readiness

20-09 can read `probe.death` and the computed `filter` of `#view`; 20-10 records the FIDELITY rows and constants-ledger entries for `GAME_OVER_FADE_SECONDS`, `DEAD_CAMERA_SETBACK_M` and `NO_DRAW_DISTANCE_FACTOR`.

## Self-Check: PASSED

- Created/modified files exist; all six commits are ancestors of HEAD (`39b2e25`, `54bff41`, `c70f59b`, `5cf9a57`, `59aba10`, `fa58baf`).

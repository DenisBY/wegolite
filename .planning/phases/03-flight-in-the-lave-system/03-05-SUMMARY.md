---
phase: 03-flight-in-the-lave-system
plan: 05
subsystem: render / hud / simulation
tags:
  - canvas2d
  - hud
  - scanner
  - compass
  - aegis
  - projection
  - design-space
  - message-queue

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 01's SystemLayout, FlightState, FlightConfig, Canvas2D HUD shell and probe; plan 02's pinned Lave geometry; plan 04's torus state
  - phase: 02-data-pipeline-content-compiler
    provides: the compiled g0-s7 Lave record and the Cobra/Coriolis catalogue entries

provides:
  - src/sim/world/aegis.ts (aegisStatus, autoCompassTarget, nextCompassMode, resolveCompassTarget)
  - src/render/hud/projection.ts (projectToScanner, projectToCompass, aegisLabel)
  - src/render/hud/format.ts (formatClock, formatSpeed, formatFuel, clampMessage)
  - src/render/hud/messages.ts (createMessageQueue, MessageQueue)
  - src/render/hud/draw.ts (the eleven-element classic green HUD, HUD_LAYOUT, HUD_BOUNDS)
  - src/render/hud/hud.ts (DPR cap, 1920x1080 letterbox, zero-size guard, bounds)
  - src/app/hud-model.ts (buildHudModel with contacts/compass/aegis/bars/text)
  - tests/sim/aegis.test.ts, tests/hud/projection.test.ts, tests/hud/format.test.ts, tests/e2e/hud.spec.ts
affects:
  - 03-06 (pause overlay sits above the HUD; settings do not own HUD state)
  - 03-07 (HintController enqueues into the same MessageQueue; launch.spec owns the hint lifecycle)
  - 03-09 (probe lifecycle/dispose must cover the HUD canvas and the DPR media-query listener)

actuals:
  tokens: 16436
  tasks: 3
  commits: 3
  plan_head_before: 9485c4f64e4b224430f07bcce4967a6a03a2b56d
  plan_head_after: 5dd5cf56efae20e05b4a5133cb27565f19af1b5a

tech-stack:
  added: []
  patterns:
    - a pure DOM-free projection module tested in Node, with a thin canvas-only draw module
    - a fixed 1920x1080 design space scaled uniformly with centred letterbox margins
    - one design-space bounds table published through the probe so layout is asserted numerically
    - sim-owned aegis/compass rules consumed by the app view model, never re-derived in draw code
    - a message queue whose expiry is driven by the simulation clock, never wall time

key-files:
  created:
    - src/sim/world/aegis.ts
    - src/render/hud/projection.ts
    - src/render/hud/messages.ts
    - tests/sim/aegis.test.ts
    - tests/hud/projection.test.ts
    - tests/hud/format.test.ts
    - tests/e2e/hud.spec.ts
  modified:
    - src/render/hud/draw.ts
    - src/render/hud/hud.ts
    - src/render/hud/format.ts
    - src/app/hud-model.ts
    - src/app/probe.ts
    - src/app/game-session.ts
    - src/main.ts
    - src/sim/flight/step.ts

key-decisions:
  - "The scanner's 25,600 m range and the aegis ranges come from SystemLayout; aegis.ts is the single owner of the 51,200 m and 3r boundaries."
  - "projectToScanner takes a contact radius so a just-outside contact is pinned to the rim and a contact beyond range + radius is omitted."
  - "The compass resolves in the flight step from state.compassMode and position; no compassTargetChanged event is emitted, so the pinned torus event sequence is unchanged."
  - "The HUD model takes FlightConfig as a third argument so speed/roll/pitch bars have their maxima and fuel has the catalogue's full tank."
  - "The message queue lasts 4 simulated seconds per message, caps at 4, and is advanced only by flightTime, so pause freezes expiry."
  - "No hint lifecycle is implemented or asserted here; plan 07 owns HintController and tests/e2e/launch.spec.ts."

patterns-established:
  - "A projection module is pure and DOM-free; draw.ts only turns its numbers into canvas calls."
  - "Every drawn element has a design-space rect in one table; the probe publishes it so letterboxing is a numeric assertion."
  - "A HUD message is a queued string with a flightTime expiry, not a sticky variable."
  - "Aegis and compass boundaries live in src/sim/world, so the renderer and the view model cannot disagree."

requirements-completed:
  - FLGT-05

coverage:
  - id: D1
    description: "The scanner is a 25.6 km 3D ellipse with vertical tails plotting only the Coriolis, nav buoy and witchpoint, with rim pinning and range+radius omission"
    requirement: FLGT-05
    verification:
      - kind: unit
        ref: "tests/hud/projection.test.ts#projectToScanner"
        status: pass
      - kind: unit
        ref: "tests/hud/projection.test.ts#HUD contacts"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hud.spec.ts#the scanner and compass draw and the probe reports the station contact"
        status: pass
    human_judgment: false
  - id: D2
    description: "Aegis is station <= 51,200 m, else planet <= 3r; the auto compass target and the manual planet -> station -> witchpoint -> auto cycle follow those rules"
    requirement: FLGT-05
    verification:
      - kind: unit
        ref: "tests/sim/aegis.test.ts#pins the station aegis at 51,199 / 51,200 / 51,201 m"
        status: pass
      - kind: unit
        ref: "tests/sim/aegis.test.ts#pins the planetary aegis at 123,479 / 123,480 / 123,481 m"
        status: pass
      - kind: unit
        ref: "tests/sim/aegis.test.ts#applies cycleCompass and targetStation through stepFlight"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hud.spec.ts#the scanner and compass draw and the probe reports the station contact (compass target/aegis)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The HUD is the exact eleven-element v1 set in a fixed 1920x1080 design space, uniformly letterboxed, DPR-capped, with Oolite clock/speed/fuel strings"
    requirement: FLGT-05
    verification:
      - kind: unit
        ref: "tests/hud/format.test.ts#formatClock"
        status: pass
      - kind: unit
        ref: "tests/hud/format.test.ts#formatSpeed and formatFuel"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hud.spec.ts#the HUD set is the eleven v1 elements and letterboxes on ultrawide"
        status: pass
    human_judgment: false
  - id: D4
    description: "The message line is one clamped line fed by a FIFO queue capped at 4 and expiring on flightTime, so pause freezes it"
    requirement: FLGT-05
    verification:
      - kind: unit
        ref: "tests/hud/format.test.ts#message queue"
        status: pass
      - kind: e2e
        ref: "tests/e2e/hud.spec.ts#the message line is one clamped line and expires on flightTime"
        status: pass
    human_judgment: false
  - id: D5
    description: "Manual HUD readability at 1280x720, 1920x1080 and an ultrawide window"
    requirement: FLGT-05
    verification: []
    human_judgment: true
    rationale: "Colour, line weight and whether the classic green layout reads as Oolite are visual judgements; the automated proof asserts the element set, design-space rects, scale/letterbox and formats, not the look."

duration: 23min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 5: The v1 Flight HUD Summary

**The classic green-vector HUD is now one Canvas2D overlay in a fixed 1920x1080 design space: a 25.6 km 3D scanner plotting only the station, nav buoy and witchpoint, an aegis-aware compass, signed speed/roll/pitch/fuel bars, the Oolite clock, a green condition light and a flightTime-expiring message line.**

## Performance

- **Duration:** ~23 min (Docker waits included)
- **Started:** 2026-11-03T17:56:43Z
- **Completed:** 2026-11-03T18:20:00Z (approx.)
- **Tasks:** 3
- **Files modified:** 15 (7 created, 8 modified; 1,605 insertions, 43 deletions)

## Accomplishments

- `src/sim/world/aegis.ts` is the single owner of the aegis/compass rules: station `<= 51,200 m`, planet `<= 3 * planetRadius = 123,480 m`, the auto target (station inside either aegis, else planet) and the manual cycle `auto -> planet -> station -> witchpoint -> auto`. The unit table pins one metre either side of both boundaries.
- `src/render/hud/projection.ts` implements Oolite's exact ellipse maths (`zFactor = h/w`, `yFactor = 1 - sqrt(zFactor)`, `scale = 0.5 * width / range`, `yBase = forward * zFactor * scale`, `yTail = -local.y * yFactor * scale`), rim pinning for a just-outside contact and omission beyond `range + radius`; the compass blip sits at `0.4 * radius` with an ahead/behind flag and a centre fallback.
- `buildHudModel` plots exactly the station, nav buoy and witchpoint — never the planet or sun — and resolves the compass target and aegis from the sim module. It also supplies the normalised speed/roll/pitch/fuel bars and the exact `formatSpeed`/`formatFuel`/`formatClock` strings.
- `draw.ts` draws the eleven-element v1 set only: crosshair, scanner, compass, aegis, speed/roll/pitch/fuel bars, clock, condition light and message line. `HUD_LAYOUT` is the single design-space rect table; the probe publishes it, so "inside the design rect" is numeric.
- `hud.ts` keeps the DPR cap at 2, derives the backing store from CSS × capped DPR, computes one uniform scale and centred letterbox offsets, guards 0×0 windows, and re-registers a DPR media query when the device ratio changes.
- `messages.ts` is a FIFO queue capped at 4 with a 4-second simulated expiry; `game-session` maps `SimEvent` strings into it, so the message line drains on `flightTime` and pause freezes it. The hint lifecycle remains plan 07's.
- `docker compose run --rm verify` is green: 355 unit tests, 10 e2e tests, lint, typecheck, assets:check and build.

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "station and nav buoy appear on the scanner while flying"** - `d55e36e` (feat)
2. **Task 2: Lay out the full v1 HUD set in the 1920×1080 design space** - `6d196cf` (feat)
3. **Task 3: Compass, aegis, message queue and the manual readability pass** - `5dd5cf5` (feat)

**Plan metadata:** committed after this summary (docs).

**Tracer gate:** the task-1 `<verify>` was re-run after `d55e36e` (focused unit + hud e2e + typecheck/lint) and passed → `⚡ Tracer verified end-to-end — expanding`.

## Files Created/Modified

- `src/sim/world/aegis.ts` — aegis status, auto target, manual cycle, resolved target.
- `src/render/hud/projection.ts` — pure scanner/compass projection and the aegis label.
- `src/render/hud/draw.ts` — the eleven-element design-space HUD, `HUD_LAYOUT`, `HUD_ELEMENTS`.
- `src/render/hud/hud.ts` — resize/DPR/letterbox/zero-size guard and the probe bounds.
- `src/render/hud/format.ts` — clock/speed/fuel strings plus `clampMessage` and `MAX_MESSAGE_CHARS`.
- `src/render/hud/messages.ts` — FIFO message queue with `flightTime` expiry.
- `src/app/hud-model.ts` — `buildHudModel(state, layout, config, message)`.
- `src/app/probe.ts`, `src/main.ts` — additive `hud.contacts/compass/aegis/message/bounds` fields.
- `src/app/game-session.ts` — owns the message queue and feeds the current message to the model.
- `src/sim/flight/step.ts` — applies `cycleCompass`/`targetStation` and resolves the compass target each flight tick.
- `tests/sim/aegis.test.ts` — both aegis boundary tables, auto/manual targets, step wiring, purity scan.
- `tests/hud/projection.test.ts` — scanner base/tail/rim/visibility, compass ahead/behind/centre, contact set.
- `tests/hud/format.test.ts` — exact clock/speed/fuel/clamp strings and queue FIFO/cap/expiry.
- `tests/e2e/hud.spec.ts` — canvas/probe contact proof, eleven-element set, ultrawide letterbox, message expiry.

## Decisions Made

- **Aegis ranges come from `SystemLayout`.** `stationAegisRange` (51,200) and `planetAegisRange` (`3 * planetRadius`) are derived once in plan 01; `aegis.ts` compares against them so a HUD module cannot introduce a second threshold.
- **Scanner visibility needs the contact radius.** `projectToScanner` takes an optional `radius`: a contact whose centre is outside the range but whose surface intersects it is pinned to the rim, and beyond `range + radius` it is omitted — Oolite's `lim_dist` rule.
- **Compass target resolves in the step, not the renderer.** `stepFlight` updates `state.compassTarget` after the position integration, so the HUD and the hash see the same target. The `compassTargetChanged` event is deliberately not emitted, keeping the pinned torus event sequence and avoiding a launch-time compass message.
- **`buildHudModel` takes `FlightConfig`.** The bars need `maxSpeed`/`maxRoll`/`maxPitch` and the fuel display needs the catalogue's full 70 tenths; passing the config keeps the model pure and Node-testable.
- **Message expiry is 4 simulated seconds.** `MessageQueue` stores `expiresAt` on first read and drains on the passed `flightTime`; pause therefore freezes the line without any wall-clock special case.
- **No hint lifecycle.** Launch/torus/speed hints, first-use dismissal and `hintsSeen` are plan 07's; `hud.spec.ts` asserts only that a message draws, clamps and expires.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `buildHudModel` gained a `FlightConfig` argument**
- **Found during:** Task 1 (HUD model)
- **Issue:** the artifact table names `buildHudModel(state, layout)`, but the bars need the ship's maxima and the fuel display needs the catalogue's 70 tenths; neither is in `FlightState` or `SystemLayout`.
- **Fix:** `buildHudModel(state, layout, config, message)`; `game-session` passes the derived `FlightConfig`. The model stays pure and Node-testable.
- **Files modified:** `src/app/hud-model.ts`, `src/app/game-session.ts`
- **Verification:** projection/format unit suites and the hud e2e pass.
- **Committed in:** `d55e36e`

**2. [Rule 3 - Blocking] `projectToScanner` gained a `radius` argument**
- **Found during:** Task 1 (scanner projection)
- **Issue:** the artifact signature omitted the contact radius, but the required `distance - radius <= range` / `range + radius` visibility rule cannot be implemented without it.
- **Fix:** an optional trailing `radius = 0` parameter; the view model passes each body's radius.
- **Files modified:** `src/render/hud/projection.ts`, `src/app/hud-model.ts`
- **Verification:** the rim/visibility edges in `tests/hud/projection.test.ts`.
- **Committed in:** `d55e36e`

**3. [Rule 3 - Blocking] The app had to own the message queue**
- **Found during:** Task 3 (message line)
- **Issue:** `game-session.ts` is not in the plan's `files_modified`, but a queue that is never fed or read cannot expire; the previous `let message = ""` was sticky.
- **Fix:** `createMessageQueue(4)` in the composition root, `SimEvent` mapping enqueues strings, and `messages.current(flightTime)` feeds the model.
- **Files modified:** `src/app/game-session.ts`, `src/render/hud/messages.ts`
- **Verification:** the message-expiry e2e and the queue unit cases.
- **Committed in:** `5dd5cf5`

**4. [Rule 3 - Blocking] The probe and `main.ts` needed the new HUD fields**
- **Found during:** Task 1 (probe)
- **Issue:** `WegoliteHudProbe` gained `contacts`, `compass`, `aegis`, `message` and `bounds`; the boot-time probe literal in `main.ts` and the failure surface in `probe.ts` must satisfy the same interface.
- **Fix:** additive defaults in both literals; `main.ts` is not in `files_modified`.
- **Files modified:** `src/app/probe.ts`, `src/main.ts`
- **Verification:** typecheck and the hud e2e.
- **Committed in:** `d55e36e`

**5. [Rule 3 - Blocking] The compass cycle had to be applied by the flight step**
- **Found during:** Task 3 (manual cycle)
- **Issue:** `step.ts` is not in `files_modified`, but its own comment says compass/targeting arrive with the full HUD in plan 05; `cycleCompass`/`targetStation` were no-ops, so the manual cycle could not follow the rules.
- **Fix:** the command switch cycles/sets `compassMode`; the flight-time block resolves `compassTarget` after the position update. No `compassTargetChanged` event is emitted, so the torus event-sequence test is untouched.
- **Files modified:** `src/sim/flight/step.ts`
- **Verification:** `tests/sim/aegis.test.ts` drives both commands through the real `stepFlight`; the full unit suite (355 tests) is green.
- **Committed in:** `5dd5cf5`

### Scope notes

- The compass ahead/behind/centre and aegis-label cases landed in `tests/hud/projection.test.ts` during task 1 (the projection module and its test were written together); task 3 extended the file rather than creating a second copy.
- Task 3's `draw.ts`/`projection.ts` work was already in place from tasks 1–2 (the compass label, aegis glyph and message line were drawn as part of the full-set layout); no production change was needed for those steps.

---

**Total deviations:** 5 auto-fixed (all blocking integration/signature gaps)
**Impact on plan:** Every fix was required to make a named truth implementable or observable; no locked decision was changed, no post-v1 HUD element was added, and no pinned boundary was loosened.

## Issues Encountered

- The torus test pins the exact event sequence of a mass-lock disengage. Emitting `compassTargetChanged` from the same step appended a third event and failed that pin. The compass target is resolved in state without an event; the HUD reads it every frame, and the event union stays app-facing.
- Headless SwiftShader advances the fixed step far slower than wall time, so the message-expiry e2e takes ~57 s for two 4-second messages. The spec sets a 180 s correctness timeout and says so; this is Pitfall 15, not a performance claim.
- The scanner and message-line rects are clipped/positioned so a tall tail cannot cross the message line; the clip is applied to the scanner rect in `drawScanner`.

## Manual Acceptance (outstanding)

The plan's manual readability pass has **not** been performed by the executor and is not claimed:

- At 1280×720 (the Playwright default), 1920×1080 and an ultrawide window, confirm the crosshair is centred, the scanner ellipse/tails are readable, the compass/aegis/bars/clock/message line are not clipped, and the footer disclaimer is still visible.
- The automated proof covers the numeric half: the eleven-element set, every design-space rect inside 1920×1080, the uniform scale and letterbox offsets on a 2560×1080 viewport, the DPR-capped backing size, and the visible footer.

This is the `03-VALIDATION.md` HUD readability row; it remains for `/gsd-verify-work`.

## Known Stubs

None in the HUD. The hint lifecycle (launch/torus/speed hints, first-use dismissal, `hintsSeen`) is intentionally not implemented here; plan 07 owns `HintController` and `tests/e2e/launch.spec.ts`. The message line is live and will accept those hints through the same queue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 06's pause overlay sits above the HUD; it must not touch `MessageQueue` or the HUD model.
- Plan 07 can enqueue hints into `createMessageQueue(4)` and assert the lifecycle in `tests/e2e/launch.spec.ts`; `hud.spec.ts` deliberately does not.
- Plan 09's dispose work must remove the HUD canvas and the DPR media-query listener (`hud.dispose()` already does the latter).
- The full `verify` chain is green; the Phase 1 golden and cadence hashes are unchanged.

## Self-Check: PASSED

- All seven created files exist on disk; the eight modified files are committed.
- Commits `d55e36e`, `6d196cf` and `5dd5cf5` are ancestors of `HEAD`.
- `docker compose run --rm verify` is green (355 unit tests, 10 e2e tests).
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified by this executor.

---

*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*

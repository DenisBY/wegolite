---
phase: 04-manual-docking
plan: 02
subsystem: simulation
tags: [docking, port-frame, corridor, capture, arming-latch, roll-limit, e2e]

# Dependency graph
requires:
  - phase: 04-manual-docking
    provides: measured dock-port.json (aperture, corridor, hull, contact proxy, Cobra bbox) and the typed loader
provides:
  - DockGeometry + createDockGeometry(raw, dockOffset) + DockGeometryError, including contactPort
  - portFrame(layout, stationAngle) and portQuaternion(layout, stationAngle)
  - apertureHalfExtents(port, shipExtents) with a bounded x1.25 expansion
  - dockSnapshot(layout, state, geometry, stationAngle) returning frame/corners/box/centre/axes
  - classifyCorridor(snapshot, geometry) with past-end/lane/capture/band/straddle/outside
  - stepDocking(state, layout, geometry) with the clearance latch and exact docked-pose capture
  - FlightState dockArmed/dockCount/scrapeTicks and their canonical serialization
  - SimEvent docked{via,clockDelta} and scrape; StepOptions.dock
  - app geometry injection, docked presentation handling, probe.dock and probe.test.tainted
  - placeShipInPortFrame / rollLimitRadians helpers and the docking unit + e2e coverage
affects: [04-03, 04-04, 04-05]

# Actuals (#2632) — chars/4 over the realized code+test diff, same scale as the estimate.
actuals:
  tokens: 19794
  tasks: 3
  commits: 4
  plan_head_before: 5a7a04b4d941c4ed6d4cb1dd61b7091d85ef620a
  plan_head_after: d66ea37d11c86f05997728c84768cc2357209883
  # (the final docs commit is separate)

tech-stack:
  added: []
  patterns:
    - "One validated DockGeometry value injected into every fixed step; generated content never enters src/sim"
    - "A per-tick port snapshot (frame + 8 corners + box + centre/axes) is the single producer for classification and the 04-03 SAT"
    - "A clearance latch that arms only when the whole port-frame box is outboard of the converted contact proxy"
    - "Computed roll tolerance by bisection over the committed Cobra corners, never a round-number fixture"

key-files:
  created:
    - src/sim/dock/geometry.ts
    - src/sim/dock/port-frame.ts
    - src/sim/dock/corridor.ts
    - src/sim/dock/step.ts
    - tests/helpers/dock-pose.ts
    - tests/sim/dock-capture.test.ts
    - tests/sim/dock-corridor.test.ts
    - tests/sim/dock-cadence.test.ts
    - tests/e2e/docking.spec.ts
  modified:
    - src/sim/flight/state.ts
    - src/sim/flight/step.ts
    - src/sim/flight/launch.ts
    - src/sim/events.ts
    - src/app/game-session.ts
    - src/app/mode.ts
    - src/app/probe.ts
    - .planning/PROJECT.md

key-decisions:
  - "The contact proxy is converted into the port frame exactly once in createDockGeometry; contactPort z ≈ -1000.2561..+34.0419 and 04-03 never re-projects it"
  - "Arming uses the strict box.min.z > contactPort.zMax threshold, preserving Oolite's STATUS_LAUNCHING exemption across the Space-skip path"
  - "Band correction applies the per-tick port-frame delta without dt scaling; one scrape event and one scrapeTicks increment per band tick"
  - "The symmetric y guard deviates from DockEntity.m:752 and is recorded in PROJECT.md"
  - "probe.dock.outcome is the coarse live state (docked/inFlight); the raw classifier outcome stays a sim concern"

patterns-established:
  - "Strict Oolite inequalities with no epsilon; boundary tests one step either side"
  - "Test poses stated in port-frame intent (nosePastPlane/rollFromMatched/lateral), not world coordinates"
  - "Generated geometry is validated by the same finite/range contract the app supplies"

requirements-completed: [DOCK-01, DOCK-02, DOCK-04]

coverage:
  - id: D1
    description: "A rotating port-frame snapshot and strict Oolite corridor classifier (past-end, lane, capture, safety band, straddle, outside)"
    requirement: DOCK-01
    verification:
      - kind: unit
        ref: "tests/sim/dock-corridor.test.ts#strict lane boundaries"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-corridor.test.ts#safety band and straddle"
        status: pass
    human_judgment: false
  - id: D2
    description: "The aperture expansion is bounded, terminates on subnormals and reproduces the generated corridor"
    requirement: DOCK-01
    verification:
      - kind: unit
        ref: "tests/sim/dock-corridor.test.ts#aperture derivation is bounded and agrees with the generated corridor"
        status: pass
    human_judgment: false
  - id: D3
    description: "An aligned approach captures on the weighted plane, and the latch re-arms after natural and skipped launches without self-docking"
    requirement: DOCK-04
    verification:
      - kind: unit
        ref: "tests/sim/dock-capture.test.ts#manual docking capture"
        status: pass
    human_judgment: false
  - id: D4
    description: "Auto-centring, the symmetric y guard and a computed roll limit over the committed Cobra corners"
    requirement: DOCK-02
    verification:
      - kind: unit
        ref: "tests/sim/dock-corridor.test.ts#roll boundary over the committed Cobra corners"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-cadence.test.ts#docking cross-cadence determinism"
        status: pass
    human_judgment: false
  - id: D5
    description: "The app injects the validated geometry, shows the docked panel on the docked event, and a browser session docks through an independently derived pose"
    requirement: DOCK-01
    verification:
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#an independently derived aligned pose docks through the visible opening"
        status: pass
      - kind: automated_ui
        ref: "docker compose run --rm e2e sh -lc 'npm run build && npx playwright test tests/e2e/docking.spec.ts tests/e2e/launch.spec.ts'"
        status: pass
    human_judgment: false

duration: 20 min
completed: 2026-11-05
status: complete
---

# Phase 4 Plan 2: Manual Docking Corridor Summary

**A rolling port-frame corridor with strict Oolite boundaries, a clearance latch that re-arms after any launch, exact weighted-plane capture and a browser session that docks an independently derived pose through the visible slot.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-11-05T07:55:00Z (approximate; the prior plan completed at 07:54:40Z)
- **Completed:** 2026-11-05T08:15:00Z
- **Tasks:** 3 (one tracer, one TDD expansion, one app/e2e)
- **Files modified:** 17

## Accomplishments

- Added the pure `src/sim/dock/` modules: validated geometry (including the once-converted `contactPort`), the station-rolling port frame, the per-tick snapshot, the corrider classifier and `stepDocking`.
- Made capture exact and speed-free: `0.90*max.z + 0.10*min.z < 0` on the port-frame box, with the docked pose exactly `dockMouthPosition(layout)` and `layout.stationBaseQuat`, and no clock advance.
- Fixed the deadlocking latch: a post-launch ship arms only once its whole box clears the contact proxy's outward face, so natural and Space-skipped departures emit no scrape or dock.
- Pinned the strict boundaries one step either side (lane, safety band, nose gate, straddle) and derived the roll limit (31.296°) from the committed corners rather than a false 35° fixture.
- Applied the symmetric y guard, the per-tick auto-centre shift and the scrape counter, and recorded the Oolite deviations in `PROJECT.md`.
- Wired the geometry into every fixed step, handled the `docked` event, tightened the test hook to exactly `?test=1`, tainted every hook mutation, and proved a browser dock without `placeShipInPortFrame`.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): dock the aligned Cobra and arm the latch after launch** - `ca670f3` (feat)
2. **Task 2 RED: failing corridor boundary and cadence tests** - `d9e19a1` (test)
3. **Task 2 GREEN: auto-centre in the safety band and classify straddles** - `42f5b46` (feat)
4. **Task 3: wire docking into the session and prove it in the browser** - `d66ea37` (feat)

**Plan metadata:** the docs commit that follows this file.

## Files Created/Modified

- `src/sim/dock/geometry.ts` - validated `DockGeometry`, `DockGeometryError`, one-time `contactPort` conversion
- `src/sim/dock/port-frame.ts` - the station-rolling `i`/`j`/`k` frame and mouth origin
- `src/sim/dock/corridor.ts` - bounded aperture, per-tick snapshot, Oolite-ordered classifier
- `src/sim/dock/step.ts` - arming latch, capture, band auto-centre and scrape events
- `src/sim/flight/state.ts` - `dockArmed`/`dockCount`/`scrapeTicks` + canonical serialization
- `src/sim/flight/launch.ts` - clears the latch on `beginLaunch`
- `src/sim/flight/step.ts` - `StepOptions.dock`, `stepDocking` after the station-angle update
- `src/sim/events.ts` - `docked` and `scrape` events
- `src/app/game-session.ts` - geometry load/injection, docked handling, exact `?test=1`, taint flag, `probe.dock`
- `src/app/mode.ts` - the explicit `dock` transition
- `src/app/probe.ts` - dock probe type plus `setOrientation`/`setStationAngle`/`tainted`
- `tests/helpers/dock-pose.ts` - port-frame poses and the computed roll limit
- `tests/sim/dock-capture.test.ts` - capture, arming and speed-independence
- `tests/sim/dock-corridor.test.ts` - strict boundary, nose gate, roll and termination proofs
- `tests/sim/dock-cadence.test.ts` - non-vacuous 60/120/144 Hz replay
- `tests/e2e/docking.spec.ts` - independent browser pose and exact-query hook absence
- `.planning/PROJECT.md` - the new Key Decisions rows

## Decisions Made

- `contactPort` is the only contact box in port coordinates; plan 04-03's SAT receives it directly plus the snapshot's `centre`/`axes`.
- Arming at `box.min.z > contactPort.zMax` is a documented deviation from Oolite's mouth-plane/`STATUS_LAUNCHING` shape and is required because Wegolite's skip path has no launching status.
- `dockSnapshot` returns the world corners and the port-frame box/centre/axes together, so no downstream module re-projects or rebuilds the frame.
- `probe.dock.outcome` is the coarse live mode (`docked`/`inFlight`); the raw classification stays internal to the sim.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical] Rejected non-finite hook poses and speeds**
- **Found during:** Task 3 (hook extension)
- **Issue:** The plan only named orientation/station-angle validation, but `setPosition`/`setSpeed` still wrote NaN/Infinity into live state (T-04-07/T-04-08).
- **Fix:** Both setters now ignore non-finite input; the accepted mutations still taint the profile.
- **Files modified:** `src/app/probe.ts`
- **Verification:** e2e passes; the setter is a no-op on non-finite input by construction.
- **Committed in:** `d66ea37` (Task 3)

**2. [Rule 3 - Blocking] Added an optional `stationAngle` to the pose helper**
- **Found during:** Task 2 (station-roll invariance test)
- **Issue:** The plan's helper options had no station phase, so the real snapshot path could not be proved invariant at 0/π4/π2/π without constructing a second pose path.
- **Fix:** Added `stationAngle?: number` (default 0); the required options are unchanged.
- **Files modified:** `tests/helpers/dock-pose.ts`
- **Verification:** `tests/sim/dock-corridor.test.ts` asserts identical boxes at all four phases.
- **Committed in:** `42f5b46` (Task 2 GREEN)

---

**Total deviations:** 2 auto-fixed (1 missing critical, 1 blocking helper option)
**Impact on plan:** No scope change. Both are small correctness/coverage additions; the arming, capture and classification contracts are exactly as planned.

## TDD Gate Compliance

The plan is `type: execute`, so the plan-level `workflow.tdd_mode` gate does not apply; Task 2 carries `tdd="true"` and followed the cycle: the new boundary/cadence tests were written first and observed failing with `outside` instead of `band`/`straddle` (6 failures), committed as `test(04-02): ...` (`d9e19a1`), then implemented and made green in `feat(04-02): ...` (`42f5b46`). No REFACTOR commit was needed.

## Issues Encountered

- None. The only iteration was Prettier formatting and removing unused imports after the helper helper was trimmed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-03 can consume `geometry.contactPort`, `snapshot.centre` and `snapshot.axes` directly; no orientation argument or re-projection is needed.
- `stepDocking` deliberately emits no response for `outside`/`straddle`; 04-03 owns the single hull/scrape pipeline and the bounce.
- The `docked` event and `probe.dock` counters are wired for 04-04's computer dock and 04-05's tainted-profile autosave guard.
- No blockers.

---
*Phase: 04-manual-docking*
*Completed: 2026-11-05*

## Self-Check: PASSED

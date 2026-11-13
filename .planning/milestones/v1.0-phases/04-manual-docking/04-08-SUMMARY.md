---
phase: 04-manual-docking
plan: 08
subsystem: testing
tags: [vitest, docking, regression, tunnel-end-clamp, bounce, orientation-invariance]
requires:
  - phase: 04-manual-docking
    provides: stepDocking's disarmed clamp and exclusive contact pipeline from 04-02/04-03, plus the port-frame pose helpers
provides:
  - committed regression for the disarmed past-end clamp (G-04-4)
  - committed regressions for one-bounce and quaternion invariance through straddle and hull contact (G-04-5)
affects: [05-economy, future sim refactors touching src/sim/dock/step.ts]
actuals:
  tokens: 1130
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Coverage-only plan: pin already-shipped sim behaviour without touching src/sim"
key-files:
  created: []
  modified:
    - tests/sim/dock-corridor.test.ts
    - tests/sim/dock-hull.test.ts
key-decisions:
  - "The tunnel-end clamp is asserted against the port frame's k times the computed shift, so a rotated station cannot mask a world-+Z shortcut."
  - "The bounce block is named for orientation invariance; the one-bounce and bounceCount assertions remain preconditions that make that invariance meaningful."
requirements-completed: [DOCK-03, DOCK-06]
coverage:
  - id: D1
    description: "A disarmed in-flight ship past the 250 m tunnel end is clamped along the port-frame k with no event, mode inFlight and the latch still disarmed"
    requirement: "DOCK-03"
    verification:
      - kind: unit
        ref: "tests/sim/dock-corridor.test.ts#clamps a disarmed past-end ship along the port-frame k with no response"
        status: pass
    human_judgment: false
  - id: D2
    description: "A straddle or hull contact emits exactly one bounce, leaves the orientation quaternion deep-equal and keeps the mode inFlight"
    requirement: "DOCK-06"
    verification:
      - kind: unit
        ref: "tests/sim/dock-hull.test.ts#emits exactly one straddle bounce and leaves the orientation deep-equal"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-hull.test.ts#emits exactly one hull bounce and leaves the orientation deep-equal"
        status: pass
    human_judgment: false
duration: 14min
completed: 2026-11-05
status: complete
---

# Phase 04 Plan 08: Docking Regression Coverage Summary

**Two committed sim regressions pin the disarmed tunnel-end clamp along the rotated port frame and prove a straddle or hull bounce emits once without rotating the ship.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-11-05T13:39:00Z (approx.)
- **Completed:** 2026-11-05T13:53:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added a deterministic regression proving a disarmed past-end ship is shifted by `frame.k * shift`, with empty events, `mode === "inFlight"`, an unchanged `dockArmed`, and unchanged `bounceCount`/`dockCount`/`scrapeTicks`; the rotated `stationAngle` prevents a world-axis shortcut from passing.
- Added straddle and hull contact cases that assert exactly one bounce event with its `cause`, a deep-equal pre-step quaternion, `mode === "inFlight"` and `bounceCount === 1`.
- Ran the plan-level targeted suite (49 tests across corridor, capture, hull, no-trap and sim purity) and the full `docker compose run --rm verify` gate (690 unit tests, 46 Playwright tests) green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pin the disarmed tunnel-end clamp in the sim suite** - `f59fa8f` (test)
2. **Task 2: Pin orientation invariance and exactly one bounce through straddle and hull contact** - `3fa472d` (test)

**Plan metadata:** committed separately as the docs close-out commit.

## Files Created/Modified

- `tests/sim/dock-corridor.test.ts` - new "disarmed tunnel-end clamp" describe block with the rotated-station port-frame assertion.
- `tests/sim/dock-hull.test.ts` - new "orientation invariance through a bounce" describe block covering straddle and hull contact.

## Decisions Made

- The clamp assertion compares against `add(beforePosition, scale(snapshot.frame.k, shift))` rather than a hard-coded world coordinate, so the test follows the port frame exactly as `stepDocking` does.
- The bounce block's stated purpose is the quaternion deep-equality; the one-bounce and `bounceCount === 1` assertions stay as preconditions, matching the plan's instruction not to over-claim new coverage for already-pinned counts.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Threat Flags

None - the plan adds test files only and introduces no new network, auth, file-access or schema surface.

## Next Phase Readiness

- G-04-4 and G-04-5 are closed by committed regressions; `src/sim/dock/step.ts` was not modified.
- 04-07 remains incomplete in the phase (per the init context); phase-level verification should follow once it is executed.

## Self-Check: PASSED

---
*Phase: 04-manual-docking*
*Completed: 2026-11-05*

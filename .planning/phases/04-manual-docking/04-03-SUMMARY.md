---
phase: 04-manual-docking
plan: 03
subsystem: simulation
tags: [docking, collision, sat, bounce, feedback, shake, flash, no-trap, e2e]

# Dependency graph
requires:
  - phase: 04-manual-docking
    provides: dockSnapshot (frame/corners/box/centre/axes), contactPort converted once by createDockGeometry, the corridor classifier and the arming latch
provides:
  - hullContact(snapshot, contactPort) and obbsIntersect(snapshot, contactPort) — 15-axis SAT with an MTV in the port frame
  - stepDocking's exclusive capture/straddle/band/lane/outside pipeline and the reflected-velocity contact response
  - sanitizeFlightState(state, layout, config) at the top of stepFlight
  - FlightState.impulse/bounceCount/repairCount and the bounce SimEvent
  - createDockFeedback (shakeStrength/shakeOffset/flashAlpha), shouldEmitScrapeMessage and the HUD red-frame overlay
  - probe.dock.{bounceCount,scrapeCount,shake,flash} and the browser retry/skip proof
affects: [04-04, 04-05]

# Actuals (#2632) — chars/4 over the realized src+tests diff, same scale as the estimate.
actuals:
  tokens: 19254
  tasks: 3
  commits: 5
  plan_head_before: 695f765d37e11fcbb706ecc70cc9b2db27063e79
  plan_head_after: 7b2b3bc5af8681892d287d29108add5b66dc1648
  # (the final docs commit is separate)

tech-stack:
  added: []
  patterns:
    - "One 15-axis SAT in the port frame with a fixed axis order and earliest-axis tie-break"
    - "A strictly ordered exclusive docking pipeline: one response per tick by construction"
    - "A transient impulse vector on top of the scalar forward speed, integrated and decayed every tick"
    - "Deterministic envelope strength (never a sinusoid) published to the probe"
    - "Failure copy pre-empts teaching copy so D-08 feedback is visible immediately"

key-files:
  created:
    - src/sim/dock/hull.ts
    - src/sim/flight/sanitize.ts
    - src/app/dock-feedback.ts
    - tests/sim/dock-hull.test.ts
    - tests/sim/dock-no-trap.test.ts
    - tests/sim/dock-integrated.test.ts
    - tests/app/dock-feedback.test.ts
  modified:
    - src/sim/dock/step.ts
    - src/sim/flight/state.ts
    - src/sim/flight/step.ts
    - src/sim/flight/launch.ts
    - src/sim/events.ts
    - src/app/game-session.ts
    - src/app/hud-model.ts
    - src/app/probe.ts
    - src/render/hud/draw.ts
    - src/render/hud/messages.ts
    - src/render/launch-camera.ts
    - tests/e2e/docking.spec.ts

key-decisions:
  - "Contact detection is a 15-axis SAT of the ship OBB against the emitted contactPort, sharing one predicate with obbsIntersect so the oracle cannot diverge"
  - "The armed branch is capture, else straddle, else band/lane, else outside+hull — straddle never also runs the hull test"
  - "The impulse is integrated and decayed in stepDocking before the snapshot, so classification reads the pose that exists this tick"
  - "sanitizeFlightState repairs non-finite fields and clamps speed to maxSpeed*TORUS_MAX_FACTOR before any integration"
  - "The probe publishes envelope strength (1 at the trigger instant), not the sinusoidal camera offset"
  - "Failure/scrape messages pre-empt teaching copy; bounce copy is fixed and axis-aware"
  - "bounceCount is per departure: beginLaunch resets it so a relaunch proves a fresh, response-free departure"

patterns-established:
  - "Numerical separation margin (1e-6 m) after an MTV push so the next tick does not see float noise as overlap"
  - "Property tests record their seed and bound runs/ticks to stay under 60 s"
  - "Browser feedback proofs wait on monotonic probe counters and sim-clock expiry, never pixels"

requirements-completed: [DOCK-03, DOCK-06]

coverage:
  - id: D1
    description: "Off-axis contact produces exactly one response per tick: SAT normal, reflected velocity, damped forward speed, orientation unchanged, mode still inFlight"
    requirement: DOCK-03
    verification:
      - kind: unit
        ref: "tests/sim/dock-hull.test.ts#finds an edge intersection even when no ship corner is inside the box"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-hull.test.ts#resolves a ship centre inside the proxy and separates it in one step"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-no-trap.test.ts#seed: a straddle-plus-hull pose produces exactly one response"
        status: pass
    human_judgment: false
  - id: D2
    description: "The no-trap oracle asserts mode, finiteness, one bounce per tick, post-hull non-penetration and post-resolution movement over seeded random poses and intents"
    requirement: DOCK-06
    verification:
      - kind: unit
        ref: "tests/sim/dock-no-trap.test.ts#never leaves the mode, finiteness, one-response or separation invariants"
        status: pass
    human_judgment: false
  - id: D3
    description: "Scrape/bounce feedback is observable: deterministic shake and flash envelopes, a throttled scrape line and the HUD red frame"
    requirement: DOCK-03
    verification:
      - kind: unit
        ref: "tests/app/dock-feedback.test.ts#is at full strength at the trigger instant, not zero"
        status: pass
      - kind: unit
        ref: "tests/app/dock-feedback.test.ts#allows at most one message per simulated second"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#a bounce shakes, flashes and messages, and a retry is immediate"
        status: pass
    human_judgment: false
  - id: D4
    description: "Natural and Space-skipped launches never emit a contact response through and past the arming tick"
    requirement: DOCK-06
    verification:
      - kind: unit
        ref: "tests/sim/dock-integrated.test.ts#hands over at the mouth and never emits a contact response"
        status: pass
      - kind: e2e
        ref: "tests/e2e/docking.spec.ts#a bounce shakes, flashes and messages, and a retry is immediate (skipped relaunch)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The integrated chain docks exactly once after a bounce and an immediate retry"
    requirement: DOCK-06
    verification:
      - kind: unit
        ref: "tests/sim/dock-integrated.test.ts#launches, departs cleanly, bounces once off-axis, retries and docks"
        status: pass
    human_judgment: false
  - id: D6
    description: "The feel of the shake and flash amplitude is judged by a human"
    requirement: DOCK-03
    verification: []
    human_judgment: true
    rationale: "Amplitude and duration feel is a visual judgement; automation only proves the envelopes are observable and expire inside 0.3-0.5 s (VALIDATION Manual-Only)."

duration: 30 min
completed: 2026-11-05
status: complete
---

# Phase 4 Plan 3: Docking Failure Physics and Feedback Summary

**A 15-axis SAT against the port-frame contact proxy, one reflected-velocity response per tick, deterministic shake/flash feedback, and a seeded no-trap oracle plus an integrated launch-bounce-retry-dock gate.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-11-05T08:17:00Z (approximate)
- **Completed:** 2026-11-05T08:46:00Z
- **Tasks:** 3 (one tracer, one TDD expansion, one render/e2e)
- **Files modified:** 19

## Accomplishments

- Replaced corner-inside contact testing with a 15-axis SAT (`hullContact`/`obbsIntersect`) that shares its inputs with the snapshot and finds edge/face intersections with no corner inside the box.
- Made the armed docking branch a strictly ordered exclusive pipeline: capture, straddle, band/lane, outside+hull — one response, one count, one velocity rewrite per tick.
- Added the transient `impulse` and the reflected-velocity response: restitution 0.5, forward damping 0.35, an 8 m/s outward floor so a zero-speed brush still separates, and orientation never changes.
- Closed the hook-poisoning path with `sanitizeFlightState` (non-finite repair, torus-cap speed clamp) before any integration.
- Turned the no-trap requirement into a real oracle: seeded property runs assert one bounce per tick, non-penetration after a hull response, and post-resolution movement; adversarial seeds cover zero-speed straddles, straddle-plus-hull, deep centres and symmetric ties.
- Added the single integrated phase gate (launch → clean departure → off-axis bounce → immediate retry → dock) plus the skipped-launch negative, with `dockCount === 1`, `bounceCount === 1` and `mode === "docked"`.
- Made all three feedback channels observable and deterministic: the probe publishes envelope strength, the HUD draws the red frame only while live, the cockpit camera takes a world shake offset, and a bounce's copy pre-empts teaching messages.
- Proved the browser chain: a response-free departure, a first bounce with shake/flash/copy, expiry after 0.6 s, a second bounce, an aligned retry that docks, and a skipped relaunch with zero bounces.

## Task Commits

Each task was committed atomically; Task 2 followed RED → GREEN:

1. **Task 1 (tracer): bounce an off-axis approach once and recover the same tick** - `78a5b90` (feat)
2. **Task 2 RED: no-trap oracle, integrated chain and scrape throttle tests** - `0cedc43` (test)
3. **Task 2 GREEN: throttled scrape messages and the open retry path** - `e9ff3dd` (feat)
4. **Task 1 follow-up: orientation repaired by its full quaternion norm** - `476af4f` (fix)
5. **Task 3: cockpit shake, HUD red frame and the browser retry proof** - `7b2b3bc` (feat)

**Plan metadata:** the docs commit that follows this file.

## Files Created/Modified

- `src/sim/dock/hull.ts` - 15-axis SAT, minimum translation vector, `obbsIntersect` predicate
- `src/sim/dock/step.ts` - exclusive response pipeline, impulse integration/decay, straddle and hull responses
- `src/sim/flight/sanitize.ts` - deterministic non-finite repair and torus-cap speed clamp
- `src/sim/flight/state.ts` - `impulse`, `bounceCount`, `repairCount` and their canonical serialization
- `src/sim/flight/step.ts` - sanitize at the top, `dt` passed to `stepDocking`
- `src/sim/flight/launch.ts` - per-departure contact count and impulse reset
- `src/sim/events.ts` - `bounce` event with speed, cause and axis
- `src/app/dock-feedback.ts` - shake/flash envelopes and the scrape throttle predicate
- `src/app/game-session.ts` - bounce/scrape handling, priority messages, probe and camera/HUD wiring
- `src/app/probe.ts` - `dock.bounceCount/shake/flash`
- `src/app/hud-model.ts` - `flashAlpha`
- `src/render/hud/draw.ts` - red frame overlay drawn last
- `src/render/hud/messages.ts` - `enqueuePriority` for immediate failure feedback
- `src/render/launch-camera.ts` - optional world shake offset on the cockpit camera
- `tests/sim/dock-hull.test.ts` - SAT edge, face, tie, 200 m negative, deep centre, departure, sanitize
- `tests/sim/dock-no-trap.test.ts` - seeded property and adversarial seeds, scrape accounting
- `tests/sim/dock-integrated.test.ts` - the phase gate and the skipped-launch scenario
- `tests/app/dock-feedback.test.ts` - envelope determinism/expiry and the scrape throttle
- `tests/e2e/docking.spec.ts` - the browser bounce/retry/skip proof

## Decisions Made

- Contact detection is exactly the plan's fixed 15-axis order; the normal points from the box centre toward the OBB centre, a zero resolves to +1, and ties go to the earliest axis.
- The OBB half extents are recovered from the snapshot's eight corners rather than a second copy of the ship box, keeping the snapshot the single source of truth.
- A 1e-6 m separation margin is added after an MTV push so float noise cannot report residual overlap on the next tick.
- The straddle branch pushes by `-box.min.z` (strictly positive only because the classifier's nose gate guarantees `box.min.z < 0`) and reflects about the outward port normal `k`.
- The no-trap property bounds 30 runs at 2000 ticks with seed `20261105`; adversarial cases are separate deterministic tests so every regression seed is named.
- The probe publishes envelope strength, while the sinusoidal offset is derived app-side; this avoids a zero-at-trigger probe value.
- `bounceCount` is per departure; `dockCount` and `scrapeTicks` stay cumulative.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Orientation repair used the vector norm, not the quaternion norm**
- **Found during:** Task 3 (full unit suite)
- **Issue:** `sanitizeFlightState` called the `Vec3` length helper on a quaternion, so an identity orientation (x=y=z=0) looked zero-length and was replaced by the station quaternion. Four attitude/speed/torus tests failed with a reversed roll.
- **Fix:** compute `w²+x²+y²+z²` explicitly.
- **Files modified:** `src/sim/flight/sanitize.ts`
- **Verification:** the four failing suites and the full 615-test run are green.
- **Committed in:** `476af4f`

**2. [Rule 2 - Missing critical] Failure messages pre-empt teaching copy**
- **Found during:** Task 3 (e2e)
- **Issue:** the bounce copy sat behind two four-second tutorial messages in the four-slot queue; under SwiftShader the e2e could not observe it and, more importantly, D-08's "clear feedback" would be false for a player.
- **Fix:** added `MessageQueue.enqueuePriority` and used it for bounce and throttled scrape messages.
- **Files modified:** `src/render/hud/messages.ts`, `src/app/game-session.ts`
- **Verification:** the e2e message assertion passes; the HUD expiry spec still passes.
- **Committed in:** `7b2b3bc`

**3. [Rule 2 - Missing critical] A relaunch starts a fresh contact count**
- **Found during:** Task 3 (skipped-relaunch e2e)
- **Issue:** `bounceCount` was cumulative, so the plan's required `probe.dock.bounceCount === 0` after a relaunch could never hold once the ship had bounced.
- **Fix:** `beginLaunch` resets `bounceCount` (and the transient impulse); `dockCount` and `scrapeTicks` remain cumulative.
- **Files modified:** `src/sim/flight/launch.ts`
- **Verification:** the e2e skip negative passes; the integrated chain still ends at `bounceCount === 1`.
- **Committed in:** `7b2b3bc`

**4. [Rule 3 - Blocking] The scrape throttle needed a Node-testable seam**
- **Found during:** Task 2 (RED)
- **Issue:** `game-session` imports Vite-only content globs and cannot be imported by a Vitest module.
- **Fix:** `shouldEmitScrapeMessage` lives in the pure `dock-feedback` module; `lastScrapeMessageTime` stays in `handleEvent` as planned.
- **Files modified:** `src/app/dock-feedback.ts`, `src/app/game-session.ts`
- **Verification:** `tests/app/dock-feedback.test.ts#allows at most one message per simulated second`.
- **Committed in:** `e9ff3dd`

---

**Total deviations:** 4 auto-fixed (1 bug, 2 missing critical, 1 blocking test seam)
**Impact on plan:** No scope change. The SAT, pipeline, arming contract and feedback timings are exactly as planned; the deviations are probe semantics, immediate visibility of failure feedback and a testability seam.

## TDD Gate Compliance

The plan is `type: execute`, so the plan-level `workflow.tdd_mode` gate does not apply. Task 2 carries `tdd="true"` and followed RED → GREEN:

- **RED:** `0cedc43` added the property, adversarial, integrated and throttle tests; the throttle tests failed with `shouldEmitScrapeMessage is not a function` and the symmetric-tie fixture exposed a wrong test centre (corrected in the same commit).
- **GREEN:** `e9ff3dd` added the throttle predicate and its wiring; all 24 scoped tests passed.
- **REFACTOR:** none needed; Prettier formatting was the only cleanup.

## Issues Encountered

- The first Task 3 e2e run timed out on the HUD copy because tutorial messages held the queue; resolving it produced deviation 2 (priority enqueue), which is also the correct product behaviour.
- The full suite caught the sanitize quaternion-norm bug that the scoped docking tests could not; it was fixed before the Task 3 commit.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 04-04 can read `probe.dock.bounceCount` and can rely on `mode` staying `inFlight` after any contact; the `dockDenied` event is still 04-04's to add.
- Plan 04-05's autosave guard can treat a bounce/repair as a normal flight consequence; `repairCount` is available if it wants to flag a repaired profile.
- No blockers.

---

*Phase: 04-manual-docking*
*Completed: 2026-11-05*

## Self-Check: PASSED

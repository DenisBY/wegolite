---
phase: 03-flight-in-the-lave-system
plan: 04
subsystem: simulation / precision / testing
tags:
  - torus-drive
  - mass-lock
  - attitude-ramp
  - aristotelian-speed
  - cross-cadence
  - controller-seam
  - camera-relative
  - float32-ulp

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 01's SystemLayout, FlightConfig, FlightState, stepFlight and probe; plan 02's pinned Lave geometry and launch-roll sign; plan 03's bodies and scene
  - phase: 02-data-pipeline-content-compiler
    provides: the compiled g0-s7 Lave record and the Cobra/Coriolis catalogue entries

provides:
  - src/sim/flight/torus.ts (nearestSurfaceDistance, torusFactor, massLocked, engageTorus, disengageTorus, stepTorus)
  - torus target/deceleration in src/sim/flight/speed.ts (mass-lock x3)
  - the j edge in stepFlight, mass lock before integration
  - lastFactor in serializeFlight/hashFlight
  - tests/sim/{torus,mass-lock,flight-attitude,flight-speed,flight-cadence,flight-controller,precision}.test.ts
  - tests/e2e/flight.spec.ts
affects:
  - 03-05 (HUD reads torus/mass-lock state and the scanner range)
  - 03-07 (dust intensity reads the torus factor; the structural sync.ts assertion lands there)
  - 03-09 (probe lifecycle and dispose reuse the torus fields)

actuals:
  tokens: 18623
  tasks: 3
  commits: 3
  plan_head_before: b0b519ac0711f22fee7859c2b4a3c65bc390deae
  plan_head_after: eefbcbb5f5b144a2d70b3ec4cba49f4e658ad9fc

tech-stack:
  added: []
  patterns:
    - exact boundary tables with a named counter-value in the assertion
    - mass lock evaluated before the position integration every tick
    - clamp/reject the torus factor and dt rather than letting them poison the hash
    - numeric camera-relative proof independent of sync.ts
    - a behavioural controller seam proven by hash equality with a fake controller

key-files:
  created:
    - src/sim/flight/torus.ts
    - tests/sim/torus.test.ts
    - tests/sim/mass-lock.test.ts
    - tests/sim/flight-attitude.test.ts
    - tests/sim/flight-speed.test.ts
    - tests/sim/flight-cadence.test.ts
    - tests/sim/flight-controller.test.ts
    - tests/sim/precision.test.ts
    - tests/e2e/flight.spec.ts
  modified:
    - src/sim/flight/speed.ts
    - src/sim/flight/step.ts
    - src/sim/flight/state.ts
    - src/sim/flight/attitude.ts

key-decisions:
  - "Torus disengages on any pitch/roll/speed/`j` input (FLGT-04's stricter rule), not Oolite's speed-only keyboard path; recorded as a deliberate divergence."
  - "Mass lock is evaluated before the speed/position integration every tick, so a lock discovered mid-tick disengages before the large speed is applied; `lastFactor` preserves a finite deceleration."
  - "A mass-lock disengage decelerates at thrustAccel * lastFactor * 3, an input/toggle disengage at * 1; speed is never snapped to 350."
  - "`lastFactor` is included in `serializeFlight`/`hashFlight` so a replay pins the deceleration state as well as the engaged factor."
  - "`dt <= 0` or non-finite dt throws and advances no tick; stepTorus repeats the guard defensively."
  - "The teleport point is `station - stationToPlanet * 120000`; the wrong-sign point is rejected by the unit test because it lands 3,433.476 m inside the planet."
  - "The 1,140,077.01069702 m figure is the witchpoint-to-sun distance used for the float32 ULP bound; the dock camera's sun distance is 898,213.93 m, which is the relative coordinate asserted."
  - "Attitude rates are hard-clamped to maxPitch/maxRoll after the slew so no external or rounding path can exceed a cap."
  - "The Phase 1 kinematic golden and `runToSteps` are untouched; the flight replay helper lives in the cadence test."

patterns-established:
  - "A torus/mass-lock boundary is asserted one metre either side of the threshold, with a synthetic small body where Lave's geometry makes a rule redundant."
  - "Precision is proven numerically from the layout and `cameraRelative()`, never by importing the renderer's sync module."
  - "A seam is behavioural: a fake controller replaying the same intents must produce the same hash."

requirements-completed:
  - WORLD-02
  - FLGT-02
  - FLGT-03
  - FLGT-04
  - FLGT-08

coverage:
  - id: D1
    description: "The torus drive engages only when clear, recomputes the 32x-1024x factor every tick, mass-locks at the exact station/planet/sun thresholds, and disengages on any pilot input with a finite (x3 mass-lock) deceleration"
    requirement: FLGT-04
    verification:
      - kind: unit
        ref: "tests/sim/torus.test.ts#pins the boundary table: 0/102400/409600/104857600 -> 32/32/64/1024"
        status: pass
      - kind: unit
        ref: "tests/sim/mass-lock.test.ts#locks at 25,599 and 25,600 m, clears at 25,601 m"
        status: pass
      - kind: unit
        ref: "tests/sim/torus.test.ts#decelerates three times faster after a mass-lock disengage"
        status: pass
      - kind: e2e
        ref: "tests/e2e/flight.spec.ts#press J away from Lave, cross the system under torus, and disengage on input"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pitch/roll ramp at 2/4 rad/s^2 to 1/2 rad/s caps, damp at 1.0, reverse through zero, precision halves both targets, and no yaw exists; speed is 160 u/s^2 with a 350 cap and no lateral velocity"
    requirement: FLGT-02
    verification:
      - kind: unit
        ref: "tests/sim/flight-attitude.test.ts#ramps roll at 4 rad/s^2: 0.1 s -> 0.4 rad/s"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-attitude.test.ts#zeroes the rate before ramping on a reversal"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-attitude.test.ts#has no yaw field and no yaw axis in the module source"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-speed.test.ts#reaches 160 u/s after one second and 350 after 2.1875 s"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-speed.test.ts#changes the direction of travel on the next step after a 90 degree pitch"
        status: pass
    human_judgment: false
  - id: D3
    description: "The same tick-indexed intent log hashes identically at 30/60/144 Hz, and a fake controller reproducing PlayerController's intents produces the same hash"
    requirement: FLGT-08
    verification:
      - kind: unit
        ref: "tests/sim/flight-cadence.test.ts#hashes identically at 30, 60 and 144 Hz from one tick-indexed log"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-controller.test.ts#gives a fake controller and PlayerController the same hash"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-controller.test.ts#has no isPlayer branch and no device/DOM import in stepFlight"
        status: pass
      - kind: unit
        ref: "tests/golden/kinematic-probe.test.ts + src/sim/cadence.test.ts (unchanged)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The camera-relative path keeps every uploaded coordinate small and finite across Lave's full extent, with a 0.125 m float32 ULP at the sun distance and maxRelativeMagnitude below 2.5e6"
    requirement: WORLD-02
    verification:
      - kind: unit
        ref: "tests/sim/precision.test.ts#has a 0.125 m ULP at the sun distance, below the 0.25 m bound"
        status: pass
      - kind: unit
        ref: "tests/sim/precision.test.ts#preserves the 500.2561 m dock offset through the subtraction"
        status: pass
      - kind: unit
        ref: "tests/sim/precision.test.ts#keeps the maximum relative magnitude over the body set below 2.5e6"
        status: pass
      - kind: e2e
        ref: "tests/e2e/flight.spec.ts#maxRelativeMagnitude after launch and after a torus run"
        status: pass
      - kind: other
        ref: "docker compose run --rm verify"
        status: pass
    human_judgment: false
  - id: D5
    description: "Manual torus/dust legibility at speed (the 03-VALIDATION manual row)"
    requirement: FLGT-04
    verification: []
    human_judgment: true
    rationale: "The motion cue is perceptual and dust lands in plan 07; this plan proves engage/disengage/deceleration numerically, not how the streaks read at 1080p."

duration: 15min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 4: Exact Flight and the Torus Drive Summary

**Oolite's exact flight model is pinned at every boundary — 160/350 speed, 2/4 rad/s² ramps, 1/2 rad/s caps, the 32×–1024× torus with 25,600/2r/√2r mass lock, finite ×3 deceleration, one hash across 30/60/144 Hz — and the camera-relative path is numerically proven across Lave's 898 km dock-to-sun extent at a 0.125 m float32 ULP.**

## Performance

- **Duration:** ~15 min (Docker waits included)
- **Started:** 2026-11-03T17:36:00Z (approx.)
- **Completed:** 2026-11-03T17:50:38Z
- **Tasks:** 3
- **Files modified:** 13 (9 created, 4 modified; 1,921 insertions)

## Accomplishments

- `src/sim/flight/torus.ts` implements the exact Oolite factor `clamp(32 * sqrt(max(1, d / (4 × 25,600))), 32, 1024)`, the station `<= 25,600` / planet `< 4r²` / sun `< 2r²` squared predicates (plus the 25 km surface rule), engage-refuse, and disengage-with-`lastFactor`.
- `stepFlight` drains the `j` edge once, runs `stepTorus` before `stepSpeed`, and disengages on any pitch/roll/speed input. A mid-tick lock is discovered and disengaged before the position integration; speed decelerates at `160 × lastFactor` (×3 on a mass lock) and never snaps to 350.
- The 1024× cap moves exactly `2986.666...` m in one 1/120 s step; speed, factor and position stay finite at every reachable Lave distance, and `dt <= 0`/NaN is rejected without advancing the tick.
- Attitude rates are hard-clamped after the slew; the tests pin 4/2 rad/s², 2/1 caps, 1.0 damping, zero-then-ramp reversal, 0.5 precision, roll-then-pitch, a unit quaternion after 10,000 steps and the absence of yaw.
- Speed is 160/350/0 with forward-only motion; a 90° pitch changes travel direction on the next step and 100,000 steps stay finite.
- One tick-indexed intent log hashes identically at 30/60/144 Hz; a fake controller replaying `PlayerController`'s intents produces the same hash, and `stepFlight` has no `isPlayer` or device import. The Phase 1 golden and `runToSteps` are untouched.
- `tests/sim/precision.test.ts` proves the numeric camera-relative contract from the layout and `cameraRelative()` alone (no `sync.ts` import): 0.125 m ULP at 1,140,077.01 m, finite sun coordinate at 898,213.93 m from the dock, the 500.2561 m dock offset preserved to sub-millimetre float32 resolution, and `maxRelativeMagnitude < 2.5e6`.
- `tests/e2e/flight.spec.ts` teleports to the pinned mass-lock-free point, presses `j`, observes the factor in `[32,1024]` and speed above 350, then a pitch input disengaging with a gradual deceleration to 350, plus finite pose/world values and log depth after launch and after the torus run.
- `docker compose run --rm verify` is green (all unit suites, 7 e2e tests).

## Task Commits

Each task was committed atomically:

1. **Task 1: End-to-end "press J away from Lave and cross the system under torus"** - `b16676b` (feat)
2. **Task 2: Pin the attitude, speed, cadence and controller-seam edges** - `36c04ae` (feat)
3. **Task 3: Prove camera-relative precision and mass-lock boundaries at Lave scale** - `eefbcbb` (test)

**Plan metadata:** committed after this summary (docs).

**Tracer gate:** the tracer `<verify>` was re-run after `b16676b` (unit + e2e + typecheck/lint) and passed → `⚡ Tracer verified end-to-end — expanding`.

## Files Created/Modified

- `src/sim/flight/torus.ts` — factor, mass lock, engage/disengage, `stepTorus`; the exact constants and squared predicates.
- `src/sim/flight/speed.ts` — torus target/acceleration, `lastFactor` deceleration (×3 mass lock), finite/negative guards.
- `src/sim/flight/step.ts` — drains the `j` edge once, runs torus/mass lock before speed/position.
- `src/sim/flight/state.ts` — `lastFactor` added to the canonical hash.
- `src/sim/flight/attitude.ts` — hard cap clamp after the slew.
- `tests/sim/torus.test.ts` — factor table/monotonicity, lock boundaries, teleport point + wrong-sign counter-value, engage/refuse/input/toggle/mass-lock disengages, 1024× displacement, dt/finite guards.
- `tests/sim/mass-lock.test.ts` — the station/planet/sun/buoy table, the 25 km rule isolated on a synthetic small body, far point and teleport point.
- `tests/sim/flight-attitude.test.ts` — ramps/caps/damping/reversal/precision/sign/no-yaw.
- `tests/sim/flight-speed.test.ts` — 160/350/0, per-step delta, 90° turn, 100,000-step finiteness.
- `tests/sim/flight-cadence.test.ts` — `runFlightToSteps` and the 30/60/144 Hz hash equality.
- `tests/sim/flight-controller.test.ts` — mapping/clamp/zeros, fake-controller hash equality, source scans.
- `tests/sim/precision.test.ts` — the numeric camera-relative proof at Lave scale.
- `tests/e2e/flight.spec.ts` — the browser torus proof plus finite/log-depth precision assertions.

## Decisions Made

- **Any-input disengagement is kept** (FLGT-04's stricter rule) rather than Oolite's speed-only keyboard path; it is a deliberate divergence recorded here and in the plan objective.
- **Mass lock before integration:** `stepTorus` updates the lock and disengages before `stepSpeed`, so a mid-tick lock cannot teleport the ship through a body (Pitfall 8).
- **`lastFactor` in the hash:** the deceleration multiplier is replay state, so it is serialized alongside the engaged factor.
- **`dt <= 0` throws:** a zero/negative/NaN step is rejected loudly and leaves the tick untouched; `stepTorus` repeats the guard defensively.
- **The teleport point is 120 km from the station *away* from the planet** (`station - stationToPlanet × 120000`); the wrong sign is asserted to be 3,433.476 m inside the planet.
- **Sun distances:** the 1,140,077.01069702 m figure is the witchpoint distance used only for the ULP bound; the dock camera's sun relative coordinate is 898,213.93 m, and that is what `cameraRelative` is asserted against.
- **Attitude hard clamp:** the slew already cannot overshoot its target, but a final clamp to `±maxPitch`/`±maxRoll` makes "never exceed the cap" independent of the slew's call path.
- **No `sync.ts` contact:** the precision proof imports only `camera-relative.ts`; the structural single-path assertion is deferred to plan 07.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Damping residual is ~5e-15, not exactly 0 after 2 s**
- **Found during:** Task 2 (attitude tests)
- **Issue:** `2 - 240 × (1/120)` accumulates a ~4.6e-15 residual because the last damping step subtracts one ULP more than the remaining rate. `toBe(0)` is not a property of float64 arithmetic.
- **Fix:** the test asserts `|rollRate| < 1e-12` (a wrong damping rate would leave ~1.0) and documents the residual. The production slew is unchanged.
- **Files modified:** `tests/sim/flight-attitude.test.ts`
- **Verification:** the focused attitude suite passes (10 tests).
- **Committed in:** `36c04ae`

**2. [Rule 1 - Bug] Per-step position delta is masked by the Lave coordinate ULP**
- **Found during:** Task 2 (speed tests)
- **Issue:** at the dock-mouth `z ≈ -4.3e5` one float64 ULP is ~6e-11 m, so a 0.833 m delta reads back with a ~2e-11 error; a 12-digit assertion failed on arithmetic, not on a model bug.
- **Fix:** the test teleports the position to the origin before measuring the delta, where `forward × speed × dt` is exact, and documents why.
- **Files modified:** `tests/sim/flight-speed.test.ts`
- **Verification:** the focused speed suite passes (6 tests).
- **Committed in:** `36c04ae`

**3. [Rule 1 - Bug] The sun's relative coordinate is 898,213.93 m, not 1,140,077.01 m**
- **Found during:** Task 3 (precision test)
- **Issue:** the plan's 1,140,077.01069702 m is the witchpoint-to-sun distance; the launch camera sits at the dock on the planet-facing side of the station, so its sun distance is 898,213.93 m. Asserting the witchpoint figure against the dock camera is wrong by 242 km.
- **Fix:** the ULP bound still uses 1,140,077.01069702 m; the relative-coordinate assertion pins 898,213.93 m and the max-relative bound uses the same value. Documented in the test module and here.
- **Files modified:** `tests/sim/precision.test.ts`
- **Verification:** the precision suite passes (7 tests).
- **Committed in:** `eefbcbb`

**4. [Rule 3 - Blocking] The flight e2e exceeded the 30 s default under the parallel verify chain**
- **Found during:** Task 3 (`docker compose run --rm verify`)
- **Issue:** the focused flight spec runs in ~17 s, but with the scene spec rendering the procedural planet on SwiftShader in parallel it exceeded 30 s at `keyboard.up`; the spec waits on simulated time, not wall time (Pitfall 15).
- **Fix:** `test.setTimeout(90_000)` for the file, with a comment that the bound is a correctness wait, not a performance claim.
- **Files modified:** `tests/e2e/flight.spec.ts`
- **Verification:** the full `verify` chain is green (7 e2e tests, flight spec 33.9 s).
- **Committed in:** `eefbcbb`

### Scope notes

- The `speed.ts` finite/negative guards and the torus suite's mid-tick-lock and `dt <= 0` cases landed in task 1's commit, because task 1 already required the finite/cap coverage; task 2's speed work was therefore already in place and its commit carries only the attitude clamp and the new tests.
- `tests/sim/torus.test.ts` is listed in task 3 but needed no further change: the mid-tick mass-lock and `dt <= 0` cases it asked for are already pinned in that file.

---

**Total deviations:** 4 auto-fixed (3 assertion/number corrections, 1 blocking timeout).
**Impact on plan:** No production behaviour was weakened and no pinned value was loosened; two corrections fixed the tests' arithmetic against real float64/geometry, one corrected a plan number that conflated the witchpoint and dock distances, and one raised a correctness timeout.

## Issues Encountered

- Lave's planet/sun are large enough that the 25 km surface mass-lock rule is entirely dominated by `2r`/`√2r`; a synthetic small-body layout proves the surface rule in isolation so a typo in its squared form cannot hide.
- The torus factor at the teleport point is `34.5688`, not `32`: 119.5 km of station surface distance is above the `4 × 25,600` threshold. Pinned.
- The probe does not publish a camera position; the structural "camera at (0,0,0), one `cameraRelative()` path" assertion is plan 07's `tests/render/sync.test.ts`, because plan 03 rewrites `sync.ts` in this same wave.

## Known Stubs

None in production. The deferred structural `sync.ts` assertion is owned by plan 07 and documented above; dust is plan 07's, and the manual torus/dust legibility row remains for `/gsd-verify-work`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 05 can read `state.torus.{engaged,factor,massLocked}` and `layout.scannerRange` for the HUD; plan 07 can read the factor for dust intensity.
- `tests/e2e/flight.spec.ts` is the browser pattern for teleport-based torus/mass-lock proofs; the teleport point is pinned in `tests/sim/torus.test.ts`.
- The full `verify` chain is green; the Phase 1 golden and cadence hashes are unchanged.

## Self-Check: PASSED

- All nine created files exist on disk; the four modified files are committed.
- Commits `b16676b`, `36c04ae` and `eefbcbb` are ancestors of `HEAD`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified by this executor.

---

*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*

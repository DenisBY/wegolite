---
phase: 18-stations-buoys-and-collisions
plan: 10
subsystem: simulation
tags: [flight, drift, braking, float32, oracle, docking, collisions, D-02, D-04]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-03 braking-player.json fixtures and playerBrakeReference; 18-20 confirmation of the oracle against real Oolite"
provides:
  - "FlightState.drift (Oolite's player velocity) with pristine-omit serialization, sanitiser repair and the four pose-reset sites"
  - "src/sim/flight/drift.ts: brakePlayerDrift, hasDrift, VELOCITY_CLEANUP_MIN/FULL/RATE"
  - "FlightConfig.thrust (the raw catalogue thrust, 32 for the Cobra)"
  - "the station contact reflects a non-zero drift (inward part, restitution 0.5) and reports an impact speed that includes it"
affects: [18-11, 18-16, 18-18, 18-19, 18-12]

actuals:
  tokens: 11000
  tasks: 2
  commits: 4
plan_head_before: fec949c413f1cf623dd99cc9785027643bd1828c
plan_head_after: 6af3a79c60c4efad7972ca2b3c1d9c198c481811

tech-stack:
  added: []
  patterns:
    - "Float32 port of a GLfloat routine in src/sim: Math.fround on the vector components and every local, matching the 18-03 oracle bit for bit over 10,000-tick runs"
    - "Pristine-omit flight line: a new hashed field appends its line only when non-zero, so every pinned flight hash is unchanged"

key-files:
  created:
    - src/sim/flight/drift.ts
    - tests/sim/flight-drift.test.ts
    - tests/sim/player-braking.oracle.test.ts
    - tests/persistence/restore-drift.test.ts
  modified:
    - src/sim/flight/state.ts
    - src/sim/flight/sanitize.ts
    - src/sim/flight/step.ts
    - src/sim/flight/config.ts
    - src/sim/flight/launch.ts
    - src/sim/hyperspace/arrival.ts
    - src/sim/dock/computer.ts
    - src/sim/dock/step.ts
    - tests/content/player-ship.test.ts

key-decisions:
  - "The drift vector itself is narrowed to float32 at each brake, not only the GLfloat locals: Oolite's velocity is a float Vector, and the cleanup fixtures fail with a double vector (5 of 6 fixtures fail under a double mutation)"
  - "The drift line uses canon's default 6 decimals, as the impulse line does"
  - "A straddle resolves in two contact events (straddle, then the hull push-out) with or without drift; this is pre-existing dock behaviour, so the drifting-straddle test pins equality with the resting straddle instead of a single event"

patterns-established:
  - "Pose installs zero the drift beside the impulse, each with its Oolite line (leaveDock 6465, leaveWitchspace 6977, docking computer 3295)"

requirements-completed: [CBT-18]

coverage:
  - id: D1
    description: "Player drift integrated every in-flight tick and power-braked by the raw thrust x thrust factor with the cleanup terms, matching every braking-player.json fixture"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/player-braking.oracle.test.ts (6 fixtures + manifest)"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-drift.test.ts#brakePlayerDrift (PlayerEntity.m:3385-3404)"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-drift.test.ts#the drift in the flight step"
        status: pass
    human_judgment: false
  - id: D2
    description: "Pristine-omit drift line, sanitiser repair and clamp; flight hash pins unchanged; drifting flight equal at 30, 60 and 144 Hz"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/flight-drift.test.ts#drift in the serialized flight (criterion 5)"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-drift.test.ts#drift repair (T-18-23)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/flight-drift.test.ts#a drifting flight hashes equal at 30, 60 and 144 Hz"
        status: pass
    human_judgment: false
  - id: D3
    description: "Drift zeroed by beginLaunch, applyWitchpointArrival, dockWithComputer and the manual capture; a Load restores zero drift"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/flight-drift.test.ts#every pose change zeroes the drift"
        status: pass
      - kind: integration
        ref: "tests/persistence/restore-drift.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "Station contact sees the drift: one bounce in 600 ticks at 68 m/s (+34 m/s drift, 8 m/s floor), no tunnel at 350 m/s, drifting straddle identical to the resting one, zero-drift dock path unchanged"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/flight-drift.test.ts#the station contact sees the drift (review L173, L426, L424)"
        status: pass
      - kind: unit
        ref: "tests/sim/dock-hull.test.ts, dock-no-trap, dock-cadence, dock-capture (unchanged since 76229f5)"
        status: pass
    human_judgment: false

duration: 21min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 10: Player Drift Summary

**The player now carries Oolite's Newtonian drift: `FlightState.drift`, moved into the position every in-flight tick and power-braked in float32 by the raw thrust 32 x the thrust factor with the cleanup terms (all six `braking-player.json` fixtures pass, including the 10,147-tick cleanup run). It is zeroed at every pose install, never hashed when zero, and reflected once by the station hull.**

## Performance

- **Duration:** about 21 min
- **Started:** 2026-11-19T19:46:22Z
- **Completed:** 2026-11-19T20:07Z
- **Tasks:** 2 (both TDD: RED then GREEN)
- **Files:** 13 (4 created, 9 modified)

## Braking fixture results

`tests/sim/player-braking.oracle.test.ts` replays each fixture through `brakePlayerDrift` with the flight step's own order (move by the drift, then brake; thrust factor = torus factor only when speed > maxSpeed). Stop ticks match exactly; speeds, position change and final drift match within the fixtures' relative tolerance 1e-6.

| Fixture | Start drift | Factor | Stop tick |
|---|---|---|---|
| `brake-player-below-max-speed` | (30, 0, 40) | 1 | 188 |
| `brake-player-at-max-speed-no-torus` | (0, -120, 0) | 1 (speed = maxSpeed) | 450 |
| `brake-player-torus-32` | (0, 0, -200) | 32 | 24 |
| `brake-player-torus-1024` | (500, 0, 0) | 1024 | 2 |
| `brake-player-cleanup-band` | (1800, 0, 2400) | 1 | 9201 |
| `brake-player-above-full-cleanup` | (0, 0, 6000) | 1 | 10147 |

Mutation check: with `f` replaced by identity in `drift.ts` (a double port), five of the six fixtures fail, confirming the 18-03 note that only a float32 port reproduces the C.

**Stop tick of the 100 m/s hand case:** no fixture starts at 100 m/s, so the hand test asserts the stop within one tick of the exact-arithmetic 375 (it passes) and the oracle test holds the exact ticks above.

## Reset sites

| Site | File | Oolite line |
|---|---|---|
| `initFlightState` | `src/sim/flight/state.ts` | (fresh state) |
| `beginLaunch` | `src/sim/flight/launch.ts` | `leaveDock:` PlayerEntity.m:6465 |
| `applyWitchpointArrival` | `src/sim/hyperspace/arrival.ts` | `leaveWitchspace` PlayerEntity.m:6977 |
| `dockWithComputer` | `src/sim/dock/computer.ts` | docking computer PlayerEntity.m:3295 |
| manual capture | `src/sim/dock/step.ts` | docked ship carries none; `leaveDock:` 6465 |
| `restoreFromSave` | `src/persistence/autosave.ts` (unchanged) | builds from `initFlightState`; `setUpAndConfirmOK` 1807 |

## Task Commits

1. **Task 1 (tracer): drift moves and brakes to rest** — `15ceec6` (test, RED), `4d60d1f` (feat, GREEN). Tracer gate: the task's verify was re-run end to end and passed (7 files, 70 tests; typecheck clean) before Task 2.
2. **Task 2: resets, station contact, Load at rest** — `57c767d` (test, RED), `6af3a79` (feat, GREEN).

## TDD Gate Compliance

- RED 1: `docker compose run --rm test npx vitest run tests/sim/flight-drift.test.ts -t "removes dt x thrust per tick at factor 1" --reporter=tap-flat`, exit 1; target failed on `expected 100 to be close to 99.7333` (stub returned the input). Classifier `RED_EVIDENCE_OK / target_test_failed`. The first unfiltered run was `INVALID_RED / invalid_record` (multi-line `toEqual` diffs break TAP), so the target was rerun alone. The RED commit carried a type skeleton only (the field, `FlightConfig.thrust`, a stub brake).
- RED 2: same command with `-t "a 68 m/s drift into the hull"`, exit 1; target failed on `expected -67.4667 to be close to 33.7333` (contact ignored the drift). `RED_EVIDENCE_OK / target_test_failed`. The restore test passed at RED by design: `restoreFromSave` already builds from `initFlightState`, and the plan forbids a persistence edit.
- No REFACTOR commit was needed.

## Files Created/Modified

- `src/sim/flight/drift.ts` — `brakePlayerDrift` (PlayerEntity.m:3387-3404 in float32), `hasDrift`, the cleanup constants; doc comment records the torus-factor reset edge and the float32-underflow difference.
- `src/sim/flight/state.ts` — `drift` field, zero at init, `drift=` line appended only when non-zero.
- `src/sim/flight/sanitize.ts` — non-finite drift to zero, components clamped at `MAX_ENTITY_VELOCITY`.
- `src/sim/flight/step.ts` — after `stepSpeed`: move by the drift, then brake with `speed > maxSpeed ? torus.factor : 1`.
- `src/sim/flight/config.ts` — `thrust` beside `thrustAccel`.
- `src/sim/flight/launch.ts`, `src/sim/hyperspace/arrival.ts`, `src/sim/dock/computer.ts`, `src/sim/dock/step.ts` — drift resets; `respondToContact` drift branch.
- Tests: `tests/sim/flight-drift.test.ts`, `tests/sim/player-braking.oracle.test.ts`, `tests/persistence/restore-drift.test.ts`, `tests/content/player-ship.test.ts`.

## Decisions Made

See `key-decisions`. No CHANGELOG line: no gameplay path creates a drift yet (collisions arrive in 18-11, the blast in 18-19), so nothing user-visible changed.

## For 18-12's FIDELITY walk

- **Torus factor after a disengage (review L428):** Oolite brakes with `hyperspeedFactor` while `flightSpeed > maxFlightSpeed`; Wegolite resets `torus.factor` to 1 on disengage (`torus.ts:188`) while the speed is still ramping down, so those ticks brake with factor 1.
- **Float32 underflow:** a drift whose float32 magnitude is 0 becomes the zero vector here; Oolite would keep it unbraked.
- **Drift-bounce at the station:** Wegolite's own dock response (D-07) reflects the drift's inward part with restitution 0.5; 18-11 writes the FIDELITY row and the Key Decision (plan's deferred L179).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The drifting-straddle expectation ("resolves once") contradicted pre-existing dock behaviour**
- **Found during:** Task 2 GREEN
- **Issue:** every straddle, at rest, at 68 m/s forward or with a 68 m/s drift, gives two events: `straddle` on tick 0 and a `hull` push-out on tick 1, because the straddle push stops at the mouth plane while the contact proxy reaches `zMax` 34.04 m. The drift adds nothing.
- **Fix:** the test pins the drifting straddle's contacts equal to the resting straddle's (`[{0, straddle}, {1, hull}]`) and the drift outward afterwards. The dock path was not changed (zero-drift byte-identity and the diff-gated dock tests). Logged in `deferred-items.md`.
- **Files modified:** `tests/sim/flight-drift.test.ts`
- **Commit:** `6af3a79`

**2. [Rule 1 - Bug] Serialization expectation:** the hand test first expected `drift=1.5,0,-2`; `canon` prints 6 decimals, as for `impulse`. Test corrected in `4d60d1f`.

**3. Doc wording for the negative gate:** `drift.ts` names the engine acceleration without the identifier `thrustAccel`, so `rg -n "thrustAccel" src/sim/flight/drift.ts` stays empty.

---

**Total deviations:** 2 auto-fixed (both test expectations) plus one wording change. **Impact:** none on scope.

## Issues Encountered

- A scratch run with `vitest --root /` scanned the whole filesystem and was killed; the exploration was redone as a temporary test case that was removed before commit (no scratch file entered the repository).

## Verification

- Task 1 verify: 7 files, 70 tests passed; `typecheck` clean.
- Task 2 verify: 10 files, 94 tests passed; `docker compose run --rm test`: 242 files, 6,586 passed, 10 skipped, exit 0 (coverage thresholds held); `lint` exit 0; `typecheck` exit 0. No remote run (plan gate policy).
- Acceptance: state.ts non-comment `drift` lines 5; `export function brakePlayerDrift` 1; `thrustAccel` in drift.ts none; `tests/golden/world` unchanged since 76229f5; `drift = vec(0, 0, 0)` once in each of the four reset files; `src/persistence` unchanged; the four dock tests unchanged; `drift` in dock/step.ts 15.

## Next Phase Readiness

18-11 (collision stage) and 18-19 (blast) can write the player's push into `state.drift`; the station contact already reflects it once.

## Self-Check: PASSED

- Created files exist: `src/sim/flight/drift.ts`, `tests/sim/flight-drift.test.ts`, `tests/sim/player-braking.oracle.test.ts`, `tests/persistence/restore-drift.test.ts`.
- Commits `15ceec6`, `4d60d1f`, `57c767d`, `6af3a79` are ancestors of HEAD.

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-19*

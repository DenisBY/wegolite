---
phase: 03-flight-in-the-lave-system
plan: 02
subsystem: testing / simulation / content
tags:
  - vitest
  - exact-values
  - lave-layout
  - launch-roll
  - input-frame
  - layer-guards

requires:
  - phase: 03-flight-in-the-lave-system
    provides: plan 01's SystemLayout, FlightConfig, launch step, InputFrame and tests/helpers/lave.ts
  - phase: 02-data-pipeline-content-compiler
    provides: generated g0.json Lave record and ships.json catalogue

provides:
  - exact Lave geometry pins (planet/station/sun/beacons, roll rate, dock offset, quaternion)
  - the raw-vector rule proved against the 82,320 m counter-value
  - player/station catalogue pins and both named boundary errors
  - the discriminating launch-roll sign proof (no-roll and counter-rotation both fail)
  - single-InputFrame proof plus extended flight/world purity probes
  - settings and ship-catalogue denial proofs carrying the configured ESLint messages

affects:
  - 03-03 (planet/sun/station fidelity reads the pinned Lave numbers)
  - 03-04 (torus/mass-lock and precision reuse the layout invariants)
  - 03-05 (HUD reads the same beacons and ranges)
  - 03-07 (launch cinematic must reuse the resolved +stationRollRadPerSec sign)
  - 03-09 (settings tsc denial is closed once src/settings exists)

actuals:
  tokens: 9400
  tasks: 2
  commits: 2
  plan_head_before: 5b2d3914dc4cb22c4f7c95ab83a192e0890e6401
  plan_head_after: 0f66a5e793e7bc678966673e738b3221439bee0b

tech-stack:
  added: []
  patterns:
    - exact-value pins with a named counter-value in the assertion message
    - guard probes extended into real subdirectories and cleaned up in finally
    - source-scan proof for a single sim-owned type

key-files:
  created:
    - tests/sim/layout.test.ts
    - tests/content/player-ship.test.ts
    - tests/sim/launch.test.ts
  modified:
    - tests/guards/sim-purity.test.ts
    - tests/guards/content-boundary.test.ts

key-decisions:
  - "The launch-roll sign is +stationRollRadPerSec (the station's world sense), not the literal minus in D-10's Oolite-basis shorthand; the test proves only that sign passes."
  - "The plan's 0.5026548 rad 'doubled counter-rotation' case is a ship counter-rotating at the station rate: the relative motion is doubled. Both that case and the no-roll case are computed from the same relative-angle helper."
  - "ESLint's no-restricted-imports prefixes its configured message with the matched specifier, so the guards assert the configured text as the exact message suffix plus messageId=patternWithCustomMessage."
  - "The second-launch clock check asserts a step-sized advance (<1 s), not exact DT: the clock is ~1.8e11 s, where one ULP is ~3e-5 s."

patterns-established:
  - "A fidelity pin states the wrong implementation's value in the assertion message (82,320 m) so a failure explains itself."
  - "A guard probe is written inside the directory under test (flight/, world/) so the zone glob is proven live rather than assumed."
  - "A single-owner type is proven by a comment-stripped source scan, not by a configuration claim."

requirements-completed:
  - WORLD-01
  - FLGT-01
  - FLGT-03
  - FLGT-08

coverage:
  - id: D1
    description: "Lave's derived geometry is pinned by exact value, including the raw-vector rule, the sun safe-distance loop and both beacons"
    requirement: WORLD-01
    verification:
      - kind: unit
        ref: "tests/sim/layout.test.ts#places the station with the authored (non-normalised) station vector"
        status: pass
      - kind: unit
        ref: "tests/sim/layout.test.ts#pins the nav buoy on the station→planet axis and the witchpoint at the origin"
        status: pass
    human_judgment: false
  - id: D2
    description: "Player/station catalogue values, the derived flight config and both named boundary errors are pinned"
    requirement: FLGT-03
    verification:
      - kind: unit
        ref: "tests/content/player-ship.test.ts#pins the Cobra Mk III player template"
        status: pass
      - kind: unit
        ref: "tests/content/player-ship.test.ts#throws a named FlightConfigError naming a missing thrust field"
        status: pass
    human_judgment: false
  - id: D3
    description: "Launch applies +600 s exactly once, spawns at the dock mouth, and rolls with the slot (sign discriminated)"
    requirement: FLGT-01
    verification:
      - kind: unit
        ref: "tests/sim/launch.test.ts#advances the clock by exactly 600 seconds and increments launchCount once"
        status: pass
      - kind: unit
        ref: "tests/sim/launch.test.ts#rolls with the slot: the world-sense sign is the only one that passes"
        status: pass
    human_judgment: false
  - id: D4
    description: "InputFrame has one owner and the settings/ships denials are proven non-vacuously"
    requirement: FLGT-08
    verification:
      - kind: unit
        ref: "tests/guards/sim-purity.test.ts#declares InputFrame only in src/sim/state.ts"
        status: pass
      - kind: unit
        ref: "tests/guards/content-boundary.test.ts#denies the settings layer by its configured rule message, not a missing module"
        status: pass
      - kind: unit
        ref: "tests/guards/content-boundary.test.ts#denies the ship catalogue by rule message and a real tsc failure"
        status: pass
    human_judgment: false

duration: 7min
completed: 2026-11-03
status: complete
---

# Phase 3 Plan 2: Exactness and Guard Tests Summary

**Lave's geometry, the player/station catalogue, the launch clock and the launch-roll sign are now pinned by assertions a plausible-looking mistake cannot pass, and the single sim-owned `InputFrame` plus the settings/ship-catalogue denials are proven by non-vacuous guards.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-11-03T17:12:08Z
- **Completed:** 2026-11-03T17:19:03Z
- **Tasks:** 2
- **Files modified:** 5 (3 created, 2 extended; 880 insertions)

## Accomplishments

- `tests/sim/layout.test.ts` pins the exact Lave table: planet `(0,0,-452760)` r `41160`, station `(-49474.32, 60752.16, -427652.4)`, station–planet `82273.47605327003`, sun `(-783274.8,-340475.52,-755203.68)` r `84449.095459`, sun–planet `906043.6918859116`, roll `0.12566370614359174` rad/s (50 s period), dock `500.2561`, and the base quaternion mapping local `-Z` to `stationToPlanet`.
- The raw-vector rule is proven, not assumed: the non-normalised distance is asserted and the test states the `82320` m counter-value a normalised implementation would produce, so renormalising `station_vector` fails with an explanatory message.
- Both beacons are pinned: the nav buoy is 10,000 m from the station *along* `stationToPlanet` at radius 10, and the witchpoint is the origin at radius 10; a buoy behind the station fails.
- `tests/content/player-ship.test.ts` pins the Cobra player template (350/32/1/2/20/70), the Coriolis roll/rotation/dock, the derived config (160, 2, 4, 1, 0.5, 175), and the named `FlightConfigError`/`LayoutError` cases.
- `tests/sim/launch.test.ts` pins the exactly-once +600 s clock, the dock-mouth pose at 175 u/s, the 2 s handover, the ignored second launch, and the skip command's app-owned gating.
- The launch-roll sign is discriminated over all 240 fixed steps: the ship's rate equals the station's world rate within `1e-9` and the slot-relative angle stays below `1e-6`; the no-roll (`0.25132741228718347` rad) and counter-rotation (`0.5026548245743669` rad) cases are computed from the same helper and fail the bound.
- The purity guards now probe `src/sim/flight/**` and `src/sim/world/**` with real ESLint and `tsconfig.sim.json` runs, prove `InputFrame` is declared only in `src/sim/state.ts`, prove `src/input/**`/`src/app/**` declare no frame and no `src/sim` file imports the input layer, and prove the settings/ships denials with the configured rule messages plus a real `tsc` failure for ships.

## Task Commits

1. **Task 1: Pin Lave's geometry, the player catalogue values and the launch-roll sign** - `24a2e68` (test)
2. **Task 2: Prove the single sim-owned frame and the extended layer denials** - `0f66a5e` (test)

**Plan metadata:** committed after this summary (docs).

## Files Created/Modified

- `tests/sim/layout.test.ts` — exact Lave positions/distances/rates, raw-vector counter-value, safe-distance loop, beacon pins and finiteness checks.
- `tests/content/player-ship.test.ts` — player/station catalogue pins, derived config and both named errors.
- `tests/sim/launch.test.ts` — +600 exactly once, dock-mouth pose, 2 s handover, skip gating and the sign-discriminating launch-roll proof.
- `tests/guards/sim-purity.test.ts` — flight/world subdirectory probes plus the single-`InputFrame` source scan.
- `tests/guards/content-boundary.test.ts` — settings/ships denial proofs, ESLint JSON message assertions and `finally` cleanup proof.

## Decisions Made

- **Launch-roll sign resolved:** the implemented sign is `+stationRollRadPerSec` (the station's world sense). D-10's `-station roll` is Oolite's authored entity-frame basis; the test passes only for the world-sense sign and fails both the no-roll and counter-rotation cases. Plan 07's cinematic must reuse this sign rather than the literal minus.
- **"Doubled counter-rotation" interpretation:** the plan's `0.5026548245743669` rad figure is the relative angle of a ship counter-rotating at the station rate (the relative motion is doubled). A ship rolling at `+2×rate` in the same direction would only differ by `rate`; the discriminating property is the sign, and both wrong cases are asserted.
- **ESLint message shape:** `no-restricted-imports` reports `'<specifier>' import is restricted from being used by a pattern. <configured message>`. The guards assert the configured text as the exact message suffix and `messageId === "patternWithCustomMessage"`, which is the faithful form of the plan's "exact configured message" requirement.
- **Clock ULP:** at ~1.8e11 s one ULP is ~3e-5 s, so a launching step's clock delta is not exactly `DT`. The second-launch test asserts a positive advance below one second (never a second +600) instead of exact `DT`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] ESLint prefixes its configured `no-restricted-imports` message**
- **Found during:** Task 2 (content-boundary guard)
- **Issue:** The plan required a diagnostic whose `message` is exactly `src/sim must not import the settings layer`. ESLint 10 actually emits `'../settings/schema.js' import is restricted from being used by a pattern. src/sim must not import the settings layer`.
- **Fix:** the guard asserts the configured text as the exact message suffix, plus the matched specifier and `messageId: "patternWithCustomMessage"`; a module-resolution error would carry none of these.
- **Files modified:** `tests/guards/content-boundary.test.ts`
- **Verification:** the settings and ships guard tests pass; the ships probe also fails `tsc -p tsconfig.sim.json` with `TS2339` (never `TS2307`).
- **Committed in:** `0f66a5e`

**2. [Rule 1 - Bug] Exact `DT` clock-delta assertion failed at the real clock magnitude**
- **Found during:** Task 1 (launch clock test)
- **Issue:** `clockSeconds` starts at `2084004 * 86400` (~1.8e11 s); adding `1/120` rounds to a ~3e-5 s ULP, so the observed delta was `0.008331298828125`, not `0.008333333333333333`.
- **Fix:** the second-launch test now asserts the advance is positive and below one second, which still discriminates a second +600 s exactly as intended.
- **Files modified:** `tests/sim/launch.test.ts`
- **Verification:** the focused launch suite is green (6 tests).
- **Committed in:** `24a2e68`

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both are assertion-shape corrections caused by real runtime/tool behaviour; no production source changed and no pinned number was weakened.

## Issues Encountered

- None beyond the two deviations above. The full unit suite (234 tests), `typecheck` and `lint` are green in the container.

## Known Stubs

None — this plan adds tests only.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plans 03–05 can read the pinned Lave numbers and the beacon invariants with confidence; plan 07 must reuse the resolved `+stationRollRadPerSec` launch-roll sign.
- Plan 09 still owns the `tsc` half of the settings denial once `src/settings/**` exists; the guard is structured to add it without reworking the ships half.
- The Phase 1 golden (`tests/golden/kinematic-probe.json`) and cadence hashes are unchanged.

## Self-Check: PASSED

- All five test files exist on disk.
- Commits `24a2e68` and `0f66a5e` are ancestors of `HEAD`.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not modified by this executor.

---

*Phase: 03-flight-in-the-lave-system*
*Completed: 2026-11-03*

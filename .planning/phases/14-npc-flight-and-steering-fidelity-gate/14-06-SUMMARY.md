---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 06
subsystem: testing
tags: [oracle, npc-flight, steering, frame-rate, avoid-collision, proximity, escort, oolite-fidelity, vitest]

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-01's strict fixture schema, reference flight model, navigation behaviours and import guard; plan 14-02's pursuit fixture ids, which the frame-rate rule rows cite
provides:
  - the recorded 1/120 s frame-rate rule (tests/oracles/npc/frame-rate-rule.json) with crossDtTolerance 0.01 rad written and committed first, and 45 audit rows
  - rate-rule.json, a ten-pose 1/60 versus 1/120 grid (20 fixtures, 120 checks)
  - avoid-collision.json (5 fixtures, 57 checks) and escort.json (3 fixtures, 47 checks)
  - the reference proximity rule (d), avoidCollision, resumePostProximityAlert, behaviour_avoid_collision, formation_form_up, performEscort and the leader refresh (b) with the default V pattern
affects: [14-08, 14-09, 14-10, 14-15, 14-19]

actuals:
  tokens: 54600
  tasks: 2
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Slots (b) and (d) of the replay loop are optional ReplayHooks: flight.ts keeps its loud default when no hook is supplied, navigate.ts supplies NAVIGATE_HOOKS through replayAll"
    - "Closed forms are re-derived in the fixture generator and again in the self-test from the fixture's own coordinates; the reference's float32 replay is the expected value only where no closed form exists"

key-files:
  created:
    - tests/oracles/npc/frame-rate-rule.json
    - tests/oracles/npc/fixtures/rate-rule.json
    - tests/oracles/npc/fixtures/avoid-collision.json
    - tests/oracles/npc/fixtures/escort.json
  modified:
    - tests/oracles/npc/reference/navigate.ts
    - tests/oracles/npc/reference/flight.ts
    - tests/oracles/npc/reference.self.test.ts

key-decisions:
  - "crossDtTolerance 0.01 rad was committed (ae0f4c9) before any rate fixture existed; it was not touched afterwards"
  - "No grid pair exceeds the tolerance (largest settled difference 0.002777 rad, pose up-45), so no pair is a divergence row; the only measuredDifference row is the tracking-curve sampling gate (1 tick)"
  - "The trackDestination overshoot limiter is a recorded dt-limiter row, not a divergence: it never binds at 1/120 s for max_flight_roll or max_flight_pitch below 3.84 (all nine in-scope ships), and its one 1/60 s effect (first-update stickRoll -0.3 against -0.35) leaves a settled difference of 0.000439 rad"
  - "The no-leader escort fixture uses maxFlightSpeed 1e-6 because the contract requires a positive speed (the plan's maxFlightSpeed 0 is not expressible); the distance still cannot improve in either float width"

patterns-established:
  - "A fixture check on a limit-cycling quantity (the escort follower hovers at the slowdown boundary) is placed only at ticks whose decision margins to every threshold are at least 3%, asserted when the file is generated"
  - "Prefilter condition of the collision chain asserted in the self-test at every replayed tick from the fixture's own coordinates"

requirements-completed: []
requirements-advanced: [AI-01]

coverage:
  - id: D1
    description: "frame-rate-rule.json: rule text, crossDtTolerance 0.01 stated before measurement, 45 rows (7 rate-times-dt, 2 dt-limiter, 10 accumulator, 5 time-compare, 4 draw, 4 one-shot, 13 out-of-scope), every non-out-of-scope row confirmed by fixture ids that exist in one of the two trees"
    requirement: "AI-01"
    verification:
      - kind: unit
        ref: "tests/oracles/npc/reference.self.test.ts#the recorded frame-rate rule (frame-rate-rule.json)"
        status: pass
    human_judgment: false
  - id: D2
    description: "rate-rule.json: ten poses at dt 1/60 and 1/120, range / desiredRange >= 250 on every tick, first-update sticks and flight rates, settled heading error at 6 s; every pair within crossDtTolerance"
    requirement: "AI-01"
    verification:
      - kind: unit
        ref: "tests/oracles/npc/reference.self.test.ts#the rate-rule grid (rate-rule.json)"
        status: pass
    human_judgment: false
  - id: D3
    description: "avoid-collision.json: head-on alert, entry values and exit; parallel-offset pass at 2.5 r with the closed-form alert tick; negative pass at 2 (r1 + r2); station ahead with the planet body; light ship below 2000 kg"
    requirement: "AI-01"
    verification:
      - kind: unit
        ref: "tests/oracles/npc/reference.self.test.ts#the avoid-collision, proximity and escort fixtures"
        status: pass
    human_judgment: false
  - id: D4
    description: "escort.json: one follower fixture per slot (0 and 1) with the leader refresh, the eta speed rule, the 50% slowdown and frustration, plus the no-leader fixture firing at fround tick 1801"
    requirement: "AI-01"
    verification:
      - kind: unit
        ref: "tests/oracles/npc/reference.self.test.ts#the avoid-collision, proximity and escort fixtures"
        status: pass
    human_judgment: false
  - id: D5
    description: "No expected value comes from Wegolite output, the executor never read src/sim/npc, tolerances come from the oracle's own float32-versus-float64 measurement (process rules, not mechanically checkable)"
    requirement: "AI-01"
    verification: []
    human_judgment: true
    rationale: "The reading rule and the provenance of every expected value are process facts; tests/guards/oracle-independence.test.ts scans only imports and src path literals."

duration: 32min
completed: 2026-11-15
status: complete
plan_head_before: 8416bb4e8d567fb0cd2f07225cc3fc8cd37dc36c
plan_head_after: c93314c20842db41c7e0c0c19e98c8d1a7484d24
---

# Phase 14 Plan 06: Oracle I part 3 Summary

**The recorded 1/120 s frame-rate rule with its cross-step tolerance committed before measurement, a ten-pose 1/60 versus 1/120 grid that agrees within it everywhere, and independent source-cited fixtures and reference code for avoid collision, the proximity zone and escort.**

## Performance

- **Duration:** about 32 min (started about 18:50 UTC, finished 19:25 UTC)
- **Tasks:** 2 of 2 (Task 1 was the `tracer`; its end-to-end verify passed, so expansion followed)
- **Files:** 4 created, 3 modified (about 54,600 tokens of added test code and fixtures)

## Accomplishments

- **Tolerance first.** `frame-rate-rule.json` was committed as `ae0f4c9` with `crossDtTolerance` 0.01 rad, its derivation (dead band acos(0.99999) = 0.004472 rad at the cap, reached for range / desiredRange >= 212.43) and the rule text, before `rate-rule.json` existed or was replayed. Task 2 and the row additions left the value and the text untouched (`rg -c '"crossDtTolerance": 0.01'` is 1; the diff against that commit only appends rows).
- **The grid.** Ten poses at both step sizes, destination 30 km away with desired range 100 m (ratio 300; the two moving poses fly at 150 m/s and stay at 291 or more), compared at 6 s of simulated time (tick 360 at 1/60, tick 720 at 1/120). The self-test replays every tick in both float widths and asserts the ratio is at least 250 throughout and that no event fires. The largest settled difference is **0.002777 rad (up-45)**, then 0.001504 (near-nose), 0.001449 (up-right-45-45), 0.001174 (behind-up-moving) and 0.001013 (small-moving); the other five are below 0.00075, so every pair is inside 0.01 and no pair needed a divergence row. The first-update sticks match across the pair in nine of ten poses; the tenth is the limiter pose (first-update stickRoll -0.3 at 1/60 against -0.35 at 1/120, settled difference 0.000439 rad).
- **Poses chosen away from decisions.** A scan rejected exact-zero elevations (the exact-abeam pose never settles: pitching about the right axis cannot move a destination that lies on that axis) and poses whose float32 and float64 settled values differed by up to 2.4e-3; the kept poses agree to 2e-6 or better.
- **The rule ledger, 45 rows.** 7 rate-times-dt (frame time source, applySticks rates, x4 and x2 multipliers, applyAttitudeChanges, applyThrust, the whole trackDestination grid), 2 dt-limiter (trackDestination and trackPrimaryTarget overshoot limiters), 10 accumulator (fly-to, face, flee, attack fly-to, fly-from, six/twelve, sniper, slow dogfight, evasive action, formation), 5 time-compare (break-off floor fraction, tracking-curve gate, curve evaluation, escort eta rule, curve restart), 4 draw, 4 one-shot (sign-flip damping, escort refresh, proximity pass, avoid entry and exit) and 13 out-of-scope. Every accumulator row names its fround-derived tick (61, 360, 901, 1126, 1201, 1801 or 1, never ceil(seconds x 120)).
- **Reference code.** `navigate.ts` gained `setProximityAlert`, the pair trigger and rule (d) (`proximityRule`), `avoidCollision`, `resumePostProximityAlert`, `behaviour_avoid_collision`, `behaviour_formation_form_up`, `performEscort`, `quatRotateVector`, `coordinatesForEscortPosition` and the leader refresh (b), supplied to the replay loop as `NAVIGATE_HOOKS` by `replayAll`.
- **Self-test.** 111 tests in the file (was 62 plus the 14-06 additions): the rule ledger, the grid, and a block for the avoid and escort fixtures; a deliberate mutation of `PROXIMITY_WARN_DISTANCE2` (16 to 9) failed 12 tests and was reverted.

## Fixture groups

| File | Fixtures | Checks | Oolite citations |
|------|----------|--------|------------------|
| `rate-rule.json` | 20 (10 poses x dt60, dt120) | 120 | ShipEntity.m 9450-9591, 9486-9491, 7018-7065, 5049-5134 |
| `avoid-collision.json` | 5 | 57 | ShipEntity.m 5904-5936, 5938-5958, 5155-5171, 6098-6146, 5131-5133; CollisionRegion.m 243-248, 262-312, 296-312; Universe.h 98-101; Universe.m 6713-6760, 7045-7073, 1541-1547; Entity.m 825-828; OOPlanetEntity.m 119-120 |
| `escort.json` | 3 | 47 | ShipEntity.m 2427-2436, 5002-5047, 9525-9565, 11900-11903, 12029-12044, 2641-2645; ShipEntityAI.m 365-371; oolite-global-prefix.js 165-193 |

Avoid-collision fixtures: `avoid-head-on-alert-entry-and-exit` (alert tick 1096, AVOID_COLLISION and entry values at 1097, destination equals the body's position at 1098, alert clears at 1148, exit and restored values at 1255; observed minimum centre distance 2.03 m, so the fixture promises no clearance), `avoid-parallel-offset-pass-alert-and-entry` (lateral offset 100 = 2.5 r, strictly between 80 and 120; closed-form alert tick 1102, entry at 1103, clear 1140, exit 1274; observed clearance 100.01 m at tick 1126), `avoid-parallel-offset-pass-never-alerts` (offset 160), `avoid-station-ahead-with-planet` (alert tick 1501 at the 2,000 m trigger, entry at 1502 with desiredRange 5000), `avoid-light-ship-never-triggers` (mass 1000, pair trigger holds from tick 203).

Escort fixtures: `escort-slot-0-leader-refresh-eta-rule` (50% slowdown at tick 1, leader-speed branch at 120 to 480), `escort-slot-1-leader-refresh-eta-rule` (set up through `perform FORMATION_FORM_UP`; full-speed branch at 1, 120, 240), `escort-no-leader-frustration-fires` (event at tick 1801).

## Frame-rate rule rows recorded as divergences

One: **tracking-curve sampling gate** (`ShipEntity.m:5444-5449`), `measuredDifference` 1 tick. Oolite's `universal_time` is a double sum of `delta_t` (`Universe.m:6456`): from a base of 0 the gate opens after 60 steps (elapsed 0.5000000000000007 s); from a base of 1000.0 after 61 (0.49999999999954525 s after 60 steps, 0.508333 s after 61); a base of 12345.678 also gives 61. The self-test reproduces both numbers. The rule's fixed 60 is one of Oolite's two values.

No pair of the rate grid is a divergence (all within crossDtTolerance), and no site row needed a measured difference otherwise. The overshoot limiter is explained, not hidden: see the key decisions.

## Collision-chain prefilter divergence (for plan 14-19)

Rule (d) has no collision-chain prefilter, as contract item 4 (d) records. It matters only for a pair of unequal radii far from the planet, where Oolite can skip an alert the plain trigger raises; it never affects a pair of equal radii (the trigger implies the interval overlap). **Every fixture of this plan meets the prefilter condition**:

| Fixture | Condition |
|---------|-----------|
| head-on, parallel offset, negative pass (radii 40 and 40) | equal radii, so the trigger implies the overlap |
| light ship (radii 40 and 40) | equal radii; no alert anyway (mass below 2000) |
| station ahead with the planet body | self's and the station's +-2 x radius intervals lie inside the planet's +-2 R = +-82,320 interval on every axis at every replayed tick (asserted from the fixture's own coordinates: planet radius 41,160 at the station plus 2R along (0.6, 0.64, 0.48)), so every entity is chained and the 2,000 m pair trigger is Oolite's rule |
| the three escort fixtures | the formation point is 670 m from the leader, outside the 400 m trigger; no alert is raised |

Other recorded rule (d) differences carried from plan 14-01: ascending-id visiting order instead of collision-chain order, and `collisionExceptedFor` is not modelled.

## Task Commits

1. **Task 1 (tracer), part 1: the tolerance first** - `ae0f4c9` (test): `frame-rate-rule.json` with `crossDtTolerance` and no rate fixture anywhere in the tree.
2. **Task 1, part 2: grid, rows and self-test** - `172b667` (test)
3. **Task 2: avoid-collision, proximity and escort oracle** - `c93314c` (test)

**Plan metadata:** the docs commit that carries this file, STATE.md, ROADMAP.md.

## Verification (run in Docker)

- `docker compose run --rm test npx vitest run tests/oracles/npc tests/guards/oracle-independence.test.ts`: 3 files, 247 tests, 0 skipped, pass (guard 10, pursuit 126, reference self-test 111).
- `docker compose run --rm lint` (eslint plus prettier over the repository) and `docker compose run --rm typecheck`: clean.
- Acceptance greps: `rg -c '"rate-' rate-rule.json` is 20 (>= 18); `rg -c '"crossDtTolerance": 0.01' frame-rate-rule.json` is 1; `ls tests/oracles/npc/fixtures/*.json | wc -l` is 8; `"escortSlot": 1` appears once and `"escortSlot": 0` twice (slot-0 follower and the no-leader fixture); `avoid-collision.json` holds one station and one planet body; the tracking-curve row carries `measuredDifference` 1.
- `docker compose run --rm test` (full suite with coverage thresholds), run after the Task 2 commit: exit code 0. The test and coverage tail was all that was captured, so no file or test counts are recorded for this run.
- No `verify` was run (tests-only plan, owner gate policy).

## Decisions Made

- See the key decisions above. Further choices the plan left open: the reference's rule (d) and the leader refresh are plugged into `replayWith` as optional `ReplayHooks` (default behaviour unchanged for any caller that passes none); a fixture's follower fixtures start 1,200 m (slot 0) and 2,000 m (slot 1) behind their formation point so that between them they cover all three eta-rule branches; the no-leader fixture's ownerId is a dangling 999, equivalent to a dead owner.

## Deviations from Plan

**1. [Rule 3 - blocking] `flight.ts` is modified although the plan lists only `navigate.ts`**
- **Found during:** Task 2
- **Issue:** slots (b) and (d) are hard-wired functions inside `replayWith` in `flight.ts` (plan 14-01's summary says so), so navigate.ts alone cannot fill them.
- **Fix:** `ReplayHooks` (two optional callbacks) and a `previousCondition` field on `Ship`, plus `up` and `right` on `ReplayBody` (the leader's frame); without hooks the slots behave exactly as before.
- **Files modified:** `tests/oracles/npc/reference/flight.ts`
- **Commit:** `c93314c`

**2. [Rule 3 - blocking] "maxFlightSpeed 0" is not expressible in the no-leader escort fixture**
- **Found during:** Task 2
- **Issue:** the contract requires `stats.maxFlightSpeed` to be positive (plan 14-02 hit the same wall); formation_form_up also sets desired_speed = maxFlightSpeed, so a ship cannot be held at rest with a speed override.
- **Fix:** maxFlightSpeed 1e-6, with the destination (5000, 0, 0) exactly abeam on the right axis: the pitch fallback rotates the ship about that axis, so its motion is perpendicular to the line to the destination and the double distance stays exactly 5000 in both widths (a distance that decreased by even 1e-8 would read as an improvement in float64 against a float32 success_factor, the hazard plan 14-01 recorded). eta is +Infinity at tick 1, never NaN.
- **Files modified:** `tests/oracles/npc/fixtures/escort.json`
- **Commit:** `c93314c`

**3. [Rule 1 - fixture bug found before commit] Exact-abeam and exact-zero-elevation grid poses**
- **Found during:** Task 1 (exploration of the grid)
- **Issue:** an abeam pose (destination on the right axis) never settles (pitching cannot change the angle), and level poses with d_up exactly 0 gave f32 versus f64 settled differences of 2.4e-3, which would have forced a tolerance as large as the cross-step tolerance itself.
- **Fix:** poses perturbed to non-degenerate elevations (for example 0.45 degrees, -4.55 degrees); every kept pose has a float32-versus-float64 settled difference of 2e-6 or less.
- **Commit:** `172b667`

**Total deviations:** 2 blocking-scope adjustments (one file added to the list, one stat value) and 1 fixture correction before commit. **Impact:** none on the plan's scope; every acceptance criterion holds.

## Notes for later plans

- **Plans 14-08 to 14-10 (port):** the reference's rule (d) is documented line by line in `navigate.ts` (`proximityRule`, `setProximityAlert`); the port's runner replays (b) and (d) through its own hooks (plans 14-09, 14-15). The escort fixtures set `self.ownerId` to a body id and a dangling 999 for the no-leader fixture, and use `perform FORMATION_FORM_UP` (`performEscort`: reset frustration only when the behaviour changes).
- **Plan 14-14/14-15:** `resumePostProximityAlert` restarts the tracking curve (`ShipEntity.m:5946`); no avoid fixture carries a primary target, so that restart is not exercised by this oracle (the row cites the intercept aim-point fixture for the curve start itself).
- **Plan 14-19 (fidelity report):** divergences to list from this plan: the one-tick tracking-curve gate; the missing collision-chain prefilter (conditions above); the ascending-id pair order; the escort follower limit cycle at the slowdown boundary, which is Oolite's own behaviour (the reference reproduces it, and the fixtures check only decision-stable ticks); the dt-limiter's non-reach at 1/120 s; Oolite's `delta_t` being the measured frame interval (capped at 0.25 s), so no single conversion is exact.
- **Escort follower limit cycle:** a follower flying at full speed behind a slower leader alternates between the slowdown branch and the eta branch every tick once its eta / 0.51 reaches slowdownTime (about tick 400 for the slot-1 pose and tick 578 for slot 0). Any port check on `desiredSpeed` in that regime is a coin flip against rounding; the oracle deliberately stops short of it.

## Known Stubs

None.

## Threat Flags

None. No network, auth, file-access or schema surface was added; the only file reads are of fixtures inside `tests/oracles`, and the import guard passes over the whole tree.

## Self-Check: PASSED

- All four created files exist; commits `ae0f4c9`, `172b667` and `c93314c` are ancestors of HEAD; the tests, lint and typecheck were re-run after the last edit. The executor never read, listed or grepped anything under `src/sim/npc`.

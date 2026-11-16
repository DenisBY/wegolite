---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 10
subsystem: sim
tags: [npc-flight, steering, track-destination, fly-to-destination, face-destination, frame-rate-rule, oracle, totality-property]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-09's steerShip contract, flight model, oracle runner, manifest and ledger; plan 14-06's rate-rule grid and frame-rate-rule.json; plan 14-01's navigation fixtures
provides:
  - trackDestination(entity, ctx, retreat) returning Oolite's confidence factor (src/sim/npc/track.ts), with rangeToDestination and noteFrustration
  - behaviour_fly_range_from_destination, behaviour_fly_to_destination and behaviour_fly_from_destination (FORMATION_BREAK shares fly-from)
  - behaviour_face_destination
  - the events shipNowFacingDestination and shipAIFrustrated in AI_EVENT_NAMES, and shipAchievedDesiredRange posted by fly-to and fly-from
  - enterBehaviour rows for FLY_RANGE_FROM_DESTINATION and FACE_DESTINATION (frustration 0)
  - the navigation and rate-rule oracle test files, with manifest rows
  - the navigation constants in the ledger
affects: [14-11, 14-12, 14-13, 14-14, 14-15, 14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: ff7532e409bd4be4dfb3c514a96ab9d781bf967f
plan_head_after: 3db5cf72d96b934c38c158805aa9478719464400

actuals:
  tokens: 17500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "Behaviours post Oolite's doScriptEvent names as queued SteerEvents through ctx.emit, never synchronously"
    - "A frame-rate-rule test reads the static manifest and the test files on disk, never a record of another file's run"
    - "Each Wegolite addition to an Oolite line carries a 'Wegolite addition (T-14-16)' comment and a summary entry"

key-files:
  created:
    - src/sim/npc/track.ts
    - src/sim/npc/behaviours/fly-to-destination.ts
    - src/sim/npc/behaviours/face-destination.ts
    - tests/sim/npc/track.test.ts
    - tests/sim/npc/navigation.oracle.test.ts
    - tests/sim/npc/rate-rule.oracle.test.ts
  modified:
    - src/sim/ai/types.ts
    - src/sim/npc/constants.ts
    - src/sim/npc/dispatch.ts
    - src/sim/npc/enter.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/constants.test.ts
    - tests/sim/npc/steering.property.test.ts

key-decisions:
  - "rangeToDestination and noteFrustration live in track.ts (shared by fly-to, fly-from, face and, later, the other behaviours) instead of a separate module"
  - "Fly-to's frustration report floors the counter at 0: a Wegolite addition, because the steering record keeps frustration in [0, MAX_FRUSTRATION] and Oolite's counter can go negative (or -infinity for a vanishing thrust)"
  - "The d_forward clamp into [-1, 1] before any compare is a Wegolite addition, labelled in the code"
  - "Locals eta, slowdownTime and minTurnSpeedFactor stay float64 (only frustration and successFactor are float32 by the contract); every fixture passes with that"

patterns-established:
  - "Behaviour modules take (entity, ctx), write only the steered entity and emit through ctx.emit"
  - "A deliberate one-line mutation of the port is the non-vacuity check (done for the clamp, the damping branch, the 1/60 roll limiter and the frustration floor; all reverted)"

coverage:
  - id: D1
    description: "trackDestination is ported line by line (zero guard (0, 0, -1), max_cos rule, Math.trunc factors, 0.01 pitch fallback, pitching_over, squared confidence in retreat) and total for degenerate geometry"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/track.test.ts#trackDestination (ShipEntity.m:9450-9591)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/rate-rule.oracle.test.ts#tests/oracles/npc/fixtures/rate-rule.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "Fly range from, fly to and fly from (also FORMATION_BREAK) match every fly-to-destination oracle fixture, events and draws included; shipAchievedDesiredRange is posted once, shipAIFrustrated at tick 1801"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/navigation.oracle.test.ts#tests/oracles/npc/fixtures/fly-to-destination.json"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/track.test.ts#behaviour_fly_to_destination (ShipEntity.m:5049-5134)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Face destination matches every face-destination oracle fixture: facing event, frustration escape at tick 901, and the sign-flip damping on ticks 605 to 607"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/navigation.oracle.test.ts#tests/oracles/npc/fixtures/face-destination.json"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/track.test.ts#behaviour_face_destination (ShipEntity.m:4920-4965)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The recorded frame-rate rule holds for trackDestination: all 20 rate- fixtures pass at 1/60 and at 1/120, and every rule row of a ported function is out-of-scope or confirmed by a fixture the static manifest assigns to an existing oracle test file that runs its whole entry"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/rate-rule.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "The navigation behaviours keep steering total over domain-valid records and degenerate geometry (destination at the ship, tiny offset, desired range beyond the range, ship at rest), every posted event is in the closed vocabulary, and the zero relative position steers like a destination along world -Z"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/steering.property.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "The full suite with coverage keeps the src/sim floors; lint and both typecheck projects pass"
    verification:
      - kind: command
        ref: "docker compose run --rm test (183 files, 4304 passed, 10 skipped)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
    human_judgment: false

duration: 36min
completed: 2026-11-15
---

# Phase 14 Plan 10: Navigation steering and the rate-rule oracle Summary

**`trackDestination`, fly to destination (range dispatcher, to, from) and face destination are ported line by line and match every fly-to-destination, face-destination and rate-rule oracle fixture, with their three events posted as queued AI events and the recorded frame-rate rule confirmed at both 1/60 s and 1/120 s.**

## Performance

- **Duration:** about 36 minutes (started about 20:12 UTC, finished about 20:48 UTC)
- **Tasks:** 3 of 3 (Task 1 was the `tracer`; its `<verify>` passed, auto mode is on, so the plan expanded)
- **Files:** 6 created, 7 modified (about 17,500 tokens by chars/4)

## Accomplishments

- **`trackDestination`** (`src/sim/npc/track.ts`): the zero relative position guard is the world vector (0, 0, -1) (Oolite's `relPos.z = 1.0`, 9496, negated by the frame mapping); the max_cos rule with the 0.99999 cap; the three `int factor = sqrt(...)` lines truncate with `Math.trunc` (9526, 9538, 9550); the roll and pitch blocks, the overshoot limiter, the 0.01 pitch fallback and the `pitching_over` update are literal; it sets the sticks, calls `applySticks` and returns the confidence factor (squared in retreat, 0 when negative, 1 when no rate remains). The docking branches are not ported (comment citing lines 9455, 9466, 9568-9575).
- **Fly-to behaviours** (`behaviours/fly-to-destination.ts`): `behaviour_fly_range_from_destination` picks fly-from (raising the desired speed to the maximum) or fly-to and resets frustration; `behaviour_fly_to_destination` keeps the `success_factor` distance memory, the confidence floor 0.2, the ETA and slowdown rules, and the frustration accumulators, every write through `Math.fround`; `behaviour_fly_from_destination` also serves FORMATION_BREAK and retreats through `trackDestination(..., true)` even on the tick it switches to IDLE, as Oolite does.
- **Face destination** (`behaviours/face-destination.ts`): the exact `flightPitch === 0` settle test, the `15 / max_flight_pitch` frustration escape with the `0.5 * max_flight_pitch` kick, and the sign-flip damping, ported literally.
- **Events:** `shipAchievedDesiredRange` (fly-to and fly-from, once, because both switch to IDLE on the same tick), `shipNowFacingDestination` (face) and `shipAIFrustrated` (fly-to and face) are posted through `ctx.emit`; the last two were appended to `AI_EVENT_NAMES`. The plist-only messages (`DESIRED_RANGE_ACHIEVED`, `FACING_DESTINATION`, `FRUSTRATED`) have no consumer and are not posted.
- **Dispatch and entry:** the switch routes the four ids plus FORMATION_BREAK; `enterBehaviour` has rows for FLY_RANGE_FROM_DESTINATION and FACE_DESTINATION that set the behaviour and frustration 0.
- **Ledger:** every number of the new code is a named constant in `constants.ts` with its Oolite line, pinned by `constants.test.ts`.
- **Rate-rule oracle** (`rate-rule.oracle.test.ts`): runs the 20 `rate-` fixtures at their own step size and checks the 11 frame-rate rows of the ported functions against the static manifest and the test files on disk.
- **Property:** the four navigation ids and FORMATION_BREAK join `SWEPT_BEHAVIOURS`, with degenerate geometries and an event-vocabulary check.

## Task Commits

1. **Task 1 (tracer): trackDestination and fly to destination with their queued events** - `9771bc1` (feat)
2. **Task 2: face destination with its event, frustration escape and sign-flip damping** - `761eb70` (feat)
3. **Task 3: rate-rule oracle on the 1/60 versus 1/120 grid and the navigation totality property** - `3db5cf7` (test)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so the tracer's `<verify>` (navigation and flight oracle tests, plus lint and typecheck) was run at the Task 1 commit and passed; `⚡ Tracer verified end-to-end — expanding`.

## Verification (run in Docker)

- Porter rule followed: `track.ts` and the behaviours were written from the cited Oolite lines, `tests/sim/npc/track.test.ts` (hand-derived expectations, 37 cases) passed first, and only then were the oracle fixtures run. Every fixture passed at the first run: 9 fly-to-destination, 6 face-destination, 20 rate-rule. **No oracle dispute**; nothing under `tests/oracles/**` was edited (`git diff ff7532e..HEAD -- tests/oracles tests/acceptance` is empty).
- Non-vacuity (each mutation reverted, `git diff` clean): removing the `d_forward` clamp fails the clamp test; removing the sign-flip damping fails `face-destination-sign-flip-damping` and the unit case; disabling the roll overshoot limiter fails `rate-limiter-dt60`, `rate-near-nose-dt60` and `rate-behind-up-moving-dt60`; removing the frustration floor fails its test.
- `docker compose run --rm test npx vitest run tests/sim/npc`: 7 files, 181 passed.
- `docker compose run --rm lint` (eslint and prettier) and `docker compose run --rm typecheck` (both projects): clean.
- Full `docker compose run --rm test` with coverage: **183 files, 4304 passed, 10 skipped, exit 0**, 168 s; the coverage floors held.
- No `verify`, `verify-full` or browser gate: the plan changes only `src/sim` and tests (gate policy).

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`), beside plan 14-09's

| Measure | After 14-10 | After 14-09 | Floor in `vitest.config.ts` |
|---------|-------------|-------------|-----------------------------|
| lines | 97.43 | 97.18 | 93 |
| statements | 96.38 | 96.10 | 91 |
| functions | 99.59 | 99.58 | 97 |
| branches | 93.82 | 93.44 | 86 |

`src/sim/npc/**` alone: lines 100, statements 100, functions 100, branches 99.55 (one uncovered branch pair in `fly-to-destination.ts`, 96.15% there). No floor failed, so none was touched.

## Decisions Made

- See key-decisions above. Further choices:
  - `trackDestination` returns the confidence as a plain number and the `d_right`, `d_up`, `d_forward` locals are float64; only the two accumulators are float32 (the 14-09 contract), and every fixture passes with that.
  - The shared helpers `rangeToDestination` and `noteFrustration` are exported from `track.ts`, so plan 14-12 and later behaviours import them from one place (no separate `range.ts`).
  - `FORMATION_BREAK` is also in the property sweep (it is routed to fly-from).
  - No CHANGELOG entry: nothing steers a ship in the shipped game yet (plan 14-11 wires it), so there is no user-visible change.

## Wegolite additions and divergences (for plan 14-19's list)

1. **`d_forward` clamp into [-1, 1]** before any compare in `trackDestination`: not an Oolite line (T-14-16), labelled in the code. It matters only for a quaternion a hair off unit length.
2. **Frustration floor at 0 after a fly-to report** (`fly-to-destination.ts`): Oolite's `frustration -= slowdownTime * 5.0` (5127) goes negative whenever `5 * slowdownTime` exceeds the 15 s that fired the report (speed 160, thrust 15 gives about -38), and to -infinity for a vanishing thrust. The steering record's domain is [0, MAX_FRUSTRATION] and the sanitiser would repair a negative value (counted) at the next hash, so the counter is floored at 0 here. The next report in that situation comes after 15 s instead of after the longer relief Oolite's negative value gives. No oracle fixture reaches this case.
3. **`shipAIFrustrated` carries no context argument**; Oolite's `noteFrustration:` passes the behaviour name (2644).
4. **Proximity call sites** (4914-4915, 4962-4963, 5131-5132, 5150-5151) are not ported; each site carries a comment naming plan 14-13.
5. **Docking branches** are not ported (no NPC docks in v2.2, WORLD-09 is unscheduled); `docking_match_rotation` is treated as false, so fly-to and face go to IDLE when done.
6. `eta`, `slowdownTime`, `minTurnSpeedFactor`, `d_*` are float64 where Oolite uses GLfloat.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] A separate hand-derived unit test file**
- **Found during:** Task 1 (porter rule)
- **Issue:** The porter rule allows reading oracle expectations only after the port compiles and passes its own unit tests, and the plan lists none for `trackDestination` and the behaviours.
- **Fix:** Added `tests/sim/npc/track.test.ts` (37 cases, every expectation derived by hand from the cited lines, including a case that fails if the factor is rounded instead of truncated and one for the zero guard).
- **Commits:** `9771bc1`, `761eb70`

**2. [Rule 2 - Missing critical functionality] The frustration floor at 0**
- **Found during:** Task 3 (totality property reasoning)
- **Issue:** See "Wegolite additions" item 2: an Oolite-faithful negative frustration is outside the record's domain and would be repaired and counted by the sanitiser, or become -infinity.
- **Fix:** `Math.max(0, ...)` with a comment, a forcing test and the summary entry.
- **Files modified:** `src/sim/npc/behaviours/fly-to-destination.ts`
- **Commit:** `3db5cf7`

**3. [Rule 3 - Blocking] Navigation constants added to the ledger**
- **Issue:** The ledger's rule is that every steering number lives in `constants.ts` with its Oolite line; the plan's file list did not name `constants.ts` and `constants.test.ts`.
- **Fix:** 24 named constants with citations and pin tests.
- **Commit:** `9771bc1`

**4. [Plan wording] `shipNowFacingDestination` was added to `AI_EVENT_NAMES` in Task 1 together with `shipAIFrustrated`**, as Task 1's action says, although face (its only emitter) lands in Task 2.

**Total deviations:** 3 auto-fixed (2 missing-critical, 1 blocking). **Impact:** none on scope; one extra test file and one labelled floor.

## Authentication Gates

None.

## Issues Encountered

None. No oracle dispute: every fixture passed against the port as ported from the cited lines.

## Known Stubs

None. The proximity call sites are documented slots for plan 14-13, not stubs that block this plan (the proximity alert is always 0 until plan 14-15).

## Threat Flags

None. T-14-16 (NaN from degenerate geometry) is mitigated: the zero guard, the labelled `d_forward` clamp, the frustration floor, `normalizeVec`'s zero-safe result and the property test over degenerate poses. T-14-17 (event flood) is mitigated as planned: fly-to and fly-from post once because they switch to IDLE the same tick; face posts once on facing; a frustration report repeats only after the counter climbs past its threshold again.

## Facts for later plans

- `trackDestination(entity, ctx, retreat)`, `rangeToDestination(entity)` and `noteFrustration(ctx)` are exported from `src/sim/npc/track.ts`. `trackDestination` calls `applySticks` itself and returns the confidence; behaviours that need `trackPrimaryTarget` (plan 14-12) use `Math.trunc` for 9178, 9187 and 9197 as well.
- Behaviours are `behaviourFlyRangeFromDestination`, `behaviourFlyToDestination`, `behaviourFlyFromDestination` (in `behaviours/fly-to-destination.ts`) and `behaviourFaceDestination`; each has a `// <lines>: the proximity alert and avoidCollision: plan 14-13` comment at the site where plan 14-13 inserts `hasProximityAlertIgnoringTarget` then `avoidCollision`.
- `AI_EVENT_NAMES` now ends with `shipNowFacingDestination` and `shipAIFrustrated`; no consumer reads them yet, and `world.ts:506` accepts any name in the list.
- `ORACLE_GROUPS` has rows for `fly-to-destination.json`, `face-destination.json` (both `navigation.oracle.test.ts`) and `rate-rule.json` (`rate-rule.oracle.test.ts`). `rate-rule.oracle.test.ts` has a `PORTED` list of Oolite line ranges; plans 14-12 to 14-15 must append the functions they port so their frame-rate rows are checked too.
- The property sweep takes new ids by adding them to `NAVIGATION` or a sibling list that feeds `SWEPT_BEHAVIOURS`; the generator now has a `geometry` field (`free`, `atShip`, `nearShip`, `insideRange`, `stopped`) and `contextFor` takes an events sink.
- The test pilot's FLY_TO_DESTINATION now has its native behaviour in `steerShip`; plan 14-11 can swap the placeholder integrator. `ShipControl.perform("FLY_TO_DESTINATION")` still uses the default entry row (behaviour set, entry flag cleared, frustration untouched), as Oolite has no `performFlyToDestination` reset.

## Self-Check: PASSED

- Created files exist: the six in key-files.created, plus `14-10-SUMMARY.md`.
- Commits `9771bc1`, `761eb70` and `3db5cf7` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 3` is measured with `git rev-list --count ff7532e..HEAD` before this SUMMARY commit.
- Acceptance: `rg -c shipAIFrustrated src/sim/ai/types.ts` = 1; `test -f src/sim/npc/track.ts` and `test -f tests/sim/npc/rate-rule.oracle.test.ts` succeed; `rg -c shipNowFacingDestination src/sim/npc/behaviours/face-destination.ts` >= 1.

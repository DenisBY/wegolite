---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 12
subsystem: sim
tags: [npc-flight, steering, target-sensing, trackPrimaryTarget, intercept, tracking-curve, player-radius]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-09's steering contract and runner hook slots, 14-10's trackDestination and rate-rule PORTED list, 14-11's steered world step and PLAYER_COLLISION_RADIUS_M, 14-05's BodyView.radius, 14-02's intercept fixtures
provides:
  - target sensing in src/sim/npc/target.ts (targetBody / isValidTarget, rangeToPrimaryTarget, approachAspectToPrimaryTarget, canStillTrackPrimaryTarget, currentAimTolerance, noteLostTargetAndGoIdle)
  - trackPrimaryTarget(entity, ctx, retreat) in src/sim/npc/track.ts, line by line, with the reaction-time aim point
  - the reaction-time tracking curve (src/sim/npc/tracking-curve.ts) restarted by ShipControl.setTarget and started by the world step after the think phase's final drain
  - behaviour_intercept_target (INTERCEPT half) and the performIntercept entry row
  - the step passes PLAYER_COLLISION_RADIUS_M to createWorldView
  - the oracle runner's default afterAssign hook (pending curve start at tick 0) and readable aimPointX|Y|Z
affects: [14-13, 14-14, 14-15, 14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: afded7bdb0e3881159399d93253675ea8fe3b8ee
plan_head_after: 3538e89

actuals:
  tokens: 21650
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Oolite's weak primary-target reference becomes nav.targetId re-read through view.body on every use; a stale id takes the lost-target path, which writes 0"
    - "A write that Oolite does at a moment the AI cannot sample (addTarget: restarting the curve) is left pending by the control and run by the step at the same tick"
    - "A rate-rule row of a ported function may name a fixture of a later plan's file; the file must exist and sit in PENDING_FIXTURE_FILES until its manifest row lands"

key-files:
  created:
    - src/sim/npc/target.ts
    - src/sim/npc/tracking-curve.ts
    - src/sim/npc/behaviours/intercept.ts
    - tests/sim/npc/pursuit.oracle.test.ts
    - tests/sim/npc/target.test.ts
    - tests/sim/npc/tracking-curve.test.ts
  modified:
    - src/sim/npc/track.ts
    - src/sim/npc/constants.ts
    - src/sim/npc/dispatch.ts
    - src/sim/npc/enter.ts
    - src/sim/world/step.ts
    - src/sim/world/control-impl.ts
    - tests/sim/npc/oracle-runner.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/rate-rule.oracle.test.ts
    - tests/sim/npc/steering.property.test.ts
    - tests/sim/npc/constants.test.ts
    - tests/sim/npc/step-integration.test.ts
    - tests/sim/world/control.test.ts

key-decisions:
  - "steer.jink is stored in Wegolite's frame (Oolite's with z negated, as the oracle runner reads it back), so trackPrimaryTarget's retreat offset uses Oolite's jink.z = -steer.jink.z with the target's Wegolite world right, up and forward; plan 14-13's setEvasiveJink must store -z"
  - "startPendingTrackingCurves takes a getView thunk instead of a view, so the step builds no view when no ship has a pending start (the plan's wording 'building the view lazily'); it starts curves only for ships with an AI, so inert ships' hashes do not move"
  - "A ship whose curve is not started (count 0) aims at the target's own position in calculateTargetPosition, a guard only: steerShip starts a pending curve first"

patterns-established:
  - "Target helpers take (entity, ctx) or (entity, view); the view answers only live ids of this world (T-14-21)"
  - "Each deliberate one-line mutation of the port (Math.trunc to Math.round, the 60-tick gate to 61, unsigned ticks) was run and reverted as the non-vacuity check"

coverage:
  - id: D1
    description: "Target validity follows isValidTarget and primaryTarget: not the ship itself, view returns a body that is not planet or sun; range subtracts both radii and is 0 for no target; aspect is 0 for coincident centres; a target beyond 1.25 scanner ranges is lost"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/target.test.ts#targetBody, range and aspect, canStillTrackPrimaryTarget"
        status: pass
    human_judgment: false
  - id: D2
    description: "trackPrimaryTarget matches Oolite: Math.trunc at the three int factor lines, no 0.01 pitch fallback (abeam gives no turn), the pitch-over then overwrite for a target astern, the roll and 0.9 pitch limiters, the deadly-tier min_d and factors, the retreat jink in the target's frame with the z component unscaled, and the lost-target paths with the argument rule"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/target.test.ts#trackPrimaryTarget (ShipEntity.m:9034-9244)"
        status: pass
    human_judgment: false
  - id: D3
    description: "All 9 intercept oracle fixtures pass, including the per-tick shipAchievedDesiredRange, the two events of a gone target in order, the planet and out-of-reach targets, and the aim point at ticks 0, 90, 119, 120, 121 and 180; pursuit.oracle.test.ts asserts it ran its whole manifest entry"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/pursuit.oracle.test.ts#tests/oracles/npc/pursuit/fixtures/intercept.json"
        status: pass
    human_judgment: false
  - id: D4
    description: "setTarget restarts the curve (trackingCount 0, no other field), ignores the actor's own id and a refused value; the step starts the curve after the think phase at the think tick with signed ticks (now - 60, 120, 180), samples at +60 and +120 and never at +59 or +61, with zero repairs"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/world/control.test.ts; tests/sim/npc/tracking-curve.test.ts#through stepWorld"
        status: pass
    human_judgment: false
  - id: D5
    description: "The player's steering radius is the compiled constant: a ship intercepting the player at 1000 m with desired range 900 posts shipAchievedDesiredRange (range 877.3) and with 870 does not"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/step-integration.test.ts#the player's radius in the steering view"
        status: pass
    human_judgment: false
  - id: D6
    description: "INTERCEPT_TARGET stays total over domain-valid records with degenerate poses (coincident, overlapping, far, behind; target removed mid-run, id equal to the ship's own, unknown id, no target, every body kind): no throw, finite aim points, zero repairs"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/steering.property.test.ts#INTERCEPT_TARGET is total with degenerate target poses (plan 14-12)"
        status: pass
    human_judgment: false
  - id: D7
    description: "The full suite with coverage, lint and both typecheck projects pass, and the remote verify gate passes at 3538e89"
    verification:
      - kind: command
        ref: "docker compose run --rm test (187 files, 4417 passed, 10 skipped)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
      - kind: command
        ref: "remote: wegolite-remote-run.sh run --rm verify at 3538e89 (27 browser specs passed, exit 0)"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-11-15
---

# Phase 14 Plan 12: Target sensing, trackPrimaryTarget, intercept and the tracking curve Summary

**A ship given INTERCEPT_TARGET now closes on its target with Oolite's primary-target steering: validity, range, aspect and loss as Oolite reads them, a literal `trackPrimaryTarget`, and a reaction-time tracking curve restarted by `setTarget`, started by the world step at the think tick and sampled every 60 ticks; all nine independent intercept fixtures pass first time.**

## Performance

- **Duration:** about 40 minutes
- **Tasks:** 2 of 2 (Task 1 was the `tracer`; auto mode is on, so its `<verify>` was re-run before expanding and passed)
- **Files:** 6 created, 13 modified (about 21,650 tokens by chars/4 over the realized diff)

## Accomplishments

- **Target sensing** (`src/sim/npc/target.ts`): `targetBody` is `isValidTarget` plus `primaryTarget`'s self check (the id is not the ship's own and `view.body` returns a body that is not a planet or the sun); `rangeToPrimaryTarget` subtracts both radii (0 for no target, 9727); `approachAspectToPrimaryTarget` relies on the zero-safe normalise; `canStillTrackPrimaryTarget` adds the 1.25 x `SCANNER_MAX_RANGE` test; `currentAimTolerance` has `missedShots` fixed at 0 and no sun glare; `noteLostTargetAndGoIdle` sets IDLE, frustration `Math.fround(0)`, clears the target and posts `shipTargetLost`, with `a` only when the target is still a valid ship.
- **`trackPrimaryTarget`** (`track.ts`): ported line by line from 9034-9244: the two lost-target exits, the retreat jink (avoid-collision window, distance scaling, offset in the target's frame), the accuracy-tiered `min_d`/`max_factor`, the on-target early return, the pitch-over, the three truncated factors, the 0.9 pitch limiter. Two quirks the unit tests pin: a target exactly abeam gets no turn command (no 0.01 fallback), and a target dead astern pitches over and then the pitch block overwrites the stick with -0.125 x max pitch.
- **Intercept** (`behaviours/intercept.ts`, `enter.ts`, `dispatch.ts`): posts `shipAchievedDesiredRange` on every update inside the desired range; a gone target posts it and then `shipTargetLost` on the same tick; `performIntercept` sets the behaviour and zeroes frustration.
- **Tracking curve** (`tracking-curve.ts`): `startTrackingCurve` writes four copies with ticks now, now - 60, now - 120, now - 180 (signed, strictly decreasing, so `t1` and `t2` are never 0 and the curve never produces NaN); `updateTrackingCurve` keeps the gate `ticks[0] + 60 > now`; `calculateTargetPosition` evaluates the quadratic through samples 1 to 3 at `(now - ticks[1]) / 120`; `startPendingTrackingCurves` runs the start for ships with a pending one. `ShipControl.setTarget` sets `trackingCount` 0 and ignores the actor's own id; `stepWorld` calls the pending start after the think phase's final drain; `steerShip` has the defensive start and then the sample.
- **Player radius**: `createWorldView(world, player, layout, PLAYER_COLLISION_RADIUS_M)` in `stepWorld`.
- **Runner**: `emptyHooks()` now carries the default `afterAssign` hook (the same `startTrackingCurve` at tick 0) and `readField` supports `aimPointX|Y|Z`.

## Task Commits

1. **Task 1 (tracer): target sensing, trackPrimaryTarget and intercept, with the compiled player radius in the steering view** - `199d3d5` (feat)
2. **Task 2: the reaction-time tracking curve, restarted by setTarget and sampled on the whole-tick clock** - `3538e89` (feat)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so after Task 1 the tracer's `<verify>` (pursuit oracle, view and step tests, plus lint and typecheck) was re-run and passed with the 8 static intercept fixtures; `⚡ Tracer verified end-to-end — expanding`.

## Verification (run in Docker, plus the remote gate)

- Porter rule: `target.ts`, `trackPrimaryTarget` and intercept were written from the cited lines and `tests/sim/npc/target.test.ts` (42 cases, every expectation derived by hand) passed before the oracle fixtures ran; the 8 static fixtures then passed at the first run. For Task 2 the tracking-curve code was run against the aim-point fixture before `tracking-curve.test.ts` was written (the fixture passed at the first run); the unit expectations are the closed form of a quadratic through three samples and the tick arithmetic, not copies of either. **No oracle dispute**; nothing under `tests/oracles/**` or `tests/acceptance/**` changed (`git diff afded7b..HEAD -- tests/oracles tests/acceptance` is empty).
- Non-vacuity (each mutation reverted): `Math.trunc` to `Math.round` in the primary factor fails 6 unit tests of `target.test.ts`; the sampling gate at 61 ticks fails the aim-point fixture and 3 unit tests; unsigned ticks in `startTrackingCurve` (`Math.max(0, ...)`) fails the intercept totality property and 3 intercept fixtures.
- `docker compose run --rm test npx vitest run tests/sim/npc tests/sim/world`: pass.
- Full `docker compose run --rm test` with coverage: **187 files, 4417 passed, 10 skipped, exit 0** (174 s). `docker compose run --rm lint` and `docker compose run --rm typecheck` (both projects): clean.
- **Remote `verify`** (the gate policy for a plan that changes how NPC ships behave in the running game: the `?test=1` shooter now starts a tracking curve when it targets the player): `wegolite-remote-run.sh run --rm verify` at snapshot `3538e89`, exit 0, 27 browser specs passed, 140 s. Not run on this machine.
- Acceptance greps: `rg -U -c 'createWorldView\([^)]*PLAYER_COLLISION_RADIUS_M' src/sim/world/step.ts` = 1; `Math.trunc` in `track.ts` = 4 matches (2 code, 2 comment); `intercept.ts` exists; `shipTargetLost` in `target.ts` = 3; `TRACKING_SAMPLE_TICKS` in `tracking-curve.ts` = 6; `trackingCount` in `control-impl.ts` = 1 code reference; `startPendingTrackingCurves` in `step.ts` = 2.

### The six `int factor` truncation sites

| Oolite line | Plan | Code line that truncates it |
|-------------|------|------------------------------|
| 9526 (roll, d_up > min_d) | 14-10 | `src/sim/npc/track.ts:100`, `stickFactor` (`Math.trunc`), called for the first roll block |
| 9538 (roll, d_up < -min_d) | 14-10 | same helper, second roll block |
| 9550 (pitch) | 14-10 | same helper, pitch block |
| 9178 (roll, d_up > min_d) | 14-12 | `src/sim/npc/track.ts:254`, `primaryFactor` (`Math.trunc`), first roll block of `trackPrimaryTarget` |
| 9187 (roll, d_up < -min_d) | 14-12 | same helper, second roll block |
| 9197 (pitch) | 14-12 | same helper, pitch block |

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`)

| Measure | After 14-12 | After 14-11 | Floor |
|---------|-------------|-------------|-------|
| lines | 97.60 | 97.44 | 93 |
| statements | 96.61 | 96.40 | 91 |
| functions | 99.61 | 99.59 | 97 |
| branches | 94.08 | 93.84 | 86 |

`src/sim/npc/**`: every file 100% lines and functions; `track.ts` branches 97.97 (the other files 100).

## Decisions Made

See key-decisions. Further choices:

- Locals `dRight`, `dUp`, `dForward`, `maxCos`, `distAdjustFactor` stay float64 where Oolite uses GLfloat (the 14-09 contract: only `frustration` and `successFactor` are float32); every fixture passes with that. The `d_forward` clamp into [-1, 1] before any compare is the 14-10 Wegolite addition (T-14-16), labelled in the code.
- The "improve precision when missing" rule (9134-9141) and the `missedShots` divisor of `currentAimTolerance` are not ported as dead branches: with `missedShots` fixed at 0 they cannot bind, and a comment says so.
- No CHANGELOG entry: no ship in normal play has an AI that sets a target and intercepts (the populator spawns inert ships), so nothing user-visible changes.

## Wegolite additions and divergences (for plan 14-19's list)

1. **`shipTargetAcquired`** (`addTarget:`, 8667-8669) is not posted: the name is not in `AI_EVENT_NAMES` and no consumer exists.
2. **`missedShots` is 0** (no NPC fire, CBT-15): `currentAimTolerance` and the precision rule of `trackPrimaryTarget` omit their `missedShots` terms.
3. **Sun glare** (9784-9797) is not modelled: every ship is treated as not sunlit. The weapon-facing terms (9777-9783) never apply (no aft, port or starboard weapon is compiled).
4. **Missiles** take Oolite's `missileTrackPrimaryTarget` (9053-9055); here a missile entity would use the ordinary steering. No missile has an AI in scope.
5. **The retreat branch's `setEvasiveJink:400`** (9096-9098) is not ported here; plan 14-13 inserts it (a comment marks the site). Nothing before flee calls `trackPrimaryTarget` with retreat.
6. **The tracking-curve gate** keeps the frame-rate rule's one-tick divergence (Oolite's double clock opens the gate at 60 or 61 steps depending on the time since launch; here it is a fixed 60).
7. **A ship with an unstarted curve** (count 0, valid target) aims at the target's own position in `calculateTargetPosition`; `steerShip` starts the curve before any behaviour runs, so this is only a guard.
8. **A target set by an AI think and cleared by the lost-target path** leaves the old curve samples (count 4) in the record; `setTarget` restarts it on the next target. Oolite keeps them too.
9. **`setTarget(0)`** clears the target (Wegolite's existing control semantics) and leaves the curve pending; Oolite's `addTarget:nil` does nothing. Not exercised by any in-scope behaviour.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] A separate hand-derived unit test file for the target code**
- **Found during:** Task 1 (porter rule)
- **Issue:** The porter rule allows reading the oracle expectations only after the port compiles and passes its own unit tests, and the plan lists none for `target.ts`, `trackPrimaryTarget` or intercept, nor for the tracking curve.
- **Fix:** Added `tests/sim/npc/target.test.ts` (42 cases) and `tests/sim/npc/tracking-curve.test.ts` (16 cases), every expectation derived by hand from the cited lines (one retreat-jink case uses the geometry worked out in the test comment).
- **Commits:** `199d3d5`, `3538e89`

**2. [Rule 3 - Blocking] The rate-rule oracle test could not accept a row confirmed by a fixture of a later plan**
- **Found during:** Task 1 (adding `trackPrimaryTarget` to `PORTED`)
- **Issue:** The frame-rate row at 9208-9213 names `flee-accuracy-minus-2-draws-nothing-and-turns-away` as a second confirmation; flee's fixture file has no manifest row until plan 14-13, so the test required a manifest row that cannot exist yet. The oracle row cannot be edited.
- **Fix:** `rate-rule.oracle.test.ts` has a `PENDING_FIXTURE_FILES` set (flee, the three attack files, avoid-collision, escort); a row's fixture in one of them only has to exist, and a new test fails if a pending file also has a manifest row, so plans 14-13 to 14-15 must remove their files from the set when they add rows. The first confirmation of that row (the intercept fixture) is still required to be in a manifest row and a test file that runs its whole entry.
- **Files modified:** `tests/sim/npc/rate-rule.oracle.test.ts`
- **Commit:** `199d3d5`

**3. [Rule 2 - Missing critical functionality] `emptyHooks()` carries the default tracking-curve start**
- **Found during:** Task 2
- **Issue:** The plan says to register an `afterAssign` hook; every oracle test file passes `emptyHooks()`, so the hook has to be in the default list for the runner to match contract item 4 everywhere.
- **Fix:** `emptyHooks()` returns `afterAssign: [startPendingCurveHook]` (the same `startTrackingCurve` the step uses) and empty `beforeUpdate` and `afterUpdate`.
- **Files modified:** `tests/sim/npc/oracle-runner.ts`
- **Commit:** `3538e89`

### Plan wording

- **Signature of `startPendingTrackingCurves`:** it takes `getView: () => WorldView`, not a `view`, so the step builds no view when nothing is pending (the plan's own wording). The step's shared lazy view already memoises.
- **Ships with an AI only:** the pending start covers ships with `ai !== null` (the ships the step steers); the runner's hook starts the self ship directly because the runner's ship has no AI component. An inert ship holding a target (none exists in the game) is not started, so no existing hash moves.
- **Task 1's oracle run was a declared subset** (the aim-point fixture, with a named `DEFERRED` set in `pursuit.oracle.test.ts`), as the plan says; Task 2 removed it.

**Total deviations:** 3 auto-fixed (2 missing-critical, 1 blocking). **Impact:** none on scope; two extra test files and one labelled pending set.

## Authentication Gates

None.

## Issues Encountered

None. No oracle dispute: every intercept fixture passed against the port as ported from the cited lines.

## Known Stubs

None. The proximity call site of intercept (3881-3882) and the retreat branch's `setEvasiveJink` are documented slots for plan 14-13, not stubs that block this plan (the proximity alert is always 0 until plan 14-15, and nothing retreats before flee).

## Threat Flags

None. T-14-21 (a stale or forged target id) is mitigated: every target read goes through `view.body` and an unknown, planet, sun or self id takes the lost-target path. T-14-38 (NaN from the curve) is mitigated: the curve is only read after a literal start, the ticks are signed and strictly decreasing, the property asserts finite aim points and zero repairs, and an unsigned-tick mutation fails it. T-14-46 (a ship targeting itself) is mitigated in `setTarget` and `isValidTarget`, with a control case, a unit case and a property mode. T-14-47 (the player's radius from lazily loaded hull data) is mitigated: the step passes `PLAYER_COLLISION_RADIUS_M`, pinned by a step-level test. T-14-SC: no package installed.

## Facts for later plans

- **Imports:** `targetBody(entity, view)`, `rangeToPrimaryTarget`, `approachAspectToPrimaryTarget`, `canStillTrackPrimaryTarget`, `currentAimTolerance(entity)`, `noteLostTargetAndGoIdle(entity, ctx)` from `src/sim/npc/target.ts`; `trackPrimaryTarget(entity, ctx, retreat)` from `track.ts`; `startTrackingCurve(entity, view, now)`, `updateTrackingCurve`, `calculateTargetPosition(entity, view, now)`, `startPendingTrackingCurves(world, getView, tick)` from `tracking-curve.ts`. Plan 14-13's `resumePostProximityAlert` calls `startTrackingCurve(entity, ctx.view, ctx.view.tick)` (5944-5947).
- **Jink frame:** `steer.jink` is stored with z negated (Wegolite's frame, as the runner reads it). `setEvasiveJink` in plan 14-13 must store `-z` for Oolite's `jink.z = z`; `trackPrimaryTarget` reads Oolite's `jink.z` as `-steer.jink.z`. The flee fixtures check `jinkZ` through `toOolite`, so a wrong sign fails there, and the retreat jink of `trackPrimaryTarget` is only checked by the flee fixtures of plan 14-13 (this plan's intercept fixtures never retreat; my unit test pins the geometry by hand).
- **Retreat return value:** with `retreat` true and the ship flying straight away, `trackPrimaryTarget` returns the raw `d_forward` (-1, the on-target early return at 9149 comes before the squaring at 9233). Flee ignores the return value (4838+), so this is harmless there; any caller that multiplies it into a speed must not use retreat.
- **`PENDING_FIXTURE_FILES`** in `rate-rule.oracle.test.ts`: plans 14-13 (flee, avoid-collision), 14-14 (attack-dispatch, attack-close, attack-evade) and 14-15 (escort) remove their files from the set when they add manifest rows; the test fails if a file is in both. `PORTED` already covers 9034-9244, 9718-9810, 8638-8830, 3817-3826, 5412-5489 and `ShipEntityAI.m` 413-417; append what each plan ports.
- **`pursuit.oracle.test.ts`** is the manifest's `PURSUIT_TEST`; later plans add flee and attack rows to `ORACLE_GROUPS` with that test file and the file runs them with no change (it iterates `fixtureFilesFor`).
- **Clock:** `view.tick` is k during update k, both in the runner and in `stepWorld` (the flight step advances `player.tick` before the world step), so the curve's `now` is `ctx.view.tick` in both; the think-time start uses the same tick as the update just before it.
- **View radius for the player** is `PLAYER_COLLISION_RADIUS_M` on every tick in the step; hash parity with and without the hull table is plan 14-15's proof.
- The `?test=1` shooter (`spawnTestShooter`) now starts a tracking curve when it targets the player; the remote `verify` passes with that.

## Self-Check: PASSED

- Created files exist: `src/sim/npc/target.ts`, `src/sim/npc/tracking-curve.ts`, `src/sim/npc/behaviours/intercept.ts`, `tests/sim/npc/pursuit.oracle.test.ts`, `tests/sim/npc/target.test.ts`, `tests/sim/npc/tracking-curve.test.ts`, `14-12-SUMMARY.md`.
- Commits `199d3d5` and `3538e89` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 2` is measured with `git rev-list --count afded7b..HEAD` before this SUMMARY commit (`plan_head_after` is the Task 2 commit).

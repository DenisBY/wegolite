---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 13
subsystem: sim
tags: [npc-flight, steering, avoid-collision, proximity-alert, flee, evasive-action, setEvasiveJink, performFlee]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-09's steering contract and entry-pending rules, 14-10's navigation behaviours and their marked proximity slots, 14-12's target sensing, trackPrimaryTarget with its marked retreat slot, intercept and the tracking curve, 14-05's BodyView.radius, 14-06's flee fixtures
provides:
  - avoidCollision, resumePostProximityAlert, hasProximityAlertIgnoringTarget and proximityAlertBody in src/sim/npc/avoid.ts
  - the proximity call sites in fly range from, fly to, fly from, face and intercept
  - behaviour_flee_target (behaviours/flee.ts) and behaviour_evasive_action for EVASIVE_ACTION and FLEE_EVASIVE_ACTION (behaviours/evasive.ts)
  - setEvasiveJink and evasiveAction in track.ts, and the retreat branch's own setEvasiveJink(400) inserted at the marked site
  - the FLEE_TARGET entry row (guarded no-op, deferred jink and evasive choice)
  - flee.json in the pursuit manifest row; PENDING_FIXTURE_FILES shrunk by flee.json
affects: [14-14, 14-15, 14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: f414bb1d65efbc61f66cff9e0b9c8bfa2d8efe2f
plan_head_after: a9f392a37c650960d1eb967d59fb31d6f47ce4f1

actuals:
  tokens: 21160
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "An alert id is read through ctx.view on every use; an id the view no longer returns (or the ship's own) counts as none and is cleared, as Oolite's proximityAlert clears a dead reference"
    - "A perform whose Oolite guard makes it a no-op changes nothing and clears entryPending (performFlee under FLEE_EVASIVE_ACTION)"
    - "A task's deferred oracle fixtures are named in a DEFERRED set that the next task empties (as plan 14-12 did)"

key-files:
  created:
    - src/sim/npc/avoid.ts
    - src/sim/npc/behaviours/flee.ts
    - src/sim/npc/behaviours/evasive.ts
    - tests/sim/npc/avoid.test.ts
    - tests/sim/npc/flee.test.ts
    - tests/sim/npc/evasive.test.ts
  modified:
    - src/sim/npc/track.ts
    - src/sim/npc/enter.ts
    - src/sim/npc/dispatch.ts
    - src/sim/npc/constants.ts
    - src/sim/npc/behaviours/fly-to-destination.ts
    - src/sim/npc/behaviours/face-destination.ts
    - src/sim/npc/behaviours/intercept.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/pursuit.oracle.test.ts
    - tests/sim/npc/rate-rule.oracle.test.ts
    - tests/sim/npc/steering.property.test.ts
    - tests/sim/npc/constants.test.ts

key-decisions:
  - "The avoid-collision entry saves the VALID primary target's id (0 for none) and the exit restores it verbatim, as Oolite's dictionary round trip does; the exit's startTrackingCurve does nothing when the restored target is no longer valid, so the old curve stays"
  - "A second avoidCollision while a condition is saved overwrites it (Oolite replaces previousCondition at 5915-5917); nothing calls it twice until plan 14-15's behaviour, which must not re-enter"
  - "behaviour_evasive_action carries on after evasiveAction's lost-target path exactly as Oolite's void method does: the frustration restarts at dt, so the hand-over cannot fire the same update"
  - "setEvasiveJink stores -z (plan 14-12's jink frame), via 0 - z so the value is never -0"

patterns-established:
  - "Constants for flee, evasive action and avoid collision live in the ledger (constants.ts) with a pinned row in constants.test.ts, each citing its Oolite line"
  - "Each deliberate one-line mutation (jink z sign, range == 0 safety, the retreat setEvasiveJink, the 0.9995 aspect threshold, the evasive follow-on, the roll agreement window, the evasive alert check) was run against the unit tests and the fixtures and reverted"

coverage:
  - id: D1
    description: "avoidCollision saves behaviour, valid target, desired range, speed and destination, steers for the midpoint with 10 x the other's radius, sets AVOID_COLLISION and pitchingOver; a missile and a ship with no alert do nothing; an alert naming a body the view does not return, or the ship itself, counts as none and is cleared"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/avoid.test.ts#avoidCollision, the alert read, hasProximityAlertIgnoringTarget"
        status: pass
    human_judgment: false
  - id: D2
    description: "resumePostProximityAlert restores the saved condition, restarts the tracking curve at the current tick (four fresh samples, 60-tick spacing), zeroes frustration and clears saved and the alert; with nothing saved it changes nothing"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/avoid.test.ts#resumePostProximityAlert"
        status: pass
    human_judgment: false
  - id: D3
    description: "The five proximity call sites sit where Oolite has them (fly range from before frustration 0, fly to and fly from at the end, face, intercept) and ignore an alert that names the primary target; every navigation, rate-rule and intercept fixture is unchanged without an alert"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/avoid.test.ts#the proximity call sites"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/navigation.oracle.test.ts; tests/sim/npc/pursuit.oracle.test.ts; tests/sim/npc/rate-rule.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D4
    description: "All 10 flee oracle fixtures pass with draws consumed exactly (jink draws, the evasive choice, range 0 as safety, the negative range, frustration decay and the tick-1801 report, a removed target, a target beyond scanner reach); pursuit.oracle.test.ts runs its whole manifest entry"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/pursuit.oracle.test.ts#tests/oracles/npc/pursuit/fixtures/flee.json"
        status: pass
    human_judgment: false
  - id: D5
    description: "performFlee: FLEE_TARGET at once with frustration 0 and a pending entry unless FLEE_EVASIVE_ACTION, where nothing changes and entryPending is cleared; the deferred completion draws the 400 jink (two draws) and, above accuracy 0 with the aspect above 0.9995, one more draw choosing EVASIVE_ACTION (u < 0.15) or FLEE_EVASIVE_ACTION"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/flee.test.ts#performFlee's entry; tests/sim/npc/pursuit.oracle.test.ts#plan 14-13 plain cases"
        status: pass
    human_judgment: false
  - id: D6
    description: "The retreat branch's own setEvasiveJink(400): a ship in FLEE_TARGET with accuracy at least 6, jink.x 0 and a behaviour other than RUNNING_DEFENSE draws two units inside trackPrimaryTarget and ends with Oolite jink z 400; below 6, or with a nonzero jink, nothing is drawn"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/pursuit.oracle.test.ts#plan 14-13 plain cases; tests/sim/npc/flee.test.ts#behaviour_flee_target"
        status: pass
    human_judgment: false
  - id: D7
    description: "Evasive action: the roll is full in the direction already rolling unless the right vectors agree within (-0.3, 0.3), the pitch is full in the direction already pitching; an alert (the target not ignored) takes avoidCollision and returns first; a gone target posts shipTargetLost and goes IDLE; FLEE_EVASIVE_ACTION returns to FLEE_TARGET with a new 400 jink and EVASIVE_ACTION goes to ATTACK_TARGET on update 61 and not on 60"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/evasive.test.ts"
        status: pass
    human_judgment: false
  - id: D8
    description: "FLEE_TARGET, EVASIVE_ACTION and FLEE_EVASIVE_ACTION stay total over domain-valid records with degenerate target poses (coincident, overlapping, far, behind; target removed mid-run, own id, unknown id, none, every body kind), a range of exactly 0 and a negative range; every navigation id, intercept and flee stay total under a forced alert on a live body, on the target, on nothing and on the ship itself, with zero repairs"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/steering.property.test.ts#flee and evasive action are total with degenerate target poses; #a forced proximity alert keeps steering total"
        status: pass
    human_judgment: false
  - id: D9
    description: "The full suite with coverage, lint and both typecheck projects pass; tests/oracles and tests/acceptance are untouched"
    verification:
      - kind: command
        ref: "docker compose run --rm test (190 files, 4512 passed, 10 skipped, exit 0)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
    human_judgment: false

duration: 70min
completed: 2026-11-15
---

# Phase 14 Plan 13: Avoid collision, flee and evasive action Summary

**A native NPC ship now turns away from a proximity alert and resumes its saved task, flees its target with Oolite's retreat jink and its performFlee entry draws, and switches into the evasive behaviours exactly where Oolite does; all ten independent flee fixtures pass first time, with their draws consumed exactly.**

## Performance

- **Duration:** about 70 minutes
- **Tasks:** 3 of 3 (Task 1 was the `tracer`; auto mode is on, so its `<verify>` was re-run before expanding and passed)
- **Files:** 6 created, 12 modified (about 21,160 tokens by chars/4 over the realized diff of `src` and `tests`)

## Accomplishments

- **Avoid-collision entry and exit** (`src/sim/npc/avoid.ts`): `avoidCollision` saves the condition into `steer.saved` (behaviour, the valid primary target or 0, desired range, desired speed, destination), sets the destination to `a + 0.5 (b - a)`, desired range to the other's radius x `PROXIMITY_AVOID_DISTANCE_FACTOR` (10), AVOID_COLLISION and `pitchingOver`; a missile returns first (5909). `resumePostProximityAlert` restores it, restarts the tracking curve at `view.tick`, zeroes frustration and clears `saved` and the alert; with nothing saved it does nothing at all (the alert stays). `proximityAlertBody` reads the id through `view.body` and clears an id that has no live body or is the ship's own (T-14-50).
- **Proximity call sites**: fly range from (before `frustration = 0`, as 4914-4915), fly to (5131-5132), fly from (5150-5151), face (4962-4963) and intercept (3881-3882), each `hasProximityAlertIgnoringTarget(true)` then `avoidCollision`. With no alert nothing changes; the navigation, rate-rule and intercept fixtures pass untouched.
- **setEvasiveJink and the retreat branch** (`track.ts`): two `floor(u * 256) - 128` draws, x then y, pushed 128 from zero, z stored negated (plan 14-12's frame); below accuracy 0 the jink is zero with no draw. The marked site in `trackPrimaryTarget` now calls it when accuracy is at least `COMBAT_AI_FLEES_BETTER`, `jink.x` is 0 and the behaviour is not RUNNING_DEFENSE (9096-9098), before the jink offset, so its draws come first.
- **Flee** (`behaviours/flee.ts`): `range == 0` is safety exactly and a negative range is not; the desired speed is `maxFlightSpeed` inside the desired range and untouched beyond it; frustration relief 0.25 dt, a 15 s counter posting `shipAIFrustrated`, retreat steering through `trackPrimaryTarget`, the lost-target path, and the proximity call (4898-4899) for accuracy at least 0. No afterburner, missile, cascade-mine or turret-fire branch; `REACHED_SAFETY` is plist-only and not posted.
- **performFlee's entry** (`enter.ts`): at once, unless the behaviour is FLEE_EVASIVE_ACTION, FLEE_TARGET with frustration 0 and `entryPending`; under FLEE_EVASIVE_ACTION nothing changes and `entryPending` is cleared. `completeEntry` draws the 400 jink and, above accuracy 0 with `approachAspectToPrimaryTarget > 0.9995`, one more draw: below 0.15 EVASIVE_ACTION, else FLEE_EVASIVE_ACTION.
- **Evasive action** (`behaviours/evasive.ts`, `evasiveAction` in `track.ts`): both ids run `behaviour_evasive_action`: full speed, the alert check (target not ignored) before anything else, `evasiveAction` (sticks start at the current rates, full roll unless the right vectors agree within (-0.3, 0.3), full pitch), then frustration + dt and, past 0.5 s, FLEE_EVASIVE_ACTION draws a new 400 jink and returns to FLEE_TARGET while EVASIVE_ACTION goes to ATTACK_TARGET. No fire call.
- **Manifest**: `flee.json` joined the pursuit row of `ORACLE_GROUPS` and left `PENDING_FIXTURE_FILES`; the PORTED list gained 5904-5958, 9751-9758, 4840-4901, 8980-9001, ShipEntityAI 379-392, 3996-4036 and 9003-9032.

## Task Commits

1. **Task 1 (tracer): the avoid-collision entry and exit with the radius and the curve, and the proximity call sites** - `29d4f0c` (feat)
2. **Task 2: flee with performFlee's entry effects, setEvasiveJink and the retreat branch's own jink** - `900caab` (feat)
3. **Task 3: evasive action for both evasive ids, with the flee and forced-alert totality properties** - `a9f392a` (feat)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so after Task 1 the tracer's `<verify>` (`tests/sim/npc` and `tests/sim/world`, plus typecheck) was re-run and passed; `⚡ Tracer verified end-to-end — expanding`.

## Verification (Docker only)

- Porter rule: `avoid.ts` was ported from the cited lines and `avoid.test.ts` (29 cases) passed before any oracle file was read; `flee.test.ts` (setEvasiveJink, entry, flee: 25 cases) and `evasive.test.ts` (12 cases) were written and passing before `flee.json` was opened and run. All 10 flee fixtures then passed at the first run. **No oracle dispute**; nothing under `tests/oracles/**` or `tests/acceptance/**` changed (`git diff 29d4f0c..HEAD -- tests/oracles tests/acceptance` is empty, and the diff from the plan's base is empty too).
- Non-vacuity (each mutation reverted, the working tree checked identical to the saved copy): jink z stored un-negated fails 10 tests including the first flee fixture; dropping `range === 0` fails the safety unit case and `flee-range-zero-counts-as-safety`; dropping the retreat branch's `setEvasiveJink` fails the plain case and its unit test; lowering the aspect threshold to 0.9 fails the boundary unit case and `flee-accuracy-2-jink-draws-and-aspect-below-threshold`; swapping the FLEE_EVASIVE follow-on, narrowing the roll agreement window and dropping the evasive alert check each fail exactly their unit test (the oracle fixtures do not see these three, see Issues).
- `docker compose run --rm test npx vitest run tests/sim/npc tests/sim/world`: 29 files, 1344 passed, 1 skipped.
- Full `docker compose run --rm test` with coverage: **190 files, 4512 passed, 10 skipped, exit 0** (185 s). `docker compose run --rm lint` and `docker compose run --rm typecheck` (both projects): clean.
- Acceptance greps: `rg -c 'PROXIMITY_AVOID_DISTANCE_FACTOR' src/sim/npc/avoid.ts` = 2; non-comment `avoidCollision(` lines in `fly-to-destination.ts` = 3; `src/sim/npc/behaviours/flee.ts` and `evasive.ts` exist; `rg -c setEvasiveJink src/sim/npc/enter.ts` = 3; non-comment `COMBAT_AI_FLEES_BETTER` lines in `track.ts` = 4.
- **Remote `verify`: not run.** The plan is pure `src/sim` and tests (gate policy: `test`, `lint`, `typecheck`), nothing browser-facing changed, and no ship in the running game gets a different behaviour: the alert id is 0 until plan 14-15's pass, so the new call sites do nothing, and nothing in the game performs FLEE_TARGET yet.

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`)

| Measure | After 14-13 | After 14-12 | Floor |
|---------|-------------|-------------|-------|
| lines | 97.68 | 97.60 | 93 |
| statements | 96.72 | 96.61 | 91 |
| functions | 99.61 | 99.61 | 97 |
| branches | 94.26 | 94.08 | 86 |

`avoid.ts`, `flee.ts` and `evasive.ts` are 100% on every measure.

## Decisions Made

See key-decisions. Further choices:

- **Test split:** the evasive unit cases live in `evasive.test.ts` (not in `flee.test.ts`) so that Task 2's commit contains only what Task 2 ports; the two flee fixtures that branch into an evasive behaviour were a named `DEFERRED` set in Task 2's `pursuit.oracle.test.ts` and are removed in Task 3.
- **No CHANGELOG entry:** nothing in normal play has an AI that flees, evades or raises a proximity alert, so nothing user-visible changes (the same decision as plans 14-11 and 14-12).
- `AVOID_MIDPOINT` is a ledger constant (0.5) so the interpolation fraction is not a bare number in `avoid.ts`.

## Wegolite additions and divergences (for plan 14-19's list)

1. **performFlee's deferred aspect check (recorded divergence, review concern L82@7b15bb3).** The aspect `approachAspectToPrimaryTarget > 0.9995` is read in `completeEntry`, at the start of the ship's next update, one update after Oolite reads it inside `performFlee`. A pose that moves across 0.9995 within that one update can choose differently. The oracle's aspect rows use a static target, where both readings agree. The same deferral applies to the jink draws: they come at the next update, not at the perform call.
2. **Afterburner, missile, cascade-mine and turret-fire branches of flee** (4883-4896) and the evasive behaviour's own `fireMainWeapon:` (4035) are not ported; `canBurn` is false for every ship.
3. **REACHED_SAFETY** is a plist-only AI message and is not posted; a scripted pilot reads the range through the view.
4. **`shipAIFrustrated` carries no context argument** (Oolite passes the behaviour name), as in plan 14-10.
5. **A stale or own-id alert** is cleared on read, as Oolite's `proximityAlert` clears a dead weak reference; an alert naming a planet or the sun is accepted as a body (Oolite's alert only ever names ships; nothing in Wegolite sets one yet).
6. **`avoidCollision` entered twice** overwrites `saved` with the AVOID_COLLISION condition (Oolite does the same); plan 14-15's behaviour must not re-enter it while the alert exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Hand-derived unit tests for the new ports**
- **Found during:** Task 2 (porter rule)
- **Issue:** The porter rule allows reading the oracle only after the port passes its own unit tests; the plan lists `avoid.test.ts` for Task 1 but none for `setEvasiveJink`, the entry row, flee or the evasive behaviour.
- **Fix:** Added `tests/sim/npc/flee.test.ts` and `tests/sim/npc/evasive.test.ts` (every expectation derived by hand from the cited lines), written and passing before the flee fixtures were run.
- **Commits:** `900caab`, `a9f392a`

**2. [Rule 2 - Missing critical functionality] Ledger constants and pins**
- **Found during:** Task 1
- **Issue:** The new Oolite literals (10, 0.5, 0.25, 15, 400, 256, 128, 0.9995, 0.15, 0.3, 0.5) needed named, pinned constants under the plan 14-09 ledger rule.
- **Fix:** Added them to `constants.ts` with a pin table in `constants.test.ts`, each citing its Oolite line.
- **Commit:** `29d4f0c`

### Plan wording

- **Task 1 files:** the plan names `steering.property.test.ts` for the forced-alert case; it now also covers an alert on the target, on nothing and on the ship itself, and a shared `targetTotality` helper replaced the intercept test's inline body (same assertions).
- **Task 2's "declared subset":** realised as a `DEFERRED` set of the two evasive-branch fixtures, removed in Task 3, so the pursuit test again asserts it ran its whole manifest entry.
- **`avoid-collision.json` stays pending:** the plan's task text adds only `flee.json`; the avoid-collision fixtures need `behaviour_avoid_collision`, which plan 14-15 ports, so that file stays in `PENDING_FIXTURE_FILES` (plan 14-12's summary listed it under 14-13 by mistake).

**Total deviations:** 2 auto-fixed (both missing-critical). **Impact:** none on scope; three extra test files' worth of hand-derived cases.

## Authentication Gates

None.

## Issues Encountered

- **The oracle does not exercise the 0.5 s hand-over.** Both evasive fixtures have a horizon of one tick, so the follow-on transitions (FLEE_EVASIVE_ACTION to FLEE_TARGET with a new 400 jink, EVASIVE_ACTION to ATTACK_TARGET, 4021-4028), the alert check at 4013-4016 and the roll-agreement window are covered only by this plan's hand-derived unit tests (update 61 versus 60 through `steerShip`), as the mutation runs show. This is not a dispute (the oracle is right as far as it goes), but plan 14-16's scripted flee answer is the first test that drives the follow-on in a live world.
- No oracle dispute: every flee fixture passed against the port as ported from the cited lines.

## Known Stubs

None. `AVOID_COLLISION` itself still runs the recorded idle fallback in the dispatcher until plan 14-15 ports `behaviour_avoid_collision`; the entry and exit here are complete and tested, and nothing in the running game raises an alert before then.

## Threat Flags

None. T-14-50 (a stale or forged alert id) is mitigated: every alert read goes through `view.body`, an unknown, removed or own id counts as none and is cleared, and the forced-alert property covers a live body, the target, nothing and the ship itself with zero repairs. T-14-22 (a draw from another stream) is mitigated: the only draw source is `ctx.draw`, the actor's own `combat` stream, and every scripted test fails on an unscripted draw. T-14-SC: no package installed.

## Facts for later plans

- **Imports:** `avoidCollision(entity, ctx)`, `resumePostProximityAlert(entity, ctx)`, `hasProximityAlertIgnoringTarget(entity, ctx, ignoreTarget)` and `proximityAlertBody(entity, ctx)` from `src/sim/npc/avoid.ts`; `setEvasiveJink(entity, ctx, z)` and `evasiveAction(entity, ctx)` from `track.ts`; `behaviourFleeTarget`, `behaviourEvasiveAction`. Plan 14-15's `behaviour_avoid_collision` calls `resumePostProximityAlert` (5157-5158 and the clear-alert path) and reads `steer.proximityAlert` through `proximityAlertBody`.
- **Plan 14-14 (attack):** evasive action is ported for both ids; EVASIVE_ACTION hands over to ATTACK_TARGET after 0.5 s, so until attack is ported the dispatcher runs the idle fallback for it. `setEvasiveJink` takes any z (attack uses 1000, `range + COMBAT_JINK_OFFSET - ...`). `trackPrimaryTarget(entity, ctx, true)` now draws two units on a retreating ship of accuracy at least 6 with a zero jink, and nothing else.
- **Plan 14-15:** `PENDING_FIXTURE_FILES` now holds attack-dispatch, attack-close, attack-evade, avoid-collision and escort. `avoid-collision.json` is plan 14-15's (the behaviour), not this plan's. Nothing sets `steer.proximityAlert` yet: the proximity pass of plan 14-15 is the only writer.
- **Plan 14-16:** a scripted flee pilot's `perform("FLEE_TARGET")` takes effect at once (behaviour, frustration 0, `entryPending`) and completes at the ship's next update, drawing two jink units and, with the target aiming straight at it and accuracy above 0, a third. A pilot that performs FLEE_TARGET while the ship is in FLEE_EVASIVE_ACTION changes nothing. The ship only leaves EVASIVE_ACTION or FLEE_EVASIVE_ACTION on update 61 after the entry (frustration is float32); FLEE_EVASIVE_ACTION returns to FLEE_TARGET, EVASIVE_ACTION goes to ATTACK_TARGET.
- **Plan 14-19:** the divergences list above; the PORTED list in `rate-rule.oracle.test.ts` is current to this plan.

## Self-Check: PASSED

- Created files exist: `src/sim/npc/avoid.ts`, `src/sim/npc/behaviours/flee.ts`, `src/sim/npc/behaviours/evasive.ts`, `tests/sim/npc/avoid.test.ts`, `tests/sim/npc/flee.test.ts`, `tests/sim/npc/evasive.test.ts`, `14-13-SUMMARY.md`.
- Commits `29d4f0c`, `900caab` and `a9f392a` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 3` is measured with `git rev-list --count f414bb1..HEAD` before this SUMMARY commit (`plan_head_after` is the Task 3 commit).

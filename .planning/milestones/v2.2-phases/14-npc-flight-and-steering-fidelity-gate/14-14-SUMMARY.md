---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 14
subsystem: sim
tags: [npc-flight, steering, attack, dispatcher, fly-to-target, fly-from-target, six-twelve, sniper, break-off, slow-dogfight, performAttack]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-09's steering contract, entry-pending rules and COMBAT_AI_* tiers, 14-12's target sensing, trackPrimaryTarget and tracking curve, 14-13's avoidCollision, setEvasiveJink, evasive action and the flee entry guard pattern, 14-02's attack fixtures
provides:
  - behaviour_attack_target (behaviours/attack.ts) with weaponRangeOf, aimToleranceOf, targetTargetsSelf, relativeSpeedTo and attackJinkZ
  - attack_fly_to_target, attack_fly_from_target and fly_to_target_six / twelve (behaviours/attack-close.ts)
  - attack_sniper, attack_break_off_target and attack_slow_dogfight (behaviours/attack-evade.ts)
  - the ATTACK_TARGET entry row with its deferred 1250 u + 750 desired-range draw (enter.ts)
  - the attack ledger rows in constants.ts (NO_WEAPON_RANGE and the combat range, jink and weapon-temperature numbers) with pins
  - attack.oracle.test.ts running attack-dispatch.json, attack-close.json and attack-evade.json with a no-fire guard; PENDING_FIXTURE_FILES shrunk by those three files
affects: [14-15, 14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: 382f84b84e26d0c8f1c75d960f23ac95a2975f4f
plan_head_after: 2f3f64fb8306affefe5455a919f0c2c0cc89cfc2

actuals:
  tokens: 32670
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "The dispatcher takes the forward weapon temperature as a third parameter fixed by the caller at NPC_WEAPON_TEMP (0), so the heating and overheated branches are reachable by a table test and not by a ship"
    - "A test-support module (tests/sim/npc/attack-support.ts) builds the steered ship, a target at a stated range and aspect, and a context with scripted draws"
    - "An approach aspect within 1e-12 of 0 is exactly 0 (a quaternion cannot hold an exactly abeam pose, Oolite's basis vectors can)"

key-files:
  created:
    - src/sim/npc/behaviours/attack.ts
    - src/sim/npc/behaviours/attack-close.ts
    - src/sim/npc/behaviours/attack-evade.ts
    - tests/sim/npc/attack.oracle.test.ts
    - tests/sim/npc/attack-dispatch.test.ts
    - tests/sim/npc/attack-close.test.ts
    - tests/sim/npc/attack-evade.test.ts
    - tests/sim/npc/attack-support.ts
  modified:
    - src/sim/npc/constants.ts
    - src/sim/npc/dispatch.ts
    - src/sim/npc/enter.ts
    - src/sim/npc/target.ts
    - tests/sim/npc/constants.test.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/rate-rule.oracle.test.ts
    - tests/sim/npc/steering.property.test.ts

key-decisions:
  - "An unarmed ship's weapon range is NO_WEAPON_RANGE = 0 (the Shuttle), never 32000: fly-from's exit test range > 0.5 x 0 + 15 x jink.x then makes a zero-jink unarmed attacker alternate ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick, stay while jink.x is above 0 until range 15 x jink.x, and return at once for jink.x below 0"
  - "The accuracy >= 9 dodge of fly-to (4721-4729) is not ported: it reads the target's forward and aft weapon types, which BodyView does not carry, so the target counts as unarmed and the dodge never fires from fly-to; fly-from's own dodge (4790-4797, no weapon test) is ported"
  - "Aft, port and starboard weapons are none for every compiled record, so RUNNING_DEFENSE and ATTACK_BROADSIDE are never selected and the dispatcher's last else is unreachable; the weapons-heating branch (4122) and the overheated branch (4095) are reached only through the forced temperature parameter"
  - "targetTargetsSelf(view, targetId, selfId) is false for the player and, for an NPC target, view.ship(targetId)?.targetId === selfId"
  - "The approach aspect snaps a residue under ASPECT_ZERO_SNAP (1e-12) to 0 so Oolite's exactly-abeam poses stay exactly abeam; without it the two oracle rows 'aspect exactly 0 twelve' and 'slow dogfight abeam' cannot both pass, whichever sign the 2.2e-16 residue takes"
  - "The six/twelve relief of frustration is floored at 0 (Oolite lets it go negative; the steering record's domain is [0, MAX_FRUSTRATION])"
  - "The weapon-temperature tiers are NPC_WEAPON_TEMP_READY and _USABLE, not COMBAT_AI_*: constants.test.ts allows the ledger exactly the nine COMBAT_AI_ names of plan 14-09"

patterns-established:
  - "Every ledger number of the attack sub-behaviours is a named constant with its Oolite line and a pin row in constants.test.ts"
  - "A deliberate one-line mutation of the port is the non-vacuity check: NO_WEAPON_RANGE = 32000 failed 10 tests, dropping the 15 x jink.x term of fly-from's exit test failed 2; both were reverted"

coverage:
  - id: D1
    description: "behaviour_attack_target picks the sub-behaviour its cited line selects for every weapon of the Phase 13 laser stats and no weapon, accuracy 6 and 9, each weapon-temperature tier and the targetTargetsSelf reads, with exact draw counts and jink values; an unarmed ship takes fly-from with the jink untouched"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/attack-dispatch.test.ts#behaviour_attack_target: the dispatcher table"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/attack.oracle.test.ts#tests/oracles/npc/pursuit/fixtures/attack-dispatch.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "An unarmed zero-jink attacker alternates ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick; with jink.x = 200 it stays at 1,000 m, with jink.x = -200 it returns at once"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/attack-dispatch.test.ts#an unarmed attacker with zero jink alternates"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/attack.oracle.test.ts#attack-fly-from-unarmed-zero-jink-alternates-every-tick"
        status: pass
    human_judgment: false
  - id: D3
    description: "fly-to, fly-from, six and twelve match the independent oracle and their hand-derived unit cases: speed bands, frustration, the jink draws, the exit test, the six and twelve points, vector-in and the universalID & 14 test"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/attack-close.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/attack.oracle.test.ts#tests/oracles/npc/pursuit/fixtures/attack-close.json"
        status: pass
    human_judgment: false
  - id: D4
    description: "sniper, break-off and slow dogfight match the independent oracle and their unit cases: the 15,000 m bounce, the 0.8 scanner-range test, the evasive-versus-retreat choice, the frustration hand-overs and the aspect bands"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/attack-evade.test.ts"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/attack.oracle.test.ts#tests/oracles/npc/pursuit/fixtures/attack-evade.json"
        status: pass
    human_judgment: false
  - id: D5
    description: "performAttack: ATTACK_TARGET and frustration 0 at once, the desired range 1250 u + 750 drawn at the start of the next update, EVASIVE_ACTION kept when current (a pending entry of the same think cancelled), FLEE_EVASIVE_ACTION not guarded"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/attack-dispatch.test.ts#performAttack"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/attack.oracle.test.ts#attack-perform-draws-desired-range-midpoint"
        status: pass
    human_judgment: false
  - id: D6
    description: "The attack steering never fires and never spends energy: the fire queue is empty and the energy unchanged after every update of every attack fixture (the guard also counts the updates it saw) and after every table row (T-14-24)"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/attack.oracle.test.ts#the no-fire guard saw every update of the fixtures it ran"
        status: pass
    human_judgment: false
  - id: D7
    description: "No stock record reaches an OUT sub-behaviour over a grid of every weapon, accuracy from -5 to 10, ranges, aspects, temperatures and pitching states, and a forced OUT id runs the idle fallback without a draw or an event"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/attack-dispatch.test.ts#the grid: no stock record reaches an OUT sub-behaviour; #a forced OUT id runs the idle fallback"
        status: pass
    human_judgment: false
  - id: D8
    description: "The eight attack ids stay total over domain-valid records with degenerate target poses (coincident, overlapping, far, exactly behind; a target removed mid-run, own id, unknown id, none), a target that aims at the ship, a target 40 m ahead, and a forced proximity alert, with zero repairs"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/steering.property.test.ts#the attack ids are total with degenerate target poses; #a forced proximity alert keeps steering total"
        status: pass
    human_judgment: false
  - id: D9
    description: "The full suite with the src/sim coverage floors, lint and both typecheck projects pass; tests/oracles and tests/acceptance are untouched"
    verification:
      - kind: command
        ref: "docker compose run --rm test (194 files, 4771 passed, 10 skipped, exit 0)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
    human_judgment: false

duration: 40min
completed: 2026-11-15
---

# Phase 14 Plan 14: Attack dispatcher and in-scope sub-behaviours Summary

**A native NPC ship assigned ATTACK_TARGET now picks and flies Oolite's attack sub-behaviours (fly to and from target, six and twelve, sniper, break-off, slow dogfight) without firing; all 60 independent attack fixtures pass with their draws consumed exactly, and the unarmed Shuttle's zero weapon range makes it alternate ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick as Oolite's does.**

## Performance

- **Duration:** about 40 minutes
- **Tasks:** 3 of 3 (Task 1 was the `tracer`; auto mode is on, so its `<verify>` was re-run before expanding and passed)
- **Files:** 8 created, 8 modified (about 32,670 tokens by chars/4 over the realized diff of `src` and `tests`)

## Accomplishments

- **Dispatcher** (`behaviours/attack.ts`): `behaviour_attack_target` for the in-scope branches (4038-4185). The forward weapon's range is the Phase 13 laser range keyed by `stats.forwardWeapon`, or `NO_WEAPON_RANGE` (0) for no weapon; the temperature is a parameter fixed at 0. Unarmed goes to fly-from with the jink left alone (4098-4099). Armed and ready: nearby (under 0.035 x the weapon range) draws the jink pair unless pitching over and picks break-off at accuracy 6 or more, else fly-from; otherwise the jink is zeroed and sniper (weapon range above 12,500 m and range above 12,500 m), six or twelve (accuracy below 0, by the aspect's sign) or fly-to is chosen. Overheated and heating branches (4095-4126) are ported and table-tested.
- **Helpers:** `targetTargetsSelf(view, targetId, selfId)` (false for the player; `view.ship(targetId)?.targetId === selfId` for an NPC target) at the four reads of 3921, 4122, 4658 and 4669; `relativeSpeedTo` (forward x speed for both ships, the target's from its `BodyView`, the player included) and `attackJinkZ`, the argument of both `setEvasiveJink(range + 500 - relativeSpeed / max_flight_pitch)` sites.
- **Close range** (`behaviours/attack-close.ts`): fly-to (the speed bands of 4644-4685, the 3 s frustration with `setEvasiveJink(1000)`, the proximity entry and avoid), fly-from (the three 0.3 draws and their order, the frustration halving, the exit test `range > 0.5 x weaponRange + 15 x jink.x || flightSpeed > (scannerRange - range) x pitch / 6.28`, the accuracy 9 dodge) and six and twelve for both ids (the six point 0.5 x weaponRange behind the target, the twelve point 1,250 m above it, the head-on switch, the vector-in tests with `universalID & 14` on the entity id, and the quirk that an alert on the target runs fly-from).
- **Evasive** (`behaviours/attack-evade.ts`): sniper (15,000 m bounce, `scannerRange x 0.8`, the 3 s frustration), break-off (an alert of any body, the evade-versus-retreat choice by `targetTargetsSelf` and the frustration fraction, the three hand-overs) and slow dogfight (the close-in avoid, the aspect bands, the frustration).
- **Entry** (`enter.ts`): `performAttack`: ATTACK_TARGET and frustration 0 at once and `entryPending`, unless EVASIVE_ACTION is current (nothing changes, the pending flag cleared); `completeEntry` draws `desiredRange = 1250 u + 750`.
- **Ledger** (`constants.ts`): `NO_WEAPON_RANGE` and 60-odd rows with their Oolite lines, each pinned in `constants.test.ts`.
- **Manifest:** `attack-dispatch.json`, `attack-close.json` and `attack-evade.json` joined `ORACLE_GROUPS` (a new `attack.oracle.test.ts`) and left `PENDING_FIXTURE_FILES`; the PORTED list gained 4038-4185, 4611-4799, 4461-4580, 4397-4459, 3886-3994, 8849-8868 and ShipEntityAI 350-357.

## Task Commits

1. **Task 1 (tracer): the attack dispatcher with fly to target and fly from target, from performAttack to the approach and break-away** - `3a02b12` (feat)
2. **Task 2: six and twelve, sniper, break-off and slow dogfight** - `15fb4d3` (feat)
3. **Task 3: the forced-state dispatch table, OUT-branch safety and the attack totality property** - `2f3f64f` (test)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so after Task 1 the tracer's `<verify>` (`attack.oracle.test.ts`, with the rest of `tests/sim/npc` and `tests/sim/world`, plus typecheck and lint) was re-run and passed; `⚡ Tracer verified end-to-end — expanding`.

## Verification (Docker only)

- Porter rule: every port was written from the cited Oolite lines and its hand-derived unit tests (`attack-close.test.ts` 42, `attack-evade.test.ts` 25, `attack-dispatch.test.ts` 66 cases, all written before any attack fixture was opened) passed before `attack-*.json` was read and run. At the first oracle run 61 of 62 fixtures passed; the one disagreement is described under Deviations (the exactly-abeam aspect) and is a numeric-representation matter, not an oracle error. Nothing under `tests/oracles/**` or `tests/acceptance/**` changed (`git diff 382f84b..HEAD -- tests/oracles tests/acceptance` is empty).
- Non-vacuity (each mutation reverted, `git diff -- src` empty): `NO_WEAPON_RANGE = 32000` failed 10 tests (the unarmed rows, the alternation and the oracle fixtures); replacing `15 x jink.x` by `0` in fly-from's exit test failed 2.
- `docker compose run --rm test npx vitest run tests/sim/npc tests/sim/world`: pass at each task commit (Task 1: 31 files, 1469 passed; Task 2: 32 files, 1535 passed).
- Full `docker compose run --rm test` with coverage, run after Task 3's tests: **194 files, 4771 passed, 10 skipped, exit 0** (about 4 min). `docker compose run --rm lint` and `docker compose run --rm typecheck` (both projects): clean after each task.
- Acceptance greps: `src/sim/npc/behaviours/attack.ts` and `attack-evade.ts` and `tests/sim/npc/attack-dispatch.test.ts` exist; `rg -c COMBAT_IN_RANGE_FACTOR src/sim/npc/constants.ts` = 2; `rg -c NO_WEAPON_RANGE src/sim/npc/constants.ts` = 1.
- **Remote `verify`: not run.** The plan is pure `src/sim` and tests (gate policy: `test`, `lint`, `typecheck`), nothing browser-facing changed, and no ship in the running game gets a different behaviour: nothing outside `src/sim/npc` performs an attack id (`rg ATTACK_TARGET src` finds only the id list), so every attack id still reaches the dispatcher only from tests until plans 14-16 and 14-17 hand a pilot the command.

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`)

| Measure | After 14-14 | After 14-13 | Floor |
|---------|-------------|-------------|-------|
| lines | 97.75 | 97.68 | 93 |
| statements | 96.88 | 96.72 | 91 |
| functions | 99.62 | 99.61 | 97 |
| branches | 94.66 | 94.26 | 86 |

`attack.ts` is 100% on every measure; the uncovered lines of `attack-close.ts` (375-376) and `attack-evade.ts` (82-83, 218-219) are the defensive lost-target returns after a `canStillTrackPrimaryTarget` that already guarantees a target (Oolite's `[rawTarget isShip]` re-check).

## Decisions Made

See key-decisions. Further choices:

- **Test files beyond the plan's list:** `attack-close.test.ts`, `attack-evade.test.ts` and `attack-support.ts` hold the hand-derived unit cases (the porter rule needs them before the oracle is read); the plan lists only `attack.oracle.test.ts`, `attack-dispatch.test.ts`, `constants.test.ts` and the property test.
- **No CHANGELOG entry:** no ship in normal play performs an attack id yet, so nothing user-visible changes (the same decision as plans 14-11 to 14-13).
- **The Task 1 declared subset** was a `DEFERRED` regular expression in `attack.oracle.test.ts` (six, twelve) plus the `attack-evade.json` row held back; Task 2 removed both, so the oracle test again asserts it ran its whole manifest entry.

## Wegolite additions and divergences (for plan 14-19's list)

1. **Aspect snap (ASPECT_ZERO_SNAP = 1e-12).** `approachAspectToPrimaryTarget` returns exactly 0 for a residue under 1e-12. Oolite holds an exactly abeam pose in exact basis vectors; a quaternion rotation of a quarter turn leaves 2.2e-16 whose sign depends on rounding, and the attack code compares the aspect with 0 (4100, 3977, 4164). Two oracle rows need exact 0 from opposite sides, so no single sign passes both. Changed in `target.ts`; no other fixture moved.
2. **Float literal factors as doubles.** `COMBAT_IN_RANGE_FACTOR` and its siblings are C float literals and `factor * weaponRange` is a float product; here they are doubles, so a range within about one part in 10^7 of a threshold can compare differently.
3. **Accuracy 9 dodge of fly-to (4721-4729) not ported** (the target's weapon types are not in the view); stock accuracy is below 5, so it needs a forged accuracy anyway. Fly-from's dodge is ported.
4. **No aft, port, starboard or turret weapons, no sub-entity weapon lookup:** RUNNING_DEFENSE and ATTACK_BROADSIDE are unreachable, the dispatcher's last `else` (4177-4180) is dropped as unreachable, the turret branches of twelve and the dispatcher are out.
5. **Weapon temperature 0:** the hot-weapon returns to ATTACK_TARGET in fly-to, sniper and six (4713-4720, 4456-4458, 4577-4579) never fire; the dispatcher's heating and overheated branches run only for a forced temperature.
6. **Six's frustration relief is floored at 0** (Oolite's can go negative, by up to 0.75 dt).
7. **`attackJinkZ`** has no division by a zero pitch rate (the quotient is 0) and clamps to the entity magnitude bound; Oolite would produce infinity or NaN.
8. **`universalID & 14`** is evaluated on the Wegolite entity id; **`isThargoid`** is false; **velocity** is forward x flight speed for both ships.
9. **The player never targets an NPC** (`targetTargetsSelf` is false for it), as recorded in the plan.
10. **`shipAIFrustrated` carries no behaviour name**, as in plans 14-10 and 14-13.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The exactly-abeam aspect read as a 2.2e-16 residue**
- **Found during:** Task 2 (first oracle run: `attack-dispatch-accuracy-below-0-aspect-exactly-0-twelve`, then `attack-slow-dogfight-abeam-slows-to-a-tenth` after a runner experiment)
- **Issue:** the oracle poses give an exact basis frame (aspect exactly 0, so `aspect < 0` and `aspect > 0` are both false); the port reads the target's orientation as a quaternion, and `rotate` of a quarter turn is `2 y^2 - 1`, never 0 in doubles. The two rows need exact 0 from opposite sides, so changing the sign of the residue (for example by snapping the runner's quaternion, which I tried and reverted) only moved the failure from one row to the other. Not an oracle dispute: the oracle is right per `ShipEntity.m`.
- **Fix:** `ASPECT_ZERO_SNAP` in `approachAspectToPrimaryTarget`, pinned by a unit case.
- **Files modified:** `src/sim/npc/target.ts`, `src/sim/npc/constants.ts`, `tests/sim/npc/constants.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`
- **Commit:** `3a02b12`

**2. [Rule 1 - Bug] Six's frustration relief could leave the record's domain**
- **Found during:** Task 3 (the totality property: `sanitizeEntity` repaired a frustration of -0.0021 after a six update)
- **Issue:** `frustration -= dt x 0.75` (4562) on a counter below 0.75 dt goes negative; the steering record keeps frustration in [0, MAX_FRUSTRATION].
- **Fix:** a floor at 0 with the reason in a comment (a Wegolite addition, divergence 6), covered by a unit case.
- **Files modified:** `src/sim/npc/behaviours/attack-close.ts`, `tests/sim/npc/attack-close.test.ts`
- **Commit:** `15fb4d3`

**3. [Rule 3 - Blocking] The weapon-temperature tiers cannot be named COMBAT_AI_***
- **Found during:** Task 1
- **Issue:** plan 14-09's summary said plan 14-14 adds `COMBAT_AI_WEAPON_TEMP_READY` and `_USABLE`, but `constants.test.ts` asserts the ledger exports exactly the nine `COMBAT_AI_` names.
- **Fix:** `NPC_WEAPON_TEMP_READY` and `NPC_WEAPON_TEMP_USABLE` (and `NPC_MAX_WEAPON_TEMP`, `NPC_WEAPON_TEMP`), pinned.
- **Commit:** `3a02b12`

**4. [Rule 2 - Missing critical functionality] Hand-derived unit tests for the ports; the unresolved-accuracy property excludes the attack ids**
- **Found during:** Tasks 1 to 3
- **Issue:** the porter rule needs unit tests before the oracle is read, and the plan lists none for the sub-behaviours before Task 3; the existing "an accuracy still unresolved is drawn once" property assumed no draws beyond the accuracy and the tumble sticks, which the attack ids' jink and desired-range draws break (as flee's did).
- **Fix:** `attack-close.test.ts`, `attack-evade.test.ts` and `attack-support.ts`; the property excludes `ATTACK` as it excludes `FLIGHT`, and the attack draws are counted in their own tests.
- **Commits:** `3a02b12`, `15fb4d3`, `2f3f64f`

### Plan wording

- **Task 2 "attack-evade fixtures":** the plan names `attack-evade.json` for Task 2; it also holds the evasive-action, flee-evasive-action and fly-from accuracy 9 rows, which run on code of plans 14-13 and this plan; all pass.
- **Task 1 files:** `target.ts`, `attack-support.ts`, `attack-close.test.ts` and `rate-rule.oracle.test.ts` are touched beyond the plan's file list (see deviations 1 and 4 and the PORTED and PENDING updates the plan's project rules require).

**Total deviations:** 4 auto-fixed (2 bugs, 1 blocking, 1 missing-critical). **Impact:** none on scope; the aspect snap is the one change to a function of an earlier plan.

## Authentication Gates

None.

## Issues Encountered

- **The 14-02 fixture `attack-dispatch-accuracy-below-0-aspect-exactly-0-twelve` and `attack-slow-dogfight-abeam-slows-to-a-tenth` disagree for any quaternion pose** unless the aspect is snapped (see deviation 1). This is a representation point, not an oracle dispute; an owner who prefers not to snap would have to accept one of the two rows failing.
- No other oracle dispute: every other attack fixture passed against the port as ported from the cited lines.

## Known Stubs

None. Seven behaviour ids remain on the recorded idle fallback by design (RUNNING_DEFENSE, ATTACK_BROADSIDE and its two sides, CLOSE_TO_BROADSIDE_RANGE, CLOSE_WITH_TARGET, ATTACK_MINING_TARGET); AVOID_COLLISION is plan 14-15's.

## Threat Flags

None. T-14-23 (a forged accuracy) is mitigated: every branch accuracy can open is ported and table-tested (accuracy 6, 9 and the extremes) and OUT ids fall back safely. T-14-24 (steering that fires) is mitigated and asserted: the fire queue is empty and the energy unchanged after every attack-fixture update and every table row. T-14-SC: no package installed.

## Facts for later plans

- **Imports:** `behaviourAttackTarget(entity, ctx, forwardWeaponTemp?)`, `weaponRangeOf(stats)`, `aimToleranceOf(accuracy)`, `targetTargetsSelf(view, targetId, selfId)`, `relativeSpeedTo(entity, target)` and `attackJinkZ(entity, ctx, range, target)` from `src/sim/npc/behaviours/attack.ts`; `behaviourAttackFlyToTarget`, `behaviourAttackFlyFromTarget`, `behaviourFlyToTargetSix` from `attack-close.ts`; `behaviourAttackSniper`, `behaviourAttackBreakOffTarget`, `behaviourAttackSlowDogfight` from `attack-evade.ts`. `tests/sim/npc/attack-support.ts` (`ship`, `target`, `facingAspect`, `harness`, `statsWith`, `worldOf`) is reusable for plans 14-15 to 14-17 tests.
- **Plan 14-15:** `behaviour_avoid_collision` must restore through `resumePostProximityAlert`. The attack sub-behaviours already enter `avoidCollision` (fly-to and slow dogfight return after it, fly-from and six call it at the end or before returning), and fly-to under six runs fly-from when the alert is the target. `PENDING_FIXTURE_FILES` now holds only `avoid-collision.json` and `escort.json`.
- **Plans 14-16 and 14-17:** `perform("ATTACK_TARGET")` sets the behaviour and frustration at once and draws the desired range at the ship's next update (before the dispatcher runs in that update, which then runs the dispatch). Use ARMED attackers: an unarmed one alternates ATTACK_TARGET and ATTACK_FLY_FROM_TARGET every tick (zero jink). A default armed ship (pulse laser, accuracy below 6, temperature 0) at 5,000 m picks FLY_TO_TARGET; nearby (under 437.5 m for a pulse laser) it picks FLY_FROM_TARGET (accuracy below 6) or BREAK_OFF_TARGET (6 or more) and draws two jink units; a beam or military laser beyond 12,500 m picks SNIPER, which hands back inside 15,000 m. Stock accuracy is below 5, so EVASIVE_ACTION comes only from the evasive follow-ons and flee, never from the dispatcher at temperature 0.
- **Plan 14-19:** the divergence list above; the PORTED list in `rate-rule.oracle.test.ts` is current to this plan.

## Self-Check: PASSED

- Created files exist: all 8 in key-files.created, plus `14-14-SUMMARY.md`.
- Commits `3a02b12`, `15fb4d3` and `2f3f64f` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 3` is measured with `git rev-list --count 382f84b..HEAD` before this SUMMARY commit (`plan_head_after` is the Task 3 commit); `git diff 382f84b..HEAD -- tests/oracles tests/acceptance` is empty.

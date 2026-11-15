---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 16
subsystem: sim
tags: [npc-flight, test-pilot, flight-script, spawner, scenario, cadence, replay]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-09's behaviour entry (perform), 14-10 to 14-15's native behaviours, the world-step steering and the proximity pass, 14-07's frozen thresholds and script ranges
provides:
  - the test-only "flight-script" AI key, createFlightScriptAi and FLIGHT_SCRIPT (src/sim/ai/pilots/flight-script.ts)
  - scriptGoalMetric, the one goal-metric definition of the pilot, the scenario and plan 14-17's detectors
  - spawnTestFlyers, FLYER_SCRIPT_RANGES, TEST_FLYER_DISTANCE and FlyerRecords (src/sim/ai/test-spawn.ts)
  - tests/helpers/flyer-records.ts (the shuttle, viper and adder records)
  - the flyers scenario (60 s in the Lave world of epoch 1) and the 30, 60 and 144 Hz replay with flyers
affects: [14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [WORLD-07, AI-01]

plan_head_before: 78204dcd11036ee5f3a1d469d8190136e4260d0a
plan_head_after: 4fb6a5f83a910ad1671134d13e6d0f4fe458f577

actuals:
  tokens: 17350
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A scripted AI module is a switch over a string param, never a module-level table: the AI zone's AI_MODULE_STATE_BANS forbid a top-level array or object const, so the attack family and the script list are switch statements"
    - "A live-world scenario takes every bound from a script's own goal or a closed-form geometry and observes the port only through the view and the entity's own fields"

key-files:
  created:
    - src/sim/ai/pilots/flight-script.ts
    - tests/helpers/flyer-records.ts
    - tests/sim/ai/flight-script.test.ts
    - tests/sim/npc/flyers.scenario.test.ts
    - tests/sim/npc/npc-cadence.test.ts
  modified:
    - src/sim/ai/types.ts
    - src/sim/ai/registry.ts
    - src/sim/ai/test-spawn.ts
    - tests/sim/ai/test-spawn.test.ts

key-decisions:
  - "spawnTestFlyers takes the station centre as a sixth parameter (station: Vec3): the plan's five-argument signature cannot orient the station flyer's nose on the station centre, because neither the world (its statics hold only a layout key) nor the player's pose knows where the station is"
  - "The pilot draws no random number and calls no scheduleWake: it thinks every THINK_INTERVAL_TICKS (15) ticks, which is enough for the flee goal check and the flee re-issue"
  - "scriptGoalMetric returns number | undefined, undefined for a script with no metric or a body the view does not hold (Oolite's rangeToPrimaryTarget returns 0 there, which would read as 'in range')"
  - "The frustrated param counts every shipAIFrustrated in every phase, the raw count plan 14-17's detectors diff per tick while a goal is unmet"
  - "The flyers scenario sets the fleer's accuracy to 3 after the spawn, because a drawn accuracy at or below 0 draws no jink and never reads the approach aspect, which would make the 'no evasive draw at aspect cos 30 degrees' assertion vacuous"

patterns-established:
  - "Non-vacuity mutations: reversing the station flyer's orientation failed its spawner test (the scenario still passed, the station flyer simply turns round, so the orientation is pinned at unit level); disabling the flee re-issue failed its pilot test; both reverted"

coverage:
  - id: D1
    description: "The flight-script pilot issues exactly its script's ShipControl calls once on its first think (station, intercept, flee, attack, escort, face), nothing afterwards except the flee goal check and the flee re-issue, goes done with IDLE at desired speed 0 on each goal event and on an unknown script or a missing station, counts every shipAIFrustrated, draws no random number and schedules no wake"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/ai/flight-script.test.ts#the first think of each script; #the flee script after its first think; #the goal events"
        status: pass
    human_judgment: false
  - id: D2
    description: "scriptGoalMetric is the centre distance to the station centre for the station script and the centre distance minus both radii for intercept and flee, undefined otherwise; the flee goal is met strictly beyond its range"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/ai/flight-script.test.ts#scriptGoalMetric; #the flee script after its first think"
        status: pass
    human_judgment: false
  - id: D3
    description: "spawnTestFlyers spawns the Shuttle, Viper and Adder 3,000 m from the player at 90 degrees left, 30 degrees left and 30 degrees right of the nose, the station flyer's nose on the station centre within 1e-9 and the other two along the player's nose, each at its compiled maximum speed; it refuses a bad scan class and a world without room for three without spawning anything; a refusal after a partial spawn returns false and leaves the earlier ship (the documented tainted state)"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-spawn.test.ts#spawnTestFlyers"
        status: pass
    human_judgment: false
  - id: D4
    description: "FLYER_SCRIPT_RANGES is frozen and equals 2,500, 1,500 and 25,600, the values of tests/acceptance/thresholds.ts; the key is registered and frozen; the populator spawns every ship inert"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-spawn.test.ts#FLYER_SCRIPT_RANGES; tests/sim/ai/flight-script.test.ts#the flight-script registration"
        status: pass
    human_judgment: false
  - id: D5
    description: "In the Lave world of epoch 1 with the player parked 4,000 m from the station nose-away, over 7,200 ticks: the station flyer starts 5,000 m from the station centre, its pilot goes done at tick 4246 at 2,499.95 m, it never enters the 500 m sphere (closest 2,499.85 m) and never holds an alert naming the station; the interceptor closes and goes done at tick 874 at 1,495 m; the fleer opens the range from 2,898 m to 17,208 m; its behaviour is FLEE_TARGET at the end of the first step and, after the second step's update, its jink is set by exactly two combat draws with no evasive draw; the three contacts move; the 12 inert ships do not; no entity is repaired"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/sim/npc/flyers.scenario.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "With the three flyers spawned 90 ticks after a launch and 2,400 ticks flown, the tick-indexed hashWorld log, the launch, spawn and end ticks and the flyers' final poses and phases are identical at 30, 60 and 144 Hz, and every flyer moved (WORLD-07 replay)"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/sim/npc/npc-cadence.test.ts"
        status: pass
    human_judgment: false
  - id: D7
    description: "The full local suite with the src/sim coverage floors, lint and both typecheck projects pass; the remote verify gate passes on the committed HEAD; tests/oracles and tests/acceptance are untouched"
    verification:
      - kind: command
        ref: "docker compose run --rm test (exit 0, coverage floors held); docker compose run --rm test npm run test:fast (201 files, 4944 passed, 10 skipped, exit 0)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
      - kind: command
        ref: "remote verify at 4fb6a5f (27 e2e passed, exit 0, 142 s)"
        status: pass
    human_judgment: false

duration: 75min
completed: 2026-11-16
---

# Phase 14 Plan 16: The flight-script pilot, spawnTestFlyers and the flyers replay Summary

**A test-only `flight-script` AI key now assigns the native behaviours (station, intercept, flee, attack, escort, face) through `ShipControl` alone, `spawnTestFlyers` puts a Shuttle, a Viper and an Adder 3,000 m from the player, and in a 60 s Lave scenario the Shuttle reaches 2,500 m from the station, the Viper closes to 1,495 m of the player and the Adder opens the range to 17.2 km; with the three flyers active across a launch the world hash replays identically at 30, 60 and 144 Hz.**

## Performance

- **Duration:** about 75 minutes
- **Tasks:** 3 of 3 (Task 1 was the `tracer`; auto mode is on, so its `<verify>` was re-run before expanding and passed)
- **Files:** 5 created, 4 modified (about 17,350 tokens by chars/4 over the added lines of `src` and `tests`; the base is the measured `plan_head_before`)

## Accomplishments

- **The pilot** (`flight-script.ts`): `createFlightScriptAi(tick, { script, targetId, range, speed })` with params of strings and finite numbers (`script`, `phase` of `start`, `flying`, `done`, `targetId`, `range`, `speed`, `frustrated`). The first think issues the script's calls once: station (destination from the main station, range, speed, FLY_RANGE_FROM_DESTINATION), intercept (target, range, speed, INTERCEPT_TARGET), flee (target, range, FLEE_TARGET), attack (target, ATTACK_TARGET), escort (range, FORMATION_FORM_UP), face (destination from the station, range, FACE_DESTINATION). A flying flee pilot goes done when `scriptGoalMetric` exceeds its range and re-issues FLEE_TARGET when its ship's behaviour is in the attack family (EVASIVE_ACTION's exit, `ShipEntity.m:4021-4028`); `onEvent` goes done on `shipAchievedDesiredRange`, `shipNowFacingDestination` and `shipTargetLost` and counts `shipAIFrustrated`. An unknown script name or a missing station goes done at once (T-14-27). The key is appended to `AI_KEYS` and registered frozen; the populator never spawns it.
- **`scriptGoalMetric(view, self, script, targetId)`**: station, centre distance to the station centre; intercept and flee, centre distance minus both `BodyView.radius` values (`rangeToPrimaryTarget`). The scenario and the unit tests use it; plan 14-17's detectors will import it.
- **`spawnTestFlyers(world, player, records, flight, tick, station)`** and `FLYER_SCRIPT_RANGES = Object.freeze({ station: 2500, intercept: 1500, flee: 25600 })`: validates the three scan classes and the free capacity first, then spawns the station flyer 90 degrees left of the nose with its nose on the station centre, and the interceptor and fleer 30 degrees left and right, facing along the nose (the fleer's approach aspect is cos 30 degrees, 0.866, below performFlee's 0.9995), each at its compiled maximum speed. The doc comment states the tainted partial-spawn case.
- **Flyers scenario** (`flyers.scenario.test.ts`) and **replay** (`npc-cadence.test.ts`), described under Observed values.

## Task Commits

1. **Task 1 (tracer): the flight-script pilot and spawnTestFlyers flying in a Lave world** - `028f67b` (feat)
2. **Task 2: unit tests for the flight-script pilot and the spawner** - `e98fb10` (test)
3. **Task 3: the hash with the three flyers is identical at 30, 60 and 144 Hz** - `4fb6a5f` (test)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so after Task 1 the tracer's `<verify>` (`flyers.scenario.test.ts`) was re-run end to end together with `tests/sim/ai` and `tests/sim/world`, and passed; the tracer verified end to end and the plan expanded.

## Verification

- `docker compose run --rm test` (full, with the `src/sim` coverage floors): exit 0. `docker compose run --rm test npm run test:fast`: **201 files, 4944 passed, 10 skipped, exit 0** (14-15 ended at 198 files and 4891 passed). `docker compose run --rm lint` and `docker compose run --rm typecheck` (both projects): clean after each task.
- **Remote `verify`: run, passed** (`/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm verify`, snapshot `4fb6a5f`, 27 Chromium e2e passed, exit 0, 142 s). Run because the plan adds the spawner plan 14-18's browser hook calls and a new AI key; nothing browser-facing changed (`src/app` untouched) and no ship in normal play is steered.
- Acceptance greps: `rg -c '"flight-script"' src/sim/ai/types.ts` = 1; `rg -c spawnTestFlyers src/sim/ai/test-spawn.ts` = 3 (the doc comment mentions, the export and the header); `flight-script.test.ts` and `npc-cadence.test.ts` exist. `git diff 78204dc..HEAD -- tests/oracles tests/acceptance` is empty, and `tests/golden` is untouched.
- Non-vacuity (each mutation reverted, tree clean): reversing the station flyer's orientation failed its spawner case; disabling the flee re-issue failed its pilot case.

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`)

| Measure | After 14-16 | After 14-15 | Floor |
|---------|-------------|-------------|-------|
| lines | 97.78 | 97.72 | 93 |
| statements | 96.89 | 96.81 | 91 |
| functions | 99.46 | 99.45 | 97 |
| branches | 94.43 | 94.36 | 86 |

`test-spawn.ts` is 100 % of lines and branches; `flight-script.ts` 100 % of lines and 97.05 % of branches.

## Observed values (recorded, not promised)

Flyers scenario (Lave epoch 1, player 4,000 m from the station centre, nose away, speed 0; records `shuttle`, `viper`, `adder`):

- **Station flyer (Shuttle, 80 m/s):** starts at 4,999.99999 m; its pilot is done at tick 4246 (35.4 s) with the metric at 2,499.95 m; the closest approach is 2,499.85 m; it never held an alert naming the station. Both assertions are therefore not vacuous.
- **Interceptor (Viper, 320 m/s):** starts at 2,892.2 m; the pilot is done at tick 874 at 1,495.1 m; it is still within the goal range at tick 7,200 (1,176.5 m, IDLE drifting).
- **Fleer (Adder, 240 m/s):** starts at 2,898.3 m; reaches 17,207.9 m at tick 7,200 (the goal of 25,600 m is not reached in 60 s, as the plan states); its behaviour is FLEE_TARGET on every one of the 7,200 ticks; no frustration event for any of the three.
- **Entry timing:** FLEE_TARGET with `entryPending` true and a zero jink at the end of the first step; at the end of the second step `entryPending` false, a non-zero jink and the combat stream exactly two draws on from its spawn state, behaviour still FLEE_TARGET (no evasive draw).
- **Replay:** launch at tick 1, spawn at tick 91, end at tick 2,491, 44 samples; end phases `done`, `done`, `flying`; the flyers' final positions are 480 m, 700 m and 3,500 m from where they spawned. The log, ticks, phases and positions are equal at 30, 60 and 144 Hz.

## Decisions Made

See key-decisions. Further choices:

- **No CHANGELOG entry:** nothing is user-visible yet. The hook that lets a `?test=1` session spawn the flyers is plan 14-18, which adds the `### Added` entry.
- **The attack family** the flee pilot re-issues on is every `ATTACK_*` id plus RUNNING_DEFENSE, the two broadside range ids and CLOSE_WITH_TARGET, written as a switch (a module-level array is banned in the AI zone).
- **Scenario placement:** the player's nose is `normalize(1, 0.3, -0.2)` away from the station, not an axis, so no result depends on an axis-aligned pose.
- **The cadence scenario does not teleport the player** (world-cadence does, to clear the mass lock): the flyers spawn around the real launch pose, so the replay covers a launch, a spawn near the station and the steering with the proximity pass active.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `spawnTestFlyers` takes the station centre as a sixth parameter**
- **Found during:** Task 1
- **Issue:** the plan's signature `spawnTestFlyers(world, player, records, flight, tick)` cannot give the station flyer "its nose on the station centre": the world's statics hold only a layout key, and the player's pose does not say where the station is. The station position lives in the `SystemLayout`.
- **Fix:** the function takes `station: Vec3` last. Plan 14-18's hook call and its `TickStep` replay must pass `layout.station.position` (the sim already holds the layout in the session core).
- **Files modified:** `src/sim/ai/test-spawn.ts`
- **Commit:** `028f67b`

**2. [Rule 3 - Blocking] The records are an object, not a list**
- **Found during:** Task 1
- **Issue:** the plan says `records` without a shape; three positional records invite a swapped order.
- **Fix:** `FlyerRecords = { station, intercept, flee }`, each an `InertShipRecord`; `tests/helpers/flyer-records.ts` builds the committed Shuttle, Viper and Adder set.
- **Commit:** `028f67b`

**3. [Rule 2 - Missing critical functionality] The scenario fixes the fleer's accuracy**
- **Found during:** Task 1
- **Issue:** `setEvasiveJink` draws nothing and `completeEntry` never reads the approach aspect when the drawn accuracy is at or below 0 (about half of the stock draws, -5 to 5). The plan's assertions "the jink is set (two draws)" and "no evasive draw at aspect cos 30" would pass or fail depending on the world seed, and the second would be vacuous for an unlucky draw.
- **Fix:** the scenario writes `steer.accuracy = 3` on the fleer right after the spawn, with a comment. The natural draws are covered by plan 14-17's 20 seeds.
- **Files modified:** `tests/sim/npc/flyers.scenario.test.ts`
- **Commit:** `028f67b`

**4. [Rule 3 - Blocking] A shared test helper**
- **Found during:** Task 1
- **Issue:** the scenario, the spawner tests and the cadence test all need the same three records; copying the JSON reader three times would drift.
- **Fix:** `tests/helpers/flyer-records.ts` (not in the plan's file list).
- **Commit:** `028f67b`

### Plan wording

- **Acceptance of Task 1:** `rg -c spawnTestFlyers src/sim/ai/test-spawn.ts` prints 3, not 1: the module header and the function's doc comment also name it. The criterion is "at least 1".
- **"Each scenario runs with `realHullTable()`, `realNpcWeapons()`":** passed in `StepOptions.combat` as asked; no combat state is given, so nobody fires and the hulls play no part in the flyers' flight (the steering radii are the entity radii and `PLAYER_COLLISION_RADIUS_M`).

**Total deviations:** 4 auto-fixed (3 blocking, 1 missing-critical). **Impact:** none on scope; the plan's behaviour, files and gates stand. Plan 14-18 needs the extra argument.

## Authentication Gates

None.

## Issues Encountered

- Two cases of the first draft of `flight-script.test.ts` were wrong, not the pilot: the flee cases reused the 2,500 m range of the shared helper, and the partial-spawn case tried to set the store's read-only `nextId`. The flee cases now set the 25,600 m range and the partial spawn uses a record with a NaN energy, which `spawnEntity` refuses after the station flyer spawned.
- The flee re-issue (the exit of EVASIVE_ACTION) is never exercised in the live scenario: at aspect cos 30 degrees the fleer never takes the evasive branch and stays in FLEE_TARGET for all 7,200 ticks. It is pinned at unit level only; plan 14-17's 20 seeds exercise it where an evasive draw happens.

## Known Stubs

None.

## Threat Flags

None. T-14-27 (forged params) is mitigated: params stay in the `ParamValue` domain, the AI key list is closed and an unknown script goes done (tested). T-14-28 (the pilot reachable in normal play) is mitigated: the populator never spawns it, only `spawnTestFlyers` attaches it, and a test checks that every populated ship has `ai` null. T-14-40 (a partial spawn) is mitigated: records and capacity are validated first, the remaining refusal case is documented in the doc comment and tested, and plan 14-18's hook taints the session before it calls the spawner. T-14-SC: no package installed.

## Facts for later plans

- **Plan 14-17:** import `createFlightScriptAi`, `scriptGoalMetric` (returns `number | undefined`) and the `FlightScript` type from `src/sim/ai/pilots/flight-script.ts`; `FLYER_SCRIPT_RANGES`, `TEST_FLYER_DISTANCE`, `spawnTestFlyers` and `FlyerRecords` from `src/sim/ai/test-spawn.ts`. Convert a populated ship by replacing its `ai` with `createFlightScriptAi(tick, { script, targetId: PLAYER_ID, range, speed })` (station and face use no target; escort and face take their range from the plan, the escort's owner and slot are spawn fields, `ownerId` and `escortSlot`, not pilot params). The pilot reads `frustrated` as a raw count in every phase; the detectors diff it per tick while a goal is unmet. The pilot's first think is at `nextThinkTick` (the tick passed to `createFlightScriptAi`), so its calls are in place after the first `stepSim` that follows the conversion. The pilot thinks every 15 ticks.
- **Flee done:** a flee pilot goes done only through its metric (strictly beyond its range) or `shipTargetLost`; an Adder at 240 m/s needs about 94 s from 3,000 m to pass 25,600 m, so with the 18,000-tick horizon (150 s) a flee flyer can finish; this scenario's 60 s does not.
- **Plan 14-18:** call `spawnTestFlyers(world, liveState, records, ctx.core.npcTraffic.flight, liveState.tick, layout.station.position)` (the sixth argument is new, see deviation 1); use `flyerRecords()`-style named constants `shuttle` (station), `viper` (intercept) and `adder` (flee). `tests/sim/npc/npc-cadence.test.ts` is the Node-side model: launch at tick 1 and spawn at launch + 90 reproduce its log at every cadence. In the Lave scenario the Shuttle needs 4,246 ticks to cover 2,500 m (so it is NOT done after the browser smoke's 1,200 ticks: it has gained roughly 800 m by then, at 80 m/s); in the replay (player near the station after a launch) the station flyer is done within the 2,400 ticks.
- **Station flyer orientation:** its nose is on the station centre, within 1e-9, at any player pose (tested at three orientations).
- **Plan 14-19:** the divergence list of 14-15 stands; this plan adds none to the port (it adds test code only). The extra spawner argument is a deviation from the plan text, not from Oolite.

## Self-Check: PASSED

- Created files exist: `src/sim/ai/pilots/flight-script.ts`, `tests/helpers/flyer-records.ts`, `tests/sim/ai/flight-script.test.ts`, `tests/sim/npc/flyers.scenario.test.ts`, `tests/sim/npc/npc-cadence.test.ts`, `14-16-SUMMARY.md`.
- Commits `028f67b`, `e98fb10` and `4fb6a5f` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 3` is measured with `git rev-list --count 78204dc..HEAD` before this SUMMARY commit (`plan_head_after` is the Task 3 commit); `git diff 78204dc..HEAD -- tests/oracles tests/acceptance` is empty.

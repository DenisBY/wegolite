---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 09
subsystem: sim
tags: [npc-flight, steering, oracle-runner, flight-model, perform-entry, totality-property, coverage]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-08's frozen steering record, 14-01 and 14-06's oracle fixtures, 14-05's BodyView.radius
provides:
  - the NPC flight model (applySticks, applyAttitude, applyThrust with the literal increase and decrease ramps) in src/sim/npc/flight.ts
  - steerShip(entity, ctx), SteerContext, SteerEvent and the processBehaviour switch with the recorded idle fallback (src/sim/npc/dispatch.ts)
  - enterBehaviour, completeEntry and resolveAccuracy (src/sim/npc/enter.ts); ShipControl.perform now calls enterBehaviour
  - behaviour_idle, behaviour_stop_still (also STATION_KEEPING) and behaviour_tumble
  - the constants ledger (every COMBAT_AI_* tier once), NpcFlightStats and statsFor
  - the oracle runner (loadOracleFiles, runFixture, runOracleGroup, createSyntheticView, RunnerHooks) and the static fixture manifest (ORACLE_GROUPS)
affects: [14-10, 14-11, 14-12, 14-13, 14-14, 14-15, 14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: b2c28dad3118ef42551cc57ccf04c483ffb58aa7
plan_head_after: 036511d0256a4180ce93c34101ccad603f83b56d

actuals:
  tokens: 24000
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "One SteerContext { view, stats, dt, draw, emit } passed unchanged to every behaviour and helper"
    - "A perform entry split into a context-free part (enterBehaviour, at once) and a deferred part (completeEntry, at the next update)"
    - "A static fixture-to-test-file manifest instead of a module-level record that cannot cross Vitest files"
    - "A runner whose only real entity is the steered ship; every other body sits behind a synthetic WorldView"

key-files:
  created:
    - src/sim/npc/constants.ts
    - src/sim/npc/stats.ts
    - src/sim/npc/flight.ts
    - src/sim/npc/enter.ts
    - src/sim/npc/dispatch.ts
    - src/sim/npc/behaviours/idle.ts
    - src/sim/npc/behaviours/tumble.ts
    - tests/sim/npc/oracle-runner.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/flight.oracle.test.ts
    - tests/sim/npc/flight.test.ts
    - tests/sim/npc/constants.test.ts
    - tests/sim/npc/steering.property.test.ts
  modified:
    - src/sim/world/control-impl.ts
    - tests/sim/world/control.test.ts

key-decisions:
  - "Attitude composition in Wegolite's frame is q' = q * Rx(-pitch * dt) * Rz(roll * dt) (axisAngle(1,0,0,-c) then axisAngle(0,0,1,r), right-multiplied, normalised). Derived from ShipEntity.m:5881-5897 and OOQuaternion.m (Oolite stores the inverse-convention quaternion, so Rz(-roll)*Rx(-climb) on the left is Rx(climb)*Rz(roll) on the right of the standard one; the z mirror turns Rx(c) into Rx(-c) and leaves Rz). Every attitude fixture passed first time, and a roll-sign mutation failed three tests"
  - "A positive flightPitch tips the nose toward -Y and a positive flightRoll leans up toward -X (the same signs in Oolite's and Wegolite's frames, because the mirror leaves x and y alone); pinned by a physical test that reads the sign from the oracle's own attitude fixtures"
  - "During update k the runner's view.tick is k (the oracle contract's clock: at tick k Oolite reads k ticks); plan 14-12's tracking-curve sample must be written against that"
  - "statsFor rejects a row whose value is non-finite, negative, or above MAX_ENTITY_MAGNITUDE (speed, thrust, mass) or MAX_STEER_RATE (roll, pitch) and returns OOLITE_DEFAULT_FLIGHT_STATS, so steering never reads a corrupt number"
  - "SteerEvent names are AiEventName; shipNowFacingDestination and shipAIFrustrated are not in AI_EVENT_NAMES yet, so plan 14-11 adds them (the runner records whatever name is emitted)"

patterns-established:
  - "Property tests of later plans extend the generator in steering.property.test.ts and add their ids to SWEPT_BEHAVIOURS"
  - "A deliberate one-line mutation of the port is the non-vacuity check for an oracle or a property (done for the roll sign and the speed clamp, both reverted)"

coverage:
  - id: D1
    description: "The NPC flight model and IDLE match the independent flight-model oracle through the runner's synthetic WorldView and steerShip, including the x4 reversal, the accuracy-8 versus accuracy-2 rate doubling, the attitude step, the thrust ramp, the clamp written back and the above-max decay"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/flight.oracle.test.ts#tests/oracles/npc/fixtures/flight-model.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "One physical turn-direction case pins the attitude signs in Wegolite's frame against the sign the oracle's attitude fixtures state"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/flight.oracle.test.ts#the turn direction in Wegolite's frame (local -Z forward, +Y up)"
        status: pass
    human_judgment: false
  - id: D3
    description: "ShipControl.perform applies the perform entry effects of IDLE, STOP_STILL and TUMBLE (context-free part at once, the two draws at the next update through entryPending), the last perform in a think wins, STATION_KEEPING runs stop-still, and the idle and tumble oracle groups pass with their scripted draws consumed exactly"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/world/control.test.ts#perform entry effects (ShipEntityAI.m:350-480, plan 14-09)"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/flight.oracle.test.ts#tests/oracles/npc/fixtures/idle.json"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/flight.oracle.test.ts#tests/oracles/npc/fixtures/tumble.json"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every Oolite number in the steering ledger is pinned to its literal, every COMBAT_AI_* tier is defined exactly once under src/sim, and TRACKING_SAMPLE_TICKS is 60"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/constants.test.ts"
        status: pass
    human_judgment: false
  - id: D5
    description: "Steering is total: for domain-valid records and poses (idle family and every out-of-scope id) steerShip never throws, outputs stay finite, the orientation stays unit, speed stays in [0, maxFlightSpeed], frustration and successFactor stay float32, and sanitizeEntity repairs nothing; every out-of-scope id runs behaviour_idle and the thrust ramp; an above-max start speed decays through the literal decrease_flight_speed"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/steering.property.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "The full suite with coverage keeps the src/sim floors; lint (sim zone bans) and both typecheck projects pass"
    verification:
      - kind: command
        ref: "docker compose run --rm test (180 files, 4194 passed, 10 skipped)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
    human_judgment: false

duration: 23min
completed: 2026-11-15
---

# Phase 14 Plan 09: NPC flight model and the steering contract Summary

**`steerShip` runs Oolite's flight model (stick slew, attitude step, thrust ramp with the hyperspace decay) plus IDLE, STOP_STILL, STATION_KEEPING and TUMBLE through `ShipControl.perform`, and all 17 flight-model, idle and tumble oracle fixtures pass through a synthetic `WorldView` with every scripted draw consumed exactly.**

## Performance

- **Duration:** about 23 minutes (started about 20:02 UTC, finished 20:25 UTC)
- **Tasks:** 3 of 3 (Task 1 was the `tracer`; its `<verify>` passed, auto mode is on, so the plan expanded)
- **Files:** 13 created, 2 modified (about 24,000 tokens by chars/4)

## Accomplishments

- **Flight model** (`src/sim/npc/flight.ts`): `applySticks` (roll rate `2 dt`, pitch `4 dt`, x4 on reversal, x2 more when the stick is exactly 0 and accuracy >= 7.5, snap within one step), `applyAttitude`, and `applyThrust` in Oolite's exact order (TUMBLE return first; clamp of `desiredSpeed` written back; the ramp through `decreaseFlightSpeed` with `MIN_HYPERSPEED_FACTOR` above `maxFlightSpeed` or `increaseFlightSpeed`, without overshoot; then the move along the nose).
- **Dispatcher** (`dispatch.ts`): `steerShip(entity, ctx)` with the order (1) lazy accuracy draw, (2) pending perform entry, (3) a marked slot for plan 14-12's tracking-curve sample, (4) the behaviour switch, (5) attitude then thrust. Every id not ported yet or out of scope runs `behaviour_idle` and the thrust ramp, and never throws.
- **Entry effects** (`enter.ts`, `control-impl.ts`): `enterBehaviour` applies the context-free part of `performIdle`, `performStop` and `performTumble` at once and sets or clears `entryPending`; `completeEntry` (switching on the current behaviour) draws the two TUMBLE sticks at the next update; `resolveAccuracy` is the lazy `u * 10 - 5` draw through the `setAccuracy:` clamp.
- **Ledger** (`constants.ts`, `stats.ts`): every number with its Oolite file:line, all nine `COMBAT_AI_*` values of `ShipEntity.h:123-137` once, `MIN_HYPERSPEED_FACTOR`, `SCANNER_MAX_RANGE`, `TRACKING_SAMPLE_TICKS` (60), the stock stats, `NpcFlightStats` and `statsFor`.
- **Oracle runner** (`tests/sim/npc/oracle-runner.ts`): parses every fixture file of both trees with `OracleFileSchema` before any run (the 13 files, 8 + 5, all parse; no pursuit file failed), refuses a fixture whose `scannerRange` is not 25600, builds a real world with the steered ship (id 101) and a synthetic view over the fixture's bodies with their radii, applies `assign` through `createShipControl`, then runs the in-tick order (a) bodies move, (b) `beforeUpdate` hooks, (c) `steerShip`, (d) `afterUpdate` hooks, with `afterAssign` hooks at tick 0, and checks draw count, events and every field.
- **Manifest** (`oracle-groups.ts`): `flight.oracle.test.ts` takes `flight-model.json`, `idle.json` and `tumble.json`; it asserts the ids it ran equal that entry.

## Task Commits

1. **Task 1 (tracer): steerShip with the flight model and IDLE, proven against the flight-model oracle through the runner** - `74ab664` (feat)
2. **Task 2: perform entry effects, stop-still and tumble through ShipControl** - `7d81e81` (feat)
3. **Task 3: ledger pins, the out-of-scope fallback and the totality property** - `036511d` (test)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so the tracer's `<verify>` (the flight oracle test, plus lint and typecheck) was run at the Task 1 commit and passed; `⚡ Tracer verified end-to-end — expanding`.

## Verification (run in Docker)

- `docker compose run --rm test npx vitest run tests/sim/npc tests/sim/world/control.test.ts tests/sim/ai`: 8 files, 139 passed.
- Oracle result: `flight.oracle.test.ts` 21 tests (the schema load, 12 flight-model, 3 idle, 2 tumble, the manifest check, 2 physical turn cases) all pass; 222 checks over 17 fixtures. No oracle dispute: the port matched the oracle on the first run, so nothing under `tests/oracles/**` was read before the code compiled and passed its own unit tests, and nothing there was edited.
- Non-vacuity: flipping the sign of the roll rotation failed 3 tests (two attitude fixtures and the physical case); removing the `speed > desired` clamp in the thrust ramp failed the totality property. Both mutations were reverted (`git diff` empty).
- `docker compose run --rm lint` (eslint and prettier) and `docker compose run --rm typecheck` (both projects, including `tsconfig.sim.json`): clean after each task.
- Full `docker compose run --rm test` with coverage, run once after Task 3's tests: **180 files, 4194 passed, 10 skipped, exit 0**, 163 s; the coverage floors held. A later four-case `resolveAccuracy` table was added to `flight.test.ts` and run in the targeted command above; it only adds coverage, so the full suite was not repeated.
- No `verify`, `verify-full` or browser gate: the plan changes only `src/sim` and tests (gate policy).

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`)

| Measure | Measured | Floor in `vitest.config.ts` |
|---------|----------|-----------------------------|
| lines | 97.18 | 93 |
| statements | 96.10 | 91 |
| functions | 99.58 | 97 |
| branches | 93.44 | 86 |

`src/sim/npc/**` alone: lines 97.99, statements 98.14, functions 100, branches 97.06. The only uncovered lines were the three clamp branches of `resolveAccuracy` (enter.ts 113, 115, 117), now forced by table cases. No floor failed, so none was touched.

## Decisions Made

- See key-decisions above. Further choices the plan left open:
  - `SteerEvent` is `{ name: AiEventName; a?: EntityId }`; no behaviour of this plan posts one.
  - The scan classes `CLASS_STATION` and `CLASS_BUOY` stand in for Oolite's `isStation` and `scanClass == CLASS_BUOY` in `behaviour_idle`.
  - `RunnerHooks` is three mutable arrays; a hook receives `{ fixture, world, self, tick, bodies, view }` and may mutate the bodies and the steered entity.
  - `SCANNER_MAX_RANGE` is defined again in `npc/constants.ts` (as the plan lists it) although `combat/constants.ts` already has it; `constants.test.ts` pins the two equal.
  - `COMBAT_AI_WEAPON_TEMP_READY` and `_USABLE` (`ShipEntity.h:119-120`) are not tiers and are not in the ledger; plan 14-14 adds them if it needs them.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `enter.ts` and `behaviours/tumble.ts` landed in the Task 1 commit**
- **Found during:** Task 1
- **Issue:** `dispatch.ts` (Task 1) imports `resolveAccuracy` and `completeEntry` from `enter.ts`, the stop-still behaviour from `behaviours/idle.ts` and the tumble behaviour, all listed under Task 2, so Task 1 could not compile or be committed green without them.
- **Fix:** The four files were committed with Task 1. Task 2 added the `control-impl.ts` wiring, the manifest rows and the `control.test.ts` re-pin, which is where the plan's perform behaviour changed.
- **Commit:** `74ab664`

**2. [Rule 2 - Missing critical functionality] A separate hand-derived unit test file for the flight model**
- **Found during:** Task 1 (porter rule)
- **Issue:** The porter rule says the oracle expectations may be read only after the port compiles and passes its own unit tests, and the plan's test list has none for `applySticks`, `applyThrust` and `statsFor` before Task 3.
- **Fix:** Added `tests/sim/npc/flight.test.ts` (stick rates, reversal, accuracy doubling, snap, thrust ramp, clamp, tumble, above-max decay, `statsFor`, and later `resolveAccuracy`), with every expected value derived by hand from the cited lines.
- **Commit:** `74ab664` (and `036511d` for the `resolveAccuracy` cases)

**Total deviations:** 2 auto-fixed (1 blocking, 1 missing-critical). **Impact:** none on scope; one extra test file.

## Authentication Gates

None.

## Issues Encountered

None. No oracle dispute: every fixture of the three groups passed against the port as ported from the cited lines.

## Known Stubs

None in `src/`. The runner deliberately throws for `aimPointX|Y|Z` (the tracking curve is plan 14-12's) and the three `RunnerHooks` lists start empty; both are documented slots, not stubs that block this plan.

## Threat Flags

None. T-14-14 (steering failing inside the fixed step) is mitigated by construction and by the totality property; T-14-15 (a forged behaviour id) is mitigated because the `BEHAVIOUR_IDS` membership check still runs before `enterBehaviour`, and draws come only from the actor's own stream through `ctx.draw`.

## Facts for later plans

**Contract and conventions**

- `steerShip(entity, ctx)`, `SteerContext { view, stats, dt, draw, emit }` and `SteerEvent { name: AiEventName; a?: EntityId }` are exported from `src/sim/npc/dispatch.ts`. Step (3), the tracking-curve sample, goes between the pending-entry completion and the behaviour switch (a comment marks it). Behaviours and helpers take `(entity, ctx)` plus their Oolite arguments.
- `ctx.view.tick` is k during update k in the runner. Plan 14-11 builds the real context; the real view's tick before the step increments is k-1 for the k-th update, so plan 14-12 must convert, or pass `tick + 1`, so its `ticks[0] + 60 > now` compare matches the oracle.
- `normalizeVec` in `src/sim/math.ts` already returns the zero vector for a zero input (pinned by `steering.property.test.ts`), so every `vector_normal` port can use it.
- `AI_EVENT_NAMES` does not contain `shipNowFacingDestination` or `shipAIFrustrated`; plan 14-11 must add them before a behaviour can `emit` them. The runner compares the emitted `name` strings to the fixture's event list as they are.
- `enterBehaviour` is a `switch` with one row each for IDLE, STOP_STILL and TUMBLE and a default (set behaviour, clear the flag). Later plans add rows; `completeEntry` switches on the current `nav.behaviour`.
- `RunnerHooks` slots: `afterAssign` (plan 14-12 starts the tracking curve), `beforeUpdate` (plan 14-15 leader refresh), `afterUpdate` (plan 14-15 proximity rule). `runFixture(fixture, hooks)` returns `{ id, failures, drawsUsed, checks }`; `runOracleGroup(path, hooks)` runs a whole fixture file. Add a row to `ORACLE_GROUPS` for every new oracle test file.
- The runner writes the fixture's recorded state verbatim (a negative `desiredRange` fixture row, such as flee's, cannot go through `ShipControl.setDesiredRange`, which refuses negatives) and maps `jink` with its z negated like every other vector.
- `readField` supports every `ORACLE_FIELDS` name except `aimPointX|Y|Z`, which throws until plan 14-12 provides it; `rangeToTarget` and `headingErrorTarget` read the target through `view.body(nav.targetId)` and are 0 for no target.

**For plan 14-19's divergence list**

- The fallback runs `behaviour_idle` and the thrust ramp for every id not ported. Oolite turns the attitude step and thrust off for TRACK_AS_TURRET and ENERGY_BOMB_COUNTDOWN (`applyThrust = NO`, `ShipEntity.m:2614`, `2628`) and moves TRACTORED ships by its own rule (`2505-2507`); the fallback reproduces none of these (pinned as current behaviour by `steering.property.test.ts`).
- The accuracy draw is lazy (first update) instead of Oolite's setup draw, so the draw order differs from Oolite's global setup order (REVIEWS L51@7b15bb3).
- An AI write in the same think after a deferred perform is overwritten at the next update; the same deferred perform twice in one think draws once.
- The stick rates, attitude and speed are float64 where Oolite uses GLfloat; only `frustration` and `successFactor` are float32-rounded (by every writer of later plans).

## Self-Check: PASSED

- Created files exist: all 13 in key-files.created, plus `14-09-SUMMARY.md`.
- Commits `74ab664`, `7d81e81` and `036511d` are ancestors of HEAD; `git show --first-parent --diff-filter=D` on each prints no deleted file.
- `commits: 3` is measured with `git rev-list --count b2c28da..HEAD`; `git diff b2c28da..HEAD -- tests/oracles tests/acceptance` is empty.
- Acceptance greps: `dispatch.ts` and `oracle-runner.ts` exist; `rg -c OracleFileSchema oracle-runner.ts` = 4; `oracle-groups.ts` exists; `rg -c enterBehaviour control-impl.ts` = 3; `rg -c TRACKING_SAMPLE_TICKS constants.test.ts` = 3.

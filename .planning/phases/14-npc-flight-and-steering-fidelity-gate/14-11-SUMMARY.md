---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 11
subsystem: sim
tags: [npc-flight, steering, world-step, step-options, flight-table, player-radius, placeholder-integrator]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-09's steerShip contract, statsFor and NpcFlightStats; plan 14-10's navigation behaviours and the two events; plan 14-03's compiled flight fields
provides:
  - the world step's update phase flies every live entity that has an AI with steerShip, in ascending id order over the length snapshot (the Phase 8 constant-speed placeholder is gone)
  - StepOptions.npcFlight and NpcStepFacts { flight?, masses? }, threaded by stepSim with AI_REGISTRY passed explicitly
  - flightTableFrom(records), the one builder of the flight table (test helper now, the app in plan 14-18)
  - massFor(facts, specKey): flight row mass, else the shipMasses row by a local copy of massOf's guard, else 0
  - PLAYER_COLLISION_RADIUS_M (72.69734954833984), pinned to the compiled Cobra Mk III hull row
  - realNpcFlightTable() test helper and the step-integration scenario
affects: [14-12, 14-13, 14-14, 14-15, 14-16, 14-17, 14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01, WORLD-07]

plan_head_before: e31a0d3f194245261ef92eef5ee83e41ba7f4f17
plan_head_after: f6433ac1096e36ce18251eed8f2fd6a718b29354

actuals:
  tokens: 8000
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Read-only per-kind facts reach the sim through StepOptions (npcFlight beside shipMasses), never a command and never an import of content"
    - "A steered ship draws only from a local copy of its own combat stream, written back after the call"
    - "A compiled constant, not a lazily loaded table, supplies the player's collision radius"

key-files:
  created:
    - tests/helpers/npc-flight.ts
    - tests/sim/npc/step-integration.test.ts
  modified:
    - src/sim/world/step.ts
    - src/sim/sim.ts
    - src/sim/flight/step.ts
    - src/sim/npc/stats.ts
    - tests/sim/world/step.test.ts
    - tests/sim/world/world-cadence.test.ts

key-decisions:
  - "The world view in the update and think phases stays createWorldView(world, player, layout) (player radius 0 by default); plan 14-12 passes PLAYER_COLLISION_RADIUS_M, as the plan's revision 1 says"
  - "The stats.ts doc comment does not name the generated hull file: tests/content/ships-hulls.test.ts fails any non-loader src file that mentions it, so the constant cites 'the generated hull table'"
  - "No CHANGELOG entry: nothing in normal play has an AI that steers (the populator still spawns inert ships), so there is no user-visible change"

patterns-established:
  - "stepWorld(world, player, layout, dt, registry, npc?): the trailing NpcStepFacts carries the read-only facts the steering needs"

coverage:
  - id: D1
    description: "The world step flies AI ships with steerShip and their flight constants: in IDLE with an explicit desired speed d from rest, speed after n ticks is min(d, maxFlightSpeed, n * 5 * thrust / 120), for d below and above the maximum (the clamp reads back), with the default stats and with the Viper row"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/step-integration.test.ts#the speed ramp of a steered ship (ShipEntity.m:5808-5854)"
        status: pass
    human_judgment: false
  - id: D2
    description: "An inert ship holds pose and speed over 600 ticks; another ship's spawn does not change a steered ship's combat draws; a fly-to arrival posts shipAchievedDesiredRange to the ship's own AI at the next drain with no a key; two identical runs hash identically"
    requirement: WORLD-07
    verification:
      - kind: unit
        ref: "tests/sim/npc/step-integration.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "massFor falls back from the flight row to the shipMasses row with massOf's finite-positive guard and to 0; flightTableFrom builds a frozen table; PLAYER_COLLISION_RADIUS_M equals the compiled oolite_template_cobra3-player collisionRadius"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/sim/npc/step-integration.test.ts#flightTableFrom and massFor"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/step-integration.test.ts#PLAYER_COLLISION_RADIUS_M"
        status: pass
    human_judgment: false
  - id: D4
    description: "The full suite with coverage, lint and both typecheck projects pass; flight-hash-pins.json, ship-field.ts, tests/oracles and tests/acceptance are untouched"
    verification:
      - kind: command
        ref: "docker compose run --rm test (184 files, 4320 passed, 10 skipped)"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
      - kind: command
        ref: "remote: wegolite-remote-run.sh run --rm verify at f6433ac (27 browser specs passed, exit 0)"
        status: pass
    human_judgment: false

duration: 25min
completed: 2026-11-15
---

# Phase 14 Plan 11: The steered world step Summary

**`stepWorld` now flies every AI-bearing ship with the native `steerShip` and its compiled flight limits (delivered through `StepOptions.npcFlight`, built by the one `flightTableFrom`), so a ship accelerates at `5 * thrust` per second instead of jumping to its desired speed; inert ships still hold still.**

## Performance

- **Duration:** about 25 minutes
- **Tasks:** 3 of 3 (Task 3 needed no file change, see Deviations); 2 task commits
- **Files:** 2 created, 6 modified (about 8,000 tokens by chars/4 over the realized diff)

## Accomplishments

- **Update phase** (`src/sim/world/step.ts`): the placeholder block is replaced by a loop with the same shape and skip rule (dead or `ai === null` entities are skipped) that calls `steerEntity`: `statsFor(npc?.flight, entity.specKey)`, a `draw` over a local copy of `entity.rng.combat` written back after the call, and an `emit` that calls `postAiEvent` with `{ to, name }` or `{ to, name, a }` (never an `a: undefined` key). The lazily created `WorldView` is shared with the think phase. No try/catch: steering is total.
- **Facts** (`src/sim/npc/stats.ts`): `NpcStepFacts { flight?, masses? }`, `flightTableFrom(records)` (frozen; an unknown forward weapon becomes `EQ_WEAPON_NONE`), `massFor(facts, specKey)` and `PLAYER_COLLISION_RADIUS_M`. `ship-field.ts` is unchanged: `massFor` carries its own copy of `massOf`'s scan and finite-positive guard.
- **Options** (`src/sim/flight/step.ts`, `src/sim/sim.ts`): `StepOptions.npcFlight`; `stepSim` calls `stepWorld(world, player, layout, dt, AI_REGISTRY, facts)` with `facts` built by conditional spread from `options.npcFlight` and `options.hyperspace.shipMasses`. No hull table is read for steering.
- **Helper and scenario:** `realNpcFlightTable()` reads the nine committed records through `flightTableFrom`; `step-integration.test.ts` (15 tests) covers the ramp, the inert ship, the draw isolation, the event delivery, `massFor`, `flightTableFrom`, the radius pin and determinism.

## Task Commits

1. **Task 1 (tracer): the world step flies AI ships with steerShip and the compiled flight table** - `ab7ba56` (feat)
2. **Task 2: re-pin the placeholder integrator test to the thrust ramp; cadence runs use the compiled flight table** - `f6433ac` (test)
3. **Task 3: app tests and the full suite** - no commit (no app test failed; only a verification run)

Tracer feedback gate: auto mode is on (`workflow.auto_advance`), so the tracer's `<verify>` (step-integration and flight-hash-pin tests) was run at Task 1 and passed (20 tests); `⚡ Tracer verified end-to-end — expanding`.

## Re-pinned assertions (Task 2)

Nothing in `tests/sim` or `tests/app` failed after Task 1 apart from one source-guard test (see Deviations). The placeholder pin passed only by coincidence, so it was rewritten on purpose:

- `tests/sim/world/step.test.ts`, "the Phase 8 placeholder integrator" became "the native flight update of an entity with an AI (plan 14-11)". Rule asserted, derived from `ShipEntity.m:5808-5854` (the ramp adds `SHIP_THRUST_FACTOR * thrust * dt` per tick, default thrust 15) and `Entity.m:796-800` (move forward by `speed * dt` after the ramp): from rest with desired speed 60, speed after tick 1 is `5 * 15 * DT` = 0.625 m/s and `z = 30 - RAMP * DT`; after tick 2 speed is `2 * RAMP` and `z = 30 - RAMP * DT - 2 * RAMP * DT`. A second case keeps the old numbers under a new meaning: a ship already at its desired speed 60 holds 60 and moves `60 * DT`. The inert-ship case is unchanged (D-02). The file's header comment no longer says one test pins the placeholder.
- `tests/sim/world/world-cadence.test.ts`: both step-option sets now pass `npcFlight: realNpcFlightTable()`; the tick-indexed equality across cadences is unchanged and holds. No pinned position changed (the file pins none).
- `tests/sim/ai/test-pilot.test.ts` (thinks in isolation, never through the step), `tests/sim/combat/npc-fire.test.ts` (shooter still faces and hits the player), `tests/sim/world/snapshot.test.ts` (the 1,000-tick live-versus-restored proof passes untouched, so the steering record is fully snapshotted), `tests/app/session/world-lifecycle.test.ts` and `tests/app/tracer.test.ts`: no failure, no change.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/npc/step-integration.test.ts tests/sim/world/flight-hash-pins.test.ts`: 2 files, 20 passed.
- `docker compose run --rm test npx vitest run tests/sim`: 67 files, 1837 passed, 1 skipped.
- Full `docker compose run --rm test` with coverage: **184 files, 4320 passed, 10 skipped, exit 0**, 170 s; the floors held.
- `docker compose run --rm lint` and `docker compose run --rm typecheck` (both projects): clean.
- Acceptance greps: `steerShip` in `step.ts` = 3; the placeholder statement `Math.max(0, entity.nav.desiredSpeed)` is gone from code; `npcFlight` in `flight/step.ts` = 1 line; `AI_REGISTRY` in `sim.ts` = 2; `flightTableFrom` in the helper; `PLAYER_COLLISION_RADIUS_M` in `stats.ts`; `git diff e31a0d3 -- tests/golden/world/flight-hash-pins.json src/sim/world/ship-field.ts tests/oracles tests/acceptance` is empty (so is the diff against 86c4236 for the first two).
- **Remote `verify`** (the plan's gate policy said none; run once because the `?test=1` hook in `probe-publisher.ts` spawns a test shooter, and a ramping shooter changes how a browser-spawned NPC moves): `wegolite-remote-run.sh run --rm verify` at snapshot `f6433ac`, exit 0, 27 browser specs passed (50 s of specs, 149 s total).

### Coverage of `src/sim/**` (from `test-results/coverage/coverage-summary.json`, aggregated over files under `src/sim/`)

| Measure | After 14-11 | After 14-10 | Floor |
|---------|-------------|-------------|-------|
| lines | 97.44 | 97.43 | 93 |
| statements | 96.40 | 96.38 | 91 |
| functions | 99.59 | 99.59 | 97 |
| branches | 93.84 | 93.82 | 86 |

## Decisions Made

- See key-decisions. The ramp test builds a fresh world per tick count n and reads the speed there, because the expectation is a closed form in n and no run of the code under test supplies a number.
- `FlightRecord` (the structural record type of `flightTableFrom`) is exported from `stats.ts` so the helper and plan 14-18 can type their JSON read without a content import.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] A doc comment named the generated hull file**
- **Found during:** Task 3 (the first full-suite run)
- **Issue:** `tests/content/ships-hulls.test.ts` ("is named by no non-test source file other than the loader and the session start-up") matches the literal `ships-hulls.json`, and the `PLAYER_COLLISION_RADIUS_M` doc comment in `src/sim/npc/stats.ts` named it, so the guard failed.
- **Fix:** The comment now cites "the generated hull table" and the `oolite_template_cobra3-player` row. The pin test in `step-integration.test.ts` reads the file from the test side, which the guard allows.
- **Files modified:** `src/sim/npc/stats.ts`
- **Commit:** amended into `ab7ba56` (not pushed)

### Plan wording

- **Task 3 produced no commit:** the plan expected app-test re-pins, but no `tests/app` test failed (including `tick-parity.test.ts`), so there was nothing to change; the task was the full-suite, lint and typecheck run, recorded above.
- **Task 2's list was mostly a no-op:** only the `step.test.ts` pin and the `world-cadence.test.ts` options changed (see Re-pinned assertions).

**Total deviations:** 1 auto-fixed bug. **Impact:** none on scope.

## Authentication Gates

None.

## Issues Encountered

None.

## Known Stubs

None. `createWorldView` is still called without a player radius here (it reports 0 for the player's body), which is a documented slot for plan 14-12, not a stub that blocks this plan.

## Threat Flags

None. T-14-18 (per-tick cost) is bounded by one `steerEntity` call per AI entity per tick, at most `MAX_ENTITIES`; T-14-19 (forged flight row) is mitigated by `statsFor`'s domain check and by the table travelling in `StepOptions` only; T-14-SC: no package installed.

## Facts for later plans

- `stepWorld(world, player, layout, dt, registry, npc?)`; `stepSim` passes `AI_REGISTRY` and `NpcStepFacts` explicitly. Plan 14-18 builds the app's `npcFlight` with `flightTableFrom(records)` (type `FlightRecord`) and adds it to `StepOptions` in `src/app/session/step-options.ts`; the masses already flow from `hyperspace.shipMasses`.
- Plan 14-15's proximity pass reads mass only through `massFor(npc, specKey)`; `stepWorld` has `npc` in scope, but the steering context (`SteerContext`) does not carry it yet. Plan 14-12/14-13 must extend `SteerContext` (or hand the facts through the context's `view`/a new field) and `steerEntity` is the one place that builds the context.
- Plans 14-12 and 14-15 use `PLAYER_COLLISION_RADIUS_M`; `createWorldView(world, player, layout, playerRadius = 0)` already takes the radius, so plan 14-12 passes the constant in `stepWorld`'s `getView` (this plan left it at 0).
- The view's `tick` during a steered update is `player.tick`, which the flight step already advanced (the k-th update sees tick k when `player.tick` starts at 0 and is incremented once per step, as the step-integration helper does). Plan 14-09's note about the runner's k versus k-1 depends on the caller; check it when plan 14-12 adds the tracking-curve sample.
- The steered update draws one combat draw per ship on its first update (the lazy accuracy draw), so a world with AI ships has `rng.combat` values that differ from the seed after tick 1.
- `?test=1` shooters (`spawnTestShooter`) now ramp from rest instead of jumping to speed; the remote `verify` passes with that.

## Self-Check: PASSED

- Created files exist: `tests/helpers/npc-flight.ts`, `tests/sim/npc/step-integration.test.ts`, `14-11-SUMMARY.md`.
- Commits `ab7ba56` and `f6433ac` are ancestors of HEAD; `git show --first-parent --diff-filter=D --name-only` on each prints no deleted file.
- `commits: 2` is measured with `git rev-list --count e31a0d3..HEAD` before this SUMMARY commit (`plan_head_after` is the Task 2 commit).

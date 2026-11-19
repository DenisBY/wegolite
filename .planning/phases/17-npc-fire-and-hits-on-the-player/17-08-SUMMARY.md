---
phase: 17-npc-fire-and-hits-on-the-player
plan: 08
subsystem: testing
tags: [oracle, fixtures, npc, fire-sites, hot-branches, runner, oracle-dispute]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: the fire-site and hot-branch fixtures (17-02), the fire manifest (17-04), the steering fire route and the live weapon temperature (17-06, 17-07)
provides:
  - oracle-runner weaponHooks (float32 temperature and missedShots at assign, coolWeapon after every update) and an optional ctx.fire recorder (RunOptions.fireCalls)
  - tests/sim/npc/fire-sites.oracle.test.ts, the consumer of fire-sites.json (24) and hot-branches.json (31)
  - FIRE_ORACLE_PENDING empty, asserted by oracle-coverage.test.ts
affects: [17-09, 17-10]

plan_head_before: ccb314f475dc5933833eaad460bb0f04e4ea5047
plan_head_after: c9574416fc2259f817e313e009f7421aa9d06fa3
commits: 2

actuals:
  tokens: 4800
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "the weapon block of a fixture is a hook set on top of emptyHooks(), and the fire recorder is a conditional spread into the SteerContext, so a fixture without them runs exactly as before"
    - "an open oracle dispute is pinned in the consumer as the exact failure message the port produces, so the fixture file stays untouched and the pin fails when the fixture is corrected"

key-files:
  created:
    - tests/sim/npc/fire-sites.oracle.test.ts
  modified:
    - tests/sim/npc/oracle-runner.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/oracle-coverage.test.ts
    - tests/sim/npc/attack.oracle.test.ts

key-decisions:
  - "Fixture 'fire-site-flee-evasive-hand-over-still-requests' is an oracle dispute (see below), pinned in the consumer, not edited and no tolerance widened"

requirements-completed: [CBT-15]

coverage:
  - id: D1
    description: "54 of the 55 fire-site and hot-branch fixtures pass against the port (checks, events, draw counts, fireRequestTicks exactly); the 55th is an oracle dispute pinned in the consumer"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire-sites.oracle.test.ts"
        status: pass
    human_judgment: true
    rationale: "The pass is conditional on the pinned dispute; a reviewer must decide whether the fixture's expected successFactor is corrected (17-02's file) before the criterion reads fully green"
  - id: D2
    description: "The runner takes a fixture's weapon block as optional hooks and records ctx.fire calls; every Phase 14 consumer and 17-04's fire consumer pass unchanged"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc (35 files with tests/oracles/npc and the independence guard, 1510 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "FIRE_ORACLE_PENDING is empty and oracle-coverage.test.ts asserts it; the Phase 14 guard comment is reworded and the guard holds"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/oracle-coverage.test.ts#no fire fixture file is pending: every one has its oracle test file (plan 17-08)"
        status: pass
    human_judgment: false

duration: 17min
completed: 2026-11-19
status: partial
---

# Phase 17 Plan 08: Fire-site and hot-branch fixtures against the port Summary

**Plan 17-02's independent fire-site and hot-branch fixtures now run against the port through the oracle runner (weapon state as hooks, per-update float32 cooling, a ctx.fire recorder): 54 of 55 pass with no port change, and one fixture is an oracle dispute (it holds the pose where Oolite moves the ship), pinned and unedited.**

## Performance

- **Duration:** about 17 min (2026-11-19T02:04Z to 02:21Z)
- **Tasks:** 2 (Task 1 a tracer)
- **Files:** 1 created, 4 modified, all under `tests/sim/npc/`. No file under `src/` changed.

## Commits

| Commit | Subject | Role |
|--------|---------|------|
| `770991a` | `test(17-08): the oracle runner carries a fixture's weapon state and fire recorder; fire-sites.json runs against the port (tracer)` | Task 1: `weaponHooks`, `RunOptions.fireCalls`, the consumer, the fire-sites.json manifest row |
| `c957441` | `test(17-08): hot-branches.json runs against the port; the fire manifest has no pending file` | Task 2: hot-branches.json row, empty pending list and its assertion, reworded Phase 14 guard comment |

`commits: 2` measured with `git rev-list --count` from `plan_head_before` `ccb314f`.

## Runner support

- `weaponHooks(weapon)` returns `emptyHooks()` plus an assign hook (`self.weapon.temperature = forwardWeaponTemp`, `missedShots`) and an after-update hook that cools once with `coolWeapon(temperature, fixture.dt)`. Update k therefore reads the stated value cooled k - 1 times (contract item 2 of plan 17-02).
- `runFixture(fixture, hooks, options)` takes `RunOptions { fireCalls?: number[] }`. When given, the `SteerContext` gets `fire: () => fireCalls.push(tickNow)` through a conditional spread (exactOptionalPropertyTypes); when absent the context has no `fire`, as before. `emptyHooks()` is unchanged, so every Phase 14 consumer is unchanged.
- The consumer compares `result.failures` (checks within the fixture's tolerances, events, draw count), `result.checks` and `fireRequestTicks` (exactly).

## Fixture results

| File | Fixtures | Pass | Disputed |
|------|----------|------|----------|
| `fire-sites.json` | 24 | 23 | 1 |
| `hot-branches.json` | 31 | 31 | 0 |

Every `fireRequestTicks` list matched exactly in all 55 fixtures, including the disputed one (its checks other than the one below, its events and its draw count also hold). No port fix was needed, so no acceptance run was due (no file under `src/sim/npc/**` changed; the last acceptance run is 17-07's, snapshot `30f2a0c`, 21 of 21).

## Oracle dispute (stops for review; recorded, not edited)

**Fixture:** `fire-site-flee-evasive-hand-over-still-requests` in `tests/oracles/npc/fire-sites/fixtures/fire-sites.json` (plan 17-02).
**Check:** tick 2, `successFactor`, expected 4920 +-0.000001; the port gives 4919.98876953125.

**Diagnosis against the pin `7437f22`.** The fixture's derivation says flee's `success_factor = range = 4920 (4853)` at update 2, which holds the ship's pose from the start (target at 5000 m, both radii 40, so 4920). Oolite does not hold the pose:

1. Update 1 runs `behaviour_evasive_action` (`ShipEntity.m:3996-4036`), which sets `desired_speed = max_available_speed` = 320 (3998-4006), then hands over to FLEE_TARGET.
2. `processBehaviour:` then calls `applyThrust:` (`ShipEntity.m:2634-2636`, `5808-5843`): `dt_thrust = SHIP_THRUST_FACTOR (5) x thrust (32) x delta_t` raises `flightSpeed` from 0 to 1.3333 m/s, then `[self moveForward:delta_t * flightSpeed]` (5843) moves the ship 1.3333 / 120 = 0.011111 m along its forward, which here points at the target.
3. At update 2 the range is 4920 - 0.011111 = 4919.98889, and `success_factor` is a float32 (contract item 8): 4919.98877. That is what the port returns. A debug replay printed the port's state after update 1: speed 1.3333, position z 0.0111111.

So the port matches Oolite and the fixture's expected value is off by one update's displacement. The fixture's own derivation tool states the rule it broke: `pursuit/derive.ts` "does not move or rotate the ship ... A fixture may ask for a later-tick value only where that is exact: a static pose (speed 0 and desired speed 0), a decision that cannot flip inside the horizon ..., or a closed form". The pose here is static at the start (speed 0) but the desired speed is 320, and a range read is not a decision.

**Why a port change is wrong:** the displacement is the flight model that `flight-model.json` already holds the port to.

**Interim handling.** The consumer pins the dispute (`OPEN_DISPUTES`): that fixture's `result.failures` must equal exactly the one message above, and its check count and `fireRequestTicks` must still match. The fixture file is untouched and no tolerance is widened. When the fixture is corrected the pin fails, which forces removing the entry.

**Suggested resolution (owner or the oracle's author, not done here):** change the tick-2 `successFactor` expectation of this fixture to 4919.98889 with a tolerance that covers the float32 spacing at 4920 (about 0.0005), and fix its derivation text; or, alternatively, drop the tick-2 range read and keep the `behaviour` and `desiredSpeed` checks at tick 2. Then delete the `OPEN_DISPUTES` entry.

## Unreachable list comparison (17-02 vs 17-07)

No contradiction. 17-02's unreachable list (`fire-sites.self.test.ts`) and 17-07's table and divergences row (item 23) agree on every shared site: flee's turret-only call (4890-4892; 17-07 writes 4891-4892), fly-to's aft/port/starboard terms (4717), running defense (4819-4824; 17-07 4821 and 4823), the fly-to dodge (4721-4730, Phase 14 divergence 21). They differ only in scope: 17-02 lists the unreachable sub-branches of ported sites (dispatcher turret and aft/port/starboard ready tests 4056-4089, RUNNING_DEFENSE and BROADSIDE branches 4131-4136 and 4171-4176, the six/twelve turret destinations 4537-4549 and 4565); 17-07 additionally lists fire calls of other `fire*Weapon:` methods outside the `fireMainWeapon:` contract (broadside 4328 and 4330, mining 4607, turret cannon 5186 and 5208, scripted AI 5391-5397). 17-07's RUNNING_DEFENSE and BROADSIDE branch lines (4131-4136, 4171-4176) are the same as 17-02's.

## Verification

| Check | Result |
|-------|--------|
| Task 1 targeted (`fire-sites.oracle`, `oracle-coverage`, `attack.oracle`, `pursuit.oracle`, `fire.oracle`) | 5 files, 230 tests passed (at commit `770991a`) |
| `typecheck` after Task 1 | clean |
| `docker compose run --rm test npx vitest run tests/sim/npc tests/oracles/npc tests/guards/oracle-independence.test.ts` | 35 files, 1510 tests passed |
| `docker compose run --rm test` (full, coverage thresholds) | 233 files, 6405 passed, 10 skipped, exit 0 |
| `docker compose run --rm lint`, `docker compose run --rm typecheck` | clean (run after the full suite finished, not beside it) |
| `git diff 39ed00d -- tests/sim/npc/rate-rule.oracle.test.ts` | empty |
| `rg -c "runs exactly the fixtures of its files"` and `rg -c "fireFixtureFilesFor\(THIS_FILE\)"` in the consumer | 1 and 1 |

## Deviations from Plan

None in rule terms. The one open item is the oracle dispute above: the plan's acceptance "every fixture of fire-sites.json passes" is met for 23 of 24 and the 24th is pinned, not passed. `status: partial` in the frontmatter says so.

## Owner questions

1. The oracle dispute above: correct the fixture's expected value (suggested 4919.98889, tolerance about 0.0005) or drop that check? Until then plan 17-02's file and this plan's pin disagree on one number.
2. Informational (carried from 17-04, unchanged): D-07 shot period, `round(rate x 120)` (12, 300, 12) or Oolite's literal counts (13, 301, 13).

## Known Stubs

None.

## Threat Flags

None (test files only).

## Self-Check: PASSED

- Files found: `tests/sim/npc/fire-sites.oracle.test.ts`, `tests/sim/npc/oracle-runner.ts`, `tests/sim/npc/oracle-groups.ts`, `tests/sim/npc/oracle-coverage.test.ts`, `tests/sim/npc/attack.oracle.test.ts`.
- Commits `770991a` and `c957441` are ancestors of HEAD; `commits: 2` measured from `plan_head_before` `ccb314f`.
- The self-check passes on the plan's mechanics; the dispute above is an open review item, not a self-check failure.

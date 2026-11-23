---
phase: 20-player-death-and-game-over
plan: 03
subsystem: testing
tags: [determinism, cadence, player-death, dead-hash, kills, QUAL-11]

requires:
  - phase: 20-player-death-and-game-over
    provides: "20-01: killPlayer, the dead mode, playerDestroyed.cause, the measured lethal nav-buoy ram"
provides:
  - "tests/sim/world/death-cadence.test.ts: the QUAL-11 criterion-4 scenario (an NPC-against-NPC kill, a collision kill and the player's death in one world, equal at 30, 60 and 144 Hz)"
  - "the kill steps (28, 107, 107), the death tick (108) and the cause pinned as literals"
affects: [20-09, 20-10]

actuals:
  tokens: 9000
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "step-counted replay: a scenario whose tick stops (the dead state) ends by counting steps, never by the state's tick"
    - "cross-cadence assertions carry the per-cadence { step, kind, victim, cause } timeline in their message"

key-files:
  created:
    - tests/sim/world/death-cadence.test.ts
  modified: []

key-decisions:
  - "The preferred arrangement worked as planned: one 350 m/s nav-buoy ram is both the collision kill and the death; no fallback and no source change were needed"
  - "Samples are taken every 10th step, at every kill step and at every step after the death (the dead window is the case under test)"

requirements-completed: [QUAL-11]

duration: 25min
completed: 2026-11-23
status: complete
plan_head_before: 187167433a9d0246bc4b0cdeb38dcf7c71593b11
plan_head_after: 0b4eb731ae4fd591e658236c67846c4293fc3917

coverage:
  - id: D1
    description: "One scenario holding an NPC-against-NPC kill, a collision kill and the player's death hashes the same (hashWorld and hashFlight) at every sampled step at 30, 60 and 144 Hz, with the same kill steps, death tick and cause"
    requirement: QUAL-11
    verification:
      - kind: unit
        ref: "tests/sim/world/death-cadence.test.ts#hashWorld and hashFlight equal 60 Hz at every sampled step"
        status: pass
      - kind: unit
        ref: "tests/sim/world/death-cadence.test.ts#the kills and the death are on the same steps with the same cause as at 60 Hz"
        status: pass
    human_judgment: false
  - id: D2
    description: "Non-vacuity and literal pins: all three kills happen once each in a fixed order at every cadence, at the pinned steps (28, 107, 107), death tick 108 and cause scrape/buoy"
    requirement: QUAL-11
    verification:
      - kind: unit
        ref: "tests/sim/world/death-cadence.test.ts#all three kills happen, once each, in the fixed order (non-vacuity)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/death-cadence.test.ts#the kill steps, the death tick and the cause equal the pinned literals"
        status: pass
    human_judgment: false
  - id: D3
    description: "The deterministic dead hash: for 240 steps after the death every hash equals the death-tick hash and the tick stands still; the replay ends by counting steps"
    requirement: QUAL-11
    verification:
      - kind: unit
        ref: "tests/sim/world/death-cadence.test.ts#for 240 steps after the death every hash equals the death-tick hash and the tick stands still (D-01)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/death-cadence.test.ts#the replay ended by counting steps, not by the frame bound or the step budget"
        status: pass
    human_judgment: false
---

# Phase 20 Plan 03: Cross-cadence kill and death scenario Summary

**One Vitest scenario holds an NPC kill, a buoy collision kill and the player's death in a single world and replays it at 30, 60 and 144 Hz: every sampled `hashWorld` and `hashFlight` is equal, the three kills sit on pinned steps 28, 107 and 107, and the dead world keeps its death-tick hash for 240 steps.**

## Performance

- **Duration:** about 25 min
- **Tasks:** 2
- **Files changed:** 1 (created), no file under `src/` or `tests/acceptance/`
- **Run time of the file:** about 0.05 s for all 16 cases (the three replays run once at import)

## Accomplishments

- `tests/sim/world/death-cadence.test.ts`: the frame runner of `collision-cadence.test.ts` with a step counter instead of the tick-based end (the tick stops at death, so a tick-based end would run to the frame bound and throw). The replay ends `POST_DEATH_STEPS` (240) steps after the death; the test asserts it ended that way and not on the 1,000-step hard budget or the frame bound.
- The three kills, in one world: a Viper test pilot's beam kills an Adder at `FAR` (1e7 m out), the player rams the nav buoy at 350 m/s from 400 m and the buoy and the player die on one contact (D-09).
- Pinned literals: `KILL_STEPS = [28, 107, 107]`, `DEATH_TICK = 108`, `DEATH_CAUSE = { damage: "scrape", culprit: "buoy" }`. A mutation check (`NPC_KILL_STEP` changed to 29) fails the three pin cases while the cross-cadence equality cases still pass, showing the pins catch a shift common to the cadences.
- Failure diagnostics: every cross-cadence assertion carries the per-cadence timeline `{ step, kind, victim, cause }`, the death step and tick, and why each replay ended.

## Arrangement used

The preferred one: the NPC fight parked far from the player's path, and the full-speed buoy ram that kills both the buoy and the player. The alternative (a resting Krait, then the buoy) and the per-kind fallback were not needed, so criterion 4's "one scenario" wording stands and no deviation was recorded. The buoy ram at 350 m/s from 400 m reproduces 20-01's measurement exactly: contact 105 ticks after the placement tick (step 2), so step 107, and the state's tick is 108 at death.

## Scratch feasibility run (Task 1, never committed)

Run from the session scratchpad mounted at `/app/tests/zz-scratch` (outside the repository), the NPC kill alone (a Viper test pilot holding an Adder 1,000 m ahead, Adder energy 13, the same world setup and options as the scenario, the player parked 2 km off the buoy):

| Cadence | Kill step (from the first `stepSim` call) | Tick | Victim / killer | World hash at step 120 |
|---------|-------------------------------------------|------|-----------------|------------------------|
| 30 Hz | 28 | 29 | Adder 101 / Viper 102 | acf22c38 |
| 60 Hz | 28 | 29 | Adder 101 / Viper 102 | acf22c38 |
| 144 Hz | 28 | 29 | Adder 101 / Viper 102 | acf22c38 |

The beam's period is 13 ticks, so the three hits land 1, 14 and 27 steps after the spawn (the spawn is at step 2) and the kill is on step 28 in the full scenario too (confirmed by the green pin).

## Scenario timeline (all three cadences)

| Step | Kind | Victim | Cause |
|------|------|--------|-------|
| 28 | `shipDestroyed` | Adder (3rd beam hit, the Viper credited) | killer = the Viper's id (an NPC, not the player) |
| 107 | `shipDestroyed` | nav buoy (id 5) | killer = player (the scrape record) |
| 107 | `playerDestroyed` | player | `{ damage: "scrape", culprit: "buoy" }`, tick 108 |

Samples: every 10th step before the death, every kill step, and every step from the death on (about 250 world and flight samples per cadence over steps 2 to 347; the test asserts more than 240). The step budget is `deathStep + 240` = step 347, the 348th `stepSim` call; the hard bound is 1,000 steps.

## Task Commits

1. **Task 1: the player's death and the buoy kill across the cadences (tracer)** - `b805f5e` (test)
2. **Task 2: the NPC kill joins the scenario, three kills pinned** - `0b4eb73` (test)

**Plan metadata:** the commit that adds this SUMMARY (docs). Each task commit changes only `tests/sim/world/death-cadence.test.ts` (`git show --stat`: 367 insertions; 120 insertions, 17 deletions).

## Files Created/Modified

- `tests/sim/world/death-cadence.test.ts` - the QUAL-11 cross-cadence kill scenario

## Decisions Made

- The step index is counted from the first `stepSim` call (step 0 is the launch tick), so the literals do not depend on the `START_TICK` convention; `DEATH_TICK` pins the tick the death leaves in the state.
- Every step after the death is sampled, not every tenth, because the dead window is the behaviour the owner's decision describes.

## Deviations from Plan

None - plan executed exactly as written. Process note on the TDD flags: both tasks are `tdd="true"` but the plan changes no source file, so the behaviour already exists and the new tests pass on first run; there is no RED commit and no production code for a GREEN. The pins were obtained by measurement (a first run printed the actual death step through a failing literal assertion) and then verified with a mutation check, as the plan's "printed once by the test and then pinned" asks. Tracer gate: the tracer's `<verify>` was re-run before Task 2 (16 cases green, typecheck green).

## Issues Encountered

None. Worktree bookkeeping: the git directory is outside the worktree and the plan commit ledger file was not written; `plan_head_before` is the verified spawn base `1871674` (full SHA in the frontmatter) and `commits` is measured with `git rev-list --count 187167433a9d0246bc4b0cdeb38dcf7c71593b11..HEAD` (2 task commits at SUMMARY time).

## Plan-boundary verification

- `docker compose run --rm lint`: exit 0 (eslint and prettier)
- `docker compose run --rm typecheck`: exit 0
- `docker compose run --rm test` (HEAD `0b4eb73`): the full run exited 1 on 11 test files that hit their per-test timeout (5000 ms, one 30,000 ms: `tools-determinism`, `tick-flyers`, `world-lifecycle`, `collision-buoy`, `kill.property`, `attack-dispatch`, `hot-weapon`, `ship-mass`, `static-hulls`, `textures`, the openstep `parser`), with three other executors and their test runs sharing the machine. None is a file this plan touches, and `death-cadence.test.ts` and `collision-cadence.test.ts` passed in the run. All 11 files pass when rerun with `--maxWorkers=1` (a first parallel rerun of ten of them passed six and timed out four under load again). Same load-induced pattern as 20-01's note (`textures.test.ts` is a known flake). No coverage threshold line appeared.
- No remote gate (`verify`) by the plan's gate policy; the 20-seed acceptance run is not required (no file under `src/sim/npc/**`, `src/sim/world/**` or `src/content/generated/ships-npc.json` changed). Nothing under `tests/acceptance/**` was edited (T-20-09).

## Known Stubs

None.

## Threat Flags

None. No source, endpoint, auth path or storage surface changed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

20-09's Node twin can reuse the 350 m/s ram literals (death step 107 from the placement at tick 2, tick 108). 20-10 records the criterion-4 result. No blockers.

---
*Phase: 20-player-death-and-game-over*
*Completed: 2026-11-23*

## Self-Check: PASSED

The created test file exists, both task commits (`b805f5e`, `0b4eb73`) are ancestors of HEAD, the working tree held only this SUMMARY before its commit, and the acceptance criteria of both tasks were run: `CADENCES = [30, 60, 144]` once; `state.tick >= END_TICK` and `killPlayer` absent; `DEATH_STEP|DEATH_CAUSE` 11 matches; `shipDestroyed` 6, `createTestPilotAi` 2, `KILL_STEPS` 3; the targeted Vitest run, typecheck and lint exit 0.

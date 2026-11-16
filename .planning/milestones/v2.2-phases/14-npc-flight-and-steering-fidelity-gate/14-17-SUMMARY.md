---
phase: 14-npc-flight-and-steering-fidelity-gate
plan: 17
subsystem: tests
tags: [npc-flight, acceptance, detectors, hull-crossing, run-minimums, freeze, owner-checkpoint]
status: complete

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: plan 14-07's frozen thresholds.ts (b33e72f) and the empty accepted-crossings list; plan 14-16's flight-script pilot, scriptGoalMetric and FLYER_SCRIPT_RANGES; the populated inert Lave world (ids 101 to 112)
provides:
  - tests/acceptance/detectors.ts, the seed set-up (setUpSeed), the stuck, frozen, hull-crossing (three classes, episodes), station-sphere, frustration, repair, AI fault and drop detectors, the run-minimum tallies, checkRunMinimums and registerAcceptanceRun
  - tests/acceptance/detectors.test.ts, one forced violation per detector and class, episode grouping, accepted entries of each class, the clean control and the no-AI control
  - tests/acceptance/npc-flight.acceptance.ts, the ten pinned lines (registerAcceptanceRun only), behind the byte-for-byte exact-content gate
  - vitest.acceptance.config.ts and npm run test:acceptance, the 20-seed run outside the default suite and outside verify and verify-full
  - the recorded 20-seed run: 21 of 21 cases pass with ACCEPTED_HULL_CROSSINGS empty, 137.6 s against the 30 minute budget
affects: [14-18, 14-19]

requirements-completed: []
requirements-advanced: [AI-01]

plan_head_before: a68256a39cbc39d029b037ceb5eff42d9acb96ab
plan_head_after: ab7343bf300549a95a22576afc2d903d6dd52e17

actuals:
  tokens: 20800
  tasks: 4
  commits: 1

tech-stack:
  added: []
  patterns:
    - "A frozen acceptance harness is committed once, after a run of epoch 1 only, and the freeze check (git rev-list counts plus a clean status) is a command, not a CI test, repeated before the run, before the final run and in plan 14-19"
    - "The Vitest entry of a frozen run is a ten-line file compared whole through cmp against printf output, so no epoch list, filter, skip or comment can enter it"

key-files:
  created:
    - tests/acceptance/detectors.ts
    - tests/acceptance/detectors.test.ts
    - tests/acceptance/npc-flight.acceptance.ts
    - vitest.acceptance.config.ts
  modified:
    - package.json
    - CHANGELOG.md
    - tests/helpers/traffic-fixture.ts

key-decisions:
  - "Owner checkpoint (Task 3) resolved as option-continue on 2026-11-16 by an owner-delegated review panel, not by the owner reading the run: the owner delegated the accept/continue decision of this phase to a review panel, and three independent reviewers (Fable, Opus, Sonnet) read the harness and each returned TRUST-WITH-CAVEATS; none found a vacuous detector or a weakened threshold. The run is green with nothing to accept, so no accepted-crossings entry, no src/sim fix and no harness change was made"
  - "The harness commit ab7343b changed traffic-fixture.ts by one line (exporting committedTrafficContent for the step masses); it is not a frozen file"

patterns-established:
  - "Per-seed observability: every epoch case prints one ACCEPTANCE-SEED JSON line and the run-minimum case one ACCEPTANCE-TOTALS line, so the per-seed table is reproducible from the run log"

coverage:
  - id: D1
    description: "Each detector is proven non-vacuous before the run: a forced hull-crossing segment of each of the three classes, a zero-length segment under a moving hull, a station-sphere entry, a stalled goal, a frozen flyer, an injected NaN, a frustration event and an AVOID_COLLISION entry each trip their detector or tally, and a clean control trips none; the no-AI control shows every goal unmet at t0 and the five floors that fail a run where nothing flies all missed"
    requirement: AI-01
    verification:
      - kind: unit
        ref: "tests/acceptance/detectors.test.ts"
        status: pass
    human_judgment: false
  - id: D2
    description: "The acceptance entry is exactly the ten pinned lines; the exact-content gate (cmp of printf output) passes on the real file and, in Task 1, failed on five scratch copies under /tmp (sliced epoch list, swapped runner import, extra line, code after a block comment closing on a *-prefixed line, code after a one-line block comment)"
    requirement: AI-01
    verification:
      - kind: command
        ref: "printf '%s\\n' <ten lines> | cmp -s - tests/acceptance/npc-flight.acceptance.ts (exit 0, re-run before and after the final run)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The 20-seed run (Lave epochs 1 to 20, 18,000 ticks each, hashWorld every tick) passes all 21 cases against the thresholds of b33e72f with ACCEPTED_HULL_CROSSINGS empty: zero stuck, frozen, frustration, station-sphere, hull-crossing, repair, aiFaulted, aiDropped and hashWorld failures on every seed, and every run minimum met"
    requirement: AI-01
    verification:
      - kind: command
        ref: "docker compose run --rm test sh -lc 'npm run test:acceptance; echo acceptance-exit=$?' (21 passed, acceptance-exit=0, 137.6 s)"
        status: pass
    human_judgment: false
  - id: D4
    description: "The freeze set is intact: thresholds.ts has exactly one commit (b33e72f), the three acceptance harness files have exactly one commit (ab7343b) and no trailer commit, flight-script.ts and test-spawn.ts have no commit since the harness commit, and no frozen file has an uncommitted edit"
    requirement: AI-01
    verification:
      - kind: command
        ref: "the plan's freeze-check command (exit 0 before and after the final run)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The full local suite with the src/sim coverage floors, lint and both typecheck projects pass; the 20-seed run is outside the default suite (the acceptance file does not end in .test.ts)"
    verification:
      - kind: command
        ref: "docker compose run --rm test (exit 0, 202 files, 4982 passed, 10 skipped, 207.6 s); docker compose run --rm lint; docker compose run --rm typecheck"
        status: pass
    human_judgment: false
  - id: D6
    description: "Residual risks of the accepted run (caveats 1 to 5 below) are recorded and not repaired: the harness and thresholds are frozen"
    requirement: AI-01
    verification: []
    human_judgment: true

duration: resumed in two sessions (harness and epoch 1, then the recorded run)
completed: 2026-11-16
---

# Phase 14 Plan 17: The 20-seed NPC flight acceptance run Summary

**A frozen acceptance harness (seed set-up, ten detectors, run minimums, a ten-line entry file behind a byte-for-byte gate) ran the 20 Lave epochs of the NPC flight port against the thresholds committed before the port: 21 of 21 cases pass in 137.6 s with an empty accepted-crossings list, zero of every failure counter on every seed and every run minimum met.**

## Performance

- **Duration:** two sessions (Tasks 1 and 2 with the checkpoint stop, then Task 4 and this summary)
- **Tasks:** 4 of 4 (Task 1 the `tracer`, Task 3 the blocking-human checkpoint, resolved as option-continue)
- **Commits:** 1 measured (`git rev-list --count a68256a..ab7343b` = 1; Task 2, Task 3 and Task 4 changed no file)
- **Files:** 4 created, 3 modified (about 20,800 tokens by chars/4 over the added and removed lines of `a68256a..ab7343b`, the measured base)

## Accomplishments

- **Detectors and set-up** (`detectors.ts`): `setUpSeed(epoch, { withAi })` converts the 12 inert ships by `SCRIPT_MAPPING`, moves them to `FLYER_START_OFFSETS`, writes the escort `ownerId` and `steer.escortSlot` directly, and applies the parking rule; the per-tick observers implement each definition of `thresholds.ts` (stuck and frozen windows, the two-stage hull-crossing test with the collision radius first and zero-length segments tested as points, three crossing classes grouped into episodes, station sphere, frustration, repairs, AI fault and drop) and the run-minimum tallies; `registerAcceptanceRun(it, accepted)` registers `epoch 1` to `epoch 20` and `run minimums`, 21 cases.
- **The entry and the script:** `npc-flight.acceptance.ts` is the ten pinned lines; `npm run test:acceptance` runs it with `vitest.acceptance.config.ts`, outside `npm test`, `verify` and `verify-full`.
- **The recorded run** and the owner-delegated acceptance, below.

## Task Commits

1. **Task 1 (tracer): the seed set-up, detectors, run registration, the entry file behind its gate, and epoch 1 end to end** - `ab7343b` (test), the harness commit. Only epoch 1 ran before it. The commit also adds one `CHANGELOG.md` line group, the `test:acceptance` script and a one-line export of `committedTrafficContent` in `tests/helpers/traffic-fixture.ts`.
2. **Task 2: the 20-seed run and the result prepared for the owner** - no commit (it changed no file; the run was clean, so no port fix was needed).
3. **Task 3: the blocking-human checkpoint** - no commit; resolved as option-continue, see the decision below.
4. **Task 4: apply the answer and make the final recorded run** - no commit; option-continue changes nothing. The final run is the one recorded here.

Reference commits: `thresholds.ts` is the single commit `b33e72f` (plan 14-07); the harness commit is `ab7343b`; `plan_head_before` is `a68256a39cbc39d029b037ceb5eff42d9acb96ab`, `plan_head_after` is `ab7343bf300549a95a22576afc2d903d6dd52e17`.

## The decision at Task 3 (blocking-human) and how it was made

- **Date:** 2026-11-16.
- **Answer:** option-continue (record the run and go on). The run was green with nothing to accept, so there was no breach to resolve and none of the options (a), (b) or (c) was used.
- **Who decided, stated honestly:** the acceptance was made by a review panel on the owner's delegation, **not by the owner reading the run**. The owner delegated the accept/continue decision of this phase to a review panel. On 2026-11-16 three independent reviewers (Fable, Opus, Sonnet) read the harness and each returned TRUST-WITH-CAVEATS; none found a vacuous detector or a weakened threshold. Plan 14-19's owner gate (the fidelity report and the oracle choice) is the owner's own look at this result, and it should be read with the residual risks below.
- **Consequences:** `accepted-crossings.ts` is unchanged (empty); no `src/sim` file was touched; no harness file was edited, so no `Detector-change-approved-by-owner` trailer exists and none is needed.

## The recorded run (Task 4, the final run of this plan)

Command: `docker compose run --rm test sh -lc 'npm run test:acceptance; echo "acceptance-exit=$?"'` at HEAD `ab7343b`, local Docker.

- **Result:** 21 of 21 cases passed (epochs 1 to 20 and `run minimums`), `acceptance-exit=0`.
- **Wall time:** 137.6 s by Vitest (137.2 s of tests), 138 s by the wall clock including the container start, against `ACCEPTANCE_RUN_BUDGET_MS` = 1,800,000 ms (30 minutes): 7.6 % of the budget. Each epoch took 6.7 to 7.3 s against the 300 s per-epoch timeout. The earlier run at the checkpoint measured 137.8 s; the two runs agree.
- **Accepted episodes:** none.
- **Failure counters:** on every one of the 20 seeds stuck, frozen, frustration, stationSphere, hullCrossingEpisodes, hullCrossingsUnexcused, repairs, aiFaulted, aiDropped and hashFailures are 0 (checked by script over the 20 `ACCEPTANCE-SEED` lines).
- **Run minimums (sum over 20 seeds, floor in brackets):** stationArrivals 40 (20), interceptArrivals 40 (20), fleeArrivals 40 (20), avoidCollisionEntries 23 (20), attackTicksNearPlayer 61,662 (5,500), stuckWindowsEvaluated 175 (60), frozenWindowsEvaluated 294 (40). All met.
- **Clearances:** minimum station-sphere clearance 1,994.67 m (epochs 1, 12, 17, 19 and 20 share it); minimum hull clearance 41.41 m (epoch 10).

### Per-seed record

Reproduced from the `ACCEPTANCE-SEED` lines of the final run's log. All failure counters are 0 on every row. `arrivals` = station / intercept / flee arrivals; `goal ticks` = ticks with the goal met for the station, intercept and flee scripts; clearances in metres; `ms` = the epoch's elapsed time.

| Epoch | arrivals | avoid entries | attack ticks near player | stuck windows evaluated | frozen windows evaluated | goal ticks (station / intercept / flee) | min station clearance | min hull clearance | ms |
|------:|:--------:|:-------------:|-------------------------:|------------------------:|-------------------------:|:----------------------------------------|----------------------:|-------------------:|----:|
| 1 | 2 / 2 / 2 | 1 | 2,972 | 9 | 14 | 26,921 / 23,721 / 15,385 | 1,994.67 | 47.18 | 7,290 |
| 2 | 2 / 2 / 2 | 1 | 3,091 | 9 | 14 | 25,569 / 23,778 / 16,324 | 1,995.88 | 47.18 | 7,075 |
| 3 | 2 / 2 / 2 | 1 | 2,960 | 8 | 13 | 24,500 / 24,835 / 18,191 | 1,994.82 | 46.01 | 6,839 |
| 4 | 2 / 2 / 2 | 1 | 3,197 | 8 | 15 | 25,659 / 24,041 / 17,889 | 1,995.14 | 47.18 | 6,794 |
| 5 | 2 / 2 / 2 | 1 | 2,061 | 8 | 15 | 25,776 / 24,834 / 17,382 | 1,997.02 | 46.01 | 6,818 |
| 6 | 2 / 2 / 2 | 1 | 2,014 | 8 | 15 | 25,659 / 24,837 / 17,888 | 1,995.14 | 46.01 | 6,780 |
| 7 | 2 / 2 / 2 | 1 | 3,164 | 10 | 16 | 25,483 / 23,009 / 16,320 | 1,995.58 | 49.82 | 6,954 |
| 8 | 2 / 2 / 2 | 1 | 3,865 | 9 | 14 | 25,659 / 23,748 / 15,383 | 1,995.14 | 47.18 | 6,928 |
| 9 | 2 / 2 / 2 | 1 | 3,006 | 8 | 13 | 26,410 / 24,071 / 18,189 | 1,995.58 | 47.18 | 6,779 |
| 10 | 2 / 2 / 2 | 2 | 4,106 | 9 | 14 | 25,483 / 22,883 / 16,320 | 1,995.58 | 41.41 | 6,826 |
| 11 | 2 / 2 / 2 | 1 | 3,422 | 10 | 15 | 26,410 / 21,845 / 16,320 | 1,995.58 | 54.23 | 6,939 |
| 12 | 2 / 2 / 2 | 1 | 3,880 | 8 | 13 | 26,080 / 24,736 / 19,458 | 1,994.67 | 47.18 | 6,758 |
| 13 | 2 / 2 / 2 | 1 | 2,385 | 10 | 17 | 23,659 / 23,025 / 16,322 | 1,994.82 | 49.82 | 6,730 |
| 14 | 2 / 2 / 2 | 1 | 2,950 | 9 | 15 | 25,659 / 23,006 / 19,453 | 1,995.14 | 49.82 | 6,764 |
| 15 | 2 / 2 / 2 | 1 | 3,257 | 8 | 15 | 26,324 / 24,915 / 19,458 | 1,995.58 | 47.89 | 6,707 |
| 16 | 2 / 2 / 2 | 1 | 3,826 | 9 | 16 | 25,483 / 23,144 / 19,463 | 1,995.58 | 54.23 | 6,951 |
| 17 | 2 / 2 / 2 | 1 | 2,916 | 9 | 14 | 26,080 / 24,074 / 16,321 | 1,994.67 | 47.18 | 6,775 |
| 18 | 2 / 2 / 2 | 2 | 2,166 | 8 | 15 | 25,659 / 22,430 / 18,187 | 1,995.14 | 47.18 | 6,728 |
| 19 | 2 / 2 / 2 | 1 | 2,962 | 8 | 15 | 26,921 / 23,780 / 18,192 | 1,994.67 | 47.18 | 6,788 |
| 20 | 2 / 2 / 2 | 2 | 3,462 | 10 | 16 | 25,097 / 24,012 / 16,322 | 1,994.67 | 49.82 | 6,866 |
| **Sum** | 40 / 40 / 40 | 23 | 61,662 | 175 | 294 | | min 1,994.67 | min 41.41 | |

The goal-tick columns count every tick over the 18,000-tick horizon at which the script's goal is met, over all flyers of that script (two per script), so they exceed 18,000 by design.

### Epoch 1 at the harness commit

Epoch 1 alone ran before `ab7343b` (Task 1's tracer step) and ran end to end. In the final run epoch 1 took 7.3 s, so the projection to 20 epochs is about 146 s; the measured run was 137.6 s. The projection and the measurement are both far inside the 30 minute budget, so no budget question reached the owner.

## Verification

- Freeze check (the plan's command: thresholds.ts one commit, the three harness files one commit without the trailer, no commit since `ab7343b` touching flight-script.ts or test-spawn.ts without the trailer, clean status): passed before the final run and again after it. `git log -- tests/acceptance/thresholds.ts` shows only `b33e72f`.
- Exact-content gate: passed before and after the run.
- `docker compose run --rm test npm run test:acceptance`: 21 passed, exit 0 (above).
- `docker compose run --rm test` (full, with the `src/sim` coverage floors): exit 0, 202 files, 4,982 passed, 10 skipped, 207.6 s. `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: both projects clean.
- No `verify` or `verify-full` was run, per the plan's gate policy (tests only; `src/sim` untouched). No remote run was needed.

## Residual risks recorded from the review panel (verbatim, not repaired)

The acceptance was made with these caveats. None is fixed here: the harness and `thresholds.ts` are frozen, and any change to a frozen file needs the owner's option (c) and a commit carrying the `Detector-change-approved-by-owner` trailer.

1. avoidCollisionEntries is a run-wide sum (23 vs 20) that does not name the flyer; the per-seed lines show >=1 on every seed (2 on epochs 10, 18, 20), which is the only per-seed evidence.
2. Zero station-sphere entries and zero hull crossings are close to certain by design (station flyers stop at 2,500 m; the designed near pass stays ~83 m away); thresholds.ts:73-77 accepts this residual. All 20 seeds fly near-identical geometry, so seed spread is narrow (thresholds.ts:90-96).
3. tests/acceptance/detectors.test.ts:164-177 ("uses the collision radius for stage A") asserts only typeof result === "boolean" and is vacuous. The harness is frozen; changing it needs the owner's option (c) and the Detector-change-approved-by-owner trailer. **Follow-up item for the owner** (recorded as an open `deviation` entry in `.planning/WINDOWS.md`, so it blocks `/gsd-ship` until the owner resolves it).
4. Frustration is covered only in two halves (pilot counter and observer); no live case forces a stall. The harness also skips a body with no hull-table entry silently; all ten spec keys are present today.
5. The frozen-path sum omits the first-tick segment (marginally stricter), and no PlayerCombatState is passed (the player is never shot at; no threshold depends on it).

## Deviations from Plan

None. The plan executed as written. Task 2 needed no port fix and Task 4 under option-continue changed no file. Two points of record, neither a deviation from a rule:

- The acceptance decision was taken by the owner-delegated review panel, not by the owner at the checkpoint; it is recorded as such above rather than as an owner answer.
- Task 1's harness commit also touched `CHANGELOG.md` and exported `committedTrafficContent` from `tests/helpers/traffic-fixture.ts` (a one-line change outside the frozen set), both stated in the commit message.

## Known Stubs

None.

## Threat Flags

None. No network endpoint, auth path or schema change; the only new executable surface is the `test:acceptance` npm script and the acceptance-only Vitest config.

## Facts for the next plans

- **Plan 14-18 (session, replay flight table, `spawnTestFlyers` hook, browser smoke):** it starts on a green acceptance run; `src/sim/npc/` and the steering wiring were not changed here, so its remote evidence is not stale. `spawnTestFlyers` takes the station centre as its sixth argument (plan 14-16). Any later edit of `flight-script.ts` or `test-spawn.ts` needs the trailer and fails the freeze check otherwise.
- **Plan 14-19 (divergence and fidelity report):** repeat the freeze check and the exact-content gate; repeat `npm run test:acceptance` only if the simulation or acceptance code changed since `ab7343b` (this run is the recorded one). Report in the fidelity report and the acceptance Key Decisions row: the accepted-crossings list is empty; the acceptance was made by the delegated panel on 2026-11-16; the five residual risks above, in particular the two named accepted residuals (no head-on closure in the run; near-identical geometry on all 20 seeds, so a zero crossing count is evidence about near passes inside the alert band, attack passes and arrivals, not head-on closure, which the oracle fixtures of plan 14-06 and the world cases of plan 14-15 cover) and the vacuous stage-A assertion in `detectors.test.ts` as a follow-up for the owner.
- The log format is stable: one `ACCEPTANCE-SEED {...}` JSON line per epoch (keys: epoch, ticks, elapsedMs, the ten counters, tallies, goalTicks, minStationClearance, minHullClearance) and one `ACCEPTANCE-TOTALS {...}` line.

## Self-Check: PASSED

- Harness commit `ab7343b` is an ancestor of HEAD; `b33e72f` is the single commit of thresholds.ts; `tests/acceptance/detectors.ts`, `detectors.test.ts`, `npc-flight.acceptance.ts` and `vitest.acceptance.config.ts` exist; `test:acceptance` is in `package.json`.

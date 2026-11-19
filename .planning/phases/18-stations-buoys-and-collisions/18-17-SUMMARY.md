---
phase: 18-stations-buoys-and-collisions
plan: 17
subsystem: simulation
tags: [world, drift, braking, float32, oracle, buoys, D-02, PD-02, CBT-18]

requires:
  - phase: 18-stations-buoys-and-collisions
    provides: "18-03 braking-npc.json fixtures; 18-14 World.buoys (offset, velocity); 18-20 real-Oolite buoy-ram verdicts (no MISMATCH); 18-10 the float32 drift-brake pattern"
provides:
  - "src/sim/world/drift.ts: SHIP_DRIFT_THRUST_FACTOR, BUOY_THRUST, brakeShipDrift, stepShipDrift, stepBuoyDrift"
  - "stepWorld runs the ship and buoy drift passes after the steering loop and before stepDebris"
  - "tests/sim/world/ship-braking.oracle.test.ts: the port against every braking-npc fixture"
affects: [18-11, 18-18, 18-19, 18-21, 18-12]

actuals:
  tokens: 10000
  tasks: 2
  commits: 3
plan_head_before: 543b9be83b797526b3f39304285d76b7544af96b
plan_head_after: 848a2d68867e3cc9454ce082b135e8413132daa9

tech-stack:
  added: []
  patterns:
    - "NPC and buoy drift share one float32 brake (brakeShipDrift) with the 18-03 oracle's GLfloat rounding; the velocity itself is narrowed to float32 at each brake, as in 18-10"
    - "Drift passes write nothing for a body at rest, so a world that pushes nothing hashes byte for byte as before"

key-files:
  created:
    - src/sim/world/drift.ts
    - tests/sim/world/drift.test.ts
    - tests/sim/world/ship-braking.oracle.test.ts
  modified:
    - src/sim/world/step.ts
    - src/sim/npc/flight.ts
    - tests/sim/world/world-cadence.test.ts

key-decisions:
  - "The ship and buoy drift is one pass after the whole steering loop (plan stage placement): a later ship's steering in the same tick reads an earlier ship's position before that ship's drift, unlike Oolite's per-ship update. Recorded in the drift.ts doc comment for the FIDELITY walk."
  - "brakeShipDrift returns the zero vector for a non-finite input even when thrust is 0, so a thrust-0 ship never moves by NaN; a non-finite position result is not written (the sanitiser repairs)."
  - "Positions are clamped at MAX_ENTITY_MAGNITUDE (the sanitiser's position domain), velocities at MAX_ENTITY_VELOCITY, buoy offsets at MAX_BUOY_OFFSET."

patterns-established:
  - "An oracle consumer replays each fixture twice: through the kernel and through the real world pass, so the stage wiring is held to the fixture too"

requirements-completed: [CBT-18]

coverage:
  - id: D1
    description: "NPC ships brake their drift by 5 x thrust x dt (only when thrust is non-zero) and move by it, steered or inert; Krait 50 m/s stops at tick 35, 6.94 m out"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/drift.test.ts#a pushed Krait drifts and comes to rest (D-02)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/ship-braking.oracle.test.ts (4 fixtures x kernel and ship pass, manifest)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Buoys move when pushed and brake by thrust 100 (500 m/s^2); 100 m/s stops at tick 25 after 9.583 m; a destroyed buoy never moves"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/drift.test.ts#a pushed buoy drifts and comes to rest (PD-02)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/ship-braking.oracle.test.ts#brake-ship-buoy-thrust-100-from-100 the buoy drift pass (PD-02)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/drift.test.ts#BUOY_THRUST equals the compiled buoy record's thrust"
        status: pass
    human_judgment: false
  - id: D3
    description: "A world at rest writes nothing; clamps, NaN and the 1e-50 underflow; drifting Krait and buoys hash equal at 30, 60 and 144 Hz; world-cadence, npc-cadence, populate and flight-hash pins unchanged; frozen acceptance worlds unchanged"
    requirement: CBT-18
    verification:
      - kind: unit
        ref: "tests/sim/world/drift.test.ts#a world at rest writes nothing (criterion 5)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/drift.test.ts#clamps and repair (T-18-24, T-18-35)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/drift.test.ts#a drifting Krait and a drifting buoy hash equal at 30, 60 and 144 Hz"
        status: pass
      - kind: unit
        ref: "tests/sim/world/world-cadence.test.ts, tests/sim/npc/npc-cadence.test.ts, tests/sim/world/populate.test.ts, tests/sim/world/flight-hash-pins.test.ts"
        status: pass
      - kind: other
        ref: "remote: wegolite-remote-run.sh run --rm test npm run test:acceptance (21/21, numbers unchanged, snapshot=848a2d6)"
        status: pass
    human_judgment: false

duration: 16min
completed: 2026-11-19
status: complete
---

# Phase 18 Plan 17: NPC and Buoy Drift Summary

**NPC ships and both buoys now carry and lose their Newtonian drift as Oolite does. A float32 port of `applyThrust:`'s brake (`ShipEntity.m:5816-5823`, 5 x thrust x dt, only for non-zero thrust) runs in a pass after the steering loop, followed by the move by the braked velocity (`Entity.m:878-881`). All four `braking-npc.json` fixtures pass, buoy included, with exact stop ticks. A world that pushes nothing hashes byte for byte as before.**

## Performance

- **Duration:** about 16 min
- **Started:** 2026-11-19T21:44:20Z
- **Completed:** 2026-11-19T22:00:04Z
- **Tasks:** 2 (both TDD; Task 1 a tracer)
- **Files:** 6 (3 created, 3 modified)

## Stop ticks and distances

| Body | Start drift | Thrust | Stop tick | Distance | Source |
|---|---|---|---|---|---|
| Krait (hand case) | 50 m/s | 35 | 35 | 6.936 m | `drift.test.ts`, exact arithmetic `(1700 - 867.708) / 120` |
| Krait (fixture) | (60, 0, 80), 100 m/s | 35 | 69 | (16.894, 0, 22.525) m | `brake-ship-krait-thrust-35` |
| Nav buoy (hand case and fixture) | 100 m/s | 100 | 25 | 9.583 m | `brake-ship-buoy-thrust-100-from-100`, PD-02 "about 10 m" |
| Shuttle (fixture) | 25 m/s | 16 | 38 | 3.803 m | `brake-ship-shuttle-thrust-16` |
| Pod (fixture) | 13 m/s | 0 | never | (6, -8, 24) m in 240 ticks | `brake-ship-pod-thrust-zero-drifts` |

## Braking fixture results

`tests/sim/world/ship-braking.oracle.test.ts` replays every `braking-npc.json` fixture twice, once through `brakeShipDrift` alone and once through `stepShipDrift` with a flight row of the fixture's thrust. The buoy fixture also runs through `stepBuoyDrift` on `World.buoys.navBuoy`. That is 9 runs plus the manifest case, 10 of 10 passed. Stop ticks match exactly, and speeds, position change and final drift match within the fixtures' relative tolerance of 1e-6. Mutation check: with `f` replaced by the identity (a double port), 7 of the 10 cases fail, every case of the three braking fixtures. The pod fixture, which has thrust 0, passes either way.

## Task Commits

1. **Task 1 (tracer): a pushed Krait and a pushed buoy drift and come to rest, end to end.** `6350493` (test, RED: skeleton and hand cases), then `5577cd0` (feat, GREEN). Tracer gate in auto mode: the task's verify was rerun end to end before Task 2 and passed (5 files, 83 tests; typecheck clean).
2. **Task 2: the braking fixtures against the port, the thrust pin and the acceptance run.** `848a2d6` (test). The port already existed, so this commit only adds the consumer and the pin. It passed on the first run.

## TDD Gate Compliance

- RED 1: `docker compose run --rm test npx vitest run tests/sim/world/drift.test.ts -t "stops at tick 35" --reporter=tap-flat` exited 1. The classifier returned `RED_EVIDENCE_OK / target_test_failed`. The semantic assessment matches: the target ran and failed on its planned assertion (`expected -1 to be 35`), because the skeleton never brakes. The RED commit carried only the type skeleton.
- Task 2 is a consumer of an existing port, so it has no separate RED/GREEN pair. Its fixtures passed against the Task 1 implementation, and the mutation check above shows they discriminate.

## Verification

- `docker compose run --rm test npx vitest run tests/sim/world/drift.test.ts tests/sim/world/world-cadence.test.ts tests/sim/world/flight-hash-pins.test.ts tests/sim/world/populate.test.ts tests/sim/npc/npc-cadence.test.ts`: 5 files, 83 passed.
- `docker compose run --rm test npx vitest run tests/sim/world tests/oracles/combat/response tests/guards/oracle-independence.test.ts`: all passed.
- `docker compose run --rm test` (full suite with coverage): exit 0, 250 files, 6,799 passed, 10 skipped.
- `docker compose run --rm lint`: clean. `docker compose run --rm typecheck`: clean, no `error TS`.
- **Remote acceptance (QUAL-11, AGENTS.md):** `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance` returned `exit=0 elapsed=77s snapshot=848a2d6`. 21 of 21 passed (20 epochs plus the run-minimums case) in 75.21 s.
  - Every failure counter is 0 on all 20 seeds: stuck, frozen, frustration, stationSphere, hull-crossing episodes and unexcused crossings, repairs, aiFaulted, aiDropped and hashFailures.
  - The totals are identical to the last recorded run (18-14, `snapshot=eb946ce`): station, intercept and flee arrivals 40 / 40 / 40; AVOID_COLLISION entries 23; attack ticks near the player 61,662; stuck windows 175; frozen windows 293.
  - Minimum station clearance is 2,713.00 m (epochs 3, 13, 20) and minimum hull clearance is 41.41 m (epoch 10). Both are unchanged.
  - This checks only that the frozen worlds still match. The harness runs with no collisions, statics or buoy mass, so it says nothing about the new paths (review L660).
- **Acceptance criteria:** `export function` count 3; non-comment `stepShipDrift|stepBuoyDrift` lines in `step.ts`: 3; "Ships are not integrated": absent; `git diff --quiet 76229f5 -- tests/golden/world`: exit 0; `braking-npc.json` in the oracle test: 3.
- **Precondition:** no `2026-11-19-oolite-measurement-mismatch.md` todo exists. The 18-20 verdict table has 15 SAME, 1 KNOWN and no MISMATCH.

## Files Created/Modified

- `src/sim/world/drift.ts`: the constants, `brakeShipDrift` (float32, `fmaxf` scale, zero for a non-finite or float32-zero input), `stepShipDrift` (ascending over a length snapshot; live, non-dead `ship`s with a non-zero velocity; `statsFor` thrust) and `stepBuoyDrift` (witchpoint, then nav buoy; skipped at static health 0). Every write is clamped.
- `src/sim/world/step.ts`: both passes run after the steering loop and before `stepDebris`. The "Ships are not integrated" comment is rewritten, and so are the debris pass doc and the steering-loop note.
- `src/sim/npc/flight.ts`: the `applyThrust` note now points to the drift pass. No behaviour change.
- `tests/sim/world/drift.test.ts`: 25 hand cases, including the cadence case and the thrust pin.
- `tests/sim/world/ship-braking.oracle.test.ts`: the fixture consumer.
- `tests/sim/world/world-cadence.test.ts`: the kill scenario's pin-tick velocity (see the deviation below).

## Decisions Made

See `key-decisions`. In short: one pass after the steering loop, as the plan places it, with the order difference against Oolite recorded; a non-finite input brakes to zero whatever the thrust; positions are clamped to the sanitiser's position domain.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test made stale by the intended change] The world-cadence kill scenario lost its hashed velocity**
- **Found during:** Task 1.
- **Issue:** `world-cadence.test.ts` gave the Viper a 1 m/s drift at spawn, "only to exercise the hash". It then asserted `;vel:` in the section captured 30 ticks later. Ships now brake that drift (1.33 m/s per tick for the Viper), so it reaches zero on the first tick. The non-vacuity assertion failed. The cross-cadence hash equality still held.
- **Fix:** the test now writes the 1 m/s velocity at the pin tick, after that tick's step and before the section is captured. The next tick brakes it to zero before any move, so the Viper never moves by it and the kill ticks and geometry are unchanged. The scenario comment is updated.
- **Files modified:** `tests/sim/world/world-cadence.test.ts`.
- **Verification:** world-cadence 10 of 10, including the pinned kill ticks 59 and 64; the full suite is green.
- **Committed in:** `5577cd0`.

**2. [Test tolerance] The thrust-0 hand case at 1e7 m**
- One hand assertion compared a 1 m displacement at 1e7 m to 9 digits. The ulp there is about 2e-9 m, so it is now 6 digits. This is not a code change.

**Total deviations:** 1 auto-fixed (Rule 1) and 1 test tolerance. **Impact:** none on the plan's behaviour or on any golden. The world-cadence change keeps the test's intent, which is a velocity in the hashed text at every cadence.

## Issues Encountered

- During the full `test` run, a concurrent `lint` saw the transient `src/sim/__purity_ban_*.ts` probe files that the guard tests write. Rerunning `lint` after the run finished was clean.

## Known Stubs

None.

## User Setup Required

None.

## Next Phase Readiness

- Plans 18-11 and 18-18 (collision rebounds) and 18-19 (blasts) can write `Entity.velocity` and `World.buoys.<key>.velocity`. The drift passes then move those bodies and bring them to rest.
- CBT-18 stays open in REQUIREMENTS.md, because sibling plans 18-04, 18-11, 18-18, 18-21, 18-19 and 18-12 still declare it.

## Self-Check: PASSED

- FOUND: `src/sim/world/drift.ts`, `tests/sim/world/drift.test.ts`, `tests/sim/world/ship-braking.oracle.test.ts`
- FOUND commits: `6350493`, `5577cd0`, `848a2d6` (the evaluation scope resolves all three for 18-17)

---
*Phase: 18-stations-buoys-and-collisions*
*Completed: 2026-11-19*

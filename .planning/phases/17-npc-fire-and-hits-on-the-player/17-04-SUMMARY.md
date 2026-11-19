---
phase: 17-npc-fire-and-hits-on-the-player
plan: 04
subsystem: simulation
tags: [npc, fire-gate, onTarget, weapon-heat, missed-shots, oracle, fast-check, float32]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: the gate, onTarget, heat (17-01) and fire-site, aim-feedback (17-02) oracles
provides:
  - src/sim/npc/fire.ts, the pure total NPC fire gate with npcFireBlocked, npcRechargeTicks, onTargetCone, npcOnTarget and the three weapon-state updates
  - both missedShots readers live (currentAimTolerance, trackPrimaryTarget min_d), exact no-ops at 0
  - the fire oracle consumer (fire.oracle.test.ts), its manifest (FIRE_ORACLE_GROUPS / FIRE_ORACLE_PENDING) and a fast-check totality suite
  - the QUAL-11 baseline for Phase 17 (pre-change and post-change runs identical)
affects: [17-05, 17-06, 17-07, 17-08, 17-10]

plan_head_before: dc79f37cd5220cf50e3f35630b81c66400c18336
plan_head_after: 198357ee0b49a4fe733fc53b2cd17942fcd8c7e6
commits: 3

actuals:
  tokens: 20100
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "NaN-safe refusals written as !(x < y); no try/catch; one draw per gate call, taken only after heat, energy and the timer"
    - "a separate fire oracle manifest (FIRE_ORACLE_GROUPS plus FIRE_ORACLE_PENDING) beside ORACLE_GROUPS, with oracle-coverage comparing the union"

key-files:
  created:
    - src/sim/npc/fire.ts
    - tests/sim/npc/fire.test.ts
    - tests/sim/npc/fire.oracle.test.ts
    - tests/sim/npc/fire.property.test.ts
  modified:
    - src/sim/npc/target.ts
    - src/sim/npc/track.ts
    - src/sim/npc/constants.ts
    - tests/sim/npc/target.test.ts
    - tests/sim/npc/track.test.ts
    - tests/sim/npc/constants.test.ts
    - tests/sim/npc/oracle-groups.ts
    - tests/sim/npc/oracle-coverage.test.ts

key-decisions:
  - "npcRechargeTicks(laser) is the one home of the shot period: LASER_STATS rechargeTicks (60, 12, 300, 12) and 12000 for the unarmed object; the gate reads no other period"
  - "The gate refuses a non-finite temperature, energy or range (heat, energy, roll) and an unresolved or non-finite accuracy with no draw, in addition to Oolite's refusals; none of these is reachable in Oolite"
  - "The unarmed ship reads EQ_WEAPON_NONE (energy 0, range 32000, recharge 100 s): with positive energy it takes the draw and refuses at noWeapon"
  - "coolWeapon and heatWeapon clamp to MAX_WEAPON_TEMPERATURE and return a float32 value, never -0; adjustMissedShots truncates, floors at 0 and saturates at MAX_UINT32"
  - "The missed-shot aim divisor 4 is a named ledger constant (AIM_MISSED_SHOT_DIVISOR) next to the other aim constants"

requirements-completed: [CBT-15]

coverage:
  - id: D1
    description: "npcFireGate refuses in Oolite's order (heat, energy, timer with no draw; one draw; roll, range, onTarget, noWeapon) and passes all 33 gate fixtures"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire.oracle.test.ts#tests/oracles/npc/fire/fixtures/gate.json"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/fire.test.ts#the refusal order and the draw count on a real entity (9933-9958)"
        status: pass
    human_judgment: false
  - id: D2
    description: "onTargetCone, npcOnTarget and the live currentAimTolerance missedShots term pass all 23 on-target fixtures"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire.oracle.test.ts#tests/oracles/npc/fire/fixtures/on-target.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "float32 coolWeapon and heatWeapon reproduce the 7 heat trajectories (tolerance 1e-9) and the cutout refusal and resume ticks"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire.oracle.test.ts#tests/oracles/npc/fire/fixtures/heat.json"
        status: pass
    human_judgment: false
  - id: D4
    description: "trackPrimaryTarget's min_d missed-shot term with its 0.001 floor passes all 17 aim-feedback fixtures and is a no-op at missedShots 0"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire.oracle.test.ts#tests/oracles/npc/fire-sites/fixtures/aim-feedback.json"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/track.test.ts#trackPrimaryTarget's missed-shot precision term (ShipEntity.m:9134-9141)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Every new function is total: fast-check properties with NaN, infinities and 1e308, a self target as a generated case"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire.property.test.ts"
        status: pass
    human_judgment: false
  - id: D6
    description: "The frozen anchors did not move and QUAL-11 is unchanged by the plan (baseline and post-change acceptance identical)"
    requirement: CBT-15
    verification:
      - kind: other
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (snapshot dc79f37 and 198357e, exit=0, 21 passed)"
        status: pass
      - kind: unit
        ref: "tests/sim/world/flight-hash-pins.test.ts, tests/sim/world/populate.test.ts, tests/sim/npc/npc-cadence.test.ts, tests/sim/npc/flyers.scenario.test.ts, tests/app/session/tick-flyers.test.ts"
        status: pass
    human_judgment: false

duration: 24min
completed: 2026-11-19
status: complete
---

# Phase 17 Plan 04: NPC fire gate Summary

**Oolite's NPC fire gate, onTarget and both missedShots readers are ported as one pure, total module that passes all 80 independent fire fixtures (33 gate, 23 on-target, 7 heat, 17 aim-feedback) on the first run, with no world behaviour changed and the QUAL-11 run identical to the pre-phase baseline.**

## Performance

- **Duration:** 24 min (2026-11-19T00:13:12Z to about 00:37Z)
- **Tasks:** 3 (Task 1 a tracer)
- **Files:** 4 created, 8 modified; 1872 insertions, 25 deletions over 12 files

## Accomplishments

- `fire.ts`: `npcFireGate` refuses at heat, energy and the shot timer with no draw, then takes exactly one draw and refuses at the roll, the range, `onTarget` or the unarmed weapon. It writes nothing; the caller applies cost, heat and the timer. `npcFireBlocked`, `npcRechargeTicks`, `onTargetCone`, `npcOnTarget`, `coolWeapon`, `heatWeapon` and `adjustMissedShots` complete the module.
- `currentAimTolerance` divides the basic aim by `1 + missedShots / 4` for accuracy >= 0 before the deadly divisor, and `trackPrimaryTarget` shrinks `min_d` by 0.0001 per missed shot with the 0.001 floor (max_factor x2, r_max_factor /2) for accuracy in [0, 7.5). Both are exact no-ops at `missedShots` 0, so the frozen worlds did not move. Both readers land before the counter does (17-05 writes it).
- Following plan 17-02's finding, the aim-feedback term is wired only into `trackPrimaryTarget` and `currentAimTolerance`, not `trackDestination` (six/twelve).
- `fire.oracle.test.ts` runs the four fixture files against the port; `oracle-coverage.test.ts` now accepts exactly the union of `ORACLE_GROUPS` and `FIRE_ORACLE_GROUPS` test files and checks that groups plus pending rows equal the fire fixture files on disk. The Phase 14 fixture-file equality is unchanged.
- `fire.property.test.ts` drives every new function with NaN, infinities and extremes; a self target is a generated case.

## Task Commits

1. **Task 1: the gate through onTarget and the aim tolerance (tracer)** - `7acda99` (feat)
2. **Task 2: the min_d term of trackPrimaryTarget** - `5607de0` (feat)
3. **Task 3: fixtures against the port, the manifest, totality** - `198357e` (test)

## Fixture results (no dispute)

| File | Fixtures | Passed | Notes |
|------|----------|--------|-------|
| `tests/oracles/npc/fire/fixtures/gate.json` | 33 | 33 | result kind, refusal, draw count, caller-side energy, float32 temperature and timer reset; a fired shot refuses the same tick at the timer with no draw |
| `tests/oracles/npc/fire/fixtures/on-target.json` | 23 | 23 | each run through `currentAimTolerance`, `onTargetCone` and `npcOnTarget` on a body in a synthetic view |
| `tests/oracles/npc/fire/fixtures/heat.json` | 7 | 7 | shot ticks, temperature checks (1e-9), first refusal and resume ticks, draw count |
| `tests/oracles/npc/fire-sites/fixtures/aim-feedback.json` | 17 | 17 | through `runFixture` with an `afterAssign` hook writing `weapon.missedShots` |

`fire.oracle.test.ts`: 86 tests (80 fixtures, 3 frame-rate rows, the shot-timer difference, 2 manifest checks). Mutation checks on the port (not committed): turning the timer `>=` into `>` fails 10 tests, removing the `min_d` term fails 5, a weakened `adjustMissedShots` guard fails the property suite.

Pending (plan 17-08): `fire-sites.json` and `hot-branches.json` are in `FIRE_ORACLE_PENDING`.

## The frame-rate rows

`fire.oracle.test.ts` confirms the three rows (`ShipEntity.m` 2214-2218, 9946, 9949) by checking that every `confirmedBy` id is a fixture of this file and ran; `rate-rule.oracle.test.ts` is untouched (`git diff 39ed00d` empty). The shot-timer row states `measuredDifference` 1 and a DIVERGENCE.

`npcRechargeTicks` beside plan 17-01's literal Oolite frame counts at 1/120 s:

| Laser | `npcRechargeTicks` (D-07) | Literal Oolite frames | Difference |
|-------|---------------------------|-----------------------|------------|
| pulse | 60 | 60 | 0 |
| beam | 12 | 13 | +1 |
| mining | 300 | 301 | +1 |
| military | 12 | 13 | +1 |
| unarmed | 12000 (100 s) | never fires | - |

Owner question 1 (keep D-07 or take the literal counts) stands; the answer is a one-line change in `npcRechargeTicks` plus one re-pin.

## The unarmed reading used

An unarmed ship is the registered `EQ_WEAPON_NONE` object (17-01): energy use 0, range 32000, recharge 100 s, shot temperature 0. With positive energy the gate passes energy and the timer, takes its one draw, tests the roll against range 32000 and onTarget, and refuses `noWeapon` (`drew` true). With energy 0 it refuses at energy with no draw. `fire.test.ts` and the `gate-unarmed-*` fixtures pin both.

## onTarget width result

The equality fixture `on-target-equality-dq-equals-astq-both-widths` passes against the float64 `onTargetCone` (a width-independent pose, as 17-01 built it). No fixture demands the float32-only pose, so there is no failing fixture and no divergence to record against the fixtures. For plan 17-05's gate row: 17-01 found that at the pose (10, 0, 23) with radius 30 float32 answers YES and float64 NO, so the float64 port differs from Oolite at such an exact-equality pose only (a measure-zero set in flight).

## Decisions Made

- `npcRechargeTicks` is the only reader of `.rechargeTicks` in `fire.ts` (the acceptance count is 1); the unarmed 100 s period is a constant derived from `TICKS_PER_SECOND`.
- Wegolite-only refusals, all before any draw or at the check they reach: an accuracy equal to `ACCURACY_UNRESOLVED` or non-finite (`unresolved`, no draw), a non-finite temperature (heat), a non-finite energy (energy) and a non-finite range (roll, after the draw). They cannot be reached in Oolite, so no Oolite draw moves.
- The 9868 sun clause is inert (no shadow is modelled), and the turret-laser early YES (9858) is not ported because no compiled ship mounts a turret laser; both are stated in the `fire.ts` header.
- `AIM_MISSED_SHOT_DIVISOR = 4` is a named constant in `constants.ts` (pinned in `constants.test.ts` beside `PRIMARY_MISSED_SHOT_STEP`, `PRIMARY_MIN_D_FLOOR` and `NPC_WEAPON_CUTOUT_F32`).
- The heat fixtures confirm owner question 2's reading of 17-01: temperature is kept float32 at every step (`coolWeapon` and `heatWeapon` round with `Math.fround`); the float64 record field simply holds float32 values.

## Notes for plan 17-05 (the caller)

- Take `npcFireBlocked(entity)` first; then `npcFireGate` with `temperature` read after `coolWeapon(t, DT)` for the update, `lastShotTick` of the entity, `accuracy` from `entity.steer.accuracy`, `range` from `rangeToTargetIn`, and `onTarget` as a thunk over `npcOnTarget(entity, view, tick)`.
- On `fired` the caller applies `energy -= LASER_STATS[laser].energy`, `temperature = heatWeapon(t, shotTemperature)` and `lastShotTick = tick`; `fire.oracle.test.ts` models exactly this.
- `adjustMissedShots` is not called anywhere yet.

## Deviations from Plan

**1. [Rule 2 - style/ledger] A named constant for the missed-shot aim divisor.** `currentAimTolerance` needed the literal 4 of `1 + missedShots / 4` (9769). The plan lists no such symbol; every other aim number is a named ledger constant, so `AIM_MISSED_SHOT_DIVISOR` was added and pinned. Files: `constants.ts`, `target.ts`, `constants.test.ts`. Commits: `7acda99`, `5607de0`.

**2. [Process] The Task 2 constants were split from `constants.ts` at staging.** `constants.ts` carries Task 1's cutout and divisor and Task 2's `PRIMARY_*` constants; the Task 1 commit staged only the first two hunks (`git apply --cached` of a filtered patch), so each commit is self-consistent and typechecks.

**3. [Plan placement] The `trackPrimaryTarget` missed-shot tests live in `track.test.ts`** as the plan lists, with their own small harness over `createSyntheticView`; the existing `trackPrimaryTarget` harness is in `target.test.ts`.

**Total deviations:** 3 (1 style-level addition, 2 process notes). **Impact:** none on behaviour or the gates.

## QUAL-11 acceptance (explicit remote run, in no gate by decision)

Command: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test npm run test:acceptance`.

| Run | Snapshot | Result | Elapsed |
|-----|----------|--------|---------|
| QUAL-11 baseline (pre-Phase-17), the unchanged base commit before the first code commit | `dc79f37` | `exit=0`, 21 passed | `elapsed=76s` |
| Post-change, after the last code commit | `198357e` | `exit=0`, 21 passed | `elapsed=80s` |

Metric values (summed or minimum over the 20 epochs; identical in both runs):

| Metric | Baseline `dc79f37` | Post-change `198357e` |
|--------|--------------------|-----------------------|
| minimum hull clearance | 41.41144779320824 | 41.41144779320824 |
| minimum station clearance | 2713.001472744365 | 2713.001472744365 |
| arrivals (station / intercept / flee) | 40 / 40 / 40 | 40 / 40 / 40 |
| AVOID_COLLISION entries | 23 | 23 |
| attack ticks near the player | 61662 | 61662 |
| stuck / frozen / frustration / stationSphere | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| hull crossing episodes / unexcused | 0 / 0 | 0 / 0 |
| aiFaulted / aiDropped / repairs / hashFailures | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| stuck / frozen windows evaluated | 175 / 293 | 175 / 293 |

All 20 `ACCEPTANCE-SEED` lines are identical between the two runs apart from `elapsedMs`, as expected for a plan with no caller of the gate. No earlier run recorded these values, so the baseline row is the reference for plans 17-05 to 17-10.

## Verification

- Targeted (Task 1): `docker compose run --rm test npx vitest run tests/sim/npc/fire.test.ts tests/sim/npc/target.test.ts tests/sim/npc/attack.oracle.test.ts tests/sim/npc/pursuit.oracle.test.ts`: 4 files, 155 tests passed; re-run after the tracer commit (tracer gate) passed. `⚡ Tracer verified end-to-end - expanding`.
- Task 2: `... track.test.ts constants.test.ts attack.oracle.test.ts pursuit.oracle.test.ts steering.property.test.ts`: 5 files, 310 tests passed.
- Task 3: `... tests/sim/npc tests/oracles/npc tests/guards/oracle-independence.test.ts`: 32 files, 1404 tests passed. Frozen anchors (`flight-hash-pins`, `populate`, `npc-cadence`, `flyers.scenario`, `tick-flyers`): 5 files, 60 tests passed.
- `docker compose run --rm test` (full, coverage thresholds): 230 files, 6279 passed, 10 skipped, exit 0.
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: clean.
- Acceptance criteria: `export function npcFireGate` 1; non-comment `missedShots` in `target.ts` 1 and in `track.ts` 1; no `Math.random`, `Date.now`, `performance.now` or `try {` in `fire.ts`; `NPC_WEAPON_CUTOUT_F32` defined once in `constants.ts` and used in `fire.ts` (2 lines); `npcFireBlocked` and `npcRechargeTicks` exported (2) and `.rechargeTicks` read once outside comments; `PRIMARY_MIN_D_FLOOR` in both `constants.ts` and `constants.test.ts`; `runs exactly the fixtures of its files` in `fire.oracle.test.ts` (1); manifest names in `oracle-groups.ts` (3) and `oracle-coverage.test.ts` (5); `git diff 39ed00d -- rate-rule.oracle.test.ts` empty.
- No `verify` run, per the gate policy for `src/sim/npc/**`; the 20-seed run above is the NPC acceptance run.

## Oracle disputes

None.

## Owner questions (recorded, not blocking)

1. D-07 shot period (unchanged from plan 17-01): keep `round(rate x 120)` (12, 300, 12) or take the literal Oolite counts (13, 301, 13) for beam, mining and military. One line in `npcRechargeTicks` plus one re-pin.

## Known Stubs

None. `adjustMissedShots` and the gate have no caller yet by design (plan 17-05).

## Threat Flags

None: no endpoint, auth path, file access or schema change (the new functions are pure and unreferenced by the step).

## Self-Check: PASSED

- Files found: `src/sim/npc/fire.ts`, `tests/sim/npc/fire.test.ts`, `tests/sim/npc/fire.oracle.test.ts`, `tests/sim/npc/fire.property.test.ts`, `tests/sim/npc/oracle-groups.ts`, `tests/sim/npc/oracle-coverage.test.ts`.
- Commits `7acda99`, `5607de0`, `198357e` are ancestors of HEAD; `commits: 3` measured with `git rev-list --count` from `plan_head_before` `dc79f37`.
- The plan's automated verify commands all passed, including the remote acceptance run (21 of 21, unchanged numbers).

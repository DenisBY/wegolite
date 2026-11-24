---
phase: 17-npc-fire-and-hits-on-the-player
plan: 01
subsystem: testing
tags: [oracle, oolite, fire-gate, onTarget, weapon-heat, float32, frame-rate-rule]

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: the oracle method, the fixture contract, frame-rate-rule.json and the independence guard
provides:
  - tests/oracles/npc/fire/: strict schemas, an independent derivation, 33 gate, 23 on-target and 7 heat fixtures and a self-test
  - three frame-rate rows (cooling, shot timer, range roll)
  - the literal Oolite shot-frame counts at 1/120 s per laser, derived from the source alone
affects: [17-04, 17-05, phase-17 decision rows, owner question 1 at sign-off]

plan_head_before: 63a8eafd92c5bd9ea01cecd558af94f29f3a7a4f
plan_head_after: 08a1db4b21457404dc29f614664b06f3ed0d4811

actuals:
  tokens: 45900
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "oracle tree: schema.ts (zod only) + derive.ts (Oolite transliteration, no src import) + JSON fixtures + self-test that re-derives every value"
    - "float32 emulation with Math.fround at every GLfloat step, with an explicit float64 mode to prove width independence"

key-files:
  created:
    - tests/oracles/npc/fire/schema.ts
    - tests/oracles/npc/fire/derive.ts
    - tests/oracles/npc/fire/fire.self.test.ts
    - tests/oracles/npc/fire/fixtures/gate.json
    - tests/oracles/npc/fire/fixtures/on-target.json
    - tests/oracles/npc/fire/fixtures/heat.json
    - .planning/phases/17-npc-fire-and-hits-on-the-player/COVERAGE.md
  modified:
    - tests/oracles/npc/frame-rate-rule.json
    - tests/oracles/npc/reference.self.test.ts

key-decisions:
  - "An unarmed NPC's gate call reads the EQ_WEAPON_NONE equipment object, not nil: energy 0, range 32000, recharge 100 s, shot temperature 0; with positive energy it takes the one draw and refuses at noWeapon"
  - "Temperatures are float32 and the heat fixtures carry tolerance 1e-9, so a float64 port fails them (float32 drift reaches 6e-3 by tick 3000)"
  - "The shot-timer rule (round(rate x 120) ticks, NPC >=) is kept; the literal Oolite frame counts are a recorded one-tick divergence for beam, mining and military"

requirements-completed: [CBT-15]

coverage:
  - id: D1
    description: "33 cited gate fixtures: refusal order, draw count and every boundary of the NPC fire gate"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/oracles/npc/fire/fire.self.test.ts#fire gate fixtures (gate.json)"
        status: pass
    human_judgment: false
  - id: D2
    description: "23 cited onTarget and currentAimTolerance fixtures with the live missedShots term"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/oracles/npc/fire/fire.self.test.ts#on-target fixtures (on-target.json)"
        status: pass
    human_judgment: false
  - id: D3
    description: "7 float32 heat and cooling trajectories for the four lasers and the cutout"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/oracles/npc/fire/fire.self.test.ts#weapon heat fixtures (heat.json)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Frame-rate rows for cooling, the shot timer and the roll, with the literal shot-frame counts"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/oracles/npc/fire/fire.self.test.ts#the fire rows of the frame-rate rule (frame-rate-rule.json)"
        status: pass
    human_judgment: false

duration: 35min
completed: 2026-11-18
status: complete
---

# Phase 17 Plan 01: Fire-gate oracle Summary

**An independent, source-cited oracle for Oolite's NPC fire gate: 33 gate, 23 onTarget and 7 float32 heat fixtures re-derived from the pinned source, plus three frame-rate rows that record the literal shot-frame counts (pulse 60, beam 13, mining 301, military 13 against the rule's 60, 12, 300, 12).**

## Performance

- **Duration:** about 35 min (start time was not recorded at the start of the run)
- **Completed:** 2026-11-18T23:34Z
- **Tasks:** 3 (task 1 is the tracer)
- **Files:** 7 created, 2 modified, plus this summary

## Accomplishments

- The fire oracle exists before any port: schema, derivation and fixtures, written without access to `src/sim/npc`, `src/sim/combat`, the port-describing documents or the reviews.
- Gate fixtures pin Oolite's order (heat, energy, timer with no draw; then exactly one draw; then roll, range, onTarget, noWeapon) and every adjacent boundary.
- `missedShots` is covered live at 0, 3 and 31 for accuracy -5 to 9, including poses where the term alone flips the answer.
- The heat fixtures pin float32 temperature and cooling for all four lasers, the cutout refusal and the resume.
- The shot-timer row records the rule and the measured divergence.

## Task Commits

1. **Task 1: gate family end to end (tracer)** - `3470843` (test): `schema.ts`, `derive.ts`, `gate.json`, the gate part of the self-test, `COVERAGE.md`
2. **Task 2: onTarget, aim tolerance, heat** - `08b3723` (test): `on-target.json`, `heat.json`, their self-test
3. **Task 3: frame-rate rows** - `08a1db4` (test): `frame-rate-rule.json`, `reference.self.test.ts`, the rows self-test (rows and the `allFixtureIds()` extension are in this one commit)

**Plan metadata:** the commit that adds this file.

## Fixture counts

| File | Fixtures | Tolerance | Notes |
|------|----------|-----------|-------|
| `fixtures/gate.json` | 33 | 1e-6 | `rg -c '"refusedAt"'` = 33; every refusal kind, all five weapons |
| `fixtures/on-target.json` | 23 | 1e-7 | `"missedShots": 3 or 31` on 10 lines |
| `fixtures/heat.json` | 7 | 1e-9 | `"firstHeatRefusalTick"` on 7 lines; pulse, beam, military from 0 refuse and resume; mining from 0 never refuses (null) |
| `frame-rate-rule.json` | +3 rows (45 to 48) | | cooling, shot timer, roll |

Tolerance applies to the non-integer expected values only; booleans, refusal names, ticks and draw counts are exact.

## The unarmed-gate reading (settled from the source)

An NPC with no forward weapon holds the registered `EQ_WEAPON_NONE` equipment object, not `nil`: `forward_weapon_type = OOWeaponTypeFromString(... defaultValue:@"EQ_WEAPON_NONE")` (`ShipEntity.m:299-300`), which is `OOWeaponTypeFromEquipmentIdentifierSloppy` and returns the registered NONE type (`OOConstToString.m:258-281`); `isWeaponNone` tests `weapon == nil || identifier == EQ_WEAPON_NONE` (`ShipEntity.m:13046-13049`). Its `weapon_info` is `range 32000, energy 0.0, recharge_rate 100, shot_temperature 0.0` (`equipment.plist:114-121`). With positive energy the gate passes the energy test (`energy <= 0` is false) and the timer (never fired, `shot_time` 100.0 is not below 100.0), **takes the one draw** (`![weapon_type isTurretLaser]`), is tested against range 32000 and `onTarget`, and then refuses at `isWeaponNone` (9958): `noWeapon`, `drawsUsed` 1. With energy 0 it refuses at energy with no draw.

## Literal shot-frame numbers (for plan 17-05's decision row and owner question 1)

`literalShotFrames(rateF32)`: after a shot `shot_time = 0` (`resetShotTime`, 10080-10083, 10463), each update adds the double `1/120` before the behaviours (2221), and the gate refuses while `shot_time < (float)rate` (9946-9947). The first non-refused frame is the smallest `k` whose `k`-fold double sum of 1/120 is not below the rate. Derived from the source alone, before any other number was read:

| Laser | float32 rate | Rule: round(rate x 120) | Literal Oolite frames | Difference | Deciding sums |
|-------|--------------|-------------------------|-----------------------|------------|---------------|
| pulse | 0.5 | 60 | 60 | 0 | 60 steps sum to 0.5000000000000007 (not below 0.5) |
| beam | 0.10000000149011612 | 12 | 13 | +1 | 12 steps sum to 0.09999999999999999, below the rate; 13 steps 0.10833333333333332 |
| mining | 2.5 | 300 | 301 | +1 | 300 steps sum to 2.499999999999994, below 2.5; 301 steps 2.508333333333327 |
| military | 0.10000000149011612 | 12 | 13 | +1 | as the beam |

`measuredDifference` of the shot-timer row is 1. In shots per second at 120 Hz: beam and military 10.0 by the rule against 9.23 literal; mining 0.4 against 0.399; pulse equal. After the numbers above were written and committed, `17-ADVISOR-NOTES.md` decision 1 was opened: it states pulse 60, beam 13 frames at 120 Hz and mining 301 (military is only grouped with the beam as 12 ticks), so **there is no dispute**; the advisor's 60 Hz figure for the beam (7) is outside this oracle.

## onTarget width and the equality fixture

`deriveOnTarget` evaluates in float32 by default, as Oolite does (`dq`, `d2`, `radius`, `aim`, `astq` and the `Vector` components are `GLfloat`, `ShipEntity.m:9855-9856`, `OOVector.h:237-253, 299-302`), with an explicit float64 mode.

The equality fixture `on-target-equality-dq-equals-astq-both-widths` (target at (10, 0, 40), radius 30, so the offset is radius / 3): **float32 dq = astq = 0.9701424837112427 and float64 dq = astq = 0.9701425001453319, both YES (`>=`)**. A width-independent pose therefore exists, and the answer does not depend on the port's width there. The width does matter at other exact-equality poses: at (10, 0, 23) with radius 30 float32 answers YES and float64 answers NO. No fixture demands that (the self-test records it), so a float64 port differs from Oolite at such poses only; the decision row can name it. Every fixture's boolean is identical in both widths (the self-test checks all 23).

## Decisions Made

- Gate fixtures carry top-level `weapon` and `draws` (two distinct scripted draws, the gate takes the first) next to the contract's `input`, so the roll and the weapon are explicit; `expected.drawsUsed` says whether the draw was taken.
- Energy is float64 by the plan's contract although Oolite's `energy` is a `GLfloat` (`Entity.h:134`); gate fixtures carry tolerance 1e-6 and no energy boundary sits within it except the equality ones, which hold in both widths.
- `firstResumeTick` is the first tick **after the first refusal at which the gate fires**. It can be bound by the heat (beam 1025, military 749) or by the timer (pulse 3241 = shot tick 3181 + 60; the start-at-cutout pulse run, tick 31); each heat derivation states which and gives the first heat-passing tick (pulse 3209).
- For the pulse, beam and military runs the first refusal falls on the tick right after a shot (the shot pushes the temperature over the cutout and heat is checked before the timer), not at the next shot tick.
- Mining never heats: it gains 10 and cools 15.0000002 per 300-tick period, so `firstHeatRefusalTick` is null; its cutout behaviour is covered by the start-at-cutout runs.

## Deviations from Plan

**1. [Process] `schema.ts` and `derive.ts` were written whole in Task 1's commit.** Task 1 is a tracer, but the on-target and heat parts of both files were already in place when it was committed, so Task 2's commit adds only the two fixture files and their self-test. Nothing outside the plan's file list changed. Files: `schema.ts`, `derive.ts`. Commits: `3470843`, `08b3723`.

**2. [Plan citation drift, informational] The plan's gate line numbers are off by two in places.** The pin has the heat refusal at 9935-9936 (not 9933-9934), energy at 9944-9945, the draw block at 9948-9953, onTarget at 9954-9955 and the fired block at 9968-9973 (the plan says 9967-9975). Fixtures cite the actual pin lines; the frame-rate rows use the plan's cited `9946-9946` and `9949-9949`, which are correct.

**Total deviations:** 0 auto-fixes; 1 process note, 1 citation note. **Impact:** none on the contract; the port plans should read the fixtures' citations, not the plan's.

## Oracle disputes

None. The advisor's shot-frame counts agree with the derived ones.

## Owner questions (not blocking; recorded for sign-off)

1. **D-07 / advisor decision 1:** the rule keeps 12 ticks for beam and military and 300 for mining, while literal Oolite at exactly 1/120 s fires on frame 13 and 301. The effect is a shot rate higher by 1/12 for beam and military (10.0 against 9.23 per second). The rule stays as D-07 locks it; the divergence is recorded in the shot-timer row (`measuredDifference` 1). Keep, or take the literal counts for beam and military?
2. **Float width of temperature and energy:** the heat fixtures demand float32 temperature (tolerance 1e-9) and the plan keeps energy float64. A float64 temperature drifts by about 6e-3 over 3000 ticks and would fail. Confirm the port keeps temperature as float32 (`Math.fround` at every step) once the v4 field is float64 on the record.

## Notes for the porters (17-04, 17-05)

- The equality fixture assumes no fused multiply-add in Oolite's float expressions (x86-64 SSE reference); an ARM64 build that contracts `a*b + c*d` could round `dq` differently at an exact-equality pose.
- `tests/sim/npc/oracle-groups.ts` and `oracle-coverage.test.ts` (not read or run in this plan, by the wave-1 rule) may need the new fire fixtures and ids registered by the plan that consumes them.
- `reference.self.test.ts` now also checks id uniqueness across every oracle tree including `fire/`.

## Verification

- `docker compose run --rm test npx vitest run tests/oracles/npc/fire tests/oracles/npc/reference.self.test.ts tests/guards/oracle-independence.test.ts tests/sim/npc/rate-rule.oracle.test.ts`: 4 files, 213 tests passed (`rate-rule.oracle.test.ts` run, not read).
- `docker compose run --rm lint`: eslint and prettier clean. `docker compose run --rm typecheck`: clean.
- Acceptance: `gate.json`, `on-target.json`, `heat.json` exist; `"refusedAt"` 33 (>= 20); `"missedShots": (3|31)` 10 (>= 4); `"firstHeatRefusalTick"` 7 (>= 4); the three row lines match exactly 3; `DIVERGENCE` on 2 lines (>= 2); `COVERAGE.md` states no external API; the rows and `allFixtureIds()` extension are in commit `08a1db4`.
- No acceptance run (no `src` change).

## Independence record: files read

Allowed inputs only; nothing under `src/sim/npc/**`, `src/sim/combat/**`, `tests/sim/npc/**` or `tests/sim/combat/**`, and not `17-RESEARCH.md`, `17-PATTERNS.md`, `17-REVIEWS.md`, the Phase 17 plan list in `ROADMAP.md` or any other `17-NN-PLAN.md`.

- Plan and context: `17-01-PLAN.md`, `17-CONTEXT.md`, `AGENTS.md`, `.planning/config.json`; GSD files (`execute-plan.md`, `summary.md` template).
- Oracle tree and guard: `tests/oracles/npc/schema.ts`, `frame-rate-rule.json`, `reference.self.test.ts`, the exports of `reference/vec.ts`, the first 80 lines of `pursuit/derive.ts`, the first 60 lines of `pursuit/pursuit.self.test.ts`, the first lines of `pursuit/fixtures/flee.json`, `tests/guards/oracle-independence.test.ts`; `compose.yaml`, `package.json`, `.prettierignore`, `.gitignore`.
- Oolite at the pin `7437f22` via `git show` (copied to scratch files outside the repository): `ShipEntity.m` (200-212, 1120-1145, 2170-2330 excerpts, 5405-5430, 6455-6480, 9740-10090, 10350-10500, 12985-13050, plus line searches), `ShipEntity.h` (36-125, 285-366 and searches), `OOVector.h`, `OOVector.m` (searched), `OOHPVector.h`, `OOConstToString.m` (250-325), `OOEquipmentType.m` (600-700), `Resources/Config/equipment.plist` (100-200), `Entity.h` and `legacy_random.c/h` (searches).
- After the Task 3 literals were written and committed: `17-ADVISOR-NOTES.md` through one `rg` for the decision 1 keywords; that search also printed the text of its decision 3 (a fourth-guard note), which this oracle does not use.
- Incidental: `ls` of the phase directory listed the other plan file names (names only), and the codebase-memory PreToolUse hook injected a few `src/sim` symbol names (for example `BUOY_MAX_ENERGY`) into the context unprompted; none was queried, opened or used.
- Scratch generator and format scripts lived under `/tmp/claude-1027/scratch1` (outside the repository) and were not committed.

## Self-Check: PASSED

- Files exist: `schema.ts`, `derive.ts`, `fire.self.test.ts`, `gate.json`, `on-target.json`, `heat.json`, `COVERAGE.md`, `frame-rate-rule.json`, `reference.self.test.ts`: all found.
- Commits `3470843`, `08b3723`, `08a1db4` are ancestors of HEAD; `commits: 3` measured with `git rev-list --count` from `plan_head_before`.
- Tests, lint and typecheck green as listed under Verification.

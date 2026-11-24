---
phase: 17-npc-fire-and-hits-on-the-player
plan: 12
subsystem: sim
tags: [npc-fire, shot-timer, oolite-fidelity, gap-closure, twin, acceptance]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: plan 17-11's oracle at the literal frame counts (literalShotFrames, re-derived gate and heat fixtures)
provides:
  - npcRechargeTicks at Oolite's literal frame counts (pulse 60, beam 13, mining 301, military 13, unarmed 12000), computed from each laser's float32 rate
  - fire.oracle.test.ts checks the port against the oracle's literalShotFrames for every weapon, and the shot-timer row records no divergence
  - every test that pinned the superseded 12 and 300 amended once; the Node twin and the browser spec re-pinned to the measured fight
  - the A7 and NPC fire gate rows of PROJECT.md and the CHANGELOG state the revised rate
affects: [17-13, G-17-1 reconciliation by /gsd-verify-work]

plan_head_before: cf136c25615d6df1823253ebfa013ec6208f7bf0
plan_head_after: 606e145e6375555dc81eac5669d5ae336a8be68d

actuals:
  tokens: 13300
  tasks: 3
  commits: 1

tech-stack:
  added: []
  patterns:
    - "a module-private port of the shot timer's own double sum, evaluated once at load into a frozen per-laser table from the float32 rate, so the NPC period never reads the player's rounded rechargeTicks"

key-files:
  created: []
  modified:
    - src/sim/npc/fire.ts
    - tests/sim/npc/fire.oracle.test.ts
    - tests/sim/npc/fire.test.ts
    - tests/sim/combat/npc-fire.test.ts
    - tests/sim/ai/test-spawn.test.ts
    - tests/sim/world/kill.test.ts
    - tests/sim/world/world-cadence.test.ts
    - tests/sim/combat/npc-vs-npc.scenario.test.ts
    - tests/sim/npc/fire-cadence.test.ts
    - tests/sim/npc/hot-weapon.test.ts
    - tests/sim/npc/fire-route.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/app/session/tick-parity.test.ts
    - tests/e2e/combat.spec.ts
    - .planning/PROJECT.md
    - CHANGELOG.md

key-decisions:
  - "The literal period is a private helper plus a frozen table in fire.ts (not a typed table of numbers), so the source of each number is Oolite's rule; the unarmed 100 s goes through the same helper (12000, unchanged)"
  - "The twin's kill offset stays 672: it is set by the player's pulse period (spawn + 1 + 11 x 61), not by the shooter's; only the bank, the debris stream and the hash moved"

requirements-completed: [CBT-15, CBT-16]

status: complete
duration: 14 min
completed: 2026-11-19
commits: 1

coverage:
  - id: D1
    description: "npcRechargeTicks returns 60, 13, 301, 13 and 12000 and equals the oracle's literalShotFrames for every weapon; the gate fires at tick - lastShotTick >= the period"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire.oracle.test.ts#npcRechargeTicks(%s) equals the oracle's literal frame count"
        status: pass
      - kind: unit
        ref: "tests/sim/npc/fire.test.ts#npcRechargeTicks, the one home of the shot period (D-07 revised)"
        status: pass
    human_judgment: false
  - id: D2
    description: "every oracle gate, heat, on-target and aim-feedback fixture passes against the port with no fixture edited; the shot-timer row records measuredDifference 0"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/npc/fire.oracle.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "the player's laser periods and strict > gate are untouched"
    requirement: CBT-15
    verification:
      - kind: command
        ref: "git diff cf136c2 HEAD -- src/sim/combat/constants.ts src/sim/combat/weapons.ts (empty); full suite green"
        status: pass
    human_judgment: false
  - id: D4
    description: "the Node twin re-measured and re-pinned, the browser spec equal to it and passing on the remote machine"
    requirement: CBT-16
    verification:
      - kind: unit
        ref: "tests/app/session/tick-parity.test.ts#the browser kill step's twin"
        status: pass
      - kind: e2e
        ref: "wegolite-remote-run.sh run --rm e2e ... tests/e2e/combat.spec.ts (snapshot 606e145, exit=0)"
        status: pass
    human_judgment: false
  - id: D5
    description: "QUAL-11 unchanged: the remote 20-seed acceptance run passes 21 of 21 with every metric identical to the 17-04 baseline"
    requirement: CBT-15
    verification:
      - kind: integration
        ref: "wegolite-remote-run.sh run --rm test npm run test:acceptance (snapshot 606e145, exit=0)"
        status: pass
    human_judgment: false
---

# Phase 17 Plan 12: NPC shots at Oolite's literal frame counts Summary

**`npcRechargeTicks` now returns Oolite's literal frame counts (60, 13, 301, 13; unarmed 12000), computed from each laser's float32 rate by the double 1/120 sum, so NPC beam and military fire at the player's 9.23 shots a second instead of about 8 % faster; every period pin is amended once, the twin and browser spec are re-pinned to the measured fight, and the remote spec and QUAL-11 are green.**

## Performance

- **Duration:** about 14 min
- **Started:** 2026-11-19T09:25:34Z
- **Completed:** 2026-11-19T09:39Z
- **Tasks:** 3 (tracer + 2 auto), one code commit as the plan prescribes
- **Files modified:** 16

## Accomplishments

- `src/sim/npc/fire.ts`: a module-private `literalShotFrames(rateSeconds)` ports Oolite's timer (`ShipEntity.m:2221`, `9946`): the first frame count at which a double sum of 1/120 is no longer below `Math.fround(rate)`, bounded and total. A frozen per-laser table is built once at load from `LASER_STATS[laser].rechargeRate` (never the player's rounded `rechargeTicks`) and the unarmed 100 s; `npcRechargeTicks` reads it. The header and doc name D-07 as revised by the owner 2026-11-19 (UAT test 1, G-17-1) and the superseded rounding as history. The gate's `>=` compare, the never-fired-is-ready rule, float32 heat and the one-draw order are unchanged. `src/sim/combat/constants.ts` and `weapons.ts` have no diff.
- `tests/sim/npc/fire.oracle.test.ts`: the one-tick-divergence row test is replaced by a no-divergence check (`measuredDifference` 0, the treatment names the revision, no `DIVERGENCE`), plus a per-weapon test that `npcRechargeTicks` equals the oracle's `literalShotFrames(rechargeRateF32(weapon))` and `rechargeTicks(weapon)` for all four lasers and `NO_LASER`.
- The twin and the browser spec are re-pinned to a measurement taken on the working tree before any pin was edited; the pairs are equal (below).
- `.planning/PROJECT.md` A7 and NPC fire gate rows and the unreleased CHANGELOG bullet state the literal period and Oolite's own rate.

## Task Commits

1. **Tasks 1 to 3 (port, inventory, twin, spec, rows, CHANGELOG)** - `606e145` (fix). The plan commits the code once so no commit is red; Tasks 1 and 2 end without a commit by design.

**Plan metadata:** the docs commit that carries this SUMMARY, STATE.md, ROADMAP.md and REQUIREMENTS.md.

## RED evidence (Task 1, unchanged port at cf136c2)

`tests/sim/npc/fire.oracle.test.ts`: 7 failed, 80 passed, all timer, heat or shot-timer-row tests and nothing else:

- `gate.json > gate-timer-one-tick-short-beam-refuses`, `gate-timer-one-tick-short-mining-refuses`, `gate-timer-one-tick-short-military-refuses`
- `heat.json > heat-beam-from-zero`, `heat-military-from-zero`, `heat-mining-from-zero`
- `the fire rows of the frame-rate rule > the shot-timer row states its measured difference of one tick`

After the port change the file is green (87 -> 94 tests with the per-weapon check). No oracle file was edited.

## Period table

| Weapon | NPC port (this plan) | Oracle `literalShotFrames` | Player (strict `>`, untouched) | Superseded NPC |
|--------|---------------------|----------------------------|--------------------------------|----------------|
| pulse | 60 | 60 | 61 | 60 |
| beam | 13 | 13 | 13 | 12 |
| mining | 301 | 301 | 301 | 300 |
| military | 13 | 13 | 13 | 12 |
| unarmed (100 s) | 12000 | 12000 | n/a | 12000 |

## The period inventory (D-08 rule), each hit once

Search: `rg -n -i "BEAM_PERIOD|beam period|npcRechargeTicks|>= 12\b|7 \+ 12|1, 13, 25|tick 25|ten (shots|times) a second|\b12 ticks|12-tick|300 ticks" tests --glob '!tests/oracles/**' --glob '!tests/acceptance/**'`, plus 17-05's inventory and the red run. "Red" means the file failed on the unchanged-test run after the port change.

| File | Pinned | Disposition |
|------|--------|-------------|
| `tests/sim/npc/fire.test.ts` | table 12/300/12; timer case 11 refuses, 12 fires | amended: table 60, 13, 301, 13, 12000 with the deciding sums in comments; timer case refuses at 12, fires at 13 (red) |
| `tests/sim/npc/fire.oracle.test.ts` | one-tick-divergence row check | replaced by the no-divergence row check and the per-weapon literalShotFrames check (red) |
| `tests/sim/combat/npc-fire.test.ts` | `BEAM_PERIOD` 12, hand-model loop, "within 12", "10 shots a second" | amended to 13 with the derivation; hand-model loop (shots 3, 16, 29, ...) (red) |
| `tests/sim/ai/test-spawn.test.ts` | doc and `NPC_BEAM_PERIOD_TICKS` 12, first-shot loop bound 12, "at most 30 shots" | amended: 13, loop bound 13, at most 28 shots (floor(359 / 13) + 1) |
| `tests/sim/world/kill.test.ts` | "within the first 12 ticks" loop bound | amended: 13 |
| `tests/sim/world/world-cadence.test.ts` | doc: timer opens at 19 (7 + 12), shots at 19 then every 12 | amended: 20 (7 + 13), every 13; new exact pins from a measurement: Sidewinder killed at tick 59 = 20 + 3 x 13, Adder at 64 (second pulse, 61 after the first); the cross-cadence equality tests unchanged and green |
| `tests/sim/combat/npc-vs-npc.scenario.test.ts` | no tick pinned | tightened: tracer hits land on ticks 1, 14, 27 and the kill tick is 27 (17-09's prediction, confirmed first run); the steering-route fight and the mutual-kill duels assert first-firing-tick bounds only, verified unchanged and green |
| `tests/sim/npc/fire-cadence.test.ts` | "never closer than 12", `> 11` | amended: 13, `> 12`, so a 12-tick gap fails; 20-shot floors and hash equality unchanged |
| `tests/sim/npc/hot-weapon.test.ts` | net heat 3.2 - 12 x 0.05 = 2.6; ready 250..350; cutout 900..1100 | amended: 3.2 - 13 x 0.05 = 2.55; ready (310, 350), cutout (1060, 1160); measured cutout 1111 (red) |
| `tests/sim/npc/fire-route.test.ts` | hand timer `>= 12` | amended: 13 (red) |
| `tests/app/session/probe-publisher.test.ts` | attacker shots at least 12 apart | amended: 13 |
| `tests/app/session/tick-parity.test.ts` | the gated fight's doc and pins | re-pinned (below) (red) |
| `tests/e2e/combat.spec.ts` | header, `SHOOTING_TICKS` doc (12 ticks, 30 shots), `TWIN_*` | amended and re-pinned (below) |
| `tests/sim/ai/test-pilot.test.ts`, `tests/sim/combat/kill.property.test.ts` | `scheduleWake` 12 is the think wake, not the shot period | verified only, unchanged, green |
| `tests/app/session/tick-flyers.test.ts` | "300 ticks" is a step count | verified only, unchanged, green |

Frozen anchors (`flight-hash-pins`, `populate`, `npc-cadence`, `flyers.scenario`, `tick-flyers`): no diff from the plan base, green in the full suite.

## The twin's pins (measured on the working tree, then edited)

| Pin | Old | New | Note |
|-----|-----|-----|------|
| `KILL_OFFSET` / `TWIN_KILL_OFFSET` | 672 | 672 | set by the player's 12th pulse (spawn + 1 + 11 x 61), not the shooter |
| `SHIELD_AFTER_SHOOTING` | 0.18333333333333332 | 0.13333333333333333 | 360 ticks after the spawn |
| `ENERGY_AFTER_SHOOTING` | 210.13333333333128 | 222.18333333333135 | |
| `ENERGY_AT_KILL` | 59.7499999999951 | 83.7999999999947 | |
| `ENERGY_AT_KILL_FLOOR` | 38.4 | 62.4 | by the doc's hand bound: at most floor(671 / 13) + 1 = 52 shots x 6 = 312 points, minus the shield's 128, from 256 - 9.6 (12 pulses at 0.8): 256 - 9.6 - 184 = 62.4 |
| `DEBRIS_AT_KILL` | pods 2, plates 0, wrecks 1 | pods 2, plates 0, wrecks 2 | the shooter's combat stream is at a different point at the kill |
| `ENTITIES_AT_KILL` / `TWIN_ENTITIES_AT_KILL` | 15 | 16 | one more wreck |
| `HASH_60_AFTER_KILL` / `TWIN_HASH_60_AFTER_KILL` | a545cb4b | e909751a | |

Pairwise (printed with `rg -o`): `KILL_OFFSET = 672` / `TWIN_KILL_OFFSET = 672`; `ENTITIES_AT_KILL = 16` / `TWIN_ENTITIES_AT_KILL = 16`; `HASH_60_AFTER_KILL = "e909751a"` / `TWIN_HASH_60_AFTER_KILL = "e909751a"`; `SHIELD_AFTER_SHOOTING = 0.13333333333333333` / `TWIN_SHIELD_AFTER_SHOOTING = 0.13333333333333333`; `ENERGY_AFTER_SHOOTING = 222.18333333333135` / `TWIN_ENERGY_AFTER_SHOOTING = 222.18333333333135`; `DEBRIS_AT_KILL.plates` 0 / `TWIN_PLATES_AT_KILL = 0`. The stop condition did not fire: no `laserRefused` reached the router (measured `false`), the kill landed at 672 within the 1,500-tick bound, and the bank at the kill (83.8) is above the re-derived floor (62.4). The values were read by temporarily replacing the twin's `expect`s with `console.log` in the working tree (the file restored from a backup before the pins were written); no scratch file entered the repository.

## Remote runs (both at the committed HEAD, executed by this agent)

| Run | Command | Snapshot | Exit | Elapsed |
|-----|---------|----------|------|---------|
| browser spec | `wegolite-remote-run.sh run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts --reporter=list"` | `606e145` | `exit=0` | `elapsed=15s` (1 passed, none failed or flaky) |
| QUAL-11 acceptance | `wegolite-remote-run.sh run --rm test npm run test:acceptance` | `606e145` | `exit=0` | `elapsed=76s` (21 passed) |

Acceptance metrics (20 epochs), identical to the 17-04 baseline (`dc79f37`) and post-change (`198357e`) rows:

| Metric | 17-04 baseline | This run |
|--------|----------------|----------|
| minimum hull clearance | 41.41144779320824 | 41.41144779320824 |
| minimum station clearance | 2713.001472744365 | 2713.001472744365 |
| arrivals (station / intercept / flee) | 40 / 40 / 40 | 40 / 40 / 40 |
| AVOID_COLLISION entries | 23 | 23 |
| attack ticks near the player | 61662 | 61662 |
| stuck / frozen / frustration / stationSphere | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| hull crossing episodes / unexcused | 0 / 0 | 0 / 0 |
| aiFaulted / aiDropped / repairs / hashFailures | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 |
| stuck / frozen windows evaluated | 175 / 293 | 175 / 293 |

No threshold or detector was changed; the acceptance run is not in any gate.

## Verification

- `docker compose run --rm test` (full, coverage): 235 files, 6443 passed, 10 skipped, exit 0.
- `docker compose run --rm lint` and `docker compose run --rm typecheck`: clean.
- Task 1 targeted: `fire.oracle`, `fire`, `fire.property`, `npc-fire`: green. `tests/oracles/**` has no diff after plan 17-11's commit; `src/sim/combat/constants.ts` and `weapons.ts` have no diff.
- Acceptance criteria: `rg -c 'LASER_STATS\[laser\]\.rechargeTicks' src/sim/npc/fire.ts` 0; `literalShotFrames` in `fire.oracle.test.ts` 2 lines; `"EQ_WEAPON_BEAM_LASER", 13` in `fire.test.ts` 1; `BEAM_PERIOD(_TICKS)? = 12;` in tests none; the superseded phrases in `tick-parity.test.ts` and `combat.spec.ts` 0; the NPC fire gate row has `revised by the owner 2026-11-19` once and no `D-07 is kept as the owner locked it`; the shares-only-the-hit row has `at most every 13 ticks` once; `about ten times a second` is gone from the CHANGELOG; `git show --stat 606e145` lists `fire.ts`, `tick-parity.test.ts`, `combat.spec.ts`, `PROJECT.md` and `CHANGELOG.md`.
- No `verify` here (plan 17-13), no `verify-full`, per the plan.

## Decisions Made

The two in the frontmatter. The owner's D-07 revision is implemented as specified; no new decision was needed.

## Deviations from Plan

None - plan executed exactly as written.

## Oracle disputes

None. The port equals the oracle for every weapon on the first run after the change.

## Issues Encountered

None. The stale "round(fround(rate) x 120)" derivation text of three oracle fixtures (noted by 17-11) was left alone by design: oracle files are not edited here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for 17-13 (probe and HUD readouts for shields and banks), which changes `src/app/probe.ts` and re-pins `tests/e2e/combat.spec.ts` for the new probe members; the `TWIN_*` literals above are the baseline it keeps.

---
*Phase: 17-npc-fire-and-hits-on-the-player*
*Completed: 2026-11-19*

## Self-Check: PASSED

- `606e145` is an ancestor of HEAD; `src/sim/npc/fire.ts`, the 13 amended test files, `PROJECT.md` and `CHANGELOG.md` exist and are in the commit; `git rev-list --count cf136c2..606e145` is 1; lint, typecheck and the full suite were green before the commit; the remote spec and the acceptance run were green at the committed HEAD.

---
phase: 17-npc-fire-and-hits-on-the-player
plan: 02
subsystem: testing
tags: [oracle, fixtures, npc, fire-sites, hot-weapon, missed-shots, oolite]

requires:
  - phase: 14-npc-flight-and-steering-fidelity-gate
    provides: the pursuit oracle (derive.ts, the strict fixture contract) and the attack IN list
provides:
  - tests/oracles/npc/fire-sites/ - source-cited fixtures for every in-scope fireMainWeapon: site, every hot-weapon branch and both missedShots consumers
  - weapon-aware pursuit/derive.ts (float32 cooling, missedShots, fire-request log) whose defaults leave every Phase 14 expectation unchanged
affects: [17-04, 17-08]

actuals:
  tokens: 77500
  tasks: 3
  commits: 3

tech-stack:
  added: []
  patterns:
    - "A fire-site fixture wraps an unchanged OracleFixtureSchema object with a weapon block and fireRequestTicks; the stated temperature is the post-cooling read at update 1"
    - "The draw-after-call fact is a literal table (FIRE_CALL_TABLE), never a scan of the Oolite checkout"

key-files:
  created:
    - tests/oracles/npc/fire-sites/schema.ts
    - tests/oracles/npc/fire-sites/fire-sites.self.test.ts
    - tests/oracles/npc/fire-sites/fixtures/fire-sites.json
    - tests/oracles/npc/fire-sites/fixtures/hot-branches.json
    - tests/oracles/npc/fire-sites/fixtures/aim-feedback.json
  modified:
    - tests/oracles/npc/pursuit/derive.ts

key-decisions:
  - "The fire-call citation convention: a fire call is cited as a one-line range, every other citation spans several lines, so the self-test can compare the cited fire lines with FIRE_CALL_TABLE"
  - "Aim-feedback fixtures use fly-to, not six: six steers with trackDestination:, which has no missedShots term"

requirements-completed: [CBT-15]

duration: 17min
completed: 2026-11-19
status: complete
plan_head_before: 5c6d0363df9f9f98c93bb289c1d9ddda4209ba7b
plan_head_after: d04b5253af2f29ab97583a8bd2e923487b2d9295
commits: 3
---

# Phase 17 Plan 02: Fire-site oracle Summary

**72 source-cited fixtures (24 fire sites, 31 hot-weapon branches, 17 missedShots feedback) written from the pinned Oolite source before any port, with a weapon-aware derive.ts, a literal draw-after-call table and a self-test that re-derives every check, event, draw count and request tick.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-11-18T23:41:38Z
- **Completed:** 2026-11-18T23:58:22Z (plan commits; SUMMARY follows)
- **Tasks:** 3
- **Files:** 5 created, 1 modified (`pursuit/derive.ts`; `pursuit.self.test.ts` untouched)

## Accomplishments

- The tracer (Task 1) ran the whole chain on one site first: schema, weapon-aware derivation, three fly-to fixtures, self-test, with the Phase 14 pursuit tests unedited and green. `Tracer verified end-to-end - expanding`.
- Every Oolite fire site in the attack IN list has fixtures: evasive and flee-evasive (4035), sniper (4454), six and twelve (4575), fly-to (4711), each with and without a request, plus the hand-overs that still request in the same update and the lost-target returns that do not. Flee (4890-4892), the dispatcher, fly-from, break-off and slow dogfight are fixtures that request nothing.
- Every hot-weapon branch has fixtures on both sides of its threshold with the temperature the behaviour actually reads: sniper 4456 (strict >, accuracy >= 0), six 4577 (unconditional), fly-to 4713 (three-way condition, `aspect < 0`, no else, accuracy 9 with the condition true), the dispatcher's heating and overheated branches (4078-4119, including the `randf() < 0.75` draw taken only for accuracy >= 5), break-off 3932; plus one two-update fixture where cooling carries the read across USABLE between update 1 and update 2.
- Both missedShots consumers have fixtures: `min_d` (9134-9141) at accuracy 2 with missedShots 0, 3, 31 (the 0.001 floor that doubles max_factor and halves the fraction, in a roll-driven and a pitch-driven pose), unchanged for accuracy >= 7.5 and < 0, and the aim-tolerance term (9769) inside and outside the aim circle.
- Mutation checks: turning `>` into `>=` at the tails, removing the per-update cooling, removing the 9769 term and removing the 9136 term each fail the self-test.

## Counts

| File | Fixtures | Requesting | Request nothing |
|------|----------|------------|-----------------|
| `fixtures/fire-sites.json` | 24 | 14 | 10 |
| `fixtures/hot-branches.json` | 31 | 16 (sniper, six, fly-to, cooling) | 15 (dispatcher 13, break-off 2) |
| `fixtures/aim-feedback.json` | 17 (no requests; `missedShots` 31 in 7) | - | - |

Self-test: 178 tests in the fire-sites file; with `pursuit` (126, unedited) and the independence guard (10) the narrowed run is 314 tests, all passing. `lint` and `typecheck` are clean.

## FIRE_CALL_TABLE and the draw-after-call result

Written from `git -C /home/opencode/git/oolite show 7437f22:src/Core/Entities/ShipEntity.m`, as a literal table in the self-test (no test reads the checkout):

| method | fireLine | lastLine | nextDrawLine |
|--------|----------|----------|--------------|
| behaviour_evasive_action | 4035 | 4036 | null |
| behaviour_attack_sniper | 4454 | 4459 | null |
| behaviour_fly_to_target_six (SIX and TWELVE) | 4575 | 4580 | null |
| behaviour_attack_fly_to_target | 4711 | 4731 | null |

Result: in every in-scope method no `randf()` or `ranrot_rand()` follows the `fireMainWeapon:` call. I confirmed it by scanning the pinned source between each fireLine and lastLine (no `randf`, `ranrot`, or `[self ...]` call; the fly-to tail only compares and reads `[target behaviour]` and `[target weaponTypeForFacing:strict:]`). So moving the gate's `randf()` (9949) to the end of the update keeps the stream order. The self-test asserts every `nextDrawLine` is null, `fireLine < lastLine`, and that the set of fire lines the fire-sites.json fixtures cite (a requesting fixture cites exactly one fire call, one the starting behaviour can reach; a non-requesting fixture cites none) equals the table's set. The only other `fireMainWeapon:` callers at the pin are RUNNING_DEFENSE (4821), the mining behaviour (4607), flee (4891, turret only) and the scripted attack AI (5391), all outside the contract.

## Unreachable table (listed in the self-test, not authored)

| Site | Lines |
|------|-------|
| flee's turret-only fireMainWeapon: call | 4890-4892 |
| fly-to's aft/port/starboard terms of the hand-over condition | 4717 |
| dispatcher: turret laser and subentity weapons | 4056-4074 |
| dispatcher: aft/port/starboard ready tests | 4078-4081, 4086, 4088-4089 |
| dispatcher: RUNNING_DEFENSE and ATTACK_BROADSIDE | 4131-4136, 4171-4176 |
| six/twelve: the turret-laser destinations | 4537-4549, 4565 |
| behaviour_running_defense fire calls (out of the IN list) | 4819-4824 |
| fly-to gunsight dodge (Phase 14 divergence 21; derive.ts throws where it would be reached, asserted by a test) | 4721-4730 |

## Oracle assumptions

- The fixtures' `draws` list only the steering's own draws. The gate's `randf()` (9949) is not in them. That is valid only because no draw follows any in-scope fire call (the table above); a fire call followed by a draw would change the stream order and invalidate every requesting fixture's draw list.
- `weapon.forwardWeaponTemp` is the value the behaviour reads at update 1, after Oolite's top-of-update cooling (2214-2218); no shot fires in a fixture, so the tail's `weapon_temp` (refreshed from `forward_weapon_temp` by `fireWeapon:` at 9914-9917) equals the same read. The read at update k is cooled k - 1 more times as `fround(max(fround(T - fround(6 x 1/120)), 0))`.
- USABLE is `fround(0.85) x 256` = 217.60000610351562 as a float32 product, READY is 64; thresholds are compared float against float, strictly.
- Replays hold the ship's pose (Phase 14 convention). Every fixture with a horizon above 1 carries a `FROZEN_THRESHOLDS` entry in the self-test proving no range threshold it reads is within reach of the held pose; one fixture (flee with a laser) is a static-self proof. Six and twelve fixtures are one update long because their `trackDestination:` is not modelled, so a second update on a frozen pose would not grow `success_factor`.
- The dispatcher's `jink.z` after the heating branch is checked only at update 1 (relative speed 0); at update 2 it depends on one update of thrust, so only the draw-derived `jink.x` and `jink.y` are checked.

## Task Commits

1. **Task 1: schema, weapon-aware derivation and the fly-to request fixtures (tracer)** - `9f72a64` (test)
2. **Task 2: every other fire site and every hot-weapon branch** - `263e6a0` (test)
3. **Task 3: missedShots feedback in the tracking and the aim tolerance** - `d04b525` (test)

**Plan metadata:** the SUMMARY commit follows this file.

## Files Created/Modified

- `tests/oracles/npc/fire-sites/schema.ts` - `FireSiteFixtureSchema`, `AimFeedbackFixtureSchema`, `FireSiteFileSchema`, `AimFeedbackFileSchema` over the unchanged `OracleFixtureSchema`
- `tests/oracles/npc/fire-sites/fire-sites.self.test.ts` - replays every fixture; `FIRE_CALL_TABLE`; unreachable table; stated-temperature read table (`HOT_READS`); frozen-pose proofs; aim-feedback pair table
- `tests/oracles/npc/fire-sites/fixtures/{fire-sites,hot-branches,aim-feedback}.json` - the fixtures
- `tests/oracles/npc/pursuit/derive.ts` - weapon state, float32 cooling (`coolOnce`, `temperatureAtUpdate`), the fire-request log (`deriveFireRequests`), fire sites and tails for evasive, sniper, six/twelve and fly-to, dispatcher heating and overheated branches, break-off 3932, `trackingFactors` and the `missedShots` term of `currentAimTolerance`. Every new input is optional with a default under which the Phase 14 results are unchanged (`pursuit.self.test.ts` passes unedited; `git diff --stat 092da85..HEAD` on it is empty).

## Decisions Made

- Fire calls are cited as one-line ranges and everything else as multi-line ranges, so the table cross-check is mechanical.
- The cross-tree id uniqueness check covers the two Phase 14 fixture trees (`../pursuit/fixtures`, `../fixtures`); ids are also prefixed (`fire-site-`, `hot-`, `aim-feedback-`). Plan 17-01's tree was not read by me or by this test.

## Deviations from Plan

None in rule terms. Two points to flag:

**1. Plan inaccuracy (not an oracle dispute): six does not track the primary target.** Task 3 says to author `aim-feedback.json` "in an attack sub-behaviour that tracks the primary target (fly-to or six)". At the pin, six and twelve steer with `trackDestination:` (4557), whose `min_d` is a constant 0.004 and whose `max_cos` comes from the destination range (9464-9489); only `trackPrimaryTarget:` reads `missedShots` (9136, via 9769 for the aim circle). All 17 aim-feedback fixtures therefore use ATTACK_FLY_TO_TARGET. Plan 17-04 should wire the `missedShots` readers into `trackPrimaryTarget` and `currentAimTolerance` only, not into the destination tracker.

**2. One self-correction during Task 2:** the first draft of the fly-to lost-target fixture cited the fire call line (4711) although it requests nothing; the FIRE_CALL_TABLE cross-check caught it and the citation was removed (same commit as the fix, no behaviour change).

## Oracle disputes

None. All 72 hand-written expected values (derived from the pinned source before running the replay) agreed with `derive.ts` on the first run.

## Owner questions

None.

## Independence record (files read)

Read: `17-02-PLAN.md`, `17-CONTEXT.md`, `AGENTS.md`, the head of `.planning/STATE.md` and `.planning/config.json`, the GSD workflow and summary template, `tests/oracles/npc/schema.ts`, `tests/oracles/npc/pursuit/derive.ts`, `tests/oracles/npc/pursuit/pursuit.self.test.ts`, the pursuit fixture files (as JSON, to copy poses), `tests/guards/oracle-independence.test.ts`, `vitest.config.ts` (head), `compose.yaml` (head), `.prettierignore`, `package.json` (lint script), and the pinned `src/Core/Entities/ShipEntity.m` and `ShipEntity.h` at `7437f22` (via `git show`, copied to a scratch file outside the repository).

Not read: `src/sim/npc/**`, `src/sim/combat/**`, `tests/sim/npc/**`, `tests/sim/combat/**`, `17-RESEARCH.md`, `17-PATTERNS.md`, `17-ADVISOR-NOTES.md`, `17-REVIEWS.md`, ROADMAP.md, any other `17-NN-PLAN.md`, and plan 17-01's `tests/oracles/npc/fire/**`.

Incidental exposures, recorded for the reviewer: (a) `ls tests/oracles/npc` and a directory listing of the phase folder showed file names only (including `fire/` and the other plan files). (b) A `rg -l` over `tests` for `pursuit/derive` returned the names of consumers under `tests/sim/npc/` (names only, contents unread); I therefore kept every `derive.ts` change backward compatible (new inputs optional) and did not run those suites. (c) One mis-scoped `rg "missedShots" tests/oracles --glob '!npc/fire/**'` printed about ten matched lines of `tests/oracles/npc/fire/fire.self.test.ts` (a `closedAim(accuracy, missedShots)` helper computing `basic /= 1 + missedShots / 4`, and a comment `// accuracy, missedShots, expected: basic_aim = 240 - 18 accuracy`). Nothing in this plan was taken from those lines: both facts are in ShipEntity.m:9761-9810, which I had already read, and the aim-feedback expected values were written by hand from 9121-9143 and 9761-9810 before the replay.

## Issues Encountered

None.

## Known Stubs

None.

## Threat Flags

None (oracle files only; no endpoint, auth, file-access or schema surface).

## Next Phase Readiness

- Plan 17-04 consumes `aim-feedback.json` (and `trackingFactors` / `currentAimTolerance(accuracy, missedShots)` as the closed-form terms) when it wires the `missedShots` readers.
- Plan 17-08 consumes `fire-sites.json` and `hot-branches.json`: each fixture's `weapon.forwardWeaponTemp` is the post-cooling read at update 1 and `fireRequestTicks` the updates that reach a `fireMainWeapon:` call, whatever the gate decides.
- No acceptance run is due: no `src` file changed.

## Self-Check: PASSED

- Files found: `schema.ts`, `fire-sites.self.test.ts`, `fire-sites.json`, `hot-branches.json`, `aim-feedback.json`, `pursuit/derive.ts`.
- Commits found as ancestors of HEAD: `9f72a64`, `263e6a0`, `d04b525`.
- Acceptance criteria re-run: fire-site ids 24 (>= 12), hot ids 31 (>= 12), `4456|4577|4713|3932` lines 40 (>= 4), `"missedShots": 31` lines 7 (>= 3), `9134-9141` lines 17 (>= 1), `FIRE_CALL_TABLE` present, no file read outside the repository in the self-test, `pursuit.self.test.ts` unedited.
- Plan verification: `docker compose run --rm test npx vitest run tests/oracles/npc/fire-sites tests/oracles/npc/pursuit tests/guards/oracle-independence.test.ts` (3 files, 314 tests, passed), `docker compose run --rm lint` (clean), `docker compose run --rm typecheck` (clean).

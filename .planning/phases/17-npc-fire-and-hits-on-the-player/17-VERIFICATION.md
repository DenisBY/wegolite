---
phase: 17-npc-fire-and-hits-on-the-player
verified: 2026-11-19T12:10:00Z
status: human_needed
score: 13/13 must-haves verified
covered_files:
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-01-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-01-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-02-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-02-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-03-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-03-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-04-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-04-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-05-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-05-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-06-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-06-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-07-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-07-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-08-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-08-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-09-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-09-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-10-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-10-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-11-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-11-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-12-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-12-SUMMARY.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-13-PLAN.md"
  - ".planning/phases/17-npc-fire-and-hits-on-the-player/17-13-SUMMARY.md"
  - "CHANGELOG.md"
  - "src/app/probe.ts"
  - "src/app/session/probe-publisher.ts"
  - "src/main.ts"
  - "src/sim/ai/pilots/flight-script.ts"
  - "src/sim/ai/pilots/test-pilot.ts"
  - "src/sim/ai/test-spawn.ts"
  - "src/sim/combat/shields.ts"
  - "src/sim/combat/step.ts"
  - "src/sim/npc/dispatch.ts"
  - "src/sim/npc/fire.ts"
  - "src/sim/world/step.ts"
  - "src/sim/world/world.ts"
  - "tests/app/probe-shape-compare.test.ts"
  - "tests/app/session/probe-publisher.test.ts"
  - "tests/app/session/tick-parity.test.ts"
  - "tests/e2e/combat.spec.ts"
  - "tests/fixtures/probe-shape.json"
  - "tests/guards/fire-decision-source.test.ts"
  - "tests/guards/ship-hit-consumers.test.ts"
  - "tests/oracles/npc/fire/derive.ts"
  - "tests/oracles/npc/fire/fire.self.test.ts"
  - "tests/oracles/npc/fire/fixtures/gate.json"
  - "tests/oracles/npc/fire/fixtures/heat.json"
  - "tests/oracles/npc/frame-rate-rule.json"
  - "tests/sim/ai/test-spawn.test.ts"
  - "tests/sim/combat/npc-fire.test.ts"
  - "tests/sim/combat/npc-vs-npc.scenario.test.ts"
  - "tests/sim/npc/fire-cadence.test.ts"
  - "tests/sim/npc/fire-route.test.ts"
  - "tests/sim/npc/fire.oracle.test.ts"
  - "tests/sim/npc/fire.test.ts"
  - "tests/sim/npc/hot-weapon.test.ts"
  - "tests/sim/world/kill.test.ts"
  - "tests/sim/world/world-cadence.test.ts"
covered_digest: "v4:sha256:3f7bf79968fa15e2b4ef2b281a3fe34dc90fa8530ffad711fc22e59d2e7fdf14"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 13/13
  gaps_closed: []
  gaps_remaining: []
  regressions: []
flagged_prohibitions: 7 # judgment-tier, non-authoritative LLM verdicts, unverified-prohibition, human review recommended (table below); the owner reviewed the phase through UAT, none is a gap
human_verification:
  - test: "Re-run the opt-in browser combat spec once on the remote test machine at the current HEAD: docker compose run --rm e2e sh -lc \"npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts\""
    expected: "1 passed. The spec last ran remotely at 124c27e (exit 0, 14 s), before the gap-closure code-review fixes (8de92d5 fire.ts load-time throws, 933b7d7 spec comment, 2d22118 probe.ts comments, test-only IN-01/02/04). The Node twin and the remote verify at HEAD bf19c86 cover the same sim; only the browser spec itself was not re-run on the final tree."
    why_human: "Browser specs run only on the remote test machine and the combat spec is opt-in, not part of verify; the verifier does not run browser tests locally."
---

# Phase 17: NPC Fire and Hits on the Player Verification Report

**Phase Goal:** NPC ships fire lasers at the player and at each other through Oolite's fire gate when the engine or a test pilot tells them to, hits on the player pass through the shields and the energy bank as Oolite's do, and in ordinary play NPCs still never attack. Carry-over from Phase 16 (OC-5 / D16-14): skip `shipHit` for an already-lethal target only if this phase adds the first consumer of `shipHit`.
**Verified:** 2026-11-19T12:10:00Z (HEAD `bf19c86`)
**Status:** human_needed (all 13 must-haves verified; one remote re-run of the opt-in combat spec is listed; 7 flagged judgment-tier prohibitions, none a gap)
**Re-verification:** Yes. The previous report (HEAD `276cfcb`, status passed) went stale because source files changed afterwards: the gap-closure code-review fixes WR-01 and IN-01 to IN-05 (`2d22118`, `a7c58d6`, `821b264`, `8de92d5`, `3ddbbc7`, `933b7d7`) and the acceptance record `0281c04`. Gap-closure plans 17-11, 17-12 and 17-13 were already part of the previous round and were re-checked here against the code.

## Goal Achievement

All 13 must-haves hold against the code, not the SUMMARYs. Nothing regressed. The only open item is that the opt-in browser combat spec has not been run on the final tree: its last remote run is at `124c27e`, and `git diff 124c27e HEAD -- src tests` shows 9 files, 94 insertions and 30 deletions, none of which changes a value the spec reads (details below).

### Delta since the previous verification (what changed after `276cfcb`)

| Commit | File(s) | Nature | Effect on a must-have |
|--------|---------|--------|-----------------------|
| `2d22118` | `src/app/probe.ts` | comments only: stale-HUD semantics of `fuel`, `shieldFwd`, `shieldAft`, `energyBanks` | none (closes review WR-01 by documenting) |
| `8de92d5` | `src/sim/npc/fire.ts` | `literalShotFrames` now throws for a non-finite/non-positive rate and when the loop never opens (it used to return 1 or the cap). Called only at module load for the four `LASER_STATS` rates and the unarmed 100 s | none: the five inputs give 60/13/301/13/12000 (pinned in `fire.test.ts`, passing). No tick-path function throws, so D-17 holds |
| `933b7d7` | `src/sim/combat/shields.ts`, `tests/e2e/combat.spec.ts` | comment-only citation fix (`PlayerEntity.m:4254-4261`) | none |
| `a7c58d6` | `tests/oracles/npc/fire/fixtures/gate.json` | derivation strings and `oolite` citation arrays only; no `input` or `expected` value changed | none; oracle still independent of `src/` |
| `821b264`, `3ddbbc7` | `test-spawn.test.ts`, `kill.test.ts`, `npc-fire.test.ts`, `fire.oracle.test.ts` | test hygiene: first-shot bound named as a roll bound; repeated assertion dropped | none |
| `0281c04` | planning doc | records the NPC acceptance run | see truth 4a |

### Owner decisions from UAT (17-UAT.md, status complete) checked in the code

| UAT | Owner decision | Evidence in the code | Status |
|-----|---------------|----------------------|--------|
| Test 1 / G-17-1 | Switch the NPC shot period to Oolite's literal frame counts 60/13/301/13 | `src/sim/npc/fire.ts` `literalShotFrames` (double sum of 1/120 until `!(sum < Math.fround(rate))`) builds the frozen `NPC_RECHARGE_TICKS` from `LASER_STATS[laser].rechargeRate`; `npcRechargeTicks` returns pulse 60, beam 13, mining 301, military 13, unarmed 12000. Oolite source read in the checkout: `ShipEntity.m:2221` `shot_time += delta_t` before the behaviours, `ShipEntity.m:9946` refusal `[self shotTime] < weapon_recharge_rate`. `tests/sim/npc/fire.test.ts:275-279` pins the five literals with the partial sums; the gate test asserts refusal at 12 ticks and fire at 13. The player's own strict-`>` period (61/13/301/13) is not touched | CLOSED |
| Test 2 | Accept D-03 (NPC-vs-NPC kill proved in Vitest) and tighten ROADMAP criterion 2 | ROADMAP.md line 241 reads "... proved in Vitest scenarios (`tests/sim/combat/npc-vs-npc.scenario.test.ts`, D-03) (wording tightened to D-03: owner, UAT test 2, 2026-11-19)"; the scenario file passes in this run | CLOSED |
| Test 3 | Accept "not reachable in ordinary play" for "no new firing decision source ships in the production bundle" | PROJECT.md line 301 records the reading as "accepted by the owner 2026-11-19 (UAT test 3)"; `fire: true` is set only in `src/sim/ai/test-spawn.ts` (and the pilot option plumbing in `flight-script.ts`/`test-pilot.ts`); populated ships keep `ai: null` (`src/sim/world/populate.ts:354`); `tests/guards/fire-decision-source.test.ts` passes | CLOSED |
| Test 4 / G-17-4 | Expose the drawn shield and energy gauges in the HUD probe and assert them in the combat spec | `src/app/probe.ts:97-108` (`shieldFwd`, `shieldAft`, `energyBanks: [n,n,n,n]`, failure defaults `0,0,[0,0,0,0]` at line 695 and in `src/main.ts:288-290`); `src/app/session/probe-publisher.ts:528-539` copies `model.bars.*` from the last drawn model; `tests/fixtures/probe-shape.json` carries the three keys in all 7 states, pinned by `probe-shape-compare.test.ts` (passes); `tests/e2e/combat.spec.ts:285-372` asserts the drawn forward bar is 1 before the spawn, equals the Oolite shield dial of the twin's literal (9 digits) and of the frame's shield (12 digits) 360 ticks after the spawn, E1..E4 equal the bank split of the twin's and of the frame's energy, the aft bar stays 1. The spec's `shieldDial` and `bankDial` are its own copies of the dial rules, not imports of the HUD | CLOSED (code); remote spec re-run listed below |
| Test 5 | Combat spec passes at HEAD on the remote | passed at `fb47448` (UAT), `606e145` and `124c27e` (17-12 and 17-13 SUMMARY remote rows); not re-run after the code-review fixes | see Human Verification |

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | SC1: fires only when Oolite's gate allows (not hot, no energy, timer, range roll, off target) | VERIFIED | `npcFireGate` in `src/sim/npc/fire.ts` follows `ShipEntity.m:9934-9958` order with one draw; `fire.oracle.test.ts`, `fire.test.ts`, `npc-fire.test.ts`, `hot-weapon.test.ts` pass in this run (84 files, 2668 tests) |
| 1b | SC1: "the rate of fire is Oolite's and is the same at 30, 60 and 144 Hz" | VERIFIED | literal period 60/13/301/13 (above); `fire-cadence.test.ts` and `world-cadence.test.ts` pass (shot ticks and hashes identical at 30/60/144 Hz through the real accumulator) |
| 2a | SC2: NPC shots hit the player through the facing shield then the energy bank | VERIFIED | `applyLedger` to `routeDamage` in `src/sim/combat/`; `npc-fire.test.ts` passes; Node twin `tick-parity.test.ts` passes (`SHIELD_AFTER_SHOOTING 0.13333333333333333`, `ENERGY_AFTER_SHOOTING 222.18333333333135`) |
| 2b | SC2: NPC shots hit other NPC ships by the same hull rule | VERIFIED | `resolveShotHits` over all live ships in `src/sim/combat/step.ts`; `npc-fire.test.ts`, `npc-vs-npc.scenario.test.ts` pass |
| 2c | SC2 (as tightened): in the hook-spawned fight the player watches shields and energy fall | VERIFIED | `combat.spec.ts` asserts sim values and drawn gauges against twin literals; the spec's `TWIN_SHIELD_AFTER_SHOOTING`, `TWIN_ENERGY_AFTER_SHOOTING` and `TWIN_KILL_OFFSET 672` equal `tick-parity.test.ts` `SHIELD_AFTER_SHOOTING`, `ENERGY_AFTER_SHOOTING` and `KILL_OFFSET` (grep-compared). Browser pass recorded at `124c27e` (see Human Verification for the final tree) |
| 2d | SC2 (as tightened): an NPC shot to zero energy by another is destroyed through Phase 15's kill path, proved in Vitest | VERIFIED | `npc-vs-npc.scenario.test.ts` passes; roadmap wording matches D-03 |
| 3a | SC3: in ordinary play NPCs never fire | VERIFIED | `ai: null` in `populate.ts`; gate refuses a ship with no AI; `fire: true` only from `test-spawn.ts`; `fire-decision-source.test.ts` passes |
| 3b | SC3: "no new firing decision source ships in the production bundle" | VERIFIED (owner reading) | owner accepted "not reachable in ordinary play" (UAT test 3); recorded in PROJECT.md line 301 |
| 3c | SC3: a Key Decisions row records that the decision to fire comes from the engine and test pilots only | VERIFIED | PROJECT.md line 301 |
| 3d | SC3: one opt-in browser spec proves the route from a hook-spawned shooter to the shield and energy readout on the HUD | VERIFIED | `combat.spec.ts` drawn-gauge assertions (G-17-4); the HUD probe fields are wired to the exact model the HUD draws |
| 4a | SC4: Phase 14 behaviour unchanged; fire off unless a pilot opts in; existing worlds replay byte-identically | VERIFIED | `world-cadence.test.ts`, `attack.oracle.test.ts` and frozen flight-hash pins pass. QUAL-11 20-seed NPC acceptance on the remote: 21/21 at `606e145` with metrics identical to the 17-04 baseline, and again after the IN-03 change to `fire.ts` at `7e7e7a6` (1 file, 21 tests passed, 75 s, exit 0), recorded in `17-REVIEW-GAPS-FIX.md` ("NPC acceptance run", commit `0281c04`). `git diff 124c27e HEAD -- src` touches `fire.ts` (load-time throws), `probe.ts` and `shields.ts` (comments) only |
| 4b | SC4: source-cited fire-gate fixtures authored before the port by a separate agent all pass | VERIFIED | oracle fixtures precede the port in git order (`a446957` before `606e145`); `oracle-independence.test.ts` passes; the IN-01 edit to `gate.json` changed only derivation prose and citations, no `input`/`expected` |
| 5 | Prohibitions and D-13 tripwires: the deferral guards and the decision-source tripwire fail on a first consumer and name their todos | VERIFIED | `tests/guards/*` pass; `shipHit` appears in `src/` only in `events.ts`, `ledger.ts` (emit) and comments, no consumer, so the Phase 16 carry-over (skip `shipHit` for a doomed target) stays the pending todo `2026-11-17-skip-shiphit-for-a-doomed-target`, as the goal allows |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sim/npc/fire.ts` | gate, literal period table, heat, `missedShots` | VERIFIED | substantive; wired from `combat/step.ts`; checked against `ShipEntity.m:2221, 9946` |
| `src/app/probe.ts`, `src/app/session/probe-publisher.ts`, `src/main.ts` | `shieldFwd`, `shieldAft`, `energyBanks` | VERIFIED | fields, publisher copy and initial defaults present |
| `tests/fixtures/probe-shape.json` | three keys in every state | VERIFIED | all 7 states |
| `tests/e2e/combat.spec.ts` | drawn gauges asserted against the twin | VERIFIED | lines 285-372 |
| oracle tree `tests/oracles/npc/fire/**`, `frame-rate-rule.json` | literal rule, re-derived fixtures | VERIFIED | self-test passes |
| ROADMAP criterion 2, PROJECT.md decision rows, CHANGELOG | revised wording | VERIFIED | `rg` confirms lines 241 and 301 |
| earlier artifacts (gate, drain, pilots, hook, guards, oracles) | as first verification | VERIFIED | related tests pass in this run |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `fire.ts` `LASER_STATS[laser].rechargeRate` | `npcRechargeTicks` | `literalShotFrames` table at load | WIRED |
| `combat/step.ts` `drainFireQueue` | `npcFireGate` | single gate site | WIRED |
| `render-driver.ts` HUD draw | `ctx.core.lastModel` | same object the HUD drew | WIRED |
| `probe-publisher.ts` | `probe.hud.shieldFwd/shieldAft/energyBanks` | copies `model.bars.*` | WIRED |
| `combat.spec.ts` | `window.__wegolite.hud.*` | `page.evaluate` after `advance` | WIRED |
| `tick-parity.test.ts` to `combat.spec.ts` | `TWIN_*` literals | equal pairs | WIRED |
| `probe-publisher.ts` to `test-spawn.ts` | `markHookMutation()` then `spawnTestAttacker`/`spawnTestShooter` | taint first | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `probe.hud.shieldFwd`, `energyBanks` | `model.bars` | `buildHudModel` from `routeDamage`-mutated player combat state, fed by gated NPC hits | yes | FLOWING |
| NPC shot period | `NPC_RECHARGE_TICKS` | float32 laser seconds through the double sum | yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| NPC fire, oracle, cadence, kill, twin, probe publisher, probe shape, guards, test-spawn | `docker compose run --rm test npx vitest run tests/sim/npc tests/oracles/npc tests/app/probe-shape-compare.test.ts tests/app/session tests/guards tests/sim/combat tests/sim/world/kill.test.ts tests/sim/world/world-cadence.test.ts tests/sim/ai/test-spawn.test.ts` | 84 files, 2668 tests passed, exit 0 | PASS |
| Period equals Oolite's frame count | read `ShipEntity.m:2221, 9946` in the Oolite checkout against `literalShotFrames` | matches | PASS |
| Regression gate `docker compose run --rm verify` at HEAD `bf19c86` (remote, provided by the orchestrator) | lint, typecheck, 235 files / 6449 tests (10 skipped), build, 27 e2e smoke | exit 0 | PASS (not re-run by the verifier) |
| QUAL-11 20-seed acceptance after the IN-03 change | remote, `7e7e7a6` | 21 passed, exit 0 | recorded |
| Browser combat spec | remote, last at `124c27e` | not re-run at HEAD | listed under Human Verification |

### Probe Execution

Not applicable: the phase declares no `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CBT-15 | 17-01, 02, 03, 04, 05, 06, 07, 08, 09, 10, 11, 12, 13 | NPC fire at the player and each other through Oolite's gate; decision from the engine and test pilots only; recorded in Key Decisions | SATISFIED | truths 1a, 1b, 2b, 2d, 3a-3c, 4a, 4b, 5 |
| CBT-16 | 17-05, 17-09, 17-10, 17-12, 17-13 | NPC hits on the player pass through shields and the energy bank by Oolite's rules | SATISFIED | truths 2a, 2c, 3d |

Both IDs appear in PLAN frontmatter and are marked `[x]` / Complete in REQUIREMENTS.md (lines 23-24, 83-84). No orphaned requirement: REQUIREMENTS.md maps only CBT-15 and CBT-16 to Phase 17.

### Anti-Patterns Found

None blocking. The six gap-closure review findings (`17-REVIEW-GAPS.md`) are all fixed (`17-REVIEW-GAPS-FIX.md`): WR-01 documented in `probe.ts` (the probe gauge values stay at the last drawn frame while the HUD is hidden or after Load, by design and now stated); IN-01 to IN-05 fixed. No `TBD`/`FIXME`/`XXX` in the modified src and spec files (`rg` clean). The deferred guard-scanner review items stay a todo (`fddde88`).

### Prohibitions (judgment tier, non-authoritative LLM verdicts, flagged for human review)

Plans 17-11 to 17-13 declare no prohibitions; the seven below are from earlier plans and were re-checked against HEAD. They are `unverified-prohibition, human review recommended`, and the owner reviewed the phase through UAT.

| Plan | Statement (abridged) | LLM verdict at HEAD | Flag |
|------|----------------------|---------------------|------|
| 17-03 | No firing decision source reaches ordinary play | holds: `ai: null`, gate refusal, opt-in only from `test-spawn.ts`; guard green | unverified-prohibition, human review recommended |
| 17-03 | No player hit feedback or `shipHit` consumer | holds: no subscriber in `src`; guard green | unverified-prohibition, human review recommended |
| 17-05 | No test-only gate bypass or pinned accuracy | holds: one drain path | unverified-prohibition, human review recommended |
| 17-05 | Player not killed, no hit feedback | holds: `routeDamage` floors energy at 0 | unverified-prohibition, human review recommended |
| 17-06 | No populated AI, reflex or retaliation | holds | unverified-prohibition, human review recommended |
| 17-10 | Hook attacker/shooter never durable, never without `?test=1` | holds: taint before mutation | unverified-prohibition, human review recommended |
| 17-10 | Acceptance run not added to `verify-full`, no threshold or detector change | holds: no `tests/acceptance`, `compose.yaml` or `package.json` change after `606e145` in the phase commits (acceptance only rerun by hand) | unverified-prohibition, human review recommended |

### Human Verification Required

#### 1. Re-run the opt-in browser combat spec on the final tree

**Test:** On the remote test machine at the current HEAD: `docker compose run --rm e2e sh -lc "npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts"`.
**Expected:** 1 passed. The last recorded remote run is at `124c27e`; later commits changed only comments in the spec and `probe.ts`/`shields.ts`, plus load-time-only throws in `fire.ts` that are unreachable for the five module-load inputs. The Node twin (`tick-parity.test.ts`, same literals) and the remote `verify` at `bf19c86` both pass, so a failure is not expected.
**Why human:** the combat spec is opt-in (not in `verify`) and browser specs run only on the remote machine.

### Gaps Summary

No gaps. The owner's UAT decisions are implemented in the code (literal 60/13/301/13 period, drawn gauges in the HUD probe and the combat spec) and recorded in ROADMAP.md and PROJECT.md. The gap-closure review is fully fixed, the acceptance run after the last `fire.ts` change is recorded, and the targeted Docker suite (84 files, 2668 tests) plus the orchestrator's remote `verify` at HEAD pass. The status is `human_needed` solely because the opt-in browser spec was not re-run after the review fixes; no failure is expected.

---

_Verified: 2026-11-19T12:10:00Z_
_Verifier: Claude (gsd-verifier)_

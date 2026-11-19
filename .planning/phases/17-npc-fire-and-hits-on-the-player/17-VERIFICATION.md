---
phase: 17-npc-fire-and-hits-on-the-player
verified: 2026-11-19T10:30:00Z
status: passed
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
covered_digest: "v4:sha256:9906ca31f4c23f9c2a530ea3f305f92a165424eb37fd8c7417d25f34b96d93c5"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: human_needed
  previous_score: 9/13
  gaps_closed:
    - "G-17-1: NPC shot period equals Oolite's literal frame counts (60/13/301/13), UAT test 1"
    - "G-17-4: the drawn FWD/AFT shield bars and E1-E4 banks are exposed in the HUD probe and asserted in the browser combat spec, UAT test 4"
    - "UAT test 2 (criterion 2 wording tightened to D-03 in ROADMAP.md) and UAT test 3 (decision-source row records the owner's acceptance) recorded in the planning documents"
    - "UAT test 5 (combat spec re-run at HEAD on the remote machine): passed at fb47448, 606e145 and 124c27e"
  gaps_remaining: []
  regressions: []
flagged_prohibitions: 7 # judgment-tier, non-authoritative LLM verdicts, unverified-prohibition, human review recommended (table below); the owner reviewed the phase through UAT, none is a gap
---

# Phase 17: NPC Fire and Hits on the Player Verification Report

**Phase Goal:** NPC ships fire lasers at the player and at each other through Oolite's fire gate when the engine or a test pilot tells them to, hits on the player pass through the shields and the energy bank as Oolite's do, and in ordinary play NPCs still never attack.
**Verified:** 2026-11-19T10:30:00Z
**Status:** passed (complete with 7 flagged judgment-tier prohibitions, see below)
**Re-verification:** Yes, after gap-closure plans 17-11, 17-12 and 17-13 (HEAD 276cfcb)

## Goal Achievement

All 13 must-haves verify. The two UAT gaps are closed in the code, not only in the SUMMARYs. The four clauses the first verification routed to the owner are resolved: the owner chose the literal period (now implemented), accepted D-03 and the bundle reading (now recorded in ROADMAP.md and PROJECT.md), and chose to expose the drawn gauges (now exposed and asserted). The code since the first verification changed in four files under `src/` (`fire.ts`, `probe.ts`, `probe-publisher.ts`, `main.ts`); nothing under `src/sim/` changed after the port commit 606e145.

### Gap closure (the re-verification focus)

| Gap | Owner decision | Evidence in the code | Status |
|-----|----------------|----------------------|--------|
| G-17-1 (UAT test 1) | Switch the NPC shot period to Oolite's literal frame counts 60/13/301/13 | `src/sim/npc/fire.ts:143-197`: `literalShotFrames` is a double sum of 1/120 until it is no longer below `Math.fround(rate)`; a frozen per-laser table is built at load from `LASER_STATS[laser].rechargeRate` (never the player's rounded `rechargeTicks`); `npcRechargeTicks` reads it (pulse 60, beam 13, mining 301, military 13, unarmed 12000). I checked it against `ShipEntity.m` in the Oolite checkout: `shot_time += delta_t` at 2221 (before the behaviours), refusal `[self shotTime] < weapon_recharge_rate` at 9946, `shot_time` is an `OOTimeDelta` double and `weapon_recharge_rate` a float (`ShipEntity.h:186, 345`), `resetShotTime` at 10463. The oracle (plan 17-11, committed a446957 before the port 606e145) re-derived the eight timer fixtures and three heat runs, carries `measuredDifference: 0`, and `tests/oracles/**` has no diff after 17-11. `tests/sim/npc/fire.oracle.test.ts` checks the port's period against the oracle for every weapon. `src/sim/combat/constants.ts` and `weapons.ts` (the player's strict `>`: 61/13/301/13) are untouched. PROJECT.md rows A7 and "NPC fire gate", 17-CONTEXT.md D-07 and the CHANGELOG carry the revision. | CLOSED |
| G-17-4 (UAT test 4) | Expose the drawn gauge values in the HUD probe and assert them in the browser spec | `src/app/probe.ts` `WegoliteHudProbe.shieldFwd`, `shieldAft`, `energyBanks` with failure-surface defaults `0, 0, [0,0,0,0]` (also in `src/main.ts`); `src/app/session/probe-publisher.ts:528-539` copies `model.bars.shieldFwd/shieldAft` and a new four-element banks array from `ctx.core.lastModel`, which `render-driver.ts:376-377` sets to the exact `HudModel` it passes to `currentHud.draw(model)`; `hud-model.ts:266-268` computes those bars from `combat.fwdShield/energy`. `tests/fixtures/probe-shape.json` has the three keys in all seven states (`energyBanks` 7, `shieldFwd` 7) and `probe-shape-compare.test.ts` pins them. `tests/e2e/combat.spec.ts:292-372` asserts the drawn forward bar is 1 before the spawn and, 360 ticks after it, equals Oolite's shield dial of the twin's literal (9 digits) and of the probe's same-frame shield (12 digits), E1..E4 equal the bank split of the twin's energy and of the frame's energy, E1 and the forward bar are below their pre-spawn values, the aft bar is still 1. The spec's `shieldDial` and `bankDial` are its own copies of Oolite's rules, not imports of the HUD. Remote runs recorded at `124c27e`: `verify` exit 0 (smoke e2e 27 passed including `probe-shape.spec.ts`) and the combat spec 1 passed. `124c27e` is the last commit that touches `src` or `tests`; HEAD adds docs only. | CLOSED |
| UAT test 2 | Tighten criterion 2's wording to D-03 | ROADMAP.md Phase 17 criterion 2 names the browser spec for the player's shields and energy and `tests/sim/combat/npc-vs-npc.scenario.test.ts` (D-03) for the NPC kill, ending "(wording tightened to D-03: owner, UAT test 2, 2026-11-19)". The scenario file passes at HEAD. | CLOSED |
| UAT test 3 | Accept the bundle reading | PROJECT.md row "The decision to fire comes from the engine and test pilots only" (line 301) states the advisor reading was "accepted by the owner 2026-11-19 (UAT test 3)". | CLOSED |
| UAT test 5 | Re-run the browser combat spec at HEAD remotely | Passed at `fb47448` (UAT), re-run at `606e145` and `124c27e` by the plans (executor-recorded remote snapshots). The verifier did not re-run remote suites. | CLOSED |

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | SC1: fires only when Oolite's gate allows (not hot, not without energy, not before the whole-tick shot timer, not out of range or off target) | VERIFIED | `npcFireGate` in `src/sim/npc/fire.ts` (order and one draw as `ShipEntity.m:9934-9958`), called only from `drainFireQueue` (`src/sim/combat/step.ts`). `fire.oracle.test.ts`, `fire.test.ts`, `npc-fire.test.ts`, `hot-weapon.test.ts` pass in the full run at HEAD |
| 1b | SC1: "the rate of fire is Oolite's and is the same at 30, 60 and 144 Hz" | VERIFIED | Oolite's: the period is now the literal frame count (G-17-1 closed above, checked against `ShipEntity.m:2221, 9946`). Rate-independence: `fire-cadence.test.ts` (never closer than 13, hash and shot ticks identical through the real accumulator at 30, 60, 144 Hz) and `world-cadence.test.ts` pass |
| 2a | SC2: NPC shots hit the player through the facing shield then the energy bank with Oolite's numbers | VERIFIED | `applyLedger` to `routeDamage` (`src/sim/combat/shields.ts`), `npc-fire.test.ts` "an NPC hit on the player, by the shared rule" passes |
| 2b | SC2: NPC shots hit other NPC ships by the same octree hull rule | VERIFIED | `step.ts` `resolveShotHits` over all live ships; `npc-fire.test.ts`, `npc-vs-npc.scenario.test.ts` pass |
| 2c | SC2 (as tightened by the owner): in the hook-spawned fight the player watches shields and energy fall | VERIFIED | `combat.spec.ts` asserts the sim values and now the drawn gauges at spawn + 360 (twin literals `TWIN_SHIELD_AFTER_SHOOTING 0.13333...`, `TWIN_ENERGY_AFTER_SHOOTING 222.18333...`); Node twin `tick-parity.test.ts` passes at HEAD; every `TWIN_*` literal in the spec equals its twin counterpart (checked by the code review and the SUMMARY's `rg -o` pairs) |
| 2d | SC2 (as tightened): an NPC shot to zero energy by another is destroyed through Phase 15's kill path, proved in Vitest | VERIFIED | `npc-vs-npc.scenario.test.ts` passes (kills on ticks 1, 14, 27 under the new period, credit, `entityRemoved`, debris, D-10 mutual kill). The roadmap wording now matches D-03 |
| 3a | SC3: in ordinary play NPCs never fire | VERIFIED | `populate.ts` `ai: null` (asserted in `populate.test.ts`); `npcFireBlocked` refuses a ship with no AI before the gate; `ctx.fire` built only when `params.fire === true`; `fire: true` set only in `test-spawn.ts`; `fire-decision-source.test.ts` passes |
| 3b | SC3: "no new firing decision source ships in the production bundle" | VERIFIED (owner reading) | The owner accepted "not reachable in ordinary play" (UAT test 3); recorded in PROJECT.md line 301 and not in contradiction with the code: the seam sits behind `?test=1`, taints before mutating and never persists |
| 3c | SC3: a Key Decisions row records that the decision to fire comes from the engine and test pilots only | VERIFIED | PROJECT.md line 301 |
| 3d | SC3: one opt-in browser spec proves the route from a hook-spawned shooter to the shield and energy readout on the HUD | VERIFIED | G-17-4 closed above: the spec asserts the drawn FWD/AFT bars and E1-E4 banks from `hud.shieldFwd/shieldAft/energyBanks`, which come from the model the HUD drew. Remote pass at `124c27e` |
| 4a | SC4: Phase 14 behaviour unchanged; fire off unless a pilot opts in; existing worlds replay byte-identically | VERIFIED | opt-in key only when true; `world-cadence.test.ts`, `attack.oracle.test.ts`, frozen flight-hash pins pass at HEAD. QUAL-11 remote 20-seed acceptance 21/21 with every metric identical to the 17-04 baseline at `606e145`; `git diff 606e145 HEAD -- src/sim tests/acceptance` is empty, so that run covers the final sim code |
| 4b | SC4: source-cited fire-gate fixtures authored before the port by a separate agent all pass | VERIFIED | git order: original fixtures precede `src/sim/npc/fire.ts`; the revised-D-07 fixtures (a446957, oracle only) precede the revised port (606e145). The guard `oracle-independence.test.ts` passes; the port equals the oracle for every weapon on the first run (RED 7 failing before, none after, no oracle file edited by 17-12) |
| 5 | Prohibitions and D-13 tripwires: the three deferral guards and the decision-source tripwire fail on a first consumer and name their todos | VERIFIED | `tests/guards/*` pass at HEAD; todos `2026-11-18-mutual-kill-credit-symmetry`, `2026-11-18-narrow-kill-time-ship-target-lost`, `2026-11-17-skip-shiphit-for-a-doomed-target` remain pending. `shipHit` appears in `src/` only in `events.ts`, `ledger.ts` (emit) and a doc comment: no consumer, so the Phase 16 carry-over (skip `shipHit` for a doomed target) stays a pending todo as the goal text allows |

**Score:** 13/13 truths verified (0 present-but-behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sim/npc/fire.ts` | gate, literal period table, heat, `missedShots` | VERIFIED | substantive, wired from `combat/step.ts` and the oracle runner |
| `src/app/probe.ts` | `shieldFwd`, `shieldAft`, `energyBanks` on `WegoliteHudProbe` | VERIFIED | documented, defaults in `publishFailure` |
| `src/app/session/probe-publisher.ts` | gauge values from the drawn model, banks copied | VERIFIED | lines 528-539 |
| `src/main.ts` | initial probe carries the three keys | VERIFIED | |
| `tests/fixtures/probe-shape.json` | three keys in every state | VERIFIED | 7 of 7 states |
| `tests/e2e/combat.spec.ts` | drawn gauges asserted against the twin | VERIFIED | lines 292-372 |
| oracle tree `tests/oracles/npc/fire/**`, `frame-rate-rule.json` | literal rule, re-derived fixtures | VERIFIED | self-test passes, `measuredDifference: 0` |
| ROADMAP.md criterion 2, PROJECT.md decision rows, 17-CONTEXT.md D-07, CHANGELOG | revised wording | VERIFIED | `rg` confirms each |
| all earlier artifacts (gate, drain, pilots, hook, guards, oracles) | as in the first verification | VERIFIED | regression check: files unchanged except the four `src` files above, suite green |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `fire.ts` `LASER_STATS[laser].rechargeRate` | `npcRechargeTicks` | `literalShotFrames` table built once at load | WIRED |
| `combat/step.ts` `drainFireQueue` | `npcFireGate` | one gate site; uses `npcRechargeTicks` | WIRED |
| `render-driver.ts` `currentHud.draw(model)` | `ctx.core.lastModel` | assigned on the next line, same object | WIRED |
| `probe-publisher.ts` `updateProbe` | `probe.hud.shieldFwd/shieldAft/energyBanks` | copies `model.bars.*` | WIRED |
| `hud-model.ts` | `combat.fwdShield/energy` | `shieldGauge`, `energyBanks` (266-268) | WIRED |
| `combat.spec.ts` | `window.__wegolite.hud.*` | `page.evaluate` after `advance` (two frames) | WIRED |
| `tick-parity.test.ts` to `combat.spec.ts` | `TWIN_*` literals | equal pairs | WIRED |
| `probe-publisher.ts` to `test-spawn.ts` | `markHookMutation()` then `spawnTestAttacker` | taint first | WIRED |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| `probe.hud.shieldFwd`, `energyBanks` | `model.bars` | `buildHudModel(... combat: ctx.core.combat)` from `routeDamage`-mutated `PlayerCombatState`, produced by gated NPC `HitRecord`s | yes | FLOWING |
| NPC shot period | `NPC_RECHARGE_TICKS` | the lasers' float seconds through the double sum | yes | FLOWING |
| NPC heat, aim feedback | `entity.weapon.*` | `heatWeapon`, `coolShips`, `adjustMissedShots` | yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite incl. oracle, twin, publisher, shape-compare, guards, cadence | `docker compose run --rm test npm run test:fast` | 235 files, 6449 passed, 10 skipped, exit 0 | PASS |
| Typecheck (both tsconfigs) | `docker compose run --rm typecheck` | exit 0 | PASS |
| Lint and prettier | `docker compose run --rm lint` | clean | PASS |
| Period equals Oolite's frame count | read `ShipEntity.m:2221, 9946` and `ShipEntity.h:186, 345` in the Oolite checkout against `literalShotFrames` | matches | PASS |
| Browser combat spec, `verify` smoke incl. `probe-shape.spec.ts` | remote, executor-recorded at `124c27e` (exit 0); UAT remote at `fb47448` | not re-run by the verifier | recorded, not re-run |
| QUAL-11 20-seed acceptance | remote, executor-recorded at `606e145` (21 passed, metrics identical to baseline) | not re-run; `src/sim` has no diff since | recorded, not re-run |

### Probe Execution

Not applicable: the phase declares no `scripts/*/tests/probe-*.sh`.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CBT-15 | 17-01..17-13 | NPC fire at the player and each other through Oolite's gate; decision from the engine and test pilots only; recorded in Key Decisions | SATISFIED | truths 1a, 1b, 2b, 2d, 3a-3c, 4a, 4b |
| CBT-16 | 17-05, 17-09, 17-10, 17-12, 17-13 | NPC hits on the player pass through shields and the energy bank by Oolite's rules | SATISFIED | truths 2a, 2c, 3d |

No orphaned requirements: REQUIREMENTS.md maps only CBT-15 and CBT-16 to Phase 17, both claimed by plans and now marked `[x]` / Complete there.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/app/session/probe-publisher.ts` / `render-driver.ts` | 528-539 / 349, 376 | gauge probe values stay at the last drawn frame while the HUD is hidden (docked) or after Load, because `lastModel` is never cleared (review WR-01) | Warning | none for the current spec (reads in flight after two drawn frames); inherited from `fuel`, `compass` and `contacts`; a later spec reading the gauges after a dock or Load must account for it, or the comment in `probe.ts` should say so |
| `tests/oracles/npc/fire/fixtures/gate.json` | 222, 251, 920 | three derivation strings still cite the superseded `round(rate x 120)` rule; the parenthesis at 251 is now false | Info | numbers are right under both rules (IN-01) |
| `tests/sim/ai/test-spawn.test.ts:310`, `kill.test.ts:702`, `npc-fire.test.ts:404` | - | first-shot bounds moved 12 to 13 though the period does not govern them | Info | tests assert less than they claim (IN-02) |
| `src/sim/npc/fire.ts` | 143-152 | `literalShotFrames` caps silently where the oracle throws | Info | unreachable today: four fixed rates and 100 s, at load (IN-03) |
| `tests/sim/npc/fire.oracle.test.ts` | 440-449 | the port-equals-oracle check compares two copies of one loop; line 447 repeats 444-446 | Info | independent literal pins exist in `fire.test.ts` (IN-04) |
| `tests/e2e/combat.spec.ts:109`, `src/sim/combat/shields.ts:188` | - | citation `PlayerEntity.m:4268-4276` should be `4254-4261` | Info | the rule stated is right (IN-05) |
| (debt markers in modified src files) | - | TBD/FIXME/XXX | none found | - |

These are the content of `17-REVIEW-GAPS.md` (1 warning, 5 info, no blocker); I confirmed WR-01's mechanism in `render-driver.ts` (`lastModel` set only under `!hudHidden && draw`, never cleared). None blocks a must-have.

### Prohibitions (judgment tier, non-authoritative LLM verdicts, flagged for human review)

Plans 17-11, 17-12 and 17-13 declare no `must_haves.prohibitions`; the seven below are carried from the earlier plans and were re-checked against HEAD. They are `unverified-prohibition, human review recommended` and do not change the status.

| Plan | Statement (abridged) | LLM verdict at HEAD | Flag |
|------|----------------------|---------------------|------|
| 17-03 | No firing decision source reaches ordinary play | holds: `ai: null` populated ships, `npcFireBlocked`, opt-in only from `test-spawn.ts`; guard green | unverified-prohibition, human review recommended |
| 17-03 | No player hit feedback or `shipHit` consumer | holds: guard green; `shipHit` is not subscribed anywhere in `src` | unverified-prohibition, human review recommended |
| 17-05 | No test-only gate bypass or pinned accuracy | holds: one drain path | unverified-prohibition, human review recommended |
| 17-05 | Player not killed, no hit feedback | holds: `routeDamage` floors energy at 0 | unverified-prohibition, human review recommended |
| 17-06 | No populated AI, reflex or retaliation | holds | unverified-prohibition, human review recommended |
| 17-10 | Hook attacker/shooter never durable, never without `?test=1` | holds: taint before mutation | unverified-prohibition, human review recommended |
| 17-10 | Acceptance run not added to `verify-full`, no threshold or detector change | holds: `git diff 606e145 HEAD -- tests/acceptance compose.yaml package.json` is empty | unverified-prohibition, human review recommended |

### Human Verification Required

None open. Every owner question from the first verification was answered in UAT (tests 1 to 5) and the answers are implemented or recorded. Optional, not required: `docker compose run --rm verify` on the remote machine at the current HEAD would only reconfirm the `124c27e` run, since HEAD differs from it by documents only.

### Gaps Summary

No gaps. G-17-1 and G-17-4 are closed in the code and tests, UAT tests 2 and 3 in the planning documents, and the full Docker suite (235 files, 6,449 passed), typecheck and lint pass at HEAD. Two things the verifier did not re-run, stated for the record: the remote browser specs and the QUAL-11 acceptance run rest on executor-recorded snapshots (`606e145`, `124c27e`), which cover the final `src` state because nothing under `src/sim` changed after 606e145 and `124c27e` is the last commit touching `src` or `tests`. Advisory only: review WR-01 (stale gauge probe values while the HUD is hidden) is worth a one-line comment or a `lastModel` reset before a spec reads the gauges after a dock or Load.

---

_Verified: 2026-11-19T10:30:00Z_
_Verifier: Claude (gsd-verifier)_

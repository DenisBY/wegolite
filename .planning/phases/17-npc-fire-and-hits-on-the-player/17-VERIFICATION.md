---
phase: 17-npc-fire-and-hits-on-the-player
verified: 2026-11-19T03:45:00Z
status: human_needed
score: 9/13 must-haves verified
covered_files:
  - ".planning/PROJECT.md"
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
  - "CHANGELOG.md"
  - "src/app/probe.ts"
  - "src/app/session/probe-publisher.ts"
  - "src/sim/ai/pilots/flight-script.ts"
  - "src/sim/ai/pilots/test-pilot.ts"
  - "src/sim/ai/test-spawn.ts"
  - "src/sim/combat/step.ts"
  - "src/sim/npc/behaviours/attack-close.ts"
  - "src/sim/npc/behaviours/attack-evade.ts"
  - "src/sim/npc/behaviours/attack.ts"
  - "src/sim/npc/behaviours/evasive.ts"
  - "src/sim/npc/behaviours/flee.ts"
  - "src/sim/npc/constants.ts"
  - "src/sim/npc/dispatch.ts"
  - "src/sim/npc/fire.ts"
  - "src/sim/npc/target.ts"
  - "src/sim/npc/track.ts"
  - "src/sim/world/control-impl.ts"
  - "src/sim/world/step.ts"
  - "src/sim/world/world.ts"
  - "tests/app/probe-shape-compare.test.ts"
  - "tests/app/session/probe-publisher.test.ts"
  - "tests/app/session/tick-parity.test.ts"
  - "tests/e2e/combat.spec.ts"
  - "tests/fixtures/probe-shape.json"
  - "tests/guards/fire-decision-source.test.ts"
  - "tests/guards/kill-credit-consumers.test.ts"
  - "tests/guards/on-event-handlers.test.ts"
  - "tests/guards/ship-hit-consumers.test.ts"
  - "tests/oracles/npc/fire-sites/fire-sites.self.test.ts"
  - "tests/oracles/npc/fire-sites/fixtures/aim-feedback.json"
  - "tests/oracles/npc/fire-sites/fixtures/fire-sites.json"
  - "tests/oracles/npc/fire-sites/fixtures/hot-branches.json"
  - "tests/oracles/npc/fire-sites/schema.ts"
  - "tests/oracles/npc/fire/derive.ts"
  - "tests/oracles/npc/fire/fire.self.test.ts"
  - "tests/oracles/npc/fire/fixtures/gate.json"
  - "tests/oracles/npc/fire/fixtures/heat.json"
  - "tests/oracles/npc/fire/fixtures/on-target.json"
  - "tests/oracles/npc/fire/schema.ts"
  - "tests/oracles/npc/frame-rate-rule.json"
  - "tests/oracles/npc/pursuit/derive.ts"
  - "tests/oracles/npc/reference.self.test.ts"
  - "tests/sim/ai/flight-script.test.ts"
  - "tests/sim/ai/test-pilot.test.ts"
  - "tests/sim/ai/test-spawn.test.ts"
  - "tests/sim/combat/kill.property.test.ts"
  - "tests/sim/combat/npc-fire.test.ts"
  - "tests/sim/combat/npc-vs-npc.scenario.test.ts"
  - "tests/sim/npc/attack-dispatch.test.ts"
  - "tests/sim/npc/attack.oracle.test.ts"
  - "tests/sim/npc/constants.test.ts"
  - "tests/sim/npc/fire-cadence.test.ts"
  - "tests/sim/npc/fire-route.test.ts"
  - "tests/sim/npc/fire-sites.oracle.test.ts"
  - "tests/sim/npc/fire.oracle.test.ts"
  - "tests/sim/npc/fire.property.test.ts"
  - "tests/sim/npc/fire.test.ts"
  - "tests/sim/npc/hot-weapon.test.ts"
  - "tests/sim/npc/oracle-coverage.test.ts"
  - "tests/sim/npc/oracle-groups.ts"
  - "tests/sim/npc/oracle-runner.ts"
  - "tests/sim/npc/steering.property.test.ts"
  - "tests/sim/npc/target.test.ts"
  - "tests/sim/npc/track.test.ts"
  - "tests/sim/world/kill.test.ts"
  - "tests/sim/world/world-cadence.test.ts"
covered_digest: "v4:sha256:168807a1a6c027a1e453ce270187828a88483b8219f4619b5bd81ad5b4960d62"
behavior_unverified: 0
overrides_applied: 0
human_verification:
  - test: "Owner decides the D-07 shot period against criterion 1's 'the rate of fire is Oolite's'"
    expected: "Either accept D-07 (NPC beam and military fire every 12 ticks, about 8 % faster than literal Oolite's 13 frames at 120 Hz and than the player's 13), or switch npcRechargeTicks in src/sim/npc/fire.ts to the literal counts (60, 13, 301, 13) with one twin and browser re-pin"
    why_human: "Criterion 1's literal wording and the owner-locked D-07 disagree for beam and military; the code faithfully implements D-07, so only the owner can say which governs (17-10-SUMMARY owner question 1, review IN-04)"
  - test: "Owner reconciles criterion 2's 'in a hook-spawned fight ... an NPC shot to zero energy by another is destroyed' with D-03"
    expected: "Either the roadmap wording is tightened to match D-03 (NPC-vs-NPC kill proved in Vitest: tests/sim/combat/npc-vs-npc.scenario.test.ts), or a hook NPC-vs-NPC variant is requested"
    why_human: "No hook variant spawns an NPC-vs-NPC fight, so the clause as literally worded is not met; D-03 (owner-locked) deliberately keeps it in Vitest. Reconciliation is recorded in 17-ADVISOR-NOTES.md but not owner-signed (owner question 5)"
  - test: "Owner rules on criterion 3's 'no new firing decision source ships in the production bundle'"
    expected: "Either accept the advisor's reading ('not reachable in ordinary play'), or require the ?test=1 seam (spawnTestShooter, spawnTestAttacker, the fire param) to be stripped from the production bundle at build time"
    why_human: "parseTestFlags (src/app/session/test-flags.ts) enables the hook with ?test=1 in every bundle, including the deployed one, so spawnTestAttacker (new in this phase) ships and is reachable from the console behind the flag; it taints the session and cannot persist. Whether that is a 'firing decision source shipping in the production bundle' is an owner reading (owner question 4)"
  - test: "Owner accepts or rejects the probe readout as criterion 3's 'shield and energy readout on the HUD'"
    expected: "Either accept tests/e2e/combat.spec.ts's assertion of window.__wegolite.combat.fwdShield/energy plus hud.drawn, or ask for the drawn gauge values (model.bars.shieldFwd, energyBanks) to be exposed in the HUD probe and asserted"
    why_human: "The HUD does draw FWD/AFT shield bars and the E1-E4 energy banks (src/render/hud/draw.ts:843-980, fed by src/app/hud-model.ts:266-268 and unit-tested in tests/ui/hud-model.test.ts), but the browser spec asserts the sim combat state through the probe, not the drawn gauges (review WR-02, owner question 6)"
  - test: "Re-run the opt-in browser combat spec once at the phase HEAD on the remote machine (optional confirmation)"
    expected: "docker compose run --rm e2e sh -lc \"npm run build:e2e && npx playwright test tests/e2e/combat.spec.ts\" passes at 70005ee"
    why_human: "The spec last ran remotely at 3d5e735 (17-05); the phase's one remote verify at 5a59754 runs only the smoke subset (test:e2e:fast: scene, docking, save-load, probe-shape) and therefore did NOT run combat.spec.ts, contrary to 17-10-SUMMARY's 'covers 17-05's drain and browser re-pin'. The Node twin (tests/app/session/tick-parity.test.ts) with unchanged literals passes at HEAD in this verification, so a divergence is unlikely; the verifier does not run remote suites"
---

# Phase 17: NPC Fire and Hits on the Player Verification Report

**Phase Goal:** NPC ships fire lasers at the player and at each other through Oolite's fire gate when the engine or a test pilot tells them to, hits on the player pass through the shields and the energy bank as Oolite's do, and in ordinary play NPCs still never attack.
**Verified:** 2026-11-19T03:45:00Z
**Status:** human_needed
**Re-verification:** No (initial verification)

## Goal Achievement

The engineering of the phase is real and wired: a single gate site at the fire-queue drain, a faithful port of Oolite's `fireWeapon:` refusal chain (checked line by line against `ShipEntity.m:9934-9975` and `2214-2218`), the four fire sites and hot-weapon branches in the behaviours, the per-tick test pilot, the flight-script opt-in, the attacker hook, and the guards. No truth FAILED on code evidence. Four roadmap-criterion clauses are not confirmable as literally worded because they conflict with owner-locked decisions or with readings recorded for owner sign-off; they are routed to the owner below, not passed silently.

### Observable Truths (roadmap success criteria first, then plan must-haves)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1a | SC1: a scripted pilot or the hook shooter fires only when Oolite's gate allows: not hot (cutout, cooling re-enables), not without energy, not before the whole-tick shot timer, not out of range or off target | ✓ VERIFIED | `src/sim/npc/fire.ts` `npcFireGate`: unresolved, heat (`t/256 >= fround(0.85)`), energy (`<=`), timer (`tick-lastShotTick >= npcRechargeTicks`), one draw, roll, range, `onTarget`, unarmed: identical order to `ShipEntity.m:9934-9958`. Called only in `drainFireQueue` (`src/sim/combat/step.ts:274`). Tests at HEAD: `fire.oracle.test.ts`, `fire.test.ts`, `npc-fire.test.ts` ("the heat cutout ... refuses with no draw until the weapon cools below the cutout, then fires"), `hot-weapon.test.ts` stepped heat-up/cut-out/recovery |
| 1b | SC1: "The rate of fire is Oolite's and is the same at 30, 60 and 144 Hz" | ? UNCERTAIN (human) | Same-at-30/60/144 is VERIFIED (`fire-cadence.test.ts`: identical per-tick hash log and shot ticks through the real accumulator at 30, 60, 144 Hz). "Oolite's" is not: `npcRechargeTicks` gives beam/military 12 ticks (owner-locked D-07) where literal Oolite fires on frame 13 at 120 Hz (17-01 frame-rate row, PROJECT.md "NPC fire gate" row). Owner question 1 |
| 2a | SC2: NPC shots hit the player through the facing shield then the energy bank with Oolite's numbers | ✓ VERIFIED | `applyLedger` routes `PLAYER_ID` records to `routeDamage` (`src/sim/combat/shields.ts:124-163`), which matches `PlayerEntity.m:5647-5680` (`d_forward >= 0` forward, spill to energy, cabin heat), energy floored at 0 (death is Phase 20). `npc-fire.test.ts` "an NPC hit on the player, by the shared rule" (equal-to-shield, spill, abeam, behind) pass |
| 2b | SC2: NPC shots hit other NPC ships by the same octree hull rule | ✓ VERIFIED | Same `firstShipHit` over all live ships for every shot (`step.ts` resolveShotHits); `npc-fire.test.ts` "the same Viper shot at another NPC drains its energy by the same 6"; `npc-vs-npc.scenario.test.ts` |
| 2c | SC2: in a hook-spawned fight the player watches shields and energy fall | ✓ VERIFIED | `combat.spec.ts` reads fwdShield 0.18333 and energy 210.13 at spawn+360 (remote pass at 3d5e735, 17-05); its Node twin `tick-parity.test.ts` passes at HEAD with the same literals; `probe-publisher.test.ts` steps the hook attacker through `stepSim` and sees shields then energy fall |
| 2d | SC2: "an NPC shot to zero energy by another is destroyed through Phase 15's kill path" (in a hook-spawned fight) | ? UNCERTAIN (human) | Substance VERIFIED in Vitest: `npc-vs-npc.scenario.test.ts` (test-pilot route and steering route kills, credit to the live killer, `entityRemoved` same tick, `shipTargetDestroyed`/`shipKilledOther`, debris, D-10 mutual kill) all pass. The "hook-spawned fight" placement is not met: no hook NPC-vs-NPC variant exists, by owner-locked D-03. Reconciliation in 17-ADVISOR-NOTES.md is not owner-signed (owner question 5) |
| 3a | SC3: in ordinary play NPCs never fire; with no hook and no test pilot ships stay inert | ✓ VERIFIED | `populate.ts:354` `ai: null`, `populate.test.ts:536` asserts it; `npcFireBlocked` refuses `ai === null` before the gate (no draw); `ctx.fire` built only when `entity.ai.params.fire === true` (`src/sim/world/step.ts:255-269`); `fire: true` set only in `src/sim/ai/test-spawn.ts:94,163`; pilot builders called outside `src/sim/ai/` nowhere; `fire-decision-source.test.ts` passes; saves restore only the world anchor |
| 3b | SC3: "no new firing decision source ships in the production bundle" | ? UNCERTAIN (human) | `parseTestFlags` enables the hook on `?test=1` in every bundle, so the new `spawnTestAttacker` (flight-script attack with `fire: true`) ships in the production bundle behind the runtime flag (tainting, never saved). Literal reading not met; advisor reading ("not reachable in ordinary play") met. Owner question 4 |
| 3c | SC3: a Key Decisions row records that the decision to fire comes from the engine and test pilots only | ✓ VERIFIED | `.planning/PROJECT.md:301` "The decision to fire comes from the engine and test pilots only (CBT-15, criterion 3)", quoting criterion 3 and marking the advisor reading for revisit |
| 3d | SC3: one opt-in browser spec proves the whole route from a hook-spawned shooter to the shield and energy readout on the HUD | ? UNCERTAIN (human) | `combat.spec.ts` proves hook shooter to the probe's `combat.fwdShield/energy` plus `hud.drawn`. The HUD does draw FWD/AFT bars and E1-E4 banks from that same state (`draw.ts:843-980`, `hud-model.ts:266-268`, unit-tested), but the spec never asserts the drawn gauge values (WR-02, owner question 6). Also: last remote run of this spec is 3d5e735; the 17-10 remote verify's smoke subset does not include it |
| 4a | SC4: Phase 14 behaviour unchanged; fire off unless a pilot opts in; existing flight-script worlds replay byte-identically | ✓ VERIFIED | Opt-in key on the record only when true (`flight-script.ts:98`, `test-pilot.ts:78`); `coolShips` skips temperature 0; `missedShots` terms exact no-ops at 0. At HEAD: `world-cadence.test.ts`, `attack.oracle.test.ts` (every Phase 14 fixture, "without the opt-in the steering never fires"), `fire-route.test.ts` no-opt-in identity, frozen flight-hash pins all pass. Remote 20-seed acceptance 21/21 recorded at 3d5e735, 3a403e0, 30f2a0c (after the last `src/sim/npc`/`src/sim/world` code change c8d4995; 70005ee changed comments only) |
| 4b | SC4: the new source-cited fire-gate fixtures, authored before the port by a separate agent with no access to `src/sim/npc`, all pass | ✓ VERIFIED | git order: fixtures 3470843..d04b525 (00:28-00:58) precede `src/sim/npc/fire.ts` creation 7acda99 (01:20). `fire.oracle.test.ts` and `fire-sites.oracle.test.ts` pass at HEAD with `FIRE_ORACLE_PENDING` empty and `OPEN_DISPUTES` empty; `oracle-independence.test.ts` passes. Note: one fixture (`fire-site-flee-evasive-hand-over-still-requests`) was corrected after the port (89ee9ee) by an Oolite-source re-derivation (the ship moves 0.011 m by `moveForward:` before update 2); the oracle change is opt-in to that fixture only |
| 5 | Prohibitions and D-13 tripwires: three deferral guards (kill credit, `shipHit`, second `onEvent`) and the decision-source tripwire fail on a first consumer and name their todos | ✓ VERIFIED | `tests/guards/{kill-credit-consumers,ship-hit-consumers,on-event-handlers,fire-decision-source}.test.ts` pass with non-vacuity cases; todos `2026-11-18-mutual-kill-credit-symmetry.md`, `2026-11-18-narrow-kill-time-ship-target-lost.md`, `2026-11-17-skip-shiphit-for-a-doomed-target.md` exist; `shipHit` appears in `src/` only in `events.ts`, `ledger.ts` and a doc comment in `step.ts` |

**Score:** 9/13 truths verified (0 present-but-behavior-unverified; 4 uncertain, routed to the owner)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/sim/npc/fire.ts` | gate, blocked, recharge ticks, onTarget, cool/heat, missedShots | ✓ VERIFIED | 312 lines, substantive, imported by `combat/step.ts` and the oracle runner |
| `src/sim/combat/step.ts` | gated `drainFireQueue`, `coolShips`, missedShots update | ✓ VERIFIED | Only producer of NPC `ShotRequest`s; cost/heat/timer written only with a non-null ray |
| `src/sim/ai/pilots/test-pilot.ts` | per-tick ask, one-time nav target | ✓ VERIFIED | `scheduleWake(self, 1)` then `ctl.fire(self)` in hold |
| `src/sim/npc/dispatch.ts` | `SteerContext.fire?` | ✓ VERIFIED | `readonly fire?: () => void` |
| `src/sim/world/world.ts` | `requestFire` bounded de-duplicated push | ✓ VERIFIED | used by `control-impl.ts:128` and `world/step.ts:269` |
| `src/sim/ai/pilots/flight-script.ts` | `fire` option, conditional param | ✓ VERIFIED | |
| behaviours (`evasive`, `attack-evade`, `attack-close`, `attack`) | `ctx.fire?.()` at 4035, 4454, 4575, 4711; live temperature reads | ✓ VERIFIED | four call sites; hot tails read `entity.weapon.temperature` vs float32 USABLE |
| `src/sim/npc/constants.ts` | `NPC_WEAPON_TEMP_USABLE = NPC_WEAPON_CUTOUT_F32 * NPC_MAX_WEAPON_TEMP` | ✓ VERIFIED | lines 379-393 |
| `src/sim/ai/test-spawn.ts` | `spawnTestAttacker`, `TEST_ATTACKER_DISTANCE` | ✓ VERIFIED | |
| `src/app/session/probe-publisher.ts`, `src/app/probe.ts` | tainting hook member | ✓ VERIFIED | `markHookMutation()` before `spawnTestAttacker(...)` |
| oracle trees `tests/oracles/npc/fire/**`, `fire-sites/**` | independent fixtures + derivation | ✓ VERIFIED | self-tests pass |
| four guards in `tests/guards/` | tripwires | ✓ VERIFIED | |
| `tests/e2e/combat.spec.ts` | opt-in browser spec re-pinned to the twin | ⚠️ see 3d | present, pins equal twin literals; last remote run 3d5e735 |

### Key Link Verification

| From | To | Via | Status |
|------|----|-----|--------|
| `combat/step.ts` | `npc/fire.ts` | `npcFireBlocked`, `npcFireGate`, `npcOnTarget`, `heatWeapon`, `coolWeapon`, `adjustMissedShots` | ✓ WIRED |
| `test-pilot.ts` | `control-impl.ts` → `world.ts` | `ctl.fire(self)` → `requestFire` → `world.fireQueue` → drain | ✓ WIRED |
| `world/step.ts` steerEntity | `world.ts` | `ctx.fire = () => requestFire(world, entity.id)` only when `params.fire === true` | ✓ WIRED |
| behaviours | `dispatch.ts` | `ctx.fire?.()` | ✓ WIRED |
| `probe-publisher.ts` | `test-spawn.ts` | `markHookMutation()` then `spawnTestAttacker` | ✓ WIRED |
| `test-spawn.ts` | `flight-script.ts` | `createFlightScriptAi(tick, { script: "attack", targetId: PLAYER_ID, fire: true })` | ✓ WIRED |
| ledger player branch | `shields.ts` `routeDamage` | facing shield then energy | ✓ WIRED |
| `hud-model.ts` | HUD draw | `shieldFwd/shieldAft/energyBanks` from `combat` | ✓ WIRED (not asserted in the browser spec) |

### Data-Flow Trace (Level 4)

| Artifact | Data | Source | Real data | Status |
|----------|------|--------|-----------|--------|
| HUD shield/energy bars | `combat.fwdShield`, `aftShield`, `energy` | `PlayerCombatState`, mutated by `routeDamage` from NPC `HitRecord`s produced by the gated drain | yes | ✓ FLOWING |
| NPC heat | `entity.weapon.temperature` | `heatWeapon` on fired shot, `coolShips` per tick, read by behaviours and gate | yes | ✓ FLOWING |
| aim feedback | `entity.weapon.missedShots` | `adjustMissedShots` at resolution, read by `currentAimTolerance` and `trackPrimaryTarget` | yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Phase 17 targeted Vitest set (gate, oracles, sites, hot weapon, routes, cadence, NPC-vs-NPC, kill properties, guards, hook, twin, populate, Phase 14 oracle/cadence/steering properties) | `docker compose run --rm test npx vitest run <39 files>` | 39 files, 1467 tests passed, exit 0 | ✓ PASS |
| Full unit suite | `docker compose run --rm test npm run test:fast` | 235 files, 6441 passed, 10 skipped, exit 0 | ✓ PASS |

### Probe Execution

Not applicable: the phase declares no `scripts/*/tests/probe-*.sh`. Remote browser and acceptance runs are executor-recorded with snapshots (17-05: combat.spec 3d5e735 exit 0; acceptance 21/21 at 3d5e735, 3a403e0, 30f2a0c; 17-10: verify 5a59754 exit 0) and were not re-run by the verifier, per instructions.

### Requirements Coverage

| Requirement | Source Plans | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CBT-15 | 17-01..17-10 | NPC fire at player and each other through Oolite's gate (temperature, energy, shot timer, range roll, `onTarget`); decision from engine and test pilots only; recorded in Key Decisions | ✓ SATISFIED (owner questions open on SC1 rate, SC3 bundle clause) | truths 1a, 2b, 2d, 3a, 3c, 4a, 4b |
| CBT-16 | 17-05, 17-09, 17-10 | NPC hits on the player pass through shields and the energy bank by Oolite's rules | ✓ SATISFIED | truth 2a, 2c |

No orphaned requirements: REQUIREMENTS.md maps only CBT-15 and CBT-16 to Phase 17, and both are claimed. REQUIREMENTS.md still shows both as `[ ]` / Pending; the orchestrator owns that update.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| (19 modified `src` files) | - | TBD/FIXME/XXX/TODO/HACK/placeholder | none found | - |
| `src/sim/npc/behaviours/attack.ts` | 90-106 | `targetTargetsSelf` ignores the player's ident lock; heating back-off (4122) now reachable for opted-in attackers | ⚠️ Warning | No effect in ordinary play; deferred (WR-01, todo `2026-11-19-player-ident-lock-in-target-targets-self.md`) |
| `src/sim/combat/step.ts` | 283, 298 | NPC energy compare and cost in float64 vs Oolite GLfloat | ℹ️ Info | Unrecorded one-ulp divergence (IN-03, accepted) |
| `src/sim/npc/fire.ts` | 132-144 | gate total only over typed `MountKey` | ℹ️ Info | drain guards with `isMountKey` (IN-02, accepted) |
| `.planning/phases/.../17-10-SUMMARY.md` | 142, 177 | claims the remote verify covers the browser re-pin; claims "the HUD has no shield or energy element" | ℹ️ Info | `verify` runs only `test:e2e:fast` (no combat.spec); the HUD does draw FWD/AFT and E1-E4 gauges, they are just not `HudElementId`s or probe fields |

### Prohibitions (judgment tier, non-authoritative LLM verdicts, flagged for human review)

| Plan | Statement (abridged) | LLM verdict | Flag |
|------|----------------------|-------------|------|
| 17-03 | No firing decision source reaches ordinary play | holds: `ai: null` populated ships, `npcFireBlocked`, opt-in only from `test-spawn.ts` | unverified-prohibition, human review recommended |
| 17-03 | No player hit feedback or `shipHit` consumer | holds: guard passes, no subscriber in `src` | unverified-prohibition, human review recommended |
| 17-05 | No test-only gate bypass or pinned accuracy | holds: drain has one path; `test-spawn.ts` sets no accuracy | unverified-prohibition, human review recommended |
| 17-05 | Player not killed, no hit feedback | holds: `routeDamage` floors energy at 0 | unverified-prohibition, human review recommended |
| 17-06 | No populated AI, reflex or retaliation | holds | unverified-prohibition, human review recommended |
| 17-10 | Hook attacker/shooter never durable, never without `?test=1` | holds: taint before mutation, hook-only | unverified-prohibition, human review recommended |
| 17-10 | Acceptance run not added to `verify-full`, no threshold or detector change | holds: no change to `tests/acceptance/`, `compose.yaml`, `package.json` since 63a8eaf | unverified-prohibition, human review recommended |

### Human Verification Required

1. **D-07 period vs criterion 1 "the rate of fire is Oolite's"**: keep 12-tick beam/military (8 % faster than literal Oolite and the player) or switch `npcRechargeTicks` to 13/301/13 with one re-pin.
2. **Criterion 2 vs D-03**: accept NPC-vs-NPC kill proof in Vitest only (tighten the roadmap wording), or request a hook NPC-vs-NPC variant.
3. **Criterion 3 bundle clause**: accept that the `?test=1` seam (now including `spawnTestAttacker`) ships in the deployed bundle behind a runtime flag, or require build-time stripping.
4. **Criterion 3 HUD readout**: accept the probe readout, or ask for the drawn gauge values to be exposed and asserted (the gauges exist and are drawn).
5. **Optional**: re-run `tests/e2e/combat.spec.ts` once on the remote machine at the phase HEAD, since the phase's remote `verify` did not include it.

### Gaps Summary

No code gap was found: every artifact exists, is substantive, is wired, and its data flows; the gate is a faithful port of Oolite's refusal chain, the targeted Docker Vitest run of 39 files (1,467 tests) and the full Docker suite (235 files, 6,441 passed, 10 skipped) passed at HEAD 70005ee. The phase does not reach `passed` because four roadmap-criterion clauses cannot be confirmed as literally worded: the rate-of-fire clause (D-07), the hook-spawned NPC kill (D-03), the production-bundle clause and the HUD readout clause. Each conflicts with an owner-locked decision or an advisor reading recorded for sign-off, so the owner must rule. Two corrections to the SUMMARY narrative: the remote `verify` at 5a59754 did not run `combat.spec.ts` (its smoke subset excludes it; the spec's last remote run is 3d5e735, and the twin with the same literals passes at HEAD), and the HUD does draw shield and energy gauges, which makes the WR-02 fix (expose and assert the drawn values) straightforward.

---

_Verified: 2026-11-19T03:45:00Z_
_Verifier: Claude (gsd-verifier)_

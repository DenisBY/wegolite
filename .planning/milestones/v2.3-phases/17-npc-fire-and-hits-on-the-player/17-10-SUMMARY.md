---
phase: 17-npc-fire-and-hits-on-the-player
plan: 10
subsystem: testing
tags: [test-hook, attacker, decision-source, validation, sign-off, remote-verify]

requires:
  - phase: 17-npc-fire-and-hits-on-the-player
    provides: the gated fire drain and the test pilot (17-05), the steering fire route (17-06), the live weapon temperature (17-07), the NPC-vs-NPC proofs (17-09), the decision-source guard (17-03)
provides:
  - spawnTestAttacker and TEST_ATTACKER_DISTANCE in the sim seam, and the tainting WegoliteSimTestHook.spawnTestAttacker(): boolean
  - the probe shape fixture and compare test listing the new hook member
  - the Key Decisions row "The decision to fire comes from the engine and test pilots only (CBT-15, criterion 3)"
  - the rewritten and signed-off 17-VALIDATION.md (nyquist_compliant true)
  - the phase's one full remote verify, green at a HEAD holding every Phase 17 change
affects: [phase-17 verification, owner sign-off]

plan_head_before: e7e9db80a390b47a493583498186f3c1effafd04
plan_head_after: 5a59754556df9d78858325c3fb24c65a7d7eb230

actuals:
  tokens: 14700
  tasks: 2
  commits: 2

tech-stack:
  added: []
  patterns:
    - "a third test seam beside spawnTestShooter and spawnTestFlyers: world-side spawner in src/sim/ai/test-spawn.ts, taint-first hook member in probe-publisher.ts, boolean-only return"
    - "a stepped hook proof through stepSim with the real hull table, NPC weapons and flight table: shots at least one beam period apart, shield falls"

key-files:
  created: []
  modified:
    - src/sim/ai/test-spawn.ts
    - src/app/session/probe-publisher.ts
    - src/app/probe.ts
    - tests/fixtures/probe-shape.json
    - tests/app/probe-shape-compare.test.ts
    - tests/app/session/probe-publisher.test.ts
    - tests/sim/ai/test-spawn.test.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
    - .planning/phases/17-npc-fire-and-hits-on-the-player/17-VALIDATION.md

key-decisions:
  - "The attacker is the stock Viper 3,000 m ahead of the player with a flight-script attack AI (params exactly script attack, phase start, targetId the player, range 0, speed 0, frustrated 0, fire true); the hook takes no argument and returns a boolean"
  - "The CHANGELOG entry went into the Task 1 commit (the hook change), not Task 2's, because AGENTS.md puts a user-visible change and its entry in one commit; Unreleased had no Added group, so one was added first"
  - "The decision-source row quotes criterion 3 literally and states the advisor's reading of 'no new firing decision source ships in the production bundle' as not owner-settled"

requirements-completed: [CBT-15, CBT-16]

status: complete
duration: 20 min
completed: 2026-11-19
commits: 2

coverage:
  - id: D1
    description: "spawnTestAttacker puts one Viper TEST_ATTACKER_DISTANCE ahead of the player facing it, with exactly the attack AI params and fire: true; refuses a bad scan class or a refused spawn; stepped through stepSim it enters an ATTACK behaviour, its laserFired ticks are at least 12 apart and the player's shields and then energy fall"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/sim/ai/test-spawn.test.ts#spawnTestAttacker"
        status: pass
    human_judgment: false
  - id: D2
    description: "The hook member taints before touching the world, spawns one attacking Viper in flight with a world and traffic content, returns a boolean only and refuses (taint included) when docked, launching, disposed, without a world, state, traffic content or a Viper record; the hook-spawned attacker fires through the gate and the player's shield falls"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/app/session/probe-publisher.test.ts#the spawnTestAttacker hook (plan 17-10, D-02, T-17-24)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Both probe-shape hook entries list spawnTestAttacker as a function, and the remote verify's probe-shape e2e passes"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/app/probe-shape-compare.test.ts"
        status: pass
      - kind: command
        ref: "wegolite-remote-run.sh run --rm verify (snapshot 5a59754, exit=0, elapsed=190s)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Criterion 3 is recorded: the Key Decisions row states the decision to fire comes from the engine and test pilots only, with the guard as a tripwire; in ordinary play populated ships keep ai null (populate.test.ts) and the decision-source guard passes"
    requirement: CBT-15
    verification:
      - kind: unit
        ref: "tests/guards/fire-decision-source.test.ts and tests/sim/world/populate.test.ts"
        status: pass
    human_judgment: true
    rationale: "Whether 'no new firing decision source ships in the production bundle' may be read as 'not reachable in ordinary play' is the advisor's reading, not owner-settled (owner question 4)"
  - id: D5
    description: "17-VALIDATION.md's per-requirement map is rewritten with test files that exist, the per-plan map filled, Wave 0 and the sign-off list ticked, nyquist_compliant true"
    requirement: CBT-15
    verification:
      - kind: command
        ref: "rg -o 'tests/...test.ts' 17-VALIDATION.md | every path test -f"
        status: pass
    human_judgment: false
---

# Phase 17 Plan 10: Attacker hook, decision row and sign-off Summary

**`spawnTestAttacker()` puts a Viper 3,000 m ahead under `?test=1` that attacks with Phase 14's manoeuvres and fires through the NPC fire gate (tainting, boolean only), criterion 3's decision row and the validation sign-off are recorded, and the phase's one remote `verify` is green at `5a59754`.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-11-19T02:54Z (approx.)
- **Completed:** 2026-11-19T03:14Z
- **Tasks:** 2
- **Files:** 10 modified, none created

## Accomplishments

### Task 1: the hook-spawned attacker (tracer, D-02)

- `src/sim/ai/test-spawn.ts`: `TEST_ATTACKER_DISTANCE = 3_000` and `spawnTestAttacker(world, player, record, tick)`. It refuses a scan class outside the closed vocabulary, otherwise spawns one ship of the record along the player's nose, turned half a turn so its nose points back at the player, speed 0, with `createFlightScriptAi(tick, { script: "attack", targetId: PLAYER_ID, fire: true })`.
- `src/app/session/probe-publisher.ts`: `spawnAttacker()` mirrors `spawnShooter`'s checks (in flight, not disposed, world, the Viper record), then `markHookMutation()`, then the sim call; added to `simHook` as `spawnTestAttacker`.
- `src/app/probe.ts`: `WegoliteSimTestHook.spawnTestAttacker(): boolean` (manual checks and UAT, no browser spec, boolean only, taints) and the `createTestHook` member (taint after a successful sim call).
- `tests/fixtures/probe-shape.json` lists the member in both hook entries (alphabetical, 2 matches); `probe-shape-compare.test.ts` pins it as a function beside the shooter and flyers members.
- Tests: seven `spawnTestAttacker` cases in `test-spawn.test.ts` (placement and facing at any orientation, exact AI params, two refusals, the stepped fight, snapshot) and seven hook cases in `probe-publisher.test.ts` (spawn and taint, taint before the world is touched, redraw gate, six refusals with no taint, state gone, no entity id, and a stepped run through `stepSim` with the real hulls, NPC weapons and flight table).
- The stepped checks: within 3,600 ticks the attacker enters an `ATTACK_*` behaviour, fires more than once, no two `laserFired` ticks are less than the 12-tick beam period apart, and the player's shields and then energy fall.
- `CHANGELOG.md`: a new `### Added` group first under `## [Unreleased]` with the `spawnTestAttacker` entry (the group order is Added, Changed, Fixed; no group repeats).

### Task 2: the decision row, the validation sign-off and the remote verify

- `.planning/PROJECT.md`: the Key Decisions row "The decision to fire comes from the engine and test pilots only (CBT-15, criterion 3)", placed after the D-10 row. It quotes criterion 3 literally, states the reading of "no new firing decision source ships in the production bundle" (not reachable in ordinary play; the seam ships behind the runtime `?test=1` flag and taints; the advisor's reading, not owner-settled), the populated ships' `ai: null`, no reflex AI, `fire: true` set only by `spawnTestShooter` and `spawnTestAttacker`, saves restoring only the world anchor, the drain and gate refusing an AI-less ship, and the guard as a tripwire (narrowed by disposition 3) with `populate.test.ts` as the runtime proof; settled without the owner (advisor), 2026-11-18, revisit.
- `17-VALIDATION.md` rewritten, not ticked: each requirement row names the test files that exist (`fire.oracle.test.ts`, `fire.test.ts`, `fire.property.test.ts` for the gate; `fire-sites.oracle.test.ts` and `hot-weapon.test.ts` for the sites and hot branches; `npc-fire.test.ts`; `npc-vs-npc.scenario.test.ts` and `kill.property.test.ts`; `fire-cadence.test.ts` and `world-cadence.test.ts`; the four guards; `combat.spec.ts` with plan 17-05's remote run), a per-plan map, Wave 0 and the sign-off list ticked, `nyquist_compliant: true`, `wave_0_complete: true`, `status: validated`. Every `tests/...` path in the file passes `test -f`.

## Verification

| Check | Result |
|-------|--------|
| Targeted: `test-spawn.test.ts`, `probe-publisher.test.ts`, `probe-shape-compare.test.ts`, `fire-decision-source.test.ts`, `entity-id-scope.test.ts` | 5 files, 109 tests passed |
| `docker compose run --rm test` (full, with coverage) | exit 0 |
| `docker compose run --rm lint` | eslint and prettier clean |
| `docker compose run --rm typecheck` | clean |
| Remote `verify` (the phase's only full `verify`, covers 17-05's drain and browser re-pin) | snapshot `5a59754`, `exit=0`, `elapsed=190s`: assets:check no differences, 235 test files passed, build, `check:dist` (123 files, no harness marker), e2e smoke subset 27 passed including all four `probe-shape.spec.ts` cases; no known flake appeared |
| QUAL-11 acceptance | not run: no `src/sim/npc/**` or `src/sim/world/**` change (the only `src` changes are `src/sim/ai/test-spawn.ts`, `src/app/probe.ts` and `src/app/session/probe-publisher.ts`); acceptance stays out of `verify-full` |

Acceptance criteria: `rg -c "export function spawnTestAttacker"` is 1; `rg -c spawnTestAttacker tests/fixtures/probe-shape.json` is 2; `probe.ts` 3 and `probe-publisher.ts` 4 matches; the Key Decisions row title count is 1 and the criterion 3 quote count is 1; the CHANGELOG entry is under `### Added`; `nyquist_compliant: true` count is 1.

## Commits

| Commit | Subject |
|--------|---------|
| `9234379` | `feat(17-10): the ?test=1 hook spawns an attacking Viper that fires through the gate (D-02)` |
| `5a59754` | `docs(17-10): the decision-source Key Decisions row and the signed-off validation map` |

## Deviations from Plan

**1. [Process] The CHANGELOG entry is in Task 1's commit, not Task 2's.** Found during: Task 1. The plan lists `CHANGELOG.md` under Task 2, but AGENTS.md requires a user-visible change and its entry in the same commit, and the plan's own ledger says this plan logs the attacker hook. `### Added` did not exist under `## [Unreleased]`, so it was created first (Keep a Changelog order). Files: `CHANGELOG.md`. Commit: `9234379`.

**Total deviations:** 0 auto-fixes; 1 process note. **Impact:** none; every plan acceptance criterion holds.

## Known Stubs

None.

## Threat Flags

None. The new member is on the `?test=1` hook only (T-17-22), checks every precondition before the taint and the spawn (T-17-23), taints before the world is touched and asserts it in a test (T-17-24), and returns a boolean only with `entity-id-scope.test.ts` passing (T-17-25).

## Owner questions at sign-off

These are non-blocking: the plan and the phase complete without the answers, and each answer that changes a decision becomes a todo or a follow-up plan.

1. **The D-07 shot period (orchestrator disposition 1, review Fable M1).** Under D-07 the NPC periods are pulse 60, beam 12, mining 300 and military 12 ticks. Literal Oolite's NPC compare (`shot_time < weapon_recharge_rate` refuses, `ShipEntity.m:9946`) fires on the frame counts plan 17-01's shot-timer row derives at 120 Hz: pulse 60, beam 13, mining 301, military 13 (the reviewers' figures agree: 60, 13, 301, 13). The player port gives 61, 13, 301 and 13. So NPC beam and military fire about 8 % faster than literal Oolite and than the player (10.0 against 9.23 shots a second), and D-07's "both correct to their sources" holds only for pulse. Keep D-07, or switch to the alternative: `npcRechargeTicks` in `src/sim/npc/fire.ts` returns the literal frame counts (one line) and the Node twin and the browser spec are re-pinned once (kill offset, bank, hash and shield literals; the plan 17-09 scenario tick 25 kill would move to 27)?
2. **Acceptance run in `verify-full`.** Should the 20-seed acceptance run join `verify-full` now that NPC behaviour changes when a pilot opts in? Advisor decision 4 kept it out; nothing was changed, and no threshold or detector was touched.
3. **The other advisor-settled decisions to revisit** (`17-ADVISOR-NOTES.md`): the drain site as the one gate site (decision 2), and the fourth guard kept as a tripwire and narrowed by disposition 3 (decision 3). Also listed for revisit: the decision-source row itself, settled without the owner on 2026-11-18.
4. **Criterion 3 and the production bundle.** Criterion 3 reads "no new firing decision source ships in the production bundle". This phase reads it as "not reachable in ordinary play": `spawnTestShooter`, `spawnTestAttacker` and the pilots' `fire` param ship in the production bundle behind the runtime `?test=1` flag and taint the session (advisor decision 3). Is that acceptable, or should the seam be stripped from the production bundle at build time?
5. **Criterion 2 against D-03.** Criterion 2 places the NPC-versus-NPC kill "in a hook-spawned fight", while D-03 proves NPC-versus-NPC fire and the kill in Vitest scenarios only (`npc-vs-npc.scenario.test.ts`, plan 17-09), with no hook variant and no browser spec. The phase reads criterion 2 with D-03 as recorded in `17-ADVISOR-NOTES.md`, Reconciliation (orchestrator disposition 2): the hook-spawned fight (plan 17-05's browser spec) proves the player's shields and energy falling, and the Vitest scenarios prove the NPC kill. Tighten the roadmap wording to match, or give the attacker hook an NPC-versus-NPC variant?
6. **The HUD readout of criterion 3 (17-05 deviation 2, orchestrator note).** The HUD has no shield or energy element (`HUD_ELEMENTS` has 11 ids and `tests/e2e/hud.spec.ts` pins that shield and energy are absent), so plan 17-05's browser spec proves the route through the probe's `combat.fwdShield`, `combat.aftShield` and `combat.energy` plus `hud.drawn`. Criterion 3 says "from a hook-spawned shooter to the shield and energy readout on the HUD". Does the owner accept the probe readout, or want a HUD shield and energy element in a later phase?
7. **Informational, 17-08 oracle dispute.** One dispute was raised (the `fire-site-flee-evasive-hand-over-still-requests` fixture) and resolved by an independent re-derivation from the Oolite source; the fixture was corrected in `89ee9ee` (commit message in the 17-08 SUMMARY) and all 24 fire-site fixtures pass. No decision is needed.
8. **Informational, 17-05.** D-08's single code commit (`ad1c78d`) was followed by one fix-up commit (`3d5e735`, the browser spec's plate wait). No decision is needed.
9. **Informational, carried from 17-09.** Seed 22 is the ready example if the owner wants the case where only the higher-id ship fires first pinned in the mutual-kill scenarios; any later change to the number of gate draws per request re-pins the debris and hash literals of the twin and browser spec.

## Next Phase Readiness

Phase 17 has all ten plans executed. The orchestrator owns ROADMAP.md and STATE.md progress. A UAT session can spawn the attacker with `?test=1&traffic=1` and call `window.__wegolite.test.spawnTestAttacker()` from flight; the session is tainted and nothing saves.

## Self-Check: PASSED

- Files found: `src/sim/ai/test-spawn.ts`, `src/app/probe.ts`, `src/app/session/probe-publisher.ts`, `tests/fixtures/probe-shape.json`, `tests/app/probe-shape-compare.test.ts`, `tests/app/session/probe-publisher.test.ts`, `tests/sim/ai/test-spawn.test.ts`, `CHANGELOG.md`, `.planning/PROJECT.md`, `.planning/phases/17-npc-fire-and-hits-on-the-player/17-VALIDATION.md`.
- Commits `9234379` and `5a59754` are ancestors of HEAD; `commits: 2` measured with `git rev-list --count` from `plan_head_before` `e7e9db8`.
- The plan's automated verify commands all passed, including the remote `verify` (snapshot `5a59754`, `exit=0`, `elapsed=190s`).

---
phase: 19-equipment-damage-and-repair
plan: 04
subsystem: sim
tags: [combat, internal-damage, ledger, cargo, determinism]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-02 rollInternalDamage, internalDamageWork, internalDamageSeed and the damage events"
provides:
  - "CombatOptions.internalDamage and applyLedger's trailing internalDamage argument: the player's hit rolls Oolite's internal damage on the per-tick stream"
  - "holdPods / HoldPod: Oolite's in-flight cargo pod list derived from the hold"
  - "the 30/60/144 Hz determinism proof of the roll"
affects: [19-10, 19-11, 19-13, 19-14]
actuals:
  tokens: 30000
  tasks: 3
  commits: 4
plan_head_before: ca47e55d8878710755f4f0fdb9b12aa722c2f3a5
plan_head_after: 5ca19661ac109e1124d878011942f4036fc4f0fc
tech-stack:
  added: []
  patterns:
    - "one-stream oracle in the ledger tests: one RngState created outside the closure, rollInternalDamage called per record on one work copy"
    - "tick-keyed cadence log driven through the flight-cadence accumulator"
key-files:
  created:
    - tests/sim/combat/internal-damage-cadence.test.ts
  modified:
    - src/sim/combat/ledger.ts
    - src/sim/combat/step.ts
    - src/sim/combat/shields.ts
    - src/sim/economy/cargo.ts
    - tests/sim/combat/ledger.test.ts
    - tests/sim/economy/cargo.test.ts
key-decisions:
  - "No new decision: D-01 and D-04 as planned; facts arrive read-only through CombatOptions"
requirements-completed: [CBT-08]
status: complete
---

# Phase 19 Plan 04: Ledger wiring and pod list Summary

A hit that reaches the player's energy bank now rolls Oolite's internal damage in the one damage ledger when the app supplies the facts, `holdPods` gives the roll Oolite's pod list, and the same fight damages the same item on the same tick at 30, 60 and 144 Hz. With no facts supplied (every caller today) nothing changes.

## What was built

- `src/sim/combat/step.ts`: `CombatOptions.internalDamage?: InternalDamageFacts`, passed by `resolveShots` as `applyLedger`'s trailing argument; the "Event order" doc says each player record's `equipmentDamaged*` / `cargoDestroyed*` follow its own `shipHit`.
- `src/sim/combat/ledger.ts`: in the player branch, after the `shipHit` push, with facts and a world and (`record.kind === "scrape"` or `combat.energy > 0`), `rollInternalDamage(result.applied, work, () => rngNext(rng), events)`. The work copy (`internalDamageWork`) and the stream (`createRngState(internalDamageSeed(world.worldSeed, player.tick))`) are created lazily once per call and shared by that call's later player records (Pitfall 6). The module doc cites `PlayerEntity.m:5683-5697` and `5746-5752` and names the Phase 20 gap (a scrape that empties the bank rolls, a laser hit that empties it does not; Phase 20 keeps both gates). The "energy floors at 0 until the player's death in Phase 20" marker sentence is untouched.
- `src/sim/combat/shields.ts`: the stale "is Phase 19's and is not ported" doc sentence now points at the ledger's roll; the file keeps its 271 lines, so FIDELITY's `:205` citation still names the same lines.
- `src/sim/economy/cargo.ts`: `HoldPod` and `holdPods(cargo, commodities)` (commodities by ascending `sortOrder`, ties by key; tonnes as 1 t pods; kg/g keep the 499 / 499,999 safe, the rest in full 1000 kg / 1,000,000 g pods then a dregs pod, no empty pod; unknown keys as tonnes after the known ones; invalid quantities make no pod). No new economy file (the economy-purity guard still pins four).
- Tests: seven ledger cases, nine `holdPods` cases (two fast-check properties of 300 runs each), and the cadence test.

## Measured values

- The ledger test's first damaging tick for the 96-point laser case (four F3 keys at probability 1, capacity 20, no pods, world seed from `createWorld(1)`): **tick 6**, found by the bounded loop over ticks 0..199 with the exported functions; the ledger at that tick emits `shipHit` then `equipmentDamaged`.
- Cadence route: the shooter route, not the explicit `ShotRequest` fallback. A `spawnTestShooter` Viper (world seed 7) fires at a parked player through the whole `stepSim`; 1200 fixed steps per cadence, driven by the `flight-cadence.test.ts` accumulator (clamped frame delta, whole 1/120 s steps, five-step catch-up cap) at frame dt 1/30, 1/60 and 1/144. The run length used is the planned 1200 and was enough: the log is `[[575, equipmentDamaged, k_pod], [666, equipmentDamaged, k_ecm]]`, identical at all three cadences (the facts are updated between steps as the app will).
- The shared-work-copy case also measures its own sensitivity: over 4000 ticks with one damageable item, a fresh work copy per record would damage it twice on at least one tick (asserted), while the ledger never does.
- The existing combat twin literals did not move: `tests/app/session/tick-parity.test.ts` passes with no edit (`git diff --stat` on it is empty), and no twin hash was re-pinned.

## Gates

- Targeted (Task 1): `tests/sim/combat/ledger.test.ts`, `step.test.ts`, `tests/guards/collision-player-death.test.ts`, `tests/guards/ship-hit-consumers.test.ts`, `tests/app/session/tick-parity.test.ts`: 5 files, 136 tests, green. Task 2: `tests/sim/economy` and `tests/guards/economy-purity.test.ts`: 6 files, 91 tests, green. Task 3: the cadence test green.
- `docker compose run --rm typecheck`: green after each task.
- `docker compose run --rm lint`: green (one finding on the way: a bare `.sort()` in `holdPods`, fixed with a comparator in commit 5ca1966).
- `docker compose run --rm test` (full suite, coverage on, run after the last code commit 5ca1966 while other executors ran containers on the same machine): 269 of 274 files and 7,164 of 7,179 tests passed (10 skipped), and the 5 failing tests were all `Test timed out` (5000 ms, 30000 ms for `tools-determinism`) in files this plan does not touch: `tests/guards/tools-determinism.test.ts`, `tests/app/session/world-lifecycle.test.ts`, `tests/sim/combat/kill.property.test.ts`, `tests/sim/npc/attack-dispatch.test.ts` and `tools/oolite-ingest/convert/textures.test.ts` (a known flake). Those five files rerun alone with `--testTimeout=120000`: 5 files and 160 tests passed. The run printed no coverage-threshold error line. A clean full run on an idle machine is the orchestrator's to confirm after the merge.
- No remote run (pure `src/sim`, no app caller), per the plan. The 20-seed NPC acceptance run is not triggered (no file under `src/sim/npc/**`, `src/sim/world/**` or `ships-npc.json` changed).

## Deviations from Plan

None - plan executed exactly as written. TDD note: the tracer and the other tasks were committed as test plus implementation together, not as separate RED and GREEN commits; the tests were written against the C lines and the oracle before the first run and passed without a widened expectation.

CHANGELOG: no entry, because nothing is user-visible until the app supplies the facts (plan 19-11).

## Known Stubs

None. `CombatOptions.internalDamage` is deliberately unset by every caller until plan 19-11.

## Threat Flags

None. T-19-06 is mitigated by one `internalDamageWork` copy per ledger call, with the input facts never written and the two-record case proving no double damage; T-19-07 by the payloads (a key, a commodity and an amount; `entity-id-scope` guard unchanged).

## Self-Check: PASSED

- Files present: `tests/sim/combat/internal-damage-cadence.test.ts`, `src/sim/combat/ledger.ts`, `src/sim/combat/step.ts`, `src/sim/combat/shields.ts` (271 lines before and after), `src/sim/economy/cargo.ts`, `tests/sim/combat/ledger.test.ts`, `tests/sim/economy/cargo.test.ts`.
- Commits present in history: `a618533` (Task 1), `c1a400e` (Task 2), `c2faa6b` (Task 3), `5ca1966` (lint fix).
- Acceptance greps: `rollInternalDamage(` once in `ledger.ts`; `readonly internalDamage?: InternalDamageFacts` once in `step.ts`; "is Phase 19's and is not" absent from `shields.ts`; `8224` present in the ledger test; `export function holdPods(` once; `1 / 144` present in the cadence test; `tests/guards/collision-player-death.test.ts` and `tests/guards/economy-purity.test.ts` green with no edit; `tick-parity.test.ts` unedited; no Cyrillic in any file of the plan; STATE.md and ROADMAP.md untouched.

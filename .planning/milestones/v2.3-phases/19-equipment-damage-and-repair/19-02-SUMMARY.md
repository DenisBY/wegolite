---
phase: 19-equipment-damage-and-repair
plan: 02
subsystem: sim
tags: [combat, internal-damage, rng, events, tripwire, fidelity]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-01 compiled Equipment.damageProbability (the roll's item odds)"
provides:
  - "rollInternalDamage / resolveInternalDamage: the pure, total port of Oolite's player internal-damage gate loop and takeInternalDamage"
  - "RngPurpose damage (code 5) and internalDamageSeed(worldSeed, tick), a stateless per-tick stream"
  - "SimEvent kinds equipmentDamaged { key } and cargoDestroyed { commodity, amount }"
  - "SHIP_TRADE_IN_FACTOR = 95, PLAYER_INTERNAL_DAMAGE_FACTOR, PLAYER_MASS_DAMAGE_TERM, MAX_INTERNAL_DAMAGE_ROLLS = 256"
  - "three Key Decisions rows (stream, factor 95, loop cap), the hull-wear todo and its tripwire"
affects: [19-03, 19-04, 19-10, 19-11, 19-13, 19-14]
actuals:
  tokens: 15000
  tasks: 3
  commits: 3
plan_head_before: 65f40d17f30637d5759fbb29b45165a8afe7d670
plan_head_after: e9458e2d8d063fd9575582b011dd35933a41765f
tech-stack:
  added: []
  patterns:
    - "scripted draw source that throws when empty and a consumed-count assertion, so every hand case also proves the draw order"
    - "source-text tripwire with synthetic failing inputs naming a todo (hull wear)"
key-files:
  created:
    - src/sim/combat/internal-damage.ts
    - tests/sim/combat/internal-damage.test.ts
    - tests/sim/combat/internal-damage.property.test.ts
    - tests/guards/hull-wear-tripwire.test.ts
    - .planning/todos/pending/2026-11-21-hull-wear-renovation-and-fuel-price.md
  modified:
    - src/sim/rng.ts
    - src/sim/events.ts
    - tests/sim/rng.test.ts
    - .planning/PROJECT.md
key-decisions:
  - "Roll the player's internal damage on a stateless per-tick stream (Phase 19, D-01)"
  - "Keep Oolite's new-ship trade-in factor 95 as a constant and do not port hull wear (Phase 19, D-05)"
  - "Cap the player's internal-damage loop at 256 iterations (Phase 19, D-01)"
requirements-completed: [CBT-08]
status: complete
---

# Phase 19 Plan 02: Internal-damage roll Summary

Oolite's player internal-damage rule is now a pure, total simulation module on its own seeded stream: a gate loop over the amount that reached the energy bank, one `takeInternalDamage` die roll that destroys a cargo pod or damages an installed item, and two events, with nothing calling it yet.

## What was built

- `src/sim/combat/internal-damage.ts` ports `PlayerEntity.m:5690-5697` (gate loop, `PLAYER_INTERNAL_DAMAGE_FACTOR 31`) and `:6097-6185` (`takeInternalDamage`): the die `floor(u * n)` over `n = floor((capacityPods + 21) * 95 / 100)` (38 for the 20 t hold, 53 with the cargo bay; the die is skipped when n is 0), the cargo branch first, then the equipment branch on the reversed die (`reversed >= 0 && reversed < damageable count`, the `>= 0` written out so Oolite's unsigned wrap is matched), then the strict `accumulator > target` pick in profile order. The cosmetic branch is not ported (D-05). `draw: () => number` is injected; the module never creates a stream.
- `src/sim/rng.ts`: purpose `damage` with code 5, not an entity purpose, so no stored stream, hash or golden moves. `internalDamageSeed(worldSeed, tick) = mix32(forkSeed(worldSeed, PLAYER_ID, "damage"), tick >>> 0)`.
- `src/sim/events.ts`: non-reserved kinds `equipmentDamaged { key }` and `cargoDestroyed { commodity, amount }` (no ids, no UI text); `RESERVED_EVENT_KINDS` stays at 15.
- Three Key Decisions rows in `.planning/PROJECT.md` (stream, factor 95, 256-iteration cap), each ending `Reviewers: Fable, Kimi K3.1 Pro and Qwen4 Max agree (19-REVIEWS.md)`.
- The hull-wear todo and `tests/guards/hull-wear-tripwire.test.ts` (a non-comment `EQ_RENOVATION`, a second reader of the factor, or a changed `SHIP_TRADE_IN_FACTOR = 95;` declaration each fail it, naming the todo).

## Measured values

- Pinned seed vector (Lave market seed `marketSeedForSystem("g0-s7")`, epoch 1, so world seed `0x2b4e037c`): `forkSeed(world, 100, "damage") = 0xf0bc27aa`; `internalDamageSeed(world, 0) = 0x1b13a557`; `internalDamageSeed(world, 1) = 0xb1739741`. Measured once in Docker and written into `tests/sim/combat/internal-damage.test.ts` with its derivation.
- Hand cases: 36 `it(...)` in `internal-damage.test.ts`; property test: two properties, 400 and 200 fast-check cases (seeds 20261921 and 20261922), covering NaN, negative and Infinity probabilities and capacities, duplicate keys, and applied amounts up to 1e308.
- Cap cases: 8192 consumes 512 draws (256 iterations, Oolite's count); 8224 and 8192.5 consume 512 where Oolite would consume 514 and at least 513; a second `rollInternalDamage(64, ...)` on the same work copy and source then consumes 4 more (516 total), starting at draw 513.
- Disagreement between a hand case and the C: none. Every case was derived on paper from `PlayerEntity.m` first and passed without a widened expectation.

## Gates

Plan-boundary gates (pure `src/sim`, no remote run; nothing calls the module, so no world, hash or golden moves):

- Targeted: `tests/sim/combat/internal-damage.test.ts`, `internal-damage.property.test.ts`, `tests/sim/rng.test.ts`, `tests/guards/sim-purity.test.ts`, `tests/guards/sim-determinism-bans.test.ts`, `tests/guards/hull-wear-tripwire.test.ts`, `tests/contract/fidelity.test.ts`: all green.
- `docker compose run --rm typecheck`: green. `docker compose run --rm lint` (eslint and prettier): green.
- `docker compose run --rm test` (full suite, coverage on): the machine ran three full suites in parallel, and both full runs ended with 6 files failing, every failure a `Test timed out in 5000ms` (or 30000 ms for `tools-determinism`) in files this plan does not touch. The second run's set was `tests/guards/tools-determinism.test.ts`, `tests/app/session/tick-flyers.test.ts`, `tests/sim/combat/kill.property.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`, `tests/sim/npc/hot-weapon.test.ts` and `tools/oolite-ingest/convert/textures.test.ts` (the last is a known flake). Those six files rerun alone with `--testTimeout=120000`: 6 files and 127 tests passed. 266 of 272 files and 7,148 of 7,154 non-skipped tests passed in the full run. The `src/**` 93 % lines floor was not reported as breached (the failing run printed no coverage-threshold error line); the new module is covered by 36 hand cases and the property test. A clean full run on an idle machine is the orchestrator's to confirm at the wave merge.
- Remote runs (verify, verify-full, browser specs): none, per the plan. No snapshot, `exit=` or `elapsed=` line to record.
- The existing combat twin literals were not touched and nothing shifted; no twin hash was re-pinned.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Plan text said `EQ_RENOVATION` restores the trade-in factor to 100**
- **Found during:** Task 3 (reading `PlayerEntity.m:9279-9289` and the fuel-price code before writing the Key Decisions row and the todo)
- **Issue:** the plan's row text ("100 only through `EQ_RENOVATION`") is not what Oolite does: `EQ_RENOVATION` adds `5 + tech level` capped at 100, a shipyard purchase sets 100 (`PlayerEntityContracts.m:1612`), the cosmetic branch lowers it by one and each jump by 1 to 4 (`PlayerEntity.m:6868-6871`), and the fuel price rises while it is 75 to 90 (`:11420-11422`).
- **Fix:** the factor-95 Key Decisions row, the todo and the `SHIP_TRADE_IN_FACTOR` doc state the verified behaviour. The row still starts with the exact plan text and the decision is unchanged.
- **Files modified:** `.planning/PROJECT.md`, `.planning/todos/pending/2026-11-21-hull-wear-renovation-and-fuel-price.md`, `src/sim/combat/internal-damage.ts` (doc comment)
- **Commit:** e9458e2

**2. [Rule 3 - Blocking] Existing RNG purpose pin**
- **Found during:** Task 1
- **Issue:** `tests/sim/rng.test.ts` pinned `RNG_PURPOSE_CODES` to the four old codes, so adding `damage: 5` broke it.
- **Fix:** the pin now lists `damage: 5`, and a new case forks the damage purpose apart from every other stream. No existing code changed.
- **Commit:** 1cf2c36

TDD note: Task 1 is `tdd="true"`, but the module and its tests were committed together rather than as a RED commit followed by a GREEN commit; the tests were written against the C lines before the first run and passed without change to the implementation (apart from measuring the seed vector).

## Known Stubs

None. Nothing calls `rollInternalDamage` yet by design: the ledger call is plan 19-04 and the profile update is plan 19-10.

## Threat Flags

None. The module adds no endpoint, auth path or file access. T-19-02 (unbounded loop) is mitigated by the 256-iteration cap with its hand cases and property test; T-19-03 (hostile probabilities, capacities, duplicate keys) by `internalDamageWork` sanitising and copying, with the property asserting no throw, no input mutation and no double damage.

## Self-Check: PASSED

- Created files present: `src/sim/combat/internal-damage.ts`, `tests/sim/combat/internal-damage.test.ts`, `tests/sim/combat/internal-damage.property.test.ts`, `tests/guards/hull-wear-tripwire.test.ts`, `.planning/todos/pending/2026-11-21-hull-wear-renovation-and-fuel-price.md`.
- Commits present in history: `1cf2c36` (Task 1), `297712d` (Task 2), `e9458e2` (Task 3).
- Acceptance greps: the three Key Decisions rows once each, three rows carrying the exact `Reviewers:` field, no `Reviewers: PENDING`, `damage: 5` once, `rollInternalDamage` exported once, no banned token in non-comment code of the module, no Cyrillic in any committed file of the plan.

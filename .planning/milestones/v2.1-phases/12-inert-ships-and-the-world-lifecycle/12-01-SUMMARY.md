---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 01
subsystem: sim
tags: [spawn, world, refusal-reasons, vitest]
requires:
  - phase: 08-session-split-and-world-core
    provides: spawnEntity, the dynamic entity store and the shared serialised domain
provides:
  - SPAWN_REFUSALS, SpawnRefusal and SpawnResult exported from src/sim/world/world.ts
  - spawnEntity returns { ok: true, entity } or { ok: false, reason } and never throws for a refusal
  - every refusal happens before store.allocate (nextId, live array and world stream untouched)
affects: [12-02, 12-07]
status: complete
actuals:
  tokens: 8000
  tasks: 2
  commits: 2
plan_head_before: 2e6f5829330ca98819f44af39f20a64c2aab03b4
plan_head_after: fbd49344365c216d233234d5753c964fa47642ac
tech-stack:
  added: []
  patterns:
    - "closed refusal vocabulary as a const tuple, checked with (ARRAY as readonly string[]).includes"
    - "refuse before allocate so the id counter and RNG never move on refusal"
key-files:
  created: []
  modified:
    - src/sim/world/world.ts
    - tests/sim/world/store.test.ts
    - tests/sim/world/hash.test.ts
    - tests/sim/world/view.test.ts
    - tests/sim/world/step.test.ts
    - tests/sim/world/control.test.ts
    - tests/sim/world/snapshot.test.ts
    - tests/sim/world/snapshot-codec.test.ts
    - tests/sim/world/sanitize.test.ts
    - tests/sim/world/world-cadence.test.ts
    - tests/sim/ai/test-pilot.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/app/session/tick-parity.test.ts
key-decisions:
  - "The refusal order is domain (outOfDomain, then ai), then idExhausted, then storeFull; plan 12-02 inserts malformed before all of them."
  - "malformed is declared in SPAWN_REFUSALS now but not produced yet; plan 12-02 adds its input guards."
requirements-completed: [FOUND-16]
---

# Phase 12 Plan 01: SpawnResult contract for spawnEntity Summary

`spawnEntity` now returns a `SpawnResult` with a closed, payload-free refusal reason (`malformed`, `outOfDomain`, `ai`, `idExhausted`, `storeFull`), refusing before `store.allocate` so a refused spawn never moves the id counter, the live array or the world stream.

## Accomplishments

- `src/sim/world/world.ts`: exported `SPAWN_REFUSALS`, `SpawnRefusal`, `SpawnResult`; replaced the boolean `isLegalSpawn` with `domainRefusal` (same checks and order, now naming `outOfDomain` or `ai`); `spawnEntity` refuses `idExhausted` (counter not a safe integer or above `MAX_UINT32`) and `storeFull` (`liveEntityCount >= MAX_ENTITIES`) before calling `allocate`, and maps an `allocate` that still returns undefined to `storeFull`. Doc comment rewritten for the result union, the reason list and the refuse-before-allocate rule.
- Migrated every `spawnEntity` call site in the tests: the six local `spawnOk` helpers (plus a new one in test-pilot.test.ts and `entityOf` in store.test.ts) unwrap the result and fail with the refusal reason; direct calls read `.entity` after asserting `.ok`; rows that expected `undefined` assert `{ ok: false, reason }` with the unambiguous reason. No expected value changed.
- `tests/sim/world/store.test.ts`: the refusal table is split into `domainRefused` (`outOfDomain`) and `aiRefused` (`ai`) groups, and new rows cover `storeFull` (with a kill-and-commit that lets the next spawn take the pre-refusal id), `idExhausted` for 2**32, NaN, 1.5 and Infinity counters, the last-id-then-exhausted path, and the refusal order (domain wins over `idExhausted` and `storeFull`). Each row asserts `nextId`, `live.length` and `world.rng.s` unchanged.

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | spawnEntity returns a SpawnResult and every caller reads it | 3be2099 |
| 2 | capacity and counter refusals name their reason and never move state | fbd4934 |

## Verification (all run in Docker)

- `docker compose run --rm test npx vitest run tests/sim tests/app/session/world-lifecycle.test.ts tests/app/session/tick-parity.test.ts tests/persistence/save-v3.test.ts`: 45 files, 1021 passed, 1 skipped (Task 1).
- `docker compose run --rm test npx vitest run tests/sim/world/store.test.ts`: 97 passed (Task 2).
- `docker compose run --rm test` (full, with coverage thresholds): exit 0, 142 files passed; `src/sim/world/world.ts` at 99.05% statements, 100% lines.
- `docker compose run --rm lint`: eslint and prettier clean.
- `docker compose run --rm typecheck`: both tsconfig.json and tsconfig.sim.json clean.
- Acceptance greps: `SPAWN_REFUSALS` 3, `SpawnResult` 2, old `): Entity | undefined {` 0, `rg -l 'spawnEntity\(' tests src | wc -l` 14.
- No verify or verify-full run, per the plan's gate policy for `src/sim/` and test-only changes.

## Deviations from Plan

### Auto-fixed Issues

None for the code. Notes on execution:

1. **Delegation not possible.** The plan marks the call-site migration "cheapest tier" subagent work. This executor has no subagent tool, so the main agent made the mechanical edits directly and reviewed the whole diff as shape-only.
2. **TDD red phase for Task 2 was not observed.** Task 1's action already specified the pre-allocate refusals in the order `idExhausted`, `storeFull`, so the Task 2 rows were green on first run. The rows were written after the Task 1 commit; the reasons and unchanged-state assertions are explicit, but no red run was captured.
3. **`tests/persistence/save-v3.test.ts` is unchanged.** Both of its calls discard the result, so they compile and pass unchanged; the plan listed it among the 13 files but no edit was needed. `tests/sim/world/flight-hash-pins.test.ts` was untouched. The commit changes 13 files (world.ts plus 12 tests).
4. **Discarded-result call sites** in world-lifecycle, tick-parity and save-v3 populators were left discarding, as before (shape-only change); the `spawned?.id` and `pilot?.id` expectations became `spawned.ok && spawned.entity.id`.

## Known Stubs

None.

## Threat Flags

None. T-12-04 (spawn counter and world stream tampering) is mitigated as planned: every refusal precedes `store.allocate`, and the Task 2 rows assert `nextId`, `live.length` and `world.rng.s` unchanged for `idExhausted` and `storeFull`.

## Self-Check: PASSED

- FOUND: src/sim/world/world.ts, tests/sim/world/store.test.ts
- FOUND commits: 3be2099, fbd4934

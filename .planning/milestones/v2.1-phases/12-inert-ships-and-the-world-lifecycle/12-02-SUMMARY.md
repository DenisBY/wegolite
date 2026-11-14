---
phase: 12-inert-ships-and-the-world-lifecycle
plan: 02
subsystem: sim
tags: [ai-seam, fault-containment, spawn, world-step, vitest]
requires:
  - phase: 12-inert-ships-and-the-world-lifecycle
    provides: "plan 12-01 SpawnResult and the closed SPAWN_REFUSALS vocabulary (malformed declared, not yet produced)"
provides:
  - "invoke() in src/sim/world/step.ts contains a throwing AI module: ai = null (nullAI), one unrouted aiFaulted event, stream written back, repairs untouched"
  - "aiFaulted SimEvent and AiFaultSite in src/sim/events.ts (diagnostic kind, not in RESERVED_EVENT_KINDS)"
  - "the placeholder integrator skips entities with no AI (D-02): they hold position and speed field"
  - "spawnEntity refuses nullish or wrong-typed input as malformed before any domain check and never throws (FOUND-16)"
  - "Key Decisions rows for FOUND-15/D-04 and FOUND-16, row (d) amended for D-02"
affects: [12-07, 12-08, 13, 14]
status: complete
actuals:
  tokens: 10700
  tasks: 3
  commits: 3
plan_head_before: 6757530702fc8a93cd13d657534541416444ce39
plan_head_after: 83b68449f333028bd34d09db120629c8c69d98e6
tech-stack:
  added: []
  patterns:
    - "single containment point: only the module call inside invoke is in try/catch; the context is built outside it so sim-helper defects still throw"
    - "caught value is never read or formatted, so no exception text reaches an event or the hash"
    - "typeof/Array.isArray shape guards (isRecord, hasNumberFields) run before domain checks; never the in operator"
key-files:
  created:
    - tests/sim/world/spawn-refusal.test.ts
  modified:
    - src/sim/events.ts
    - src/sim/world/step.ts
    - src/sim/world/world.ts
    - tests/sim/world/step.test.ts
    - .planning/PROJECT.md
key-decisions:
  - "A throwing think or onEvent turns the entity into nullAI (ai null, hash line ai:none) and emits one aiFaulted {id, site}; the entity keeps its id and stays on the scanner (D-04)."
  - "An entity with no AI is skipped by the placeholder integrator and holds placement and speed field (D-02, row (d) amended)."
  - "spawnEntity refusal order is malformed, then outOfDomain or ai, then idExhausted, then storeFull; a refusal never moves nextId, the live array or the world stream."
requirements-completed: [FOUND-15, FOUND-16]
---

# Phase 12 Plan 02: AI fault containment and malformed spawn input Summary

A throwing AI module can no longer abort the fixed world step: `invoke` catches it, nulls the entity's AI, emits one `aiFaulted` event, and entities with no AI hold still; `spawnEntity` refuses malformed input as `malformed` instead of throwing.

## Accomplishments

- **Contained AI faults (D-04, Task 1).** `invoke` takes `events` and a `site` ("think" or "event"), builds the context outside the guarded region, and wraps only the module call in try/catch. On a throw: `entity.ai = null`, one `{ kind: "aiFaulted", id, site }` is pushed, the caught value is not read, and `entity.rng.ai` is written back on both paths (draws made before the throw are kept). `repairs` is untouched. `events` is threaded through `drainAiEvents` and `deliverAiEvent`. Doc comment records that `invoke` is the only containment point and `stepSim` never wraps `stepWorld`.
- **`aiFaulted` diagnostic event.** Added to `SimEvent` with `AiFaultSite`; documented as unrouted and as following the id-lifetime rule. `RESERVED_EVENT_KINDS` keeps its 15-kind pin.
- **Inert entities hold still (D-02).** The update loop skips `entity.ai === null` (same `continue` as `dead`); the loop comment is rewritten.
- **Malformed-input guards (FOUND-16, Task 2).** `isMalformedInit(init, tick)` runs before `domainRefusal`: non-null non-array `init`, numeric `tick`, string `specKey`/`kind`/`scanClass`, numeric `radius`, `speed` and `ownerId` undefined or numeric, `position` and `orientation` objects with numeric components, `ai` undefined/null or an object with string `aiKey`, numeric `wakeTick` and `nextThinkTick`, and object `params`. The now-unreachable `typeof init.specKey` check was removed from `domainRefusal`.
- **Tests.** `tests/sim/world/step.test.ts` gains the "contained AI faults" block (think fault, onEvent fault, thrown string, no exception text in events, stream write-back after two draws, working neighbour keeps thinking and the faulted entity is still scanned, 20-tick hash equality of two identical faulting worlds, a bad `dt` still throws). New `tests/sim/world/spawn-refusal.test.ts` (68 cases) asserts, for every malformed row and for the kept domain reasons, no throw, `nextId`, `live.length` and `world.rng.s` unchanged, and the next valid spawn taking the pre-refusal id; plus malformed-wins-over-`idExhausted`/`storeFull` and the 257th spawn still `storeFull`.
- **Key Decisions.** Two new rows (FOUND-15/D-04, FOUND-16) after the entity-id-uniqueness row; row (d) amended for D-02 with the existing text kept.

## D-02 consequences (the only two expectation changes)

1. `tests/sim/world/step.test.ts` "the Phase 8 placeholder integrator": the moving case now spawns a test-pilot entity (due far in the future, so it never thinks) with desired speed 60; a new case pins that an `ai: null` entity with speed 60 stays put over 120 world steps (position, `speed` field and serialized line unchanged).
2. `tests/sim/world/step.test.ts` "never steps the world while docked": its entity is now a test-pilot entity with speed 60 so the check can still fail if the world were stepped while docked.

No other existing test changed (`git diff --name-only 6757530 -- tests` lists only `step.test.ts` and `spawn-refusal.test.ts`).

## Task Commits

| Task | Name | Commit |
|------|------|--------|
| 1 | contain a throwing AI module in invoke and hold no-AI entities still (tracer) | 4fa7051 |
| 2 | refuse malformed spawnEntity input as malformed before any domain check | f37e469 |
| 3 | record the AI fault containment and spawn refusal rules as Key Decisions | 83b6844 |

## Verification (all run in Docker)

- Tracer `<verify>` (`vitest run` of step, test-pilot, world-cadence, snapshot): 4 files, 64 passed; it passed on the first full run after the red run (8 failed before the change). Tracer gate: automated-only verify re-run end to end, so expansion proceeded with no checkpoint.
- Task 2 verify (`vitest run` of spawn-refusal, store, step): 3 files, 203 passed. Red run against the previous `world.ts` showed 51 of 68 spawn-refusal cases failing.
- `docker compose run --rm test` (full, coverage thresholds on `src/sim/**`): exit 0, 143 files, 2809 passed, 2 skipped; `src/sim/world/world.ts` 100% statements/lines, `step.ts` 98.8% statements/100% lines.
- `docker compose run --rm lint`: eslint and prettier clean. `docker compose run --rm typecheck`: both tsconfig projects clean.
- Acceptance greps: `aiFaulted` events.ts 2, step.ts 3, step.test.ts 5; `entity.ai === null` in step.ts 3; `malformed` in spawn-refusal.test.ts 16; no `"key" in value` introduced; Key Decisions greps 1/1/1.
- No verify or verify-full run, per the plan's gate policy (`src/sim/`, tests and planning docs only).

## Deviations from Plan

### Auto-fixed Issues

None for the code. Notes on execution:

1. **Acceptance count for `Array.isArray` is 4, not >= 5.** The criterion was a proxy for "guards for init, ai and ai.params were added". One shared helper `isRecord` (non-null, non-array object) performs all three checks, so the textual count is lower while behaviour is the one the plan describes and every row is covered by the matrix. Kept the helper rather than inlining three copies.
2. **TDD red phase for Task 2 was captured retroactively.** `world.ts` was edited before the test file was written; after writing the matrix I restored `HEAD`'s `world.ts` temporarily, observed 51 of 68 cases fail, and put the new code back before the green run. The committed state is the green one.
3. **`aiFaulted` has no CHANGELOG entry.** It is an internal, unrouted diagnostic with no user-visible effect yet; AGENTS.md allows omitting internal changes.
4. **Delegation not possible.** This executor has no subagent tool; all edits were made directly.
5. **Commits are on `main`.** The orchestrator dispatched this plan as a sequential executor on the main working tree (`SEQUENTIAL=true`), as for plan 12-01.

**Total deviations:** 0 auto-fixed, 5 execution notes. **Impact:** none on behaviour or scope.

## Known Stubs

None.

## Threat Flags

None. T-12-01 and T-12-02 (containment, no exception text) and T-12-03 and T-12-05 (guards before property reads, no `in` operator, existing `FORBIDDEN_PARAM_KEYS` kept) are mitigated as planned and covered by the Task 1 and Task 2 rows.

## Self-Check: PASSED

- FOUND: src/sim/events.ts, src/sim/world/step.ts, src/sim/world/world.ts, tests/sim/world/step.test.ts, tests/sim/world/spawn-refusal.test.ts, .planning/PROJECT.md
- FOUND commits: 4fa7051, f37e469, 83b6844

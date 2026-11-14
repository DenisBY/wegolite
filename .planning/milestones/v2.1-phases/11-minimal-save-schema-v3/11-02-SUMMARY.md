---
phase: 11-minimal-save-schema-v3
plan: 02
subsystem: persistence
tags: [save-schema, v3, migration, leg-anchor, golden, world-lifecycle]

requires:
  - phase: 11-minimal-save-schema-v3
    provides: WorldLifecycle.anchorNextEntityId, the D-07 vector, the captured v2 writer golden (plan 11-01)
provides:
  - SAVE_VERSION 3 and the strict SaveV3Schema (every v2 field plus required epoch and nextEntityId)
  - The ordered v1 -> v2 -> v3 chain in parseSave and the pure migrateV2ToV3
  - SaveWorldCounters and snapshotForSave(..., counters, targetSystemId?) with the D-05 counter rules
  - A session writer (buildSnapshotInputs) wired to the live world lifecycle
  - Three v3 goldens and step/chain golden tests
affects: [11-03, 11-04]

actuals:
  tokens: 16500
  tasks: 3
  commits: 3
plan_head_before: 3c885a36a9cdc30c6a2f9f05150b2342a2416ff2
plan_head_after: 90e4bd35e507ee1f542b8d28294bf343b6bf8bb6

tech-stack:
  added: []
  patterns:
    - "SaveV3Schema spreads SaveV2Schema.shape into z.strictObject so strictness stays explicit and the v2 schema stays the historical migration input"
    - "Persistence restates the sim's first dynamic id (FRESH_WORLD_NEXT_ENTITY_ID = 101) and a test pins the equality, because src outside src/sim may not import the id module"

key-files:
  created:
    - tests/golden/save/v3-from-v1-phase4.json
    - tests/golden/save/v3-from-v1-phase5.json
    - tests/golden/save/v3-from-v2-phase10-inflight.json
  modified:
    - src/persistence/save.ts
    - src/persistence/autosave.ts
    - src/app/session/save-controller.ts
    - src/main.ts
    - src/app/game-session.ts
    - tests/persistence/save-v3.test.ts
    - tests/persistence/save.test.ts
    - tests/persistence/save-v2.test.ts
    - tests/persistence/save-golden.test.ts
    - tests/persistence/autosave.test.ts
    - tests/app/session/save-controller.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/e2e/helpers/save-fixtures.ts

key-decisions:
  - "Docked saves always write nextEntityId 101 and the lifecycle epoch, whether or not the docking world still exists, so every autosave trigger (dock, purchase, launch) yields the same bytes (D-05)"
  - "buildSnapshotInputs is not-ready without a world lifecycle rather than defaulting the counters, so a writer that forgets the lifecycle cannot silently write epoch 0"

requirements-completed: [SAVE-07]

coverage:
  - id: D1
    description: "Saves are written as strict v3 carrying epoch and nextEntityId (D-01, D-03, D-04, D-05): in-flight saves record the anchor counter, docked saves record 101, the epoch is the lifecycle epoch"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#v3 save end to end (tracer)"
        status: pass
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#anchored save: only the epoch and the anchor counter of the world enter the save"
        status: pass
      - kind: unit
        ref: "tests/app/session/save-controller.test.ts#buildSnapshotInputs"
        status: pass
    human_judgment: false
  - id: D2
    description: "v1 and v2 saves load through the ordered chain to epoch 0 and counter 101 (D-02, D-03), each step pinned by goldens, including the captured v2 writer blob"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/save-golden.test.ts"
        status: pass
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#migration to v3 (D-02, D-03)"
        status: pass
      - kind: unit
        ref: "tests/persistence/save.test.ts"
        status: pass
      - kind: unit
        ref: "tests/persistence/save-v2.test.ts"
        status: pass
    human_judgment: false
  - id: D3
    description: "A v3 round trip rebuilds the same world seed (D-07): worldSeedFor(save market seed, save epoch) is 0x2b4e037c at Lave epoch 1 and a restored lifecycle's anchor counter equals the saved nextEntityId"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#v3 save end to end (tracer)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Every writer call site, type and the boot compile against SaveV3; the writer-bound cases still commit the v3 maxima under MAX_SAVE_CHARS"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#writer bounds"
        status: pass
      - kind: command
        ref: "docker compose run --rm typecheck"
        status: pass
      - kind: command
        ref: "docker compose run --rm lint"
        status: pass
    human_judgment: false

duration: 10min
completed: 2026-11-14
status: complete
---

# Phase 11 Plan 02: Save schema v3 Summary

**Saves are now strict schema v3: every v2 field plus a required leg-anchor `epoch` and `nextEntityId`, written from the live world lifecycle, with v1 and v2 saves loading through the ordered v1 -> v2 -> v3 chain to epoch 0 and counter 101.**

## Performance

- **Duration:** about 10 min (11:50 to 12:00 UTC)
- **Tasks:** 3 (1 tracer, 2 auto)
- **Files:** 16 (3 created, 13 modified)
- **Full suite:** `docker compose run --rm test` took 2 min 25 s (142 files, 2685 passed, 2 skipped, coverage thresholds met)

## Accomplishments

- `src/persistence/save.ts`: `SAVE_VERSION = 3`; `MAX_SAVE_EPOCH = 0xfffffffe`, `FRESH_WORLD_NEXT_ENTITY_ID = 101` and `MAX_SAVE_NEXT_ENTITY_ID = 2^32`; `SaveV2Schema` is the historical schema (literal 2); `SaveV3Schema = z.strictObject({ ...SaveV2Schema.shape, version, epoch, nextEntityId })`; pure `migrateV2ToV3`; `parseSave` chains `migrateV2ToV3(migrateV1ToV2(...))` for v1, `migrateV2ToV3` for v2 and reads v3 directly; `SaveInputs.epoch` and `SaveInputs.nextEntityId` are required, so a writer that omits them fails typecheck; `encodeSave` writes both right after `station`, with `version` still first (`{"version":3,`).
- `src/persistence/autosave.ts`: `SaveWorldCounters` and `snapshotForSave(..., counters, targetSystemId?)`. epoch is the lifecycle epoch. In flight, nextEntityId is the anchor counter (`anchorNextEntityId`, else 101); docked, it is always 101, so the dock autosave (world still alive), the purchase autosave and the launch autosave (no world) all give the same bytes.
- `src/app/session/save-controller.ts`: `buildSnapshotInputs` passes `ctx.core.worldLifecycle` as the counters and returns undefined (not-ready) without one. A snapshot mid-leg after an NPC spawned (live counter 102) still records anchor counter 101 and epoch 3.
- D-07 round trip: an in-flight save after the first launch from Lave encodes `"epoch":1,"nextEntityId":101`, parses back, `worldSeedFor(market.seed, 1)` is `0x2b4e037c`, and a fresh lifecycle after `resetForRestore(save.epoch)` and `resume(market.seed)` builds that world with `anchorNextEntityId` equal to the saved counter.
- Boot and session types (`src/main.ts`, `src/app/game-session.ts`) name `SaveV3`; every one of the 18 `snapshotForSave` call sites in autosave.test.ts, both in save-controller.test.ts and the one in world-lifecycle.test.ts pass counters; e2e fixtures encode epoch 0 and counter 101.
- Goldens: three hand-authored v3 files (each equals its v2 source with version 3 and `epoch: 0`, `nextEntityId: 101` appended). save-golden.test.ts pins the v1 -> v2 step, the v2 -> v3 step, the v1 -> v3 chain, a v2 load and the captured v2 writer blob's migration.

## Task Commits

1. **Task 1: v3 save end to end (tracer)** - `bef250e` (feat). This is the first v3 write path: from this commit the mix32 world-seed derivation is one-way, because the epoch it depends on is persisted.
2. **Task 2: boot, session types and call sites on SaveV3** - `e2ac715` (feat)
3. **Task 3: older saves through the ordered chain, goldens, plan gate** - `90e4bd3` (test)

## Expectations changed in the migrated suites (D-02 rule applied)

Every changed expected value moved to the v3 output D-02 defines (version 3, epoch 0, nextEntityId 101, nothing else changed). No rejection was loosened, no case deleted, no assertion weakened.

- `tests/persistence/save.test.ts`: `migrated()` returns `migrateV2ToV3(migrateV1ToV2(save))`; the v1 accept case asserts version 3, epoch 0, counter 101; the minimal v2 docked case expects `{ ...save, version: 3, epoch: 0, nextEntityId: 101 }`; the future-build row (and the two oversized-prefix cases) use version 4; the encodeSave key-set case adds `epoch` and `nextEntityId` to inputs and the sorted key list.
- `tests/persistence/save-v2.test.ts`: header says this is the v2 contract as the v3 build reads it; `saveInputs()` gains epoch 0 and counter 101; every whole-save accept expectation is `migrateV2ToV3(save)`; the v1 parse case expects the v2-then-v3 chain; the schema-version case also asserts SaveV3Schema rejects a version-2 object and SaveV2Schema rejects a version-3 object; the two future-version fixtures moved to 4; the writer-gate fixtures (canonical blob under the full allow-list, system, station and market-good rejections) are v3 blobs, since the gate now parses with SaveV3Schema.
- `tests/persistence/autosave.test.ts`: literal `SaveV2` fixtures became `SaveV3` (version 3, epoch 0, counter 101); `maximumInputs` gains `MAX_SAVE_EPOCH` and `MAX_SAVE_NEXT_ENTITY_ID`, and both writer-bound cases still commit under `MAX_SAVE_CHARS`.
- `tests/app/session/save-controller.test.ts`: the harness installs a world lifecycle; the two exact buildSnapshotInputs expectations gain `epoch: 0`, `nextEntityId: 101`; two new cases (not-ready without a lifecycle, epoch and anchor counter recorded).
- `tests/app/session/world-lifecycle.test.ts`: laveBlob passes `NO_COUNTERS`; the anchored-save describe now allows `epoch` and `nextEntityId` and asserts epoch 3, counter 101 and `store.nextId` 102 after the pilot spawn.
- `tests/persistence/save-golden.test.ts`: plan 11-01's "canonical v2 writer golden" block and `V2_INFLIGHT_INPUTS` were replaced (the v2 writer no longer exists) by step and load checks against `v3-from-v2-phase10-inflight.json`; the captured v2 blob stays as migration input.

## Deviations from Plan

None - plan executed exactly as written.

The plan's context block says "Do not commit"; the orchestrator's dispatch for this run asked for per-task atomic commits, so each task was committed individually. The plan's `<verify>` for Task 3 chains four commands; the full suite was run twice by accident (once piped to a tail, once to a filtered summary), with the same green result.

## Known Stubs

None.

## Threat Flags

None. The surface added (the two schema fields) is the plan's own threat register (T-11-04 to T-11-10); epoch and counter bounds are in the schema, the writer requires both fields, and no entity key exists in `src/persistence/save.ts` (the forbidden-name rg gate prints nothing).

## Issues Encountered

None. `verify` was not run, per the gate policy: browser specs `tests/e2e/save-load.spec.ts` and `tests/e2e/autosave.spec.ts` still use version 3 as "the future" until plan 11-04.

## Self-Check: PASSED

- FOUND: src/persistence/save.ts, src/persistence/autosave.ts, src/app/session/save-controller.ts, tests/persistence/save-v3.test.ts, tests/golden/save/v3-from-v1-phase4.json, tests/golden/save/v3-from-v1-phase5.json, tests/golden/save/v3-from-v2-phase10-inflight.json
- FOUND commits: bef250e, e2ac715, 90e4bd3
- All task acceptance criteria re-run and passing; full Vitest suite (142 files, 2685 tests), lint and typecheck green in Docker.

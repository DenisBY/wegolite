---
phase: 11-minimal-save-schema-v3
plan: 03
subsystem: persistence
tags: [save-schema, v3, leg-anchor, restore, world-lifecycle, older-build, worst-case]

requires:
  - phase: 11-minimal-save-schema-v3
    provides: SaveV3 with required epoch and nextEntityId, the ordered migration chain, the session writer (plan 11-02)
provides:
  - Warm Load re-anchors the lifecycle with resetForRestore(saved.epoch)
  - Cold Continue re-anchors with resetForRestore(restore.epoch) before the in-flight resume
  - Restore identity tests: epoch, world seed, snapshot, hash and anchor counter match a fresh arrival
  - The v3 edge table, writer gate, classification, older-build and worst-case tests
affects: [11-04]

actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: 1b70095dccf88a381c53c57674486f168511ce28
plan_head_after: d3537d2375327935feadb5798706332e6b028c70

tech-stack:
  added: []
  patterns:
    - "The restore paths do not branch on resetForRestore's result: the schema bound (0..0xfffffffe) equals the lifecycle domain, and a test pins the equivalence"
    - "Older-build inertness is proven by a verbatim frozen copy of the 41aaf0e classifier applied to every blob shape this build writes"

key-files:
  created: []
  modified:
    - src/app/session/save-controller.ts
    - src/app/session/start-session.ts
    - src/app/session/world-lifecycle.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/persistence/save-v3.test.ts

key-decisions:
  - "Cold Continue and warm Load call resetForRestore in the same position (after the seed install, before the in-flight resume), so both yield the same epoch and world seed (D-06)"
  - "The worst-case v3 save measures 40,427 characters, 25,109 under MAX_SAVE_CHARS (65,536); plan 11-04 records this in the Key Decisions row"

requirements-completed: [SAVE-07]

coverage:
  - id: D1
    description: "Warm Load and cold Continue restore the saved epoch and rebuild the anchor world: an in-flight epoch-5 save gives epoch 5, worldSeedFor(seed, 5), the fresh arrival's snapshot and hash, and its counter, with and without spawned entities; the next arrival is epoch 6 on every path (D-05, D-06)"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#load"
        status: pass
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#start-up creates the lifecycle from the parsed traffic flag before the restore branch, re-anchors at the saved epoch and then resumes an in-flight restore"
        status: pass
    human_judgment: false
  - id: D2
    description: "A docked epoch-5 save restores epoch 5 with no world and launches into epoch 6 with the writer's seed; a v2 save restores at epoch 0 and launches at epoch 1"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/app/session/world-lifecycle.test.ts#load"
        status: pass
    human_judgment: false
  - id: D3
    description: "Bounds, required fields and strictness of v3 are pinned at the reader (D-03, D-04); the schema bound equals the lifecycle domain; the writer gate refuses epoch 0xffffffff and leaves the stored bytes"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#v3 bounds and required fields (D-03, D-04)"
        status: pass
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#the writer gate refuses an out-of-range epoch"
        status: pass
    human_judgment: false
  - id: D4
    description: "A version-4 blob (also oversized, without JSON.parse) is future-version; a corrupt v3 blob is corrupt; every blob this build writes is future-version to the v2 build's classifier; the worst-case v3 save is schema-valid and under the cap (D-08)"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#classification: future, corrupt and the backup path"
        status: pass
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#older builds keep a v3 save inert (criterion 2)"
        status: pass
      - kind: unit
        ref: "tests/persistence/save-v3.test.ts#worst-case v3 save (D-08)"
        status: pass
    human_judgment: false

duration: 15min
completed: 2026-11-14
status: complete
---

# Phase 11 Plan 03: Restore the saved epoch, edge and worst-case proofs Summary

**Warm Load and cold Continue now re-anchor the world lifecycle at the saved epoch before an in-flight resume, so a loaded v3 save rebuilds exactly the world a fresh arrival at its anchor builds; the v3 bounds, writer gate, older-build inertness and the 40,427-character worst case are pinned at the reader.**

## Performance

- **Duration:** about 15 min
- **Tasks:** 2 (1 tracer, 1 auto)
- **Files:** 5 modified, none created
- **Full suite:** `docker compose run --rm test` took 2 min 19 s (142 files, 2723 passed, 2 skipped, coverage thresholds met); `lint` and `typecheck` green

## Accomplishments

- `src/app/session/save-controller.ts`: `loadFromSave` calls `resetForRestore(saved.epoch)` where it called `resetForRestore(0)`, with the comment rewritten (D-06, result not branched on per D-04).
- `src/app/session/start-session.ts`: a `restoring && restore !== undefined` block calls `resetForRestore(restore.epoch)` after the market install and before the in-flight resume; the step-list doc (item 9) and the RESEARCH A9 comment were updated. The call text appears exactly once.
- `src/app/session/world-lifecycle.ts`: doc text only (module paragraph and the `resetForRestore` interface comment) now describes the persisted epoch.
- `tests/app/session/world-lifecycle.test.ts`: `loadHarness({ populate })`, `laveBlob(mode, counters)`, `spawnOne`, a rewritten "load" describe (in-flight at epoch 5 warm and cold, populated with counter 102, docked at epoch 5, v2 at epoch 0, failed parse, absent slot, hook order) and an extended source-order case. A mutation check (warm Load calling `resetForRestore(0)`) fails 3 of the cases.
- `tests/persistence/save-v3.test.ts`: the D-03/D-04 epoch and counter edge tables, absent fields, v1/v2-with-epoch and entity/cost-basis strictness rows, the lifecycle-domain equivalence, the writer gate, classification, the frozen `41aaf0e` older-build classifier (docked, in flight, worst case, worst case padded beyond the cap) and the worst case.

## Measured worst case

The worst-case v3 save encodes to **40,427 characters** (limit 65,536; floor in the test 38,000). Every field is at its bound, with all strings built only from code units that escape to six characters. Plan 11-04 writes this number into the Key Decisions row.

## Task Commits

1. **Task 1: warm Load and cold Continue re-anchor at the saved epoch (tracer)** - `1dc3137` (feat)
2. **Task 2: v3 bounds, writer gate, classification, older-build and worst-case proofs** - `d3537d2` (test)

## Deviations from Plan

None - plan executed exactly as written. No source fix was required by a Task 2 case (the reader already satisfied every edge).

Notes: Task 1's tests were written together with the source change and the mutation check (instead of a separate red run) confirmed they bind the call. The plan's context block says not to commit; the orchestrator's dispatch asked for per-task atomic commits, as in plan 11-02. `verify` was not run, per the gate policy; the browser proof of cold Continue runs at the end of plan 11-04.

## Accepted limit

`begin()` can still leave the epoch at 0xffffffff after 0xfffffffe jumps (about 4.3 billion launches); the writer gate then refuses the autosave. This is unreachable in play and is not tested (recorded as in the plan).

## Known Stubs

None.

## Threat Flags

None. T-11-11 to T-11-15 are mitigated by the tests above; no new surface was added.

## Self-Check: PASSED

- FOUND: src/app/session/save-controller.ts, src/app/session/start-session.ts, src/app/session/world-lifecycle.ts, tests/app/session/world-lifecycle.test.ts, tests/persistence/save-v3.test.ts
- FOUND commits: 1dc3137, d3537d2
- All acceptance-criteria rg counts re-run and as expected; full Vitest suite, lint and typecheck green in Docker.

---
phase: 11-minimal-save-schema-v3
plan: 04
subsystem: persistence
tags: [save-schema, v3, e2e, changelog, key-decisions, verify-full, phase-gate]

requires:
  - phase: 11-minimal-save-schema-v3
    provides: SaveV3 writer, ordered migration chain, restore wiring, edge and worst-case proofs (plans 11-01 to 11-03)
provides:
  - Browser specs on schema v3 (manual save asserts version 3, epoch 0, nextEntityId 101; version 4 is the newer build)
  - CHANGELOG Unreleased entry for the v3 save format with the compatibility call-out
  - Key Decisions rows "Save schema v3 fields:" and "Phase 11 gate: verify-full ..." and three Outcome updates
  - A green verify-full run as the Phase 11 gate
affects: [12]

actuals:
  tokens: 3500
  tasks: 2
  commits: 2
plan_head_before: 41a5786f662d5329dded6476ecea0737190fb26d
plan_head_after: d36b4a1890a47d97c4fa0fce7050681627904885

tech-stack:
  added: []
  patterns:
    - "The newer-build fixtures track SAVE_VERSION + 1: version 4 is the future while version 3 is this build's own"

key-files:
  created: []
  modified:
    - tests/e2e/save-load.spec.ts
    - tests/e2e/autosave.spec.ts
    - CHANGELOG.md
    - .planning/PROJECT.md

key-decisions:
  - "Save schema v3 fields recorded in Key Decisions: epoch 0..0xfffffffe, nextEntityId 101..2^32, docked counter 101, one-way mix32 derivation, worst case 40,427 of 65,536 characters"
  - "verify-full is the Phase 11 gate (AGENTS.md persistence trigger; owner choice); one run at the end of the phase"

requirements-completed: [SAVE-07]

coverage:
  - id: D1
    description: "In the real browser a manual Save of a new game writes version 3, epoch 0 and nextEntityId 101; a version-4 blob (including the oversized one) stays untouched through boot, New game, Save and Load"
    requirement: SAVE-07
    verification:
      - kind: e2e
        ref: "tests/e2e/save-load.spec.ts and tests/e2e/autosave.spec.ts inside docker compose run --rm verify-full (129 Chromium specs passed)"
        status: pass
    human_judgment: false
  - id: D2
    description: "CHANGELOG Unreleased Changed entry and the Key Decisions rows and Outcome updates record Phase 11, with FIDELITY.md-quoted Decision cells unchanged"
    requirement: SAVE-07
    verification:
      - kind: unit
        ref: "docker compose run --rm test npx vitest run tests/contract (3 files passed)"
        status: pass
    human_judgment: false
  - id: D3
    description: "The phase gate verify-full exits 0 with no failed or flaky count"
    requirement: SAVE-07
    verification:
      - kind: other
        ref: "docker compose run --rm verify-full, 28m27s, exit 0"
        status: pass
    human_judgment: false

duration: 45min
completed: 2026-11-14
status: complete
---

# Phase 11 Plan 04: Browser specs on v3, records and the verify-full phase gate Summary

**The two browser specs now assert a version-3 manual save and treat version 4 as the newer build, the changelog and Key Decisions record the v3 format and its compatibility break, and the owner-chosen `verify-full` gate exited 0.**

## Accomplishments

- `tests/e2e/save-load.spec.ts`: `DecodedSave` gained `epoch` and `nextEntityId`; the manual-save test asserts version 3, epoch 0 and nextEntityId 101; the two future fixtures moved from version 3 to version 4.
- `tests/e2e/autosave.spec.ts`: the future and oversized-future fixtures moved to version 4, with the padding comment updated. The v2-shaped corrupt fixture is unchanged.
- `CHANGELOG.md`: one `### Changed` bullet under Unreleased with the phrases "save format" and "older version" and a bold **Compatibility:** sentence.
- `.planning/PROJECT.md`: new rows "Save schema v3 fields:" and "Phase 11 gate: verify-full ..."; Outcome cells of "Make save schema v3 minimal", the mix32 derivation row and the 08-15 world-lifecycle row now record Phase 11. No Decision or Rationale cell of an existing row changed.
- The worst-case length written into the Key Decisions row is 40,427 characters against the 65,536 cap (25,109 under it), from plan 11-03.

## Task commits

1. **Task 1: browser specs on schema v3** - `5af889d` (test)
2. **Task 2: changelog, Key Decisions, Outcome updates** - `d36b4a1` (docs)

## Gate evidence

| Run | Command | Exit | Duration | Result |
| --- | ------- | ---- | -------- | ------ |
| 1 | `docker compose run --rm verify-full` (started 2026-11-14 12:12 UTC) | 0 | 28m27.6s | gate evidence |

Stage results of the run:

- lint and prettier check: clean; typecheck: clean; assets:check: "no differences"
- Vitest with coverage: 142 test files passed (142); 2,723 tests passed, 2 skipped (2,725); 139 s
- build: succeeded (the usual chunk-size warning only)
- Chromium e2e (`npm run test:e2e`): 129 passed (24.0m), no failed or flaky count; this includes all of `tests/e2e/save-load.spec.ts` (8 specs) and `tests/e2e/autosave.spec.ts` (20 specs) against the v3 build
- seams spec (`test:e2e:seams`): 2 passed (1.3m)

Pre-gate: `docker compose run --rm typecheck`, `docker compose run --rm lint` (after prettier on the two specs and the changelog) and `docker compose run --rm test npx vitest run tests/contract` (3 files, 50 passed, 1 skipped) were green.

No load-flake rerun was needed: the single verify-full run passed, so it is the gate evidence. Neither spec was run on its own.

## Deviations from Plan

None - the plan executed as written. One bookkeeping detail: the Key Decisions gate row was written with a placeholder for the run record, filled in with the real run numbers after verify-full, before the Task 2 commit. The plan's "Do not commit" context line was overridden by the orchestrator's dispatch, which asks for per-task commits.

## Known Stubs

None.

## Threat Flags

None. No new network, auth or file surface; the plan only edits specs and records.

## Self-Check: PASSED

- FOUND commits: 5af889d, d36b4a1
- Acceptance greps: `version: 4,` x2 and `version: 2,` x1 in autosave.spec.ts, `version: 3` fixtures absent; `blob.version`/`epoch`/`nextEntityId` assertions present once each; changelog "save format" and "older version" present; both new Key Decisions rows present once; no "instead of" in the Phase 11 gate row; the v2.1 pending marker is gone; the mix32 and world-lifecycle Decision cells are intact.

---
phase: 11-minimal-save-schema-v3
verified: 2026-11-14T15:00:00Z
status: passed
score: 4/4 roadmap success criteria verified (plan must-haves for 11-01 to 11-04 all accounted for)
covered_files:
  - ".planning/phases/11-minimal-save-schema-v3/11-01-PLAN.md"
  - ".planning/phases/11-minimal-save-schema-v3/11-01-SUMMARY.md"
  - ".planning/phases/11-minimal-save-schema-v3/11-02-PLAN.md"
  - ".planning/phases/11-minimal-save-schema-v3/11-02-SUMMARY.md"
  - ".planning/phases/11-minimal-save-schema-v3/11-03-PLAN.md"
  - ".planning/phases/11-minimal-save-schema-v3/11-03-SUMMARY.md"
  - ".planning/phases/11-minimal-save-schema-v3/11-04-PLAN.md"
  - ".planning/phases/11-minimal-save-schema-v3/11-04-SUMMARY.md"
  - "CHANGELOG.md"
  - "src/app/game-session.ts"
  - "src/app/session/save-controller.ts"
  - "src/app/session/start-session.ts"
  - "src/app/session/world-lifecycle.ts"
  - "src/main.ts"
  - "src/persistence/autosave.ts"
  - "src/persistence/save.ts"
  - "tests/app/session/world-lifecycle.test.ts"
  - "tests/persistence/save-v3.test.ts"
covered_digest: "v4:sha256:8dce2107e92f5060978595f20962c6e5b20b2d85849b14f5615c78781a09be74"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 4/4
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 11: Minimal Save Schema v3 Verification Report

**Phase Goal:** A save records the world state of its leg anchor (the world epoch, the world counters and the next entity id) in a minimal schema v3, older saves migrate in order, and a loaded save continues the same world sequence the session that wrote it would have produced
**Verified:** 2026-11-14
**Status:** passed
**Re-verification:** Yes, regenerated against HEAD (`3c1c3c5`) after the code-review fix commits 4e93fa0 (WR-01) and 6728aa6 (WR-02), which changed `world-lifecycle.ts`, `save-controller.ts`, `start-session.ts` and `tests/app/session/world-lifecycle.test.ts`. All truths were re-checked against the current code; the previous report's warnings WR-01 and WR-02 are now closed.

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A v1 or v2 save loads, migrated in order v1 -> v2 -> v3; next autosave writes v3 adding only epoch, counters, next entity id; no combat, law or cost-basis field | VERIFIED | `src/persistence/save.ts:55` `SAVE_VERSION = 3`; `parseSave` chains `migrateV2ToV3(migrateV1ToV2(...))` for v1 and `migrateV2ToV3` for v2; `SaveV3Schema` is a strict object of the v2 shape plus `epoch` and `nextEntityId` only. `save-v3.test.ts` (47 tests, re-run in Docker by this verifier) pins that a v3 blob carrying `legalStatus`, `kills`, `cargoCostBasis`, `worldSeed` or `entities` is corrupt, and the step and chain goldens (`v3-from-v1-*`, `v3-from-v2-phase10-inflight`). `snapshotForSave` (`autosave.ts`) writes epoch and `nextEntityId` on every save. |
| 2 | A v3 save opened by an older build stays an inert future-version save (bytes never cleared); a corrupt v3 blob goes to `autosave.corrupt`, never read back | VERIFIED | `parseSave` future-version check runs before any destructive step; `src/main.ts` keeps the future/corrupt routing. `save-v3.test.ts` "older builds keep a v3 save inert" classifies docked, in-flight, worst-case and padded worst-case v3 blobs with a frozen copy of the v2 build's classifier as `future-version`; epoch 0xffffffff is corrupt. e2e specs (autosave, save-load) use version 4 as the newer-build blob and assert byte identity; verify-full exited 0 on the final code (recorded in `.planning/PROJECT.md`, "Phase 11 gate:"). |
| 3 | Worst-case v3 save, every field at its bound, encodes under 65,536 chars, proven by a test that builds it | VERIFIED | `tests/persistence/save-v3.test.ts` worst-case test (measured 40427 characters, schema-valid, non-vacuous); passes in this verifier's Docker run. |
| 4 | SAVE-08 stage 1: v3 save holds no entity, only epoch, counters and next entity id of its leg anchor; cold Continue and warm Load restore the saved epoch (not 0); same world seed as the writing session; world at anchor hashes identically to a fresh arrival; in-flight save resumes at the anchor | VERIFIED | Both restore paths now go through one shared function `restoreWorldAnchor(lifecycle, savedEpoch, marketSeed, inFlight)` (`world-lifecycle.ts`, end of file): `resetForRestore(savedEpoch)`, then `resume(marketSeed)` only when in flight and a seed exists; no-op for an absent lifecycle. Warm Load calls it in `save-controller.ts:447` with `saved.epoch`, `nextSeed`, `mode !== "docked"`, inside the synchronous install block after the market seed install. Cold Continue calls it in `start-session.ts:465` with `restore.epoch`, `ctx.core.marketSeed`, `restoredInFlight` (defined at `:426`), after the seed install at `:449-457`. Behaviourally unchanged from the pre-refactor sequence (diff 947e650..HEAD read in full). `anchorNextEntityId` is read right after `populate` in `begin` and `resume`, cleared by `end` and `resetForRestore`; docked saves write 101, in-flight saves write the anchor counter. Real-path tests: epoch-5 in-flight Load gives `worldSeedFor(seed,5)`, equal `snapshotWorld` and `hashWorld` to a fresh arrival, counter equal to saved `nextEntityId`; docked Load at epoch 5 then launch gives epoch 6; v2 save restores at epoch 0 and launches at epoch 1. The cold-Continue `coldContinue` test helper now calls the real `restoreWorldAnchor`, and a unit test covers docked, in-flight, missing-seed and absent-lifecycle cases. D-07 vector pinned (`worldSeedFor(marketSeedForSystem("g0-s7"),1) = 0x2b4e037c`). Strict schema carries no entity; `tests/guards/entity-id-scope.test.ts` green. |

**Score:** 4/4 truths verified; 0 behavior-unverified; 0 overrides.

### Plan must-haves (11-01 to 11-04)

All truths in the four PLAN frontmatters were re-checked: leg-anchor counter semantics and refused begin/resume/throwing populator (11-01); `SAVE_VERSION` 3, strict `SaveV3Schema`, ordered chain, `encodeSave` writing version 3 first, `snapshotForSave` counters, no world key in `SaveInputs` (11-02); restore epoch at both paths, edge predicates, writer gate, older-build classification, worst case (11-03); e2e specs, CHANGELOG compatibility note, PROJECT.md Key Decisions rows `Save schema v3 fields:` and `Phase 11 gate:` (lines 247-248), and the verify-full gate (11-04).

Review-fix changes after plan completion, checked against the plan intent:

- WR-01 (4e93fa0): `begin` now refuses at `epoch >= MAX_LIVE_EPOCH` (`MAX_EPOCH - 1` = 0xfffffffe = `MAX_SAVE_EPOCH`), so every live epoch is a writable v3 epoch. Tests: last legal `begin` goes from `MAX_SAVE_EPOCH - 1` to `MAX_SAVE_EPOCH`, the next changes nothing, and `begin` from `resetForRestore(MAX_SAVE_EPOCH)` refuses. This tightens, not weakens, plan 11-03's accepted limit.
- WR-02 (6728aa6): behavioural coverage of the cold-Continue re-anchor now exists through the shared function and the helper that calls it; the source-text test pins only the wiring (one `restoreWorldAnchor(` call carrying `restore.epoch` and `restoredInFlight`, no direct `resetForRestore` or `resume` call, no `resetForRestore(0)`).

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/persistence/save.ts` | VERIFIED | SaveV3Schema, migrateV2ToV3, parseSave chain, `MAX_SAVE_EPOCH = 0xfffffffe`, `FRESH_WORLD_NEXT_ENTITY_ID`; wired into main.ts, autosave, controller |
| `src/persistence/autosave.ts` | VERIFIED | `snapshotForSave` takes the lifecycle counters; writer gate `isEncodedSaveValid`; the stale-comment note (review IN-03) is gone, the docblock now describes D-05 |
| `src/app/session/world-lifecycle.ts` | VERIFIED | `anchorNextEntityId`, `MAX_LIVE_EPOCH`, `resetForRestore(epoch)`, `restoreWorldAnchor` |
| `src/app/session/save-controller.ts`, `start-session.ts` | VERIFIED | Both restore paths call `restoreWorldAnchor` with the saved epoch |
| `tests/golden/save/` | VERIFIED | `v2-phase10-inflight.json` (real v2 writer output), three `v3-from-*` goldens |
| `tests/persistence/save-v3.test.ts` | VERIFIED | 47 tests pass |
| `tests/app/session/world-lifecycle.test.ts` | VERIFIED | 39 tests pass |
| `CHANGELOG.md`, `.planning/PROJECT.md` | VERIFIED | Rows and notes present |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| start-session (cold Continue) | `restoreWorldAnchor(..., restore.epoch, ...)` | WIRED | `start-session.ts:465`, import at `:45` |
| save-controller (warm Load) | `restoreWorldAnchor(..., saved.epoch, ...)` | WIRED | `save-controller.ts:447`, import at `:53` |
| `restoreWorldAnchor` | `resetForRestore` then `resume` | WIRED | `world-lifecycle.ts` end of file |
| snapshotForSave | lifecycle counters | WIRED | `autosave.ts`; session passes the live lifecycle |
| parseSave | migrate chain | WIRED | `save.ts` v1 and v2 branches |
| main.ts boot | SaveV3 / future-version / corrupt routing | WIRED | `main.ts` |

### Data-Flow Trace (Level 4)

| Artifact | Variable | Source | Real data | Status |
|----------|----------|--------|-----------|--------|
| saved `epoch` | `counters.epoch` | lifecycle epoch, bumped by `begin` | Yes | FLOWING |
| saved `nextEntityId` | `anchorNextEntityId` | `created.store.nextId` after `populate` | Yes (101 today) | FLOWING |
| restored epoch | `restore.epoch` / `saved.epoch` | parsed `SaveV3` | Yes | FLOWING |

`nextEntityId` is write-only today (nothing reads it back); intended per D-01/D-03 until Phase 12 (review IN-01).

### Behavioral Spot-Checks (Docker, targeted)

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Persistence, session, order and id-scope suites on HEAD | `docker compose run --rm test npx vitest run tests/app/session tests/persistence tests/app/session-order.test.ts tests/guards/entity-id-scope.test.ts --coverage.enabled=false` | 20 files, 444 tests passed | PASS |
| Full gate on the final code | `docker compose run --rm verify-full` (not rerun here; recorded in `.planning/PROJECT.md` "Phase 11 gate:") | exit 0; 142 Vitest files / 2,725 tests, 129 Chromium specs, 2 seams specs | PASS (recorded) |

### Probe Execution

SKIPPED: no probes declared by the phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SAVE-07 | 11-01, 11-02, 11-03, 11-04 | Minimal schema v3 (epoch, counters, next entity id), ordered migration, older builds treat v3 as inert future-version, worst case under 65,536 | SATISFIED | Criteria 1 to 3 above. REQUIREMENTS.md line 24 `[x]`, traceability row line 68 "Complete". |

No orphaned requirements: REQUIREMENTS.md maps only SAVE-07 to Phase 11 (SAVE-08 is a staged check here, completed in Phase 12).

### Anti-Patterns Found

None blocking. No `TBD`, `FIXME` or `XXX` in the modified source or test files (rg over the seven covered source and test files). No stubs; no combat, law or cost-basis fields in `save.ts`.

### Remaining Notes (non-blocking, informational)

- Review IN-01: `nextEntityId` is not cross-validated against `mode` and is never consumed (deliberate until Phase 12).
- Review IN-02: the in-flight snapshot falls back to 101 when no anchor world exists (near-unreachable).
- Review IN-04: restore paths ignore the `resetForRestore` boolean (documented D-04; `begin`'s new bound keeps the live epoch inside the schema domain).
- No browser spec drives a non-zero-epoch v3 Continue end to end; the behaviour is covered by the real `restoreWorldAnchor` unit tests, the real-path warm Load tests, and the existing save-load specs at epoch 0. Judged sufficient by the phase's own plan must-haves.
- 11-REVIEW-FIX.md marks both fixes "requires human verification"; this verifier read the diff and re-ran the affected suites, and verify-full passed on the final code.

### Human Verification Required

None.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all plan must-haves are met in the code at HEAD; targeted Docker tests pass (444 tests) and verify-full exited 0 on the final code. The previous warnings WR-01 and WR-02 are closed by the review fixes.

---

_Verified: 2026-11-14_
_Verifier: Claude (gsd-verifier)_

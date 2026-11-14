---
phase: 11-minimal-save-schema-v3
verified: 2026-11-14T13:00:00Z
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
covered_digest: "v4:sha256:be3858cba922d42d06bd73d2856e96626b9308ca856842a51c1c4182d35aeab9"
behavior_unverified: 0
overrides_applied: 0
---

# Phase 11: Minimal Save Schema v3 Verification Report

**Phase Goal:** A save records the world state of its leg anchor (the world epoch, the world counters and the next entity id) in a minimal schema v3, older saves migrate in order, and a loaded save continues the same world sequence the session that wrote it would have produced
**Verified:** 2026-11-14
**Status:** passed (two non-blocking review warnings carried, see Warnings)
**Re-verification:** No, initial verification

## Goal Achievement

### Observable Truths (ROADMAP success criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A v1 or v2 save loads, migrated in order v1 -> v2 -> v3; next autosave writes v3 adding only epoch, counters, next entity id; no combat, law or cost-basis field | VERIFIED | `src/persistence/save.ts:511` `migrateV2ToV3(migrateV1ToV2(...))`, `:515` v2 through `migrateV2ToV3`, `:55` `SAVE_VERSION = 3`. `SaveV3Schema` (`:303-312`) is a `z.strictObject` of `SaveV2Schema.shape` plus `epoch` and `nextEntityId` only. Tests: a v3 blob carrying `legalStatus`, `kills`, `cargoCostBasis`, `worldSeed` or `entities` is corrupt; a v1/v2 blob carrying `epoch` is corrupt; goldens `v3-from-v1-phase4/5.json` and `v3-from-v2-phase10-inflight.json` pin each step and the chain. `snapshotForSave` (`autosave.ts:155-159`) writes epoch and nextEntityId on every save. |
| 2 | A v3 save opened by an older build stays an inert future-version save (bytes never cleared); a corrupt v3 blob goes to `autosave.corrupt`, never read back | VERIFIED | `parseSave` future-version check (`save.ts:473-495`) runs before any destructive step; `src/main.ts:220-224` keeps the future/corrupt routing. `save-v3.test.ts` "older builds keep a v3 save inert": a frozen copy of the v2 build's classifier (`41aaf0e`) calls docked, in-flight, worst-case and padded worst-case blobs `future-version`; version 4 (including oversized, no `JSON.parse`) is future-version here; epoch 0xffffffff is corrupt. e2e specs (autosave, save-load) use version 4 as the future blob and assert byte-identity (`autosave.spec.ts:810,1042`, `save-load.spec.ts:491,822`); verify-full passed in 11-04. |
| 3 | Worst-case v3 save, every field at its bound, encodes under 65,536 chars, proven by a test that builds it | VERIFIED | `tests/persistence/save-v3.test.ts:620` "encodes under MAX_SAVE_CHARS (measured 40427 characters), is schema-valid, and is not vacuous" (re-run by this verifier, passes; fixture asserted at least 38,000 chars). |
| 4 | SAVE-08 stage 1: v3 save holds no entity, only epoch, counters and next entity id of its leg anchor; cold Continue and warm Load restore the saved epoch (not 0); same world seed as the writing session; world at anchor hashes identically to a fresh arrival; in-flight save resumes at the anchor | VERIFIED (see WR-02 note) | Warm Load: `save-controller.ts:448` `resetForRestore(saved.epoch)`, then `resume` for non-docked. Cold Continue: `start-session.ts:462-464` `resetForRestore(restore.epoch)` after the market seed install (`:449-457`) and before `resume` (`:469-471`). No `resetForRestore(0)` remains. `world-lifecycle.ts:144-175` `anchorNextEntityId` is read right after `populate` in `begin`/`resume`, cleared by `end` and `resetForRestore`. Docked saves write 101 (`autosave.ts:157-159`); in-flight writes the anchor counter, never the live one. Real-path tests in `world-lifecycle.test.ts` "load" block: epoch-5 in-flight Load gives seed `worldSeedFor(seed,5)`, `snapshotWorld` and `hashWorld` equal to the fresh arrival's, counter equal to saved `nextEntityId`; populator-spawn variant makes the hash non-vacuous; docked Load at epoch 5 then launch gives epoch 6; v2 save restores at epoch 0 and launches at epoch 1. D-07 vector pinned in `save-v3.test.ts:71-77` (`worldSeedFor(marketSeedForSystem("g0-s7"),1) = 0x2b4e037c`). No entity or id is persisted: schema is strict, `tests/guards/entity-id-scope.test.ts` green. |

**Score:** 4/4 truths verified; 0 behavior-unverified; 0 overrides.

### Plan must-haves (11-01 to 11-04)

All truths in the four PLAN frontmatters were checked against code and tests: leg-anchor counter semantics and refused begin/resume/throwing populator (11-01); `SAVE_VERSION` 3, strict `SaveV3Schema`, ordered chain, `encodeSave` writing version 3 first, `snapshotForSave` counters, no world key in `SaveInputs` (11-02); restore epoch at both paths, edge predicates, writer gate, older-build classification, worst case (11-03); e2e specs, CHANGELOG compatibility note (`CHANGELOG.md:23-27`), PROJECT.md Key Decisions rows `Save schema v3 fields:` and `Phase 11 gate:` (`.planning/PROJECT.md:247-248`), and the verify-full gate (11-04, reported green with 2723 unit and 129 e2e; not rerun per instruction).

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/persistence/save.ts` | VERIFIED | SaveV3Schema, migrateV2ToV3, parseSave chain, MAX_SAVE_EPOCH, FRESH_WORLD_NEXT_ENTITY_ID; wired into main.ts, autosave, controller |
| `src/persistence/autosave.ts` | VERIFIED | `snapshotForSave` takes `SaveWorldCounters`; writer gate `isEncodedSaveValid` |
| `src/app/session/world-lifecycle.ts` | VERIFIED | `anchorNextEntityId`, `resetForRestore(epoch)` |
| `src/app/session/save-controller.ts`, `start-session.ts` | VERIFIED | Both restore paths re-anchor at saved epoch |
| `tests/golden/save/` | VERIFIED | `v2-phase10-inflight.json` (real v2 writer output), three `v3-from-*` goldens |
| `tests/persistence/save-v3.test.ts` | VERIFIED | 47 tests pass |
| `CHANGELOG.md`, `.planning/PROJECT.md` | VERIFIED | Rows and notes present |

### Key Link Verification

| From | To | Status | Details |
|------|----|--------|---------|
| start-session (cold Continue) | `worldLifecycle.resetForRestore(restore.epoch)` | WIRED | `start-session.ts:463` |
| save-controller (warm Load) | `worldLifecycle.resetForRestore(saved.epoch)` | WIRED | `save-controller.ts:448` |
| snapshotForSave | lifecycle counters | WIRED | `autosave.ts:155-159`; session passes live lifecycle |
| parseSave | migrate chain | WIRED | `save.ts:511,515` |
| main.ts boot | SaveV3 / future-version / corrupt routing | WIRED | `main.ts:45,176,220-224` |

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
| Persistence, session, order and id-scope suites | `docker compose run --rm test npx vitest run tests/persistence tests/app/session tests/app/session-order.test.ts tests/guards/entity-id-scope.test.ts --coverage.enabled=false` | 20 files, 442 tests passed | PASS |
| Worst-case, older-build, future-version tests | `... vitest run tests/persistence/save-v3.test.ts --reporter=verbose` | all pass; measured 40427 chars | PASS |

### Probe Execution

SKIPPED: no probes declared by the phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SAVE-07 | 11-01, 11-02, 11-03, 11-04 | Minimal schema v3 (epoch, counters, next entity id), ordered migration, older builds treat v3 as inert future-version, worst case under 65,536 | SATISFIED | Criteria 1 to 3 above. REQUIREMENTS.md line 24 `[x]`, traceability row line 68 "Complete". |

No orphaned requirements: REQUIREMENTS.md maps only SAVE-07 to Phase 11 (SAVE-08 is a staged check here, completed in Phase 12).

### Anti-Patterns Found

None blocking. No `TBD`, `FIXME` or `XXX` in the modified source files. No stubs; no combat, law or cost-basis fields in `save.ts`.

### Warnings (non-blocking, from 11-REVIEW.md, confirmed by this verifier)

- **WR-01 (confirmed against code):** `world-lifecycle.ts:152` guards `epoch >= MAX_EPOCH` (0xffffffff), so `begin` from the legal saved epoch 0xfffffffe bumps to 0xffffffff, a value the v3 writer (`MAX_SAVE_EPOCH = 0xfffffffe`) then refuses; autosave would report `invalid-save` for the rest of the session. Reaches only via about 4.3e9 launches or a hand-edited v3 blob with epoch 4294967294. The previous good blob is untouched, so nothing is corrupted. Plan 11-03's must-have explicitly records this as an accepted, untested limit, so it does not violate a must_have. Suggested fix: guard `begin` at `MAX_EPOCH - 1` and add a test driving `begin` from `MAX_SAVE_EPOCH`.
- **WR-02 (confirmed):** The cold Continue re-anchor is verified here by reading the code (`start-session.ts:462-464`, correct order, `restore.epoch`) and by a source-text order test plus a `coldContinue` helper that replicates the sequence. No test drives the real `startSession` with a non-zero-epoch v3 restore, and no e2e fixture uses a non-zero epoch. Warm Load is exercised through the real `loadFromSave`. Treated as non-blocking per the caller's instruction because the plan must-haves define the cold check as exactly this sequence; the verifier judges the wiring correct on direct reading. Should the owner want behavioural proof, add the browser spec the review proposes (epoch 5 fixture, Continue, read `window.__wegolite.sim.epoch`).
- **Info (review IN-01 to IN-04):** `nextEntityId` is not cross-validated against `mode` and is never consumed (deliberate until Phase 12); in-flight snapshot falls back to 101 when no anchor world exists (near-unreachable); one stale comment in `autosave.ts:83-85`; restore paths ignore the `resetForRestore` boolean (documented D-04).

### Human Verification Required

None.

### Gaps Summary

No gaps. All four ROADMAP success criteria and all plan must-haves are met in the code; targeted Docker tests pass (442 tests). verify-full was not rerun (reported green in plan 11-04). WR-01 and WR-02 are recommended follow-ups, not blockers.

---

_Verified: 2026-11-14_
_Verifier: Claude (gsd-verifier)_

---
phase: 13-views-lasers-and-shields
plan: 06
subsystem: persistence
tags: [save-format, migration, laser-mounts, v4, zod, goldens]
requires:
  - phase: 13-views-lasers-and-shields
    provides: "13-02 shared view and mount vocabulary (LaserMounts, DEFAULT_LASER_MOUNTS, LASER_KEYS, NO_LASER, isMountKey)"
provides:
  - "PlayerProfile.laserMounts, with newProfile() starting on the Cobra's fore pulse laser"
  - "Save format v4: SAVE_VERSION 4, SaveV3Schema frozen at literal 3, SaveV4Schema with a strict laserMounts object, migrateV3ToV4"
  - "Ordered chain v1 -> v2 -> v3 -> v4 in parseSave; v5 is an inert future-version blob"
  - "Every EQ_WEAPON_* key refused inside equipment (read and write mode)"
  - "SaveInputs.laserMounts, snapshotForSave and profileFromSave on v4"
affects: [13-07, 13-08, 13-11, 13-12, 13-15]
requirements-completed: [CBT-05]
actuals:
  tokens: 21500
  tasks: 2
  commits: 2
plan_head_before: ef6a14a188bde37d761596d61c3df084718bc2fe
plan_head_after: a982081048aef2215b166726cc516bbcaacf3718
tech-stack:
  added: []
  patterns:
    - "Frozen historical schema literal plus one pure total non-mutating migration per version step"
    - "Strict z.enum per mount and a z.strictObject of the four facings, with a semantic validator that runs on read and write"
    - "Checked-in v4 goldens generated once from the chain and compared structurally in tests"
key-files:
  created:
    - tests/persistence/save-v4.test.ts
    - tests/golden/save/v4-from-v1-phase4.json
    - tests/golden/save/v4-from-v1-phase5.json
    - tests/golden/save/v4-from-v2-phase10-inflight.json
  modified:
    - src/sim/player/profile.ts
    - src/persistence/save.ts
    - src/persistence/autosave.ts
    - src/app/game-session.ts
    - src/main.ts
    - CHANGELOG.md
    - tests/persistence/save-v3.test.ts
    - tests/persistence/save-v2.test.ts
    - tests/persistence/save.test.ts
    - tests/persistence/save-golden.test.ts
    - tests/persistence/autosave.test.ts
    - tests/sim/player-profile.test.ts
    - tests/app/session/save-controller.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - tests/e2e/helpers/save-fixtures.ts
    - tests/e2e/save-load.spec.ts
    - tests/e2e/autosave.spec.ts
key-decisions:
  - "v3 migrates to the stock fit (fore pulse, EQ_WEAPON_NONE elsewhere), identical to newProfile(), so a migrated save gains and loses nothing against the stock Cobra"
  - "Laser keys live only in laserMounts: all six EQ_WEAPON_* keys (four lasers, NONE, THARGOID) are in FORBIDDEN_EQUIPMENT, so a laser inside equipment is double encoding and corrupt in both modes"
  - "Each of v1, v2, v3 chains through every later step in order; v4 parses directly; any other version at or below 4 is corrupt, above 4 is future-version"
coverage:
  - id: D1
    description: "A new game starts with the Cobra's default fit: a pulse laser fore and no laser on aft, port or starboard"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/persistence/save-v4.test.ts#a new game carries the Cobra's stock fit"
        status: pass
    human_judgment: false
  - id: D2
    description: "A v3 save (and v1, v2) migrates through the ordered chain to the same default mounts, with credits and every other field unchanged"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/persistence/save-v4.test.ts#the ordered chain v1 -> v2 -> v3 -> v4 against the checked-in goldens / the v3 to v4 step"
        status: pass
    human_judgment: false
  - id: D3
    description: "Laser mounts survive encodeSave, parseSave and profileFromSave"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/persistence/save-v4.test.ts#a beam laser on aft survives encodeSave, parseSave and profileFromSave"
        status: pass
    human_judgment: false
  - id: D4
    description: "v3 stays frozen at literal 3; a version 5 blob is an inert future-version save and a v3 build treats a v4 blob as inert"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/persistence/save-v4.test.ts#classification: future versions stay inert / older builds keep a v4 save inert"
        status: pass
    human_judgment: false
  - id: D5
    description: "A laser key inside equipment, an unknown, null or missing mount, or an extra facing is corrupt (T-13-10, T-13-11)"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/persistence/save-v4.test.ts#v4 refusals (T-13-10, T-13-11): a forged mount is corrupt"
        status: pass
    human_judgment: false
  - id: D6
    description: "The worst-case v4 save (every field at its maximum, four military lasers) is 40,583 characters, under the 65,536 cap (T-13-12)"
    requirement: CBT-05
    verification:
      - kind: unit
        ref: "tests/persistence/save-v4.test.ts#worst-case v4 save"
        status: pass
    human_judgment: false
duration: 35min
completed: 2026-11-15
status: complete
---

# Phase 13 Plan 06: Laser Mounts and the v3 to v4 Save Bump Summary

**Laser mounts persist: `PlayerProfile.laserMounts` starts on the Cobra's fore pulse laser, and the save format moves from v3 to v4 through one ordered, golden-pinned step that older saves and older builds both handle safely.**

## Performance

- **Duration:** about 35 min (2026-11-15), of which about 10 min was the `verify` gate
- **Tasks:** 2 (1 tracer, 1 TDD)
- **Files:** 4 created, 17 modified (src: 5, CHANGELOG: 1, tests: 11 modified plus the new v4 test and three goldens)

## Accomplishments

- `PlayerProfile.laserMounts` is a required field; `newProfile()` returns its own copy of `DEFAULT_LASER_MOUNTS`, and `profileFromSave` copies the saved mounts so a restored profile never shares an object with the parsed save.
- `save.ts` freezes `SaveV3Schema` at `version: z.literal(3)`, sets `SAVE_VERSION = 4`, and adds `SaveV4Schema` (every v3 field plus a required `laserMounts` strict object of four `z.enum` mounts), the `SaveV4` type and the pure, total, non-mutating `migrateV3ToV4`, which writes a fresh copy of the default mounts. `parseSave` chains v1, v2 and v3 through every later step in order and parses v4 directly; `validateSaveSemantics`, `isEncodedSaveValid` and `encodeSave` are on v4.
- `FORBIDDEN_EQUIPMENT` now covers all six `EQ_WEAPON_*` keys, so a laser inside `equipment` is double encoding and corrupt in read and write mode, even if a catalogue ever allow-listed the key. `validateSaveSemantics` also checks every facing with `isMountKey`, so the writer gate stays honest for a hand-built value.
- `snapshotForSave` passes the profile's mounts into `SaveInputs.laserMounts`; `autosave.ts`, `game-session.ts` and `main.ts` moved from `SaveV3` to `SaveV4`.
- `save-v4.test.ts` (56 cases) pins the round trip, the new-game default, the chain against three checked-in v4 goldens (Phase 4 v1, Phase 5 v1 with every optional field, the captured Phase 10 v2 in-flight blob), the no-value-gained-or-lost property, non-mutation, the future-version rule, the refusal table, and the worst case at 40,583 characters (the v3 worst case was 40,550).
- A v3 build classifies a v4 blob, including the padded worst case, as future-version through a verbatim transcription of its sniff and post-parse check, so it keeps the blob untouched.
- CHANGELOG `### Changed` entry with the explicit **Compatibility** note, in the style of the existing save-format entry.

## Task Commits

1. **Task 1: Laser mounts from a new profile through a v4 save and back (tracer)** - `94e101f` (feat)
2. **Task 2: Ordered chain, goldens, worst-case size, future version, semantic refusals and the compatibility note** - `a982081` (test)

**Plan metadata:** recorded in the final docs commit.

## Files Created/Modified

- `src/sim/player/profile.ts` - `laserMounts` field and the new-game default
- `src/persistence/save.ts` - v4 schema, `migrateV3ToV4`, chain, forbidden equipment, encoder inputs
- `src/persistence/autosave.ts` - snapshot and restore carry the mounts
- `src/app/game-session.ts`, `src/main.ts` - `SaveV4` type references
- `tests/persistence/save-v4.test.ts` and `tests/golden/save/v4-from-*.json` - the v4 contract and goldens
- `CHANGELOG.md` - laser-mount save format entry with Compatibility note

## Decisions Made

- The three `v4-from-*` goldens were generated once, deliberately: each is the matching v3 golden with `version` 4 and the stock mounts appended, applied by a one-off script and reviewed by hand against the migration rule, then compared structurally (`toStrictEqual`) with the chain output. They are regression snapshots, never regenerated blindly.
- The older-build future-version classifier and the worst-case save moved from `save-v3.test.ts` into `save-v4.test.ts`, because both measure the current writer; v3's own tests keep the bounds, the epoch and counter cases and the world-seed cross-check vector.
- `STATE.md` records the three key decisions above.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing tests and fixtures outside the plan's file list moved to v4**
- **Found during:** Task 1 (typecheck and the full Vitest run after the schema change)
- **Issue:** `SaveInputs.laserMounts` is required and the current version is now 4, so type errors and assertions that pinned version 3 or version 4 as "future" appeared in `tests/persistence/save-golden.test.ts`, `tests/persistence/save-v2.test.ts`, `tests/app/session/save-controller.test.ts`, `tests/app/session/world-lifecycle.test.ts`, `tests/e2e/helpers/save-fixtures.ts`, `tests/e2e/save-load.spec.ts` and `tests/e2e/autosave.spec.ts`, none of which the plan listed. The e2e specs that wrote a "future" version 4 blob now write version 5, and `save-load.spec.ts` expects a version 4 manual blob.
- **Fix:** supplied `laserMounts` in fixtures and expected values; chained the v2 and v1 expectations through `migrateV3ToV4`; added `laserMounts` to the key allow-lists in `world-lifecycle.test.ts`; deleted `laserMounts` where that test rebuilds a v2 blob; changed the future-version fixtures to version 5. No assertion was weakened: each now pins the v4 behaviour.
- **Files modified:** the seven files above
- **Verification:** full `docker compose run --rm test` (162 files, 3,267 tests pass), `lint`, `typecheck`, and `verify`
- **Commit:** `94e101f`

**2. [Rule 3 - Blocking] `v3` tests' unused imports and moved blocks cleaned up**
- **Found during:** Task 1 lint
- **Issue:** moving the worst-case and older-build blocks out of `save-v3.test.ts` left unused imports.
- **Fix:** removed the unused imports.
- **Commit:** `94e101f`

**Total deviations:** 2 auto-fixed (both Rule 3). **Impact:** none on scope; the extra test files are the direct consequence of the owner-settled version bump.

## Verification

- `docker compose run --rm test npx vitest run tests/persistence/ tests/sim/player-profile.test.ts tests/app/session/save-controller.test.ts tests/compliance.test.ts` - pass (9 files, 298 tests)
- `docker compose run --rm test` (full suite) - pass (162 files, 3,267 passed, 2 skipped)
- `docker compose run --rm typecheck` and `docker compose run --rm lint` - pass
- `docker compose run --rm verify` - pass (lint, typecheck, content drift, unit tests, build, e2e smoke subset: 27 Chromium tests, including `save-load.spec.ts` on the v4 blob and the version 5 future-version refusals)
- Acceptance greps: `SAVE_VERSION = 4 as const` 1, `version: z.literal(3)` 1, `laserMounts` in `profile.ts` 2

## Known Stubs

None. `profile.laserMounts` has no purchase path yet; plan 13-11 adds laser purchase and replacement, and that is not a stub in this plan's scope.

## Threat Flags

None. The only new trust-boundary surface is `laserMounts` in the save blob, covered by T-13-10 (strict enums and strict object), T-13-11 (`FORBIDDEN_EQUIPMENT`) and T-13-12 (size cap and the worst-case test).

## Self-Check: PASSED

- `src/persistence/save.ts`, `src/sim/player/profile.ts`, `tests/persistence/save-v4.test.ts` and the three `tests/golden/save/v4-from-*.json` files exist.
- Commits `94e101f` and `a982081` are ancestors of HEAD; the measured commit count since the plan ledger is 2.

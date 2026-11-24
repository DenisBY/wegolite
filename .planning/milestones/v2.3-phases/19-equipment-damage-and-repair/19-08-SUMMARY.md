---
phase: 19-equipment-damage-and-repair
plan: 08
subsystem: persistence
tags: [save, schema-v5, damaged-equipment, allow-lists, corrupt-classification, breaking-change]
requires:
  - phase: 19-equipment-damage-and-repair
    provides: "19-01 damageProbability, 19-03 PlayerProfile.damagedEquipment and DAMAGEABLE_EQUIPMENT_KEYS, 19-06 single-version reader and shared builders, 19-07 fixtures from the builders"
provides:
  - "SAVE_VERSION 5, SaveV5Schema, SaveV5, MAX_SAVE_DAMAGED_EQUIPMENT = 16"
  - "SaveInputs.damagedEquipment and SaveAllowLists.damageableEquipment, with the shared reader/writer damaged-list semantics"
  - "equipmentAllowLists(catalogue): the F3-only equipment list and the damageable list, used by main.ts"
  - "snapshotForSave and profileFromSave carry the damaged list in damage order"
  - "tests/persistence/save-v5.test.ts (moved from save-v4.test.ts) with the v5 contract, the worst case and the v4 build classifier"
  - "PROJECT.md Key Decisions row for D-11 and superseded notes on the five older save rows and the validated line"
affects: [19-09, 19-10, 19-12, 19-14]
requirements-completed: [SAVE-09]
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: afcacdace61620c3865690cf06c2cee6beefa613
plan_head_after: e9c48f9
tech-stack:
  added: []
  patterns:
    - "One pure allow-list function (equipmentAllowLists) is the production source and the test subject, so a test proves the real lists, not a copy"
    - "A schema bound that is not a parseable save (64 + 16 keys) is named as such in its test and asserted for schema validity only"
key-files:
  created: []
  modified:
    - src/persistence/save.ts
    - src/persistence/autosave.ts
    - src/main.ts
    - src/app/game-session.ts
    - tests/helpers/save-builders.ts
    - tests/persistence/save-v5.test.ts
    - tests/persistence/save.test.ts
    - tests/persistence/save-v3.test.ts
    - tests/persistence/autosave.test.ts
    - tests/app/session/world-lifecycle.test.ts
    - CHANGELOG.md
    - .planning/PROJECT.md
key-decisions:
  - "Save schema v5 adds the damaged-equipment list with no migration (Phase 19, D-11): every older save is corrupt, never unreadable, so saving is never locked out"
  - "MAX_SAVE_DAMAGED_EQUIPMENT = 16 plus the combined 64-key rule keeps the worst case under the cap"
  - "main.ts no longer admits every catalogue key in equipment: equipmentAllowLists limits it to the F3-installable keys plus the two read-mode aliases (D-03)"
status: complete
---

# Phase 19 Plan 08: Save schema v5 with the damaged-equipment list Summary

**Saves are schema v5: a required `damagedEquipment` list (at most 16 keys, damage order kept) shares one reader/writer stage with a damageable allow-list built by the pure `equipmentAllowLists`; every older save (format 1 to 4) is `corrupt`, and the worst case at the schema maxima encodes to 46,796 characters under the 65,536 cap.**

## Performance

- **Tasks:** 2 of 2 (Task 1 the tracer: one damaged docking computer through snapshot, encode, parse and restore)
- **Commits:** two code commits, measured from the plan base `afcacda` (`git rev-list --count`); the SUMMARY commit follows.
- **Estimate vs actual:** about 14,000 tokens (chars/4 over the realized diff, `.planning/PROJECT.md` and `CHANGELOG.md` included) against an estimate of 80,000.

## Task Commits

| Task | Commit  | Files |
| ---- | ------- | ----- |
| 1    | 1f3a474 | `src/persistence/save.ts`, `autosave.ts`, `src/main.ts`, `src/app/game-session.ts`, `tests/helpers/save-builders.ts`, `tests/persistence/save-v5.test.ts` (git mv from save-v4), `save.test.ts`, `save-v3.test.ts`, `autosave.test.ts`, `tests/app/session/world-lifecycle.test.ts`, `CHANGELOG.md` |
| 2    | e9c48f9 | `tests/persistence/save-v5.test.ts`, `src/persistence/save.ts` (MAX_SAVE_CHARS doc), `.planning/PROJECT.md` |

## What was built

- **Schema (D-11):** `SAVE_VERSION = 5`; `SaveV5Schema` is the v4 strict object plus a required `damagedEquipment` (array of 1 to 64 character strings, at most `MAX_SAVE_DAMAGED_EQUIPMENT`). `version` stays the first key of the blob; `parseSave` keeps its one branch (a v4 blob reaches the corrupt branch by the 19-06 rule, no read-path change).
- **SAVE-09 semantics:** `validateSaveSemantics` rejects a damaged key that repeats, is not in `allow.damageableEquipment`, is installed, or is in `FORBIDDEN_EQUIPMENT`, and rejects `equipment.length + damagedEquipment.length > 64`; the reader and the writer gate (`isEncodedSaveValid`) share it.
- **D-03:** `equipmentAllowLists(catalogue)` returns `equipment` (catalogue keys in `VISIBLE_EQUIPMENT_KEYS` that `FORBIDDEN_EQUIPMENT` does not reject: the five F3 keys and the two read-mode aliases) and `damageableEquipment` (catalogue keys in `DAMAGEABLE_EQUIPMENT_KEYS`). `main.ts` spreads it into the boot allow-lists instead of admitting every catalogue key. `save.ts` names no equipment key literal. The alias constants gained no new use (the alias tripwire guard passes).
- **Autosave:** `snapshotForSave` writes `[...profile.damagedEquipment]`; `profileFromSave` copies `[...save.damagedEquipment]`, replacing 19-03's empty list. No new write path.
- **Builders:** `saveInputs` defaults `damagedEquipment: []`, `saveAllowLists` defaults `damageableEquipment` to `new Set(DAMAGEABLE_EQUIPMENT_KEYS)`; no browser spec, `save-fixtures.ts`, `save-controller`, `station-controller` or `restore-drift` file changed.
- **Tests:** `save-v4.test.ts` moved to `save-v5.test.ts` with `git mv`; version pins and encoded-prefix checks use `SAVE_VERSION`, future-version cases use `SAVE_VERSION + 1`; the v4 build's future-version classifier is transcribed with its own `SAVE_VERSION_V4 = 4` ("older builds keep a v5 save inert").
- **Docs:** CHANGELOG breaking entry widened (format 1 to 4, format 5 records damaged equipment); PROJECT.md Key Decisions row plus superseded notes on the five rows and the validated line (7 matches of the row title).

## Measured worst case

The schema bound (64 equipment keys and 16 damaged keys of 64 six-character-escaped characters, 17 cargo entries, 17 market goods, an in-flight pose, four military lasers) encodes to **46,796 characters**, under `MAX_SAVE_CHARS` 65,536. The count is in the test name and in the `MAX_SAVE_CHARS` doc comment. The test says it is a schema bound, not a save that parses, and a companion case shows the combined 64-key rule rejects it.

## Literal sites the bump touched

- `SaveV4`/`SaveV4Schema` renamed in `save.ts`, `autosave.ts`, `main.ts`, `game-session.ts`, `autosave.test.ts`, `save-v5.test.ts` and the `world-lifecycle.test.ts` doc comment; none remains in `src` or `tests`.
- The five typed save literals of `autosave.test.ts` are `SaveV5` at `version: SAVE_VERSION` with `damagedEquipment: []`, each now also asserting `damagedEquipment` `[]` after `profileFromSave`/`restoreFromSave`.
- Pinned key sets: `save.test.ts` encodeSave key set, `world-lifecycle.test.ts` `INPUT_KEYS` and `SAVE_KEYS`.
- Allow-list literals gaining `damageableEquipment`: `autosave.test.ts` (ALLOW, MAX_ALLOW), `world-lifecycle.test.ts` (SAVE_ALLOW), `save-v3.test.ts` (ALLOW), `save-v5.test.ts` (ALLOW, GOLDEN_ALLOW).
- No `version: 4` or `"version":4` remains in `tests` outside `tests/golden/save/`; all eleven goldens classify corrupt with no edit.

## Deviations from Plan

None - plan executed as written. One small addition: `tests/persistence/save-v3.test.ts` needed the new `damageableEquipment` field in its allow-list literal (typecheck), which the plan's file list did not name.

## Verification records

- Targeted Vitest (`tests/persistence`, `world-lifecycle`, `save-controller`, `station-controller`, alias guard) and `typecheck`: green after each task.
- Plan boundary `docker compose run --rm test`: 7220 passed, 3 failed on 5 s/30 s timeouts in files this plan did not touch (`tests/guards/tools-determinism.test.ts`, `tests/sim/npc/attack-dispatch.test.ts`, `tools/oolite-ingest/convert/textures.test.ts`) while other executors ran containers on the same machine; rerun alone, all three pass (91 tests). Coverage was not separately reported for the filtered subset; the new `save.ts` branches are all exercised by `save-v5.test.ts`.
- `docker compose run --rm lint`: clean (an earlier lint run collided with the sim-purity guard's transient probe file while the full suite ran in the same worktree; rerun alone it is clean).
- Remote e2e (`autosave.spec.ts`, `save-load.spec.ts`, `probe-shape.spec.ts`): `snapshot=e9c48f9`, `35 passed`, `exit=0 elapsed=230s`.
- Remote `verify` (lint, typecheck, content drift, unit tests, build, e2e smoke subset): `snapshot=e9c48f9`, 27 e2e passed, `exit=0 elapsed=246s`.

## Self-Check

- Created and changed files exist: `src/persistence/save.ts`, `src/persistence/autosave.ts`, `tests/persistence/save-v5.test.ts` present, `tests/persistence/save-v4.test.ts` absent: FOUND.
- Commits `1f3a474` and `e9c48f9` are ancestors of HEAD: FOUND.
- Acceptance gates: no `SaveV4`/`SaveV4Schema` in `src tests`; no literal version-4 blob in `tests` outside the goldens; `damageableEquipment` absent from the four fixture files; `equipmentAllowLists(` once in `src/main.ts`; the D-11 row title appears on 7 lines of `.planning/PROJECT.md`.

## Self-Check: PASSED

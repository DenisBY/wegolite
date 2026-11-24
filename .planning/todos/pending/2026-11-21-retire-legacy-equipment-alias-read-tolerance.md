---
created: 2026-11-21T12:00:00.000Z
title: Retire the read-mode tolerance of the Phase 4 equipment aliases
source: the Phase 19 cross-AI review (Fable, L158@0d922a2) and the plan check of 19-06
area: persistence
severity: minor
files:
  - src/persistence/save.ts
  - src/persistence/autosave.ts
  - tests/persistence/save.test.ts
  - tests/persistence/autosave.test.ts
  - tests/guards/legacy-equipment-alias.test.ts
audit_acknowledged:
  milestone: v2.3
  at: 2026-11-24
---

## Problem

Phase 4 saves carried a passenger berth or a missile as one equipment key
(`EQ_PASSENGER_BERTH`, `EQ_MISSILE`) instead of the explicit counts. The reader still
accepts either key and folds it into the matching count: `validateSaveSemantics` in
`src/persistence/save.ts` tolerates it in read mode (`LEGACY_BERTH_ALIAS`,
`LEGACY_MISSILE_ALIAS`), and `profileFromSave` in `src/persistence/autosave.ts` folds it
into the profile.

Since Phase 19 (D-11) only the current save version is read, and every Phase 4 save is
now `corrupt`. The writer gate (`isEncodedSaveValid`, write mode) refuses an alias, no
writer ever emits one, and no historical golden under `tests/golden/save/` carries one.
So the tolerance accepts nothing a build ever wrote: only a hand-edited blob of the
current version can reach it. It is dead leniency, kept in Phase 19 only because
narrowing a validator is its own change (scope minimum).

## Fix

1. Delete both constants, the read-mode branch of `validateSaveSemantics` and the fold in
   `profileFromSave`.
2. Turn the read-mode alias cases of `tests/persistence/save.test.ts` and
   `tests/persistence/autosave.test.ts` into refusals, or remove them. They spell the
   catalogue keys, not the constants.
3. Drop the two alias keys from the save's `equipment` allow-list (19-08's
   `equipmentAllowLists` keeps them today), so a blob carrying one is `corrupt`.
4. No save format change: no writer ever emitted an alias, so no version bump and no
   golden change.

## Guard

`tests/guards/legacy-equipment-alias.test.ts` fails, naming this file, when:

- a non-comment `LEGACY_BERTH_ALIAS` or `LEGACY_MISSILE_ALIAS` token appears in a
  `src/**/*.ts` file other than `src/persistence/save.ts` and `src/persistence/autosave.ts`
  (a second read site, or a writer), or either file's per-constant line count differs from
  its pin (2 and 2 in each: the declaration and the `validateSaveSemantics` check in
  `save.ts`; the import and the `profileFromSave` fold in `autosave.ts`);
- the writer gate (`isEncodedSaveValid`, write mode) accepts a blob carrying either alias;
- the reader (`parseSave`, read mode) no longer accepts it, or a pinned file names neither
  constant any more (the tolerance was removed).

The commit that retires the tolerance deletes the guard and moves this todo to
`completed/`.

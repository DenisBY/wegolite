---
phase: 11-minimal-save-schema-v3
reviewed: 2026-11-14T00:00:00Z
depth: standard
files_reviewed: 22
files_reviewed_list:
  - src/app/game-session.ts
  - src/app/session/save-controller.ts
  - src/app/session/start-session.ts
  - src/app/session/world-lifecycle.ts
  - src/main.ts
  - src/persistence/autosave.ts
  - src/persistence/save.ts
  - tests/app/session-order.test.ts
  - tests/app/session/save-controller.test.ts
  - tests/app/session/world-lifecycle.test.ts
  - tests/e2e/autosave.spec.ts
  - tests/e2e/helpers/save-fixtures.ts
  - tests/e2e/save-load.spec.ts
  - tests/golden/save/v2-phase10-inflight.json
  - tests/golden/save/v3-from-v1-phase4.json
  - tests/golden/save/v3-from-v1-phase5.json
  - tests/golden/save/v3-from-v2-phase10-inflight.json
  - tests/persistence/autosave.test.ts
  - tests/persistence/save-golden.test.ts
  - tests/persistence/save-v2.test.ts
  - tests/persistence/save-v3.test.ts
  - tests/persistence/save.test.ts
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
  necessity: 0
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-11-14
**Depth:** standard (static read, no test run; Docker gate not executed by the reviewer)
**Files Reviewed:** 22
**Status:** issues_found

## Summary

Reviewed the v3 schema, the ordered v1 -> v2 -> v3 chain, the strict parse, the leg-anchor counter in `world-lifecycle.ts`, `snapshotForSave`, and the epoch re-anchor at warm Load and cold Continue.

What holds up:

- **Migration chain.** `parseSave` picks the schema by `version`. v1 goes through `migrateV1ToV2` then `migrateV2ToV3`, and v2 goes through `migrateV2ToV3`. No step is skipped. `SaveV2Schema` is now `z.literal(2)` and stays a strict object, so a v2 blob carrying `epoch` is corrupt.
- **Schema reuse.** `SaveV3Schema` reuses `SaveV2Schema.shape`. `SaveV2Schema` has no `.refine` or `.superRefine`, so no cross-field rule is dropped. All cross-field rules live in `validateSaveSemantics`, which runs on the migrated v3 object.
- **Older builds.** A v3 save is `future-version` to a v2 build, for both the size sniff and the post-parse check. The frozen-classifier test is sound.
- **Future-version ordering.** The `version > SAVE_VERSION` check still runs before any destructive step. A numeric 3.5 is `future-version` and 2.5 is `corrupt`.
- **Counter semantics.** `anchorNextEntityId` is read once, right after `populate`, in `begin` and `resume`. `end` and `resetForRestore` clear it. `begin` builds first and commits after, so a throwing populator leaves it unchanged.
- **Docked saves.** A docked save always writes 101, so the dock, purchase and pre-launch triggers all give identical bytes. The dock autosave runs before the router's `end()`, and the docked branch ignores the counter, so the ordering does not matter.
- **Restore parity.** Cold Continue and warm Load both re-anchor after the market-seed install and before the in-flight `resume`. Both use the same market seed, so epoch and world seed are identical.

No critical issues. Two warnings: a reachable inconsistency at the epoch ceiling, and a test-reliability gap on the cold Continue wiring.

## Warnings

### WR-01: `begin` can bump the epoch to 0xffffffff, a value the v3 writer then refuses forever

**File:** `src/app/session/world-lifecycle.ts:147-162` (cause), `src/persistence/save.ts:150` (bound), `src/persistence/autosave.ts:155` (writer)

**Issue:** D-04 bounds the saved epoch to 0..0xfffffffe, and the code and tests claim this is "exactly the domain `resetForRestore` accepts" and the epochs from which `begin` can still bump. That is half true. `begin` guards `epoch >= MAX_EPOCH` (0xffffffff), so from the legal saved epoch 0xfffffffe it still bumps to 0xffffffff and creates a world.

From then on every autosave (launch, arrival, dock, purchase) and every manual Save encodes `epoch: 0xffffffff`. `isEncodedSaveValid` rejects it, so `queueAutosave` returns `invalid-save`. The player sees "Save failed — progress not saved" for the rest of the session, and the last good blob stays on disk.

Reaching it needs either 4.29e9 launches or a hand-edited blob with `epoch: 4294967294`. The latter is a valid v3 save, so the parser accepts it and the next launch or arrival makes saving fail. The save is not corrupted, but the session silently loses all persistence. `tests/persistence/save-v3.test.ts:401` pins the `resetForRestore` domain but never drives `begin` from `MAX_SAVE_EPOCH`, which is why this was missed. The "false is unreachable from a valid save" claim for `resetForRestore` holds. The sibling invariant "a live session epoch is always writable" does not.

**Fix:** Make the live and saved domains one range. Either:

1. Stop `begin` one epoch earlier:

```ts
// world-lifecycle.ts begin()
epoch >= MAX_EPOCH - 1   // refuse when the bump would exceed 0xfffffffe
```

   Then `resume` and `resetForRestore` need no change. `worldSeedFor` still accepts 0xffffffff, but it is no longer reachable.

2. Or raise `MAX_SAVE_EPOCH` to 0xffffffff and let `resetForRestore` accept it. That reverses D-04, so it needs an owner decision.

Option 1 matches D-04. Add a test: `resetForRestore(MAX_SAVE_EPOCH); begin(seed)` then assert the resulting epoch is writable, or that `begin` refuses.

### WR-02: Cold Continue's epoch re-anchor has no behavioural test; the test replicates the sequence and pins source text

**File:** `tests/app/session/world-lifecycle.test.ts:652-683` (source-text order test), `tests/app/session/world-lifecycle.test.ts:1018-1032` (`coldContinue` helper); `src/app/session/start-session.ts:458-471`

**Issue:** Success criterion 3 requires cold Continue and warm Load to give identical epoch and world seed. Warm Load is exercised through the real `loadFromSave` with a logged lifecycle. Cold Continue is not exercised at all.

- The `coldContinue` helper in the test re-implements the start-session sequence (`resetForRestore(parsed.save.epoch)`, then `resume`). The warm-versus-cold parity assertion therefore compares the real warm path against a copy of the cold path.
- The only guard on the real code is `indexOf` ordering on the source text, e.g. `at("ctx.core.marketSeed =\n")` and `at("worldLifecycle?.resetForRestore(restore.epoch)")`. A refactor that keeps the strings but breaks behaviour passes. A harmless reformat fails.
- No browser spec boots a v3 save with a non-zero epoch. The e2e fixtures all use `epoch: 0`, and `dockedSaveAt` and `inFlightSaveAt` hard-code it. A regression back to `resetForRestore(0)` on the cold path would be caught only by the string assertion `not.toContain("resetForRestore(0)")`. A `restore.epoch` typo or a wrong position would not be.

**Fix:** Add one `save-load` or `tick-hook` browser spec. Write an in-flight and a docked v3 fixture with `epoch: 5` via the fixtures helper, cold boot with Continue, and read `window.__wegolite?.sim?.epoch` (the hook already exposes it, `tick-hook.spec.ts:130`). Assert epoch 5 after Continue and epoch 6 after the next launch (docked) or the restored epoch and world seed (in flight). Alternatively, extract the restore re-anchor from `startSession` into a small pure function that both paths and the test call.

## Info

### IN-01: v3 `epoch` and `nextEntityId` are not cross-validated against `mode`, and `nextEntityId` is never consumed

**File:** `src/persistence/save.ts:300-312` (schema), `src/persistence/save.ts:560` (`validateSaveSemantics`); `src/app/session/save-controller.ts:448`, `src/app/session/start-session.ts:463`

**Issue:** The writer produces only two shapes: docked saves always carry 101, and in-flight saves carry the anchor counter. The reader accepts any value in 101..2^32 for either mode, and any epoch, including a docked blob with `nextEntityId: 4294967296` or an in-flight blob with epoch 0 (the latter is legitimate only from migration).

Neither restore path reads `save.nextEntityId`. The regenerated anchor world is not compared with it, so today the field is write-only. D-01 and D-03 make this intentional until Phase 12. The strictness is bounded, not semantic. The "regeneration rebuilt the same world" check described in D-01 does not exist yet, so a regression that makes the anchor counter drift would go unnoticed.

**Fix:** Nothing for this phase. When Phase 12 adds the populator, add the comparison at restore, and decide then whether a docked save should carry the post-populate counter. A docked save currently carries 101 and nothing else, so the check will have to special-case docked mode.

### IN-02: In-flight snapshot silently substitutes 101 when the lifecycle has no anchor

**File:** `src/persistence/autosave.ts:155-159`

**Issue:** `anchorNextEntityId ?? FRESH_WORLD_NEXT_ENTITY_ID` for `mode === "inFlight"` hides the case where the session is in flight but the lifecycle holds no world (`begin` refused, or `resume` refused). That case is reachable only through epoch saturation (WR-01) or a non-finite seed. The result is a save with an in-flight pose, an epoch and a counter that were never anchored together. The test "counters without a world in flight give the fresh-world counter" pins the fallback rather than treating it as a defect.

**Fix:** Either leave it, since it is cheap and the case is near-unreachable, or return `undefined` from `buildSnapshotInputs` for an in-flight state with no world, so the autosave skips with `not-ready` instead of writing mismatched anchors.

### IN-03: `snapshotForSave` comment misstates when the world is alive

**File:** `src/persistence/autosave.ts:83-85`

**Issue:** The comment says "A docked anchor has no live world: the docked event ends it right after the dock autosave". The dock autosave actually runs while the world is still alive: `event-router.ts:211` autosaves, and the `worldLifecycle` subscriber that calls `end()` runs after `stationFlow`. The code is correct because the docked branch ignores the counter, and `save-v3.test.ts` ("with the world alive and after it ends") covers both cases. The prose is the wrong justification for it.

**Fix:** Reword to "a docked anchor may or may not have a live world (the dock autosave runs before `end`), so a docked save never reads the live counter".

### IN-04: Restore paths ignore the boolean from `resetForRestore`

**File:** `src/app/session/save-controller.ts:448`, `src/app/session/start-session.ts:463`

**Issue:** Both paths discard the return value. This is documented as D-04 ("false is unreachable from a valid save"). If the schema bound and the lifecycle bound ever diverge, the lifecycle quietly falls to epoch 0 with no signal. This is the same drift class as WR-01.

**Fix:** Optionally add a dev assertion, or a unit test that iterates the schema's min and max and asserts `resetForRestore` returns true for both. The existing test at `save-v3.test.ts:401` already covers the max.

---

_Reviewed: 2026-11-14_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_

---
phase: 04-manual-docking
plan: 05
subsystem: persistence
tags: [indexeddb, autosave, zod, save-schema, title-screen, e2e, threat-mitigation]

# Dependency graph
requires:
  - phase: 04-manual-docking
    provides: the post-`beginLaunch` clock (+600 s), the docked pose derivation and the purchase/taint seams from 04-01..04-04
provides:
  - "SaveV1, parseSave(raw, allow), encodeSave, MAX_SAVE_CHARS"
  - "SaveStore port, SaveStatus, SaveReadResult, WriteResult, MemorySaveStore"
  - "IndexedDbSaveStore with one serialized queue and transaction oncomplete"
  - "snapshotForSave, queueAutosave, restoreFromSave"
  - "TitleScreen.onContinue/setContinueVisible and #title-continue"
  - "probe.save {status,writes,committed,revision,lastClock,continueVisible,skipReason,unavailable}"
affects: [05-outfitting-and-trade, 06-hyperspace-and-saves]

# Actuals (#2632) — chars/4 over the realized src+tests+index diff, same scale as the estimate.
actuals:
  tokens: 18658
  tasks: 3
  commits: 3
  plan_head_before: 4500cfcfeea3a7f2c5ca3525431d12b56abcc275
  plan_head_after: 6104f477a8ac733dff0a4eecfcc8f192742a9089

tech-stack:
  added: []
  patterns:
    - "A write resolves on the IndexedDB transaction oncomplete, never on the request, and a monotonic revision makes a stale completion a no-op"
    - "Boot reads one blob before the title and builds every allow-list at the parseSave call site"
    - "A future-version blob is inert data: never cleared, never written, byte-identical"
    - "A tainted test profile publishes skipReason instead of persisting"

key-files:
  created:
    - src/persistence/save.ts
    - src/persistence/store.ts
    - src/persistence/memory-store.ts
    - src/persistence/idb-store.ts
    - src/persistence/autosave.ts
    - tests/persistence/save.test.ts
    - tests/persistence/autosave.test.ts
    - tests/e2e/autosave.spec.ts
  modified:
    - src/ui/title.ts
    - index.html
    - src/main.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - .planning/PROJECT.md

key-decisions:
  - "The saved clock is the post-launch clock (+600 s already applied) and the blob always declares mode docked; the docked pose is derived from the layout on restore"
  - "A version-2+ blob is never cleared or replaced: New game starts in memory, the launch write is skipped and the bytes stay identical"
  - "New game awaits a committed delete before the session starts, so a reload cannot resurrect the old blob"
  - "The purchase autosave is a direct call after an accepted purchase, not the onProfileChanged seam: a seam grant would write before ?test=1 sets testTainted"
  - "A VersionError, blocked or quota failure reports the store unavailable and is never repaired with deleteDatabase"
  - "Corrupt blobs are copied to autosave.corrupt exactly once, best effort, and never read back"

patterns-established:
  - "Persistence ports report data-shaped failures (`error`, `committed: false`) rather than throwing into the frame loop"
  - "The page waits on probe.save.committed, never on an invocation counter, before asserting a reload"
  - "Hostile blobs are proved in a table test for validation and in a real browser for boot inertness"

requirements-completed: [DOCK-07]

coverage:
  - id: D1
    description: "A strict versioned SaveV1 parser: absent vs corrupt vs future, size cap before JSON.parse, integer/range bounds and boot allow-lists"
    requirement: DOCK-07
    verification:
      - kind: unit
        ref: "tests/persistence/save.test.ts#accepts the exact blob this build writes"
        status: pass
      - kind: unit
        ref: "tests/persistence/save.test.ts#rejects an oversized blob before JSON.parse runs"
        status: pass
      - kind: unit
        ref: "tests/persistence/save.test.ts#version 2"
        status: pass
      - kind: unit
        ref: "tests/persistence/save.test.ts#unknown system"
        status: pass
    human_judgment: false
  - id: D2
    description: "Autosave snapshots for launch and purchase, and a restore that yields a docked state at the saved clock"
    requirement: DOCK-07
    verification:
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#records the post-launch clock, docked mode and identities"
        status: pass
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#writes the reduced balance after a purchase"
        status: pass
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#commits revisions in order and ignores a late older write"
        status: pass
      - kind: unit
        ref: "tests/persistence/autosave.test.ts#restores docked mode at the saved clock with the profile"
        status: pass
    human_judgment: false
  - id: D3
    description: "A committed launch write survives a reload and Continue restores exactly the saved clock"
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a committed launch write offers Continue at exactly the saved clock"
        status: pass
    human_judgment: false
  - id: D4
    description: "Corrupt blobs are backed up once; oversized and duplicate-equipment blobs boot inert without a console error"
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a corrupt blob is backed up once and never blocks boot"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#an oversized blob is rejected before it can be parsed"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#duplicate equipment makes an otherwise valid blob corrupt"
        status: pass
    human_judgment: false
  - id: D5
    description: "A future-version blob is inert: Continue hidden, New game does not clear it, launch does not replace it, bytes identical"
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a future-version blob is never cleared or replaced"
        status: pass
    human_judgment: false
  - id: D6
    description: "New game clears only after a committed delete and a reload no longer offers Continue"
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#New game clears a committed save before starting"
        status: pass
    human_judgment: false
  - id: D7
    description: "Docking does not autosave; the launch-time clock remains the only resume point"
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a manual dock does not autosave: Continue still restores the launch clock"
        status: pass
    human_judgment: false
  - id: D8
    description: "A tainted ?test=1 profile is never written and publishes skipReason"
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a tainted ?test=1 profile is never autosaved"
        status: pass
    human_judgment: false

duration: 31 min
completed: 2026-11-05
status: complete
---

# Phase 4 Plan 5: Autosave, Continue and Future-Save Preservation Summary

**A strict versioned IndexedDB autosave on launch and purchase, with a committed-write Continue restore and a byte-identical future-save rule proven in a real browser.**

## Performance

- **Duration:** ~31 min (plus the full `verify` gate)
- **Started:** 2026-11-05T09:27:00Z (approximate)
- **Completed:** 2026-11-05T09:58:35Z
- **Tasks:** 3 (one tracer, two expansions)
- **Files modified:** 14

## Accomplishments

- Added the strict `SaveV1` schema and `parseSave`: absent/corrupt/future are distinct, `MAX_SAVE_CHARS` is checked before `JSON.parse`, every number is integer- and range-bounded, and equipment/system/station allow-lists are required arguments so an unknown key cannot reach `findShip`.
- Added the `SaveStore` port with a committed-revision contract, `MemorySaveStore`, and an `IndexedDbSaveStore` that opens lazily through one shared promise, serializes every operation on one queue, resolves writes only from the transaction's `oncomplete`, and never calls `deleteDatabase`.
- Wired boot: `main.ts` reads one blob before the title, builds the three allow-lists from the validated equipment catalogue, galaxy 0 and the dock-bearing ship entries, copies a corrupt blob to `autosave.corrupt` once, and shows `#title-continue` only for a validated save.
- Wired the session: launch and a successful purchase queue the same snapshot; New game awaits a committed clear; a future blob disables every write; any `?test=1` mutation taints the profile and the autosave skips with a published reason; a manual or computer dock never saves.
- Added `probe.save` and a real-IndexedDB e2e suite covering the committed-write reload, docking inertness, New-game clear, future byte identity, corrupt backup, 1 MB rejection, duplicate equipment, and the taint skip.

## Task Commits

Each task was committed atomically:

1. **Task 1 (tracer): the validated save contract and restore path** - `cbb3c94` (feat)
2. **Task 2: IndexedDB persistence, boot allow-lists, Continue/New game and skips** - `dd0ea2d` (feat)
3. **Task 3: real-IndexedDB browser proof** - `6104f47` (test)

**Plan metadata:** the docs commit that follows this file.

## Files Created/Modified

- `src/persistence/save.ts` - `SaveV1`, the size cap, `parseSave(raw, allow)`, `encodeSave`
- `src/persistence/store.ts` - the port, `SaveStatus`, `WriteResult`, DB/store/key constants
- `src/persistence/memory-store.ts` - committing memory adapter with revision ordering and failure modes
- `src/persistence/idb-store.ts` - lazy shared open, serialized queue, commit-only resolution, VersionError/blocked handling
- `src/persistence/autosave.ts` - `snapshotForSave`, non-throwing `queueAutosave`, `restoreFromSave`
- `src/ui/title.ts` - `onContinue`, `setContinueVisible`, `#title-continue`
- `index.html` - Continue button (hidden by default) and the New game label
- `src/main.ts` - boot read, allow-lists, corrupt backup, Continue/New-game wiring
- `src/app/game-session.ts` - launch/purchase autosave, committed New-game clear, restore, save probe
- `src/app/probe.ts` - `WegoliteSaveProbe` and the `save` field
- `tests/persistence/save.test.ts` - accept/reject table incl. the parse-cap spy and key-set proof
- `tests/persistence/autosave.test.ts` - launch/purchase snapshots, non-throwing failures, revision ordering, restore
- `tests/e2e/autosave.spec.ts` - eight real-IndexedDB cases
- `.planning/PROJECT.md` - save schema, purchase durability and future-preservation decisions

## Decisions Made

- The save declares `mode: "docked"` and records the post-`beginLaunch` clock; the pose is derived from the layout, so the blob carries no position, quaternion or timestamp.
- `New game` means "clear the save this build understands" and nothing more: a future blob is left untouched, and the launch write path is disabled for that session rather than attempted-and-failed.
- The purchase autosave is a direct call after an accepted purchase instead of the `onProfileChanged` seam recorded by 04-04. The dev seam uses the same `commitProfile` path, and its taint flag is set only after the call returns; a seam-driven write would persist a granted balance. The seam is retained for Phase 5.
- The IDB adapter reports itself unavailable after a `VersionError`/blocked/quota failure. "Serving from memory" is therefore "the game runs without saves" (the must-have), not a second in-memory save layer that could later overwrite a newer blob.
- `probe.save.lastClock` advances only on a committed write, so the e2e can distinguish an invocation from durability.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed a literal `innerHTML` mention from a title comment**
- **Found during:** Task 2 acceptance check
- **Issue:** The acceptance check is `rg -n "innerHTML" src/ui/title.ts` returns nothing; the module's doc comment used the word while explaining that it writes no markup.
- **Fix:** Rephrased the comment ("no markup-injection surface"); no code changed.
- **Files modified:** `src/ui/title.ts`
- **Verification:** the `rg` check returns nothing; lint and typecheck stay green.
- **Committed in:** `dd0ea2d`

---

**Total deviations:** 1 auto-fixed (1 blocking, documentation-only).
**Impact on plan:** No product scope change. The purchase-autosave routing decision is recorded above and in PROJECT.md; it is stricter than the 04-04 handoff wording, not a relaxation.

## Issues Encountered

- The first full `docker compose run --rm verify` failed on the documented pre-existing flake `tests/guards/content-boundary.test.ts > removes the probe even when the body throws` (Vitest's 5 s default under load; STATE.md already records it as a test-infra issue outside this plan). The re-run was fully green: 68 unit files / 678 tests, and 43 e2e tests including the eight new autosave cases. No code was changed for it.
- The oversized e2e deliberately writes a 1 MB blob; boot copies it to `autosave.corrupt`, which is a little slow but proves the cap path end to end.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 5 can reuse the equipment catalogue and `canPurchase` unchanged; a successful outfitting purchase should call the same session `autosave` path (or move the call into `commitProfile` once the test seam sets taint before committing).
- Phase 6 owns migrations: the blob is versioned, strict and already bounded, so a v2 schema can migrate from v1 without touching the DB/store names.
- No blockers. The save layer has no new npm dependency; `idb`/`fake-indexeddb` remain rejected.

---

*Phase: 04-manual-docking*
*Completed: 2026-11-05*

## Self-Check: PASSED

- Every created file named above exists on disk.
- Every task commit (`cbb3c94`, `dd0ea2d`, `6104f47`) is an ancestor of HEAD.

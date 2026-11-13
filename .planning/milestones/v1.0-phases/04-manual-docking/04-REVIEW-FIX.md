---
phase: 04
fixed_at: 2026-11-05T11:58:00Z
review_path: .planning/phases/04-manual-docking/04-REVIEW.md
iteration: 1
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-11-05
**Source review:** `.planning/phases/04-manual-docking/04-REVIEW.md`
**Iteration:** 1

**Summary:**

- Findings in scope: 6 (CR-01, CR-02, WR-01, WR-02, WR-03, WR-04)
- Fixed: 6
- Skipped: 0
- Out of scope by instruction: the six Info findings (IN-01…IN-06)

Each fix was committed atomically on top of `976c7e4` and fast-forwarded to `main`.
All verification ran in Docker from the isolated review-fix worktree; the tree content is
identical to the fast-forwarded `main` (`6b3f983`).

## Fixed Issues

### CR-01: Autosave writes a fractional clock that `parseSave` rejects

**Files modified:** `src/persistence/autosave.ts`, `src/persistence/save.ts`, `tests/persistence/autosave.test.ts`
**Commit:** `e687537`

**Applied fix:**

- `snapshotForSave` floors `state.clockSeconds` at the writer boundary, so a snapshot taken
  after any fractional flight tick always satisfies the integer save schema.
- `queueAutosave` now validates the encoded blob with `isEncodedSaveValid` (size cap +
  `SaveV1Schema`) before `store.write`; a rejected payload returns
  `{ committed: false, reason: "invalid-save" }` and leaves the last good blob untouched.
- Added a round-trip test: launch → 240 fixed flight steps → dock → relaunch, asserting
  `parseSave(store.raw)` is `ok`, the encoded clock equals `floor(live + 600)`, and the
  restored clock is within one second of the live clock.
- Added a fail-closed test proving a schema-invalid snapshot commits nothing.

### CR-02: The size cap ran before future-version detection

**Files modified:** `src/persistence/save.ts`, `src/persistence/store.ts`,
`src/main.ts`, `src/app/game-session.ts`, `tests/persistence/save.test.ts`,
`tests/e2e/autosave.spec.ts`
**Commit:** `86b758b`

**Applied fix:**

- Added a bounded, allocation-safe version sniff (`MAX_VERSION_SNIFF_CHARS = 256`,
  `/"version"\s*:\s*(\d{1,16})/`) that runs before the destructive classification. An
  oversized blob whose prefix declares a newer version returns `future-version`.
- Added the `unreadable` parse reason/status for oversized, unparseable, scalar and
  version-less shapes. Boot maps it to `saveStatus = "unreadable"` and never calls
  `backupCorrupt`.
- `corrupt` is now returned only for a JSON object carrying this family's numeric
  `version` (≤ `SAVE_VERSION`) that fails the strict schema — the only class eligible for
  the corrupt-backup path.
- The session refuses to clear or overwrite a `future`/`unreadable` blob.
- Updated the reject-row table (truncated JSON → `unreadable`; added unknown-shape
  coverage), replaced the reversed cap test with oversized-v2 → `future-version`, and added
  oversized/byte-identity e2e coverage (no backup, New game and launch leave the blob
  untouched).

### WR-01: The writer could emit a v1 blob larger than `MAX_SAVE_CHARS`

**Files modified:** `src/persistence/save.ts`, `tests/persistence/autosave.test.ts`,
`tests/persistence/save.test.ts`
**Commit:** `afdb8e6`

**Applied fix:**

- Raised `MAX_SAVE_CHARS` to 32,768 with an explicit worst-case accounting: 64 equipment
  keys × 64 characters × 6 (worst JSON escape) = 24,576, plus escaped ids and envelope.
- Aligned `MAX_SAVE_CREDITS` with `isSafeCredits` (`Number.MAX_SAFE_INTEGER`); updated the
  reject row to an unsafe balance.
- The encoded-blob validation added in CR-01 is the single write gate.
- Added a maximum-tuple round-trip test (64 × 64-character control-character keys, maximum
  clock, maximum credits) proving the encoded blob fits `MAX_SAVE_CHARS` even under
  worst-case escaping, and that `parseSave` accepts it.

### WR-02: `backupCorrupt` wrote an unbounded blob

**Files modified:** `src/persistence/save.ts`, `src/persistence/idb-store.ts`,
`src/persistence/memory-store.ts`, `tests/persistence/save.test.ts`
**Commit:** `118fac6`

**Applied fix:**

- Added `boundCorruptBackup`: short blobs are kept verbatim; oversized blobs keep at most
  `MAX_SAVE_CHARS` characters with a `wegolite-corrupt-save-truncated:<originalLength>:`
  marker. Both the IndexedDB adapter and the memory store route through it.
- `corrupt` can now only be produced for a blob within the parser cap, so boot's backup is
  bounded twice over.
- The oversized e2e assertion now requires `autosave.corrupt` to be absent; unit tests
  cover verbatim short blobs and bounded long ones.

### WR-03: The "docking does not autosave" assertion was masked by the taint skip

**Files modified:** `src/app/probe.ts`, `src/app/game-session.ts`,
`tests/e2e/autosave.spec.ts`, `tests/e2e/docking.spec.ts`
**Commit:** `8df226b`

**Applied fix:**

- Added `WegoliteSaveProbe.attempts`, incremented at the very top of `autosave()` before
  the status/taint checks, and synced with the rest of the probe.
- The manual-dock autosave e2e now asserts `attempts === 1` (the launch attempt) in
  addition to `writes === 1`, so a dock that called `autosave()` would be observable even
  when the write is tainted-skipped.
- The Shift+C computer-dock e2e asserts `attempts === 1`, covering the computer path.

### WR-04: New game could clear a save boot could not read

**Files modified:** `src/app/game-session.ts`, `src/app/probe.ts`, `src/main.ts`,
`tests/e2e/autosave.spec.ts`
**Commit:** `6b3f983`

**Applied fix:**

- Replaced the two-status skip with explicit predicates:
  `canOverwrite = absent | valid` and `canClear = absent | valid | corrupt`. A read error,
  a non-string stored shape, or an unavailable database can neither be cleared by New game
  nor overwritten by an autosave; the skip reason is exposed as `unavailable`.
- Boot now assigns `unavailable` explicitly for `read.kind === "error"` instead of relying
  on an initializer.
- Added e2e coverage that writes a structured (non-string) value, asserts the boot status
  is `unavailable`, then asserts the value is byte-identical after New game and after a
  launch (zero writes, `attempts === 1`).

## Verification

**Command:** `docker compose run --rm verify` (run inside the isolated review-fix
worktree; the bind mount is that worktree, and the content was fast-forwarded unchanged to
`main`).

**Result (single run, no flake):**

- Lint + Prettier: pass.
- Typecheck (`tsc` project + sim): pass.
- `assets:check`: `no differences`.
- Vitest: **686 tests passed across 68 files**.
- Production build: pass.
- Playwright: **46 tests passed** (7.4 m).

The known load-sensitive `tests/guards/content-boundary.test.ts` 5-second timeout did not
occur; the suite passed on the first run, so no rerun was needed.

## Notes

- Scope was held to the six in-scope findings; the Info findings (IN-01…IN-06) were not
  touched.
- `.planning/config.json`, `.planning/state.json` and `.review-diagnostics/` were left
  untouched.
- New behaviour worth knowing for Phase 5: a stored blob this build cannot positively read
  (`unreadable`) or a read failure (`unavailable`) now disables autosave for that session
  rather than overwriting it. This is the deliberate fail-closed trade-off required by
  T-04-47 and WR-04.

---

_Fixed: 2026-11-05_
_Fixer: gsd-code-fixer_
_Iteration: 1_

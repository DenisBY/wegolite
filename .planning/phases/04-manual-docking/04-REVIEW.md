---
phase: 04
status: issues_found
findings:
  total: 12
  critical: 2
  warning: 4
  info: 6
---

# Phase 04: Manual Docking — Code Review

**Reviewed:** 2026-11-05
**Base:** `21905d8f53092878077147cc4f302e389b3cac9d`
**Depth:** deep
**Scope:** all non-planning source, tools and test changes in the phase, with the generated
`dock-port.json` treated as build output. `04-01`–`04-05` plans and summaries were read first;
upstream behaviour was checked against the Oolite checkout for the corridor and dock ordering.

**Verification runs (Docker only):**

- `docker compose run --rm test npx vitest run tests/persistence tests/sim/dock-*.test.ts src/content/dock-port.test.ts tools/oolite-ingest/convert/dock-port.test.ts` — 88 passed.
- A second scoped run over the hull/no-trap/corridor/cadence/profile/bindings/feedback suites — 79 passed.
- `docker compose run --rm assets npm run assets:check` — `no differences`.
- The full suite was not rerun; the known load-sensitive `tests/guards/content-boundary.test.ts` timeout was therefore not observed in this review.

## Summary

The geometry pipeline, corridor classifier, arming latch, SAT response, keyboard chord and TL-gated
purchase are internally coherent and the scoped tests exercise their boundaries. The save layer is
where this phase is not yet safe to ship: the autosave writer is not constrained by the parser's
own schema, so normal play can overwrite a valid save with a blob the next boot rejects as
`corrupt`. Two critical data-loss paths and two contract/verification gaps follow.

The three highest risks are:

1. **CR-01** — a second launch after any flight writes a fractional `clockSeconds` that the strict
   save schema rejects, silently destroying the resume point.
2. **CR-02** — the size cap runs before the future-version check, so a newer build's oversized save
   is classified `corrupt` and can be cleared by New game and overwritten by the next launch.
3. **WR-01** — the v1 schema's maximum equipment tuple can encode to more than `MAX_SAVE_CHARS`, and
   the writer never validates its output before committing it.

## Critical Issues

### CR-01: Autosave writes a fractional clock that `parseSave` rejects, corrupting the save on the second launch

**File:** `src/persistence/autosave.ts:43-50`, `src/persistence/save.ts:59-63`, `src/sim/flight/step.ts:152-155`, `src/sim/flight/launch.ts:48`, `src/app/game-session.ts:425-443`

**Issue:** `snapshotForSave` copies `state.clockSeconds` verbatim, but `SaveV1Schema.clockSeconds`
is `z.number().int().min(CLOCK_START).max(...)`. `clockSeconds` is advanced by `DT` (`1/120`) on
every non-docked flight tick (`step.ts:155`), so after any real flight it is fractional — the phase's
own transition matrix acknowledges this (`tests/sim/dock-transitions.test.ts:87-90`, `clockExact:
false`). A normal sequence proves it:

1. New game → launch (the launch autosave is integer and valid).
2. Fly, then dock manually or with Shift+C; `clockSeconds` is now e.g. `180057946201.9995`.
3. Click Launch again: `beginLaunch` adds 600 and the `launched` handler calls `autosave()`.
4. `encodeSave` writes the fractional clock; IndexedDB commits it (`saveStatus` becomes `valid`).
5. On reload `parseSave` returns `{ok:false, reason:"corrupt"}`; Continue is hidden, the good save
   has been overwritten, and New game deletes it after backing it up.

The unit tests only cover a fresh, integer launch (`tests/persistence/autosave.test.ts:62-81`), so
the round trip after a flight is not exercised. The purchase autosave has the same writer; it is
blocked at Lave only by the TL gate, not by any clock handling.

**Fix:** Make the writer satisfy the schema, and make a bad write fail closed rather than
overwriting the last good blob. At minimum:

```ts
// src/persistence/autosave.ts
clockSeconds: Math.floor(state.clockSeconds),
```

Validate the encoded payload before writing (or validate the snapshot in `queueAutosave`) and return
a non-committed `WriteResult` (`reason: "invalid-save"`) instead of calling `store.write` when
`SaveV1Schema.safeParse` fails. Add a round-trip test: launch, advance 240 fixed steps, dock,
relaunch, then `parseSave(store.raw)` must be `ok` and the restored clock must be within one second
of the live clock.

### CR-02: The size cap runs before future-version detection, so an oversized newer save is treated as corrupt and can be destroyed

**File:** `src/persistence/save.ts:115-134`, `src/main.ts:137-152`, `src/app/game-session.ts:406-416`, `src/app/game-session.ts:450-466`, `tests/persistence/save.test.ts:201-207`

**Issue:** `parseSave` checks `raw.length > MAX_SAVE_CHARS` and returns `corrupt` **before**
`JSON.parse` and therefore before the `version > SAVE_VERSION` branch. Boot maps `corrupt` to
`saveStatus = "corrupt"` and hides Continue; `autosave()` skips only `future` (or tainted), so the
next launch overwrites the blob; `clearSaveForNewGame` also skips only `future`, so New game calls
`store.clear()` and deletes it. The phase's must-have is unconditional: a blob from a newer build
is never cleared and never replaced (T-04-47).

A future save larger than 4096 characters is easy: the current v1 schema alone allows 64 equipment
keys of 64 characters, which encodes to about 4440 characters (see WR-01), and a later schema will
add fields. The reject-row test at `tests/persistence/save.test.ts:201-207` currently enshrines the
wrong classification (`version: 2` plus padding is expected to be `corrupt`, not `future-version`).
There is a second path to the same loss: `IndexedDbSaveStore.read` returns an error for a non-string
stored value (`src/persistence/idb-store.ts:207-214`); boot maps that to `unavailable`; if the
database itself opened, New game's `clear` can delete the value.

**Fix:** Do a bounded, allocation-safe version sniff before the destructive classification (for
example inspect the first 256 characters for `"version"\s*:\s*(\d+)`; if the number is greater than
`SAVE_VERSION`, return `future-version`). More generally, treat any blob this build cannot
positively identify as its own v1 string (oversized, non-string, unparseable, read error) as
**untouchable**: do not clear or overwrite it, and expose a distinct status/reason. Only a blob that
is provably v1-shaped-but-invalid should be eligible for the corrupt-backup-and-clear path. Add
tests for oversized version 2, a non-string value, and byte identity after New game and after a
launch.

## Warnings

### WR-01: The writer can emit a v1 blob that exceeds `MAX_SAVE_CHARS` and is rejected by its own parser

**File:** `src/persistence/save.ts:36-54`, `src/persistence/save.ts:64-67`, `src/persistence/save.ts:166-176`, `src/sim/player/profile.ts:25-29`, `src/sim/player/profile.ts:84-86`, `src/persistence/autosave.ts:60-74`

**Issue:** The schema accepts up to 64 equipment keys of 64 characters each, and the profile allows
the same. The encoded JSON for 64 × 64-character keys is about 4440 characters (key content 4096,
plus quotes, commas and field names), which is greater than `MAX_SAVE_CHARS = 4096`. `encodeSave`
and `queueAutosave` never validate the encoded blob against `SaveV1Schema`, so a future outfitting
set (or a future path that grants long keys) can commit a save its own boot rejects as `corrupt`.
There is a parallel bounds mismatch for credits: `setCredits` accepts any safe non-negative integer
(up to 9,007,199,254,740,991), while `SaveV1Schema.credits` caps at `1_000_000_000_000`. The
`?test=1` grant currently taints the profile and avoids the write, but the exported `setCredits` /
`grantCredits` seam is not safe for Phase 5.

**Fix:** Make the contract one-way. Either raise `MAX_SAVE_CHARS` above the true v1 maximum (and
keep it bounded), or lower `MAX_SAVE_EQUIPMENT`/`MAX_SAVE_EQUIPMENT_KEY_CHARS` so the worst case
fits. Align `MAX_SAVE_CREDITS` with `isSafeCredits` (or clamp/floor in `snapshotForSave`), and
validate `encodeSave` output with `SaveV1Schema.safeParse` before `store.write` so an invalid blob
returns a non-committed result instead of replacing a good save. Add a maximum-tuple round-trip
test.

### WR-02: `backupCorrupt` writes an unbounded blob, bypassing the oversized-save resource bound

**File:** `src/main.ts:145-149`, `src/persistence/idb-store.ts:264-274`, `tests/e2e/autosave.spec.ts:383-399`

**Issue:** T-04-27/T-04-49 bound the parse input with `MAX_SAVE_CHARS`, but when a blob is corrupt
(or oversized) boot calls `backupCorrupt(read.raw)`, and the adapter `put`s the entire
attacker/user-controlled string under `autosave.corrupt`. The 1 MB e2e case explicitly asserts the
full-length copy. This doubles storage for every corrupt oversized blob and can consume the origin's
IndexedDB quota, preventing later real saves. The "resource bound" documented in the threat model is
therefore not actually enforced on the backup path.

**Fix:** Do not back up an oversized blob; skip the copy when `raw.length > MAX_SAVE_CHARS` (or
store a short prefix plus a marker of the original length). Keep the bound on `autosave.corrupt` the
same as the autosave bound and update the e2e to assert the small marker rather than a 1 MB payload.

### WR-03: The "manual docking does not autosave" test is masked by the taint skip

**File:** `tests/e2e/autosave.spec.ts:207-266`, `src/app/game-session.ts:263-265`, `src/app/game-session.ts:406-416`, `src/app/game-session.ts:1108-1120`

**Issue:** The test boots with `/?test=1` (line 211) and places the docking pose through the hook.
Every accepted hook mutation calls `onMutate`, sets `testTainted`, and `autosave()` returns early
for a tainted profile. The assertion `docked.save.writes === 1` therefore proves the taint skip, not
that docking is not an autosave trigger: if `handleEvent("docked")` accidentally called
`autosave()`, the call would be skipped as tainted and the test would still pass. The phase's D7
claim ("docking does not autosave") is not actually verified in the untainted path, which is the
only path that matters in production.

**Fix:** Make the trigger decision observable before the skip. Add a `save.attempts` counter to
`WegoliteSaveProbe`, increment it at the top of `autosave()` before the future/taint checks, and
assert it stays at one after the manual dock; or extract `shouldAutosave(event, status, tainted)`
into a pure module and unit-test that a `docked` event is never a trigger. The same assertion should
cover the computer-dock path.

### WR-04: A save read error or unknown stored shape can be cleared by New game, deleting a save boot could not read

**File:** `src/main.ts:136-159`, `src/persistence/idb-store.ts:207-214`, `src/app/game-session.ts:450-466`

**Issue:** Boot maps every read error to `saveStatus = "unavailable"`; `clearSaveForNewGame` only
protects the `future` status, so it calls `store.clear()` for `unavailable` and `corrupt`. If the
read failed for a per-operation reason while the database is open (a non-string stored value is
reported as `save-shape`; a transaction error is reported as `read-failed`), the clear can commit
and delete a blob that may be a valid save the read could not decode. The user was never offered
Continue, so they cannot know they are deleting anything. This is the same class of destruction as
CR-02 for unknown/newer formats, but it happens on a transient read error as well.

**Fix:** Distinguish "positively absent" from "unreadable/unknown". For `unavailable`, read errors,
non-string values and oversized blobs, skip the destructive clear and the autosave overwrite (or
require explicit confirmation), and expose a distinct status/reason. Only clear a blob that parsed
as v1-shaped-but-invalid (the case the corrupt backup is designed for). Add an e2e that writes a
structured/non-string value and asserts New game leaves it byte-identical.

## Info

### IN-01: A manual dock leaves the previous computer-dock message on the panel

**File:** `src/app/game-session.ts:586-605`, `src/ui/docked.ts:86-88`

**Issue:** For `via === "computer"` the handler writes "Docking computers engaged" to the panel
message field. For a manual dock it only shows the panel and refreshes the profile; it never clears
or replaces that message. After a computer dock, a launch and a later manual dock, the panel still
shows the stale computer message until a hint happens to overwrite it. The same applies to a stale
hint after a later manual dock.

**Fix:** In the manual branch set a fixed manual message (for example "Docked") or call
`docked.setMessage("")` so the panel never reports the previous dock's cause.

### IN-02: `setOrientation` accepts finite but enormous components and writes a zero quaternion

**File:** `src/app/probe.ts:243-263`, `src/sim/flight/sanitize.ts:50-63`

**Issue:** The hook checks each component is finite and `lengthSquared > 0`, but not that the
squared length is finite. With components around `1e200`, `lengthSquared` overflows to `Infinity`,
`length` is `Infinity`, and every normalized component becomes `0`, so the hook writes
`(0,0,0,0)` instead of rejecting the value. `sanitizeFlightState` repairs it on the next step, but
while paused (or before the next step) the probe can publish `[0,0,0,0]`, and the setter does not
meet its documented "reject an invalid orientation" contract.

**Fix:** Reject when `!Number.isFinite(lengthSquared)` as well as when it is zero, then divide by
the finite length. Add a probe test with `1e200` components.

### IN-03: `probe.save.continueVisible` is set once at boot and becomes stale

**File:** `src/app/game-session.ts:237-246`, `src/app/game-session.ts:382-390`, `src/app/game-session.ts:450-465`, `src/main.ts:257-260`

**Issue:** `continueVisible` is written only by `main.ts` after the boot read. When New game clears a
valid save the session sets `saveStatus = "absent"` but leaves `continueVisible` true; when a launch
commits a new save in a session that booted with no save, it sets `saveStatus = "valid"` but leaves
`continueVisible` false. The probe is a documented consumer surface (and an auto re-review input),
so it can disagree with both the title and storage.

**Fix:** Derive and update `saveProbe.continueVisible` in `syncSaveProbe` from the current status
(`valid` after a committed write; `false` after a committed clear), and update it after the boot
read rather than in `main.ts` alone.

### IN-04: Dead and stale surfaces left by the phase

**File:** `src/app/mode.ts:22-39`, `src/app/game-session.ts:119-126`, `src/app/game-session.ts:151-156`, `src/sim/dock/corridor.ts:131`

**Issue:** `advanceMode`/`screenForMode` are not imported anywhere (a grep finds only the
definitions); Phase 4 extended a module the app does not use. `GameSessionSave.save` is passed by
`main.ts:211-215` but never read; Continue uses `StartOptions.restore`. The `onProfileChanged` JSDoc
says 04-05 attaches the purchase autosave there, but 04-05 deliberately uses a direct call; the
seam is a latent foot-gun because it is called for dev grants before `testTainted` is set.
`apertureHalfExtents` is used only by tests; production consumes the emitted corridor, so the
runtime re-derivation is not actually wired.

**Fix:** Remove or wire `mode.ts`; remove `GameSessionSave.save` (or use it in `start`); update the
`onProfileChanged` comment and set taint before invoking the seam (or remove the seam until Phase 5
wires it); and either call `apertureHalfExtents` in `createDockGeometry` as a drift check or mark it
test-only.

### IN-05: Restore validates the save's system and station ids but ignores them

**File:** `src/persistence/autosave.ts:80-95`, `src/app/game-session.ts:1019-1029`, `src/main.ts:123-135`, `src/app/game-session.ts:198-216`

**Issue:** `parseSave` accepts any galaxy-0 system id and any dock-bearing station key, but
`restoreFromSave` starts from the session's fixed Lave layout and ignores `save.system.id` and
`save.station.key`; the session is constructed with `system: lave`. A hand-edited (or future) save
for another allowed galaxy-0 system shows Continue, restores at Lave, and the next autosave rewrites
the identity to Lave. The identity is currently unverifiable at the restore site.

**Fix:** Either restrict the boot allow-list to the system/station the session can actually load
(Lave/coriolis-station), or pass the save's system id and station key into `start`/`restoreFromSave`
and construct the matching layout; reject an identity the session cannot honor. At minimum assert
`save.system.id === system.id` and `save.station.key === stationKey` before offering Continue.

### IN-06: The corridor `ww <= port.width` invariant conflicts with Oolite's own aperture expansion

**File:** `src/content/schemas/dock-port.ts:106-122`, `src/sim/dock/geometry.ts:176-185`, `tools/oolite-ingest/convert/dock-port.ts:148-171`

**Issue:** `DockPortSchema` and `createDockGeometry` require `corridor.ww <= port.width` (and `hh`),
but the emitter implements Oolite's x1.25 expansion: when the paired ship extent exceeds 90 % of the
nominal aperture, the emitted half-extent grows and can exceed the original `port.width`. The
committed Cobra does not trigger expansion, so the generated record is valid today, but a wider
player ship (or a different station) would be emitted successfully and then rejected by the shared
schema/runtime check.

**Fix:** Express the invariant against the expanded aperture (or remove the upper bound while
keeping the positive/finite checks); add an emitter test with a synthetic ship wider than the
nominal port to prove the corridor is representable. This is a future-ship constraint, not a defect
in the committed Coriolis/Cobra pair.

---

_Reviewed: 2026-11-05_
_Reviewer: gsd-code-reviewer_
_Depth: deep_

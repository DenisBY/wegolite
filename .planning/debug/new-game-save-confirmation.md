---
status: diagnosed
trigger: "just wiped it without asking anything and I started at the Lave station. We should add a confirmation."
created: 2026-11-05T00:00:00Z
updated: 2026-11-05T00:00:00Z
---

## Current Focus
<!-- OVERWRITE on each update - reflects NOW -->

hypothesis: CONFIRMED — the title screen's New game button invokes session.start() directly, and start() unconditionally awaits clearSaveForNewGame() before loading anything, so the first click deletes the committed autosave with no confirmation, no backup and no undo.
test: Read title.ts, main.ts wiring, game-session.ts start()/clearSaveForNewGame(), store.ts/idb-store.ts/save.ts, index.html markup, and the e2e suite that pins the flow.
expecting: Confirmed by direct code path; e2e "New game clears a committed save before starting" explicitly asserts the one-click deletion.
next_action: Diagnosis complete — return root cause to the caller.

## Symptoms
<!-- Written during gathering, then IMMUTABLE -->

expected: With a committed (valid) save present, clicking "New game" once either raises a confirmation prompt or preserves the only save as a one-slot backup before starting a fresh game. Only after the player confirms should the save be discarded.
actual: User reported: "just wiped it without asking anything and I started at the Lave station. We should add a confirmation." — one click on New game wiped the save immediately and started at Lave station.
errors: None reported.
reproduction: Commit a save (dock at Lave), return to the title screen, click "New game" once.
started: Discovered during UAT for Phase 04 (manual docking).

## Eliminated
<!-- APPEND only - prevents re-investigating -->

- hypothesis: The deletion happens later in the session (e.g. on the first launch autosave) or is caused by a re-read/overwrite race, not the click.
  evidence: `src/app/game-session.ts:981-987` runs `await clearSaveForNewGame()` before `assets.preload()`; the clear is the first async action of a New game. `clearSaveForNewGame` (`:484-500`) calls `store.clear(revision)`, and `src/persistence/idb-store.ts:248-263` deletes `AUTOSAVE_KEY`. No launch is required. The e2e `New game clears a committed save before starting` asserts `save.status === "absent"` immediately after the click, before any launch.
  timestamp: 2026-11-05T00:00:00Z

- hypothesis: The store lacks the semantics needed for a safe confirmation/backup, so the destructive write is unavoidable.
  evidence: The store already serializes operations on one queue and gates writes/clears by a monotonic revision (`src/persistence/idb-store.ts:130-152, 231-263`), resolves only on `oncomplete` (`:168-177`), and already writes a second key (`autosave.corrupt`) through `backupCorrupt` (`:265-275`). A one-slot backup or a deferred clear is mechanically feasible without a DB version bump.
  timestamp: 2026-11-05T00:00:00Z

## Evidence
<!-- APPEND only - facts discovered -->

- timestamp: 2026-11-05T00:00:00Z
  checked: `index.html:270-274` and `src/ui/title.ts:32-68`
  found: The title screen is a plain DOM overlay with exactly two buttons, Continue (`#title-continue`, hidden by default) and New game (`#title-start`). `onStart(handler)` attaches a click listener that calls `handler()` immediately (`title.ts:44-52`). There is no dialog element, no confirm markup and no pending/confirm state.
  implication: The title screen has no confirmation gate at the point where the destructive action originates.

- timestamp: 2026-11-05T00:00:00Z
  checked: `src/main.ts:269-282`
  found: Boot sets `title.setContinueVisible(bootSave !== undefined)` and wires `title.onStart(() => { void session.start(); })`; Continue is wired to `session.start({ restore: continueSave, fresh: false })`. The New game handler receives no `bootSave`/`saveStatus` check.
  implication: The app knows at boot whether a clearable save exists, but deliberately does not use that knowledge to guard New game.

- timestamp: 2026-11-05T00:00:00Z
  checked: `src/app/game-session.ts:971-987` and `:479-500`
  found: `start()` sets `starting = true` synchronously, then for a non-restore start executes `await clearSaveForNewGame()` before `assets.preload()`. `clearSaveForNewGame()` calls `saveBoot.store.clear(currentRevision)` when `canClear(status)`; `canClear` (`:418-420`) is `absent | valid | corrupt`. On a `valid` save this deletes the only autosave and sets `saveStatus = "absent"`. The `starting` guard only prevents a second start; it does not defer or ask.
  implication: One click is sufficient to commit the deletion, before the loading screen resolves and before the player sees the docked panel.

- timestamp: 2026-11-05T00:00:00Z
  checked: `src/persistence/store.ts:34-52`, `src/persistence/idb-store.ts:231-275`, `src/persistence/save.ts:38-98, 244-280`
  found: The `SaveStore` port exposes `read/write/clear/backupCorrupt/dispose`; `clear` deletes `AUTOSAVE_KEY`; `backupCorrupt` writes `CORRUPT_SAVE_KEY` in the same object store via a normal `put`. Writes and clears are serialized on one queue and rejected when `revision <= committedRevision`. The v1 schema is strict, `MAX_SAVE_CHARS = 32_768`, and `boundCorruptBackup` already supplies a bounded-backup pattern.
  implication: A one-slot backup (`autosave.backup` or similar key) needs no schema/DB version change; the serialized queue + revision make "backup then clear" or "confirm then clear" race-safe. `valid` blobs are already ≤ `MAX_SAVE_CHARS`, so a valid backup needs no truncation helper.

- timestamp: 2026-11-05T00:00:00Z
  checked: `src/main.ts:136-141` and `:223-227`
  found: On a valid boot read, `parseSave(read.raw, allowLists)` yields `bootSave`, but only the parsed `SaveV1` is retained; `read.raw` is discarded. The session receives `{ store, status, save? }`.
  implication: A backup-slot approach must either retain the raw blob at boot and pass it to the session, or add a store-level copy operation; the current `GameSessionSave` does not carry the bytes.

- timestamp: 2026-11-05T00:00:00Z
  checked: `rg -n "confirm\\(|window.confirm|<dialog|role=\\"dialog\\"" src index.html tests`
  found: No `window.confirm`, no `<dialog>`, and the only `role="dialog"` is the pause overlay (`index.html:298-310`). Confirmation UI is not an established component; the pause overlay (`src/ui/pause.ts`) is the existing DOM-overlay + focus-trap precedent.
  implication: A confirmation should be a new DOM overlay owned by the title screen (static markup in `index.html`, `AbortController` listeners and focus handling mirroring `ui/pause.ts`), not a blocking `window.confirm`.

- timestamp: 2026-11-05T00:00:00Z
  checked: `tests/e2e/autosave.spec.ts:60-63, 370-393`
  found: The suite pins the one-click behaviour: after a committed launch write and a reload, the `New game clears a committed save before starting` test clicks `#title-start` once and immediately waits for `save.status === "absent"`, then reloads and asserts Continue is hidden. The shared helper `startNewGame` also clicks `#title-start` once and expects `#docked` visible (it is used where no valid save exists at boot, so a save-only confirmation would not affect those cases).
  implication: The fix must update that one e2e test (add the confirm click and assert the save survives until confirmation); tests booting without a save remain valid only if the prompt is conditional on an existing clearable save.

- timestamp: 2026-11-05T00:00:00Z
  checked: `.planning/phases/04-manual-docking/04-CONTEXT.md:45` (D-14), `.planning/PROJECT.md:101-102`, `.planning/phases/04-manual-docking/04-VERIFICATION.md:101-103, 131`, `.planning/phases/04-manual-docking/04-05-SUMMARY.md:56-59, 214`
  found: D-14 specifies "New game clears the save and starts fresh at Lave" with no confirmation/backup. PROJECT.md's key decision only scopes "clears the save this build understands" (future blobs inert). Verification records the one-click deletion as an unresolved product/UX decision, not a deliberate accepted decision; the UAT issue G-04-3 is still `failed`.
  implication: This is an under-specified destructive action implemented literally, not a regression; the product decision requested by UAT has not been recorded.

- timestamp: 2026-11-05T00:00:00Z
  checked: `/home/opencode/git/oolite/src/Core/Entities/PlayerEntityLoadSave.m:149-213` and `PlayerEntityControls.m:4319-4357`
  found: Upstream Oolite has no launch autosave; New Game opens a scenario/commander-creation screen (`GUI_SCREEN_NEWGAME`) and does not delete an existing commander save file. Its save-overwrite path is a separate explicit confirmation (`GUI_SCREEN_SAVE_OVERWRITE`).
  implication: One-click deletion of the only autosave is not required for Oolite fidelity; a confirmation or retained backup is consistent with upstream's non-destructive New Game semantics.

## Resolution
<!-- OVERWRITE as understanding evolves -->

root_cause: `src/ui/title.ts` calls the `onStart` handler directly on a New game click and `src/main.ts` wires that handler straight to `session.start()`; `start()` immediately awaits `clearSaveForNewGame()` before any other work, and `clearSaveForNewGame()` deletes `AUTOSAVE_KEY` for any status in `absent | valid | corrupt`. Nothing in the title screen, `main.ts` or the session asks for confirmation, keeps a backup or offers undo, so the only committed save is destroyed on the first click. The behaviour is the literal implementation of D-14 ("New game clears the save"), and no product decision accepting one-click deletion was recorded.
fix: [not applied — diagnose-only mode]
verification: [not applicable — diagnose-only mode]
files_changed: []

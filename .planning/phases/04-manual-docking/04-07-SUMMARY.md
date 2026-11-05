---
phase: 04-manual-docking
plan: 07
subsystem: ui/title
tags: [confirmation, alertdialog, focus-trap, save-protection, e2e]
requires:
  - phase: 04-manual-docking
    provides: committed save clear path and the title/Continue wiring from 04-05
provides:
  - static alertdialog title confirmation owned by the title screen
  - shouldConfirmNewGame(status) policy for valid and corrupt blobs
  - boot wiring that gates New game only for a clearable save
  - shared e2e New-game starter that accepts the confirmation when present
affects: [04-manual-docking, ui-title, e2e-helpers]
actuals:
  tokens: 4925
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns:
    - "Destructive UI actions gate the handler at the owning overlay, not in the session"
    - "A status predicate mirrors the session's canClear set so the prompt and the clear cannot drift"
    - "A shared e2e starter accepts a conditional prompt by visibility, keeping post-reload specs on New game"
key-files:
  created:
    - tests/app/title-confirm.test.ts
    - tests/e2e/helpers/title.ts
  modified:
    - index.html
    - src/ui/title.ts
    - src/main.ts
    - tests/e2e/autosave.spec.ts
    - tests/e2e/launch.spec.ts
    - tests/e2e/settings.spec.ts
    - .planning/PROJECT.md
key-decisions:
  - "New game asks only for valid and corrupt blobs, matching GameSession.canClear; future, unreadable, unavailable and absent keep the one-click path"
  - "onStart stores the handler and gates it on the confirmation requirement instead of attaching an unconditional click listener"
  - "The shared e2e starter checks #title-confirm visibility rather than waiting a fixed time, so one helper serves both prompted and unprompted boots"
  - "PROJECT.md records the gate as a refinement of D-14: the clear still happens, but only after explicit confirmation"
patterns-established:
  - "Title-layer modal: static markup, one AbortController, Cancel focused by default, Tab trap and Escape restore focus to the trigger"
requirements-completed: [DOCK-07]
coverage:
  - id: D1
    description: "With a committed valid save, New game opens a static alertdialog with Cancel focused; Tab stays inside its two buttons and Escape closes it and restores focus to #title-start."
    requirement: DOCK-07
    verification:
      - kind: unit
        ref: "tests/app/title-confirm.test.ts#shouldConfirmNewGame returns true for the valid status"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#the New-game confirmation traps focus, Escape returns to New game, and the save survives"
        status: pass
    human_judgment: false
  - id: D2
    description: "The first New-game click leaves the committed blob readable and probe.save.status valid; Cancel preserves the exact bytes; only accept clears it and starts a fresh docked game."
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#New game clears a committed save before starting"
        status: pass
    human_judgment: false
  - id: D3
    description: "A boot with no clearable save (absent, future, unreadable, unavailable) starts immediately with no confirmation."
    requirement: DOCK-07
    verification:
      - kind: unit
        ref: "tests/app/title-confirm.test.ts#shouldConfirmNewGame returns false for all non-clearable statuses"
        status: pass
      - kind: e2e
        ref: "tests/e2e/autosave.spec.ts#a future-version blob is never cleared or replaced; #an unreadable blob is never backed up, cleared or overwritten"
        status: pass
    human_judgment: false
  - id: D4
    description: "Post-reload launch and settings specs start a fresh docked game through the shared starter, which accepts the confirmation when it appears."
    requirement: DOCK-07
    verification:
      - kind: e2e
        ref: "tests/e2e/launch.spec.ts#a launch after the first viewing skips on any key; tests/e2e/settings.spec.ts#rebinding roll-right persists through reload and changes the flight"
        status: pass
    human_judgment: false
  - id: D5
    description: "PROJECT.md records the confirmation gate as a product decision refining D-14."
    requirement: DOCK-07
    verification:
      - kind: other
        ref: "rg -n 'Ask before New game deletes' .planning/PROJECT.md"
        status: pass
    human_judgment: false
duration: 17min
completed: 2026-11-05
status: complete
plan_head_before: 12503486c29dab49e9f8b741c23c357c10333439
plan_head_after: 6eaedd72fb389a38445cc38eef36a5904cbfb708
---

# Phase 4 Plan 7: New-Game Save-Confirmation Gate Summary

**New game now asks before it discards a committed save: the first click only opens a focus-trapped alertdialog, Cancel/Escape preserve the blob byte-for-byte, and the clear commits only after explicit acceptance.**

## Performance

- **Duration:** 17 min
- **Started:** 2026-11-05T13:54:00Z
- **Completed:** 2026-11-05T14:10:13Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- Added `#title-confirm`, a static `role="alertdialog"` overlay inside `#title-screen` with a dimmed backdrop, a titled/detailed panel and exactly two controls: Cancel and Delete save and start.
- Added `shouldConfirmNewGame(status)` returning true exactly for `valid` and `corrupt`, mirroring `GameSession.canClear`; `src/main.ts` enables the gate from the boot status before wiring `onStart`.
- Reworked the title module to own the modal like `ui/pause.ts`: one `AbortController`, Cancel focused on open, Tab trapped across the two buttons, Escape closes and restores focus to `#title-start`, and only accept reaches the existing start handler.
- Proved the contract at both layers: a six-status unit table, a real-browser Escape/Tab/Cancel case, and a rewritten clear case that reads the raw blob before and after Cancel and asserts byte identity.
- Routed post-reload launch/settings starts through a shared `startNewGame(page)` helper that accepts the prompt when visible, so those specs keep asserting a New-game start rather than switching to Continue.
- Recorded the gate in `PROJECT.md` as a refinement of D-14.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the title confirmation gate and wire it to the boot status** - `066ca71` (feat)
2. **Task 2: Prove the save survives the first click, cancel preserves it, and confirmation clears it** - `6eaedd7` (test)

**Plan metadata:** committed separately as `docs(04-07): complete New-game save-confirmation plan`

## Files Created/Modified

- `index.html` - `#title-confirm` alertdialog markup and centred-panel/backdrop styling
- `src/ui/title.ts` - `shouldConfirmNewGame`, `setNewGameConfirmationRequired`, gated click, focus trap, Escape/Cancel handling
- `src/main.ts` - imports the predicate and enables the gate from the boot `saveStatus`
- `tests/app/title-confirm.test.ts` - table-driven status policy over all six statuses
- `tests/e2e/autosave.spec.ts` - Escape/Tab/Cancel gate case; local starter asserts no prompt; clear case proves the blob survives the first click and Cancel
- `tests/e2e/helpers/title.ts` - shared starter that accepts the confirmation when it appears
- `tests/e2e/launch.spec.ts` - both post-reload New-game clicks routed through the shared starter
- `tests/e2e/settings.spec.ts` - `startAndLaunch` routes both boots through the shared starter
- `.planning/PROJECT.md` - Key Decisions row for the confirmation gate (refines D-14)

## Decisions Made

- The prompt is conditional, not universal: only `valid` and `corrupt` are clearable, so only they ask. Prompting for `future`, `unreadable` or `unavailable` would advertise a deletion that `clearSaveForNewGame` refuses.
- `onStart` now stores the handler instead of attaching an unconditional listener; the single stored handler is invoked by the direct path or by accept, never by both.
- The shared e2e helper uses a visibility check rather than a fixed wait, so a fresh boot (no prompt) and a post-reload boot (prompt) both work with one route.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The pre-existing one-click clear test was intentionally left failing under its old body until Task 2 rewrote it; Task 1 verified the new gate case with the planned `--grep` filter.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- G-04-3 is closed: the committed save survives the first click and Cancel, and clears only after an explicit acceptance; a fresh boot still starts immediately.
- `docker compose run --rm verify` is green: lint, Prettier, typecheck, asset drift, 697 unit/integration tests and 47 browser tests.
- No new dependency, no save-schema change and no change to the future/unreadable/unavailable no-clear rules or the commit-before-resolve contract.

---

*Phase: 04-manual-docking*
*Completed: 2026-11-05*

## Self-Check: PASSED

- Both task commits exist on the branch (`066ca71`, `6eaedd7`).
- Every file listed in the frontmatter exists on disk.
- `docker compose run --rm verify` passed after the final task commit.

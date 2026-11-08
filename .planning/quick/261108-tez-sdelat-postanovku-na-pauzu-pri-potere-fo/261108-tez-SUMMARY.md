---
phase: quick-261108-tez
plan: 261108-tez
subsystem: settings
tags: [settings, focus-loss, d-15, pause, localStorage, e2e]

# Dependency graph
requires:
  - phase: 03-settings-rebinding
    provides: versioned settings blob (wegolite.settings), strict validator, Settings panel
provides:
  - Optional pauseOnFocusLoss boolean in the version-1 settings blob (absent reads as on)
  - Settings panel checkbox that saves each change at once and resets to on
  - GameSession.focusLost(), which gates only the pause step of the D-15 focus-loss rule
affects: [settings, focus-loss, pause overlay]

# Actuals (#2632) - same estimateTokens scale (chars/4 over the realized diff)
actuals:
  tokens: 4519
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional boolean on read: absent means the default, strict === undefined test, any other non-boolean (including null) fails validation"
    - "Focus loss clears held input unconditionally; the pause step is gated by a stored preference"

key-files:
  created: []
  modified:
    - src/settings/schema.ts
    - src/settings/store.ts
    - tests/settings/schema.test.ts
    - index.html
    - src/ui/settings-panel.ts
    - src/app/game-session.ts
    - src/main.ts
    - tests/e2e/settings.spec.ts

key-decisions:
  - "pauseOnFocusLoss defaults to true and reads as true when the key is absent, so every existing blob keeps D-15 behaviour with no migration"
  - "SETTINGS_VERSION stays 1; the field is optional on read and the newer-version guard is unchanged"
  - "Held input is cleared on focus loss whether or not the pause toggle is on; only the pause step is gated"
  - "The simulation keeps running with the toggle off; the game-loop frame-delta clamp bounds the catch-up, so no loop reset is needed"

patterns-established:
  - "focusLost() on GameSession is the single entry point for the blur and hidden-tab listeners in main.ts"

requirements-completed: []

# Metrics
duration: not measured
completed: 2026-11-08
status: complete
---

# Quick 261108-tez: Focus-loss pause toggle in Settings Summary

**The D-15 focus-loss auto-pause is now a Settings checkbox (default on, stored as an optional boolean in the version-1 blob); with it off, blur and a hidden tab keep the simulation running and still clear held input.**

## Performance

- **Duration:** not measured
- **Completed:** 2026-11-08
- **Tasks:** 3 of 3
- **Files modified:** 8

## Accomplishments

- Settings blob gains an optional `pauseOnFocusLoss` boolean. Blobs without the key read as on. Non-boolean values, including `null`, fail the strict validator with `settings.pauseOnFocusLoss: expected a boolean`, and the existing corrupt-blob path backs the blob up and uses defaults. `SETTINGS_VERSION` stays 1.
- Settings panel shows the checkbox "Pause when the window or tab loses focus". It reflects the stored value every time the panel opens, saves each change to `wegolite.settings` at once, and Reset all settings sets it back to on.
- `GameSession.focusLost()` always clears held input, and calls `pause()` only when the stored toggle is on (or no settings are loaded). The `blur` and `visibilitychange` (hidden) listeners in `src/main.ts` now call it. Pointer-lock, fullscreen, the P/Escape toggle, and the WebGL context-loss pause are unchanged.
- Browser proof covers the toggle off (no overlay, clock advances, persists across reload) and the toggle back on (blur pauses again).

## Task Commits

Each task was committed atomically on `main` (sequential executor, no worktree; `git.allow_default_branch_commits` is true in `.planning/config.json`):

1. **Task 1: Add the optional pauseOnFocusLoss field to the settings schema and store** - `6c15fc8` (feat)
2. **Task 2: Wire the toggle through the Settings panel, the session, and the focus listeners** - `0435ec5` (feat)
3. **Task 3: Cover the toggle in the browser, with the default-on path left untouched** - `7c35c08` (test)

**Plan metadata:** docs commit made by the orchestrator (SUMMARY.md, STATE.md and PLAN.md not committed by this executor; ROADMAP.md not touched).

## Files Created/Modified

- `src/settings/schema.ts` - `pauseOnFocusLoss` field, allowlist entry, strict read with default true, defaults and mergeDefaults updated
- `src/settings/store.ts` - `saveSettings` writes the field
- `tests/settings/schema.test.ts` - default, absent-key, false round-trip, string and null rejection, corrupt-backup path; five-key save assertion
- `index.html` - checkbox `[data-settings-toggle="pauseOnFocusLoss"]` inside `#settings-panel`
- `src/ui/settings-panel.ts` - `onPauseOnFocusLossChange` option, `setPauseOnFocusLoss`, checkbox resolved and wired to the change event
- `src/app/game-session.ts` - `focusLost()` on the `GameSession` interface and implementation; panel sync on open and reset; persist on change
- `src/main.ts` - blur and hidden-tab listeners call `session.focusLost()`; comment rewritten
- `tests/e2e/settings.spec.ts` - new test "the focus-loss toggle decides whether blur and a hidden tab pause the game"

## Decisions Made

- Default on and absent-key-means-on, so existing saves and blobs keep D-15 behaviour with no migration.
- Only the pause step is gated; held-input clearing on focus loss is unconditional, as the plan's non-goals require.
- `src/input/keyboard.ts` untouched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier flagged the new index.html block**
- **Found during:** Task 2 (lint)
- **Issue:** `prettier --check` reported `index.html` after the checkbox was added.
- **Fix:** Ran `docker compose run --rm lint npx prettier --write index.html` as the plan directs. The only change was to the new checkbox block (collapsed the `<input>` onto one line).
- **Files modified:** index.html
- **Commit:** `0435ec5`

### Additions beyond the plan's e2e steps (test strengthening, no scope change)

- In the browser test, step (e) also waits for the probe clock to advance after the hidden-tab event, not only checking `#pause` hidden and `paused` false. This proves the simulation runs, the same way step (d) does for blur.
- In step (g), the test also asserts the stored blob reads `pauseOnFocusLoss: true` after the checkbox is re-checked.

No other deviations. Task 1 and Task 2 were implemented as written, including the strict `=== undefined` check (not `??`) in `parseSettings`.

## Issues Encountered

None blocking. The `index.html` Prettier fix above was the only lint finding.

## Verification

All commands run in Docker. Results:

| Command | Result |
|---|---|
| `docker compose run --rm test npx vitest run tests/settings/schema.test.ts` | PASS, 35 tests |
| `docker compose run --rm typecheck` | PASS (exit 0), run after Task 1 and again after Task 2 |
| `docker compose run --rm lint` | PASS (exit 0), after the Prettier fix and after Task 3 |
| `rg -n "session\.pause\(\)" src/main.ts` | No matches (baseline at HEAD was 3) |
| `docker compose run --rm e2e sh -lc "npm run build && npx playwright test tests/e2e/settings.spec.ts tests/e2e/throttle.spec.ts"` | PASS, 7 of 7 (includes the new toggle test, the unchanged blur/visibility test, and the throttle hidden-tab test) |
| `docker compose run --rm verify` (full gate, once after all three tasks) | PASS (exit 0): lint, typecheck, assets:check, unit tests 94 files / 1195 passed / 1 skipped, production build, Chromium e2e 93 passed |

The one skipped unit test was not added by this change (the diff since the plan-head commit contains no added `.skip(` calls).

## Known Stubs

None.

## Threat Flags

None. The new field is a local, single-player preference validated by the existing strict parser (T-quick-261108-tez-01 mitigated as planned; T-quick-261108-tez-02 accepted).

## Self-Check: PASSED

- Commits `6c15fc8`, `0435ec5`, `7c35c08` exist on `main` after `6acc49b`.
- Files listed above exist and carry the changes.

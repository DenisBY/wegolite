---
phase: 07-hardening-community-release
plan: 02
subsystem: app
tags: [webgl, context-loss, recovery, pause, save-guard, visibility, fixed-step, playwright, vitest]

requires:
  - phase: 06-hyperspace-navigation-persistence
    provides: the docked and in-flight GameSession, the pause overlay and the IndexedDB autosave path this plan guards
  - phase: 07-hardening-community-release
    provides: plan 07-01's shipped CSP and jitless zod (no change to this plan's surfaces)
provides:
  - "A DOM-free live/lost/failed WebGL context-recovery state machine with a 10 s restore deadline (CONTEXT_RESTORE_TIMEOUT_MS)"
  - "GameSession.enterContextLoss() and exitContextLoss(): pause on loss, refuse resume while lost, redraw the live scene on restore"
  - "Every autosave and manual save skips with reason recovering while the context is lost, before any other guard"
  - "PauseOverlay.setNotice(text) and the [data-pause-notice] line for the recovery copy"
  - "probe.recovery { state, losses, restores } published on every loss and restore"
  - "Browser proofs of loss, restore, resume, a second cycle, a docked resume, the 10 s failure surface, the hidden-tab pause and the stall clamp"
affects: [07-07 (shares QUAL-05), phase-07 verification, owner copy review for the D-16 placeholders]

actuals:
  tokens: 40450
  tasks: 3
  commits: 5
  plan_head_before: edc1354c7cb63858e4bac8f3ee740e159d71f542
  plan_head_after: 5c30e27d6b15ee77a89a7eb12c53600e519eccf7

tech-stack:
  added: []
  patterns:
    - "Recovery policy as an injected-timer state machine (src/app/context-recovery.ts); DOM events and session effects stay in src/main.ts"
    - "Save guard keyed on a session flag, placed ahead of every other save guard, so no snapshot is ever queued while the context is lost"
    - "Loss simulated with the browser's own WEBGL_lose_context extension so the real webglcontextlost and webglcontextrestored events drive the app"
    - "Hidden tab simulated by overriding document.visibilityState and dispatching the real visibilitychange event; stall simulated by a main-thread busy loop (no Playwright clock, research A13)"

key-files:
  created:
    - src/app/context-recovery.ts
    - tests/app/context-recovery.test.ts
    - tests/e2e/context-loss.spec.ts
    - tests/e2e/throttle.spec.ts
  modified:
    - src/main.ts
    - src/app/game-session.ts
    - src/app/probe.ts
    - src/ui/pause.ts

key-decisions:
  - "A lost context pauses at once and never resumes by itself; the player resumes with P or Escape (D-15). The resume refusal sits in resume(), so P, Escape and the Resume button all hit one guard."
  - "The restore redraws the live scene once while still paused (renderFrame(0) in exitContextLoss, then renderActiveScene in main.ts), so probe.calls and probe.triangles are republished from the new context before anything reads them."
  - "The save guard returns before queueSnapshot in both autosave and manualSave; the skip reason is recovering, which is distinct from every existing status reason."
  - "The recovery controller also ignores every event after dispose(), so a late loss or restore after pagehide cannot start a timer or call back into a disposed session."
  - "The timeout path reuses the former terminal sequence (abort listeners, stop session, failure surface) unchanged, so a late restore after the failure is ignored by the state machine and by the aborted listeners."
  - "Browser proofs compare probe.triangles and save bytes exactly across loss, restore and resume; the stall and hidden-tab proofs also require that simulated time actually advanced, so the per-frame bound cannot pass vacuously."

patterns-established:
  - "QUAL-05 recovery copy lives in one module (src/app/context-recovery.ts) as three exported constants, so the owner's wording replaces one file."
  - "Context-loss e2e helpers stash the lose-context extension on window between evaluations and wait on probe.recovery.state rather than timers."

requirements-completed: [QUAL-05]

coverage:
  - id: D1
    description: "A lost WebGL context pauses the session at once; simulated time and flightTime stop; P cannot resume it; the pause overlay shows the recovery notice"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/context-loss.spec.ts#a lost context pauses, a restore recreates render resources while paused, and P resumes"
        status: pass
    human_judgment: false
  - id: D2
    description: "A restore recreates render resources by drawing the live scene while still paused: probe.calls above 0 and probe.triangles equal to the pre-loss value; the player resumes with P, after which flightTime advances"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/context-loss.spec.ts#a lost context pauses, a restore recreates render resources while paused, and P resumes"
        status: pass
    human_judgment: false
  - id: D3
    description: "Save bytes are identical before the loss, after the restore and after the resume; autosave and manual save during loss skip with reason recovering and queue nothing"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/context-loss.spec.ts#a lost context pauses, a restore recreates render resources while paused, and P resumes"
        status: pass
    human_judgment: false
  - id: D4
    description: "No restore within 10 s shows the failure surface with the recovery copy, the probe reports ready false and the save bytes are unchanged; the terminal handler at the former src/main.ts:351-361 is gone"
    requirement: "QUAL-05"
    verification:
      - kind: unit
        ref: "tests/app/context-recovery.test.ts#context recovery timer fails exactly once at the 10 s deadline"
        status: pass
      - kind: e2e
        ref: "tests/e2e/context-loss.spec.ts#no restore within 10 s shows the failure surface and keeps the save"
        status: pass
    human_judgment: false
  - id: D5
    description: "A second loss after a completed restore recovers the same way (losses 2, restores 2, paused, save bytes unchanged); a docked session resumes to a working market"
    requirement: "QUAL-05"
    verification:
      - kind: unit
        ref: "tests/app/context-recovery.test.ts#context recovery timer recovers the same way through a second full loss and restore"
        status: pass
      - kind: e2e
        ref: "tests/e2e/context-loss.spec.ts#a second loss after a restore recovers the same way, and a docked session resumes to a working station"
        status: pass
    human_judgment: false
  - id: D6
    description: "A loss while already recovering starts no second timer; a restore after the 10 s failure is ignored; a restore while live changes nothing"
    requirement: "QUAL-05"
    verification:
      - kind: unit
        ref: "tests/app/context-recovery.test.ts#context recovery timer starts no second timer for a loss while already lost"
        status: pass
      - kind: unit
        ref: "tests/app/context-recovery.test.ts#context recovery timer ignores a restore that arrives after the failure"
        status: pass
    human_judgment: false
  - id: D7
    description: "A hidden tab pauses the session; while hidden, flightTime and the save attempt counter do not move; returning to visible keeps the session paused until the player resumes; the first frames after resume advance at most MAX_STEPS_PER_FRAME steps per rendered frame"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/throttle.spec.ts#a hidden tab pauses without catching up or saving, and stays paused until the player resumes"
        status: pass
    human_judgment: false
  - id: D8
    description: "After a 2 s main-thread stall the session runs at most MAX_STEPS_PER_FRAME * DT of simulated time per rendered frame"
    requirement: "QUAL-05"
    verification:
      - kind: e2e
        ref: "tests/e2e/throttle.spec.ts#a stalled main thread runs at most MAX_STEPS_PER_FRAME fixed steps per rendered frame"
        status: pass
    human_judgment: false
  - id: D9
    description: "The recovery copy is placeholder wording awaiting the owner (D-16 open item); its visual tone and final text are a human judgment"
    requirement: "QUAL-05"
    verification: []
    human_judgment: true
    rationale: "The three CONTEXT_* copy constants are owner-authored wording (D-16). Automation proves the strings are shown; it cannot judge whether the wording is acceptable."

duration: ~20min
completed: 2026-11-07
status: complete
---

# Phase 07 Plan 02: WebGL context-loss recovery that pauses, redraws and never saves mid-loss

**A lost WebGL context pauses the session and blocks resume and every save, a restore redraws the live scene while still paused, and only a restore that never arrives within 10 s reaches the failure surface.**

## Performance

- **Duration:** ~20 min (approximate; `PLAN_START_TIME` was not captured at start)
- **Started:** not recorded
- **Completed:** 2026-11-07T21:58Z (last task commit)
- **Tasks:** 3 of 3
- **Files modified:** 8 (4 created, 4 modified)

## Accomplishments

- The terminal `webglcontextlost` handler (former `src/main.ts:351-361`) is gone. A DOM-free live/lost/failed state machine with an injected 10 s timer replaces it.
- A lost context pauses the session at once, shows the recovery notice and refuses resume from P, Escape and the Resume button alike.
- Autosave and manual save skip with reason `recovering` before any other guard. `queueSnapshot` is never reached while the context is lost, so the IndexedDB bytes cannot change mid-loss.
- A restore redraws the live scene once into the new context while paused, republishes `probe.calls` and `probe.triangles`, and shows the resume notice. The player resumes by action only.
- The timeout path reuses the former terminal sequence and shows the failure surface with the placeholder copy after 10 s with no restore. The save is untouched.
- Browser proofs (5 tests) and unit proofs (9 cases) cover loss, restore, resume, a second cycle, a docked resume, the 10 s failure, the hidden-tab pause and the stall clamp.

## Task Commits

1. **Task 1: End-to-end recovery (tracer)** - `b14f767` (feat)
2. **Task 2: The 10 s restore timeout, a second loss cycle and a docked resume** - `b2c2194` (test, unit proofs) and `00c12b3` (test, browser proofs)
3. **Task 3: Tab-throttle proof** - `5a18d2b` (test)
4. **Follow-up: loss-notice assertion in the first browser proof** - `5c30e27` (test)

**Plan metadata:** recorded in the final `docs(07-02)` commit that adds this SUMMARY, STATE.md and ROADMAP.md.

_Note on TDD: the Task 2 unit file was written to the behaviour list first. Task 1 had already implemented the controller in full, as the plan specifies, so the RED run passed on the first execution. The cases therefore prove the Task 1 implementation rather than driving it. This is recorded under Issues Encountered._

## Files Created/Modified

- `src/app/context-recovery.ts` (new) - `CONTEXT_RESTORE_TIMEOUT_MS`, the three placeholder copy constants, `createContextRecovery` (the state machine). No DOM and no Three.js import.
- `src/main.ts` - replaces the terminal context-loss handler with `webglcontextlost` and `webglcontextrestored` listeners on the canvas, wired to the controller. Publishes `probe.recovery`. Disposes the controller on `pagehide`.
- `src/app/game-session.ts` - `enterContextLoss()` and `exitContextLoss()`, the `contextLost` flag, the resume refusal, and the `recovering` save guard in `autosave` and `manualSave`.
- `src/app/probe.ts` - `WegoliteRecoveryProbe` and the optional `WegoliteProbe.recovery` field (additive).
- `src/ui/pause.ts` - `PauseOverlay.setNotice(text)` and the `[data-pause-notice]` element.
- `tests/app/context-recovery.test.ts` (new) - 9 unit cases on a fake scheduler.
- `tests/e2e/context-loss.spec.ts` (new) - 3 browser tests.
- `tests/e2e/throttle.spec.ts` (new) - 2 browser tests.

## Decisions Made

- The resume refusal lives in `resume()` itself, so P, Escape and the overlay's Resume button all reach one guard. No key handler needed changing.
- The restore draws the scene once while still paused (`renderFrame(0)`), followed by `renderActiveScene()` in `main.ts`. Both run before the probe is read, so the triangle comparison is taken from the new context.
- The save guard is placed directly after `saveAttempts += 1` in both save paths. It returns before every other check, so it cannot be bypassed by a status or taint path.
- The controller also ignores every event after `dispose()`. The plan only required cancelling the timer, but a late event after `pagehide` must not reach a disposed session.
- The timeout path keeps the former terminal sequence unchanged. The state machine's `failed` state and the aborted listeners together make a late restore a no-op.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Launch keypress raced the docked state in the first browser test**
- **Found during:** Task 1 (first browser run)
- **Issue:** The spec pressed `Digit1` immediately after `startNewGame`, before the session had reached `docked`. `waitForMode(page, "inFlight")` then timed out at 60 s.
- **Fix:** Added `await waitForMode(page, "docked")` after `startNewGame`, the same precondition existing specs use.
- **Files modified:** `tests/e2e/context-loss.spec.ts`
- **Verification:** Rerun passed (17.7 s).
- **Committed in:** `b14f767` (Task 1 commit; the spec was corrected before that commit was made)

**2. [Rule 3 - Blocking] Lint gate failures on the new test files**
- **Found during:** Task 2 and Task 3 lint runs
- **Issue:** `@typescript-eslint/unbound-method` fired on `clock.schedule` and `clock.cancel` in the unit fake, and Prettier flagged the new spec files.
- **Fix:** Typed the fake clock's members as function-valued properties; ran Prettier on the two spec files. No product change.
- **Files modified:** `tests/app/context-recovery.test.ts`, `tests/e2e/context-loss.spec.ts`, `tests/e2e/throttle.spec.ts`
- **Verification:** `docker compose run --rm lint` exits 0.
- **Committed in:** `00c12b3` and `5a18d2b`

**3. [Test hardening, not a product deviation] Advancement guard on the throttle bounds**
- **Found during:** Task 3
- **Issue:** The per-frame bound `flightDelta <= renders * MAX_STEPS * DT` is satisfied trivially if the sim does not advance at all.
- **Fix:** Added `flightDelta > 0` to both throttle tests, so the bound is proven against a session that really ran.
- **Files modified:** `tests/e2e/throttle.spec.ts`
- **Verification:** Both tests pass (18.7 s and 12.5 s).
- **Committed in:** `5a18d2b`

**Total deviations:** 3 (2 blocking test/lint-gate fixes, 1 test-strengthening addition). **Impact:** None on product behaviour. All three are confined to test code I authored in this plan.

## Issues Encountered

- **TDD RED did not fail.** Task 1 implemented `createContextRecovery` to the full rule set the plan specifies, so the Task 2 unit cases passed on their first run. They prove the implementation against the behaviour list; they did not drive it.
- **Literal acceptance grep.** My header comment in `throttle.spec.ts` contained the string `page.clock`, which the acceptance criterion requires to be absent. I reworded the comment to "Playwright's clock API" and amended my own unpushed Task 3 commit (`5a18d2b`). No other commit was touched.
- **A12 (disposal on a lost context) did not trigger.** The timeout test ran with zero console errors, so no disposal guard was added to `dispose()`. `scenes.dispose()` and `assets.dispose()` run unchanged.
- **Failure-copy prefix.** `showBootFailure` prefixes its argument with `Wegolite could not start: `, so the on-screen text reads "Wegolite could not start: The graphics context was lost and did not come back within 10 seconds...". This is existing surface behaviour, which the plan requires me to reuse. The owner should decide whether the recovery copy should carry that prefix when the wording is finalised (D-16).

## Known Stubs

| File | Line(s) | Reason |
|------|---------|--------|
| `src/app/context-recovery.ts` | `CONTEXT_LOST_NOTICE`, `CONTEXT_RESTORED_NOTICE`, `CONTEXT_RESTORE_FAILURE_COPY` | Placeholder wording awaiting the owner (D-16 open item). Intentional: the plan requires one module for the owner to replace. Replace before public release. |

Recorded in the broken-windows ledger (`.planning/WINDOWS.md`) as an open stub so the ship gate sees it.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- QUAL-05 is covered by this plan's browser and unit proofs. The requirement is marked complete only once plan 07-07, which also declares QUAL-05, has a summary (the shared-ID gate).
- The owner must supply the three recovery copy strings (D-16). The failure-copy prefix question above is part of that decision.
- Live GPU behaviour is proven on headless Chromium with SwiftShader only (research A2). Firefox and real driver resets are not claimed.

---
*Phase: 07-hardening-community-release*
*Completed: 2026-11-07*

## Self-Check: PASSED

Verification run in Docker for this plan:

| Command | Result |
|---------|--------|
| `docker compose run --rm typecheck` | exit 0 (run after Task 1 and again after Task 2) |
| `docker compose run --rm lint` | exit 0 (ESLint and Prettier clean after the final edit) |
| `docker compose run --rm test npx vitest run tests/app/context-recovery.test.ts` | 9 passed |
| `docker compose run --rm test npx vitest run tests/guards/sim-purity.test.ts` | 9 passed |
| `docker compose run --rm test` (full suite) | 91 files, 1147 tests passed |
| `docker compose run --rm e2e ... tests/e2e/context-loss.spec.ts` | 3 passed |
| `docker compose run --rm e2e ... tests/e2e/throttle.spec.ts` | 2 passed |
| `docker compose run --rm e2e ... tests/e2e/context-loss.spec.ts tests/e2e/throttle.spec.ts` | 5 passed |
| `docker compose run --rm e2e ... tests/e2e/dispose.spec.ts tests/e2e/settings.spec.ts` | 8 passed (regression) |

Acceptance greps: `webglcontextrestored` in `src/main.ts` = 1; `createContextRecovery` in `src/main.ts` = 2; the terminal copy "Reload the page to restart Wegolite" in `src/main.ts` = 0; `"recovering"` in `src/app/game-session.ts` = 2; `context-recovery` in `src/sim` = none; `page.clock` in `tests/e2e/throttle.spec.ts` = none; `CONTEXT_RESTORE_TIMEOUT_MS = 10_000` in `src/app/context-recovery.ts` = 1.

Commit ledger (protocol 0c, base `edc1354c7cb63858e4bac8f3ee740e159d71f542`): 5 commits measured with `git rev-list --count edc1354..HEAD`, head `5c30e27d6b15ee77a89a7eb12c53600e519eccf7` before this SUMMARY and the metadata commit.

Self-check (run after writing this file): all eight created and modified files were found on disk; commits `b14f767`, `b2c2194`, `00c12b3`, `5a18d2b` and `5c30e27` are ancestors of HEAD; the ledger file read back `edc1354`. The browser and unit runs in the table above were executed against these exact sources; the final loss-notice assertion was rerun (3 passed) before its commit.
